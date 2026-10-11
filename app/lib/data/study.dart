import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'backend.dart';
import 'people.dart';
import 'study_models.dart';

// Queries behind the Study tab: the CRICOS register (courses, providers, campuses, fees) through the
// database functions `search_courses`, `get_course`, `get_provider`, `course_levels`, `course_fields`,
// the user's shortlist (`course_shortlist`) and the study plan from the chat function's `study_plan` tool.

SupabaseClient get _sb => Supabase.instance.client;

String _s(Object? v) => v == null ? '' : '$v';
int? _int(Object? v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
double? _num(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));
List<Map<String, dynamic>> _maps(Object? v) => [
  for (final e in (v is List ? v : const [])) (e as Map).cast<String, dynamic>(),
];

// ── Levels, states, sorting ──────────────────────────────────────────────────────────────────────

/// CRICOS levels that are research degrees.
const researchLevels = ['Masters Degree (Research)', 'Doctoral Degree'];

/// The level chips on the Study tab and the CRICOS level names each covers.
const levelChips = <(String, List<String>)>[
  ('Diploma', ['Diploma']),
  ('Advanced Diploma', ['Advanced Diploma']),
  ('Bachelor', ['Bachelor Degree']),
  ('Honours', ['Bachelor Honours Degree']),
  ('Graduate Diploma', ['Graduate Diploma']),
  ('Masters (Coursework)', ['Masters Degree (Coursework)', 'Masters Degree (Extended)']),
  ('Masters (Research)', ['Masters Degree (Research)']),
  ('Doctoral', ['Doctoral Degree']),
];

const auStates = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

/// Presets for "max tuition per year" (AUD).
const feeCaps = [20000.0, 30000.0, 40000.0, 50000.0, 60000.0];

/// AQF order from entry level to doctoral, for grouping courses by level.
const _levelOrder = [
  'Doctoral Degree',
  'Masters Degree (Research)',
  'Masters Degree (Extended)',
  'Masters Degree (Coursework)',
  'Graduate Diploma',
  'Graduate Certificate',
  'Bachelor Honours Degree',
  'Bachelor Degree',
  'Associate Degree',
  'Advanced Diploma',
  'Diploma',
  'Vocational Graduate Diploma',
  'Vocational Graduate Certificate',
  'Certificate IV',
  'Certificate III',
  'Certificate II',
  'Certificate I',
  'Senior Secondary Certificate of Education',
  'Non AQF Award',
  'ELICOS',
];

int levelRank(String level) {
  final i = _levelOrder.indexOf(level);
  return i < 0 ? _levelOrder.length : i;
}

/// Shorter level names for chips and cards.
String shortLevel(String level) => switch (level) {
  'Bachelor Degree' => 'Bachelor',
  'Bachelor Honours Degree' => 'Honours',
  'Masters Degree (Coursework)' => 'Masters (Coursework)',
  'Masters Degree (Research)' => 'Masters (Research)',
  'Masters Degree (Extended)' => 'Masters (Extended)',
  'Doctoral Degree' => 'Doctoral',
  'Senior Secondary Certificate of Education' => 'Senior Secondary',
  _ => level,
};

enum CourseSort {
  relevance('relevance', 'Best match'),
  feeAsc('fee_asc', 'Lowest fee'),
  feeDesc('fee_desc', 'Highest fee'),
  durationAsc('duration_asc', 'Shortest'),
  name('name', 'Name A–Z');

  const CourseSort(this.api, this.label);
  final String api;
  final String label;
}

/// Tuition per year: the register's figure, or the course tuition spread over its duration.
double? annualTuitionOf(CourseSummary c) {
  if (c.annualTuition != null) return c.annualTuition;
  if (c.tuitionFee == null) return null;
  final weeks = (c.durationWeeks ?? 0) < 1 ? 1 : c.durationWeeks!;
  return (c.tuitionFee! / weeks * 52).roundToDouble();
}

/// Total cost: the register's estimate, or tuition plus non-tuition fees.
double? totalCostOf(CourseSummary c) {
  if (c.totalCost != null && c.totalCost! > 0) return c.totalCost;
  if (c.tuitionFee == null) return null;
  return c.tuitionFee! + (c.nonTuitionFee ?? 0);
}

