import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import 'people.dart';

/// CONTRACT: calls one of the chat function's direct tools and returns its `result`.
/// Tools: "study_plan", "academic_record", "process_documents" (see the chat function).
/// Throws with the server's message on failure.
Future<Map<String, dynamic>> callTool(String tool, [Map<String, dynamic> args = const {}]) async {
  final session = Supabase.instance.client.auth.currentSession;
  if (session == null) throw StateError('Not signed in');
  final res = await http.post(
    Uri.parse(Config.chatUrl),
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ${session.accessToken}', 'apikey': Config.supabaseKey},
    body: jsonEncode({'action': 'tool', 'tool': tool, 'args': args, 'caseId': ?people.activeId}),
  );
  final body = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body) as Map<String, dynamic>;
  if (res.statusCode != 200) throw Exception(body['error'] ?? 'Request failed (${res.statusCode})');
  final result = body['result'];
  return result is Map<String, dynamic> ? result : {'value': result};
}
