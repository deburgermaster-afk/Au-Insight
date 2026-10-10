import 'dart:math';

import 'package:animations/animations.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/documents.dart';
import '../../data/file_input.dart';
import '../../data/quick_actions.dart';
import '../../data/uploads.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../auth/auth_screens.dart' show toast;
import '../onboarding.dart' show CountBadge, FolderGlyph;
import '../shell.dart' show PageHeader;

const _bucket = documentsBucket;
const _tints = [Color(0xCC7DD3FC), AppColors.brand, Color(0xE6FDE68A), Color(0xE6FECDD3), Color(0xCCC4B5FD), Color(0xE6A7F3D0)];

/// Types shown in the "On file" checklist, most asked-for first.
const _coverage = [
  'passport',
  'visa_grant',
  'coe',
  'transcript',
  'english_test',
  'oshc',
  'offer_letter',
  'skills_assessment',
  'payslip',
  'bank_statement',
  'cv',
];

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});
  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  final _sb = Supabase.instance.client;
  List<DocFolder> _folders = [];

  /// The documents, shared with an open folder page so it follows reloads and deletes.
  final _docs = ValueNotifier<List<DocItem>>(const []);
  Map<String, List<Deadline>> _deadlines = const {};
  SortPlan? _sortPlan;
  bool _loaded = false;
  String _filter = 'all';
  String? _person;
  String _query = '';
  int _seenBatches = uploads.finished;
  int _seenReads = uploads.readRuns;

  /// Rows that were "Reading…" when a reading run finished, until the reload with the results lands.
  Set<String> _settling = {};

  @override
  void initState() {
    super.initState();
    _load();
    uploads.addListener(_onUploads);
  }

  /// Uploads can start from any screen (the chat, the Profile), so this screen follows them.
  void _onUploads() {
    if (!mounted) return;
    for (final e in uploads.errors) {
      toast(context, e, error: true);
    }
    uploads.errors.clear();
    _announceReads();
    if (uploads.finished != _seenBatches) {
      _seenBatches = uploads.finished;
      _load();
    }
    if (uploads.readRuns != _seenReads) {
      _seenReads = uploads.readRuns;
      _settling = {
        for (final d in _docs.value)
          if (!d.isRead) d.id,
      };
      _load();
    }
  }

  /// A short toast when the reader finishes ("Read 2 documents: Transcript, CoE").
  void _announceReads() {
    final fresh = uploads.readResults.where((r) => DateTime.now().difference(r.$1) < const Duration(seconds: 30)).toList();
    uploads.readResults.clear();
    for (final (_, docs) in fresh) {
      final read = docs.where((d) => d['status'] != 'failed').toList();
      final failed = docs.length - read.length;
      final types = {for (final d in read) docKinds[d['type']]?.label ?? 'Other'}.take(4).join(', ');
      if (read.isNotEmpty) toast(context, 'Read ${read.length} ${read.length == 1 ? 'document' : 'documents'}: $types');
      if (failed > 0) toast(context, 'Could not read $failed ${failed == 1 ? 'document' : 'documents'}', error: true);
    }
  }

  @override
  void dispose() {
    uploads.removeListener(_onUploads);
    _docs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final (folders, docs) = await loadDocuments();
      if (!mounted) return;
      setState(() {
        _folders = folders;
        _deadlines = computeDeadlines(docs);
        _sortPlan = planSort(docs, folders);
        _settling = {};
        _loaded = true;
      });
      _docs.value = docs;
      _sign([
        for (final doc in docs)
          if (!_links.containsKey(doc.path)) doc.path,
      ]);
    } catch (e) {
      if (!mounted) return;
      setState(() => _loaded = true);
      toast(context, 'Could not load your documents. Pull down or reopen to try again.', error: true);
    }
  }

  bool _isReading(DocItem d) =>
      d.status == 'processing' ||
      _settling.contains(d.id) ||
      (uploads.reading && (uploads.readingIds.contains(d.id) || !d.isRead));

  List<DocItem> _inFolder(DocFolder f) => _docs.value.where((d) => d.folderId == f.id).toList();

  List<DocFolder> get _allFolders => [..._folders, if (_docs.value.any((d) => d.folderId == null)) const DocFolder(null, 'Unsorted')];

  String? _folderName(String? id) => id == null ? 'Unsorted' : _folders.where((f) => f.id == id).firstOrNull?.name;

  bool _hasActiveDeadline(DocItem d) => _deadlines[d.id]?.any((x) => x.active) ?? false;

  /// Documents matching the filter, the person chip and the search.
  List<DocItem> _matching() {
    final q = _query.trim().toLowerCase();
    final words = q.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    return _docs.value.where((d) {
      final ok = switch (_filter) {
        'read' => d.isRead,
        'unread' => !d.isRead,
        'expiring' => _hasActiveDeadline(d),
        _ => true,
      };
      if (!ok) return false;
      if (_person != null && d.extract?.person?.toLowerCase() != _person!.toLowerCase()) return false;
      return words.every(d.searchText.contains);
    }).toList();
  }

  // ---------------------------------------------------------------------------------------------
  // Folders

  Future<void> _newFolder() async {
    final name = TextEditingController();
    final taken = {for (final f in _folders) f.name.toLowerCase()};
    final picks = [
      for (final n in suggestedFolders)
        if (!taken.contains(n.toLowerCase())) n,
    ];
    final ok = await showShadDialog<bool>(
      context: context,
      builder: (context) => ShadDialog(
        title: const Text('New folder'),
        description: const Text('Pick a suggestion or type your own name.'),
        actions: [
          ShadButton.outline(child: const Text('Cancel'), onPressed: () => Navigator.of(context).pop(false)),
          ShadButton(child: const Text('Create'), onPressed: () => Navigator.of(context).pop(true)),
        ],
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              ShadInput(
                controller: name,
                autofocus: true,
                placeholder: const Text('Folder name'),
                onSubmitted: (_) => Navigator.of(context).pop(true),
              ),
              if (picks.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final p in picks)
                      Pressable(
                        scale: 0.94,
                        onTap: () => name.value = TextEditingValue(
                          text: p,
                          selection: TextSelection.collapsed(offset: p.length),
                        ),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(color: AppColors.raised, borderRadius: BorderRadius.circular(16)),
                          child: Text(p, style: AppText.small.copyWith(color: AppColors.fg)),
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
    final n = name.text.trim();
    if (ok != true || n.isEmpty) return;
    if (taken.contains(n.toLowerCase())) {
      if (mounted) toast(context, 'You already have a folder called "$n".');
      return;
    }
    try {
      await _sb.from('folders').insert({'name': n});
    } catch (e) {
      if (mounted) toast(context, 'Could not create the folder: $e', error: true);
    }
    _load();
  }

  Future<String?> _renameFolder(DocFolder f) async {
    final name = TextEditingController(text: f.name);
    final ok = await showShadDialog<bool>(
      context: context,
      builder: (context) => ShadDialog(
        title: const Text('Rename folder'),
        actions: [
          ShadButton.outline(child: const Text('Cancel'), onPressed: () => Navigator.of(context).pop(false)),
          ShadButton(child: const Text('Save'), onPressed: () => Navigator.of(context).pop(true)),
        ],
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: ShadInput(controller: name, autofocus: true, onSubmitted: (_) => Navigator.of(context).pop(true)),
        ),
      ),
    );
    final n = name.text.trim();
    if (ok != true || n.isEmpty || n == f.name || f.id == null) return null;
    try {
      await _sb.from('folders').update({'name': n}).eq('id', f.id!);
    } catch (e) {
      if (mounted) toast(context, 'Could not rename the folder: $e', error: true);
      return null;
    }
    _load();
    return n;
  }

  /// Deletes an empty or full folder after confirming; its documents become Unsorted.
  Future<bool> _deleteFolder(DocFolder f) async {
    if (f.id == null) return false;
    final count = _inFolder(f).length;
    final ok = await showShadDialog<bool>(
      context: context,
      builder: (context) => ShadDialog(
        title: const Text('Delete folder?'),
        description: Text(
          count == 0
              ? '${f.name} is empty.'
              : 'The folder goes, but its $count ${count == 1 ? 'document stays' : 'documents stay'} in Unsorted.',
        ),
        actions: [
          ShadButton.outline(child: const Text('Cancel'), onPressed: () => Navigator.of(context).pop(false)),
          ShadButton.destructive(child: const Text('Delete folder'), onPressed: () => Navigator.of(context).pop(true)),
        ],
      ),
    );
    if (ok != true) return false;
    try {
      await _sb.from('folders').delete().eq('id', f.id!);
    } catch (e) {
      if (mounted) toast(context, 'Could not delete the folder: $e', error: true);
      return false;
    }
    _load();
    return true;
  }

  /// Confirms, then creates the type folders that are missing and moves read documents into them.
  Future<void> _sortIntoFolders() async {
    var includeCustom = false;
    final ok = await showShadDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) {
          final plan = planSort(_docs.value, _folders, includeCustom: includeCustom);
          return ShadDialog(
            title: const Text('Sort into folders'),
            description: Text(
              plan.moving == 0
                  ? 'Everything that has been read is already in a fitting folder.'
                  : 'Move ${plan.moving} ${plan.moving == 1 ? 'document' : 'documents'} by what ${plan.moving == 1 ? 'it is' : 'they are'}:',
            ),
            actions: [
              ShadButton.outline(child: const Text('Cancel'), onPressed: () => Navigator.of(context).pop(false)),
              ShadButton(
                enabled: plan.moving > 0,
                child: Text(plan.moving == 0 ? 'Move' : 'Move ${plan.moving}'),
                onPressed: () => Navigator.of(context).pop(true),
              ),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final e in plan.moves.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(top: 1),
                            child: Icon(LucideIcons.folderInput, size: 14, color: AppColors.muted),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text.rich(
                                  TextSpan(
                                    text: e.key,
                                    children: [
                                      if (plan.newFolders.contains(e.key))
                                        TextSpan(
                                          text: '  new folder',
                                          style: AppText.tiny.copyWith(color: AppColors.brand),
                                        ),
                                    ],
                                  ),
                                  style: AppText.heading.copyWith(fontSize: 13),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  [for (final d in e.value.take(4)) d.filename].join(', ') +
                                      (e.value.length > 4 ? ' and ${e.value.length - 4} more' : ''),
                                  style: AppText.small,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  if (plan.kept.isNotEmpty || includeCustom)
                    ShadCheckbox(
                      value: includeCustom,
                      onChanged: (v) => setLocal(() => includeCustom = v),
                      label: const Text('Also move documents out of my own folders'),
                      sublabel: Text(
                        includeCustom ? 'Your own folders stay, empty if everything moves.' : '${plan.kept.length} would stay where they are.',
                      ),
                    ),
                  if (plan.unread > 0) ...[
                    const SizedBox(height: 8),
                    Text(
                      '${plan.unread} not read yet ${plan.unread == 1 ? 'stays' : 'stay'} put until the reader knows what ${plan.unread == 1 ? 'it is' : 'they are'}.',
                      style: AppText.small,
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
    if (ok != true) return;
    final plan = planSort(_docs.value, _folders, includeCustom: includeCustom);
    try {
      final moved = await applySort(plan, _folders);
      if (mounted) toast(context, 'Moved $moved ${moved == 1 ? 'document' : 'documents'} into folders');
    } catch (e) {
      if (mounted) toast(context, 'Could not sort: $e', error: true);
    }
    _load();
  }

  Future<void> _move(DocItem d) async {
    final target = await showShadDialog<DocFolder>(
      context: context,
      builder: (context) => ShadDialog(
        title: const Text('Move to folder'),
        description: Text(d.filename, maxLines: 1, overflow: TextOverflow.ellipsis),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final f in [..._folders, const DocFolder(null, 'Unsorted')])
                Pressable(
                  scale: 0.98,
                  onTap: f.id == d.folderId ? null : () => Navigator.of(context).pop(f),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    child: Row(
                      children: [
                        Icon(
                          f.id == d.folderId ? LucideIcons.folderOpen : LucideIcons.folder,
                          size: 15,
                          color: f.id == d.folderId ? AppColors.faint : AppColors.muted,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            f.name,
                            style: AppText.body.copyWith(color: f.id == d.folderId ? AppColors.faint : AppColors.fg),
                          ),
                        ),
                        if (f.id == d.folderId) const Text('here now', style: AppText.tiny),
                        if (f.id != null && d.extract != null && f.id != d.folderId && folderFitsType(f, d.extract!.type))
                          Text('suggested', style: AppText.tiny.copyWith(color: AppColors.brand)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    if (target == null) return;
    try {
      await _sb.from('documents').update({'folder_id': target.id}).eq('id', d.id);
    } catch (e) {
      if (mounted) toast(context, 'Could not move ${d.filename}: $e', error: true);
      return;
    }
    if (mounted) toast(context, 'Moved to ${target.name}');
    _load();
  }

  // ---------------------------------------------------------------------------------------------
  // Files

  // Called straight from the tap: the browser only opens the file picker inside a user gesture.
  Future<void> upload(String? folderId) => uploads.pickAndUpload(folderId: folderId);

  /// Signed links, made when the list loads so a tap can open a file immediately.
  final Map<String, (String, DateTime)> _links = {};
  static const _linkLife = Duration(hours: 1);

  Future<void> _sign(List<String> paths) async {
    if (paths.isEmpty) return;
    try {
      final signed = await _sb.storage.from(_bucket).createSignedUrlsResult(paths, _linkLife.inSeconds);
      final at = DateTime.now();
      for (final s in signed.whereType<SignedUrlSuccess>()) {
        _links[s.path] = (s.signedUrl, at);
      }
    } catch (_) {
      // Opening falls back to signing on tap.
    }
  }

  /// Opens the file. The cached link opens synchronously inside the tap (iOS Safari blocks new
  /// tabs opened after an await); otherwise a blank tab opens first and follows the new link.
  Future<void> open(DocItem d) async {
    final link = _links[d.path];
    if (link != null && DateTime.now().difference(link.$2) < _linkLife - const Duration(minutes: 5)) {
      openInNewTab(link.$1);
      return;
    }
    await openWhenReady(_sb.storage.from(_bucket).createSignedUrl(d.path, _linkLife.inSeconds));
  }

  /// Deletes a file after the user confirms. Returns whether it was deleted.
  Future<bool> delete(DocItem d) async {
    final ok = await showShadDialog<bool>(
      context: context,
      builder: (context) => ShadDialog(
        title: const Text('Delete file?'),
        description: Text('${d.filename} will be removed for good, and the assistant will no longer use it.'),
        actions: [
          ShadButton.outline(child: const Text('Cancel'), onPressed: () => Navigator.of(context).pop(false)),
          ShadButton.destructive(child: const Text('Delete'), onPressed: () => Navigator.of(context).pop(true)),
        ],
      ),
    );
    if (ok != true) return false;
    try {
      await _sb.storage.from(_bucket).remove([d.path]);
      await _sb.from('documents').delete().eq('id', d.id);
    } catch (e) {
      if (mounted) toast(context, 'Could not delete ${d.filename}: $e');
      return false;
    }
    if (mounted) {
      final rest = [..._docs.value]..removeWhere((x) => x.id == d.id);
      setState(() {
        _deadlines = computeDeadlines(rest);
        _sortPlan = planSort(rest, _folders);
      });
      _docs.value = rest;
    }
    _links.remove(d.path);
    return true;
  }

  /// Hands the document to the chat with a question tuned to its type.
  void _ask(DocItem d) {
    chatPrompt.value = askPromptFor(d);
    context.go('/ask');
  }

  Widget _row(DocItem d, {bool showFolder = false}) => RepaintBoundary(
    key: ValueKey(d.id),
    child: _DocRow(
      doc: d,
      reading: _isReading(d),
      deadlines: _deadlines[d.id] ?? const [],
      folderName: showFolder ? _folderName(d.folderId) : null,
      onOpen: () => open(d),
      onDelete: () => delete(d),
      onAsk: () => _ask(d),
      onMove: () => _move(d),
    ),
  );

  // ---------------------------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: uploads, builder: (context, _) => _body(context));

  Widget _body(BuildContext context) {
    final docs = _docs.value;
    final folders = _allFolders;
    final reading = docs.where(_isReading).length;
    final unread = docs.where((d) => !d.isRead && !_isReading(d)).length;
    final active = [for (final l in _deadlines.values) ...l.where((x) => x.active)]..sort((a, b) => a.date.compareTo(b.date));
    final expiringDocs = docs.where(_hasActiveDeadline).length;
    final persons = <String, String>{
      for (final d in docs)
        if (d.extract?.person != null) d.extract!.person!.toLowerCase(): d.extract!.person!,
    };
    final flat = _filter != 'all' || _query.trim().isNotEmpty || _person != null;
    final shown = flat ? _matching() : const <DocItem>[];
    final sortable = _sortPlan?.moving ?? 0;
    final readCount = docs.where((d) => d.isRead).length;

    return SafeArea(
      bottom: false,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: RefreshIndicator(
            onRefresh: _load,
            color: AppColors.fg,
            backgroundColor: AppColors.raised,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  sliver: SliverList.list(
                    children: [
                      PageHeader(
                        title: 'Documents',
                        subtitle: docs.isEmpty
                            ? 'Private to you · stored in Sydney'
                            : '${docs.length} ${docs.length == 1 ? 'file' : 'files'} · $readCount read · private to you',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (readCount > 0) ...[
                              _RoundIcon(LucideIcons.wandSparkles, _sortIntoFolders, secondary: true, label: 'Sort into folders'),
                              const SizedBox(width: 6),
                            ],
                            _RoundIcon(LucideIcons.folderPlus, _newFolder, secondary: true, label: 'New folder'),
                            const SizedBox(width: 6),
                            _RoundIcon(LucideIcons.upload, () => upload(null), label: 'Upload'),
                          ],
                        ),
                      ),
                      if (docs.length > 3) ...[
                        ShadInput(
                          placeholder: const Text('Search by name, type or person'),
                          leading: const Icon(LucideIcons.search, size: 14, color: AppColors.muted),
                          onChanged: (v) => setState(() => _query = v),
                        ),
                        const SizedBox(height: 10),
                      ],
                      if (docs.isNotEmpty)
                        Segmented<String>(
                          wrap: true,
                          value: _filter,
                          onChanged: (v) => setState(() => _filter = v ?? 'all'),
                          options: [
                            ('all', 'All'),
                            ('read', 'Read · $readCount'),
                            ('unread', 'Not read · ${docs.length - readCount}'),
                            if (expiringDocs > 0) ('expiring', 'Expiring · $expiringDocs'),
                          ],
                        ),
                      if (persons.length >= 2) ...[
                        const SizedBox(height: 6),
                        Segmented<String>(
                          wrap: true,
                          value: _person ?? '',
                          onChanged: (v) => setState(() => _person = (v == null || v.isEmpty) ? null : v),
                          options: [('', 'Everyone'), for (final p in persons.values) (p, p)],
                        ),
                      ],
                      AnimatedSize(
                        duration: Motion.medium,
                        curve: Motion.ease,
                        child: uploads.inProgress.isEmpty
                            ? const SizedBox(width: double.infinity)
                            : Padding(padding: const EdgeInsets.only(top: 10), child: _UploadPanel(uploads.inProgress)),
                      ),
                      if (reading > 0)
                        _Banner(
                          icon: LucideIcons.sparkles,
                          color: AppColors.brand,
                          title: 'Reading $reading ${reading == 1 ? 'document' : 'documents'}…',
                          body: 'The assistant is reading and sorting them. You can keep using the app.',
                          busy: true,
                        )
                      else if (unread > 0 && _loaded)
                        _Banner(
                          icon: LucideIcons.fileQuestion,
                          color: AppColors.muted,
                          title: '$unread not read yet',
                          body: 'Read them to see what they are, their key dates and expiry warnings.',
                          action: ('Read now', () => uploads.readDocuments()),
                        ),
                      if (active.isNotEmpty) _ExpiryBanner(active, onSeeAll: () => setState(() => _filter = 'expiring')),
                      if (sortable > 0 && !flat)
                        _Banner(
                          icon: LucideIcons.wandSparkles,
                          color: AppColors.muted,
                          title: '$sortable ${sortable == 1 ? 'document' : 'documents'} could go in folders',
                          body: 'Sort by type into folders like Marksheets & transcripts, Visas and Identity.',
                          action: ('Sort', _sortIntoFolders),
                        ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
                if (!_loaded)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(40),
                      child: Center(child: ShimmerText('Loading documents…')),
                    ),
                  )
                else if (flat)
                  if (shown.isEmpty)
                    const SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.all(30),
                        child: Text('Nothing matches.', textAlign: TextAlign.center, style: AppText.small),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                      sliver: SliverList.separated(
                        itemCount: shown.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, i) => _row(shown[i], showFolder: true),
                      ),
                    )
                else if (folders.isEmpty)
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
                          'Upload your documents (marksheets, CoEs, visa grants, passports…). '
                          'The assistant reads each one, finds its key dates and can sort them into folders for you.',
                          textAlign: TextAlign.center,
                          style: AppText.small,
                        ),
                      ).enter(0),
                    ),
                  )
                else ...[
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    sliver: SliverGrid.builder(
                      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 190,
                        mainAxisSpacing: 18,
                        crossAxisSpacing: 14,
                        childAspectRatio: 0.95,
                      ),
                      itemCount: folders.length,
                      itemBuilder: (context, i) => _folderTile(folders[i], i),
                    ),
                  ),
                  if (docs.isNotEmpty)
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 22, 16, 100),
                      sliver: SliverToBoxAdapter(child: _Coverage(docs: docs, onUpload: (type) => upload(folderForType(type, _folders)?.id))),
                    )
                  else
                    const SliverToBoxAdapter(child: SizedBox(height: 100)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _folderTile(DocFolder f, int i) {
    final docs = _inFolder(f);
    final warn = docs.any(_hasActiveDeadline);
    return RepaintBoundary(
      child: OpenContainer(
        transitionDuration: Motion.medium,
        transitionType: ContainerTransitionType.fadeThrough,
        closedColor: Colors.transparent,
        openColor: AppColors.bg,
        middleColor: AppColors.bg,
        closedElevation: 0,
        openElevation: 0,
        closedShape: const RoundedRectangleBorder(),
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
                  if (warn) ...[const Icon(LucideIcons.triangleAlert, size: 11, color: AppColors.warning), const SizedBox(width: 4)],
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
        openBuilder: (context, close) => _FolderPage(
          folder: f,
          docs: _docs,
          row: (d) => _row(d),
          uploadsListenable: uploads,
          onUpload: () => upload(f.id),
          onRename: _renameFolder,
          onDeleteFolder: _deleteFolder,
          close: close,
        ),
      ),
    ).enter(i);
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon(this.icon, this.onTap, {this.secondary = false, this.label});
  final IconData icon;
  final VoidCallback onTap;
  final bool secondary;
  final String? label;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    button: true,
    child: Tooltip(
      message: label ?? '',
      child: Pressable(
        scale: 0.88,
        onTap: onTap,
        child: Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(color: secondary ? AppColors.raised : AppColors.fg, shape: BoxShape.circle),
          child: Icon(icon, size: 14, color: secondary ? AppColors.fg : AppColors.bg),
        ),
      ),
    ),
  );
}

/// A one-line notice above the folders, with an optional action.
class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.color, required this.title, required this.body, this.action, this.busy = false});
  final IconData icon;
  final Color color;
  final String title;
  final String body;
  final (String, VoidCallback)? action;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Panel(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            if (busy)
              const RepaintBoundary(
                child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 1.5, color: AppColors.brand)),
              )
            else
              Icon(icon, size: 14, color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppText.heading.copyWith(fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(body, style: AppText.small),
                ],
              ),
            ),
            if (action != null) ...[
              const SizedBox(width: 10),
              PillButton(label: action!.$1, secondary: true, height: 30, onTap: action!.$2),
            ],
          ],
        ),
      ),
    );
  }
}

