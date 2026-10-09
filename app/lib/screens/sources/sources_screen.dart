import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../auth/auth_screens.dart' show toast;
import '../shell.dart';

const _categories = {
  'legislation': ('Legislation', LucideIcons.scale),
  'federal': ('Home Affairs', LucideIcons.landmark),
  'state': ('State & territory nomination', LucideIcons.mapPin),
  'occupations': ('Occupations', LucideIcons.briefcase),
  'tribunal': ('Review tribunal', LucideIcons.gavel),
  'agents': ('Migration agents', LucideIcons.badgeCheck),
};

String _ago(String? iso) {
  if (iso == null) return 'never';
  final d = DateTime.now().difference(DateTime.parse(iso));
  if (d.inSeconds < 60) return '${d.inSeconds}s ago';
  if (d.inMinutes < 60) return '${d.inMinutes}m ago';
  if (d.inHours < 48) return '${d.inHours}h ago';
  return '${d.inDays}d ago';
}

String _bytes(num b) => b > 1 << 30 ? '${(b / (1 << 30)).toStringAsFixed(2)} GB' : '${(b / (1 << 20)).toStringAsFixed(1)} MB';

class SourcesScreen extends StatefulWidget {
  const SourcesScreen({super.key});
  @override
  State<SourcesScreen> createState() => _SourcesScreenState();
}

