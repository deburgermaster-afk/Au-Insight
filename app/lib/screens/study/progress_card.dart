import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../data/study.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'widgets.dart';

// "My study progress": the study plan from the chat function's `study_plan` tool (the academic engine),
// built from the profile's current course, the transcripts and the CoE and visa dates.

Color planStatusColor(String status) => switch (status) {
  'on_track' => AppColors.success,
  'at_risk' => AppColors.warning,
  'cannot_finish' => AppColors.danger,
  'completed' => AppColors.brand,
  _ => AppColors.muted,
};

IconData _statusIcon(String status) => switch (status) {
  'on_track' => LucideIcons.circleCheck,
  'at_risk' => LucideIcons.triangleAlert,
  'cannot_finish' => LucideIcons.circleX,
  'completed' => LucideIcons.graduationCap,
  _ => LucideIcons.circleHelp,
};

class PlanStatusPill extends StatelessWidget {
  const PlanStatusPill(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) => Tag(planStatusLabel(status), color: planStatusColor(status), icon: _statusIcon(status));
}

/// One-line explanation of the status, for the card header.
String planHeadline(StudyPlan p) {
  final req = p.requiredUnitsPerTerm;
  return switch (p.status) {
    'completed' => 'All the credit for your course is done.',
    'on_track' =>
      req == null
          ? 'At your current load you finish before your CoE ends.'
          : 'You need about ${formatNum(req)} units a term to finish before your CoE ends.',
    'at_risk' =>
      req == null
          ? 'Finishing on time needs a heavier load or extra terms.'
          : 'You need about ${formatNum(req)} units a term: more than a standard load.',
    'cannot_finish' => 'At the loads entered, the course runs past your CoE or visa. See the options below.',
    _ => 'A few details are missing before the plan can be worked out.',
  };
}

/// The prompt that asks the assistant to collect the missing plan details.
String missingPrompt(List<PlanMissing> missing) {
  final qs = [for (final m in missing) m.question.isNotEmpty ? m.question : m.fact];
  return 'Help me complete my study details so you can work out whether I can finish my course on time '
      '(study overload, summer/winter terms, credit transfer, cross-institutional study). '
      'Please ask me these one at a time and save my answers to my profile:\n${[for (final q in qs) '- $q'].join('\n')}';
}

/// A tick, cross or dash for "finishes before ...".
class BeforeMark extends StatelessWidget {
  const BeforeMark(this.label, this.value, {super.key});
  final String label;
  final bool? value;

  @override
  Widget build(BuildContext context) {
    final (icon, col) = switch (value) {
      true => (LucideIcons.check, AppColors.success),
      false => (LucideIcons.x, AppColors.danger),
      null => (LucideIcons.minus, AppColors.faint),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: col),
        const SizedBox(width: 3),
        Text(label, style: AppText.tiny.copyWith(color: value == null ? AppColors.faint : AppColors.muted)),
      ],
    );
  }
}

/// One way to finish (standard load, overload, extra terms, credit, cross-institutional, combined).
class ScenarioTile extends StatelessWidget {
  const ScenarioTile(this.s, {super.key, this.showNeeds = false, this.highlight = false});
  final PlanScenario s;
  final bool showNeeds;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final late = s.finishesBeforeCoe == false || s.finishesBeforeVisa == false;
    return Container(
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: highlight ? AppColors.success.withValues(alpha: 0.45) : AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(s.label, style: AppText.heading.copyWith(fontSize: 12.5)),
              ),
              Text(
                s.finishBy == null ? 'Finish —' : 'Finish ${formatMonth(s.finishBy)}',
                style: AppText.small.copyWith(color: late ? AppColors.danger : (s.inTime ? AppColors.success : AppColors.fg)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            children: [
              if (s.unitsPerMainTerm != null) Text('${formatNum(s.unitsPerMainTerm)} units / term', style: AppText.tiny),
              if (s.termsNeeded != null) Text('${formatNum(s.termsNeeded)} terms to go', style: AppText.tiny),
              BeforeMark('Before CoE end', s.finishesBeforeCoe),
              BeforeMark('Before visa expiry', s.finishesBeforeVisa),
            ],
          ),
          if (showNeeds && s.needs.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (final n in s.needs)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Icon(LucideIcons.arrowRight, size: 10, color: AppColors.faint),
                    ),
                    const SizedBox(width: 6),
                    Expanded(child: Text(n, style: AppText.small)),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// The questions the engine still needs answered, with a button that asks them in the chat.
class MissingList extends StatelessWidget {
  const MissingList(this.missing, {super.key, this.max = 3});
  final List<PlanMissing> missing;
  final int max;

  @override
  Widget build(BuildContext context) {
    if (missing.isEmpty) return const SizedBox.shrink();
    final shown = missing.take(max).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final m in shown)
          Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Icon(LucideIcons.circleHelp, size: 12, color: AppColors.warning),
                ),
                const SizedBox(width: 7),
                Expanded(child: Text(m.question.isNotEmpty ? m.question : m.fact, style: AppText.small.copyWith(color: AppColors.fg))),
              ],
            ),
          ),
        if (missing.length > shown.length)
          Padding(
            padding: const EdgeInsets.only(bottom: 5, left: 19),
            child: Text('and ${missing.length - shown.length} more', style: AppText.tiny),
          ),
        const SizedBox(height: 6),
        SmallButton(
          label: 'Answer in chat',
          icon: LucideIcons.messageCircle,
          primary: true,
          onTap: () => askInChat(context, missingPrompt(missing)),
        ),
      ],
    );
  }
}

