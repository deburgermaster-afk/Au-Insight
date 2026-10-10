-- University and course data from the official CRICOS register (Commonwealth Register of Institutions
-- and Courses for Overseas Students, data.gov.au dataset "cricos"): every provider, course, campus and
-- the fees each provider declares, imported by worker/cricos.py through the token-protected
-- worker_cricos_* functions. Read-only for everyone; the app and the chat query it through the RPCs below.
-- Also: the signed-in user's course shortlist, and client error logs from the app.

-- ─────────────────────────────── Register ───────────────────────────────

create table public.edu_providers (
  code text primary key,                       -- CRICOS provider code, e.g. 00002J
  name text not null,                          -- institution name on the register
  trading_name text,
  type text,                                   -- Government | Private
  capacity int,                                -- international students it may enrol at once
  website text,                                -- first website on the register, with a scheme
  domains text[] not null default '{}',        -- every host named in the register's website field (no www.)
  city text,                                   -- postal address
  state text,
  postcode text,
  seen_run text,                               -- last import run that listed it
  updated_at timestamptz not null default now()
);
create index edu_providers_domains_idx on public.edu_providers using gin (domains);

create table public.edu_courses (
  code text primary key,                       -- CRICOS course code, e.g. 078241E
  provider_code text not null references public.edu_providers(code) on delete cascade,
  provider_names text,                         -- provider name and trading name, kept here for search
  name text not null,
  vet_code text,
  dual_qualification boolean,
  foe1_broad text,
  foe1_narrow text,
  foe1_detailed text,
  foe2_broad text,
  foe2_narrow text,
  foe2_detailed text,
  level text,
  foundation boolean,
  work_component boolean,
  work_hours_week numeric,
  work_weeks int,
  work_total_hours numeric,
  language text,
  duration_weeks int,
  tuition_fee numeric,                         -- whole course, AUD, as declared by the provider
  non_tuition_fee numeric,
  total_cost numeric,
  expired boolean not null default false,
  -- Tuition per 52 weeks: an estimate for comparing courses of different lengths.
  annual_tuition numeric generated always as (
    case when duration_weeks is not null then round(tuition_fee / greatest(duration_weeks, 1) * 52) end) stored,
  search tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(name, '') || ' ' || code || ' ' || coalesce(vet_code, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(provider_names, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig,
      coalesce(foe1_broad, '') || ' ' || coalesce(foe1_narrow, '') || ' ' || coalesce(foe1_detailed, '') || ' ' ||
      coalesce(foe2_broad, '') || ' ' || coalesce(foe2_narrow, '') || ' ' || coalesce(foe2_detailed, '') || ' ' ||
      coalesce(level, '')), 'C')
  ) stored,
  seen_run text,
  updated_at timestamptz not null default now()
);
create index edu_courses_search_idx on public.edu_courses using gin (search);
create index edu_courses_name_trgm_idx on public.edu_courses using gin (name extensions.gin_trgm_ops);
create index edu_courses_name_lower_idx on public.edu_courses (lower(name));
create index edu_courses_provider_idx on public.edu_courses (provider_code);
create index edu_courses_level_idx on public.edu_courses (level);

create table public.edu_locations (
  provider_code text not null references public.edu_providers(code) on delete cascade,
  name text not null,
  type text,
  address text,
  city text,
  state text,
  postcode text,
  seen_run text,
  unique (provider_code, name)
);

create table public.edu_course_locations (
  provider_code text not null,
  course_code text not null references public.edu_courses(code) on delete cascade,
  location_name text not null,
  city text,
  state text,
  seen_run text,
  unique (course_code, location_name)
);
create index edu_course_locations_state_idx on public.edu_course_locations (state, course_code);

create table public.edu_import_runs (
  run text primary key,
  source_as_at date,                           -- date of the register files imported
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts jsonb not null default '{}'
);

