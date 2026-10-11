import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../data/people.dart';
import '../../data/study.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'widgets.dart';

/// "Am I eligible?" answered right on the course page: tap, and it expands with the verdict, each
/// entry requirement against the person's record, what a course they're still studying needs to
/// finish with, and how to qualify. No chat.
class EligibilityPanel extends StatefulWidget {
  const EligibilityPanel({super.key, required this.courseCode, required this.onAskMore});
  final String courseCode;

  /// Opens the chat with a follow-up question (for anything the panel doesn't cover).
  final VoidCallback onAskMore;

  @override
  State<EligibilityPanel> createState() => _EligibilityPanelState();
}

class _EligibilityPanelState extends State<EligibilityPanel> with PersonAware {
  CourseEligibility? _r;
  bool _busy = false;
  Object? _error;
  final _wam = TextEditingController();

  @override
  void initState() {
    super.initState();
    _r = cachedEligibility(widget.courseCode);
  }

  @override
  void onPersonChanged() => setState(() {
    _r = cachedEligibility(widget.courseCode);
    _error = null;
  });

  @override
  void dispose() {
    _wam.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    final expected = double.tryParse(_wam.text.trim().replaceAll('%', ''));
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await checkEligibility(widget.courseCode, expectedWam: expected != null && expected > 0 && expected <= 100 ? expected : null);
      if (mounted) setState(() => _r = r);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final r = _r;
    return Panel(
      padding: const EdgeInsets.all(14),
      child: AnimatedSize(
        duration: Motion.medium,
        curve: Motion.ease,
        alignment: Alignment.topCenter,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                  child: const Icon(LucideIcons.badgeCheck, size: 15, color: AppColors.brand),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Am I eligible?', style: AppText.heading.copyWith(fontSize: 13)),
                      const SizedBox(height: 2),
                      const Text('Entry requirements from the provider, checked against your record', style: AppText.tiny),
                    ],
                  ),
                ),
                if (r == null && !_busy) SmallButton(label: 'Check', icon: LucideIcons.sparkles, onTap: _check),
              ],
            ),
            if (_busy) ...[
              const SizedBox(height: 14),
              const ShimmerText('Reading the entry requirements and your record…'),
              const SizedBox(height: 4),
              const Text('This takes up to a minute.', style: AppText.tiny),
            ] else if (_error != null) ...[
              const SizedBox(height: 12),
              Text(errorText(_error!), style: AppText.small.copyWith(color: AppColors.danger)),
              const SizedBox(height: 8),
              SmallButton(label: 'Try again', icon: LucideIcons.rotateCw, onTap: _check),
            ] else if (r != null)
              ..._result(r),
          ],
        ),
      ),
    );
  }

  List<Widget> _result(CourseEligibility r) {
    final (label, fg, bg) = switch (r.status) {
      'eligible' => ('Eligible', AppColors.brandFg, AppColors.brand),
      'eligible_if' => ('Eligible if…', AppColors.bg, AppColors.warning),
      'not_yet' => ('Not yet', AppColors.danger, const Color(0x26F87171)),
      _ => ('Can’t tell yet', AppColors.fg, AppColors.raised),
    };
    final p = r.projection;
    return [
      const SizedBox(height: 14),
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
            child: Text(label, style: AppText.small.copyWith(color: fg, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(r.headline, style: AppText.body)),
        ],
      ),
      if (r.requirements.isNotEmpty) ...[
        const SizedBox(height: 12),
        for (final q in r.requirements) _RequirementRow(q),
      ],
      if (r.conditions.isNotEmpty) ...[
        const SizedBox(height: 8),
        const Text('WHAT HAS TO BE TRUE', style: AppText.label),
        const SizedBox(height: 4),
        for (final c in r.conditions) _Bullet(c),
      ],
      if (p != null && p.remainingCredit > 0) ...[
        const SizedBox(height: 10),
        _ProjectionBox(p),
      ],
      if (r.toQualify.isNotEmpty) ...[
        const SizedBox(height: 10),
        const Text('HOW TO GET THERE', style: AppText.label),
        const SizedBox(height: 4),
        for (final (i, s) in r.toQualify.indexed) _Bullet(s, number: i + 1),
      ],
      const SizedBox(height: 12),
      if (r.question != null) ...[
        Text(r.question!, style: AppText.small.copyWith(color: AppColors.fg)),
        const SizedBox(height: 6),
      ],
      Row(
        children: [
          SizedBox(
            width: 120,
            height: 34,
            child: TextField(
              controller: _wam,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              style: AppText.body,
              cursorColor: AppColors.fg,
              decoration: InputDecoration(
                isDense: true,
                hintText: 'Expected WAM',
                hintStyle: AppText.small,
                filled: true,
                fillColor: AppColors.surface,
                contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.border)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.border)),
              ),
              onSubmitted: (_) => _check(),
            ),
          ),
          const SizedBox(width: 8),
          SmallButton(label: 'Re-check', icon: LucideIcons.rotateCw, onTap: _check),
        ],
      ),
      if (r.sources.isNotEmpty) ...[
        const SizedBox(height: 12),
        for (final (title, url) in r.sources)
          if (url.isNotEmpty)
            Pressable(
              onTap: () => openExternal(context, url),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    const Icon(LucideIcons.link, size: 11, color: AppColors.muted),
                    const SizedBox(width: 6),
                    Expanded(child: Text(title, style: AppText.tiny, maxLines: 1, overflow: TextOverflow.ellipsis)),
                  ],
                ),
              ),
            ),
      ],
      const SizedBox(height: 6),
      Pressable(
        onTap: widget.onAskMore,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Text('Ask a follow-up in the chat →', style: AppText.small.copyWith(color: AppColors.brand)),
        ),
      ),
    ];
  }
}

