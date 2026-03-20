-- Remove standalone transaction-digest cron job.
-- Transaction anomalies are now part of the ai-briefing Slack delivery.

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
