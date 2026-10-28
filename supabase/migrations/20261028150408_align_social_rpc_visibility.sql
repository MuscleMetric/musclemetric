-- Share the current visibility gate across legacy social endpoints.
-- Keep raw profiles self-only; user-post names come from the explicit identity allowlist.
CREATE OR REPLACE FUNCTION public.can_view_post(p_viewer uuid, p_post_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    case
      when auth.uid() is null or p_viewer is distinct from auth.uid() or p_post_id is null then false
      when exists (
        select 1
        from public.posts p
        where p.id = p_post_id
          and (
            -- owner always
            p.user_id = p_viewer

            -- public post: viewer must be allowed to view poster
            or (p.visibility = 'public' and public.can_view_user(p_viewer, p.user_id))

            -- followers post: viewer must follow poster
            or (p.visibility = 'followers' and public.can_view_user(p_viewer, p.user_id) and exists (
              select 1 from public.user_follows f
              where f.follower_id = p_viewer and f.followee_id = p.user_id
            ))
          )
      ) then true
      else false
    end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_posts_v1(p_user_id uuid, p_limit integer DEFAULT 30, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(post_id uuid, user_id uuid, user_name text, post_type text, visibility text, caption text, created_at timestamp with time zone, workout_history_id uuid, exercise_id uuid, pr_snapshot jsonb, like_count integer, comment_count integer, viewer_liked boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'extensions', 'pg_catalog'
AS $function$
  with base as (
    select p.*
    from public.posts p
    where p.user_id = p_user_id

      -- seek pagination
      and (
        p_cursor_created_at is null
        or p.created_at < p_cursor_created_at
        or (p.created_at = p_cursor_created_at and p.id < p_cursor_id)
      )

      -- viewer must be allowed to see the post
      and public.can_view_post(auth.uid(), p.id)

    order by p.created_at desc, p.id desc
    limit greatest(1, least(p_limit, 100))
  )
  select
    b.id as post_id,
    b.user_id,
    pr.name as user_name,
    b.post_type,
    b.visibility,
    b.caption,
    b.created_at,
    b.workout_history_id,
    b.exercise_id,
    b.pr_snapshot,

    coalesce(lc.cnt, 0)::int as like_count,
    coalesce(cc.cnt, 0)::int as comment_count,
    coalesce(vl.liked, false) as viewer_liked

  from base b
  join lateral public.get_social_identities_v1(array[b.user_id]) pr on pr.id = b.user_id

  left join lateral (
    select count(*) as cnt
    from public.post_likes pl
    where pl.post_id = b.id
  ) lc on true

  left join lateral (
    select count(*) as cnt
    from public.post_comments pc
    where pc.post_id = b.id
      and pc.deleted_at is null
  ) cc on true

  left join lateral (
    select true as liked
    from public.post_likes pl
    where pl.post_id = b.id
      and pl.user_id = auth.uid()
    limit 1
  ) vl on true;
$function$;

-- Legacy card delegates to the current checked profile endpoint rather than the removed is_private column.
CREATE OR REPLACE FUNCTION public.get_profile_card_v1(p_profile_id uuid)
RETURNS TABLE(profile_id uuid, name text, username text, is_private boolean,
  can_view boolean, follow_state text, workouts_completed integer,
  followers_count integer, following_count integer, recent_posts jsonb)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT p.profile_id, p.name, p.username, p.visibility <> 'public',
    p.can_view, p.follow_state, p.workouts_completed,
    p.followers_count, p.following_count, p.recent_posts
  FROM public.get_profile_overview_v1(p_profile_id) p
$$;
REVOKE ALL ON FUNCTION public.get_profile_card_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_card_v1(uuid) TO authenticated;
