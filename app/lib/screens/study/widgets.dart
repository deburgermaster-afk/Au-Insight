import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/quick_actions.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

// Small building blocks shared by the Study pages.

/// Space to leave under the last item so it clears the tab bar and the home indicator.
double bottomGap(BuildContext context) => MediaQuery.paddingOf(context).bottom + 28;

/// An opaque, width-capped page for screens pushed over the Study tab.
class StudyPage extends StatelessWidget {
  const StudyPage({super.key, required this.child, this.maxWidth = 760});
  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: AppColors.bg,
    child: SafeArea(
      bottom: false,
      child: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: child,
        ),
      ),
    ),
  );
}

/// Sends [prompt] to the assistant and switches to the Ask tab.
void askInChat(BuildContext context, String prompt) {
  chatPrompt.value = prompt;
  context.go('/ask');
}

/// Opens a website in a new tab (or the browser app).
Future<void> openExternal(BuildContext context, String url) async {
  if (url.isEmpty) return;
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) studyToast(context, 'Could not open $url', error: true);
}

void studyToast(BuildContext context, String message, {bool error = false}) {
  ShadToaster.maybeOf(context)?.show(error ? ShadToast.destructive(description: Text(message)) : ShadToast(description: Text(message)));
}

/// 12345 → "12,345".
String formatCount(num n) {
  final s = n.round().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}

String plural(num n, String one, [String? many]) => '${formatCount(n)} ${n == 1 ? one : (many ?? '${one}s')}';

/// Uppercase section label with optional trailing widget.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing, this.top = 18});
  final String text;
  final Widget? trailing;
  final double top;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(2, top, 2, 8),
    child: Row(
      children: [
        Expanded(child: Text(text.toUpperCase(), style: AppText.label)),
        ?trailing,
      ],
    ),
  );
}

/// A compact, content-sized pill button (PillButton stretches to its parent's width).
class SmallButton extends StatelessWidget {
  const SmallButton({super.key, required this.label, this.icon, this.onTap, this.primary = false, this.active = false, this.busy = false});
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool primary;
  final bool active; // toggled on (e.g. saved)
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final bg = primary ? AppColors.fg : (active ? AppColors.brand.withValues(alpha: 0.16) : AppColors.raised);
    final fg = primary ? AppColors.bg : (active ? AppColors.brand : AppColors.fg);
    return Pressable(
      onTap: busy ? null : onTap,
      scale: 0.95,
      child: AnimatedContainer(
        duration: Motion.fast,
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (busy)
              SizedBox(width: 13, height: 13, child: CircularProgressIndicator(strokeWidth: 1.6, color: fg))
            else if (icon != null)
              Icon(icon, size: 13.5, color: fg),
            if (busy || icon != null) const SizedBox(width: 6),
            Text(
              label,
              style: AppText.small.copyWith(color: fg, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

/// A filter chip that toggles on and off.
class ToggleChip extends StatelessWidget {
  const ToggleChip({super.key, required this.label, required this.on, required this.onTap, this.icon});
  final String label;
  final bool on;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Pressable(
    scale: 0.94,
    onTap: onTap,
    child: AnimatedContainer(
      duration: Motion.fast,
      height: 30,
      padding: const EdgeInsets.symmetric(horizontal: 11),
      decoration: BoxDecoration(
        color: on ? AppColors.fg : AppColors.raised,
        borderRadius: BorderRadius.circular(15),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 12, color: on ? AppColors.bg : AppColors.muted), const SizedBox(width: 5)],
          Text(
            label,
            style: AppText.small.copyWith(color: on ? AppColors.bg : AppColors.muted, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    ),
  );
}

/// A small coloured label.
class Tag extends StatelessWidget {
  const Tag(this.text, {super.key, this.color, this.icon});
  final String text;
  final Color? color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final col = color ?? AppColors.muted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: col.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(7)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 10.5, color: color ?? AppColors.fg), const SizedBox(width: 4)],
          Text(
            text,
            style: AppText.tiny.copyWith(color: color ?? AppColors.fg, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// Label on the left, value on the right; an optional hint under the label.
class KeyValue extends StatelessWidget {
  const KeyValue(this.label, this.value, {super.key, this.hint, this.strong = false, this.valueColor});
  final String label;
  final String value;
  final String? hint;
  final bool strong;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 5,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: AppText.small),
              if (hint != null) ...[const SizedBox(height: 1), Text(hint!, style: AppText.tiny.copyWith(color: AppColors.faint))],
            ],
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 6,
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: (strong ? AppText.heading.copyWith(fontSize: 13) : AppText.body.copyWith(fontSize: 12.5)).copyWith(color: valueColor),
          ),
        ),
      ],
    ),
  );
}