class _RequirementRow extends StatelessWidget {
  const _RequirementRow(this.q);
  final EligibilityRequirement q;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (q.met) {
      true => (LucideIcons.circleCheck, AppColors.success),
      false => (LucideIcons.circleX, AppColors.danger),
      null => (LucideIcons.circleHelp, AppColors.warning),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon, size: 15, color: color)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(q.name, style: AppText.small.copyWith(color: AppColors.fg, fontWeight: FontWeight.w600)),
                if (q.required.isNotEmpty) Text('Course asks: ${q.required}', style: AppText.small),
                if (q.you.isNotEmpty) Text('You: ${q.you}', style: AppText.small.copyWith(color: AppColors.fg)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet(this.text, {this.number});
  final String text;
  final int? number;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 16, child: Text(number == null ? '•' : '$number.', style: AppText.small)),
        Expanded(child: Text(text, style: AppText.small.copyWith(color: AppColors.fg))),
      ],
    ),
  );
}

/// Where the current course's WAM is heading: the average the remaining units need for each final WAM.
class _ProjectionBox extends StatelessWidget {
  const _ProjectionBox(this.p);
  final WamProjection p;

  String _n(double v) => v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    final rows = p.targets.where((t) => t.wam >= p.currentWam - 5).take(5).toList();
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'YOUR CURRENT COURSE · WAM ${_n(p.currentWam)} · ${_n(p.remainingCredit)} CREDIT POINTS TO GO',
            style: AppText.label,
          ),
          const SizedBox(height: 6),
          for (final t in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Expanded(child: Text('Finish with WAM ${_n(t.wam)}', style: AppText.small.copyWith(color: AppColors.fg))),
                  Text(
                    t.neededAverage == null
                        ? '—'
                        : t.reachable
                        ? 'average ${_n(t.neededAverage!)} from here'
                        : 'out of reach',
                    style: AppText.small.copyWith(color: t.reachable ? AppColors.fg : AppColors.danger),
                  ),
                ],
              ),
            ),
          if (p.bestPossible != null) ...[
            const SizedBox(height: 4),
            Text('Highest possible final WAM: ${_n(p.bestPossible!)} (check how your provider counts failed units)', style: AppText.tiny),
          ],
        ],
      ),
    );
  }
}
