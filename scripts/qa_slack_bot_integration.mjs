#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const skipCommands = args.has("--skip-commands");

const requiredFiles = [
  "slack-bot/package.json",
  "slack-bot/tsconfig.json",
  "slack-bot/tsconfig.build.json",
  "slack-bot/.env.example",
  "slack-bot/README.md",
  "slack-bot/ADMIN_README.md",
  "slack-bot/src/index.ts",
  "slack-bot/src/slack/app.ts",
  "slack-bot/src/slack/commands/kpi.ts",
  "slack-bot/src/slack/handlers/events.ts",
  "slack-bot/src/slack/handlers/mentions.ts",
  "slack-bot/src/slack/handlers/dm.ts",
  "slack-bot/src/slack/handlers/home.ts",
  "slack-bot/src/slack/handlers/interactions.ts",
  "slack-bot/src/ai/orchestrator.ts",
  "slack-bot/src/ai/tools.ts",
  "slack-bot/src/ai/systemPrompt.ts",
  "slack-bot/src/data/metrics.ts",
  "slack-bot/src/data/summaries.ts",
  "slack-bot/src/data/trends.ts",
  "slack-bot/src/data/managers.ts",
  "slack-bot/src/actions/createTask.ts",
  "slack-bot/src/actions/createFollowup.ts",
  "slack-bot/src/actions/assignOwner.ts",
  "slack-bot/src/actions/sendSlackSummary.ts",
  "slack-bot/src/actions/logAuditEvent.ts",
  "supabase/migrations/20260310170000_add_slack_kpi_copilot_tables.sql",
];

const requiredTools = [
  "get_kpi_snapshot",
  "get_metric_trend",
  "get_manager_report",
  "list_open_tasks",
  "create_task",
  "create_followup",
  "send_slack_message",
  "post_summary",
  "get_data_quality_warnings",
  "get_org_context",
];

const requiredSlashPatterns = [
  "ask",
  "summary",
  "tasks",
  "followup",
];

const requiredTables = [
  "slack_conversations",
  "bot_actions_audit",
  "generated_summaries",
  "followups",
  "task_requests",
  "user_channel_preferences",
  "slack_user_roles",
  "slack_channel_policies",
];

