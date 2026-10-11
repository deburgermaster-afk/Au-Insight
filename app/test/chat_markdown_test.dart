import 'package:flutter_test/flutter_test.dart';
import 'package:immi_insight/widgets/chat_markdown.dart';

void main() {
  test('splits paragraphs at blank lines', () {
    expect(markdownBlocks('One.\n\nTwo\nstill two.\n\n\nThree.'), ['One.', 'Two\nstill two.', 'Three.']);
  });

  test('keeps a code fence with blank lines in one block', () {
    const text = 'Intro.\n\n```\na\n\nb\n```\n\nAfter.';
    expect(markdownBlocks(text), ['Intro.', '```\na\n\nb\n```', 'After.']);
  });

  test('keeps a loose list together', () {
    const text = '1. First\n\n2. Second\n   more\n\n- x\n\nDone.';
    expect(markdownBlocks(text), ['1. First\n\n2. Second\n   more\n\n- x', 'Done.']);
  });

  test('an unfinished reply still splits cleanly', () {
    expect(markdownBlocks('Hello\n\nWor'), ['Hello', 'Wor']);
    expect(markdownBlocks(''), isEmpty);
  });
}
