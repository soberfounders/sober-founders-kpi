-- Add same-day retry jobs for post-meeting attendance sync.
-- Primary jobs run 15 minutes after expected Tue/Thu group meeting end.
-- These retries help when provider writes lag slightly beyond that window,
-- so recent Tuesday/Thursday sessions backfill without manual intervention.

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
DECLARE
  v_jobid integer;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'post-meeting-attendance-sync-tue-1615-est-retry' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'post-meeting-attendance-sync-thu-1515-est-retry' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;
-- Tuesday retry: 4:15 PM EST = 21:15 UTC
SELECT cron.schedule(
  'post-meeting-attendance-sync-tue-1615-est-retry',
  '15 21 * * 2',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
-- Thursday retry: 3:15 PM EST = 20:15 UTC
SELECT cron.schedule(
  'post-meeting-attendance-sync-thu-1515-est-retry',
  '15 20 * * 4',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
