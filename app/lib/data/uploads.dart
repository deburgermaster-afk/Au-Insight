import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'file_input.dart';

const documentsBucket = 'case-documents';

/// The bucket's per-file limit (Supabase free plan maximum).
const maxUploadBytes = 50 * 1024 * 1024;

/// Picks and uploads documents from any screen.
///
/// Browsers only open a file picker from inside a tap (iOS Safari is strictest), so callers must
/// call [pickAndUpload] directly in their tap handler, before navigating or awaiting anything.
class Uploads extends ChangeNotifier {
  /// File name → done, for the batch in progress.
  final Map<String, bool> inProgress = {};

  /// Upload failures since the last read, for the Documents screen to show.
  final List<String> errors = [];

  /// Bumped after every file that lands, so lists show it straight away.
  int finished = 0;

  Future<void> pickAndUpload({String? folderId}) async {
    final files = await pickFiles();
    if (files.isEmpty) return;
    final sb = Supabase.instance.client;
    final uid = sb.auth.currentUser!.id;
    for (final f in files) {
      inProgress[f.name] = false;
    }
    notifyListeners();
    // The whole batch in parallel, each under the user's private prefix.
    await Future.wait(
      files.map((f) async {
        try {
          if (f.size > maxUploadBytes) throw 'larger than 50 MB';
          final bytes = await f.bytes();
          final mime = f.type.isNotEmpty ? f.type : mimeFor(f.name);
          final path = '$uid/${_uuid()}/${safeName(f.name)}';
          await sb.storage.from(documentsBucket).uploadBinary(path, bytes, fileOptions: FileOptions(contentType: mime));
          await sb.from('documents').insert({
            'storage_path': path,
            'filename': f.name,
            'mime_type': mime,
            'size_bytes': bytes.length,
            'folder_id': folderId,
          });
          finished++;
        } on StorageException catch (e) {
          errors.add('${f.name}: ${e.message}');
        } catch (e) {
          errors.add('${f.name}: $e');
        }
        inProgress[f.name] = true;
        notifyListeners();
      }),
    );
    // Leave the ticks up for a moment; the files are already in the list.
    await Future<void>.delayed(const Duration(milliseconds: 1200));
    if (inProgress.values.every((done) => done)) inProgress.clear();
    notifyListeners();
  }

  /// Storage keys only allow a limited character set; the real name is kept in the documents table.
  static String safeName(String name) {
    final dot = name.lastIndexOf('.');
    final base = (dot > 0 ? name.substring(0, dot) : name).replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '_');
    final ext = dot > 0 ? name.substring(dot + 1).replaceAll(RegExp(r'[^A-Za-z0-9]'), '').toLowerCase() : '';
    final trimmed = base.isEmpty ? 'file' : (base.length > 80 ? base.substring(0, 80) : base);
    return ext.isEmpty ? trimmed : '$trimmed.$ext';
  }

  static String mimeFor(String name) => switch (name.split('.').last.toLowerCase()) {
    'pdf' => 'application/pdf',
    'png' => 'image/png',
    'jpg' || 'jpeg' => 'image/jpeg',
    'heic' => 'image/heic',
    'webp' => 'image/webp',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt' => 'text/plain',
    'heif' => 'image/heif',
    'gif' => 'image/gif',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'csv' => 'text/csv',
    _ => 'application/octet-stream',
  };

  static String _uuid() {
    final r = Random.secure();
    return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }
}

final uploads = Uploads();
