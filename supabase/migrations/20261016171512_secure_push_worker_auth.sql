-- The scheduled worker authenticates a dedicated Vault token, never a public API key.
-- Secrets are provisioned separately per environment; an unconfigured worker fails closed.
create or replace function public.verify_push_worker_token_v1(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token) = 64 and exists (
    select 1 from vault.decrypted_secrets
    where name = 'push_worker_token'
      and extensions.digest(decrypted_secret, 'sha256') = extensions.digest(p_token, 'sha256')
  ), false);
$$;
revoke all on function public.verify_push_worker_token_v1(text) from public,anon,authenticated;
grant execute on function public.verify_push_worker_token_v1(text) to service_role;
