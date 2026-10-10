-- Visa processing times: how long Home Affairs is taking to decide each visa subclass and stream (the 25%,
-- 50%, 75% and 90% marks), and Australian citizenship applications.
--
-- worker/processing_times.py reads them from the JSON service behind the processing times guide
-- (https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times/global-visa-processing-times)
-- and the citizenship processing times page, and writes through the token-protected
-- worker_processing_times_* functions below. Read-only for everyone; the app and the chat read it through
-- public.processing_times().

create table public.visa_processing_times (
  subclass text not null,                      -- 189, 820 ...; 'citizenship' for citizenship applications
  stream text not null default '',             -- stream name as published; '' when the visa has no streams
  -- Home Affairs' own identifiers. Stream names are not unique within a subclass (482 has the Skills in
  -- Demand "Labour Agreement" stream and the closed Temporary Skill Shortage one), so these are the key.
  -- visa_code is usually the subclass; the National Innovation visa (subclass 858) is "858-1".
  visa_code text not null,
  stream_code text not null default '',
  visa_name text,
  p25 text,                                    -- as published: "54 Days", "8 Months", "Less than 1 Day",
  p50 text,                                    -- "Processing times are not available"
  p75 text,
  p90 text,
  -- Whole days. Visas: the guide service's own day figures (it gives 1 for "Less than 1 Day"), kept only
  -- where they agree with the published text. Citizenship: only times published in days. Null otherwise;
  -- months are never converted.
  p25_days int,
  p50_days int,
  p75_days int,
  p90_days int,
  updated text,                                -- the date Home Affairs last updated the figures, as published
  as_at date,                                  -- the same date
  period_end date,                             -- visas: the figures cover applications decided up to this date
  guide_max_days int,                          -- the guide calls an application older than this "outside
                                               -- standard processing timeframe"
  in_guide boolean not null default false,     -- offered by the guide (it lists only visas with times)
  note text,                                   -- the guide's note for this visa, e.g. when the clock starts
  visa_url text,
  source_url text not null,
  seen_run text,
  listed boolean not null default true,        -- false once the source stops publishing it (never deleted)
  updated_at timestamptz not null default now(),
  primary key (visa_code, stream_code)
);
create index visa_processing_times_subclass_idx on public.visa_processing_times (subclass, stream);

alter table public.visa_processing_times enable row level security;
create policy "public read" on public.visa_processing_times for select to anon, authenticated using (true);

-- ─────────────────────────────── Worker API ───────────────────────────────

