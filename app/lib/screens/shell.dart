import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../motion.dart';
import '../theme.dart';
import '../widgets/common.dart';

const _tabs = [
  (LucideIcons.messageCircle, 'Ask'),
  (LucideIcons.scale, 'Assess'),
  (LucideIcons.folder, 'Docs'),
  (LucideIcons.database, 'Sources'),
];

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  void _go(int i) => shell.goBranch(i, initialLocation: i == shell.currentIndex);

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 860;
    return Scaffold(
      extendBody: true,
      body: Row(
        children: [
          if (wide) _Rail(index: shell.currentIndex, onTap: _go),
          Expanded(child: shell),
        ],
      ),
      bottomNavigationBar: wide ? null : _PillBar(index: shell.currentIndex, onTap: _go),
    );
  }
}

class _PillBar extends StatelessWidget {
  const _PillBar({required this.index, required this.onTap});
  final int index;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: 10),
      child: Center(
        heightFactor: 1,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(28),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: AppColors.card.withValues(alpha: 0.78),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: AppColors.border),
              ),
              child: SizedBox(
                width: 76.0 * _tabs.length,
                height: 40,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    AnimatedPositioned(
                      duration: Motion.slow,
                      curve: Motion.ease,
                      left: 76.0 * index,
                      width: 76,
                      top: 0,
                      bottom: 0,
                      child: Container(
                        decoration: BoxDecoration(color: AppColors.fg, borderRadius: BorderRadius.circular(22)),
                      ),
                    ),
                    Row(
                      children: [
                        for (final (i, t) in _tabs.indexed)
                          SizedBox(
                            width: 76,
                            child: Pressable(
                              scale: 0.92,
                              onTap: () => onTap(i),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  TweenAnimationBuilder<Color?>(
                                    tween: ColorTween(end: i == index ? AppColors.bg : AppColors.muted),
                                    duration: Motion.medium,
                                    builder: (_, c, _) => Icon(t.$1, size: 14, color: c),
                                  ),
                                  const SizedBox(width: 4),
                                  AnimatedDefaultTextStyle(
                                    duration: Motion.medium,
                                    style: AppText.tiny.copyWith(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: i == index ? AppColors.bg : AppColors.muted,
                                    ),
                                    child: Text(t.$2),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
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
          SizedBox(
            height: 34.0 * _tabs.length,
            child: Stack(
              children: [
                AnimatedPositioned(
                  duration: Motion.slow,
                  curve: Motion.ease,
                  top: 34.0 * index,
                  left: 0,
                  right: 0,
                  height: 32,
                  child: Container(
                    decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(9)),
                  ),
                ),
                Column(
                  children: [
                    for (final (i, t) in _tabs.indexed)
                      SizedBox(
                        height: 34,
                        child: Pressable(
                          scale: 0.97,
                          onTap: () => onTap(i),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: Row(
                              children: [
                                Icon(t.$1, size: 14, color: i == index ? AppColors.fg : AppColors.muted),
                                const SizedBox(width: 9),
                                Text(
                                  t.$2 == 'Docs' ? 'Documents' : t.$2,
                                  style: AppText.body.copyWith(fontSize: 12.5, color: i == index ? AppColors.fg : AppColors.muted),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
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
  const PageHeader({super.key, required this.title, this.subtitle, this.trailing});
  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 14, 0, 12),
      child: Row(
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
          ?trailing,
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
