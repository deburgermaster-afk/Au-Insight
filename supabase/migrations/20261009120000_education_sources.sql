-- Official education sources for student questions (provider transfers, course progress, credit/RPL,
-- study load, cross-institutional study, research degree entry), and university policy pages.
--
--  * education: the ESOS framework and international education pages (Department of Education),
--    Study Australia, the AQF, TEQSA guidance and the Overseas Students Ombudsman.
--  * legislation: the ESOS Act 2000, ESOS Regulations 2019, National Code 2018 (and its 2026 transfer
--    amendment) and the Higher Education Standards Framework (Threshold Standards) 2021, via the FRL API.
--  * university: one 'sitemap' source per Australian university (provider_code = CRICOS code). The crawler
--    reads the site's sitemaps and keeps pages whose path matches the allow regexes (one per topic),
--    at most max_pages per university, re-read every recrawl_hours. No link following.
--
-- search_law keeps answering from law and official government pages only; university pages are searched
-- with search_university_policies, so a university's own rule is never mistaken for the law.

-- ─────────────────────────────── Columns ───────────────────────────────

alter table public.law_sources
  add column if not exists provider_code text,        -- CRICOS provider code (university sources)
  add column if not exists seeded_at timestamptz;     -- sitemap sources: when the sitemaps were last read

create index if not exists law_sources_provider_code_idx on public.law_sources (provider_code) where provider_code is not null;
create index if not exists law_sources_category_idx on public.law_sources (category);