/// States the course is taught in, from its campuses.
List<String> statesOf(CourseSummary c) => ({for (final x in c.campuses) x.state}..remove('')).toList()..sort();

// ── Search ───────────────────────────────────────────────────────────────────────────────────────

@immutable
class CourseFilters {
  const CourseFilters({
    this.query = '',
    this.levels = const {},
    this.researchOnly = false,
    this.state,
    this.city = '',
    this.provider,
    this.providerLabel,
    this.field,
    this.maxAnnualFee,
    this.sort = CourseSort.relevance,
    this.includeExpired = false,
  });

  final String query;
  final Set<String> levels; // CRICOS level names
  final bool researchOnly;
  final String? state;
  final String city;
  final String? provider; // provider code or name
  final String? providerLabel; // what to show for `provider`
  final String? field;
  final double? maxAnnualFee;
  final CourseSort sort;
  final bool includeExpired;

  static const _keep = Object();

  CourseFilters copyWith({
    String? query,
    Set<String>? levels,
    bool? researchOnly,
    Object? state = _keep,
    String? city,
    Object? provider = _keep,
    Object? providerLabel = _keep,
    Object? field = _keep,
    Object? maxAnnualFee = _keep,
    CourseSort? sort,
    bool? includeExpired,
  }) => CourseFilters(
    query: query ?? this.query,
    levels: levels ?? this.levels,
    researchOnly: researchOnly ?? this.researchOnly,
    state: identical(state, _keep) ? this.state : state as String?,
    city: city ?? this.city,
    provider: identical(provider, _keep) ? this.provider : provider as String?,
    providerLabel: identical(providerLabel, _keep) ? this.providerLabel : providerLabel as String?,
    field: identical(field, _keep) ? this.field : field as String?,
    maxAnnualFee: identical(maxAnnualFee, _keep) ? this.maxAnnualFee : maxAnnualFee as double?,
    sort: sort ?? this.sort,
    includeExpired: includeExpired ?? this.includeExpired,
  );

  /// Filters other than the text query and level chips (these live in the filter panel).
  int get panelCount => [
    state != null,
    city.trim().isNotEmpty,
    provider != null,
    field != null,
    maxAnnualFee != null,
    sort != CourseSort.relevance,
    includeExpired,
  ].where((b) => b).length;

  bool get hasFilters => levels.isNotEmpty || researchOnly || panelCount > 0;

  Map<String, dynamic> params(int limit, int offset) => {
    'p_query': query.trim().isEmpty ? null : query.trim(),
    'p_levels': levels.isEmpty ? null : (levels.toList()..sort()),
    'p_state': state,
    'p_city': city.trim().isEmpty ? null : city.trim(),
    'p_provider': provider,
    'p_field': field,
    'p_max_annual_fee': maxAnnualFee,
    'p_research_only': researchOnly,
    'p_include_expired': includeExpired,
    'p_sort': sort.api,
    'p_limit': limit,
    'p_offset': offset,
  };

  /// Identity of the search (everything but paging), to drop stale responses.
  String get key => params(0, 0).toString();
}

class CoursePage {
  const CoursePage(this.items, this.total);
  final List<CourseSummary> items;
  final int total;
}

Future<CoursePage> searchCourses(CourseFilters f, {int limit = 20, int offset = 0}) async {
  final rows = _maps(await _sb.rpc('search_courses', params: f.params(limit, offset)));
  final items = [for (final r in rows) CourseSummary.fromJson(r)];
  final total = rows.isEmpty ? offset : (_int(rows.first['total_count']) ?? offset + items.length);
  return CoursePage(items, total);
}

/// Lets other Study pages open the search with filters (e.g. one provider's research degrees).
/// The Study home applies it and clears it.
final studySearchRequest = ValueNotifier<CourseFilters?>(null);

List<(String, int)>? _levelCounts;
List<(String, int)>? _fieldCounts;

/// Every CRICOS level with its number of courses (cached for the session).
Future<List<(String, int)>> courseLevels() async {
  if (_levelCounts != null) return _levelCounts!;
  final rows = _maps(await _sb.rpc('course_levels'));
  return _levelCounts = [for (final r in rows) (_s(r['level']), _int(r['courses']) ?? 0)];
}