alter table public.edu_providers enable row level security;
alter table public.edu_courses enable row level security;
alter table public.edu_locations enable row level security;
alter table public.edu_course_locations enable row level security;
alter table public.edu_import_runs enable row level security;
create policy "public read" on public.edu_providers for select to anon, authenticated using (true);
create policy "public read" on public.edu_courses for select to anon, authenticated using (true);
create policy "public read" on public.edu_locations for select to anon, authenticated using (true);
create policy "public read" on public.edu_course_locations for select to anon, authenticated using (true);
create policy "public read" on public.edu_import_runs for select to anon, authenticated using (true);

-- ─────────────────────────────── Per user ───────────────────────────────

create table public.course_shortlist (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_code text not null references public.edu_courses(code) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, course_code)
);
alter table public.course_shortlist enable row level security;
create policy "own shortlist" on public.course_shortlist for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Errors, long frames and resume events reported by the app (write-only for users; read with SQL).
create table public.client_logs (
  id bigserial primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  kind text,
  message text,
  detail jsonb,
  ua text,
  route text,
  app_version text
);
create index client_logs_at_idx on public.client_logs (at desc);
alter table public.client_logs enable row level security;
create policy "insert own logs" on public.client_logs for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Keep each log row small, whatever the app sends.
create or replace function private.client_logs_trim() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.kind := left(new.kind, 40);
  new.message := left(new.message, 2000);
  new.ua := left(new.ua, 300);
  new.route := left(new.route, 300);
  new.app_version := left(new.app_version, 60);
  if new.detail is not null and pg_column_size(new.detail) > 8000 then
    new.detail := jsonb_build_object('truncated', left(new.detail::text, 4000));
  end if;
  new.at := now();
  return new;
end $$;
create trigger client_logs_trim before insert on public.client_logs
  for each row execute function private.client_logs_trim();

select cron.schedule('purge-client-logs', '17 3 * * *',
  $$delete from public.client_logs where at < now() - interval '30 days'$$);

-- ─────────────────────────────── Read API ───────────────────────────────

-- Date of the register behind the data (the last finished import).
create or replace function public.edu_as_at() returns date
language sql stable security invoker set search_path = '' as $$
  select source_as_at from public.edu_import_runs where finished_at is not null order by finished_at desc limit 1;
$$;

