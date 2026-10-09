import 'dart:async';
import 'dart:convert';

import 'package:fetch_client/fetch_client.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';

class ChatStep {
  ChatStep({required this.id, required this.tool, required this.label, this.done = false, this.hits = const []});
  final String id;
  final String tool;
  final String label;
  bool done;
  List<(int, String)> hits;

  Map<String, dynamic> toJson() => {
    'id': id,
    'tool': tool,
    'label': label,
    'done': done,
    'hits': [
      for (final h in hits) {'n': h.$1, 'label': h.$2},
    ],
  };
  factory ChatStep.fromJson(Map<String, dynamic> j) => ChatStep(
    id: j['id'] as String,
    tool: j['tool'] as String,
    label: j['label'] as String,
    done: j['done'] == true,
    hits: [for (final h in (j['hits'] as List? ?? const [])) ((h['n'] as num).toInt(), h['label'] as String)],
  );
}

class SourceRef {
  const SourceRef(this.n, this.title, this.section, this.url);
  final int n;
  final String title;
  final String section;
  final String url;

  Map<String, dynamic> toJson() => {'n': n, 'title': title, 'section': section, 'url': url};
  factory SourceRef.fromJson(Map<String, dynamic> j) =>
      SourceRef((j['n'] as num).toInt(), j['title'] as String, j['section'] as String? ?? '', j['url'] as String);
}

/// One chat turn. Assistant turns accumulate steps, sources and decisions as events stream in.
class ChatMessage {
  ChatMessage({
    required this.role,
    this.text = '',
    this.reasoning = '',
    List<ChatStep>? steps,
    List<SourceRef>? sources,
    List<Map<String, dynamic>>? decisions,
    List<String>? actions,
    List<(String, String)>? cases,
    this.error,
  }) : steps = steps ?? [],
       actions = actions ?? [],
       cases = cases ?? [],
       sources = sources ?? [],
       decisions = decisions ?? [];
  final String role;
  String text;
  String reasoning;
  final List<ChatStep> steps;
  final List<SourceRef> sources;

  /// Raw VisaAssessment JSON from the server-side rules engine.
  List<Map<String, dynamic>> decisions;

  /// Buttons the agent asked to show under this turn: "upload_documents" | "open_case_file".
  final List<String> actions;

  /// Cases (id, title) the agent saved during this turn.
  final List<(String, String)> cases;
  String? error;

  Map<String, dynamic> toJson() => {
    'role': role,
    'text': text,
    if (reasoning.isNotEmpty) 'reasoning': reasoning,
    if (steps.isNotEmpty) 'steps': [for (final s in steps) s.toJson()],
    if (sources.isNotEmpty) 'sources': [for (final s in sources) s.toJson()],
    if (decisions.isNotEmpty) 'decisions': decisions,
    if (actions.isNotEmpty) 'actions': actions,
    if (cases.isNotEmpty)
      'cases': [
        for (final c in cases) {'id': c.$1, 'title': c.$2},
      ],
    if (error != null) 'error': error,
  };

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
    role: j['role'] as String? ?? 'assistant',
    text: j['text'] as String? ?? '',
    reasoning: j['reasoning'] as String? ?? '',
    steps: [for (final s in (j['steps'] as List? ?? const [])) ChatStep.fromJson((s as Map).cast())],
    sources: [for (final s in (j['sources'] as List? ?? const [])) SourceRef.fromJson((s as Map).cast())],
    decisions: [for (final d in (j['decisions'] as List? ?? const [])) (d as Map).cast<String, dynamic>()],
    actions: [for (final a in (j['actions'] as List? ?? const [])) a as String],
    cases: [for (final c in (j['cases'] as List? ?? const [])) ((c as Map)['id'] as String, c['title'] as String)],
    error: j['error'] as String?,
  );
}

/// Streams events from the `chat` edge function (server-sent events).
class ChatClient {
  final http.Client _http = FetchClient(mode: RequestMode.cors);

  Stream<Map<String, dynamic>> send(List<ChatMessage> history, {String? chatId}) async* {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) throw StateError('Not signed in');
    final req = http.Request('POST', Uri.parse(Config.chatUrl))
      ..headers.addAll({'Content-Type': 'application/json', 'Authorization': 'Bearer ${session.accessToken}', 'apikey': Config.supabaseKey})
      ..body = jsonEncode({
        'chatId': ?chatId,
        'messages': [
          for (final m in history)
            if (m.text.trim().isNotEmpty) {'role': m.role, 'content': m.text},
        ],
      });
    final res = await _http.send(req);
    if (res.statusCode != 200) {
      final body = await res.stream.bytesToString();
      throw Exception('Chat failed (${res.statusCode}): $body');
    }
    await for (final line in res.stream.transform(utf8.decoder).transform(const LineSplitter())) {
      if (!line.startsWith('data:')) continue;
      final data = line.substring(5).trim();
      if (data.isEmpty) continue;
      yield jsonDecode(data) as Map<String, dynamic>;
    }
  }
}
