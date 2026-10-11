import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../data/study.dart';
import '../../data/study_models.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../../widgets/course_card.dart';
import '../shell.dart';
import 'eligibility_panel.dart';
import 'study_home.dart';
import 'widgets.dart';

/// One CRICOS course: every register field, fees, campuses, the provider, questions for the assistant,
/// cheaper alternatives and the next degree up in the same field.
class CourseScreen extends StatefulWidget {
  const CourseScreen({super.key, required this.code, this.initial});
  final String code;

  /// The row from a list, shown straight away while the full record loads.
  final CourseSummary? initial;

  @override
  State<CourseScreen> createState() => _CourseScreenState();
}

class _CourseScreenState extends State<CourseScreen> {
  CourseDetail? _d;
  Object? _error;
  bool _loading = true;
  List<CourseSummary>? _similar;
  CoursePage? _next;

  @override
  void initState() {
    super.initState();
    _load(first: true);
  }

  Future<void> _load({bool first = false}) async {
    if (!first) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final d = await getCourse(widget.code);
      if (!mounted) return;
      setState(() {
        _d = d;
        _loading = false;
      });
      if (d != null) {
        rememberCourse(d.course);
        _loadRelated(d.course);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  void _loadRelated(CourseSummary c) {
    similarCourses(c).then((v) {
      if (mounted) setState(() => _similar = v);
    }, onError: (_) {});
    nextStepCourses(c).then((v) {
      if (mounted) setState(() => _next = v);
    }, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    final c = d?.course ?? widget.initial;
    return StudyPage(
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomGap(context)),
        children: [
          PageHeader(back: true, title: c?.courseName ?? 'Course', subtitle: c == null ? null : _providerName(c, d)),
          if (c == null && _loading)
            const LoadingBlock('Loading course…')
          else if (c == null && _error != null)
            ErrorBlock(title: "Couldn't load this course", error: _error!, onRetry: _load)
          else if (c == null)
            MessageBlock(
              icon: LucideIcons.searchX,
              title: 'Course not found',
              body: 'CRICOS code ${widget.code} is not in the register we have. It may have been withdrawn.',
            )
          else
            ..._body(context, c, d),
        ],
      ),
    );
  }

  String _providerName(CourseSummary c, CourseDetail? d) => d?.provider?.displayName ?? c.providerName;

  List<Widget> _body(BuildContext context, CourseSummary c, CourseDetail? d) {
    final p = d?.provider;
    final annual = annualTuitionOf(c);
    final total = totalCostOf(c);
    final states = statesOf(c);
    return [
      Wrap(
        spacing: 5,
        runSpacing: 5,
        children: [
          if (c.level.isNotEmpty) Tag(shortLevel(c.level), color: c.isResearch ? AppColors.brand : null, icon: LucideIcons.graduationCap),
          if (c.isResearch) const Tag('Research degree', color: AppColors.brand, icon: LucideIcons.microscope),
          if ((p?.type ?? c.providerType).isNotEmpty) Tag((p?.isPublic ?? c.providerType.toLowerCase().startsWith('gov')) ? 'Public provider' : 'Private provider'),
          if (c.foundation) const Tag('Foundation'),
          if (c.dualQualification) const Tag('Dual qualification'),
          if (c.workComponent) const Tag('Work placement', icon: LucideIcons.hardHat),
          if (c.expired) const Tag('No longer offered', color: AppColors.danger),
        ],
      ),
      const SizedBox(height: 14),
      Row(
        children: [
          Expanded(child: Stat(c.years == null ? '—' : '${formatNum(c.years)} yr', 'duration')),
          Expanded(child: Stat(annual == null ? '—' : formatAud(annual), '≈ tuition / year')),
          Expanded(child: Stat(formatAud(total), 'est. total cost')),
        ],
      ),
      const SizedBox(height: 14),
      Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          SmallButton(
            label: 'Ask about this course',
            icon: LucideIcons.messageCircle,
            primary: true,
            onTap: () => askInChat(context, _askPrompt(c, d)),
          ),
          if ((p?.websiteUrl ?? c.websiteUrl).isNotEmpty)
            SmallButton(label: 'Provider website', icon: LucideIcons.externalLink, onTap: () => openExternal(context, p?.websiteUrl ?? c.websiteUrl)),
          SmallButton(label: 'Provider page', icon: LucideIcons.landmark, onTap: () => context.push('/study/provider/${c.providerCode}')),
          if (c.vetCode.isNotEmpty)
            SmallButton(
              label: 'training.gov.au',
              icon: LucideIcons.bookOpenCheck,
              onTap: () => openExternal(context, 'https://training.gov.au/Training/Details/${Uri.encodeComponent(c.vetCode)}'),
            ),
          _SaveToggle(code: c.courseCode),
          _CompareToggle(code: c.courseCode),
        ],
      ),
      const SectionLabel('Fees'),
      Panel(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
        child: Column(
          children: [
            KeyValue('Tuition, whole course', formatAud(c.tuitionFee)),
            KeyValue('Tuition per year', annual == null ? '—' : '≈ ${formatAud(annual)}', hint: '≈ per year, from total ÷ duration'),
            KeyValue('Non-tuition fees', formatAud(c.nonTuitionFee), hint: 'Materials, amenities and similar, if listed'),
            const Divider(height: 14, color: AppColors.border),
            KeyValue('Estimated total cost', formatAud(total), strong: true),
            if (c.durationWeeks != null && total != null && c.durationWeeks! > 0)
              KeyValue('Per study week', formatAud(total / c.durationWeeks!), hint: 'Estimated total ÷ ${c.durationWeeks} weeks'),
          ],
        ),
      ),
      const SectionLabel('Course details'),
      Panel(
        padding: const EdgeInsets.fromLTRB(14, 6, 14, 8),
        child: Column(
          children: [
            _CopyValue('CRICOS course code', c.courseCode),
            if (c.vetCode.isNotEmpty) _CopyValue('VET national code', c.vetCode),
            KeyValue('Level', c.level.isEmpty ? '—' : c.level),
            KeyValue('Duration', c.durationWeeks == null ? '—' : '${c.durationWeeks} weeks${c.years == null ? '' : ' (${formatNum(c.years)} years)'}'),
            if (d != null && d.language.isNotEmpty) KeyValue('Language of study', d.language),
            KeyValue('Field of education', _foe(c.fieldBroad, c.fieldNarrow, c.fieldDetailed)),
            if (d != null && d.foe2Broad.isNotEmpty) KeyValue('Second field', _foe(d.foe2Broad, d.foe2Narrow, d.foe2Detailed)),
            KeyValue('Work component', _work(c, d)),
            KeyValue('Dual qualification', c.dualQualification ? 'Yes' : 'No'),
            KeyValue('Foundation program', c.foundation ? 'Yes' : 'No'),
            if (d != null && d.asAt.isNotEmpty) KeyValue('Register date', formatDay(d.asAt)),
          ],
        ),
      ),
      SectionLabel(c.campuses.isEmpty ? 'Campuses' : 'Campuses · ${c.campuses.length}'),
      if (c.campuses.isEmpty)
        Text(d == null ? 'Loading…' : 'No campus is listed for this course.', style: AppText.small)
      else
        Panel(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
          child: Column(
            children: [
              for (final x in c.campuses)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.mapPin, size: 13, color: AppColors.faint),
                      const SizedBox(width: 8),
                      Expanded(child: Text(x.name, style: AppText.body.copyWith(fontSize: 12.5))),
                      Text([x.city, x.state].where((s) => s.isNotEmpty).join(', '), style: AppText.tiny),
                    ],
                  ),
                ),
            ],
          ),
        ),
      if (states.length > 1)
        Padding(
          padding: const EdgeInsets.only(top: 6, left: 2),
          child: Text('Taught in ${states.join(', ')}', style: AppText.tiny),
        ),
      const SectionLabel('Check and ask'),
      // Answered in place, no chat.
      Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: EligibilityPanel(
          courseCode: c.courseCode,
          onAskMore: () => askInChat(
            context,
            'I checked my eligibility for ${_id(c, d)}. What are my best options to get in, and what should I do first?',
          ),
        ),
      ),
      for (final q in _questions(c, d))
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: NavRow(icon: q.$1, title: q.$2, subtitle: q.$3, onTap: () => askInChat(context, q.$4)),
        ),
      if (d == null && _loading) const LoadingBlock('Loading details…'),
      if (d == null && !_loading && _error != null) ErrorBlock(title: "Couldn't load all details", error: _error!, onRetry: _load),
      if (_similar != null && _similar!.isNotEmpty) ...[
        SectionLabel('Same level and field · cheapest first', trailing: _SeeAll(filters: _similarFilters(c))),
        for (final s in _similar!)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: CourseCard(
              course: s,
              compact: true,
              onTap: () => openCourse(context, s),
              trailing: _FeeDiff(base: annual, other: annualTuitionOf(s)),
            ),
          ),
      ],
      if (_next != null && _next!.items.isNotEmpty) ...[
        SectionLabel(
          c.isResearch || c.level.startsWith('Masters') || c.level == 'Bachelor Honours Degree'
              ? 'Research degrees in this field · ${formatCount(_next!.total)}'
              : 'Next step after this course · ${formatCount(_next!.total)}',
          trailing: _SeeAll(filters: _nextFilters(c)),
        ),
        for (final s in _next!.items)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: CourseCard(course: s, compact: true, onTap: () => openCourse(context, s)),
          ),
      ],
      const SizedBox(height: 14),
      Text(
        'From the CRICOS register${d != null && d.asAt.isNotEmpty ? ' as at ${formatDay(d.asAt)}' : ''}. '
        'Fees are what the provider reported to the register and can change. Check the provider’s website before you apply.',
        style: AppText.tiny.copyWith(color: AppColors.faint),
      ),
    ];
  }

  static String _foe(String broad, String narrow, String detailed) {
    final parts = [broad, narrow, detailed].where((s) => s.isNotEmpty).toList();
    return parts.isEmpty ? '—' : parts.join(' › ');
  }

  static String _work(CourseSummary c, CourseDetail? d) {
    if (!c.workComponent) return 'None';
    final hours = d?.workHours;
    final parts = [
      if (hours != null) '${formatNum(hours)} hours',
      if (d?.workWeeks != null) 'over ${d!.workWeeks} weeks',
      if (d?.workHoursWeek != null) '(${formatNum(d!.workHoursWeek)} h/week)',
    ];
    return parts.isEmpty ? 'Yes' : parts.join(' ');
  }

  CourseFilters _similarFilters(CourseSummary c) =>
      CourseFilters(field: fieldOf(c), levels: c.level.isEmpty ? const {} : {c.level}, sort: CourseSort.feeAsc);

  CourseFilters _nextFilters(CourseSummary c) => CourseFilters(field: fieldOf(c), levels: pathwayLevels(c.level).toSet(), sort: CourseSort.feeAsc);

  String _id(CourseSummary c, CourseDetail? d) => '"${c.courseName}" (CRICOS ${c.courseCode}) at ${_providerName(c, d)}';

  String _askPrompt(CourseSummary c, CourseDetail? d) =>
      'Tell me about ${_id(c, d)}: entry requirements, intakes, fees, and how it fits my situation and my visa. '
      'Use the CRICOS register and the provider\'s official website, and cite the pages.';

  /// Questions that need the user's own record, the provider's policies and the law, so the assistant answers them.
  List<(IconData, String, String, String)> _questions(CourseSummary c, CourseDetail? d) {
    final id = _id(c, d);
    return [
      if (c.isResearch)
        (
          LucideIcons.microscope,
          'How do I get in?',
          'Supervisor, research proposal, scholarships and fee offsets',
          'How do I apply for $id? Explain the entry pathway (honours or a masters with a research component), finding a supervisor, '
              'the research proposal, scholarships and tuition fee offsets, and whether I am eligible now. If not, what is the quickest '
              'way to become eligible?',
        ),
      (
        LucideIcons.layers,
        'How much credit could I get?',
        'Advanced standing from my completed units',
        'How much credit (advanced standing or RPL) could I get towards $id from the study I have already completed? Use my academic '
            'record, the provider\'s credit policy and the AQF credit guideline, and tell me how many units it would save and how it '
            'changes the length and cost of the course.',
      ),
      (
        LucideIcons.arrowRightLeft,
        'Transfer into this course',
        'Release letter, new CoE, units that carry over, visa timing',
        'I am thinking of transferring into $id. What would I need for my student visa (release from my current provider if needed, '
            'a new CoE, visa conditions), how many of my completed units could carry over, and could I still finish before my visa '
            'expires?',
      ),
      if (!c.isResearch && c.durationWeeks != null && c.durationWeeks! >= 52)
        (
          LucideIcons.timer,
          'Could I finish sooner?',
          'Overload, summer/winter terms, cross-institutional study',
          'Could I finish $id sooner? Check the provider\'s official rules for study overload, summer and winter terms and '
              'cross-institutional study, then work out my options with my study plan.',
        ),
      (
        LucideIcons.plane,
        'What it means for my visa',
        'CoE length, work rights, graduate visa afterwards',
        'If I enrol in $id, what does it mean for my student visa (CoE length compared with my visa expiry, work hours) and for a '
            'Temporary Graduate (subclass 485) visa or skilled migration afterwards?',
      ),
    ];
  }
}

