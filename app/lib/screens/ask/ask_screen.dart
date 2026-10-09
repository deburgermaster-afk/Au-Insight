import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:gpt_markdown/gpt_markdown.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/chat.dart';
import '../../data/quick_actions.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../../widgets/decision_card.dart';
import '../shell.dart';

const _suggestions = [
  "Am I eligible for a 189? I'm 34, Superior English, 8 years as a software engineer overseas.",
  'What changes if I get a state nomination for the 190?',
  'Which documents prove skilled employment?',
  'How long is the 189 taking right now?',
];

/// First message for someone who hasn't told their story yet. It's part of the chat history,
/// so the agent knows it asked.
const _welcome =
    "Hi, I'm Immi Insight. To answer for **your** situation, I'd like to know your story first.\n\n"
    'Tell me everything that has happened since you first came to Australia (or started planning to): '
    "when you arrived, every visa you've held or applied for, study, work, family, any refusals, "
    'your current visa and when it ends, and what you want next. Write it however it comes. '
    "I'll keep it in your case file.\n\n"
    "After that I'll ask you to upload your documents so I can read them. "
    'Or skip all this and just ask me anything.';

class AskScreen extends StatefulWidget {
  const AskScreen({super.key});
  @override
  State<AskScreen> createState() => _AskScreenState();
}

class _AskScreenState extends State<AskScreen> {
  final _sb = Supabase.instance.client;
  final _client = ChatClient();
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  final List<ChatMessage> _messages = [];
  String? _chatId;
  StreamSubscription<Map<String, dynamic>>? _sub;
  bool get _busy => _sub != null;

  @override
  void initState() {
    super.initState();
    _load();
    quickActions.addListener(_onQuickAction);
  }

  void _onQuickAction() {
    if (quickActions.value?.action == QuickAction.newChat) _newChat();
  }

  @override
  void dispose() {
    quickActions.removeListener(_onQuickAction);
    _sub?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final row = await _sb.from('chats').select('id, messages').order('updated_at', ascending: false).limit(1).maybeSingle();
    if (!mounted) return;
    if (row != null) {
      final saved = row['messages'] as List? ?? const [];
      final firstTime = saved.isEmpty && await _isFirstTime();
      if (!mounted) return;
      setState(() {
        _chatId = row['id'] as String;
        _messages
          ..clear()
          ..addAll([for (final m in saved) ChatMessage.fromJson((m as Map).cast())]);
        if (firstTime) _messages.add(ChatMessage(role: 'assistant', text: _welcome));
      });
      _toBottom(jump: true);
    } else {
      await _newChat();
    }
  }

  Future<void> _newChat() async {
    _sub?.cancel();
    final row = await _sb.from('chats').insert({}).select('id').single();
    final firstTime = await _isFirstTime();
    if (!mounted) return;
    setState(() {
      _sub = null;
      _chatId = row['id'] as String;
      _messages.clear();
      if (firstTime) _messages.add(ChatMessage(role: 'assistant', text: _welcome));
    });
  }

