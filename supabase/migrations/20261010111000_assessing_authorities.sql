-- Skills assessment facts for the assessing authorities on the skilled occupation list: what each one
-- assesses for migration, its standard processing time, any priority or fast-track option, the fee for a
-- standard migration skills assessment, how long an outcome stays valid, other requirements and links, as
-- each authority publishes them on its own website.
--
-- worker/authorities.py loads worker/data/assessing_authorities.json (the researched facts, each with its
-- source pages and as_at date) through worker_authorities_upsert below. A figure an authority doesn't
-- publish stays null and its text column says so. Read-only for everyone; the app and the chat read one
-- authority through get_assessing_authority.

-- "ACS (Data Scientist only)", "TRA (trades)" and "VETASSESS (non-trades)" on the occupation list are the
-- ACS, TRA and VETASSESS rows; "CPA Australia Ltd" and "CPA Australia" compare equal.
create or replace function private.authority_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  -- chr(8217) is a curly apostrophe.
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p_name, '')),
    '\s*\([^)]*\)\s*$', ''), '\s*&\s*', ' and ', 'g'),
    '[.,' || chr(8217) || ''']|\m(limited|ltd|incorporated|inc)\M', '', 'g'), '\s+', ' ', 'g')), '');
$$;

create table public.assessing_authorities (
  short text primary key,                      -- as the occupation list writes it (assessing_authorities ->> 'short')
  name text not null,
  url text,                                    -- the authority's website
  aliases text[] not null default '{}',        -- other names people use ("Engineers Australia", "EA")
  assesses text,                               -- what it assesses for migration: qualifications, employment, tests
  processing_text text,                        -- the standard processing time as published
  -- Business days, when the authority states a time. Weeks count as five business days; months and
  -- times to allocation (rather than to an outcome) are left in the text only.
  processing_min_days int,
  processing_max_days int,
  priority_text text,                          -- priority or fast-track option and its fee, or that there is none
  fee_text text,                               -- the fees for a migration skills assessment as published
  fee_aud numeric,                             -- the standard migration skills assessment fee (incl. GST where both are given)
  validity_text text,
  validity_years numeric,                      -- how long a suitable outcome stays valid, when the authority says
  requirements text,                           -- English, registration and other conditions
  links jsonb not null default '[]',           -- [{label, url}]: assessment overview, fees, processing times
  source_urls text[] not null default '{}',    -- the pages the facts were taken from
  occupations int,                             -- listed occupations it assesses, counted at each import
  as_at date,                                  -- when the source pages were read
  seen_run text,
  updated_at timestamptz not null default now()
);

alter table public.assessing_authorities enable row level security;
create policy "public read" on public.assessing_authorities for select to anon, authenticated using (true);

-- How many listed occupations name this authority.
create or replace function private.authority_occupations(p_short text) returns int
language sql stable set search_path = '' as $$
  select count(*)::int from public.occupations o
  where o.listed and exists (
    select 1 from jsonb_array_elements(o.assessing_authorities) a
    where private.authority_key(a ->> 'short') = private.authority_key(p_short))
$$;

-- ─────────────────────────────── Worker API ───────────────────────────────

-- Upsert one batch of authorities (the JSON file is the source of truth, so every column is replaced).
-- Returns the number of rows written.
create or replace function public.worker_authorities_upsert(p_token text, p_rows jsonb, p_run text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform private.check_worker(p_token);
  if p_run is null or p_run = '' then raise exception 'run required'; end if;
  insert into public.data_import_runs (source, run) values ('authorities', p_run) on conflict do nothing;

  insert into public.assessing_authorities as t (short, name, url, aliases, assesses, processing_text,
    processing_min_days, processing_max_days, priority_text, fee_text, fee_aud, validity_text, validity_years,
    requirements, links, source_urls, occupations, as_at, seen_run)
  select distinct on (r.short) btrim(r.short), r.name, r.url, coalesce(r.aliases, '{}'), r.assesses, r.processing_text,
         r.processing_min_days, r.processing_max_days, r.priority_text, r.fee_text, r.fee_aud, r.validity_text,
         r.validity_years, r.requirements, coalesce(r.links, '[]'), coalesce(r.source_urls, '{}'),
         private.authority_occupations(r.short), r.as_at, p_run
  from jsonb_to_recordset(p_rows) as r(short text, name text, url text, aliases text[], assesses text,
    processing_text text, processing_min_days int, processing_max_days int, priority_text text, fee_text text,
    fee_aud numeric, validity_text text, validity_years numeric, requirements text, links jsonb, source_urls text[],
    as_at date)
  where nullif(btrim(r.short), '') is not null and r.name is not null
  order by r.short
  on conflict (short) do update set
    name = excluded.name, url = excluded.url, aliases = excluded.aliases, assesses = excluded.assesses,
    processing_text = excluded.processing_text, processing_min_days = excluded.processing_min_days,
    processing_max_days = excluded.processing_max_days, priority_text = excluded.priority_text,
    fee_text = excluded.fee_text, fee_aud = excluded.fee_aud, validity_text = excluded.validity_text,
    validity_years = excluded.validity_years, requirements = excluded.requirements, links = excluded.links,
    source_urls = excluded.source_urls, occupations = excluded.occupations, as_at = excluded.as_at,
    seen_run = excluded.seen_run,
    updated_at = case when (t.name, t.url, t.aliases, t.assesses, t.processing_text, t.processing_min_days,
                            t.processing_max_days, t.priority_text, t.fee_text, t.fee_aud, t.validity_text,
                            t.validity_years, t.requirements, t.links, t.source_urls, t.occupations, t.as_at)
                      is distinct from
                           (excluded.name, excluded.url, excluded.aliases, excluded.assesses, excluded.processing_text,
                            excluded.processing_min_days, excluded.processing_max_days, excluded.priority_text,
                            excluded.fee_text, excluded.fee_aud, excluded.validity_text, excluded.validity_years,
                            excluded.requirements, excluded.links, excluded.source_urls, excluded.occupations,
                            excluded.as_at)
                      then now() else t.updated_at end;
  get diagnostics n = row_count;
  return n;
end $$;

-- Close an import run. With p_error the run is recorded as failed. Otherwise every row's occupation count
-- is refreshed (the list may have changed since its row was written) and the run records what is missing:
-- authorities the list names that have no row, and rows this run didn't write.
create or replace function public.worker_authorities_finish(
  p_token text, p_run text, p_error text default null, p_counts jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_counts jsonb := coalesce(p_counts, '{}');
begin
  perform private.check_worker(p_token);
  insert into public.data_import_runs (source, run) values ('authorities', p_run) on conflict do nothing;

  if p_error is not null then
    update public.data_import_runs set finished_at = now(), ok = false, error = left(p_error, 2000),
      counts = counts || v_counts
    where source = 'authorities' and run = p_run;
    return jsonb_build_object('ok', false, 'error', left(p_error, 2000));
  end if;

  update public.assessing_authorities t set occupations = private.authority_occupations(t.short), updated_at = now()
  where t.occupations is distinct from private.authority_occupations(t.short);

  v_counts := v_counts || jsonb_build_object(
    'authorities', (select count(*) from public.assessing_authorities),
    'written', (select count(*) from public.assessing_authorities where seen_run = p_run),
    'with_fee', (select count(*) from public.assessing_authorities where fee_aud is not null),
    'with_processing_days', (select count(*) from public.assessing_authorities where processing_max_days is not null),
    'with_validity', (select count(*) from public.assessing_authorities where validity_years is not null),
    'not_written', (select coalesce(jsonb_agg(short order by short), '[]') from public.assessing_authorities
                    where seen_run is distinct from p_run),
    'missing', (select coalesce(jsonb_agg(distinct a ->> 'short'), '[]')
                from public.occupations o, jsonb_array_elements(o.assessing_authorities) a
                where o.listed and not exists (
                  select 1 from public.assessing_authorities t
                  where private.authority_key(t.short) = private.authority_key(a ->> 'short'))));

  update public.data_import_runs set finished_at = now(), ok = true, error = null, counts = counts || v_counts
  where source = 'authorities' and run = p_run;
  return v_counts;
end $$;

-- ─────────────────────────────── Read ───────────────────────────────

-- One authority by its short name ("ACS", "TRA (trades)"), full name ("CPA Australia Ltd") or an alias
-- ("Engineers Australia"), else the one authority whose name contains the text. Null when nothing (or more
-- than one authority) matches.
create or replace function public.get_assessing_authority(p_short text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (select btrim(p_short) as q, private.authority_key(p_short) as k),
  hit as (
    select a.*, 1 as rank from public.assessing_authorities a, q
    where lower(a.short) = lower(q.q) or lower(a.name) = lower(q.q)
       or lower(q.q) in (select lower(x) from unnest(a.aliases) x)
    union all
    select a.*, 2 from public.assessing_authorities a, q
    where q.k = private.authority_key(a.short) or q.k = private.authority_key(a.name)
       or q.k in (select private.authority_key(x) from unnest(a.aliases) x)
    union all
    select a.*, 3 from public.assessing_authorities a, q
    where length(q.k) >= 4 and (private.authority_key(a.name) like '%' || q.k || '%'
                                or exists (select 1 from unnest(a.aliases) x where private.authority_key(x) like '%' || q.k || '%'))
      and (select count(*) from public.assessing_authorities b
           where private.authority_key(b.name) like '%' || q.k || '%'
              or exists (select 1 from unnest(b.aliases) x where private.authority_key(x) like '%' || q.k || '%')) = 1
  )
  select to_jsonb(h) - 'seen_run' - 'rank' from hit h
  where nullif(btrim(p_short), '') is not null
  order by h.rank, h.short
  limit 1
$$;

revoke execute on function private.authority_key(text), private.authority_occupations(text)
  from public, anon, authenticated;
revoke execute on function
  public.worker_authorities_upsert(text, jsonb, text), public.worker_authorities_finish(text, text, text, jsonb),
  public.get_assessing_authority(text)
  from public;
grant execute on function
  public.worker_authorities_upsert(text, jsonb, text), public.worker_authorities_finish(text, text, text, jsonb),
  public.get_assessing_authority(text)
  to anon, authenticated;
