import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const toBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

const toInt = (value: string | undefined, fallback: number, min: number, max: number) => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const envSchema = z.object({
  APP_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("info"),
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_APP_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().optional(),
  MASTER_SYNC_EDGE_INVOKE_KEY: z.string().optional(),
  DASHBOARD_BASE_URL: z.string().url().default("https://soberfounders.dashboard"),
  SCHEDULER_ENABLED: z.string().optional(),
  SCHEDULER_POLL_INTERVAL_MS: z.string().optional(),
  RATE_LIMIT_WINDOW_SEC: z.string().optional(),
  RATE_LIMIT_MAX_REQUESTS: z.string().optional(),
  CONFIRMATION_TTL_MINUTES: z.string().optional(),
  HIGH_IMPACT_EXECUTIVE_CHANNELS: z.string().optional(),
  SLACK_EXECUTIVE_CHANNELS: z.string().optional(),
  DEFAULT_SUMMARY_CHANNEL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

const data = parsed.data;

const executiveChannelCsv = data.HIGH_IMPACT_EXECUTIVE_CHANNELS || data.SLACK_EXECUTIVE_CHANNELS || "";

export const env = {
  appEnv: data.APP_ENV,
  logLevel: data.LOG_LEVEL,
  slackBotToken: data.SLACK_BOT_TOKEN,
  slackAppToken: data.SLACK_APP_TOKEN,
  slackSigningSecret: data.SLACK_SIGNING_SECRET,
  openAiApiKey: data.OPENAI_API_KEY,
  openAiModel: data.OPENAI_MODEL,
  supabaseUrl: data.SUPABASE_URL,
  supabaseServiceRoleKey: data.SUPABASE_SERVICE_ROLE_KEY,
  supabaseAnonKey: data.SUPABASE_ANON_KEY,
  masterSyncEdgeInvokeKey: data.MASTER_SYNC_EDGE_INVOKE_KEY,
  dashboardBaseUrl: data.DASHBOARD_BASE_URL,
  schedulerEnabled: toBoolean(data.SCHEDULER_ENABLED, true),
  schedulerPollIntervalMs: toInt(data.SCHEDULER_POLL_INTERVAL_MS, 60_000, 5_000, 3_600_000),
  rateLimitWindowSec: toInt(data.RATE_LIMIT_WINDOW_SEC, 30, 1, 600),
  rateLimitMaxRequests: toInt(data.RATE_LIMIT_MAX_REQUESTS, 5, 1, 100),
  confirmationTtlMinutes: toInt(data.CONFIRMATION_TTL_MINUTES, 15, 1, 240),
  executiveChannels: executiveChannelCsv
    .split(",")
    .map((channel) => channel.trim())
    .filter(Boolean),
  defaultSummaryChannel: data.DEFAULT_SUMMARY_CHANNEL || "",
} as const;

export type AppEnv = typeof env;
