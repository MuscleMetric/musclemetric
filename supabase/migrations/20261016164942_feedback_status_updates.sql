-- Additive tracking; existing submissions start as new. No historical notifications.
alter table public.app_feedback
  add column status text not null default 'new'
    check (status in ('new','reviewed','planned','in_progress','fixed','released','declined')),
  add column status_updated_at timestamptz not null default now(),
  add column github_pr_url text,
  add column released_version text,
  add constraint feedback_release_version_required
    check (status <> 'released' or nullif(btrim(released_version),'') is not null);

-- Keep submission available to old clients, but never let clients supply workflow fields.
revoke insert, update on public.app_feedback from authenticated, anon;
grant insert (id,user_id,feedback_type,source_screen,category,message,
  additional_context,impact,rating,rating_tags,app_version,platform,os_version,
  device_model,metadata,created_at) on public.app_feedback to authenticated;
grant select, update on public.app_feedback to service_role;

create table public.feedback_status_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.app_feedback(id) on delete cascade,
  previous_status text not null,
  status text not null,
  github_pr_url text,
  released_version text,
  created_at timestamptz not null default now()
);
alter table public.feedback_status_events enable row level security;
revoke all on public.feedback_status_events from public, anon, authenticated;
grant select, insert on public.feedback_status_events to service_role;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check
  (type in ('followed_you','follow_request_received','follow_request_accepted',
    'post_liked','post_commented','following_posted_pr','following_posted_workout',
    'feedback_in_progress','feedback_released'));
alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check
  (entity_type in ('profile','follow_request','post','comment','feedback'));

-- Invoked only by the table trigger. Application roles cannot update workflow fields.
-- Definer is needed to atomically write the internal notification and audit tables.
create function public.notify_feedback_status_change_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  notification_id uuid;
  notification_title text;
  notification_body text;
begin
  if new.status is not distinct from old.status then
    new.status_updated_at := old.status_updated_at;
    return new;
  end if;
  new.status_updated_at := now();
  insert into public.feedback_status_events
    (feedback_id,previous_status,status,github_pr_url,released_version)
    values(new.id,old.status,new.status,new.github_pr_url,new.released_version);

  -- Ratings are acknowledged by the submission flow, not promised implementation.
  if new.feedback_type = 'rating' then return new; end if;
  if new.status = 'in_progress' then
    notification_title := 'Your feedback is helping shape MuscleMetric';
    notification_body := 'Thank you for sharing your feedback! We have started working on an improvement inspired by it. You are helping make MuscleMetric better.';
  elsif new.status = 'released' then
    notification_title := 'An improvement you helped inspire is here';
    notification_body := 'Thank you for helping improve MuscleMetric! An update addressing your feedback is available in version ' || new.released_version || '. Make sure your app is up to date to try it.';
  else
    return new;
  end if;
  notification_id := public.create_notification_v1(
    new.user_id, null::uuid, 'feedback_' || new.status,
    notification_title, notification_body, 'feedback', new.id,
    'feedback:' || new.id::text || ':' || new.status);
  perform public.enqueue_notification_push_v1(notification_id,new.user_id);
  return new;
end;
$$;
revoke all on function public.notify_feedback_status_change_v1() from public,anon,authenticated,service_role;
create trigger feedback_status_changed before update on public.app_feedback
for each row execute function public.notify_feedback_status_change_v1();
