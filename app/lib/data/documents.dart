import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../engine/points.dart' show agePoints;
import '../theme.dart';

/// What a document is, as the chat's document reader classifies it (`documents.extracted.type`).
class DocKind {
  const DocKind(this.type, this.label, this.icon, this.folder, this.color);
  final String type;
  final String label;
  final IconData icon;

  /// The folder "Sort into folders" puts it in.
  final String folder;
  final Color color;
}

const _sky = Color(0xFF7DD3FC);
const _violet = Color(0xFFC4B5FD);
const _amber = Color(0xFFFDE68A);
const _rose = Color(0xFFFECDD3);
const _mint = Color(0xFFA7F3D0);
const _orange = Color(0xFFFDBA74);

const docKinds = <String, DocKind>{
  'transcript': DocKind('transcript', 'Transcript', LucideIcons.bookCheck, 'Marksheets & transcripts', _violet),
  'coe': DocKind('coe', 'CoE', LucideIcons.graduationCap, 'CoEs & offer letters', _sky),
  'offer_letter': DocKind('offer_letter', 'Offer letter', LucideIcons.fileBadge, 'CoEs & offer letters', _sky),
  'visa_grant': DocKind('visa_grant', 'Visa grant', LucideIcons.stamp, 'Visas', AppColors.brand),
  'passport': DocKind('passport', 'Passport', LucideIcons.idCard, 'Identity', _rose),
  'english_test': DocKind('english_test', 'English test', LucideIcons.languages, 'English tests', _amber),
  'skills_assessment': DocKind('skills_assessment', 'Skills assessment', LucideIcons.award, 'Work & payslips', _mint),
  'payslip': DocKind('payslip', 'Payslip', LucideIcons.receipt, 'Work & payslips', _mint),
  'cv': DocKind('cv', 'CV', LucideIcons.fileUser, 'Work & payslips', _mint),
  'oshc': DocKind('oshc', 'OSHC', LucideIcons.heartPulse, 'Finance', _orange),
  'bank_statement': DocKind('bank_statement', 'Bank statement', LucideIcons.landmark, 'Finance', _orange),
  'other': DocKind('other', 'Other', LucideIcons.fileText, 'Other', AppColors.muted),
};

/// Folder names used by "Sort into folders" and offered when creating a folder, in display order.
const suggestedFolders = [
  'Marksheets & transcripts',
  'CoEs & offer letters',
  'Visas',
  'Identity',
  'English tests',
  'Work & payslips',
  'Finance',
  'Other',
];

/// Words that tie a folder the user already has to a suggested folder, so sorting reuses it
/// ("Transcripts", "Visa documents", "Employment") instead of making a near-duplicate.
const _folderWords = {
  'Marksheets & transcripts': ['marksheet', 'mark', 'transcript', 'academic', 'result', 'grade'],
  'CoEs & offer letters': ['coe', 'coes', 'offer', 'enrolment', 'enrollment'],
  'Visas': ['visa', 'vevo', 'immigration'],
  'Identity': ['identity', 'passport', 'id', 'ids'],
  'English tests': ['english', 'ielts', 'pte', 'toefl'],
  'Work & payslips': ['work', 'payslip', 'employment', 'job', 'jobs', 'skill', 'cv', 'resume'],
  'Finance': ['finance', 'financial', 'bank', 'money', 'oshc', 'insurance', 'fund'],
  'Other': ['other', 'misc'],
};

/// More specific folder words per type, tried first (a "Skills assessment" folder beats "Work").
const _typeWords = {
  'skills_assessment': ['skill'],
  'cv': ['cv', 'resume'],
  'payslip': ['payslip', 'pay'],
  'oshc': ['oshc', 'insurance', 'health'],
  'bank_statement': ['bank'],
  'offer_letter': ['offer'],
  'coe': ['coe', 'coes'],
  'passport': ['passport'],
};

List<String> _words(String name) => name.toLowerCase().split(RegExp('[^a-z0-9]+')).where((w) => w.isNotEmpty).toList();

