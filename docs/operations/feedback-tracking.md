# Feedback tracking and contributor updates

Workflow: new → reviewed → planned → in_progress → fixed → released.
Use declined for suggestions we do not intend to implement. Only trusted operators
using the Supabase SQL editor or a server-side service role can change status.
There is no client-accessible admin RPC and no new admin UI in this change.

`fixed` means implementation is ready; `released` means it is available to users.
Never infer release from a merged PR. Before marking released, verify the app
version is distributed and any required backend changes are deployed.

The feedback table records status, status_updated_at, github_pr_url and
released_version. feedback_status_events keeps transition history and the links
at that time. All existing feedback starts as new; reconcile it manually against
PRs/releases. This migration does not send historical notifications.

Example operator action (replace the placeholder with an actual feedback UUID):

```sql
update public.app_feedback
set status = 'in_progress',
    github_pr_url = 'https://github.com/MuscleMetric/musclemetric/pull/123'
where id = '<feedback UUID>';
```

When the improvement is actually distributed:

```sql
update public.app_feedback
set status = 'released', released_version = '1.0.7'
where id = '<feedback UUID>';
```

Only in_progress and released send updates, once per feedback/status, even if a
status is revisited. Ratings do not trigger implementation messages. The message
is generic so feedback text is never copied onto a lock screen. In-app updates
persist regardless of push permission; the existing worker honours push_enabled.
Device permissions, active tokens and worker operation still determine delivery.
Users can read the full message by tapping it in the existing notification inbox.

Deployment: apply the new additive migration, deploy the updated push worker,
and distribute the inbox client changes. Confirm CI database tests and test on a
physical iPhone using a dedicated test submission before changing real statuses.
Do not mark real feedback in progress merely to test notifications.
