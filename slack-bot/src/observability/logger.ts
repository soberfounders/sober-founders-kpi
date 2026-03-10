import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.logLevel,
  base: {
    service: "slack-kpi-copilot",
    environment: env.appEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const withTrace = (traceId: string) => logger.child({ trace_id: traceId });