/// Short keywords must match a whole word ("id" is not "idea"); longer ones match a word's start
/// ("transcript" matches "transcripts").
bool _hasWord(String name, List<String> keys) =>
    _words(name).any((w) => keys.any((k) => k.length <= 3 ? w == k : w.startsWith(k)));

class DocFolder {
  const DocFolder(this.id, this.name);
  final String? id; // null = unsorted
  final String name;
}

/// Whether a folder already holds this type of document (by its name).
bool folderFitsType(DocFolder f, String type) {
  final kind = docKinds[type] ?? docKinds['other']!;
  return _hasWord(f.name, _typeWords[type] ?? const []) || _hasWord(f.name, _folderWords[kind.folder]!);
}

/// Whether a folder is one of the type folders (so sorting may move documents out of it).
bool isTypeFolder(DocFolder f) => _folderWords.values.any((keys) => _hasWord(f.name, keys));

/// The existing folder a document of [type] belongs in, if the user has one.
DocFolder? folderForType(String type, List<DocFolder> folders) {
  final kind = docKinds[type] ?? docKinds['other']!;
  final specific = _typeWords[type];
  if (specific != null) {
    for (final f in folders) {
      if (f.id != null && _hasWord(f.name, specific)) return f;
    }
  }
  for (final f in folders) {
    if (f.id != null && f.name.toLowerCase() == kind.folder.toLowerCase()) return f;
  }
  for (final f in folders) {
    if (f.id != null && _hasWord(f.name, _folderWords[kind.folder]!)) return f;
  }
  return null;
}

class DocField {
  const DocField(this.label, this.value);
  final String label;
  final String value;
}

class DocDate {
  DocDate(this.label, this.raw) : parsed = parseLooseDate(raw);
  final String label;
  final String raw;
  final LooseDate? parsed;
}

/// A unit (subject) read from a transcript.
class DocUnit {
  DocUnit(Map j)
    : code = '${j['code'] ?? ''}',
      name = '${j['name'] ?? ''}',
      grade = '${j['grade'] ?? ''}',
      mark = j['mark'] as num?,
      credit = j['credit'] as num?,
      term = '${j['term'] ?? ''}',
      status = '${j['status'] ?? ''}';
  final String code;
  final String name;
  final String grade;
  final num? mark;
  final num? credit;
  final String term;
  final String status;
}

/// What the document reader found in a file (`documents.extracted`, version 1).
class DocExtract {
  DocExtract._(this.type, this.person, this.summary, this.fields, this.dates, this.units);

  static DocExtract? fromJson(Object? j) {
    if (j is! Map || j['type'] is! String) return null;
    String? text(Object? v) => v is String && v.trim().isNotEmpty && v.trim().toLowerCase() != 'null' ? v.trim() : null;
    return DocExtract._(
      j['type'] as String,
      text(j['person']),
      text(j['summary']),
      [
        for (final f in (j['fields'] as List? ?? const []))
          if (f is Map && text('${f['value'] ?? ''}') != null) DocField('${f['label'] ?? f['key'] ?? ''}', '${f['value']}'),
      ],
      [
        for (final d in (j['dates'] as List? ?? const []))
          if (d is Map && d['date'] != null) DocDate('${d['label'] ?? 'Date'}', '${d['date']}'),
      ],
      [
        for (final u in (j['units'] as List? ?? const []))
          if (u is Map) DocUnit(u),
      ],
    );
  }

  final String type;
  final String? person;
  final String? summary;
  final List<DocField> fields;
  final List<DocDate> dates;
  final List<DocUnit> units;

  DocKind get kind => docKinds[type] ?? docKinds['other']!;
}

