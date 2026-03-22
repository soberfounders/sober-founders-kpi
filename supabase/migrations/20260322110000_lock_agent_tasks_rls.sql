-- ============================================================
-- Lock down agent_tasks RLS: remove broad FOR ALL policy,
-- replace with restricted policies.
--
-- Approve/reject now goes through a service-role edge function
-- (agent-task-approve) so anon clients cannot modify task status.
-- ============================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "anon_manage_tasks" ON agent_tasks;

-- Anon/authenticated can INSERT tasks with status = 'pending' only.
-- This lets outreach agents (which use service role) still insert,
-- and also lets the shared queue helper work.
CREATE POLICY "anon_insert_pending_tasks" ON agent_tasks
  FOR INSERT
  WITH CHECK (status = 'pending');

-- Anon/authenticated CANNOT update or delete tasks directly.
-- All status changes go through the agent-task-approve edge function
-- which uses the service role key (bypasses RLS).

-- Service role bypasses RLS by default, so the edge functions
-- (agent-task-approve, agent-task-executor) can still update tasks.
