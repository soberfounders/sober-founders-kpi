/**
 * Slack Block Kit builders for agent proposals.
 */

import type { AgentProposal } from "./proposalStore.js";
import type { AgentPersona } from "./registry.js";
import type { DigestData } from "./proposalBuilder.js";
import { getPersona } from "./registry.js";

// ---------------------------------------------------------------------------
// Work log card for #agent-queue (compact bullet + "Tell me more" button)
// ---------------------------------------------------------------------------

export const buildWorkLogBlocks = (
  persona: AgentPersona,
  proposal: AgentProposal,
): Record<string, unknown>[] => {
  // Compact one-liner: emoji agent | title | metric delta | confidence
  const parts: string[] = [`${persona.emoji} *${proposal.title}*`];

  if (proposal.target_metric && proposal.expected_delta !== null && proposal.expected_delta !== undefined) {
    const sign = proposal.expected_delta >= 0 ? "+" : "";
    const suffix = proposal.delta_type === "percentage" ? "%" : "";
    parts.push(`${proposal.target_metric} ${sign}${proposal.expected_delta}${suffix}`);
  }
  if (proposal.confidence !== null && proposal.confidence !== undefined) {
    parts.push(`${Math.round(proposal.confidence * 100)}% confidence`);
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: parts.join(" | "),
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Tell me more", emoji: true },
        action_id: "agent_proposal_detail",
        value: proposal.id,
      },
    },
  ];
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

// ---------------------------------------------------------------------------
// Digest blocks for #marketing-manager (tiered format)
// ---------------------------------------------------------------------------

// Cap at 10 proposals to stay under Slack's 50-block limit
const MAX_DIGEST_PROPOSALS = 10;

const buildNeedsInputSection = (
  proposals: AgentProposal[],
): Record<string, unknown>[] => {
  if (proposals.length === 0) return [];

  const shown = proposals.slice(0, MAX_DIGEST_PROPOSALS);
  const overflow = proposals.length - shown.length;

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Needs Your Input (${proposals.length})`, emoji: true },
    },
  ];

  for (const p of shown) {
    const persona = getPersona(p.agent_persona);
    const emoji = persona?.emoji || "";
    const sign = (p.expected_delta ?? 0) >= 0 ? "+" : "";
    const suffix = p.delta_type === "percentage" ? "%" : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${p.title}*\n_${p.target_metric}: ${sign}${p.expected_delta}${suffix} expected | ${Math.round((p.confidence ?? 0) * 100)}% confidence_`,
      },
    });

    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve", emoji: true },
          style: "primary",
          action_id: "agent_proposal_approve",
          value: p.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Deny", emoji: true },
          style: "danger",
          action_id: "agent_proposal_deny",
          value: p.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Tell me more", emoji: true },
          action_id: "agent_proposal_detail",
          value: p.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reply", emoji: true },
          action_id: "agent_proposal_reply",
          value: p.id,
        },
      ],
    });
  }

  if (overflow > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_+ ${overflow} more pending proposals. Approve or deny above to see the rest._` }],
    });
  }

  return blocks;
};

const buildCompletedSection = (
  proposals: AgentProposal[],
): Record<string, unknown>[] => {
  if (proposals.length === 0) return [];

  const items = proposals
    .map((p) => {
      const persona = getPersona(p.agent_persona);
      const emoji = persona?.emoji || "";
      return `${emoji} ${p.title}`;
    })
    .join("\n");

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Completed Today (${proposals.length})*\n${items}`,
      },
    },
  ];
};

export type DigestType = "morning" | "midday" | "afternoon" | "eod";

export const buildDigestBlocks = (
  persona: AgentPersona,
  digest: DigestData,
  digestType: DigestType,
): Record<string, unknown>[] => {
  const titles: Record<DigestType, string> = {
    morning: "Morning Briefing",
    midday: "Midday Check-in",
    afternoon: "Afternoon Wrap-up",
    eod: "End of Day Recap",
  };

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${persona.emoji} ${titles[digestType]}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: digest.llmSummary },
    },
  ];

  // Add needs-input proposals with approve/deny buttons
  if (digest.needsInput.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push(...buildNeedsInputSection(digest.needsInput));
  }

  // Add completed summary
  if (digest.completed.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push(...buildCompletedSection(digest.completed));
  }

  return blocks;
};

// ---------------------------------------------------------------------------
// Nudge blocks for stale proposals
// ---------------------------------------------------------------------------

export const buildNudgeBlocks = (
  persona: AgentPersona,
  nudgeText: string,
  staleProposals: AgentProposal[],
): Record<string, unknown>[] => {
  const blocks: Record<string, unknown>[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${persona.emoji} *Follow-up*\n${nudgeText}`,
      },
    },
  ];

  // Include approve/deny buttons for each stale proposal
  blocks.push(...buildNeedsInputSection(staleProposals));

  return blocks;
};