/// "−$3,200/yr" against the course being viewed.
class _FeeDiff extends StatelessWidget {
  const _FeeDiff({required this.base, required this.other});
  final double? base;
  final double? other;

  @override
  Widget build(BuildContext context) {
    if (base == null || other == null) return const SizedBox.shrink();
    final diff = other! - base!;
    if (diff.abs() < 500) return Text('similar', style: AppText.tiny);
    final cheaper = diff < 0;
    return Text(
      '${cheaper ? '−' : '+'}${formatAud(diff.abs())}/yr',
      style: AppText.tiny.copyWith(color: cheaper ? AppColors.success : AppColors.warning, fontWeight: FontWeight.w600),
    );
  }
}

/// "See all" for a related list: runs the same search on the Study home.
class _SeeAll extends StatelessWidget {
  const _SeeAll({required this.filters});
  final CourseFilters filters;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: () {
      studySearchRequest.value = filters;
      context.go('/study');
    },
    child: Text('See all', style: AppText.tiny.copyWith(color: AppColors.brand, fontWeight: FontWeight.w600)),
  );
}

class _CopyValue extends StatelessWidget {
  const _CopyValue(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: () {
      Clipboard.setData(ClipboardData(text: value));
      studyToast(context, 'Copied $value');
    },
    child: Row(
      children: [
        Expanded(child: KeyValue(label, value)),
        const SizedBox(width: 6),
        const Icon(LucideIcons.copy, size: 11, color: AppColors.faint),
      ],
    ),
  );
}

