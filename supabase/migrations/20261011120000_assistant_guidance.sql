-- Extra instructions for the chat assistant, kept in the database so its behaviour can be tuned
-- without redeploying the function. The chat function appends the enabled rows (ordered by key)
-- to the lead agent's prompt ("lead"), the analysts' ("analysts") or both ("all").
create table if not exists public.assistant_guidance (
  key text primary key,
  applies_to text not null default 'all' check (applies_to in ('lead', 'analysts', 'all')),
  body text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.assistant_guidance enable row level security;
create policy "read guidance" on public.assistant_guidance for select to authenticated using (true);
revoke all on public.assistant_guidance from anon, authenticated;
grant select on public.assistant_guidance to authenticated;
