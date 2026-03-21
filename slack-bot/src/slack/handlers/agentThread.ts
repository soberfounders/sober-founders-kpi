/**
 * Handles thread replies in #agent-queue and #marketing-manager.
 *
 * Conversation modes based on proposal status:
 *   "clarifying"             - Approve flow: ask clarifying Qs one at a time, then execute
 *   "denied_pending_feedback" - Deny flow: collect feedback, store it, mark denied, present next
 *   "proposed"               - Discussion flow (Let's Talk More): back-and-forth before deciding
 *   "completed" / "approved" - Post-execution: answer "what did you do?" with execution context
 *   null (no proposal)       - General Marketing Manager conversation
 *
 * After any idea is resolved (executed or denied with feedback), the next queued
 * idea is presented in the channel.
 */

import type { App } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { env } from "../../config/env.js";
import { llmText } from "../../ai/llmClient.js";
import {
  getProposalByMessageTs,
  updateProposalStatus,
  upsertContext,
} from "../../agents/proposalStore.js";
import { executeProposal } from "../../agents/proposalExecutor.js";
import { getPersona } from "../../agents/registry.js";
import { presentNextProposal } from "./interactions.js";
import { logger } from "../../observability/logger.js";

const slack = new WebClient(env.slackBotToken);

/** Post a notification to #marketing-manager about feedback received in #agent-queue */
const notifyMmOfFeedback = async (
  agentName: string,
  agentEmoji: string,
  proposalTitle: string,
  userFeedback: string,
): Promise<void> => {
  const mmChannel = env.marketingManagerChannelId;
  if (!mmChannel) return;

  try {
    const manager = getPersona("marketing_manager");
    const emoji = manager?.emoji || "\u{1F4CB}";
    await slack.chat.postMessage({
      channel: mmChannel,
      text: `${emoji} *Feedback received in #agent-queue*\n${agentEmoji} *${agentName}* - "${proposalTitle}"\nFounder said: _"${userFeedback.slice(0, 300)}"_\nAgent is acting on this. I'll track the follow-through.`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to notify MM of agent-queue feedback");
  }
};

/** Fetch recent thread messages to build conversation context */
const getThreadContext = async (
  client: InstanceType<typeof WebClient>,
  channelId: string,
  threadTs: string,
): Promise<string> => {
  try {
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 20,
    });
    const messages = (result.messages || []).slice(1); // Skip the root message
    return messages
      .map((m: any) => {
        const role = m.bot_id ? "Agent" : "Founder";
        return `${role}: ${(m.text || "").slice(0, 500)}`;
      })
      .join("\n");
  } catch {
    return "";
  }
};

