-- Crawl pipeline: source registry, shared work queue, token-protected worker API,
-- progress reporting for the app, and an hourly re-crawl schedule.
--
-- Workers never get database credentials. They call the worker_* functions over
-- the REST API with a long random token whose SHA-256 hash is stored here, so a
-- worker can run anywhere (GitHub Actions, a VPS, a laptop) and many can run at once.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ─────────────────────────────── Sources ───────────────────────────────

alter table public.law_sources
  add column if not exists category text not null default 'federal',   -- federal | legislation | state | tribunal | occupations | agents
  add column if not exists description text,
  add column if not exists kind text not null default 'crawl',         -- crawl | frl_api
  add column if not exists seeds text[] not null default '{}',
  add column if not exists allow text[] not null default '{/}',
  add column if not exists deny text[] not null default '{}',
  add column if not exists content_selector text,
  add column if not exists expand_js text,
  add column if not exists max_pages int not null default 500,
  add column if not exists max_depth int not null default 6,
  add column if not exists recrawl_hours int not null default 24,
  add column if not exists enabled boolean not null default true,
  add column if not exists sort int not null default 100;

-- ─────────────────────────────── Queue ───────────────────────────────

create table public.crawl_queue (
  id bigint generated always as identity primary key,
  source_id text not null references public.law_sources(id) on delete cascade,
  url text not null unique,
  depth int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  locked_by text,
  locked_at timestamptz,
  done_at timestamptz,
  changed_at timestamptz,
  discovered_at timestamptz not null default now()
);
create index crawl_queue_pick_idx on public.crawl_queue (status, depth, id);
create index crawl_queue_source_idx on public.crawl_queue (source_id, status);

create table public.crawl_workers (
  name text primary key,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  current_url text,
  pages_done int not null default 0,
  pages_changed int not null default 0,
  pages_failed int not null default 0
);

alter table public.crawl_queue enable row level security;
alter table public.crawl_workers enable row level security;
create policy "read crawl_workers" on public.crawl_workers for select to authenticated using (true);

