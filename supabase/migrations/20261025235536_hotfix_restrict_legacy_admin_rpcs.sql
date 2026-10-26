-- Preserve service_role access for backend administrative operations.
REVOKE EXECUTE ON FUNCTION public.admin_new_users(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_users_one_workout(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_users_zero_workouts(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_workouts_missing_sets(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_alerts_v1(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_ops_snapshot_v1() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_job_runs_recent(text, integer) FROM PUBLIC, anon, authenticated;
