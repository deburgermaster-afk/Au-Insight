import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../data/study.dart';
import '../data/study_models.dart';
import '../theme.dart';
import 'common.dart';

/// CONTRACT WIDGET: a compact card for one course (Study tab lists and chat results).
/// The constructor is fixed; the look can change.
class CourseCard extends StatelessWidget {
  const CourseCard({super.key, required this.course, this.onTap, this.compact = false, this.trailing});
  final CourseSummary course;
  final VoidCallback? onTap;
  final bool compact;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = course;
    final years = c.years;
    final annual = annualTuitionOf(c);
    final states = statesOf(c);
    return RepaintBoundary(
      child: Pressable(
        onTap: onTap,
        scale: 0.985,
        child: Panel(
          padding: EdgeInsets.all(compact ? 10 : 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (!compact && (c.level.isNotEmpty || c.expired)) ...[
                      Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        children: [
                          if (c.level.isNotEmpty) _Tag(shortLevel(c.level), color: c.isResearch ? AppColors.brand : null),
                          if (c.isResearch) const _Tag('Research', color: AppColors.brand),
                          if (c.expired) const _Tag('No longer offered', color: AppColors.danger),
                        ],
                      ),
                      const SizedBox(height: 6),
                    ],
                    Text(
                      c.courseName,
                      style: AppText.heading.copyWith(fontSize: compact ? 12.5 : 13.5),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(c.providerName, style: AppText.small, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 7),
                    Wrap(
                      spacing: 10,
                      runSpacing: 4,
                      children: [
                        if (compact && c.level.isNotEmpty) _Meta(LucideIcons.graduationCap, shortLevel(c.level)),
                        if (years != null) _Meta(LucideIcons.clock, '$years yr'),
                        if (annual != null) _Meta(LucideIcons.wallet, '≈ ${formatAud(annual)}/yr'),
                        if (states.isNotEmpty) _Meta(LucideIcons.mapPin, states.length > 3 ? '${states.length} states' : states.join(', ')),
                        if (!compact && c.workComponent) const _Meta(LucideIcons.hardHat, 'Placement'),
                      ],
                    ),
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            ],
          ),
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text, {this.color});
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final col = color ?? AppColors.muted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: col.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
      child: Text(
        text,
        style: AppText.tiny.copyWith(color: color ?? AppColors.fg, fontWeight: FontWeight.w500),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 11, color: AppColors.faint),
      const SizedBox(width: 3),
      Text(text, style: AppText.tiny),
    ],
  );
}
