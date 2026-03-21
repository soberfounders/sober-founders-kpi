import type { App } from "@slack/bolt";
import { env } from "../../config/env.js";
import { defaultToolRuntime, summarizeToolExecution } from "../../ai/tools.js";
import { getProposalById, updateProposalStatus, getPendingProposals } from "../../agents/proposalStore.js";
import { generateProposalDetail } from "../../agents/proposalBuilder.js";
import { getPersona } from "../../agents/registry.js";
import { llmText } from "../../ai/llmClient.js";
import { buildFocusedProposalBlocks } from "../../agents/proposalBlocks.js";
import { logger } from "../../observability/logger.js";

// ---------------------------------------------------------------------------
// Clarifying question generator (used after Approve)
// ---------------------------------------------------------------------------

const generateClarifyingQuestion = async (
  proposal: Pick<import("../../agents/proposalStore.js").AgentProposal, "title" | "description" | "target_metric" | "expected_delta" | "delta_type" | "proposal_type" | "agent_persona">,
  persona: import("../../agents/registry.js").AgentPersona | null | undefined,
  priorConversation: string | null,
): Promise<string> => {
  const personaName = persona?.displayName || "Marketing Manager";
  const personaAddendum = persona?.systemPromptAddendum || "";

  const conversationContext = priorConversation
    ? `\n\nConversation so far:\n${priorConversation}`
    : "";

  const response = await llmText({
    taskType: "conversation_reply",
    instructions: `You are ${personaName}. ${personaAddendum}

The founder just approved this proposal:
Title: ${proposal.title}
Description: ${proposal.description}
Target metric: ${proposal.target_metric}
Expected impact: ${proposal.expected_delta} (${proposal.delta_type})
Type: ${proposal.proposal_type}
${conversationContext}

${priorConversation
    ? "Based on the conversation so far, ask the NEXT clarifying question. Ask only ONE question at a time. If you have enough information to execute, respond with exactly the text READY_TO_EXECUTE on its own line followed by a brief summary of the plan."
    : "Ask the FIRST clarifying question to make sure this is right before executing. Ask only ONE question at a time. Focus on the most important thing you need to know: scope, timing, audience, budget, or specifics that would change how you'd execute this."}

Rules:
- ONE question only. Do not list multiple questions.
- Be specific, not generic. Ask about THIS proposal, not general best practices.
- Do not use em dashes.
- Keep it conversational and brief.`,
    input: [{ role: "user", content: "Generate the clarifying question." }],
    metadata: { proposalId: proposal.title, persona: persona?.id || "unknown" },
  });

  return response.outputText;
};

// ---------------------------------------------------------------------------
// Present the next queued proposal in the channel
// ---------------------------------------------------------------------------

export const presentNextProposal = async (
  client: import("@slack/web-api").WebClient,
  channelId: string,
  threadTs?: string,
): Promise<boolean> => {
  const pending = await getPendingProposals();
  if (pending.length === 0) {
    if (threadTs) {
      const manager = getPersona("marketing_manager");
      const emoji = manager?.emoji || "";
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `${emoji} That's everything for now. No more ideas in the queue. I'll bring new ones as the agents generate them.`,
      });
    }
    return false;
  }

  const nextProposal = pending[0];
  const remainingCount = pending.length - 1;
  const manager = getPersona("marketing_manager");
  const emoji = manager?.emoji || "";

  const blocks = buildFocusedProposalBlocks(nextProposal, remainingCount);

  await client.chat.postMessage({
    channel: channelId,
    text: `${emoji} Here's the next idea:`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `${emoji} *Next idea:*` },
      },
      ...blocks,
    ] as any,
  });

  // Save channel reference so thread replies can find this proposal
  await updateProposalStatus(nextProposal.id, "proposed", {
    thread_ts: null, // Will be set when user interacts
  });

  return true;
};