class DocItem {
  DocItem(Map<String, dynamic> j)
    : id = j['id'] as String,
      folderId = j['folder_id'] as String?,
      filename = j['filename'] as String,
      size = (j['size_bytes'] as num).toInt(),
      status = j['status'] as String,
      path = j['storage_path'] as String,
      mime = j['mime_type'] as String? ?? '',
      createdAt = DateTime.tryParse('${j['created_at']}')?.toLocal(),
      extract = DocExtract.fromJson(j['extracted']);
  final String id;
  String? folderId;
  final String filename;
  final int size;
  final String status;
  final String path;
  final String mime;
  final DateTime? createdAt;
  final DocExtract? extract;

  DocKind? get kind => extract?.kind;
  bool get isPdf => mime == 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
  bool get isImage => mime.startsWith('image/');

  /// Read and classified.
  bool get isRead => extract != null;
  bool get failed => status == 'failed' && extract == null;

  /// Words a search can match: file name, type, person, summary and field values.
  late final String searchText = [
    filename,
    kind?.label ?? '',
    extract?.person ?? '',
    extract?.summary ?? '',
    for (final f in extract?.fields ?? const <DocField>[]) '${f.label} ${f.value}',
  ].join(' ').toLowerCase();
}

const docColumns = 'id, folder_id, filename, size_bytes, status, storage_path, mime_type, created_at, extracted';

/// Folders and documents in one round trip.
Future<(List<DocFolder>, List<DocItem>)> loadDocuments() async {
  final sb = Supabase.instance.client;
  final res = await Future.wait<List<Map<String, dynamic>>>([
    sb.from('folders').select('id, name').order('created_at'),
    sb.from('documents').select(docColumns).order('created_at', ascending: false),
  ]);
  return (
    [for (final r in res[0]) DocFolder(r['id'] as String, r['name'] as String)],
    [for (final r in res[1]) DocItem(r)],
  );
}

/// The chat prompt for "Ask about this", tuned to what the document is.
String askPromptFor(DocItem d) {
  final base = 'Read my document "${d.filename}" and';
  return switch (d.extract?.type) {
    'transcript' =>
      '$base tell me what it means for my visa and study plans: my GPA, WAM and credit so far, any terms at risk, and whether I can still finish on time.',
    'coe' => '$base tell me what its dates mean for my visa and study plans.',
    'offer_letter' => '$base tell me what it means for my visa and study plans: conditions, fees, credit offered and deadlines.',
    'visa_grant' => '$base tell me what it means for my visa and study plans: the conditions, the expiry and what I should do before it.',
    'english_test' => '$base tell me what it means for my visa and study plans: what this score is worth and how long it stays useful.',
    'passport' => '$base check it against my visa and study plans and tell me if anything needs updating.',
    'skills_assessment' => '$base tell me what it means for my visa plans: which skilled visas and points it supports.',
    'payslip' => '$base tell me what it means for my visa and study plans, including my work hours.',
    'bank_statement' => '$base tell me what it means for my visa and study plans, including whether it helps show my funds.',
    'oshc' => '$base check my health cover dates against my visa and study plans.',
    'cv' => '$base tell me what it means for my visa and study plans: which occupations and skilled visas it fits.',
    _ => '$base tell me what it means for my visa and study plans.',
  };
}

// ---------------------------------------------------------------------------------------------
// Sorting into folders

class SortPlan {
  SortPlan(this.moves, this.newFolders, this.kept, this.unread);

  /// Target folder name → documents moving there.
  final Map<String, List<DocItem>> moves;

  /// Suggested folders that don't exist yet and will be created.
  final List<String> newFolders;

  /// Read documents left where they are because they sit in the user's own folders.
  final List<DocItem> kept;

  /// Documents not read yet: they can't be sorted until the reader knows what they are.
  final int unread;

  int get moving => moves.values.fold(0, (n, l) => n + l.length);
}

