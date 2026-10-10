// CONTRACT FILE: the shape of a course row from the `search_courses` database function and of
// the items in the chat's `courses` event (the same snake_case JSON). Screens and the chat build
// against these names; extend, don't rename.

/// A campus where a course is delivered.
class Campus {
  const Campus({required this.name, required this.city, required this.state});
  final String name;
  final String city;
  final String state;

  factory Campus.fromJson(Map<String, dynamic> j) =>
      Campus(name: j['name'] as String? ?? '', city: j['city'] as String? ?? '', state: j['state'] as String? ?? '');
  Map<String, dynamic> toJson() => {'name': name, 'city': city, 'state': state};
}

/// One CRICOS-registered course offered to international students.
class CourseSummary {
  const CourseSummary({
    required this.courseCode,
    required this.courseName,
    required this.providerCode,
    required this.providerName,
    this.providerType = '',
    this.website = '',
    this.level = '',
    this.fieldBroad = '',
    this.fieldNarrow = '',
    this.fieldDetailed = '',
    this.durationWeeks,
    this.tuitionFee,
    this.nonTuitionFee,
    this.totalCost,
    this.annualTuition,
    this.workComponent = false,
    this.dualQualification = false,
    this.foundation = false,
    this.vetCode = '',
    this.expired = false,
    this.campuses = const [],
  });

  final String courseCode; // CRICOS course code, e.g. 078241E
  final String courseName;
  final String providerCode; // CRICOS provider code, e.g. 00002J
  final String providerName;
  final String providerType; // Government | Private
  final String website; // provider website from the CRICOS register (may lack a scheme)
  final String level; // CRICOS course level, e.g. "Masters Degree (Research)"
  final String fieldBroad;
  final String fieldNarrow;
  final String fieldDetailed;
  final int? durationWeeks;
  final double? tuitionFee; // whole course, AUD
  final double? nonTuitionFee;
  final double? totalCost; // estimated total course cost, AUD
  final double? annualTuition; // tuition per 52 weeks, computed from the duration
  final bool workComponent;
  final bool dualQualification;
  final bool foundation;
  final String vetCode;
  final bool expired;
  final List<Campus> campuses;

  /// Website with a scheme, ready to open; empty if the register has none.
  String get websiteUrl {
    final w = website.trim();
    if (w.isEmpty) return '';
    return w.startsWith('http') ? w : 'https://$w';
  }

  /// Duration in years, one decimal (e.g. 1.5), or null.
  double? get years => durationWeeks == null ? null : (durationWeeks! / 52 * 10).round() / 10;

  bool get isResearch => level == 'Masters Degree (Research)' || level == 'Doctoral Degree';

  static double? _num(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

  factory CourseSummary.fromJson(Map<String, dynamic> j) => CourseSummary(
    courseCode: j['course_code'] as String? ?? '',
    courseName: j['course_name'] as String? ?? '',
    providerCode: j['provider_code'] as String? ?? '',
    providerName: j['provider_name'] as String? ?? '',
    providerType: j['provider_type'] as String? ?? '',
    website: j['website'] as String? ?? '',
    level: j['level'] as String? ?? '',
    fieldBroad: j['field_broad'] as String? ?? '',
    fieldNarrow: j['field_narrow'] as String? ?? '',
    fieldDetailed: j['field_detailed'] as String? ?? '',
    durationWeeks: (j['duration_weeks'] as num?)?.toInt(),
    tuitionFee: _num(j['tuition_fee']),
    nonTuitionFee: _num(j['non_tuition_fee']),
    totalCost: _num(j['total_cost']),
    annualTuition: _num(j['annual_tuition']),
    workComponent: j['work_component'] == true,
    dualQualification: j['dual_qualification'] == true,
    foundation: j['foundation'] == true,
    vetCode: j['vet_code'] as String? ?? '',
    expired: j['expired'] == true,
    campuses: [for (final c in (j['campuses'] as List? ?? const [])) Campus.fromJson((c as Map).cast())],
  );

  Map<String, dynamic> toJson() => {
    'course_code': courseCode,
    'course_name': courseName,
    'provider_code': providerCode,
    'provider_name': providerName,
    'provider_type': providerType,
    'website': website,
    'level': level,
    'field_broad': fieldBroad,
    'field_narrow': fieldNarrow,
    'field_detailed': fieldDetailed,
    'duration_weeks': durationWeeks,
    'tuition_fee': tuitionFee,
    'non_tuition_fee': nonTuitionFee,
    'total_cost': totalCost,
    'annual_tuition': annualTuition,
    'work_component': workComponent,
    'dual_qualification': dualQualification,
    'foundation': foundation,
    'vet_code': vetCode,
    'expired': expired,
    'campuses': [for (final c in campuses) c.toJson()],
  };
}

/// "$12,345" style money, no cents; "—" when unknown.
String formatAud(double? v) {
  if (v == null) return '—';
  final s = v.round().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return '\$$b';
}
