import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../data/study.dart';
import '../../data/study_models.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../shell.dart';
import 'study_home.dart';
import 'widgets.dart';

/// Two or three courses side by side, with the cheapest and shortest highlighted.
class CompareScreen extends StatefulWidget {
  const CompareScreen({super.key, required this.codes});
  final List<String> codes;

  @override
  State<CompareScreen> createState() => _CompareScreenState();
}

class _CompareScreenState extends State<CompareScreen> {
  List<CourseSummary>? _courses;
  Object? _error;

  List<String> get _codes => (widget.codes.isNotEmpty ? widget.codes : compareCodes.value).take(maxCompare).toList();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await coursesByCodes(_codes);
      if (mounted) {
        setState(() {
          _courses = list;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _remove(CourseSummary c) {
    if (compareCodes.value.contains(c.courseCode)) toggleCompare(c.courseCode);
    setState(() => _courses = [...?_courses?.where((x) => x.courseCode != c.courseCode)]);
  }

  String _askPrompt(List<CourseSummary> list) {
    final lines = [for (final c in list) '- "${c.courseName}" (CRICOS ${c.courseCode}) at ${c.providerName}'];
    return 'Compare these courses for me:\n${lines.join('\n')}\n'
        'Which suits my situation best? Weigh total cost, duration against my visa and CoE dates, entry requirements I meet, '
        'credit I could get, campus location, and where each leads (further study, graduate visa, skilled migration). '
        'Use the CRICOS register and the providers\' official websites, and cite the pages.';
  }

  @override
  Widget build(BuildContext context) {
    final list = _courses;
    return StudyPage(
      maxWidth: 900,
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomGap(context)),
        children: [
          const PageHeader(back: true, title: 'Compare courses'),
          if (list == null && _error == null)
            const LoadingBlock('Loading courses…')
          else if (list == null)
            ErrorBlock(title: "Couldn't load these courses", error: _error!, onRetry: _load)
          else if (list.length < 2)
            MessageBlock(
              icon: LucideIcons.gitCompareArrows,
              title: list.isEmpty ? 'Nothing to compare yet' : 'Add one more course',
              body: 'Open a course and tap "Add to compare", or tick courses on your shortlist. You can compare up to $maxCompare.',
              action: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  SmallButton(label: 'My shortlist', icon: LucideIcons.bookmark, onTap: () => context.push('/study/shortlist')),
                  SmallButton(label: 'Search courses', icon: LucideIcons.search, onTap: () => context.go('/study')),
                ],
              ),
            )
          else ...[
            _Verdict(list),
            const SizedBox(height: 12),
            _Table(list, onRemove: _remove),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                SmallButton(label: 'Ask which suits me', icon: LucideIcons.messageCircle, primary: true, onTap: () => askInChat(context, _askPrompt(list))),
                SmallButton(
                  label: 'Clear compare',
                  icon: LucideIcons.x,
                  onTap: () {
                    compareCodes.value = const [];
                    setState(() => _courses = const []);
                  },
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Per-year tuition is an estimate: the course tuition ÷ its duration in weeks × 52. Fees are from the CRICOS register; '
              'check each provider’s website before you decide.',
              style: AppText.tiny.copyWith(color: AppColors.faint),
            ),
          ],
        ],
      ),
    );
  }
}

/// The plain-language takeaways above the table.
class _Verdict extends StatelessWidget {
  const _Verdict(this.list);
  final List<CourseSummary> list;