/// A big number with a caption, for stat rows.
class Stat extends StatelessWidget {
  const Stat(this.value, this.label, {super.key, this.color});
  final String value;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(value, style: AppText.title.copyWith(fontSize: 17, color: color)),
      const SizedBox(height: 2),
      Text(label, style: AppText.tiny),
    ],
  );
}

class LoadingBlock extends StatelessWidget {
  const LoadingBlock(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 36),
    child: Center(child: ShimmerText(text)),
  );
}

class MessageBlock extends StatelessWidget {
  const MessageBlock({super.key, required this.icon, required this.title, this.body, this.action, this.color = AppColors.muted});
  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;
  final Color color;

  @override
  Widget build(BuildContext context) => Panel(
    padding: const EdgeInsets.all(18),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(height: 10),
        Text(title, style: AppText.heading),
        if (body != null) ...[const SizedBox(height: 4), Text(body!, style: AppText.small)],
        if (action != null) ...[const SizedBox(height: 12), action!],
      ],
    ),
  );
}

/// A friendly error with a retry button.
class ErrorBlock extends StatelessWidget {
  const ErrorBlock({super.key, required this.title, required this.error, this.onRetry});
  final String title;
  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => MessageBlock(
    icon: LucideIcons.cloudOff,
    color: AppColors.danger,
    title: title,
    body: errorText(error),
    action: onRetry == null ? null : SmallButton(label: 'Try again', icon: LucideIcons.rotateCw, onTap: onRetry),
  );
}

/// A readable message from an exception.
String errorText(Object e) {
  final s = e.toString();
  final m = RegExp(r'message: ([^,}]+)').firstMatch(s);
  final out = (m?.group(1) ?? s).replaceFirst(RegExp(r'^(Exception|StateError|Bad state): ?'), '');
  return out.length > 220 ? '${out.substring(0, 220)}…' : out;
}

/// A tappable row with an icon, title, subtitle and chevron.
class NavRow extends StatelessWidget {
  const NavRow({super.key, required this.icon, required this.title, this.subtitle, this.onTap, this.trailing, this.color = AppColors.brand});
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final Color color;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    scale: 0.985,
    child: Panel(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 15, color: color),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.heading.copyWith(fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
                if (subtitle != null && subtitle!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: AppText.tiny, maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ],
            ),
          ),
          trailing ?? const Icon(LucideIcons.chevronRight, size: 15, color: AppColors.faint),
        ],
      ),
    ),
  );
}

/// The search box used on the Study pages.
class SearchBox extends StatelessWidget {
  const SearchBox({super.key, required this.controller, required this.placeholder, this.onChanged, this.onSubmitted, this.onClear});
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) => ShadInput(
    controller: controller,
    placeholder: Text(placeholder),
    onChanged: onChanged,
    onSubmitted: onSubmitted,
    textInputAction: TextInputAction.search,
    style: AppText.body,
    leading: const Padding(
      padding: EdgeInsets.only(right: 4),
      child: Icon(LucideIcons.search, size: 15, color: AppColors.muted),
    ),
    trailing: ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, v, _) => v.text.isEmpty
          ? const SizedBox.shrink()
          : Pressable(
              onTap: () {
                controller.clear();
                onClear?.call();
              },
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(LucideIcons.x, size: 14, color: AppColors.muted),
              ),
            ),
    ),
    decoration: ShadDecoration(
      color: AppColors.surface,
      border: ShadBorder.all(color: AppColors.border, radius: BorderRadius.circular(12)),
      focusedBorder: ShadBorder.all(color: const Color(0x33FFFFFF), radius: BorderRadius.circular(12), width: 1),
    ),
    inputPadding: const EdgeInsets.symmetric(vertical: 4),
  );
}
