-- Schedule weekly AI strategy briefing generation.
-- Requested schedule: Monday 7:00 AM EST.
-- Fixed EST schedule maps to 12:00 UTC and shifts by +1 hour during EDT.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_jobid integer;
  v_jobname text;
BEGIN
  FOREACH v_jobname IN ARRAY ARRAY[
    'weekly-ai-briefing-mon-0700-est',
    'weekly-ai-briefing-monday-0700-est'
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

SELECT cron.schedule(
  'weekly-ai-briefing-mon-0700-est',
  '0 12 * * 1',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/ai-briefing',
      headers:=jsonb_build_object('Content-Type', 'application/json')
  ) $$
);
