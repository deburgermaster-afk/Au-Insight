-- SkillSelect Expression of Interest (EOI) data: how many EOIs are submitted, on hold, invited, lodged or
-- closed, by visa type, occupation, points score and month. It is the only official count of invitations
-- per occupation (the invitation round pages give each round's total and minimum points only).
--
-- Source: the SkillSelect EOI dashboard, an Australian Government Qlik report of Home Affairs' SkillSelect
-- data, linked as "SkillSelect Dashboard" from the previous rounds page
-- (https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/previous-rounds). Each month is a
-- snapshot taken on the last day of the month; the dashboard keeps the latest 24. As the dashboard says:
-- counts under 20 are published as "<20", counts are of EOIs, not people (one person can have several EOIs,
-- and an EOI counts under each visa type it selects), INVITED means an invitation has been issued and not yet
-- used, LODGED that a visa application was lodged with it, and for INVITED and LODGED EOIs the points can
-- differ from the score the EOI was invited at.
--
-- worker/eoi.py reads the dashboard's own tables (its dimensions and its masked "Count EOIs" measure) and
-- writes through the token-protected worker_eoi_* functions below. Read-only for everyone; the app and the
-- chat read it through public.occupation_eoi() and public.eoi_overview().

create table public.skillselect_eoi (
  as_at date not null,                         -- the snapshot: the last day of the dashboard's "As At Month"
  subclass text not null,                      -- the visa type's code: 189PTS, 190SAS, 491SNR, 491FSR, 188BI ...
  visa_type text,                              -- as published: "491SNR State or Territory Nominated - Regional"
  -- The six-digit ANZSCO code as published (SkillSelect uses ANZSCO 2013 codes, as occupations.anzsco does),
  -- or the published text when the EOI has no occupation ("N/A"). '' = all occupations: the dashboard's own
  -- total for the other columns, not a sum of rows (rows under 20 are hidden).
  anzsco text not null,
  occupation text,                             -- the title as published ("Software Engineer")
  points text not null,                        -- as published: '65', '70', 'N/A'. '' = all scores, as for anzsco
  status text not null,                        -- SUBMITTED, HOLD, INVITED, LODGED, CLOSED
  count_text text not null,                    -- as published; "<20" stays as text
  count int generated always as (
    case when replace(count_text, ',', '') ~ '^[0-9]+$' then replace(count_text, ',', '')::int end) stored,
  source_url text not null,
  seen_run text,
  listed boolean not null default true,        -- false once a re-read of that month no longer shows the row
  updated_at timestamptz not null default now(),
  primary key (as_at, subclass, anzsco, points, status)
);
-- Rows the dashboard leaves out are zero: it suppresses zero counts.
create index skillselect_eoi_anzsco_idx on public.skillselect_eoi (anzsco, subclass, points, as_at) where listed;

alter table public.skillselect_eoi enable row level security;
create policy "public read" on public.skillselect_eoi for select to anon, authenticated using (true);

-- ─────────────────────────────── Worker API ───────────────────────────────

-- Upsert one batch of rows. Returns the number written.
create or replace function public.worker_eoi_upsert(p_token text, p_rows jsonb, p_run text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform private.check_worker(p_token);
  if p_run is null or p_run = '' then raise exception 'run required'; end if;
  insert into public.data_import_runs (source, run) values ('skillselect_eoi', p_run) on conflict do nothing;

  insert into public.skillselect_eoi as t (as_at, subclass, visa_type, anzsco, occupation, points, status,
    count_text, source_url, seen_run)
  select distinct on (r.as_at, r.subclass, coalesce(r.anzsco, ''), coalesce(r.points, ''), r.status)
         r.as_at, r.subclass, r.visa_type, coalesce(r.anzsco, ''), r.occupation, coalesce(r.points, ''), r.status,
         r.count_text, r.source_url, p_run
  from jsonb_to_recordset(p_rows) as r(as_at date, subclass text, visa_type text, anzsco text, occupation text,
    points text, status text, count_text text, source_url text)
  where r.as_at is not null and r.subclass ~ '^\d{3}[A-Z]*$' and nullif(r.status, '') is not null
    and nullif(r.count_text, '') is not null and r.source_url is not null
  order by r.as_at, r.subclass, coalesce(r.anzsco, ''), coalesce(r.points, ''), r.status
  on conflict (as_at, subclass, anzsco, points, status) do update set
    visa_type = coalesce(excluded.visa_type, t.visa_type), occupation = coalesce(excluded.occupation, t.occupation),
    count_text = excluded.count_text, source_url = excluded.source_url, seen_run = excluded.seen_run, listed = true,
    updated_at = case when (t.count_text, t.listed) is distinct from (excluded.count_text, true)
                      then now() else t.updated_at end;
  get diagnostics n = row_count;
  return n;
end $$;

-- Close a run and record it. With p_error the run is recorded as failed and nothing changes. Otherwise rows
-- of a month and breakdown (totals, by occupation, by points, by occupation and points) that this run re-read
-- but no longer saw are marked listed = false; months the dashboard has dropped stay as they are (history).
create or replace function public.worker_eoi_finish(
  p_token text, p_run text, p_error text default null, p_counts jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  seen int; removed int; v_counts jsonb := coalesce(p_counts, '{}');
begin
  perform private.check_worker(p_token);
  insert into public.data_import_runs (source, run) values ('skillselect_eoi', p_run) on conflict do nothing;

  if p_error is not null then
    update public.data_import_runs set finished_at = now(), ok = false, error = left(p_error, 2000),
      counts = counts || v_counts
    where source = 'skillselect_eoi' and run = p_run;
    return jsonb_build_object('ok', false, 'error', left(p_error, 2000));
  end if;

  select count(*) into seen from public.skillselect_eoi where seen_run = p_run;
  if seen = 0 then raise exception 'EOI import % wrote no rows', p_run; end if;
  with g as (
    select distinct as_at, anzsco = '' as all_occupations, points = '' as all_points
    from public.skillselect_eoi where seen_run = p_run
  )
  update public.skillselect_eoi e set listed = false, updated_at = now()
  from g
  where e.listed and e.seen_run is distinct from p_run and e.as_at = g.as_at
    and (e.anzsco = '') = g.all_occupations and (e.points = '') = g.all_points;
  get diagnostics removed = row_count;

  v_counts := v_counts || (
    select jsonb_build_object(
      'rows', count(*) filter (where seen_run = p_run),
      'totals', count(*) filter (where seen_run = p_run and anzsco = '' and points = ''),
      'by_occupation', count(*) filter (where seen_run = p_run and anzsco <> '' and points = ''),
      'by_points', count(*) filter (where seen_run = p_run and anzsco = '' and points <> ''),
      'by_occupation_points', count(*) filter (where seen_run = p_run and anzsco <> '' and points <> ''),
      'months', count(distinct as_at) filter (where seen_run = p_run),
      'latest', max(as_at) filter (where seen_run = p_run),
      'listed', count(*) filter (where listed),
      'unlisted', removed)
    from public.skillselect_eoi);

  update public.data_import_runs set finished_at = now(), ok = true, error = null, counts = counts || v_counts
  where source = 'skillselect_eoi' and run = p_run;
  return v_counts;
end $$;

-- The last successful run comes from public.worker_occupations_last_run(p_token, 'skillselect_eoi').

revoke execute on function public.worker_eoi_upsert(text, jsonb, text),
  public.worker_eoi_finish(text, text, text, jsonb) from public;
grant execute on function public.worker_eoi_upsert(text, jsonb, text),
  public.worker_eoi_finish(text, text, text, jsonb) to anon, authenticated;

-- ─────────────────────────────── Read API ───────────────────────────────

-- A count as JSON: a number, or the published text when the dashboard hides it ("<20").
create or replace function private.eoi_value(p_count int, p_text text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_count is not null then to_jsonb(p_count) else to_jsonb(p_text) end
$$;

-- '65' sorts before '100'; 'N/A' last.
create or replace function private.eoi_points_order(p_points text) returns int
language sql immutable set search_path = '' as $$
  select case when p_points ~ '^[0-9]+$' then p_points::int else 100000 end
$$;

-- The latest month, the dashboard's own dates, and what the counts mean.
create or replace function private.eoi_meta() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'as_at', l.as_at, 'month', to_char(l.as_at, 'MM/YYYY'),
    'months', (select jsonb_agg(to_char(x.d, 'MM/YYYY') order by x.d) from (
                 select distinct as_at as d from public.skillselect_eoi
                 where listed and anzsco = '' and points = '') x),
    'data_current_to', r.counts ->> 'data_current_to',
    'dashboard_reloaded', r.counts ->> 'reloaded',
    'imported_at', r.finished_at,
    'notes', jsonb_build_array(
      'A snapshot on the last day of each month, as published in the SkillSelect EOI dashboard.',
      'Counts are of EOIs, not people: one person can have several EOIs, and an EOI counts under each visa type it selects.',
      'INVITED: EOIs holding an invitation to apply on that day (issued, not yet used), not the invitations issued during the month. LODGED: a visa application has been lodged with the invitation.',
      'For INVITED and LODGED EOIs the points can differ from the score the EOI was invited at (SkillSelect lets the score change while invited).',
      'Counts under 20 are published as "<20". A status or score that is missing had no EOIs (the dashboard leaves zero counts out).'),
    'source_url', coalesce(r.counts ->> 'source_url',
      'https://api.dynamic.reports.employment.gov.au/anonap/extensions/hSKLS02_SkillSelect_EOI_Data/hSKLS02_SkillSelect_EOI_Data.html'),
    'linked_from', 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/previous-rounds')
  from (select max(as_at) as as_at from public.skillselect_eoi where listed and anzsco = '' and points = '') l
  left join lateral (
    select * from public.data_import_runs x where x.source = 'skillselect_eoi' and x.ok
    order by x.finished_at desc limit 1
  ) r on true
$$;

-- One occupation (a six-digit ANZSCO code, alone or in text such as "261313 Software Engineer"), for each
-- visa type: the latest month's counts by status (by_status) and by points and status (by_points), and every
-- month's counts by status (by_month, which carries the invited counts over time).
create or replace function public.occupation_eoi(p_anzsco text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (select private.eoi_meta() as meta),
  q as (
    select substring(coalesce(p_anzsco, '') from '\d{6}') as code, (m.meta ->> 'as_at')::date as latest from m
  ),
  e as (
    select e.* from public.skillselect_eoi e, q where e.listed and e.anzsco = q.code
  ),
  subs as (select subclass, max(visa_type) as visa_type from e group by subclass)
  select m.meta || jsonb_build_object(
    'anzsco', q.code,
    'occupation', (select occupation from e order by as_at desc limit 1),
    'subclasses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subclass', s.subclass, 'visa_type', s.visa_type,
        'by_status', coalesce((
          select jsonb_object_agg(x.status, private.eoi_value(x.count, x.count_text))
          from e x where x.subclass = s.subclass and x.as_at = q.latest and x.points = ''), '{}'),
        'by_points', coalesce((
          select jsonb_agg(p.item order by p.ord)
          from (select private.eoi_points_order(x.points) as ord,
                       jsonb_build_object('points', x.points)
                         || jsonb_object_agg(x.status, private.eoi_value(x.count, x.count_text)) as item
                from e x where x.subclass = s.subclass and x.as_at = q.latest and x.points <> ''
                group by x.points) p), '[]'),
        'by_month', coalesce((
          select jsonb_agg(p.item order by p.as_at)
          from (select x.as_at,
                       jsonb_build_object('month', to_char(x.as_at, 'MM/YYYY'), 'as_at', x.as_at)
                         || jsonb_object_agg(x.status, private.eoi_value(x.count, x.count_text)) as item
                from e x where x.subclass = s.subclass and x.points = ''
                group by x.as_at) p), '[]'))
        order by s.subclass)
      from subs s), '[]'))
  from q, m
$$;

-- One visa type ("189", "190", "491" for both 491 streams, or a code such as "491SNR"): the latest month's
-- totals by status, invited and submitted EOIs by points, every month's totals by status, and the latest
-- month's invited EOIs by occupation (published counts, largest first; occupations under 20 are counted).
create or replace function public.eoi_overview(p_subclass text default '189')
returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (select private.eoi_meta() as meta),
  q as (
    select upper(btrim(coalesce(nullif(btrim(p_subclass), ''), '189'))) as s, (m.meta ->> 'as_at')::date as latest
    from m
  ),
  e as (
    select e.* from public.skillselect_eoi e, q
    where e.listed and (e.subclass = q.s or (q.s ~ '^\d{3}$' and left(e.subclass, 3) = q.s))
  ),
  subs as (select subclass, max(visa_type) as visa_type from e group by subclass)
  select m.meta || jsonb_build_object(
    'subclass', q.s,
    'visa_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subclass', s.subclass, 'visa_type', s.visa_type,
        'by_status', coalesce((
          select jsonb_object_agg(x.status, private.eoi_value(x.count, x.count_text))
          from e x where x.subclass = s.subclass and x.as_at = q.latest and x.anzsco = '' and x.points = ''), '{}'),
        'invited_by_points', coalesce((
          select jsonb_agg(jsonb_build_object('points', x.points, 'count', private.eoi_value(x.count, x.count_text))
                           order by private.eoi_points_order(x.points))
          from e x where x.subclass = s.subclass and x.as_at = q.latest and x.anzsco = '' and x.points <> ''
            and x.status = 'INVITED'), '[]'),
        'submitted_by_points', coalesce((
          select jsonb_agg(jsonb_build_object('points', x.points, 'count', private.eoi_value(x.count, x.count_text))
                           order by private.eoi_points_order(x.points))
          from e x where x.subclass = s.subclass and x.as_at = q.latest and x.anzsco = '' and x.points <> ''
            and x.status = 'SUBMITTED'), '[]'),
        'by_month', coalesce((
          select jsonb_agg(p.item order by p.as_at)
          from (select x.as_at,
                       jsonb_build_object('month', to_char(x.as_at, 'MM/YYYY'), 'as_at', x.as_at)
                         || jsonb_object_agg(x.status, private.eoi_value(x.count, x.count_text)) as item
                from e x where x.subclass = s.subclass and x.anzsco = '' and x.points = ''
                group by x.as_at) p), '[]'),
        'invited_occupations', coalesce((
          select jsonb_agg(jsonb_build_object('anzsco', x.anzsco, 'occupation', x.occupation, 'count', x.count)
                           order by x.count desc, x.anzsco)
          from e x where x.subclass = s.subclass and x.as_at = q.latest and x.anzsco <> '' and x.points = ''
            and x.status = 'INVITED' and x.count is not null), '[]'),
        'invited_occupations_under_20', (
          select count(*) from e x where x.subclass = s.subclass and x.as_at = q.latest and x.anzsco <> ''
            and x.points = '' and x.status = 'INVITED' and x.count is null))
        order by s.subclass)
      from subs s), '[]'),
    'subclasses_available', (
      select jsonb_agg(distinct x.subclass) from public.skillselect_eoi x
      where x.listed and x.as_at = q.latest and x.anzsco = '' and x.points = ''))
  from q, m
$$;

revoke execute on function private.eoi_value(int, text), private.eoi_points_order(text), private.eoi_meta()
  from public, anon, authenticated;
revoke execute on function public.occupation_eoi(text), public.eoi_overview(text) from public;
grant execute on function public.occupation_eoi(text), public.eoi_overview(text) to anon, authenticated;