/// Expired and soon-expiring documents, most urgent first.
class _ExpiryBanner extends StatelessWidget {
  const _ExpiryBanner(this.items, {required this.onSeeAll});
  final List<Deadline> items;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    final expired = items.where((d) => d.past).length;
    final soon = items.length - expired;
    final color = expired > 0 ? AppColors.danger : AppColors.warning;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(LucideIcons.triangleAlert, size: 14, color: color),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    [
                      if (expired > 0) '$expired expired',
                      if (soon > 0) '$soon within $expiryWindowDays days',
                    ].join(' · '),
                    style: AppText.heading.copyWith(fontSize: 13),
                  ),
                ),
                Pressable(
                  onTap: onSeeAll,
                  child: Text('See all', style: AppText.small.copyWith(color: AppColors.fg)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            for (final d in items.take(4))
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${d.doc.kind?.label ?? d.doc.filename} · ${d.label} · ${formatDay(d.date)}'
                        '${d.doc.extract?.person == null ? '' : ' · ${d.doc.extract!.person}'}',
                        style: AppText.small.copyWith(color: AppColors.fg),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(d.text, style: AppText.tiny.copyWith(color: d.color, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            if (items.length > 4) Padding(padding: const EdgeInsets.only(top: 4), child: Text('and ${items.length - 4} more', style: AppText.tiny)),
          ],
        ),
      ),
    );
  }
}