/// The Study home's progress card. Loads the plan once per session; tap "Refresh" to rebuild it.
class StudyProgressCard extends StatefulWidget {
  const StudyProgressCard({super.key});

  @override
  State<StudyProgressCard> createState() => _StudyProgressCardState();
}

class _StudyProgressCardState extends State<StudyProgressCard> {
  StudyPlanResult? _res;
  Object? _error;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _res = cachedStudyPlan;
    if (_res == null) _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await fetchStudyPlan();
      if (mounted) setState(() => _res = r);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final res = _res;
    return RepaintBoundary(
      child: Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(LucideIcons.graduationCap, size: 15, color: AppColors.brand),
                const SizedBox(width: 7),
                const Expanded(child: Text('My study progress', style: AppText.heading)),
                if (res != null && !_loading) PlanStatusPill(res.plan.status),
                if (_loading) const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 1.6, color: AppColors.muted)),
              ],
            ),
            const SizedBox(height: 10),
            if (res == null && _error != null) ...[
              Text("Couldn't work out your plan right now. ${errorText(_error!)}", style: AppText.small),
              const SizedBox(height: 10),
              SmallButton(label: 'Try again', icon: LucideIcons.rotateCw, onTap: _load),
            ] else if (res == null)
              const Text('Working out how you can finish your course on time…', style: AppText.small)
            else
              ..._body(context, res),
          ],
        ),
      ),
    );
  }

  List<Widget> _body(BuildContext context, StudyPlanResult res) {
    final p = res.plan;
    final best = p.best(2);
    return [
      Text(planHeadline(p), style: AppText.small.copyWith(color: AppColors.fg)),
      if (p.remainingUnits != null || p.remainingCredit != null || p.requiredUnitsPerTerm != null) ...[
        const SizedBox(height: 12),
        Row(
          children: [
            if (p.remainingUnits != null) Expanded(child: Stat(formatNum(p.remainingUnits), 'units left')),
            if (p.remainingCredit != null) Expanded(child: Stat(formatNum(p.remainingCredit), 'credit points left')),
            if (p.requiredUnitsPerTerm != null)
              Expanded(
                child: Stat(
                  formatNum(p.requiredUnitsPerTerm),
                  'units / term needed',
                  color: p.status == 'on_track' ? null : planStatusColor(p.status),
                ),
              ),
          ],
        ),
      ],
      if (best.isNotEmpty) ...[
        const SizedBox(height: 12),
        for (final (i, s) in best.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: ScenarioTile(s, highlight: i == 0 && s.inTime),
          ),
      ],
      if (p.missing.isNotEmpty) ...[
        const SizedBox(height: 8),
        MissingList(p.missing, max: 2),
      ],
      const SizedBox(height: 10),
      Row(
        children: [
          SmallButton(label: 'Full plan', icon: LucideIcons.listChecks, onTap: () => context.push('/study/plan')),
          const SizedBox(width: 8),
          SmallButton(label: 'Refresh', icon: LucideIcons.rotateCw, onTap: _load, busy: _loading),
        ],
      ),
    ];
  }
}
