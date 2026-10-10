-- Full occupation search also matches the other titles Jobs and Skills Australia lists for an occupation, as the
-- type-ahead suggestions do ("software developer" finds Software Engineer).

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
  with q0 as (
    select nullif(btrim(left(p_query, 120)), '') as q,
           substring(coalesce(p_query, '') from '\m(\d{4,6})\M') as digits
  ),
  q as (
    -- Occupations whose other titles (Jobs and Skills Australia, OSCA) match: "software developer".
    select q0.*, coalesce((
      select array_agg(distinct p.anzsco)
      from public.occupation_profiles p
      cross join lateral jsonb_array_elements_text(coalesce(p.data #> '{osca,other_titles}', '[]')) as t(other)
      where q0.q is not null and length(q0.q) >= 3 and length(p.anzsco) = 6 and t.other ilike '%' || q0.q || '%'
    ), '{}') as also
    from q0
  ),
  hits as (
    select s.*,
           case
             when q.q is null then 0
             when s.code = q.digits then 3
             when lower(s.title) = lower(q.q) then 2.5
             when s.title ilike q.q || '%' then 2
             when s.title ilike '%' || q.q || '%' then 1
             when s.code = any(q.also) then 0.9
             else ts_rank(s.search, plainto_tsquery('english', q.q))
           end as rank
    from private.occupation_summary(p_state) s
    cross join q
    where (q.q is null or (q.digits is not null and s.code like q.digits || '%')
           or private.occupation_matches(s.title, s.authorities, s.search, q.q)
           or s.code = any(q.also))
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

revoke execute on function public.search_occupations(text, text, text, text, text, text, int, int) from public;
grant execute on function public.search_occupations(text, text, text, text, text, text, int, int) to anon, authenticated;
