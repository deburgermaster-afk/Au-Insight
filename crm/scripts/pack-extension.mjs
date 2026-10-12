// Packages extension/ into public/downloads/lodgely-immiaccount-helper.zip, pointing it at this
// deployment (EXTENSION_BASE, else the production URL). Runs before every build.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";

const base = (process.env.EXTENSION_BASE || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://lodgely-alpha.vercel.app")).replace(/\/$/, "");
const dir = new URL("../extension/", import.meta.url).pathname;
const files = {};
for (const name of readdirSync(dir)) {
  const buf = readFileSync(join(dir, name));
  files[`lodgely-immiaccount-helper/${name}`] = /\.(json|js|html|css)$/.test(name) ? strToU8(buf.toString("utf8").replaceAll("__BASE__", base)) : new Uint8Array(buf);
}
mkdirSync(new URL("../public/downloads/", import.meta.url).pathname, { recursive: true });
writeFileSync(new URL("../public/downloads/lodgely-immiaccount-helper.zip", import.meta.url).pathname, zipSync(files, { level: 9 }));
console.log(`extension packed for ${base} (${Object.keys(files).length} files)`);
