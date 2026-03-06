-- This project does not expose app.settings.service_role_key in pg_cron context.
-- Rebuild HubSpot cron jobs without that GUC dependency.
-- Functions are deployed with verify_jwt = false, so auth headers are not required.

DO $$
DECLARE
  v_jobid integer;
  v_jobname text;
BEGIN
  FOREACH v_jobname IN ARRAY ARRAY[
    'hubspot-webhook-worker',
    'hubspot-incremental-sync',
    'hubspot-reconcile-hourly',
    'hubspot-reconcile-daily',
    'hubspot-backfill-weekly'
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
  'hubspot-webhook-worker',
  '* * * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_webhook_worker',
      headers:=jsonb_build_object('Content-Type', 'application/json')
  ) $$
);

SELECT cron.schedule(
  'hubspot-incremental-sync',
  '*/5 * * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_incremental_sync',
      headers:=jsonb_build_object('Content-Type', 'application/json')
  ) $$
);

SELECT cron.schedule(
  'hubspot-reconcile-hourly',
  '12 * * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_reconcile_sync?mode=hourly',
      headers:=jsonb_build_object('Content-Type', 'application/json')
  ) $$
);

SELECT cron.schedule(
  'hubspot-reconcile-daily',
  '40 10 * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_reconcile_sync?mode=daily',
      headers:=jsonb_build_object('Content-Type', 'application/json')
  ) $$
);

SELECT cron.schedule(
  'hubspot-backfill-weekly',
  '20 9 * * 0',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_bootstrap_backfill?mode=weekly',
      headers:=jsonb_build_object('Content-Type', 'application/json')
  ) $$
);
