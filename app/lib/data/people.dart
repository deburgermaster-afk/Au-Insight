import 'package:flutter/widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:web/web.dart' as web;

import 'quick_actions.dart';
import 'uploads.dart' show documentsBucket;

/// One person whose migration file the account keeps (a row in `cases`): the account holder, a
/// partner, a friend they help.
class Person {
  Person.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      name = (j['name'] as String?)?.trim().isNotEmpty == true ? (j['name'] as String).trim() : 'Me',
      relation = (j['relation'] as String?) ?? '',
      hasStory = j['has_story'] == true,
      documents = (j['documents'] as num?)?.toInt() ?? 0,
      chats = (j['chats'] as num?)?.toInt() ?? 0,
      plans = (j['plans'] as num?)?.toInt() ?? 0;

  final String id;
  final String name;
  final String relation;
  final bool hasStory;
  final int documents;
  final int chats;
  final int plans;

  /// "Me" → "M", "Priya Shah" → "PS".
  String get initials {
    final parts = name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.length == 1 ? parts.first.substring(0, 1) : parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }
}

/// Relations offered when adding a person.
const personRelations = ['Partner', 'Child', 'Parent', 'Sibling', 'Friend', 'Client'];

/// The people on the account and which one is open.
///
/// Every request carries the open person's id in the `x-case-id` header; row-level security
/// (migration 20261011090000_people_profiles) then shows only their case, chats, documents,
/// folders, plans and shortlist, and new rows are filed under them. So the rest of the app simply
/// works on the open person. Until that migration is applied [enabled] stays false and the app
/// behaves as before (one person).
class People extends ChangeNotifier {
  bool enabled = false;
  bool loaded = false;
  List<Person> all = const [];
  String? activeId;

  Person? get active => all.where((p) => p.id == activeId).firstOrNull ?? all.firstOrNull;

  /// The first person is the account holder's own file.
  bool get isPrimary => active == null || active!.id == all.firstOrNull?.id;

  /// Keys caches by user and person, so one person's data is never shown for another.
  String? get ownerKey {
    final uid = Supabase.instance.client.auth.currentUser?.id;
    return uid == null ? null : '$uid:${activeId ?? ''}';
  }

  String? _uid;

  String get _storageKey => 'immi.person.$_uid';

  Future<void>? _loading;

  /// Completes once the people for the signed-in user are known (screens await it before their
  /// first load, so nothing is read or saved under the wrong person).
  Future<void> ready() {
    final uid = Supabase.instance.client.auth.currentUser?.id;
    if (loaded && uid == _uid) return Future.value();
    return _loading ?? load();
  }

  /// Loads the people after sign-in (or again to refresh counts). Safe to call any time.
  Future<void> load() => _loading ??= _load().whenComplete(() => _loading = null);

  Future<void> _load() async {
    final sb = Supabase.instance.client;
    final uid = sb.auth.currentUser?.id;
    if (uid == null) {
      _reset();
      return;
    }
    final userChanged = uid != _uid;
    _uid = uid;
    try {
      final rows = await sb.rpc('list_people') as List;
      all = [for (final r in rows) Person.fromJson((r as Map).cast())];
      enabled = all.isNotEmpty;
    } catch (_) {
      // The people migration isn't applied yet: one person, as before.
      all = const [];
      enabled = false;
    }
    loaded = true;
    if (enabled) {
      var id = activeId;
      if (userChanged || !all.any((p) => p.id == id)) {
        final saved = _read(_storageKey);
        id = all.any((p) => p.id == saved) ? saved : all.first.id;
      }
      _apply(id!, announce: userChanged || id != activeId);
    }
    notifyListeners();
  }

  /// Opens [id]: every screen reloads with that person's data.
  void select(String id) {
    if (id == activeId || !all.any((p) => p.id == id)) return;
    _apply(id, announce: true);
    notifyListeners();
  }

  /// Adds a person and opens them.
  Future<Person> add(String name, {String relation = ''}) async {
    final id = await Supabase.instance.client.rpc('add_person', params: {'p_name': name, 'p_relation': relation}) as String;
    await load();
    select(id);
    return all.firstWhere((p) => p.id == id);
  }

  Future<void> rename(String id, String name, {String? relation}) async {
    await Supabase.instance.client.rpc('update_person', params: {'p_id': id, 'p_name': name, 'p_relation': relation});
    await load();
  }

  /// Deletes a person with their chats, plans and documents (files included).
  Future<void> remove(String id) async {
    final sb = Supabase.instance.client;
    final paths = [
      for (final p in (await sb.rpc('delete_person', params: {'p_id': id}) as List? ?? const [])) '$p',
    ];
    if (paths.isNotEmpty) {
      try {
        await sb.storage.from(documentsBucket).remove(paths);
      } catch (_) {
        // The rows are gone; leftover files are private and unreachable from the app.
      }
    }
    if (activeId == id) activeId = null;
    await load();
  }

  void _apply(String id, {required bool announce}) {
    activeId = id;
    _write(_storageKey, id);
    final client = Supabase.instance.client;
    client.headers = {...client.headers, 'x-case-id': id};
    if (announce) {
      personChanged.value++;
      casesChanged.value++;
      profileChanged.value++;
    }
  }

  void _reset() {
    final hadPerson = activeId != null;
    _uid = null;
    all = const [];
    activeId = null;
    enabled = false;
    loaded = false;
    final client = Supabase.instance.client;
    if (client.headers.containsKey('x-case-id')) {
      client.headers = {...client.headers}..remove('x-case-id');
    }
    if (hadPerson) personChanged.value++;
    notifyListeners();
  }

  static String? _read(String key) {
    try {
      return web.window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  static void _write(String key, String value) {
    try {
      web.window.localStorage.setItem(key, value);
    } catch (_) {}
  }
}

final people = People();

/// Bumped when another person is opened (or the account changes): screens reload their data.
final personChanged = ValueNotifier<int>(0);

/// Reloads a screen's data when another person is opened.
mixin PersonAware<T extends StatefulWidget> on State<T> {
  /// Called after the open person changed; reload whatever this screen shows.
  void onPersonChanged();

  @override
  void initState() {
    super.initState();
    personChanged.addListener(_personChanged);
  }

  void _personChanged() {
    if (mounted) onPersonChanged();
  }

  @override
  void dispose() {
    personChanged.removeListener(_personChanged);
    super.dispose();
  }
}
