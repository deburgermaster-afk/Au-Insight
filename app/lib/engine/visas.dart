/// Visa criteria as data. Each criterion cites the source it was taken from.
library;

import 'logic.dart';
import 'points.dart';

class Criterion {
  const Criterion(this.id, this.title, this.condition, this.source, {this.discretionary = false});
  final String id;
  final String title;
  final Condition condition;
  final Source source;

  /// Health, character, debts: flagged as a risk, never decided.
  final bool discretionary;
}

class VisaRule {
  const VisaRule({
    required this.subclass,
    required this.stream,
    required this.name,
    required this.validFrom,
    this.validTo,
    this.reviewStatus = 'draft',
    required this.criteria,
  });
  final String subclass;
  final String stream;
  final String name;
  final String validFrom;
  final String? validTo;

  /// 'draft' until a person has checked every criterion against its cited source.
  final String reviewStatus;
  final List<Criterion> criteria;
}

const _ha = 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing';
const _pic = Source(
  'Migration Regulations 1994 — Schedule 4 (Public interest criteria)',
  'https://www.legislation.gov.au/F1996B03551/latest/text',
);
const _p189 = Source('Skilled Independent visa (subclass 189)', '$_ha/skilled-independent-189');
const _p190 = Source('Skilled Nominated visa (subclass 190)', '$_ha/skilled-nominated-190');
const _p491 = Source('Skilled Work Regional (Provisional) visa (subclass 491)', '$_ha/skilled-work-regional-provisional-491');

List<Criterion> _common(Source page) => [
  Criterion('invitation', 'Invited to apply', const Fact('invitationReceived', 'isTrue'), page),
  Criterion('age', 'Under 45 at the time of invitation', const AgeUnder(45), page),
  Criterion(
    'skills_assessment',
    'Suitable skills assessment for the nominated occupation',
    const Fact('positiveSkillsAssessment', 'isTrue'),
    page,
  ),
  Criterion('english', 'At least Competent English', const Fact('englishLevel', 'in', ['competent', 'proficient', 'superior']), page),
];

const _discretionary = [
  Criterion('health', 'Health requirement', Fact('meetsHealth', 'isTrue'), _pic, discretionary: true),
  Criterion('character', 'Character requirement', Fact('meetsCharacter', 'isTrue'), _pic, discretionary: true),
  Criterion(
    'debts',
    'No outstanding debts to the Australian Government (or arrangement to repay)',
    Fact('hasCommonwealthDebt', 'isFalse'),
    _pic,
    discretionary: true,
  ),
];

final visaRules = <VisaRule>[
  VisaRule(
    subclass: '189',
    stream: 'Points-tested',
    name: _p189.title,
    validFrom: '2024-12-07',
    criteria: [
      ..._common(_p189),
      const Criterion(
        'occupation',
        'Occupation on the Medium and Long-term Strategic Skills List',
        Fact('occupationLists', 'includesAny', ['MLTSSL']),
        _p189,
      ),
      const Criterion('points', 'At least 65 points', PointsAtLeast(65), pointsTestSource),
      ..._discretionary,
    ],
  ),
  VisaRule(
    subclass: '190',
    stream: 'Skilled Nominated',
    name: _p190.title,
    validFrom: '2024-12-07',
    criteria: [
      ..._common(_p190),
      const Criterion(
        'occupation',
        'Occupation on the MLTSSL or STSOL',
        Fact('occupationLists', 'includesAny', ['MLTSSL', 'STSOL']),
        _p190,
      ),
      const Criterion('nomination', 'Nominated by a state or territory government', Fact('stateNomination', 'isTrue'), _p190),
      const Criterion('points', 'At least 65 points (including 5 for nomination)', PointsAtLeast(65, Nomination.state), pointsTestSource),
      ..._discretionary,
    ],
  ),
  VisaRule(
    subclass: '491',
    stream: 'Skilled Work Regional',
    name: _p491.title,
    validFrom: '2024-12-07',
    criteria: [
      ..._common(_p491),
      const Criterion(
        'occupation',
        'Occupation on the MLTSSL, STSOL or ROL',
        Fact('occupationLists', 'includesAny', ['MLTSSL', 'STSOL', 'ROL']),
        _p491,
      ),
      const Criterion(
        'nomination',
        'Nominated by a state/territory or sponsored by an eligible relative in a designated regional area',
        Fact('regionalNominationOrSponsorship', 'isTrue'),
        _p491,
      ),
      const Criterion(
        'points',
        'At least 65 points (including 15 for nomination/sponsorship)',
        PointsAtLeast(65, Nomination.regional),
        pointsTestSource,
      ),
      ..._discretionary,
    ],
  ),
];
