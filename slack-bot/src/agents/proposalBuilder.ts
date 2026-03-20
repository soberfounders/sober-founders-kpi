/**
 * LLM-powered proposal generation.
 * Loads persona context + history + KPIs, sends to OpenAI, returns structured proposals.
 */

import { llmJson, llmText, getCostSummary } from "../ai/llmClient.js";
import { getMetricTrend } from "../data/trends.js";
import {
  getActiveContext,
  getProposalHistory,
  getPendingProposals,
  getTodayProposals,
  getStalePendingProposals,
} from "./proposalStore.js";
import type { ProposalDraft, AgentProposal } from "./proposalStore.js";
import type { AgentPersona } from "./registry.js";
import { getPersona } from "./registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KEY_METRICS = ["leads", "qualified_leads", "attendance", "donations", "seo"];

const gatherKpiContext = async (): Promise<string> => {
  const results = await Promise.all(
    KEY_METRICS.map(async (m) => {
      try {
        const trend = await getMetricTrend(m, undefined);
        return `${m}: current=${trend.current}, previous=${trend.previous}, delta=${trend.delta}, delta_pct=${trend.delta_pct != null ? (trend.delta_pct * 100).toFixed(1) + "%" : "N/A"}`;
      } catch {
        return `${m}: unavailable`;
      }
    }),
  );
  return results.join("\n");
};

const formatHistory = (history: Array<Record<string, unknown>>): string => {
  if (history.length === 0) return "No prior proposals.";
  return history
    .slice(0, 10)
    .map((p: any) => {
      const outcome = p.status === "measured"
        ? ` | outcome: expected ${p.expected_delta}, actual ${p.actual_delta}`
        : "";
      return `- [${p.status}] ${p.title} (${p.target_metric})${outcome}`;
    })
    .join("\n");
};

const formatContext = (contexts: Array<Record<string, unknown>>): string => {
  if (contexts.length === 0) return "No persistent context.";
  return contexts
    .map((c: any) => `- [${c.context_type}] ${c.key}: ${c.summary}`)
    .join("\n");
};

// ---------------------------------------------------------------------------
// JSON Schema for structured output
// ---------------------------------------------------------------------------

