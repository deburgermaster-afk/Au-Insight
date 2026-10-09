import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/quick_actions.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../shell.dart';

/// Intake sections, in the order the chat asks about them (see supabase/functions/chat/profile.ts).
const _sections = [
  ('personal', LucideIcons.userRound, 'Personal'),
  ('arrival', LucideIcons.plane, 'Arrival'),
  ('residence', LucideIcons.house, 'Where you live'),
  ('study', LucideIcons.graduationCap, 'Study'),
  ('currentVisa', LucideIcons.idCard, 'Visa now'),
  ('work', LucideIcons.briefcase, 'Work'),
  ('partner', LucideIcons.heartHandshake, 'Partner & family'),
  ('english', LucideIcons.languages, 'English'),
  ('goals', LucideIcons.target, 'Goals'),
];

bool _filled(Object? v) => v is List ? v.isNotEmpty : v is Map && v.isNotEmpty;

String _label(String key) {
  final spaced = key.replaceAllMapped(RegExp('[A-Z]'), (m) => ' ${m[0]!.toLowerCase()}');
  return spaced[0].toUpperCase() + spaced.substring(1);
}

String _value(Object? v) => switch (v) {
  true => 'Yes',
  false => 'No',
  List l => l.join(', '),
  _ => '$v',
};

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _sb = Supabase.instance.client;
  Map<String, dynamic>? _profile;
  String _story = '';

  @override
  void initState() {
    super.initState();
    _load();
    profileChanged.addListener(_load);
  }

  @override
  void dispose() {
    profileChanged.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    final row = await _sb.from('cases').select('story, profile').order('created_at').limit(1).maybeSingle();
    if (!mounted) return;
    setState(() {
      _profile = ((row?['profile'] as Map?) ?? {}).cast<String, dynamic>();
      _story = (row?['story'] as String?) ?? '';
    });
  }

  void _tellChat() => runQuickAction(StatefulNavigationShell.of(context).goBranch, QuickAction.newChat);

  @override
  Widget build(BuildContext context) {
    final p = _profile;
    final covered = p == null ? 0 : _sections.where((s) => _filled(p[s.$1])).length;
    final email = _sb.auth.currentUser?.email ?? '';
    return SafeArea(
      bottom: false,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: RefreshIndicator(
            onRefresh: _load,
            color: AppColors.fg,
            backgroundColor: AppColors.raised,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
              children: [
                PageHeader(title: 'Profile', subtitle: email),
                Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Text('Your story', style: AppText.heading),
                          const Spacer(),
                          Text('$covered of ${_sections.length} covered', style: AppText.tiny),
                        ],
                      ),
                      const SizedBox(height: 10),
                      AnimatedBar(value: covered / _sections.length, color: AppColors.brand),
                      const SizedBox(height: 10),
                      Text(
                        covered == _sections.length
                            ? 'Complete. Ask the chat for a plan any time.'
                            : 'The chat fills this in as you talk. Tell it what is missing to get a better plan.',
                        style: AppText.small,
                      ),
                      if (covered < _sections.length) ...[
                        const SizedBox(height: 12),
                        PillButton(label: 'Continue in chat', icon: LucideIcons.messageCircle, height: 36, onTap: _tellChat),
                      ],
                    ],
                  ),
                ).enter(0),
                const SizedBox(height: 16),
                const Text('DETAILS', style: AppText.label),
                const SizedBox(height: 8),
                if (p == null)
                  const Padding(
                    padding: EdgeInsets.all(30),
                    child: Center(child: ShimmerText('Loading…')),
                  )
                else
                  for (final (i, s) in _sections.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _Section(icon: s.$2, title: s.$3, value: p[s.$1], extra: s.$1 == 'partner' ? p['dependents'] : null),
                    ).enter(i + 1),
                if (_story.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _Expandable(
                    icon: LucideIcons.bookOpen,
                    title: 'Timeline',
                    child: Text(_story, style: AppText.small.copyWith(color: AppColors.fg)),
                  ),
                ],
                const SizedBox(height: 16),
                const Text('TOOLS', style: AppText.label),
                const SizedBox(height: 8),
                _Link(
                  icon: LucideIcons.scale,
                  title: 'Eligibility check',
                  subtitle: 'Points test and skilled visa criteria, computed by the rules engine',
                  onTap: () => context.push('/profile/eligibility'),
                ),
                _Link(
                  icon: LucideIcons.database,
                  title: 'Sources & data',
                  subtitle: 'Where every answer comes from, crawl progress and storage',
                  onTap: () => context.push('/profile/sources'),
                ),
                _Link(icon: LucideIcons.logOut, title: 'Sign out', onTap: () => _sb.auth.signOut()),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.icon, required this.title, required this.value, this.extra});
  final IconData icon;
  final String title;
  final Object? value;
  final Object? extra;

  @override
  Widget build(BuildContext context) {
    final filled = _filled(value);
    final rows = <Widget>[];
    void addMap(Map m) {
      for (final e in m.entries) {
        if (e.value == null || '${e.value}'.isEmpty) continue;
        rows.add(
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 110, child: Text(_label('${e.key}'), style: AppText.small)),
                Expanded(
                  child: Text(_value(e.value), style: AppText.small.copyWith(color: AppColors.fg)),
                ),
              ],
            ),
          ),
        );
      }
    }

    void addList(List l) {
      for (final (i, item) in l.indexed) {
        if (item is! Map) continue;
        if (i > 0) {
          rows.add(
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Divider(height: 1, color: AppColors.border),
            ),
          );
        }
        addMap(item);
      }
    }

    if (value is Map) addMap(value as Map);
    if (value is List) addList(value as List);
    if (extra is List && (extra as List).isNotEmpty) {
      rows.add(
        const Padding(
          padding: EdgeInsets.only(top: 10),
          child: Text('Dependents', style: AppText.label),
        ),
      );
      addList(extra as List);
    }

    return _Expandable(
      icon: icon,
      title: title,
      trailing: filled
          ? const Icon(LucideIcons.circleCheck, size: 14, color: AppColors.success)
          : Text('Not yet', style: AppText.tiny.copyWith(color: AppColors.warning)),
      child: filled
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: rows)
          : const Text('Tell the chat about this and it will appear here.', style: AppText.small),
    );
  }
}

