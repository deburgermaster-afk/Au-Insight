-- Google Gemini key (document reading for scans/photos, embeddings, optional chat models).
-- Store it once with:  select vault.create_secret('<key>', 'gemini_api_key');
-- Only the service role (server-side) can call this; users and anon cannot.
create or replace function public.gemini_api_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'gemini_api_key' limit 1;
$$;
revoke execute on function public.gemini_api_key() from public, anon, authenticated;
grant execute on function public.gemini_api_key() to service_role;