/// Works out where each read document belongs. Documents in a folder that already fits their type
/// stay; documents in the user's own (non-type) folders stay unless [includeCustom].
SortPlan planSort(List<DocItem> docs, List<DocFolder> folders, {bool includeCustom = false}) {
  final byId = {for (final f in folders) f.id: f};
  final moves = <String, List<DocItem>>{};
  final kept = <DocItem>[];
  final newFolders = <String>{};
  var unread = 0;
  for (final d in docs) {
    final x = d.extract;
    if (x == null) {
      unread++;
      continue;
    }
    final current = byId[d.folderId];
    if (current != null && folderFitsType(current, x.type)) continue;
    if (current != null && !includeCustom && !isTypeFolder(current)) {
      kept.add(d);
      continue;
    }
    final target = folderForType(x.type, folders);
    final name = target?.name ?? x.kind.folder;
    if (target == null) newFolders.add(name);
    if (target != null && target.id == d.folderId) continue;
    (moves[name] ??= []).add(d);
  }
  final ordered = [for (final n in suggestedFolders) if (newFolders.contains(n)) n];
  return SortPlan(moves, ordered, kept, unread);
}

/// Creates the missing folders and moves the documents. Returns how many moved.
Future<int> applySort(SortPlan plan, List<DocFolder> folders) async {
  final sb = Supabase.instance.client;
  final ids = {for (final f in folders) if (f.id != null) f.name: f.id!};
  if (plan.newFolders.isNotEmpty) {
    final made = await sb.from('folders').insert([for (final n in plan.newFolders) {'name': n}]).select('id, name');
    for (final r in made) {
      ids[r['name'] as String] = r['id'] as String;
    }
  }
  var moved = 0;
  await Future.wait(
    plan.moves.entries.map((e) async {
      final id = ids[e.key];
      if (id == null) return;
      await sb.from('documents').update({'folder_id': id}).inFilter('id', [for (final d in e.value) d.id]);
      moved += e.value.length;
    }),
  );
  return moved;
}

// ---------------------------------------------------------------------------------------------
// Dates

/// A date read from free text, which may only give the month.
class LooseDate {
  const LooseDate(this.date, {this.monthOnly = false});
  final DateTime date;
  final bool monthOnly;
}

const _monthNames = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

int? _month(String w) {
  final s = w.toLowerCase();
  if (s.length < 3) return null;
  final i = _monthNames.indexWhere((m) => m.startsWith(s) || (s.length > 3 && s.startsWith(m)));
  return i < 0 ? null : i + 1;
}

DateTime? _ymd(int y, int m, int d) {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  final dt = DateTime(y, m, d);
  return dt.month == m ? dt : null;
}

/// Reads "2026-11-27", "2026-11", "27/11/2026" (day first, as in Australia), "27 Nov 2026",
/// "November 27, 2026" or "Nov 2026". Anything else is null rather than a guess.
LooseDate? parseLooseDate(Object? value) {
  if (value == null) return null;
  final s = '$value'.trim();
  if (s.isEmpty) return null;
  int n(String? g) => int.parse(g!);
  RegExpMatch? m;
  if ((m = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})').firstMatch(s)) != null) {
    final d = _ymd(n(m!.group(1)), n(m.group(2)), n(m.group(3)));
    return d == null ? null : LooseDate(d);
  }
  if ((m = RegExp(r'^(\d{4})-(\d{1,2})$').firstMatch(s)) != null) {
    final d = _ymd(n(m!.group(1)), n(m.group(2)), 1);
    return d == null ? null : LooseDate(d, monthOnly: true);
  }
  if ((m = RegExp(r'^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$').firstMatch(s)) != null) {
    final d = _ymd(n(m!.group(3)), n(m.group(2)), n(m.group(1)));
    return d == null ? null : LooseDate(d);
  }
  if ((m = RegExp(r'(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([A-Za-z]{3,})\.?,?[\s\-]+(\d{4})').firstMatch(s)) != null) {
    final mo = _month(m!.group(2)!);
    final d = mo == null ? null : _ymd(n(m.group(3)), mo, n(m.group(1)));
    if (d != null) return LooseDate(d);
  }
  if ((m = RegExp(r'([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})').firstMatch(s)) != null) {
    final mo = _month(m!.group(1)!);
    final d = mo == null ? null : _ymd(n(m.group(3)), mo, n(m.group(2)));
    if (d != null) return LooseDate(d);
  }
  if ((m = RegExp(r'([A-Za-z]{3,})\.?,?\s+(\d{4})').firstMatch(s)) != null) {
    final mo = _month(m!.group(1)!);
    final d = mo == null ? null : _ymd(n(m.group(2)), mo, 1);
    if (d != null) return LooseDate(d, monthOnly: true);
  }
  return null;
}

