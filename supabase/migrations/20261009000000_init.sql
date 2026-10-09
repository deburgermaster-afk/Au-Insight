-- Immi Insight schema.
-- Two halves:
--   1. Law corpus (read-only to users; written only through the worker_* functions, see the crawler migration).
--   2. Private case data (row-level security: each user sees only their own rows).

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ───────────────────────────── 1. Law corpus ─────────────────────────────

create table public.law_sources (
  id text primary key,                          -- e.g. 'homeaffairs', 'legislation', 'state-vic'
  name text not null,
  base_url text not null
);

create table public.law_documents (
  id bigint generated always as identity primary key,
  source_id text not null references public.law_sources(id),
  url text not null unique,
  title text not null,
  doc_type text not null default 'page',       -- page | legislation | instrument | pdf
  current_version_id bigint,
  last_seen_at timestamptz not null default now()
);

-- Every change to a page creates a new version; the old one gets valid_to.
-- This lets the engine answer "under the law as at <date>".
create table public.law_document_versions (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.law_documents(id) on delete cascade,
  content_hash text not null,
  markdown text not null,
  fetched_at timestamptz not null default now(),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  unique (document_id, content_hash)
);
alter table public.law_documents
  add constraint law_documents_current_version_fk
  foreign key (current_version_id) references public.law_document_versions(id) on delete set null;

-- array_to_string is only STABLE; generated columns need IMMUTABLE.
create or replace function public.heading_text(text[]) returns text
language sql immutable parallel safe as $$ select array_to_string($1, ' ') $$;

-- A section is one heading (or accordion / tab panel) with its full heading path.
create table public.law_sections (
  id bigint generated always as identity primary key,
  version_id bigint not null references public.law_document_versions(id) on delete cascade,
  ordinal int not null,
  heading_path text[] not null,                 -- ['Skilled Independent visa', 'Eligibility', 'Age']
  anchor text,
  content text not null,
  content_hash text not null,
  fts tsvector generated always as (
    setweight(to_tsvector('english', public.heading_text(heading_path)), 'A') ||
    setweight(to_tsvector('english', content), 'B')
  ) stored,
  embedding extensions.vector(1024)
);
create index law_sections_fts_idx on public.law_sections using gin (fts);
create index law_sections_embedding_idx on public.law_sections using hnsw (embedding extensions.vector_cosine_ops);
create index law_sections_version_idx on public.law_sections (version_id);

create table public.law_changes (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.law_documents(id) on delete cascade,
  old_version_id bigint references public.law_document_versions(id) on delete set null,
  new_version_id bigint not null references public.law_document_versions(id) on delete cascade,
  changed_sections text[] not null default '{}',
  detected_at timestamptz not null default now()
);

create table public.crawl_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  pages_seen int not null default 0,
  pages_changed int not null default 0,
  errors jsonb not null default '[]'
);

-- Structured reference data the decision engine reads.
create table public.occupations (
  anzsco text not null,
  title text not null,
  lists text[] not null,                        -- MLTSSL | STSOL | ROL | CSOL
  valid_from date not null,
  valid_to date,
  source_section_id bigint references public.law_sections(id) on delete set null,
  primary key (anzsco, valid_from)
);

create table public.processing_times (
  id bigint generated always as identity primary key,
  subclass text not null,
  stream text,
  p50_days int,
  p90_days int,
  captured_at timestamptz not null default now(),
  source_url text not null
);

-- Visa criteria as reviewable data (same JSON shape as the engine's `Condition` in supabase/functions/_shared/engine).
create table public.criteria_rules (
  id bigint generated always as identity primary key,
  subclass text not null,
  stream text not null,
  criterion_id text not null,
  title text not null,
  logic jsonb not null,
  discretionary boolean not null default false,
  source_section_id bigint references public.law_sections(id) on delete set null,
  source_url text not null,
  valid_from date not null,
  valid_to date,
  review_status text not null default 'draft' check (review_status in ('draft', 'reviewed')),
  reviewed_at timestamptz,
  unique (subclass, stream, criterion_id, valid_from)
);

-- Law tables: anyone signed in can read; writes go through the token-checked worker functions.
do $$
declare t text;
begin
  foreach t in array array['law_sources','law_documents','law_document_versions','law_sections',
                           'law_changes','occupations','processing_times','criteria_rules','crawl_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "read %1$s" on public.%1$I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Hybrid search: keyword + vector, fused with Reciprocal Rank Fusion.
-- Only sections from the version in force at `as_at` are searched.
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
  with in_force as (
    select s.*, d.url, d.title, v.fetched_at
    from law_sections s
    join law_document_versions v on v.id = s.version_id
    join law_documents d on d.id = v.document_id
    where v.valid_from <= as_at and (v.valid_to is null or v.valid_to > as_at)
  ),
  -- Any-word match, ranked so sections matching more (and rarer) terms come first.
  q as (
    select to_tsquery('english', coalesce(nullif(array_to_string(
      tsvector_to_array(to_tsvector('english', query_text)), ' | '), ''), 'xyzzy')) as q
  ),
  kw as (
    select id, row_number() over (order by ts_rank_cd(fts, q.q, 1) desc) as r
    from in_force, q
    where fts @@ q.q
    order by ts_rank_cd(fts, q.q, 1) desc
    limit match_count * 4
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

-- ─────────────────────────── 2. Private case data ───────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'My case',
  facts jsonb not null default '{}',            -- validated by caseFactsSchema
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  storage_path text not null,                   -- '<user_id>/<uuid>/<filename>' in the case-documents bucket
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'extracted', 'failed')),
  extracted jsonb,                              -- facts proposed from the document, confirmed by the user
  created_at timestamptz not null default now()
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  title text not null default 'New chat',
  messages jsonb not null default '[]',         -- [{role, text, steps, sources, decisions}]
  updated_at timestamptz not null default now()
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  result jsonb not null,                        -- VisaAssessment[]
  facts_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['cases','folders','documents','chats','assessments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own %1$s" on public.%1$I for all to authenticated
                    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create index %1$s_user_idx on public.%1$I (user_id)', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.cases (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Private document storage: files live under '<user_id>/...'.
insert into storage.buckets (id, name, public, file_size_limit)
values ('case-documents', 'case-documents', false, 26214400)
on conflict (id) do nothing;

create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'case-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
