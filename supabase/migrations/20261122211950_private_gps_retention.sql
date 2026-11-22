-- Completed recording headers contain workout statistics only. Keep them so
-- active/elapsed time, distance, run type and effort survive detail expiry.
create extension if not exists pg_cron;
create index cardio_gps_retention_idx on public.cardio_recordings (started_at) where source = 'gps';

create policy cardio_points_retention on public.cardio_route_points
as restrictive for all to authenticated using (
  exists (select 1 from public.cardio_recordings r where r.id = recording_id
    and (r.source <> 'gps' or r.started_at > now() - interval '2160 hours'))
);
create policy cardio_splits_retention on public.cardio_splits
as restrictive for all to authenticated using (
  exists (select 1 from public.cardio_recordings r where r.id = recording_id
    and (r.source <> 'gps' or r.started_at > now() - interval '2160 hours'))
);

select cron.schedule('purge-expired-private-gps', '7 * * * *', $job$
  delete from public.cardio_route_points p using public.cardio_recordings r
    where p.recording_id = r.id and r.source = 'gps' and r.started_at <= now() - interval '2160 hours';
  delete from public.cardio_splits s using public.cardio_recordings r
    where s.recording_id = r.id and r.source = 'gps' and r.started_at <= now() - interval '2160 hours';
  delete from public.cardio_recordings where source = 'gps' and status <> 'completed'
    and started_at <= now() - interval '2160 hours';
$job$);
