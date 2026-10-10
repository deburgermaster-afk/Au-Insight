-- Type-ahead suggestions for the occupation search: matches the official title (whole title or the start of a
-- word), the ANZSCO code, and the other titles Jobs and Skills Australia lists for the occupation ("Software
-- Developer" finds Software Engineer). Text is matched first, so only the top matches get their latest
-- invitation and shortage rating.

create or replace function public.suggest_occupations(p_query text, p_limit int default 8)
returns table (
  anzsco text, code text, title text, hint text, lists text[], last_min_points_189 int, last_invited_round date,
  shortage_national text
)
language sql stable security definer set search_path = '' as $$
  with q as (
    select btrim(regexp_replace(lower(left(coalesce(p_query, ''), 80)), '[^a-z0-9]+', ' ', 'g')) as q,
           substring(coalesce(p_query, '') from '(\d{2,6})') as digits
  ),
  candidates as (
    -- The official title, or the ANZSCO code.
    select o.anzsco, o.code, o.title, o.lists,
           case when q.digits is not null and o.code like q.digits || '%' then 'ANZSCO ' || o.code end as hint,
           case
             when q.digits is not null and o.code like q.digits || '%' then 4
             when lower(o.title) like q.q || '%' then 3
             when ' ' || regexp_replace(lower(o.title), '[^a-z0-9]+', ' ', 'g') like '% ' || q.q || '%' then 2
             when length(q.q) >= 3 and lower(o.title) like '%' || q.q || '%' then 1
             else 0
           end as score
    from public.occupations o, q
    where o.listed and q.q <> ''
    union all
    -- Other titles JSA lists for the occupation (OSCA, 2021 Census).
    select o.anzsco, o.code, o.title, o.lists, 'Also called ' || t.other,
           case when lower(t.other) like q.q || '%' then 2.5 else 1.5 end
    from q
    join public.occupation_profiles p on length(p.anzsco) = 6
    cross join lateral jsonb_array_elements_text(coalesce(p.data #> '{osca,other_titles}', '[]')) as t(other)
    join public.occupations o on o.code = p.anzsco and o.listed
    where length(q.q) >= 2
      and ' ' || regexp_replace(lower(t.other), '[^a-z0-9]+', ' ', 'g') like '% ' || q.q || '%'
    union all
    -- "IT": the occupations the Australian Computer Society assesses.
    select o.anzsco, o.code, o.title, o.lists, 'IT occupation (assessed by ACS)', 0.8
    from public.occupations o, q
    where o.listed and q.q in ('it', 'ict', 'tech', 'computing') and 'ACS' = any(o.authorities)
  ),
  best as (
    select distinct on (c.anzsco) c.* from candidates c where c.score > 0
    order by c.anzsco, c.score desc, c.hint nulls first
  ),
  top as (
    select * from best order by score desc, length(title), title
    limit least(greatest(coalesce(p_limit, 8), 1), 20)
  )
  select t.anzsco, t.code, t.title, t.hint, t.lists, l.min_points, l.round_date, s.national
  from top t
  left join lateral (
    select r.min_points, r.round_date from public.skillselect_round_occupations r
    where r.anzsco = t.anzsco and r.subclass = '189' and r.listed order by r.round_date desc limit 1
  ) l on true
  left join lateral (
    select x.national from public.occupation_shortage x
    join public.occupations o on o.anzsco = t.anzsco
    where x.anzsco = coalesce(o.code_2022, o.code) and x.listed order by x.year desc limit 1
  ) s on true
  order by t.score desc, length(t.title), t.title
$$;

revoke execute on function public.suggest_occupations(text, int) from public;
grant execute on function public.suggest_occupations(text, int) to anon, authenticated;
