import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../data/occupations.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../shell.dart' show PageHeader;
import '../study/widgets.dart';
import 'widgets.dart';

/// The Jobs tab: search the skilled occupation lists, see the latest SkillSelect rounds, and find
/// where invitations come with the fewest points.
class OccupationsHomeScreen extends StatefulWidget {
  const OccupationsHomeScreen({super.key});

  @override
  State<OccupationsHomeScreen> createState() => _OccupationsHomeScreenState();
}

class _OccupationsHomeScreenState extends State<OccupationsHomeScreen> {
  final _q = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;
  int _seq = 0;

  OccupationFilters _f = const OccupationFilters();
  final List<OccupationSummary> _items = [];
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;

  RoundsOverview? _rounds;
  List<OccupationSummary>? _easy;
  int? _maxPoints = 75;
  bool _easyLoading = true;

  List<OccupationSuggestion> _suggest = const [];
  Timer? _suggestDebounce;
  int _suggestSeq = 0;

  bool get _searching => _f.query.trim().isNotEmpty || _f.count > 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _search();
    _loadEasy();
    allRounds().then(
      (r) {
        if (mounted) setState(() => _rounds = r);
      },
      onError: (_) {
        if (mounted) setState(() => _rounds = const RoundsOverview());
      },
    );
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _suggestDebounce?.cancel();
    _q.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 600) _more();
  }

  Future<void> _search() async {
    final seq = ++_seq;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await searchOccupations(_f);
      if (!mounted || seq != _seq) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page.items);
        _total = page.total;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _more() async {
    if (_loading || _loadingMore || _items.length >= _total) return;
    final seq = _seq;
    setState(() => _loadingMore = true);
    try {
      final page = await searchOccupations(_f, offset: _items.length);
      if (!mounted || seq != _seq) return;
      setState(() => _items.addAll(page.items));
    } catch (_) {
      // The next scroll tries again.
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _loadEasy() async {
    setState(() => _easyLoading = true);
    try {
      final rows = await rankOccupations(maxPoints: _maxPoints, visa: _f.visa, state: _f.state, limit: 8);
      if (mounted) setState(() => _easy = rows);
    } catch (_) {
      if (mounted) setState(() => _easy = const []);
    } finally {
      if (mounted) setState(() => _easyLoading = false);
    }
  }

  void _setFilters(OccupationFilters f) {
    setState(() => _f = f);
    _search();
  }

  void _onQuery(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 280), () => _setFilters(_f.copyWith(query: v)));
    _suggestDebounce?.cancel();
    if (v.trim().isEmpty) {
      _hideSuggestions();
      return;
    }
    _suggestDebounce = Timer(const Duration(milliseconds: 120), () async {
      final seq = ++_suggestSeq;
      final found = await suggestOccupations(v).catchError((_) => const <OccupationSuggestion>[]);
      if (mounted && seq == _suggestSeq && _q.text.trim().isNotEmpty) setState(() => _suggest = found);
    });
  }

  void _hideSuggestions() {
    _suggestSeq++;
    _suggestDebounce?.cancel();
    if (_suggest.isNotEmpty) setState(() => _suggest = const []);
  }

  @override
  Widget build(BuildContext context) {
    return StudyPage(
      child: RefreshIndicator(
        color: AppColors.fg,
        backgroundColor: AppColors.raised,
        onRefresh: () async {
          await Future.wait([_search(), _loadEasy()]);
        },
        child: CustomScrollView(
          controller: _scroll,
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverList.list(
                children: [
                  PageHeader(
                    title: 'Occupations',
                    subtitle: 'Skilled lists, invitation rounds and shortages, from official data',
                    trailing: SmallButton(label: 'Rounds', icon: LucideIcons.calendarClock, onTap: () => context.push('/jobs/rounds')),
                  ),
                  SearchBox(
                    controller: _q,
                    placeholder: 'Search occupations or ANZSCO codes',
                    onChanged: _onQuery,
                    onSubmitted: (v) {
                      _hideSuggestions();
                      _setFilters(_f.copyWith(query: v));
                    },
                    onClear: () {
                      _hideSuggestions();
                      _setFilters(_f.copyWith(query: ''));
                    },
                  ),
                  if (_suggest.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    SuggestionList(
                      items: _suggest,
                      onPick: (s) {
                        _hideSuggestions();
                        FocusScope.of(context).unfocus();
                        openOccupation(context, s.anzsco);
                      },
                    ),
                  ],
                  const SizedBox(height: 10),
                  _filterRow(),
                  if (!_searching) ...[
                    _RoundsCard(overview: _rounds),
                    _easySection(),
                    SectionLabel('All occupations', trailing: _total > 0 ? Text(formatCount(_total), style: AppText.tiny) : null),
                  ] else
                    SectionLabel(
                      _loading ? 'Searching…' : plural(_total, 'occupation'),
                      trailing: _f.count > 0
                          ? Pressable(
                              onTap: () {
                                _q.clear();
                                _setFilters(const OccupationFilters());
                              },
                              child: Text('Clear', style: AppText.small.copyWith(color: AppColors.fg)),
                            )
                          : null,
                    ),
                ],
              ),
            ),
            if (_loading && _items.isEmpty)
              const SliverToBoxAdapter(child: LoadingBlock('Loading occupations…'))
            else if (_error != null && _items.isEmpty)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverToBoxAdapter(
                  child: ErrorBlock(title: "Couldn't load occupations", error: _error!, onRetry: _search),
                ),
              )
            else if (_items.isEmpty)
              const SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverToBoxAdapter(
                  child: MessageBlock(
                    icon: LucideIcons.searchX,
                    title: 'No occupations match',
                    body: 'Try another word, the six-digit ANZSCO code, or fewer filters.',
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList.separated(
                  itemCount: _items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (c, i) => RepaintBoundary(child: OccupationCard(o: _items[i])),
                ),
              ),
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.only(top: 12, bottom: bottomGap(context)),
                child: _loadingMore ? const Center(child: ShimmerText('Loading more…')) : const SizedBox.shrink(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _filterRow() => SizedBox(
    height: 30,
    child: ListView(
      scrollDirection: Axis.horizontal,
      children: [
        ToggleChip(
          label: 'In shortage',
          icon: LucideIcons.trendingUp,
          on: _f.shortageOnly,
          onTap: () => _setFilters(_f.copyWith(shortageOnly: !_f.shortageOnly)),
        ),
        const SizedBox(width: 6),
        for (final v in const ['189', '190', '491', '482']) ...[
          ToggleChip(
            label: 'Subclass $v',
            on: _f.visa == v,
            onTap: () {
              _setFilters(_f.copyWith(visa: () => _f.visa == v ? null : v));
              _loadEasy();
            },
          ),
          const SizedBox(width: 6),
        ],
        for (final l in occupationLists) ...[
          ToggleChip(
            label: l,
            on: _f.list == l,
            onTap: () => _setFilters(_f.copyWith(list: () => _f.list == l ? null : l)),
          ),
          const SizedBox(width: 6),
        ],
      ],
    ),
  );

  Widget _easySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Easiest to get invited'),
        Text(
          'Occupations invited in the last 12 months with the lowest minimum points, from the official round results.',
          style: AppText.small,
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 30,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final p in const [65, 70, 75, 80, 85, null]) ...[
                ToggleChip(
                  label: p == null ? 'Any points' : 'Up to $p',
                  on: _maxPoints == p,
                  onTap: () {
                    setState(() => _maxPoints = p);
                    _loadEasy();
                  },
                ),
                const SizedBox(width: 6),
              ],
            ],
          ),
        ),
        const SizedBox(height: 10),
        if (_easyLoading && _easy == null)
          const LoadingBlock('Ranking occupations…')
        else if ((_easy ?? const []).isEmpty)
          SizedBox(
            width: double.infinity,
            child: MessageBlock(
              icon: LucideIcons.info,
              title: _maxPoints == null ? 'No recent round data yet' : 'Nothing invited at $_maxPoints points or fewer',
              body: _maxPoints == null ? 'Invitation rounds appear here once they are imported.' : 'Try a higher points limit.',
            ),
          )
        else
          for (final (i, o) in _easy!.indexed) ...[if (i > 0) const SizedBox(height: 8), OccupationCard(o: o, showWhy: true)],
      ],
    );
  }
}

