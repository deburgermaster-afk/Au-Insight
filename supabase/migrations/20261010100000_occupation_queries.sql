-- Read functions behind the Jobs tab and the chat's occupation tools: search the skilled occupation lists,
-- one occupation in full, the latest SkillSelect rounds, and "where are invitations easiest?". They read only
-- public data, and run as their owner so the helpers can stay in the private schema (which API roles can't use).
--
-- Codes: occupations.anzsco is the list's key (the ANZSCO 2013 code, "-2022" appended where the list has a
-- second entry); occupations.code is its six digits and code_2022 the ANZSCO 2022 code. Jobs and Skills
-- Australia's shortage list uses ANZSCO 2022 codes; its occupation profiles use ANZSCO 2013 codes (six-digit
-- occupations, or the four-digit unit group when an occupation has no profile of its own).

-- Whether an occupation matches a field or keyword ("IT" means the occupations ACS assesses).
create or replace function private.occupation_matches(p_title text, p_authorities text[], p_search tsvector, p_q text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when nullif(btrim(p_q), '') is null then true
    when lower(btrim(p_q)) in ('it', 'ict', 'tech', 'computing', 'information technology', 'computer science',
                               'software', 'computers', 'information and communication technology')
      then 'ACS' = any(p_authorities)
    else p_title ilike '%' || btrim(p_q) || '%'
      or p_search @@ plainto_tsquery('english', p_q)
      or exists (select 1 from unnest(p_authorities) a where a ilike btrim(p_q))
  end
$$;

-- The window "the last 12 months" is measured back from the latest published round, so it still means the
-- recent rounds when there has been a long gap between them.
create or replace function private.rounds_since() returns date
language sql stable set search_path = '' as $$
  select coalesce(max(round_date), current_date) - 365 from public.skillselect_rounds
$$;

-- One row per listed occupation with its shortage rating, labour data and invitation summary.
create or replace function private.occupation_summary(p_state text default null)
returns table (
  anzsco text, code text, title text, lists text[], visa_subclasses text[], authorities text[], search tsvector,
  shortage_national text, shortage_state text, last_min_points_189 int, last_invited_round date,
  lowest_points_12m int, rounds_invited_12m int, employed int, median_weekly_earnings numeric
)
language sql stable set search_path = '' as $$
  with since as (select private.rounds_since() as d)
  select o.anzsco, o.code, o.title, o.lists, o.visa_subclasses, o.authorities, o.search,
         s.national,
         case upper(btrim(p_state))
           when 'NSW' then s.nsw when 'VIC' then s.vic when 'QLD' then s.qld when 'SA' then s.sa
           when 'WA' then s.wa when 'TAS' then s.tas when 'NT' then s.nt when 'ACT' then s.act
         end,
         l.min_points, inv.last_round, inv.lowest, coalesce(inv.rounds, 0)::int,
         p.employed, p.median_weekly_earnings
  from public.occupations o
  cross join since
  left join lateral (
    select * from public.occupation_shortage x
    where x.anzsco = coalesce(o.code_2022, o.code) and x.listed order by x.year desc limit 1
  ) s on true
  left join lateral (
    select * from public.occupation_profiles x where x.anzsco in (o.code, left(o.code, 4))
    order by length(x.anzsco) desc limit 1
  ) p on true
  left join lateral (
    select r.min_points from public.skillselect_round_occupations r
    where r.anzsco = o.anzsco and r.subclass = '189' and r.listed order by r.round_date desc limit 1
  ) l on true
  left join lateral (
    select max(r.round_date) as last_round,
           min(r.min_points) filter (where r.round_date > since.d) as lowest,
           count(distinct r.round_date) filter (where r.round_date > since.d) as rounds
    from public.skillselect_round_occupations r where r.anzsco = o.anzsco and r.listed
  ) inv on true
  where o.listed
$$;

create or replace function public.search_occupations(
  p_query text default null,
  p_list text default null,
  p_visa text default null,
  p_authority text default null,
  p_shortage text default null,
  p_state text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  anzsco text, title text, lists text[], visas text[], authorities text[], shortage_national text,
  shortage_state text, last_min_points_189 int, last_invited_round date, rounds_invited_12m int,
  employed int, median_weekly_earnings numeric, total_count bigint
)
language sql stable security definer set search_path = '' as $$
  with q as (
    select nullif(btrim(left(p_query, 120)), '') as q,
           substring(coalesce(p_query, '') from '\m(\d{4,6})\M') as digits
  ),
  hits as (
    select s.*,
           case
             when q.q is null then 0
             when s.code = q.digits then 3
             when lower(s.title) = lower(q.q) then 2.5
             when s.title ilike q.q || '%' then 2
             when s.title ilike '%' || q.q || '%' then 1
             else ts_rank(s.search, plainto_tsquery('english', q.q))
           end as rank
    from private.occupation_summary(p_state) s
    cross join q
    where (q.q is null or (q.digits is not null and s.code like q.digits || '%')
           or private.occupation_matches(s.title, s.authorities, s.search, q.q))
      and (nullif(btrim(p_list), '') is null or upper(btrim(p_list)) = any(s.lists))
      and (nullif(btrim(p_visa), '') is null or substring(p_visa from '\d{3}') = any(s.visa_subclasses))
      and (nullif(btrim(p_authority), '') is null
           or exists (select 1 from unnest(s.authorities) a where a ilike '%' || btrim(p_authority) || '%'))
      and (nullif(btrim(p_shortage), '') is null
           or (coalesce(s.shortage_state, s.shortage_national) ilike '%shortage%'
               and coalesce(s.shortage_state, s.shortage_national) not ilike 'no %'))
  )
  select h.anzsco, h.title, h.lists, h.visa_subclasses, h.authorities, h.shortage_national, h.shortage_state,
         h.last_min_points_189, h.last_invited_round, h.rounds_invited_12m, h.employed, h.median_weekly_earnings,
         count(*) over ()
  from hits h
  order by h.rank desc, h.rounds_invited_12m desc, h.employed desc nulls last, h.title
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.get_occupation(p_anzsco text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with o as (
    select * from public.occupations x
    where x.anzsco = btrim(p_anzsco) or x.code = left(btrim(p_anzsco), 6) or x.code_2022 = left(btrim(p_anzsco), 6)
    order by (x.anzsco = btrim(p_anzsco)) desc, x.listed desc, length(x.anzsco)
    limit 1
  ),
  prof as (
    select p.* from public.occupation_profiles p, o where p.anzsco in (o.code, left(o.code, 4))
    order by length(p.anzsco) desc limit 1
  )
  select jsonb_build_object(
    'occupation', jsonb_build_object(
      'anzsco', o.anzsco, 'code', o.code, 'title', o.title, 'anzsco_2022', o.code_2022, 'lists', o.lists,
      'visas', o.visas, 'visa_subclasses', o.visa_subclasses, 'caveats', o.caveats,
      'assessing_authorities', o.assessing_authorities, 'authorities', o.authorities,
      'anzsco_links', o.anzsco_links, 'listed', o.listed, 'source_url', o.source_url, 'updated_at', o.updated_at),
    'shortage', coalesce((
      select jsonb_agg(jsonb_build_object('year', s.year, 'title', s.title, 'national', s.national, 'nsw', s.nsw,
               'vic', s.vic, 'qld', s.qld, 'sa', s.sa, 'wa', s.wa, 'tas', s.tas, 'nt', s.nt, 'act', s.act,
               'source_url', s.source_url) order by s.year desc)
      from public.occupation_shortage s where s.anzsco = coalesce(o.code_2022, o.code) and s.listed), '[]'),
    'profile', coalesce((
      select jsonb_strip_nulls(jsonb_build_object(
               'anzsco', p.anzsco, 'title', p.title, 'level', p.data ->> 'level', 'employed', p.employed,
               'median_weekly_earnings', p.median_weekly_earnings, 'part_time_share', p.part_time_share,
               'female_share', p.female_share, 'median_age', p.median_age, 'annual_growth', p.annual_growth,
               'growth_5yr', p.growth_5yr, 'projected_growth', p.projected_growth, 'as_at', p.as_at,
               'description', p.data ->> 'description', 'tasks', p.data -> 'tasks',
               'industries', p.data -> 'industries', 'states_pct', p.data -> 'states_pct',
               'education_pct', p.data -> 'education_pct', 'registration', p.data #>> '{osca,registration}',
               'other_titles', p.data #> '{osca,other_titles}', 'source_url', p.source_url))
      from prof p), '{}'),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object('round_date', r.round_date, 'subclass', r.subclass,
               'min_points', r.min_points, 'invited', r.invited, 'program_year', rd.program_year)
             order by r.round_date desc, r.subclass)
      from public.skillselect_round_occupations r
      left join public.skillselect_rounds rd on rd.round_date = r.round_date and rd.subclass = r.subclass
      where r.anzsco = o.anzsco and r.listed), '[]'),
    'rounds_published', (select count(distinct round_date) from public.skillselect_rounds where subclass = '189'),
    'next_round_189', (select value from public.skillselect_meta where key = 'next_round_189'),
    'as_at', jsonb_build_object(
      'list', o.updated_at::date,
      'rounds', (select max(round_date) from public.skillselect_rounds),
      'shortage_year', (select max(year) from public.occupation_shortage s where s.anzsco = coalesce(o.code_2022, o.code)),
      'profile', (select as_at from prof)),
    'sources', jsonb_build_array(
      jsonb_build_object('title', 'Skilled occupation list (Home Affairs)', 'url',
        coalesce(o.source_url, 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list')),
      jsonb_build_object('title', 'SkillSelect invitation rounds (Home Affairs)', 'url',
        'https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds'),
      jsonb_build_object('title', 'SkillSelect previous rounds (Home Affairs)', 'url',
        'https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/previous-rounds'),
      jsonb_build_object('title', 'Occupation Shortage List (Jobs and Skills Australia)', 'url',
        'https://www.jobsandskills.gov.au/data/occupation-shortage/occupation-shortage-list'),
      jsonb_build_object('title', 'Occupation profiles data (Jobs and Skills Australia)', 'url',
        'https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles'))
  )
  from o
$$;

create or replace function public.latest_rounds(p_limit int default 12)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rounds', coalesce((
      select jsonb_agg(x order by x.round_date desc, x.subclass)
      from (
        select r.round_date, r.subclass, r.subclass_name, r.invited, r.tie_break, r.program_year,
               (select count(*) from public.skillselect_round_occupations o
                 where o.round_date = r.round_date and o.subclass = r.subclass and o.listed) as occupations,
               (select min(o.min_points) from public.skillselect_round_occupations o
                 where o.round_date = r.round_date and o.subclass = r.subclass and o.listed) as lowest_points
        from public.skillselect_rounds r
        order by r.round_date desc, r.subclass
        limit least(greatest(coalesce(p_limit, 12), 1), 60)
      ) x), '[]'),
    'next_round', (select value from public.skillselect_meta where key = 'next_round_189'),
    'next_round_text', (select value from public.skillselect_meta where key = 'next_round_189_text'),
    'state_nominations', coalesce((
      select jsonb_agg(jsonb_build_object('program_year', n.program_year, 'as_of', n.as_of, 'subclass', n.subclass,
               'state', n.state, 'nominations', n.nominations) order by n.subclass, n.state)
      from public.state_nominations n
      where n.program_year = (select max(program_year) from public.state_nominations)), '[]'),
    'monthly_totals', coalesce((
      select jsonb_object_agg(substr(m.key, 16), m.value::jsonb)
      from public.skillselect_meta m where m.key like 'monthly\_totals\_%' and m.value ~ '^\s*\{'), '{}'),
    'source_url', 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds'
  )
