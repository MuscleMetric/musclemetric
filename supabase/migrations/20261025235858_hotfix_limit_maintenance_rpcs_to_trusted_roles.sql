-- Keep trusted scheduled/background maintenance callable as postgres/service_role only.
REVOKE EXECUTE ON FUNCTION public.admin_cron_end_due_plans() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_cron_recompute_all_step_stats(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_cron_weekly_rollover() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_job_run_start(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_job_run_finish(uuid, text, integer, integer, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_log_error(text, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.end_due_plans() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_all_step_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_step_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_weekly_goal_stats(uuid) FROM PUBLIC, anon, authenticated;
