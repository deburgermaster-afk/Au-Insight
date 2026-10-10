// Official-website reader: reads a page, or searches a provider's site, live. Only official sites
// are fetched: CRICOS providers' own websites, *.gov.au and *.edu.au (the database decides, via
// official_domain). Every hop of a redirect is checked again, IP addresses, other ports and
// credentials are refused, and size and time are capped, so the tool can't be pointed at anything
// else (SSRF). Pages come back as markdown-ish text, trimmed to the parts about the query.

import type { ToolCtx, ToolDef, ToolOpts } from "./shared.ts";
import { within } from "./shared.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const MAX_BYTES = 1_500_000;
const REQUEST_MS = 6_000;
/** One tool call, all of its requests together. */
const TOOL_MS = 15_000;
const MAX_REDIRECTS = 3;
const PAGE_CHARS = 6000;
const SEARCH_PAGE_CHARS = 2500;
const MAX_SITEMAP_URLS = 8000;
const MAX_CHILD_SITEMAPS = 6;

/** Hosting and social sites: never "official", even if a provider lists one as its website. */
const SHARED_HOSTS = [
  "google.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "wixsite.com",
  "wordpress.com",
  "blogspot.com",
  "squarespace.com",
  "weebly.com",
  "github.io",
  "webflow.io",
  "netlify.app",
  "vercel.app",
  "pages.dev",
  "workers.dev",
];

export type UrlCheck = { ok: true; url: URL; host: string } | { ok: false; reason: string };

/**
 * Checks a URL before any request: https only, default port, no user:password, a real DNS name
 * (no IP literals, no local names). The database check (official_domain) comes after this.
 */
export function checkUrl(raw: string): UrlCheck {
  const text = String(raw ?? "").trim();
  if (!text || text.length > 2000) return { ok: false, reason: "No URL" };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Only https pages can be read" };
  if (url.username || url.password) return { ok: false, reason: "URLs with credentials are not allowed" };
  if (url.port && url.port !== "443") return { ok: false, reason: "Only the standard https port is allowed" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.includes(":") || host.startsWith("[")) return { ok: false, reason: "IP addresses are not allowed" };
  // The URL parser already turns 0x7f.1 or 2130706433 into dotted form: any all-numeric host is an IP.
  if (/^[\d.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "IP addresses are not allowed" };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.split(".").some((l) => !l || l.startsWith("-"))) {
    return { ok: false, reason: "Not a public host name" };
  }
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host)) {
    return { ok: false, reason: "Not a public host name" };
  }
  if (SHARED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { ok: false, reason: "Shared hosting and social sites are not official sources" };
  }
  url.hash = "";
  url.hostname = host;
  return { ok: true, url, host };
}

/** Private, loopback, link-local, shared and multicast addresses (v4 and v6). */
export function isPrivateAddress(ip: string): boolean {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return isPrivateAddress(mapped[1]);
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
  if (v4) {
    const [p, q] = [Number(v4[1]), Number(v4[2])];
    return p === 0 || p === 10 || p === 127 || p >= 224 || (p === 169 && q === 254) ||
      (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 100 && q >= 64 && q <= 127) ||
      (p === 192 && q === 0) || (p === 198 && (q === 18 || q === 19));
  }
  if (a === "::" || a === "::1") return true;
  return /^(fc|fd|fe[89ab]|ff)/.test(a);
}

/** Default DNS check: refuse names that resolve to private addresses. Skipped where DNS lookups aren't available. */
async function defaultResolve(host: string): Promise<string[]> {
  const resolve = (Deno as unknown as { resolveDns?: (h: string, t: string) => Promise<string[]> }).resolveDns;
  if (!resolve) return [];
  const lookup = Promise.allSettled([resolve(host, "A"), resolve(host, "AAAA")]).then((r) =>
    r.flatMap((x) => (x.status === "fulfilled" ? x.value : []))
  );
  return await Promise.race([lookup, new Promise<string[]>((r) => setTimeout(() => r([]), 1500))]);
}

