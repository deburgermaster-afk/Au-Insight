import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../data/occupations.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../study/widgets.dart';

// Invitation rounds in plain numbers: the latest round, invitations per round (marking the rounds that
// invited this occupation), state and territory nominations, and how long a visa takes after an invitation.

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _short(int n) => n >= 1000 ? '${(n / 1000).toStringAsFixed(n >= 10000 || n % 1000 == 0 ? 0 : 1)}k' : '$n';

String _days(int d) {
  if (d < 90) return '$d days';
  final m = d / 30.4;
  return m < 24 ? '${m.round()} months' : '${(m / 12).toStringAsFixed(1)} years';
}

/// The newest round for a subclass, how many it invited, and where this occupation stood in it.
class LatestRoundCard extends StatelessWidget {
  const LatestRoundCard({super.key, required this.published, required this.mine, required this.subclass, this.nextRound});
  final List<InvitationRound> published; // every round, newest first
  final List<RoundEntry> mine; // this occupation's rounds for the subclass, newest first
  final String subclass;
  final DateTime? nextRound;

  @override
  Widget build(BuildContext context) {
    final rounds = published.where((r) => r.subclass == subclass && (r.invited ?? 0) > 0).toList();
    final latest = rounds.firstOrNull;
    if (latest == null) return const SizedBox.shrink();
    final hit = mine.where((r) => r.date == latest.date).firstOrNull;
    final year = programYear(latest.date);
    final yearTotal = rounds.where((r) => programYear(r.date) == year).fold<int>(0, (a, r) => a + (r.invited ?? 0));
    final yearRounds = rounds.where((r) => programYear(r.date) == year).length;
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('Latest $subclass round · ${formatDay(latest.date)}', style: AppText.heading.copyWith(fontSize: 13))),
              Tag(hit != null ? 'Invited' : 'Not invited', color: hit != null ? AppColors.success : AppColors.muted),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: Stat(formatThousands(latest.invited!), 'people invited in the round (all occupations)', color: AppColors.brand)),
              const SizedBox(width: 10),
              Expanded(child: Stat(hit?.minPoints?.toString() ?? '–', hit == null ? 'this occupation was not in the round' : 'lowest points invited for this occupation')),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            [
              if (hit?.invited != null) '${formatThousands(hit!.invited!)} invited in this occupation.',
              if (latest.tieBreak != null) 'Tie-break: ${latest.tieBreak}.',
              '$year so far: ${formatThousands(yearTotal)} invited across $yearRounds round${yearRounds == 1 ? '' : 's'}.',
            ].join(' '),
            style: AppText.small,
          ),
          if (nextRound != null && nextRound!.isAfter(latest.date)) ...[
            const SizedBox(height: 10),
            Builder(
              builder: (context) {
                final (label, pending) = nextRoundLabel(nextRound!, published, subclass: subclass, prefix: '$subclass ');
                return Tag(label, icon: LucideIcons.clock, color: pending ? AppColors.warning : AppColors.brand);
              },
            ),
          ],
        ],
      ),
    );
  }
}

/// Invitations per round for a subclass as bars with the count above. Rounds that invited this
/// occupation are bright; the rest are grey.
class InvitedPerRoundChart extends StatelessWidget {
  const InvitedPerRoundChart({super.key, required this.published, required this.mine, required this.subclass, this.height = 70});
  final List<InvitationRound> published;
  final List<RoundEntry> mine;
  final String subclass;
  final double height;

  @override
  Widget build(BuildContext context) {
    final rounds = published.where((r) => r.subclass == subclass && (r.invited ?? 0) > 0).take(10).toList().reversed.toList();
    if (rounds.length < 2) return const SizedBox.shrink();
    final invitedOn = {for (final r in mine) r.date};
    final top = rounds.map((r) => r.invited!).reduce((a, b) => a > b ? a : b);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ChartTitle(
          'How many people were invited in each round (subclass $subclass)',
          'All occupations combined. Green bars are rounds that invited this occupation; grey bars are rounds that did not include it.',
        ),
        SizedBox(
          height: height + 32,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final r in rounds)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(_short(r.invited!), style: AppText.tiny.copyWith(fontSize: 9, color: AppColors.fg)),
                        const SizedBox(height: 3),
                        Container(
                          height: 4 + (height - 4) * r.invited! / top,
                          decoration: BoxDecoration(
                            color: invitedOn.contains(r.date) ? AppColors.brand : AppColors.raised,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text("${_months[r.date.month - 1].substring(0, 1)}'${r.date.year % 100}", style: AppText.tiny.copyWith(fontSize: 8.5)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            _legend(AppColors.brand, 'This occupation invited'),
            const SizedBox(width: 14),
            _legend(AppColors.raised, 'Not invited'),
          ],
        ),
      ],
    );
  }
}

