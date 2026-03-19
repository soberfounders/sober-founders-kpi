/**
 * Slack Block Kit builders for agent proposals.
 */

import type { AgentProposal } from "./proposalStore.js";
import type { AgentPersona } from "./registry.js";

// ---------------------------------------------------------------------------
// Proposal card (with Approve / Deny / Tell me more buttons)
// ---------------------------------------------------------------------------

export const buildProposalBlocks = (
  persona: AgentPersona,
  proposal: AgentProposal,
): Record<string, unknown>[] => {
  const blocks: Record<string, unknown>[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${persona.emoji} *${persona.displayName}* - _${proposal.proposal_type}_`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${proposal.title}*\n${proposal.description}`,
      },
    },
  ];

  const fields: Record<string, unknown>[] = [];
  if (proposal.target_metric) {
    fields.push({ type: "mrkdwn", text: `*Metric:* ${proposal.target_metric}` });
  }
  if (proposal.expected_delta !== null && proposal.expected_delta !== undefined) {
    const sign = proposal.expected_delta >= 0 ? "+" : "";
    const suffix = proposal.delta_type === "percentage" ? "%" : "";
    fields.push({ type: "mrkdwn", text: `*Expected:* ${sign}${proposal.expected_delta}${suffix}` });
  }
  if (proposal.baseline_value !== null && proposal.baseline_value !== undefined) {
    fields.push({ type: "mrkdwn", text: `*Baseline:* ${proposal.baseline_value}` });
  }
  if (proposal.confidence !== null && proposal.confidence !== undefined) {
    fields.push({ type: "mrkdwn", text: `*Confidence:* ${Math.round(proposal.confidence * 100)}%` });
  }

  if (fields.length > 0) {
    blocks.push({ type: "section", fields });
  }

  if (proposal.rationale) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${proposal.rationale}_` }],
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Approve", emoji: true },
        style: "primary",
        action_id: "agent_proposal_approve",
        value: proposal.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Deny", emoji: true },
        style: "danger",
        action_id: "agent_proposal_deny",
        value: proposal.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Tell me more", emoji: true },
        action_id: "agent_proposal_detail",
        value: proposal.id,
      },
    ],
  });

  return blocks;
};

// ---------------------------------------------------------------------------
// Morning priorities (Marketing Manager 8am)
// ---------------------------------------------------------------------------

export const buildMorningPrioritiesBlocks = (
  persona: AgentPersona,
  priorities: string,
): Record<string, unknown>[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${persona.emoji} *${persona.displayName} - Morning Priorities*`,
    },
  },
  {
    type: "section",
    text: { type: "mrkdwn", text: priorities },
  },
];

// ---------------------------------------------------------------------------
// EOD recap (Marketing Manager 5pm)
// ---------------------------------------------------------------------------

export const buildRecapBlocks = (
  persona: AgentPersona,
  recap: string,
): Record<string, unknown>[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${persona.emoji} *${persona.displayName} - End of Day Recap*`,
    },
  },
  {
    type: "section",
    text: { type: "mrkdwn", text: recap },
  },
];

// ---------------------------------------------------------------------------
// Outcome follow-up (posted in original thread)
// ---------------------------------------------------------------------------

export const buildOutcomeBlocks = (
  persona: AgentPersona,
  proposal: AgentProposal,
  analysis: string,
): Record<string, unknown>[] => {
  const blocks: Record<string, unknown>[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${persona.emoji} *Outcome Report: ${proposal.title}*`,
      },
    },
  ];

  const fields: Record<string, unknown>[] = [];
  if (proposal.baseline_value !== null) {
    fields.push({ type: "mrkdwn", text: `*Baseline:* ${proposal.baseline_value}` });
  }
  if (proposal.actual_value !== null) {
    fields.push({ type: "mrkdwn", text: `*Actual:* ${proposal.actual_value}` });
  }
  if (proposal.expected_delta !== null) {
    const sign = proposal.expected_delta >= 0 ? "+" : "";
    const suffix = proposal.delta_type === "percentage" ? "%" : "";
    fields.push({ type: "mrkdwn", text: `*Expected delta:* ${sign}${proposal.expected_delta}${suffix}` });
  }
  if (proposal.actual_delta !== null) {
    const sign = (proposal.actual_delta ?? 0) >= 0 ? "+" : "";
    fields.push({ type: "mrkdwn", text: `*Actual delta:* ${sign}${proposal.actual_delta}` });
  }

  if (fields.length > 0) {
    blocks.push({ type: "section", fields });
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: analysis },
  });

  return blocks;
};
