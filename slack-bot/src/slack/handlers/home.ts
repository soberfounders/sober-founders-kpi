import type { App } from "@slack/bolt";
import { buildAppHomeBlocks } from "../formatters/blocks.js";
import { getLatestGeneratedSummaries } from "../../data/summaries.js";
import { listOpenTasks } from "../../data/managers.js";
import { env } from "../../config/env.js";
import { logger } from "../../observability/logger.js";

export const registerHomeHandler = (app: App): void => {
  app.event("app_home_opened", async ({ event, client }) => {
    const payload = event as unknown as Record<string, unknown>;
    const userId = String(payload.user || "");

    try {
      const [summaries, tasks] = await Promise.all([
        getLatestGeneratedSummaries(5),
        listOpenTasks(undefined, undefined, undefined),
      ]);

      await client.views.publish({
        user_id: userId,
        view: {
          type: "home",
          blocks: buildAppHomeBlocks(
            summaries as Array<Record<string, unknown>>,
            tasks as Array<Record<string, unknown>>,
            env.dashboardBaseUrl,
          ) as any,
        },
      });
    } catch (error) {
      logger.error({ err: error, userId }, "Failed to publish app home");
    }
  });
};