const requiredEnvVars = [
  "SLACK_BOT_TOKEN",
  "SLACK_APP_TOKEN",
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const results = [];

const addResult = (check, passed, detail) => {
  results.push({ check, passed, detail });
};

const readText = (relativePath) => {
  const full = path.join(ROOT, relativePath);
  return readFileSync(full, "utf8");
};

const checkFiles = () => {
  const missing = requiredFiles.filter((file) => !existsSync(path.join(ROOT, file)));
  addResult(
    "required-files",
    missing.length === 0,
    missing.length ? `Missing files: ${missing.join(", ")}` : `All ${requiredFiles.length} required files are present`,
  );
};

const checkRootScripts = () => {
  const rootPackage = JSON.parse(readText("package.json"));
  const scripts = rootPackage.scripts || {};
  const required = ["slack:dev", "slack:start", "slack:test", "slack:lint"];
  const missing = required.filter((name) => !scripts[name]);
  addResult(
    "root-scripts",
    missing.length === 0,
    missing.length ? `Missing package.json scripts: ${missing.join(", ")}` : "Required root scripts exist",
  );
};

const checkToolAllowlist = () => {
  const toolsSource = readText("slack-bot/src/ai/tools.ts");
  const missing = requiredTools.filter((tool) => !toolsSource.includes(tool));
  addResult(
    "tool-allowlist",
    missing.length === 0,
    missing.length ? `Missing tool names in ai/tools.ts: ${missing.join(", ")}` : "All required tool functions are present in ai/tools.ts",
  );
};

const checkSlashSupport = () => {
  const commandSource = readText("slack-bot/src/slack/commands/kpi.ts");
  const missing = requiredSlashPatterns.filter((sub) => !commandSource.includes(sub));
  addResult(
    "slash-subcommands",
    missing.length === 0,
    missing.length ? `Missing slash command handling tokens: ${missing.join(", ")}` : "Slash subcommands ask|summary|tasks|followup detected",
  );
};

const checkMigrationTables = () => {
  const migration = readText("supabase/migrations/20260310170000_add_slack_kpi_copilot_tables.sql");
  const missing = requiredTables.filter((table) => !migration.includes(`public.${table}`));
  const hasRls = migration.includes("ENABLE ROW LEVEL SECURITY");
  const hasServiceRolePolicies = migration.includes("Service role write");

  const pass = missing.length === 0 && hasRls && hasServiceRolePolicies;
  const detailParts = [];
  if (missing.length) detailParts.push(`Missing tables in migration: ${missing.join(", ")}`);
  if (!hasRls) detailParts.push("RLS enable statements not found");
  if (!hasServiceRolePolicies) detailParts.push("Service role policy statements not found");
  if (pass) detailParts.push("Migration includes required tables + RLS + service role policy pattern");

  addResult("migration-coverage", pass, detailParts.join("; "));
};

const checkEnvTemplate = () => {
  const envTemplate = readText("slack-bot/.env.example");
  const missing = requiredEnvVars.filter((name) => !envTemplate.includes(`${name}=`));
  addResult(
    "env-template",
    missing.length === 0,
    missing.length ? `Missing env vars in slack-bot/.env.example: ${missing.join(", ")}` : "Required env vars are present in template",
  );
};

const checkSecurityHooks = () => {
  const envSource = readText("slack-bot/src/config/env.ts");
  const toolsSource = readText("slack-bot/src/ai/tools.ts");
  const rbacSource = readText("slack-bot/src/slack/permissions/rbac.ts");

  const checks = [
    { token: "safeParse", source: envSource, name: "env validation" },
    { token: "parseToolArgs", source: toolsSource, name: "tool arg validation" },
    { token: "logAuditEvent", source: toolsSource, name: "audit logging" },
    { token: "createPendingConfirmation", source: toolsSource, name: "confirmation gate" },
    { token: "canPostToChannel", source: rbacSource, name: "rbac channel permission" },
  ];

  const missing = checks.filter((item) => !item.source.includes(item.token)).map((item) => item.name);
  addResult(
    "security-hooks",
    missing.length === 0,
    missing.length ? `Missing security hooks: ${missing.join(", ")}` : "Security hooks detected (env validation, tool validation, RBAC, confirmation, audit)",
  );
};

const runCommand = (label, command, commandArgs) => {
  const run = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: "pipe",
    shell: process.platform === "win32",
    encoding: "utf8",
  });

  const ok = run.status === 0;
  const output = `${run.stdout || ""}${run.stderr || ""}`.trim();
  addResult(label, ok, ok ? "passed" : output.slice(0, 1600));
};

const checkCommands = () => {
  if (skipCommands) {
    addResult("command-checks", true, "Skipped command checks (--skip-commands)");
    return;
  }

  runCommand("slack:lint", "npm", ["run", "slack:lint"]);
  runCommand("slack:test", "npm", ["run", "slack:test"]);
  runCommand("slack-bot build", "npm", ["--prefix", "slack-bot", "run", "build"]);
};

const runAll = () => {
  checkFiles();
  checkRootScripts();
  checkToolAllowlist();
  checkSlashSupport();
  checkMigrationTables();
  checkEnvTemplate();
  checkSecurityHooks();
  checkCommands();
};

runAll();

const failed = results.filter((r) => !r.passed);
const summary = {
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
};

if (asJson) {
  console.log(JSON.stringify({ summary, results }, null, 2));
} else {
  console.log("Slack Bot QA Verification\n");
  for (const result of results) {
    const prefix = result.passed ? "[PASS]" : "[FAIL]";
    console.log(`${prefix} ${result.check}`);
    console.log(`  ${result.detail}`);
  }
  console.log("\nSummary:");
  console.log(`  Total: ${summary.total}`);
  console.log(`  Passed: ${summary.passed}`);
  console.log(`  Failed: ${summary.failed}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
