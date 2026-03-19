import { createSlackApp } from "./slack/app.js";
import { SummaryScheduler } from "./slack/services/scheduler.js";
import { DailyManagerScheduler } from "./slack/services/managerScheduler.js";
import { AgentQueueScheduler } from "./agents/agentQueueScheduler.js";
import { logger } from "./observability/logger.js";

const app = createSlackApp();
const scheduler = new SummaryScheduler();
const managerScheduler = new DailyManagerScheduler();
const agentQueueScheduler = new AgentQueueScheduler();

const start = async () => {
  await app.start();
  scheduler.start();
  managerScheduler.start();
  agentQueueScheduler.start();
  logger.info("Slack KPI Copilot started");
};

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down Slack KPI Copilot");
  scheduler.stop();
  managerScheduler.stop();
  agentQueueScheduler.stop();
  await app.stop();
};

process.on("SIGINT", () => {
  void shutdown("SIGINT").finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM").finally(() => process.exit(0));
});

start().catch((error) => {
  logger.error({ err: error }, "Failed to start Slack KPI Copilot");
  process.exit(1);
});
