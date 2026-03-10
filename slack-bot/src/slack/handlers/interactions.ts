import type { App } from "@slack/bolt";
import { env } from "../../config/env.js";
import { defaultToolRuntime, summarizeToolExecution } from "../../ai/tools.js";

export const registerInteractionHandlers = (app: App): void => {
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
