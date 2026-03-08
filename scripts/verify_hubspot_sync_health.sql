-- HubSpot sync verification pack (run in Supabase SQL editor)
-- Purpose: produce a clear pass/fail health snapshot before Leads release.

-- 1) Cron schedule presence
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'hubspot-webhook-worker',
  'hubspot-incremental-sync',
  'hubspot-reconcile-hourly',
  'hubspot-reconcile-daily',
  'hubspot-backfill-weekly'
)
ORDER BY jobname;

-- 2) Current observability snapshot
SELECT
  run_type,
  object_type,
  latest_status,
  latest_finished_at,
  minutes_since_last_success,
  is_stale,
  pending_events,
  dead_events,
  oldest_pending_minutes,
  error_count_24h
FROM public.vw_hubspot_sync_health_observability
ORDER BY run_type, object_type;

-- 3) Most recent sync runs (last 24h)
SELECT
  run_type,
  object_type,
  status,
  started_at,
  finished_at,
  items_read,
  items_written,
  items_failed
FROM public.hubspot_sync_runs
WHERE started_at >= now() - interval '24 hours'
ORDER BY started_at DESC
LIMIT 200;

-- 4) Recent sync errors (last 24h)
SELECT
  object_type,
  stage,
  error_message,
  created_at
FROM public.hubspot_sync_errors
WHERE created_at >= now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 200;

-- 5) Gate summary row (PASS when all true)
WITH o AS (
  SELECT * FROM public.vw_hubspot_sync_health_observability
),
checks AS (
  SELECT
    bool_and(coalesce(is_stale, false) = false) AS no_stale,
    bool_and(coalesce(dead_events, 0) = 0) AS no_dead_events,
    bool_and(coalesce(latest_status, 'error') IN ('success', 'partial')) AS healthy_recent_status
  FROM o
)
SELECT
  CASE WHEN no_stale AND no_dead_events AND healthy_recent_status THEN 'PASS' ELSE 'FAIL' END AS sync_gate,
  no_stale,
  no_dead_events,
  healthy_recent_status,
  now() AS evaluated_at
FROM checks;
