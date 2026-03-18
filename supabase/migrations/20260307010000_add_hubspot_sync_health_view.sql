-- HubSpot sync observability view
-- Purpose: fast run-health inspection by run type/object type with stale/error signals.

DROP VIEW IF EXISTS public.vw_hubspot_sync_health_observability;
CREATE VIEW public.vw_hubspot_sync_health_observability AS
WITH incremental_objects AS (
  SELECT object_type
  FROM public.hubspot_sync_state
  WHERE object_type IS NOT NULL
  UNION
  SELECT v.object_type
  FROM (VALUES ('contacts'::text), ('deals'::text), ('calls'::text), ('meetings'::text)) AS v(object_type)
),
expected AS (
  SELECT 'webhook_worker'::text AS run_type, NULL::text AS object_type
  UNION ALL
  SELECT 'incremental'::text, io.object_type
  FROM incremental_objects io
  UNION ALL
  SELECT 'reconcile_hourly'::text, NULL::text
  UNION ALL
  SELECT 'reconcile_daily'::text, NULL::text
  UNION ALL
  SELECT 'backfill'::text, NULL::text
),
runs_normalized AS (
  SELECT
    r.id,
    r.run_type,
    CASE WHEN r.run_type = 'incremental' THEN r.object_type ELSE NULL::text END AS object_type_norm,
    r.status,
    r.started_at,
    r.finished_at,
    r.items_read,
    r.items_written,
    r.items_failed
  FROM public.hubspot_sync_runs r
),
latest_runs AS (
  SELECT DISTINCT ON (r.run_type, COALESCE(r.object_type_norm, '__all__'))
    r.id AS latest_run_id,
    r.run_type,
    r.object_type_norm AS object_type,
    r.status AS latest_status,
    r.started_at AS latest_started_at,
    r.finished_at AS latest_finished_at,
    r.items_read AS latest_items_read,
    r.items_written AS latest_items_written,
    r.items_failed AS latest_items_failed
  FROM runs_normalized r
  ORDER BY
    r.run_type,
    COALESCE(r.object_type_norm, '__all__'),
    COALESCE(r.finished_at, r.started_at) DESC,
    r.started_at DESC
),
last_success AS (
  SELECT
    r.run_type,
    r.object_type_norm AS object_type,
    MAX(r.finished_at) AS last_success_at
  FROM runs_normalized r
  WHERE r.status = 'success'
  GROUP BY r.run_type, r.object_type_norm
),
last_error AS (
  SELECT
    r.run_type,
    r.object_type_norm AS object_type,
    MAX(COALESCE(r.finished_at, r.started_at)) AS last_error_at
  FROM runs_normalized r
  WHERE r.status IN ('error', 'partial')
  GROUP BY r.run_type, r.object_type_norm
),
latest_run_error_counts AS (
  SELECT
    lr.run_type,
    lr.object_type,
    COUNT(e.id)::bigint AS latest_run_error_count
  FROM latest_runs lr
  LEFT JOIN public.hubspot_sync_errors e
    ON e.run_id = lr.latest_run_id
  GROUP BY lr.run_type, lr.object_type
),
error_counts AS (
  SELECT
    r.run_type,
    r.object_type_norm AS object_type,
    COUNT(e.id)::bigint AS error_count_all_time,
    COUNT(e.id) FILTER (WHERE e.created_at >= (NOW() - INTERVAL '24 hours'))::bigint AS error_count_24h
  FROM runs_normalized r
  JOIN public.hubspot_sync_errors e
    ON e.run_id = r.id
  GROUP BY r.run_type, r.object_type_norm
),
queue AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending_events,
    COUNT(*) FILTER (WHERE status = 'processing')::bigint AS processing_events,
    COUNT(*) FILTER (WHERE status = 'dead')::bigint AS dead_events,
    MIN(occurred_at) FILTER (WHERE status = 'pending') AS oldest_pending_occurred_at
  FROM public.hubspot_webhook_events
)
SELECT
  ex.run_type,
  COALESCE(ex.object_type, 'all') AS object_type,
  lr.latest_run_id,
  lr.latest_status,
  lr.latest_started_at,
  lr.latest_finished_at,
  lr.latest_items_read,
  lr.latest_items_written,
  lr.latest_items_failed,
  COALESCE(lrec.latest_run_error_count, 0)::bigint AS latest_run_error_count,
  COALESCE(ec.error_count_24h, 0)::bigint AS error_count_24h,
  COALESCE(ec.error_count_all_time, 0)::bigint AS error_count_all_time,
  ls.last_success_at,
  le.last_error_at,
  CASE
    WHEN ls.last_success_at IS NULL THEN NULL
    ELSE ROUND((EXTRACT(EPOCH FROM (NOW() - ls.last_success_at)) / 60.0)::numeric, 2)
  END AS minutes_since_last_success,
  CASE
    WHEN ls.last_success_at IS NULL THEN true
    WHEN ex.run_type = 'webhook_worker' THEN ls.last_success_at < (NOW() - INTERVAL '20 minutes')
    WHEN ex.run_type = 'incremental' THEN ls.last_success_at < (NOW() - INTERVAL '30 minutes')
    WHEN ex.run_type = 'reconcile_hourly' THEN ls.last_success_at < (NOW() - INTERVAL '2 hours')
    WHEN ex.run_type = 'reconcile_daily' THEN ls.last_success_at < (NOW() - INTERVAL '30 hours')
    WHEN ex.run_type = 'backfill' THEN ls.last_success_at < (NOW() - INTERVAL '8 days')
    ELSE false
  END AS is_stale,
  q.pending_events,
  q.processing_events,
  q.dead_events,
  q.oldest_pending_occurred_at,
  CASE
    WHEN q.oldest_pending_occurred_at IS NULL THEN NULL
    ELSE ROUND((EXTRACT(EPOCH FROM (NOW() - q.oldest_pending_occurred_at)) / 60.0)::numeric, 2)
  END AS oldest_pending_minutes
FROM expected ex
LEFT JOIN latest_runs lr
  ON lr.run_type = ex.run_type
 AND lr.object_type IS NOT DISTINCT FROM ex.object_type
LEFT JOIN last_success ls
  ON ls.run_type = ex.run_type
 AND ls.object_type IS NOT DISTINCT FROM ex.object_type
LEFT JOIN last_error le
  ON le.run_type = ex.run_type
 AND le.object_type IS NOT DISTINCT FROM ex.object_type
LEFT JOIN latest_run_error_counts lrec
  ON lrec.run_type = ex.run_type
 AND lrec.object_type IS NOT DISTINCT FROM ex.object_type
LEFT JOIN error_counts ec
  ON ec.run_type = ex.run_type
 AND ec.object_type IS NOT DISTINCT FROM ex.object_type
CROSS JOIN queue q
ORDER BY
  CASE ex.run_type
    WHEN 'webhook_worker' THEN 1
    WHEN 'incremental' THEN 2
    WHEN 'reconcile_hourly' THEN 3
    WHEN 'reconcile_daily' THEN 4
    WHEN 'backfill' THEN 5
    ELSE 99
  END,
  COALESCE(ex.object_type, 'all');

GRANT SELECT ON public.vw_hubspot_sync_health_observability TO anon, authenticated, service_role;
