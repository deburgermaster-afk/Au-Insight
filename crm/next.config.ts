import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