// ---------- HTML to text ----------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  times: "×",
  dollar: "$",
  euro: "€",
  pound: "£",
  laquo: "«",
  raquo: "»",
  shy: "",
  zwj: "",
  zwnj: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Not <form>: ASP.NET sites wrap the whole page in one.
const DROP_BLOCKS = ["script", "style", "noscript", "svg", "nav", "header", "footer", "iframe", "template", "head"];

/**
 * Readable text from HTML: drops scripts, styles, navigation, headers and footers; keeps headings
 * as markdown (#), list items as "- ", table rows with cells joined by " | ". Prefers <main> when
 * it holds the content.
 */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  let h = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of DROP_BLOCKS) h = h.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  // Unclosed leftovers of the same tags (broken markup): drop just the tag.
  h = h.replace(new RegExp(`<\\/?(${DROP_BLOCKS.join("|")})\\b[^>]*>`, "gi"), " ");
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(h)?.[1];
  if (main && stripTags(main).trim().length > 400) h = main;
  h = h
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, inner: string) => {
      const t = stripTags(inner).replace(/\s+/g, " ").trim();
      return t ? `\n\n${"#".repeat(Number(n))} ${t}\n\n` : "\n";
    })
    .replace(/<\/t[dh]>\s*<t[dh]\b[^>]*>/gi, " | ")
    .replace(/<tr\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|aside|table|thead|tbody|tfoot|ul|ol|dl|dt|dd|blockquote|figure|figcaption|details|summary|main|pre)\b[^>]*>/gi, "\n");
  const text = decodeEntities(stripTags(h))
    .replace(/[ \t\u00a0\u2000-\u200b]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, all) => l !== "-" && !(l === "" && all[i - 1] === ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, " ");
}

/** Links on a page, resolved against its URL (https only, no fragments, de-duplicated). */
export function extractLinks(html: string, base: string): { url: string; text: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(decodeEntities(m[2]), base);
      if (u.protocol !== "https:") continue;
      u.hash = "";
      const text = decodeEntities(stripTags(m[3])).replace(/\s+/g, " ").trim().slice(0, 120);
      if (!out.has(u.href) || (text && !out.get(u.href))) out.set(u.href, text);
    } catch { /* bad href */ }
    if (out.size >= 1500) break;
  }
  return [...out].map(([url, text]) => ({ url, text }));
}

// ---------- query terms and scoring ----------

const STOPWORDS = new Set(
  "the a an of for and or to in on at by with from how what which who when where can could i my me we our you your is are am be do does did it its this that these those about into than then any all much many more most get have has there their them they policy page site university college uni".split(" "),
);

/** Synonyms used to match URL paths and link text. */
const SYNONYMS: Record<string, string[]> = {
  overload: ["study-load", "load", "overload", "excess-load"],
  load: ["study-load", "overload"],
  "cross-institutional": ["cross-institution", "crossinstitutional", "cross-inst", "cross-institutional-study"],
  credit: ["advanced-standing", "recognition-of-prior-learning", "rpl", "credit-transfer", "credit"],
  rpl: ["recognition-of-prior-learning", "credit", "advanced-standing"],
  "advanced-standing": ["credit", "rpl", "recognition-of-prior-learning"],
  research: ["hdr", "higher-degree", "phd", "mphil", "doctor", "research-degree", "graduate-research"],
  phd: ["doctor-of-philosophy", "doctorate", "hdr", "research-degree", "graduate-research"],
  mphil: ["master-of-philosophy", "masters-by-research", "hdr", "research-degree"],
  "masters-by-research": ["master-of-philosophy", "mphil", "master-by-research", "research-masters", "hdr"],
  hdr: ["higher-degree-by-research", "research-degree", "phd", "graduate-research"],
  fees: ["fee", "tuition", "tuition-fees", "costs"],
  fee: ["fees", "tuition", "tuition-fees"],
  tuition: ["fees", "fee", "tuition-fees"],
  scholarship: ["scholarships", "funding", "stipend"],
  scholarships: ["scholarship", "funding", "stipend"],
  transfer: ["change-course", "release", "transfer-course", "internal-transfer", "changing-course"],
  release: ["transfer", "letter-of-release", "release-letter"],
  english: ["english-language", "english-requirements", "english-language-requirements", "elicos"],
  entry: ["admission", "entry-requirements", "admissions", "requirements"],
  admission: ["admissions", "entry-requirements", "entry"],
  summer: ["summer-term", "summer-semester", "summer-school", "intensive", "teaching-periods"],
  winter: ["winter-term", "winter-semester", "winter-school", "intensive", "teaching-periods"],
  honours: ["honors", "bachelor-honours"],
  international: ["international-students", "international"],
  enrolment: ["enrollment", "enrol", "enroll"],
  progress: ["academic-progress", "course-progress", "unsatisfactory-progress"],
  deferral: ["defer", "deferment", "leave-of-absence", "intermission", "suspension"],
  refund: ["refunds", "refund-policy"],
};