$$;

create or replace function public.rank_occupations(
  p_max_points int default null,
  p_lists text[] default null,
  p_visa text default null,
  p_field text default null,
  p_state text default null,
  p_limit int default 25
)
returns table (
  anzsco text, title text, lists text[], visas text[], authorities text[], shortage_national text,
  shortage_state text, last_min_points_189 int, last_invited_round date, rounds_invited_12m int,
  lowest_points_12m int, employed int, median_weekly_earnings numeric, why text
)
language sql stable security definer set search_path = '' as $$
  with since as (select private.rounds_since() as d),
  total as (
    select count(distinct round_date) as n from public.skillselect_rounds r, since
    where r.round_date > since.d and r.invited > 0
  ),
  c as (
    select s.*, coalesce(s.last_min_points_189, s.lowest_points_12m) as pts
    from private.occupation_summary(p_state) s, since
    where s.rounds_invited_12m > 0 and s.last_invited_round > since.d
      and (p_lists is null or s.lists && (select array_agg(upper(x)) from unnest(p_lists) x))
      and (nullif(btrim(p_visa), '') is null or substring(p_visa from '\d{3}') = any(s.visa_subclasses))
      and private.occupation_matches(s.title, s.authorities, s.search, p_field)
  )
  select c.anzsco, c.title, c.lists, c.visa_subclasses, c.authorities, c.shortage_national, c.shortage_state,
         c.last_min_points_189, c.last_invited_round, c.rounds_invited_12m, c.lowest_points_12m, c.employed,
         c.median_weekly_earnings,
         concat_ws('; ',
           format('Invited in %s of the last %s rounds', c.rounds_invited_12m, greatest(total.n, c.rounds_invited_12m)),
           case when c.pts is not null then format('latest minimum %s points (%s)', c.pts, to_char(c.last_invited_round, 'FMDD Mon YYYY')) end,
           case when c.lowest_points_12m is not null and c.lowest_points_12m < c.pts
                then format('lowest %s in 12 months', c.lowest_points_12m) end,
           case when coalesce(c.shortage_state, c.shortage_national) ilike '%shortage%'
                 and coalesce(c.shortage_state, c.shortage_national) not ilike 'no %'
                then lower(coalesce(c.shortage_state, c.shortage_national))
                     || case when c.shortage_state is not null then ' in ' || upper(p_state) else ' nationally' end end)
  from c, total
  where p_max_points is null or c.pts <= p_max_points
  order by c.pts asc nulls last, c.rounds_invited_12m desc,
           (coalesce(c.shortage_state, c.shortage_national) ilike 'shortage%') desc, c.employed desc nulls last, c.title
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
$$;

revoke execute on function private.occupation_matches(text, text[], tsvector, text) from public;
revoke execute on function private.rounds_since() from public;
revoke execute on function private.occupation_summary(text) from public;
revoke execute on function public.search_occupations(text, text, text, text, text, text, int, int) from public;
revoke execute on function public.get_occupation(text) from public;
revoke execute on function public.latest_rounds(int) from public;
revoke execute on function public.rank_occupations(int, text[], text, text, text, int) from public;
grant execute on function public.search_occupations(text, text, text, text, text, text, int, int) to anon, authenticated;
grant execute on function public.get_occupation(text) to anon, authenticated;
grant execute on function public.latest_rounds(int) to anon, authenticated;
grant execute on function public.rank_occupations(int, text[], text, text, text, int) to anon, authenticated;
