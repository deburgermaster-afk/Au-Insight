import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

/// A file the user picked, read only when uploaded.
class PickedFile {
  PickedFile(this._file);
  final web.File _file;

  String get name => _file.name;
  String get type => _file.type;
  int get size => _file.size;

  Future<Uint8List> bytes() async => (await _file.arrayBuffer().toDart).toDart.asUint8List();
}

/// Opens the browser's own file picker: any file type, several at once.
///
/// Call it straight from a tap handler (browsers only open pickers inside a user gesture).
/// It waits for the real `change` event: pickers that hand off to another app (Files, Drive)
/// take a while to deliver the file, and treating the window regaining focus as a cancel
/// (as file_picker does) drops those picks, typically PDFs.
Future<List<PickedFile>> pickFiles() {
  final done = Completer<List<PickedFile>>();
  // A previous pick that was dismissed without a `cancel` event may have left its input behind.
  final stale = web.document.querySelectorAll('input[data-picker]');
  for (var i = 0; i < stale.length; i++) {
    (stale.item(i) as web.Element?)?.remove();
  }

  final input = web.HTMLInputElement()
    ..type = 'file'
    ..multiple = true
    ..setAttribute('data-picker', '')
    ..style.display = 'none';
  // WebKit only delivers `change` to inputs that are in the document.
  web.document.body!.append(input);

  void finish(List<PickedFile> files) {
    if (done.isCompleted) return;
    done.complete(files);
    input.remove();
  }

  input.addEventListener(
    'change',
    ((web.Event _) {
      final list = input.files;
      finish([
        if (list != null)
          for (var i = 0; i < list.length; i++) PickedFile(list.item(i)!),
      ]);
    }).toJS,
  );
  input.addEventListener('cancel', ((web.Event _) => finish(const [])).toJS);
  input.click();
  return done.future;
}

/// Opens [url] in a new tab. Must run synchronously inside a tap: iOS Safari silently blocks
/// windows opened after an `await`.
void openInNewTab(String url) {
  if (web.window.open(url, '_blank') == null) web.window.location.href = url;
}

/// For when the URL isn't ready yet: opens an empty tab inside the tap, then points it at the URL
/// once known (or uses this tab if the browser blocked the new one).
Future<void> openWhenReady(Future<String> url) async {
  final tab = web.window.open('', '_blank');
  final resolved = await url;
  if (tab != null) {
    tab.location.href = resolved;
  } else {
    web.window.location.href = resolved;
  }
}
