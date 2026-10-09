library;

import 'facts.dart';
import 'logic.dart';
import 'points.dart';
import 'visas.dart';

enum CriterionStatus { met, notMet, unknown, atRisk }

enum Outcome { eligible, needsInfo, notEligible }

class Question {
  const Question(this.fact, this.text);
  final String fact;
  final String text;
}

class CriterionResult {
  const CriterionResult(this.id, this.title, this.status, this.discretionary, this.detail, this.missing, this.source);
  final String id;
  final String title;
  final CriterionStatus status;
  final bool discretionary;
  final String? detail;
  final List<Question> missing;
  final Source source;
}

class VisaAssessment {
  const VisaAssessment({
    required this.subclass,
    required this.stream,
    required this.name,
    required this.outcome,
    required this.reviewStatus,
    required this.assessedAt,
    required this.criteria,
    required this.points,
    required this.blockers,
    required this.nextQuestions,
  });
  final String subclass;
  final String stream;
  final String name;
  final Outcome outcome;
  final String reviewStatus;
  final String assessedAt;
  final List<CriterionResult> criteria;
  final PointsResult? points;
  final List<String> blockers;
  final List<Question> nextQuestions;
}

const _nomination = {'190': Nomination.state, '491': Nomination.regional};

List<VisaRule> rulesInForce(String on, [List<VisaRule>? rules]) =>
    (rules ?? visaRules).where((r) => r.validFrom.compareTo(on) <= 0 && (r.validTo == null || on.compareTo(r.validTo!) < 0)).toList();

VisaAssessment assessVisa(VisaRule rule, CaseFacts facts) {
  final criteria = rule.criteria.map((c) {
    final r = evaluateCondition(c.condition, facts);
    final status = switch (r.truth) {
      Truth.met => CriterionStatus.met,
      Truth.unknown => CriterionStatus.unknown,
      // A discretionary criterion is a risk to flag, never an automatic refusal.
      Truth.notMet => c.discretionary ? CriterionStatus.atRisk : CriterionStatus.notMet,
    };
    return CriterionResult(
      c.id,
      c.title,
      status,
      c.discretionary,
      r.detail,
      r.missing.map((f) => Question(f, factQuestions[f] ?? f)).toList(),
      c.source,
    );
  }).toList();

  final outcome = criteria.any((c) => c.status == CriterionStatus.notMet)
      ? Outcome.notEligible
      : criteria.any((c) => c.status == CriterionStatus.unknown)
      ? Outcome.needsInfo
      : Outcome.eligible;

  final seen = <String>{};
  final next = criteria.expand((c) => c.missing).where((q) => seen.add(q.fact)).toList();
  final pointsTested = rule.criteria.any((c) => c.condition is PointsAtLeast);

  return VisaAssessment(
    subclass: rule.subclass,
    stream: rule.stream,
    name: rule.name,
    outcome: outcome,
    reviewStatus: rule.reviewStatus,
    assessedAt: facts.assessmentDate ?? todayIso(),
    criteria: criteria,
    points: pointsTested ? calculatePoints(facts, nomination: _nomination[rule.subclass]) : null,
    blockers: criteria
        .where((c) => c.status == CriterionStatus.notMet)
        .map((c) => c.detail == null ? c.title : '${c.title} — ${c.detail}')
        .toList(),
    nextQuestions: next,
  );
}

/// Every visa in force on the assessment date, best options first.
List<VisaAssessment> assessAll(CaseFacts facts, [List<VisaRule>? rules]) {
  final on = facts.assessmentDate ?? todayIso();
  final out = rulesInForce(on, rules).map((r) => assessVisa(r, facts)).toList();
  out.sort((a, b) {
    final byOutcome = a.outcome.index.compareTo(b.outcome.index);
    return byOutcome != 0 ? byOutcome : (b.points?.min ?? 0).compareTo(a.points?.min ?? 0);
  });
  return out;
}
