import { config as loadDotEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const packageEnvPath = path.resolve(configDir, "../../.env");

// Always load the Slack bot package env first so root-level scripts do not
// accidentally read unrelated repo .env values.
loadDotEnv({ path: packageEnvPath });
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
  OPENAI_MODEL: z.string().default("gpt-5.4"),
  OPENAI_MODEL_PRIMARY: z.string().optional(),
  OPENAI_MODEL_FAST: z.string().optional(),
  OPENAI_MODEL_FALLBACK: z.string().optional(),
  OPENAI_MODEL_CHEAP: z.string().optional(),
  OPENAI_USE_CHEAP_MODE: z.string().optional(),
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
  FREE_CHAT_CHANNEL_IDS: z.string().optional(),
  SLACK_FREE_CHAT_CHANNEL_IDS: z.string().optional(),
  DEFAULT_SUMMARY_CHANNEL: z.string().optional(),
  MANAGER_ENABLED: z.string().optional(),
  MANAGER_TARGET_SLACK_USER_ID: z.string().optional(),
  MANAGER_BRIEFING_HOUR_ET: z.string().optional(),
  MANAGER_CHECKIN_HOURS_ET: z.string().optional(),
  AGENT_QUEUE_ENABLED: z.string().optional(),
  AGENT_QUEUE_CHANNEL_ID: z.string().optional(),
  MARKETING_MANAGER_CHANNEL_ID: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

const data = parsed.data;

const executiveChannelCsv = data.HIGH_IMPACT_EXECUTIVE_CHANNELS || data.SLACK_EXECUTIVE_CHANNELS || "";
const freeChatChannelCsv = data.FREE_CHAT_CHANNEL_IDS || data.SLACK_FREE_CHAT_CHANNEL_IDS || "";

export const env = {
  appEnv: data.APP_ENV,
  logLevel: data.LOG_LEVEL,
  slackBotToken: data.SLACK_BOT_TOKEN,
  slackAppToken: data.SLACK_APP_TOKEN,
  slackSigningSecret: data.SLACK_SIGNING_SECRET,
  openAiApiKey: data.OPENAI_API_KEY,
  openAiModel: data.OPENAI_MODEL,
  openAiModelPrimary: data.OPENAI_MODEL_PRIMARY || data.OPENAI_MODEL,
  openAiModelFast: data.OPENAI_MODEL_FAST || "gpt-5.4-mini",
  openAiModelFallback: data.OPENAI_MODEL_FALLBACK || "gpt-4o",
  openAiModelCheap: data.OPENAI_MODEL_CHEAP || "gpt-4o-mini",
  openAiUseCheapMode: toBoolean(data.OPENAI_USE_CHEAP_MODE, false),
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
  freeChatChannelIds: freeChatChannelCsv
    .split(",")
    .map((channel) => channel.trim())
    .filter(Boolean),
  defaultSummaryChannel: data.DEFAULT_SUMMARY_CHANNEL || "",
  managerEnabled: toBoolean(data.MANAGER_ENABLED, true),
  managerTargetSlackUserId: data.MANAGER_TARGET_SLACK_USER_ID || "",
  managerBriefingHourEt: toInt(data.MANAGER_BRIEFING_HOUR_ET, 8, 0, 23),
  managerCheckinHoursEt: (data.MANAGER_CHECKIN_HOURS_ET || "12,15,17")
    .split(",")
    .map((h) => toInt(h.trim(), -1, 0, 23))
    .filter((h) => h >= 0),
  agentQueueEnabled: toBoolean(data.AGENT_QUEUE_ENABLED, false),
  agentQueueChannelId: data.AGENT_QUEUE_CHANNEL_ID || "",
  marketingManagerChannelId: data.MARKETING_MANAGER_CHANNEL_ID || "",
} as const;

export type AppEnv = typeof env;
