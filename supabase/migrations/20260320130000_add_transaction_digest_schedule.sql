-- Schedule daily transaction digest email.
-- Runs every day at 7:00 AM EST (12:00 UTC).
-- During EDT this fires at 8:00 AM local, which is fine.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior version of this job
DO $$
DECLARE
  v_jobid integer;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'daily-transaction-digest-0700-est'
  LIMIT 1;

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- Schedule daily at 12:00 UTC (7:00 AM EST)
SELECT cron.schedule(
  'daily-transaction-digest-0700-est',
  '0 12 * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/transaction-digest',
      headers:=jsonb_build_object('Content-Type', 'application/json')
  ) $$
);
