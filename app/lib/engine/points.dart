/// Points test for subclasses 189/190/491 — Migration Regulations 1994, Schedule 6D.
/// Unknown facts give a [min, max] range instead of a guess.
library;

import 'dart:math' as math;

import 'facts.dart';

class Source {
  const Source(this.title, this.url);
  final String title;
  final String url;
}

const pointsTestSource = Source(
  'Migration Regulations 1994 — Schedule 6D (General points test)',
  'https://www.legislation.gov.au/F1996B03551/latest/text',
);

const passMark = 65;

class PointsFactor {
  const PointsFactor(this.key, this.label, this.min, this.max, [this.missing = const [], this.note]);
  final String key;
  final String label;
  final int min;
  final int max;
  final List<String> missing;
  final String? note;
}

class PointsResult {
  const PointsResult(this.min, this.max, this.factors, this.ageIneligible);
  final int min;
  final int max;
  final List<PointsFactor> factors;
  final bool ageIneligible;
  int get required => passMark;
}

enum Nomination { state, regional }

int? agePoints(int age) {
  if (age < 18) return 0;
  if (age < 25) return 25;
  if (age < 33) return 30;
  if (age < 40) return 25;
  if (age < 45) return 15;
  return null;
}

const englishPoints = {'none': 0, 'functional': 0, 'vocational': 0, 'competent': 0, 'proficient': 10, 'superior': 20};

int overseasEmploymentPoints(num years) => years >= 8
    ? 15
    : years >= 5
    ? 10
    : years >= 3
    ? 5
    : 0;
int australianEmploymentPoints(num years) => years >= 8
    ? 20
    : years >= 5
    ? 15
    : years >= 3
    ? 10
    : years >= 1
    ? 5
    : 0;

const qualificationPoints = {
  'none': 0,
  'recognised_by_assessing_authority': 10,
  'diploma_or_trade': 10,
  'bachelor_or_masters': 15,
  'doctorate': 20,
};

const partnerPoints = {
  'single': 10,
  'partner_citizen_or_pr': 10,
  'partner_skilled': 10,
  'partner_competent_english': 5,
  'partner_other': 0,
};

/// Combined overseas + Australian employment points are capped at 20 (Part 6D.5).
const _employmentCap = 20;

PointsFactor _bool(String key, String label, String fact, bool? value, int points) =>
    value == null ? PointsFactor(key, label, 0, points, [fact]) : PointsFactor(key, label, value ? points : 0, value ? points : 0);

PointsResult calculatePoints(CaseFacts f, {Nomination? nomination}) {
  final factors = <PointsFactor>[];
  var ageIneligible = false;

  if (f.dateOfBirth != null) {
    final age = ageOn(f.dateOfBirth!, f.assessmentDate ?? todayIso());
    final pts = agePoints(age);
    if (pts == null) ageIneligible = true;
    factors.add(PointsFactor('age', 'Age', pts ?? 0, pts ?? 0, const [], 'Age $age at assessment date'));
  } else {
    factors.add(const PointsFactor('age', 'Age', 0, 30, ['dateOfBirth']));
  }

  final english = f.englishLevel;
  factors.add(
    english != null
        ? PointsFactor('english', 'English language', englishPoints[english] ?? 0, englishPoints[english] ?? 0)
        : const PointsFactor('english', 'English language', 0, 20, ['englishLevel']),
  );

  final o = f.overseasSkilledYears, a = f.australianSkilledYears;
  final oMin = o == null ? 0 : overseasEmploymentPoints(o), oMax = o == null ? 15 : oMin;
  final aMin = a == null ? 0 : australianEmploymentPoints(a), aMax = a == null ? 20 : aMin;
  factors.add(
    PointsFactor(
      'employment',
      'Skilled employment (combined, max 20)',
      math.min(_employmentCap, oMin + aMin),
      math.min(_employmentCap, oMax + aMax),
      [if (o == null) 'overseasSkilledYears', if (a == null) 'australianSkilledYears'],
    ),
  );

  final q = f.highestQualification;
  factors.add(
    q != null
        ? PointsFactor('qualification', 'Educational qualification', qualificationPoints[q] ?? 0, qualificationPoints[q] ?? 0)
        : const PointsFactor('qualification', 'Educational qualification', 0, 20, ['highestQualification']),
  );

  factors.add(_bool('specialist', 'Specialist education (STEM research)', 'specialistEducation', f.flag('specialistEducation'), 10));
  factors.add(_bool('aus_study', 'Australian study requirement', 'australianStudyRequirement', f.flag('australianStudyRequirement'), 5));
  factors.add(_bool('professional_year', 'Professional Year', 'professionalYear', f.flag('professionalYear'), 5));
  factors.add(
    _bool('ccl', 'Credentialled community language', 'credentialledCommunityLanguage', f.flag('credentialledCommunityLanguage'), 5),
  );
  factors.add(_bool('regional_study', 'Study in regional Australia', 'regionalStudy', f.flag('regionalStudy'), 5));

  final p = f.partnerStatus;
  factors.add(
    p != null
        ? PointsFactor('partner', 'Partner', partnerPoints[p] ?? 0, partnerPoints[p] ?? 0)
        : const PointsFactor('partner', 'Partner', 0, 10, ['partnerStatus']),
  );

  if (nomination == Nomination.state) {
    factors.add(_bool('nomination', 'State/territory nomination (190)', 'stateNomination', f.flag('stateNomination'), 5));
  } else if (nomination == Nomination.regional) {
    factors.add(
      _bool(
        'nomination',
        'Regional nomination/sponsorship (491)',
        'regionalNominationOrSponsorship',
        f.flag('regionalNominationOrSponsorship'),
        15,
      ),
    );
  }

  return PointsResult(factors.fold(0, (s, x) => s + x.min), factors.fold(0, (s, x) => s + x.max), factors, ageIneligible);
}
