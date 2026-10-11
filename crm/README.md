# Lodgely

A CRM for Australian migration agencies: clients, matters with visa document checklists, a
mailbox, tasks, calendar, invoicing with a separate client trust ledger, employers, a visa
library, reports, team roles and an audit log.

## Stack

- Next.js 16 (App Router, Cache Components, Partial Prefetching), React 19
- shadcn/ui on Tailwind v4, motion for animation, recharts
- Better Auth (email + password, organisations = agencies, roles)
- Drizzle ORM on Postgres (Neon, Sydney region) over the serverless HTTP driver
- Resend for outgoing mail (optional)

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Random 32+ byte secret for sessions |
| `BETTER_AUTH_URL` | Public URL (optional; defaults to the request origin) |
| `RESEND_API_KEY`, `MAIL_FROM_DOMAIN` | Turn on real email sending |

Locally these live in `.env.local` (git-ignored).

## Develop

```sh
npm install
npx tsx --env-file=.env.local scripts/migrate.mts   # apply drizzle/ migrations
npm run dev
```

Sign up at `/sign-up` and tick "Load demo data" to get a sample agency with clients, matters,
invoices and mail.

## How data stays fast and isolated

Every table has `agency_id`. Reads in `src/lib/data.ts` resolve the agency from the session and
are cached with `"use cache"` under the tag `agency:<id>`; every server action in
`src/lib/actions.ts` checks the caller's role and calls `updateTag` on that tag, so pages update
immediately after a change.

## Deploy

Vercel project `lodgely` builds this folder (`rootDirectory: crm`) on every push that touches it.