/// Broad fields of education with their number of courses (cached for the session).
Future<List<(String, int)>> courseFields() async {
  if (_fieldCounts != null) return _fieldCounts!;
  final rows = _maps(await _sb.rpc('course_fields'));
  return _fieldCounts = [
    for (final r in rows)
      if (_s(r['field']).isNotEmpty) (_s(r['field']), _int(r['courses']) ?? 0),
  ];
}

// ── Course and provider details ──────────────────────────────────────────────────────────────────

class ProviderInfo {
  ProviderInfo.fromJson(Map<String, dynamic> j)
    : code = _s(j['code'] ?? j['provider_code']),
      name = _s(j['name'] ?? j['provider_name']),
      tradingName = _s(j['trading_name']),
      type = _s(j['type'] ?? j['provider_type']),
      capacity = _int(j['capacity']),
      website = _s(j['website']),
      city = _s(j['city']),
      state = _s(j['state']),
      postcode = _s(j['postcode']);

  final String code;
  final String name;
  final String tradingName;
  final String type; // Government | Private
  final int? capacity; // international students it may enrol at once
  final String website;
  final String city;
  final String state;
  final String postcode;

  String get websiteUrl {
    final w = website.trim();
    if (w.isEmpty) return '';
    return w.startsWith('http') ? w : 'https://$w';
  }

  /// The website's host without "www.", for site searches.
  String get host => (Uri.tryParse(websiteUrl)?.host ?? '').replaceFirst(RegExp(r'^www\.'), '');

  /// The name people know it by: the trading name when it differs (e.g. "RMIT University").
  String get displayName => tradingName.isNotEmpty && tradingName.toLowerCase() != name.toLowerCase() ? tradingName : name;

  bool get isPublic => type.toLowerCase().startsWith('gov');

  String get place => [city, state].where((s) => s.isNotEmpty).join(', ');
}

/// A campus or delivery site of a provider.
class ProviderLocation {
  ProviderLocation.fromJson(Map<String, dynamic> j)
    : name = _s(j['name'] ?? j['location_name']),
      type = _s(j['type']),
      address = _s(j['address']),
      city = _s(j['city']),
      state = _s(j['state']),
      postcode = _s(j['postcode']);
  final String name;
  final String type;
  final String address;
  final String city;
  final String state;
  final String postcode;

  String get fullAddress => [address, city, [state, postcode].where((s) => s.isNotEmpty).join(' ')].where((s) => s.isNotEmpty).join(', ');
}

/// Normalises a course row from any of our sources to the `search_courses` column names.
Map<String, dynamic> _courseRow(Map<String, dynamic> j, [Map<String, dynamic>? provider]) => {
  ...j,
  'course_code': j['course_code'] ?? j['code'],
  'course_name': j['course_name'] ?? j['name'],
  'provider_code': j['provider_code'] ?? provider?['code'],
  'provider_name': j['provider_name'] ?? provider?['name'],
  'provider_type': j['provider_type'] ?? provider?['type'],
  'website': j['website'] ?? provider?['website'],
  'field_broad': j['field_broad'] ?? j['foe1_broad'],
  'field_narrow': j['field_narrow'] ?? j['foe1_narrow'],
  'field_detailed': j['field_detailed'] ?? j['foe1_detailed'],
};

class CourseDetail {
  CourseDetail.fromJson(Map<String, dynamic> j)
    : provider = j['provider'] is Map ? ProviderInfo.fromJson((j['provider'] as Map).cast()) : null,
      course = CourseSummary.fromJson(_courseRow(j, j['provider'] is Map ? (j['provider'] as Map).cast() : null)),
      foe2Broad = _s(j['foe2_broad']),
      foe2Narrow = _s(j['foe2_narrow']),
      foe2Detailed = _s(j['foe2_detailed']),
      language = _s(j['language']),
      workHoursWeek = _num(j['work_hours_week']),
      workWeeks = _int(j['work_weeks']),
      workTotalHours = _num(j['work_total_hours']),
      asAt = _s(j['as_at']);