-- Course search. Words match as prefixes ("civil eng"), common abbreviations are understood
-- (PhD, MPhil, MBA, IT, ...), "quoted phrases", -exclusions and OR use web-search syntax, and a
-- substring match on the course name catches what the word index misses.
create or replace function public.search_courses(
  p_query text default null,
  p_levels text[] default null,
  p_state text default null,
  p_city text default null,
  p_provider text default null,
  p_field text default null,
  p_max_annual_fee numeric default null,
  p_research_only boolean default false,
  p_include_expired boolean default false,
  p_sort text default 'relevance',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  course_code text, course_name text, provider_code text, provider_name text, provider_type text, website text,
  level text, field_broad text, field_narrow text, field_detailed text,
  duration_weeks int, tuition_fee numeric, non_tuition_fee numeric, total_cost numeric, annual_tuition numeric,
  work_component boolean, dual_qualification boolean, foundation boolean, vet_code text, expired boolean,
  campuses jsonb, total_count bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  q text := left(nullif(btrim(p_query), ''), 200);
  tsq tsquery;
  part text;
  w text;
  v_like text;
  v_prefix text;
  v_state text := nullif(btrim(p_state), '');
  conds text[] := '{}';
  rank_sql text := '0';
  order_sql text;
begin
  if q is not null then
    if q ~ '"' or q ~ '(^|\s)-\S' or q ~* '\sor\s' then
      tsq := websearch_to_tsquery('english', q);
    else
      -- Single letters (from "Bachelor's") are dropped when the query has longer words.
      for w in select x from regexp_split_to_table(lower(q), '[^[:alnum:]]+') x
               where x <> '' and (length(x) > 1 or q !~ '[[:alnum:]]{2}') limit 12 loop
        part := case w
          when 'phd' then 'phd:* | (doctor & philosophy)'
          when 'dphil' then 'dphil | (doctor & philosophy)'
          when 'mphil' then 'mphil | (master & philosophy)'
          when 'mres' then 'mres | (master & research)'
          when 'mba' then 'mba | (master & business & administration)'
          when 'dba' then 'dba | (doctor & business & administration)'
          when 'edd' then 'edd | (doctor & education)'
          when 'mph' then 'mph | (master & public & health)'
          when 'llb' then 'llb | (bachelor & laws)'
          when 'llm' then 'llm | (master & laws)'
          when 'jd' then 'jd | (juris & doctor)'
          when 'md' then 'md | (doctor & medicine)'
          when 'mbbs' then 'mbbs | (bachelor & medicine & surgery)'
          when 'bsc' then 'bsc | (bachelor & science)'
          when 'msc' then 'msc | (master & science)'
          when 'ba' then 'ba | (bachelor & arts)'
          when 'beng' then 'beng | (bachelor & engineering)'
          when 'meng' then 'meng | (master & engineering)'
          when 'it' then '(information & technology)'
          when 'ict' then 'ict | (information & communication & technology)'
          when 'cs' then '(computer & science)'
          when 'ai' then 'ai | (artificial & intelligence)'
          when 'ml' then '(machine & learning)'
          when 'hr' then '(human & resource:*)'
          when 'elicos' then 'elicos | (english & language)'
          else w || ':*'
        end;
        tsq := case when tsq is null then to_tsquery('english', part) else tsq && to_tsquery('english', part) end;
      end loop;
    end if;
    if tsq is not null and numnode(tsq) = 0 then tsq := null; end if;

    v_like := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_prefix := substr(v_like, 2);
    conds := conds || case
      when tsq is null then 'c.name ilike $2'
      when length(q) >= 3 then '(c.search @@ $1 or c.name ilike $2)'
      else 'c.search @@ $1'
    end;
    rank_sql := case when tsq is null then '0' else 'ts_rank(c.search, $1)' end
      || ' + case when c.name ilike $12 then 0.5 when c.name ilike $2 then 0.2 else 0 end';
  end if;

  if not coalesce(p_include_expired, false) then conds := conds || 'not c.expired'::text; end if;
  if p_levels is not null and cardinality(p_levels) > 0 then conds := conds || 'c.level = any($3)'::text; end if;
  if coalesce(p_research_only, false) then
    conds := conds || $c$c.level in ('Masters Degree (Research)', 'Doctoral Degree')$c$::text;
  end if;
  if v_state is not null then
    v_state := case lower(v_state)
      when 'victoria' then 'VIC' when 'new south wales' then 'NSW' when 'queensland' then 'QLD'
      when 'western australia' then 'WA' when 'south australia' then 'SA' when 'tasmania' then 'TAS'
      when 'australian capital territory' then 'ACT' when 'canberra' then 'ACT' when 'northern territory' then 'NT'
      else upper(v_state) end;
    conds := conds || 'exists (select 1 from public.edu_course_locations l where l.course_code = c.code and l.state = $4)'::text;
  end if;
  if nullif(btrim(p_city), '') is not null then
    conds := conds || 'exists (select 1 from public.edu_course_locations l where l.course_code = c.code and (l.city ilike $5 or l.location_name ilike $5))'::text;
  end if;
  if nullif(btrim(p_provider), '') is not null then
    conds := conds || '(c.provider_code = upper(btrim($6)) or p.name ilike $7 or p.trading_name ilike $7)'::text;
  end if;
  if nullif(btrim(p_field), '') is not null then
    conds := conds || '(c.foe1_broad ilike $8 or c.foe1_narrow ilike $8 or c.foe1_detailed ilike $8 or c.foe2_broad ilike $8 or c.foe2_narrow ilike $8 or c.foe2_detailed ilike $8)'::text;
  end if;
  if p_max_annual_fee is not null then conds := conds || 'c.annual_tuition <= $9'::text; end if;
  if cardinality(conds) = 0 then conds := array['true']; end if;

  order_sql := case p_sort
    when 'fee_asc' then 'm.annual_tuition asc nulls last, m.total_cost asc nulls last, m.name, m.code'
    when 'fee_desc' then 'm.annual_tuition desc nulls last, m.total_cost desc nulls last, m.name, m.code'
    when 'duration_asc' then 'm.duration_weeks asc nulls last, m.name, m.code'
    when 'name' then 'm.name, m.provider_name, m.code'
    else case when q is null then $o$(m.provider_type = 'Government') desc, m.name, m.provider_name, m.code$o$
              else $o$m.rank desc, (m.provider_type = 'Government') desc, m.name, m.code$o$ end
  end;

  return query execute format($sql$
    with m as (
      select c.code, c.name, c.annual_tuition, c.total_cost, c.duration_weeks, p.name as provider_name,
             p.type as provider_type, %1$s as rank
      from public.edu_courses c
      join public.edu_providers p on p.code = c.provider_code
      where %2$s
    ),
    page as (
      select m.code, count(*) over () as total_count, row_number() over (order by %3$s) as ord
      from m
      order by %3$s
      limit $10 offset $11
    )
    select c.code, c.name, p.code, p.name, p.type, p.website,
           c.level, c.foe1_broad, c.foe1_narrow, c.foe1_detailed,
           c.duration_weeks, c.tuition_fee, c.non_tuition_fee, c.total_cost, c.annual_tuition,
           c.work_component, c.dual_qualification, c.foundation, c.vet_code, c.expired,
           coalesce(cl.campuses, '[]'::jsonb), pg.total_count
    from page pg
    join public.edu_courses c on c.code = pg.code
    join public.edu_providers p on p.code = c.provider_code
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', l.location_name, 'city', l.city, 'state', l.state)
                       order by l.state, l.city, l.location_name) as campuses
      from public.edu_course_locations l where l.course_code = c.code
    ) cl on true
    order by pg.ord
  $sql$, rank_sql, array_to_string(conds, ' and '), order_sql)
  using tsq, v_like, p_levels, v_state, '%' || btrim(coalesce(p_city, '')) || '%', p_provider,
        '%' || btrim(coalesce(p_provider, '')) || '%', '%' || btrim(coalesce(p_field, '')) || '%', p_max_annual_fee,
        least(greatest(coalesce(p_limit, 20), 1), 100), greatest(coalesce(p_offset, 0), 0), v_prefix;
