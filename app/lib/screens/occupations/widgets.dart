import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../data/occupations.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../study/widgets.dart';

// Building blocks shared by the Jobs pages.

Color shortageColor(String? rating) => switch (shortageTone(rating)) {
  ShortageTone.shortage => AppColors.success,
  ShortageTone.partial => AppColors.warning,
  ShortageTone.none => AppColors.muted,
  ShortageTone.unknown => AppColors.faint,
};

void openOccupation(BuildContext context, String anzsco) => context.push('/jobs/occupation/$anzsco');

/// A search result or ranked occupation.
class OccupationCard extends StatelessWidget {
  const OccupationCard({super.key, required this.o, this.showWhy = false});
  final OccupationSummary o;
  final bool showWhy;

  @override
  Widget build(BuildContext context) {
    final shortage = o.shortageState ?? o.shortageNational;
    return Pressable(
      onTap: () => openOccupation(context, o.anzsco),
      scale: 0.985,
      child: Panel(
        padding: const EdgeInsets.all(13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(o.title, style: AppText.heading.copyWith(fontSize: 13.5), maxLines: 2, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      Text(
                        'ANZSCO ${o.code}${o.authorities.isEmpty ? '' : ' · ${o.authorities.take(2).join(', ')}'}',
                        style: AppText.tiny,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                if (o.lastMinPoints != null) ...[const SizedBox(width: 10), _Points(o.lastMinPoints!, o.lastInvitedRound)],
              ],
            ),
            const SizedBox(height: 9),
            Wrap(
              spacing: 5,
              runSpacing: 5,
              children: [
                for (final l in o.lists) Tag(l, color: l == 'MLTSSL' ? AppColors.brand : null),
                if (shortage != null) Tag(shortage, color: shortageColor(shortage)),
                if (o.roundsInvited12m != null && o.roundsInvited12m! > 0)
                  Tag('Invited in ${plural(o.roundsInvited12m!, 'round')} (12 mo)', icon: LucideIcons.mailCheck, color: AppColors.success),
                if (o.medianWeeklyEarnings != null) Tag('\$${formatCount(o.medianWeeklyEarnings!)}/wk median'),
              ],
            ),
            if (showWhy && o.why != null) ...[const SizedBox(height: 8), Text(o.why!, style: AppText.small)],
          ],
        ),
      ),
    );
  }
}

class _Points extends StatelessWidget {
  const _Points(this.points, this.when);
  final int points;
  final DateTime? when; // the round that set it

  @override
  Widget build(BuildContext context) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final old = when != null && DateTime.now().difference(when!).inDays > 365;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(10)),
      child: Column(
        children: [
          Text('$points', style: AppText.heading.copyWith(fontSize: 15, color: old ? AppColors.muted : null)),
          Text(when == null ? 'min pts' : "min · ${m[when!.month - 1]} '${when!.year % 100}", style: AppText.tiny.copyWith(fontSize: 9)),
        ],
      ),
    );
  }
}

/// A row of minimum points per round, newest on the right, as a tiny bar chart.
class PointsTrend extends StatelessWidget {
  const PointsTrend({super.key, required this.rounds, this.height = 64});
  final List<RoundEntry> rounds; // newest first
  final double height;

