/**
 * Executes approved proposals with real actions.
 *
 * On approve:
 *   1. Creates a Notion task for tracking
 *   2. For content proposals, generates a draft (blog outline, email copy, etc.)
 *   3. Schedules outcome measurement
 *   4. Returns execution summary with links and next steps
 *
 * The draft is posted in the Slack thread so the founder can review/edit
 * before anything goes live. Nothing is published without explicit approval.
 */

import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";
import { updateProposalStatus, upsertContext } from "./proposalStore.js";
import type { AgentProposal } from "./proposalStore.js";
import { getPersona } from "./registry.js";
import { createTask } from "../actions/createTask.js";
import { llmText } from "../ai/llmClient.js";
import { logger } from "../observability/logger.js";

const slack = new WebClient(env.slackBotToken);

export interface ExecutionResult {
  success: boolean;
  summary: string;
  notionUrl?: string;
  draft?: string;
}

// ---------------------------------------------------------------------------
// Draft generation by proposal type
// ---------------------------------------------------------------------------

const CONTENT_TYPES = new Set(["content", "content_creation", "blog_post", "email_campaign", "social_post"]);
const NEEDS_DRAFT = new Set([...CONTENT_TYPES, "experiment", "action"]);

const generateDraft = async (proposal: AgentProposal): Promise<string | null> => {
  const persona = getPersona(proposal.agent_persona);
  if (!persona) return null;

  // Only generate drafts for actionable proposal types
  if (!NEEDS_DRAFT.has(proposal.proposal_type)) return null;

  const isContent = CONTENT_TYPES.has(proposal.proposal_type);

  const instructions = isContent
    ? `You are ${persona.displayName}. The founder approved this proposal. Generate a ready-to-use draft.

Proposal: ${proposal.title}
Description: ${proposal.description}
Target metric: ${proposal.target_metric}

Generate the actual content draft. If this is a blog post, write the full post (800-1200 words). If this is an email, write the subject line and body. If this is a social post, write the copy. If this is a landing page, write the headline, subhead, body, and CTA.

Write for founders in recovery. No em dashes. No AI slop. No generic filler. Write like a real person who gets it. The ICP is founders who are in recovery, not sober curious people.

Format with markdown. Include a clear CTA that connects to the target metric (${proposal.target_metric}).`
    : `You are ${persona.displayName}. The founder approved this proposal. Create an execution plan.

Proposal: ${proposal.title}
Description: ${proposal.description}
Target metric: ${proposal.target_metric}
Expected delta: ${proposal.expected_delta} (${proposal.delta_type})

Write a specific, step-by-step execution plan. Include:
- Exact actions to take (not vague recommendations)
- Timeline for each step
- How to measure success
- Any dependencies or blockers

Be direct. No fluff. No em dashes.`;

  try {
    const response = await llmText({
      taskType: "proposal_expand",
      instructions,
      input: [{ role: "user", content: "Generate the draft/plan now." }],
      metadata: { proposalId: proposal.id, persona: persona.id },
    });
    return response.outputText;
  } catch (err) {
    logger.error({ err, proposalId: proposal.id }, "Failed to generate draft");
    return null;
  }
};

// ---------------------------------------------------------------------------
// Post draft to Slack thread
// ---------------------------------------------------------------------------

const postDraftToThread = async (
  proposal: AgentProposal,
  draft: string,
  channelId: string,
  threadTs: string,
): Promise<void> => {
  const persona = getPersona(proposal.agent_persona);
  const emoji = persona?.emoji || "";
  const isContent = CONTENT_TYPES.has(proposal.proposal_type);

  const header = isContent
    ? `${emoji} *Draft ready for review:*`
    : `${emoji} *Execution plan:*`;

  // Slack has a 3000 char limit per text block, so chunk if needed
  const maxChunk = 2900;
  const chunks: string[] = [];
  for (let i = 0; i < draft.length; i += maxChunk) {
    chunks.push(draft.slice(i, i + maxChunk));
  }

  // Post header + first chunk
  await slack.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: `${header}\n\n${chunks[0]}`,
  });

  // Post remaining chunks
  for (let i = 1; i < chunks.length; i++) {
    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: chunks[i],
    });
  }

  // Post review prompt
  if (isContent) {
    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `${emoji} Reply in this thread with edits, or say "looks good" and I'll mark it ready to publish. Nothing goes live without your sign-off.`,
    });
  }
};

// ---------------------------------------------------------------------------
// Infer what manual steps remain after execution
// ---------------------------------------------------------------------------

