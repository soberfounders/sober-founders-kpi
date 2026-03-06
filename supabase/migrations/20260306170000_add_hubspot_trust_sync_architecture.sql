-- HubSpot trustworthy sync architecture (hybrid webhook + incremental + reconcile)
-- Additive migration: lifecycle columns, sync control tables, health views, and cron jobs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- A) Extend existing HubSpot raw tables with lifecycle + sync metadata columns
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.raw_hubspot_contacts
  ADD COLUMN IF NOT EXISTS hubspot_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hubspot_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at_hubspot timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_hubspot_contact_id bigint,
  ADD COLUMN IF NOT EXISTS hs_merged_object_ids text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS sync_source text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS public.raw_hubspot_meeting_activities
  ADD COLUMN IF NOT EXISTS hubspot_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hubspot_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at_hubspot timestamptz,
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS sync_source text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_raw_hubspot_contacts_updated
  ON public.raw_hubspot_contacts (hubspot_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_hubspot_contacts_deleted
  ON public.raw_hubspot_contacts (is_deleted, hubspot_archived);
CREATE INDEX IF NOT EXISTS idx_raw_hubspot_contacts_last_synced
  ON public.raw_hubspot_contacts (last_synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_hubspot_meeting_activities_updated
  ON public.raw_hubspot_meeting_activities (hubspot_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_hubspot_meeting_activities_deleted
  ON public.raw_hubspot_meeting_activities (is_deleted, hubspot_archived);
CREATE INDEX IF NOT EXISTS idx_raw_hubspot_meeting_activities_last_synced
  ON public.raw_hubspot_meeting_activities (last_synced_at DESC);

-- ---------------------------------------------------------------------------
-- B) New raw deals table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.raw_hubspot_deals (
  hubspot_deal_id bigint PRIMARY KEY,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  createdate timestamptz,
  closedate timestamptz,
  dealname text,
  amount numeric,
  pipeline text,
  dealstage text,
  hubspot_owner_id text,
  hubspot_updated_at timestamptz,
  hubspot_archived boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at_hubspot timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text,
  sync_source text,
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_hubspot_deals_updated
  ON public.raw_hubspot_deals (hubspot_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_hubspot_deals_deleted
  ON public.raw_hubspot_deals (is_deleted, hubspot_archived);
CREATE INDEX IF NOT EXISTS idx_raw_hubspot_deals_last_synced
  ON public.raw_hubspot_deals (last_synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_hubspot_deals_pipeline_stage
  ON public.raw_hubspot_deals (pipeline, dealstage);

-- ---------------------------------------------------------------------------
-- C) Sync control tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hubspot_sync_state (
  object_type text PRIMARY KEY,
  cursor_updated_at timestamptz,
  cursor_object_id text,
  last_run_started_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  total_runs bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (object_type IN ('contacts', 'deals', 'calls', 'meetings'))
);

CREATE TABLE IF NOT EXISTS public.hubspot_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  object_type text,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  cursor_from timestamptz,
  cursor_to timestamptz,
  items_read integer NOT NULL DEFAULT 0,
  items_written integer NOT NULL DEFAULT 0,
  items_failed integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (run_type IN ('webhook_worker', 'incremental', 'reconcile_hourly', 'reconcile_daily', 'backfill')),
  CHECK (status IN ('running', 'success', 'error', 'partial'))
);

CREATE INDEX IF NOT EXISTS idx_hubspot_sync_runs_started_at
  ON public.hubspot_sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_hubspot_sync_runs_run_type_status
  ON public.hubspot_sync_runs (run_type, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_hubspot_sync_runs_object_type
  ON public.hubspot_sync_runs (object_type, started_at DESC);

CREATE TABLE IF NOT EXISTS public.hubspot_sync_errors (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  run_id uuid REFERENCES public.hubspot_sync_runs(id) ON DELETE SET NULL,
  object_type text,
  object_id text,
  stage text,
  error_message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hubspot_sync_errors_created
  ON public.hubspot_sync_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hubspot_sync_errors_run_id
  ON public.hubspot_sync_errors (run_id);

CREATE TABLE IF NOT EXISTS public.hubspot_webhook_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  portal_id bigint,
  object_type text NOT NULL,
  object_id text NOT NULL,
  subscription_type text NOT NULL,
  property_name text,
  occurred_at timestamptz NOT NULL,
  event_timestamp_ms bigint,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  raw_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'processing', 'done', 'dead'))
);

CREATE INDEX IF NOT EXISTS idx_hubspot_webhook_events_pending
  ON public.hubspot_webhook_events (status, next_attempt_at, occurred_at);
CREATE INDEX IF NOT EXISTS idx_hubspot_webhook_events_object
  ON public.hubspot_webhook_events (object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_hubspot_webhook_events_occurred
  ON public.hubspot_webhook_events (occurred_at DESC);

INSERT INTO public.hubspot_sync_state (object_type)
VALUES ('contacts'), ('deals'), ('calls'), ('meetings')
ON CONFLICT (object_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- D) Trigger guards for stale writes and updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hubspot_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hubspot_webhook_events_touch_updated_at ON public.hubspot_webhook_events;
CREATE TRIGGER trg_hubspot_webhook_events_touch_updated_at
BEFORE UPDATE ON public.hubspot_webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.hubspot_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hubspot_sync_state_touch_updated_at ON public.hubspot_sync_state;
CREATE TRIGGER trg_hubspot_sync_state_touch_updated_at
BEFORE UPDATE ON public.hubspot_sync_state
FOR EACH ROW
EXECUTE FUNCTION public.hubspot_touch_updated_at();

CREATE OR REPLACE FUNCTION public.hubspot_guard_stale_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_updated timestamptz := OLD.hubspot_updated_at;
  new_updated timestamptz := NEW.hubspot_updated_at;
  old_hash text := COALESCE(OLD.payload_hash, '');
  new_hash text := COALESCE(NEW.payload_hash, '');
BEGIN
  -- Keep defaults stable for rows written by multiple sync paths.
  IF NEW.last_synced_at IS NULL THEN
    NEW.last_synced_at := now();
  END IF;
  IF NEW.ingested_at IS NULL THEN
    NEW.ingested_at := now();
  END IF;

  -- Reject stale writes.
  IF old_updated IS NOT NULL AND new_updated IS NULL THEN
    RETURN OLD;
  END IF;
  IF old_updated IS NOT NULL AND new_updated IS NOT NULL THEN
    IF new_updated < old_updated THEN
      RETURN OLD;
    END IF;
    IF new_updated = old_updated AND new_hash = old_hash THEN
      RETURN OLD;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hubspot_contacts_guard_stale ON public.raw_hubspot_contacts;
CREATE TRIGGER trg_hubspot_contacts_guard_stale
BEFORE UPDATE ON public.raw_hubspot_contacts
FOR EACH ROW
EXECUTE FUNCTION public.hubspot_guard_stale_update();

DROP TRIGGER IF EXISTS trg_hubspot_deals_guard_stale ON public.raw_hubspot_deals;
CREATE TRIGGER trg_hubspot_deals_guard_stale
BEFORE UPDATE ON public.raw_hubspot_deals
FOR EACH ROW
EXECUTE FUNCTION public.hubspot_guard_stale_update();

DROP TRIGGER IF EXISTS trg_hubspot_activities_guard_stale ON public.raw_hubspot_meeting_activities;
CREATE TRIGGER trg_hubspot_activities_guard_stale
BEFORE UPDATE ON public.raw_hubspot_meeting_activities
FOR EACH ROW
EXECUTE FUNCTION public.hubspot_guard_stale_update();

-- ---------------------------------------------------------------------------
-- E) Queue claim helper for webhook worker
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hubspot_claim_webhook_events(p_limit integer DEFAULT 100)
RETURNS SETOF public.hubspot_webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM public.hubspot_webhook_events
    WHERE status = 'pending'
      AND next_attempt_at <= now()
    ORDER BY occurred_at ASC, id ASC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.hubspot_webhook_events q
    SET status = 'processing',
        locked_at = now(),
        updated_at = now()
    FROM cte
    WHERE q.id = cte.id
    RETURNING q.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.hubspot_claim_webhook_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hubspot_claim_webhook_events(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- F) EST reporting views
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vw_hubspot_contacts_est AS
SELECT
  c.*,
  COALESCE(c.merged_into_hubspot_contact_id, c.hubspot_contact_id) AS canonical_hubspot_contact_id,
  (c.createdate AT TIME ZONE 'America/New_York')::date AS created_date_est,
  (COALESCE(c.hubspot_updated_at, c.createdate) AT TIME ZONE 'America/New_York')::date AS updated_date_est
FROM public.raw_hubspot_contacts c;

CREATE OR REPLACE VIEW public.vw_hubspot_deals_est AS
SELECT
  d.*,
  (d.createdate AT TIME ZONE 'America/New_York')::date AS created_date_est,
  (COALESCE(d.hubspot_updated_at, d.createdate) AT TIME ZONE 'America/New_York')::date AS updated_date_est,
  (d.closedate AT TIME ZONE 'America/New_York')::date AS close_date_est
FROM public.raw_hubspot_deals d;

CREATE OR REPLACE VIEW public.vw_hubspot_meeting_activities_est AS
SELECT
  a.*,
  (COALESCE(a.hs_timestamp, a.created_at_hubspot) AT TIME ZONE 'America/New_York')::date AS activity_date_est,
  (COALESCE(a.hubspot_updated_at, a.updated_at_hubspot, a.created_at_hubspot) AT TIME ZONE 'America/New_York')::date AS updated_date_est
FROM public.raw_hubspot_meeting_activities a;

-- ---------------------------------------------------------------------------
-- G) Monitoring view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vw_hubspot_sync_health AS
WITH queue AS (
  SELECT
    count(*) FILTER (WHERE status = 'pending') AS pending_events,
    count(*) FILTER (WHERE status = 'processing') AS processing_events,
    count(*) FILTER (WHERE status = 'dead') AS dead_events,
    min(occurred_at) FILTER (WHERE status = 'pending') AS oldest_pending_occurred_at
  FROM public.hubspot_webhook_events
),
last_incremental AS (
  SELECT object_type, max(finished_at) AS last_incremental_success_at
  FROM public.hubspot_sync_runs
  WHERE run_type = 'incremental'
    AND status = 'success'
  GROUP BY object_type
),
last_reconcile AS (
  SELECT object_type, max(finished_at) AS last_reconcile_success_at
  FROM public.hubspot_sync_runs
  WHERE run_type IN ('reconcile_hourly', 'reconcile_daily')
    AND status = 'success'
  GROUP BY object_type
),
last_worker AS (
  SELECT max(finished_at) AS last_webhook_worker_success_at
  FROM public.hubspot_sync_runs
  WHERE run_type = 'webhook_worker'
    AND status = 'success'
)
SELECT
  s.object_type,
  s.cursor_updated_at,
  s.last_success_at AS last_state_success_at,
  s.last_error_at,
  s.last_error,
  i.last_incremental_success_at,
  r.last_reconcile_success_at,
  w.last_webhook_worker_success_at,
  q.pending_events,
  q.processing_events,
  q.dead_events,
  q.oldest_pending_occurred_at,
  CASE
    WHEN q.oldest_pending_occurred_at IS NULL THEN NULL
    ELSE round((extract(epoch FROM (now() - q.oldest_pending_occurred_at)) / 60.0)::numeric, 2)
  END AS oldest_pending_minutes
FROM public.hubspot_sync_state s
CROSS JOIN queue q
CROSS JOIN last_worker w
LEFT JOIN last_incremental i
  ON i.object_type = s.object_type
LEFT JOIN last_reconcile r
  ON r.object_type = s.object_type;

-- ---------------------------------------------------------------------------
-- H) RLS for sync metadata visibility, queue stays private
-- ---------------------------------------------------------------------------

