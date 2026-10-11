import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/chat.dart';
import '../../data/file_input.dart';
import '../../data/uploads.dart';
import '../../data/people.dart';
import '../../data/quick_actions.dart';
import '../../data/study_models.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../../widgets/course_card.dart';
import '../../widgets/decision_card.dart';
import '../../widgets/chat_markdown.dart';
import '../auth/auth_screens.dart' show toast;
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
    "Hi, I'm Immi Insight. I'll get to know your situation step by step, then my team of four analysts "
    'builds you a plan from the law itself, saved under **Cases**.\n\n'
    "Let's start at the beginning: **when did you first come to Australia, and on which visa?** "
    "If you came to study, tell me the provider and course too.\n\n"
    'Or skip this and ask me anything.';

class AskScreen extends StatefulWidget {
  const AskScreen({super.key});
  @override
  State<AskScreen> createState() => _AskScreenState();
}

class _AskScreenState extends State<AskScreen> with PersonAware {
  /// Another person was opened: stop any reply and open their latest chat.
  @override
  void onPersonChanged() {
    _sub?.cancel();
    _sub = null;
    _load();
  }

  final _sb = Supabase.instance.client;
  final _client = ChatClient();
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  final List<ChatMessage> _messages = [];
  String? _chatId;
  StreamSubscription<Map<String, dynamic>>? _sub;
  bool get _busy => _sub != null;

  /// Bumped when the streaming reply changed; only that reply listens, so the rest of the chat
  /// doesn't rebuild while it streams. Events are applied at most every [_flushEvery].
  final _live = ValueNotifier<int>(0);
  final _idle = ValueNotifier<int>(0);
  static const _flushEvery = Duration(milliseconds: 90);
  Timer? _flushTimer;

  /// Messages from this index on fade in; earlier ones (loaded from history) just appear.
  int _animateFrom = 1 << 30;

  /// Whether the user is at (or near) the newest message; the chat only follows new text then.
  bool _atBottom = true;
  final _showJump = ValueNotifier<bool>(false);

  /// Files attached to the message being written: uploading, ready or failed.
  final _attachments = ValueNotifier<List<_Attachment>>(const []);

  /// A message another screen asked to send before this chat finished loading.
  String? _pendingPrompt;
  String? _lastSent;
  DateTime _lastSentAt = DateTime(2000);

  @override
  void initState() {
    super.initState();
    _load();
    quickActions.addListener(_onQuickAction);
    openChat.addListener(_onOpenChat);
    chatPrompt.addListener(_onChatPrompt);
    _scroll.addListener(_onScroll);
    // A prompt may have been set before this screen existed.
    WidgetsBinding.instance.addPostFrameCallback((_) => _onChatPrompt());
  }

  void _onChatPrompt() {
    final prompt = chatPrompt.value;
    if (prompt == null || !mounted) return;
    chatPrompt.value = null;
    if (_chatId == null) {
      _pendingPrompt = prompt;
    } else {
      _send(prompt);
    }
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final p = _scroll.position;
    _atBottom = p.maxScrollExtent - p.pixels < 120;
    final show = !_atBottom && _messages.isNotEmpty;
    if (_showJump.value != show) _showJump.value = show;
  }

