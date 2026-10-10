import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../data/occupations.dart';
import '../../data/study.dart' show CourseFilters, studySearchRequest;
import '../../theme.dart';
import '../../widgets/common.dart';
import '../shell.dart' show PageHeader;
import '../study/widgets.dart';
import 'widgets.dart';

/// One occupation: lists and visas, assessing authority, invitation history and minimum points,
/// shortage by state, labour-market data, and "Show my pathway".
class OccupationScreen extends StatefulWidget {
  const OccupationScreen({super.key, required this.anzsco});
  final String anzsco;

  @override
  State<OccupationScreen> createState() => _OccupationScreenState();
}

class _OccupationScreenState extends State<OccupationScreen> {
  OccupationDetail? _o;
  bool _loading = true;
  Object? _error;
  bool _allRounds = false;
  RoundsOverview? _published; // every round, for "invited in N of M"
  PrPathway? _pathway;

  @override
  void initState() {
    super.initState();
    _load();
    prPathway(widget.anzsco).then((p) {
      if (mounted) setState(() => _pathway = p);
    }, onError: (_) {});
    allRounds().then((r) {
      if (mounted) setState(() => _published = r);
    }, onError: (_) {});
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final o = await getOccupation(widget.anzsco);
      if (!mounted) return;
      setState(() {
        _o = o;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _o;
    return StudyPage(
      child: Stack(
        children: [
          ListView(
            padding: EdgeInsets.fromLTRB(16, 0, 16, bottomGap(context) + 70),
            children: [
              PageHeader(back: true, title: o?.title ?? 'Occupation', subtitle: o == null ? null : 'ANZSCO ${o.code}'),
              if (_loading && o == null)
                const LoadingBlock('Loading occupation…')
              else if (_error != null && o == null)
                ErrorBlock(title: "Couldn't load this occupation", error: _error!, onRetry: _load)
              else if (o == null)
                const MessageBlock(
                  icon: LucideIcons.searchX,
                  title: 'Occupation not found',
                  body: 'It may have been removed from the lists.',
                )
              else
                ..._body(o),
            ],
          ),
          if (o != null)
            Positioned(
              left: 16,
              right: 16,
              bottom: MediaQuery.paddingOf(context).bottom + 14,
              child: PillButton(
                label: 'Show my pathway',
                icon: LucideIcons.route,
                height: 46,
                onTap: () => askInChat(context, pathwayPrompt(o)),
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _body(OccupationDetail o) {
    final now = DateTime.now();
    final r189 = o.roundsFor('189');
    final r491 = o.roundsFor('491');
    final latest = r189.firstOrNull;
    final shortage = o.latestShortage;
    return [
      if (!o.listed)
        const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: MessageBlock(
            icon: LucideIcons.triangleAlert,
            color: AppColors.warning,
            title: 'No longer on the skilled lists',
            body: 'Shown for its history. Check the current lists before relying on it.',
          ),
        ),
      Panel(
        child: Row(
          children: [
            Expanded(
              child: Stat(
                latest?.minPoints?.toString() ?? '–',
                latest == null ? 'Not invited (189)' : 'Min points · ${_monthYear(latest.date)}',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(child: Stat('${o.roundsInLastYear('189', o.latestRound ?? now)}', 'Rounds invited (12 mo)')),
            const SizedBox(width: 10),
            Expanded(
              child: Stat(
                shortage?.national ?? '–',
                'National ${shortage == null ? 'shortage' : shortage.year}',
                color: shortageColor(shortage?.national),
              ),
            ),
          ],
        ),
      ),
      if (o.nextRound != null) ...[
        const SizedBox(height: 8),
        Tag('Next 189 round ${formatDay(o.nextRound!)}', icon: LucideIcons.clock, color: AppColors.brand),
      ],
      if (_pathway != null) ...[const SectionLabel('PR pathway at a glance'), PathwayCard(p: _pathway!)],
      const SectionLabel('Lists and visas'),
      Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (o.lists.isEmpty)
              Text('Not on a skilled occupation list.', style: AppText.small)
            else
              for (final l in o.lists)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 64, child: Tag(l, color: l == 'MLTSSL' ? AppColors.brand : null)),
                      const SizedBox(width: 8),
                      Expanded(child: Text(listMeaning[l] ?? l, style: AppText.small)),
                    ],
                  ),
                ),
            if (o.visas.isNotEmpty) ...[
              const SizedBox(height: 4),
              Wrap(spacing: 5, runSpacing: 5, children: [for (final v in o.visas) Tag('Subclass $v')]),
            ],
            if (o.caveats.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text('Caveats', style: AppText.heading.copyWith(fontSize: 12.5)),
              const SizedBox(height: 4),
              for (final c in o.caveats)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('${c.visa != null ? '${c.visa}: ' : ''}${c.text}', style: AppText.small),
                ),
            ],
          ],
        ),
      ),
      if (o.authorities.isNotEmpty) ...[
        const SectionLabel('Skills assessment'),
        for (final a in o.authorities)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: NavRow(
              icon: LucideIcons.badgeCheck,
              title: a.name ?? a.short,
              subtitle: a.url == null ? a.short : '${a.short} · ${Uri.tryParse(a.url!)?.host ?? a.url}',
              trailing: a.url == null ? const SizedBox.shrink() : const Icon(LucideIcons.externalLink, size: 14, color: AppColors.faint),
              onTap: a.url == null ? null : () => openExternal(context, a.url!),
            ),
          ),
      ],
      const SectionLabel('Invitation rounds'),
      Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (o.rounds.isEmpty)
              Text(
                'Not invited in the published rounds. 189 rounds invite only some occupations; state nomination (190, 491) may still be open.',
                style: AppText.small,
              )
            else ...[
              if (r189.length >= 2) ...[
                Text('Minimum points, subclass 189', style: AppText.small),
                const SizedBox(height: 8),
                PointsTrend(rounds: r189),
                const SizedBox(height: 10),
              ] else if (r491.length >= 2) ...[
                Text('Minimum points, subclass 491 (family sponsored)', style: AppText.small),
                const SizedBox(height: 8),
                PointsTrend(rounds: r491),
                const SizedBox(height: 10),
              ],
              if (_published != null) ...[
                for (final sub in ['189', '491'])
                  if (o.roundsFor(sub).isNotEmpty) ...[
                    YearTrendTable(rows: yearTrends(o.rounds, _published!.rounds, sub), subclass: sub),
                    const Divider(color: AppColors.border, height: 22),
                  ],
              ],
              for (final r in (_allRounds ? o.rounds : o.rounds.take(8)))
                KeyValue(
                  formatDay(r.date),
                  r.minPoints == null ? 'Invited' : '${r.minPoints} points',
                  hint: [
                    'Subclass ${r.subclass}',
                    if (_published != null && roundTotal(_published!.rounds, r.date, r.subclass) != null)
                      '${formatCount(roundTotal(_published!.rounds, r.date, r.subclass)!)} invited in the round',
                  ].join(' · '),
                ),
              if (o.rounds.length > 8)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: SmallButton(
                    label: _allRounds ? 'Show fewer' : 'All ${o.rounds.length} rounds',
                    onTap: () => setState(() => _allRounds = !_allRounds),
                  ),
                ),
            ],
          ],
        ),
      ),
      if (shortage != null) ...[
        SectionLabel('Shortage by state · ${shortage.year}'),
        Panel(
          child: Column(
            children: [
              KeyValue('Australia', shortageLabel(shortage.national), strong: true, valueColor: shortageColor(shortage.national)),
              for (final s in shortageStates)
                if (shortage.states[s] != null) KeyValue(s, shortage.states[s]!, valueColor: shortageColor(shortage.states[s])),
              if (o.shortage.length > 1) ...[
                const Divider(color: AppColors.border, height: 16),
                for (final y in o.shortage.skip(1).take(4))
                  KeyValue('${y.year}', shortageLabel(y.national), valueColor: shortageColor(y.national)),
              ],
            ],
          ),
        ),
      ],
      if (o.description != null || o.tasks.isNotEmpty) ...[
        const SectionLabel('What the job involves'),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (o.description != null) Text(o.description!, style: AppText.body),
              for (final t in o.tasks.take(4))
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('• $t', style: AppText.small),
                ),
              if (o.otherTitles.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text('Also called: ${o.otherTitles.take(6).join(', ')}', style: AppText.small),
              ],
              if (o.registration != null) ...[const SizedBox(height: 6), Text(o.registration!, style: AppText.tiny)],
            ],
          ),
        ),
      ],
      if (o.profile.isNotEmpty) ...[
        SectionLabel(o.profileIsUnitGroup ? 'Jobs and pay (occupation group)' : 'Jobs and pay'),
        Panel(
          child: Column(
            children: [
              if (o.employed != null) KeyValue('People employed', formatCount(o.employed!)),
              if (o.medianWeeklyEarnings != null)
                KeyValue('Median full-time pay', '\$${formatCount(o.medianWeeklyEarnings!)} a week', hint: 'Before tax'),
              if (o.projectedGrowth != null) KeyValue('Projected growth', '${o.projectedGrowth!.toStringAsFixed(1)}%'),
              if (o.annualGrowth != null) KeyValue('Employment growth, last year', '${o.annualGrowth!.toStringAsFixed(1)}%'),
              if (o.growth5yr != null) KeyValue('Growth, last 5 years', '${o.growth5yr!.toStringAsFixed(1)}%'),
              if (o.partTimeShare != null) KeyValue('Part-time', '${o.partTimeShare!.toStringAsFixed(0)}%'),
              if (o.femaleShare != null) KeyValue('Women', '${o.femaleShare!.toStringAsFixed(0)}%'),
              if (o.medianAge != null) KeyValue('Median age', o.medianAge!.toStringAsFixed(0)),
            ],
          ),
        ),
      ],
      const SectionLabel('Next steps'),
      NavRow(
        icon: LucideIcons.graduationCap,
        title: 'Courses for this occupation',
        subtitle: 'Search CRICOS courses by its field',
        onTap: () {
          studySearchRequest.value = CourseFilters(query: o.title);
          context.go('/study');
        },
      ),
      const SizedBox(height: 8),
      NavRow(
        icon: LucideIcons.calculator,
        title: 'Can I get invited?',
        subtitle: 'My points against the recent rounds',
        onTap: () => askInChat(
          context,
          'Work out my points for ${o.title} (ANZSCO ${o.code}) from my profile and documents, and compare them with the recent invitation rounds and state nominations for it. What would raise my points fastest?',
        ),
      ),
      const SectionLabel('Sources'),
      for (final s in [
        if (o.sources.isEmpty) ...[
          const SourceLink('Skilled occupation list (Home Affairs)', occupationListUrl),
          const SourceLink('SkillSelect invitation rounds (Home Affairs)', invitationRoundsUrl),
          const SourceLink('Occupation Shortage List (Jobs and Skills Australia)', shortageListUrl),
        ] else
          ...o.sources,
      ])
        Pressable(
          onTap: () => openExternal(context, s.url),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                const Icon(LucideIcons.link, size: 12, color: AppColors.muted),
                const SizedBox(width: 6),
                Expanded(child: Text(s.asAt == null ? s.title : '${s.title} · as at ${s.asAt}', style: AppText.small)),
              ],
            ),
          ),
        ),
    ];
  }
}

String _monthYear(DateTime d) =>
    '${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1]} ${d.year}';
