-- Schedule nightly-data-hygiene at 11:00 PM EST (04:00 UTC)
-- Auto-merges duplicate contacts, strips "Zap name" prefixes,
-- checks sync health, flags data quality issues, posts report to Slack.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_jobid integer;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'nightly-data-hygiene-2300-est' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'nightly-data-hygiene-2300-est',
  '0 4 * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/nightly-data-hygiene',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body:='{"dry_run": false, "days_back": 7}'::jsonb
  ) $$
);
