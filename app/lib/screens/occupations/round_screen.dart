import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:web/web.dart' as web;

import '../../data/occupations.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../shell.dart' show PageHeader;
import '../study/widgets.dart';

/// The points score the user is checking rounds against, remembered on this device.
final checkPoints = ValueNotifier<int>(_readPoints());

int _readPoints() {
  try {
    final v = int.tryParse(web.window.localStorage.getItem('immi.points') ?? '');
    if (v != null && v >= 50 && v <= 140) return v;
  } catch (_) {}
  return 80;
}

void setCheckPoints(int v) {
  checkPoints.value = v.clamp(50, 140);
  try {
    web.window.localStorage.setItem('immi.points', '${checkPoints.value}');
  } catch (_) {}
}

/// One SkillSelect round: how many were invited, the cut-off of every occupation, and what a given
/// points score would have cleared.
class RoundScreen extends StatefulWidget {
  const RoundScreen({super.key, required this.subclass, required this.date});
  final String subclass;
  final DateTime date;

  @override
  State<RoundScreen> createState() => _RoundScreenState();
}

class _RoundScreenState extends State<RoundScreen> {
  RoundDetail? _d;
  Object? _error;
  bool _loaded = false;
  final _q = TextEditingController();
  bool _onlyCleared = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _loaded = false;
    });
    try {
      final d = await roundDetail(widget.date, widget.subclass);
      if (mounted) {
        setState(() {
          _d = d;
          _loaded = true;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loaded = true;
        });
      }
    }
  }

  String get _subclassLabel {
    final family = (_d?.round.subclassName ?? '').toLowerCase().contains('family');
    return 'Subclass ${widget.subclass}${family || widget.subclass == '491' ? ' (family sponsored)' : ''}';
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    return StudyPage(
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomGap(context)),
        children: [
          PageHeader(back: true, title: 'Round of ${formatDay(widget.date)}', subtitle: _subclassLabel),
          if (!_loaded)
            const LoadingBlock('Loading the round…')
          else if (_error != null)
            ErrorBlock(title: "Couldn't load the round", error: _error!, onRetry: _load)
          else if (d == null)
            Text('This round is not in the imported data.', style: AppText.small)
          else
            ..._body(d),
        ],
      ),
    );
  }

  List<Widget> _body(RoundDetail d) {
    final r = d.round;
    final cut = d.cutoffs;
    return [
      Panel(
        child: Row(
          children: [
            Expanded(child: Stat(r.invited == null ? '–' : formatCount(r.invited!), 'invited', color: AppColors.brand)),
            Expanded(child: Stat(formatCount(d.occupations.length), 'occupations')),
            Expanded(child: Stat(cut.isEmpty ? '–' : '${cut.first}', 'lowest cut-off')),
            Expanded(child: Stat(cut.isEmpty ? '–' : '${cut[cut.length ~/ 2]}', 'typical')),
          ],
        ),
      ),
      if (r.tieBreak != null || d.programYear != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            [
              if (d.programYear != null) 'Program year ${d.programYear}',
              if (r.tieBreak != null) 'Tie-break: people with the cut-off score were invited if they reached it by ${r.tieBreak}',
            ].join(' · '),
            style: AppText.small,
          ),
        ),
      if (cut.isNotEmpty) ...[
        const SectionLabel('Your points against this round'),
        ValueListenableBuilder<int>(valueListenable: checkPoints, builder: (context, points, _) => _pointsPanel(d, points)),
      ],
      SectionLabel('Occupations invited', trailing: Text(formatCount(d.occupations.length), style: AppText.tiny)),
      SearchBox(controller: _q, placeholder: 'Find an occupation', onChanged: (_) => setState(() {}), onClear: () => setState(() {})),
      const SizedBox(height: 8),
      Align(
        alignment: Alignment.centerLeft,
        child: ToggleChip(label: 'Only ones my points clear', on: _onlyCleared, onTap: () => setState(() => _onlyCleared = !_onlyCleared)),
      ),
      const SizedBox(height: 8),
      ValueListenableBuilder<int>(
        valueListenable: checkPoints,
        builder: (context, points, _) {
          final q = _q.text.trim().toLowerCase();
          final list = [
            for (final o in d.occupations)
              if ((q.isEmpty || o.title.toLowerCase().contains(q) || (o.anzsco ?? '').startsWith(q)) &&
                  (!_onlyCleared || (o.minPoints != null && o.minPoints! <= points)))
                o,
          ];
          if (list.isEmpty) return Text('No occupations match.', style: AppText.small);
          return Panel(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Column(children: [for (final o in list) _OccupationRow(o, points: points)]),
          );
        },
      ),
      if (d.occupations.any((o) => o.invited == null))
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            'Home Affairs publishes each occupation\'s cut-off for this round; invitation counts per occupation are shown where it '
            'published them. A score at the cut-off is invited only if it was reached by the tie-break date.',
            style: AppText.tiny,
          ),
        ),
      const SectionLabel('Source'),
      Pressable(
        onTap: () => openExternal(context, d.sourceUrl ?? previousRoundsUrl),
        child: Row(
          children: [
            const Icon(LucideIcons.link, size: 12, color: AppColors.muted),
            const SizedBox(width: 6),
            Expanded(child: Text('SkillSelect invitation rounds (Home Affairs)', style: AppText.small)),
          ],
        ),
      ),
    ];
  }

  Widget _pointsPanel(RoundDetail d, int points) {
    final cleared = d.clearedAt(points);
    final total = d.occupations.where((o) => o.minPoints != null).length;
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _StepButton(LucideIcons.minus, () => setCheckPoints(points - 5)),
              Expanded(
                child: Column(
                  children: [
                    Text('$points', style: AppText.display.copyWith(fontSize: 30)),
                    const Text('points', style: AppText.tiny),
                  ],
                ),
              ),
              _StepButton(LucideIcons.plus, () => setCheckPoints(points + 5)),
            ],
          ),
          const SizedBox(height: 12),
          Text.rich(
            TextSpan(
              style: AppText.body,
              children: [
                const TextSpan(text: 'At '),
                TextSpan(
                  text: '$points points',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const TextSpan(text: ' you met the cut-off for '),
                TextSpan(
                  text: '$cleared of $total',
                  style: TextStyle(fontWeight: FontWeight.w600, color: cleared == 0 ? AppColors.warning : AppColors.brand),
                ),
                const TextSpan(text: ' occupations invited in this round.'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          CutoffHistogram(histogram: d.histogram, points: points),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton(this.icon, this.onTap);
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    scale: 0.9,
    onTap: onTap,
    child: Container(
      width: 40,
      height: 40,
      decoration: const BoxDecoration(color: AppColors.raised, shape: BoxShape.circle),
      child: Icon(icon, size: 16, color: AppColors.fg),
    ),
  );
}

class _OccupationRow extends StatelessWidget {
  const _OccupationRow(this.o, {required this.points});
  final RoundOccupation o;
  final int points;

  @override
  Widget build(BuildContext context) {
    final cleared = o.minPoints != null && o.minPoints! <= points;
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(o.title, style: AppText.body.copyWith(fontSize: 12.5), maxLines: 2, overflow: TextOverflow.ellipsis),
                if (o.anzsco != null || o.invited != null)
                  Text(
                    [if (o.anzsco != null) 'ANZSCO ${o.anzsco}', if (o.invited != null) '${formatCount(o.invited!)} invited'].join(' · '),
                    style: AppText.tiny,
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: cleared ? AppColors.brand.withValues(alpha: 0.14) : AppColors.raised,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              o.minPoints == null ? '–' : '${o.minPoints}',
              style: AppText.small.copyWith(color: cleared ? AppColors.brand : AppColors.fg, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
    if (o.anzsco == null) return row;
    return Pressable(scale: 0.99, onTap: () => context.push('/jobs/occupation/${o.anzsco}'), child: row);
  }
}

/// How many occupations had each cut-off; bars at or under [points] are highlighted.
class CutoffHistogram extends StatelessWidget {
  const CutoffHistogram({super.key, required this.histogram, this.points, this.height = 56});
  final Map<int, int> histogram;
  final int? points;
  final double height;

  @override
  Widget build(BuildContext context) {
    if (histogram.isEmpty) return const SizedBox.shrink();
    final keys = histogram.keys.toList()..sort();
    final all = [for (var p = keys.first; p <= keys.last; p += 5) p];
    final top = histogram.values.reduce((a, b) => a > b ? a : b);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('OCCUPATIONS BY CUT-OFF', style: AppText.label),
        const SizedBox(height: 8),
        SizedBox(
          height: height + 30,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final p in all)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1.5),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          (histogram[p] ?? 0) == 0 ? '' : '${histogram[p]}',
                          style: AppText.tiny.copyWith(fontSize: 8.5, color: AppColors.fg),
                        ),
                        const SizedBox(height: 2),
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          height: (histogram[p] ?? 0) == 0 ? 2 : 4 + (height - 4) * histogram[p]! / top,
                          decoration: BoxDecoration(
                            color: (histogram[p] ?? 0) == 0
                                ? AppColors.raised
                                : (points != null && p <= points! ? AppColors.brand : AppColors.muted.withValues(alpha: 0.45)),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text('$p', style: AppText.tiny.copyWith(fontSize: 8.5)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The occupation cut-offs round by round: the middle one as a bar, the lowest and highest beside it.
class CutoffTrendChart extends StatelessWidget {
  const CutoffTrendChart({super.key, required this.rounds, this.height = 70, this.onTap});
  final List<RoundCutoffs> rounds; // oldest first
  final double height;
  final ValueChanged<RoundCutoffs>? onTap;

  static const _m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  @override
  Widget build(BuildContext context) {
    if (rounds.isEmpty) return const SizedBox.shrink();
    final shown = rounds.length > 12 ? rounds.sublist(rounds.length - 12) : rounds;
    const floor = 60;
    final ceil = shown.map((r) => r.median).reduce((a, b) => a > b ? a : b);
    return SizedBox(
      height: height + 44,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final r in shown)
            Expanded(
              child: Pressable(
                scale: 0.95,
                onTap: onTap == null ? null : () => onTap!(r),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text('${r.median}', style: AppText.tiny.copyWith(fontSize: 9, color: AppColors.fg)),
                      const SizedBox(height: 2),
                      Container(
                        height: 4 + (height - 4) * (r.median - floor).clamp(0, 999) / (ceil - floor).clamp(1, 999),
                        decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(3)),
                      ),
                      const SizedBox(height: 3),
                      Text('${r.lowest}', style: AppText.tiny.copyWith(fontSize: 8, color: AppColors.faint)),
                      Text(
                        "${_m[r.date.month - 1]} '${(r.date.year % 100).toString().padLeft(2, '0')}",
                        style: AppText.tiny.copyWith(fontSize: 8),
                        maxLines: 1,
                        overflow: TextOverflow.clip,
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
