import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../data/study.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../shell.dart';
import 'progress_card.dart';
import 'widgets.dart';
import '../../data/people.dart';

/// One input of the study plan (a `PlanInput` field of the academic engine).
class _Input {
  const _Input(this.key, this.label, this.hint, {this.date = false});
  final String key;
  final String label;
  final String hint;
  final bool date;
}

const _inputs = [
  _Input('courseCredit', 'Course credit total', 'Credit points for the whole course, e.g. 288'),
  _Input('creditPerUnit', 'Credit per unit', 'Credit points of a standard unit, e.g. 12'),
  _Input('creditDone', 'Credit done', 'Credit points passed so far, not counting credit granted'),
  _Input('creditGranted', 'Credit granted', 'Credit transfer or RPL already approved'),
  _Input('creditEnrolled', 'Credit in progress', 'Credit points you are enrolled in this term'),
  _Input('termsPerYear', 'Main terms per year', '2 for semesters, 3 for trimesters'),
  _Input('standardUnits', 'Standard units per term', 'A full-time load at your provider, e.g. 4'),
  _Input('maxOverloadUnits', 'Most units with overload', 'The most your provider allows in a term with approval'),
  _Input('extraTermsPerYear', 'Summer/winter terms per year', '0 if your provider runs none'),
  _Input('extraTermUnits', 'Units per summer/winter term', 'How many units you may take in each'),
  _Input('crossInstUnits', 'Cross-institutional units', 'Units you could take at another provider'),
  _Input('additionalCreditPossible', 'More credit you could claim', 'Credit points you could still apply for'),
  _Input('coeEnd', 'CoE end date', 'YYYY-MM-DD', date: true),
  _Input('visaExpiry', 'Visa expiry', 'YYYY-MM-DD', date: true),
];

final _dateRe = RegExp(r'^\d{4}-\d{2}-\d{2}$');

String _fmtInput(Object? v) {
  if (v == null) return '';
  if (v is num) return v == v.roundToDouble() ? v.round().toString() : v.toString();
  return '$v';
}

