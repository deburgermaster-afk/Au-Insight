-- Structured intake gathered by the chat (arrival, study, visa, work, partner, goals), next to
-- the free-text story. Shape: see supabase/functions/chat/profile.ts.
alter table public.cases add column if not exists profile jsonb not null default '{}';

-- A solution the analyst team produced for the user: shown as a "Case" in the app.
create table public.solutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete set null,
  title text not null,
  question text not null default '',
  summary text not null default '',             -- markdown, with [n] citations
  pathways jsonb not null default '[]',         -- [{name, fit, needs}]
  steps jsonb not null default '[]',            -- [{title, detail, due, done}]
  reports jsonb not null default '[]',          -- [{analyst, report}]
  sources jsonb not null default '[]',          -- [{n, title, section, url}]
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.solutions enable row level security;
create policy "own solutions" on public.solutions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index solutions_user_idx on public.solutions (user_id, created_at desc);
