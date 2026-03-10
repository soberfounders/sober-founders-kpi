import { beforeEach, vi } from "vitest";

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "error";
process.env.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "xoxb-test";
process.env.SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN || "xapp-test";
process.env.SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || "signing-secret";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-test";
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "anon-key";
process.env.DASHBOARD_BASE_URL = process.env.DASHBOARD_BASE_URL || "https://dashboard.example.com";

beforeEach(() => {
  vi.restoreAllMocks();
});
