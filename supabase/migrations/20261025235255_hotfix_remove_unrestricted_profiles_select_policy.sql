-- Hotfix already applied to production on 2026-10-25.
-- Cross-account profile lookup must use limited public identity RPCs, not full profile rows.
DROP POLICY IF EXISTS profiles_select_visible ON public.profiles;
