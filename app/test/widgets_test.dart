// Uses package:web (the people store and the round screen): run with --platform chrome.
@TestOn('browser')
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immi_insight/data/occupations.dart';
import 'package:immi_insight/data/people.dart';
import 'package:immi_insight/screens/occupations/eoi_card.dart';
import 'package:immi_insight/screens/occupations/round_screen.dart';
import 'package:immi_insight/widgets/chat_markdown.dart';
import 'package:immi_insight/widgets/people.dart';

Widget _phone(Widget child) => MaterialApp(
  home: MediaQuery(
    data: const MediaQueryData(size: Size(375, 812)),
    child: Scaffold(
      body: Column(
        children: [
          const TopBar(),
          Expanded(child: Padding(padding: const EdgeInsets.all(16), child: child)),
        ],
      ),
    ),
  ),
);

void main() {
  setUp(() {
    people
      ..enabled = true
      ..all = [
        Person.fromJson({'id': 'a', 'name': 'Me', 'documents': 3}),
        Person.fromJson({'id': 'b', 'name': 'Priya Shah With A Very Long Family Name', 'relation': 'Partner'}),
        Person.fromJson({'id': 'c', 'name': 'Arjun', 'relation': 'Child'}),
      ]
      ..activeId = 'b';
  });

  testWidgets('header and people strip fit a phone', (tester) async {
    tester.view.physicalSize = const Size(375 * 3, 812 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_phone(const PeopleStrip(caption: 'Showing Priya\'s documents.')));
    expect(find.text('Immi Insight'), findsOneWidget);
    expect(find.text('PN'), findsWidgets); // initials of the open person
    expect(find.text('Add person'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('chip is hidden until people are available', (tester) async {
    people.enabled = false;
    await tester.pumpWidget(_phone(const SizedBox()));
    expect(find.byType(PersonAvatar), findsNothing);
  });

  testWidgets('chat markdown reveals streamed text, then all of it', (tester) async {
    var text = 'First paragraph.\n\nSecond';
    var streaming = true;
    late StateSetter set;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, s) {
              set = s;
              return ChatMarkdown(text: () => text, streaming: streaming, style: const TextStyle(fontSize: 13));
            },
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.textContaining('Second', findRichText: true), findsOneWidget);
    set(() {
      text = '$text paragraph, finished.';
      streaming = false;
    });
    await tester.pumpAndSettle();
    expect(find.textContaining('finished.', findRichText: true), findsOneWidget);
  });

  testWidgets('cut-off histogram fits a phone', (tester) async {
    await tester.pumpWidget(_phone(const CutoffHistogram(histogram: {65: 12, 70: 3, 80: 20, 95: 1, 110: 2}, points: 80)));
    expect(find.text('OCCUPATIONS BY CUT-OFF'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('EOI card fits a phone and switches streams', (tester) async {
    tester.view.physicalSize = const Size(375 * 3, 812 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final pool = parseEoiPool({
      'as_at': '2026-09-30',
      'subclasses': [
        for (final code in ['189PTS', '190SAS', '491SNR'])
          {
            'subclass': code,
            'visa_type': code,
            'by_status': {'SUBMITTED': 9596, 'INVITED': '<20', 'LODGED': 146},
            'by_points': [
              for (var p = 45; p <= 120; p += 5) {'points': '$p', 'SUBMITTED': p == 110 ? '<20' : p * 13},
            ],
            'by_month': [
              for (var m = 1; m <= 12; m++) {'as_at': '2026-${m.toString().padLeft(2, '0')}-28', 'SUBMITTED': 8000 + m * 100, 'INVITED': m == 3 ? 31 : '<20'},
            ],
          },
      ],
    }, 'subclasses')!;
    await tester.pumpWidget(_phone(SingleChildScrollView(child: EoiPoolCard(pool: pool))));
    expect(find.text('9,596'), findsOneWidget);
    await tester.tap(find.text('190'));
    await tester.pump();
    expect(find.textContaining('waiting with more points than', findRichText: true), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