  /// Keeps the newest message in view, without animating, if the user hasn't scrolled away.
  void _follow({bool force = false}) {
    if (!force && !_atBottom) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
      _atBottom = true;
    });
  }

  void _scheduleFlush() {
    if (_flushTimer != null) return;
    _flushTimer = Timer(_flushEvery, () {
      _flushTimer = null;
      if (!mounted) return;
      _live.value++;
      _follow();
    });
  }

  void _onQuickAction() {
    if (quickActions.value?.action == QuickAction.newChat) _newChat();
  }

  void _onOpenChat() {
    final id = openChat.value;
    if (id == null) return;
    openChat.value = null;
    _load(id: id);
  }

  @override
  void dispose() {
    quickActions.removeListener(_onQuickAction);
    openChat.removeListener(_onOpenChat);
    chatPrompt.removeListener(_onChatPrompt);
    _sub?.cancel();
    _flushTimer?.cancel();
    _live.dispose();
    _idle.dispose();
    _attachments.dispose();
    _showJump.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Opens chat [id], or the most recent one.
  Future<void> _load({String? id}) async {
    if (id != null) _sub?.cancel();
    await people.ready();
    if (!mounted) return;
    final query = _sb.from('chats').select('id, messages');
    final row = await (id != null ? query.eq('id', id) : query.order('updated_at', ascending: false).limit(1)).maybeSingle();
    if (!mounted) return;
    if (row != null) {
      final saved = row['messages'] as List? ?? const [];
      final firstTime = saved.isEmpty && await _isFirstTime();
      if (!mounted) return;
      setState(() {
        _sub = null;
        _chatId = row['id'] as String;
        _messages
          ..clear()
          ..addAll([for (final m in saved) ChatMessage.fromJson((m as Map).cast())]);
        if (firstTime) _messages.add(ChatMessage(role: 'assistant', text: _welcome));
        _animateFrom = _messages.length;
      });
      _settleAtBottom();
      _sendPending();
    } else {
      await _newChat();
    }
  }

  void _sendPending() {
    final p = _pendingPrompt;
    if (p == null) return;
    _pendingPrompt = null;
    _send(p);
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
      _animateFrom = _messages.length;
    });
    _sendPending();
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
    final first = _messages.firstWhere(
      (m) => m.role == 'user',
      orElse: () => ChatMessage(role: 'user', text: 'New chat'),
    );
    final title = first.text.trim().isEmpty && first.attachments.isNotEmpty ? first.attachments.join(', ') : first.text;
    await _sb
        .from('chats')
        .update({
          'messages': [for (final m in _messages) m.toJson()],
          'title': title.length > 60 ? '${title.substring(0, 60)}…' : title,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', _chatId!);
  }

  /// Opens a chat at its newest message. The list builds lazily, so its height keeps growing for
  /// a few frames after the first jump: keep jumping until it stops growing.
  Future<void> _settleAtBottom() async {
    var last = -1.0;
    var stable = 0;
    for (var i = 0; i < 40 && stable < 3 && mounted; i++) {
      await WidgetsBinding.instance.endOfFrame;
      if (!_scroll.hasClients) continue;
      final end = _scroll.position.maxScrollExtent;
      _scroll.jumpTo(end);
      stable = end == last ? stable + 1 : 0;
      last = end;
    }
  }

  /// Opens the file picker (straight from the tap: browsers only allow it there), then uploads the
  /// picks to the open person's Documents while they finish typing.
  void _attach() {
    pickFiles().then((files) async {
      if (files.isEmpty || !mounted) return;
      final picked = [for (final f in files) _Attachment(f.name)];
      _attachments.value = [..._attachments.value, ...picked];
      final landed = await uploads.upload(files, read: false);
      if (!mounted) return;
      final names = {for (final l in landed) l.$2};
      for (final a in picked) {
        a.state = names.contains(a.name) ? _AttachState.ready : _AttachState.failed;
      }
      _attachments.value = [..._attachments.value];
      if (uploads.errors.isNotEmpty) {
        toast(context, uploads.errors.join('\n'), error: true);
        uploads.errors.clear();
      }
    });
  }

  void _send(String text) {
    text = text.trim();
    final attached = [
      for (final a in _attachments.value)
        if (a.state == _AttachState.ready) a.name,
    ];
    if (text.isEmpty && attached.isEmpty) return;
    if (_attachments.value.any((a) => a.state == _AttachState.uploading)) {
      toast(context, 'Still uploading your files: send once they are ready.');
      return;
    }
    _attachments.value = const [];
    // The keyboard can report one press twice (a submit and a typed line break).
    final now = DateTime.now();
    if (text == _lastSent && now.difference(_lastSentAt) < const Duration(seconds: 1)) return;
    _lastSent = text;
    _lastSentAt = now;
    HapticFeedback.lightImpact();
    // A message sent mid-reply interrupts it; a reply stopped before any answer is dropped, so
    // the assistant sees both messages together and answers them in one go.
    if (_busy) {
      _sub?.cancel();
      _sub = null;
      final last = _messages.lastOrNull;
      if (last != null && last.role == 'assistant' && last.text.trim().isEmpty) _messages.removeLast();
    }
    final reply = ChatMessage(role: 'assistant');
    _flushTimer?.cancel();
    _flushTimer = null;
    setState(() {
      _animateFrom = _messages.length < _animateFrom ? _messages.length : _animateFrom;
      _messages.add(ChatMessage(role: 'user', text: text, attachments: attached));
      _messages.add(reply);
      _input.clear();
    });
    _follow(force: true);

    final history = [
      for (final m in _messages.sublist(0, _messages.length - 1))
        if (m.role == 'user' || m.text.trim().isNotEmpty) m,
    ];
    _sub = _client
        .send(history, chatId: _chatId)
        .listen(
          (e) {
            // Apply the event to the reply now; redraw it at most every _flushEvery.
            {
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
                case 'case':
                  reply.cases.add((e['id'] as String, e['title'] as String));
                  casesChanged.value++;
                case 'profile':
                  profileChanged.value++;
                case 'action':
                  if (!reply.actions.contains(e['action'])) reply.actions.add(e['action'] as String);
                case 'courses':
                  reply.courses = [for (final c in (e['items'] as List? ?? const [])) (c as Map).cast<String, dynamic>()];
                case 'error':
                  reply.error = e['message'] as String;
              }
            }
            _scheduleFlush();
          },
          onError: (Object err) {
            if (!mounted) return;
            setState(() {
              reply.error = err.toString();
              _sub = null;
            });
            _follow();
          },
          onDone: () {
            _flushTimer?.cancel();
            _flushTimer = null;
            if (!mounted) return;
            setState(() => _sub = null);
            _follow();
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
              child: Stack(
                children: [
                  Positioned.fill(
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
                                    onTap: () => context.push('/ask/history'),
                                    child: Container(
                                      width: 30,
                                      height: 30,
                                      decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(15)),
                                      child: const Icon(LucideIcons.history, size: 14, color: AppColors.fg),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
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
                                // Only the streaming reply listens to updates. Every reply has the same
                                // widget shape, so when the stream ends the reply keeps its state and
                                // finishes revealing its last words instead of jumping.
                                Widget child = m.role == 'user'
                                    ? _UserBubble(m.text, attachments: m.attachments)
                                    : ValueListenableBuilder<int>(
                                        valueListenable: streaming ? _live : _idle,
                                        builder: (context, _, _) => _AssistantTurn(m, streaming: streaming, onGrow: _follow),
                                      );
                                child = RepaintBoundary(child: child);
                                if (i < _animateFrom) return child;
                                return child.animate(key: ValueKey('msg-$i')).fadeIn(duration: Motion.medium, curve: Motion.ease);
                              },
                            ),
                          ),
                      ],
                    ),
                  ),
                  Positioned(
                    bottom: 8,
                    left: 0,
                    right: 0,
                    child: ValueListenableBuilder<bool>(
                      valueListenable: _showJump,
                      builder: (context, show, _) => IgnorePointer(
                        ignoring: !show,
                        child: AnimatedOpacity(
                          opacity: show ? 1 : 0,
                          duration: Motion.fast,
                          child: Center(
                            child: Pressable(
                              onTap: () => _follow(force: true),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                                decoration: BoxDecoration(
                                  color: AppColors.raised,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(color: AppColors.border),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(LucideIcons.arrowDown, size: 13, color: AppColors.fg),
                                    SizedBox(width: 5),
                                    Text('Jump to latest', style: TextStyle(fontSize: 11.5, color: AppColors.fg)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        _Composer(
          controller: _input,
          focus: _focus,
          busy: _busy,
          onSend: _send,
          onStop: _stop,
          attachments: _attachments,
          onAttach: _attach,
          onRemoveAttachment: (a) => _attachments.value = [..._attachments.value.where((x) => x != a)],
        ),
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
  const _UserBubble(this.text, {this.attachments = const []});
  final String text;
  final List<String> attachments;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerRight,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 520),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (attachments.isNotEmpty)
            Padding(
              padding: EdgeInsets.only(bottom: text.trim().isEmpty ? 0 : 6),
              child: Wrap(
                alignment: WrapAlignment.end,
                spacing: 6,
                runSpacing: 6,
                children: [for (final a in attachments) _FileChip(name: a)],
              ),
            ),
          if (text.trim().isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(16)),
              child: SelectableText(text, style: AppText.body),
            ),
        ],
      ),
    ),
  );
}

enum _AttachState { uploading, ready, failed }

class _Attachment {
  _Attachment(this.name);
  final String name;
  _AttachState state = _AttachState.uploading;
}

/// A file attached to a message: its name, with upload progress or a remove button in the composer.
class _FileChip extends StatelessWidget {
  const _FileChip({required this.name, this.state = _AttachState.ready, this.onRemove});
  final String name;
  final _AttachState state;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final failed = state == _AttachState.failed;
    return Container(
      constraints: const BoxConstraints(maxWidth: 220),
      padding: EdgeInsets.fromLTRB(8, 5, onRemove == null ? 10 : 4, 5),
      decoration: BoxDecoration(
        color: failed ? AppColors.danger.withValues(alpha: 0.12) : AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: failed ? AppColors.danger.withValues(alpha: 0.4) : AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (state == _AttachState.uploading)
            const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.4, color: AppColors.fg))
          else
            Icon(failed ? LucideIcons.triangleAlert : LucideIcons.fileText, size: 13, color: failed ? AppColors.danger : AppColors.muted),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              failed ? '$name · failed' : name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.small.copyWith(color: failed ? AppColors.danger : AppColors.fg),
            ),
          ),
          if (onRemove != null)
            Pressable(
              onTap: onRemove,
              child: const Padding(
                padding: EdgeInsets.all(3),
                child: Icon(LucideIcons.x, size: 12, color: AppColors.muted),
              ),
            ),
        ],
      ),
    );
  }
}