Widget _legend(Color c, String label) => Row(
  mainAxisSize: MainAxisSize.min,
  children: [
    Container(width: 9, height: 9, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
    const SizedBox(width: 5),
    Text(label, style: AppText.tiny),
  ],
);

/// One round of this occupation: date, subclass, how many were invited, minimum points.
class RoundRow extends StatelessWidget {
  const RoundRow({super.key, required this.round, this.total, this.tieBreak});
  final RoundEntry round;
  final int? total; // everyone invited in the round
  final String? tieBreak;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(formatDay(round.date), style: AppText.body.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(
                [
                  'Subclass ${round.subclass}',
                  if (total != null) '${formatThousands(total!)} invited in total',
                  if (round.invited != null) '${formatThousands(round.invited!)} in this job',
                  if (tieBreak != null) 'tie-break $tieBreak',
                ].join(' · '),
                style: AppText.tiny,
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(round.minPoints == null ? 'Invited' : '${round.minPoints}', style: AppText.heading.copyWith(fontSize: 15)),
            if (round.minPoints != null) Text('min points', style: AppText.tiny),
          ],
        ),
      ],
    ),
  );
}

/// State and territory nominations issued this program year, as bars per state with a 190 / 491 switch.
/// These are all occupations together: Home Affairs does not publish them by occupation.
class StateNominationsCard extends StatefulWidget {
  const StateNominationsCard({super.key, required this.nominations});
  final List<StateNomination> nominations;

  @override
  State<StateNominationsCard> createState() => _StateNominationsCardState();
}

class _StateNominationsCardState extends State<StateNominationsCard> {
  String _sub = '190';

  static int? _count(String v) => int.tryParse(v.replaceAll(',', '').trim());

  @override
  Widget build(BuildContext context) {
    final years = widget.nominations.map((n) => n.programYear ?? '').toSet().toList()..sort();
    final year = years.lastOrNull ?? '';
    final rows = widget.nominations.where((n) => (n.programYear ?? '') == year).toList();
    final subs = rows.map((n) => n.subclass).toSet().toList()..sort();
    if (rows.isEmpty) return const SizedBox.shrink();
    final sub = subs.contains(_sub) ? _sub : subs.first;
    final mine = rows.where((n) => n.subclass == sub).toList()
      ..sort((a, b) => (_count(b.nominations) ?? 2).compareTo(_count(a.nominations) ?? 2));
    final top = mine.map((n) => _count(n.nominations) ?? 0).fold<int>(1, (a, b) => b > a ? b : a);
    final total = mine.map((n) => _count(n.nominations) ?? 0).fold<int>(0, (a, b) => a + b);
    final hasSmall = mine.any((n) => _count(n.nominations) == null);
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ChartTitle(
            'Nominations issued by each state and territory',
            'How many people each state nominated this program year, all occupations together. Switch between 190 (permanent) and 491 (regional).',
          ),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [for (final s in subs) ToggleChip(label: s, on: s == sub, onTap: () => setState(() => _sub = s))],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: Stat('${formatThousands(total)}${hasSmall ? '+' : ''}', 'nominations, subclass $sub', color: AppColors.brand)),
              Expanded(child: Stat(year.isEmpty ? '–' : year, 'program year')),
            ],
          ),
          if (mine.first.asOf != null) ...[const SizedBox(height: 4), Text('Issued ${mine.first.asOf}', style: AppText.tiny)],
          const SizedBox(height: 12),
          for (final n in mine)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  SizedBox(width: 38, child: Text(n.state, style: AppText.small.copyWith(color: AppColors.fg))),
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, c) {
                        final v = _count(n.nominations);
                        final w = v == null ? 3.0 : (v == 0 ? 2.0 : 4 + (c.maxWidth - 4) * v / top);
                        return Align(
                          alignment: Alignment.centerLeft,
                          child: Container(
                            width: w,
                            height: 12,
                            decoration: BoxDecoration(
                              color: (v ?? 0) > 0 ? AppColors.brand : AppColors.raised,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 44,
                    child: Text(n.nominations, textAlign: TextAlign.right, style: AppText.small.copyWith(color: AppColors.fg)),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Text(
            'All occupations together: Home Affairs publishes nominations by state, not by occupation. "<5" means fewer than five.',
            style: AppText.tiny.copyWith(color: AppColors.faint),
          ),
        ],
      ),
    );
  }
}

