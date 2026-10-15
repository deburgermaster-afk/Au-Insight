// Worker entry: the OpenNext app, plus the daily cron (was Vercel Cron) calling the same route.
import { default as app } from "../.open-next/worker.js";

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    const req = new Request("https://lodgely.internal/api/cron/mail-sync", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    ctx.waitUntil(app.fetch(req, env, ctx).then(async (res) => console.log("mail-sync", res.status, (await res.text()).slice(0, 300))));
  },
};