  final CourseSummary course;
  final ProviderInfo? provider;
  final String foe2Broad;
  final String foe2Narrow;
  final String foe2Detailed;
  final String language;
  final double? workHoursWeek;
  final int? workWeeks;
  final double? workTotalHours;
  final String asAt; // date of the CRICOS register this came from

  /// Work placement hours: the register's total, or hours per week × weeks.
  double? get workHours => workTotalHours ?? (workHoursWeek != null && workWeeks != null ? workHoursWeek! * workWeeks! : null);
}

final Map<String, CourseDetail> _courseCache = {};

Future<CourseDetail?> getCourse(String code, {bool refresh = false}) async {
  if (!refresh && _courseCache.containsKey(code)) return _courseCache[code];
  final res = await _sb.rpc('get_course', params: {'p_code': code});
  if (res is! Map) return null;
  return _courseCache[code] = CourseDetail.fromJson(res.cast());
}

class LevelGroup {
  LevelGroup(this.level, this.count, this.courses);
  final String level;
  final int count;

  /// The courses, when the provider page included them; otherwise loaded on demand.
  List<CourseSummary>? courses;
}

class ProviderDetail {
  ProviderDetail.fromJson(Map<String, dynamic> j)
    : info = ProviderInfo.fromJson(j['provider'] is Map ? (j['provider'] as Map).cast() : j),
      locations = [for (final l in _maps(j['locations'])) ProviderLocation.fromJson(l)],
      courseCount = _int(j['course_count']),
      asAt = _s(j['as_at']),
      levels = [] {
    final p = {'code': info.code, 'name': info.name, 'type': info.type, 'website': info.website};
    for (final g in _maps(j['levels'])) {
      final c = g['courses'];
      final list = c is List ? [for (final r in _maps(c)) CourseSummary.fromJson(_courseRow(r, p))] : null;
      levels.add(LevelGroup(_s(g['level']), _int(g['count']) ?? (c is num ? c.toInt() : list?.length ?? 0), list));
    }
    levels.sort((a, b) => levelRank(a.level).compareTo(levelRank(b.level)));
  }

  final ProviderInfo info;
  final List<ProviderLocation> locations;
  final List<LevelGroup> levels;
  final int? courseCount;
  final String asAt;

  int get researchCount => levels.where((l) => researchLevels.contains(l.level)).fold(0, (a, l) => a + l.count);
  List<String> get states => ({for (final l in locations) l.state}..remove('')).toList()..sort();
}

Future<ProviderDetail?> getProvider(String code) async {
  final res = await _sb.rpc('get_provider', params: {'p_code': code});
  if (res is! Map) return null;
  return ProviderDetail.fromJson(res.cast());
}

/// All courses of one provider at one level (for provider pages that list counts only).
Future<List<CourseSummary>> providerCourses(String providerCode, String level) async {
  final out = <CourseSummary>[];
  // Pages of 100 until the end; providers rarely have more than a few hundred per level.
  for (var offset = 0; offset < 1000; offset += 100) {
    final page = await searchCourses(
      CourseFilters(provider: providerCode, levels: {level}, sort: CourseSort.name),
      limit: 100,
      offset: offset,
    );
    out.addAll(page.items);
    if (page.items.length < 100 || out.length >= page.total) break;
  }
  return out;
}

/// Levels a graduate of [level] commonly moves on to (the AQF ladder), for "next step" suggestions.
List<String> pathwayLevels(String level) => switch (level) {
  'Certificate III' || 'Certificate IV' => ['Diploma'],
  'Diploma' || 'Advanced Diploma' || 'Associate Degree' => ['Bachelor Degree'],
  'Bachelor Degree' => ['Bachelor Honours Degree', 'Graduate Diploma', 'Masters Degree (Coursework)'],
  'Graduate Certificate' || 'Graduate Diploma' => ['Masters Degree (Coursework)', 'Masters Degree (Extended)'],
  'Bachelor Honours Degree' => ['Masters Degree (Research)', 'Doctoral Degree'],
  'Masters Degree (Coursework)' || 'Masters Degree (Extended)' => ['Masters Degree (Research)', 'Doctoral Degree'],
  'Masters Degree (Research)' => ['Doctoral Degree'],
  _ => const [],
};

