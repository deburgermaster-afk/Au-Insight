-- Better keyword ranking: favour sections that match more of the query's terms
-- (coverage squared), damp very long sections (log-length normalisation), and skip
-- tiny fragments. Vector results still fuse in with Reciprocal Rank Fusion.
create or replace function public.search_law(
  query_text text,
  query_embedding extensions.vector(1024) default null,
  match_count int default 8,
  as_at timestamptz default now()
)
returns table (
  section_id bigint,
  url text,
  title text,
  heading_path text[],
  content text,
  version_fetched_at timestamptz,
  score double precision
)
language sql stable security invoker
set search_path = public, extensions
as $$
  with terms as (
    select tsvector_to_array(to_tsvector('english', query_text)) as lx
  ),
  q as (
    select to_tsquery('english', coalesce(nullif(array_to_string(lx, ' | '), ''), 'xyzzy')) as q,
           greatest(coalesce(array_length(lx, 1), 0), 1) as n, lx
    from terms
  ),
  in_force as (
    select s.*, d.url, d.title, v.fetched_at
    from law_sections s
    join law_document_versions v on v.id = s.version_id
    join law_documents d on d.id = v.document_id
    where v.valid_from <= as_at and (v.valid_to is null or v.valid_to > as_at)
      and length(s.content) >= 40
  ),
  kw_scored as (
    select i.id,
           power((select count(*) from unnest(q.lx) l where i.fts @@ to_tsquery('english', l))::float / q.n, 2)
             * ts_rank_cd(i.fts, q.q, 1) as s
    from in_force i, q
    where i.fts @@ q.q
  ),
  kw as (
    select id, row_number() over (order by s desc) as r from kw_scored order by s desc limit match_count * 4
  ),
  vec as (
    select id, row_number() over (order by embedding <=> query_embedding) as r
    from in_force
    where query_embedding is not null and embedding is not null
    order by embedding <=> query_embedding
    limit match_count * 4
  ),
  fused as (
    select coalesce(kw.id, vec.id) as id,
           coalesce(1.0 / (60 + kw.r), 0) + coalesce(1.0 / (60 + vec.r), 0) as score
    from kw full outer join vec on kw.id = vec.id
  )
  select f.id, i.url, i.title, i.heading_path, i.content, i.fetched_at, f.score
  from fused f join in_force i on i.id = f.id
  order by f.score desc
  limit match_count;
$$;

grant execute on function public.search_law(text, extensions.vector, int, timestamptz) to authenticated;
