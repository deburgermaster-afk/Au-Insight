/// Three-valued (Kleene) condition language. Rules are plain data with the
/// same JSON shape as the TypeScript engine, so they can live in `criteria_rules.logic`.
library;

import 'facts.dart';
import 'points.dart';

enum Truth { met, notMet, unknown }

class CondResult {
  const CondResult(this.truth, [this.missing = const [], this.detail]);
  final Truth truth;
  final List<String> missing;
  final String? detail;
}

sealed class Condition {
  const Condition();
}

class All extends Condition {
  const All(this.items);
  final List<Condition> items;
}

class Any extends Condition {
  const Any(this.items);
  final List<Condition> items;
}

class Not extends Condition {
  const Not(this.inner);
  final Condition inner;
}

/// ops: isTrue, isFalse, eq, neq, gte, gt, lte, lt, in, includesAny
class Fact extends Condition {
  const Fact(this.fact, this.op, [this.value]);
  final String fact;
  final String op;
  final Object? value;
}

class AgeUnder extends Condition {
  const AgeUnder(this.age);
  final int age;
}

class PointsAtLeast extends Condition {
  const PointsAtLeast(this.points, [this.nomination]);
  final int points;
  final Nomination? nomination;
}

List<String> _uniq(Iterable<String> xs) => xs.toSet().toList();

CondResult evaluateCondition(Condition c, CaseFacts facts) {
  switch (c) {
    case All(:final items):
      final rs = items.map((x) => evaluateCondition(x, facts)).toList();
      final failed = rs.where((r) => r.truth == Truth.notMet).firstOrNull;
      if (failed != null) return CondResult(Truth.notMet, const [], failed.detail);
      if (rs.any((r) => r.truth == Truth.unknown)) return CondResult(Truth.unknown, _uniq(rs.expand((r) => r.missing)));
      final details = rs.map((r) => r.detail).whereType<String>().join('; ');
      return CondResult(Truth.met, const [], details.isEmpty ? null : details);
    case Any(:final items):
      final rs = items.map((x) => evaluateCondition(x, facts)).toList();
      final passed = rs.where((r) => r.truth == Truth.met).firstOrNull;
      if (passed != null) return CondResult(Truth.met, const [], passed.detail);
      if (rs.any((r) => r.truth == Truth.unknown)) return CondResult(Truth.unknown, _uniq(rs.expand((r) => r.missing)));
      return const CondResult(Truth.notMet);
    case Not(:final inner):
      final r = evaluateCondition(inner, facts);
      return CondResult(switch (r.truth) {
        Truth.met => Truth.notMet,
        Truth.notMet => Truth.met,
        Truth.unknown => Truth.unknown,
      }, r.missing);
    case AgeUnder(:final age):
      if (facts.dateOfBirth == null) return const CondResult(Truth.unknown, ['dateOfBirth']);
      final a = ageOn(facts.dateOfBirth!, facts.assessmentDate ?? todayIso());
      return CondResult(a < age ? Truth.met : Truth.notMet, const [], 'Age $a at assessment date');
    case PointsAtLeast(:final points, :final nomination):
      final p = calculatePoints(facts, nomination: nomination);
      if (p.min >= points) return CondResult(Truth.met, const [], '${p.min} points');
      if (p.max < points) return CondResult(Truth.notMet, const [], 'At most ${p.max} points (needs $points)');
      return CondResult(Truth.unknown, _uniq(p.factors.expand((f) => f.missing)), 'Between ${p.min} and ${p.max} points');
    case Fact(:final fact, :final op, :final value):
      final v = facts[fact];
      if (v == null) return CondResult(Truth.unknown, [fact]);
      CondResult ok(bool b) => CondResult(b ? Truth.met : Truth.notMet);
      return switch (op) {
        'isTrue' => ok(v == true),
        'isFalse' => ok(v == false),
        'eq' => ok(v == value),
        'neq' => ok(v != value),
        'gte' => ok((v as num) >= (value as num)),
        'gt' => ok((v as num) > (value as num)),
        'lte' => ok((v as num) <= (value as num)),
        'lt' => ok((v as num) < (value as num)),
        'in' => ok((value as List).contains(v)),
        'includesAny' => ok(v is List && v.any((x) => (value as List).contains(x))),
        _ => throw ArgumentError('unknown op $op'),
      };
  }
}