create table private.worker_tokens (
  token_hash text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create or replace function private.check_worker(p_token text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or not exists (
    select 1 from private.worker_tokens
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'invalid worker token' using errcode = '42501';
  end if;
end $$;

-- ───────────────────────────── Worker API ─────────────────────────────

create or replace function public.worker_sources(p_token text)
returns setof public.law_sources
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  return query select * from public.law_sources where enabled order by sort, id;
end $$;

create or replace function public.worker_enqueue(p_token text, p_source text, p_urls text[], p_depth int default 0)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.check_worker(p_token);
  with s as (select max_pages from public.law_sources where id = p_source),
  room as (select greatest(0, (select max_pages from s) - count(*))::int as slots
           from public.crawl_queue where source_id = p_source),
  ins as (
    insert into public.crawl_queue (source_id, url, depth)
    select p_source, u, p_depth from unnest(p_urls) u
    limit (select slots from room)
    on conflict (url) do nothing
    returning 1
  )
  select count(*) into n from ins;
  -- Seeds (depth 0) are always due again on the next pass.
  if p_depth = 0 then
    update public.crawl_queue set status = 'pending', attempts = 0
    where url = any(p_urls) and status in ('done', 'failed');
  end if;
  return n;
end $$;

create or replace function public.worker_claim(p_token text, p_worker text, p_limit int default 5)
returns table (id bigint, source_id text, url text, depth int)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  return query
  update public.crawl_queue q
     set status = 'processing', locked_by = p_worker, locked_at = now(), attempts = q.attempts + 1
   where q.id in (
     select c.id from public.crawl_queue c
     join public.law_sources s on s.id = c.source_id and s.enabled
     where c.status = 'pending'
        or (c.status = 'processing' and c.locked_at < now() - interval '20 minutes')
     order by c.depth, s.sort, c.id
     limit p_limit
     for update of c skip locked
   )
  returning q.id, q.source_id, q.url, q.depth;
end $$;

-- Step 1 of saving a page. Returns version_id = null when the content is unchanged.
-- (No DELETE anywhere: a page that reverts to an earlier version reuses that version's sections.)
create or replace function public.worker_begin_page(
  p_token text, p_queue_id bigint, p_source text, p_url text, p_title text,
  p_doc_type text, p_hash text, p_markdown text, p_valid_from timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare doc_id bigint; cur_version bigint; cur_hash text; new_version bigint;
begin
  perform private.check_worker(p_token);
  insert into public.law_documents (source_id, url, title, doc_type)
  values (p_source, p_url, p_title, coalesce(p_doc_type, 'page'))
  on conflict (url) do update set title = excluded.title, last_seen_at = now()
  returning id, current_version_id into doc_id, cur_version;

  select content_hash into cur_hash from public.law_document_versions where id = cur_version;
  if cur_hash = p_hash then
    update public.crawl_queue set status = 'done', done_at = now(), last_error = null, locked_by = null where id = p_queue_id;
    return jsonb_build_object('document_id', doc_id, 'version_id', null, 'unchanged', true);
  end if;

  -- Content went back to an earlier version: reuse it and its sections.
  select id into new_version from public.law_document_versions where document_id = doc_id and content_hash = p_hash;
  if new_version is not null then
    return jsonb_build_object('document_id', doc_id, 'version_id', new_version, 'unchanged', false, 'has_sections', true);
  end if;

  insert into public.law_document_versions (document_id, content_hash, markdown, valid_from, valid_to)
  values (doc_id, p_hash, p_markdown, coalesce(p_valid_from, now()), now())  -- valid_to cleared when finished
  returning id into new_version;
  return jsonb_build_object('document_id', doc_id, 'version_id', new_version, 'unchanged', false, 'has_sections', false);
end $$;

-- Step 2, repeated in batches: sections = [{ordinal, heading_path, anchor, content, content_hash, embedding?}]
create or replace function public.worker_add_sections(p_token text, p_version_id bigint, p_sections jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.check_worker(p_token);
  insert into public.law_sections (version_id, ordinal, heading_path, anchor, content, content_hash, embedding)
  select p_version_id, s.ordinal, s.heading_path, s.anchor, s.content, s.content_hash,
         case when s.embedding is null then null else s.embedding::text::extensions.vector end
  from jsonb_to_recordset(p_sections) as s(ordinal int, heading_path text[], anchor text, content text, content_hash text, embedding jsonb);
  get diagnostics n = row_count;
  return n;
end $$;

-- Step 3: make the new version current, record what changed, mark the queue item done.
create or replace function public.worker_finish_page(p_token text, p_queue_id bigint, p_version_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare doc_id bigint; old_version bigint; changed text[];
begin
  perform private.check_worker(p_token);
  select document_id into doc_id from public.law_document_versions where id = p_version_id;
  select current_version_id into old_version from public.law_documents where id = doc_id;

  select coalesce(array_agg(array_to_string(n.heading_path, ' > ') order by n.ordinal), '{}') into changed
  from public.law_sections n
  where n.version_id = p_version_id
    and (old_version is null or n.content_hash not in (select content_hash from public.law_sections where version_id = old_version));

  update public.law_document_versions set valid_to = now() where id = old_version and id <> p_version_id;
  update public.law_document_versions set valid_to = null where id = p_version_id;
  update public.law_documents set current_version_id = p_version_id, last_seen_at = now() where id = doc_id;
  insert into public.law_changes (document_id, old_version_id, new_version_id, changed_sections)
  values (doc_id, old_version, p_version_id, changed[1:200]);
  update public.crawl_queue set status = 'done', done_at = now(), changed_at = now(), last_error = null, locked_by = null
  where id = p_queue_id;
  return jsonb_build_object('changed_sections', coalesce(array_length(changed, 1), 0));
end $$;

create or replace function public.worker_fail(p_token text, p_queue_id bigint, p_error text, p_skip boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  update public.crawl_queue
     set status = case when p_skip then 'skipped' when attempts >= 3 then 'failed' else 'pending' end,
         last_error = left(p_error, 1000), locked_by = null, done_at = case when p_skip or attempts >= 3 then now() end
   where id = p_queue_id;
end $$;

create or replace function public.worker_heartbeat(
  p_token text, p_worker text, p_current_url text, p_done int, p_changed int, p_failed int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  insert into public.crawl_workers (name, current_url, pages_done, pages_changed, pages_failed)
  values (p_worker, p_current_url, p_done, p_changed, p_failed)
  on conflict (name) do update set last_seen_at = now(), current_url = excluded.current_url,
    pages_done = excluded.pages_done, pages_changed = excluded.pages_changed, pages_failed = excluded.pages_failed;
end $$;

-- ─────────────────────────── Progress for the app ───────────────────────────

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
    where ld.source_id = s.id and lc.detected_at > now() - interval '7 days' and lc.old_version_id is not null
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
    'changes_7d', (select count(*) from public.law_changes where detected_at > now() - interval '7 days' and old_version_id is not null),
    'queue_total', (select count(*) from public.crawl_queue),
    'queue_done', (select count(*) from public.crawl_queue where status in ('done', 'skipped')),
    'queue_failed', (select count(*) from public.crawl_queue where status = 'failed'),
    'database_bytes', pg_database_size(current_database()),
    'workers_online', (select count(*) from public.crawl_workers where last_seen_at > now() - interval '2 minutes'),
    'last_crawl_at', (select max(done_at) from public.crawl_queue)
  );
$$;

create or replace function public.recent_law_changes(p_limit int default 30)
returns table (detected_at timestamptz, source_id text, title text, url text, changed_sections text[], is_new boolean)
language sql stable security definer set search_path = '' as $$
  select c.detected_at, d.source_id, d.title, d.url, c.changed_sections[1:8], c.old_version_id is null
  from public.law_changes c join public.law_documents d on d.id = c.document_id
  order by c.detected_at desc limit least(p_limit, 100);
$$;

-- "Re-crawl now" from the app: mark a source's pages as due.
create or replace function public.requeue_source(p_source text)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  update public.crawl_queue set status = 'pending', attempts = 0
  where source_id = p_source and status in ('done', 'failed', 'skipped');
  get diagnostics n = row_count;
  return n;
end $$;

-- Hourly: pages older than their source's re-crawl interval become due again.
create or replace function private.requeue_stale() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.crawl_queue q set status = 'pending', attempts = 0
  from public.law_sources s
  where s.id = q.source_id and s.enabled and q.status in ('done', 'failed')
    and q.done_at < now() - make_interval(hours => s.recrawl_hours);
  get diagnostics n = row_count;
  return n;
end $$;

create extension if not exists pg_cron;
select cron.schedule('requeue-stale-law-pages', '7 * * * *', 'select private.requeue_stale()');

-- ───────────────────────────── Permissions ─────────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.worker_sources(text), public.worker_enqueue(text, text, text[], int),
  public.worker_claim(text, text, int),
  public.worker_begin_page(text, bigint, text, text, text, text, text, text, timestamptz),
  public.worker_add_sections(text, bigint, jsonb), public.worker_finish_page(text, bigint, bigint),
  public.worker_fail(text, bigint, text, boolean),
  public.worker_heartbeat(text, text, text, int, int, int) to anon, authenticated;
grant execute on function public.crawl_progress(), public.law_overview(), public.recent_law_changes(int),
  public.requeue_source(text), public.search_law(text, extensions.vector, int, timestamptz) to authenticated;
grant execute on function public.heading_text(text[]) to anon, authenticated;

-- ───────────────────────────── Official sources ─────────────────────────────

insert into public.law_sources (id, name, base_url, category, description, kind, seeds, allow, deny, content_selector, expand_js, max_pages, max_depth, recrawl_hours, sort) values
('homeaffairs', 'Home Affairs - Immigration and citizenship', 'https://immi.homeaffairs.gov.au', 'federal',
 'Every visa, citizenship and requirement page, with all tabs and folded sections expanded.', 'crawl',
 '{/,/visas/getting-a-visa/visa-listing,/citizenship,/help-support/meeting-our-requirements,/visas/working-in-australia,/what-we-do/whats-new,/visas/getting-a-visa/visa-processing-times,/visas/getting-a-visa/fees-and-charges}',
 '{/visas/,/citizenship/,/help-support/,/what-we-do/,/entering-and-leaving-australia/,/settling-in-australia/,/news-media/}',
 '{/help-text/,/sitesearch,/visas/getting-a-visa/visa-finder,/Lists/,/_layouts/}',
 '#contentBox',
 $js$document.querySelectorAll("ha-tab[tabtext]").forEach(t => { const h = document.createElement("h1"); h.textContent = t.getAttribute("tabtext"); t.prepend(h); });
document.querySelectorAll(".d-print-block, .d-print-inline, .d-print-flex").forEach(e => e.classList.remove("d-none", "collapse", "collapsed"));
document.querySelectorAll(".d-print-none").forEach(e => e.remove());$js$,
 6000, 8, 24, 10),
('legislation', 'Federal Register of Legislation', 'https://www.legislation.gov.au', 'legislation',
 'Migration Act 1958, Migration Regulations 1994, Australian Citizenship Act 2007 and every in-force migration and citizenship instrument (LINs), as official compilations.', 'frl_api',
 '{C1958A00062,F1996B03551}', '{}', '{}', null, null, 600, 0, 24, 20),
('homeaffairs-main', 'Home Affairs - portfolio news and publications', 'https://www.homeaffairs.gov.au', 'federal',
 'Ministerial media releases, migration program reports and policy publications.', 'crawl',
 '{/news-media/media-releases,/reports-and-publications}', '{/news-media/,/reports-and-publications/,/about-us/our-portfolios/}', '{/Lists/,/_layouts/}',
 'main', null, 1500, 4, 24, 30),
('art', 'Administrative Review Tribunal', 'https://www.art.gov.au', 'tribunal',
 'Review of migration and protection decisions: rules, practice directions, time limits and fees.', 'crawl',
 '{/}', '{/applying-review/,/about-us/,/practice-and-procedure/,/help-and-resources/,/legislation/}', '{/search}',
 'main', null, 600, 4, 72, 40),
('jsa', 'Jobs and Skills Australia - occupation shortages', 'https://www.jobsandskills.gov.au', 'occupations',
 'Occupation Shortage List and skills priority data that inform the skilled occupation lists.', 'crawl',
 '{/data/occupation-shortages-analysis}', '{/data/occupation-shortages-analysis}', '{}',
 'main', null, 400, 4, 168, 50),
('abs-occupations', 'ABS - ANZSCO / OSCA occupation classifications', 'https://www.abs.gov.au', 'occupations',
 'Official occupation definitions, skill levels and codes used in skills assessments and occupation lists.', 'crawl',
 '{/statistics/classifications/osca-occupation-standard-classification-australia,/statistics/classifications/anzsco-australian-and-new-zealand-standard-classification-occupations}',
 '{/statistics/classifications/osca-occupation-standard-classification-australia,/statistics/classifications/anzsco-australian-and-new-zealand-standard-classification-occupations}', '{}',
 'main', null, 4000, 8, 720, 60),
('state-vic', 'Victoria - Live in Melbourne (state nomination)', 'https://www.liveinmelbourne.vic.gov.au', 'state',
 'Victorian skilled visa nomination program for subclasses 190 and 491.', 'crawl',
 '{/migrate}', '{/migrate}', '{}', 'main', null, 300, 5, 24, 70),
('state-nsw', 'New South Wales - Visas and migration', 'https://www.nsw.gov.au', 'state',
 'NSW skilled nomination (190/491) and business migration.', 'crawl',
 '{/visas-and-migration}', '{/visas-and-migration}', '{}', 'main', null, 300, 5, 24, 71),
('state-qld', 'Queensland - Migration Queensland', 'https://migration.qld.gov.au', 'state',
 'Queensland skilled and business migration nomination criteria.', 'crawl',
 '{/}', '{/}', '{/search}', 'main', null, 300, 5, 24, 72),
('state-wa', 'Western Australia - Migration WA', 'https://migration.wa.gov.au', 'state',
 'WA state nominated migration program and occupation lists.', 'crawl',
 '{/}', '{/}', '{/search}', 'main', null, 300, 5, 24, 73),
('state-sa', 'South Australia - Migration SA', 'https://migration.sa.gov.au', 'state',
 'SA skilled and business migration nomination requirements.', 'crawl',
 '{/}', '{/}', '{/search}', 'main', null, 300, 5, 24, 74),
('state-tas', 'Tasmania - Migration Tasmania', 'https://www.migration.tas.gov.au', 'state',
 'Tasmanian skilled and business nomination pathways.', 'crawl',
 '{/}', '{/}', '{/search}', 'main', null, 300, 5, 24, 75),
('state-act', 'Australian Capital Territory - Canberra migration', 'https://www.act.gov.au', 'state',
 'ACT nomination program, Canberra Matrix and occupation list.', 'crawl',
 '{/migration}', '{/migration}', '{}', 'main', null, 300, 5, 24, 76),
('state-nt', 'Northern Territory - Migrate to the Territory', 'https://theterritory.com.au', 'state',
 'NT skilled and business nomination criteria.', 'crawl',
 '{/migrate}', '{/migrate}', '{}', 'main', null, 300, 5, 24, 77),
('omara', 'Office of the Migration Agents Registration Authority', 'https://www.mara.gov.au', 'agents',
 'Register of migration agents, code of conduct and consumer guidance.', 'crawl',
 '{/}', '{/}', '{/search}', 'main', null, 300, 4, 168, 90)
on conflict (id) do update set
  name = excluded.name, base_url = excluded.base_url, category = excluded.category, description = excluded.description,
  kind = excluded.kind, seeds = excluded.seeds, allow = excluded.allow, deny = excluded.deny,
  content_selector = excluded.content_selector, expand_js = excluded.expand_js, max_pages = excluded.max_pages,
  max_depth = excluded.max_depth, recrawl_hours = excluded.recrawl_hours, sort = excluded.sort;

-- ───────────────────────────── Retry back-off ─────────────────────────────

alter table public.crawl_queue add column if not exists retry_after timestamptz;

create or replace function public.worker_claim(p_token text, p_worker text, p_limit int default 5)
returns table (id bigint, source_id text, url text, depth int)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  return query
  update public.crawl_queue q
     set status = 'processing', locked_by = p_worker, locked_at = now(), attempts = q.attempts + 1
   where q.id in (
     select c.id from public.crawl_queue c
     join public.law_sources s on s.id = c.source_id and s.enabled
     where (c.status = 'pending' and (c.retry_after is null or c.retry_after < now()))
        or (c.status = 'processing' and c.locked_at < now() - interval '20 minutes')
     order by c.depth, s.sort, c.id
     limit p_limit
     for update of c skip locked
   )
  returning q.id, q.source_id, q.url, q.depth;
end $$;

-- Failed pages wait 15 min, then 30 min, before the third and last try.
create or replace function public.worker_fail(p_token text, p_queue_id bigint, p_error text, p_skip boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  update public.crawl_queue
     set status = case when p_skip then 'skipped' when attempts >= 3 then 'failed' else 'pending' end,
         retry_after = now() + make_interval(mins => 15 * attempts),
         last_error = left(p_error, 1000), locked_by = null,
         done_at = case when p_skip or attempts >= 3 then now() end
   where id = p_queue_id;
end $$;