-- The crawler re-reads a sitemap source's sitemaps only when this is older than recrawl_hours.
create or replace function public.worker_source_seeded(p_token text, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_worker(p_token);
  update public.law_sources set seeded_at = now() where id = p_source;
end $$;

revoke execute on function public.worker_source_seeded(text, text) from public;
grant execute on function public.worker_source_seeded(text, text) to anon, authenticated;

-- ─────────────────────────── Official education sources ───────────────────────────

insert into public.law_sources (id, name, base_url, category, description, kind, seeds, allow, deny, content_selector, max_pages, max_depth, recrawl_hours, sort) values
('education-esos', 'Department of Education - ESOS framework and international education', 'https://www.education.gov.au', 'education',
 'ESOS framework, National Code factsheets, CRICOS registration, tuition protection, and support for international students before, during and after study.', 'crawl',
 array['/esos-framework', '/international-education', '/managed-system-international-education']::text[],
 array['/esos-framework', '/international-education/', '/managed-system-international-education']::text[],
 array['/esos-framework/resources/esos-agency-schools', '/esos-framework/resources/esos-regulator-schools', '/search']::text[],
 'main', 400, 4, 168, 21),
('studyaustralia', 'Study Australia - studying, changing courses and work rights', 'https://www.studyaustralia.gov.au', 'education',
 'Official guide for international students: the education system, credit and exemptions, changing your course or provider, scholarships, visas and work rights.', 'crawl',
 array['/en/plan-your-studies', '/en/work-in-australia', '/en/plan-your-move/your-guide-to-visas', '/en/life-in-australia/student-support-services', '/en/tools-and-resources/news']::text[],
 array['/en/plan-your-studies', '/en/work-in-australia', '/en/plan-your-move', '/en/life-in-australia/student-support-services', '/en/tools-and-resources/news', '/en/tools-and-resources/tips-and-advice-for-students']::text[],
 array['/en/tools-and-resources/student-stories', '/en/Agent-Hub', '/en/plan-your-studies/areas-of-study']::text[],
 'main', 300, 3, 168, 22),
('aqf', 'Australian Qualifications Framework', 'https://www.aqf.edu.au', 'education',
 'AQF levels and qualification types, AQF policies (qualifications pathways, credit and recognition of prior learning) and FAQs.', 'crawl',
 array['/', '/framework/aqf-levels', '/framework/aqf-qualifications', '/framework/aqf-policies', '/help-qualifications/recognition-prior-learning', '/faqs']::text[],
 array['/framework', '/help-qualifications', '/faqs', '/aqf-qualifications', '/publication', '/about/what-aqf']::text[],
 array['/download', '/search']::text[],
 'main', 150, 3, 720, 23),
('teqsa', 'TEQSA - higher education standards guidance', 'https://www.teqsa.gov.au', 'education',
 'Guidance notes on the Threshold Standards (credit and RPL, admissions, research training), provider categories and information for students. The national register is excluded by its robots.txt.', 'crawl',
 array['/students', '/guides-resources/resources/guidance-notes', '/how-we-regulate', '/about-us/teqsa-overview/faqs']::text[],
 array['/students', '/guides-resources/resources/guidance-notes', '/guides-resources/glossary-terms', '/guides-resources/admissions-transparency', '/how-we-regulate', '/about-us/teqsa-overview']::text[],
 array['/national-register', '/search']::text[],
 'main', 250, 3, 168, 24),
('ombudsman-students', 'Overseas Students Ombudsman', 'https://www.ombudsman.gov.au', 'education',
 'Complaints by international students about private providers: transfers between providers, refunds, course progress and attendance, and how to complain.', 'crawl',
 array['/complaints/international-student-complaints']::text[],
 array['/complaints/international-student-complaints']::text[],
 array['/__data', '/search']::text[],
 'main', 80, 3, 168, 25)
on conflict (id) do update set
  name = excluded.name, base_url = excluded.base_url, category = excluded.category, description = excluded.description,
  kind = excluded.kind, seeds = excluded.seeds, allow = excluded.allow, deny = excluded.deny,
  content_selector = excluded.content_selector, max_pages = excluded.max_pages, max_depth = excluded.max_depth,
  recrawl_hours = excluded.recrawl_hours, sort = excluded.sort;

-- ESOS Act 2000, ESOS Regulations 2019, National Code 2018, the National Code's 2026 overseas student
-- transfers amendment (in force 1 October 2026), Higher Education Standards Framework (Threshold Standards) 2021.
update public.law_sources
   set seeds = (select array_agg(distinct s order by s) from unnest(seeds || array['C2004A00757', 'F2019L00571', 'F2017L01182', 'F2026L01351', 'F2021L00488']) s),
       description = 'Migration Act 1958, Migration Regulations 1994, Australian Citizenship Act 2007 and every in-force migration and citizenship instrument (LINs), plus the ESOS Act 2000, ESOS Regulations 2019, National Code 2018 and Higher Education Standards Framework 2021, as official compilations.'
 where id = 'legislation';

-- ─────────────────────────── University policy pages ───────────────────────────

with v (id, uni, base_url, seeds, provider_code, sort) as (values
('uni-acu', 'Australian Catholic University', 'https://www.acu.edu.au', array['https://www.acu.edu.au/sitemap.xml']::text[], '00004G', 200),
('uni-anu', 'Australian National University', 'https://www.anu.edu.au', array['https://www.anu.edu.au/sitemap.xml', 'https://study.anu.edu.au/sitemap.xml']::text[], '00120C', 201),
('uni-adelaide', 'Adelaide University', 'https://adelaide.edu.au', array['https://adelaide.edu.au/sitemap.xml']::text[], '04249J', 202),
('uni-bond', 'Bond University', 'https://bond.edu.au', array['https://bond.edu.au/sitemap.xml']::text[], '00017B', 203),
('uni-cqu', 'CQUniversity Australia', 'https://www.cqu.edu.au', array['https://www.cqu.edu.au/sitemap.xml']::text[], '00219C', 204),
('uni-cdu', 'Charles Darwin University', 'https://www.cdu.edu.au', array['https://www.cdu.edu.au/sitemap.xml']::text[], '00300K', 205),
('uni-csu', 'Charles Sturt University', 'https://www.csu.edu.au', array['https://www.csu.edu.au/sitemap.xml', 'https://study.csu.edu.au/sitemap.xml']::text[], '00005F', 206),
('uni-curtin', 'Curtin University', 'https://www.curtin.edu.au', array['https://curtin.edu.au/sitemap.xml', 'https://www.curtin.edu.au/study/page-sitemap1.xml', 'https://www.curtin.edu.au/study/extras-sitemap1.xml', 'https://www.curtin.edu.au/about/page-sitemap1.xml']::text[], '00301J', 207),
('uni-deakin', 'Deakin University', 'https://www.deakin.edu.au', array['https://www.deakin.edu.au/sitemap.xml']::text[], '00113B', 208),
('uni-ecu', 'Edith Cowan University', 'https://www.ecu.edu.au', array['https://www.ecu.edu.au/sitemap.txt']::text[], '00279B', 209),
('uni-federation', 'Federation University Australia', 'https://www.federation.edu.au', array['https://www.federation.edu.au/sitemap.xml']::text[], '00103D', 210),
('uni-flinders', 'Flinders University', 'https://www.flinders.edu.au', array['https://www.flinders.edu.au/sitemap.xml', 'https://students.flinders.edu.au/sitemap.xml']::text[], '00114A', 211),
('uni-griffith', 'Griffith University', 'https://www.griffith.edu.au', array['https://www.griffith.edu.au/sitemap/top-level.xml', 'https://www.griffith.edu.au/sitemap/study.xml', 'https://www.griffith.edu.au/sitemap/degrees.xml']::text[], '00233E', 212),
('uni-jcu', 'James Cook University', 'https://www.jcu.edu.au', array['https://www.jcu.edu.au/sitemap.xml']::text[], '00117J', 213),
('uni-latrobe', 'La Trobe University', 'https://www.latrobe.edu.au', array['https://www.latrobe.edu.au/sitemap-master.xml', 'https://www.latrobe.edu.au/sitemap/latest-sitemap.xml']::text[], '00115M', 214),
('uni-mq', 'Macquarie University', 'https://www.mq.edu.au', array['https://www.mq.edu.au/sitemap.xml']::text[], '00002J', 215),
('uni-monash', 'Monash University', 'https://www.monash.edu', array['https://www.monash.edu/sitemap.xml']::text[], '00008C', 216),
('uni-qut', 'Queensland University of Technology', 'https://www.qut.edu.au', array['https://www.qut.edu.au/sitemaps/index.xml']::text[], '00213J', 217),
('uni-rmit', 'RMIT University', 'https://www.rmit.edu.au', array['https://www.rmit.edu.au/sitemap.xml']::text[], '00122A', 218),
('uni-scu', 'Southern Cross University', 'https://www.scu.edu.au', array['https://www.scu.edu.au/google-sitemap/index.xml']::text[], '01241G', 219),
('uni-swinburne', 'Swinburne University of Technology', 'https://www.swinburne.edu.au', array['https://www.swinburne.edu.au/sitemap.xml']::text[], '00111D', 220),
('uni-unimelb', 'The University of Melbourne', 'https://www.unimelb.edu.au', array['https://study.unimelb.edu.au/sitemap.xml', 'https://students.unimelb.edu.au/sitemap.xml', 'https://www.unimelb.edu.au/sitemap.xml']::text[], '00116K', 221),
('uni-unsw', 'UNSW Sydney', 'https://www.unsw.edu.au', array['https://www.student.unsw.edu.au/sitemap.xml', 'https://www.unsw.edu.au/study/undergraduate.sitemap.xml', 'https://www.unsw.edu.au/study/postgraduate.sitemap.xml', 'https://www.futurestudents.unsw.edu.au/sitemap.xml', 'https://www.unsw.edu.au/sitemap.xml']::text[], '00098G', 222),
('uni-newcastle', 'The University of Newcastle', 'https://www.newcastle.edu.au', array['https://www.newcastle.edu.au/study/sitemap', 'https://www.newcastle.edu.au/designs/uon-2016/sitemaps/current-students-sitemap', 'https://www.newcastle.edu.au/designs/uon-2016/sitemaps/international-sitemap', 'https://www.newcastle.edu.au/designs/uon-2016/sitemaps/scholarships-sitemap', 'https://www.newcastle.edu.au/designs/uon-2016/sitemaps/degrees-sitemap', 'https://www.newcastle.edu.au/research/sitemap', 'https://www.newcastle.edu.au/designs/uon-2016/sitemaps/top-level-sitemap', 'https://www.newcastle.edu.au/designs/uon-2016/sitemaps/our-uni-sitemap']::text[], '00109J', 223),
('uni-notredame', 'The University of Notre Dame Australia', 'https://www.notredame.edu.au', array['https://www.notredame.edu.au/sitemap.xml']::text[], '01032F', 224),
('uni-uq', 'The University of Queensland', 'https://www.uq.edu.au', array['https://study.uq.edu.au/sitemap.xml', 'https://my.uq.edu.au/sitemap.xml', 'https://www.uq.edu.au/sitemap.xml']::text[], '00025B', 225),
('uni-sydney', 'The University of Sydney', 'https://www.sydney.edu.au', array['https://www.sydney.edu.au/sitemap.xml']::text[], '00026A', 226),
('uni-uwa', 'The University of Western Australia', 'https://www.uwa.edu.au', array['https://www.uwa.edu.au/study/sitemap.xml', 'https://www.uwa.edu.au/students/sitemap.xml', 'https://www.uwa.edu.au/policy/sitemap.xml', 'https://www.uwa.edu.au/research/sitemap.xml', 'https://www.uwa.edu.au/sitemap.xml']::text[], '00126G', 227),
('uni-torrens', 'Torrens University Australia', 'https://www.torrens.edu.au', array['https://www.torrens.edu.au/sitemap.xml', 'https://research.torrens.edu.au/sitemap.xml']::text[], '03389E', 228),
('uni-canberra', 'University of Canberra', 'https://www.canberra.edu.au', array['https://www.canberra.edu.au/services/wcm/site-map/uc.xml', 'https://www.canberra.edu.au/services/wcm/site-map/credit.xml', 'https://www.canberra.edu.au/services/wcm/site-map/course.xml']::text[], '00212K', 229),
('uni-divinity', 'University of Divinity', 'https://divinity.edu.au', array['https://divinity.edu.au/sitemap.xml']::text[], '01037A', 230),
('uni-une', 'University of New England', 'https://www.une.edu.au', array['https://www.une.edu.au/sitemap.xml', 'https://study.une.edu.au/ci/sitemap/']::text[], '00003G', 231),
('uni-unisq', 'University of Southern Queensland', 'https://www.unisq.edu.au', array['https://www.unisq.edu.au/sitemap.xml']::text[], '00244B', 232),
('uni-utas', 'University of Tasmania', 'https://www.utas.edu.au', array['https://www.utas.edu.au/sitemap.xml', 'https://www.utas.edu.au/courses/sitemap.xml']::text[], '00586B', 233),
('uni-uts', 'University of Technology Sydney', 'https://www.uts.edu.au', array['https://www.uts.edu.au/sitemap.xml']::text[], '00099F', 234),
('uni-unisc', 'University of the Sunshine Coast', 'https://www.unisc.edu.au', array['https://www.unisc.edu.au/XMLsitemap']::text[], '01595D', 235),
('uni-uow', 'University of Wollongong', 'https://www.uow.edu.au', array['https://www.uow.edu.au/sitemap.xml']::text[], '00102E', 236),
('uni-vu', 'Victoria University', 'https://www.vu.edu.au', array['https://www.vu.edu.au/sitemap.xml']::text[], '00124K', 237),
('uni-wsu', 'Western Sydney University', 'https://www.westernsydney.edu.au', array['https://www.westernsydney.edu.au/sitemap.xml']::text[], '00917K', 238),
('uni-avondale', 'Avondale University', 'https://www.avondale.edu.au', array['https://www.avondale.edu.au/sitemap_index.xml', 'https://research.avondale.edu.au/sitemap_index.xml']::text[], '02731D', 239)
)
insert into public.law_sources (id, name, base_url, category, description, kind, seeds, allow, deny, content_selector, max_pages, max_depth, recrawl_hours, sort, provider_code)
select v.id, v.uni, v.base_url, 'university',
       'Official ' || v.uni || ' pages on credit and recognition of prior learning, study load and overload, cross-institutional study, research degrees, tuition fees and scholarships, and course or provider transfers.',
       'sitemap', v.seeds,
  array[
    'credit|advanced-standing|recognition-of-prior-learning|prior-learning|(^|[/_-])rpl([/_.-]|$)',
    'overload|study-load|course-load|enrolment-load|load-limit|full-time-study|part-time-study',
    'cross-institution|cross-enrol',
    'research-degree|higher-degree-by-research|(^|[/_-])hdr([/_.-]|$)|graduate-research|research-candidature',
    '(^|[/_-])phd([/_.-]|$)|doctor-of-philosophy|master-of-philosophy|(^|[/_-])mphil([/_.-]|$)|masters?-by-research|master-of-research',
    'tuition|(^|[/_-])fees?([/_.-]|$)',
    'scholarship',
    'transfer|change-course|change-of-course|changing-course|course-change|change-your-course|letter-of-release|(^|[/_-])release([/_.-]|$)'
  ]::text[],
  array[
    '(^|/)(news|newsroom|events?|stories|blog|media|people|staff|profiles?|experts?|alumni|giving|archive|search|tags?|categor(y|ies)|authors?|jobs|careers|podcasts?)(/|$)',
    '/20\d\d/',
    'knowledge-transfer|technology-transfer|tech-transfer|media-release|credit-card|heat-transfer|mass-transfer|data-transfer|press-release'
  ]::text[],
       'main', 50, 0, 720, v.sort, v.provider_code
from v
on conflict (id) do update set
  name = excluded.name, base_url = excluded.base_url, category = excluded.category, description = excluded.description,
  kind = excluded.kind, seeds = excluded.seeds, allow = excluded.allow, deny = excluded.deny,
  content_selector = excluded.content_selector, max_pages = excluded.max_pages, max_depth = excluded.max_depth,
  recrawl_hours = excluded.recrawl_hours, sort = excluded.sort, provider_code = excluded.provider_code;

-- Murdoch University publishes no sitemap: a shallow crawl of its admissions, fees and international pages.
insert into public.law_sources (id, name, base_url, category, description, kind, seeds, allow, deny, content_selector, max_pages, max_depth, recrawl_hours, sort, provider_code) values
('uni-murdoch', 'Murdoch University', 'https://www.murdoch.edu.au', 'university',
 'Official Murdoch University pages on recognition of prior learning, cross-institutional enrolment, research degree applications, fees and scholarships.', 'crawl',
 array['/study/how-to-apply', '/study/fees', '/study/scholarships', '/study/international-students/studying-at-murdoch']::text[],
 array['/study/how-to-apply', '/study/fees', '/study/scholarships', '/study/international-students/studying-at-murdoch', '/study/research-degrees']::text[],
 array['/study/how-to-apply/year-12-early-offer-program', '/search']::text[],
 'main', 50, 2, 720, 241, '00125J')
on conflict (id) do update set
  name = excluded.name, base_url = excluded.base_url, category = excluded.category, description = excluded.description,
  kind = excluded.kind, seeds = excluded.seeds, allow = excluded.allow, deny = excluded.deny,
  content_selector = excluded.content_selector, max_pages = excluded.max_pages, max_depth = excluded.max_depth,
  recrawl_hours = excluded.recrawl_hours, sort = excluded.sort, provider_code = excluded.provider_code;

-- ─────────────────────────────── Search ───────────────────────────────

-- Same signature, ranking and behaviour as before; university pages are left out.
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
    join law_sources src on src.id = d.source_id
    where v.valid_from <= as_at and (v.valid_to is null or v.valid_to > as_at)
      and length(s.content) >= 40
      and src.category <> 'university'
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

-- University policy pages (current versions only), optionally for some providers (CRICOS codes; a
-- university source id such as 'uni-monash' also works). Keyword ranking as in search_law.
create or replace function public.search_university_policies(
  p_query text,
  p_provider_codes text[] default null,
  p_limit int default 8
)
returns table (
  section_id bigint,
  url text,
  title text,
  heading_path text[],
  content text,
  version_fetched_at timestamptz,
  score double precision,
  provider_code text
)
language sql stable security invoker
set search_path = public, extensions
as $$
  with terms as (
    select tsvector_to_array(to_tsvector('english', coalesce(p_query, ''))) as lx
  ),
  q as (
    select to_tsquery('english', coalesce(nullif(array_to_string(lx, ' | '), ''), 'xyzzy')) as q,
           greatest(coalesce(array_length(lx, 1), 0), 1) as n, lx
    from terms
  ),
  current_pages as (
    select s.id, s.fts, s.heading_path, s.content, d.url, d.title, v.fetched_at, src.provider_code
    from law_sources src
    join law_documents d on d.source_id = src.id
    join law_document_versions v on v.id = d.current_version_id
    join law_sections s on s.version_id = v.id
    where src.category = 'university'
      and (p_provider_codes is null or cardinality(p_provider_codes) = 0
           or src.provider_code = any(p_provider_codes) or src.id = any(p_provider_codes))
      and length(s.content) >= 40
  ),
  scored as (
    select c.*,
           power((select count(*) from unnest(q.lx) l where c.fts @@ to_tsquery('english', l))::float / q.n, 2)
             * ts_rank_cd(c.fts, q.q, 1) as score
    from current_pages c, q
    where c.fts @@ q.q
  )
  select id, url, title, heading_path, content, fetched_at, score::double precision, provider_code
  from scored
  order by score desc
  limit least(greatest(coalesce(p_limit, 8), 1), 50);
$$;

grant execute on function public.search_law(text, extensions.vector, int, timestamptz) to authenticated;
revoke execute on function public.search_university_policies(text, text[], int) from public, anon;
grant execute on function public.search_university_policies(text, text[], int) to authenticated;
