#!/usr/bin/env bash
# Vercel has no Flutter image: fetch the pinned SDK (cached between builds) and get packages.
set -euo pipefail
FLUTTER_VERSION="3.47.7"
if [ ! -x flutter/bin/flutter ]; then
  git clone --depth 1 -b "$FLUTTER_VERSION" https://github.com/flutter/flutter.git flutter
fi
flutter/bin/flutter config --no-analytics >/dev/null
flutter/bin/flutter --disable-analytics >/dev/null || true
flutter/bin/flutter pub get
