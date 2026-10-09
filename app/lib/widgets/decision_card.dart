import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../engine/engine.dart';
import '../motion.dart';
import '../theme.dart';
import 'common.dart';

/// Parses a VisaAssessment produced by the server-side (TypeScript) engine.
VisaAssessment assessmentFromJson(Map<String, dynamic> j) {
  CriterionStatus status(String s) => switch (s) {
    'met' => CriterionStatus.met,
    'not_met' => CriterionStatus.notMet,
    'at_risk' => CriterionStatus.atRisk,
    _ => CriterionStatus.unknown,
  };
  final p = j['points'] as Map<String, dynamic>?;
  return VisaAssessment(
    subclass: j['subclass'] as String,
    stream: j['stream'] as String,
    name: j['name'] as String,
    outcome: switch (j['outcome']) {
      'eligible' => Outcome.eligible,
      'not_eligible' => Outcome.notEligible,
      _ => Outcome.needsInfo,
    },
    reviewStatus: j['reviewStatus'] as String? ?? 'draft',
    assessedAt: j['assessedAt'] as String? ?? '',
    criteria: [
      for (final c in (j['criteria'] as List).cast<Map<String, dynamic>>())
        CriterionResult(
          c['id'] as String,
          c['title'] as String,
          status(c['status'] as String),
          c['discretionary'] == true,
          c['detail'] as String?,
          [
            for (final m in (c['missing'] as List? ?? const []).cast<Map<String, dynamic>>())
              Question(m['fact'] as String, m['question'] as String),
          ],
          Source((c['source'] as Map)['title'] as String, (c['source'] as Map)['url'] as String),
        ),
    ],
    points: p == null
        ? null
        : PointsResult(p['min'] as int, p['max'] as int, [
            for (final f in (p['factors'] as List).cast<Map<String, dynamic>>())
              PointsFactor(f['key'] as String, f['label'] as String, f['min'] as int, f['max'] as int),
          ], p['ageIneligible'] == true),
    blockers: (j['blockers'] as List? ?? const []).cast<String>(),
    nextQuestions: [
      for (final q in (j['nextQuestions'] as List? ?? const []).cast<Map<String, dynamic>>())
        Question(q['fact'] as String, q['question'] as String),
    ],
  );
}

(String, Color, Color) outcomeStyle(Outcome o) => switch (o) {
  Outcome.eligible => ('Eligible', AppColors.brand, AppColors.brandFg),
  Outcome.needsInfo => ('Needs info', AppColors.raised, AppColors.fg),
  Outcome.notEligible => ('Not eligible', const Color(0x26F87171), AppColors.danger),
};

class PointsMeter extends StatelessWidget {
  const PointsMeter(this.points, {super.key});
  final PointsResult points;

  @override
  Widget build(BuildContext context) {
    const scale = 130.0;
    final range = points.min == points.max ? '${points.min}' : '${points.min}–${points.max}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('Points', style: AppText.small),
            const Spacer(),
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: points.min.toDouble()),
              duration: Motion.slow,
              curve: Motion.ease,
              builder: (_, v, _) => Text(
                points.min == points.max ? '${v.round()}' : range,
                style: AppText.small.copyWith(
                  color: AppColors.fg,
                  fontWeight: FontWeight.w600,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            Text(' / ${points.required}', style: AppText.small),
          ],
        ),
        const SizedBox(height: 6),
        AnimatedBar(
          value: points.min / scale,
          secondary: points.max / scale,
          marker: points.required / scale,
          color: points.min >= points.required ? AppColors.brand : AppColors.fg,
        ),
      ],
    );
  }
}

class DecisionCard extends StatefulWidget {
  const DecisionCard(this.result, {super.key, this.initiallyOpen = false});
  final VisaAssessment result;
  final bool initiallyOpen;

  @override
  State<DecisionCard> createState() => _DecisionCardState();
}

class _DecisionCardState extends State<DecisionCard> {
  late bool open = widget.initiallyOpen;

  @override
  Widget build(BuildContext context) {
    final r = widget.result;
    final (label, bg, fg) = outcomeStyle(r.outcome);
    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Pressable(
            scale: 0.99,
            onTap: () => setState(() => open = !open),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 11, 10, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Subclass ${r.subclass} · ${r.stream}', style: AppText.tiny),
                        const SizedBox(height: 2),
                        Text(r.name, style: AppText.heading.copyWith(fontSize: 13)),
                      ],
                    ),
                  ),
                  AnimatedContainer(
                    duration: Motion.medium,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
                    child: Text(
                      label,
                      style: AppText.tiny.copyWith(color: fg, fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(width: 4),
                  AnimatedRotation(
                    turns: open ? 0.5 : 0,
                    duration: Motion.medium,
                    curve: Motion.ease,
                    child: const Icon(LucideIcons.chevronDown, size: 15, color: AppColors.muted),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (r.points != null) PointsMeter(r.points!),
                for (final b in r.blockers) ...[
                  const SizedBox(height: 6),
                  Text('• $b', style: AppText.small.copyWith(color: AppColors.danger)),
                ],
              ],
            ),
          ),
          AnimatedSize(
            duration: Motion.medium,
            curve: Motion.ease,
            alignment: Alignment.topCenter,
            child: open ? _details(r) : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }

  Widget _details(VisaAssessment r) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Divider(height: 1, color: AppColors.border),
        for (final (i, c) in r.criteria.indexed) _CriterionRow(c).enter(i, dy: 0.15),
        if (r.points != null) ...[
          const Divider(height: 1, color: AppColors.border),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('POINTS BREAKDOWN · SCHEDULE 6D', style: AppText.label),
                const SizedBox(height: 6),
                for (final f in r.points!.factors)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 1.5),
                    child: Row(
                      children: [
                        Expanded(child: Text(f.label, style: AppText.small)),
                        Text(f.min == f.max ? '${f.min}' : '${f.min}–${f.max}', style: AppText.small.copyWith(color: AppColors.fg)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (r.reviewStatus == 'draft')
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: AppColors.border)),
            ),
            child: const Text('Rule set awaiting expert review against the cited sources.', style: AppText.tiny),
          ),
      ],
    );
  }
}

class _CriterionRow extends StatelessWidget {
  const _CriterionRow(this.c);
  final CriterionResult c;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (c.status) {
      CriterionStatus.met => (LucideIcons.check, AppColors.success),
      CriterionStatus.notMet => (LucideIcons.x, AppColors.danger),
      CriterionStatus.atRisk => (LucideIcons.triangleAlert, AppColors.warning),
      CriterionStatus.unknown => (LucideIcons.circleQuestionMark, AppColors.muted),
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 18,
            height: 18,
            margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(color: color.withValues(alpha: 0.15), shape: BoxShape.circle),
            child: Icon(icon, size: 11, color: color),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(c.title, style: AppText.body.copyWith(fontSize: 12.5)),
                if (c.detail != null) Text(c.detail!, style: AppText.small),
                if (c.missing.isNotEmpty) Text(c.missing.first.text, style: AppText.small),
                const SizedBox(height: 2),
                Pressable(
                  onTap: () => launchUrl(Uri.parse(c.source.url)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          c.source.title,
                          style: AppText.tiny.copyWith(decoration: TextDecoration.underline, decorationColor: AppColors.faint),
                        ),
                      ),
                      const SizedBox(width: 3),
                      const Icon(LucideIcons.externalLink, size: 10, color: AppColors.muted),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