  /// No story in the case file yet.
  Future<bool> _isFirstTime() async {
    try {
      final c = await _sb.from('cases').select('story').order('created_at').limit(1).maybeSingle();
      return ((c?['story'] as String?) ?? '').trim().isEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<void> _save() async {
    if (_chatId == null) return;
    final title = _messages
        .firstWhere(
          (m) => m.role == 'user',
          orElse: () => ChatMessage(role: 'user', text: 'New chat'),
        )
        .text;
    await _sb
        .from('chats')
        .update({
          'messages': [for (final m in _messages) m.toJson()],
          'title': title.length > 60 ? '${title.substring(0, 60)}…' : title,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', _chatId!);
  }

  void _toBottom({bool jump = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final end = _scroll.position.maxScrollExtent;
      jump ? _scroll.jumpTo(end) : _scroll.animateTo(end, duration: Motion.medium, curve: Motion.ease);
    });
  }

  void _send(String text) {
    text = text.trim();
    if (text.isEmpty || _busy) return;
    HapticFeedback.lightImpact();
    final reply = ChatMessage(role: 'assistant');
    setState(() {
      _messages.add(ChatMessage(role: 'user', text: text));
      _messages.add(reply);
      _input.clear();
    });
    _toBottom();

    final history = _messages.sublist(0, _messages.length - 1);
    _sub = _client
        .send(history)
        .listen(
          (e) {
            setState(() {
              switch (e['type']) {
                case 'text':
                  reply.text += e['delta'] as String;
                case 'reasoning':
                  reply.reasoning += e['delta'] as String;
                case 'step':
                  final existing = reply.steps.where((s) => s.id == e['id']).firstOrNull;
                  final hits = [for (final h in (e['hits'] as List? ?? const [])) ((h['n'] as num).toInt(), h['label'] as String)];
                  if (existing == null) {
                    reply.steps.add(
                      ChatStep(
                        id: e['id'] as String,
                        tool: e['tool'] as String,
                        label: e['label'] as String,
                        done: e['status'] == 'done',
                        hits: hits,
                      ),
                    );
                  } else {
                    existing.done = e['status'] == 'done';
                    if (hits.isNotEmpty) existing.hits = hits;
                  }
                case 'source':
                  reply.sources.add(
                    SourceRef((e['n'] as num).toInt(), e['title'] as String, e['section'] as String? ?? '', e['url'] as String),
                  );
                case 'decision':
                  reply.decisions = [for (final d in e['results'] as List) (d as Map).cast<String, dynamic>()];
                case 'action':
                  if (!reply.actions.contains(e['action'])) reply.actions.add(e['action'] as String);
                case 'error':
                  reply.error = e['message'] as String;
              }
            });
            _toBottom();
          },
          onError: (Object err) => setState(() {
            reply.error = err.toString();
            _sub = null;
          }),
          onDone: () {
            setState(() => _sub = null);
            _save();
          },
          cancelOnError: true,
        );
  }

  void _stop() {
    _sub?.cancel();
    setState(() => _sub = null);
    _save();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: CustomScrollView(
                controller: _scroll,
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    sliver: SliverToBoxAdapter(
                      child: PageHeader(
                        title: 'Ask',
                        subtitle: 'Answers from the law itself, with sources',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Pressable(
                              onTap: _newChat,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(16)),
                                child: const Row(
                                  children: [
                                    Icon(LucideIcons.plus, size: 12, color: AppColors.fg),
                                    SizedBox(width: 4),
                                    Text('New', style: TextStyle(fontSize: 11.5, color: AppColors.fg)),
                                  ],
                                ),
                              ),
                            ),
                            if (MediaQuery.sizeOf(context).width < 860) ...[const SizedBox(width: 6), const SignOutButton()],
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (_messages.isEmpty)
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      sliver: SliverToBoxAdapter(child: _empty()),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      sliver: SliverList.separated(
                        itemCount: _messages.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 14),
                        itemBuilder: (context, i) {
                          final m = _messages[i];
                          final streaming = _busy && i == _messages.length - 1;
                          final child = m.role == 'user' ? _UserBubble(m.text) : _AssistantTurn(m, streaming: streaming);
                          return child
                              .animate(key: ValueKey('msg-$i'))
                              .fadeIn(duration: Motion.medium, curve: Motion.ease)
                              .slideY(begin: 0.08, end: 0, duration: Motion.slow, curve: Motion.ease);
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        _Composer(controller: _input, focus: _focus, busy: _busy, onSend: _send, onStop: _stop),
      ],
    );
  }

  Widget _empty() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(height: MediaQuery.sizeOf(context).height * 0.08),
        Text.rich(
          TextSpan(
            children: [
              const TextSpan(text: 'Ask about any visa.\n', style: AppText.display),
              TextSpan(
                text: 'Get the decision.',
                style: AppText.serif(AppText.display.copyWith(fontSize: 30, color: AppColors.muted)),
              ),
            ],
          ),
        ).enter(0),
        const SizedBox(height: 22),
        for (final (i, s) in _suggestions.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 7),
            child: Pressable(
              onTap: () => _send(s),
              child: Panel(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    Expanded(child: Text(s, style: AppText.small.copyWith(fontSize: 12))),
                    const Icon(LucideIcons.arrowUpRight, size: 13, color: AppColors.faint),
                  ],
                ),
              ),
            ),
          ).enter(i + 1),
      ],
    );
  }
}

class _UserBubble extends StatelessWidget {
  const _UserBubble(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerRight,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 520),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(16)),
        child: SelectableText(text, style: AppText.body),
      ),
    ),
  );
}

class _AssistantTurn extends StatelessWidget {
  const _AssistantTurn(this.m, {required this.streaming});
  final ChatMessage m;
  final bool streaming;

