import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../motion.dart';
import '../theme.dart';

/// Scales down slightly while pressed — the tactile feel used on every tappable surface.
class Pressable extends StatefulWidget {
  const Pressable({super.key, required this.child, this.onTap, this.scale = 0.97, this.haptic = true});
  final Widget child;
  final VoidCallback? onTap;
  final double scale;
  final bool haptic;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;

  void _set(bool v) {
    if (widget.onTap != null && _down != v) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: widget.onTap == null ? MouseCursor.defer : SystemMouseCursors.click,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _set(true),
        onTapUp: (_) => _set(false),
        onTapCancel: () => _set(false),
        onTap: widget.onTap == null
            ? null
            : () {
                if (widget.haptic) HapticFeedback.selectionClick();
                widget.onTap!();
              },
        child: AnimatedScale(
          scale: _down ? widget.scale : 1,
          duration: _down ? const Duration(milliseconds: 90) : Motion.medium,
          curve: _down ? Curves.easeOut : Motion.ease,
          child: widget.child,
        ),
      ),
    );
  }
}

/// Pill button: primary = light fill, secondary = raised surface.
class PillButton extends StatelessWidget {
  const PillButton({super.key, required this.label, this.onTap, this.secondary = false, this.busy = false, this.icon, this.height = 40});
  final String label;
  final VoidCallback? onTap;
  final bool secondary;
  final bool busy;
  final IconData? icon;
  final double height;

  @override
  Widget build(BuildContext context) {
    final fg = secondary ? AppColors.fg : AppColors.bg;
    return Pressable(
      onTap: busy ? null : onTap,
      child: AnimatedContainer(
        duration: Motion.medium,
        curve: Motion.ease,
        height: height,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: secondary ? AppColors.raised : (onTap == null ? AppColors.muted : AppColors.fg),
          borderRadius: BorderRadius.circular(height),
        ),
        child: AnimatedSwitcher(
          duration: Motion.fast,
          child: busy
              ? SizedBox(
                  key: const ValueKey('busy'),
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: fg),
                )
              : Row(
                  key: const ValueKey('label'),
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (icon != null) ...[Icon(icon, size: 15, color: fg), const SizedBox(width: 6)],
                    Text(
                      label,
                      style: AppText.body.copyWith(color: fg, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Segmented control whose highlight slides between options.
class Segmented<T> extends StatelessWidget {
  const Segmented({super.key, required this.options, required this.value, required this.onChanged, this.wrap = false});
  final List<(T, String)> options;
  final T? value;
  final ValueChanged<T?> onChanged;
  final bool wrap;

  @override
  Widget build(BuildContext context) {
    if (wrap) {
      return Wrap(spacing: 4, runSpacing: 4, children: [for (final o in options) _chip(o)]);
    }
    return LayoutBuilder(
      builder: (context, c) {
        final i = options.indexWhere((o) => o.$1 == value);
        final w = (c.maxWidth - 6) / options.length;
        return Container(
          height: 32,
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(10)),
          child: Stack(
            children: [
              AnimatedPositioned(
                duration: Motion.medium,
                curve: Motion.ease,
                left: i < 0 ? 0 : i * w,
                top: 0,
                bottom: 0,
                width: w,
                child: AnimatedOpacity(
                  duration: Motion.fast,
                  opacity: i < 0 ? 0 : 1,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.bg,
                      borderRadius: BorderRadius.circular(8),
                      boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 6, offset: Offset(0, 2))],
                    ),
                  ),
                ),
              ),
              Row(
                children: [
                  for (final o in options)
                    Expanded(
                      child: Pressable(
                        scale: 0.94,
                        onTap: () => onChanged(o.$1 == value ? null : o.$1),
                        child: Center(
                          child: AnimatedDefaultTextStyle(
                            duration: Motion.fast,
                            style: AppText.small.copyWith(
                              color: o.$1 == value ? AppColors.fg : AppColors.muted,
                              fontWeight: FontWeight.w500,
                            ),
                            child: Text(o.$2, maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _chip((T, String) o) {
    final on = o.$1 == value;
    return Pressable(
      scale: 0.94,
      onTap: () => onChanged(on ? null : o.$1),
      child: AnimatedContainer(
        duration: Motion.medium,
        curve: Motion.ease,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: on ? AppColors.fg : AppColors.raised, borderRadius: BorderRadius.circular(20)),
        child: Text(
          o.$2,
          style: AppText.small.copyWith(color: on ? AppColors.bg : AppColors.muted, fontWeight: FontWeight.w500),
        ),
      ),
    );
  }
}

/// Progress bar that animates to its value. `secondary` draws a lighter range behind (e.g. max points).
class AnimatedBar extends StatelessWidget {
  const AnimatedBar({super.key, required this.value, this.secondary, this.marker, this.color = AppColors.fg, this.height = 6});
  final double value;
  final double? secondary;
  final double? marker;
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(height),
      child: SizedBox(
        height: height,
        child: LayoutBuilder(
          builder: (context, c) {
            Widget fill(double v, Color col) => TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: v.clamp(0, 1)),
              duration: Motion.slow,
              curve: Motion.ease,
              builder: (_, t, _) => Container(width: c.maxWidth * t, color: col),
            );
            return Stack(
              children: [
                Container(color: AppColors.raised),
                if (secondary != null) fill(secondary!, color.withValues(alpha: 0.22)),
                fill(value, color),
                if (marker != null)
                  Positioned(
                    left: c.maxWidth * marker!.clamp(0, 1) - 1,
                    top: 0,
                    bottom: 0,
                    child: Container(width: 2, color: AppColors.bg),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Text with a moving highlight, for "thinking" states.
class ShimmerText extends StatelessWidget {
  const ShimmerText(this.text, {super.key, this.style = AppText.small});
  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: style,
    ).animate(onPlay: (c) => c.repeat()).shimmer(duration: 1400.ms, color: AppColors.fg.withValues(alpha: 0.9));
  }
}

/// Rounded surface card.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.color = AppColors.card});
  final Widget child;
  final EdgeInsets padding;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
  }
}

/// Staggered entrance used for lists of cards.
extension Entrance on Widget {
  Widget enter(int index, {double dy = 0.06}) =>
      animate(delay: (40 * index).ms)
          .fadeIn(duration: Motion.medium, curve: Motion.ease)
          .slideY(begin: dy, end: 0, duration: Motion.slow, curve: Motion.ease);
}