const PHRASES: [RegExp, string][] = [
  [/cross[\s-]*institution(al)?/g, "cross-institutional"],
  [/advanced[\s-]+standing/g, "advanced-standing"],
  [/recognition of prior learning/g, "rpl"],
  [/study[\s-]+load/g, "overload"],
  [/higher degrees? (by|of) research/g, "hdr"],
  [/masters? (degree )?(by|of) research|research masters?/g, "masters-by-research"],
  [/master of philosophy/g, "mphil"],
  [/doctor of philosophy|doctorate/g, "phd"],
  [/credit transfer/g, "credit"],
  [/change (of )?course|course change/g, "transfer"],
  [/letter of release|release letter/g, "release"],
  [/leave of absence/g, "deferral"],
];

/** Query terms, each with its synonyms: [["overload","study-load","load",...], ...]. */
export function queryTerms(query: string): string[][] {
  let q = query.toLowerCase();
  for (const [re, to] of PHRASES) q = q.replace(re, ` ${to} `);
  const words = [...new Set(q.split(/[^a-z0-9-]+/).map((w) => w.replace(/^-+|-+$/g, "")).filter(Boolean))]
    .filter((w) => !STOPWORDS.has(w) && (w.length >= 3 || ["rpl", "hdr", "phd"].includes(w)));
  return words.slice(0, 8).map((w) => [w, ...(SYNONYMS[w] ?? []).filter((s) => s !== w)]);
}

function hasWord(haystack: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-_ ]?");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(haystack);
}