const proposalJsonSchema = {
  name: "proposals",
  strict: true,
  schema: {
    type: "object",
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            rationale: { type: "string" },
            proposal_type: { type: "string", enum: ["action", "experiment", "content", "strategy_review"] },
            target_metric: { type: "string" },
            expected_delta: { type: "number" },
            delta_type: { type: "string", enum: ["absolute", "percentage"] },
            confidence: { type: "number" },
            measurement_window_days: { type: "integer" },
          },
          required: [
            "title", "description", "rationale", "proposal_type",
            "target_metric", "expected_delta", "delta_type", "confidence",
            "measurement_window_days",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["proposals"],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Generate proposals (gpt-5.4 - structured JSON)
// ---------------------------------------------------------------------------

export const generateProposals = async (
  persona: AgentPersona,
): Promise<ProposalDraft[]> => {
  const [kpiContext, history, contexts] = await Promise.all([
    gatherKpiContext(),
    getProposalHistory(persona.id),
    getActiveContext(persona.id),
  ]);

  const prompt = `You are ${persona.displayName}. ${persona.systemPromptAddendum}

## Current KPI Data
${kpiContext}

## Your Persistent Context (initiatives, decisions, learnings)
${formatContext(contexts as any)}

## Your Recent Proposal History (with outcomes where measured)
${formatHistory(history as any)}

## Instructions
Review your context, past outcomes, and current KPIs. Propose 1 concrete, actionable suggestion.

## Big-Picture Goals (always orient proposals toward these)
1. Get people into Phoenix Forum (paid membership at $250/mo)
2. Get people to show up to mastermind groups (Thursday free/open, Tuesday free/verified)
3. Get them to repeat and come back (retention, community, value delivery)

Rules:
- Every proposal must clearly connect to one of the 3 goals above.
- Double down on what worked (positive outcomes in history).
- Avoid repeating what failed (negative outcomes).
- Each proposal must have a specific target metric and expected numerical impact.
- Be specific - include numbers, not vague "improvements".
- measurement_window_days: how many days to wait before measuring (typically 7-14).
- confidence: 0-1, your confidence this will achieve the expected delta.
- Only propose types in: ${persona.proposalTypes.join(", ")}`;

  const { data } = await llmJson(
    {
      taskType: "proposal_json",
      input: [{ role: "user", content: prompt }],
      jsonSchema: proposalJsonSchema,
      metadata: { persona: persona.id },
    },
  );

  const parsed = data as { proposals: any[] };

  return (parsed.proposals || []).map((p: any) => ({
    agent_persona: persona.id,
    proposal_type: p.proposal_type,
    title: p.title,
    description: p.description,
    rationale: p.rationale,
    target_metric: p.target_metric,
    expected_delta: p.expected_delta,
    delta_type: p.delta_type,
    confidence: p.confidence,
    measurement_window_days: p.measurement_window_days || 7,
    baseline_value: null,
    baseline_snapshot: null,
  }));
};

// ---------------------------------------------------------------------------
// Morning priorities (gpt-5.4-mini - summary)
// ---------------------------------------------------------------------------

const formatCostSummary = (): string => {
  const { today, week, month } = getCostSummary();
  const fmt = (n: number) => `$${n.toFixed(4)}`;
  const lines = [
    `Today: ${fmt(today.totalCost)} (${today.callCount} calls, ${(today.totalInputTokens + today.totalOutputTokens).toLocaleString()} tokens)`,
    `This week: ${fmt(week.totalCost)} (${week.callCount} calls)`,
    `This month: ${fmt(month.totalCost)} (${month.callCount} calls)`,
  ];
  if (Object.keys(today.byModel).length > 0) {
    lines.push("Models today: " + Object.entries(today.byModel).map(([m, v]) => `${m}: ${v.calls} calls, ${fmt(v.cost)}`).join(" | "));
  }
  return lines.join("\n");
};

export const generateMorningPriorities = async (
  persona: AgentPersona,
): Promise<string> => {
  const [kpiContext, contexts, history] = await Promise.all([
    gatherKpiContext(),
    getActiveContext(persona.id),
    getProposalHistory(persona.id, 10),
  ]);

  const costInfo = formatCostSummary();

  const prompt = `You are ${persona.displayName}. ${persona.systemPromptAddendum}

## Current KPI Data
${kpiContext}

## Persistent Context
${formatContext(contexts as any)}

## Recent Proposals
${formatHistory(history as any)}

## Big-Picture Goals (frame all priorities around these)
1. Get people into Phoenix Forum (paid membership at $250/mo)
2. Get people to show up to mastermind groups (Thursday free/open, Tuesday free/verified)
3. Get them to repeat and come back (retention, community, value delivery)

Write this morning's priorities for Sober Founders marketing. Keep it to 3-5 bullet points, each with a clear action or decision needed. Every bullet must connect to one of the 3 big-picture goals. Reference specific metrics where relevant. Use Slack mrkdwn formatting. Do not use em dashes.

After the priorities, add a small section:

*AI Token Usage*
${costInfo}

Include this token usage section exactly as provided above - do not modify the numbers. Just format it cleanly at the bottom of the message.`;

  const response = await llmText({
    taskType: "morning_summary",
    input: [{ role: "user", content: prompt }],
    metadata: { persona: persona.id },
  });

  return response.outputText;
};

// ---------------------------------------------------------------------------
// Midday check-in (gpt-5.4-mini - summary)
// ---------------------------------------------------------------------------

export const generateMiddayCheckin = async (
  persona: AgentPersona,
): Promise<string> => {
  const [kpiContext, contexts, history] = await Promise.all([
    gatherKpiContext(),
    getActiveContext(persona.id),
    getProposalHistory(persona.id, 10),
  ]);

  const approved = (history as any[]).filter((p) => p.status === "approved" || p.status === "completed");
  const pending = (history as any[]).filter((p) => p.status === "proposed");

  const prompt = `You are ${persona.displayName}. ${persona.systemPromptAddendum}

## Big-Picture Goals
1. Get people into Phoenix Forum (paid membership at $250/mo)
2. Get people to show up to mastermind groups (Thursday free/open, Tuesday free/verified)
3. Get them to repeat and come back (retention, community, value delivery)

## Current KPI Data
${kpiContext}

## Persistent Context
${formatContext(contexts as any)}

## Morning Progress
Approved so far: ${approved.length}
Still pending: ${pending.length}

## Recent Proposals
${formatHistory(history as any)}

Write a midday check-in. Keep it tight - 2-3 bullets:
1. What's been approved/acted on this morning
2. What's the single most important thing to push forward this afternoon to move the big picture
3. Any blockers or decisions needed

Use Slack mrkdwn formatting. Be direct. Do not use em dashes.`;

  const response = await llmText({
    taskType: "midday_checkin",
    input: [{ role: "user", content: prompt }],
    metadata: { persona: persona.id },
  });

  return response.outputText;
};

// ---------------------------------------------------------------------------
// EOD recap (gpt-5.4-mini - summary)
// ---------------------------------------------------------------------------

export const generateEodRecap = async (
  persona: AgentPersona,
): Promise<string> => {
  const [kpiContext, contexts, history] = await Promise.all([
    gatherKpiContext(),
    getActiveContext(persona.id),
    getProposalHistory(persona.id, 15),
  ]);

  const approved = (history as any[]).filter((p) => p.status === "approved" || p.status === "completed");
  const denied = (history as any[]).filter((p) => p.status === "denied");
  const pending = (history as any[]).filter((p) => p.status === "proposed");

  const prompt = `You are ${persona.displayName}. ${persona.systemPromptAddendum}

## Current KPI Data
${kpiContext}

## Persistent Context
${formatContext(contexts as any)}

## Today's Proposal Outcomes
Approved/completed: ${approved.length}
Denied: ${denied.length}
Still pending: ${pending.length}

## Recent Proposals
${formatHistory(history as any)}

## Big-Picture Goals
1. Get people into Phoenix Forum (paid membership at $250/mo)
2. Get people to show up to mastermind groups (Thursday free/open, Tuesday free/verified)
3. Get them to repeat and come back (retention, community, value delivery)

Write the end-of-day recap. Include:
1. What got done today (approved proposals and their status)
2. What's still pending
3. A brief scorecard of KPI movement against the 3 big-picture goals
4. One key priority for tomorrow that moves the big picture forward

Use Slack mrkdwn formatting. Be direct and concise. Do not use em dashes.`;

  const response = await llmText({
    taskType: "evening_recap",
    input: [{ role: "user", content: prompt }],
    metadata: { persona: persona.id },
  });

  return response.outputText;
};

// ---------------------------------------------------------------------------
// Batched digest for #marketing-manager (tiered: needs input / FYI / done)
// ---------------------------------------------------------------------------

export interface DigestData {
  needsInput: AgentProposal[];
  autoExecuting: AgentProposal[];
  completed: AgentProposal[];
  denied: AgentProposal[];
  llmSummary: string;
}

const formatProposalList = (proposals: AgentProposal[]): string => {
  if (proposals.length === 0) return "None";
  return proposals
    .map((p) => {
      const persona = getPersona(p.agent_persona);
      const emoji = persona?.emoji || "";
      return `- ${emoji} *${p.title}* (${p.target_metric}, expected ${p.expected_delta >= 0 ? "+" : ""}${p.expected_delta}${p.delta_type === "percentage" ? "%" : ""})`;
    })
    .join("\n");
};

export const generateMorningDigest = async (
  persona: AgentPersona,
): Promise<DigestData> => {
  const [kpiContext, contexts, history, pending] = await Promise.all([
    gatherKpiContext(),
    getActiveContext(persona.id),
    getProposalHistory(persona.id, 10),
    getPendingProposals(),
  ]);

  const costInfo = formatCostSummary();

  const prompt = `You are ${persona.displayName}. ${persona.systemPromptAddendum}

## Current KPI Data
${kpiContext}

## Persistent Context
${formatContext(contexts as any)}

## Recent Proposals
${formatHistory(history as any)}

## Pending Proposals Awaiting Decision (${pending.length})
${formatProposalList(pending)}

## Big-Picture Goals (frame all priorities around these)
1. Get people into Phoenix Forum (paid membership at $250/mo)
2. Get people to show up to mastermind groups (Thursday free/open, Tuesday free/verified)
3. Get them to repeat and come back (retention, community, value delivery)

Write a concise morning briefing for the founder. Structure:
1. Top 3 priorities for today (each tied to a big-picture goal)
2. If there are pending proposals needing a decision, call them out clearly
3. What the agents will be working on autonomously today

Keep it tight - the founder checks this on mobile. Use Slack mrkdwn. Do not use em dashes.

After the briefing, add:
*AI Token Usage*
${costInfo}`;

  const response = await llmText({
    taskType: "morning_digest",
    input: [{ role: "user", content: prompt }],
    metadata: { persona: persona.id },
  });

  return {
    needsInput: pending,
    autoExecuting: [],
    completed: [],
    denied: [],
    llmSummary: response.outputText,
  };
};

export const generateMiddayDigest = async (
  persona: AgentPersona,
): Promise<DigestData> => {
  const [kpiContext, contexts, pending, todayAll] = await Promise.all([
    gatherKpiContext(),
    getActiveContext(persona.id),
    getPendingProposals(),
    getTodayProposals(),
  ]);

  const completed = todayAll.filter((p) => ["completed", "measured"].includes(p.status));
  const denied = todayAll.filter((p) => p.status === "denied");
  const approved = todayAll.filter((p) => p.status === "approved");

  const prompt = `You are ${persona.displayName}. ${persona.systemPromptAddendum}

## Current KPI Data
${kpiContext}

## Persistent Context
${formatContext(contexts as any)}

## Today's Activity So Far
- Pending your input: ${pending.length}
- Approved/executing: ${approved.length}
- Completed: ${completed.length}
- Denied: ${denied.length}

## Pending Proposals
${formatProposalList(pending)}

## Completed Today
${formatProposalList(completed)}

## Big-Picture Goals
1. Get people into Phoenix Forum (paid membership at $250/mo)
2. Get people to show up to mastermind groups
3. Get them to repeat and come back

Write a midday check-in. Be brief:
1. Quick status on morning progress
2. Highlight anything blocked waiting for the founder's input
3. Single most important thing to push this afternoon

Use Slack mrkdwn. Do not use em dashes.`;

  const response = await llmText({
    taskType: "midday_digest",
    input: [{ role: "user", content: prompt }],
    metadata: { persona: persona.id },
  });

  return {
    needsInput: pending,
    autoExecuting: approved,
    completed,
    denied,
    llmSummary: response.outputText,
  };
};

export const generateEodDigest = async (
  persona: AgentPersona,
): Promise<DigestData> => {
  const [kpiContext, contexts, pending, todayAll] = await Promise.all([
    gatherKpiContext(),
    getActiveContext(persona.id),
    getPendingProposals(),
    getTodayProposals(),
  ]);

  const completed = todayAll.filter((p) => ["completed", "measured"].includes(p.status));
  const denied = todayAll.filter((p) => p.status === "denied");
  const approved = todayAll.filter((p) => p.status === "approved");

  const prompt = `You are ${persona.displayName}. ${persona.systemPromptAddendum}

## Current KPI Data
${kpiContext}

## Persistent Context
${formatContext(contexts as any)}

## Today's Full Activity
- Pending your input: ${pending.length}
- Approved/executing: ${approved.length}
- Completed: ${completed.length}
- Denied: ${denied.length}

## Still Pending
${formatProposalList(pending)}

## Completed Today
${formatProposalList(completed)}

## Big-Picture Goals
1. Get people into Phoenix Forum (paid membership at $250/mo)
2. Get people to show up to mastermind groups
3. Get them to repeat and come back

Write the end-of-day recap:
1. What got done today (wins, completions)
2. What's still pending your decision (be specific)
3. Quick KPI scorecard against the 3 goals
4. Top priority for tomorrow

Keep it concise. Use Slack mrkdwn. Do not use em dashes.`;

  const response = await llmText({
    taskType: "eod_digest",
    input: [{ role: "user", content: prompt }],
    metadata: { persona: persona.id },
  });

  return {
    needsInput: pending,
    autoExecuting: approved,
    completed,
    denied,
    llmSummary: response.outputText,
  };
};

export const generateNudgeMessage = async (
  persona: AgentPersona,
  staleProposals: AgentProposal[],
): Promise<string> => {
  const items = staleProposals
    .map((p) => {
      const agent = getPersona(p.agent_persona);
      const emoji = agent?.emoji || "";
      const hoursAgo = Math.round((Date.now() - new Date(p.created_at).getTime()) / 3_600_000);
      return `- ${emoji} *${p.title}* (${p.target_metric}) - posted ${hoursAgo}h ago`;
    })
    .join("\n");

  const prompt = `You are ${persona.displayName}. You're following up with the founder on proposals that need their decision.

These proposals have been waiting for a response:
${items}

Write a brief, friendly nudge (2-3 sentences max). Mention how many items need attention. If any are time-sensitive, flag it. Do not use em dashes. Use Slack mrkdwn.`;

  const response = await llmText({
    taskType: "nudge",
    input: [{ role: "user", content: prompt }],
    metadata: { persona: persona.id },
  });

  return response.outputText;
};

// ---------------------------------------------------------------------------
// Tell me more (gpt-5.4 - strategic expansion)
// ---------------------------------------------------------------------------

export const generateProposalDetail = async (
  persona: AgentPersona,
  proposal: Pick<ProposalDraft, "title" | "description" | "rationale" | "target_metric" | "expected_delta" | "delta_type">,
): Promise<string> => {
  const prompt = `You are ${persona.displayName}. ${persona.systemPromptAddendum}

A user wants more detail on this proposal:

Title: ${proposal.title}
Description: ${proposal.description}
Rationale: ${proposal.rationale}
Target metric: ${proposal.target_metric}
Expected impact: ${proposal.expected_delta} (${proposal.delta_type})

Provide a detailed breakdown:
1. Specific steps to execute this
2. Resources or tools needed
3. Risks and mitigations
4. How we'll measure success
5. Timeline

Be specific and actionable. Use Slack mrkdwn formatting. Do not use em dashes.`;

  const response = await llmText({
    taskType: "proposal_expand",
    input: [{ role: "user", content: prompt }],
    metadata: { persona: persona.id },
  });

  return response.outputText;
};
