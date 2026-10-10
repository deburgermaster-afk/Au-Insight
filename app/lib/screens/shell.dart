import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/quick_actions.dart';
import '../data/safe_area.dart';
import '../data/uploads.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// The tabs, in branch order (router.dart builds the branches in the same order).
const _tabs = [
  (LucideIcons.messageCircle, 'Ask', 'Ask'),
  (LucideIcons.graduationCap, 'Study', 'Study'),
  (LucideIcons.briefcaseBusiness, 'Jobs', 'Occupations'),
  (LucideIcons.clipboardList, 'Cases', 'Cases'),
  (LucideIcons.folder, 'Docs', 'Documents'),
  (LucideIcons.user, 'Profile', 'Profile'),
];

/// Branch index of each tab, for screens that switch tabs.
abstract final class Tabs {
  static const ask = 0, study = 1, jobs = 2, cases = 3, documents = 4, profile = 5;
}

/// Opens the tab an action belongs to, then tells that screen to act.
void runQuickAction(void Function(int index) goBranch, QuickAction a) {
  // Open the file picker first, while still inside the tap; then show Documents for the progress.
  if (a == QuickAction.upload) uploads.pickAndUpload();
  goBranch(switch (a) {
    QuickAction.newChat => Tabs.ask,
    QuickAction.caseFile => Tabs.profile,
    QuickAction.upload => Tabs.documents,
  });
  quickActions.value = QuickActionEvent(a);
}

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  // Tapping the open tab again takes it back to its first page.
  void _go(int i) => shell.goBranch(i, initialLocation: i == shell.currentIndex);

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 860;
    return Scaffold(
      body: wide
          ? Row(
              children: [
                _Rail(index: shell.currentIndex, onTap: _go),
                Expanded(child: shell),
              ],
            )
          : shell,
      bottomNavigationBar: wide ? null : _TabBar(index: shell.currentIndex, onTap: _go),
    );
  }
}

/// Phone navigation: a plain docked bar, full width, every tab a large opaque target.
/// No overlays, no floating layers, nothing animated per frame.
class _TabBar extends StatelessWidget {
  const _TabBar({required this.index, required this.onTap});
  final int index;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<EdgeInsets>(
      valueListenable: safeAreaInsets,
      builder: (context, insets, _) {
        final bottom = [MediaQuery.viewPaddingOf(context).bottom, insets.bottom, 6.0].reduce((a, b) => a > b ? a : b);
        return DecoratedBox(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: Padding(
            padding: EdgeInsets.only(bottom: bottom),
            child: SizedBox(
              height: 58,
              child: Row(
                children: [
                  for (final (i, t) in _tabs.indexed)
                    Expanded(
                      child: _TabItem(icon: t.$1, label: t.$2, semantics: t.$3, active: i == index, onTap: () => onTap(i)),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TabItem extends StatelessWidget {
  const _TabItem({required this.icon, required this.label, required this.semantics, required this.active, required this.onTap});
  final IconData icon;
  final String label;
  final String semantics;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.fg : AppColors.muted;
    return Semantics(
      label: semantics,
      selected: active,
      button: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 44,
              height: 26,
              decoration: BoxDecoration(color: active ? AppColors.raised : Colors.transparent, borderRadius: BorderRadius.circular(13)),
              child: Icon(icon, size: 17, color: color),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              style: TextStyle(fontSize: 10, height: 1.1, color: color, fontWeight: active ? FontWeight.w600 : FontWeight.w400),
            ),
          ],
        ),
      ),
    );
  }
}

class _Rail extends StatelessWidget {
  const _Rail({required this.index, required this.onTap});
  final int index;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final email = Supabase.instance.client.auth.currentUser?.email ?? '';
    return Container(
      width: 208,
      padding: const EdgeInsets.fromLTRB(10, 18, 10, 14),
      decoration: const BoxDecoration(
        border: Border(right: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: [
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(color: AppColors.fg, borderRadius: BorderRadius.circular(7)),
                  child: const Icon(LucideIcons.plane, size: 12, color: AppColors.bg),
                ),
                const SizedBox(width: 8),
                const Text('Immi Insight', style: AppText.heading),
              ],
            ),
          ),
          const SizedBox(height: 22),
          for (final (i, t) in _tabs.indexed)
            SizedBox(
              height: 34,
              child: Pressable(
                scale: 0.97,
                onTap: () => onTap(i),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  margin: const EdgeInsets.only(bottom: 2),
                  decoration: BoxDecoration(
                    color: i == index ? AppColors.raised : Colors.transparent,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Row(
                    children: [
                      Icon(t.$1, size: 14, color: i == index ? AppColors.fg : AppColors.muted),
                      const SizedBox(width: 9),
                      Text(t.$3, style: AppText.body.copyWith(fontSize: 12.5, color: i == index ? AppColors.fg : AppColors.muted)),
                    ],
                  ),
                ),
              ),
            ),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(email, style: AppText.tiny, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(height: 6),
          Pressable(
            onTap: () => Supabase.instance.client.auth.signOut(),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Row(
                children: [
                  Icon(LucideIcons.logOut, size: 14, color: AppColors.muted),
                  SizedBox(width: 9),
                  Text('Sign out', style: AppText.small),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Standard page header used by the tab screens.
class PageHeader extends StatelessWidget {
  const PageHeader({super.key, required this.title, this.subtitle, this.trailing, this.back = false});
  final String title;
  final String? subtitle;
  final Widget? trailing;

  /// Shows a back button above the title: for pages pushed on top of a tab.
  final bool back;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(0, back ? 8 : 14, 0, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (back)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Pressable(
                onTap: () => context.pop(),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(6, 6, 12, 6),
                  decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(16)),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(LucideIcons.chevronLeft, size: 15, color: AppColors.fg),
                      SizedBox(width: 2),
                      Text('Back', style: TextStyle(fontSize: 11.5, color: AppColors.fg)),
                    ],
                  ),
                ),
              ),
            ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AppText.title),
                    if (subtitle != null) ...[const SizedBox(height: 3), Text(subtitle!, style: AppText.small)],
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 10), trailing!],
            ],
          ),
        ],
      ),
    );
  }
}

/// Signs out from the narrow layout (no rail).
class SignOutButton extends StatelessWidget {
  const SignOutButton({super.key});

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: () => Supabase.instance.client.auth.signOut(),
    child: Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(15)),
      child: const Icon(LucideIcons.logOut, size: 13, color: AppColors.muted),
    ),
  );
}
