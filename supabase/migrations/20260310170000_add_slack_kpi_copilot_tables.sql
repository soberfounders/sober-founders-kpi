-- Slack KPI Copilot persistence and RBAC tables.
-- Deny-by-default access with service_role policies for worker execution.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.slack_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT,
  channel_id TEXT NOT NULL,
  thread_ts TEXT,
  message_ts TEXT,
  actor_user_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text TEXT NOT NULL,
  intent_type TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slack_conversations_channel_thread_created_idx
  ON public.slack_conversations (channel_id, thread_ts, created_at DESC);

CREATE INDEX IF NOT EXISTS slack_conversations_actor_created_idx
  ON public.slack_conversations (actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bot_actions_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  tool_name TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('pending_confirmation', 'approved', 'denied', 'executed', 'failed')),
  confirmation_required BOOLEAN NOT NULL DEFAULT false,
  confirmation_status TEXT NOT NULL CHECK (confirmation_status IN ('pending', 'approved', 'denied', 'not_required')),
  trace_id TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_actions_audit_trace_idx
  ON public.bot_actions_audit (trace_id);

CREATE INDEX IF NOT EXISTS bot_actions_audit_created_idx
  ON public.bot_actions_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS bot_actions_audit_action_status_idx
  ON public.bot_actions_audit (action_type, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.generated_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_type TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  date_range JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_text TEXT NOT NULL,
  summary_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_metrics TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.0 CHECK (confidence >= 0 AND confidence <= 1),
  posted_message_ts TEXT,
  generated_by TEXT NOT NULL DEFAULT 'slack_bot',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS generated_summaries_dedupe_idx
  ON public.generated_summaries (
    summary_type,
    channel_id,
    ((date_range ->> 'from')),
    ((date_range ->> 'to'))
  );

CREATE INDEX IF NOT EXISTS generated_summaries_created_idx
  ON public.generated_summaries (created_at DESC);

CREATE TABLE IF NOT EXISTS public.followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  owner TEXT NOT NULL,
  due_date DATE NOT NULL,
  context TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS followups_owner_status_due_idx
  ON public.followups (owner, status, due_date);

CREATE TABLE IF NOT EXISTS public.task_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT NOT NULL,
  priority TEXT NOT NULL,
  due_date DATE NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created', 'failed', 'cancelled')),
  notion_page_id TEXT,
  request_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS task_requests_notion_page_unique_idx
  ON public.task_requests (notion_page_id)
  WHERE notion_page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS task_requests_status_owner_due_idx
  ON public.task_requests (status, owner, due_date);

CREATE TABLE IF NOT EXISTS public.user_channel_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  summary_type TEXT NOT NULL DEFAULT 'weekly_executive',
  schedule_interval_minutes INTEGER NOT NULL DEFAULT 10080 CHECK (schedule_interval_minutes > 0),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_channel_preferences_unique UNIQUE (slack_user_id, channel_id, summary_type)
);

CREATE INDEX IF NOT EXISTS user_channel_preferences_next_run_active_idx
  ON public.user_channel_preferences (next_run_at)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.slack_user_roles (
  slack_user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'member', 'viewer')),
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.slack_channel_policies (
  channel_id TEXT PRIMARY KEY,
  policy_level TEXT NOT NULL CHECK (policy_level IN ('standard', 'executive', 'restricted')),
  allow_posting BOOLEAN NOT NULL DEFAULT false,
  allow_task_creation BOOLEAN NOT NULL DEFAULT false,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'slack_conversations',
    'bot_actions_audit',
    'generated_summaries',
    'followups',
    'task_requests',
    'user_channel_preferences',
    'slack_user_roles',
    'slack_channel_policies'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = format('Service role write %s', tbl)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        format('Service role write %s', tbl),
        tbl
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'slack_user_roles'
      AND policyname = 'Authenticated read slack_user_roles'
  ) THEN
    CREATE POLICY "Authenticated read slack_user_roles"
      ON public.slack_user_roles
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'slack_channel_policies'
      AND policyname = 'Authenticated read slack_channel_policies'
  ) THEN
    CREATE POLICY "Authenticated read slack_channel_policies"
      ON public.slack_channel_policies
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.slack_conversations IS 'Slack thread conversation history for KPI Copilot.';
COMMENT ON TABLE public.bot_actions_audit IS 'Audit trail for all bot decisions and actions.';
COMMENT ON TABLE public.generated_summaries IS 'Posted/generated summaries with dedupe keys.';
COMMENT ON TABLE public.followups IS 'Follow-up commitments created from Slack conversations.';
COMMENT ON TABLE public.task_requests IS 'Task request lifecycle and Notion linkage.';
COMMENT ON TABLE public.user_channel_preferences IS 'Schedule and destination preferences for proactive summaries.';
COMMENT ON TABLE public.slack_user_roles IS 'Slack bot RBAC role mapping.';
COMMENT ON TABLE public.slack_channel_policies IS 'Slack channel policy mapping for posting/task permissions.';
