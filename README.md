# Immi Insight

Australian migration assessments computed from the law itself. Answers are decided by a rules engine, explained by an AI agent that can only read, and every claim cites the Migration Act, the Migration Regulations or the Home Affairs page it came from.

```
worker/ (daily)                     Supabase (Sydney)                     Next.js PWA (Vercel syd1)
─────────────────                   ─────────────────                     ─────────────────────────
Crawl4AI → immi.homeaffairs   ──►   law_documents / versions        ◄──   /api/chat  agent (read-only tools)
  every tab + accordion             law_sections (FTS + pgvector)            search_law · get_case_file
FRL API  → Act + Regulations  ──►   law_changes (what changed, when)         list_documents · assess_visas
  official Word compilations        search_law() hybrid, as-at date     ◄──   src/lib/engine  (deterministic)
                                    cases · documents · chats  (RLS)   ◄──   /app  Ask · Assess · Documents
                                    storage: case-documents (private)
```

## How it decides

- **The rules engine decides.** `src/lib/engine` evaluates visa criteria as data (`visas.ts`) with three-valued logic: each criterion is `met`, `not_met`, `unknown` (with the exact question to ask) or `at_risk` (discretionary: health, character, debts). Missing facts never get guessed. The points test returns a range, so the engine still decides when the unknown facts can't change the outcome.
- **The points test matches Schedule 6D.** It was checked item by item (6D11–6D131) against the imported Regulations text; see `engine.test.ts`.
- **The AI explains.** The agent must call `assess_visas` for eligibility and `search_law` for every requirement it states, and cite `[n]`. The chat shows its steps, the sources it used and inline decision cards.
- **Rules carry a review status.** Visa rules ship as `reviewStatus: "draft"` until a person has checked each criterion against its cited source. That review is what turns "computed" into "correct"; it can't be automated.

## Privacy model

- Row-level security on every user table; documents live in a private bucket under `<user_id>/…`.
- The app and the agent use the signed-in user's session only. The service-role key is used only by the crawler, which touches only the public law tables.
- The agent's tools are read-only (`src/lib/ai/tools.ts`). Facts and assessments are saved only by the user, in the UI.
- Pick an LLM plan that doesn't train on or retain API inputs: many free tiers do.

## Setup

1. **Supabase**: create a project in the Sydney region (`ap-southeast-2`) and run `supabase/migrations/*.sql` (SQL editor or `supabase db push`).
2. **Email codes instead of links**: in Authentication → Emails, paste `supabase/templates/confirmation.html` into *Confirm signup* and `recovery.html` into *Reset password*. Both use `{{ .Token }}`. Keep *Confirm email* on, and set your own SMTP for production.
3. **Environment**: copy `.env.example` to `.env.local` and fill it in. Add the same variables in Vercel.
4. **Run**: `pnpm install && pnpm dev`, then `pnpm test` (engine), `pnpm lint` and `pnpm build`.
5. **Crawler**:
   ```bash
   cd worker
   python -m venv .venv && . .venv/bin/activate
   pip install -r requirements.txt && python -m playwright install chromium
   export DATABASE_URL="postgresql://…"      # Supabase → Connect → Session pooler
   python crawler.py --source legislation     # Act + Regulations via the official API (~2 min)
   python crawler.py --source homeaffairs     # all visa pages, every tab and accordion
   python crawler.py --dry-run --url https://immi.homeaffairs.gov.au/visas/...   # inspect one page
   ```
   `.github/workflows/crawl.yml` runs it daily. Add `DATABASE_URL` (and the optional `EMBEDDING_*`) as repository secrets.

## Crawler notes

- Home Affairs renders every collapsed accordion and tab into the page but hides it with a print-only class. The crawler unhides them and labels each tab with a heading, so sections get full paths like `Skilled Independent visa › Eligibility › Be this age`.
- legislation.gov.au blocks headless browsers, so the Act and Regulations come from its public OData API (`api.prod.legislation.gov.au`) as the official Word compilations. Their paragraph styles map to Part › Division › clause, and each version is stored with its real in-force date.
- Each change creates a new version (`valid_from`/`valid_to`) plus a `law_changes` row listing the changed sections. `search_law(..., as_at)` searches the law as it stood on a given date.
- `robots.txt` is respected, with 3 concurrent pages and a 1-second pause between batches.

## Next steps

- Document extraction: OCR (e.g. Docling or Mistral OCR) → proposed facts → the user confirms → case file.
- Import occupation lists into `occupations` from the legislative instrument, and look up `occupationLists` from the ANZSCO code.
- Load `processing_times` from the Home Affairs data feed behind the processing-times page.
- Add more visa rule sets (482/186, 500, 485, partner) and get them reviewed.
- Add state nomination sources (190/491) to `worker/sources.yaml`.