const _shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String formatDay(DateTime d, {bool monthOnly = false}) =>
    monthOnly ? '${_shortMonths[d.month - 1]} ${d.year}' : '${d.day} ${_shortMonths[d.month - 1]} ${d.year}';

/// Whole days from today to [d] (negative when past), ignoring time of day and daylight saving.
int daysUntil(DateTime d) {
  final now = DateTime.now();
  return DateTime.utc(d.year, d.month, d.day).difference(DateTime.utc(now.year, now.month, now.day)).inDays;
}

/// A length of time in days, in the unit that reads best: "12 days", "5 months", "2.4 years".
String spanText(int days) {
  final d = days.abs();
  return d < 60
      ? '$d ${d == 1 ? 'day' : 'days'}'
      : d < 730
      ? '${(d / 30.44).round()} months'
      : '${(d / 365.25).toStringAsFixed(1)} years';
}

/// "today", "in 12 days", "in 5 months", "in 2.4 years", "3 days ago", "8 months ago".
String relativeDays(int days) {
  if (days == 0) return 'today';
  if (days == 1) return 'tomorrow';
  if (days == -1) return 'yesterday';
  return days > 0 ? 'in ${spanText(days)}' : '${spanText(days)} ago';
}

/// Colour for a date by how soon it is: past, within 30 days, within 90 days, later.
Color urgencyColor(int days) => days < 0
    ? AppColors.faint
    : days <= 30
    ? AppColors.danger
    : days <= 90
    ? AppColors.warning
    : AppColors.success;

// ---------------------------------------------------------------------------------------------
// Expiry warnings

final _expiryWord = RegExp(r'\b(expir\w*|valid (until|to|till)|until|cease\w*)\b', caseSensitive: false);
final _endWord = RegExp(r'\b(ends?|end date|finish\w*|completion)\b', caseSensitive: false);
final _dueWord = RegExp(r'\b(due|deadline|respond by|accept by|by when)\b', caseSensitive: false);

enum DeadlineKind { expires, ends, due }

/// What a date label says the date is, if it marks an expiry, an end or a deadline.
DeadlineKind? deadlineKindOf(String label) => _expiryWord.hasMatch(label)
    ? DeadlineKind.expires
    : _dueWord.hasMatch(label)
    ? DeadlineKind.due
    : _endWord.hasMatch(label)
    ? DeadlineKind.ends
    : null;

/// An expiry, end or deadline on a document that is past or within 90 days.
class Deadline {
  Deadline(this.doc, this.label, this.date, this.kind, {this.superseded = false}) : days = daysUntil(date);
  final DocItem doc;
  final String label;
  final DateTime date;
  final DeadlineKind kind;
  final int days;

  /// Past, but a newer document of the same type runs later (a renewed visa, a new CoE).
  final bool superseded;

  bool get past => days < 0;
  bool get active => !superseded;

  String get text {
    if (superseded) return 'Replaced';
    if (past) return switch (kind) {
      DeadlineKind.expires => 'Expired',
      DeadlineKind.ends => 'Ended',
      DeadlineKind.due => 'Overdue',
    };
    final verb = switch (kind) {
      DeadlineKind.expires => 'Expires',
      DeadlineKind.ends => 'Ends',
      DeadlineKind.due => 'Due',
    };
    return days == 0 ? '$verb today' : '$verb in $days ${days == 1 ? 'day' : 'days'}';
  }

  Color get color => superseded
      ? AppColors.muted
      : past
      ? AppColors.danger
      : AppColors.warning;
}