class _AssistantTurn extends StatelessWidget {
  const _AssistantTurn(this.m, {required this.streaming, this.onGrow});
  final ChatMessage m;
  final bool streaming;
  final VoidCallback? onGrow;

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
          ChatMarkdown(
            text: () => m.text,
            streaming: streaming,
            style: AppText.body,
            clean: _readable,
            onLinkTap: (url, _) => launchUrl(Uri.parse(url)),
            onGrow: onGrow,
          ),
        if (m.courses.isNotEmpty) ...[
          const SizedBox(height: 10),
          for (final c in m.courses.take(6))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Builder(
                builder: (context) {
                  final course = CourseSummary.fromJson(c);
                  return CourseCard(
                    course: course,
                    compact: true,
                    onTap: course.courseCode.isEmpty ? null : () => context.push('/study/course/${course.courseCode}'),
                  );
                },
              ),
            ),
        ],
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
        for (final (i, c) in m.cases.indexed)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: _CaseCard(id: c.$1, title: c.$2),
          ).enter(i),
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

class _CaseCard extends StatelessWidget {
  const _CaseCard({required this.id, required this.title});
  final String id;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: () => context.go('/cases/$id'),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.brand.withValues(alpha: 0.08),
          border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            const Icon(LucideIcons.briefcase, size: 16, color: AppColors.brand),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppText.heading),
                  const SizedBox(height: 2),
                  const Text('Saved as a case · open the plan', style: AppText.tiny),
                ],
              ),
            ),
            const Icon(LucideIcons.arrowRight, size: 15, color: AppColors.brand),
          ],
        ),
      ),
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

