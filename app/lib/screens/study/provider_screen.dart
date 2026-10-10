import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../data/study.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../../widgets/course_card.dart';
import '../shell.dart';
import 'study_home.dart';
import 'widgets.dart';

/// A CRICOS provider (university, TAFE or college): details, official website, campuses, policy questions
/// for the assistant, and every course grouped by level.
class ProviderScreen extends StatefulWidget {
  const ProviderScreen({super.key, required this.code});
  final String code;

  @override
  State<ProviderScreen> createState() => _ProviderScreenState();
}

class _ProviderScreenState extends State<ProviderScreen> {
  ProviderDetail? _p;
  Object? _error;
  bool _loading = true;
  final Set<String> _open = {};
  final Set<String> _groupLoading = {};
  final Map<String, Object> _groupErrors = {};
  bool _allCampuses = false;

  @override
  void initState() {
    super.initState();
    _load(first: true);
  }

  Future<void> _load({bool first = false}) async {
    if (!first) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final p = await getProvider(widget.code);
      if (mounted) {
        setState(() {
          _p = p;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  Future<void> _toggle(LevelGroup g) async {
    if (_open.remove(g.level)) return setState(() {});
    setState(() => _open.add(g.level));
    if (g.courses != null || _groupLoading.contains(g.level)) return;
    setState(() {
      _groupLoading.add(g.level);
      _groupErrors.remove(g.level);
    });
    try {
      final list = await providerCourses(widget.code, g.level);
      g.courses = list;
    } catch (e) {
      _groupErrors[g.level] = e;
    }
    if (mounted) setState(() => _groupLoading.remove(g.level));
  }

  void _search(CourseFilters f) {
    studySearchRequest.value = f;
    context.go('/study');
  }

  @override
  Widget build(BuildContext context) {
    const pad = EdgeInsets.symmetric(horizontal: 16);
    final p = _p;
    return StudyPage(
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: pad,
            sliver: SliverToBoxAdapter(
              child: p == null
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const PageHeader(back: true, title: 'Provider'),
                        if (_loading)
                          const LoadingBlock('Loading provider…')
                        else if (_error != null)
                          ErrorBlock(title: "Couldn't load this provider", error: _error!, onRetry: _load)
                        else
                          MessageBlock(
                            icon: LucideIcons.searchX,
                            title: 'Provider not found',
                            body: 'CRICOS provider ${widget.code} is not in the register we have.',
                          ),
                      ],
                    )
                  : _info(context, p),
            ),
          ),
          if (p != null) ...[
            SliverPadding(
              padding: pad,
              sliver: SliverToBoxAdapter(
                child: SectionLabel(p.levels.isEmpty ? 'Courses' : 'Courses by level · ${formatCount(p.courseCount ?? p.levels.fold(0, (a, g) => a + g.count))}'),
              ),
            ),
            if (p.levels.isEmpty)
              const SliverPadding(
                padding: pad,
                sliver: SliverToBoxAdapter(child: Text('No current courses are listed for this provider.', style: AppText.small)),
              ),
            for (final g in p.levels) ..._group(pad, g),
          ],
          SliverPadding(
            padding: pad.copyWith(bottom: bottomGap(context)),
            sliver: SliverToBoxAdapter(
              child: p == null
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.only(top: 14),
                      child: Text(
                        'From the CRICOS register${p.asAt.isNotEmpty ? ' as at ${formatDay(p.asAt)}' : ''}.',
                        style: AppText.tiny.copyWith(color: AppColors.faint),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _info(BuildContext context, ProviderDetail p) {
    final i = p.info;
    final legal = i.displayName != i.name ? i.name : null;
    final campuses = _allCampuses ? p.locations : p.locations.take(5).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PageHeader(back: true, title: i.displayName, subtitle: legal ?? (i.place.isEmpty ? null : i.place)),
        Wrap(
          spacing: 5,
          runSpacing: 5,
          children: [
            if (i.type.isNotEmpty) Tag(i.isPublic ? 'Public' : 'Private', icon: LucideIcons.landmark),
            Tag('CRICOS ${i.code}'),
            if (legal != null && i.place.isNotEmpty) Tag(i.place, icon: LucideIcons.mapPin),
            if (p.states.length > 1) Tag('Campuses in ${p.states.join(', ')}'),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: Stat(formatCount(p.courseCount ?? p.levels.fold(0, (a, g) => a + g.count)), 'courses')),
            Expanded(child: Stat(formatCount(p.researchCount), 'research degrees')),
            Expanded(child: Stat(formatCount(p.locations.length), 'campuses')),
          ],
        ),
        if (i.capacity != null && i.capacity! > 0) ...[
          const SizedBox(height: 8),
          Text('Registered to enrol up to ${formatCount(i.capacity!)} international students at a time.', style: AppText.tiny),
        ],
        const SizedBox(height: 14),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            if (i.websiteUrl.isNotEmpty)
              SmallButton(label: 'Official website', icon: LucideIcons.externalLink, primary: true, onTap: () => openExternal(context, i.websiteUrl)),
            if (p.researchCount > 0)
              SmallButton(
                label: 'Research degrees here',
                icon: LucideIcons.microscope,
                onTap: () => _search(CourseFilters(provider: i.code, providerLabel: i.displayName, researchOnly: true)),
              ),
            SmallButton(
              label: 'Search its courses',
              icon: LucideIcons.search,
              onTap: () => _search(CourseFilters(provider: i.code, providerLabel: i.displayName)),
            ),
          ],
        ),
        const SectionLabel('Check its policies with the assistant'),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final q in _policyQuestions(i))
              ToggleChip(label: q.$1, icon: q.$2, on: false, onTap: () => askInChat(context, q.$3)),
          ],
        ),
        const SizedBox(height: 6),
        Text('The assistant reads the provider’s own website and cites the pages it used.', style: AppText.tiny.copyWith(color: AppColors.faint)),
        if (p.locations.isNotEmpty) ...[
          SectionLabel('Campuses · ${p.locations.length}'),
          Panel(
            padding: const EdgeInsets.fromLTRB(14, 4, 14, 4),
            child: Column(
              children: [
                for (final l in campuses)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 7),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(top: 2),
                          child: Icon(LucideIcons.mapPin, size: 13, color: AppColors.faint),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(l.name, style: AppText.body.copyWith(fontSize: 12.5)),
                              if (l.fullAddress.isNotEmpty) Text(l.fullAddress, style: AppText.tiny),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                if (p.locations.length > 5)
                  Pressable(
                    onTap: () => setState(() => _allCampuses = !_allCampuses),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Text(
                        _allCampuses ? 'Show fewer' : 'Show all ${p.locations.length}',
                        style: AppText.small.copyWith(color: AppColors.brand, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  List<Widget> _group(EdgeInsets pad, LevelGroup g) {
    final open = _open.contains(g.level);
    final courses = g.courses;
    final research = researchLevels.contains(g.level);
    return [
      SliverPadding(
        padding: pad.copyWith(bottom: 6),
        sliver: SliverToBoxAdapter(
          child: Pressable(
            scale: 0.985,
            onTap: () => _toggle(g),
            child: Panel(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              color: open ? AppColors.raised : AppColors.card,
              child: Row(
                children: [
                  Icon(research ? LucideIcons.microscope : LucideIcons.graduationCap, size: 14, color: research ? AppColors.brand : AppColors.muted),
                  const SizedBox(width: 9),
                  Expanded(child: Text(g.level.isEmpty ? 'Other' : g.level, style: AppText.heading.copyWith(fontSize: 13))),
                  Text(formatCount(g.count), style: AppText.small),
                  const SizedBox(width: 6),
                  AnimatedRotation(
                    turns: open ? 0.5 : 0,
                    duration: Motion.fast,
                    child: const Icon(LucideIcons.chevronDown, size: 14, color: AppColors.faint),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      if (open && _groupLoading.contains(g.level))
        const SliverToBoxAdapter(child: LoadingBlock('Loading courses…'))
      else if (open && _groupErrors[g.level] != null)
        SliverPadding(
          padding: pad.copyWith(bottom: 8),
          sliver: SliverToBoxAdapter(
            child: ErrorBlock(
              title: "Couldn't load these courses",
              error: _groupErrors[g.level]!,
              onRetry: () {
                _open.remove(g.level);
                _toggle(g);
              },
            ),
          ),
        )
      else if (open && courses != null)
        SliverPadding(
          padding: pad.copyWith(left: 26, bottom: 8),
          sliver: SliverList.builder(
            itemCount: courses.length,
            itemBuilder: (context, i) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: CourseCard(course: courses[i], compact: true, onTap: () => openCourse(context, courses[i])),
            ),
          ),
        ),
    ];
  }

  /// Policy questions every international student weighs up; the assistant answers from the provider's site.
  List<(String, IconData, String)> _policyQuestions(ProviderInfo i) {
    final site = i.host.isEmpty ? 'their official website' : 'their official website (${i.host})';
    final who = '${i.displayName} (CRICOS provider ${i.code})';
    return [
      (
        'Credit transfer',
        LucideIcons.layers,
        'What is the credit transfer and recognition of prior learning (advanced standing) policy at $who? How much credit can '
            'they grant, how do I apply, and how much could I get from my completed study? Use $site and cite the pages.',
      ),
      (
        'Study overload',
        LucideIcons.trendingUp,
        'Does $who allow study overload (more than a full-time load in a study period)? What are the conditions (grades, approval, '
            'maximum units), and would it help me finish on time? Use $site and cite the pages.',
      ),
      (
        'Cross-institutional',
        LucideIcons.arrowRightLeft,
        'Does $who allow cross-institutional study (taking units at another university to count towards my course)? What are '
            'the rules, how do I apply, and could it help me finish before my CoE ends? Use $site and cite the pages.',
      ),
      (
        'Summer & winter terms',
        LucideIcons.sun,
        'Does $who run summer or winter terms, which units are offered, how many can I take, and what do they cost? Use $site '
            'and cite the pages.',
      ),
      (
        'Research degree entry',
        LucideIcons.microscope,
        'What are the entry requirements for a Masters by research or a PhD at $who, how do I find a supervisor, what are the '
            'tuition fees and scholarships for international students, and am I eligible? If not, how can I become eligible? Use '
            '$site and cite the pages.',
      ),
      (
        'Fees & scholarships',
        LucideIcons.piggyBank,
        'What are the tuition fees, payment rules, refund policy and scholarships for international students at $who? Use $site '
            'and cite the pages.',
      ),
      (
        'Changing course or provider',
        LucideIcons.route,
        'What is the policy at $who for changing course, or for releasing a student to another provider (and for taking in a '
            'transfer student)? What does it mean for my CoE and student visa? Use $site and cite the pages.',
      ),
    ];
  }
}
