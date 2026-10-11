import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/quick_actions.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../cases/cases_screen.dart' show shortDate;
import '../shell.dart';
import '../../data/people.dart';

/// Past conversations. Tapping one opens it in the chat.
class ChatHistoryScreen extends StatefulWidget {
  const ChatHistoryScreen({super.key});
  @override
  State<ChatHistoryScreen> createState() => _ChatHistoryScreenState();
}

class _ChatHistoryScreenState extends State<ChatHistoryScreen> with PersonAware {
  @override
  void onPersonChanged() => _load();

  final _sb = Supabase.instance.client;
  List<Map<String, dynamic>>? _chats;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await _sb.from('chats').select('id, title, updated_at, messages').order('updated_at', ascending: false).limit(100);
    if (!mounted) return;
    setState(() {
      // Chats nobody wrote in yet stay out of the way.
      _chats = [
        for (final r in rows)
          if ((r['messages'] as List? ?? const []).any((m) => (m as Map)['role'] == 'user')) r,
      ];
    });
  }

  Future<void> _delete(String id) async {
    setState(() => _chats!.removeWhere((c) => c['id'] == id));
    await _sb.from('chats').delete().eq('id', id);
  }

  @override
  Widget build(BuildContext context) {
    final chats = _chats;
    return ColoredBox(
      color: AppColors.bg,
      child: SafeArea(
        bottom: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
              children: [
                const PageHeader(back: true, title: 'History', subtitle: 'Your conversations'),
                if (chats == null)
                  const Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: ShimmerText('Loading…')),
                  )
                else if (chats.isEmpty)
                  const Panel(child: Text('No conversations yet.', style: AppText.small))
                else
                  for (final (i, c) in chats.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Dismissible(
                        key: ValueKey(c['id']),
                        direction: DismissDirection.endToStart,
                        onDismissed: (_) => _delete(c['id'] as String),
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 18),
                          decoration: BoxDecoration(
                            color: AppColors.danger.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(LucideIcons.trash2, size: 16, color: AppColors.danger),
                        ),
                        child: Pressable(
                          onTap: () {
                            openChat.value = c['id'] as String;
                            context.pop();
                          },
                          child: Panel(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            child: Row(
                              children: [
                                const Icon(LucideIcons.messageCircle, size: 15, color: AppColors.muted),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('${c['title']}', style: AppText.body, maxLines: 1, overflow: TextOverflow.ellipsis),
                                      const SizedBox(height: 2),
                                      Text(
                                        '${shortDate(DateTime.parse(c['updated_at'] as String).toLocal())} · '
                                        '${(c['messages'] as List).length} messages',
                                        style: AppText.tiny,
                                      ),
                                    ],
                                  ),
                                ),
                                const Icon(LucideIcons.chevronRight, size: 15, color: AppColors.faint),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ).enter(i),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