class _SourcesScreenState extends State<SourcesScreen> {
  final _sb = Supabase.instance.client;
  Map<String, dynamic>? _overview;
  List<Map<String, dynamic>> _sources = [];
  List<Map<String, dynamic>> _workers = [];
  List<Map<String, dynamic>> _changes = [];
  Timer? _timer;
  int? _prevDone;
  DateTime? _prevAt;
  double _rate = 0; // pages per minute

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (TickerMode.valuesOf(context).enabled) _refresh(); // only while this tab is visible
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final results = await Future.wait<dynamic>([
        _sb.rpc('law_overview'),
        _sb.rpc('crawl_progress'),
        _sb.from('crawl_workers').select().order('last_seen_at', ascending: false).limit(5),
        _sb.rpc('recent_law_changes', params: {'p_limit': 25}),
      ]);
      if (!mounted) return;
      final ov = (results[0] as Map).cast<String, dynamic>();
      final done = (ov['queue_done'] as num).toInt();
      final now = DateTime.now();
      if (_prevDone != null && _prevAt != null) {
        final mins = now.difference(_prevAt!).inMilliseconds / 60000;
        if (mins > 0) _rate = _rate * 0.6 + ((done - _prevDone!) / mins) * 0.4; // smoothed
      }
      _prevDone = done;
      _prevAt = now;
      setState(() {
        _overview = ov;
        _sources = [for (final r in results[1] as List) (r as Map).cast<String, dynamic>()];
        _workers = [for (final r in results[2] as List) (r as Map).cast<String, dynamic>()];
        _changes = [for (final r in results[3] as List) (r as Map).cast<String, dynamic>()];
      });
    } catch (_) {
      // transient; next tick retries
    }
  }

  Future<void> _requeue(String id, String name) async {
    final n = await _sb.rpc('requeue_source', params: {'p_source': id});
    if (mounted) toast(context, '$name: $n pages queued for re-crawl.');
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final ov = _overview;
    final narrow = MediaQuery.sizeOf(context).width < 860;
    return SafeArea(
      bottom: false,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: RefreshIndicator(
            onRefresh: _refresh,
            color: AppColors.fg,
            backgroundColor: AppColors.card,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
              children: [
                PageHeader(
                  title: 'Sources & data',
                  subtitle: 'Where every answer comes from, and how fresh it is',
                  trailing: narrow ? const SignOutButton() : null,
                ),
                if (ov == null)
                  const Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: ShimmerText('Loading the corpus…')),
                  )
                else ...[
                  _Hero(ov: ov, workers: _workers, rate: _rate).enter(0),
                  const SizedBox(height: 10),
                  _Stats(ov).enter(1),
                  const SizedBox(height: 18),
                  const _Pipeline().enter(2),
                  const SizedBox(height: 18),
                  for (final cat in _categories.keys)
                    if (_sources.any((s) => s['category'] == cat)) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8, top: 4),
                        child: Row(
                          children: [
                            Icon(_categories[cat]!.$2, size: 12, color: AppColors.muted),
                            const SizedBox(width: 6),
                            Text(_categories[cat]!.$1.toUpperCase(), style: AppText.label),
                          ],
                        ),
                      ),
                      for (final (i, s) in _sources.where((s) => s['category'] == cat).indexed)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _SourceCard(s, onRequeue: () => _requeue(s['id'] as String, s['name'] as String)).enter(i),
                        ),
                      const SizedBox(height: 8),
                    ],
                  if (_changes.isNotEmpty) ...[
                    const Padding(
                      padding: EdgeInsets.only(bottom: 8, top: 6),
                      child: Text('RECENT UPDATES', style: AppText.label),
                    ),
                    Panel(
                      padding: EdgeInsets.zero,
                      child: Column(children: [for (final (i, c) in _changes.indexed) _ChangeRow(c, first: i == 0)]),
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
}

class _Hero extends StatelessWidget {
  const _Hero({required this.ov, required this.workers, required this.rate});
  final Map<String, dynamic> ov;
  final List<Map<String, dynamic>> workers;
  final double rate;

  @override
  Widget build(BuildContext context) {
    final total = (ov['queue_total'] as num).toInt();
    final done = (ov['queue_done'] as num).toInt();
    final failed = (ov['queue_failed'] as num).toInt();
    final left = math.max(0, total - done - failed);
    final pct = total == 0 ? 0.0 : (done + failed) / total;
    final online = (ov['workers_online'] as num).toInt() > 0;
    final active = workers.where((w) => DateTime.now().difference(DateTime.parse(w['last_seen_at'] as String)).inMinutes < 2).firstOrNull;
    final eta = rate > 0.5 && left > 0 ? Duration(minutes: (left / rate).ceil()) : null;

    return Panel(
      child: Row(
        children: [
          SizedBox(
            width: 92,
            height: 92,
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: pct),
              duration: const Duration(milliseconds: 900),
              curve: Motion.ease,
              builder: (_, v, _) => CustomPaint(
                painter: _RingPainter(v),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('${(v * 100).toStringAsFixed(v < 0.1 ? 1 : 0)}%', style: AppText.title.copyWith(fontSize: 17)),
                      const Text('crawled', style: AppText.tiny),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$done of $total pages', style: AppText.heading),
                const SizedBox(height: 2),
                Text(
                  left == 0
                      ? 'Queue is up to date'
                      : '$left left${eta == null ? '' : ' · about ${_fmt(eta)} at ${rate.toStringAsFixed(1)}/min'}',
                  style: AppText.small,
                ),
                if (failed > 0) Text('$failed could not be fetched (retried 3×)', style: AppText.small.copyWith(color: AppColors.warning)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _Pulse(online: online),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        online
                            ? 'Worker online${active?['current_url'] != null && (active!['current_url'] as String).isNotEmpty ? ' · ${Uri.parse(active['current_url'] as String).path}' : ''}'
                            : 'Worker idle · next run on schedule',
                        style: AppText.tiny,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                Text('Last page ${_ago(ov['last_crawl_at'] as String?)} · re-checked every 24h', style: AppText.tiny),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _fmt(Duration d) => d.inHours > 0 ? '${d.inHours}h ${d.inMinutes % 60}m' : '${d.inMinutes}m';
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.v);
  final double v;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2 - 5;
    final base = Paint()
      ..color = AppColors.raised
      ..style = PaintingStyle.stroke
      ..strokeWidth = 7;
    final arc = Paint()
      ..shader = const SweepGradient(colors: [AppColors.brand, Color(0xFFBEF264), AppColors.brand])
          .createShader(Rect.fromCircle(center: c, radius: r))
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 7;
    canvas.drawCircle(c, r, base);
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), -math.pi / 2, 2 * math.pi * v.clamp(0, 1), false, arc);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.v != v;
}

class _Pulse extends StatelessWidget {
  const _Pulse({required this.online});
  final bool online;

  @override
  Widget build(BuildContext context) {
    final dot = Container(
      width: 7,
      height: 7,
      decoration: BoxDecoration(color: online ? AppColors.success : AppColors.faint, shape: BoxShape.circle),
    );
    if (!online) return dot;
    return Stack(
      alignment: Alignment.center,
      children: [
        Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
            )
            .animate(onPlay: (c) => c.repeat())
            .scale(begin: const Offset(1, 1), end: const Offset(2.6, 2.6), duration: 1400.ms, curve: Curves.easeOut)
            .fadeOut(duration: 1400.ms),
        dot,
      ],
    );
  }
}

class _Stats extends StatelessWidget {
  const _Stats(this.ov);
  final Map<String, dynamic> ov;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      ('Documents', '${ov['documents']}', LucideIcons.files),
      ('Sections', '${ov['sections']}', LucideIcons.listTree),
      ('Versions', '${ov['versions']}', LucideIcons.history),
      ('Changed 7d', '${ov['changes_7d']}', LucideIcons.gitCompare),
      ('Semantic', '${ov['embedded']}', LucideIcons.sparkles),
      ('Database', _bytes(ov['database_bytes'] as num), LucideIcons.hardDrive),
    ];
    return LayoutBuilder(
      builder: (context, c) {
        final cols = c.maxWidth > 600 ? 6 : 3;
        final w = (c.maxWidth - (cols - 1) * 8) / cols;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final t in tiles)
              SizedBox(
                width: w,
                child: Panel(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(t.$3, size: 13, color: AppColors.muted),
                      const SizedBox(height: 6),
                      AnimatedSwitcher(
                        duration: Motion.medium,
                        transitionBuilder: (c, a) => FadeTransition(
                          opacity: a,
                          child: SlideTransition(
                            position: Tween(begin: const Offset(0, 0.3), end: Offset.zero).animate(a),
                            child: c,
                          ),
                        ),
                        child: Text(t.$2, key: ValueKey(t.$2), style: AppText.heading),
                      ),
                      Text(t.$1, style: AppText.tiny),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// How the data flows, in plain words.
class _Pipeline extends StatelessWidget {
  const _Pipeline();

  @override
  Widget build(BuildContext context) {
    const steps = [
      (
        LucideIcons.globe,
        'Fetch',
        'A real browser opens each official page, expands every tab and folded section. Legislation comes from the Federal Register API as official compilations.',
      ),
      (LucideIcons.scissors, 'Split', 'Pages are cut into sections with their full heading path, e.g. "189 › Eligibility › Be this age".'),
      (
        LucideIcons.history,
        'Version',
        'A changed page becomes a new version; the old one is kept with the dates it was in force, so answers can use the law as at any date.',
      ),
      (
        LucideIcons.search,
        'Search',
        'Keyword + semantic search over the current versions. The assistant cites the numbered sections it used.',
      ),
      (
        LucideIcons.scale,
        'Decide',
        'Eligibility is computed by the rules engine, not the AI. Each criterion links to the clause it comes from.',
      ),
    ];
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('HOW YOUR DATA IS STORED', style: AppText.label),
          const SizedBox(height: 10),
          for (final (i, s) in steps.indexed)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  children: [
                    Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(7)),
                      child: Icon(s.$1, size: 12, color: AppColors.fg),
                    ),
                    if (i < steps.length - 1) Container(width: 1, height: 26, color: AppColors.border),
                  ],
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 3, bottom: 8),
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: '${s.$2}  ',
                            style: AppText.small.copyWith(color: AppColors.fg, fontWeight: FontWeight.w600),
                          ),
                          TextSpan(text: s.$3, style: AppText.small),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ).animate(delay: (80 * i).ms).fadeIn(duration: Motion.medium).slideX(begin: -0.03, end: 0, curve: Motion.ease),
          const SizedBox(height: 2),
          const Text(
            'Private data (your case file, chats, documents) is separate and protected by row-level security. The assistant can only read it.',
            style: AppText.tiny,
          ),
        ],
      ),
    );
  }
}

