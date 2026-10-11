import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../engine/engine.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../../widgets/decision_card.dart';
import '../auth/auth_screens.dart' show toast;
import '../shell.dart';
import '../../data/people.dart';

const _yesNo = [(true, 'Yes'), (false, 'No')];

class AssessScreen extends StatefulWidget {
  const AssessScreen({super.key});
  @override
  State<AssessScreen> createState() => _AssessScreenState();
}

class _AssessScreenState extends State<AssessScreen> with PersonAware {
  @override
  void onPersonChanged() => _load();

  final _sb = Supabase.instance.client;
  String? _caseId;
  CaseFacts _facts = const CaseFacts();
  bool _saving = false;
  bool _dirty = false;
  final _resultsKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final row = await _sb.from('cases').select('id, facts').order('created_at').limit(1).maybeSingle();
    if (!mounted || row == null) return;
    setState(() {
      _caseId = row['id'] as String;
      _facts = CaseFacts.fromJson((row['facts'] as Map?)?.cast<String, dynamic>());
    });
  }

  void _set(String key, Object? value) => setState(() {
    _facts = _facts.set(key, value);
    _dirty = true;
  });

  Future<void> _save() async {
    if (_caseId == null) return;
    setState(() => _saving = true);
    try {
      await _sb.from('cases').update({'facts': _facts.toJson(), 'updated_at': DateTime.now().toUtc().toIso8601String()}).eq('id', _caseId!);
      if (mounted) {
        setState(() => _dirty = false);
        toast(context, 'Case file saved. The assistant will use it.');
      }
    } catch (e) {
      if (mounted) toast(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDate(String key) async {
    final current = _facts[key] as String?;
    final picked = await showDatePicker(
      context: context,
      initialDate: current != null ? DateTime.parse(current) : DateTime(1992),
      firstDate: DateTime(1940),
      lastDate: DateTime(2035),
      builder: (context, child) => Theme(
        data: ThemeData.dark().copyWith(
          colorScheme: const ColorScheme.dark(primary: AppColors.brand, onPrimary: AppColors.brandFg, surface: AppColors.card),
        ),
        child: child!,
      ),
    );
    if (picked != null) _set(key, picked.toIso8601String().substring(0, 10));
  }

  @override
  Widget build(BuildContext context) {
    final results = assessAll(_facts);
    final wide = MediaQuery.sizeOf(context).width >= 1100;

    final form = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _section(0, 'About you', [
          Row(
            children: [
              Expanded(child: _field('Date of birth', _dateButton('dateOfBirth'))),
              const SizedBox(width: 10),
              Expanded(
                child: _field('Assess as at', _dateButton('assessmentDate', placeholder: 'Today'), hint: 'Usually your invitation date'),
              ),
            ],
          ),
          _field(
            'English level',
            Segmented<String>(
              wrap: true,
              value: _facts.englishLevel,
              onChanged: (v) => _set('englishLevel', v),
              options: const [
                ('vocational', 'Below competent'),
                ('competent', 'Competent'),
                ('proficient', 'Proficient'),
                ('superior', 'Superior'),
              ],
            ),
          ),
          _field(
            'Partner',
            Segmented<String>(
              wrap: true,
              value: _facts.partnerStatus,
              onChanged: (v) => _set('partnerStatus', v),
              options: const [
                ('single', 'Single'),
                ('partner_citizen_or_pr', 'Partner is AU citizen/PR'),
                ('partner_skilled', 'Skilled partner'),
                ('partner_competent_english', 'Partner: competent English'),
                ('partner_other', 'Other'),
              ],
            ),
          ),
        ]),
        _section(1, 'Occupation & skills', [
          _field(
            'Occupation is on',
            Wrap(
              spacing: 6,
              children: [
                for (final l in ['MLTSSL', 'STSOL', 'ROL'])
                  _ListChip(
                    l,
                    on: _facts.occupationLists.contains(l),
                    onTap: () {
                      final lists = [..._facts.occupationLists];
                      lists.contains(l) ? lists.remove(l) : lists.add(l);
                      _set('occupationLists', lists.isEmpty ? null : lists);
                    },
                  ),
              ],
            ),
            hint: 'Check your ANZSCO code on the skilled occupation list',
          ),
          _field('Positive skills assessment', _yn('positiveSkillsAssessment')),
          Row(
            children: [
              Expanded(
                child: _field(
                  'Skilled work overseas',
                  _Stepper(_facts.overseasSkilledYears, (v) => _set('overseasSkilledYears', v)),
                  hint: 'Last 10 years',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _field(
                  'Skilled work in Australia',
                  _Stepper(_facts.australianSkilledYears, (v) => _set('australianSkilledYears', v)),
                  hint: 'Last 10 years',
                ),
              ),
            ],
          ),
        ]),
        _section(2, 'Education', [
          _field(
            'Highest qualification',
            Segmented<String>(
              wrap: true,
              value: _facts.highestQualification,
              onChanged: (v) => _set('highestQualification', v),
              options: const [
                ('doctorate', 'Doctorate'),
                ('bachelor_or_masters', 'Bachelor/Masters'),
                ('diploma_or_trade', 'Diploma/Trade'),
                ('recognised_by_assessing_authority', 'Other recognised'),
                ('none', 'None'),
              ],
            ),
          ),
          _pairs([
            ('Australian study requirement', 'australianStudyRequirement', false),
            ('Specialist education (STEM research)', 'specialistEducation', false),
            ('Professional Year', 'professionalYear', false),
            ('Regional study', 'regionalStudy', false),
            ('NAATI community language', 'credentialledCommunityLanguage', false),
          ]),
        ]),
        _section(3, 'Invitation & nomination', [
          _pairs([
            ('Invited to apply', 'invitationReceived', false),
            ('State nomination (190)', 'stateNomination', false),
            ('Regional nomination / sponsorship (491)', 'regionalNominationOrSponsorship', false),
          ]),
        ]),
        _section(4, 'Health, character & debts', [
          // Asked as plain questions: "Yes" means there is an issue. The engine stores the opposite
          // (meetsHealth / meetsCharacter), so these two are inverted.
          _pairs([
            ('Any health condition that could affect a visa?', 'meetsHealth', true),
            ('Any conviction or past visa problem?', 'meetsCharacter', true),
            ('Owe the Australian Government money?', 'hasCommonwealthDebt', false),
          ]),
        ]),
        const SizedBox(height: 4),
        AnimatedOpacity(
          duration: Motion.medium,
          opacity: _dirty ? 1 : 0.5,
          child: PillButton(label: _dirty ? 'Save case file' : 'Saved', busy: _saving, onTap: _dirty ? _save : null, height: 40),
        ),
        const SizedBox(height: 90),
      ],
    );

    final decision = Column(
      key: _resultsKey,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 8),
          child: Text('LIVE DECISION', style: AppText.label),
        ),
        for (final (i, r) in results.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: DecisionCard(r, initiallyOpen: i == 0 && wide, key: ValueKey(r.subclass)).enter(i),
          ),
      ],
    );

    return SafeArea(
      bottom: false,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1080),
          child: wide
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        children: [
                          const PageHeader(
                            back: true,
                            title: 'Eligibility check',
                            subtitle: "Leave anything you don't know blank — the engine tells you exactly what's missing.",
                          ),
                          form,
                        ],
                      ),
                    ),
                    SizedBox(
                      width: 360,
                      child: ListView(padding: const EdgeInsets.fromLTRB(0, 60, 16, 24), children: [decision]),
                    ),
                  ],
                )
              : CustomScrollView(
                  slivers: [
                    SliverPersistentHeader(
                      pinned: true,
                      delegate: _StripHeader(
                        results,
                        onTap: () => Scrollable.ensureVisible(_resultsKey.currentContext!, duration: Motion.slow, curve: Motion.ease),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      sliver: SliverList.list(
                        children: [
                          const PageHeader(
                            back: true,
                            title: 'Eligibility check',
                            subtitle: "Leave anything you don't know blank — the engine tells you what's missing.",
                          ),
                          decision,
                          const SizedBox(height: 10),
                          form,
                        ],
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _section(int i, String title, List<Widget> children) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title.toUpperCase(), style: AppText.label),
          const SizedBox(height: 10),
          for (final c in children) Padding(padding: const EdgeInsets.only(bottom: 12), child: c),
        ],
      ),
    ),
  ).enter(i);

  Widget _field(String label, Widget child, {String? hint}) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: AppText.small.copyWith(color: AppColors.fg, fontWeight: FontWeight.w500),
      ),
      if (hint != null) Text(hint, style: AppText.tiny),
      const SizedBox(height: 6),
      child,
    ],
  );

  Widget _yn(String key, {bool invert = false}) {
    final v = _facts.flag(key);
    return Segmented<bool>(
      value: v == null ? null : (invert ? !v : v),
      onChanged: (a) => _set(key, a == null ? null : (invert ? !a : a)),
      options: _yesNo,
    );
  }

  Widget _pairs(List<(String, String, bool)> items) => LayoutBuilder(
    builder: (context, c) {
      final cols = c.maxWidth > 460 ? 2 : 1;
      final w = (c.maxWidth - (cols - 1) * 10) / cols;
      return Wrap(
        spacing: 10,
        runSpacing: 12,
        children: [
          for (final (label, key, invert) in items)
            SizedBox(
              width: w,
              child: _field(label, _yn(key, invert: invert)),
            ),
        ],
      );
    },
  );

  Widget _dateButton(String key, {String placeholder = 'Select'}) {
    final v = _facts[key] as String?;
    return Pressable(
      onTap: () => _pickDate(key),
      child: Container(
        height: 34,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            const Icon(LucideIcons.calendar, size: 13, color: AppColors.muted),
            const SizedBox(width: 7),
            Expanded(
              child: AnimatedSwitcher(
                duration: Motion.fast,
                child: Text(
                  v ?? placeholder,
                  key: ValueKey(v),
                  style: AppText.small.copyWith(color: v == null ? AppColors.muted : AppColors.fg),
                ),
              ),
            ),
            if (v != null)
              Pressable(
                onTap: () => _set(key, null),
                child: const Icon(LucideIcons.x, size: 12, color: AppColors.muted),
              ),
          ],
        ),
      ),
    );
  }
}

