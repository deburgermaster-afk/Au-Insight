import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../data/study.dart';
import '../../data/study_models.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../../widgets/course_card.dart';
import '../shell.dart';
import 'progress_card.dart';
import 'widgets.dart';

const _pageSize = 20;

/// Opens a course page, showing the row we already have while the full record loads.
void openCourse(BuildContext context, CourseSummary c) => context.push('/study/course/${c.courseCode}', extra: c);

/// The Study tab: search every CRICOS course (filters, sorting, paging), the study progress card and
/// shortcuts to universities, research degrees, the shortlist and compare.
class StudyHomeScreen extends StatefulWidget {
  const StudyHomeScreen({super.key});

  @override
  State<StudyHomeScreen> createState() => _StudyHomeScreenState();
}

class _StudyHomeScreenState extends State<StudyHomeScreen> {
  final _q = TextEditingController();
  final _city = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;

  CourseFilters _f = const CourseFilters();
  final List<CourseSummary> _items = [];
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  Object? _moreError;
  int _seq = 0;
  bool _filtersOpen = false;
  List<(String, int)>? _fields;
  int? _researchCount;

  @override
  void initState() {
    super.initState();
    studySearchRequest.addListener(_applyRequest);
    final pending = studySearchRequest.value;
    if (pending != null) {
      studySearchRequest.value = null;
      _f = pending;
      _q.text = pending.query;
      _city.text = pending.city;
      _filtersOpen = pending.panelCount > 0;
    }
    _search(first: true);
    courseFields().then((v) {
      if (mounted) setState(() => _fields = v);
    }, onError: (_) {});
    courseLevels().then((v) {
      final n = v.where((l) => researchLevels.contains(l.$1)).fold(0, (a, l) => a + l.$2);
      if (mounted && n > 0) setState(() => _researchCount = n);
    }, onError: (_) {});
    loadShortlist().catchError((_) => const <String>[]);
  }

  @override
  void dispose() {
    studySearchRequest.removeListener(_applyRequest);
    _debounce?.cancel();
    _q.dispose();
    _city.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Another Study page asked for a search (e.g. "Research degrees here" on a provider page).
  void _applyRequest() {
    final r = studySearchRequest.value;
    if (r == null) return;
    studySearchRequest.value = null;
    _q.text = r.query;
    _city.text = r.city;
    _filtersOpen = r.panelCount > 0;
    _setFilters(r);
  }

  void _setFilters(CourseFilters f) {
    _debounce?.cancel();
    _f = f;
    _search();
    if (_scroll.hasClients && _scroll.offset > 0) _scroll.jumpTo(0);
  }

  Future<void> _search({bool first = false}) async {
    final seq = ++_seq;
    if (!first) {
      setState(() {
        _loading = true;
        _error = null;
        _moreError = null;
      });
    }
    try {
      final page = await searchCourses(_f, limit: _pageSize);
      if (seq != _seq || !mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page.items);
        _total = page.items.length < _pageSize ? page.items.length : page.total;
        _loading = false;
      });
    } catch (e) {
      if (seq != _seq || !mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore || _error != null || _moreError != null || _items.length >= _total) return;
    final seq = _seq;
    setState(() => _loadingMore = true);
    try {
      final page = await searchCourses(_f, limit: _pageSize, offset: _items.length);
      if (seq != _seq || !mounted) return;
      setState(() {
        final have = {for (final c in _items) c.courseCode};
        _items.addAll(page.items.where((c) => !have.contains(c.courseCode)));
        if (page.items.length < _pageSize) _total = _items.length;
        _loadingMore = false;
      });
    } catch (e) {
      if (seq != _seq || !mounted) return;
      setState(() {
        _moreError = e;
        _loadingMore = false;
      });
    }
  }

