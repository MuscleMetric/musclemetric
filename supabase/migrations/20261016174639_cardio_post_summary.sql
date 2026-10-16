-- Add cardio summary fields to existing JSON responses. Privacy filters and RPC signatures stay intact.
-- Distance is stored in kilometres; cardio time sums logged intervals, with elapsed-time fallback in UI.

CREATE OR REPLACE FUNCTION public.get_feed(p_limit integer DEFAULT 20, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(post_id uuid, user_id uuid, user_name text, user_username text, post_type text, visibility text, caption text, created_at timestamp with time zone, workout_history_id uuid, workout_snapshot jsonb, exercise_id uuid, exercise_name text, pr_snapshot jsonb, like_count integer, comment_count integer, viewer_liked boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$with base as (
  select p.*
  from public.posts p
  where
    (
      -- 1) my own posts
      p.user_id = auth.uid()

      -- 2) public posts from anyone I’m allowed to view (blocks/privacy)
      or (
        p.visibility = 'public'
        and public.can_view_user(auth.uid(), p.user_id)
      )

      -- 3) followers posts: I must follow the poster (and also not blocked)
      or (
        p.visibility = 'followers'
        and public.can_view_user(auth.uid(), p.user_id)
        and exists (
          select 1
          from public.user_follows f
          where f.follower_id = auth.uid()
            and f.followee_id = p.user_id
        )
      )

      -- 4) private posts: only owner (for now)
      or (
        p.visibility = 'private'
        and p.user_id = auth.uid()
      )
    )
    -- cursor (seek pagination)
    and (
      p_cursor_created_at is null
      or p.created_at < p_cursor_created_at
      or (p.created_at = p_cursor_created_at and p.id < p_cursor_id)
    )
  order by p.created_at desc, p.id desc
  limit greatest(1, least(p_limit, 100))
)
select
  b.id as post_id,
  b.user_id,
  pr.name as user_name,
  pr.username as user_username, -- ✅ add
  b.post_type,
  b.visibility,
  b.caption,
  b.created_at,
  b.workout_history_id,

  -- ✅ workout_snapshot: only meaningful for workout posts (or any post with workout_history_id)
  ws.workout_snapshot,

  b.exercise_id,
  ex.name as exercise_name, -- ✅ add (for PR posts)

  b.pr_snapshot,

  coalesce(lc.cnt, 0)::int as like_count,
  coalesce(cc.cnt, 0)::int as comment_count,
  coalesce(vl.liked, false) as viewer_liked
from base b
join public.profiles pr on pr.id = b.user_id

left join public.exercises ex
  on ex.id = b.exercise_id

-- workout snapshot hydration (safe, single lateral per post row)
left join lateral (
  select
    case
      when b.workout_history_id is null then null
      else jsonb_build_object(
        'workout_history_id', wh.id,
        'workout_id', wh.workout_id,
        'workout_title', w.title,
        'workout_image_key', w.workout_image_key,
        'completed_at', wh.completed_at,
        'duration_seconds', wh.duration_seconds,
        'exercises_count', coalesce(x.exercises_count, 0),
        'sets_count', coalesce(x.sets_count, 0),
        'total_volume', coalesce(x.total_volume, 0),
        'workout_kind', case when coalesce(x.has_cardio,false) then
          case when coalesce(x.has_strength,false) then 'mixed' else 'cardio' end
          else 'strength' end,
        'total_distance_km', coalesce(x.total_distance_km,0),
        'cardio_duration_seconds', coalesce(x.cardio_duration_seconds,0)
      )
    end as workout_snapshot
  from public.workout_history wh
  left join public.workouts w
    on w.id = wh.workout_id
  left join lateral (
    select
      count(distinct weh.id)::int as exercises_count,
      count(wsh.id)::int as sets_count,
      coalesce(sum(coalesce(wsh.weight,0) * coalesce(wsh.reps,0)), 0)::numeric as total_volume,
      bool_or(e.type = 'cardio') as has_cardio,
      bool_or(e.type <> 'cardio') as has_strength,
      sum(wsh.distance) filter (where e.type = 'cardio' and wsh.distance > 0) as total_distance_km,
      sum(wsh.time_seconds) filter (where e.type = 'cardio' and wsh.time_seconds > 0) as cardio_duration_seconds
    from public.workout_exercise_history weh
    left join public.exercises e on e.id = weh.exercise_id
    left join public.workout_set_history wsh
      on wsh.workout_exercise_history_id = weh.id
    where weh.workout_history_id = wh.id
  ) x on true
  where wh.id = b.workout_history_id
  limit 1
) ws on true

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
) vl on true

order by b.created_at desc, b.id desc;$function$;

