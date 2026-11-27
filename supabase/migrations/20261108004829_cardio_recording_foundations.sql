-- MuscleMetric v1.1.0 cardio recording foundations.
-- Additive only: existing workout history, cardio PRs and save RPCs remain unchanged.
-- Precise locations are private to the recording owner. No public route read API.

create table public.cardio_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_history_id uuid unique references public.workout_history(id) on delete cascade,
  source text not null default 'gps' check (source in ('gps', 'manual')),
  status text not null default 'recording' check (status in ('recording', 'paused', 'completed')),
  -- Required at completion; may be unset while recording.
  run_type text check (run_type in ('easy', 'tempo', 'intervals', 'long_run', 'race')),
  -- Optional post-run rating of perceived exertion (1 = very easy, 10 = maximal).
  effort_rpe smallint check (effort_rpe between 1 and 10),
  started_at timestamptz not null,
  completed_at timestamptz,
  distance_meters numeric(12,2) not null default 0 check (distance_meters >= 0),
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  moving_seconds integer check (moving_seconds >= 0 and moving_seconds <= elapsed_seconds),
  created_at timestamptz not null default now(),
  constraint cardio_recordings_completion_check check (
    (status = 'completed' and run_type is not null and completed_at is not null
      and completed_at >= started_at)
    or (status <> 'completed' and completed_at is null)
  )
);

create index cardio_recordings_owner_date_idx
  on public.cardio_recordings (user_id, started_at desc);

-- The associated completed workout must belong to exactly the same user.
-- This also guards direct PostgREST writes, not only app-side checks.
create function public.cardio_recording_check_workout_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.workout_history_id is not null and not exists (
    select 1 from public.workout_history h
    where h.id = new.workout_history_id and h.user_id = new.user_id
  ) then
    raise exception 'Workout history must belong to recording owner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger cardio_recording_check_workout_owner_trg
before insert or update of user_id, workout_history_id on public.cardio_recordings
for each row execute function public.cardio_recording_check_workout_owner();

revoke all on function public.cardio_recording_check_workout_owner() from public, anon, authenticated;

-- Append ordered, quality-annotated GPS samples; do not add them to post payloads.
create table public.cardio_route_points (
  id bigint generated always as identity primary key,
  recording_id uuid not null references public.cardio_recordings(id) on delete cascade,
  point_index integer not null check (point_index >= 0),
  recorded_at timestamptz not null,
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  altitude_m numeric(9,2),
  horizontal_accuracy_m numeric(9,2) check (horizontal_accuracy_m >= 0),
  unique (recording_id, point_index)
);

-- Derived kilometre splits; a final partial split may be flagged.
-- "gps" denotes measured route-derived data, not average-pace projections.
create table public.cardio_splits (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.cardio_recordings(id) on delete cascade,
  split_index integer not null check (split_index > 0),
  distance_meters numeric(12,2) not null check (distance_meters > 0),
  duration_seconds integer not null check (duration_seconds > 0),
  end_elapsed_seconds integer not null check (end_elapsed_seconds > 0),
  is_partial boolean not null default false,
  source text not null default 'gps' check (source in ('gps', 'manual')),
  unique (recording_id, split_index)
);

create index cardio_route_points_recording_time_idx
  on public.cardio_route_points (recording_id, recorded_at);
create index cardio_splits_recording_idx
  on public.cardio_splits (recording_id);

alter table public.cardio_recordings enable row level security;
alter table public.cardio_route_points enable row level security;
alter table public.cardio_splits enable row level security;

revoke all on public.cardio_recordings, public.cardio_route_points, public.cardio_splits
  from public, anon, authenticated;
grant select, insert, update, delete on public.cardio_recordings to authenticated;
grant select, insert, delete on public.cardio_route_points, public.cardio_splits to authenticated;
grant all on public.cardio_recordings, public.cardio_route_points, public.cardio_splits to service_role;
-- Required for INSERT of identity-backed route samples.
grant usage, select on sequence public.cardio_route_points_id_seq to authenticated;
grant all on sequence public.cardio_route_points_id_seq to service_role;

create policy cardio_recordings_select_own on public.cardio_recordings
for select to authenticated using (user_id = (select auth.uid()));
create policy cardio_recordings_insert_own on public.cardio_recordings
for insert to authenticated with check (user_id = (select auth.uid()));
create policy cardio_recordings_update_own on public.cardio_recordings
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy cardio_recordings_delete_own on public.cardio_recordings
for delete to authenticated using (user_id = (select auth.uid()));

create policy cardio_route_points_select_own on public.cardio_route_points
for select to authenticated using (
  exists (select 1 from public.cardio_recordings r
    where r.id = recording_id and r.user_id = (select auth.uid()))
);
create policy cardio_route_points_insert_own on public.cardio_route_points
for insert to authenticated with check (
  exists (select 1 from public.cardio_recordings r
    where r.id = recording_id and r.user_id = (select auth.uid()))
);
create policy cardio_route_points_delete_own on public.cardio_route_points
for delete to authenticated using (
  exists (select 1 from public.cardio_recordings r
    where r.id = recording_id and r.user_id = (select auth.uid()))
);

create policy cardio_splits_select_own on public.cardio_splits
for select to authenticated using (
  exists (select 1 from public.cardio_recordings r
    where r.id = recording_id and r.user_id = (select auth.uid()))
);
create policy cardio_splits_insert_own on public.cardio_splits
for insert to authenticated with check (
  exists (select 1 from public.cardio_recordings r
    where r.id = recording_id and r.user_id = (select auth.uid()))
);
create policy cardio_splits_delete_own on public.cardio_splits
for delete to authenticated using (
  exists (select 1 from public.cardio_recordings r
    where r.id = recording_id and r.user_id = (select auth.uid()))
);
