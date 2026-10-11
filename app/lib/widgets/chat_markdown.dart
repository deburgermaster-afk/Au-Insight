import 'dart:math' as math;

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:gpt_markdown/gpt_markdown.dart';

/// Markdown for a chat reply, smooth while it streams.
///
/// Streamed text arrives in network-sized bursts; showing each burst as it lands makes the reply
/// jump. This reveals the text a few characters per frame instead, speeding up when it falls
/// behind, so it reads like typing. And it renders the reply as separate blocks (split at blank
/// lines outside code fences): finished blocks keep their widgets, so each frame re-parses only
/// the block still being written rather than the whole reply.
class ChatMarkdown extends StatefulWidget {
  const ChatMarkdown({
    super.key,
    required this.text,
    required this.streaming,
    required this.style,
    this.clean,
    this.onLinkTap,
    this.onGrow,
  });

  /// The full text received so far (read again every frame while revealing).
  final String Function() text;

  /// True while more text may arrive. A reply first shown with streaming false appears at once.
  final bool streaming;
  final TextStyle style;

  /// Applied to each block before rendering (e.g. dropping internal ids).
  final String Function(String)? clean;
  final void Function(String url, String title)? onLinkTap;

  /// Called after more text was revealed (to keep the newest line in view).
  final VoidCallback? onGrow;

  @override
  State<ChatMarkdown> createState() => _ChatMarkdownState();
}

class _ChatMarkdownState extends State<ChatMarkdown> with SingleTickerProviderStateMixin {
  late final Ticker _ticker = createTicker(_tick);
  late int _shown;
  Duration _last = Duration.zero;

  /// Rendered blocks by position: reused while their text is unchanged.
  final List<(String, Widget)> _cache = [];

  @override
  void initState() {
    super.initState();
    _shown = widget.streaming ? 0 : widget.text().length;
    _maybeStart();
  }

  @override
  void didUpdateWidget(ChatMarkdown old) {
    super.didUpdateWidget(old);
    _maybeStart();
  }

  void _maybeStart() {
    if (_shown < widget.text().length && !_ticker.isActive) {
      _last = Duration.zero;
      _ticker.start();
    }
  }

  void _tick(Duration elapsed) {
    final text = widget.text();
    final behind = text.length - _shown;
    if (behind <= 0) {
      // Caught up: the next rebuild with more text starts it again.
      _ticker.stop();
      return;
    }
    // About 90 characters a second at a steady trickle; a backlog is cleared within ~300 ms.
    final int dt = _last == Duration.zero ? 16 : math.max(1, (elapsed - _last).inMilliseconds);
    _last = elapsed;
    final int step = math.max(math.max(1, (dt * 0.09).round()), (behind * dt / 300).ceil());
    var next = _shown + step;
    if (next > text.length) next = text.length;
    // Never split a surrogate pair (emoji).
    if (next < text.length && next > 0 && _isHighSurrogate(text.codeUnitAt(next - 1))) next++;
    setState(() => _shown = next);
    widget.onGrow?.call();
  }

  static bool _isHighSurrogate(int c) => c >= 0xD800 && c <= 0xDBFF;

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final full = widget.text();
    if (!_ticker.isActive && !widget.streaming) _shown = full.length;
    final visible = full.substring(0, math.min(_shown, full.length));
    final blocks = markdownBlocks(visible);
    final children = <Widget>[];
    for (var i = 0; i < blocks.length; i++) {
      final b = blocks[i];
      Widget w;
      if (i < _cache.length && _cache[i].$1 == b) {
        w = _cache[i].$2;
      } else {
        w = GptMarkdown(widget.clean?.call(b) ?? b, style: widget.style, onLinkTap: widget.onLinkTap);
        if (i < _cache.length) {
          _cache[i] = (b, w);
        } else {
          _cache.add((b, w));
        }
      }
      if (i > 0) children.add(const SizedBox(height: 8));
      children.add(w);
    }
    if (_cache.length > blocks.length) _cache.removeRange(blocks.length, _cache.length);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }
}

final _listItem = RegExp(r'^\s*(?:[-*+]|\d+[.)])\s');

/// Splits markdown into blocks at blank lines, keeping code fences, and list items separated by
/// blank lines, in one block (so numbering and indentation survive).
List<String> markdownBlocks(String text) {
  final blocks = <String>[];
  final current = <String>[];
  var fenced = false;
  void flush() {
    if (current.isEmpty) return;
    final block = current.join('\n');
    current.clear();
    if (block.trim().isEmpty) return;
    final firstLine = block.split('\n').firstWhere((l) => l.trim().isNotEmpty, orElse: () => '');
    if (blocks.isNotEmpty && _listItem.hasMatch(firstLine) && _endsWithListItem(blocks.last)) {
      blocks[blocks.length - 1] = '${blocks.last}\n\n$block';
    } else {
      blocks.add(block);
    }
  }

  for (final line in text.split('\n')) {
    if (line.trimLeft().startsWith('```')) fenced = !fenced;
    if (!fenced && line.trim().isEmpty) {
      flush();
    } else {
      current.add(line);
    }
  }
  flush();
  return blocks;
}

bool _endsWithListItem(String block) {
  final lines = block.split('\n').where((l) => l.trim().isNotEmpty).toList();
  // The last list item may continue on indented lines.
  for (final l in lines.reversed) {
    if (_listItem.hasMatch(l)) return true;
    if (!l.startsWith(' ') && !l.startsWith('\t')) return false;
  }
  return false;
}
