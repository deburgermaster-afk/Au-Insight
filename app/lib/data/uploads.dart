import 'dart:math';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const documentsBucket = 'case-documents';

/// Picks and uploads documents from any screen.
///
/// Browsers only open a file picker from inside a tap (iOS Safari is strictest), so callers must
/// call [pickAndUpload] directly in their tap handler, before navigating or awaiting anything.
class Uploads extends ChangeNotifier {
  /// File name → done, for the batch in progress.
  final Map<String, bool> inProgress = {};

  /// Upload failures since the last read, for the Documents screen to show.
  final List<String> errors = [];

  /// Bumped after every batch so lists reload.
  int finished = 0;

  Future<void> pickAndUpload({String? folderId}) async {
    final files = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'doc', 'docx', 'txt'],
    );
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
          final bytes = await f.xFile.readAsBytes();
          final mime = f.xFile.mimeType ?? mimeFor(f.name);
          final path = '$uid/${_uuid()}/${f.name}';
          await sb.storage.from(documentsBucket).uploadBinary(path, bytes, fileOptions: FileOptions(contentType: mime));
          await sb.from('documents').insert({
            'storage_path': path,
            'filename': f.name,
            'mime_type': mime,
            'size_bytes': bytes.length,
            'folder_id': folderId,
          });
        } catch (e) {
          errors.add('${f.name}: $e');
        }
        inProgress[f.name] = true;
        notifyListeners();
      }),
    );
    await Future<void>.delayed(const Duration(milliseconds: 700));
    inProgress.clear();
    finished++;
    notifyListeners();
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
    _ => 'application/octet-stream',
  };

  static String _uuid() {
    final r = Random.secure();
    return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }
}

final uploads = Uploads();
