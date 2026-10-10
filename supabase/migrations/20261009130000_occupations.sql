-- Occupations and the skilled visa market: the Home Affairs skilled occupation list (every occupation, its
-- lists, visas, caveats and assessing authority), SkillSelect invitation rounds (invitations, tie-break dates,
-- the minimum points each occupation was invited at, the next round date, monthly totals and state and
-- territory nominations) and Jobs and Skills Australia labour market data (the Occupation Shortage List and
-- the ANZSCO occupation profiles).
--
-- worker/occupations.py imports the list and the rounds; the data-import edge function imports the JSA
-- spreadsheets. Both write through the token-protected worker_occupations_* functions below. Read-only for
-- everyone; the app and the chat query it through the RPCs at the end.

-- ─────────────────────────────── Occupation list ───────────────────────────────

-- The init migration created an empty placeholder "occupations" table that nothing reads. It moves out of
-- the way (to the private schema, data kept) for the full list below.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'occupations' and column_name = 'valid_from') then
    alter table public.occupations rename to occupations_init_placeholder;
    alter table public.occupations_init_placeholder set schema private;
  end if;
end $$;

-- "Accountant (General)", "accountant  (general)" and "Accountant (General)*" compare equal, and so do
-- "Registered Nurses (nec)" and "Registered Nurses nec". Footnote marks (*, +, ^) are dropped.
create or replace function private.occupation_key(p_title text) returns text
language sql immutable set search_path = '' as $$
  -- chr(8217) is a curly apostrophe; chr(160) and chr(8203) are a no-break and a zero-width space.
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p_title, '')),
    '[' || chr(8217) || ''']', '', 'g'), '\s*&\s*', ' and ', 'g'), '\(\s*nec\s*\)', 'nec', 'g'),
    '[\s' || chr(160) || chr(8203) || '*+^]+', ' ', 'g')), '');
$$;

create table public.occupations (
  -- The ANZSCO code SkillSelect and the points-tested visas use (the 2013 edition when the list gives one,
  -- otherwise the 2022 code). Six listings share a code with another listing under the other edition (e.g.
  -- "Painting Trades Worker" 2013 and "Painter" 2022, both 332211); those 2022-only listings get "-2022".
  anzsco text primary key,
  code text generated always as (left(anzsco, 6)) stored,   -- the six-digit code to show
  title text not null,
  title_key text generated always as (private.occupation_key(title)) stored,  -- for matching round tables
  anzsco_2013 text,
  anzsco_2022 text,                            -- the code for subclass 186 and 482 nominations
  -- The 2022 code (the Occupation Shortage List uses ANZSCO 2022), else the listed code.
  code_2022 text generated always as (coalesce(anzsco_2022, left(anzsco, 6))) stored,
  lists text[] not null default '{}',          -- MLTSSL, STSOL, ROL, CSOL, "RSMS ROL"
  visas text[] not null default '{}',          -- visa names exactly as the list writes them
  visa_subclasses text[] not null default '{}',-- 189, 190, 491, 482, ...
  caveats jsonb not null default '[]',         -- [{visa, title, text}]
  assessing_authorities jsonb not null default '[]',  -- [{short, name, url}]
  authorities text[] not null default '{}',    -- short names, for filtering
  anzsco_links jsonb not null default '[]',    -- [{label, url}] ABS classification pages
  source_url text,
  search tsvector,                             -- maintained by occupations_search below
  listed boolean not null default true,        -- false once the list no longer has it (kept for history)
  seen_run text,
  updated_at timestamptz not null default now()
);
create index occupations_search_idx on public.occupations using gin (search);
create index occupations_title_trgm_idx on public.occupations using gin (title extensions.gin_trgm_ops);
create index occupations_title_key_idx on public.occupations (title_key);
create index occupations_lists_idx on public.occupations using gin (lists);
create index occupations_visas_idx on public.occupations using gin (visa_subclasses);
create index occupations_authorities_idx on public.occupations using gin (authorities);
create index occupations_code_idx on public.occupations (code);
create index occupations_2022_idx on public.occupations (code_2022);

create or replace function private.occupations_search() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.search :=
    setweight(to_tsvector('english'::regconfig, coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, concat_ws(' ', new.anzsco_2013, new.anzsco_2022)), 'A') ||
    setweight(to_tsvector('simple'::regconfig, array_to_string(new.lists, ' ') || ' ' || array_to_string(new.authorities, ' ')), 'C') ||
    setweight(to_tsvector('english'::regconfig, coalesce((
      select string_agg(a ->> 'name', ' ') from jsonb_array_elements(new.assessing_authorities) a), '')), 'D');
  return new;
end $$;
create trigger occupations_search before insert or update on public.occupations
  for each row execute function private.occupations_search();

-- ─────────────────────────────── Jobs and Skills Australia ───────────────────────────────

-- Occupation Shortage List ratings, exactly as JSA writes them (e.g. "Shortage", "No Shortage",
-- "Regional Shortage", "Metropolitan Shortage").
create table public.occupation_shortage (
  anzsco text not null,
  year int not null,
  title text,
  national text,
  nsw text,
  vic text,
  qld text,
  sa text,
  wa text,
  tas text,
  nt text,
  act text,
  data jsonb not null default '{}',            -- any other column the spreadsheet has
  source_url text,
  listed boolean not null default true,        -- false once a re-release of that year drops it
  seen_run text,
  updated_at timestamptz not null default now(),
  primary key (anzsco, year)
);
create index occupation_shortage_year_idx on public.occupation_shortage (year, national);

-- JSA ANZSCO occupation profiles (ANZSCO 2013 codes): six-digit occupations and four-digit unit groups
-- (JSA publishes earnings and growth for unit groups only). Columns the release does not have stay null.
create table public.occupation_profiles (
  anzsco text primary key,                     -- six-digit occupation or four-digit unit group
  title text,
  employed int,
  median_weekly_earnings numeric,              -- AUD, as JSA reports it
  part_time_share numeric,                     -- percent
  female_share numeric,                        -- percent
  median_age numeric,
  annual_growth numeric,                       -- change in people employed over the year to the release
  growth_5yr numeric,                          -- not in the February 2026 release
  projected_growth numeric,                    -- not in the February 2026 release
  data jsonb not null default '{}',            -- description, tasks, industries, states, age, education, hours
  as_at date,
  source_url text,
  listed boolean not null default true,        -- false once a newer release drops it
  seen_run text,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────── SkillSelect ───────────────────────────────

create table public.skillselect_rounds (
  round_date date not null,
  subclass text not null,                      -- 189, 491 (Family Sponsored), 489 (older rounds), ...
  subclass_name text,
  invited int,
  min_points int,                              -- the round's published minimum score (older rounds' cut-off table)
  tie_break text,                              -- as published (dd/mm/yyyy, or the latest date of effect month)
  program_year text,                           -- 2025-26
  source_url text,
  seen_run text,
  updated_at timestamptz not null default now(),
  primary key (round_date, subclass)
);
create index skillselect_rounds_year_idx on public.skillselect_rounds (program_year, round_date desc);

create table public.skillselect_round_occupations (
  round_date date not null,
  subclass text not null,
  occupation text not null,                    -- as published
  anzsco text,                                 -- matched to occupations (null when no listing matches)
  min_points int,
  invited int,
  listed boolean not null default true,        -- false if a re-read of the round no longer lists it
  seen_run text,
  primary key (round_date, subclass, occupation),
  foreign key (round_date, subclass) references public.skillselect_rounds (round_date, subclass) on delete cascade
);
create index skillselect_round_occupations_anzsco_idx
  on public.skillselect_round_occupations (anzsco, subclass, round_date desc) include (min_points) where listed;

create table public.skillselect_meta (
  key text primary key,                        -- next_round_189, monthly_totals_2025-26, ...
  value text,
  updated_at timestamptz not null default now()
);

create table public.state_nominations (
  program_year text not null,
  as_of text,                                  -- the period the page gives, e.g. "1 July 2026 to 31 August 2026"
  subclass text not null,
  state text not null,                         -- ACT, NSW, NT, QLD, SA, TAS, VIC, WA
  nominations text,                            -- as published; "<5" stays as text
  nominations_n int generated always as (case when nominations ~ '^[0-9]+$' then nominations::int end) stored,
  seen_run text,
  updated_at timestamptz not null default now(),
  primary key (program_year, subclass, state)
);

create table public.data_import_runs (
  source text not null,                        -- sol | skillselect | jsa
  run text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts jsonb not null default '{}',
  ok boolean,
  error text,
  primary key (source, run)
);
create index data_import_runs_finished_idx on public.data_import_runs (source, finished_at desc);

alter table public.occupations enable row level security;
alter table public.occupation_shortage enable row level security;
alter table public.occupation_profiles enable row level security;
alter table public.skillselect_rounds enable row level security;
alter table public.skillselect_round_occupations enable row level security;
alter table public.skillselect_meta enable row level security;
alter table public.state_nominations enable row level security;
alter table public.data_import_runs enable row level security;
create policy "public read" on public.occupations for select to anon, authenticated using (true);
create policy "public read" on public.occupation_shortage for select to anon, authenticated using (true);
create policy "public read" on public.occupation_profiles for select to anon, authenticated using (true);
create policy "public read" on public.skillselect_rounds for select to anon, authenticated using (true);
create policy "public read" on public.skillselect_round_occupations for select to anon, authenticated using (true);
create policy "public read" on public.skillselect_meta for select to anon, authenticated using (true);
create policy "public read" on public.state_nominations for select to anon, authenticated using (true);
create policy "public read" on public.data_import_runs for select to anon, authenticated using (true);

-- ─────────────────────────────── Worker API ───────────────────────────────

-- For services that hold the worker token (the data-import edge function): is this token valid?
create or replace function public.worker_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_token is not null and exists (
    select 1 from private.worker_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex'));
$$;

-- The latest crawled markdown of a law corpus page (the SkillSelect pages are parsed from it).
create or replace function public.worker_law_markdown(p_token text, p_url text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  return (
    select jsonb_build_object('url', d.url, 'title', d.title, 'fetched_at', v.fetched_at, 'markdown', v.markdown)
    from public.law_documents d
    join public.law_document_versions v on v.document_id = d.id
    where d.url = p_url
    order by v.fetched_at desc
    limit 1);
end $$;

-- The listing a published occupation name refers to (the one SkillSelect uses, i.e. with a 2013 code, when
-- two share a name): the same name; then the "nec" forms ("Psychologist (nec)" is "Psychologists nec"); then
-- a six-digit code in the text; then a name cut short on the page ("Patho") that starts exactly one
-- listing's name and is at least five letters long.
create or replace function private.match_occupation(p_title text) returns text
language plpgsql stable set search_path = '' as $$
declare
  k text := private.occupation_key(p_title);
  base text;
  hit text;
begin
  if k is null then return null; end if;
  select o.anzsco into hit from public.occupations o
  where o.title_key = k
  order by (o.anzsco_2013 is null), not o.listed, o.anzsco limit 1;
  if hit is not null then return hit; end if;

  base := regexp_replace(k, '\s+nec$', '');
  select o.anzsco into hit from public.occupations o
  where o.title_key in (base, base || ' nec', base || 's nec', regexp_replace(base, 's$', '') || ' nec')
  order by (o.anzsco_2013 is null), not o.listed, o.anzsco limit 1;
  if hit is not null then return hit; end if;

  if k ~ '(^|\D)\d{6}(\D|$)' then
    select o.anzsco into hit from public.occupations o
    where o.code = substring(k from '(?:^|\D)(\d{6})(?:\D|$)')
    order by (o.anzsco_2013 is null), not o.listed, o.anzsco limit 1;
    if hit is not null then return hit; end if;
  end if;

  if length(k) >= 5 and k !~ '\(' then
    select min(o.anzsco) into hit from public.occupations o
    where left(o.title_key, length(k)) = k and o.anzsco_2013 is not null and o.listed
    having count(*) = 1;
  end if;
  return hit;
end $$;

-- Upsert one batch. p_kind: occupations | rounds | round_occupations | meta | state_nominations
-- (sol and skillselect, from worker/occupations.py) | shortage | profiles (jsa, from the data-import
-- function). Returns the number of rows written.
create or replace function public.worker_occupations_upsert(p_token text, p_kind text, p_rows jsonb, p_run text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
  v_source text := case
    when p_kind = 'occupations' then 'sol'
    when p_kind in ('rounds', 'round_occupations', 'meta', 'state_nominations') then 'skillselect'
    when p_kind in ('shortage', 'profiles') then 'jsa' end;
begin
  perform private.check_worker(p_token);
  if p_run is null or p_run = '' then raise exception 'run required'; end if;
  if v_source is null then raise exception 'unknown kind %', p_kind; end if;
  insert into public.data_import_runs (source, run) values (v_source, p_run) on conflict do nothing;

  if p_kind = 'occupations' then
    insert into public.occupations as t (anzsco, title, anzsco_2013, anzsco_2022, lists, visas, visa_subclasses, caveats,
      assessing_authorities, authorities, anzsco_links, source_url, seen_run)
    select distinct on (r.anzsco) r.anzsco, r.title, r.anzsco_2013, r.anzsco_2022, coalesce(r.lists, '{}'),
           coalesce(r.visas, '{}'), coalesce(r.visa_subclasses, '{}'), coalesce(r.caveats, '[]'),
           coalesce(r.assessing_authorities, '[]'), coalesce(r.authorities, '{}'), coalesce(r.anzsco_links, '[]'),
           r.source_url, p_run
    from jsonb_to_recordset(p_rows) as r(anzsco text, title text, anzsco_2013 text, anzsco_2022 text, lists text[],
      visas text[], visa_subclasses text[], caveats jsonb, assessing_authorities jsonb, authorities text[],
      anzsco_links jsonb, source_url text)
    where r.anzsco ~ '^\d{6}(-2022)?$' and r.title is not null
    order by r.anzsco
    on conflict (anzsco) do update set
      title = excluded.title, anzsco_2013 = excluded.anzsco_2013, anzsco_2022 = excluded.anzsco_2022,
      lists = excluded.lists, visas = excluded.visas, visa_subclasses = excluded.visa_subclasses,
      caveats = excluded.caveats, assessing_authorities = excluded.assessing_authorities,
      authorities = excluded.authorities, anzsco_links = excluded.anzsco_links, source_url = excluded.source_url,
      listed = true, seen_run = excluded.seen_run,
      updated_at = case when (t.title, t.anzsco_2013, t.anzsco_2022, t.lists, t.visas, t.caveats, t.assessing_authorities,
                              t.listed)
                        is distinct from (excluded.title, excluded.anzsco_2013, excluded.anzsco_2022, excluded.lists,
                                          excluded.visas, excluded.caveats, excluded.assessing_authorities, true)
                        then now() else t.updated_at end;

  elsif p_kind = 'rounds' then
    insert into public.skillselect_rounds as t (round_date, subclass, subclass_name, invited, min_points, tie_break,
      program_year, source_url, seen_run)
    select distinct on (r.round_date, r.subclass) r.round_date, r.subclass, r.subclass_name, r.invited, r.min_points,
           r.tie_break, r.program_year, r.source_url, p_run
    from jsonb_to_recordset(p_rows) as r(round_date date, subclass text, subclass_name text, invited int, min_points int,
      tie_break text, program_year text, source_url text)
    where r.round_date is not null and r.subclass is not null
    order by r.round_date, r.subclass
    on conflict (round_date, subclass) do update set
      subclass_name = coalesce(excluded.subclass_name, t.subclass_name), invited = coalesce(excluded.invited, t.invited),
      min_points = coalesce(excluded.min_points, t.min_points), tie_break = coalesce(excluded.tie_break, t.tie_break),
      program_year = coalesce(excluded.program_year, t.program_year),
      source_url = coalesce(excluded.source_url, t.source_url), seen_run = excluded.seen_run,
      updated_at = case when (t.invited, t.min_points, t.tie_break, t.program_year) is distinct from
                             (coalesce(excluded.invited, t.invited), coalesce(excluded.min_points, t.min_points),
                              coalesce(excluded.tie_break, t.tie_break), coalesce(excluded.program_year, t.program_year))
                        then now() else t.updated_at end;

  elsif p_kind = 'round_occupations' then
    insert into public.skillselect_round_occupations as t (round_date, subclass, occupation, anzsco, min_points, invited, seen_run)
    select distinct on (r.round_date, r.subclass, r.occupation) r.round_date, r.subclass, r.occupation,
           coalesce(r.anzsco, private.match_occupation(r.occupation)), r.min_points, r.invited, p_run
    from jsonb_to_recordset(p_rows) as r(round_date date, subclass text, occupation text, anzsco text, min_points int,
      invited int)
    where r.occupation is not null and exists (
      select 1 from public.skillselect_rounds s where s.round_date = r.round_date and s.subclass = r.subclass)
    order by r.round_date, r.subclass, r.occupation
    on conflict (round_date, subclass, occupation) do update set
      anzsco = excluded.anzsco, min_points = excluded.min_points, invited = excluded.invited, listed = true,
      seen_run = excluded.seen_run;

  elsif p_kind = 'meta' then
    insert into public.skillselect_meta as t (key, value)
    select distinct on (r.key) r.key, r.value
    from jsonb_to_recordset(p_rows) as r(key text, value text)
    where r.key is not null
    order by r.key
    on conflict (key) do update set value = excluded.value,
      updated_at = case when t.value is distinct from excluded.value then now() else t.updated_at end;

  elsif p_kind = 'state_nominations' then
    insert into public.state_nominations as t (program_year, as_of, subclass, state, nominations, seen_run)
    select distinct on (r.program_year, r.subclass, r.state) r.program_year, r.as_of, r.subclass, r.state, r.nominations, p_run
    from jsonb_to_recordset(p_rows) as r(program_year text, as_of text, subclass text, state text, nominations text)
    where r.program_year is not null and r.subclass is not null and r.state is not null
    order by r.program_year, r.subclass, r.state
    on conflict (program_year, subclass, state) do update set
      as_of = excluded.as_of, nominations = excluded.nominations, seen_run = excluded.seen_run,
      updated_at = case when (t.as_of, t.nominations) is distinct from (excluded.as_of, excluded.nominations)
                        then now() else t.updated_at end;

  elsif p_kind = 'shortage' then
    insert into public.occupation_shortage as t (anzsco, year, title, national, nsw, vic, qld, sa, wa, tas, nt, act, data,
      source_url, seen_run)
    select distinct on (r.anzsco, r.year) r.anzsco, r.year, r.title, r.national, r.nsw, r.vic, r.qld, r.sa, r.wa, r.tas,
           r.nt, r.act, coalesce(r.data, '{}'), r.source_url, p_run
    from jsonb_to_recordset(p_rows) as r(anzsco text, year int, title text, national text, nsw text, vic text, qld text,
      sa text, wa text, tas text, nt text, act text, data jsonb, source_url text)
    where r.anzsco ~ '^\d{6}$' and r.year is not null
    order by r.anzsco, r.year
    on conflict (anzsco, year) do update set
      title = excluded.title, national = excluded.national, nsw = excluded.nsw, vic = excluded.vic, qld = excluded.qld,
      sa = excluded.sa, wa = excluded.wa, tas = excluded.tas, nt = excluded.nt, act = excluded.act, data = excluded.data,
      source_url = excluded.source_url, listed = true, seen_run = excluded.seen_run,
      updated_at = case when (t.national, t.nsw, t.vic, t.qld, t.sa, t.wa, t.tas, t.nt, t.act, t.data) is distinct from
                             (excluded.national, excluded.nsw, excluded.vic, excluded.qld, excluded.sa, excluded.wa,
                              excluded.tas, excluded.nt, excluded.act, excluded.data)
                        then now() else t.updated_at end;

  elsif p_kind = 'profiles' then
    insert into public.occupation_profiles as t (anzsco, title, employed, median_weekly_earnings, part_time_share,
      female_share, median_age, annual_growth, growth_5yr, projected_growth, data, as_at, source_url, seen_run)
    select distinct on (r.anzsco) r.anzsco, r.title, r.employed, r.median_weekly_earnings, r.part_time_share,
           r.female_share, r.median_age, r.annual_growth, r.growth_5yr, r.projected_growth, coalesce(r.data, '{}'),
           r.as_at, r.source_url, p_run
    from jsonb_to_recordset(p_rows) as r(anzsco text, title text, employed int, median_weekly_earnings numeric,
      part_time_share numeric, female_share numeric, median_age numeric, annual_growth numeric, growth_5yr numeric,
      projected_growth numeric, data jsonb, as_at date, source_url text)
    where r.anzsco ~ '^\d{4}(\d{2})?$'
    order by r.anzsco
    on conflict (anzsco) do update set
      title = excluded.title, employed = excluded.employed, median_weekly_earnings = excluded.median_weekly_earnings,
      part_time_share = excluded.part_time_share, female_share = excluded.female_share, median_age = excluded.median_age,
      annual_growth = excluded.annual_growth, growth_5yr = excluded.growth_5yr,
      projected_growth = excluded.projected_growth, data = excluded.data,
      as_at = excluded.as_at, source_url = excluded.source_url, listed = true, seen_run = excluded.seen_run,
      updated_at = case when (t.employed, t.median_weekly_earnings, t.part_time_share, t.female_share, t.median_age,
                              t.annual_growth, t.growth_5yr, t.projected_growth, t.data, t.as_at) is distinct from
                             (excluded.employed, excluded.median_weekly_earnings, excluded.part_time_share,
                              excluded.female_share, excluded.median_age, excluded.annual_growth, excluded.growth_5yr,
                              excluded.projected_growth, excluded.data, excluded.as_at)
                        then now() else t.updated_at end;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- Close a run of one source (sol | skillselect | jsa) and record it. With p_error the run is recorded as
-- failed and nothing changes. Otherwise rows the source no longer has are marked listed = false (never
-- deleted, so the history stays): listings missing from the occupation list (refused when the run saw under
-- half of those listed: an interrupted import), occupation rows of a re-read round that the page no longer
-- shows, and JSA rows of a re-read year or profile release. Rounds that drop off the page stay as they are.
create or replace function public.worker_occupations_finish(
  p_token text, p_kind text, p_run text, p_error text default null, p_counts jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  seen int; held int; removed int := 0; v_counts jsonb := coalesce(p_counts, '{}');
begin
  perform private.check_worker(p_token);
  if p_kind not in ('sol', 'skillselect', 'jsa') then raise exception 'unknown source %', p_kind; end if;
  insert into public.data_import_runs (source, run) values (p_kind, p_run) on conflict do nothing;

  if p_error is not null then
    update public.data_import_runs set finished_at = now(), ok = false, error = left(p_error, 2000),
      counts = counts || v_counts
    where source = p_kind and run = p_run;
    return jsonb_build_object('ok', false, 'error', left(p_error, 2000));
  end if;

  if p_kind = 'sol' then
    select count(*) into seen from public.occupations where seen_run = p_run;
    select count(*) into held from public.occupations where listed;
    if seen = 0 or seen < held / 2 then
      raise exception 'occupation list import % looks incomplete: % seen, % listed', p_run, seen, held;
    end if;
    update public.occupations set listed = false, updated_at = now() where seen_run is distinct from p_run and listed;
    get diagnostics removed = row_count;
    -- Names in rounds read before this list was (re)loaded.
    update public.skillselect_round_occupations r set anzsco = private.match_occupation(r.occupation)
    where r.anzsco is null or not exists (select 1 from public.occupations o where o.anzsco = r.anzsco and o.listed);
    v_counts := v_counts || jsonb_build_object(
      'occupations', seen, 'unlisted', removed,
      'lists', (select jsonb_object_agg(l, n) from (
        select l, count(*) n from public.occupations, unnest(lists) l where listed group by l) x));

  elsif p_kind = 'skillselect' then
    update public.skillselect_round_occupations r set listed = false
    where r.listed and r.seen_run is distinct from p_run
      and exists (select 1 from public.skillselect_rounds s
                  where s.round_date = r.round_date and s.subclass = r.subclass and s.seen_run = p_run)
      and exists (select 1 from public.skillselect_round_occupations x
                  where x.round_date = r.round_date and x.subclass = r.subclass and x.seen_run = p_run);
    get diagnostics removed = row_count;
    v_counts := v_counts || jsonb_build_object(
      'rounds', (select count(*) from public.skillselect_rounds),
      'rounds_seen', (select count(*) from public.skillselect_rounds where seen_run = p_run),
      'round_occupations', (select count(*) from public.skillselect_round_occupations where listed),
      'round_occupations_unmatched', (select count(*) from public.skillselect_round_occupations
                                      where listed and anzsco is null),
      'program_years', (select count(distinct program_year) from public.skillselect_rounds),
      'state_nominations', (select count(*) from public.state_nominations),
      'unlisted_round_occupations', removed);

  else
    update public.occupation_shortage s set listed = false, updated_at = now()
    where s.listed and s.seen_run is distinct from p_run
      and s.year in (select year from public.occupation_shortage where seen_run = p_run);
    get diagnostics removed = row_count;
    if exists (select 1 from public.occupation_profiles where seen_run = p_run) then
      with d as (update public.occupation_profiles set listed = false, updated_at = now()
                 where listed and seen_run is distinct from p_run returning 1)
      select removed + count(*) into removed from d;
    end if;
    v_counts := v_counts || jsonb_build_object(
      'shortage', (select count(*) from public.occupation_shortage where seen_run = p_run),
      'profiles', (select count(*) from public.occupation_profiles where seen_run = p_run),
      'unlisted', removed);
  end if;

  update public.data_import_runs set finished_at = now(), ok = true, error = null, counts = counts || v_counts
  where source = p_kind and run = p_run;
  return v_counts;
end $$;

-- The last successful run of a source (or null), so importers can tell when the data is stale.
create or replace function public.worker_occupations_last_run(p_token text, p_kind text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  return (select to_jsonb(r) from public.data_import_runs r
          where r.source = p_kind and r.ok and r.finished_at is not null
          order by r.finished_at desc limit 1);
end $$;

-- ───────────────────────────── Worker permissions ─────────────────────────────

revoke execute on function private.occupations_search(), private.occupation_key(text), private.match_occupation(text)
  from public, anon, authenticated;
revoke execute on function
  public.worker_token_ok(text), public.worker_law_markdown(text, text),
  public.worker_occupations_upsert(text, text, jsonb, text),
  public.worker_occupations_finish(text, text, text, text, jsonb), public.worker_occupations_last_run(text, text)
  from public;
grant execute on function
  public.worker_token_ok(text), public.worker_law_markdown(text, text),
  public.worker_occupations_upsert(text, text, jsonb, text),
  public.worker_occupations_finish(text, text, text, text, jsonb), public.worker_occupations_last_run(text, text)
  to anon, authenticated;
