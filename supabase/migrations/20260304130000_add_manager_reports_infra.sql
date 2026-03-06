-- Manager Reports infrastructure: snapshots, actions, notion tasks, and audit trail.

CREATE TABLE IF NOT EXISTS public.analysis_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_key text NOT NULL,
  period text NOT NULL,
  compare text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_hash text NOT NULL,
  output jsonb NOT NULL,
  status text NOT NULL DEFAULT 'success',
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_manager_period_compare_created
  ON public.analysis_snapshots (manager_key, period, compare, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_inputs_hash
  ON public.analysis_snapshots (inputs_hash);

CREATE TABLE IF NOT EXISTS public.action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_key text NOT NULL,
  action_id text NOT NULL,
  period text NOT NULL,
  compare text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  result jsonb NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_runs_manager_action_created
  ON public.action_runs (manager_key, action_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notion_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_key text NOT NULL,
  todo_id text NOT NULL,
  title text NOT NULL,
  description text NULL,
  priority text NULL,
  due_date date NULL,
  notion_page_id text NULL,
  status text NOT NULL DEFAULT 'created',
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notion_tasks_manager_todo_unique
  ON public.notion_tasks (manager_key, todo_id);
CREATE INDEX IF NOT EXISTS idx_notion_tasks_manager_created
  ON public.notion_tasks (manager_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  manager_key text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_manager_created
  ON public.audit_log (event_type, manager_key, created_at DESC);

ALTER TABLE public.analysis_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'analysis_snapshots'
      AND policyname = 'Public read analysis_snapshots'
  ) THEN
    CREATE POLICY "Public read analysis_snapshots"
      ON public.analysis_snapshots
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'action_runs'
      AND policyname = 'Public read action_runs'
  ) THEN
    CREATE POLICY "Public read action_runs"
      ON public.action_runs
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notion_tasks'
      AND policyname = 'Public read notion_tasks'
  ) THEN
    CREATE POLICY "Public read notion_tasks"
      ON public.notion_tasks
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND policyname = 'Public read audit_log'
  ) THEN
    CREATE POLICY "Public read audit_log"
      ON public.audit_log
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END
$$;
