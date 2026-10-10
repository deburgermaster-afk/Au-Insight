import 'package:supabase_flutter/supabase_flutter.dart';

// Queries behind the Jobs tab: the official skilled occupation lists (Home Affairs), SkillSelect
// invitation rounds and state nominations, and Jobs and Skills Australia's shortage ratings and
// labour-market data, through the database functions `search_occupations`, `get_occupation`,
// `latest_rounds` and `rank_occupations`.

SupabaseClient get _sb => Supabase.instance.client;

String? _str(Object? v) {
  if (v == null) return null;
  final s = '$v'.trim();
  return s.isEmpty ? null : s;
}

int? _int(Object? v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'.replaceAll(',', '')));
double? _num(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'.replaceAll(',', '')));
DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');
List<String> _strings(Object? v) => [for (final e in (v is List ? v : const [])) ?_str(e is Map ? (e['short'] ?? e['name']) : e)];
List<Map<String, dynamic>> _maps(Object? v) => [
  for (final e in (v is List ? v : const []))
    if (e is Map) e.cast<String, dynamic>(),
];
Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const {};

/// First non-null value among [keys] in [m].
Object? _pick(Map<String, dynamic> m, List<String> keys) {
  for (final k in keys) {
    final v = m[k];
    if (v != null) return v;
  }
  return null;
}

const occupationLists = ['MLTSSL', 'STSOL', 'ROL', 'CSOL'];
const occupationVisas = ['189', '190', '491', '482', '186', '494', '485'];
const shortageStates = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

/// What each list means, for tooltips and explanations.
const listMeaning = {
  'MLTSSL': 'Medium and Long-term Strategic Skills List: 189, 190, 491 and 485 visas',
  'STSOL': 'Short-term Skilled Occupation List: 190 and 491 (state or regional) visas',
  'ROL': 'Regional Occupation List: 491 and 494 regional visas',
  'CSOL': 'Core Skills Occupation List: Skills in Demand (482) and 186 employer visas',
};

String shortageLabel(String? rating) => rating == null || rating.isEmpty ? 'Not rated' : rating;

/// Shortage rating colour: green for shortage, amber for regional or metro only, grey otherwise.
enum ShortageTone { shortage, partial, none, unknown }

ShortageTone shortageTone(String? rating) {
  final r = (rating ?? '').toLowerCase();
  if (r.isEmpty) return ShortageTone.unknown;
  if (r.startsWith('no')) return ShortageTone.none;
  if (r.contains('regional') || r.contains('metro')) return ShortageTone.partial;
  if (r.contains('shortage')) return ShortageTone.shortage;
  return ShortageTone.unknown;
}

/// One row of a search: `search_occupations`.
class OccupationSummary {
  OccupationSummary({
    required this.anzsco,
    required this.title,
    this.lists = const [],
    this.visas = const [],
    this.authorities = const [],
    this.shortageNational,
    this.shortageState,
    this.lastMinPoints,
    this.lastInvitedRound,
    this.roundsInvited12m,
    this.employed,
    this.medianWeeklyEarnings,
    this.why,
  });

  final String anzsco;
  final String title;
  final List<String> lists;
  final List<String> visas;
  final List<String> authorities;
  final String? shortageNational;
  final String? shortageState;
  final int? lastMinPoints;
  final DateTime? lastInvitedRound;
  final int? roundsInvited12m;
  final int? employed;
  final double? medianWeeklyEarnings;

  /// rank_occupations only: why it ranks where it does, built from the data.
  final String? why;

  String get code => anzsco.length > 6 ? anzsco.substring(0, 6) : anzsco;

  factory OccupationSummary.fromJson(Map<String, dynamic> j) => OccupationSummary(
    anzsco: _str(_pick(j, ['anzsco', 'code'])) ?? '',
    title: _str(j['title']) ?? 'Occupation',
    lists: _strings(j['lists']),
    visas: _strings(_pick(j, ['visa_subclasses', 'visas'])),
    authorities: _strings(j['authorities']),
    shortageNational: _str(_pick(j, ['shortage_national', 'national'])),
    shortageState: _str(j['shortage_state']),
    lastMinPoints: _int(_pick(j, ['last_min_points_189', 'last_min_points', 'min_points'])),
    lastInvitedRound: _date(_pick(j, ['last_invited_round', 'last_round'])),
    roundsInvited12m: _int(_pick(j, ['rounds_invited_12m', 'rounds_invited'])),
    employed: _int(j['employed']),
    medianWeeklyEarnings: _num(j['median_weekly_earnings']),
    why: _str(j['why']),
  );
}

class OccupationPage {
  const OccupationPage(this.items, this.total);
  final List<OccupationSummary> items;
  final int total;
}

class OccupationFilters {
  const OccupationFilters({this.query = '', this.list, this.visa, this.shortageOnly = false, this.state});
  final String query;
  final String? list;
  final String? visa;
  final bool shortageOnly;
  final String? state;

  OccupationFilters copyWith({
    String? query,
    String? Function()? list,
    String? Function()? visa,
    bool? shortageOnly,
    String? Function()? state,
  }) => OccupationFilters(
    query: query ?? this.query,
    list: list != null ? list() : this.list,
    visa: visa != null ? visa() : this.visa,
    shortageOnly: shortageOnly ?? this.shortageOnly,
    state: state != null ? state() : this.state,
  );

  int get count => (list != null ? 1 : 0) + (visa != null ? 1 : 0) + (shortageOnly ? 1 : 0) + (state != null ? 1 : 0);
}

Future<OccupationPage> searchOccupations(OccupationFilters f, {int limit = 30, int offset = 0}) async {
  final rows = await _sb.rpc(
    'search_occupations',
    params: {
      'p_query': f.query.trim().isEmpty ? null : f.query.trim(),
      'p_list': f.list,
      'p_visa': f.visa,
      'p_shortage': f.shortageOnly ? 'Shortage' : null,
      'p_state': f.state,
      'p_limit': limit,
      'p_offset': offset,
    },
  );
  final list = _maps(rows);
  return OccupationPage([
    for (final r in list) OccupationSummary.fromJson(r),
  ], list.isEmpty ? 0 : (_int(list.first['total_count']) ?? list.length));
}

/// "Where are invitations easiest?": `rank_occupations`.
Future<List<OccupationSummary>> rankOccupations({int? maxPoints, String? visa, String? field, String? state, int limit = 12}) async {
  final rows = await _sb.rpc(
    'rank_occupations',
    params: {'p_max_points': maxPoints, 'p_visa': visa, 'p_field': field, 'p_state': state, 'p_limit': limit},
  );
  return [for (final r in _maps(rows)) OccupationSummary.fromJson(r)];
}

/// One occupation's appearance in an invitation round.
class RoundEntry {
  const RoundEntry({required this.date, required this.subclass, this.minPoints, this.invited});
  final DateTime date;
  final String subclass;
  final int? minPoints;
  final int? invited;
}

class ShortageYear {
  const ShortageYear({required this.year, this.national, this.states = const {}});
  final int year;
  final String? national;
  final Map<String, String?> states;
}

class Authority {
  const Authority({required this.short, this.name, this.url});
  final String short;
  final String? name;
  final String? url;
}

class Caveat {
  const Caveat({this.visa, this.title, required this.text});
  final String? visa;
  final String? title;
  final String text;
}

class SourceLink {
  const SourceLink(this.title, this.url, {this.asAt});
  final String title;
  final String url;
  final String? asAt;
}

/// Everything about one occupation: `get_occupation`.
class OccupationDetail {
  OccupationDetail({
    required this.anzsco,
    required this.title,
    this.anzsco2022,
    this.lists = const [],
    this.visas = const [],
    this.visaNames = const [],
    this.authorities = const [],
    this.caveats = const [],
    this.shortage = const [],
    this.profile = const {},
    this.rounds = const [],
    this.nextRound,
    this.sources = const [],
    this.listed = true,
    this.latestRound,
  });

  final String anzsco;
  final String title;
  final String? anzsco2022;
  final List<String> lists;
  final List<String> visas; // subclasses
  final List<String> visaNames;
  final List<Authority> authorities;
  final List<Caveat> caveats;
  final List<ShortageYear> shortage; // newest year first
  final Map<String, dynamic> profile;
  final List<RoundEntry> rounds; // newest first
  final DateTime? nextRound;
  final List<SourceLink> sources;
  final bool listed;

  /// The newest published round of any occupation: "the last 12 months" counts back from it.
  final DateTime? latestRound;

  String get code => anzsco.length > 6 ? anzsco.substring(0, 6) : anzsco;
  ShortageYear? get latestShortage => shortage.isEmpty ? null : shortage.first;

  List<RoundEntry> roundsFor(String subclass) => [
    for (final r in rounds)
      if (r.subclass == subclass) r,
  ];

  /// Rounds in the 12 months before [now] that invited this occupation.
  int roundsInLastYear(String subclass, DateTime now) =>
      roundsFor(subclass).where((r) => r.date.isAfter(now.subtract(const Duration(days: 365)))).length;

  int? get employed => _int(profile['employed']);
  double? get medianWeeklyEarnings => _num(profile['median_weekly_earnings']);
  double? get partTimeShare => _num(profile['part_time_share']);
  double? get femaleShare => _num(profile['female_share']);
  double? get medianAge => _num(profile['median_age']);
  double? get projectedGrowth => _num(profile['projected_growth']);
  double? get annualGrowth => _num(profile['annual_growth']);
  String? get description => _str(profile['description']);
  List<String> get tasks => _strings(profile['tasks']);
  List<String> get otherTitles => _strings(profile['other_titles']);
  String? get registration => _str(profile['registration']);

  /// The jobs data is for the wider unit group when the occupation has no profile of its own.
  bool get profileIsUnitGroup => profile['level'] == 'unit group';
  double? get growth5yr => _num(profile['growth_5yr']);

  factory OccupationDetail.fromJson(Map<String, dynamic> raw) {
    final o = raw['occupation'] is Map ? _map(raw['occupation']) : raw;
    final auth = [
      for (final a in _maps(_pick(o, ['assessing_authorities', 'authorities_detail'])))
        if (_str(a['short'] ?? a['name']) != null)
          Authority(short: _str(a['short'] ?? a['name'])!, name: _str(a['name']), url: _str(a['url'])),
    ];
    final shortageRows = _maps(_pick(raw, ['shortage', 'shortage_years']));
    final shortage = [
      for (final s in shortageRows)
        ShortageYear(
          year: _int(s['year']) ?? 0,
          national: _str(s['national']),
          states: {for (final st in shortageStates) st: _str(s[st.toLowerCase()] ?? s[st])},
        ),
    ]..sort((a, b) => b.year.compareTo(a.year));
    final rounds = [
      for (final r in _maps(raw['rounds']))
        if (_date(_pick(r, ['round_date', 'date'])) != null)
          RoundEntry(
            date: _date(_pick(r, ['round_date', 'date']))!,
            subclass: _str(r['subclass']) ?? '',
            minPoints: _int(r['min_points']),
            invited: _int(r['invited']),
          ),
    ]..sort((a, b) => b.date.compareTo(a.date));
    final sources = <SourceLink>[];
    final rawSources = raw['sources'];
    if (rawSources is Map) {
      rawSources.forEach((k, v) {
        if (v is String && v.startsWith('http')) sources.add(SourceLink('$k', v));
        if (v is Map && _str(v['url']) != null) sources.add(SourceLink(_str(v['title']) ?? '$k', _str(v['url'])!, asAt: _str(v['as_at'])));
      });
    } else {
      for (final s in _maps(rawSources)) {
        if (_str(s['url']) != null) {
          sources.add(SourceLink(_str(s['title'] ?? s['name']) ?? 'Source', _str(s['url'])!, asAt: _str(s['as_at'])));
        }
      }
    }
    return OccupationDetail(
      anzsco: _str(_pick(o, ['anzsco', 'code'])) ?? '',
      title: _str(o['title']) ?? 'Occupation',
      anzsco2022: _str(o['anzsco_2022']),
      lists: _strings(o['lists']),
      visas: _strings(o['visa_subclasses']),
      visaNames: _strings(o['visas']),
      authorities: auth,
      caveats: [
        for (final c in _maps(o['caveats']))
          if (_str(c['text']) != null) Caveat(visa: _str(c['visa']), title: _str(c['title']), text: _str(c['text'])!),
      ],
      shortage: shortage,
      profile: _map(raw['profile']),
      rounds: rounds,
      nextRound: _date(_pick(raw, ['next_round_189', 'next_round'])),
      sources: sources,
      listed: o['listed'] != false,
      latestRound: _date(_map(raw['as_at'])['rounds']),
    );
  }
}

Future<OccupationDetail?> getOccupation(String anzsco) async {
  final r = await _sb.rpc('get_occupation', params: {'p_anzsco': anzsco});
  if (r is! Map || r.isEmpty) return null;
  return OccupationDetail.fromJson(r.cast<String, dynamic>());
}

/// One invitation round with its totals.
class InvitationRound {
  const InvitationRound({
    required this.date,
    required this.subclass,
    this.subclassName,
    this.invited,
    this.tieBreak,
    this.occupations,
    this.lowestPoints,
  });
  final DateTime date;
  final String subclass;
  final String? subclassName;
  final int? invited;
  final String? tieBreak;
  final int? occupations;
  final int? lowestPoints;
}

class StateNomination {
  const StateNomination({required this.state, required this.subclass, required this.nominations, this.programYear, this.asOf});
  final String state;
  final String subclass;
  final String nominations;
  final String? programYear;
  final String? asOf;
}

class RoundsOverview {
  const RoundsOverview({
    this.rounds = const [],
    this.nextRound,
    this.stateNominations = const [],
    this.monthlyTotals = const {},
    this.sourceUrl,
  });
  final List<InvitationRound> rounds; // newest first
  final DateTime? nextRound;
  final List<StateNomination> stateNominations;
  final Map<String, dynamic> monthlyTotals;
  final String? sourceUrl;

  factory RoundsOverview.fromJson(Map<String, dynamic> j) {
    final rounds = [
      for (final r in _maps(j['rounds']))
        if (_date(_pick(r, ['round_date', 'date'])) != null)
          InvitationRound(
            date: _date(_pick(r, ['round_date', 'date']))!,
            subclass: _str(r['subclass']) ?? '',
            subclassName: _str(r['subclass_name']),
            invited: _int(r['invited']),
            tieBreak: _str(r['tie_break']),
            occupations: _int(_pick(r, ['occupations', 'occupation_count'])),
            lowestPoints: _int(_pick(r, ['lowest_points', 'min_points'])),
          ),
    ]..sort((a, b) => b.date.compareTo(a.date));
    final noms = [
      for (final s in _maps(_pick(j, ['state_nominations', 'nominations'])))
        if (_str(s['state']) != null)
          StateNomination(
            state: _str(s['state'])!,
            subclass: _str(s['subclass']) ?? '',
            nominations: _str(s['nominations']) ?? '–',
            programYear: _str(s['program_year']),
            asOf: _str(s['as_of']),
          ),
    ];
    final nr = j['next_round'];
    return RoundsOverview(
      rounds: rounds,
      nextRound: nr is Map ? _date(_pick(nr.cast<String, dynamic>(), ['date', 'next_round_189', '189'])) : _date(nr),
      stateNominations: noms,
      monthlyTotals: _map(j['monthly_totals']),
      sourceUrl: _str(j['source_url']),
    );
  }
}

Future<RoundsOverview> latestRounds({int limit = 12}) async {
  final r = await _sb.rpc('latest_rounds', params: {'p_limit': limit});
  return RoundsOverview.fromJson(r is Map ? r.cast<String, dynamic>() : const {});
}

const invitationRoundsUrl = 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds';
const previousRoundsUrl = 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/previous-rounds';
const occupationListUrl = 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list';
const shortageListUrl = 'https://www.jobsandskills.gov.au/data/occupation-shortages-analysis/occupation-shortage-list';

/// "15 Oct 2026".
String formatDay(DateTime d) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${m[d.month - 1]} ${d.year}';
}

/// The chat prompt behind "Show my pathway".
String pathwayPrompt(OccupationDetail o) {
  final latest = o.roundsFor('189').firstOrNull;
  return 'Show my pathway to ${o.title} (ANZSCO ${o.code}). Use my profile, documents and study history. '
      'Tell me: which visas this occupation opens for me (lists: ${o.lists.isEmpty ? 'none' : o.lists.join(', ')}), '
      'the skills assessment I need${o.authorities.isEmpty ? '' : ' from ${o.authorities.map((a) => a.short).join(' or ')}'} and how to qualify, '
      'which courses (with providers, fees and length from CRICOS) would get me there if I need one, '
      'my points now and the points I would need${latest?.minPoints != null ? ' (the latest 189 round invited it at ${latest!.minPoints} points)' : ''}, '
      'how likely an invitation is from the recent rounds and state nominations, and a dated step-by-step plan that fits my visa expiry.';
}

/// One type-ahead suggestion: `suggest_occupations`.
class OccupationSuggestion {
  const OccupationSuggestion({
    required this.anzsco,
    required this.code,
    required this.title,
    this.hint,
    this.lists = const [],
    this.lastMinPoints,
    this.lastInvited,
    this.shortage,
  });
  final String anzsco;
  final String code;
  final String title;
  final String? hint; // "Also called Software Developer", "ANZSCO 261313"
  final List<String> lists;
  final int? lastMinPoints;
  final DateTime? lastInvited;
  final String? shortage;
}

Future<List<OccupationSuggestion>> suggestOccupations(String query, {int limit = 8}) async {
  if (query.trim().isEmpty) return const [];
  final rows = await _sb.rpc('suggest_occupations', params: {'p_query': query.trim(), 'p_limit': limit});
  return [
    for (final r in _maps(rows))
      OccupationSuggestion(
        anzsco: _str(r['anzsco']) ?? '',
        code: _str(r['code']) ?? '',
        title: _str(r['title']) ?? '',
        hint: _str(r['hint']),
        lists: _strings(r['lists']),
        lastMinPoints: _int(r['last_min_points_189']),
        lastInvited: _date(r['last_invited_round']),
        shortage: _str(r['shortage_national']),
      ),
  ];
}

Future<RoundsOverview>? _allRounds;

/// Every published round (cached for the session): the denominator for "invited in N of M rounds".
Future<RoundsOverview> allRounds() => _allRounds ??= latestRounds(limit: 60).catchError((Object e) {
  _allRounds = null;
  throw e;
});

/// Australian migration program years run July to June: 4 June 2026 is in 2025-26.
String programYear(DateTime d) {
  final start = d.month >= 7 ? d.year : d.year - 1;
  return '$start-${((start + 1) % 100).toString().padLeft(2, '0')}';
}

enum Trend { up, down, steady, none }

/// One program year of an occupation's invitations for a subclass.
class YearTrend {
  const YearTrend({
    required this.year,
    required this.invitedIn,
    required this.roundsHeld,
    this.lowest,
    this.highest,
    this.trend = Trend.none,
    this.change,
    this.totalInvited = 0,
  });
  final String year;
  final int invitedIn; // rounds that invited this occupation
  final int roundsHeld; // rounds held for the subclass that year (with invitations)
  final int? lowest; // lowest minimum points that year
  final int? highest;
  final Trend trend; // lowest points against the previous year it was invited: up = harder
  final int? change;
  final int totalInvited; // invitations for the subclass that year, all occupations (official round totals)
}

/// Year-by-year invitations for one occupation and subclass, newest year first, from its rounds and every
/// published round.
List<YearTrend> yearTrends(List<RoundEntry> rounds, List<InvitationRound> published, String subclass) {
  final held = <String, int>{};
  final total = <String, int>{};
  for (final r in published) {
    if (r.subclass != subclass || (r.invited ?? 0) <= 0) continue;
    final y = programYear(r.date);
    held[y] = (held[y] ?? 0) + 1;
    total[y] = (total[y] ?? 0) + r.invited!;
  }
  final mine = <String, List<RoundEntry>>{};
  for (final r in rounds) {
    if (r.subclass == subclass) mine.putIfAbsent(programYear(r.date), () => []).add(r);
  }
  final years = {...held.keys, ...mine.keys}.toList()..sort();
  final out = <YearTrend>[];
  int? previous;
  for (final y in years) {
    final pts = [for (final r in mine[y] ?? const <RoundEntry>[]) ?r.minPoints];
    final lo = pts.isEmpty ? null : pts.reduce((a, b) => a < b ? a : b);
    final hi = pts.isEmpty ? null : pts.reduce((a, b) => a > b ? a : b);
    var trend = Trend.none;
    int? change;
    if (lo != null && previous != null) {
      change = lo - previous;
      trend = change > 0 ? Trend.up : (change < 0 ? Trend.down : Trend.steady);
    }
    if (lo != null) previous = lo;
    out.add(
      YearTrend(
        year: y,
        invitedIn: (mine[y] ?? const []).length,
        roundsHeld: held[y] ?? 0,
        lowest: lo,
        highest: hi,
        trend: trend,
        change: change,
        totalInvited: total[y] ?? 0,
      ),
    );
  }
  return out.reversed.toList();
}

/// One program year of a subclass's rounds overall, newest first: total invited and lowest points, with the
/// change in invitations from the year before.
class RoundYear {
  const RoundYear({
    required this.year,
    required this.subclass,
    required this.rounds,
    required this.invited,
    this.lowestPoints,
    this.trend = Trend.none,
    this.changePct,
  });
  final String year;
  final String subclass;
  final int rounds;
  final int invited;
  final int? lowestPoints;
  final Trend trend; // invitations against the year before: up = more invitations
  final int? changePct;
}

List<RoundYear> roundYears(List<InvitationRound> published, String subclass) {
  final byYear = <String, List<InvitationRound>>{};
  for (final r in published) {
    if (r.subclass == subclass) byYear.putIfAbsent(programYear(r.date), () => []).add(r);
  }
  final years = byYear.keys.toList()..sort();
  final out = <RoundYear>[];
  int? previous;
  for (final y in years) {
    final rs = byYear[y]!;
    final invited = rs.fold<int>(0, (a, r) => a + (r.invited ?? 0));
    final pts = [for (final r in rs) ?r.lowestPoints];
    var trend = Trend.none;
    int? pct;
    if (previous != null && previous > 0) {
      pct = ((invited - previous) * 100 / previous).round();
      trend = pct > 2 ? Trend.up : (pct < -2 ? Trend.down : Trend.steady);
    }
    previous = invited;
    out.add(
      RoundYear(
        year: y,
        subclass: subclass,
        rounds: rs.where((r) => (r.invited ?? 0) > 0).length,
        invited: invited,
        lowestPoints: pts.isEmpty ? null : pts.reduce((a, b) => a < b ? a : b),
        trend: trend,
        changePct: pct,
      ),
    );
  }
  return out.reversed.toList();
}

/// Official invitations by month (1 = January) for each program year, newest year first, from the round totals.
List<(String, Map<int, int>)> monthlyInvited(List<InvitationRound> published, String subclass) {
  final out = <String, Map<int, int>>{};
  for (final r in published) {
    if (r.subclass != subclass) continue;
    final m = out.putIfAbsent(programYear(r.date), () => {});
    m[r.date.month] = (m[r.date.month] ?? 0) + (r.invited ?? 0);
  }
  final years = out.keys.toList()..sort((a, b) => b.compareTo(a));
  return [for (final y in years) (y, out[y]!)];
}

/// The total invited in a round (all occupations), or null when the round isn't known.
int? roundTotal(List<InvitationRound> published, DateTime date, String subclass) {
  for (final r in published) {
    if (r.subclass == subclass && r.date == date) return r.invited;
  }
  return null;
}

/// One visa route an occupation opens, with Home Affairs' processing times.
class PathwayRoute {
  const PathwayRoute({required this.visa, required this.name, required this.open, this.how, this.p50, this.p90});
  final String visa;
  final String name;
  final bool open;
  final String? how;
  final String? p50; // half of applications decided within
  final String? p90;
}

/// One step of the timeline, with a day range when the data supports one.
class PathwayStep {
  const PathwayStep({required this.step, this.text, this.minDays, this.maxDays});
  final String step;
  final String? text;
  final int? minDays;
  final int? maxDays;
}

class PathwayState {
  const PathwayState({required this.state, this.shortage, this.nominations = const {}, this.period, this.chosen = false});
  final String state;
  final String? shortage;
  final Map<String, String> nominations; // subclass -> count as published ("<5" kept)
  final String? period;
  final bool chosen;
}

/// The PR pathway for one occupation: `pr_pathway`.
class PrPathway {
  const PrPathway({
    this.routes = const [],
    this.steps = const [],
    this.totalMin,
    this.totalMax,
    this.totalNote,
    this.states = const [],
    this.yourPoints,
  });
  final List<PathwayRoute> routes;
  final List<PathwayStep> steps;
  final int? totalMin;
  final int? totalMax;
  final String? totalNote;
  final List<PathwayState> states;
  final String? yourPoints;

  factory PrPathway.fromJson(Map<String, dynamic> j) {
    final timeline = _map(j['timeline']);
    final total = _map(timeline['total']);
    return PrPathway(
      routes: [
        for (final r in _maps(j['routes']))
          PathwayRoute(
            visa: _str(r['visa']) ?? '',
            name: _str(r['name']) ?? '',
            open: r['open'] == true,
            how: _str(r['how']),
            p50: _str(_map(r['processing'])['p50']),
            p90: _str(_map(r['processing'])['p90']),
          ),
      ],
      steps: [
        for (final s in _maps(timeline['steps']))
          PathwayStep(step: _str(s['step']) ?? '', text: _str(s['text']), minDays: _int(s['min_days']), maxDays: _int(s['max_days'])),
      ],
      totalMin: _int(total['min_days']),
      totalMax: _int(total['max_days']),
      totalNote: _str(total['note']),
      states: [
        for (final s in _maps(j['states']))
          PathwayState(
            state: _str(s['state']) ?? '',
            shortage: _str(s['shortage']),
            nominations: {for (final e in _map(s['nominations']).entries) e.key: '${e.value}'},
            period: _str(s['nominations_period']),
            chosen: s['chosen'] == true,
          ),
      ],
      yourPoints: _str(_map(j['invitations'])['your_points']),
    );
  }
}

Future<PrPathway?> prPathway(String anzsco, {int? points, String? state}) async {
  final r = await _sb.rpc('pr_pathway', params: {'p_anzsco': anzsco, 'p_points': points, 'p_state': state});
  return r is Map ? PrPathway.fromJson(r.cast<String, dynamic>()) : null;
}

/// 45 -> "about 6 weeks", 245 -> "about 8 months".
String aboutDays(int days) {
  if (days < 14) return '$days days';
  if (days < 75) return 'about ${(days / 7).round()} weeks';
  final months = (days / 30.4).round();
  return months < 24 ? 'about $months months' : 'about ${(months / 12).toStringAsFixed(1)} years';
}

String dayRange(int? min, int? max) {
  if (min == null && max == null) return '';
  if (min == null || max == null || min == max) return aboutDays((min ?? max)!);
  return '${aboutDays(min).replaceFirst('about ', '')} to ${aboutDays(max).replaceFirst('about ', '')}';
}
