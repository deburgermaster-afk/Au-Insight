#!/usr/bin/env bash
# Cloudflare Workers Builds: fetch the pinned Flutter SDK, then build the web app into build/web.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/vercel-install.sh
flutter/bin/flutter build web --release --wasm
