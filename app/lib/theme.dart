import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

/// Compact, dark-first palette inspired by the reference designs.
class AppColors {
  static const bg = Color(0xFF0B0B0C);
  static const surface = Color(0xFF131315);
  static const card = Color(0xFF18181B);
  static const raised = Color(0xFF202024);
  static const border = Color(0x14FFFFFF);
  static const fg = Color(0xFFF4F4F5);
  static const muted = Color(0xFF8B8B94);
  static const faint = Color(0xFF55555C);
  static const brand = Color(0xFFD9F99D);
  static const brandFg = Color(0xFF1A2E05);
  static const success = Color(0xFF4ADE80);
  static const warning = Color(0xFFFBBF24);
  static const danger = Color(0xFFF87171);
}

/// Small type scale for a dense, "small DPI" feel.
class AppText {
  static const display = TextStyle(fontSize: 26, height: 1.08, fontWeight: FontWeight.w600, letterSpacing: -0.6, color: AppColors.fg);
  static const title = TextStyle(fontSize: 19, height: 1.15, fontWeight: FontWeight.w600, letterSpacing: -0.3, color: AppColors.fg);
  static const heading = TextStyle(fontSize: 14, height: 1.25, fontWeight: FontWeight.w600, color: AppColors.fg);
  static const body = TextStyle(fontSize: 13, height: 1.45, color: AppColors.fg);
  static const small = TextStyle(fontSize: 11.5, height: 1.35, color: AppColors.muted);
  static const tiny = TextStyle(fontSize: 10.5, height: 1.3, color: AppColors.muted, letterSpacing: 0.2);
  static const label = TextStyle(fontSize: 10.5, height: 1.2, color: AppColors.muted, letterSpacing: 0.8, fontWeight: FontWeight.w500);
  static TextStyle serif(TextStyle base) =>
      GoogleFonts.instrumentSerif(textStyle: base, fontStyle: FontStyle.italic, fontWeight: FontWeight.w400);
}

ShadThemeData buildTheme() {
  final scheme = ShadColorScheme.fromName('zinc', brightness: Brightness.dark).copyWith(
    background: AppColors.bg,
    card: AppColors.card,
    popover: AppColors.raised,
    border: AppColors.border,
    input: const Color(0x1AFFFFFF),
    muted: AppColors.raised,
    mutedForeground: AppColors.muted,
    primary: AppColors.fg,
    primaryForeground: AppColors.bg,
    secondary: AppColors.raised,
    secondaryForeground: AppColors.fg,
    ring: const Color(0x55FFFFFF),
  );
  return ShadThemeData(
    brightness: Brightness.dark,
    colorScheme: scheme,
    radius: const BorderRadius.all(Radius.circular(12)),
    textTheme: ShadTextTheme(
      p: AppText.body,
      small: AppText.small,
      muted: AppText.small,
      h1: AppText.display,
      h2: AppText.title,
      h3: AppText.heading,
      h4: AppText.heading,
    ),
  );
}