/** How well a URL's path (and, for links, its text) matches the query terms; 0 means no match. */
export function scoreUrl(url: string, terms: string[][], mainHost?: string, linkText = ""): number {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 0;
  }
  let path = u.pathname.toLowerCase();
  try {
    path = decodeURIComponent(path);
  } catch { /* keep encoded */ }
  if (/\.(jpe?g|png|gif|svg|webp|ico|css|js|mp4|mp3|zip|docx?|xlsx?|pptx?|xml|json|txt)$/.test(path)) return 0;
  const text = linkText.toLowerCase();
  let s = 0;
  for (const group of terms) {
    let best = 0;
    group.forEach((v, i) => {
      if (hasWord(path, v)) best = Math.max(best, i === 0 ? 3 : 2);
      else if (text && hasWord(text, v.replace(/-/g, " "))) best = Math.max(best, i === 0 ? 2 : 1.5);
    });
    s += best;
  }
  if (s === 0) return 0;
  if (/international/.test(path)) s += 0.5;
  if (/polic(y|ies)|procedure|rules|handbook|current-students|students\//.test(path)) s += 0.5;
  if (/\/(news|events?|blog|stories|story|media|articles?|newsroom|podcasts?|profiles?)\//.test(path)) s -= 2;
  if (path.endsWith(".pdf")) s -= 0.3;
  s -= path.split("/").filter(Boolean).length * 0.1;
  if (u.search) s -= 0.5;
  if (mainHost && u.hostname !== mainHost) s -= 0.3;
  return Math.round(s * 100) / 100;
}

/** Best-first URLs with a positive score. */
export function rankUrls(urls: string[], terms: string[][], mainHost?: string): { url: string; score: number }[] {
  return urls
    .map((url) => ({ url, score: scoreUrl(url, terms, mainHost) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * The parts of a long page around the query terms, in page order, up to `max` characters; the
 * start of the page is kept for context. Short pages come back whole.
 */
export function excerpt(text: string, query: string, max = PAGE_CHARS): string {
  if (text.length <= max) return text;
  const words = queryTerms(query).flat().map((w) => w.replace(/-/g, " ")).filter((w) => w.length >= 3);
  const lower = text.toLowerCase();
  const windows: [number, number, number][] = [];
  const W = 700;
  for (const w of new Set(words)) {
    let i = lower.indexOf(w);
    let hits = 0;
    while (i !== -1 && hits < 30) {
      windows.push([Math.max(0, i - W / 2), Math.min(text.length, i + W), 1]);
      i = lower.indexOf(w, i + w.length);
      hits++;
    }
  }
  if (!windows.length) return text.slice(0, max) + "\n[… page shortened]";
  // Merge overlapping windows; a window's weight is how many matches it covers.
  windows.sort((a, b) => a[0] - b[0]);
  const merged: [number, number, number][] = [];
  for (const w of windows) {
    const last = merged.at(-1);
    if (last && w[0] <= last[1]) [last[1], last[2]] = [Math.max(last[1], w[1]), last[2] + 1];
    else merged.push([...w]);
  }
  const head = Math.min(600, Math.floor(max / 8));
  let budget = max - head;
  const chosen = merged
    .map((w) => ({ w, weight: w[2] / Math.sqrt((w[1] - w[0]) / W) }))
    .sort((a, b) => b.weight - a.weight)
    .filter(({ w }) => {
      const len = w[1] - w[0];
      if (len > budget) {
        if (budget < 300) return false;
        w[1] = w[0] + budget;
      }
      budget -= w[1] - w[0];
      return true;
    })
    .map(({ w }) => w)
    .sort((a, b) => a[0] - b[0]);
  const parts = [text.slice(0, head)];
  let end = head;
  for (const [a, b] of chosen) {
    const start = Math.max(a, end);
    if (start >= b) continue;
    parts.push((start > end ? "\n[…]\n" : "") + text.slice(start, b));
    end = b;
  }
  return parts.join("") + (end < text.length ? "\n[… page shortened]" : "");
}

// ---------- sitemaps and robots.txt ----------

/** URLs in a sitemap or sitemap index (<loc> entries). */
export function parseSitemap(xml: string): { index: boolean; locs: string[] } {
  const index = /<sitemapindex[\s>]/i.test(xml);
  const locs: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?\s*<\/loc>/gi)) {
    locs.push(decodeEntities(m[1].trim()));
    if (locs.length >= MAX_SITEMAP_URLS) break;
  }
  return { index, locs };
}

/** "Sitemap:" lines and the Disallow/Allow rules that apply to every crawler ("User-agent: *"). */
export function parseRobots(text: string): { sitemaps: string[]; allow: string[]; disallow: string[] } {
  const sitemaps: string[] = [];
  const allow: string[] = [];
  const disallow: string[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const [key, value] = [m[1].toLowerCase(), m[2].trim()];
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
    } else if (key === "user-agent") {
      if (inRules) agents = [];
      inRules = false;
      agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      inRules = true;
      if (!agents.includes("*") || !value) continue;
      (key === "allow" ? allow : disallow).push(value);
    }
  }
  return { sitemaps, allow, disallow };
}

/** Whether robots.txt lets crawlers fetch this path (longest matching rule wins; Allow wins ties). */
export function robotsAllows(rules: { allow: string[]; disallow: string[] }, path: string): boolean {
  const match = (rule: string) => {
    const re = new RegExp(
      "^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"),
    );
    return re.test(path);
  };
  const best = (rules: string[]) => Math.max(-1, ...rules.filter(match).map((r) => r.length));
  return best(rules.allow) >= best(rules.disallow);
}

// ---------- fetching ----------

type Fetched =
  | { ok: true; url: string; status: number; type: string; bytes: Uint8Array; truncated: boolean }
  | { ok: false; error: string };

export type Page = { ok: true; url: string; title: string; text: string; html?: string } | { ok: false; error: string };

/** Live page reading and site search, restricted to official sites. */
export function siteTools(ctx: ToolCtx) {
  const official = new Map<string, Promise<boolean>>();
  const dnsOk = new Map<string, Promise<boolean>>();
  const pages = new Map<string, Promise<Page>>();
  const robots = new Map<string, Promise<ReturnType<typeof parseRobots> | null>>();
  const resolveDns = ctx.resolveDns ?? defaultResolve;

  const isOfficial = (host: string) => {
    if (!official.has(host)) {
      official.set(
        host,
        Promise.resolve(ctx.supabase.rpc("official_domain", { p_host: host }))
          .then(({ data, error }) => !error && data === true)
          .catch(() => false),
      );
    }
    return official.get(host)!;
  };

  const resolvesPublic = (host: string) => {
    if (!dnsOk.has(host)) {
      dnsOk.set(host, resolveDns(host).then((ips) => !ips.some(isPrivateAddress)).catch(() => true));
    }
    return dnsOk.get(host)!;
  };

  /** One URL, following up to three redirects, every hop checked; body capped at MAX_BYTES. */
  async function safeFetch(raw: string, signal: AbortSignal, accept = "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5"): Promise<Fetched> {
    let current = raw;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const check = checkUrl(current);
      if (!check.ok) return { ok: false, error: check.reason };
      if (!(await isOfficial(check.host))) {
        return {
          ok: false,
          error: `${check.host} is not an official site (only CRICOS providers' websites, .gov.au and .edu.au)`,
        };
      }
      if (!(await resolvesPublic(check.host))) return { ok: false, error: `${check.host} does not resolve to a public address` };
      let res: Response;
      try {
        res = await ctx.fetch(check.url.href, {
          redirect: "manual",
          signal: within(REQUEST_MS, signal),
          headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "en-AU,en;q=0.9" },
        });
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        return { ok: false, error: name === "TimeoutError" || name === "AbortError" ? "The site took too long" : "Could not reach the site" };
      }
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        if (!location) return { ok: false, error: `Redirect without a location (${res.status})` };
        try {
          current = new URL(location, check.url).href;
        } catch {
          return { ok: false, error: "Bad redirect" };
        }
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, error: `The site answered ${res.status}` };
      }
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_BYTES * 4) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, error: "The page is too large to read" };
      }
      try {
        const { bytes, truncated } = await readCapped(res, MAX_BYTES);
        return { ok: true, url: check.url.href, status: res.status, type: res.headers.get("content-type") ?? "", bytes, truncated };
      } catch {
        return { ok: false, error: "The site took too long" };
      }
    }
    return { ok: false, error: "Too many redirects" };
  }

  /** A page as text (HTML or PDF), cached for the turn. */
  function fetchPage(raw: string, signal: AbortSignal): Promise<Page> {
    const key = checkUrl(raw);
    const cacheKey = key.ok ? key.url.href : raw;
    if (!pages.has(cacheKey)) {
      pages.set(
        cacheKey,
        (async (): Promise<Page> => {
          const got = await safeFetch(raw, signal);
          if (!got.ok) return got;
          const type = got.type.toLowerCase();
          const isPdf = type.includes("application/pdf") || (!type && /\.pdf$/i.test(got.url)) ||
            new TextDecoder().decode(got.bytes.subarray(0, 5)) === "%PDF-";
          if (isPdf) {
            if (got.truncated) return { ok: false, error: "The PDF is too large to read here" };
            try {
              const { extractText, getDocumentProxy } = await import("unpdf");
              const { text } = await extractText(await getDocumentProxy(got.bytes), { mergePages: true });
              const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
              return clean
                ? { ok: true, url: got.url, title: fileName(got.url), text: clean }
                : { ok: false, error: "The PDF has no text layer" };
            } catch {
              return { ok: false, error: "Could not read the PDF" };
            }
          }
          if (type && !/(text\/html|xhtml|text\/plain|xml)/.test(type)) {
            return { ok: false, error: `Not a web page (${type.split(";")[0]})` };
          }
          const html = decode(got.bytes, type);
          if (type.includes("text/plain")) return { ok: true, url: got.url, title: "", text: html.trim() };
          const { title, text } = htmlToText(html);
          return { ok: true, url: got.url, title, text, html };
        })().then((page) => {
          // Failures (often a timeout) may succeed on a later call.
          if (!page.ok) pages.delete(cacheKey);
          return page;
        }),
      );
    }
    return pages.get(cacheKey)!;
  }

  async function robotsFor(origin: string, signal: AbortSignal) {
    if (!robots.has(origin)) {
      robots.set(
        origin,
        (async () => {
          const got = await safeFetch(`${origin}/robots.txt`, signal, "text/plain,*/*;q=0.5");
          return got.ok ? parseRobots(decode(got.bytes, got.type)) : null;
        })(),
      );
    }
    return await robots.get(origin)!;
  }

  /** Every page URL in the site's sitemaps (robots.txt "Sitemap:" lines, else /sitemap.xml). */
  async function sitemapUrls(origin: string, terms: string[][], signal: AbortSignal): Promise<string[]> {
    const rules = await robotsFor(origin, signal);
    const roots = rules?.sitemaps.length ? rules.sitemaps.slice(0, 4) : [`${origin}/sitemap.xml`];
    const urls = new Set<string>();
    const readMap = async (u: string) => {
      if (/\.gz($|\?)/i.test(u)) return { index: false, locs: [] as string[] }; // gzip isn't supported
      const got = await safeFetch(u, signal, "application/xml,text/xml,*/*;q=0.5");
      return got.ok ? parseSitemap(decode(got.bytes, got.type)) : { index: false, locs: [] as string[] };
    };
    const tops = await Promise.all(roots.map(readMap));
    const children: string[] = [];
    for (const t of tops) {
      if (t.index) children.push(...t.locs);
      else for (const l of t.locs) urls.add(l);
    }
    if (children.length) {
      // Child sitemaps named after the query (or general pages) first.
      const pick = children
        .filter((c) => !/\.gz($|\?)/i.test(c))
        .map((c) => ({
          c,
          s: terms.flat().filter((t) => c.toLowerCase().includes(t)).length * 2 +
            (/page|content|study|international|polic|research|student|course/i.test(c) ? 1 : 0) -
            (/news|event|blog|story|image|video|people|staff|profile|product/i.test(c) ? 2 : 0),
        }))
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_CHILD_SITEMAPS)
        .map((x) => x.c);
      for (const m of await Promise.all(pick.map(readMap))) {
        for (const l of m.locs) {
          if (urls.size >= MAX_SITEMAP_URLS) break;
          urls.add(l);
        }
      }
    }
    const allowed = [...urls].filter((u) => {
      try {
        return !rules || robotsAllows(rules, new URL(u).pathname);
      } catch {
        return false;
      }
    });
    return allowed.slice(0, MAX_SITEMAP_URLS);
  }

  return {
    fetchPage,

    async read_official_page(args: Record<string, unknown>, opts?: ToolOpts) {
      const url = String(args.url ?? "");
      const query = String(args.query ?? "");
      const signal = within(TOOL_MS, opts?.signal);
      const page = await fetchPage(url, signal);
      if (!page.ok) return { error: page.error, url };
      const host = new URL(page.url).hostname.replace(/^www\./, "");
      const n = ctx.cite({ title: page.title || host, section: host, url: page.url });
      const text = excerpt(page.text, query, PAGE_CHARS);
      return { n, url: page.url, title: page.title, site: host, retrieved: new Date().toISOString().slice(0, 10), text };
    },

    async search_official_site(
      args: Record<string, unknown>,
      opts?: ToolOpts,
      resolveWebsite?: (provider: string) => Promise<{ website?: string; error?: string }>,
    ) {
      const query = String(args.query ?? "").trim().slice(0, 200);
      if (!query) return { error: "Give what to look for (query)." };
      const signal = within(TOOL_MS, opts?.signal);
      let site = String(args.domain ?? "").trim();
      if (!site && args.provider && resolveWebsite) {
        const w = await resolveWebsite(String(args.provider));
        if (!w.website) return { error: w.error ?? "That provider has no website in the CRICOS register." };
        site = w.website;
      }
      if (!site) return { error: "Give a provider (name or CRICOS code) or a domain." };
      const check = checkUrl(site);
      if (!check.ok) return { error: check.reason };
      const origin = check.url.origin;
      const terms = queryTerms(query);
      if (!terms.length) return { error: "The query needs a few specific words." };

      let via = "sitemap";
      let ranked = rankUrls(await sitemapUrls(origin, terms, signal).catch(() => []), terms, check.host);
      if (!ranked.length && !signal.aborted) {
        // No sitemap, or nothing in it matched: follow links from the home page.
        via = "links";
        const home = await fetchPage(origin + "/", signal);
        if (!home.ok) return { error: home.error, site: check.host };
        const rules = await robotsFor(origin, signal);
        const links = extractLinks(home.html ?? "", home.url).filter((l) => {
          try {
            const u = new URL(l.url);
            return sameSite(u.hostname, check.host) && (!rules || robotsAllows(rules, u.pathname));
          } catch {
            return false;
          }
        });
        ranked = links
          .map((l) => ({ url: l.url, score: scoreUrl(l.url, terms, check.host, l.text) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score);
        if (!ranked.length) {
          const n = ctx.cite({ title: home.title || check.host, section: check.host.replace(/^www\./, ""), url: home.url });
          return {
            site: check.host,
            via,
            results: [{ n, url: home.url, title: home.title, text: excerpt(home.text, query, SEARCH_PAGE_CHARS) }],
            note: "No page on the site matched the query; this is the home page. Try other words or read_official_page.",
          };
        }
      }
      const top = ranked.slice(0, 3);
      const got = await Promise.all(top.map((r) => fetchPage(r.url, signal)));
      const results = got.flatMap((p) => {
        if (!p.ok) return [];
        const host = new URL(p.url).hostname.replace(/^www\./, "");
        return [{
          n: ctx.cite({ title: p.title || host, section: host, url: p.url }),
          url: p.url,
          title: p.title,
          text: excerpt(p.text, query, SEARCH_PAGE_CHARS),
        }];
      });
      return {
        site: check.host,
        via,
        retrieved: new Date().toISOString().slice(0, 10),
        results,
        failed: got.flatMap((p, i) => (p.ok ? [] : [{ url: top[i].url, error: p.error }])),
        otherMatches: ranked.slice(3, 8).map((r) => r.url),
        note: results.length ? undefined : "The matching pages couldn't be read; try read_official_page on another match.",
      };
    },
  };
}

async function readCapped(res: Response, max: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= max) {
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.min(c.length, bytes.length - at));
    bytes.set(part, at);
    at += part.length;
    if (at >= bytes.length) break;
  }
  return { bytes, truncated };
}