export const registerInteractionHandlers = (app: App): void => {
  // -------------------------------------------------------------------------
  // Existing confirmation flow (tool execution gates)
  // -------------------------------------------------------------------------

  app.action("confirm_action_approve", async ({ ack, action, body, respond, client }) => {
    await ack();

    const actionPayload = action as unknown as Record<string, unknown>;
    const bodyPayload = body as Record<string, any>;
    const pendingActionId = String(actionPayload.value || "").trim();
    const approverUserId = String(bodyPayload.user?.id || "").trim();
    const channelId = String(bodyPayload.channel?.id || "").trim();
    const threadTs = String(bodyPayload.message?.thread_ts || bodyPayload.message?.ts || "").trim();

    if (!pendingActionId || !approverUserId) {
      await respond({ response_type: "ephemeral", text: "Invalid confirmation payload." });
      return;
    }

    const result = await defaultToolRuntime.approvePendingAction(
      pendingActionId,
      approverUserId,
      channelId || undefined,
      threadTs || undefined,
    );

    if (result.ok && result.execution && channelId) {
      await client.chat.postMessage({
        channel: channelId,
        text: summarizeToolExecution(result.execution),
        thread_ts: threadTs || undefined,
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: result.message,
    });
  });

  app.action("confirm_action_deny", async ({ ack, action, body, respond }) => {
    await ack();

    const actionPayload = action as unknown as Record<string, unknown>;
    const bodyPayload = body as Record<string, any>;
    const pendingActionId = String(actionPayload.value || "").trim();
    const actorUserId = String(bodyPayload.user?.id || "").trim();
    const channelId = String(bodyPayload.channel?.id || "").trim();

    if (!pendingActionId || !actorUserId) {
      await respond({ response_type: "ephemeral", text: "Invalid denial payload." });
      return;
    }

    const result = await defaultToolRuntime.denyPendingAction(pendingActionId, actorUserId, channelId || undefined);
    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: result.message,
    });
  });

  // -------------------------------------------------------------------------
  // Agent proposal flow (approve → clarify → execute / deny → feedback / discuss)
  // -------------------------------------------------------------------------

  app.action("agent_proposal_approve", async ({ ack, action, body, respond, client }) => {
    await ack();

    const actionPayload = action as unknown as Record<string, unknown>;
    const bodyPayload = body as Record<string, any>;
    const proposalId = String(actionPayload.value || "").trim();
    const approverUserId = String(bodyPayload.user?.id || "").trim();
    const channelId = String(bodyPayload.channel?.id || "").trim();
    const messageTs = String(bodyPayload.message?.ts || "").trim();

    if (!proposalId || !approverUserId) {
      await respond({ response_type: "ephemeral", text: "Invalid proposal payload." });
      return;
    }

    const proposal = await getProposalById(proposalId);
    if (!proposal) {
      await respond({ response_type: "ephemeral", text: "Proposal not found or expired." });
      return;
    }

    if (proposal.status !== "proposed") {
      await respond({
        response_type: "ephemeral",
        text: `This proposal has already been ${proposal.status}.`,
      });
      return;
    }

    // Move to "clarifying" status — don't execute yet
    await updateProposalStatus(proposalId, "clarifying", {
      approved_by: approverUserId,
      approved_at: new Date().toISOString(),
      thread_ts: messageTs || null,
    });

    const persona = getPersona(proposal.agent_persona);
    const emoji = persona?.emoji || "";

    // Generate the first clarifying question
    const firstQuestion = await generateClarifyingQuestion(proposal, persona, null);

    if (channelId) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs || undefined,
        text: `${emoji} *Approved: ${proposal.title}*\n\nBefore I execute, let me make sure we're aligned.\n\n${firstQuestion}`,
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: `Approved: ${proposal.title} — clarifying details in thread.`,
    });

    logger.info(
      { proposalId, approver: approverUserId },
      "agent_proposal_approve: moved to clarifying, first question posted",
    );
  });

  app.action("agent_proposal_deny", async ({ ack, action, body, respond, client }) => {
    await ack();

    const actionPayload = action as unknown as Record<string, unknown>;
    const bodyPayload = body as Record<string, any>;
    const proposalId = String(actionPayload.value || "").trim();
    const actorUserId = String(bodyPayload.user?.id || "").trim();
    const channelId = String(bodyPayload.channel?.id || "").trim();
    const messageTs = String(bodyPayload.message?.ts || "").trim();

    if (!proposalId || !actorUserId) {
      await respond({ response_type: "ephemeral", text: "Invalid denial payload." });
      return;
    }

    const proposal = await getProposalById(proposalId);
    if (!proposal) {
      await respond({ response_type: "ephemeral", text: "Proposal not found or expired." });
      return;
    }

    if (proposal.status !== "proposed") {
      await respond({
        response_type: "ephemeral",
        text: `This proposal has already been ${proposal.status}.`,
      });
      return;
    }

    // Mark as "denied_pending_feedback" so the thread handler knows to collect feedback
    await updateProposalStatus(proposalId, "denied_pending_feedback", {
      thread_ts: messageTs || null,
    });

    if (channelId) {
      const persona = getPersona(proposal.agent_persona);
      const emoji = persona?.emoji || "";
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs || undefined,
        text: `${emoji} Got it, passing on this one. What didn't land about it? Was it the wrong focus, bad timing, or something else? Your feedback helps me bring better ideas next time.`,
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: `Denied: ${proposal.title} — feedback requested in thread.`,
    });

    logger.info(
      { proposalId, actor: actorUserId },
      "agent_proposal_deny: awaiting feedback",
    );
  });

  // Keep legacy "Tell me more" handler for old messages still in Slack
  app.action("agent_proposal_detail", async ({ ack, action, body, respond, client }) => {
    await ack();

    const actionPayload = action as unknown as Record<string, unknown>;
    const bodyPayload = body as Record<string, any>;
    const proposalId = String(actionPayload.value || "").trim();
    const channelId = String(bodyPayload.channel?.id || "").trim();
    const messageTs = String(bodyPayload.message?.ts || "").trim();

    if (!proposalId) {
      await respond({ response_type: "ephemeral", text: "Invalid proposal payload." });
      return;
    }

    // Redirect to the discuss flow
    const proposal = await getProposalById(proposalId);
    if (!proposal) {
      await respond({ response_type: "ephemeral", text: "Proposal not found." });
      return;
    }

    const persona = getPersona(proposal.agent_persona);
    if (!persona) {
      await respond({ response_type: "ephemeral", text: "Unknown agent persona." });
      return;
    }

    // Update thread_ts so the thread handler can find this proposal
    if (messageTs) {
      await updateProposalStatus(proposalId, proposal.status, { thread_ts: messageTs });
    }

    const detail = await generateProposalDetail(persona, proposal);

    if (channelId) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs || undefined,
        text: `${persona.emoji} *${proposal.title}*\n\n${detail}\n\nWhat do you think? We can discuss, or you can Approve / Deny from the buttons above.`,
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: "Discussion started in thread.",
    });

    logger.info({ proposalId }, "agent_proposal_detail: discussion started");
  });

  // -------------------------------------------------------------------------
  // "Let's Talk More" — open a discussion thread
  // -------------------------------------------------------------------------

  app.action("agent_proposal_discuss", async ({ ack, action, body, respond, client }) => {
    await ack();

    const actionPayload = action as unknown as Record<string, unknown>;
    const bodyPayload = body as Record<string, any>;
    const proposalId = String(actionPayload.value || "").trim();
    const channelId = String(bodyPayload.channel?.id || "").trim();
    const messageTs = String(bodyPayload.message?.ts || "").trim();

    if (!proposalId) {
      await respond({ response_type: "ephemeral", text: "Invalid proposal payload." });
      return;
    }

    const proposal = await getProposalById(proposalId);
    if (!proposal) {
      await respond({ response_type: "ephemeral", text: "Proposal not found." });
      return;
    }

    const persona = getPersona(proposal.agent_persona);
    if (!persona) {
      await respond({ response_type: "ephemeral", text: "Unknown agent persona." });
      return;
    }

    // Save thread_ts so the thread handler can find this proposal
    if (messageTs) {
      await updateProposalStatus(proposalId, proposal.status, { thread_ts: messageTs });
    }

    const detail = await generateProposalDetail(persona, proposal);

    if (channelId) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs || undefined,
        text: `${persona.emoji} *${proposal.title}*\n\n${detail}\n\nWhat questions do you have? Let's talk through this before deciding.`,
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: "Discussion started in thread.",
    });

    logger.info({ proposalId }, "agent_proposal_discuss: discussion thread opened");
  });

  // Keep legacy reply handler for old messages
  app.action("agent_proposal_reply", async ({ ack, respond }) => {
    await ack();
    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: "Reply directly in the thread to discuss.",
    });
  });

  // -------------------------------------------------------------------------
  // Existing utility button redirects
  // -------------------------------------------------------------------------

  app.action("kpi_create_task", async ({ ack, respond }) => {
    await ack();
    await respond({
      response_type: "ephemeral",
      text: "Use `/kpi followup <topic> owner=<name> due=YYYY-MM-DD` or `/kpi ask create task ...`.",
    });
  });

  app.action("kpi_post_summary", async ({ ack, respond }) => {
    await ack();
    await respond({
      response_type: "ephemeral",
      text: "Use `/kpi summary weekly_executive` then approve the confirmation prompt to post.",
    });
  });

  app.action("kpi_assign_owner", async ({ ack, respond }) => {
    await ack();
    await respond({
      response_type: "ephemeral",
      text: "Use `/kpi ask assign owner ...` to trigger an owner assignment recommendation flow.",
    });
  });

  app.action("kpi_view_dashboard", async ({ ack, respond }) => {
    await ack();
    await respond({
      response_type: "ephemeral",
      text: `Open dashboard: ${env.dashboardBaseUrl}`,
    });
  });
};