/// The narrowest field of education worth matching on for alternatives.
String fieldOf(CourseSummary c) => c.fieldNarrow.isNotEmpty ? c.fieldNarrow : c.fieldBroad;

/// The same level and field at other providers, cheapest per year first.
Future<List<CourseSummary>> similarCourses(CourseSummary c, {int limit = 6}) async {
  final field = fieldOf(c);
  if (field.isEmpty || c.level.isEmpty) return const [];
  final page = await searchCourses(CourseFilters(field: field, levels: {c.level}, sort: CourseSort.feeAsc), limit: limit + 1);
  return page.items.where((x) => x.courseCode != c.courseCode).take(limit).toList();
}

/// Courses at the next levels up in the same field (e.g. Masters by research and PhD after a Masters),
/// cheapest first, with how many there are in total.
Future<CoursePage> nextStepCourses(CourseSummary c, {int limit = 6}) async {
  final field = fieldOf(c);
  final levels = pathwayLevels(c.level);
  if (field.isEmpty || levels.isEmpty) return const CoursePage([], 0);
  return searchCourses(CourseFilters(field: field, levels: levels.toSet(), sort: CourseSort.feeAsc), limit: limit);
}

/// Courses opened in this session, newest first (shown on the Study home).
final recentCourses = ValueNotifier<List<CourseSummary>>(const []);

void rememberCourse(CourseSummary c) {
  recentCourses.value = [c, ...recentCourses.value.where((x) => x.courseCode != c.courseCode)].take(5).toList();
}

// ── Universities ─────────────────────────────────────────────────────────────────────────────────

class UniversityEntry {
  UniversityEntry(this.info, this.states, this.campuses);
  final ProviderInfo info;
  final Set<String> states; // head office state plus every campus state
  final int campuses;
}

List<UniversityEntry>? _universities;

/// CRICOS providers with "University" in their name or trading name, with the states they teach in.
Future<List<UniversityEntry>> universities({bool refresh = false}) async {
  if (_universities != null && !refresh) return _universities!;
  final rows = await _sb
      .from('edu_providers')
      .select('code,name,trading_name,type,capacity,website,city,state,postcode')
      .or('name.ilike.*universit*,trading_name.ilike.*universit*')
      .order('name')
      .limit(1000);
  final providers = [for (final r in rows) ProviderInfo.fromJson(r)];
  final states = <String, Set<String>>{};
  final campuses = <String, int>{};
  if (providers.isNotEmpty) {
    final locs = await _sb
        .from('edu_locations')
        .select('provider_code,state')
        .inFilter('provider_code', [for (final p in providers) p.code])
        .limit(5000);
    for (final l in locs) {
      final code = _s(l['provider_code']);
      campuses[code] = (campuses[code] ?? 0) + 1;
      if (_s(l['state']).isNotEmpty) (states[code] ??= {}).add(_s(l['state']));
    }
  }
  final list = [
    for (final p in providers) UniversityEntry(p, {...?states[p.code], if (p.state.isNotEmpty) p.state}, campuses[p.code] ?? 0),
  ]..sort((a, b) => a.info.displayName.toLowerCase().compareTo(b.info.displayName.toLowerCase()));
  return _universities = list;
}

// ── Shortlist and compare ────────────────────────────────────────────────────────────────────────

/// The signed-in user's saved course codes, newest first.
final shortlist = ValueNotifier<List<String>>(const []);
String? _shortlistOwner;

String? get _uid => _sb.auth.currentUser?.id;

Future<List<String>> loadShortlist({bool force = false}) async {
  final owner = people.ownerKey;
  if (owner == null) return shortlist.value = const [];
  if (!force && _shortlistOwner == owner) return shortlist.value;
  final rows = await _sb.from('course_shortlist').select('course_code').order('created_at', ascending: false);
  _shortlistOwner = owner;
  return shortlist.value = [for (final r in rows) _s(r['course_code'])];
}

