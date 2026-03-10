import crypto from "node:crypto";
import type { App } from "@slack/bolt";
import { env } from "../../config/env.js";
import { orchestrateKpiPrompt } from "../../ai/orchestrator.js";
import { buildConfirmationBlocks } from "../formatters/blocks.js";
import { formatSlackEnvelope } from "../formatters/messages.js";
import { formatErrorMessage, rateLimitedMessage } from "../formatters/errors.js";
import { SlidingWindowRateLimiter } from "../services/rateLimit.js";
import { logConversationTurn } from "../services/threading.js";
import type { SlackActorContext } from "../../types.js";

const limiter = new SlidingWindowRateLimiter(env.rateLimitWindowSec * 1000, env.rateLimitMaxRequests);

export interface ReplyPayload {
  text: string;
  blocks?: Array<Record<string, unknown>>;
  threadTs?: string;
  ephemeral?: boolean;
}

export interface PromptRequest {
  prompt: string;
  actor: SlackActorContext;
  reply: (payload: ReplyPayload) => Promise<void>;
  traceId?: string;
  confirmationEphemeral?: boolean;
}

export const handlePromptRequest = async (request: PromptRequest): Promise<void> => {
  const traceId = request.traceId || crypto.randomUUID();
  const limiterKey = `${request.actor.userId}:${request.actor.channelId}`;

  if (!limiter.tryConsume(limiterKey)) {
    await request.reply({
      text: rateLimitedMessage(),
      threadTs: request.actor.threadTs,
      ephemeral: true,
    });
    return;
  }

  await logConversationTurn({
    teamId: request.actor.teamId,
    channelId: request.actor.channelId,
    threadTs: request.actor.threadTs,
    messageTs: request.actor.messageTs,
    actorUserId: request.actor.userId,
    direction: "inbound",
    messageText: request.prompt,
    metadata: { trace_id: traceId },
  });

  try {
    const envelope = await orchestrateKpiPrompt({
      prompt: request.prompt,
      context: {
        traceId,
        actor: request.actor,
      },
    });

    const formatted = formatSlackEnvelope(envelope);
    const blocks = envelope.requiresConfirmation && envelope.pendingActionId
      ? buildConfirmationBlocks(envelope.pendingActionId, envelope.text)
      : formatted.blocks;

    await request.reply({
      text: formatted.text,
      blocks,
      threadTs: request.actor.threadTs,
      ephemeral: envelope.requiresConfirmation ? Boolean(request.confirmationEphemeral) : false,
    });

    await logConversationTurn({
      teamId: request.actor.teamId,
      channelId: request.actor.channelId,
      threadTs: request.actor.threadTs,
      actorUserId: request.actor.userId,
      direction: "outbound",
      messageText: envelope.text,
      intentType: envelope.intentType,
      metadata: {
        trace_id: traceId,
        confidence: envelope.confidence,
        sources: envelope.sources,
        time_window: envelope.timeWindow,
        requires_confirmation: envelope.requiresConfirmation || false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await request.reply({
      text: formatErrorMessage(message, traceId),
      threadTs: request.actor.threadTs,
      ephemeral: true,
    });
  }
};

export const registerBaseEventHandlers = (app: App): void => {
  app.error(async (error) => {
    // Bolt-level errors are logged by the framework and surfaced here for diagnostics.
    // Keep this callback lightweight so it does not throw.
    console.error("Slack app error", error);
  });
};
