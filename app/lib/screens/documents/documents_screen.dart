import 'dart:math';

import 'package:animations/animations.dart';
import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/uploads.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../auth/auth_screens.dart' show toast;
import '../onboarding.dart' show CountBadge, FolderGlyph;
import '../shell.dart';

const _bucket = documentsBucket;
const _tints = [Color(0xCC7DD3FC), AppColors.brand, Color(0xE6FDE68A), Color(0xE6FECDD3), Color(0xCCC4B5FD), Color(0xE6A7F3D0)];

class _Folder {
  const _Folder(this.id, this.name);
  final String? id; // null = unsorted
  final String name;
}

class _Doc {
  _Doc(Map<String, dynamic> j)
    : id = j['id'] as String,
      folderId = j['folder_id'] as String?,
      filename = j['filename'] as String,
      size = (j['size_bytes'] as num).toInt(),
      status = j['status'] as String,
      path = j['storage_path'] as String;
  final String id;
  final String? folderId;
  final String filename;
  final int size;
  final String status;
  final String path;
}

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});
  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  final _sb = Supabase.instance.client;
  List<_Folder> _folders = [];
  List<_Doc> _docs = [];
  String _filter = 'All';
  Map<String, bool> get _uploading => uploads.inProgress;
  int _seenBatches = uploads.finished;

  @override
  void initState() {
    super.initState();
    _load();
    uploads.addListener(_onUploads);
  }

  /// Uploads can start from any screen (the "+" menu, the chat), so this screen follows them.
  void _onUploads() {
    if (!mounted) return;
    for (final e in uploads.errors) {
      toast(context, e, error: true);
    }
    uploads.errors.clear();
    setState(() {});
    if (uploads.finished != _seenBatches) {
      _seenBatches = uploads.finished;
      _load();
    }
  }

  @override
  void dispose() {
    uploads.removeListener(_onUploads);
    super.dispose();
  }

  Future<void> _load() async {
    final f = await _sb.from('folders').select('id, name').order('created_at');
    final d = await _sb
        .from('documents')
        .select('id, folder_id, filename, size_bytes, status, storage_path')
        .order('created_at', ascending: false);
    if (!mounted) return;
    setState(() {
      _folders = [for (final r in f) _Folder(r['id'] as String, r['name'] as String)];
      _docs = [for (final r in d) _Doc(r)];
    });
  }

  List<_Doc> _in(_Folder f) => _docs
      .where((d) => d.folderId == f.id)
      .where((d) => _filter == 'All' || (_filter == 'Processed' ? d.status == 'extracted' : d.status != 'extracted'))
      .toList();

  List<_Folder> get _allFolders => [..._folders, if (_docs.any((d) => d.folderId == null)) const _Folder(null, 'Unsorted')];

  Future<void> _newFolder() async {
    final name = TextEditingController();
    final ok = await showShadDialog<bool>(
      context: context,
      builder: (context) => ShadDialog(
        title: const Text('New folder'),
        description: const Text('e.g. Identity, English test, Employment, Skills assessment'),
        actions: [
          ShadButton.outline(child: const Text('Cancel'), onPressed: () => Navigator.of(context).pop(false)),
          ShadButton(child: const Text('Create'), onPressed: () => Navigator.of(context).pop(true)),
        ],
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: ShadInput(
            controller: name,
            autofocus: true,
            placeholder: const Text('Folder name'),
            onSubmitted: (_) => Navigator.of(context).pop(true),
          ),
        ),
      ),
    );
    if (ok != true || name.text.trim().isEmpty) return;
    await _sb.from('folders').insert({'name': name.text.trim()});
    _load();
  }

  // Called straight from the tap: the browser only opens the file picker inside a user gesture.
  Future<void> upload(String? folderId) => uploads.pickAndUpload(folderId: folderId);

  Future<void> open(_Doc d) async {
    final url = await _sb.storage.from(_bucket).createSignedUrl(d.path, 60);
    await launchUrl(Uri.parse(url));
  }

  @override
  Widget build(BuildContext context) {
    final folders = _allFolders;
    return SafeArea(
      bottom: false,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList.list(
                  children: [
                    PageHeader(
                      title: 'Documents',
                      subtitle: 'Private to you · stored in Sydney',
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _RoundIcon(LucideIcons.folderPlus, _newFolder, secondary: true),
                          const SizedBox(width: 6),
                          _RoundIcon(LucideIcons.upload, () => upload(null)),
                        ],
                      ),
                    ),
                    Segmented<String>(
                      wrap: true,
                      value: _filter,
                      onChanged: (v) => setState(() => _filter = v ?? 'All'),
                      options: const [('All', 'All'), ('Processed', 'Processed'), ('Pending', 'Pending')],
                    ),
                    AnimatedSize(
                      duration: Motion.medium,
                      curve: Motion.ease,
                      child: _uploading.isEmpty
                          ? const SizedBox(width: double.infinity)
                          : Padding(padding: const EdgeInsets.only(top: 10), child: _UploadPanel(_uploading)),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
              if (folders.isEmpty)
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  sliver: SliverToBoxAdapter(
                    child: Container(
                      padding: const EdgeInsets.all(28),
                      decoration: BoxDecoration(
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Text(
                        'Create a folder (Identity, English test, Employment…) and upload your documents in batches.',
                        textAlign: TextAlign.center,
                        style: AppText.small,
                      ),
                    ).enter(0),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  sliver: SliverGrid.builder(
                    gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 190,
                      mainAxisSpacing: 18,
                      crossAxisSpacing: 14,
                      childAspectRatio: 0.95,
                    ),
                    itemCount: folders.length,
                    itemBuilder: (context, i) {
                      final f = folders[i];
                      final docs = _in(f);
                      return OpenContainer(
                        transitionDuration: Motion.slow,
                        transitionType: ContainerTransitionType.fadeThrough,
                        closedColor: Colors.transparent,
                        openColor: AppColors.bg,
                        middleColor: AppColors.bg,
                        closedElevation: 0,
                        openElevation: 0,
                        closedShape: const RoundedRectangleBorder(),
                        onClosed: (_) => _load(),
                        closedBuilder: (context, openFolder) => Pressable(
                          onTap: openFolder,
                          child: Column(
                            children: [
                              Expanded(
                                child: FolderGlyph(tint: _tints[i % _tints.length], papers: docs.isEmpty ? 1 : min(docs.length, 3)),
                              ),
                              const SizedBox(height: 7),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Flexible(
                                    child: Text(
                                      f.name,
                                      style: AppText.small.copyWith(color: AppColors.fg),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 5),
                                  CountBadge(docs.length),
                                ],
                              ),
                            ],
                          ),
                        ),
                        openBuilder: (context, close) =>
                            _FolderPage(folder: f, docs: docs, onUpload: () => upload(f.id), onOpen: open, close: close),
                      ).enter(i);
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon(this.icon, this.onTap, {this.secondary = false});
  final IconData icon;
  final VoidCallback onTap;
  final bool secondary;

  @override
  Widget build(BuildContext context) => Pressable(
    scale: 0.88,
    onTap: onTap,
    child: Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(color: secondary ? AppColors.raised : AppColors.fg, shape: BoxShape.circle),
      child: Icon(icon, size: 14, color: secondary ? AppColors.fg : AppColors.bg),
    ),
  );
}

class _FolderPage extends StatelessWidget {
  const _FolderPage({required this.folder, required this.docs, required this.onUpload, required this.onOpen, required this.close});
  final _Folder folder;
  final List<_Doc> docs;
  final Future<void> Function() onUpload;
  final Future<void> Function(_Doc) onOpen;
  final VoidCallback close;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    Pressable(
                      onTap: close,
                      child: const Icon(LucideIcons.chevronLeft, size: 22, color: AppColors.fg),
                    ),
                    const SizedBox(width: 4),
                    Expanded(child: Text(folder.name, style: AppText.title)),
                    _RoundIcon(LucideIcons.upload, () async {
                      await onUpload();
                      close();
                    }),
                  ],
                ),
                const SizedBox(height: 14),
                if (docs.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(30),
                    child: Text('No documents yet. Tap upload to add a batch.', textAlign: TextAlign.center, style: AppText.small),
                  )
                else
                  Panel(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (final (i, d) in docs.indexed)
                          Pressable(
                            scale: 0.99,
                            onTap: () => onOpen(d),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                              decoration: BoxDecoration(
                                border: i == 0 ? null : const Border(top: BorderSide(color: AppColors.border)),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    d.filename.toLowerCase().endsWith('.pdf') ? LucideIcons.fileText : LucideIcons.image,
                                    size: 16,
                                    color: AppColors.muted,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(d.filename, style: AppText.body.copyWith(fontSize: 12.5), overflow: TextOverflow.ellipsis),
                                  ),
                                  Text('${(d.size / 1048576).toStringAsFixed(1)} MB', style: AppText.tiny),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: d.status == 'extracted' ? AppColors.success.withValues(alpha: 0.15) : AppColors.raised,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      d.status,
                                      style: AppText.tiny.copyWith(color: d.status == 'extracted' ? AppColors.success : AppColors.muted),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ).animate(delay: (30 * i).ms).fadeIn(duration: Motion.medium).slideX(begin: 0.04, end: 0, curve: Motion.ease),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Live progress for the batch being uploaded: overall bar plus one row per file.
class _UploadPanel extends StatelessWidget {
  const _UploadPanel(this.files);
  final Map<String, bool> files;

  @override
  Widget build(BuildContext context) {
    final done = files.values.where((d) => d).length;
    final all = done == files.length;
    return Panel(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(all ? LucideIcons.circleCheck : LucideIcons.upload, size: 14, color: all ? AppColors.success : AppColors.fg),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  all ? 'Uploaded ${files.length} ${files.length == 1 ? 'file' : 'files'}' : 'Uploading $done of ${files.length}',
                  style: AppText.heading,
                ),
              ),
              Text('Private · encrypted', style: AppText.tiny),
            ],
          ),
          const SizedBox(height: 10),
          AnimatedBar(value: files.isEmpty ? 0 : (done + 0.15) / (files.length + 0.15), color: all ? AppColors.success : AppColors.brand),
          const SizedBox(height: 6),
          for (final e in files.entries)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  AnimatedSwitcher(
                    duration: Motion.medium,
                    transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                    child: e.value
                        ? const Icon(LucideIcons.circleCheck, key: ValueKey(1), size: 13, color: AppColors.success)
                        : const SizedBox(
                            key: ValueKey(0),
                            width: 13,
                            height: 13,
                            child: CircularProgressIndicator(strokeWidth: 1.5, color: AppColors.brand),
                          ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      e.key,
                      style: AppText.small.copyWith(color: e.value ? AppColors.muted : AppColors.fg),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