class _SourceCard extends StatefulWidget {
  const _SourceCard(this.s, {required this.onRequeue});
  final Map<String, dynamic> s;
  final VoidCallback onRequeue;
  @override
  State<_SourceCard> createState() => _SourceCardState();
}

class _SourceCardState extends State<_SourceCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final s = widget.s;
    int n(String k) => (s[k] as num).toInt();
    final queued = n('queued'),
        done = n('done'),
        failed = n('failed'),
        pending = n('pending'),
        processing = n('processing'),
        skipped = n('skipped');
    final pct = queued == 0 ? 0.0 : (done + skipped + failed) / queued;
    final status = queued == 0
        ? ('Not started', AppColors.muted)
        : processing > 0
        ? ('Crawling', AppColors.brand)
        : pending > 0
        ? ('Queued', AppColors.fg)
        : ('Up to date', AppColors.success);

    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Pressable(
            scale: 0.99,
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(s['name'] as String, style: AppText.heading.copyWith(fontSize: 13))),
                      AnimatedContainer(
                        duration: Motion.medium,
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(color: status.$2.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                        child: Text(
                          status.$1,
                          style: AppText.tiny.copyWith(color: status.$2, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(Uri.parse(s['base_url'] as String).host, style: AppText.tiny),
                  const SizedBox(height: 9),
                  AnimatedBar(value: pct, color: failed > done && done == 0 ? AppColors.warning : AppColors.brand, height: 5),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Text('$done/$queued pages', style: AppText.tiny.copyWith(color: AppColors.fg)),
                      Text('  ·  ${s['sections']} sections', style: AppText.tiny),
                      if (failed > 0) Text('  ·  $failed failed', style: AppText.tiny.copyWith(color: AppColors.warning)),
                      const Spacer(),
                      Text(_ago(s['last_done_at'] as String?), style: AppText.tiny),
                    ],
                  ),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: Motion.medium,
            curve: Motion.ease,
            alignment: Alignment.topCenter,
            child: !_open
                ? const SizedBox(width: double.infinity)
                : Container(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                    decoration: const BoxDecoration(
                      border: Border(top: BorderSide(color: AppColors.border)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (s['description'] != null) Text(s['description'] as String, style: AppText.small),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 14,
                          runSpacing: 4,
                          children: [
                            Text('Method: ${s['kind'] == 'frl_api' ? 'official API' : 'browser crawl'}', style: AppText.tiny),
                            Text('Re-checked every ${s['recrawl_hours']}h', style: AppText.tiny),
                            Text('Limit ${s['max_pages']} pages', style: AppText.tiny),
                            Text('${s['documents']} documents', style: AppText.tiny),
                            Text('${s['changed_7d']} changed this week', style: AppText.tiny),
                          ],
                        ),
                        if (s['last_error'] != null) ...[
                          const SizedBox(height: 6),
                          Text(
                            'Last error: ${s['last_error']}',
                            style: AppText.tiny.copyWith(color: AppColors.warning),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Pressable(
                              onTap: () => launchUrl(Uri.parse(s['base_url'] as String)),
                              child: const Row(
                                children: [
                                  Icon(LucideIcons.externalLink, size: 12, color: AppColors.muted),
                                  SizedBox(width: 4),
                                  Text('Open site', style: AppText.small),
                                ],
                              ),
                            ),
                            const Spacer(),
                            SizedBox(
                              width: 110,
                              child: PillButton(
                                label: 'Re-crawl now',
                                icon: LucideIcons.refreshCw,
                                secondary: true,
                                height: 30,
                                onTap: widget.onRequeue,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _ChangeRow extends StatelessWidget {
  const _ChangeRow(this.c, {required this.first});
  final Map<String, dynamic> c;
  final bool first;

  @override
  Widget build(BuildContext context) {
    final sections = (c['changed_sections'] as List? ?? const []).cast<String>();
    final isNew = c['is_new'] == true;
    return Pressable(
      scale: 0.99,
      onTap: () => launchUrl(Uri.parse(c['url'] as String)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          border: first ? null : const Border(top: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 4),
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: isNew ? AppColors.muted : AppColors.brand, shape: BoxShape.circle),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    c['title'] as String,
                    style: AppText.small.copyWith(color: AppColors.fg),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    isNew
                        ? 'Added · ${sections.length} sections'
                        : 'Changed: ${sections.take(2).map((x) => x.split(' > ').last).join(', ')}',
                    style: AppText.tiny,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Text(_ago(c['detected_at'] as String?), style: AppText.tiny),
          ],
        ),
      ),
    );
  }
}
