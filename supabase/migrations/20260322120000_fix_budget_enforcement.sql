-- ============================================================
-- Fix budget enforcement: include pending/approved task costs
-- in budget exposure, not just executed usage logs.
-- ============================================================

-- Rebuild vw_agent_budget_status to include:
--   1. Actual spend from agent_usage_logs (last 24h) — executed costs
--   2. Committed exposure from agent_tasks that are pending or approved (last 24h)
-- This prevents a backlog of approved tasks from exceeding the daily budget.
DROP VIEW IF EXISTS vw_agent_budget_status;
CREATE VIEW vw_agent_budget_status AS
SELECT
  a.id AS agent_id,
  a.role_name,
  a.daily_budget_cents,
  a.status,
  -- Actual executed spend (from usage logs)
  COALESCE(SUM(u.cost_cents) FILTER (
    WHERE u.created_at >= now() - interval '24 hours'
  ), 0)::numeric(10,4) AS spent_24h_cents,
  -- Committed but not yet executed (pending + approved tasks)
  COALESCE(committed.committed_cents, 0)::numeric(10,4) AS committed_24h_cents,
  -- Total exposure = spent + committed
  (
    COALESCE(SUM(u.cost_cents) FILTER (
      WHERE u.created_at >= now() - interval '24 hours'
    ), 0) + COALESCE(committed.committed_cents, 0)
  )::numeric(10,4) AS exposure_24h_cents,
  -- Remaining = budget - total exposure
  (
    a.daily_budget_cents
    - COALESCE(SUM(u.cost_cents) FILTER (
        WHERE u.created_at >= now() - interval '24 hours'
      ), 0)
    - COALESCE(committed.committed_cents, 0)
  ) AS remaining_cents,
  -- Budget exceeded when total exposure >= limit
  CASE
    WHEN (
      COALESCE(SUM(u.cost_cents) FILTER (
        WHERE u.created_at >= now() - interval '24 hours'
      ), 0) + COALESCE(committed.committed_cents, 0)
    ) >= a.daily_budget_cents
    THEN true ELSE false
  END AS budget_exceeded
FROM agents a
LEFT JOIN agent_usage_logs u ON u.agent_id = a.id
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(t.cost_estimate_cents), 0) AS committed_cents
  FROM agent_tasks t
  WHERE t.agent_id = a.id
    AND t.status IN ('pending', 'approved')
    AND t.created_at >= now() - interval '24 hours'
) committed ON true
GROUP BY a.id, a.role_name, a.daily_budget_cents, a.status, committed.committed_cents;
