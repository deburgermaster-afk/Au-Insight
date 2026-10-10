import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../data/study.dart';
import '../../data/study_models.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../../widgets/course_card.dart';
import '../shell.dart';
import 'study_home.dart';
import 'widgets.dart';

/// The user's saved courses: remove, pick up to three to compare, or ask the assistant to weigh them up.
class ShortlistScreen extends StatefulWidget {
  const ShortlistScreen({super.key});

  @override
  State<ShortlistScreen> createState() => _ShortlistScreenState();
}

class _ShortlistScreenState extends State<ShortlistScreen> {
  List<CourseSummary>? _courses;
  Object? _error;
  final Set<String> _picked = {};

  @override
  void initState() {
    super.initState();
    shortlist.addListener(_sync);
    _load();
  }

  @override
  void dispose() {
    shortlist.removeListener(_sync);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final codes = await loadShortlist(force: true);
      final courses = await coursesByCodes(codes);
      if (mounted) {
        setState(() {
          _courses = courses;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  /// Keeps the list in step with saves and removals made elsewhere.
  void _sync() {
    final codes = shortlist.value;
    final have = _courses;
    if (have == null) return;
    if (codes.every((c) => have.any((x) => x.courseCode == c))) {
      setState(() {
        _courses = [
          for (final c in codes) have.firstWhere((x) => x.courseCode == c),
        ];
        _picked.removeWhere((c) => !codes.contains(c));
      });
    } else {
      _load();
    }
  }

  Future<void> _remove(CourseSummary c) async {
    try {
      await setShortlisted(c.courseCode, false);
    } catch (e) {
      if (mounted) studyToast(context, "Couldn't remove it: ${errorText(e)}", error: true);
    }
  }

  void _pick(String code) {
    setState(() {
      if (!_picked.remove(code)) {
        if (_picked.length >= maxCompare) {
          studyToast(context, 'Pick up to $maxCompare courses to compare.');
          return;
        }
        _picked.add(code);
      }
    });
  }

  void _compare() {
    final codes = [
      for (final c in _courses ?? const <CourseSummary>[])
        if (_picked.contains(c.courseCode)) c.courseCode,
    ];
    compareCodes.value = codes;
    context.push('/study/compare?codes=${codes.join(',')}');
  }

  String _askPrompt(List<CourseSummary> list) {
    final lines = [for (final c in list) '- "${c.courseName}" (CRICOS ${c.courseCode}) at ${c.providerName}'];
    return 'Help me choose between the courses on my shortlist:\n${lines.join('\n')}\n'
        'Compare them for my situation: total cost, how the duration fits my visa and CoE dates, whether I meet the entry '
        'requirements, how much credit I could get from my completed study, and where each could lead (further study, '
        'graduate visa, skilled migration). Use the CRICOS register and each provider\'s official website, and cite the pages.';
  }

  @override
  Widget build(BuildContext context) {
    final list = _courses;
    return StudyPage(
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomGap(context)),
        children: [
          PageHeader(
            back: true,
            title: 'My shortlist',
            subtitle: list == null ? null : (list.isEmpty ? 'No saved courses yet' : plural(list.length, 'saved course')),
          ),
          if (list == null && _error == null)
            const LoadingBlock('Loading your shortlist…')
          else if (list == null)
            ErrorBlock(title: "Couldn't load your shortlist", error: _error!, onRetry: _load)
          else if (list.isEmpty)
            MessageBlock(
              icon: LucideIcons.bookmark,
              title: 'Save courses to compare',
              body: 'Tap the bookmark on any course in the Study tab. Saved courses appear here on all your devices.',
              action: SmallButton(label: 'Find courses', icon: LucideIcons.search, primary: true, onTap: () => context.go('/study')),
            )
          else ...[
            if (list.length >= 2) _Summary(list),
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 14, 2, 8),
              child: Text(
                _picked.isEmpty ? 'Tick 2 or 3 courses to compare them side by side.' : '${_picked.length} of $maxCompare picked to compare',
                style: AppText.small,
              ),
            ),
            for (final c in list)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: CourseCard(
                  key: ValueKey(c.courseCode),
                  course: c,
                  onTap: () => openCourse(context, c),
                  trailing: Column(
                    children: [
                      _IconToggle(
                        icon: _picked.contains(c.courseCode) ? LucideIcons.squareCheck : LucideIcons.square,
                        color: _picked.contains(c.courseCode) ? AppColors.brand : AppColors.muted,
                        onTap: () => _pick(c.courseCode),
                      ),
                      const SizedBox(height: 6),
                      _IconToggle(icon: LucideIcons.trash2, color: AppColors.faint, onTap: () => _remove(c)),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                SmallButton(
                  label: _picked.length >= 2 ? 'Compare ${_picked.length}' : 'Compare',
                  icon: LucideIcons.gitCompareArrows,
                  primary: _picked.length >= 2,
                  onTap: _picked.length >= 2 ? _compare : () => studyToast(context, 'Tick at least 2 courses first.'),
                ),
                SmallButton(label: 'Ask which suits me', icon: LucideIcons.messageCircle, onTap: () => askInChat(context, _askPrompt(list))),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Cheapest, shortest and the cost range across the shortlist.
class _Summary extends StatelessWidget {
  const _Summary(this.list);
  final List<CourseSummary> list;

  @override
  Widget build(BuildContext context) {
    final priced = [for (final c in list) (c, annualTuitionOf(c))].where((e) => e.$2 != null).toList()..sort((a, b) => a.$2!.compareTo(b.$2!));
    final timed = list.where((c) => c.durationWeeks != null).toList()..sort((a, b) => a.durationWeeks!.compareTo(b.durationWeeks!));
    final totals = [for (final c in list) totalCostOf(c)].whereType<double>().toList()..sort();
    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
      child: Column(
        children: [
          if (priced.isNotEmpty)
            KeyValue('Lowest tuition per year', '≈ ${formatAud(priced.first.$2)}', hint: priced.first.$1.courseName, valueColor: AppColors.success),
          if (timed.isNotEmpty) KeyValue('Shortest', '${formatNum(timed.first.years)} yr', hint: timed.first.courseName),
          if (totals.length >= 2) KeyValue('Total cost range', '${formatAud(totals.first)} – ${formatAud(totals.last)}'),
        ],
      ),
    );
  }
}

class _IconToggle extends StatelessWidget {
  const _IconToggle({required this.icon, required this.color, required this.onTap});
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    scale: 0.85,
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.all(4),
      child: Icon(icon, size: 17, color: color),
    ),
  );
}