CREATE OR REPLACE FUNCTION public.get_post_detail_v1(p_post_id uuid)
 RETURNS TABLE(post_id uuid, user_id uuid, user_name text, user_username text, post_type text, visibility text, caption text, created_at timestamp with time zone, workout_history_id uuid, workout_snapshot jsonb, exercise_id uuid, exercise_name text, pr_snapshot jsonb, like_count integer, comment_count integer, viewer_liked boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with target as (
  select p.*
  from public.posts p
  where p.id = p_post_id
    and (
      -- own post
      p.user_id = auth.uid()

      -- public post I’m allowed to view
      or (
        p.visibility = 'public'
        and public.can_view_user(auth.uid(), p.user_id)
      )

      -- followers-only post where I follow the poster
      or (
        p.visibility = 'followers'
        and public.can_view_user(auth.uid(), p.user_id)
        and exists (
          select 1
          from public.user_follows f
          where f.follower_id = auth.uid()
            and f.followee_id = p.user_id
        )
      )

      -- private: owner only
      or (
        p.visibility = 'private'
        and p.user_id = auth.uid()
      )
    )
  limit 1
)
select
  t.id as post_id,
  t.user_id,
  pr.name as user_name,
  pr.username as user_username,
  t.post_type,
  t.visibility,
  t.caption,
  t.created_at,
  t.workout_history_id,

  ws.workout_snapshot,

  t.exercise_id,
  ex.name as exercise_name,

  t.pr_snapshot,

  coalesce(lc.cnt, 0)::int as like_count,
  coalesce(cc.cnt, 0)::int as comment_count,
  coalesce(vl.liked, false) as viewer_liked
from target t
join public.profiles pr
  on pr.id = t.user_id

left join public.exercises ex
  on ex.id = t.exercise_id

left join lateral (
  select
    case
      when t.workout_history_id is null then null
      else jsonb_build_object(
        'workout_history_id', wh.id,
        'workout_id', wh.workout_id,
        'workout_title', w.title,
        'workout_image_key', w.workout_image_key,
        'completed_at', wh.completed_at,
        'duration_seconds', wh.duration_seconds,
        'exercises_count', coalesce(x.exercises_count, 0),
        'sets_count', coalesce(x.sets_count, 0),
        'total_volume', coalesce(x.total_volume, 0),
        'workout_kind', case when coalesce(x.has_cardio,false) then
          case when coalesce(x.has_strength,false) then 'mixed' else 'cardio' end
          else 'strength' end,
        'total_distance_km', coalesce(x.total_distance_km,0),
        'cardio_duration_seconds', coalesce(x.cardio_duration_seconds,0)
      )
    end as workout_snapshot
  from public.workout_history wh
  left join public.workouts w
    on w.id = wh.workout_id
  left join lateral (
    select
      count(distinct weh.id)::int as exercises_count,
      count(wsh.id)::int as sets_count,
      coalesce(sum(coalesce(wsh.weight, 0) * coalesce(wsh.reps, 0)), 0)::numeric as total_volume,
      bool_or(e.type = 'cardio') as has_cardio,
      bool_or(e.type <> 'cardio') as has_strength,
      sum(wsh.distance) filter (where e.type = 'cardio' and wsh.distance > 0) as total_distance_km,
      sum(wsh.time_seconds) filter (where e.type = 'cardio' and wsh.time_seconds > 0) as cardio_duration_seconds
    from public.workout_exercise_history weh
    left join public.exercises e on e.id = weh.exercise_id
    left join public.workout_set_history wsh
      on wsh.workout_exercise_history_id = weh.id
    where weh.workout_history_id = wh.id
  ) x on true
  where wh.id = t.workout_history_id
  limit 1
) ws on true

left join lateral (
  select count(*) as cnt
  from public.post_likes pl
  where pl.post_id = t.id
) lc on true

left join lateral (
  select count(*) as cnt
  from public.post_comments pc
  where pc.post_id = t.id
    and pc.deleted_at is null
) cc on true

left join lateral (
  select true as liked
  from public.post_likes pl
  where pl.post_id = t.id
    and pl.user_id = auth.uid()
  limit 1
) vl on true;
$function$;

CREATE OR REPLACE FUNCTION public.get_profile_overview_v1(p_profile_id uuid)
 RETURNS TABLE(profile_id uuid, name text, username text, visibility text, follow_state text, can_view boolean, workouts_completed integer, followers_count integer, following_count integer, recent_posts jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare
  v_viewer uuid := auth.uid();
  v_visibility profile_visibility;
  v_can_view boolean := false;
  v_following boolean := false;
  v_requested boolean := false;
begin
  if v_viewer is null then
    raise exception 'auth_missing';
  end if;

  if p_profile_id is null then
    raise exception 'profile_id_required';
  end if;

  -- Block gate (either direction)
  if exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = v_viewer and b.blocked_id = p_profile_id)
       or (b.blocker_id = p_profile_id and b.blocked_id = v_viewer)
  ) then
    return;
  end if;

  -- Must exist + fetch visibility
  select p.visibility
    into v_visibility
  from public.profiles p
  where p.id = p_profile_id;

  if not found then
    return;
  end if;

  -- Follow state logic
  if p_profile_id = v_viewer then
    follow_state := 'self';
    v_can_view := true;
  else
    v_following := exists (
      select 1
      from public.user_follows f
      where f.follower_id = v_viewer
        and f.followee_id = p_profile_id
    );

    v_requested := exists (
      select 1
      from public.follow_requests r
      where r.requester_id = v_viewer
        and r.target_id = p_profile_id
        and r.status = 'pending'
    );

    if v_following then
      follow_state := 'following';
    elsif v_requested then
      follow_state := 'requested';
    else
      follow_state := 'none';
    end if;

    if v_visibility = 'public' then
      v_can_view := true;
    elsif v_visibility = 'followers' then
      v_can_view := v_following;
    elsif v_visibility = 'private' then
      v_can_view := false;
    end if;
  end if;

  can_view := v_can_view;

  -- Always return identity bits
  select p.id, p.name, p.username, p.visibility::text
    into profile_id, name, username, visibility
  from public.profiles p
  where p.id = p_profile_id;

  -- If viewer cannot view full profile → return minimal
  if not v_can_view then
    workouts_completed := null;
    followers_count := null;
    following_count := null;
    recent_posts := '[]'::jsonb;
    return next;
    return;
  end if;

  -- Stats
  select count(*)::int
    into workouts_completed
  from public.workout_history wh
  where wh.user_id = p_profile_id;

  select count(*)::int
    into followers_count
  from public.user_follows f
  where f.followee_id = p_profile_id;

  select count(*)::int
    into following_count
  from public.user_follows f
  where f.follower_id = p_profile_id;

  -- Recent posts (feed-like payload)
  -- NOTE:
  -- Replace public.post_likes / public.post_comments below if your actual table names differ.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'post_id', rp.id,
        'user_id', rp.user_id,
        'user_name', rp.user_name,
        'user_username', rp.user_username,
        'post_type', rp.post_type,
        'visibility', rp.visibility,
        'caption', rp.caption,
        'created_at', rp.created_at,
        'like_count', rp.like_count,
        'comment_count', rp.comment_count,
        'viewer_liked', rp.viewer_liked,
        'workout_history_id', rp.workout_history_id,
        'exercise_id', rp.exercise_id,
        'exercise_name', rp.exercise_name,
        'workout_snapshot', rp.workout_snapshot,
        'pr_snapshot', rp.pr_snapshot
      )
      order by rp.created_at desc, rp.id desc
    ),
    '[]'::jsonb
  )
  into recent_posts
  from (
    select
      p.id,
      p.user_id,
      pr.name as user_name,
      pr.username as user_username,
      p.post_type,
      p.visibility::text as visibility,
      p.caption,
      p.created_at,
      p.workout_history_id,
      p.exercise_id,
      ex.name as exercise_name,
      p.pr_snapshot,

      case
        when p.post_type = 'workout' then jsonb_build_object(
          'workout_title', coalesce(w.title, 'Workout'),
          'duration_seconds', wh.duration_seconds,
          'total_volume', coalesce(ws.total_volume, 0),
        'workout_kind', case when coalesce(ws.has_cardio,false) then
          case when coalesce(ws.has_strength,false) then 'mixed' else 'cardio' end
          else 'strength' end,
        'total_distance_km', coalesce(ws.total_distance_km,0),
        'cardio_duration_seconds', coalesce(ws.cardio_duration_seconds,0),
          'sets_count', coalesce(ws.sets_count, 0),
          'exercises_count', coalesce(ws.exercises_count, 0),
          'workout_image_key', w.workout_image_key
        )
        else null
      end as workout_snapshot,

      (
        select count(*)::int
        from public.post_likes pl
        where pl.post_id = p.id
      ) as like_count,

      (
        select count(*)::int
        from public.post_comments pc
        where pc.post_id = p.id
      ) as comment_count,

      exists (
        select 1
        from public.post_likes vpl
        where vpl.post_id = p.id
          and vpl.user_id = v_viewer
      ) as viewer_liked

    from public.posts p
    join public.profiles pr
      on pr.id = p.user_id
    left join public.exercises ex
      on ex.id = p.exercise_id
    left join public.workout_history wh
      on wh.id = p.workout_history_id
    left join public.workouts w
      on w.id = wh.workout_id
    left join lateral (
      select
        coalesce(sum(coalesce(wsh.weight, 0) * coalesce(wsh.reps, 0)), 0)::numeric as total_volume,
      bool_or(e.type = 'cardio') as has_cardio,
      bool_or(e.type <> 'cardio') as has_strength,
      sum(wsh.distance) filter (where e.type = 'cardio' and wsh.distance > 0) as total_distance_km,
      sum(wsh.time_seconds) filter (where e.type = 'cardio' and wsh.time_seconds > 0) as cardio_duration_seconds,
        count(*)::int as sets_count,
        count(distinct weh.id)::int as exercises_count
      from public.workout_exercise_history weh
    left join public.exercises e on e.id = weh.exercise_id
      left join public.workout_set_history wsh
        on wsh.workout_exercise_history_id = weh.id
      where weh.workout_history_id = p.workout_history_id
    ) ws on true
    where p.user_id = p_profile_id
      and public.can_view_post(v_viewer, p.id)
    order by p.created_at desc, p.id desc
    limit 3
  ) rp;

  return next;
end;$function$;