const inferManualSteps = (proposal: AgentProposal): string[] => {
  const title = proposal.title.toLowerCase();
  const desc = (proposal.description || "").toLowerCase();
  const combined = `${title} ${desc}`;

  const steps: string[] = [];

  if (combined.includes("email") || combined.includes("sequence") || combined.includes("follow-up") || combined.includes("followup")) {
    steps.push("Set up the actual email sequence/automation in your email platform (HubSpot, Mailchimp, etc.)");
  }
  if (combined.includes("landing page") || combined.includes("page")) {
    steps.push("Build or update the landing page (I can draft copy but can't publish)");
  }
  if (/\b(paid ad|facebook ad|google ad|meta ad|run ads|ad campaign|ad set|ad spend|advertising)\b/.test(combined) || combined.includes("campaign")) {
    steps.push("Create/update the ad campaign in the ads platform");
  }
  if (combined.includes("blog") || combined.includes("post") || combined.includes("article")) {
    steps.push("Review the draft and publish on WordPress");
  }
  if (combined.includes("social") || combined.includes("linkedin") || combined.includes("instagram")) {
    steps.push("Post the content to your social media accounts");
  }
  if (combined.includes("luma") || combined.includes("event") || combined.includes("rsvp")) {
    steps.push("Update the Luma event settings");
  }

  if (steps.length === 0) {
    steps.push("Review the Notion task and execute the action items manually");
  }

  return steps;
};

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export const executeProposal = async (proposal: AgentProposal): Promise<ExecutionResult> => {
  try {
    const measureAfter = new Date();
    measureAfter.setDate(measureAfter.getDate() + (proposal.measurement_window_days || 7));

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Math.min(proposal.measurement_window_days || 7, 14));
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const persona = getPersona(proposal.agent_persona);
    const agentName = persona?.displayName || proposal.agent_persona;

    // -----------------------------------------------------------------------
    // 1. Create Notion task for tracking
    // -----------------------------------------------------------------------
    let notionUrl: string | undefined;
    try {
      const taskResult = await createTask({
        title: proposal.title,
        description: `${proposal.description}\n\nMetric: ${proposal.target_metric}\nExpected: ${proposal.expected_delta} (${proposal.delta_type})\nProposal ID: ${proposal.id}`,
        owner: agentName,
        priority: (proposal.confidence ?? 0) >= 0.7 ? "High Priority" : "Medium Priority",
        dueDate: dueDateStr,
        source: `agent:${proposal.agent_persona}`,
        actorUserId: "system",
        traceId: `proposal:${proposal.id}`,
      });
      notionUrl = taskResult.url;
      logger.info({ proposalId: proposal.id, notionUrl }, "Notion task created for proposal");
    } catch (err) {
      logger.error({ err, proposalId: proposal.id }, "Failed to create Notion task (continuing)");
    }

    // -----------------------------------------------------------------------
    // 2. Generate draft/plan if applicable
    // -----------------------------------------------------------------------
    const draft = await generateDraft(proposal);

    // -----------------------------------------------------------------------
    // 3. Post draft to Slack thread if we have one
    // -----------------------------------------------------------------------
    if (draft && proposal.channel_id && proposal.message_ts) {
      try {
        await postDraftToThread(
          proposal,
          draft,
          proposal.channel_id,
          proposal.message_ts,
        );
      } catch (err) {
        logger.error({ err, proposalId: proposal.id }, "Failed to post draft to thread");
      }
    }

    // -----------------------------------------------------------------------
    // 4. Update status and schedule measurement
    // -----------------------------------------------------------------------
    await updateProposalStatus(proposal.id, "completed", {
      execution_result: {
        action: draft ? "executed_with_draft" : "executed_task_created",
        notion_url: notionUrl || null,
        has_draft: !!draft,
        notes: `Task created in Notion. ${draft ? "Draft posted for review." : ""} Will measure ${proposal.target_metric} in ${proposal.measurement_window_days || 7} days.`,
        manual_steps_remaining: inferManualSteps(proposal),
      },
      executed_at: new Date().toISOString(),
      measure_after: measureAfter.toISOString(),
    });

    // Store decision as context for future proposals
    await upsertContext(
      proposal.agent_persona,
      "decision",
      `proposal_${proposal.id.slice(0, 8)}`,
      {
        proposal_id: proposal.id,
        title: proposal.title,
        target_metric: proposal.target_metric,
        expected_delta: proposal.expected_delta,
        approved_at: new Date().toISOString(),
        notion_url: notionUrl || null,
      },
      `Approved: "${proposal.title}" targeting ${proposal.target_metric} with expected delta ${proposal.expected_delta}`,
    );

    logger.info(
      { proposalId: proposal.id, notionUrl, hasDraft: !!draft, measureAfter: measureAfter.toISOString() },
      "Proposal executed",
    );

    // Build summary - be explicit about what was done and what needs manual action
    const parts: string[] = [];
    parts.push("*What I did:*");
    if (notionUrl) {
      parts.push(`• Created a tracking task in Notion: ${notionUrl}`);
    }
    if (draft) {
      const isContent = CONTENT_TYPES.has(proposal.proposal_type);
      parts.push(isContent
        ? "• Generated draft content and posted it in this thread for your review"
        : "• Created an execution plan and posted it in this thread");
    }
    parts.push(`• Scheduled outcome measurement for *${proposal.target_metric}* in ${proposal.measurement_window_days || 7} days`);

    // Be honest about what still needs human action
    parts.push("");
    parts.push("*What still needs you (or a tool I don't have access to):*");
    const manualSteps = inferManualSteps(proposal);
    for (const step of manualSteps) {
      parts.push(`• ${step}`);
    }

    return {
      success: true,
      summary: parts.join("\n"),
      notionUrl,
      draft: draft || undefined,
    };
  } catch (err) {
    logger.error({ err, proposalId: proposal.id }, "Proposal execution failed");

    await updateProposalStatus(proposal.id, "approved", {
      execution_result: { error: String(err) },
    });

    return {
      success: false,
      summary: `Execution failed: ${String(err)}`,
    };
  }
};
