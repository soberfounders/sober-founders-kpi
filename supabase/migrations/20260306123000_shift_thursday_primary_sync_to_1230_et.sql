-- Shift Thursday primary attendance sync from 12:15 PM ET to 12:30 PM ET.
-- Keeps EST/EDT dual scheduling and existing retry windows unchanged.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_jobid integer;
  v_jobname text;
BEGIN
  FOREACH v_jobname IN ARRAY ARRAY[
    'post-meeting-attendance-sync-thu-1215-et-primary-est',
    'post-meeting-attendance-sync-thu-1215-et-primary-edt',
    'post-meeting-attendance-sync-thu-1230-et-primary-est',
    'post-meeting-attendance-sync-thu-1230-et-primary-edt'
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

-- 12:30 PM ET => 17:30 UTC (EST) or 16:30 UTC (EDT)
SELECT cron.schedule(
  'post-meeting-attendance-sync-thu-1230-et-primary-est',
  '30 17 * * 4',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'post-meeting-attendance-sync-thu-1230-et-primary-edt',
  '30 16 * * 4',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_attendance_from_hubspot?days=30&include_reconcile=true&include_luma=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
