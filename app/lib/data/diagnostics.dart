import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:ui' show FrameTiming, PlatformDispatcher;

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:web/web.dart' as web;

/// Quietly records what goes wrong on people's phones (crashes, frozen frames, what happened on
/// return from the background) into `public.client_logs`, so "the app got stuck" can be traced.
///
/// Only signed-in users' events are stored. At most [_cap] rows per session, duplicates dropped.
/// Nothing here ever throws: if the table is missing or the network is down, events are dropped.
class Diagnostics {
  Diagnostics._();

  static const _cap = 30;
  static const _version = String.fromEnvironment('APP_VERSION');

  /// Frames slower than this (build + raster) count as a freeze.
  static const jankThreshold = Duration(milliseconds: 700);

  static bool _started = false;
  static bool _disabled = false;
  static int _sent = 0;
  static final _seen = <String>{};
  static final _perKind = <String, int>{};
  static final _queue = <Map<String, dynamic>>[];
  static final _trail = <String>[];
  static String Function()? _route;
  static DateTime? _hiddenAt;
  static DateTime _resumedAt = DateTime.now();
  static AppLifecycleListener? _lifecycle;

  /// Per-kind limits, so one noisy kind can't use up the whole budget.
  static const _kindCap = {'jank': 8, 'lifecycle': 6, 'page': 10};

  /// Starts capturing. [route] reports the current location for each event.
  static void init({String Function()? route}) {
    if (_started) return;
    _started = true;
    _route = route;
    try {
      final previousFlutter = FlutterError.onError;
      FlutterError.onError = (details) {
        if (previousFlutter != null) {
          previousFlutter(details);
        } else {
          FlutterError.presentError(details);
        }
        record('flutter_error', details.exceptionAsString(), {
          'library': details.library,
          if (details.context != null) 'context': details.context.toString(),
          'stack': _short(details.stack),
        });
      };

      final previousPlatform = PlatformDispatcher.instance.onError;
      PlatformDispatcher.instance.onError = (error, stack) {
        record('dart_error', error.toString(), {'stack': _short(stack)});
        return previousPlatform?.call(error, stack) ?? false;
      };

      SchedulerBinding.instance.addTimingsCallback(_onTimings);

      _lifecycle = AppLifecycleListener(onStateChange: _onLifecycle);

      web.window.addEventListener(
        'error',
        ((web.ErrorEvent e) {
          record('js_error', e.message, {'source': e.filename, 'line': e.lineno, 'column': e.colno});
        }).toJS,
      );
      web.window.addEventListener(
        'unhandledrejection',
        ((web.PromiseRejectionEvent e) {
          record('js_rejection', _jsText(e.reason), const {});
        }).toJS,
      );

      Supabase.instance.client.auth.onAuthStateChange.listen((s) {
        if (s.session != null) _flush();
      });
    } catch (_) {}
    // The page may have stashed events before this build started (e.g. why it reloaded).
    Timer(const Duration(seconds: 3), _drainPageEvents);
  }

  /// Records one event. [kind] is a short slug, [message] one line.
  static void record(String kind, String message, [Map<String, dynamic> detail = const {}]) {
    try {
      if (_disabled || _sent >= _cap) return;
      final msg = message.length > 500 ? '${message.substring(0, 500)}…' : message;
      final key = '$kind|$msg';
      if (!_seen.add(key)) return;
      final n = (_perKind[kind] ?? 0) + 1;
      if (n > (_kindCap[kind] ?? _cap)) return;
      _perKind[kind] = n;
      _trailAdd('$kind: ${msg.length > 60 ? msg.substring(0, 60) : msg}');
      _queue.add({
        'kind': kind,
        'message': msg,
        'detail': {...detail, 'trail': List.of(_trail), 'sinceResumeMs': DateTime.now().difference(_resumedAt).inMilliseconds},
        'ua': _userAgent(),
        'route': _currentRoute(),
        'app_version': _appVersion(),
      });
      if (_queue.length > 15) _queue.removeAt(0);
      _flush();
    } catch (_) {}
  }

  /// Adds a breadcrumb (no row of its own): it rides along with the next event.
  static void breadcrumb(String text) => _trailAdd(text);