ALTER TABLE public.hubspot_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubspot_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubspot_sync_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubspot_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read hubspot_sync_state" ON public.hubspot_sync_state;
CREATE POLICY "Public read hubspot_sync_state"
ON public.hubspot_sync_state
FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public read hubspot_sync_runs" ON public.hubspot_sync_runs;
CREATE POLICY "Public read hubspot_sync_runs"
ON public.hubspot_sync_runs
FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public read hubspot_sync_errors" ON public.hubspot_sync_errors;
CREATE POLICY "Public read hubspot_sync_errors"
ON public.hubspot_sync_errors
FOR SELECT TO anon, authenticated
USING (true);

-- no read policy on hubspot_webhook_events: keep queue payload private.

-- ---------------------------------------------------------------------------
-- I) Cron schedules
-- ---------------------------------------------------------------------------

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
      headers:='{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'hubspot-incremental-sync',
  '*/5 * * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_incremental_sync',
      headers:='{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'hubspot-reconcile-hourly',
  '12 * * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_reconcile_sync?mode=hourly',
      headers:='{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'hubspot-reconcile-daily',
  '40 10 * * *',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_reconcile_sync?mode=daily',
      headers:='{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);

SELECT cron.schedule(
  'hubspot-backfill-weekly',
  '20 9 * * 0',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_bootstrap_backfill?mode=weekly',
      headers:='{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
);
