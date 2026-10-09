import 'dart:math' as math;
import 'dart:ui' show PointerDeviceKind;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../motion.dart';
import '../theme.dart';
import '../widgets/common.dart';

class _Slide {
  const _Slide(this.title, this.accent, this.body, this.art);
  final String title;
  final String accent;
  final String body;
  final Widget Function(double page) art;
}

final _slides = [
  _Slide(
    'Visa decisions,',
    'not guesses.',
    'Every answer is computed from the Migration Act, the Regulations and Home Affairs — and cites the exact clause.',
    (p) => _DecisionArt(p),
  ),
  _Slide(
    'The whole law,',
    'always current.',
    'Every visa page, every tab, every folded section, every instrument — re-read daily from official sources, with a history of what changed.',
    (p) => _LawArt(p),
  ),
  _Slide(
    'Your documents,',
    'only yours.',
    'Stored privately in Sydney. The assistant can read them for you, and nothing else can.',
    (p) => _FolderArt(p),
  ),
];

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pages = PageController();
  double _page = 0;

  @override
  void initState() {
    super.initState();
    _pages.addListener(() => setState(() => _page = _pages.page ?? 0));
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  int get _index => _page.round();
  bool get _last => _index == _slides.length - 1;

  void _next() => _last ? context.go('/sign-up') : _pages.nextPage(duration: Motion.slow, curve: Motion.emphasized);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                children: [
                  SizedBox(
                    height: 40,
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Pressable(
                        onTap: () => context.go('/sign-in'),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('Skip', style: AppText.small),
                            Icon(LucideIcons.chevronRight, size: 14, color: AppColors.muted),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    // Let mouse and trackpad drag the pages too (web disables this by default).
                    child: ScrollConfiguration(
                      behavior: ScrollConfiguration.of(context).copyWith(dragDevices: PointerDeviceKind.values.toSet()),
                      child: PageView.builder(
                        controller: _pages,
                        itemCount: _slides.length,
                        itemBuilder: (context, i) {
                          final s = _slides[i];
                          final d = (_page - i).clamp(-1.0, 1.0);
                          return Opacity(
                            opacity: (1 - d.abs() * 0.8).clamp(0.0, 1.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Art moves slower than the page: parallax.
                                Expanded(
                                  child: Transform.translate(
                                    offset: Offset(d * 90, 0),
                                    child: Center(child: s.art(d)),
                                  ),
                                ),
                                Transform.translate(
                                  offset: Offset(d * 30, 0),
                                  child: Text.rich(
                                    TextSpan(
                                      children: [
                                        TextSpan(text: '${s.title}\n', style: AppText.display),
                                        TextSpan(text: s.accent, style: AppText.serif(AppText.display.copyWith(fontSize: 30))),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 10),
                                Transform.translate(
                                  offset: Offset(d * 50, 0),
                                  child: Text(s.body, style: AppText.small.copyWith(fontSize: 12.5, height: 1.5)),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      for (var i = 0; i < _slides.length; i++)
                        AnimatedContainer(
                          duration: Motion.medium,
                          curve: Motion.ease,
                          margin: const EdgeInsets.only(right: 5),
                          width: _index == i ? 20 : 6,
                          height: 5,
                          decoration: BoxDecoration(
                            color: _index == i ? AppColors.fg : AppColors.raised,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  PillButton(label: _last ? 'Create account' : 'Continue', onTap: _next, height: 44),
                  AnimatedSize(
                    duration: Motion.medium,
                    curve: Motion.ease,
                    child: _last
                        ? Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: PillButton(label: 'Sign in', secondary: true, height: 44, onTap: () => context.go('/sign-in')),
                          ).animate().fadeIn(duration: Motion.medium).slideY(begin: 0.3, end: 0, curve: Motion.ease)
                        : const SizedBox(width: double.infinity),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Gentle idle float, offset per card.
Widget _float(Widget child, {int delay = 0, double amount = 5}) => child
    .animate(onPlay: (c) => c.repeat(reverse: true))
    .moveY(begin: -amount / 2, end: amount / 2, duration: (2600 + delay).ms, curve: Curves.easeInOut);

class _DecisionArt extends StatelessWidget {
  const _DecisionArt(this.d);
  final double d;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 260,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            top: 0,
            left: 24,
            right: 0,
            child: Transform.rotate(
              angle: 0.05 + d * 0.1,
              child: Opacity(
                opacity: 0.35,
                child: Panel(child: const Text('Can my partner be included in a 190?', style: AppText.small)),
              ),
            ),
          ),
          Positioned(
            top: 52,
            left: 0,
            right: 18,
            child: _float(
              Panel(
                color: AppColors.raised,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Am I eligible for the 189 with 8 years overseas experience?', style: AppText.body),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            border: Border.all(color: AppColors.border),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text('Decision engine', style: AppText.tiny),
                        ),
                        const Spacer(),
                        Container(
                          width: 26,
                          height: 26,
                          decoration: const BoxDecoration(color: AppColors.fg, shape: BoxShape.circle),
                          child: const Icon(LucideIcons.arrowUp, size: 13, color: AppColors.bg),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ).animate().fadeIn(delay: 120.ms, duration: Motion.slow).slideY(begin: 0.2, end: 0, curve: Motion.ease),
          Positioned(
            bottom: 4,
            left: 36,
            right: 6,
            child: _float(
              delay: 500,
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.1),
                  border: Border.all(color: AppColors.brand.withValues(alpha: 0.3)),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 26,
                      height: 26,
                      decoration: const BoxDecoration(color: AppColors.brand, shape: BoxShape.circle),
                      child: const Icon(LucideIcons.check, size: 14, color: AppColors.brandFg),
                    ),
                    const SizedBox(width: 10),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Eligible · 85 points', style: AppText.heading),
                        Text('Sch 6D items 6D13, 6D21, 6D33', style: AppText.tiny),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ).animate().fadeIn(delay: 360.ms, duration: Motion.slow).scale(begin: const Offset(0.92, 0.92), curve: Motion.ease),
        ],
      ),
    );
  }
}

class _LawArt extends StatelessWidget {
  const _LawArt(this.d);
  final double d;

  @override
  Widget build(BuildContext context) {
    const rows = [
      'Migration Act 1958',
      'Migration Regulations 1994',
      '191 migration instruments',
      'Home Affairs · every tab',
      'State nomination programs',
    ];
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final (i, r) in rows.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 7),
            child: Transform.translate(
              offset: Offset(d * 20 * (i + 1), 0),
              child: Panel(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    const Icon(LucideIcons.scale, size: 14, color: AppColors.muted),
                    const SizedBox(width: 10),
                    Expanded(child: Text(r, style: AppText.body)),
                    Container(
                      width: 16,
                      height: 16,
                      decoration: const BoxDecoration(color: AppColors.brand, shape: BoxShape.circle),
                      child: const Icon(LucideIcons.check, size: 10, color: AppColors.brandFg),
                    ).animate(delay: (300 + i * 90).ms).scale(begin: Offset.zero, curve: Curves.elasticOut, duration: 700.ms),
                  ],
                ),
              ),
            ),
          ).animate(delay: (i * 60).ms).fadeIn(duration: Motion.medium).slideX(begin: -0.08, end: 0, curve: Motion.ease),
      ],
    );
  }
}

class _FolderArt extends StatelessWidget {
  const _FolderArt(this.d);
  final double d;

  @override
  Widget build(BuildContext context) {
    const folders = [
      ('Identity', 3, Color(0xCC7DD3FC)),
      ('English test', 1, AppColors.brand),
      ('Employment', 12, Color(0xE6FDE68A)),
      ('Skills assessment', 2, Color(0xE6FECDD3)),
    ];
    return GridView.count(
      shrinkWrap: true,
      crossAxisCount: 2,
      mainAxisSpacing: 14,
      crossAxisSpacing: 14,
      childAspectRatio: 1.15,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        for (final (i, f) in folders.indexed)
          _float(
            delay: i * 300,
            Column(
              children: [
                Expanded(
                  child: FolderGlyph(tint: f.$3, tilt: d * (i.isEven ? 1 : -1)),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(f.$1, style: AppText.small.copyWith(color: AppColors.fg)),
                    const SizedBox(width: 5),
                    CountBadge(f.$2),
                  ],
                ),
              ],
            ),
          ).animate(delay: (i * 80).ms).fadeIn(duration: Motion.medium).scale(begin: const Offset(0.9, 0.9), curve: Motion.ease),
      ],
    );
  }
}

/// Glassy folder with papers peeking out (from the reference design).
class FolderGlyph extends StatelessWidget {
  const FolderGlyph({super.key, required this.tint, this.tilt = 0, this.papers = 2});
  final Color tint;
  final double tilt;
  final int papers;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final w = c.maxWidth, h = c.maxHeight;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            for (var p = 0; p < math.min(papers, 3); p++)
              Positioned(
                left: w * (0.14 + p * 0.12),
                top: h * 0.02 + p * 3,
                width: w * 0.5,
                height: h * 0.5,
                child: Transform.rotate(
                  angle: (p - 1) * 0.1 + tilt * 0.15,
                  child: Container(
                    decoration: BoxDecoration(
                      color: p == 0 ? tint : Colors.white.withValues(alpha: 0.92),
                      borderRadius: BorderRadius.circular(6),
                      boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 6, offset: Offset(0, 2))],
                    ),
                  ),
                ),
              ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: h * 0.66,
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.white.withValues(alpha: 0.16), Colors.white.withValues(alpha: 0.06)],
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                ),
                child: const Align(
                  alignment: Alignment.bottomRight,
                  child: Padding(
                    padding: EdgeInsets.all(8),
                    child: Icon(LucideIcons.fileText, size: 16, color: Color(0xAAFFFFFF)),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class CountBadge extends StatelessWidget {
  const CountBadge(this.n, {super.key});
  final int n;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
    decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(10)),
    child: Text('$n', style: AppText.tiny),
  );
}