class _Expandable extends StatefulWidget {
  const _Expandable({required this.icon, required this.title, required this.child, this.trailing});
  final IconData icon;
  final String title;
  final Widget child;
  final Widget? trailing;
  @override
  State<_Expandable> createState() => _ExpandableState();
}

class _ExpandableState extends State<_Expandable> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return Pressable(
      scale: 0.99,
      onTap: () => setState(() => _open = !_open),
      child: Panel(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(widget.icon, size: 15, color: AppColors.muted),
                const SizedBox(width: 10),
                Expanded(child: Text(widget.title, style: AppText.heading)),
                ?widget.trailing,
                const SizedBox(width: 8),
                AnimatedRotation(
                  turns: _open ? 0.5 : 0,
                  duration: Motion.medium,
                  child: const Icon(LucideIcons.chevronDown, size: 14, color: AppColors.faint),
                ),
              ],
            ),
            AnimatedSize(
              duration: Motion.medium,
              curve: Motion.ease,
              alignment: Alignment.topLeft,
              child: _open
                  ? Padding(padding: const EdgeInsets.only(top: 8, left: 25), child: widget.child)
                  : const SizedBox(width: double.infinity),
            ),
          ],
        ),
      ),
    );
  }
}

class _Link extends StatelessWidget {
  const _Link({required this.icon, required this.title, this.subtitle, required this.onTap});
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Pressable(
        onTap: onTap,
        child: Panel(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Icon(icon, size: 15, color: AppColors.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AppText.heading),
                    if (subtitle != null) ...[const SizedBox(height: 2), Text(subtitle!, style: AppText.tiny)],
                  ],
                ),
              ),
              const Icon(LucideIcons.chevronRight, size: 15, color: AppColors.faint),
            ],
          ),
        ),
      ),
    );
  }
}
