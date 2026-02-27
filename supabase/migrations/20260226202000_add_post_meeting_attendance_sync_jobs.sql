-- Schedule post-meeting attendance sync for Tue/Thu recurring sessions.
-- Assumption:
-- - Tuesday group call starts 12:00 PM ET, ends 1:00 PM ET.
-- - Thursday group call starts 11:00 AM ET, ends 12:00 PM ET.
-- - Attendance sync should run 15 minutes after end.
--
-- Fixed EST (UTC-5) mapping used in this project:
-- - Tuesday 1:15 PM EST  => 18:15 UTC
-- - Thursday 12:15 PM EST => 17:15 UTC

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_jobid integer;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'post-meeting-attendance-sync-tue-1315-est' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'post-meeting-attendance-sync-thu-1215-est' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'post-meeting-attendance-sync-tue-1315-est',
  '15 18 * * 2',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'post-meeting-attendance-sync-thu-1215-est',
  '15 17 * * 4',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
