// flutter_bootstrap.js loads assets from /r2/, so serve /r2/<path> as /<path>.
// Everything else is served straight from static assets (see wrangler.jsonc and web/_headers).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/r2/")) url.pathname = url.pathname.slice(3);
    const res = await env.ASSETS.fetch(new Request(url, request));
    const out = new Response(res.body, res);
    out.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    out.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
    return out;
  },
};
