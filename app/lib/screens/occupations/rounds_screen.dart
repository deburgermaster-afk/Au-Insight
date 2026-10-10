import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../data/occupations.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../shell.dart' show PageHeader;
import '../study/widgets.dart';

/// SkillSelect invitation rounds (newest first), the next round, and state and territory nominations.
class RoundsScreen extends StatefulWidget {
  const RoundsScreen({super.key});

  @override
  State<RoundsScreen> createState() => _RoundsScreenState();
}

class _RoundsScreenState extends State<RoundsScreen> {
  RoundsOverview? _o;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final o = await latestRounds(limit: 40);
      if (mounted) setState(() => _o = o);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _o;
    return StudyPage(
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomGap(context)),
        children: [
          const PageHeader(back: true, title: 'Invitation rounds', subtitle: 'SkillSelect results published by Home Affairs'),
          if (o == null && _error == null)
            const LoadingBlock('Loading rounds…')
          else if (o == null)
            ErrorBlock(title: "Couldn't load the rounds", error: _error!, onRetry: _load)
          else ...[
            if (o.nextRound != null)
              Panel(
                child: Row(
                  children: [
                    const Icon(LucideIcons.clock, size: 16, color: AppColors.brand),
                    const SizedBox(width: 10),
                    Expanded(child: Text('Next round: ${formatDay(o.nextRound!)}', style: AppText.heading.copyWith(fontSize: 13))),
                  ],
                ),
              ),
            const SectionLabel('Rounds'),
            if (o.rounds.isEmpty)
              Text('No rounds imported yet.', style: AppText.small)
            else
              Panel(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                child: Column(
                  children: [
                    for (final r in o.rounds)
                      KeyValue(
                        formatDay(r.date),
                        r.invited == null ? '–' : '${formatCount(r.invited!)} invited',
                        hint: [
                          'Subclass ${r.subclass}${(r.subclassName ?? '').toLowerCase().contains('family') ? ' (family sponsored)' : ''}',
                          if (r.occupations != null) plural(r.occupations!, 'occupation'),
                          if (r.lowestPoints != null) 'from ${r.lowestPoints} points',
                        ].join(' · '),
                      ),
                  ],
                ),
              ),
            if (o.stateNominations.isNotEmpty) ..._nominations(o.stateNominations),
            const SectionLabel('Sources'),
            for (final (t, u) in const [('Current invitation round', invitationRoundsUrl), ('Previous rounds', previousRoundsUrl)])
              Pressable(
                onTap: () => openExternal(context, u),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.link, size: 12, color: AppColors.muted),
                      const SizedBox(width: 6),
                      Expanded(child: Text('$t (Home Affairs)', style: AppText.small)),
                    ],
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  List<Widget> _nominations(List<StateNomination> all) {
    final year = all.first.programYear;
    final asOf = all.first.asOf;
    final subclasses = {for (final n in all) n.subclass}.toList()..sort();
    final states = {for (final n in all) n.state}.toList()..sort();
    String cell(String state, String subclass) =>
        all.where((n) => n.state == state && n.subclass == subclass).map((n) => n.nominations).firstOrNull ?? '–';
    return [
      SectionLabel('State and territory nominations${year != null ? ' · $year' : ''}'),
      if (asOf != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(asOf, style: AppText.small),
        ),
      Panel(
        child: Column(
          children: [
            Row(
              children: [
                const Expanded(child: SizedBox.shrink()),
                for (final s in subclasses)
                  Expanded(
                    child: Text(s, textAlign: TextAlign.right, style: AppText.label),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            for (final st in states)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    Expanded(child: Text(st, style: AppText.body)),
                    for (final s in subclasses)
                      Expanded(
                        child: Text(cell(st, s), textAlign: TextAlign.right, style: AppText.body.copyWith(fontSize: 12.5)),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    ];
  }
}