/// Saves or removes a course, updating the list straight away and undoing it if the save fails.
Future<void> setShortlisted(String code, bool on) async {
  final before = shortlist.value;
  shortlist.value = on ? [code, ...before.where((c) => c != code)] : [...before.where((c) => c != code)];
  try {
    if (on) {
      // With people, a course can be on several people's shortlists (the open person is the default).
      await _sb.from('course_shortlist').upsert(
        {'user_id': _uid, 'course_code': code, if (people.enabled) 'case_id': people.activeId},
        onConflict: people.enabled ? 'user_id,case_id,course_code' : 'user_id,course_code',
        ignoreDuplicates: true,
      );
    } else {
      await _sb.from('course_shortlist').delete().eq('course_code', code);
    }
  } catch (_) {
    shortlist.value = before;
    rethrow;
  }
}

const maxCompare = 3;

/// Courses picked for side-by-side comparison (in memory, up to [maxCompare]).
final compareCodes = ValueNotifier<List<String>>(const []);

/// Adds or removes a course; false when the set is already full.
bool toggleCompare(String code) {
  final now = compareCodes.value;
  if (now.contains(code)) {
    compareCodes.value = [...now.where((c) => c != code)];
    return true;
  }
  if (now.length >= maxCompare) return false;
  compareCodes.value = [...now, code];
  return true;
}

/// Course rows for a set of CRICOS codes, in the order given (shortlist, compare).
Future<List<CourseSummary>> coursesByCodes(List<String> codes) async {
  if (codes.isEmpty) return const [];
  final res = await Future.wait<List<Map<String, dynamic>>>([
    _sb
        .from('edu_courses')
        .select(
          'code,provider_code,name,level,foe1_broad,foe1_narrow,foe1_detailed,duration_weeks,tuition_fee,non_tuition_fee,'
          'total_cost,work_component,dual_qualification,foundation,vet_code,expired',
        )
        .inFilter('code', codes),
    _sb.from('edu_course_locations').select('course_code,location_name,city,state').inFilter('course_code', codes),
  ]);
  final providerCodes = {for (final c in res[0]) _s(c['provider_code'])}.toList();
  final provs = providerCodes.isEmpty
      ? const <Map<String, dynamic>>[]
      : await _sb.from('edu_providers').select('code,name,type,website').inFilter('code', providerCodes);
  final byProvider = {for (final p in provs) _s(p['code']): p};
  final campuses = <String, List<Map<String, dynamic>>>{};
  for (final l in res[1]) {
    (campuses[_s(l['course_code'])] ??= []).add({'name': l['location_name'], 'city': l['city'], 'state': l['state']});
  }
  final byCode = {
    for (final c in res[0])
      _s(c['code']): CourseSummary.fromJson({
        ..._courseRow(c, byProvider[_s(c['provider_code'])]),
        'campuses': campuses[_s(c['code'])] ?? const [],
      }),
  };
  return [
    for (final code in codes)
      if (byCode[code] != null) byCode[code]!,
  ];
}

// ── Study plan (chat function tool `study_plan`) ─────────────────────────────────────────────────

class PlanScenario {
  PlanScenario.fromJson(Map<String, dynamic> j)
    : id = _s(j['id']),
      label = _s(j['label']),
      unitsPerMainTerm = _num(j['unitsPerMainTerm']),
      termsNeeded = _num(j['termsNeeded']),
      finishBy = j['finishBy'] as String?,
      finishesBeforeCoe = j['finishesBeforeCoe'] as bool?,
      finishesBeforeVisa = j['finishesBeforeVisa'] as bool?,
      needs = [for (final n in (j['needs'] as List? ?? const [])) '$n'];
  final String id;
  final String label;
  final double? unitsPerMainTerm;
  final double? termsNeeded;
  final String? finishBy; // YYYY-MM
  final bool? finishesBeforeCoe;
  final bool? finishesBeforeVisa;
  final List<String> needs;

  /// Finishes before both the CoE and the visa end (unknown dates don't count against it).
  bool get inTime => finishesBeforeCoe != false && finishesBeforeVisa != false && (finishesBeforeCoe ?? finishesBeforeVisa) != null;
}

class PlanMissing {
  PlanMissing.fromJson(Map<String, dynamic> j) : fact = _s(j['fact']), question = _s(j['question']);
  final String fact;
  final String question;
}