/** Check if user text signals "what's next" / "next idea" */
const isNextIdeaRequest = (text: string): boolean => {
  const lower = text.toLowerCase().trim();
  return /\b(what'?s next|next idea|next one|what else|another idea|more ideas|anything else)\b/.test(lower);
};

/** Check if user text signals "go ahead" / "execute" / "do it" */
const isExecuteSignal = (text: string): boolean => {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/).length;

  // Unambiguous multi-word signals work at any length
  if (/\b(go ahead|do it|execute|ship it|looks good|let'?s go|go for it|make it happen|send it)\b/.test(lower)) {
    return true;
  }

  // Short bare confirmations only count if the message is very short (≤ 4 words)
  // to avoid false-positives like "yes but the budget is wrong"
  if (words <= 4 && /^(yes|yep|yeah|yup|approved?|do it|go)\.?!?$/i.test(lower)) {
    return true;
  }

  return false;
};

export const registerAgentThreadHandler = (app: App): void => {
  app.message(async ({ message, client }) => {
    const payload = message as unknown as Record<string, unknown>;

    // Only handle threaded messages (has thread_ts)
    if (payload.subtype || payload.bot_id) return;
    if (!payload.thread_ts) return;

    const channelId = String(payload.channel || "");
    // Handle threads in both #agent-queue and #marketing-manager
    const agentChannels = [env.agentQueueChannelId, env.marketingManagerChannelId].filter(Boolean);
    if (!channelId || !agentChannels.includes(channelId)) return;

    const threadTs = String(payload.thread_ts);
    const userText = String(payload.text || "").trim();
    if (!userText) return;

    const isWorkLog = channelId === env.agentQueueChannelId;

    logger.info({ channelId, threadTs, userText: userText.slice(0, 80), isWorkLog }, "Agent thread reply received");

    // Look up the proposal by the thread root message_ts
    const proposal = await getProposalByMessageTs(channelId, threadTs);

    if (proposal) {
      const persona = getPersona(proposal.agent_persona);
      if (!persona) return;

      logger.info(
        { proposalId: proposal.id, persona: persona.id, status: proposal.status, userText },
        "Thread reply in proposal thread",
      );

      // Persist founder feedback as agent context
      try {
        await upsertContext(
          proposal.agent_persona,
          "founder_feedback",
          `feedback_${proposal.id.slice(0, 8)}`,
          {
            proposal_id: proposal.id,
            proposal_title: proposal.title,
            target_metric: proposal.target_metric,
            feedback: userText,
            received_at: new Date().toISOString(),
          },
          `Founder feedback on "${proposal.title}": ${userText.slice(0, 200)}`,
        );
      } catch (err) {
        logger.error({ err }, "Failed to persist founder feedback as context");
      }

      // -----------------------------------------------------------------------
      // CLARIFYING flow: ask questions one at a time, then execute
      // -----------------------------------------------------------------------
      if (proposal.status === "clarifying") {
        const threadContext = await getThreadContext(client, channelId, threadTs);

        // Check if the LLM decides it has enough info or user says "go"
        if (isExecuteSignal(userText)) {
          // User says go — execute now
          await handleExecution(client, channelId, threadTs, proposal, persona);
          return;
        }

        // Generate next clarifying question (or READY_TO_EXECUTE)
        try {
          const response = await llmText({
            taskType: "conversation_reply",
            instructions: `You are ${persona.displayName} (${persona.emoji}), a marketing agent for Sober Founders. ${persona.systemPromptAddendum}

You're in a clarification conversation about an approved proposal. The founder is answering your questions before you execute.

Proposal: ${proposal.title}
Description: ${proposal.description}
Target metric: ${proposal.target_metric}
Expected impact: ${proposal.expected_delta} (${proposal.delta_type})

Conversation so far:
${threadContext}

Based on the founder's latest response, decide:
1. If you need more clarity on something important, ask ONE follow-up question. Be specific to THIS proposal.
2. If you have enough to execute well, respond with READY_TO_EXECUTE on its own line, followed by a 2-3 sentence summary of what you'll do based on what you've learned.

Rules:
- ONE question at a time. Never list multiple questions.
- Max 3 total questions before proceeding (conversation should not drag on).
- Do not use em dashes. Be conversational and brief.`,
            input: [{ role: "user", content: userText }],
            metadata: { proposalId: proposal.id, persona: persona.id },
          });

          const responseText = response.outputText;

          if (responseText.includes("READY_TO_EXECUTE")) {
            // Strip the marker and post the summary, then execute
            const summary = responseText.replace(/READY_TO_EXECUTE\s*/i, "").trim();
            await client.chat.postMessage({
              channel: channelId,
              thread_ts: threadTs,
              text: `${persona.emoji} ${summary}\n\nExecuting now...`,
            });

            await handleExecution(client, channelId, threadTs, proposal, persona);
          } else {
            await client.chat.postMessage({
              channel: channelId,
              thread_ts: threadTs,
              text: `${persona.emoji} ${responseText}`,
            });
          }
        } catch (err: any) {
          logger.error({ err: err?.message || String(err), proposalId: proposal.id }, "Failed in clarification flow");
        }
        return;
      }

      // -----------------------------------------------------------------------
      // DENIED_PENDING_FEEDBACK flow: collect feedback, store it, mark denied
      // -----------------------------------------------------------------------
      if (proposal.status === "denied_pending_feedback") {
        try {
          // Store the denial feedback
          await updateProposalStatus(proposal.id, "denied", {
            denial_reason: userText,
            user_modifications: userText,
          });

          await upsertContext(
            proposal.agent_persona,
            "denial_feedback",
            `denial_${proposal.id.slice(0, 8)}`,
            {
              proposal_id: proposal.id,
              proposal_title: proposal.title,
              target_metric: proposal.target_metric,
              feedback: userText,
              received_at: new Date().toISOString(),
            },
            `Denied "${proposal.title}" — reason: ${userText.slice(0, 200)}`,
          );

          // Acknowledge the feedback
          const response = await llmText({
            taskType: "conversation_reply",
            instructions: `You are ${persona.displayName} (${persona.emoji}), a marketing agent for Sober Founders. ${persona.systemPromptAddendum}

The founder denied your proposal "${proposal.title}" and gave this feedback:
"${userText}"

Briefly acknowledge their feedback (1-2 sentences). Show you understand WHY they said no. Mention specifically what you'll do differently next time based on their input. Do not use em dashes. Be concise.`,
            input: [{ role: "user", content: userText }],
            metadata: { proposalId: proposal.id, persona: persona.id },
          });

          await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: `${persona.emoji} ${response.outputText}`,
          });

          // Present the next idea in the channel (not the thread)
          await presentNextProposal(client, channelId);

          logger.info({ proposalId: proposal.id }, "Denial feedback captured, next idea presented");
        } catch (err: any) {
          logger.error({ err: err?.message || String(err), proposalId: proposal.id }, "Failed in denial feedback flow");
        }
        return;
      }

      // -----------------------------------------------------------------------
      // GENERAL proposal thread (proposed, completed, approved, etc.)
      // -----------------------------------------------------------------------

      // Check for "what's next?" signal
      if (isNextIdeaRequest(userText)) {
        const manager = getPersona("marketing_manager");
        const emoji = manager?.emoji || "";
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `${emoji} Let me grab the next one.`,
        });
        await presentNextProposal(client, channelId);
        return;
      }

      // Capture user modification if proposal is still pending
      if (proposal.status === "proposed") {
        await updateProposalStatus(proposal.id, "proposed", {
          user_modifications: userText,
        });
      }

      try {
        const actionContext = isWorkLog
          ? `\n\nIMPORTANT: The founder is giving you direct feedback in the work log. This is an instruction to act on, not just a discussion. Acknowledge the feedback, explain what you'll do to address it, and be specific about next steps.`
          : "";

        const systemPrompt = `You are ${persona.displayName} (${persona.emoji}), a marketing agent for Sober Founders. ${persona.systemPromptAddendum}

You're discussing this proposal:
Title: ${proposal.title}
Description: ${proposal.description}
Target metric: ${proposal.target_metric}
Expected delta: ${proposal.expected_delta} (${proposal.delta_type})
Status: ${proposal.status}
${proposal.executed_at ? `Executed at: ${proposal.executed_at}` : ""}
${proposal.execution_result ? `Execution result: ${JSON.stringify(proposal.execution_result)}` : ""}
${proposal.measure_after ? `Outcome measurement scheduled: ${proposal.measure_after}` : ""}${actionContext}

IMPORTANT: If the founder asks "what did you do?" or similar, give a specific, honest answer based on the execution result above. Be explicit about:
- What actions were actually completed (e.g., Notion task created, draft copy generated)
- What still requires manual action (e.g., setting up automation in HubSpot, configuring email sequences, publishing content)
- Do NOT imply you did something you didn't. If all you did was create a task and draft copy, say that clearly.

IMPORTANT: If the founder's feedback suggests the idea is good but the timing is wrong (e.g., "we don't have X yet", "waiting on approval", "not ready for this yet", "too early"), acknowledge that, then ask: "When should I follow up on this?" Give them a concrete suggestion if you can (e.g., "Want me to revisit this in 2 weeks?" or "Should I circle back once the grant is approved?"). The goal is to not lose good ideas, just defer them.

If the founder gives a follow-up date or timeframe in their reply, confirm you'll resurface it then.

Respond conversationally. Be direct and specific. Do not use em dashes. Keep it concise.`;

        const response = await llmText({
          taskType: "conversation_reply",
          instructions: systemPrompt,
          input: [{ role: "user", content: userText }],
          metadata: { proposalId: proposal.id, persona: persona.id },
        });

        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `${persona.emoji} ${response.outputText}`,
        });

        if (isWorkLog) {
          await notifyMmOfFeedback(persona.displayName, persona.emoji, proposal.title, userText);
        }

        logger.info({ proposalId: proposal.id, isWorkLog }, "Thread response posted to Slack");
      } catch (err: any) {
        logger.error({ err: err?.message || String(err), proposalId: proposal.id }, "Failed to respond in proposal thread");
      }
    } else {
      // --- Non-proposal thread (e.g., digest thread in #marketing-manager) ---

      // Check for "what's next?" in general threads too
      if (isNextIdeaRequest(userText)) {
        await presentNextProposal(client, channelId);
        return;
      }

      const manager = getPersona("marketing_manager");
      if (!manager) return;

      logger.info({ channelId, threadTs, userText }, "General thread reply (no linked proposal)");

      try {
        const systemPrompt = `You are ${manager.displayName} (${manager.emoji}), the Marketing Manager for Sober Founders. ${manager.systemPromptAddendum}

The founder is replying in a thread. This could be on a digest message, a nudge, or any other message you posted. Respond helpfully and directly. If they're asking a question, answer it. If they're giving feedback, acknowledge it and explain what action you'll take. Do not use em dashes. Keep it concise.

If the founder asks for the next idea or what's next, tell them you'll present it.

Priority hierarchy (always keep this in mind):
1. Phoenix Forum membership growth (paid members at $250/mo)
2. Donations and MRR (monthly recurring revenue)
3. Free group attendance (Thursday open, Tuesday verified)`;

        const response = await llmText({
          taskType: "conversation_reply",
          instructions: systemPrompt,
          input: [{ role: "user", content: userText }],
          metadata: { persona: manager.id },
        });

        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `${manager.emoji} ${response.outputText}`,
        });

        logger.info("General thread response posted");
      } catch (err: any) {
        logger.error({ err: err?.message || String(err) }, "Failed to respond in general thread");
      }
    }
  });
};

// ---------------------------------------------------------------------------
// Execute a proposal after clarification is complete
// ---------------------------------------------------------------------------

const handleExecution = async (
  client: InstanceType<typeof WebClient>,
  channelId: string,
  threadTs: string,
  proposal: import("../../agents/proposalStore.js").AgentProposal,
  persona: import("../../agents/registry.js").AgentPersona,
): Promise<void> => {
  try {
    // Gather user modifications from the clarification thread
    const threadContext = await getThreadContext(client, channelId, threadTs);

    await updateProposalStatus(proposal.id, "approved", {
      user_modifications: threadContext,
    });

    const result = await executeProposal({
      ...proposal,
      status: "approved",
      channel_id: channelId,
      message_ts: threadTs,
    });

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `${persona.emoji} *Done.* ${result.summary}`,
    });

    // Present the next idea in the channel (not the thread)
    await presentNextProposal(client, channelId);

    logger.info({ proposalId: proposal.id }, "Proposal executed after clarification, next idea presented");
  } catch (err: any) {
    logger.error({ err: err?.message || String(err), proposalId: proposal.id }, "Failed to execute after clarification");
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `${persona.emoji} Execution failed: ${String(err)}. I'll retry or adjust.`,
    });
  }
};
