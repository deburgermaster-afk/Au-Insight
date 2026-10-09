-- The user's migration story, told to the chat agent on their first visit and kept up to date by it.
alter table public.cases add column if not exists story text not null default '';
