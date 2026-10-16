-- v2 adds a request-atomic owner guard without changing the v1 signature.
-- Existing App Store clients must continue to save via v1 until they upgrade.
-- Deploy this migration before distributing an app build that calls v2.
create or replace function public.save_completed_workout_v2(
  p_workout jsonb,
  p_expected_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $function$
declare
  v_authenticated_user uuid;
begin
  v_authenticated_user := auth.uid();

  -- The authenticated identity comes from this request's JWT. The expected
  -- identity must originate from the persisted workout/queued job, not a
  -- fresh reading of the current account during a retry.
  if v_authenticated_user is null
     or p_expected_user_id is null
     or v_authenticated_user is distinct from p_expected_user_id then
    raise exception 'workout_owner_mismatch'
      using errcode = '42501';
  end if;

  -- Same request/transaction/JWT: auth.uid() cannot change between this
  -- check and the existing atomic, idempotent v1 save.
  return public.save_completed_workout_v1(p_workout);
end;
$function$;

revoke all on function public.save_completed_workout_v2(jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.save_completed_workout_v2(jsonb, uuid)
  to authenticated;
