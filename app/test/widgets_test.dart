// Uses package:web (the people store and the round screen): run with --platform chrome.
@TestOn('browser')
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immi_insight/data/people.dart';
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
          Padding(padding: const EdgeInsets.all(16), child: child),
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
}
