import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../data/occupations.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../study/widgets.dart';
import 'round_screen.dart' show checkPoints, setCheckPoints;

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
String _monthYear(DateTime d) => '${_months[d.month - 1]} ${d.year}';

/// Who else is in the SkillSelect pool: EOIs waiting, invited and lodged for each visa stream, how
/// many are at or above a points score, and how the queue moved month by month.
class EoiPoolCard extends StatefulWidget {
  const EoiPoolCard({super.key, required this.pool, this.title});
  final EoiPool pool;

  /// Shown above the numbers, e.g. the occupation.
  final String? title;

  @override
  State<EoiPoolCard> createState() => _EoiPoolCardState();
}

class _EoiPoolCardState extends State<EoiPoolCard> {
  int _stream = 0;

  @override
  Widget build(BuildContext context) {
    final pool = widget.pool;
    final s = pool.streams[_stream.clamp(0, pool.streams.length - 1)];
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (pool.streams.length > 1) ...[
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final (i, x) in pool.streams.indexed)
                  ToggleChip(label: x.short, on: i == _stream, onTap: () => setState(() => _stream = i)),
              ],
            ),
            const SizedBox(height: 12),
          ],
          Row(
            children: [
              Expanded(child: Stat(s.byStatus['SUBMITTED']?.text ?? '0', 'waiting', color: AppColors.brand)),
              Expanded(child: Stat(s.byStatus['INVITED']?.text ?? '0', 'holding an invite')),
              Expanded(child: Stat(s.byStatus['LODGED']?.text ?? '0', 'lodged a visa')),
            ],
          ),
          if (pool.asAt != null) ...[
            const SizedBox(height: 6),
            Text('EOIs in SkillSelect on ${formatDay(pool.asAt!)}', style: AppText.tiny),
          ],
          if (s.byPoints.isNotEmpty) ...[
            const SizedBox(height: 14),
            ValueListenableBuilder<int>(valueListenable: checkPoints, builder: (context, points, _) => _queue(s, points)),
          ],
          if (s.byMonth.length >= 2) ...[
            const SizedBox(height: 14),
            const Text('WAITING EOIS, MONTH BY MONTH', style: AppText.label),
            const SizedBox(height: 8),
            _MonthTrend(months: s.byMonth.length > 12 ? s.byMonth.sublist(s.byMonth.length - 12) : s.byMonth),
          ],
        ],
      ),
    );
  }

  Widget _queue(EoiStream s, int points) {
    final (above, aboveMin) = s.waitingAbove(points);
    final (at, atMin) = s.waitingAt(points);
    String n(int v, bool min) => min ? '${formatThousands(v)}+' : formatThousands(v);
    final top = s.byPoints.map((r) => r['SUBMITTED'].floor).fold<int>(1, (a, b) => b > a ? b : a);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(child: Text('WAITING EOIS BY POINTS', style: AppText.label)),
            _Step(LucideIcons.minus, () => setCheckPoints(points - 5)),
            SizedBox(
              width: 58,
              child: Text('$points pts', textAlign: TextAlign.center, style: AppText.heading.copyWith(fontSize: 13)),
            ),
            _Step(LucideIcons.plus, () => setCheckPoints(points + 5)),
          ],
        ),
        const SizedBox(height: 8),
        Text.rich(
          TextSpan(
            style: AppText.body,
            children: [
              TextSpan(text: n(above, aboveMin), style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.warning)),
              TextSpan(text: ' waiting with more points than $points, and '),
              TextSpan(text: n(at, atMin), style: const TextStyle(fontWeight: FontWeight.w600)),
              const TextSpan(text: ' at exactly '),
              TextSpan(text: '$points'),
              const TextSpan(text: '. Invitations go highest score first, then by the date the score was reached.'),
            ],
          ),
        ),
        const SizedBox(height: 10),
        for (final r in s.byPoints.reversed)
          if (r['SUBMITTED'].floor > 0 || r['SUBMITTED'].hidden)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  SizedBox(
                    width: 34,
                    child: Text(
                      '${r.points}',
                      style: AppText.small.copyWith(
                        color: r.points == points ? AppColors.fg : AppColors.muted,
                        fontWeight: r.points == points ? FontWeight.w700 : FontWeight.w400,
                      ),
                    ),
                  ),
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, c) => Align(
                        alignment: Alignment.centerLeft,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          height: 10,
                          width: (c.maxWidth * (r['SUBMITTED'].floor / top)).clamp(3, c.maxWidth),
                          decoration: BoxDecoration(
                            color: r.points > points
                                ? AppColors.warning.withValues(alpha: 0.75)
                                : (r.points == points ? AppColors.fg : AppColors.muted.withValues(alpha: 0.35)),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 52,
                    child: Text(r['SUBMITTED'].text, textAlign: TextAlign.right, style: AppText.small.copyWith(color: AppColors.fg)),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step(this.icon, this.onTap);
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    scale: 0.9,
    onTap: onTap,
    child: Container(
      width: 28,
      height: 28,
      decoration: const BoxDecoration(color: AppColors.raised, shape: BoxShape.circle),
      child: Icon(icon, size: 13, color: AppColors.fg),
    ),
  );
}

/// Waiting EOIs at the end of each month (bars), with how many held an invitation (under them).
class _MonthTrend extends StatelessWidget {
  const _MonthTrend({required this.months});
  final List<EoiMonth> months;

  static String _short(int n) => n >= 1000 ? '${(n / 1000).toStringAsFixed(n >= 10000 ? 0 : 1)}k' : '$n';

  @override
  Widget build(BuildContext context) {
    const height = 54.0;
    final top = months.map((m) => m['SUBMITTED'].floor).fold<int>(1, (a, b) => b > a ? b : a);
    return SizedBox(
      height: height + 44,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final m in months)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 1.5),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      m['SUBMITTED'].hidden ? '<20' : _short(m['SUBMITTED'].floor),
                      style: AppText.tiny.copyWith(fontSize: 8, color: AppColors.fg),
                      maxLines: 1,
                    ),
                    const SizedBox(height: 2),
                    Container(
                      height: 3 + (height - 3) * m['SUBMITTED'].floor / top,
                      decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(3)),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      m['INVITED'].floor > 0 ? _short(m['INVITED'].floor) : '',
                      style: AppText.tiny.copyWith(fontSize: 8, color: AppColors.warning),
                      maxLines: 1,
                    ),
                    Text(_months[m.asAt.month - 1].substring(0, 1), style: AppText.tiny.copyWith(fontSize: 8)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The section for a page: heading, card, the caveats and the source.
List<Widget> eoiSection(BuildContext context, EoiPool pool, {required String heading}) => [
  SectionLabel(heading, trailing: pool.asAt == null ? null : Text(_monthYear(pool.asAt!), style: AppText.tiny)),
  EoiPoolCard(pool: pool),
  const SizedBox(height: 6),
  Text(
    'Counts are expressions of interest (EOIs), not people: one person can lodge several, and an EOI counts once for each '
    'visa it selects. Numbers under the bars in orange are EOIs holding an invitation at the end of that month. Counts '
    'under 20 are published as "<20".',
    style: AppText.tiny,
  ),
  Pressable(
    onTap: () => openExternal(context, pool.sourceUrl ?? eoiDashboardUrl),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          const Icon(LucideIcons.link, size: 12, color: AppColors.muted),
          const SizedBox(width: 6),
          Expanded(child: Text('SkillSelect EOI data (Department of Employment and Workplace Relations)', style: AppText.small)),
        ],
      ),
    ),
  ),
];