end $$;

-- One course with every register field, its campuses, its provider, and the same course name at
-- other providers (for transfers and comparisons).
create or replace function public.get_course(p_code text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'course_code', c.code, 'course_name', c.name,
    'provider_code', p.code, 'provider_name', p.name, 'provider_type', p.type, 'website', p.website,
    'level', c.level, 'field_broad', c.foe1_broad, 'field_narrow', c.foe1_narrow, 'field_detailed', c.foe1_detailed,
    'duration_weeks', c.duration_weeks, 'tuition_fee', c.tuition_fee, 'non_tuition_fee', c.non_tuition_fee,
    'total_cost', c.total_cost, 'annual_tuition', c.annual_tuition,
    'work_component', c.work_component, 'dual_qualification', c.dual_qualification, 'foundation', c.foundation,
    'vet_code', c.vet_code, 'expired', c.expired,
    'campuses', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.location_name, 'city', l.city, 'state', l.state)
                       order by l.state, l.city, l.location_name)
      from public.edu_course_locations l where l.course_code = c.code), '[]'::jsonb),
    'foe2_broad', c.foe2_broad, 'foe2_narrow', c.foe2_narrow, 'foe2_detailed', c.foe2_detailed,
    'language', c.language,
    'work_hours_week', c.work_hours_week, 'work_weeks', c.work_weeks, 'work_total_hours', c.work_total_hours,
    'provider', jsonb_build_object(
      'code', p.code, 'name', p.name, 'trading_name', p.trading_name, 'type', p.type, 'capacity', p.capacity,
      'website', p.website, 'city', p.city, 'state', p.state, 'postcode', p.postcode),
    'same_course_elsewhere', coalesce((
      select jsonb_agg(s.j order by s.fee nulls last)
      from (
        select jsonb_build_object('course_code', o.code, 'provider_code', op.code, 'provider_name', op.name,
                                  'duration_weeks', o.duration_weeks, 'annual_tuition', o.annual_tuition) as j,
               o.annual_tuition as fee
        from public.edu_courses o join public.edu_providers op on op.code = o.provider_code
        where lower(o.name) = lower(c.name) and o.provider_code <> c.provider_code and not o.expired
        order by o.annual_tuition nulls last limit 8
      ) s), '[]'::jsonb),
    'same_course_elsewhere_count', (
      select count(*) from public.edu_courses o
      where lower(o.name) = lower(c.name) and o.provider_code <> c.provider_code and not o.expired),
    'updated_at', c.updated_at,
    'as_at', public.edu_as_at()
  )
  from public.edu_courses c join public.edu_providers p on p.code = c.provider_code
  where c.code = upper(btrim(p_code));
