-- Re-parsing stored pages with a newer section parser, without re-fetching them,
-- and without the re-parse showing up as a law change.
--
-- The worker prefixes content hashes with its parser version ("p2:<sha256>").
-- A current version without that prefix was split by an older parser.

alter table public.law_changes add column if not exists reason text not null default 'content'
  check (reason in ('content', 'reparse'));

create or replace function public.worker_reparse_batch(p_token text, p_parser text, p_limit int default 20)
returns table (source_id text, url text, title text, doc_type text, markdown text, valid_from timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  return query
  select d.source_id, d.url, d.title, d.doc_type, v.markdown, v.valid_from
  from public.law_documents d
  join public.law_document_versions v on v.id = d.current_version_id
  where v.content_hash not like p_parser || ':%'
  order by d.id
  limit p_limit;
end $$;

-- Same as before, plus: a new version whose text is identical to the old one is a re-parse.
create or replace function public.worker_finish_page(p_token text, p_queue_id bigint, p_version_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare doc_id bigint; old_version bigint; changed text[]; same_text boolean;
begin
  perform private.check_worker(p_token);
  select document_id into doc_id from public.law_document_versions where id = p_version_id;
  select current_version_id into old_version from public.law_documents where id = doc_id;

  select coalesce(array_agg(array_to_string(n.heading_path, ' > ') order by n.ordinal), '{}') into changed
  from public.law_sections n
  where n.version_id = p_version_id
    and (old_version is null or n.content_hash not in (select content_hash from public.law_sections where version_id = old_version));

  select o.markdown = n.markdown into same_text
  from public.law_document_versions n, public.law_document_versions o
  where n.id = p_version_id and o.id = old_version;

  update public.law_document_versions set valid_to = now() where id = old_version and id <> p_version_id;
  update public.law_document_versions set valid_to = null where id = p_version_id;
  update public.law_documents set current_version_id = p_version_id, last_seen_at = now() where id = doc_id;
  insert into public.law_changes (document_id, old_version_id, new_version_id, changed_sections, reason)
  values (doc_id, old_version, p_version_id, changed[1:200], case when same_text then 'reparse' else 'content' end);
  update public.crawl_queue
     set status = 'done', done_at = now(), changed_at = case when same_text then changed_at else now() end,
         last_error = null, locked_by = null
   where id = p_queue_id;
  return jsonb_build_object('changed_sections', coalesce(array_length(changed, 1), 0), 'reparse', coalesce(same_text, false));
end $$;

create or replace function public.recent_law_changes(p_limit int default 30)
returns table (detected_at timestamptz, source_id text, title text, url text, changed_sections text[], is_new boolean)
language sql stable security definer set search_path = '' as $$
  select c.detected_at, d.source_id, d.title, d.url, c.changed_sections[1:8], c.old_version_id is null
  from public.law_changes c join public.law_documents d on d.id = c.document_id
  where c.reason = 'content'
  order by c.detected_at desc limit least(p_limit, 100);
$$;

-- Weekly change counts ignore re-parses.
create or replace function public.crawl_progress()
returns table (
  id text, name text, category text, description text, base_url text, kind text, enabled boolean,
  max_pages int, recrawl_hours int,
  queued int, done int, pending int, processing int, failed int, skipped int,
  documents int, sections int, changed_7d int, last_done_at timestamptz, last_error text
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.category, s.description, s.base_url, s.kind, s.enabled, s.max_pages, s.recrawl_hours,
    coalesce(q.total, 0), coalesce(q.done, 0), coalesce(q.pending, 0), coalesce(q.processing, 0),
    coalesce(q.failed, 0), coalesce(q.skipped, 0),
    coalesce(d.docs, 0), coalesce(d.sections, 0), coalesce(c.changed, 0), q.last_done, q.last_error
  from public.law_sources s
  left join lateral (
    select count(*)::int total,
           count(*) filter (where status = 'done')::int done,
           count(*) filter (where status = 'pending')::int pending,
           count(*) filter (where status = 'processing')::int processing,
           count(*) filter (where status = 'failed')::int failed,
           count(*) filter (where status = 'skipped')::int skipped,
           max(done_at) last_done,
           (array_agg(last_error order by done_at desc nulls last) filter (where status = 'failed'))[1] last_error
    from public.crawl_queue where source_id = s.id
  ) q on true
  left join lateral (
    select count(distinct ld.id)::int docs, count(ls.id)::int sections
    from public.law_documents ld
    left join public.law_sections ls on ls.version_id = ld.current_version_id
    where ld.source_id = s.id
  ) d on true
  left join lateral (
    select count(*)::int changed from public.law_changes lc
    join public.law_documents ld on ld.id = lc.document_id
    where ld.source_id = s.id and lc.detected_at > now() - interval '7 days' and lc.old_version_id is not null and lc.reason = 'content'
  ) c on true
  order by s.sort, s.id;
$$;

create or replace function public.law_overview()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'documents', (select count(*) from public.law_documents),
    'versions', (select count(*) from public.law_document_versions),
    'sections', (select count(*) from public.law_sections s join public.law_documents d on d.current_version_id = s.version_id),
    'embedded', (select count(*) from public.law_sections where embedding is not null),
    'changes_7d', (select count(*) from public.law_changes where detected_at > now() - interval '7 days' and old_version_id is not null and reason = 'content'),
    'queue_total', (select count(*) from public.crawl_queue),
    'queue_done', (select count(*) from public.crawl_queue where status in ('done', 'skipped')),
    'queue_failed', (select count(*) from public.crawl_queue where status = 'failed'),
    'database_bytes', pg_database_size(current_database()),
    'workers_online', (select count(*) from public.crawl_workers where last_seen_at > now() - interval '2 minutes'),
    'last_crawl_at', (select max(done_at) from public.crawl_queue)
  );
$$;

grant execute on function public.worker_reparse_batch(text, text, int) to anon, authenticated;
