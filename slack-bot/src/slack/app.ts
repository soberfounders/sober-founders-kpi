import { App, LogLevel } from "@slack/bolt";
import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";
import { registerBaseEventHandlers } from "./handlers/events.js";
import { registerMentionHandler } from "./handlers/mentions.js";
import { registerDmHandler } from "./handlers/dm.js";
import { registerHomeHandler } from "./handlers/home.js";
import { registerInteractionHandlers } from "./handlers/interactions.js";
import { registerKpiCommand } from "./commands/kpi.js";

const toBoltLogLevel = (level: string): LogLevel => {
  const normalized = level.toLowerCase();
  if (normalized === "debug") return LogLevel.DEBUG;
  if (normalized === "warn") return LogLevel.WARN;
  if (normalized === "error") return LogLevel.ERROR;
  return LogLevel.INFO;
};

export const createSlackApp = (): App => {
  const app = new App({
    token: env.slackBotToken,
    appToken: env.slackAppToken,
    signingSecret: env.slackSigningSecret || "unused-signing-secret",
    socketMode: true,
    logLevel: toBoltLogLevel(env.logLevel),
  });

  registerBaseEventHandlers(app);
  registerHomeHandler(app);
  registerMentionHandler(app);
  registerDmHandler(app);
  registerInteractionHandlers(app);
  registerKpiCommand(app);

  logger.info("Slack app handlers registered");
  return app;
};
