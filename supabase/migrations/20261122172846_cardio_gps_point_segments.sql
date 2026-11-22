-- Preserve breaks in a measured route after a private backup is restored.
alter table public.cardio_route_points
  add column leg_index integer check (leg_index >= 0),
  add column active_ms bigint check (active_ms >= 0),
  add column cumulative_meters double precision check (cumulative_meters >= 0);