$$;

-- One provider: details, campuses, current courses by level, tuition range.
create or replace function public.get_provider(p_code text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'code', p.code, 'name', p.name, 'trading_name', p.trading_name, 'type', p.type, 'capacity', p.capacity,
    'website', p.website, 'city', p.city, 'state', p.state, 'postcode', p.postcode,
    'provider', jsonb_build_object(
      'code', p.code, 'name', p.name, 'trading_name', p.trading_name, 'type', p.type, 'capacity', p.capacity,
      'website', p.website, 'city', p.city, 'state', p.state, 'postcode', p.postcode),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'type', l.type, 'address', l.address, 'city', l.city,
                                          'state', l.state, 'postcode', l.postcode) order by l.state, l.city, l.name)
      from public.edu_locations l where l.provider_code = p.code), '[]'::jsonb),
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object('level', x.level, 'courses', x.n) order by x.n desc, x.level)
      from (select c.level, count(*) as n from public.edu_courses c
            where c.provider_code = p.code and not c.expired group by c.level) x), '[]'::jsonb),
    'course_count', (select count(*) from public.edu_courses c where c.provider_code = p.code and not c.expired),
    'research_courses', (select count(*) from public.edu_courses c where c.provider_code = p.code and not c.expired
                           and c.level in ('Masters Degree (Research)', 'Doctoral Degree')),
    'expired_courses', (select count(*) from public.edu_courses c where c.provider_code = p.code and c.expired),
    'annual_tuition_range', (
      select jsonb_build_object('min', min(c.annual_tuition), 'median',
                                round(percentile_cont(0.5) within group (order by c.annual_tuition)::numeric),
                                'max', max(c.annual_tuition))
      from public.edu_courses c where c.provider_code = p.code and not c.expired and c.annual_tuition > 0),
    'as_at', public.edu_as_at()
  )
  from public.edu_providers p
  where p.code = upper(btrim(p_code));
$$;

create or replace function public.course_levels() returns table (level text, courses bigint)
language sql stable security invoker set search_path = '' as $$
  select c.level, count(*) from public.edu_courses c
  where not c.expired and c.level is not null group by c.level order by count(*) desc, c.level;
$$;

create or replace function public.course_fields() returns table (field text, courses bigint)
language sql stable security invoker set search_path = '' as $$
  select c.foe1_broad, count(*) from public.edu_courses c
  where not c.expired and c.foe1_broad is not null group by c.foe1_broad order by c.foe1_broad;
$$;

-- True when a host (or URL) belongs to a CRICOS provider's website, or to any .gov.au or .edu.au
-- site. Subdomains count ("handbook.monash.edu.au"). A ".edu" host also counts when the same name
-- under ".edu.au" is a provider's (Monash moved to monash.edu); .edu is open only to accredited
-- institutions.
create or replace function public.official_domain(p_host text) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare
  h text := lower(btrim(coalesce(p_host, '')));
  labels text[];
  candidates text[] := '{}';
  i int;