  @override
  Widget build(BuildContext context) {
    final waiting = streaming && m.text.isEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (m.reasoning.isNotEmpty) _Reasoning(m.reasoning, streaming: waiting),
        if (m.steps.isNotEmpty) _Steps(m.steps, working: waiting),
        if (waiting && m.steps.isEmpty) const Padding(padding: EdgeInsets.only(bottom: 6), child: ShimmerText('Reading the law…')),
        if (m.text.isNotEmpty)
          AnimatedSize(
            duration: Motion.fast,
            alignment: Alignment.topLeft,
            child: GptMarkdown(m.text, style: AppText.body, onLinkTap: (url, _) => launchUrl(Uri.parse(url))),
          ),
        if (m.error != null)
          Container(
            margin: const EdgeInsets.only(top: 6),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
            child: Text(m.error!, style: AppText.small.copyWith(color: AppColors.danger)),
          ),
        if (m.decisions.isNotEmpty) ...[
          const SizedBox(height: 10),
          for (final (i, d) in m.decisions.take(3).indexed)
            Padding(padding: const EdgeInsets.only(bottom: 8), child: DecisionCard(assessmentFromJson(d)).enter(i)),
        ],
        if (m.sources.isNotEmpty) _Sources(m.sources),
        if (m.actions.isNotEmpty && !streaming)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final (i, a) in m.actions.indexed)
                  _ActionChip(
                    primary: i == 0,
                    icon: a == 'upload_documents' ? LucideIcons.upload : LucideIcons.folderOpen,
                    label: a == 'upload_documents' ? 'Upload documents' : 'Open case file',
                    onTap: () => runQuickAction(
                      StatefulNavigationShell.of(context).goBranch,
                      a == 'upload_documents' ? QuickAction.upload : QuickAction.caseFile,
                    ),
                  ).enter(i),
              ],
            ),
          ),
      ],
    );
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({required this.icon, required this.label, required this.onTap, this.primary = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final fg = primary ? AppColors.bg : AppColors.fg;
    return Pressable(
      onTap: onTap,
      child: Container(
        height: 34,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(color: primary ? AppColors.fg : AppColors.raised, borderRadius: BorderRadius.circular(17)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppText.small.copyWith(color: fg, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _Reasoning extends StatefulWidget {
  const _Reasoning(this.text, {required this.streaming});
  final String text;
  final bool streaming;
  @override
  State<_Reasoning> createState() => _ReasoningState();
}

class _ReasoningState extends State<_Reasoning> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Pressable(
            onTap: () => setState(() => _open = !_open),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.brain, size: 13, color: AppColors.muted),
                const SizedBox(width: 6),
                widget.streaming ? const ShimmerText('Thinking…') : const Text('Reasoning', style: AppText.small),
                AnimatedRotation(
                  turns: _open ? 0.5 : 0,
                  duration: Motion.medium,
                  child: const Icon(LucideIcons.chevronDown, size: 13, color: AppColors.muted),
                ),
              ],
            ),
          ),
          AnimatedSize(
            duration: Motion.medium,
            curve: Motion.ease,
            child: _open
                ? Container(
                    margin: const EdgeInsets.only(top: 6, left: 6),
                    padding: const EdgeInsets.only(left: 10),
                    decoration: const BoxDecoration(
                      border: Border(left: BorderSide(color: AppColors.border, width: 2)),
                    ),
                    child: Text(widget.text, style: AppText.small),
                  )
                : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }
}

class _Steps extends StatefulWidget {
  const _Steps(this.steps, {required this.working});
  final List<ChatStep> steps;
  final bool working;
  @override
  State<_Steps> createState() => _StepsState();
}

class _StepsState extends State<_Steps> {
  bool? _open;

  @override
  Widget build(BuildContext context) {
    final open = _open ?? widget.working; // open while working, collapses when the answer starts
    final icons = {
      'search_law': LucideIcons.bookOpen,
      'get_case_file': LucideIcons.folderOpen,
      'list_documents': LucideIcons.fileSearch,
      'assess_visas': LucideIcons.scale,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Pressable(
            onTap: () => setState(() => _open = !open),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.listChecks, size: 13, color: AppColors.muted),
                const SizedBox(width: 6),
                widget.working
                    ? const ShimmerText('Working through the law…')
                    : Text('Checked ${widget.steps.length} step${widget.steps.length == 1 ? '' : 's'}', style: AppText.small),
                AnimatedRotation(
                  turns: open ? 0.5 : 0,
                  duration: Motion.medium,
                  child: const Icon(LucideIcons.chevronDown, size: 13, color: AppColors.muted),
                ),
              ],
            ),
          ),
          AnimatedSize(
            duration: Motion.medium,
            curve: Motion.ease,
            alignment: Alignment.topLeft,
            child: !open
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(top: 8, left: 2),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final (i, s) in widget.steps.indexed)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                AnimatedSwitcher(
                                  duration: Motion.medium,
                                  child: s.done
                                      ? Icon(
                                          icons[s.tool] ?? LucideIcons.dot,
                                          key: const ValueKey('done'),
                                          size: 13,
                                          color: AppColors.muted,
                                        )
                                      : const SizedBox(
                                          key: ValueKey('busy'),
                                          width: 13,
                                          height: 13,
                                          child: CircularProgressIndicator(strokeWidth: 1.5, color: AppColors.fg),
                                        ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(s.label, style: AppText.small.copyWith(color: s.done ? AppColors.muted : AppColors.fg)),
                                      if (s.hits.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Wrap(
                                          spacing: 4,
                                          runSpacing: 4,
                                          children: [
                                            for (final h in s.hits.take(4))
                                              Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                    decoration: BoxDecoration(
                                                      color: AppColors.raised,
                                                      borderRadius: BorderRadius.circular(6),
                                                    ),
                                                    child: Text(
                                                      '[${h.$1}] ${h.$2}',
                                                      style: AppText.tiny,
                                                      maxLines: 1,
                                                      overflow: TextOverflow.ellipsis,
                                                    ),
                                                  )
                                                  .animate()
                                                  .fadeIn(duration: Motion.medium)
                                                  .scale(begin: const Offset(0.9, 0.9), curve: Motion.ease),
                                          ],
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ).enter(i, dy: 0.2),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _Sources extends StatefulWidget {
  const _Sources(this.sources);
  final List<SourceRef> sources;
  @override
  State<_Sources> createState() => _SourcesState();
}

class _SourcesState extends State<_Sources> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Pressable(
            onTap: () => setState(() => _open = !_open),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.bookMarked, size: 13, color: AppColors.muted),
                const SizedBox(width: 6),
                Text('Used ${widget.sources.length} source${widget.sources.length == 1 ? '' : 's'}', style: AppText.small),
                AnimatedRotation(
                  turns: _open ? 0.5 : 0,
                  duration: Motion.medium,
                  child: const Icon(LucideIcons.chevronDown, size: 13, color: AppColors.muted),
                ),
              ],
            ),
          ),
          AnimatedSize(
            duration: Motion.medium,
            curve: Motion.ease,
            alignment: Alignment.topLeft,
            child: !_open
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Column(
                      children: [
                        for (final (i, s) in widget.sources.indexed)
                          Pressable(
                            onTap: () => launchUrl(Uri.parse(s.url)),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 5),
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                              decoration: BoxDecoration(
                                color: AppColors.surface,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Row(
                                children: [
                                  Text(
                                    '${s.n}',
                                    style: AppText.tiny.copyWith(color: AppColors.fg, fontWeight: FontWeight.w600),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          s.title,
                                          style: AppText.small.copyWith(color: AppColors.fg),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        if (s.section.isNotEmpty)
                                          Text(s.section, style: AppText.tiny, maxLines: 1, overflow: TextOverflow.ellipsis),
                                      ],
                                    ),
                                  ),
                                  const Icon(LucideIcons.externalLink, size: 11, color: AppColors.faint),
                                ],
                              ),
                            ),
                          ).enter(i),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.focus, required this.busy, required this.onSend, required this.onStop});
  final TextEditingController controller;
  final FocusNode focus;
  final bool busy;
  final ValueChanged<String> onSend;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 860;
    return Padding(
      // leave room for the floating tab bar on phones
      padding: EdgeInsets.fromLTRB(12, 6, 12, narrow ? 84 : 14),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 4, 5, 4),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: AppColors.border),
              boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 24, offset: Offset(0, 8))],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: CallbackShortcuts(
                    bindings: {const SingleActivator(LogicalKeyboardKey.enter): () => onSend(controller.text)},
                    child: TextField(
                      controller: controller,
                      focusNode: focus,
                      minLines: 1,
                      maxLines: 6,
                      style: AppText.body,
                      cursorColor: AppColors.fg,
                      cursorWidth: 1.5,
                      decoration: const InputDecoration(
                        isDense: true,
                        border: InputBorder.none,
                        hintText: 'Describe your situation or ask a question…',
                        hintStyle: AppText.small,
                        contentPadding: EdgeInsets.symmetric(vertical: 10),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                ListenableBuilder(
                  listenable: controller,
                  builder: (context, _) {
                    final canSend = controller.text.trim().isNotEmpty;
                    return Pressable(
                      scale: 0.88,
                      onTap: busy ? onStop : (canSend ? () => onSend(controller.text) : null),
                      child: AnimatedContainer(
                        duration: Motion.medium,
                        curve: Motion.ease,
                        width: 32,
                        height: 32,
                        margin: const EdgeInsets.only(bottom: 2),
                        decoration: BoxDecoration(color: busy || canSend ? AppColors.fg : AppColors.raised, shape: BoxShape.circle),
                        child: AnimatedSwitcher(
                          duration: Motion.fast,
                          transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                          child: Icon(
                            busy ? LucideIcons.square : LucideIcons.arrowUp,
                            key: ValueKey(busy),
                            size: busy ? 11 : 15,
                            color: busy || canSend ? AppColors.bg : AppColors.muted,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