  @override
  Widget build(BuildContext context) {
    final pts = rounds.where((r) => r.minPoints != null).take(12).toList().reversed.toList();
    if (pts.length < 2) return const SizedBox.shrink();
    final lo = pts.map((r) => r.minPoints!).reduce((a, b) => a < b ? a : b) - 5;
    final hi = pts.map((r) => r.minPoints!).reduce((a, b) => a > b ? a : b);
    final span = (hi - lo).clamp(1, 1000);
    return SizedBox(
      height: height + 30,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final r in pts)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text('${r.minPoints}', style: AppText.tiny.copyWith(fontSize: 9, color: AppColors.fg)),
                    const SizedBox(height: 3),
                    Container(
                      height: 6 + (height - 6) * (r.minPoints! - lo) / span,
                      decoration: BoxDecoration(
                        color: r == pts.last ? AppColors.brand : AppColors.raised,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "${const ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][r.date.month - 1]}'${r.date.year % 100}",
                      style: AppText.tiny.copyWith(fontSize: 8.5),
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

/// An arrow for a change: for points, up is harder (red) and down is easier (green); for invitations, up is
/// better (green).
class TrendArrow extends StatelessWidget {
  const TrendArrow(this.trend, {super.key, this.upIsGood = false, this.label});
  final Trend trend;
  final bool upIsGood;
  final String? label;

  @override
  Widget build(BuildContext context) {
    if (trend == Trend.none) return const SizedBox(width: 14);
    final good = trend == Trend.steady ? null : (trend == Trend.up) == upIsGood;
    final color = good == null ? AppColors.muted : (good ? AppColors.success : AppColors.danger);
    final icon = switch (trend) {
      Trend.up => LucideIcons.arrowUpRight,
      Trend.down => LucideIcons.arrowDownRight,
      _ => LucideIcons.arrowRight,
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        if (label != null) ...[
          const SizedBox(width: 2),
          Text(
            label!,
            style: AppText.tiny.copyWith(color: color, fontWeight: FontWeight.w600),
          ),
        ],
      ],
    );
  }
}

/// Year by year for one occupation: rounds that invited it out of the rounds held, the minimum points range,
/// and the change in the lowest points from the year before.
class YearTrendTable extends StatelessWidget {
  const YearTrendTable({super.key, required this.rows, required this.subclass});
  final List<YearTrend> rows;
  final String subclass;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('By program year, subclass $subclass', style: AppText.small),
        const SizedBox(height: 6),
        for (final r in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                SizedBox(width: 62, child: Text(r.year, style: AppText.body.copyWith(fontSize: 12.5))),
                Expanded(
                  child: Text(
                    r.invitedIn == 0
                        ? (r.roundsHeld == 0 ? 'No rounds' : 'Not invited (${plural(r.roundsHeld, 'round')})')
                        : 'Invited in ${r.invitedIn} of ${r.roundsHeld < r.invitedIn ? r.invitedIn : r.roundsHeld}',
                    style: AppText.small.copyWith(color: r.invitedIn == 0 ? AppColors.faint : null),
                  ),
                ),
                Text(
                  r.lowest == null
                      ? '–'
                      : (r.highest != null && r.highest != r.lowest ? '${r.lowest}–${r.highest} pts' : '${r.lowest} pts'),
                  style: AppText.body.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 44,
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: TrendArrow(r.trend, label: r.change == null || r.change == 0 ? null : '${r.change! > 0 ? '+' : ''}${r.change}'),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 4),
        Text(
          'Arrows compare the lowest minimum points with the previous year it was invited: up means it needed more points.',
          style: AppText.tiny,
        ),
      ],
    );
  }
}

/// Year by year for a subclass overall: rounds, invitations (with the change from the year before) and the
/// lowest points any occupation needed.
class RoundYearTable extends StatelessWidget {
  const RoundYearTable({super.key, required this.rows});
  final List<RoundYear> rows;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (final r in rows)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              SizedBox(width: 62, child: Text(r.year, style: AppText.body.copyWith(fontSize: 12.5))),
              Expanded(
                child: Text(
                  '${plural(r.rounds, 'round')}${r.lowestPoints != null ? ' · from ${r.lowestPoints} pts' : ''}',
                  style: AppText.small,
                ),
              ),
              Text(formatCount(r.invited), style: AppText.body.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600)),
              const SizedBox(width: 8),
              SizedBox(
                width: 52,
                child: Align(
                  alignment: Alignment.centerRight,
                  child: TrendArrow(
                    r.trend,
                    upIsGood: true,
                    label: r.changePct == null ? null : '${r.changePct! > 0 ? '+' : ''}${r.changePct}%',
                  ),
                ),
              ),
            ],
          ),
        ),
    ],
  );
}

/// Type-ahead suggestions under the search box.
class SuggestionList extends StatelessWidget {
  const SuggestionList({super.key, required this.items, required this.onPick});
  final List<OccupationSuggestion> items;
  final ValueChanged<OccupationSuggestion> onPick;

  @override
  Widget build(BuildContext context) => Panel(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final s in items)
          Pressable(
            onTap: () => onPick(s),
            scale: 0.99,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
              child: Row(
                children: [
                  const Icon(LucideIcons.briefcaseBusiness, size: 14, color: AppColors.muted),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.title,
                          style: AppText.body.copyWith(fontSize: 13, fontWeight: FontWeight.w600),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          [s.hint ?? 'ANZSCO ${s.code}', if (s.lists.isNotEmpty) s.lists.join(' · '), ?s.shortage].join(' · '),
                          style: AppText.tiny,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  if (s.lastMinPoints != null) ...[
                    const SizedBox(width: 8),
                    Text('${s.lastMinPoints} pts', style: AppText.small.copyWith(color: AppColors.fg)),
                  ],
                ],
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(13, 4, 13, 6),
          child: Text(
            'From the Home Affairs skilled occupation list and Jobs and Skills Australia',
            style: AppText.tiny.copyWith(color: AppColors.faint),
          ),
        ),
      ],
    ),
  );
}
