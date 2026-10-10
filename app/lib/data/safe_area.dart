import 'dart:js_interop';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

/// The device's safe-area insets (notch, status bar, home indicator) in logical pixels.
///
/// Flutter's web engine always reports zero view padding, so `SafeArea` does nothing in the
/// browser. The page asks for `viewport-fit=cover`, so on an iPhone the app draws under the
/// status bar and the home indicator. This reads the CSS `env(safe-area-inset-*)` values from a
/// hidden probe element and keeps them current as the window resizes or rotates.
final safeAreaInsets = ValueNotifier<EdgeInsets>(EdgeInsets.zero);

web.HTMLElement? _probe;

/// Starts measuring. Safe to call more than once.
void initSafeArea() {
  if (_probe != null) return;
  try {
    final probe = web.document.createElement('div') as web.HTMLElement;
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
        'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;'
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) '
        'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
    web.document.body?.append(probe);
    _probe = probe;
    _measure();
    final soon = ((web.Event _) => _measureSoon()).toJS;
    web.window.addEventListener('resize', soon);
    web.window.addEventListener('orientationchange', soon);
    web.window.addEventListener('pageshow', soon);
    web.document.addEventListener('visibilitychange', soon);
  } catch (_) {
    // No DOM (tests) or an old browser: keep zero insets.
  }
}

/// iOS updates the insets a moment after a rotation, so measure now and again shortly after.
void _measureSoon() {
  _measure();
  Future.delayed(const Duration(milliseconds: 250), _measure);
}

void _measure() {
  final probe = _probe;
  if (probe == null) return;
  try {
    final s = web.window.getComputedStyle(probe);
    double px(String v) => double.tryParse(v.replaceAll('px', '').trim()) ?? 0;
    final next = EdgeInsets.fromLTRB(px(s.paddingLeft), px(s.paddingTop), px(s.paddingRight), px(s.paddingBottom));
    if (next != safeAreaInsets.value) safeAreaInsets.value = next;
  } catch (_) {}
}

/// Puts the CSS safe-area insets into [MediaQuery] padding, so every `SafeArea` and
/// `MediaQuery.viewPaddingOf` below sees the real notch and home-indicator sizes.
class WebSafeArea extends StatelessWidget {
  const WebSafeArea({super.key, required this.child});
  final Widget child;

  static EdgeInsets _max(EdgeInsets a, EdgeInsets b) =>
      EdgeInsets.fromLTRB(math.max(a.left, b.left), math.max(a.top, b.top), math.max(a.right, b.right), math.max(a.bottom, b.bottom));

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<EdgeInsets>(
      valueListenable: safeAreaInsets,
      child: child,
      builder: (context, insets, child) {
        if (insets == EdgeInsets.zero) return child!;
        final mq = MediaQuery.of(context);
        // The keyboard covers the bottom inset while it is up.
        final keyboard = mq.viewInsets.bottom > 0;
        final css = keyboard ? insets.copyWith(bottom: 0) : insets;
        return MediaQuery(
          data: mq.copyWith(padding: _max(mq.padding, css), viewPadding: _max(mq.viewPadding, insets)),
          child: child!,
        );
      },
    );
  }
}
