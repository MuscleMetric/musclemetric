-- Share a drawing of the route and measured splits only with the audience of one post.
-- The opt-in is bound to both the post and the workout. No route copy survives expiry.
create schema if not exists cardio_social;
revoke all on schema cardio_social from public, anon;
grant usage on schema cardio_social to authenticated;

create table cardio_social.route_shares (
  post_id uuid primary key references public.posts(id) on delete cascade,
  workout_history_id uuid not null references public.workout_history(id) on delete cascade
);
alter table cardio_social.route_shares enable row level security;
revoke all on cardio_social.route_shares from public, anon, authenticated;

create function cardio_social.set_route_share(p_post_id uuid, p_share boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  workout uuid;
begin
  select p.workout_history_id into workout from public.posts p
    where p.id = p_post_id and p.user_id = auth.uid() and p.post_type = 'workout' for update;
  if workout is null then raise exception 'Post unavailable'; end if;
  if p_share then
    if not exists (select 1 from public.cardio_recordings r where r.workout_history_id = workout
        and r.user_id = auth.uid() and r.status = 'completed' and r.source = 'gps'
        and r.started_at > now() - interval '2160 hours') then raise exception 'Route unavailable'; end if;
    insert into cardio_social.route_shares values (p_post_id, workout)
      on conflict (post_id) do update set workout_history_id = excluded.workout_history_id;
  else
    delete from cardio_social.route_shares where post_id = p_post_id;
  end if;
end
$$;

create function cardio_social.post_routes(p_post_id uuid, p_detail boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  with permitted as materialized (
    select p.workout_history_id, p.user_id, (p.user_id = auth.uid()) as owner, (s.post_id is not null) as shared
    from public.posts p left join cardio_social.route_shares s
      on s.post_id = p.id and s.workout_history_id = p.workout_history_id
    where auth.uid() is not null and p.id = p_post_id and p.post_type = 'workout'
      and (p.user_id = auth.uid() or (s.post_id is not null and public.can_view_user(auth.uid(),p.user_id)
        and public.can_view_post(auth.uid(),p.id)))
  ), recordings as (
    select r.*, p.owner, p.shared from permitted p join public.cardio_recordings r
      on r.user_id = p.user_id and r.workout_history_id = p.workout_history_id
    where r.source='gps' and r.status='completed' and r.started_at > now() - interval '2160 hours'
    order by r.started_at, r.id limit (case when p_detail then null else 1 end)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'owner',r.owner,'shared',r.shared,'type',r.run_type,'completed',r.completed_at,
    'meters',r.distance_meters,'active',r.moving_seconds,'elapsed',r.elapsed_seconds,'effort',r.effort_rpe,
    'drawing',image.lines,'frame',image.frame,'splits', case when p_detail then (
      select coalesce(jsonb_agg(jsonb_build_object('distance',s.distance_meters,'seconds',s.duration_seconds,
        'partial',s.is_partial) order by s.split_index),'[]'::jsonb)
      from public.cardio_splits s where s.recording_id=r.id) else '[]'::jsonb end)
    order by r.started_at,r.id),'[]'::jsonb)
  from recordings r cross join lateral (
    with samples as (
      select point_index, leg_index, latitude, longitude,
        first_value(longitude) over (order by point_index) as origin,
        avg(latitude) over () as mean_lat,
        row_number() over (partition by leg_index order by point_index) as n,
        count(*) over (partition by leg_index) as leg_size,
        count(*) over () as total
      from public.cardio_route_points where recording_id=r.id
    ), projected as (
      select point_index, leg_index, n, origin, mean_lat,
        (mod((longitude-origin+540)::numeric,360)-180) * cos(radians(mean_lat::float8)) as x,
        -latitude::float8 as y from samples
      where leg_size > 1 and (n=1 or n=leg_size or mod(n,greatest(1,ceil(total/240.0)::bigint))=0)
    ), bounds as (
      select *, min(x) over () as xmin,max(x) over () as xmax,min(y) over () as ymin,max(y) over () as ymax from projected
    ), scaled as (
      select *, least(286/greatest(xmax-xmin,0.000001),154/greatest(ymax-ymin,0.000001)) as scale from bounds
    )
    , pixels as (
      select leg_index,point_index,round(160+(x-(xmin+xmax)/2)*scale)::int as px,
        round(90+(y-(ymin+ymax)/2)*scale)::int as py from scaled
    ), lines as (
      select min(point_index) as first_point,jsonb_agg(jsonb_build_array(px,py) order by point_index) as line
      from pixels group by leg_index
    )
    select (select jsonb_agg(line order by first_point) from lines) as lines,
      (select jsonb_build_object(
        'lat',round((-(ymin+ymax)/2)::numeric,4),
        'lon',round((mod((origin+(xmin+xmax)/(2*greatest(0.000001,cos(radians(mean_lat::float8))))+540)::numeric,360)-180),4),
        'latStep',1/scale,'lonStep',1/(scale*greatest(0.000001,cos(radians(mean_lat::float8)))))
       from scaled limit 1) as frame
  ) image
$$;

create function public.get_post_routes_v1(p_post_id uuid,p_detail boolean default false)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select cardio_social.post_routes(p_post_id,p_detail)
$$;
create function public.set_post_route_share_v1(p_post_id uuid,p_share boolean)
returns void language sql security invoker set search_path = '' as $$
  select cardio_social.set_route_share(p_post_id,p_share)
$$;
revoke all on function cardio_social.post_routes(uuid,boolean), cardio_social.set_route_share(uuid,boolean),
 public.get_post_routes_v1(uuid,boolean),public.set_post_route_share_v1(uuid,boolean) from public,anon;
grant execute on function cardio_social.post_routes(uuid,boolean), cardio_social.set_route_share(uuid,boolean),
 public.get_post_routes_v1(uuid,boolean),public.set_post_route_share_v1(uuid,boolean) to authenticated;