class _RoundsCard extends StatelessWidget {
  const _RoundsCard({required this.overview});
  final RoundsOverview? overview;

  @override
  Widget build(BuildContext context) {
    final o = overview;
    final latest = o?.rounds.isEmpty ?? true ? null : o!.rounds.first;
    final sameDay = latest == null ? const <InvitationRound>[] : o!.rounds.where((r) => r.date == latest.date).toList();
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Pressable(
        onTap: () => context.push('/jobs/rounds'),
        scale: 0.985,
        child: Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.calendarClock, size: 15, color: AppColors.brand),
                  const SizedBox(width: 8),
                  Expanded(child: Text('SkillSelect invitation rounds', style: AppText.heading.copyWith(fontSize: 13))),
                  const Icon(LucideIcons.chevronRight, size: 15, color: AppColors.faint),
                ],
              ),
              const SizedBox(height: 12),
              if (o == null)
                const ShimmerText('Loading rounds…')
              else if (latest == null)
                Text('No rounds imported yet.', style: AppText.small)
              else
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Stat(formatDay(latest.date), 'Latest round')),
                    for (final r in sameDay.take(2))
                      Expanded(child: Stat(r.invited == null ? '–' : formatCount(r.invited!), 'Invited · ${r.subclass}')),
                  ],
                ),
              if (o != null && roundYears(o.rounds, '189').isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  '${roundYears(o.rounds, '189').first.year} program year: '
                  '${formatCount(roundYears(o.rounds, '189').first.invited)} invited for 189'
                  '${roundYears(o.rounds, '491').isNotEmpty && roundYears(o.rounds, '491').first.year == roundYears(o.rounds, '189').first.year ? ' · ${formatCount(roundYears(o.rounds, '491').first.invited)} for 491 family sponsored' : ''}',
                  style: AppText.small,
                ),
              ],
              if (o?.nextRound != null) ...[
                const SizedBox(height: 10),
                Tag('Next round ${formatDay(o!.nextRound!)}', icon: LucideIcons.clock, color: AppColors.brand),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