-- Upsert one batch of rows. Returns the number written.
create or replace function public.worker_processing_times_upsert(p_token text, p_rows jsonb, p_run text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform private.check_worker(p_token);
  if p_run is null or p_run = '' then raise exception 'run required'; end if;
  insert into public.data_import_runs (source, run) values ('processing_times', p_run) on conflict do nothing;

  insert into public.visa_processing_times as t (subclass, stream, visa_code, stream_code, visa_name,
    p25, p50, p75, p90, p25_days, p50_days, p75_days, p90_days, updated, as_at, period_end, guide_max_days,
    in_guide, note, visa_url, source_url, seen_run)
  select distinct on (r.visa_code, coalesce(r.stream_code, ''))
         r.subclass, coalesce(r.stream, ''), r.visa_code, coalesce(r.stream_code, ''), r.visa_name,
         r.p25, r.p50, r.p75, r.p90, r.p25_days, r.p50_days, r.p75_days, r.p90_days, r.updated, r.as_at,
         r.period_end, r.guide_max_days, coalesce(r.in_guide, false), r.note, r.visa_url, r.source_url, p_run
  from jsonb_to_recordset(p_rows) as r(subclass text, stream text, visa_code text, stream_code text,
    visa_name text, p25 text, p50 text, p75 text, p90 text, p25_days int, p50_days int, p75_days int,
    p90_days int, updated text, as_at date, period_end date, guide_max_days int, in_guide boolean, note text,
    visa_url text, source_url text)
  where (r.subclass ~ '^\d{3}$' or r.subclass = 'citizenship') and r.visa_code is not null
    and r.source_url is not null
  order by r.visa_code, coalesce(r.stream_code, '')
  on conflict (visa_code, stream_code) do update set
    subclass = excluded.subclass, stream = excluded.stream, visa_name = coalesce(excluded.visa_name, t.visa_name),
    p25 = excluded.p25, p50 = excluded.p50, p75 = excluded.p75, p90 = excluded.p90,
    p25_days = excluded.p25_days, p50_days = excluded.p50_days, p75_days = excluded.p75_days,
    p90_days = excluded.p90_days, updated = excluded.updated, as_at = excluded.as_at,
    period_end = excluded.period_end, guide_max_days = excluded.guide_max_days, in_guide = excluded.in_guide,
    note = excluded.note, visa_url = coalesce(excluded.visa_url, t.visa_url), source_url = excluded.source_url,
    seen_run = excluded.seen_run, listed = true, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Close a run and record it. With p_error the run is recorded as failed and nothing changes. Otherwise
-- rows the source no longer publishes are marked listed = false, separately for visas and citizenship (a
-- run that could not read the citizenship page leaves those rows alone). Refused when the run saw under
-- half of the visa rows listed: an interrupted import.
create or replace function public.worker_processing_times_finish(
  p_token text, p_run text, p_error text default null, p_counts jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  seen int; held int; removed int; v_counts jsonb := coalesce(p_counts, '{}');
begin
  perform private.check_worker(p_token);
  insert into public.data_import_runs (source, run) values ('processing_times', p_run) on conflict do nothing;

  if p_error is not null then
    update public.data_import_runs set finished_at = now(), ok = false, error = left(p_error, 2000),
      counts = counts || v_counts
    where source = 'processing_times' and run = p_run;
    return jsonb_build_object('ok', false, 'error', left(p_error, 2000));
  end if;

  select count(*) into seen from public.visa_processing_times where seen_run = p_run and subclass <> 'citizenship';
  select count(*) into held from public.visa_processing_times where listed and subclass <> 'citizenship';
  if seen = 0 or seen < held / 2 then
    raise exception 'processing times import % looks incomplete: % seen, % listed', p_run, seen, held;
  end if;
  update public.visa_processing_times t set listed = false, updated_at = now()
  where t.listed and t.seen_run is distinct from p_run
    and exists (select 1 from public.visa_processing_times x
                where x.seen_run = p_run and (x.subclass = 'citizenship') = (t.subclass = 'citizenship'));
  get diagnostics removed = row_count;

  v_counts := v_counts || (
    select jsonb_build_object(
      'rows', count(*) filter (where seen_run = p_run),
      'visa_rows', count(*) filter (where seen_run = p_run and subclass <> 'citizenship'),
      'citizenship_rows', count(*) filter (where seen_run = p_run and subclass = 'citizenship'),
      'in_guide', count(*) filter (where seen_run = p_run and in_guide),
      'with_times', count(*) filter (where seen_run = p_run and p90_days is not null),
      'subclasses', count(distinct subclass) filter (where seen_run = p_run),
      'updated', max(as_at) filter (where seen_run = p_run and subclass <> 'citizenship'),
      'unlisted', removed)
    from public.visa_processing_times);

  update public.data_import_runs set finished_at = now(), ok = true, error = null, counts = counts || v_counts
  where source = 'processing_times' and run = p_run;
  return v_counts;
end $$;

-- The last successful run comes from public.worker_occupations_last_run(p_token, 'processing_times').

revoke execute on function public.worker_processing_times_upsert(text, jsonb, text),
  public.worker_processing_times_finish(text, text, text, jsonb) from public;
grant execute on function public.worker_processing_times_upsert(text, jsonb, text),
  public.worker_processing_times_finish(text, text, text, jsonb) to anon, authenticated;

-- ─────────────────────────────── Read API ───────────────────────────────

-- "189", "820/801", "309, 100" or "citizenship" -> the subclasses asked for; anything else -> null.
create or replace function private.processing_subclasses(p_subclass text) returns text[]
language sql immutable set search_path = '' as $$
  select nullif(array(
    select m[1] from regexp_matches(lower(coalesce(p_subclass, '')), '\m(\d{3}(?:-\d)?|citizenship)\M', 'g') m), '{}')
$$;

-- Processing times for one or more subclasses ("189", "820/801", "citizenship"), or for everything when
-- p_subclass is null. Words without a subclass number ("partner", "student") match visa and stream names.
create or replace function public.processing_times(p_subclass text default null)
returns table (
  subclass text, stream text, visa_name text, p25 text, p50 text, p75 text, p90 text,
  p25_days int, p50_days int, p75_days int, p90_days int, updated text, as_at date, period_end date,
  guide_max_days int, in_guide boolean, note text, visa_url text, source_url text
)
language sql stable security definer set search_path = '' as $$
  select t.subclass, t.stream, t.visa_name, t.p25, t.p50, t.p75, t.p90,
         t.p25_days, t.p50_days, t.p75_days, t.p90_days, t.updated, t.as_at, t.period_end,
         t.guide_max_days, t.in_guide, t.note, t.visa_url, t.source_url
  from public.visa_processing_times t
  where t.listed
    and case
      when nullif(btrim(p_subclass), '') is null then true
      when private.processing_subclasses(p_subclass) is not null
        then t.subclass = any(private.processing_subclasses(p_subclass))
          or t.visa_code = any(private.processing_subclasses(p_subclass))
      else t.visa_name ilike '%' || btrim(p_subclass) || '%' or t.stream ilike '%' || btrim(p_subclass) || '%'
    end
  order by t.subclass, t.stream, t.in_guide desc, t.visa_name
$$;

revoke execute on function private.processing_subclasses(text) from public, anon, authenticated;
revoke execute on function public.processing_times(text) from public;
grant execute on function public.processing_times(text) to anon, authenticated;