/// Which kinds of document are on file, so gaps are easy to spot and fill.
class _Coverage extends StatelessWidget {
  const _Coverage({required this.docs, required this.onUpload});
  final List<DocItem> docs;
  final void Function(String type) onUpload;

  @override
  Widget build(BuildContext context) {
    final have = {for (final d in docs) ?d.extract?.type};
    final count = _coverage.where(have.contains).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('ON FILE', style: AppText.label),
            const Spacer(),
            Text('$count of ${_coverage.length} kinds · tap a missing one to upload', style: AppText.tiny),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final t in _coverage)
              Pressable(
                scale: 0.94,
                onTap: have.contains(t) ? null : () => onUpload(t),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    color: have.contains(t) ? docKinds[t]!.color.withValues(alpha: 0.14) : Colors.transparent,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: have.contains(t) ? Colors.transparent : AppColors.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        have.contains(t) ? LucideIcons.circleCheck : LucideIcons.plus,
                        size: 11,
                        color: have.contains(t) ? docKinds[t]!.color : AppColors.faint,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        docKinds[t]!.label,
                        style: AppText.tiny.copyWith(color: have.contains(t) ? AppColors.fg : AppColors.muted),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// A small rounded label: type, person, status or expiry.
class _Tag extends StatelessWidget {
  const _Tag(this.text, {this.color = AppColors.muted, this.icon, this.filled = true, this.spinner = false});
  final String text;
  final Color color;
  final IconData? icon;
  final bool filled;
  final bool spinner;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: filled ? color.withValues(alpha: 0.14) : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (spinner)
            const Padding(
              padding: EdgeInsets.only(right: 4),
              child: SizedBox(width: 8, height: 8, child: CircularProgressIndicator(strokeWidth: 1.2, color: AppColors.brand)),
            )
          else if (icon != null)
            Padding(padding: const EdgeInsets.only(right: 3), child: Icon(icon, size: 10, color: color)),
          Flexible(
            child: Text(
              text,
              style: AppText.tiny.copyWith(color: color == AppColors.muted ? AppColors.muted : color, fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

/// One document: tap to open the file, chevron for what the reader found, plus actions.
class _DocRow extends StatefulWidget {
  const _DocRow({
    required this.doc,
    required this.reading,
    required this.deadlines,
    required this.onOpen,
    required this.onDelete,
    required this.onAsk,
    required this.onMove,
    this.folderName,
  });
  final DocItem doc;
  final bool reading;
  final List<Deadline> deadlines;
  final String? folderName;
  final VoidCallback onOpen;
  final VoidCallback onDelete;
  final VoidCallback onAsk;
  final VoidCallback onMove;

  @override
  State<_DocRow> createState() => _DocRowState();
}

class _DocRowState extends State<_DocRow> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final d = widget.doc;
    final x = d.extract;
    final kind = d.kind;
    final first = widget.deadlines.where((x) => x.active).firstOrNull ?? widget.deadlines.firstOrNull;
    final status = widget.reading
        ? const _Tag('Reading…', color: AppColors.brand, spinner: true)
        : kind != null
        ? _Tag('Read · ${kind.label}', color: kind.color, icon: kind.icon)
        : d.failed
        ? const _Tag("Couldn't read", color: AppColors.danger, icon: LucideIcons.circleX)
        : d.status == 'extracted'
        ? const _Tag('Read · not sorted', color: AppColors.success, icon: LucideIcons.circleCheck)
        : const _Tag('Not read yet');

    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Semantics(
                  label: 'Open ${d.filename}',
                  button: true,
                  child: Pressable(
                    scale: 0.99,
                    onTap: widget.onOpen,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 11, 4, 11),
                      child: Row(
                        children: [
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: (kind?.color ?? AppColors.muted).withValues(alpha: kind == null ? 0.08 : 0.16),
                              borderRadius: BorderRadius.circular(9),
                            ),
                            child: Icon(
                              kind?.icon ?? (d.isPdf ? LucideIcons.fileText : (d.isImage ? LucideIcons.image : LucideIcons.file)),
                              size: 15,
                              color: kind?.color ?? AppColors.muted,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  d.filename,
                                  style: AppText.body.copyWith(fontSize: 12.5, fontWeight: FontWeight.w500),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                Wrap(
                                  spacing: 5,
                                  runSpacing: 4,
                                  children: [
                                    status,
                                    if (x?.person != null) _Tag(x!.person!, icon: LucideIcons.userRound, filled: false),
                                    if (first != null) _Tag(first.text, color: first.color, icon: LucideIcons.calendarClock),
                                    if (widget.folderName != null) _Tag(widget.folderName!, icon: LucideIcons.folder, filled: false),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Semantics(
                label: _open ? 'Hide details' : 'Show details',
                button: true,
                child: Pressable(
                  scale: 0.85,
                  onTap: () => setState(() => _open = !_open),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
                    child: AnimatedRotation(
                      turns: _open ? 0.5 : 0,
                      duration: Motion.fast,
                      child: const Icon(LucideIcons.chevronDown, size: 16, color: AppColors.muted),
                    ),
                  ),
                ),
              ),
              Semantics(
                label: 'Delete ${d.filename}',
                button: true,
                child: Pressable(
                  scale: 0.85,
                  onTap: widget.onDelete,
                  child: const Padding(
                    padding: EdgeInsets.fromLTRB(4, 14, 12, 14),
                    child: Icon(LucideIcons.trash2, size: 15, color: AppColors.muted),
                  ),
                ),
              ),
            ],
          ),
          if (_open) _DocDetails(doc: d, deadlines: widget.deadlines, reading: widget.reading, onOpen: widget.onOpen, onAsk: widget.onAsk, onMove: widget.onMove),
        ],
      ),
    );
  }
}

class _DocDetails extends StatelessWidget {
  const _DocDetails({required this.doc, required this.deadlines, required this.reading, required this.onOpen, required this.onAsk, required this.onMove});
  final DocItem doc;
  final List<Deadline> deadlines;
  final bool reading;
  final VoidCallback onOpen;
  final VoidCallback onAsk;
  final VoidCallback onMove;

  Widget _kv(String k, String v, {Color? color}) => Padding(
    padding: const EdgeInsets.only(top: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 120, child: Text(k, style: AppText.small)),
        Expanded(
          child: Text(v, style: AppText.small.copyWith(color: color ?? AppColors.fg)),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final x = doc.extract;
    final units = x?.units ?? const <DocUnit>[];
    final passed = units.where((u) => u.status == 'passed' || u.status == 'credit').length;
    final failed = units.where((u) => u.status == 'failed').length;
    final enrolled = units.where((u) => u.status == 'enrolled').length;
    final credit = units.where((u) => u.status == 'passed' || u.status == 'credit').fold<num>(0, (n, u) => n + (u.credit ?? 0));
    final marks = units.where((u) => u.mark != null && u.status != 'enrolled').toList();
    final avg = marks.isEmpty ? null : marks.fold<num>(0, (n, u) => n + u.mark!) / marks.length;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(54, 0, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (x == null)
            Text(
              reading
                  ? 'The assistant is reading this file now.'
                  : doc.failed
                  ? 'The reader could not make sense of this file. A clearer scan or the original PDF usually works.'
                  : 'Not read yet. Use "Read now" above, or ask the chat about it.',
              style: AppText.small,
            )
          else ...[
            if (x.summary != null) Text(x.summary!, style: AppText.body.copyWith(fontSize: 12.5)),
            if (x.fields.isNotEmpty) ...[
              const SizedBox(height: 8),
              const Text('KEY DETAILS', style: AppText.label),
              for (final f in x.fields) _kv(f.label, f.value),
            ],
            if (x.dates.isNotEmpty) ...[
              const SizedBox(height: 10),
              const Text('DATES', style: AppText.label),
              for (final dt in x.dates)
                Builder(
                  builder: (context) {
                    final p = dt.parsed;
                    if (p == null) return _kv(dt.label, dt.raw);
                    final days = daysUntil(p.date);
                    final dl = deadlines.where((d) => d.label == dt.label && d.date == p.date).firstOrNull;
                    return _kv(
                      dt.label,
                      '${formatDay(p.date, monthOnly: p.monthOnly)} · ${dl?.text ?? relativeDays(days)}',
                      color: dl?.color ?? (days < 0 ? AppColors.muted : AppColors.fg),
                    );
                  },
                ),
            ],
            if (units.isNotEmpty) ...[
              const SizedBox(height: 10),
              const Text('UNITS', style: AppText.label),
              const SizedBox(height: 4),
              Text(
                [
                  '${units.length} units',
                  '$passed passed',
                  if (failed > 0) '$failed failed',
                  if (enrolled > 0) '$enrolled in progress',
                  if (credit > 0) '${credit % 1 == 0 ? credit.toInt() : credit} credit points passed',
                  if (avg != null) 'average mark ${avg.toStringAsFixed(1)}',
                ].join(' · '),
                style: AppText.small.copyWith(color: failed > 0 ? AppColors.warning : AppColors.fg),
              ),
              for (final u in units.take(12))
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          [u.code, u.name].where((s) => s.isNotEmpty).join(' '),
                          style: AppText.tiny.copyWith(color: AppColors.fg),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        [u.grade, if (u.mark != null) '${u.mark}'].where((s) => s.isNotEmpty).join(' · '),
                        style: AppText.tiny.copyWith(color: u.status == 'failed' ? AppColors.danger : AppColors.muted),
                      ),
                    ],
                  ),
                ),
              if (units.length > 12) Padding(padding: const EdgeInsets.only(top: 4), child: Text('and ${units.length - 12} more', style: AppText.tiny)),
            ],
          ],
          const SizedBox(height: 8),
          Text(
            [
              if (doc.createdAt != null) 'Uploaded ${formatDay(doc.createdAt!)}',
              _size(doc.size),
            ].join(' · '),
            style: AppText.tiny,
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _Action(LucideIcons.messageCircleQuestion, 'Ask about this', onAsk, primary: true),
              _Action(LucideIcons.arrowUpRight, 'Open file', onOpen),
              _Action(LucideIcons.folderInput, 'Move', onMove),
            ],
          ),
        ],
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action(this.icon, this.label, this.onTap, {this.primary = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool primary;

  @override
  Widget build(BuildContext context) => Pressable(
    scale: 0.95,
    onTap: onTap,
    child: Container(
      height: 30,
      padding: const EdgeInsets.symmetric(horizontal: 11),
      decoration: BoxDecoration(color: primary ? AppColors.fg : AppColors.raised, borderRadius: BorderRadius.circular(15)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: primary ? AppColors.bg : AppColors.fg),
          const SizedBox(width: 5),
          Text(
            label,
            style: AppText.small.copyWith(color: primary ? AppColors.bg : AppColors.fg, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    ),
  );
}

class _FolderPage extends StatefulWidget {
  const _FolderPage({
    required this.folder,
    required this.docs,
    required this.row,
    required this.uploadsListenable,
    required this.onUpload,
    required this.onRename,
    required this.onDeleteFolder,
    required this.close,
  });
  final DocFolder folder;
  final ValueListenable<List<DocItem>> docs;
  final Widget Function(DocItem) row;
  final Listenable uploadsListenable;
  final Future<void> Function() onUpload;
  final Future<String?> Function(DocFolder) onRename;
  final Future<bool> Function(DocFolder) onDeleteFolder;
  final VoidCallback close;

  @override
  State<_FolderPage> createState() => _FolderPageState();
}

class _FolderPageState extends State<_FolderPage> {
  late String _name = widget.folder.name;

  DocFolder get folder => widget.folder;

  Future<void> _rename() async {
    final n = await widget.onRename(DocFolder(folder.id, _name));
    if (n != null && mounted) setState(() => _name = n);
  }

  Future<void> _delete() async {
    if (await widget.onDeleteFolder(DocFolder(folder.id, _name))) widget.close();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: ListenableBuilder(
              listenable: Listenable.merge([widget.docs, widget.uploadsListenable]),
              builder: (context, _) {
                final docs = widget.docs.value.where((d) => d.folderId == folder.id).toList();
                return CustomScrollView(
                  slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
                      sliver: SliverToBoxAdapter(
                        child: Row(
                          children: [
                            Pressable(
                              onTap: widget.close,
                              child: const Padding(
                                padding: EdgeInsets.all(4),
                                child: Icon(LucideIcons.chevronLeft, size: 22, color: AppColors.fg),
                              ),
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(_name, style: AppText.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                            ),
                            if (folder.id != null) ...[
                              _RoundIcon(LucideIcons.pencil, _rename, secondary: true, label: 'Rename folder'),
                              const SizedBox(width: 6),
                              _RoundIcon(LucideIcons.trash2, _delete, secondary: true, label: 'Delete folder'),
                              const SizedBox(width: 6),
                            ],
                            // The picker opens inside this tap; the page stays so the new files appear here.
                            _RoundIcon(LucideIcons.upload, widget.onUpload, label: 'Upload to this folder'),
                          ],
                        ),
                      ),
                    ),
                    if (docs.isEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.all(30),
                          child: Text('No documents yet. Tap upload to add a batch.', textAlign: TextAlign.center, style: AppText.small),
                        ),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
                        sliver: SliverList.separated(
                          itemCount: docs.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (context, i) => widget.row(docs[i]),
                        ),
                      ),
                  ],
                );
              },
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
                  e.value
                      ? const Icon(LucideIcons.circleCheck, size: 13, color: AppColors.success)
                      : const RepaintBoundary(
                          child: SizedBox(
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

String _size(int bytes) => bytes >= 1048576 ? '${(bytes / 1048576).toStringAsFixed(1)} MB' : '${(bytes / 1024).ceil()} KB';
