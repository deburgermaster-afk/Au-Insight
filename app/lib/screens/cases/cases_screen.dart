import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gpt_markdown/gpt_markdown.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/quick_actions.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../shell.dart';

/// A plan the analyst team produced, saved from the chat (table `solutions`).
class CaseItem {
  CaseItem(Map<String, dynamic> j)
    : id = j['id'] as String,
      title = j['title'] as String,
      status = j['status'] as String? ?? 'active',
      question = j['question'] as String? ?? '',
      summary = j['summary'] as String? ?? '',
      chatId = j['chat_id'] as String?,
      createdAt = DateTime.parse(j['created_at'] as String).toLocal(),
      pathways = [for (final p in (j['pathways'] as List? ?? const [])) (p as Map).cast<String, dynamic>()],
      steps = [for (final s in (j['steps'] as List? ?? const [])) (s as Map).cast<String, dynamic>()],
      reports = [for (final r in (j['reports'] as List? ?? const [])) (r as Map).cast<String, dynamic>()],
      sources = [for (final s in (j['sources'] as List? ?? const [])) (s as Map).cast<String, dynamic>()];
  final String id;
  final String title;
  String status;
  final String question;
  final String summary;
  final String? chatId;
  final DateTime createdAt;
  final List<Map<String, dynamic>> pathways;
  final List<Map<String, dynamic>> steps;
  final List<Map<String, dynamic>> reports;
  final List<Map<String, dynamic>> sources;

  int get done => steps.where((s) => s['done'] == true).length;
  double get progress => steps.isEmpty ? 0 : done / steps.length;
}

String shortDate(DateTime d) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${m[d.month - 1]} ${d.year}';
}

class CasesScreen extends StatefulWidget {
  const CasesScreen({super.key});
  @override
  State<CasesScreen> createState() => _CasesScreenState();
}

class _CasesScreenState extends State<CasesScreen> {
  final _sb = Supabase.instance.client;
  List<CaseItem>? _cases;
  String _filter = 'active';

  @override
  void initState() {
    super.initState();
    _load();
    casesChanged.addListener(_load);
  }

  @override
  void dispose() {
    casesChanged.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    final rows = await _sb.from('solutions').select().order('created_at', ascending: false);
    if (mounted) setState(() => _cases = [for (final r in rows) CaseItem(r)]);
  }

  @override
  Widget build(BuildContext context) {
    final cases = (_cases ?? []).where((c) => _filter == 'all' || c.status == _filter).toList();
    return SafeArea(
      bottom: false,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: RefreshIndicator(
            onRefresh: _load,
            color: AppColors.fg,
            backgroundColor: AppColors.raised,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
              children: [
                const PageHeader(title: 'Cases', subtitle: 'Plans the analyst team built for you'),
                Segmented<String>(
                  value: _filter,
                  onChanged: (v) => setState(() => _filter = v ?? 'active'),
                  options: const [('active', 'Active'), ('done', 'Done'), ('all', 'All')],
                ),
                const SizedBox(height: 12),
                if (_cases == null)
                  const Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: ShimmerText('Loading cases…')),
                  )
                else if (cases.isEmpty)
                  _Empty(all: _cases!.isEmpty).enter(0)
                else
                  for (final (i, c) in cases.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Pressable(
                        onTap: () async {
                          await context.push('/cases/${c.id}');
                          _load();
                        },
                        child: _CaseTile(c),
                      ),
                    ).enter(i),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.all});
  final bool all;

  @override
  Widget build(BuildContext context) {
    return Panel(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(LucideIcons.sparkles, size: 20, color: AppColors.brand),
          const SizedBox(height: 10),
          Text(all ? 'No cases yet' : 'Nothing here', style: AppText.heading),
          const SizedBox(height: 4),
          const Text(
            'Tell the chat your story, then ask for a plan ("What is my best way to PR?"). '
            'Four analysts work on it together and the plan is saved here as a case you can track.',
            style: AppText.small,
          ),
          if (all) ...[
            const SizedBox(height: 14),
            PillButton(
              label: 'Start in chat',
              icon: LucideIcons.messageCircle,
              height: 36,
              onTap: () => runQuickAction(StatefulNavigationShell.of(context).goBranch, QuickAction.newChat),
            ),
          ],
        ],
      ),
    );
  }
}

class _CaseTile extends StatelessWidget {
  const _CaseTile(this.c);
  final CaseItem c;

