import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../data/people.dart';
import '../data/safe_area.dart';
import '../screens/auth/auth_screens.dart' show toast;
import '../theme.dart';
import 'common.dart';

/// The app mark (the same drawing as web/icon.svg): a dark tile, a flight path and a lime dot.
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.size = 24});
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: size,
    child: CustomPaint(painter: _LogoPainter()),
  );
}

class _LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 512;
    canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(112 * s)), Paint()..color = AppColors.raised);
    final path = Path()
      ..moveTo(152 * s, 336 * s)
      ..relativeCubicTo(40 * s, -104 * s, 96 * s, -160 * s, 208 * s, -176 * s)
      ..relativeCubicTo(-72 * s, 40 * s, -112 * s, 96 * s, -128 * s, 176 * s);
    canvas.drawPath(
      path,
      Paint()
        ..color = AppColors.fg
        ..style = PaintingStyle.stroke
        ..strokeWidth = 36 * s
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(Offset(360 * s, 160 * s), 22 * s, Paint()..color = AppColors.brand);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

const _avatarColors = [AppColors.brand, Color(0xFF7DD3FC), Color(0xFFC4B5FD), Color(0xFFFDE68A), Color(0xFFFECDD3), Color(0xFFA7F3D0)];

/// A round badge with the person's initials, coloured by their place in the list.
class PersonAvatar extends StatelessWidget {
  const PersonAvatar(this.person, {super.key, this.size = 22});
  final Person person;
  final double size;

  @override
  Widget build(BuildContext context) {
    final i = people.all.indexWhere((p) => p.id == person.id);
    final color = _avatarColors[(i < 0 ? 0 : i) % _avatarColors.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Text(
        person.initials,
        style: TextStyle(fontSize: size * 0.4, fontWeight: FontWeight.w700, color: AppColors.bg, height: 1),
      ),
    );
  }
}

/// Phone header, pinned above every tab: the mark, the name and who is open. It pads itself by the
/// notch / status bar height (read from CSS: Flutter web reports no safe-area padding).
class TopBar extends StatelessWidget {
  const TopBar({super.key});

  static const height = 46.0;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<EdgeInsets>(
      valueListenable: safeAreaInsets,
      builder: (context, insets, _) {
        final top = math.max(MediaQuery.viewPaddingOf(context).top, insets.top);
        return DecoratedBox(
          decoration: const BoxDecoration(
            color: AppColors.bg,
            border: Border(bottom: BorderSide(color: AppColors.border)),
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, top, 12, 0),
            child: const SizedBox(
              height: height,
              child: Row(
                children: [
                  AppLogo(size: 24),
                  SizedBox(width: 8),
                  Text('Immi Insight', style: AppText.heading),
                  SizedBox(width: 12),
                  // Shrinks (the name ellipsizes) rather than overflow on narrow phones.
                  Expanded(
                    child: Align(alignment: Alignment.centerRight, child: PersonChip()),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Who is open; tap to switch, add or manage people. Hidden until people are available.
class PersonChip extends StatelessWidget {
  const PersonChip({super.key, this.expand = false});

  /// Fills the width (the desktop rail) instead of hugging the name.
  final bool expand;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: people,
      builder: (context, _) {
        final p = people.active;
        if (!people.enabled || p == null) return const SizedBox.shrink();
        return Semantics(
          button: true,
          label: 'Open person: ${p.name}. Switch person',
          child: Pressable(
            scale: 0.96,
            onTap: () => showPeopleSheet(context),
            child: Container(
              height: 32,
              padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
              decoration: BoxDecoration(
                color: AppColors.raised,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
                children: [
                  PersonAvatar(p, size: 24),
                  const SizedBox(width: 7),
                  Flexible(
                    fit: expand ? FlexFit.tight : FlexFit.loose,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 140),
                      child: Text(
                        p.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.small.copyWith(color: AppColors.fg, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(LucideIcons.chevronsUpDown, size: 13, color: AppColors.muted),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Lists everyone on the account: tap to open, add someone, rename or delete.
Future<void> showPeopleSheet(BuildContext context) {
  people.load(); // fresh counts
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    barrierColor: Colors.black54,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (context) => const _PeopleSheet(),
  );
}

class _PeopleSheet extends StatelessWidget {
  const _PeopleSheet();

  @override
  Widget build(BuildContext context) {
    final bottom = math.max(MediaQuery.viewPaddingOf(context).bottom, safeAreaInsets.value.bottom);
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
      child: ListenableBuilder(
        listenable: people,
        builder: (context, _) => SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(16, 10, 16, 16 + bottom),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 14),
              const Text('People', style: AppText.title),
              const SizedBox(height: 4),
              const Text(
                'Each person has their own chats, documents, plans, courses and timeline. '
                'The whole app, the AI included, works on the person you open.',
                style: AppText.small,
              ),
              const SizedBox(height: 14),
              for (final p in people.all) _PersonRow(p),
              const SizedBox(height: 6),
              Pressable(
                onTap: () async {
                  final added = await showAddPersonDialog(context);
                  if (added != null && context.mounted) Navigator.of(context).pop();
                },
                child: Container(
                  height: 44,
                  decoration: BoxDecoration(color: AppColors.fg, borderRadius: BorderRadius.circular(12)),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(LucideIcons.userPlus, size: 15, color: AppColors.bg),
                      SizedBox(width: 8),
                      Text(
                        'Add a person',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.bg),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow(this.p);
  final Person p;

  @override
  Widget build(BuildContext context) {
    final open = p.id == people.active?.id;
    final counts = [
      if (p.documents > 0) '${p.documents} doc${p.documents == 1 ? '' : 's'}',
      if (p.chats > 0) '${p.chats} chat${p.chats == 1 ? '' : 's'}',
      if (p.plans > 0) '${p.plans} plan${p.plans == 1 ? '' : 's'}',
    ];
    final subtitle = [if (p.relation.isNotEmpty) p.relation, if (counts.isEmpty) 'Nothing yet' else counts.join(' · ')].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Pressable(
        scale: 0.98,
        onTap: () {
          people.select(p.id);
          Navigator.of(context).pop();
        },
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 9, 4, 9),
          decoration: BoxDecoration(
            color: open ? AppColors.raised : AppColors.card,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: open ? AppColors.brand.withValues(alpha: 0.4) : AppColors.border),
          ),
          child: Row(
            children: [
              PersonAvatar(p, size: 32),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.name, style: AppText.heading, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(subtitle, style: AppText.tiny, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              if (open) const Icon(LucideIcons.check, size: 16, color: AppColors.brand),
              _PersonMenu(p),
            ],
          ),
        ),
      ),
    );
  }
}

class _PersonMenu extends StatelessWidget {
  const _PersonMenu(this.p);
  final Person p;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      tooltip: 'Manage ${p.name}',
      color: AppColors.raised,
      icon: const Icon(LucideIcons.ellipsis, size: 16, color: AppColors.muted),
      onSelected: (v) async {
        if (v == 'rename') await showRenamePersonDialog(context, p);
        if (v == 'delete' && context.mounted) await _confirmDelete(context, p);
      },
      itemBuilder: (context) => [
        const PopupMenuItem(
          value: 'rename',
          child: Text('Rename', style: AppText.body),
        ),
        if (people.all.length > 1)
          PopupMenuItem(
            value: 'delete',
            child: Text('Delete', style: AppText.body.copyWith(color: AppColors.danger)),
          ),
      ],
    );
  }
}

Future<void> _confirmDelete(BuildContext context, Person p) async {
  final ok = await showShadDialog<bool>(
    context: context,
    builder: (context) => ShadDialog(
      title: Text('Delete ${p.name}?'),
      description: Text(
        'This deletes ${p.name}\'s timeline, profile, chats, plans, shortlist and '
        '${p.documents == 0 ? 'documents' : 'all ${p.documents} document${p.documents == 1 ? '' : 's'}'}. It can\'t be undone.',
      ),
      actions: [
        ShadButton.outline(child: const Text('Cancel'), onPressed: () => Navigator.of(context).pop(false)),
        ShadButton.destructive(child: const Text('Delete'), onPressed: () => Navigator.of(context).pop(true)),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await people.remove(p.id);
  } catch (e) {
    if (context.mounted) toast(context, 'Could not delete ${p.name}: ${_message(e)}', error: true);
  }
}

/// Asks for a name and relation, adds the person and opens them. Returns them, or null.
Future<Person?> showAddPersonDialog(BuildContext context) async {
  final result = await _personDialog(context, title: 'Add a person', action: 'Add and open');
  if (result == null) return null;
  try {
    final p = await people.add(result.$1, relation: result.$2);
    if (context.mounted) toast(context, '${p.name} is open. Everything you add now is filed under them.');
    return p;
  } catch (e) {
    if (context.mounted) toast(context, 'Could not add the person: ${_message(e)}', error: true);
    return null;
  }
}

Future<void> showRenamePersonDialog(BuildContext context, Person p) async {
  final result = await _personDialog(context, title: 'Edit ${p.name}', action: 'Save', name: p.name, relation: p.relation);
  if (result == null) return;
  try {
    await people.rename(p.id, result.$1, relation: result.$2);
  } catch (e) {
    if (context.mounted) toast(context, 'Could not save: ${_message(e)}', error: true);
  }
}

Future<(String, String)?> _personDialog(
  BuildContext context, {
  required String title,
  required String action,
  String name = '',
  String relation = '',
}) async {
  final nameCtl = TextEditingController(text: name);
  var rel = relation;
  final ok = await showShadDialog<bool>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => ShadDialog(
        title: Text(title),
        description: const Text('Their chats, documents, plans and courses stay separate from everyone else\'s.'),
        actions: [
          ShadButton.outline(child: const Text('Cancel'), onPressed: () => Navigator.of(context).pop(false)),
          ShadButton(child: Text(action), onPressed: () => Navigator.of(context).pop(true)),
        ],
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              ShadInput(
                controller: nameCtl,
                autofocus: true,
                placeholder: const Text('Name, e.g. Priya'),
                onSubmitted: (_) => Navigator.of(context).pop(true),
              ),
              const SizedBox(height: 12),
              const Text('WHO ARE THEY TO YOU?', style: AppText.label),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final r in personRelations)
                    Pressable(
                      onTap: () => setState(() => rel = rel == r ? '' : r),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: rel == r ? AppColors.fg : AppColors.raised,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(r, style: AppText.small.copyWith(color: rel == r ? AppColors.bg : AppColors.fg)),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );
  final n = nameCtl.text.trim();
  if (ok != true || n.isEmpty) return null;
  return (n, rel);
}

String _message(Object e) {
  final s = '$e';
  final m = RegExp(r'message: ([^,]+)').firstMatch(s);
  return m?.group(1) ?? s.replaceFirst('Exception: ', '');
}

/// Everyone on the account as chips, the open one highlighted, plus "Add person". Switching here
/// switches the whole app (Documents, Ask, Cases, Study, Profile).
class PeopleStrip extends StatelessWidget {
  const PeopleStrip({super.key, this.caption});

  /// A line under the chips, e.g. what switching does on this page.
  final String? caption;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: people,
      builder: (context, _) {
        if (!people.enabled) return const SizedBox.shrink();
        final open = people.active?.id;
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final p in people.all)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: Pressable(
                          scale: 0.95,
                          onTap: () => people.select(p.id),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 160),
                            height: 34,
                            padding: const EdgeInsets.fromLTRB(4, 4, 12, 4),
                            decoration: BoxDecoration(
                              color: p.id == open ? AppColors.fg : AppColors.raised,
                              borderRadius: BorderRadius.circular(17),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                PersonAvatar(p, size: 26),
                                const SizedBox(width: 7),
                                Text(
                                  p.name,
                                  style: AppText.small.copyWith(
                                    color: p.id == open ? AppColors.bg : AppColors.fg,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    Pressable(
                      scale: 0.95,
                      onTap: () => showAddPersonDialog(context),
                      child: Container(
                        height: 34,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(17),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.userPlus, size: 14, color: AppColors.fg),
                            const SizedBox(width: 6),
                            Text('Add person', style: AppText.small.copyWith(color: AppColors.fg)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (caption != null) ...[const SizedBox(height: 6), Text(caption!, style: AppText.tiny)],
            ],
          ),
        );
      },
    );
  }
}
