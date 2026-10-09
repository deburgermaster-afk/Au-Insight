# Immi Insight

**Live:** https://au-insight.vercel.app (Vercel, Sydney; deploys automatically on every push)

Australian migration decisions computed from the law itself. A Flutter web app (PWA) with a cited, agentic chat; a deterministic visa rules engine; and a background crawler that keeps a versioned copy of every official source up to date.

```
 Official sources                     Supabase (Sydney)                        Flutter web app (PWA)
 ────────────────                     ─────────────────                        ─────────────────────
 legislation.gov.au API ─┐            law_sources (15 official sites)         Ask      chat → edge function `chat`
 immi.homeaffairs.gov.au ┤  worker/   crawl_queue  (shared, resumable)  ◄──    Assess   live decision (Dart engine)
 homeaffairs.gov.au      ├─ crawler ─► law_documents → versions → sections     Docs     private folders, batch upload
 8 state nomination sites┤  (Python,  law_changes (what changed, when)    ◄──  Sources  live crawl progress & storage
 ART · JSA · ABS · OMARA ┘  browser)  search_law()  keyword + vector, as-at
                                      cases · chats · documents (RLS) · storage
                                      pg_cron: re-queue pages every hour
                                      edge fn `chat`: agent loop, read-only tools, rules engine
```

| Folder | What it is |
|---|---|
| `app/` | Flutter web app: shadcn_ui, go_router, flutter_animate, animations. Dart port of the rules engine in `lib/engine/`. |
| `supabase/migrations/` | Schema, row-level security, worker API, progress functions, hourly re-crawl schedule, source list. |
| `supabase/functions/chat/` | Agent: streams steps, sources, decisions and text as server-sent events. Works with any OpenAI-compatible API. |
| `supabase/functions/_shared/engine/` | TypeScript rules engine (the same rules as the Dart one; both test suites pass the same cases). |
| `worker/` | Crawler: queue-based, resumable, several can run at once. |

## How a decision is made

1. **The rules engine decides.** Each visa (189, 190, 491 so far) is a list of criteria. Each criterion is evaluated to:
   - `met`;
   - `not met`;
   - `unknown`, with the exact question to ask;
   - `at risk`, for discretionary criteria (health, character, debts), which are flagged and never decided.

   The points test matches Schedule 6D item by item (6D11–6D131). Missing facts give a points range, so a decision is still made when the unknowns can't change the outcome.
2. **The AI explains.** It must call `assess_visas` for eligibility and `search_law` for every requirement it mentions, cite sources as `[n]`, and quote the provision. It can only read, never write.
3. **Every claim links to its source:** the Act, the Regulations, a migration instrument, or the Home Affairs page section it came from.

Visa rules are marked `draft` until a person checks each criterion against its cited source. That review is what turns "computed" into "correct".

## Data sources (`law_sources` table — add more with an INSERT)

| Source | How | Scope |
|---|---|---|
| Federal Register of Legislation | official API (Word compilations) | Migration Act 1958, Migration Regulations 1994, Australian Citizenship Act and every in-force migration/citizenship instrument (~180 titles, discovered automatically) |
| Home Affairs: immigration and citizenship | browser crawl, all tabs and folded sections expanded | every visa, citizenship and requirement page, processing times, fees, news |
| Home Affairs: portfolio | browser crawl | media releases, migration program reports |
| State and territory nomination | browser crawl | VIC, NSW, QLD, WA, SA, TAS, ACT, NT skilled/business nomination |
| Administrative Review Tribunal | browser crawl | migration review procedures, time limits, fees |
| Jobs and Skills Australia, ABS | browser crawl | occupation shortage list, ANZSCO/OSCA definitions |
| OMARA | browser crawl | migration agent register and code of conduct |

Pages are re-checked every 24 hours (some sources weekly or monthly). A changed page becomes a new version with the dates it was in force, and the change is listed on the **Sources** screen.

## Setup