begin
  h := regexp_replace(h, '^[a-z][a-z0-9+.-]*://', '');
  h := split_part(split_part(split_part(h, '/', 1), '?', 1), '#', 1);
  h := regexp_replace(h, '^.*@', '');
  h := regexp_replace(h, ':[0-9]*$', '');
  h := rtrim(h, '.');
  h := regexp_replace(h, '^www[0-9]?\.', '');
  if h = '' or h !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then return false; end if;
  if h ~ '\.(gov|edu)\.au$' then return true; end if;
  labels := string_to_array(h, '.');
  for i in 1 .. cardinality(labels) - 1 loop
    candidates := candidates || array_to_string(labels[i:], '.');
  end loop;
  if h ~ '\.edu$' then
    candidates := candidates || array(select c || '.au' from unnest(candidates) c where c ~ '\.edu$');
  end if;
  return exists (select 1 from public.edu_providers p where p.domains && candidates);
end $$;

-- ─────────────────────────────── Worker API ───────────────────────────────

-- Upsert one batch of register rows. p_kind: providers | courses | locations | course_locations.
-- Rows whose parent is missing are skipped; returns the number of rows written.
create or replace function public.worker_cricos_upsert(p_token text, p_kind text, p_rows jsonb, p_run text)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.check_worker(p_token);
  if p_run is null or p_run = '' then raise exception 'run required'; end if;
  insert into public.edu_import_runs (run) values (p_run) on conflict (run) do nothing;

  if p_kind = 'providers' then
    insert into public.edu_providers as t (code, name, trading_name, type, capacity, website, domains, city, state, postcode, seen_run)
    select distinct on (r.code) r.code, r.name, r.trading_name, r.type, r.capacity, r.website, coalesce(r.domains, '{}'),
           r.city, r.state, r.postcode, p_run
    from jsonb_to_recordset(p_rows) as r(code text, name text, trading_name text, type text, capacity int, website text,
                                         domains text[], city text, state text, postcode text)
    where r.code is not null and r.name is not null
    order by r.code
    on conflict (code) do update set
      name = excluded.name, trading_name = excluded.trading_name, type = excluded.type, capacity = excluded.capacity,
      website = excluded.website, domains = excluded.domains, city = excluded.city, state = excluded.state,
      postcode = excluded.postcode, seen_run = excluded.seen_run,
      updated_at = case when (t.name, t.trading_name, t.type, t.capacity, t.website, t.domains, t.city, t.state, t.postcode)
                        is distinct from (excluded.name, excluded.trading_name, excluded.type, excluded.capacity,
                                          excluded.website, excluded.domains, excluded.city, excluded.state, excluded.postcode)
                        then now() else t.updated_at end;

  elsif p_kind = 'courses' then
    insert into public.edu_courses as t (code, provider_code, provider_names, name, vet_code, dual_qualification,
      foe1_broad, foe1_narrow, foe1_detailed, foe2_broad, foe2_narrow, foe2_detailed, level, foundation, work_component,
      work_hours_week, work_weeks, work_total_hours, language, duration_weeks, tuition_fee, non_tuition_fee, total_cost,
      expired, seen_run)
    select distinct on (r.code) r.code, r.provider_code, concat_ws(' ', p.name, p.trading_name), r.name, r.vet_code,
           r.dual_qualification, r.foe1_broad, r.foe1_narrow, r.foe1_detailed, r.foe2_broad, r.foe2_narrow, r.foe2_detailed,
           r.level, r.foundation, r.work_component, r.work_hours_week, r.work_weeks, r.work_total_hours, r.language,
           r.duration_weeks, r.tuition_fee, r.non_tuition_fee, r.total_cost, coalesce(r.expired, false), p_run
    from jsonb_to_recordset(p_rows) as r(code text, provider_code text, name text, vet_code text, dual_qualification boolean,
      foe1_broad text, foe1_narrow text, foe1_detailed text, foe2_broad text, foe2_narrow text, foe2_detailed text,
      level text, foundation boolean, work_component boolean, work_hours_week numeric, work_weeks int,
      work_total_hours numeric, language text, duration_weeks int, tuition_fee numeric, non_tuition_fee numeric,
      total_cost numeric, expired boolean)
    join public.edu_providers p on p.code = r.provider_code
    where r.code is not null and r.name is not null
    order by r.code
    on conflict (code) do update set
      provider_code = excluded.provider_code, provider_names = excluded.provider_names, name = excluded.name,
      vet_code = excluded.vet_code, dual_qualification = excluded.dual_qualification,
      foe1_broad = excluded.foe1_broad, foe1_narrow = excluded.foe1_narrow, foe1_detailed = excluded.foe1_detailed,
      foe2_broad = excluded.foe2_broad, foe2_narrow = excluded.foe2_narrow, foe2_detailed = excluded.foe2_detailed,
      level = excluded.level, foundation = excluded.foundation, work_component = excluded.work_component,
      work_hours_week = excluded.work_hours_week, work_weeks = excluded.work_weeks,
      work_total_hours = excluded.work_total_hours, language = excluded.language,
      duration_weeks = excluded.duration_weeks, tuition_fee = excluded.tuition_fee,
      non_tuition_fee = excluded.non_tuition_fee, total_cost = excluded.total_cost, expired = excluded.expired,
      seen_run = excluded.seen_run,
      updated_at = case when (t.provider_code, t.provider_names, t.name, t.vet_code, t.dual_qualification, t.foe1_broad,
                              t.foe1_narrow, t.foe1_detailed, t.foe2_broad, t.foe2_narrow, t.foe2_detailed, t.level,
                              t.foundation, t.work_component, t.work_hours_week, t.work_weeks, t.work_total_hours,
                              t.language, t.duration_weeks, t.tuition_fee, t.non_tuition_fee, t.total_cost, t.expired)
                        is distinct from
                             (excluded.provider_code, excluded.provider_names, excluded.name, excluded.vet_code,
                              excluded.dual_qualification, excluded.foe1_broad, excluded.foe1_narrow, excluded.foe1_detailed,
                              excluded.foe2_broad, excluded.foe2_narrow, excluded.foe2_detailed, excluded.level,
                              excluded.foundation, excluded.work_component, excluded.work_hours_week, excluded.work_weeks,
                              excluded.work_total_hours, excluded.language, excluded.duration_weeks, excluded.tuition_fee,
                              excluded.non_tuition_fee, excluded.total_cost, excluded.expired)
                        then now() else t.updated_at end;

  elsif p_kind = 'locations' then
    insert into public.edu_locations as t (provider_code, name, type, address, city, state, postcode, seen_run)
    select distinct on (r.provider_code, r.name) r.provider_code, r.name, r.type, r.address, r.city, r.state, r.postcode, p_run
    from jsonb_to_recordset(p_rows) as r(provider_code text, name text, type text, address text, city text, state text, postcode text)
    where r.name is not null and exists (select 1 from public.edu_providers p where p.code = r.provider_code)
    order by r.provider_code, r.name
    on conflict (provider_code, name) do update set
      type = excluded.type, address = excluded.address, city = excluded.city, state = excluded.state,
      postcode = excluded.postcode, seen_run = excluded.seen_run;

  elsif p_kind = 'course_locations' then
    insert into public.edu_course_locations as t (provider_code, course_code, location_name, city, state, seen_run)
    select distinct on (r.course_code, r.location_name) r.provider_code, r.course_code, r.location_name, r.city, r.state, p_run
    from jsonb_to_recordset(p_rows) as r(provider_code text, course_code text, location_name text, city text, state text)
    where r.location_name is not null and exists (select 1 from public.edu_courses c where c.code = r.course_code)
    order by r.course_code, r.location_name
    on conflict (course_code, location_name) do update set
      provider_code = excluded.provider_code, city = excluded.city, state = excluded.state, seen_run = excluded.seen_run;

  else
    raise exception 'unknown kind %', p_kind;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- Close a run: courses the register no longer lists are marked expired (kept, so shortlists still
-- resolve), campuses it no longer lists are removed, and the run is recorded with its counts.
-- Refuses when the run saw under half the courses already held (an interrupted import).
create or replace function public.worker_cricos_finish(p_token text, p_run text, p_as_at date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  seen int; held int; expired_now int; removed_locations int; removed_course_locations int; v_counts jsonb;
begin
  perform private.check_worker(p_token);
  select count(*) into seen from public.edu_courses where seen_run = p_run;
  select count(*) into held from public.edu_courses where not expired;
  if seen = 0 or seen < held / 2 then
    raise exception 'import % looks incomplete: % courses seen, % held', p_run, seen, held;
  end if;

  update public.edu_courses set expired = true, updated_at = now()
  where seen_run is distinct from p_run and not expired;
  get diagnostics expired_now = row_count;
  delete from public.edu_course_locations where seen_run is distinct from p_run;
  get diagnostics removed_course_locations = row_count;
  delete from public.edu_locations where seen_run is distinct from p_run;
  get diagnostics removed_locations = row_count;

  v_counts := jsonb_build_object(
    'providers', (select count(*) from public.edu_providers where seen_run = p_run),
    'courses', seen,
    'courses_current', (select count(*) from public.edu_courses where not expired),
    'courses_expired', (select count(*) from public.edu_courses where expired),
    'locations', (select count(*) from public.edu_locations),
    'course_locations', (select count(*) from public.edu_course_locations),
    'newly_expired', expired_now,
    'removed_locations', removed_locations,
    'removed_course_locations', removed_course_locations);
  update public.edu_import_runs
     set finished_at = now(), source_as_at = p_as_at, counts = public.edu_import_runs.counts || v_counts
   where run = p_run;
  return v_counts;
end $$;

-- The last finished import (or null), so the worker can tell when the data is stale.
create or replace function public.worker_cricos_last_run(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  return (select to_jsonb(r) from public.edu_import_runs r where r.finished_at is not null
          order by r.finished_at desc limit 1);
end $$;

-- Lets the worker attach details (such as the source file timestamps) to a run before it finishes.
create or replace function public.worker_cricos_note(p_token text, p_run text, p_counts jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  insert into public.edu_import_runs (run, counts) values (p_run, coalesce(p_counts, '{}'))
  on conflict (run) do update set counts = public.edu_import_runs.counts || coalesce(excluded.counts, '{}');
end $$;

-- ───────────────────────────── Permissions ─────────────────────────────

revoke all on public.edu_providers, public.edu_courses, public.edu_locations, public.edu_course_locations,
  public.edu_import_runs from anon, authenticated;
grant select on public.edu_providers, public.edu_courses, public.edu_locations, public.edu_course_locations,
  public.edu_import_runs to anon, authenticated;
revoke all on public.course_shortlist, public.client_logs from anon, authenticated;
grant select, insert, update, delete on public.course_shortlist to authenticated;
grant insert on public.client_logs to authenticated;
grant usage on sequence public.client_logs_id_seq to authenticated;

revoke execute on function private.client_logs_trim() from public, anon, authenticated;
revoke execute on function
  public.edu_as_at(),
  public.search_courses(text, text[], text, text, text, text, numeric, boolean, boolean, text, int, int),
  public.get_course(text), public.get_provider(text), public.course_levels(), public.course_fields(),
  public.official_domain(text),
  public.worker_cricos_upsert(text, text, jsonb, text), public.worker_cricos_finish(text, text, date),
  public.worker_cricos_last_run(text), public.worker_cricos_note(text, text, jsonb)
  from public;
grant execute on function
  public.edu_as_at(),
  public.search_courses(text, text[], text, text, text, text, numeric, boolean, boolean, text, int, int),
  public.get_course(text), public.get_provider(text), public.course_levels(), public.course_fields(),
  public.official_domain(text),
  public.worker_cricos_upsert(text, text, jsonb, text), public.worker_cricos_finish(text, text, date),
  public.worker_cricos_last_run(text), public.worker_cricos_note(text, text, jsonb)
  to anon, authenticated;

-- First-import path (insert only), used while the full refresh functions above await approval to
-- be applied: rows are inserted, never changed or removed.
-- (Applied live as worker_cricos_insert / worker_cricos_record; see worker/cricos.py.)
