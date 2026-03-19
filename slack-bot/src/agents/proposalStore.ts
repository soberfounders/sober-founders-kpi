/**
 * CRUD layer for agent_proposals and agent_context tables.
 */

import { supabase } from "../clients/supabase.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposalDraft {
  agent_persona: string;
  proposal_type: string;
  title: string;
  description: string;
  rationale: string;
  target_metric: string;
  expected_delta: number;
  delta_type: "absolute" | "percentage";
  confidence: number;
  measurement_window_days: number;
  baseline_value: number | null;
  baseline_snapshot: Record<string, unknown> | null;
  parent_proposal_id?: string | null;
}

export interface AgentProposal extends ProposalDraft {
  id: string;
  status: string;
  channel_id: string | null;
  message_ts: string | null;
  thread_ts: string | null;
  approved_by: string | null;
  approved_at: string | null;
  user_modifications: string | null;
  execution_result: Record<string, unknown> | null;
  executed_at: string | null;
  actual_value: number | null;
  actual_delta: number | null;
  outcome_notes: string | null;
  measured_at: string | null;
  measure_after: string | null;
  created_at: string;
}

export interface AgentContext {
  id: string;
  agent_persona: string;
  context_type: string;
  key: string;
  value: Record<string, unknown>;
  summary: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface ScorecardRow {
  agent_persona: string;
  target_metric: string;
  total_measured: number;
  hits: number;
  misses: number;
  avg_accuracy: number;
  total_approved: number;
  total_denied: number;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export const createProposal = async (draft: ProposalDraft, channelId: string): Promise<AgentProposal> => {
  const { data, error } = await supabase
    .from("agent_proposals")
    .insert({
      ...draft,
      channel_id: channelId,
      status: "proposed",
    })
    .select()
    .single();

  if (error) throw new Error(`createProposal failed: ${error.message}`);
  return data as AgentProposal;
};

export const updateProposalStatus = async (
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> => {
  const { error } = await supabase
    .from("agent_proposals")
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`updateProposalStatus failed: ${error.message}`);
};

export const updateProposalSlackTs = async (
  id: string,
  messageTs: string,
  threadTs?: string,
): Promise<void> => {
  const update: Record<string, unknown> = { message_ts: messageTs };
  if (threadTs) update.thread_ts = threadTs;

  const { error } = await supabase
    .from("agent_proposals")
    .update(update)
    .eq("id", id);

  if (error) throw new Error(`updateProposalSlackTs failed: ${error.message}`);
};

export const getProposalById = async (id: string): Promise<AgentProposal | null> => {
  const { data, error } = await supabase
    .from("agent_proposals")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as AgentProposal;
};

export const getProposalByMessageTs = async (
  channelId: string,
  messageTs: string,
): Promise<AgentProposal | null> => {
  const { data, error } = await supabase
    .from("agent_proposals")
    .select("*")
    .eq("channel_id", channelId)
    .eq("message_ts", messageTs)
    .single();

  if (error) return null;
  return data as AgentProposal;
};

export const getProposalHistory = async (
  persona: string,
  limit = 20,
): Promise<AgentProposal[]> => {
  const { data, error } = await supabase
    .from("agent_proposals")
    .select("*")
    .eq("agent_persona", persona)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getProposalHistory failed: ${error.message}`);
  return (data || []) as AgentProposal[];
};

export const getProposalsDueForMeasurement = async (): Promise<AgentProposal[]> => {
  const { data, error } = await supabase
    .from("agent_proposals")
    .select("*")
    .eq("status", "completed")
    .lte("measure_after", new Date().toISOString());

  if (error) throw new Error(`getProposalsDueForMeasurement failed: ${error.message}`);
  return (data || []) as AgentProposal[];
};

export const getTodayProposalCount = async (persona: string): Promise<number> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("agent_proposals")
    .select("id", { count: "exact", head: true })
    .eq("agent_persona", persona)
    .gte("created_at", todayStart.toISOString());

  if (error) throw new Error(`getTodayProposalCount failed: ${error.message}`);
  return count || 0;
};

export const getActiveProposals = async (persona: string): Promise<AgentProposal[]> => {
  const { data, error } = await supabase
    .from("agent_proposals")
    .select("*")
    .eq("agent_persona", persona)
    .in("status", ["proposed", "approved", "executing", "completed"]);

  if (error) throw new Error(`getActiveProposals failed: ${error.message}`);
  return (data || []) as AgentProposal[];
};

// ---------------------------------------------------------------------------
// Agent Context
// ---------------------------------------------------------------------------

export const upsertContext = async (
  persona: string,
  contextType: string,
  key: string,
  value: Record<string, unknown>,
  summary: string,
): Promise<void> => {
  const { error } = await supabase.from("agent_context").upsert(
    {
      agent_persona: persona,
      context_type: contextType,
      key,
      value,
      summary,
      is_active: true,
    },
    { onConflict: "agent_persona,context_type,key" },
  );

  if (error) throw new Error(`upsertContext failed: ${error.message}`);
};

export const getActiveContext = async (
  persona: string,
  contextType?: string,
): Promise<AgentContext[]> => {
  let query = supabase
    .from("agent_context")
    .select("*")
    .eq("agent_persona", persona)
    .eq("is_active", true);

  if (contextType) {
    query = query.eq("context_type", contextType);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`getActiveContext failed: ${error.message}`);
  return (data || []) as AgentContext[];
};

export const getAllActiveContext = async (): Promise<AgentContext[]> => {
  const { data, error } = await supabase
    .from("agent_context")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getAllActiveContext failed: ${error.message}`);
  return (data || []) as AgentContext[];
};

export const deactivateContext = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("agent_context")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw new Error(`deactivateContext failed: ${error.message}`);
};

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

export const getScorecard = async (persona?: string): Promise<ScorecardRow[]> => {
  let query = supabase.from("vw_agent_scorecard").select("*");
  if (persona) query = query.eq("agent_persona", persona);

  const { data, error } = await query;
  if (error) throw new Error(`getScorecard failed: ${error.message}`);
  return (data || []) as ScorecardRow[];
};
