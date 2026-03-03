-- Harden Tuesday/Thursday attendance sync scheduling.
-- Goal:
-- 1) Keep post-meeting syncs running year-round across EST/EDT shifts.
-- 2) Keep same-day retries for delayed HubSpot writes.
-- 3) Add a daily catch-up run so the pipeline self-heals automatically.
--
-- Note:
-- pg_cron schedules are UTC-only in this stack, so we schedule both UTC variants
-- for ET-targeted windows. The sync function is idempotent and can run multiple
-- times safely.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_jobid integer;
  v_jobname text;
BEGIN
  FOREACH v_jobname IN ARRAY ARRAY[
    -- Legacy post-meeting jobs
    'post-meeting-attendance-sync-tue-1315-est',
    'post-meeting-attendance-sync-thu-1215-est',
    'post-meeting-attendance-sync-tue-1615-est-retry',
    'post-meeting-attendance-sync-thu-1515-est-retry',

    -- Hardened jobs (unschedule if migration is re-run)
    'post-meeting-attendance-sync-tue-1315-et-primary-est',
    'post-meeting-attendance-sync-tue-1315-et-primary-edt',
    'post-meeting-attendance-sync-tue-1615-et-retry-est',
    'post-meeting-attendance-sync-tue-1615-et-retry-edt',
    'post-meeting-attendance-sync-thu-1215-et-primary-est',
    'post-meeting-attendance-sync-thu-1215-et-primary-edt',
    'post-meeting-attendance-sync-thu-1515-et-retry-est',
    'post-meeting-attendance-sync-thu-1515-et-retry-edt',
    'daily-hubspot-attendance-catchup-0905-utc'
  ] LOOP
    SELECT jobid INTO v_jobid
    FROM cron.job
    WHERE jobname = v_jobname
    LIMIT 1;

    IF v_jobid IS NOT NULL THEN
      PERFORM cron.unschedule(v_jobid);
    END IF;
  END LOOP;
END $$;

-- Tuesday primary window:
-- 1:15 PM ET => 18:15 UTC (EST) or 17:15 UTC (EDT)
SELECT cron.schedule(
  'post-meeting-attendance-sync-tue-1315-et-primary-est',
  '15 18 * * 2',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'post-meeting-attendance-sync-tue-1315-et-primary-edt',
  '15 17 * * 2',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

-- Tuesday retry window:
-- 4:15 PM ET => 21:15 UTC (EST) or 20:15 UTC (EDT)
SELECT cron.schedule(
  'post-meeting-attendance-sync-tue-1615-et-retry-est',
  '15 21 * * 2',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'post-meeting-attendance-sync-tue-1615-et-retry-edt',
  '15 20 * * 2',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

-- Thursday primary window:
-- 12:15 PM ET => 17:15 UTC (EST) or 16:15 UTC (EDT)
SELECT cron.schedule(
  'post-meeting-attendance-sync-thu-1215-et-primary-est',
  '15 17 * * 4',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'post-meeting-attendance-sync-thu-1215-et-primary-edt',
  '15 16 * * 4',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

-- Thursday retry window:
-- 3:15 PM ET => 20:15 UTC (EST) or 19:15 UTC (EDT)
SELECT cron.schedule(
  'post-meeting-attendance-sync-thu-1515-et-retry-est',
  '15 20 * * 4',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'post-meeting-attendance-sync-thu-1515-et-retry-edt',
  '15 19 * * 4',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

-- Daily self-heal catch-up:
-- re-sync recent attendance every morning to absorb API/write delays.
SELECT cron.schedule(
  'daily-hubspot-attendance-catchup-0905-utc',
  '5 9 * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