/// The full study plan: every way to finish (standard load, overload, summer/winter terms, credit,
/// cross-institutional study, combined), the academic record, the questions still open, and a what-if form.
class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key});

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> with PersonAware {
  @override
  void onPersonChanged() => _load(first: true);

  StudyPlanResult? _res;
  Object? _error;
  bool _loading = true;
  bool _whatIf = false;
  final Map<String, TextEditingController> _ctl = {for (final i in _inputs) i.key: TextEditingController()};

  @override
  void initState() {
    super.initState();
    _res = cachedStudyPlan;
    if (_res != null) _fill(_res!.input);
    _load(first: true);
  }

  @override
  void dispose() {
    for (final c in _ctl.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(Map<String, dynamic> input) {
    for (final i in _inputs) {
      _ctl[i.key]!.text = _fmtInput(input[i.key]);
    }
  }

  Future<void> _load({bool first = false, Map<String, dynamic> overrides = const {}}) async {
    if (!first) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final r = await fetchStudyPlan(overrides);
      if (!mounted) return;
      setState(() {
        _res = r;
        _whatIf = overrides.isNotEmpty;
        _loading = false;
      });
      if (overrides.isEmpty) _fill(r.input);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  /// The form's values, or null (with a message) when one is not a number or a date.
  Map<String, dynamic>? _values() {
    final out = <String, dynamic>{};
    for (final i in _inputs) {
      final t = _ctl[i.key]!.text.trim();
      if (t.isEmpty) continue;
      if (i.date) {
        if (!_dateRe.hasMatch(t) || DateTime.tryParse(t) == null) {
          studyToast(context, '${i.label}: use the format YYYY-MM-DD', error: true);
          return null;
        }
        out[i.key] = t;
      } else {
        final n = num.tryParse(t);
        if (n == null || n < 0) {
          studyToast(context, '${i.label}: enter a number', error: true);
          return null;
        }
        out[i.key] = n;
      }
    }
    return out;
  }

  void _recalculate() {
    final v = _values();
    if (v == null) return;
    FocusScope.of(context).unfocus();
    _load(overrides: v);
  }

  void _saveViaChat() {
    final v = _values();
    if (v == null) return;
    if (v.isEmpty) return studyToast(context, 'Fill in at least one value first.');
    final lines = [
      for (final i in _inputs)
        if (v[i.key] != null) '- ${i.label}: ${v[i.key]}',
    ];
    askInChat(
      context,
      'Please save these details to my profile for my current course, then rebuild my study plan:\n${lines.join('\n')}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final res = _res;
    return StudyPage(
      child: ListView(
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomGap(context)),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          PageHeader(
            back: true,
            title: 'Study plan',
            subtitle: 'Every way to finish your course on time',
            trailing: _loading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 1.6, color: AppColors.muted)) : null,
          ),
          if (res == null && _loading)
            const LoadingBlock('Working out your plan…')
          else if (res == null)
            ErrorBlock(title: "Couldn't build your plan", error: _error ?? 'Unknown error', onRetry: _load)
          else ...[
            if (_whatIf) _whatIfBanner(),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text("Couldn't recalculate: ${errorText(_error!)}", style: AppText.small.copyWith(color: AppColors.danger)),
              ),
            _summary(res.plan),
            if (res.record != null) _record(res.record!),
            if (res.plan.scenarios.isNotEmpty) ...[
              const SectionLabel('Ways to finish'),
              for (final (i, s) in res.plan.best(res.plan.scenarios.length).indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: ScenarioTile(s, showNeeds: true, highlight: i == 0 && s.inTime),
                ),
            ],
            if (res.plan.missing.isNotEmpty) ...[
              const SectionLabel('Still needed'),
              Panel(child: MissingList(res.plan.missing, max: 12)),
            ],
            if (res.plan.notes.isNotEmpty) ...[
              const SectionLabel('Notes'),
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final n in res.plan.notes)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Padding(
                              padding: EdgeInsets.only(top: 2),
                              child: Icon(LucideIcons.info, size: 12, color: AppColors.muted),
                            ),
                            const SizedBox(width: 8),
                            Expanded(child: Text(n, style: AppText.small.copyWith(color: AppColors.fg))),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
            _form(),
            if (res.sources.isNotEmpty) ...[
              const SectionLabel('Sources'),
              for (final s in res.sources)
                if ('${s['url'] ?? ''}'.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: NavRow(
                      icon: LucideIcons.fileText,
                      title: '${s['title'] ?? s['url']}',
                      subtitle: '${s['url']}',
                      trailing: const Icon(LucideIcons.externalLink, size: 13, color: AppColors.faint),
                      onTap: () => openExternal(context, '${s['url']}'),
                    ),
                  ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _whatIfBanner() => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Panel(
      color: AppColors.warning.withValues(alpha: 0.08),
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          const Icon(LucideIcons.flaskConical, size: 15, color: AppColors.warning),
          const SizedBox(width: 9),
          const Expanded(child: Text('What-if result from the values below. Nothing was saved.', style: AppText.small)),
          SmallButton(label: 'My plan', icon: LucideIcons.rotateCcw, onTap: () => _load()),
        ],
      ),
    ),
  );

  Widget _summary(StudyPlan p) => Panel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(child: Text('Where you are', style: AppText.heading)),
            PlanStatusPill(p.status),
          ],
        ),
        const SizedBox(height: 8),
        Text(planHeadline(p), style: AppText.small.copyWith(color: AppColors.fg)),
        const SizedBox(height: 10),
        KeyValue('Units left', formatNum(p.remainingUnits)),
        KeyValue('Credit points left', formatNum(p.remainingCredit)),
        KeyValue('Main terms until CoE ends', formatNum(p.mainTermsUntilCoeEnd)),
        KeyValue('Main terms until visa expires', formatNum(p.mainTermsUntilVisaExpiry)),
        KeyValue(
          'Units per term needed',
          formatNum(p.requiredUnitsPerTerm),
          hint: 'To finish by the CoE end with main terms only',
          strong: true,
          valueColor: p.status == 'on_track' || p.requiredUnitsPerTerm == null ? null : planStatusColor(p.status),
        ),
      ],
    ),
  );

  Widget _record(Map<String, dynamic> r) {
    num? n(String k) => r[k] is num ? r[k] as num : null;
    final scale = r['gpaScale'] == 'au4' ? 4 : 7;
    final atRisk = [for (final t in (r['termsAtRisk'] as List? ?? const [])) '$t'];
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Academic record', style: AppText.heading),
            const SizedBox(height: 2),
            const Text('From the transcripts you uploaded', style: AppText.tiny),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: Stat(formatNum(n('unitsPassed')), 'units passed', color: AppColors.success)),
                Expanded(child: Stat(formatNum(n('unitsFailed')), 'failed', color: (n('unitsFailed') ?? 0) > 0 ? AppColors.danger : null)),
                Expanded(child: Stat(n('gpa') == null ? '—' : '${n('gpa')!.toStringAsFixed(2)}/$scale', 'GPA')),
                Expanded(child: Stat(n('wam') == null ? '—' : n('wam')!.toStringAsFixed(1), 'WAM')),
              ],
            ),
            const SizedBox(height: 8),
            KeyValue('Credit points passed', formatNum(n('creditPassed')), hint: 'Includes credit granted'),
            if ((n('creditGranted') ?? 0) > 0) KeyValue('Credit granted', formatNum(n('creditGranted'))),
            if ((n('unitsEnrolled') ?? 0) > 0) KeyValue('Units in progress', formatNum(n('unitsEnrolled'))),
            if (atRisk.isNotEmpty)
              KeyValue('Terms with many fails', atRisk.join(', '), hint: 'Half or more of the credit attempted was failed', valueColor: AppColors.warning),
          ],
        ),
      ),
    );
  }

  Widget _form() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Try other numbers'),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Change any value and recalculate to see what happens (for example a 5th unit with overload, or credit you could '
                'claim). Blank fields use your profile. Nothing is saved unless you save it through the chat.',
                style: AppText.small,
              ),
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, c) {
                  final two = c.maxWidth >= 480;
                  final w = two ? (c.maxWidth - 10) / 2 : c.maxWidth;
                  return Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      for (final i in _inputs) SizedBox(width: w, child: _Field(input: i, controller: _ctl[i.key]!)),
                    ],
                  );
                },
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  SmallButton(label: 'Recalculate', icon: LucideIcons.calculator, primary: true, busy: _loading, onTap: _recalculate),
                  SmallButton(label: 'Save to my profile via chat', icon: LucideIcons.messageCircle, onTap: _saveViaChat),
                  SmallButton(
                    label: 'Reset',
                    icon: LucideIcons.rotateCcw,
                    onTap: () {
                      if (_res != null && !_whatIf) {
                        _fill(_res!.input);
                      } else {
                        _load();
                      }
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.input, required this.controller});
  final _Input input;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(input.label, style: AppText.small.copyWith(color: AppColors.fg, fontWeight: FontWeight.w500)),
      const SizedBox(height: 4),
      ShadInput(
        controller: controller,
        placeholder: Text(input.date ? 'YYYY-MM-DD' : '—'),
        keyboardType: input.date ? TextInputType.datetime : const TextInputType.numberWithOptions(decimal: true),
        style: AppText.body,
        decoration: ShadDecoration(
          color: AppColors.surface,
          border: ShadBorder.all(color: AppColors.border, radius: BorderRadius.circular(10)),
          focusedBorder: ShadBorder.all(color: const Color(0x33FFFFFF), radius: BorderRadius.circular(10), width: 1),
        ),
        inputPadding: const EdgeInsets.symmetric(vertical: 2),
      ),
      const SizedBox(height: 3),
      Text(input.hint, style: AppText.tiny.copyWith(color: AppColors.faint)),
    ],
  );
}
