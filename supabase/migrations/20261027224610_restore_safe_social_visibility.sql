-- Private authorization helper; no profile rows are returned.
CREATE SCHEMA IF NOT EXISTS social_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA social_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA social_private TO authenticated;
CREATE OR REPLACE FUNCTION social_private.can_view_profile(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_vis public.profile_visibility;
  p_viewer uuid := auth.uid();
begin
  if p_viewer is null or p_profile_id is null then
    return false;
  end if;

  -- block gate either direction
  if exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = p_viewer and b.blocked_id = p_profile_id)
       or (b.blocker_id = p_profile_id and b.blocked_id = p_viewer)
  ) then
    return false;
  end if;

  -- self always view
  if p_viewer = p_profile_id then
    return true;
  end if;

  select p.visibility
    into v_vis
  from public.profiles p
  where p.id = p_profile_id;

  if not found then
    return false;
  end if;

  if v_vis = 'public' then
    return true;
  end if;

  if v_vis = 'followers' then
    return exists (
      select 1
      from public.user_follows f
      where f.follower_id = p_viewer
        and f.followee_id = p_profile_id
    );
  end if;

  -- private: only self (already handled)
  return false;
end;
$function$;
REVOKE ALL ON FUNCTION social_private.can_view_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION social_private.can_view_profile(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_user(p_viewer uuid, p_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT CASE WHEN auth.uid() IS NOT NULL AND p_viewer = auth.uid()
 THEN social_private.can_view_profile(p_profile_id) ELSE false END $$;
REVOKE ALL ON FUNCTION public.can_view_user(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_user(uuid,uuid) TO authenticated, service_role;

-- Explicit three-field allowlist. Never return profiles.* or row_to_json(profiles).
CREATE OR REPLACE FUNCTION public.get_social_identities_v1(p_user_ids uuid[])
RETURNS TABLE(id uuid, name text, username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT p.id, p.name, p.username FROM public.profiles p
 WHERE auth.uid() IS NOT NULL AND p.id = ANY(p_user_ids)
 AND social_private.can_view_profile(p.id)
 ORDER BY p.id
$$;
REVOKE ALL ON FUNCTION public.get_social_identities_v1(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_identities_v1(uuid[]) TO authenticated;
