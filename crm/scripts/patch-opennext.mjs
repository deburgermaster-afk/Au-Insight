// Next.js 16.4 loads .next/server/preview-props.json at runtime, but @opennextjs/cloudflare
// (<= 1.20.11) doesn't inline it, so every dynamic route throws on Workers.
// Applies the upstream fix (opennextjs/opennextjs-cloudflare#1356) until a release ships it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = "node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js";
if (existsSync(file)) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("preview-props")) {
    const out = src.replace("required-server-files,prefetch-hints}", "required-server-files,prefetch-hints,preview-props}");
    if (out === src) console.warn("patch-opennext: pattern not found, skipped");
    else writeFileSync(file, out), console.log("patch-opennext: preview-props.json will be inlined");
  }
}
