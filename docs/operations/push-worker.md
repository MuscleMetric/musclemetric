# Scheduled push sender

The old hosted cron used literal `Bearer YOUR_TOKEN`, causing gateway 401s.
This server-only repair uses an independent random 256-bit Vault secret. The
worker verifies x-worker-token with a service-only database function before
claiming any jobs. Gateway JWT checking is off because the handler authenticates
this custom credential itself. Missing configuration, wrong tokens and database
errors fail closed. Never use a publishable/anon key as worker authorization.

Deploy the migration, provision Vault names `push_worker_token` (64 lowercase hex
characters) and `push_worker_url` (project function URL), then deploy the function
with its auth.ts dependency and verify_jwt=false. Configure the existing minutely
cron to read these secrets; do not print secret values or commit them to Git.

```sql
select cron.alter_job(
  (select jobid from cron.job where jobname='process-notification-push-jobs-every-1m'),
  command := $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='push_worker_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-worker-token',
      (select decrypted_secret from vault.decrypted_secrets where name='push_worker_token')),
    body := '{"batchSize":20}'::jsonb
  );
  $job$
);
```

Validate both unauthorized HTTP 401 and authorized HTTP 200, queued job outcomes
and a physical phone. `sent` currently means Expo accepted a ticket, not a device
delivery receipt. An active token and enabled preferences do not prove APNs
acceptance or an iOS banner (Focus/notification settings can suppress display).
This repair does not deploy feedback status migrations or send promises about
unreleased features. Rollback: deactivate cron before restoring the previous
worker's JWT configuration; never leave a worker without handler authentication.