class _Composer extends StatefulWidget {
  const _Composer({
    required this.controller,
    required this.focus,
    required this.busy,
    required this.onSend,
    required this.onStop,
    required this.attachments,
    required this.onAttach,
    required this.onRemoveAttachment,
  });
  final TextEditingController controller;
  final FocusNode focus;
  final bool busy;
  final ValueChanged<String> onSend;
  final VoidCallback onStop;
  final ValueListenable<List<_Attachment>> attachments;
  final VoidCallback onAttach;
  final ValueChanged<_Attachment> onRemoveAttachment;

  @override
  State<_Composer> createState() => _ComposerState();
}

/// Phones and tablets: the keyboard's Return key adds a line; the send button sends.
bool get _touchKeyboard => defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.android;

class _ComposerState extends State<_Composer> {
  String _previous = '';
  bool _shiftNewline = false;

  /// Desktop browsers deliver Enter as a typed line break in a multi-line field. One typed line
  /// break (not a paste, not Shift+Enter) sends the message instead.
  void _changed(String text) {
    final before = _previous;
    _previous = text;
    if (_shiftNewline) {
      _shiftNewline = false;
      return;
    }
    if (text.length != before.length + 1) return;
    final at = widget.controller.selection.isValid ? widget.controller.selection.baseOffset - 1 : text.length - 1;
    if (at < 0 || at >= text.length || text[at] != '\n') return;
    final message = text.replaceRange(at, at + 1, '');
    if (message.trim().isEmpty && widget.attachments.value.isEmpty) {
      widget.controller.value = TextEditingValue(
        text: message,
        selection: TextSelection.collapsed(offset: at),
      );
      _previous = message;
      return;
    }
    _previous = '';
    widget.onSend(message);
  }