/// How long a visa takes once invited: 60 days to lodge, then Home Affairs' published processing times
/// (half decided within / 90% decided within) as bars on one scale.
class ProcessingAfterInviteCard extends StatelessWidget {
  const ProcessingAfterInviteCard({super.key, required this.routes});
  final List<PathwayRoute> routes;

  @override
  Widget build(BuildContext context) {
    final rows = <(String, String, int, int)>[
      for (final v in ['189', '190', '491'])
        for (final r in routes.where((r) => r.visa == v && r.open && r.p50Days != null && r.p90Days != null)) ...[
          (v, v == '491' ? 'State nominated' : (v == '189' ? 'Skilled Independent' : 'State nominated'), r.p50Days!, r.p90Days!),
          if (v == '491' && r.familyP50Days != null && r.familyP90Days != null) (v, 'Family sponsored', r.familyP50Days!, r.familyP90Days!),
        ],
    ];
    if (rows.isEmpty) return const SizedBox.shrink();
    final top = rows.map((r) => r.$4).reduce((a, b) => a > b ? a : b);
    final updated = routes.map((r) => r.updated).whereType<String>().firstOrNull;
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ChartTitle(
            'How long the visa takes after you apply',
            'Bright part: half of applications are decided within this time. Faded part: 90% are decided within it.',
          ),
          Row(
            children: [
              const Icon(LucideIcons.calendarClock, size: 14, color: AppColors.brand),
              const SizedBox(width: 6),
              Expanded(child: Text('Lodge your visa within 60 days of the invitation', style: AppText.body.copyWith(fontSize: 12.5))),
            ],
          ),
          const SizedBox(height: 12),
          for (final (visa, name, p50, p90) in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      SizedBox(width: 40, child: Tag(visa, color: AppColors.brand)),
                      const SizedBox(width: 6),
                      Expanded(child: Text(name, style: AppText.small.copyWith(color: AppColors.fg))),
                      Text('${_days(p50)} – ${_days(p90)}', style: AppText.small.copyWith(color: AppColors.fg)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  LayoutBuilder(
                    builder: (context, c) => Stack(
                      children: [
                        Container(height: 10, decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(3))),
                        Container(
                          width: c.maxWidth * p90 / top,
                          height: 10,
                          decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(3)),
                        ),
                        Container(
                          width: c.maxWidth * p50 / top,
                          height: 10,
                          decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(3)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          Row(
            children: [
              _legend(AppColors.brand, 'Half decided within'),
              const SizedBox(width: 14),
              _legend(AppColors.brand.withValues(alpha: 0.35), '90% decided within'),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Home Affairs global processing times${updated == null ? '' : ', updated $updated'}. Time is counted from lodging the visa.',
            style: AppText.tiny.copyWith(color: AppColors.faint),
          ),
        ],
      ),
    );
  }
}

/// A chart title with a one-line plain-English explanation underneath.
class ChartTitle extends StatelessWidget {
  const ChartTitle(this.title, this.caption, {super.key});
  final String title;
  final String caption;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(title, style: AppText.heading.copyWith(fontSize: 13)),
      const SizedBox(height: 3),
      Text(caption, style: AppText.tiny),
      const SizedBox(height: 10),
    ],
  );
}

EoiMonth? _monthOf(List<EoiMonth> months, DateTime d) => months.where((m) => m.asAt.year == d.year && m.asAt.month == d.month).firstOrNull;

