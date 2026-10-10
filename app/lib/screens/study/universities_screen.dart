import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../data/study.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../shell.dart';
import 'widgets.dart';

/// Every CRICOS provider with "University" in its name: official website, states and campuses.
class UniversitiesScreen extends StatefulWidget {
  const UniversitiesScreen({super.key});

  @override
  State<UniversitiesScreen> createState() => _UniversitiesScreenState();
}

class _UniversitiesScreenState extends State<UniversitiesScreen> {
  final _q = TextEditingController();
  List<UniversityEntry>? _all;
  Object? _error;
  String _query = '';
  String? _state;
  String? _type; // public | private

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

  Future<void> _load({bool refresh = false}) async {
    try {
      final list = await universities(refresh: refresh);
      if (mounted) {
        setState(() {
          _all = list;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  List<UniversityEntry> get _shown {
    final q = _query.trim().toLowerCase();
    return [
      for (final u in _all ?? const <UniversityEntry>[])
        if ((_state == null || u.states.contains(_state)) &&
            (_type == null || (_type == 'public') == u.info.isPublic) &&
            (q.isEmpty ||
                u.info.name.toLowerCase().contains(q) ||
                u.info.tradingName.toLowerCase().contains(q) ||
                u.info.city.toLowerCase().contains(q) ||
                u.info.code.toLowerCase() == q))
          u,
    ];
  }

  @override
  Widget build(BuildContext context) {
    const pad = EdgeInsets.symmetric(horizontal: 16);
    final shown = _shown;
    return StudyPage(
      child: CustomScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          SliverPadding(
            padding: pad,
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const PageHeader(back: true, title: 'Universities', subtitle: 'Registered on CRICOS to teach international students'),
                  SearchBox(
                    controller: _q,
                    placeholder: 'Search by name or city',
                    onChanged: (v) => setState(() => _query = v),
                    onClear: () => setState(() => _query = ''),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 30,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        ToggleChip(label: 'All states', on: _state == null, onTap: () => setState(() => _state = null)),
                        for (final s in auStates) ...[
                          const SizedBox(width: 6),
                          ToggleChip(label: s, on: _state == s, onTap: () => setState(() => _state = _state == s ? null : s)),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Segmented<String>(
                    value: _type ?? 'all',
                    onChanged: (v) => setState(() => _type = v == 'all' ? null : v),
                    options: const [('all', 'All'), ('public', 'Public'), ('private', 'Private')],
                  ),
                  SectionLabel(_all == null ? 'Universities' : plural(shown.length, 'university', 'universities')),
                ],
              ),
            ),
          ),
          if (_all == null && _error == null)
            const SliverToBoxAdapter(child: LoadingBlock('Loading universities…'))
          else if (_all == null)
            SliverPadding(
              padding: pad,
              sliver: SliverToBoxAdapter(
                child: ErrorBlock(title: "Couldn't load universities", error: _error!, onRetry: () => _load(refresh: true)),
              ),
            )
          else if (shown.isEmpty)
            const SliverPadding(
              padding: pad,
              sliver: SliverToBoxAdapter(
                child: MessageBlock(icon: LucideIcons.searchX, title: 'No universities match', body: 'Try another state or name.'),
              ),
            )
          else
            SliverPadding(
              padding: pad,
              sliver: SliverList.builder(
                itemCount: shown.length,
                itemBuilder: (context, i) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: _UniTile(shown[i]),
                ),
              ),
            ),
          SliverToBoxAdapter(child: SizedBox(height: bottomGap(context))),
        ],
      ),
    );
  }
}

class _UniTile extends StatelessWidget {
  const _UniTile(this.u);
  final UniversityEntry u;

  @override
  Widget build(BuildContext context) {
    final i = u.info;
    final states = (u.states.toList()..sort()).join(', ');
    final meta = [
      if (i.city.isNotEmpty) i.city,
      if (states.isNotEmpty) states,
      if (u.campuses > 0) plural(u.campuses, 'campus', 'campuses'),
    ].join(' · ');
    return RepaintBoundary(
      child: Pressable(
        scale: 0.985,
        onTap: () => context.push('/study/provider/${i.code}'),
        child: Panel(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: (i.isPublic ? AppColors.brand : AppColors.muted).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(LucideIcons.landmark, size: 15, color: i.isPublic ? AppColors.brand : AppColors.muted),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(i.displayName, style: AppText.heading.copyWith(fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(meta, style: AppText.tiny, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              if (i.websiteUrl.isNotEmpty)
                Pressable(
                  scale: 0.85,
                  onTap: () => openExternal(context, i.websiteUrl),
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(15)),
                    child: const Icon(LucideIcons.externalLink, size: 13, color: AppColors.fg),
                  ),
                ),
              const SizedBox(width: 4),
              const Icon(LucideIcons.chevronRight, size: 15, color: AppColors.faint),
            ],
          ),
        ),
      ),
    );
  }
}
