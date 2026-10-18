import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// Security headers on every response. Same-origin framing is allowed (the app shows its own PDFs
// in frames); everything else that can embed, sniff or leak is shut off.
const security = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: security }];
  },
  experimental: {
    // Keep pages the browser has visited for a short while, so back/forward and revisits are instant.
    // Server actions that change data clear this cache, so edits always show.
    staleTimes: { dynamic: 30, static: 300 },
  },
  // cacheComponents is off: its renders hang on Cloudflare Workers (OpenNext). Data reads are
  // per request; getCtx is deduped with React cache().
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Gives `next dev` the Cloudflare bindings (R2 FILES) from wrangler.jsonc, emulated locally.
initOpenNextCloudflareForDev();