  void _onQuery(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted || text.trim() == _f.query.trim()) return;
      _f = _f.copyWith(query: text);
      _search();
    });
  }

  void _onCity(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (!mounted || text.trim() == _f.city.trim()) return;
      _f = _f.copyWith(city: text.trim());
      _search();
    });
  }

  void _toggleLevel(List<String> names) {
    final on = names.every(_f.levels.contains);
    final next = {..._f.levels};
    on ? next.removeAll(names) : next.addAll(names);
    _setFilters(_f.copyWith(levels: next));
  }

  void _clearAll() {
    _q.clear();
    _city.clear();
    _setFilters(const CourseFilters());
  }

  bool get _browsing => _f.query.trim().isEmpty && !_f.hasFilters;

  @override
  Widget build(BuildContext context) {
    const pad = EdgeInsets.symmetric(horizontal: 16);
    return SafeArea(
      bottom: false,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: CustomScrollView(
            controller: _scroll,
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            slivers: [
              SliverPadding(
                padding: pad,
                sliver: SliverToBoxAdapter(child: _top()),
              ),
              if (_browsing)
                SliverPadding(
                  padding: pad,
                  sliver: SliverToBoxAdapter(child: _dashboard()),
                ),
              SliverPadding(
                padding: pad,
                sliver: SliverToBoxAdapter(child: _resultsHeader()),
              ),
              ..._results(pad),
              SliverPadding(
                padding: pad.copyWith(bottom: bottomGap(context)),
                sliver: SliverToBoxAdapter(child: _footer()),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Search and filters ──────────────────────────────────────────────────────────────────────────

  Widget _top() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PageHeader(
          title: 'Study',
          subtitle: 'Every CRICOS course and provider, with fees',
          trailing: ValueListenableBuilder<List<String>>(
            valueListenable: shortlist,
            builder: (context, list, _) => SmallButton(
              label: list.isEmpty ? 'Saved' : 'Saved ${list.length}',
              icon: LucideIcons.bookmark,
              onTap: () => context.push('/study/shortlist'),
            ),
          ),
        ),
        Row(
          children: [
            Expanded(
              child: SearchBox(
                controller: _q,
                placeholder: 'Course, university or field (e.g. nursing)',
                onChanged: _onQuery,
                onSubmitted: (v) {
                  _debounce?.cancel();
                  _setFilters(_f.copyWith(query: v));
                },
                onClear: () => _setFilters(_f.copyWith(query: '')),
              ),
            ),
            const SizedBox(width: 8),
            Pressable(
              onTap: () => setState(() => _filtersOpen = !_filtersOpen),
              child: AnimatedContainer(
                duration: Motion.fast,
                height: 40,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: _filtersOpen ? AppColors.fg : AppColors.raised,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(LucideIcons.slidersHorizontal, size: 14, color: _filtersOpen ? AppColors.bg : AppColors.fg),
                    if (_f.panelCount > 0) ...[
                      const SizedBox(width: 6),
                      Text(
                        '${_f.panelCount}',
                        style: AppText.small.copyWith(color: _filtersOpen ? AppColors.bg : AppColors.brand, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _levelRow(),
        AnimatedSize(
          duration: Motion.medium,
          curve: Motion.ease,
          alignment: Alignment.topCenter,
          child: _filtersOpen ? _panel() : const SizedBox(width: double.infinity),
        ),
        if (!_filtersOpen) _activeFilters(),
      ],
    );
  }

  Widget _levelRow() {
    return SizedBox(
      height: 30,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          ToggleChip(
            label: 'All',
            on: _f.levels.isEmpty && !_f.researchOnly,
            onTap: () => _setFilters(_f.copyWith(levels: const {}, researchOnly: false)),
          ),
          const SizedBox(width: 6),
          ToggleChip(
            label: 'Research degrees',
            icon: LucideIcons.microscope,
            on: _f.researchOnly,
            onTap: () => _setFilters(_f.copyWith(researchOnly: !_f.researchOnly)),
          ),
          for (final (label, names) in levelChips) ...[
            const SizedBox(width: 6),
            ToggleChip(label: label, on: names.every(_f.levels.contains), onTap: () => _toggleLevel(names)),
          ],
        ],
      ),
    );
  }

  Widget _group(String title, List<Widget> chips) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title.toUpperCase(), style: AppText.label),
        const SizedBox(height: 7),
        Wrap(spacing: 6, runSpacing: 6, children: chips),
      ],
    ),
  );

  Widget _panel() {
    final f = _f;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Panel(
        padding: const EdgeInsets.fromLTRB(12, 2, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (f.provider != null)
              _group('Provider', [_RemovableChip(f.providerLabel ?? f.provider!, () => _setFilters(f.copyWith(provider: null, providerLabel: null)))]),
            _group('State', [
              ToggleChip(label: 'Any', on: f.state == null, onTap: () => _setFilters(f.copyWith(state: null))),
              for (final s in auStates) ToggleChip(label: s, on: f.state == s, onTap: () => _setFilters(f.copyWith(state: f.state == s ? null : s))),
            ]),
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('City or campus'.toUpperCase(), style: AppText.label),
                  const SizedBox(height: 7),
                  SearchBox(
                    controller: _city,
                    placeholder: 'e.g. Melbourne, Clayton, Parramatta',
                    onChanged: _onCity,
                    onSubmitted: (v) => _setFilters(f.copyWith(city: v.trim())),
                    onClear: () => _setFilters(_f.copyWith(city: '')),
                  ),
                ],
              ),
            ),
            _group('Max tuition per year', [
              ToggleChip(label: 'Any', on: f.maxAnnualFee == null, onTap: () => _setFilters(f.copyWith(maxAnnualFee: null))),
              for (final cap in feeCaps)
                ToggleChip(
                  label: '≤ ${formatAud(cap).replaceAll(',000', 'k')}',
                  on: f.maxAnnualFee == cap,
                  onTap: () => _setFilters(f.copyWith(maxAnnualFee: f.maxAnnualFee == cap ? null : cap)),
                ),
            ]),
            if (_fields != null && _fields!.isNotEmpty)
              _group('Field of study', [
                ToggleChip(label: 'Any', on: f.field == null, onTap: () => _setFilters(f.copyWith(field: null))),
                for (final (name, _) in _fields!)
                  ToggleChip(label: name, on: f.field == name, onTap: () => _setFilters(f.copyWith(field: f.field == name ? null : name))),
              ]),
            _group('Sort', [
              for (final s in CourseSort.values) ToggleChip(label: s.label, on: f.sort == s, onTap: () => _setFilters(f.copyWith(sort: s))),
            ]),
            _group('Also show', [
              ToggleChip(
                label: 'Courses no longer offered',
                icon: LucideIcons.history,
                on: f.includeExpired,
                onTap: () => _setFilters(f.copyWith(includeExpired: !f.includeExpired)),
              ),
            ]),
            if (f.hasFilters || f.query.isNotEmpty) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  SmallButton(label: 'Clear all', icon: LucideIcons.x, onTap: _clearAll),
                  const SizedBox(width: 8),
                  SmallButton(label: 'Done', primary: true, onTap: () => setState(() => _filtersOpen = false)),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// The panel's filters as removable chips while the panel is closed.
  Widget _activeFilters() {
    final f = _f;
    final chips = <Widget>[
      if (f.provider != null) _RemovableChip(f.providerLabel ?? f.provider!, () => _setFilters(f.copyWith(provider: null, providerLabel: null))),
      if (f.state != null) _RemovableChip(f.state!, () => _setFilters(f.copyWith(state: null))),
      if (f.city.isNotEmpty)
        _RemovableChip(f.city, () {
          _city.clear();
          _setFilters(f.copyWith(city: ''));
        }),
      if (f.field != null) _RemovableChip(f.field!, () => _setFilters(f.copyWith(field: null))),
      if (f.maxAnnualFee != null) _RemovableChip('≤ ${formatAud(f.maxAnnualFee)}/yr', () => _setFilters(f.copyWith(maxAnnualFee: null))),
      if (f.sort != CourseSort.relevance) _RemovableChip(f.sort.label, () => _setFilters(f.copyWith(sort: CourseSort.relevance))),
      if (f.includeExpired) _RemovableChip('Incl. no longer offered', () => _setFilters(f.copyWith(includeExpired: false))),
    ];
    if (chips.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(spacing: 6, runSpacing: 6, children: chips),
    );
  }

  // ── Dashboard (no search yet) ───────────────────────────────────────────────────────────────────

  Widget _dashboard() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 14),
        const StudyProgressCard(),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _QuickTile(
                icon: LucideIcons.landmark,
                title: 'Universities',
                subtitle: 'Websites, campuses, courses',
                onTap: () => context.push('/study/universities'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _QuickTile(
                icon: LucideIcons.microscope,
                title: 'Research degrees',
                subtitle: _researchCount == null ? 'Masters by research, PhD' : '${formatCount(_researchCount!)} MRes & PhD',
                onTap: () => _setFilters(const CourseFilters(researchOnly: true)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: ValueListenableBuilder<List<String>>(
                valueListenable: shortlist,
                builder: (context, list, _) => _QuickTile(
                  icon: LucideIcons.bookmark,
                  title: 'My shortlist',
                  subtitle: list.isEmpty ? 'Save courses to compare' : plural(list.length, 'saved course'),
                  onTap: () => context.push('/study/shortlist'),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ValueListenableBuilder<List<String>>(
                valueListenable: compareCodes,
                builder: (context, list, _) => _QuickTile(
                  icon: LucideIcons.gitCompareArrows,
                  title: 'Compare',
                  subtitle: list.isEmpty ? 'Up to $maxCompare side by side' : '${list.length} of $maxCompare picked',
                  onTap: () => context.push('/study/compare?codes=${list.join(',')}'),
                ),
              ),
            ),
          ],
        ),
        ValueListenableBuilder<List<CourseSummary>>(
          valueListenable: recentCourses,
          builder: (context, recent, _) {
            if (recent.isEmpty) return const SizedBox.shrink();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('Recently viewed'),
                for (final c in recent.take(3))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: CourseCard(course: c, compact: true, onTap: () => openCourse(context, c)),
                  ),
              ],
            );
          },
        ),
        if (_fields != null && _fields!.isNotEmpty) ...[
          const SectionLabel('Browse by field'),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final (name, n) in _fields!)
                ToggleChip(label: '$name · ${formatCount(n)}', on: false, onTap: () => _setFilters(_f.copyWith(field: name))),
            ],
          ),
        ],
      ],
    );
  }

  // ── Results ─────────────────────────────────────────────────────────────────────────────────────

  Widget _resultsHeader() {
    final String title;
    if (_loading) {
      title = 'Searching…';
    } else if (_error != null) {
      title = 'Courses';
    } else {
      title = _browsing ? 'All courses · ${formatCount(_total)}' : plural(_total, 'course');
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 20, 2, 8),
      child: Row(
        children: [
          Expanded(child: Text(title.toUpperCase(), style: AppText.label)),
          Pressable(
            onTap: () => setState(() => _filtersOpen = true),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.arrowUpDown, size: 11, color: AppColors.muted),
                const SizedBox(width: 4),
                Text(_f.sort.label, style: AppText.tiny),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _results(EdgeInsets pad) {
    if (_loading && _items.isEmpty) {
      return [const SliverToBoxAdapter(child: LoadingBlock('Searching courses…'))];
    }
    if (_error != null) {
      return [
        SliverPadding(
          padding: pad,
          sliver: SliverToBoxAdapter(
            child: ErrorBlock(title: "Couldn't search courses", error: _error!, onRetry: _search),
          ),
        ),
      ];
    }
    if (_items.isEmpty) {
      return [
        SliverPadding(
          padding: pad,
          sliver: SliverToBoxAdapter(
            child: MessageBlock(
              icon: LucideIcons.searchX,
              title: 'No courses match',
              body: 'Try fewer words, another level or state, or a higher fee limit.',
              action: _f.hasFilters ? SmallButton(label: 'Clear filters', icon: LucideIcons.x, onTap: _clearAll) : null,
            ),
          ),
        ),
      ];
    }
    return [
      SliverPadding(
        padding: pad,
        sliver: SliverOpacity(
          // Dim the old results while a new search runs, instead of clearing them.
          opacity: _loading ? 0.45 : 1,
          sliver: SliverList.builder(
            itemCount: _items.length,
            itemBuilder: (context, i) {
              if (i >= _items.length - 5) WidgetsBinding.instance.addPostFrameCallback((_) => _loadMore());
              final c = _items[i];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: CourseCard(
                  key: ValueKey(c.courseCode),
                  course: c,
                  onTap: () => openCourse(context, c),
                  trailing: SaveCourseButton(code: c.courseCode),
                ),
              );
            },
          ),
        ),
      ),
    ];
  }

  Widget _footer() {
    if (_loading || _error != null || _items.isEmpty) return const SizedBox.shrink();
    if (_moreError != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            const Expanded(child: Text("Couldn't load more courses.", style: AppText.small)),
            SmallButton(
              label: 'Try again',
              icon: LucideIcons.rotateCw,
              onTap: () {
                setState(() => _moreError = null);
                _loadMore();
              },
            ),
          ],
        ),
      );
    }
    if (_loadingMore || _items.length < _total) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 18),
        child: Center(
          child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 1.8, color: AppColors.muted)),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Center(
        child: Text(
          _items.length == 1 ? 'That is the only match.' : 'That is all ${formatCount(_items.length)}.',
          style: AppText.tiny,
        ),
      ),
    );
  }
}