  @override
  Widget build(BuildContext context) {
    final lines = <String>[];
    final annual = [for (final c in list) (c, annualTuitionOf(c))].where((e) => e.$2 != null).toList()..sort((a, b) => a.$2!.compareTo(b.$2!));
    if (annual.length >= 2) {
      final diff = annual.last.$2! - annual.first.$2!;
      lines.add(
        diff < 500
            ? 'Tuition per year is about the same for all of them.'
            : '${annual.first.$1.courseName} is the cheapest per year, about ${formatAud(diff)} a year less than ${annual.last.$1.courseName}.',
      );
    }
    final total = [for (final c in list) (c, totalCostOf(c))].where((e) => e.$2 != null).toList()..sort((a, b) => a.$2!.compareTo(b.$2!));
    if (total.length >= 2 && total.first.$1 != (annual.isEmpty ? null : annual.first.$1)) {
      lines.add('${total.first.$1.courseName} has the lowest total cost (${formatAud(total.first.$2)}), because it is shorter or has lower fees.');
    }
    final timed = list.where((c) => c.durationWeeks != null).toList()..sort((a, b) => a.durationWeeks!.compareTo(b.durationWeeks!));
    if (timed.length >= 2 && timed.first.durationWeeks != timed.last.durationWeeks) {
      lines.add('${timed.first.courseName} is the shortest: ${timed.first.durationWeeks} weeks against ${timed.last.durationWeeks}.');
    }
    if (lines.isEmpty) return const SizedBox.shrink();
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final l in lines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 2),
                    child: Icon(LucideIcons.sparkles, size: 12, color: AppColors.brand),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Text(l, style: AppText.small.copyWith(color: AppColors.fg))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Table extends StatelessWidget {
  const _Table(this.list, {required this.onRemove});
  final List<CourseSummary> list;
  final ValueChanged<CourseSummary> onRemove;

  static const _labelW = 112.0;
  static const _colW = 172.0;

  /// Index of the lowest non-null value, or -1 when there is nothing to compare.
  static int _min(List<num?> v) {
    var best = -1;
    for (var i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      if (best < 0 || v[i]! < v[best]!) best = i;
    }
    final known = v.whereType<num>().toSet();
    return known.length < 2 ? -1 : best;
  }

  @override
  Widget build(BuildContext context) {
    final annual = [for (final c in list) annualTuitionOf(c)];
    final total = [for (final c in list) totalCostOf(c)];
    final rows = <(String, List<String>, int)>[
      ('Provider', [for (final c in list) c.providerName], -1),
      ('Level', [for (final c in list) c.level.isEmpty ? '—' : shortLevel(c.level)], -1),
      (
        'Duration',
        [for (final c in list) c.durationWeeks == null ? '—' : '${c.durationWeeks} wk (${formatNum(c.years)} yr)'],
        _min([for (final c in list) c.durationWeeks]),
      ),
      ('Tuition, total', [for (final c in list) formatAud(c.tuitionFee)], _min([for (final c in list) c.tuitionFee])),
      ('≈ Tuition / year', [for (final a in annual) a == null ? '—' : formatAud(a)], _min(annual)),
      ('Non-tuition', [for (final c in list) formatAud(c.nonTuitionFee)], -1),
      ('Est. total cost', [for (final t in total) formatAud(t)], _min(total)),
      (
        'Where',
        [
          for (final c in list)
            [
              statesOf(c).join(', '),
              if (c.campuses.isNotEmpty) plural(c.campuses.length, 'campus', 'campuses'),
            ].where((s) => s.isNotEmpty).join(' · '),
        ],
        -1,
      ),
      ('Work placement', [for (final c in list) c.workComponent ? 'Yes' : 'No'], -1),
      ('Field', [for (final c in list) fieldOf(c).isEmpty ? '—' : fieldOf(c)], -1),
      ('Provider type', [for (final c in list) c.providerType.isEmpty ? '—' : c.providerType], -1),
      ('CRICOS code', [for (final c in list) c.courseCode], -1),
    ];

    Widget cell(String text, {bool best = false, bool label = false}) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      color: best ? AppColors.success.withValues(alpha: 0.10) : null,
      child: Text(
        text.isEmpty ? '—' : text,
        style: label
            ? AppText.tiny
            : AppText.small.copyWith(color: best ? AppColors.success : AppColors.fg, fontWeight: best ? FontWeight.w600 : null),
      ),
    );

    return RepaintBoundary(
      child: Panel(
        padding: EdgeInsets.zero,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Table(
            defaultColumnWidth: const FixedColumnWidth(_colW),
            columnWidths: const {0: FixedColumnWidth(_labelW)},
            defaultVerticalAlignment: TableCellVerticalAlignment.top,
            border: const TableBorder(horizontalInside: BorderSide(color: AppColors.border)),
            children: [
              TableRow(
                children: [
                  const SizedBox.shrink(),
                  for (final c in list)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(10, 10, 6, 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Pressable(
                              onTap: () => openCourse(context, c),
                              child: Text(
                                c.courseName,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                                style: AppText.heading.copyWith(fontSize: 12.5, decoration: TextDecoration.underline, decorationColor: AppColors.faint),
                              ),
                            ),
                          ),
                          Pressable(
                            scale: 0.85,
                            onTap: () => onRemove(c),
                            child: const Padding(
                              padding: EdgeInsets.all(3),
                              child: Icon(LucideIcons.x, size: 13, color: AppColors.faint),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              for (final r in rows)
                TableRow(
                  children: [
                    cell(r.$1, label: true),
                    for (final (i, v) in r.$2.indexed) cell(v, best: i == r.$3),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