/** The same site: equal, or one a subdomain of the other, ignoring "www.". */
export function sameSite(a: string, b: string): boolean {
  const [x, y] = [a.replace(/^www\./, ""), b.replace(/^www\./, "")];
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

function fileName(url: string): string {
  const last = url.split("?")[0].split("/").pop() || "PDF";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function decode(bytes: Uint8Array, type: string): string {
  const charset = /charset=([\w-]+)/i.exec(type)?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export const siteDefs: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_official_page",
      description:
        "Read a page (or PDF) live from an official website: a CRICOS provider's own site, or any .gov.au or .edu.au site. Give the query to get the parts of a long page about it. Returns a numbered source to cite as [n].",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "https URL on an official site" },
          query: { type: "string", description: "What you need from the page, e.g. 'overload maximum credit points'" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_official_site",
      description:
        "Search a provider's official website live (its sitemap, else links from its home page) and read the best three pages: policies on overload, cross-institutional study, credit/RPL, HDR entry requirements, fees, scholarships, course transfers. Give the provider (name or CRICOS code) or a domain. Returns numbered sources to cite as [n].",
      parameters: {
        type: "object",
        properties: {
          provider: { type: "string", description: "Provider name or CRICOS provider code" },
          domain: { type: "string", description: "Or a domain, e.g. 'www.monash.edu' or 'www.education.gov.au'" },
          query: { type: "string", description: "Specific words, e.g. 'study overload approval'" },
        },
        required: ["query"],
      },
    },
  },
];
