import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:immi_insight/data/occupations.dart';

void main() {
  // A real occupation_eoi response (Software Engineer, 261313).
  final pool = parseEoiPool(jsonDecode(File('test/fixtures/eoi_261313.json').readAsStringSync()), 'subclasses')!;

  test('reads every visa stream, in a fixed order', () {
    expect(pool.streams.map((s) => s.code).toList(), ['189PTS', '190SAS', '491SNR', '491FSR']);
    expect(pool.streams.first.short, '189');
    expect(pool.asAt, DateTime(2026, 9, 30));
  });

  test('points rows are sorted and "<20" stays hidden, not zero', () {
    final s = pool.streams.first;
    final pts = s.byPoints.map((r) => r.points).toList();
    expect(pts, [...pts]..sort());
    final hidden = s.byPoints.expand((r) => r.counts.values).where((c) => c.hidden);
    expect(hidden, isNotEmpty);
    expect(hidden.every((c) => c.text == '<20' && c.floor == 0), isTrue);
  });

  test('waiting above and at a score add up to the waiting total', () {
    final s = pool.streams.first;
    final (above, _) = s.waitingAbove(60);
    final (at, _) = s.waitingAt(60);
    final below = s.byPoints.where((r) => r.points < 60).fold<int>(0, (a, r) => a + r['SUBMITTED'].floor);
    expect(above + at + below, s.byPoints.fold<int>(0, (a, r) => a + r['SUBMITTED'].floor));
    expect(above, greaterThan(0));
  });

  test('months are oldest first', () {
    final m = pool.streams.first.byMonth;
    expect(m.length, greaterThan(12));
    expect(m.first.asAt.isBefore(m.last.asAt), isTrue);
  });

  test('formats thousands', () {
    expect(formatThousands(9596), '9,596');
    expect(formatThousands(410226), '410,226');
    expect(formatThousands(12), '12');
  });
}