### 1. Supabase (already created: project `immi-insight`, Sydney)
All migrations are applied and the `chat` function is deployed. Still to do in the dashboard:

- **Email codes instead of links.** Go to Authentication → Emails:
  - paste `supabase/templates/confirmation.html` into **Confirm signup**;
  - paste `supabase/templates/recovery.html` into **Reset password**.

  Both use `{{ .Token }}`.
- **SMTP.** Supabase's built-in email only delivers to your project's team members and is heavily rate-limited. Add your own SMTP (e.g. Resend) under Authentication → Emails → SMTP.
- **AI provider: done.** The chat uses xKiro's OpenAI-compatible gateway (`https://api.xkiro.com/v1`). The API key is stored encrypted in **Supabase Vault** as `llm_api_key`, and only the server-side service role can read it (`public.llm_api_key()`). To rotate it, run `select vault.update_secret((select id from vault.secrets where name = 'llm_api_key'), '<new key>');`.
  - **Models:** Cohere Command A Plus, then Mistral Large 4, then Qwen 3.8 Max, all free. These were picked by testing the free tool-calling models on this agent's loop. Command A Plus passed correct arguments, used every tool and didn't invent numbers.
  - **Fallback:** if a model is rate-limited, the next one is used. Override the list with the `LLM_MODEL` function secret (comma-separated), and the provider with `LLM_BASE_URL` / `LLM_API_KEY`.

### 2. Run the app locally
```bash
cd app
flutter pub get
flutter run -d chrome            # or: flutter build web --release --wasm
flutter test                     # engine tests
```
The Supabase URL and publishable key are compiled in as defaults (`lib/config.dart`). To point at another project, use `--dart-define=SUPABASE_URL=… --dart-define=SUPABASE_KEY=…`.

### 3. Background crawler
The worker authenticates with a **worker token** (only its SHA-256 hash is stored in `private.worker_tokens`), so it needs no database password and can run anywhere:

- **GitHub Actions (free).** `.github/workflows/crawl.yml` runs every 3 hours and works the queue for up to 5.5 hours. Add the repository secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `WORKER_TOKEN`.
- **Always-on.** `docker build -t immi-worker worker && docker run --env-file worker/.env immi-worker` (Railway, Fly.io, any VPS).
- **Locally.** `pip install -r worker/requirements.txt && python -m playwright install chromium && python worker/crawler.py`.

Cloudflare Workers can't run the real browser that Home Affairs needs (its pages are built with JavaScript and protected by Akamai), so the crawler runs as a normal process. The hourly `pg_cron` job inside Supabase re-queues stale pages, so any worker that runs picks up where the last one stopped.

Re-split stored pages after changing the section parser (`PARSER_VERSION` in `worker/sections.py`). This fetches nothing and isn't logged as a law change:
```bash
python worker/crawler.py --reparse
```

To rotate the worker token:
```sql
insert into private.worker_tokens (token_hash, name)
values (encode(extensions.digest('<new long random token>', 'sha256'), 'hex'), 'github');
```

### 4. Web app hosting (Vercel, Sydney): done
The Vercel project `au-insight` (team Xerox) is linked to this repo with root directory `app/`:
- Vercel has no Flutter image, so `app/scripts/vercel-install.sh` clones the pinned Flutter SDK, and `app/vercel.json` builds with `flutter build web --release --wasm`.
- Pushes that don't touch `app/` skip the build.
- `vercel.json` also adds the single-page-app fallback, cross-origin isolation (lets the WebAssembly renderer use threads) and long-lived asset caching.
- `.github/workflows/deploy-web.yml` is an optional alternative that builds in GitHub Actions.

## Tests
- `app/`: `flutter analyze && flutter test` (16 engine tests).
- `supabase/functions/`: `deno test --allow-net`. This runs the engine tests, plus agent-loop tests against a fake model (streamed tool calls, model fallback).
- `supabase/functions/chat/live_check.ts`: manual end-to-end run against the real model and database.
- CI runs all of these (`.github/workflows/ci.yml`).
