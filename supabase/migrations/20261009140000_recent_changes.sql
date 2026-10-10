-- Recent official changes: pages in the corpus that announce or explain a change (titles or URLs
-- about changes, new rules, updates, news), ranked by relevance to a topic, newest first. The chat
-- checks these before answering, so a newer rule always wins over an older page.
create or replace function public.recent_law_changes(p_query text default null, p_limit int default 8)
returns table (title text, url text, section text, snippet text, mentions_date text, fetched_at timestamptz, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select case when nullif(btrim(p_query), '') is null then null
                else replace(plainto_tsquery('english', p_query)::text, ' & ', ' | ')::tsquery end as tsq
  ),
  docs as (
    select d.id, d.title, d.url, d.current_version_id
    from public.law_documents d
    join public.law_sources s on s.id = d.source_id
    where d.current_version_id is not null and coalesce(s.category, '') <> 'university'
      and (d.title ~* '(change|new rule|updat|announce|reform|amend|introduc|from [0-9]{1,2} [a-z]+ 20[0-9]{2})'
           or d.url ~* '(news|media-release|changes|whats-new|announcement|update)')
  )
  select d.title, d.url, array_to_string(x.heading_path[2:], ' › '), left(x.content, 700),
         substring(x.content from '((?:[0-9]{1,2} )?(?:January|February|March|April|May|June|July|August|September|October|November|December) 20[0-9]{2})'),
         v.fetched_at, coalesce(ts_rank(x.fts, q.tsq), 0)::real
  from docs d
  cross join q
  join public.law_document_versions v on v.id = d.current_version_id
  join lateral (
    select ls.heading_path, ls.content, ls.fts from public.law_sections ls
    where ls.version_id = d.current_version_id and (q.tsq is null or ls.fts @@ q.tsq)
    order by ts_rank(ls.fts, q.tsq) desc nulls last, ls.ordinal limit 1
  ) x on true
  order by coalesce(ts_rank(x.fts, q.tsq), 0) desc, v.fetched_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke execute on function public.recent_law_changes(text, int) from public;
grant execute on function public.recent_law_changes(text, int) to anon, authenticated;
