-- People: one account can keep several people's migration files apart (yourself, a partner, a
-- friend you help). Each person is a row in `cases` (facts, story, structured profile); their
-- chats, documents, folders, plans (solutions), shortlisted courses and assessments carry its id.
--
-- The app says which person is open with the `x-case-id` request header, and remembers it with
-- open_person() so requests without the header (the chat function's) use the same person.
-- Row-level security then shows only that person's rows, and new rows default to that person,
-- so every existing query (and the chat agent's tools) works on the selected person unchanged.
-- Without the header (older app builds, older chat function) everything is the first person,
-- which is exactly what the account held before this migration.

-- ───────────────────────────── 1. Which person is open ─────────────────────────────

create or replace function private.request_case_id()
returns uuid language sql stable set search_path = '' as $$
  select case when h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then h::uuid end
  from (select nullif(current_setting('request.headers', true), '')::json ->> 'x-case-id' as h) x
$$;

-- The person last opened in the app (set by open_person), for requests that don't send the header.
alter table public.profiles add column if not exists active_case_id uuid references public.cases(id) on delete set null;

-- The person the request is about: the one named in the header if it's the caller's, else the one
-- they last opened, else their first.
create or replace function public.active_case_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.id from public.cases c where c.user_id = auth.uid() and c.id = private.request_case_id()),
    (select c.id from public.profiles p join public.cases c on c.id = p.active_case_id and c.user_id = p.id
      where p.id = auth.uid()),
    (select c.id from public.cases c where c.user_id = auth.uid() order by c.created_at, c.id limit 1)
  )
$$;

create or replace function public.owns_case(p_case uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cases c where c.id = p_case and c.user_id = auth.uid())
$$;

-- Everyone with data has a first person (the sign-up trigger makes one; this covers any gap).
insert into public.cases (user_id)
select u.id from auth.users u where not exists (select 1 from public.cases c where c.user_id = u.id);

alter table public.cases add column if not exists relation text not null default '';
update public.cases set title = 'Me' where title = 'My case';
alter table public.cases alter column title set default 'Me';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.cases (user_id, title) values (new.id, 'Me');
  return new;
end $$;

-- ───────────────────────── 2. Person-owned rows carry case_id ─────────────────────────

-- chats.case_id and folders.case_id exist; the rest gain it. Deleting a person deletes their rows.
alter table public.chats drop constraint if exists chats_case_id_fkey;
alter table public.chats add constraint chats_case_id_fkey foreign key (case_id) references public.cases(id) on delete cascade;
alter table public.documents add column if not exists case_id uuid references public.cases(id) on delete cascade;
alter table public.solutions add column if not exists case_id uuid references public.cases(id) on delete cascade;
alter table public.course_shortlist add column if not exists case_id uuid references public.cases(id) on delete cascade;

do $$
declare t text;
begin
  foreach t in array array['chats', 'folders', 'documents', 'solutions', 'course_shortlist']
  loop
    execute format(
      'update public.%1$I x set case_id = (select c.id from public.cases c where c.user_id = x.user_id
         order by c.created_at, c.id limit 1) where x.case_id is null', t);
    execute format('alter table public.%I alter column case_id set default public.active_case_id()', t);
    execute format('alter table public.%I alter column case_id set not null', t);
    execute format('create index if not exists %1$s_case_idx on public.%1$I (case_id)', t);
  end loop;
end $$;

-- A course can be on several people's shortlists.
alter table public.course_shortlist drop constraint if exists course_shortlist_pkey;
alter table public.course_shortlist add primary key (user_id, case_id, course_code);

-- ─────────────────────────────── 3. Row-level security ───────────────────────────────

-- The existing "own …" policies keep their names; they now also require the open person. (For
-- cases, inserts are checked by WITH CHECK only, so a new person can be added while another is open.)
alter policy "own cases" on public.cases
  using ((select auth.uid()) = user_id and id = (select public.active_case_id()))
  with check ((select auth.uid()) = user_id);

do $$
declare
  t text;
  p text;
begin
  foreach t in array array['chats', 'folders', 'documents', 'solutions', 'course_shortlist']
  loop
    p := case t when 'course_shortlist' then 'own shortlist' else 'own ' || t end;
    execute format('alter policy %I on public.%I
                    using ((select auth.uid()) = user_id and case_id = (select public.active_case_id()))
                    with check ((select auth.uid()) = user_id and public.owns_case(case_id))', p, t);
  end loop;
end $$;

-- ───────────────────────────── 4. Managing people ─────────────────────────────

-- Every person on the account, whichever one is open (the switcher lists them all).
create or replace function public.list_people()
returns table (id uuid, name text, relation text, created_at timestamptz, updated_at timestamptz,
               has_story boolean, documents bigint, chats bigint, plans bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.relation, c.created_at, c.updated_at, length(trim(c.story)) > 0,
         (select count(*) from public.documents d where d.case_id = c.id),
         (select count(*) from public.chats h where h.case_id = c.id),
         (select count(*) from public.solutions s where s.case_id = c.id)
  from public.cases c where c.user_id = auth.uid()
  order by c.created_at, c.id
$$;

-- Remembers who is open, so every request (the chat agent's included) works on them.
create or replace function public.open_person(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.cases where id = p_id and user_id = auth.uid()) then
    raise exception 'Person not found';
  end if;
  update public.profiles set active_case_id = p_id where id = auth.uid();
end $$;

create or replace function public.add_person(p_name text, p_relation text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.cases where user_id = auth.uid()) >= 20 then
    raise exception 'You can keep up to 20 people';
  end if;
  insert into public.cases (user_id, title, relation)
  values (auth.uid(), coalesce(nullif(left(trim(p_name), 60), ''), 'New person'), left(trim(coalesce(p_relation, '')), 40))
  returning id into v;
  return v;
end $$;

create or replace function public.update_person(p_id uuid, p_name text, p_relation text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.cases
  set title = coalesce(nullif(left(trim(p_name), 60), ''), title),
      relation = coalesce(left(trim(p_relation), 40), relation),
      updated_at = now()
  where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Person not found'; end if;
end $$;

-- Deletes a person and everything filed under them. Returns their files' storage paths, for the
-- app to remove from storage. The last person can't be deleted.
create or replace function public.delete_person(p_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare paths text[];
begin
  if not exists (select 1 from public.cases where id = p_id and user_id = auth.uid()) then
    raise exception 'Person not found';
  end if;
  if (select count(*) from public.cases where user_id = auth.uid()) <= 1 then
    raise exception 'You need at least one person';
  end if;
  select coalesce(array_agg(storage_path), '{}') into paths from public.documents where case_id = p_id;
  delete from public.cases where id = p_id;
  return paths;
end $$;

revoke execute on function private.request_case_id(), public.active_case_id(), public.owns_case(uuid),
  public.list_people(), public.add_person(text, text), public.update_person(uuid, text, text),
  public.delete_person(uuid), public.open_person(uuid) from public, anon;
grant execute on function public.active_case_id(), public.owns_case(uuid), public.list_people(),
  public.add_person(text, text), public.update_person(uuid, text, text), public.delete_person(uuid),
  public.open_person(uuid) to authenticated;