class _ListChip extends StatelessWidget {
  const _ListChip(this.label, {required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    scale: 0.93,
    onTap: onTap,
    child: AnimatedContainer(
      duration: Motion.medium,
      curve: Motion.ease,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: on ? AppColors.fg : Colors.transparent,
        border: Border.all(color: on ? AppColors.fg : AppColors.border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: AppText.small.copyWith(color: on ? AppColors.bg : AppColors.muted, fontWeight: FontWeight.w600),
      ),
    ),
  );
}

class _Stepper extends StatelessWidget {
  const _Stepper(this.value, this.onChanged);
  final num? value;
  final ValueChanged<num?> onChanged;

  @override
  Widget build(BuildContext context) {
    final v = (value ?? 0).toInt();
    Widget btn(IconData icon, int next) => Pressable(
      scale: 0.85,
      onTap: () => onChanged(next.clamp(0, 10)),
      child: Container(
        width: 28,
        height: 28,
        decoration: const BoxDecoration(color: AppColors.raised, shape: BoxShape.circle),
        child: Icon(icon, size: 13, color: AppColors.fg),
      ),
    );
    return Row(
      children: [
        btn(LucideIcons.minus, v - 1),
        Expanded(
          child: AnimatedSwitcher(
            duration: Motion.fast,
            transitionBuilder: (c, a) => FadeTransition(
              opacity: a,
              child: SlideTransition(
                position: Tween(begin: const Offset(0, -0.4), end: Offset.zero).animate(a),
                child: c,
              ),
            ),
            child: Text(
              value == null ? '—' : '$v yr${v == 1 ? '' : 's'}',
              key: ValueKey(value),
              textAlign: TextAlign.center,
              style: AppText.small.copyWith(color: AppColors.fg),
            ),
          ),
        ),
        btn(LucideIcons.plus, v + 1),
      ],
    );
  }
}

/// Pinned strip on phones so the decision stays visible while answering.
class _StripHeader extends SliverPersistentHeaderDelegate {
  _StripHeader(this.results, {required this.onTap});
  final List<VisaAssessment> results;
  final VoidCallback onTap;

  @override
  double get minExtent => 44;
  @override
  double get maxExtent => 44;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: AppColors.bg.withValues(alpha: 0.92),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final r in results)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: Pressable(
                onTap: onTap,
                child: AnimatedContainer(
                  duration: Motion.medium,
                  curve: Motion.ease,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: outcomeStyle(r.outcome).$2, borderRadius: BorderRadius.circular(20)),
                  child: Text(
                    '${r.subclass} · ${switch (r.outcome) {
                      Outcome.eligible => 'Eligible',
                      Outcome.notEligible => 'Not eligible',
                      Outcome.needsInfo => '${r.nextQuestions.length} to answer',
                    }}',
                    style: AppText.tiny.copyWith(color: outcomeStyle(r.outcome).$3, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(_StripHeader old) => old.results != results;
}