  void _send() {
    _previous = '';
    widget.onSend(widget.controller.text);
  }

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 860;
    final controller = widget.controller;
    final touch = _touchKeyboard;
    final field = TextField(
      controller: controller,
      focusNode: widget.focus,
      minLines: 1,
      maxLines: 6,
      keyboardType: TextInputType.multiline,
      textInputAction: touch ? TextInputAction.newline : TextInputAction.send,
      textCapitalization: TextCapitalization.sentences,
      onChanged: touch ? null : _changed,
      onSubmitted: touch
          ? null
          : (text) {
              widget.onSend(text);
              widget.focus.requestFocus();
            },
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
    );
    return Padding(
      padding: EdgeInsets.fromLTRB(12, 6, 12, narrow ? 8 : 14),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: Container(
            padding: const EdgeInsets.fromLTRB(5, 4, 5, 4),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ValueListenableBuilder<List<_Attachment>>(
                  valueListenable: widget.attachments,
                  builder: (context, list, _) => AnimatedSize(
                    duration: Motion.fast,
                    alignment: Alignment.topLeft,
                    child: list.isEmpty
                        ? const SizedBox(width: double.infinity)
                        : Padding(
                            padding: const EdgeInsets.fromLTRB(6, 4, 6, 2),
                            child: SizedBox(
                              width: double.infinity,
                              child: Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  for (final a in list)
                                    _FileChip(name: a.name, state: a.state, onRemove: () => widget.onRemoveAttachment(a)),
                                ],
                              ),
                            ),
                          ),
                  ),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Semantics(
                      button: true,
                      label: 'Attach files',
                      child: Pressable(
                        scale: 0.88,
                        onTap: widget.onAttach,
                        child: Container(
                          width: 32,
                          height: 32,
                          margin: const EdgeInsets.only(bottom: 2),
                          decoration: const BoxDecoration(color: AppColors.raised, shape: BoxShape.circle),
                          child: const Icon(LucideIcons.paperclip, size: 15, color: AppColors.fg),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      // Desktop: Enter sends, Shift+Enter adds a line. Touch keyboards: Return adds a line.
                      child: touch
                          ? field
                          : CallbackShortcuts(
                              bindings: {
                                const SingleActivator(LogicalKeyboardKey.enter, shift: true): () {
                                  _shiftNewline = true;
                                  _newLine(controller);
                                  _previous = controller.text;
                                },
                              },
                              child: field,
                            ),
                    ),
                    const SizedBox(width: 6),
                    ListenableBuilder(
                      listenable: Listenable.merge([controller, widget.attachments]),
                      builder: (context, _) {
                        final busy = widget.busy;
                        final files = widget.attachments.value;
                        final uploading = files.any((a) => a.state == _AttachState.uploading);
                        final canSend =
                            !uploading && (controller.text.trim().isNotEmpty || files.any((a) => a.state == _AttachState.ready));
                        final stopping = busy && !canSend && !uploading;
                        return Semantics(
                          button: true,
                          label: stopping ? 'Stop' : 'Send',
                          child: Pressable(
                            scale: 0.88,
                            onTap: canSend ? _send : (stopping ? widget.onStop : null),
                            child: Container(
                              width: 32,
                              height: 32,
                              margin: const EdgeInsets.only(bottom: 2),
                              decoration: BoxDecoration(
                                color: canSend || stopping ? AppColors.fg : AppColors.raised,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                stopping ? LucideIcons.square : LucideIcons.arrowUp,
                                size: stopping ? 11 : 15,
                                color: canSend || stopping ? AppColors.bg : AppColors.muted,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Inserts a line break at the cursor (Shift+Enter in the composer).
void _newLine(TextEditingController c) {
  final sel = c.selection.isValid ? c.selection : TextSelection.collapsed(offset: c.text.length);
  c.value = TextEditingValue(
    text: c.text.replaceRange(sel.start, sel.end, '\n'),
    selection: TextSelection.collapsed(offset: sel.start + 1),
  );
}

/// Internal document ids the model sometimes cites in brackets ("[c14d0778-…]") mean nothing to the
/// user: drop them. Source numbers like [3] stay.
final _docIdCitation = RegExp(r'\s?\[(?:doc(?:ument)?[: ]\s*)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]', caseSensitive: false);

String _readable(String text) => text.contains('-') ? text.replaceAll(_docIdCitation, '') : text;
