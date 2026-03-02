-- Weekly historical attendance backfill.
-- Purpose:
-- 1) Ensure older HubSpot call/meeting attendance rows are continuously backfilled.
-- 2) Prevent historical month gaps (for example May-July) after deploy/runtime drift.

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
DECLARE
  v_jobid integer;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'weekly-hubspot-attendance-backfill-sun-0200-est' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'weekly-hubspot-attendance-reconcile-sun-0230-est' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;
-- Sunday 2:00 AM EST = 07:00 UTC (fixed EST mapping)
SELECT cron.schedule(
  'weekly-hubspot-attendance-backfill-sun-0200-est',
  '0 7 * * 0',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/sync_hubspot_meeting_activities?days=730&include_calls=true&include_meetings=true',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
-- Sunday 2:30 AM EST = 07:30 UTC (fixed EST mapping)
SELECT cron.schedule(
  'weekly-hubspot-attendance-reconcile-sun-0230-est',
  '30 7 * * 0',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/reconcile_zoom_attendee_hubspot_mappings?days=730&dry_run=false',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
