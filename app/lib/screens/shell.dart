import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/quick_actions.dart';
import '../motion.dart';
import '../theme.dart';
import '../widgets/common.dart';

const _tabs = [
  (LucideIcons.messageCircle, 'Ask'),
  (LucideIcons.scale, 'Assess'),
  (LucideIcons.folder, 'Docs'),
  (LucideIcons.database, 'Sources'),
];

/// Opens the tab an action belongs to, then tells that screen to act.
void runQuickAction(void Function(int index) goBranch, QuickAction a) {
  goBranch(switch (a) {
    QuickAction.newChat => 0,
    QuickAction.caseFile => 1,
    QuickAction.upload => 2,
  });
  quickActions.value = QuickActionEvent(a);
}

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  void _go(int i) => shell.goBranch(i, initialLocation: i == shell.currentIndex);

  void _action(QuickAction a) => runQuickAction(shell.goBranch, a);

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
      bottomNavigationBar: wide ? null : _PillBar(index: shell.currentIndex, onTap: _go, onAction: _action),
    );
  }
}

/// Phone navigation: icon-only pill with a raised "pressed-in" active tab that
/// slides between items, plus a separate round "+" button for quick actions.
class _PillBar extends StatelessWidget {
  const _PillBar({required this.index, required this.onTap, required this.onAction});
  final int index;
  final ValueChanged<int> onTap;
  final ValueChanged<QuickAction> onAction;

  static const _height = 54.0;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(
          children: [
            Expanded(
              child: Container(
                height: _height,
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(_height / 2),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xF21D1D21), Color(0xF2151518)],
                  ),
                  border: Border.all(color: const Color(0x12FFFFFF)),
                  boxShadow: const [
                    BoxShadow(color: Color(0x80000000), blurRadius: 24, offset: Offset(0, 10)),
                    BoxShadow(color: Color(0x40000000), blurRadius: 4, offset: Offset(0, 1)),
                  ],
                ),
                child: LayoutBuilder(
                  builder: (context, c) {
                    final w = c.maxWidth / _tabs.length;
                    return Stack(
                      fit: StackFit.expand,
                      children: [
                        // The raised active tab, sliding on a spring-like curve.
                        AnimatedPositioned(
                          duration: Motion.slow,
                          curve: Motion.ease,
                          left: w * index,
                          width: w,
                          top: 0,
                          bottom: 0,
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(_height),
                              gradient: const LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [Color(0xFF34343A), Color(0xFF2A2A2F)],
                              ),
                              border: Border.all(color: const Color(0x1AFFFFFF)),
                              boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 10, offset: Offset(0, 3))],
                            ),
                          ),
                        ),
                        Row(
                          children: [
                            for (final (i, t) in _tabs.indexed)
                              Expanded(
                                child: Semantics(
                                  label: t.$2,
                                  selected: i == index,
                                  button: true,
                                  child: Pressable(
                                    scale: 0.88,
                                    onTap: () => onTap(i),
                                    child: Center(
                                      child: AnimatedScale(
                                        scale: i == index ? 1.08 : 1,
                                        duration: Motion.medium,
                                        curve: Motion.ease,
                                        child: TweenAnimationBuilder<Color?>(
                                          tween: ColorTween(end: i == index ? AppColors.fg : const Color(0xFF7A7A82)),
                                          duration: Motion.medium,
                                          builder: (_, col, _) => Icon(t.$1, size: 19, color: col),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
            const SizedBox(width: 10),
            _PlusButton(size: _height, onAction: onAction),
          ],
        ),
      ),
    );
  }
}

class _PlusButton extends StatefulWidget {
  const _PlusButton({required this.size, required this.onAction});
  final double size;
  final ValueChanged<QuickAction> onAction;

  @override
  State<_PlusButton> createState() => _PlusButtonState();
}

class _PlusButtonState extends State<_PlusButton> {
  final _overlay = OverlayPortalController();
  final _link = LayerLink();
  bool _open = false;

  void _toggle() {
    setState(() => _open = !_open);
    if (_open) _overlay.show();
  }

  void _close() => setState(() => _open = false);

  void _pick(QuickAction a) {
    _close();
    widget.onAction(a);
  }

  @override
  Widget build(BuildContext context) {
    const items = [
      (QuickAction.newChat, LucideIcons.messageCirclePlus, 'New chat'),
      (QuickAction.upload, LucideIcons.upload, 'Upload documents'),
      (QuickAction.caseFile, LucideIcons.clipboardPen, 'Update case file'),
    ];
    return CompositedTransformTarget(
      link: _link,
      child: OverlayPortal(
        controller: _overlay,
        overlayChildBuilder: (context) => Stack(
          children: [
            // Dim the page; tap anywhere to close.
            Positioned.fill(
              child: GestureDetector(
                onTap: _close,
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: _open ? 1 : 0),
                  duration: Motion.medium,
                  curve: Motion.ease,
                  onEnd: () {
                    if (!_open) _overlay.hide();
                  },
                  builder: (_, t, _) => ColoredBox(color: Colors.black.withValues(alpha: 0.45 * t)),
                ),
              ),
            ),
            CompositedTransformFollower(
              link: _link,
              targetAnchor: Alignment.topRight,
              followerAnchor: Alignment.bottomRight,
              offset: const Offset(0, -12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final (i, it) in items.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AnimatedSlide(
                        offset: _open ? Offset.zero : const Offset(0, 0.4),
                        duration: Duration(milliseconds: 260 + (items.length - i) * 40),
                        curve: Motion.ease,
                        child: AnimatedOpacity(
                          opacity: _open ? 1 : 0,
                          duration: Duration(milliseconds: 160 + (items.length - i) * 40),
                          child: Pressable(
                            onTap: () => _pick(it.$1),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: AppColors.raised,
                                borderRadius: BorderRadius.circular(22),
                                border: Border.all(color: const Color(0x14FFFFFF)),
                                boxShadow: const [BoxShadow(color: Color(0x80000000), blurRadius: 16, offset: Offset(0, 6))],
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(it.$2, size: 15, color: AppColors.fg),
                                  const SizedBox(width: 8),
                                  Text(
                                    it.$3,
                                    style: AppText.small.copyWith(color: AppColors.fg, fontWeight: FontWeight.w500),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        child: Pressable(
          scale: 0.9,
          onTap: _toggle,
          child: Container(
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFFF4F4F5), Color(0xFFD4D4D8)],
              ),
              border: Border.all(color: const Color(0x33FFFFFF)),
              boxShadow: const [BoxShadow(color: Color(0x80000000), blurRadius: 20, offset: Offset(0, 8))],
            ),
            child: AnimatedRotation(
              turns: _open ? 0.125 : 0,
              duration: Motion.medium,
              curve: Motion.ease,
              child: const Icon(LucideIcons.plus, size: 22, color: AppColors.bg),
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
