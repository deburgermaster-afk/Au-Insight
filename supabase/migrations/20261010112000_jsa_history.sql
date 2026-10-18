-- Jobs and Skills Australia shortage history and employment projections: each occupation's shortage rating
-- year by year (the Skills Priority List 2021 to 2023 and the Occupation Shortage List 2024, from JSA's
-- historical file, next to the 2025 list already in occupation_shortage) and JSA's employment projections,
-- so the app can show a five-year shortage trend and the outlook.
--
-- The data-import function's history.ts reads the two spreadsheets and writes through the token-protected
-- worker_jsa_history_* functions below (source "jsa_history"). Read-only for everyone; the app and the chat
-- read it through public.occupation_outlook().

-- ─────────────────────────────── Tables ───────────────────────────────

-- The date the source published the figures (history rows: the historical file's date). The 2025 rows from
-- jsa.ts leave it null until that importer writes it.
alter table public.occupation_shortage add column if not exists as_at date;

-- JSA employment projections (ANZSCO 2013 version 1.3 codes). JSA publishes them for unit groups (four
-- digits) and the groups above, not for single occupations; "occupation" rows would hold six-digit
-- projections if a release has them.
create table public.occupation_projections (
  anzsco text not null,                        -- 1 to 6 digits
  title text,
  level text,                                  -- major group | sub-major group | minor group | unit group | occupation
  nfd boolean not null default false,          -- a "not further defined" row (code ending in zero)
  skill_level text,                            -- as published: "1", "2, 3"
  classification text,                         -- e.g. "ANZSCO version 1.3"
  base_period text,                            -- "May 2025"
  base_employment numeric,                     -- persons (JSA publishes thousands)
  horizon text not null,                       -- "5 years" | "10 years"
  projected_period text,                       -- "May 2030"
  projected_employment numeric,                -- persons
  growth numeric,                              -- persons, JSA's published change
  growth_pct numeric,                          -- percent, JSA's published change
  source_url text not null,
  as_at date,                                  -- the date JSA published the projections
  listed boolean not null default true,        -- false once a newer release drops it (never deleted)
  seen_run text,
  updated_at timestamptz not null default now(),
  primary key (anzsco, horizon)
);

alter table public.occupation_projections enable row level security;
create policy "public read" on public.occupation_projections for select to anon, authenticated using (true);

-- ─────────────────────────────── Worker API ───────────────────────────────

-- Upsert one batch. p_kind: shortage_history (rows for occupation_shortage) | projections. Runs are named
-- "jsa_history-...", which is how the rows of this import are told apart from the Occupation Shortage List
-- import's (jsa.ts): a year that import has loaded (2025) is never written here, and its rows are never
-- updated or retired by this import. Returns the number of rows written.
create or replace function public.worker_jsa_history_upsert(p_token text, p_kind text, p_rows jsonb, p_run text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform private.check_worker(p_token);
  if p_run is null or p_run not like 'jsa\_history-%' then raise exception 'run must be named jsa_history-...'; end if;
  if p_kind not in ('shortage_history', 'projections') then raise exception 'unknown kind %', p_kind; end if;
  insert into public.data_import_runs (source, run) values ('jsa_history', p_run) on conflict do nothing;

  if p_kind = 'shortage_history' then
    insert into public.occupation_shortage as t (anzsco, year, title, national, nsw, vic, qld, sa, wa, tas, nt, act, data,
      source_url, as_at, seen_run)
    select distinct on (r.anzsco, r.year) r.anzsco, r.year, r.title, r.national, r.nsw, r.vic, r.qld, r.sa, r.wa, r.tas,
           r.nt, r.act, coalesce(r.data, '{}'), r.source_url, r.as_at, p_run
    from jsonb_to_recordset(p_rows) as r(anzsco text, year int, title text, national text, nsw text, vic text, qld text,
      sa text, wa text, tas text, nt text, act text, data jsonb, source_url text, as_at date)
    where r.anzsco ~ '^\d{6}$' and r.year between 2000 and 2100 and r.source_url is not null
      and not exists (select 1 from public.occupation_shortage x
                      where x.year = r.year and coalesce(x.seen_run, '') not like 'jsa\_history-%')
    order by r.anzsco, r.year
    on conflict (anzsco, year) do update set
      title = excluded.title, national = excluded.national, nsw = excluded.nsw, vic = excluded.vic, qld = excluded.qld,
      sa = excluded.sa, wa = excluded.wa, tas = excluded.tas, nt = excluded.nt, act = excluded.act, data = excluded.data,
      source_url = excluded.source_url, as_at = excluded.as_at, listed = true, seen_run = excluded.seen_run,
      updated_at = case when (t.title, t.national, t.nsw, t.vic, t.qld, t.sa, t.wa, t.tas, t.nt, t.act, t.data, t.as_at,
                              t.listed)
                        is distinct from (excluded.title, excluded.national, excluded.nsw, excluded.vic, excluded.qld,
                                          excluded.sa, excluded.wa, excluded.tas, excluded.nt, excluded.act,
                                          excluded.data, excluded.as_at, true)
                        then now() else t.updated_at end
    where t.seen_run like 'jsa\_history-%';

  else
    insert into public.occupation_projections as t (anzsco, title, level, nfd, skill_level, classification, base_period,
      base_employment, horizon, projected_period, projected_employment, growth, growth_pct, source_url, as_at, seen_run)
    select distinct on (r.anzsco, r.horizon) r.anzsco, r.title, r.level, coalesce(r.nfd, false), r.skill_level,
           r.classification, r.base_period, r.base_employment, r.horizon, r.projected_period, r.projected_employment,
           r.growth, r.growth_pct, r.source_url, r.as_at, p_run
    from jsonb_to_recordset(p_rows) as r(anzsco text, title text, level text, nfd boolean, skill_level text,
      classification text, base_period text, base_employment numeric, horizon text, projected_period text,
      projected_employment numeric, growth numeric, growth_pct numeric, source_url text, as_at date)
    where r.anzsco ~ '^\d{1,6}$' and r.horizon is not null and r.source_url is not null
    order by r.anzsco, r.horizon
    on conflict (anzsco, horizon) do update set
      title = excluded.title, level = excluded.level, nfd = excluded.nfd, skill_level = excluded.skill_level,
      classification = excluded.classification, base_period = excluded.base_period,
      base_employment = excluded.base_employment, projected_period = excluded.projected_period,
      projected_employment = excluded.projected_employment, growth = excluded.growth, growth_pct = excluded.growth_pct,
      source_url = excluded.source_url, as_at = excluded.as_at, listed = true, seen_run = excluded.seen_run,
      updated_at = case when (t.title, t.base_period, t.base_employment, t.projected_period, t.projected_employment,
                              t.growth, t.growth_pct, t.as_at, t.listed)
                        is distinct from (excluded.title, excluded.base_period, excluded.base_employment,
                                          excluded.projected_period, excluded.projected_employment, excluded.growth,
                                          excluded.growth_pct, excluded.as_at, true)
                        then now() else t.updated_at end;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- Close a run and record it. With p_error the run is recorded as failed and nothing changes. Otherwise rows
-- the source no longer has are marked listed = false (never deleted): this import's shortage rows in the
-- years the run wrote, and projections when the run wrote projections. Refused when a year or the
-- projections came in at under half of what is listed: an interrupted import.
create or replace function public.worker_jsa_history_finish(
  p_token text, p_run text, p_error text default null, p_counts jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  short_years int[]; thin text; seen int; held int; removed int := 0; v_counts jsonb := coalesce(p_counts, '{}');
begin
  perform private.check_worker(p_token);
  if p_run is null or p_run not like 'jsa\_history-%' then raise exception 'run must be named jsa_history-...'; end if;
  insert into public.data_import_runs (source, run) values ('jsa_history', p_run) on conflict do nothing;

  if p_error is not null then
    update public.data_import_runs set finished_at = now(), ok = false, error = left(p_error, 2000),
      counts = counts || v_counts
    where source = 'jsa_history' and run = p_run;
    return jsonb_build_object('ok', false, 'error', left(p_error, 2000));
  end if;

  select array_agg(distinct year) into short_years from public.occupation_shortage where seen_run = p_run;
  select string_agg(format('%s: %s seen, %s listed', y.year, y.seen, y.held), '; ') into thin
  from (select s.year, count(*) filter (where s.seen_run = p_run) seen, count(*) filter (where s.listed) held
        from public.occupation_shortage s
        where s.year = any(short_years) and s.seen_run like 'jsa\_history-%' group by s.year) y
  where y.seen < y.held / 2;
  if thin is not null then raise exception 'shortage history import % looks incomplete (%)', p_run, thin; end if;
  select count(*) filter (where seen_run = p_run), count(*) filter (where listed) into seen, held
  from public.occupation_projections;
  if seen > 0 and seen < held / 2 then
    raise exception 'projections import % looks incomplete: % seen, % listed', p_run, seen, held;
  end if;

  with d as (update public.occupation_shortage s set listed = false, updated_at = now()
             where s.listed and s.seen_run like 'jsa\_history-%' and s.seen_run <> p_run and s.year = any(short_years)
             returning 1)
  select count(*) into removed from d;
  if seen > 0 then
    with d as (update public.occupation_projections set listed = false, updated_at = now()
               where listed and seen_run is distinct from p_run returning 1)
    select removed + count(*) into removed from d;
  end if;

  v_counts := v_counts || jsonb_build_object(
    'shortage_years', coalesce((select jsonb_object_agg(year, n) from (
      select year, count(*) n from public.occupation_shortage where seen_run = p_run group by year) x), '{}'),
    'shortage', (select count(*) from public.occupation_shortage where seen_run = p_run),
    'projections', seen,
    'unlisted', removed);
  update public.data_import_runs set finished_at = now(), ok = true, error = null, counts = counts || v_counts
  where source = 'jsa_history' and run = p_run;
  return v_counts;
end $$;

-- The last successful run comes from public.worker_occupations_last_run(p_token, 'jsa_history').

revoke execute on function public.worker_jsa_history_upsert(text, text, jsonb, text),
  public.worker_jsa_history_finish(text, text, text, jsonb) from public;
grant execute on function public.worker_jsa_history_upsert(text, text, jsonb, text),
  public.worker_jsa_history_finish(text, text, text, jsonb) to anon, authenticated;

-- ─────────────────────────────── Read API ───────────────────────────────

-- 2 for "Shortage", 1 for a partial one ("Regional Shortage", "Metro Shortage"), 0 for "No Shortage", null
-- when not rated.
create or replace function private.shortage_level(p_rating text) returns int
language sql immutable set search_path = '' as $$
  select case
    when p_rating is null then null
    when p_rating ilike 'no %' then 0
    when lower(btrim(p_rating)) = 'shortage' then 2
    when p_rating ilike '%shortage%' then 1
  end
$$;

-- An occupation's shortage history and employment outlook, from Jobs and Skills Australia data only:
--   shortage     every year's national and state and territory ratings. Rows are matched on the listing's
--                ANZSCO 2013 code (the 2021 to 2024 lists in their 2013 version) and its ANZSCO 2022 code (the
--                2025 list, and the 2021 to 2024 ratings JSA gives for occupations new in ANZSCO 2022); a
--                listing that only has a 2022 code takes the 2022 version of each year.
--   projections  the six-digit projection if JSA has one, else the unit group's (first four digits), marked.
--   summary      years in shortage (any shortage rating) out of the years rated, the trend from the year
--                before the latest to the latest, and the projected growth.
-- p_anzsco: a listing key or code ("261313", "332211-2022") or any six-digit ANZSCO code.
create or replace function public.occupation_outlook(p_anzsco text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (select btrim(coalesce(p_anzsco, '')) as q),
  o as (
    select x.* from public.occupations x, q
    where x.anzsco = q.q or x.code = left(q.q, 6) or x.code_2022 = left(q.q, 6)
    order by (x.anzsco = q.q) desc, x.listed desc, length(x.anzsco)
    limit 1
  ),
  k as (
    select case when o.anzsco is null then left(q.q, 6) else o.anzsco_2013 end as c13,
           coalesce(o.code_2022, left(q.q, 6)) as c22,
           coalesce(o.anzsco is not null and o.anzsco_2013 is null, false) as only_2022
    from q left join o on true
    where q.q ~ '^\d{6}'
  ),
  cand as (
    select s.year, s.anzsco, coalesce(s.data ->> 'classification', 'ANZSCO 2022') as classification, s.title,
           s.national, s.nsw, s.vic, s.qld, s.sa, s.wa, s.tas, s.nt, s.act, s.source_url, s.as_at,
           (s.data ->> 'out_of_scope')::boolean as out_of_scope,
           case when (coalesce(s.data ->> 'classification', 'ANZSCO 2022') = 'ANZSCO 2022') = k.only_2022 then 0 else 1 end
             as pref
    from public.occupation_shortage s, k
    where s.listed
      and ((s.anzsco = k.c13 and s.data ->> 'classification' = 'ANZSCO 2013')
           or (s.anzsco = k.c22 and coalesce(s.data ->> 'classification', 'ANZSCO 2022') = 'ANZSCO 2022'))
    union all
    -- The ANZSCO 2022 version of a code both versions have, kept on its 2013 row.
    select s.year, s.anzsco, 'ANZSCO 2022', a.title, a.national, a.nsw, a.vic, a.qld, a.sa, a.wa, a.tas, a.nt, a.act,
           s.source_url, s.as_at, a.out_of_scope, case when k.only_2022 then 0 else 1 end
    from public.occupation_shortage s
    cross join k
    cross join lateral jsonb_to_record(s.data -> 'anzsco_2022') as a(title text, national text, nsw text, vic text,
      qld text, sa text, wa text, tas text, nt text, act text, out_of_scope boolean)
    where s.listed and s.anzsco = k.c22 and s.data ->> 'classification' = 'ANZSCO 2013' and s.data ? 'anzsco_2022'
  ),
  yr as (
    select distinct on (c.year) c.*,
           (select count(*) from unnest(array[c.nsw, c.vic, c.qld, c.sa, c.wa, c.tas, c.nt, c.act]) v
            where private.shortage_level(v) > 0) as states_short
    from cand c order by c.year, c.pref
  ),
  rated as (select *, row_number() over (order by year desc) as back from yr where national is not null),
  latest as (select * from rated where back = 1),
  prev as (select * from rated where back = 2),
  proj as (
    select p.* from public.occupation_projections p, k
    where p.listed and p.anzsco = (
      select x.anzsco from public.occupation_projections x
      where x.listed and x.anzsco in (k.c13, k.c22, left(coalesce(k.c13, k.c22), 4))
      order by length(x.anzsco) desc, (x.anzsco = k.c13) desc limit 1)
  ),
  p5 as (select * from proj where horizon = '5 years'),
  p10 as (select * from proj where horizon = '10 years'),
  summary as (
    select (select count(*) from rated) as years_rated,
           (select count(*) from rated where private.shortage_level(national) > 0) as years_short,
           (select count(*) from rated where private.shortage_level(national) = 2) as years_national,
           (select count(*) from yr where national is null) as years_unrated,
           (select array_agg(year order by year) from yr where national is null) as unrated_years,
           (select min(year) from rated) as first_year,
           l.year as latest_year, l.national as latest_rating, l.states_short as latest_states,
           pv.year as prev_year, pv.national as prev_rating, pv.states_short as prev_states,
           case
             when l.year is null or pv.year is null then null
             when private.shortage_level(l.national) > private.shortage_level(pv.national) then 'worsening'
             when private.shortage_level(l.national) < private.shortage_level(pv.national) then 'improving'
             when l.states_short > pv.states_short then 'worsening'
             when l.states_short < pv.states_short then 'improving'
             else 'steady'
           end as trend
    from (select 1) one left join latest l on true left join prev pv on true
  )
  select jsonb_build_object(
    'occupation', (
      select jsonb_build_object(
        'anzsco', coalesce(o.anzsco, k.c22), 'code', coalesce(o.code, k.c22),
        'title', coalesce(o.title, (select title from yr order by year desc limit 1)),
        'anzsco_2013', k.c13, 'anzsco_2022', k.c22, 'on_skilled_list', o.anzsco is not null and o.listed)
      from k left join o on true),
    'shortage', coalesce((
      select jsonb_agg(jsonb_build_object(
               'year', y.year, 'anzsco', y.anzsco, 'classification', y.classification, 'title', y.title,
               'national', y.national, 'nsw', y.nsw, 'vic', y.vic, 'qld', y.qld, 'sa', y.sa, 'wa', y.wa,
               'tas', y.tas, 'nt', y.nt, 'act', y.act, 'rated', y.national is not null,
               'out_of_scope', coalesce(y.out_of_scope, false), 'states_in_shortage', y.states_short,
               'source_url', y.source_url, 'as_at', y.as_at) order by y.year)
      from yr y), '[]'),
    'projections', (
      select jsonb_build_object(
        'anzsco', p.anzsco, 'title', p.title, 'level', p.level, 'unit_group', p.level = 'unit group',
        'note', case when p.level = 'unit group' then format(
          'JSA projects employment for ANZSCO unit groups, not single occupations: these figures are for unit group %s %s as a whole.',
          p.anzsco, p.title) end,
        'skill_level', p.skill_level, 'classification', p.classification, 'base_period', p.base_period,
        'base_employment', p.base_employment,
        'horizons', (select jsonb_agg(jsonb_build_object('horizon', x.horizon, 'projected_period', x.projected_period,
                       'projected_employment', x.projected_employment, 'growth', x.growth, 'growth_pct', x.growth_pct)
                     order by x.horizon <> '5 years') from proj x),
        'source_url', p.source_url, 'as_at', p.as_at)
      from (select * from proj limit 1) p),
    'summary', (
      select jsonb_build_object(
        'years_rated', s.years_rated, 'years_in_shortage', s.years_short, 'years_in_national_shortage', s.years_national,
        'years_not_rated', s.years_unrated, 'not_rated', coalesce(to_jsonb(s.unrated_years), '[]'),
        'first_year', s.first_year, 'latest_year', s.latest_year,
        'latest_rating', s.latest_rating, 'latest_states_in_shortage', s.latest_states,
        'previous_year', s.prev_year, 'previous_rating', s.prev_rating, 'previous_states_in_shortage', s.prev_states,
        'trend', s.trend,
        'trend_basis', 'The latest year against the year before: improving = the shortage eased (a lower national rating, or the same rating in fewer states and territories); worsening = the reverse; steady = no change.',
        'projected_growth_5yr_pct', (select growth_pct from p5), 'projected_growth_10yr_pct', (select growth_pct from p10),
        'projected_growth_5yr', (select growth from p5), 'projected_growth_10yr', (select growth from p10),
        'projection_level', (select level from p5),
        -- e.g. "In shortage (any shortage rating) in 4 of the 5 years rated, 2021 to 2025. 2025: No Shortage, 0
        -- states and territories in shortage (2024: Shortage, 8): improving. Employment in unit group 2613 ..."
        'text', nullif(concat_ws(' ',
          case when s.years_rated > 0 then format('In shortage (any shortage rating) in %s of the %s years rated, %s to %s.',
            s.years_short, s.years_rated, s.first_year, s.latest_year) end,
          case when s.years_unrated > 0 then format('Not rated in %s.', array_to_string(s.unrated_years, ', ')) end,
          case when s.latest_year is not null then format('%s: %s, %s %s in shortage%s.', s.latest_year, s.latest_rating,
            s.latest_states, case when s.latest_states = 1 then 'state or territory' else 'states and territories' end,
            case when s.prev_year is not null
                 then format(' (%s: %s, %s): %s', s.prev_year, s.prev_rating, s.prev_states, s.trend) else '' end) end,
          (select format('Employment in %s %s is projected to %s %s%% by %s',
                         case when p5.level = 'unit group' then 'unit group ' || p5.anzsco else p5.anzsco end, p5.title,
                         case when p5.growth_pct < 0 then 'fall' else 'grow' end,
                         to_char(abs(p5.growth_pct), 'FM990.0'), p5.projected_period)
                  || coalesce((select format(' and %s%s%% by %s',
                                             case when (p10.growth_pct < 0) = (p5.growth_pct < 0) then ''
                                                  when p10.growth_pct < 0 then 'fall ' else 'grow ' end,
                                             to_char(abs(p10.growth_pct), 'FM990.0'), p10.projected_period) from p10), '')
                  || '.' from p5)), ''))
      from summary s),
    'sources', jsonb_build_array(
      jsonb_build_object('title', 'Occupation Shortage List (Jobs and Skills Australia)',
                         'url', 'https://www.jobsandskills.gov.au/data/occupation-shortage'),
      jsonb_build_object('title', 'Employment projections (Jobs and Skills Australia)',
                         'url', 'https://www.jobsandskills.gov.au/data/employment-projections'))
  )
  from k
$$;

revoke execute on function private.shortage_level(text) from public, anon, authenticated;
revoke execute on function public.occupation_outlook(text) from public;
grant execute on function public.occupation_outlook(text) to anon, authenticated;
