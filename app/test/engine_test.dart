import 'package:flutter_test/flutter_test.dart';
import 'package:immi_insight/engine/engine.dart';

VisaRule rule(String subclass) => visaRules.firstWhere((r) => r.subclass == subclass);

const strong = CaseFacts({
  'dateOfBirth': '1992-03-15',
  'assessmentDate': '2026-10-01',
  'occupationCode': '261313',
  'occupationLists': ['MLTSSL'],
  'positiveSkillsAssessment': true,
  'englishLevel': 'superior',
  'overseasSkilledYears': 8,
  'australianSkilledYears': 0,
  'highestQualification': 'bachelor_or_masters',
  'specialistEducation': false,
  'australianStudyRequirement': false,
  'professionalYear': false,
  'credentialledCommunityLanguage': false,
  'regionalStudy': false,
  'partnerStatus': 'single',
  'invitationReceived': true,
  'meetsHealth': true,
  'meetsCharacter': true,
  'hasCommonwealthDebt': false,
});

void main() {
  group('ageOn', () {
    test('counts birthdays exactly', () {
      expect(ageOn('1990-10-02', '2026-10-01'), 35);
      expect(ageOn('1990-10-01', '2026-10-01'), 36);
    });
  });

  group('points test (Schedule 6D)', () {
    test('scores a known profile exactly', () {
      // age 34 → 25, superior → 20, 8y overseas → 15, bachelor → 15, single → 10
      final p = calculatePoints(strong);
      expect(p.min, 85);
      expect(p.max, 85);
    });

    test('caps combined employment at 20', () {
      final p = calculatePoints(strong.set('australianSkilledYears', 8));
      expect(p.factors.firstWhere((f) => f.key == 'employment').max, 20);
    });

    test('returns a range when facts are missing', () {
      final p = calculatePoints(const CaseFacts({'dateOfBirth': '2000-01-01', 'assessmentDate': '2026-10-01'}));
      expect(p.min, 30);
      expect(p.max, greaterThan(65));
    });

    test('adds nomination points', () {
      expect(calculatePoints(strong, nomination: Nomination.regional).min, 85);
      expect(calculatePoints(strong.set('regionalNominationOrSponsorship', true), nomination: Nomination.regional).min, 100);
    });

    test('flags age 45+', () {
      expect(calculatePoints(strong.set('dateOfBirth', '1980-01-01')).ageIneligible, isTrue);
    });
  });

  group('three-valued logic', () {
    test('all() fails fast even with unknowns', () {
      final r = evaluateCondition(
        const All([Fact('invitationReceived', 'isTrue'), Fact('englishLevel', 'eq', 'superior')]),
        const CaseFacts({'invitationReceived': false}),
      );
      expect(r.truth, Truth.notMet);
    });

    test('any() succeeds even with unknowns', () {
      final r = evaluateCondition(
        const Any([Fact('invitationReceived', 'isTrue'), Fact('stateNomination', 'isTrue')]),
        const CaseFacts({'stateNomination': true}),
      );
      expect(r.truth, Truth.met);
    });

    test("decides points when missing facts can't change the outcome", () {
      expect(evaluateCondition(const PointsAtLeast(65), strong.set('partnerStatus', null)).truth, Truth.met);
    });
  });

  group('visa assessment', () {
    test('eligible for 189 with a strong profile', () {
      final a = assessVisa(rule('189'), strong);
      expect(a.outcome, Outcome.eligible);
      expect(a.blockers, isEmpty);
    });

    test('not eligible for 189 when the occupation is only on STSOL', () {
      final a = assessVisa(rule('189'), strong.set('occupationLists', ['STSOL']));
      expect(a.outcome, Outcome.notEligible);
      expect(a.blockers.first, contains('Medium and Long-term'));
    });

    test('asks the right questions when information is missing', () {
      final a = assessVisa(rule('190'), strong.set('stateNomination', null));
      expect(a.outcome, Outcome.needsInfo);
      expect(a.nextQuestions.map((q) => q.fact), ['stateNomination']);
    });

    test('flags discretionary criteria as a risk, not a refusal', () {
      final a = assessVisa(rule('189'), strong.set('meetsHealth', false));
      expect(a.outcome, Outcome.eligible);
      expect(a.criteria.firstWhere((c) => c.id == 'health').status, CriterionStatus.atRisk);
    });

    test('refuses at 45', () {
      expect(assessVisa(rule('189'), strong.set('dateOfBirth', '1981-09-30')).outcome, Outcome.notEligible);
    });

    test('ranks eligible visas first', () {
      final all = assessAll(strong);
      expect(all.first.subclass, '189');
      expect(all.first.outcome, Outcome.eligible);
    });

    test('round-trips the case file JSON', () {
      final f = CaseFacts.fromJson(strong.toJson().cast<String, dynamic>());
      expect(assessVisa(rule('189'), f).outcome, Outcome.eligible);
    });
  });
}
