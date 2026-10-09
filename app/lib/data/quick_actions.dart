import 'package:flutter/foundation.dart';

/// Actions fired from the "+" button in the tab bar. Screens listen and react
/// (Ask starts a new chat, Documents opens the file picker).
enum QuickAction { newChat, upload, caseFile }

class QuickActionEvent {
  QuickActionEvent(this.action) : at = DateTime.now();
  final QuickAction action;
  final DateTime at; // makes repeated taps of the same action distinct
}

final quickActions = ValueNotifier<QuickActionEvent?>(null);
