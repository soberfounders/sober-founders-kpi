-- Reschedule KPI master sync from weekly to twice daily.
-- Requested times are fixed EST (UTC-5): 12:00 PM and 1:05 PM EST.
-- This maps to 17:00 and 18:05 UTC and will shift by one hour during EDT.

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
DECLARE
  v_jobid integer;
BEGIN
  -- Remove legacy weekly job if present.
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'monday-kpi-sync' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  -- Replace jobs idempotently if this migration is reapplied in nonstandard environments.
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'daily-kpi-sync-1200-est' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'daily-kpi-sync-1305-est' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;
-- 12:00 PM EST = 17:00 UTC (fixed EST schedule)
SELECT cron.schedule(
  'daily-kpi-sync-1200-est',
  '0 17 * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/master-sync?trigger_refresh=true&hubspot_days=45',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
-- 1:05 PM EST = 18:05 UTC (fixed EST schedule)
SELECT cron.schedule(
  'daily-kpi-sync-1305-est',
  '5 18 * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/master-sync?trigger_refresh=true&hubspot_days=45',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