class StudyPlan {
  StudyPlan.fromJson(Map<String, dynamic> j)
    : status = _s(j['status']).isEmpty ? 'needs_info' : _s(j['status']),
      remainingCredit = _num(j['remainingCredit']),
      remainingUnits = _num(j['remainingUnits']),
      mainTermsUntilCoeEnd = _num(j['mainTermsUntilCoeEnd']),
      mainTermsUntilVisaExpiry = _num(j['mainTermsUntilVisaExpiry']),
      requiredUnitsPerTerm = _num(j['requiredUnitsPerTerm']),
      scenarios = [for (final s in _maps(j['scenarios'])) PlanScenario.fromJson(s)],
      notes = [for (final n in (j['notes'] as List? ?? const [])) '$n'],
      missing = [for (final m in _maps(j['missing'])) PlanMissing.fromJson(m)];

  final String status; // on_track | at_risk | cannot_finish | needs_info | completed
  final double? remainingCredit;
  final double? remainingUnits;
  final double? mainTermsUntilCoeEnd;
  final double? mainTermsUntilVisaExpiry;
  final double? requiredUnitsPerTerm;
  final List<PlanScenario> scenarios;
  final List<String> notes;
  final List<PlanMissing> missing;

  /// Scenarios that finish in time first, then the earliest finish, then the lightest load.
  List<PlanScenario> best([int max = 3]) {
    int rank(PlanScenario s) => s.inTime ? 0 : (s.finishesBeforeCoe == false || s.finishesBeforeVisa == false ? 2 : 1);
    final list = [...scenarios]
      ..sort((a, b) {
        final r = rank(a).compareTo(rank(b));
        if (r != 0) return r;
        final f = (a.finishBy ?? '9999').compareTo(b.finishBy ?? '9999');
        if (f != 0) return f;
        return (a.unitsPerMainTerm ?? 99).compareTo(b.unitsPerMainTerm ?? 99);
      });
    return list.take(max).toList();
  }
}

class StudyPlanResult {
  StudyPlanResult.fromJson(Map<String, dynamic> j)
    : plan = StudyPlan.fromJson(j['plan'] is Map ? (j['plan'] as Map).cast() : const {}),
      record = j['record'] is Map ? (j['record'] as Map).cast() : null,
      input = j['input'] is Map ? (j['input'] as Map).cast() : <String, dynamic>{},
      sources = _maps(j['sources']);
  final StudyPlan plan;
  final Map<String, dynamic>? record; // RecordSummary from the transcripts
  final Map<String, dynamic> input; // PlanInput the plan was computed from
  final List<Map<String, dynamic>> sources;
}

/// The last plan built from the profile alone (no overrides), shared by the Study pages.
final studyPlanCache = ValueNotifier<StudyPlanResult?>(null);
String? _planOwner;

/// Builds the study plan. [overrides] replace `PlanInput` fields for a what-if; they are not saved.
Future<StudyPlanResult> fetchStudyPlan([Map<String, dynamic> overrides = const {}]) async {
  final res = StudyPlanResult.fromJson(await callTool('study_plan', overrides));
  if (overrides.isEmpty) {
    _planOwner = people.ownerKey;
    studyPlanCache.value = res;
  }
  return res;
}

/// The cached plan if it belongs to the signed-in user.
StudyPlanResult? get cachedStudyPlan => _planOwner == people.ownerKey ? studyPlanCache.value : null;

// ── Formatting ───────────────────────────────────────────────────────────────────────────────────

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "2027-11" → "Nov 2027".
String formatMonth(String? ym) {
  if (ym == null || ym.length < 7) return ym ?? '—';
  final m = int.tryParse(ym.substring(5, 7));
  if (m == null || m < 1 || m > 12) return ym;
  return '${_months[m - 1]} ${ym.substring(0, 4)}';
}

/// "2028-03-14" → "14 Mar 2028".
String formatDay(String? ymd) {
  final d = ymd == null ? null : DateTime.tryParse(ymd);
  if (d == null) return ymd ?? '—';
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}

/// 2 → "2", 2.5 → "2.5".
String formatNum(num? v) {
  if (v == null) return '—';
  return v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1);
}

String planStatusLabel(String status) => switch (status) {
  'on_track' => 'On track',
  'at_risk' => 'At risk',
  'cannot_finish' => "Can't finish in time",
  'completed' => 'Completed',
  _ => 'Needs info',
};
