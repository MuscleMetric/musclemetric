-- Close unused legacy elevated endpoints with caller-controlled user and plan parameters.
-- The released app has no direct call sites for these functions.
-- Trusted internal service-role and postgres access is retained.
REVOKE EXECUTE ON FUNCTION public.dev_delete_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_progress_overview(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_last_exercise_best_set(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_entitlements_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_plan_test_v1(uuid, text, date, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_full_plan_test_v1(uuid, uuid, text, date, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_full_plan(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_expired_plans_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_user_entitlement(uuid, text, text) FROM PUBLIC, anon, authenticated;
