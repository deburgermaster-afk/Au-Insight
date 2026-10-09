-- The chat edge function reads the AI provider key from Vault (encrypted at rest).
-- Store it once with:  select vault.create_secret('<key>', 'llm_api_key');
-- Only the service role (server-side) can call this; users and anon cannot.
create or replace function public.llm_api_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'llm_api_key' limit 1;
$$;
revoke execute on function public.llm_api_key() from public, anon, authenticated;
grant execute on function public.llm_api_key() to service_role;
