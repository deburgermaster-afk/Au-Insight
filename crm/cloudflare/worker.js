// Worker entry: the OpenNext app plus scheduled jobs. The free Workers plan allows only 5 cron
// triggers per account, so this one trigger (every 10 minutes) also drives the SkillSelect
// rounds watcher (workers/rounds-watch) through a service binding.
import { default as app } from "../.open-next/worker.js";

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    const at = new Date(controller.scheduledTime);
    if (env.ROUNDS_WATCH) {
      const req = new Request("https://rounds-watch/run", { method: "POST", headers: { authorization: `Bearer ${env.ROUNDS_WATCH_KEY}` } });
      ctx.waitUntil(env.ROUNDS_WATCH.fetch(req).then(async (res) => console.log("rounds-watch", res.status, (await res.text()).slice(0, 300))));
    }
    const run = (path, label) => {
      const req = new Request(`https://lodgely.internal${path}`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
      ctx.waitUntil(app.fetch(req, env, ctx).then(async (res) => console.log(label, res.status, (await res.text()).slice(0, 300))));
    };
    // Every run: day-before appointment reminders.
    run("/api/cron/reminders", "reminders");
    // Every run: automatic Xero sync for agencies that switched it on.
    run("/api/cron/accounting", "accounting");
    // Hourly: signature reminders (the route itself only emails during Sydney business hours).
    if (at.getUTCMinutes() < 10) run("/api/cron/sign-reminders", "sign-reminders");
    // Hourly at :20: occupation watches (EOI position and cut-off alerts), after the rounds watcher has run.
    if (at.getUTCMinutes() >= 20 && at.getUTCMinutes() < 30) run("/api/cron/occupation-watch", "occupation-watch");
    // Daily around 7am Sydney (20:40 and 21:40 UTC cover AEDT and AEST; each reminder is made once): birthdays, grant anniversaries, sponsor obligations.
    if ((at.getUTCHours() === 20 || at.getUTCHours() === 21) && at.getUTCMinutes() >= 40 && at.getUTCMinutes() < 50) run("/api/cron/key-dates", "key-dates");
    // Overnight case reviews: every run from 14:00 to 19:59 UTC (midnight to 6am Sydney, AEST/AEDT).
    if (at.getUTCHours() >= 14 && at.getUTCHours() < 20) run("/api/cron/case-reviews", "case-reviews");
    // Daily at 19:0x UTC: Home Affairs processing times from Immi Insight.
    if (at.getUTCHours() === 19 && at.getUTCMinutes() < 10) run("/api/cron/processing-times", "processing-times");
    // Daily mail sync, usage alerts and domain checks (was the Vercel cron at 20:17 UTC).
    if (at.getUTCHours() === 20 && at.getUTCMinutes() < 10) {
      const req = new Request("https://lodgely.internal/api/cron/mail-sync", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
      ctx.waitUntil(app.fetch(req, env, ctx).then(async (res) => console.log("mail-sync", res.status, (await res.text()).slice(0, 300))));
    }
  },
};