  @override
  Widget build(BuildContext context) {
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(9)),
                child: const Icon(LucideIcons.briefcase, size: 14, color: AppColors.brand),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.title, style: AppText.heading, maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text('${shortDate(c.createdAt)} · ${c.pathways.length} pathways · ${c.steps.length} steps', style: AppText.tiny),
                  ],
                ),
              ),
              const Icon(LucideIcons.chevronRight, size: 15, color: AppColors.faint),
            ],
          ),
          if (c.steps.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: AnimatedBar(value: c.progress, color: AppColors.brand, height: 5),
                ),
                const SizedBox(width: 10),
                Text('${c.done}/${c.steps.length}', style: AppText.tiny),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class CaseDetailScreen extends StatefulWidget {
  const CaseDetailScreen({super.key, required this.id});
  final String id;
  @override
  State<CaseDetailScreen> createState() => _CaseDetailScreenState();
}

class _CaseDetailScreenState extends State<CaseDetailScreen> {
  final _sb = Supabase.instance.client;
  CaseItem? _c;
  String _tab = 'plan';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final row = await _sb.from('solutions').select().eq('id', widget.id).maybeSingle();
    if (mounted && row != null) setState(() => _c = CaseItem(row));
  }

  Future<void> _toggle(int i) async {
    final c = _c!;
    setState(() => c.steps[i]['done'] = c.steps[i]['done'] != true);
    await _sb.from('solutions').update({'steps': c.steps, 'updated_at': DateTime.now().toUtc().toIso8601String()}).eq('id', c.id);
    casesChanged.value++;
  }

  Future<void> _setStatus(String status) async {
    setState(() => _c!.status = status);
    await _sb.from('solutions').update({'status': status}).eq('id', _c!.id);
    casesChanged.value++;
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    return ColoredBox(
      color: AppColors.bg,
      child: SafeArea(
        bottom: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
              children: [
                PageHeader(
                  back: true,
                  title: c?.title ?? 'Case',
                  subtitle: c == null ? null : 'Created ${shortDate(c.createdAt)}',
                  trailing: c == null
                      ? null
                      : Pressable(
                          onTap: () => _setStatus(c.status == 'done' ? 'active' : 'done'),
                          child: AnimatedContainer(
                            duration: Motion.medium,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: c.status == 'done' ? AppColors.success.withValues(alpha: 0.15) : AppColors.raised,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Text(
                              c.status == 'done' ? 'Done' : 'Mark done',
                              style: AppText.small.copyWith(color: c.status == 'done' ? AppColors.success : AppColors.fg),
                            ),
                          ),
                        ),
                ),
                if (c == null)
                  const Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: ShimmerText('Loading…')),
                  )
                else ...[
                  if (c.question.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text('“${c.question}”', style: AppText.serif(AppText.body.copyWith(color: AppColors.muted))),
                    ),
                  if (c.steps.isNotEmpty)
                    Panel(
                      child: Row(
                        children: [
                          Expanded(
                            child: AnimatedBar(value: c.progress, color: AppColors.brand),
                          ),
                          const SizedBox(width: 12),
                          Text('${c.done} of ${c.steps.length} steps', style: AppText.small),
                        ],
                      ),
                    ),
                  const SizedBox(height: 12),
                  Segmented<String>(
                    value: _tab,
                    wrap: true,
                    onChanged: (v) => setState(() => _tab = v ?? 'plan'),
                    options: [
                      ('plan', 'Plan'),
                      ('summary', 'Summary'),
                      if (c.pathways.isNotEmpty) ('pathways', 'Pathways'),
                      if (c.reports.isNotEmpty) ('analysts', 'Analysts'),
                      if (c.sources.isNotEmpty) ('sources', 'Sources'),
                    ],
                  ),
                  const SizedBox(height: 12),
                  AnimatedSwitcher(
                    duration: Motion.medium,
                    switchInCurve: Motion.ease,
                    child: KeyedSubtree(key: ValueKey(_tab), child: _section(c)),
                  ),
                  if (c.chatId != null) ...[
                    const SizedBox(height: 16),
                    PillButton(
                      label: 'Open the conversation',
                      icon: LucideIcons.messagesSquare,
                      secondary: true,
                      height: 38,
                      onTap: () {
                        openChat.value = c.chatId;
                        context.go('/ask');
                      },
                    ),
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _section(CaseItem c) {
    switch (_tab) {
      case 'summary':
        return Panel(
          child: GptMarkdown(c.summary, style: AppText.body, onLinkTap: (url, _) => launchUrl(Uri.parse(url))),
        );
      case 'pathways':
        return Column(
          children: [
            for (final (i, p) in c.pathways.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Panel(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 22,
                        height: 22,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: i == 0 ? AppColors.brand : AppColors.raised,
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: Text(
                          '${i + 1}',
                          style: AppText.tiny.copyWith(color: i == 0 ? AppColors.brandFg : AppColors.fg, fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${p['name'] ?? ''}', style: AppText.heading),
                            if ((p['fit'] ?? '').toString().isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text('${p['fit']}', style: AppText.small.copyWith(color: AppColors.fg)),
                            ],
                            if ((p['needs'] ?? '').toString().isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text('Needs: ${p['needs']}', style: AppText.small),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ).enter(i),
          ],
        );
      case 'analysts':
        return Column(
          children: [
            for (final (i, r) in c.reports.indexed) Padding(padding: const EdgeInsets.only(bottom: 8), child: _Report(r)).enter(i),
          ],
        );
      case 'sources':
        return Column(
          children: [
            for (final s in c.sources)
              Pressable(
                onTap: () => launchUrl(Uri.parse('${s['url']}')),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 26, child: Text('[${s['n']}]', style: AppText.small)),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${s['title']}', style: AppText.body),
                            if ('${s['section'] ?? ''}'.isNotEmpty) Text('${s['section']}', style: AppText.tiny),
                          ],
                        ),
                      ),
                      const Icon(LucideIcons.arrowUpRight, size: 13, color: AppColors.faint),
                    ],
                  ),
                ),
              ),
          ],
        );
      default:
        if (c.steps.isEmpty) return const Text('No steps in this plan.', style: AppText.small);
        return Column(
          children: [
            for (final (i, s) in c.steps.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Pressable(
                  onTap: () => _toggle(i),
                  child: Panel(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AnimatedSwitcher(
                          duration: Motion.medium,
                          transitionBuilder: (child, a) => ScaleTransition(scale: a, child: child),
                          child: Icon(
                            s['done'] == true ? LucideIcons.circleCheck : LucideIcons.circle,
                            key: ValueKey(s['done'] == true),
                            size: 18,
                            color: s['done'] == true ? AppColors.success : AppColors.faint,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AnimatedDefaultTextStyle(
                                duration: Motion.medium,
                                style: AppText.heading.copyWith(
                                  color: s['done'] == true ? AppColors.muted : AppColors.fg,
                                  decoration: s['done'] == true ? TextDecoration.lineThrough : null,
                                  decorationColor: AppColors.muted,
                                ),
                                child: Text('${s['title']}'),
                              ),
                              if ('${s['detail'] ?? ''}'.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text('${s['detail']}', style: AppText.small),
                              ],
                              if (s['due'] != null) ...[
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    const Icon(LucideIcons.calendarClock, size: 12, color: AppColors.warning),
                                    const SizedBox(width: 4),
                                    Text('${s['due']}', style: AppText.tiny.copyWith(color: AppColors.warning)),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ).enter(i),
          ],
        );
    }
  }
}

class _Report extends StatefulWidget {
  const _Report(this.r);
  final Map<String, dynamic> r;
  @override
  State<_Report> createState() => _ReportState();
}

class _ReportState extends State<_Report> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final text = '${widget.r['report'] ?? widget.r['error'] ?? ''}';
    return Pressable(
      onTap: () => setState(() => _open = !_open),
      scale: 0.99,
      child: Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(LucideIcons.userRound, size: 14, color: AppColors.brand),
                const SizedBox(width: 8),
                Expanded(child: Text('${widget.r['analyst']}', style: AppText.heading)),
                AnimatedRotation(
                  turns: _open ? 0.5 : 0,
                  duration: Motion.medium,
                  child: const Icon(LucideIcons.chevronDown, size: 14, color: AppColors.muted),
                ),
              ],
            ),
            AnimatedSize(
              duration: Motion.medium,
              curve: Motion.ease,
              alignment: Alignment.topLeft,
              child: _open
                  ? Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: GptMarkdown(text, style: AppText.small),
                    )
                  : const SizedBox(width: double.infinity),
            ),
          ],
        ),
      ),
    );
  }
}