/// What happened to this occupation's EOIs around each round, from the SkillSelect EOI dashboard's
/// month-end snapshots: how many held an invitation at the end of the round's month, and how the count
/// of lodged visa applications (lodged, not yet decided) moved over the 60 days people have to apply.
class AfterRoundsCard extends StatelessWidget {
  const AfterRoundsCard({super.key, required this.subclass, required this.mine, required this.published, required this.stream, this.title});
  final String subclass;
  final List<RoundEntry> mine; // this occupation's rounds for the subclass, newest first
  final List<InvitationRound> published;
  final EoiStream stream;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final months = stream.byMonth;
    if (months.length < 2) return const SizedBox.shrink();
    final first = months.first.asAt;
    final rounds = mine.where((r) => !DateTime(r.date.year, r.date.month).isBefore(DateTime(first.year, first.month))).toList();
    final shown = months.length > 12 ? months.sublist(months.length - 12) : months;
    final roundMonths = {for (final r in mine) DateTime(r.date.year, r.date.month)};
    final top = shown.expand((m) => [m['INVITED'].floor, m['LODGED'].floor]).fold<int>(20, (a, b) => b > a ? b : a);
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ChartTitle(
            title ?? 'Invited and lodged each month, subclass $subclass',
            'This occupation only. Each pair of bars is the count on the last day of the month: holding an invitation (not used yet) and visa lodged (waiting for a decision). ▲ marks a month with a round.',
          ),
          SizedBox(
            height: 112,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final m in shown)
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [_bar(m['INVITED'], top, AppColors.brand), const SizedBox(width: 1.5), _bar(m['LODGED'], top, AppColors.success.withValues(alpha: 0.75))],
                        ),
                        const SizedBox(height: 4),
                        Text(_months[m.asAt.month - 1].substring(0, 1), style: AppText.tiny.copyWith(fontSize: 8.5)),
                        Text(
                          roundMonths.contains(DateTime(m.asAt.year, m.asAt.month)) ? '▲' : ' ',
                          style: AppText.tiny.copyWith(fontSize: 8, color: AppColors.warning, height: 1),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 14,
            runSpacing: 4,
            children: [
              _legend(AppColors.brand, 'Holding an invitation'),
              _legend(AppColors.success.withValues(alpha: 0.75), 'Visa lodged, waiting'),
              Text('▲ round month', style: AppText.tiny.copyWith(color: AppColors.warning)),
            ],
          ),
          if (rounds.isNotEmpty) ...[
            const Divider(color: AppColors.border, height: 24),
            const Text('ROUND BY ROUND, THIS OCCUPATION', style: AppText.label),
            const SizedBox(height: 6),
            for (final r in rounds) _roundRow(r, months),
            const SizedBox(height: 4),
            Text(
              'Home Affairs does not publish grants per round. A lodged count that rises after a round means invitees applied; it falls again as applications are decided.',
              style: AppText.tiny.copyWith(color: AppColors.faint),
            ),
          ],
        ],
      ),
    );
  }

  Widget _bar(EoiCount c, int top, Color color) {
    final v = c.value;
    final h = v == null ? 10.0 : (v == 0 ? 2.0 : 3 + 70 * v / top);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(v == null ? '<20' : (v == 0 ? '' : '$v'), style: AppText.tiny.copyWith(fontSize: 7, color: AppColors.fg)),
        const SizedBox(height: 1),
        Container(
          width: 7,
          height: h,
          decoration: BoxDecoration(color: v == null ? color.withValues(alpha: 0.35) : (v == 0 ? AppColors.raised : color), borderRadius: BorderRadius.circular(2)),
        ),
      ],
    );
  }

  Widget _roundRow(RoundEntry r, List<EoiMonth> months) {
    final total = roundTotal(published, r.date, r.subclass);
    final at = _monthOf(months, r.date);
    final before = _monthOf(months, DateTime(r.date.year, r.date.month - 1));
    final after = [for (var k = 0; k <= 2; k++) _monthOf(months, DateTime(r.date.year, r.date.month + k))].whereType<EoiMonth>().toList();
    String monthCount(EoiMonth m) => '${_months[m.asAt.month - 1]} ${m['LODGED'].text}';
    final lodgedPath = [if (before != null) monthCount(before), for (final m in after) monthCount(m)];
    final b = before?['LODGED'].value;
    final peak = after.map((m) => m['LODGED'].value).whereType<int>().fold<int?>(null, (a, v) => a == null || v > a ? v : a);
    final rise = b != null && peak != null && peak > b ? peak - b : null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('${formatDay(r.date)} · subclass ${r.subclass}', style: AppText.body.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600))),
              if (r.minPoints != null) Text('${r.minPoints} pts minimum', style: AppText.small.copyWith(color: AppColors.fg)),
            ],
          ),
          const SizedBox(height: 4),
          _fact('Invited in the round', total == null ? '–' : '${formatThousands(total)} (all occupations)'),
          _fact('Holding an invitation, end of ${_months[r.date.month - 1]}', at == null ? 'no data' : at['INVITED'].text),
          _fact('Visas lodged, waiting', lodgedPath.length < 2 ? 'no data' : lodgedPath.join(' → ')),
          if (rise != null) _fact('Rise after the round (invitees who applied)', '+$rise'),
        ],
      ),
    );
  }

  Widget _fact(String label, String value) => Padding(
    padding: const EdgeInsets.only(top: 2),
    child: Row(
      children: [
        Expanded(child: Text(label, style: AppText.tiny)),
        Text(value, style: AppText.tiny.copyWith(color: AppColors.fg)),
      ],
    ),
  );
}
