import 'package:flutter/material.dart';

import '../../data/backend.dart';
import '../../data/documents.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../../data/people.dart';

// Profile cards built from the profile and the documents: key dates, and the student's CoE history.

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _day(DateTime d, {bool monthOnly = false}) => monthOnly ? '${_months[d.month - 1]} ${d.year}' : '${d.day} ${_months[d.month - 1]} ${d.year}';

String _countdown(int days) {
  if (days == 0) return 'today';
  final n = days.abs();
  final text = n >= 60 ? '${(n / 30.4).round()} months' : '$n day${n == 1 ? '' : 's'}';
  return days > 0 ? 'in $text' : '$text ago';
}

/// The dates that matter next (from the profile and every document read), plus the last few past ones.
class KeyDatesCard extends StatefulWidget {
  const KeyDatesCard({super.key, required this.profile});
  final Map<String, dynamic> profile;

  @override
  State<KeyDatesCard> createState() => _KeyDatesCardState();
}

class _KeyDatesCardState extends State<KeyDatesCard> with PersonAware {
  @override
  void onPersonChanged() => _fetch();

  List<DocItem>? _docs;
  bool _all = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  void _fetch() {
    loadDocuments().then((r) {
      if (mounted) setState(() => _docs = r.$2);
    }, onError: (_) {
      if (mounted) setState(() => _docs = const []);
    });
  }

  @override
  Widget build(BuildContext context) {
    final dates = keyDates(widget.profile, _docs ?? const []);
    if (dates.isEmpty) return const SizedBox.shrink();
    final upcoming = dates.where((d) => d.days >= 0).toList();
    final past = dates.where((d) => d.days < 0).toList().reversed.toList();
    final shown = _all ? [...upcoming, ...past] : [...upcoming.take(5), ...past.take(upcoming.isEmpty ? 4 : 2)];
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('Key dates', style: AppText.heading),
                const Spacer(),
                if (_docs == null) const ShimmerText('Reading documents…') else Text('${dates.length} found', style: AppText.tiny),
              ],
            ),
            const SizedBox(height: 10),
            for (final d in shown) _DateRow(d),
            if (dates.length > shown.length || _all)
              Pressable(
                onTap: () => setState(() => _all = !_all),
                child: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(_all ? 'Show fewer' : 'Show all ${dates.length}', style: AppText.small.copyWith(color: AppColors.fg)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _DateRow extends StatelessWidget {
  const _DateRow(this.d);
  final KeyDate d;

  @override
  Widget build(BuildContext context) {
    final days = d.days;
    final soon = days >= 0 && days <= 90;
    final color = days < 0 ? AppColors.faint : (soon ? AppColors.warning : AppColors.brand);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(d.icon, size: 14, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(d.label, style: AppText.body.copyWith(fontSize: 12.5, color: days < 0 ? AppColors.muted : AppColors.fg)),
                if (d.detail != null) Text(d.detail!, style: AppText.tiny, maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(_day(d.date, monthOnly: d.monthOnly), style: AppText.small.copyWith(color: AppColors.fg)),
              Text(_countdown(days), style: AppText.tiny.copyWith(color: color)),
            ],
          ),
        ],
      ),
    );
  }
}

/// Every CoE across the documents (including files that hold several), oldest first, with each
/// change of provider, course or course level marked.
class CoeHistoryCard extends StatefulWidget {
  const CoeHistoryCard({super.key});

  @override
  State<CoeHistoryCard> createState() => _CoeHistoryCardState();
}

class _CoeHistoryCardState extends State<CoeHistoryCard> with PersonAware {
  @override
  void onPersonChanged() => _fetch();

  List<Map<String, dynamic>>? _coes;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  void _fetch() {
    callTool('study_history').then((r) {
      final list = [for (final c in (r['coes'] as List? ?? const [])) (c as Map).cast<String, dynamic>()];
      if (mounted) setState(() => _coes = list);
    }, onError: (_) {
      if (mounted) setState(() => _coes = const []);
    });
  }

  @override
  Widget build(BuildContext context) {
    final coes = _coes;
    if (coes == null || coes.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('Study history', style: AppText.heading),
                const Spacer(),
                Text('${coes.length} CoE${coes.length == 1 ? '' : 's'} · from your documents', style: AppText.tiny),
              ],
            ),
            const SizedBox(height: 12),
            for (final (i, c) in coes.indexed) _CoeStep(c, first: i == 0, last: i == coes.length - 1),
          ],
        ),
      ),
    );
  }
}

class _CoeStep extends StatelessWidget {
  const _CoeStep(this.c, {required this.first, required this.last});
  final Map<String, dynamic> c;
  final bool first;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final change = [for (final x in (c['change'] as List? ?? const [])) '$x'];
    String? s(String k) => (c[k] as String?)?.trim().isEmpty ?? true ? null : (c[k] as String).trim();
    final when = [s('start'), s('end')].whereType<String>().map((v) {
      final d = DateTime.tryParse(v);
      return d == null ? v : _day(d);
    }).join(' → ');
    final dot = last ? AppColors.brand : AppColors.muted;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 18,
            child: Column(
              children: [
                Container(width: 1.5, height: 6, color: first ? Colors.transparent : AppColors.border),
                Container(width: 9, height: 9, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
                Expanded(child: Container(width: 1.5, color: last ? Colors.transparent : AppColors.border)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (change.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text('Changed ${change.join(' and ')}', style: AppText.tiny.copyWith(color: AppColors.warning)),
                    ),
                  Text(s('course') ?? 'Course', style: AppText.body.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600)),
                  Text([s('level'), s('provider')].whereType<String>().join(' · '), style: AppText.small),
                  if (when.isNotEmpty) Text(when, style: AppText.tiny),
                  if (last) Text('Latest CoE', style: AppText.tiny.copyWith(color: AppColors.brand)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
