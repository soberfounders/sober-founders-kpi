import type { App } from "@slack/bolt";
import { env } from "../../config/env.js";
import { defaultToolRuntime, summarizeToolExecution } from "../../ai/tools.js";
import { getProposalById, updateProposalStatus } from "../../agents/proposalStore.js";
import { executeProposal } from "../../agents/proposalExecutor.js";
import { generateProposalDetail } from "../../agents/proposalBuilder.js";
import { getPersona } from "../../agents/registry.js";
import { logger } from "../../observability/logger.js";

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
  // Agent proposal flow (approve / deny / tell me more)
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

    await updateProposalStatus(proposalId, "approved", {
      approved_by: approverUserId,
      approved_at: new Date().toISOString(),
    });

    const result = await executeProposal({ ...proposal, status: "approved" });

    if (channelId) {
      const persona = getPersona(proposal.agent_persona);
      const emoji = persona?.emoji || "";

      // Post execution summary to the digest thread where they clicked approve
      const summaryParts = [`${emoji} *Approved: ${proposal.title}*`, result.summary];
      if (result.draft && proposal.channel_id && proposal.channel_id !== channelId) {
        summaryParts.push("_Full draft posted in the #agent-queue thread for review._");
      }
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs || undefined,
        text: summaryParts.join("\n"),
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: `Approved: ${proposal.title}`,
    });

    logger.info(
      { proposalId, approver: approverUserId },
      "agent_proposal_approve: proposal approved and executed",
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

    await updateProposalStatus(proposalId, "denied", {
      denial_reason: "User denied via button",
    });

    if (channelId) {
      const persona = getPersona(proposal.agent_persona);
      const emoji = persona?.emoji || "";
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs || undefined,
        text: `${emoji} Denied. I'll adjust my approach for next time.`,
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: `Denied: ${proposal.title}`,
    });

    logger.info(
      { proposalId, actor: actorUserId },
      "agent_proposal_deny: proposal denied",
    );
  });

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

    const detail = await generateProposalDetail(persona, proposal);

    if (channelId) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs || undefined,
        text: `${persona.emoji} *More detail on: ${proposal.title}*\n\n${detail}`,
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: "Detail posted in thread.",
    });

    logger.info({ proposalId }, "agent_proposal_detail: detail posted");
  });

  // -------------------------------------------------------------------------
  // Reply button - opens a thread for founder feedback on a proposal
  // -------------------------------------------------------------------------

  app.action("agent_proposal_reply", async ({ ack, action, body, respond, client }) => {
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
    const emoji = persona?.emoji || "";

    // Post a thread prompt so the founder can reply with feedback
    if (channelId) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs || undefined,
        text: `${emoji} *${proposal.title}*\nReply here with feedback, context, or instructions. If this is a timing issue, let me know when to follow up and I'll resurface it then.`,
      });
    }

    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: "Thread opened. Reply with your feedback.",
    });

    logger.info({ proposalId }, "agent_proposal_reply: thread opened for feedback");
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