class _QuickTile extends StatelessWidget {
  const _QuickTile({required this.icon, required this.title, required this.subtitle, required this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    scale: 0.97,
    child: Panel(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(9)),
            child: Icon(icon, size: 14, color: AppColors.brand),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.heading.copyWith(fontSize: 12.5), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 1),
                Text(subtitle, style: AppText.tiny, maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _RemovableChip extends StatelessWidget {
  const _RemovableChip(this.label, this.onRemove);
  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Pressable(
    scale: 0.95,
    onTap: onRemove,
    child: Container(
      height: 28,
      padding: const EdgeInsets.only(left: 10, right: 7),
      decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 220),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.small.copyWith(color: AppColors.brand, fontWeight: FontWeight.w500),
            ),
          ),
          const SizedBox(width: 4),
          const Icon(LucideIcons.x, size: 12, color: AppColors.brand),
        ],
      ),
    ),
  );
}

/// A bookmark that saves the course to the shortlist (or removes it).
class SaveCourseButton extends StatelessWidget {
  const SaveCourseButton({super.key, required this.code});
  final String code;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<List<String>>(
    valueListenable: shortlist,
    builder: (context, list, _) {
      final on = list.contains(code);
      return Pressable(
        scale: 0.85,
        onTap: () => setShortlisted(code, !on).catchError((Object e) {
          if (context.mounted) studyToast(context, "Couldn't update your shortlist: ${errorText(e)}", error: true);
        }),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Icon(on ? LucideIcons.bookmarkCheck : LucideIcons.bookmark, size: 16, color: on ? AppColors.brand : AppColors.faint),
        ),
      );
    },
  );
}
