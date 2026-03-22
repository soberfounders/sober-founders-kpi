-- ============================================================
-- Autonomous Agency module - schema + seed data
-- ============================================================

-- pgvector for agent_memory embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 1. agencies ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agencies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  department_name text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 2. agents ────────────────────────────────────────────────
CREATE TYPE agent_status AS ENUM ('active', 'paused', 'needs_intervention');

CREATE TABLE IF NOT EXISTS agents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  role_name             text NOT NULL,
  manager_id            uuid REFERENCES agents(id) ON DELETE SET NULL,
  model_routing_config  jsonb NOT NULL DEFAULT '{"simple": "gpt-4o-mini", "complex": "claude-opus-4-6"}',
  daily_budget_cents    integer NOT NULL DEFAULT 100,
  status                agent_status NOT NULL DEFAULT 'active',
  avatar_emoji          text NOT NULL DEFAULT '🤖',
  description           text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_agency ON agents(agency_id);
CREATE INDEX idx_agents_manager ON agents(manager_id);
CREATE INDEX idx_agents_status ON agents(status);

-- ── 3. agent_tasks ───────────────────────────────────────────
CREATE TYPE agent_task_type   AS ENUM ('email', 'wp_post', 'crm_update', 'slack_message', 'content_draft', 'seo_audit', 'other');
CREATE TYPE agent_task_status AS ENUM ('pending', 'approved', 'rejected', 'executed');

CREATE TABLE IF NOT EXISTS agent_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type              agent_task_type NOT NULL DEFAULT 'other',
  title             text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}',
  reasoning         text,
  status            agent_task_status NOT NULL DEFAULT 'pending',
  feedback_text     text,
  cost_estimate_cents integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz
);

CREATE INDEX idx_agent_tasks_agent   ON agent_tasks(agent_id);
CREATE INDEX idx_agent_tasks_status  ON agent_tasks(status);
CREATE INDEX idx_agent_tasks_created ON agent_tasks(created_at DESC);

-- ── 4. agent_usage_logs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_usage_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_id     uuid REFERENCES agent_tasks(id) ON DELETE SET NULL,
  tokens_used integer NOT NULL DEFAULT 0,
  cost_cents  numeric(10,4) NOT NULL DEFAULT 0,
  model_used  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_agent     ON agent_usage_logs(agent_id);
CREATE INDEX idx_usage_created   ON agent_usage_logs(created_at DESC);

-- ── 5. agent_memory ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memory (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_id           uuid REFERENCES agent_tasks(id) ON DELETE SET NULL,
  feedback_summary  text NOT NULL,
  embedding         vector(1536),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_agent ON agent_memory(agent_id);

-- ── 6. RLS policies (service role bypass, anon read-only) ───
ALTER TABLE agencies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory    ENABLE ROW LEVEL SECURITY;

-- Anon / authenticated can read everything
CREATE POLICY "anon_read_agencies"    ON agencies        FOR SELECT USING (true);
CREATE POLICY "anon_read_agents"      ON agents          FOR SELECT USING (true);
CREATE POLICY "anon_read_tasks"       ON agent_tasks     FOR SELECT USING (true);
CREATE POLICY "anon_read_usage"       ON agent_usage_logs FOR SELECT USING (true);
CREATE POLICY "anon_read_memory"      ON agent_memory    FOR SELECT USING (true);

-- Anon / authenticated can insert/update tasks (approve/reject from dashboard)
CREATE POLICY "anon_manage_tasks" ON agent_tasks FOR ALL USING (true) WITH CHECK (true);

-- Service role has full access by default (bypasses RLS)

-- ── 7. Realtime publication ──────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE agents;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_tasks;

-- ── 8. Seed data: Marketing department ───────────────────────
DO $$
DECLARE
  v_agency_id uuid;
  v_manager_id uuid;
BEGIN
  -- Create agency
  INSERT INTO agencies (name, department_name)
  VALUES ('Marketing Agency', 'Marketing')
  RETURNING id INTO v_agency_id;

  -- Create manager: Marketing Manager
  INSERT INTO agents (agency_id, role_name, avatar_emoji, description, model_routing_config, daily_budget_cents)
  VALUES (
    v_agency_id,
    'Marketing Manager',
    '📋',
    'Oversees all marketing operations. Reviews content, coordinates campaigns, and ensures brand consistency across channels.',
    '{"simple": "gpt-4o-mini", "complex": "claude-opus-4-6"}',
    100
  )
  RETURNING id INTO v_manager_id;

  -- Create specialist: Content Creation / SEO
  INSERT INTO agents (agency_id, role_name, manager_id, avatar_emoji, description, model_routing_config, daily_budget_cents)
  VALUES (
    v_agency_id,
    'Content Creation / SEO',
    v_manager_id,
    '✍️',
    'Drafts blog posts, optimizes content for search, conducts keyword research, and manages the editorial calendar on WordPress.',
    '{"simple": "gpt-4o-mini", "complex": "claude-opus-4-6"}',
    100
  );
END $$;

-- ── 9. Helper view: agent budget usage (rolling 24h) ────────
CREATE OR REPLACE VIEW vw_agent_budget_status AS
SELECT
  a.id AS agent_id,
  a.role_name,
  a.daily_budget_cents,
  a.status,
  COALESCE(SUM(u.cost_cents) FILTER (WHERE u.created_at >= now() - interval '24 hours'), 0)::numeric(10,4) AS spent_24h_cents,
  a.daily_budget_cents - COALESCE(SUM(u.cost_cents) FILTER (WHERE u.created_at >= now() - interval '24 hours'), 0) AS remaining_cents,
  CASE
    WHEN COALESCE(SUM(u.cost_cents) FILTER (WHERE u.created_at >= now() - interval '24 hours'), 0) >= a.daily_budget_cents
    THEN true ELSE false
  END AS budget_exceeded
FROM agents a
LEFT JOIN agent_usage_logs u ON u.agent_id = a.id
GROUP BY a.id, a.role_name, a.daily_budget_cents, a.status;

-- ── 10. Helper view: agent rejection rate (last 10 tasks) ───
CREATE OR REPLACE VIEW vw_agent_rejection_rate AS
SELECT
  a.id AS agent_id,
  a.role_name,
  COUNT(t.id) FILTER (WHERE t.status IN ('approved','rejected','executed')) AS total_resolved,
  COUNT(t.id) FILTER (WHERE t.status = 'rejected') AS total_rejected,
  CASE
    WHEN COUNT(t.id) FILTER (WHERE t.status IN ('approved','rejected','executed')) >= 10
     AND COUNT(t.id) FILTER (WHERE t.status = 'rejected')::numeric
       / NULLIF(COUNT(t.id) FILTER (WHERE t.status IN ('approved','rejected','executed')), 0) > 0.3
    THEN true ELSE false
  END AS recommend_pause
FROM agents a
LEFT JOIN LATERAL (
  SELECT id, status
  FROM agent_tasks
  WHERE agent_id = a.id AND status != 'pending'
  ORDER BY resolved_at DESC NULLS LAST
  LIMIT 10
) t ON true
GROUP BY a.id, a.role_name;