  static void _trailAdd(String text) {
    _trail.add(text);
    if (_trail.length > 12) _trail.removeAt(0);
  }

  static Future<void> _flush() async {
    try {
      if (_disabled || _queue.isEmpty) return;
      final client = Supabase.instance.client;
      if (client.auth.currentSession == null) return;
      final rows = List.of(_queue);
      _queue.clear();
      final room = _cap - _sent;
      if (room <= 0) return;
      final batch = rows.take(room).toList();
      _sent += batch.length;
      await client.from('client_logs').insert(batch);
    } on PostgrestException catch (e) {
      // The table isn't there (yet): stop trying for this session.
      if (e.code == '42P01' || e.code == 'PGRST205' || e.code == '42501') _disabled = true;
    } catch (_) {}
  }

  static void _onTimings(List<FrameTiming> timings) {
    for (final t in timings) {
      final total = t.buildDuration + t.rasterDuration;
      if (total < jankThreshold) continue;
      record('jank', 'Frame took ${(total.inMilliseconds / 100).round() * 100} ms', {
        'ms': total.inMilliseconds,
        'buildMs': t.buildDuration.inMilliseconds,
        'rasterMs': t.rasterDuration.inMilliseconds,
      });
    }
  }

  static void _onLifecycle(AppLifecycleState state) {
    _trailAdd('lifecycle: ${state.name}');
    if (state == AppLifecycleState.hidden || state == AppLifecycleState.paused) {
      _hiddenAt ??= DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      final away = _hiddenAt == null ? null : DateTime.now().difference(_hiddenAt!);
      _hiddenAt = null;
      _resumedAt = DateTime.now();
      // Only long absences are worth a row: that's when iOS may have dropped the GPU context.
      if (away != null && away.inMinutes >= 2) {
        record('lifecycle', 'Resumed after ${away.inMinutes} min', {'awayMs': away.inMilliseconds});
      }
      // The page's resume guard needs a moment to decide; collect what it saw afterwards.
      Timer(const Duration(milliseconds: 2500), _drainPageEvents);
    }
  }

  /// Moves events the page recorded (`window.__immiEvents`, see web/index.html) into the log.
  static void _drainPageEvents() {
    try {
      final list = web.window.getProperty<JSAny?>('__immiEvents'.toJS);
      if (list == null || !list.isA<JSArray>()) return;
      final items = (list as JSObject).callMethod<JSAny?>('splice'.toJS, 0.toJS).dartify();
      if (items is! List) return;
      for (final it in items) {
        if (it is! Map) continue;
        final kind = '${it['kind'] ?? 'page'}';
        final detail = it['detail'];
        record(
          kind.startsWith('page') ? kind : 'page_$kind',
          '${it['message'] ?? ''}',
          detail is Map ? {for (final e in detail.entries) '${e.key}': e.value, 'at': it['at']} : {'at': it['at']},
        );
      }
    } catch (_) {}
  }

  static String _short(StackTrace? s) {
    if (s == null) return '';
    final text = s.toString();
    return text.length > 1500 ? text.substring(0, 1500) : text;
  }

  static String _jsText(JSAny? v) {
    try {
      if (v == null) return 'null';
      if (v.isA<JSObject>()) {
        final msg = (v as JSObject).getProperty<JSAny?>('message'.toJS);
        if (msg != null && msg.isA<JSString>()) return (msg as JSString).toDart;
      }
      return web.window.callMethod<JSString>('String'.toJS, v).toDart;
    } catch (_) {
      return 'unknown';
    }
  }

  static String _userAgent() {
    try {
      return web.window.navigator.userAgent;
    } catch (_) {
      return '';
    }
  }

  static String _currentRoute() {
    try {
      return _route?.call() ?? '';
    } catch (_) {
      return '';
    }
  }

  /// The commit this build came from, else the page's record of the deployed main.dart.js.
  static String _appVersion() {
    if (_version.isNotEmpty) return _version;
    try {
      final tag = web.window.getProperty<JSAny?>('__immiBuild'.toJS);
      if (tag != null && tag.isA<JSString>()) return (tag as JSString).toDart;
    } catch (_) {}
    return '';
  }

  @visibleForTesting
  static void dispose() => _lifecycle?.dispose();
}