class _SaveToggle extends StatelessWidget {
  const _SaveToggle({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<List<String>>(
    valueListenable: shortlist,
    builder: (context, list, _) {
      final on = list.contains(code);
      return SmallButton(
        label: on ? 'Saved' : 'Save',
        icon: on ? LucideIcons.bookmarkCheck : LucideIcons.bookmark,
        active: on,
        onTap: () => setShortlisted(code, !on).catchError((Object e) {
          if (context.mounted) studyToast(context, "Couldn't update your shortlist: ${errorText(e)}", error: true);
        }),
      );
    },
  );
}

class _CompareToggle extends StatelessWidget {
  const _CompareToggle({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<List<String>>(
    valueListenable: compareCodes,
    builder: (context, list, _) {
      final on = list.contains(code);
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SmallButton(
            label: on ? 'In compare' : 'Add to compare',
            icon: LucideIcons.gitCompareArrows,
            active: on,
            onTap: () {
              if (!toggleCompare(code)) studyToast(context, 'You can compare up to $maxCompare courses. Remove one first.');
            },
          ),
          if (list.length >= 2) ...[
            const SizedBox(width: 6),
            SmallButton(label: 'Compare ${list.length}', icon: LucideIcons.arrowRight, onTap: () => context.push('/study/compare?codes=${list.join(',')}')),
          ],
        ],
      );
    },
  );
}