const expiryWindowDays = 90;

/// Deadlines per document id: past or within [expiryWindowDays], soonest first.
Map<String, List<Deadline>> computeDeadlines(List<DocItem> docs) {
  // Types that have a date still ahead: past dates on other documents of that type are replaced.
  final aheadByType = <String>{};
  for (final d in docs) {
    final x = d.extract;
    if (x == null || x.type == 'other') continue;
    for (final dt in x.dates) {
      final p = dt.parsed;
      if (p != null && deadlineKindOf(dt.label) != null && daysUntil(p.date) >= 0) aheadByType.add(x.type);
    }
  }
  final out = <String, List<Deadline>>{};
  for (final d in docs) {
    final x = d.extract;
    if (x == null) continue;
    for (final dt in x.dates) {
      final p = dt.parsed;
      final kind = deadlineKindOf(dt.label);
      if (p == null || kind == null) continue;
      final days = daysUntil(p.date);
      if (days > expiryWindowDays) continue;
      final superseded = days < 0 && aheadByType.contains(x.type);
      (out[d.id] ??= []).add(Deadline(d, dt.label, p.date, kind, superseded: superseded));
    }
  }
  for (final l in out.values) {
    l.sort((a, b) => a.date.compareTo(b.date));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Key dates (Profile)

class KeyDate {
  KeyDate(this.label, this.date, {this.detail, this.monthOnly = false, this.icon = LucideIcons.calendarDays, this.fromDocument = false});
  final String label;
  final DateTime date;
  final String? detail;
  final bool monthOnly;
  final IconData icon;
  final bool fromDocument;
  int get days => daysUntil(date);
}

String _normLabel(String s) => _words(s).where((w) => !const {'date', 'the', 'of', 'on', 'your', 'my'}.contains(w)).join();

Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const {};

/// Every date that matters, from the profile and from what the reader found in documents,
/// sorted oldest first. The same label on the same day appears once (the profile's copy wins).
List<KeyDate> keyDates(Map<String, dynamic> profile, List<DocItem> docs) {
  final out = <KeyDate>[];
  void add(String label, Object? raw, {String? detail, IconData icon = LucideIcons.calendarDays, bool doc = false}) {
    final p = parseLooseDate(raw);
    if (p == null) return;
    out.add(KeyDate(label, p.date, detail: detail, monthOnly: p.monthOnly, icon: icon, fromDocument: doc));
  }

  final arrival = _map(profile['arrival']);
  add('Arrived in Australia', arrival['date'], detail: arrival['visa'] as String?, icon: LucideIcons.plane);
  final visa = _map(profile['currentVisa']);
  final visaName = [visa['subclass'], visa['name']].where((v) => v != null && '$v'.isNotEmpty).join(' · ');
  add('Visa granted', visa['granted'], detail: visaName.isEmpty ? null : visaName, icon: LucideIcons.stamp);
  add('Visa expiry', visa['expiry'], detail: visaName.isEmpty ? null : visaName, icon: LucideIcons.stamp);
  for (final s in (profile['study'] as List? ?? const [])) {
    final c = _map(s);
    final name = '${c['course'] ?? c['provider'] ?? 'Course'}';
    add('Course start', c['start'], detail: name, icon: LucideIcons.graduationCap);
    add('Course end', c['end'], detail: name, icon: LucideIcons.graduationCap);
    add('CoE end', c['coeEnd'], detail: name, icon: LucideIcons.graduationCap);
    add('Next term starts', c['nextTermStart'], detail: name, icon: LucideIcons.calendarClock);
  }
  final english = _map(profile['english']);
  add('English test taken', english['date'], detail: english['test'] as String?, icon: LucideIcons.languages);
  out.addAll(ageMilestones(profile));

  for (final d in docs) {
    final x = d.extract;
    if (x == null) continue;
    for (final dt in x.dates) {
      if (RegExp(r'birth|\bdob\b', caseSensitive: false).hasMatch(dt.label)) continue;
      final who = x.person == null ? '' : ' · ${x.person}';
      add(dt.label, dt.raw, detail: '${x.kind.label}$who', icon: x.kind.icon, doc: true);
    }
  }

  out.sort((a, b) => a.date.compareTo(b.date));
  final kept = <KeyDate>[];
  for (final k in out) {
    final n = _normLabel(k.label);
    final dupe = kept.any((o) {
      if (o.date != k.date) return false;
      final m = _normLabel(o.label);
      return m == n || (m.isNotEmpty && n.isNotEmpty && (m.contains(n) || n.contains(m)));
    });
    if (!dupe) kept.add(k);
  }
  return kept;
}

/// The next birthdays that change points-test age points (Schedule 6D, via the rules engine),
/// including turning 45, when points-tested skilled visas are no longer open.
List<KeyDate> ageMilestones(Map<String, dynamic> profile) {
  final dob = parseLooseDate(_map(profile['personal'])['dateOfBirth']);
  if (dob == null || dob.monthOnly) return const [];
  final out = <KeyDate>[];
  for (final age in const [25, 33, 40, 45]) {
    final at = DateTime(dob.date.year + age, dob.date.month, dob.date.day);
    if (daysUntil(at) < 0) continue;
    final before = agePoints(age - 1);
    final after = agePoints(age);
    final detail = after == null
        ? 'Points-tested skilled visas need you under 45 when invited'
        : 'Age points ${after > (before ?? 0) ? 'rise' : 'drop'} from $before to $after';
    out.add(KeyDate('You turn $age', at, detail: detail, icon: LucideIcons.cake));
    if (out.length == 2) break;
  }
  return out;
}

/// Plain-language warnings from how the key dates line up.
List<(String, Color)> dateInsights(Map<String, dynamic> profile, List<DocItem> docs) {
  final out = <(String, Color)>[];
  final visaExpiry = parseLooseDate(_map(profile['currentVisa'])['expiry'])?.date;
  final study = [for (final s in (profile['study'] as List? ?? const [])) _map(s)];
  final current = currentCourse(study);
  if (current != null) {
    final end = parseLooseDate(current['end'])?.date;
    final coe = parseLooseDate(current['coeEnd'])?.date;
    if (end != null && visaExpiry != null && end.isAfter(visaExpiry) && daysUntil(end) >= 0) {
      out.add(('Your course ends after your visa expires (${formatDay(visaExpiry)}). You will need a new visa to finish.', AppColors.danger));
    }
    if (end != null && coe != null && coe.isBefore(end)) {
      out.add(('Your CoE ends (${formatDay(coe)}) before your course does (${formatDay(end)}). Ask your provider about extending it.', AppColors.warning));
    }
    if (coe != null && visaExpiry != null && daysUntil(coe) >= 0) {
      final gap = visaExpiry.difference(coe).inDays;
      if (gap > 0) out.add(('Your visa runs ${spanText(gap)} past your CoE end.', AppColors.muted));
    }
  }
  if (visaExpiry != null) {
    for (final d in docs) {
      if (d.extract?.type != 'passport') continue;
      for (final dt in d.extract!.dates) {
        final p = dt.parsed?.date;
        if (p == null || deadlineKindOf(dt.label) != DeadlineKind.expires || !p.isBefore(visaExpiry) || daysUntil(p) < 0) continue;
        final who = d.extract!.person == null ? 'A passport' : '${d.extract!.person}’s passport';
        out.add((
          '$who expires (${formatDay(p)}) before the visa does. Plan the renewal and update the passport details with Home Affairs.',
          AppColors.warning,
        ));
      }
    }
  }
  return out;
}

/// The course marked current, or else the most recent ongoing one.
Map<String, dynamic>? currentCourse(List<Map<String, dynamic>> study) {
  for (final c in study) {
    if (c['current'] == true) return c;
  }
  for (final c in study.reversed) {
    if (c['status'] == 'ongoing') return c;
  }
  return null;
}
