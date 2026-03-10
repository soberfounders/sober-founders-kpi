#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;

const DEFAULT_REPORT_PATH = "docs/audits/repo-db-simplification-audit.md";
const DEFAULT_JSON_PATH = "docs/audits/repo-db-simplification-audit.json";
const DEFAULT_SQL_PLAN_PATH = "docs/data-integrity/proposed-db-cleanup.sql";

const REFERENCE_ROOTS = [
  "dashboard/src",
  "dashboard/e2e",
  "dashboard/tests",
  "supabase/functions",
  "scripts",
];

const REFERENCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".sql",
  ".json",
]);

const SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  "dist",
  "sober-kpi-dist",
  "tmp_remote_fn",
  "research",
  ".cursor",
  ".agent",
]);

function parseArgs(argv = []) {
  const options = {
    reportPath: DEFAULT_REPORT_PATH,
    jsonPath: DEFAULT_JSON_PATH,
    sqlPlanPath: DEFAULT_SQL_PLAN_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();
    if (!arg) continue;
    if (arg.startsWith("--report=")) options.reportPath = arg.split("=")[1] || DEFAULT_REPORT_PATH;
    if (arg.startsWith("--json=")) options.jsonPath = arg.split("=")[1] || "";
    if (arg.startsWith("--sql-plan=")) options.sqlPlanPath = arg.split("=")[1] || DEFAULT_SQL_PLAN_PATH;
  }

  return options;
}

function mustGetDbUrl() {
  const dbUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    throw new Error("Missing SUPABASE_DB_URL (or DATABASE_URL).");
  }
  return dbUrl;
}

function normalizeIdentifier(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/^public\./i, "")
    .replace(/^"|"$/g, "")
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listFilesRecursively(rootDir) {
  const discovered = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!REFERENCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      discovered.push(fullPath);
    }
  }

  walk(rootDir);
  return discovered;
}

function readTextFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}

function gitRevParse(ref) {
  try {
    return execSync(`git rev-parse --short ${ref}`, { encoding: "utf8" }).trim();
  } catch (_error) {
    return "";
  }
}

function collectReferenceFiles(repoRoot) {
  const files = [];
  for (const relativeRoot of REFERENCE_ROOTS) {
    files.push(...listFilesRecursively(path.join(repoRoot, relativeRoot)));
  }
  return files;
}

function collectObjectReferences(objectNames = [], files = [], repoRoot = process.cwd()) {
  const byObject = new Map();
  const loweredNames = objectNames
    .map((name) => normalizeIdentifier(name))
    .filter(Boolean);

  for (const objectName of loweredNames) {
    byObject.set(objectName, { count: 0, files: [] });
  }

  for (const filePath of files) {
    const content = readTextFileSafe(filePath).toLowerCase();
    if (!content) continue;
    for (const objectName of loweredNames) {
      if (!content.includes(objectName)) continue;
      const boundaryPattern = new RegExp(`(^|[^a-z0-9_])${escapeRegex(objectName)}([^a-z0-9_]|$)`, "i");
      if (!boundaryPattern.test(content)) continue;
      const record = byObject.get(objectName);
      if (!record) continue;
      record.count += 1;
      record.files.push(path.relative(repoRoot, filePath).replace(/\\/g, "/"));
    }
  }

  return byObject;
}

function extractCreateStatements(sql = "") {
  const withoutBlockComments = String(sql).replace(/\/\*[\s\S]*?\*\//g, " ");
  const withoutLineComments = withoutBlockComments.replace(/--.*$/gm, " ");
  const normalizedSql = withoutLineComments;

  const tableNames = new Set();
  const viewNames = new Set();
  const functionNames = new Set();
  const policyTargets = [];

  const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?("?[a-zA-Z0-9_]+"?)\s*\(/gi;
  const viewRegex = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?("?[a-zA-Z0-9_]+"?)/gi;
  const functionRegex = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?("?[a-zA-Z0-9_]+"?)\s*\(/gi;
  const policyRegex = /create\s+policy\s+("?[a-zA-Z0-9_\s]+"?)\s+on\s+(?:public\.)?("?[a-zA-Z0-9_]+"?)/gi;

  let match = null;
  while ((match = tableRegex.exec(normalizedSql)) !== null) tableNames.add(normalizeIdentifier(match[1]));
  while ((match = viewRegex.exec(normalizedSql)) !== null) viewNames.add(normalizeIdentifier(match[1]));
  while ((match = functionRegex.exec(normalizedSql)) !== null) functionNames.add(normalizeIdentifier(match[1]));
  while ((match = policyRegex.exec(normalizedSql)) !== null) {
    policyTargets.push({
      policyName: normalizeIdentifier(match[1]),
      tableName: normalizeIdentifier(match[2]),
    });
  }

  return {
    tableNames: [...tableNames],
    viewNames: [...viewNames],
    functionNames: [...functionNames],
    policyTargets,
  };
}

function pushMapArray(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function mapToSortedObject(map) {
  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return Object.fromEntries(entries.map(([key, value]) => [key, [...value].sort()]));
}

function formatBulletList(items = [], indent = "") {
  if (!items.length) return `${indent}- none`;
  return items.map((item) => `${indent}- ${item}`).join("\n");
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# Repository + Database Simplification Audit");
  lines.push("");
  lines.push(`- generated_at: ${result.generatedAt}`);
  lines.push(`- head_commit: ${result.git.head}`);
  lines.push(`- origin_main_commit: ${result.git.originMain}`);
  lines.push(`- db_project_ref: ${result.db.projectRef || "unknown"}`);
  lines.push(`- local_migrations: ${result.migrations.localVersions.length}`);
  lines.push(`- remote_applied_migrations: ${result.migrations.appliedVersions.length}`);
  lines.push(`- db_objects: tables=${result.db.tables.length}, views=${result.db.views.length}, functions=${result.db.functions.length}, policies=${result.db.policies.length}, indexes=${result.db.indexes.length}`);
  lines.push("");
  lines.push("## 1) Unused or Deprecated Database Components");
  lines.push("");
  lines.push("### High-confidence legacy candidates");
  lines.push("- In live DB, not created by current migration set, and not referenced in app/query code.");
  lines.push(formatBulletList(result.findings.highConfidenceLegacyCandidates.map((item) => {
    if (item.type === "function" && item.signature) return `${item.type}: ${item.signature}`;
    return `${item.type}: ${item.name}`;
  })));
  lines.push("");
  lines.push("### Potentially unused (manual verification required)");
  lines.push("- In live DB and not referenced by app/query code, but migration-created.");
  lines.push(formatBulletList(result.findings.potentiallyUnused.map((item) => {
    if (item.type === "function" && item.signature) return `${item.type}: ${item.signature}`;
    return `${item.type}: ${item.name}`;
  })));
  lines.push("");
  lines.push("### Duplicate migration definitions");
  lines.push("- Same object created in multiple migrations (cleanup and consolidate).");
  lines.push(formatBulletList(result.findings.duplicateMigrationObjects.map((item) => `${item.type}: ${item.name} -> ${item.files.join(", ")}`)));
  lines.push("");
  lines.push("## 2) Recommended Deletions");
  lines.push("");
  lines.push("### Safety-first quarantine approach (no data drop on first pass)");
  lines.push("1. Move high-confidence legacy objects from `public` to `archive` schema.");
  lines.push("2. Run dashboard/integrity checks for at least 7 days.");
  lines.push("3. If no regressions, permanently drop archived objects.");
  lines.push("");
  lines.push(`Exact SQL plan: \`${result.paths.sqlPlanPath}\``);
  lines.push("");
  lines.push("## 3) Schema Simplification Recommendations");
  lines.push("");
  lines.push(formatBulletList(result.recommendations.schemaSimplification));
  lines.push("");
  lines.push("## 4) Migration Cleanup Actions");
  lines.push("");
  lines.push(formatBulletList(result.recommendations.migrationCleanup));
  lines.push("");
  lines.push("## 5) Environment Configuration Issues");
  lines.push("");
  lines.push(formatBulletList(result.findings.environmentIssues.map((item) => `${item.severity}: ${item.message}`)));
  lines.push("");
  lines.push("## 6) Final Proposed Clean Architecture");
  lines.push("");
  lines.push(formatBulletList(result.recommendations.targetArchitecture));
  lines.push("");
  lines.push("## Verification Commands");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run integrity:check");
  lines.push("npm run integrity:check:strict");
  lines.push("npm --prefix dashboard run test:e2e -- leads --reporter=line");
  lines.push("npm --prefix dashboard run test:e2e -- perf-load-smoke.spec.js --reporter=line");
  lines.push("npm --prefix dashboard run build");
  lines.push("```");
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This audit did not execute destructive SQL against production.");
  lines.push("- Candidate deletions require explicit approval and a rollback window.");
  lines.push("");

  return lines.join("\n");
}

function renderSqlPlan(result) {
  const lines = [];
  lines.push("-- Proposed DB cleanup plan");
  lines.push("-- Generated by scripts/audit_repo_db_simplification.mjs");
  lines.push("-- Non-destructive first: move candidates to archive schema.");
  lines.push("-- Execute in staging first, then production after approval.");
  lines.push("");
  lines.push("begin;");
  lines.push("create schema if not exists archive;");
  lines.push("");

  const tables = result.findings.highConfidenceLegacyCandidates.filter((item) => item.type === "table");
  const views = result.findings.highConfidenceLegacyCandidates.filter((item) => item.type === "view");
  const functions = result.findings.highConfidenceLegacyCandidates.filter((item) => item.type === "function");

  if (!tables.length && !views.length && !functions.length) {
    lines.push("-- No high-confidence legacy objects were identified.");
  } else {
    for (const table of tables) {
      lines.push(`alter table if exists public.${table.name} set schema archive;`);
    }
    for (const view of views) {
      lines.push(`alter view if exists public.${view.name} set schema archive;`);
    }
    for (const fn of functions) {
      lines.push(`alter function if exists public.${fn.signature} set schema archive;`);
    }
  }

  lines.push("");
  lines.push("-- Keep archived objects for at least 7 days while monitoring dashboards and sync jobs.");
  lines.push("-- After the quarantine window, run explicit drops only if no regressions were observed.");
  lines.push("");
  for (const table of tables) {
    lines.push(`-- drop table if exists archive.${table.name} cascade;`);
  }
  for (const view of views) {
    lines.push(`-- drop view if exists archive.${view.name} cascade;`);
  }
  for (const fn of functions) {
    lines.push(`-- drop function if exists archive.${fn.signature} cascade;`);
  }
  lines.push("");
  lines.push("commit;");
  lines.push("");

  return lines.join("\n");
}

async function queryDatabase(client) {
  const tableRows = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  `);
  const viewRows = await client.query(`
    select table_name
    from information_schema.views
    where table_schema = 'public'
    order by table_name
  `);
  const functionRows = await client.query(`
    select
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname, identity_args
  `);
  const policyRows = await client.query(`
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `);
  const indexRows = await client.query(`
    select tablename, indexname
    from pg_indexes
    where schemaname = 'public'
    order by tablename, indexname
  `);

  const migrationTableExists = await client.query(`
    select to_regclass('supabase_migrations.schema_migrations') is not null as exists
  `);

  let appliedVersions = [];
  if (migrationTableExists.rows?.[0]?.exists) {
    const appliedRows = await client.query(`
      select version::text
      from supabase_migrations.schema_migrations
      order by version::text
    `);
    appliedVersions = (appliedRows.rows || []).map((row) => String(row.version));
  }

  return {
    tables: (tableRows.rows || []).map((row) => normalizeIdentifier(row.table_name)),
    views: (viewRows.rows || []).map((row) => normalizeIdentifier(row.table_name)),
    functions: (functionRows.rows || []).map((row) => ({
      name: normalizeIdentifier(row.function_name),
      args: String(row.identity_args || ""),
      signature: `${normalizeIdentifier(row.function_name)}(${String(row.identity_args || "")})`,
    })),
    policies: (policyRows.rows || []).map((row) => ({
      table: normalizeIdentifier(row.tablename),
      policy: normalizeIdentifier(row.policyname),
    })),
    indexes: (indexRows.rows || []).map((row) => ({
      table: normalizeIdentifier(row.tablename),
      index: normalizeIdentifier(row.indexname),
    })),
    appliedVersions,
  };
}

function collectMigrationInventory(repoRoot) {
  const migrationsDir = path.join(repoRoot, "supabase", "migrations");
  const migrationFiles = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
    : [];

  const creates = {
    table: new Map(),
    view: new Map(),
    function: new Map(),
  };

  const policyTargets = [];
  const localVersions = [];

  for (const fileName of migrationFiles) {
    const absolutePath = path.join(migrationsDir, fileName);
    const content = readTextFileSafe(absolutePath);
    const parsed = extractCreateStatements(content);
    for (const table of parsed.tableNames) pushMapArray(creates.table, table, fileName);
    for (const view of parsed.viewNames) pushMapArray(creates.view, view, fileName);
    for (const fn of parsed.functionNames) pushMapArray(creates.function, fn, fileName);
    policyTargets.push(...parsed.policyTargets.map((policy) => ({ ...policy, file: fileName })));

    const versionMatch = fileName.match(/^(\d{8,})_/);
    if (versionMatch) localVersions.push(versionMatch[1]);
  }

  return {
    migrationFiles,
    localVersions: [...new Set(localVersions)].sort(),
    creates,
    policyTargets,
  };
}

function buildFindings({
  dbData,
  migrationInventory,
  referenceMaps,
  envIssues,
}) {
  const duplicateMigrationObjects = [];
  for (const [type, map] of Object.entries(migrationInventory.creates)) {
    for (const [name, files] of map.entries()) {
      if (files.length > 1) {
        duplicateMigrationObjects.push({ type, name, files: [...new Set(files)].sort() });
      }
    }
  }
  duplicateMigrationObjects.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));

  const highConfidenceLegacyCandidates = [];
  const potentiallyUnused = [];

  function classifyObject(type, name, signature = "") {
    const normalized = normalizeIdentifier(name);
    const migrationMap = migrationInventory.creates[type];
    const inMigrations = migrationMap?.has(normalized) || false;
    const refRecord = referenceMaps[type].get(normalized);
    const referencedInCode = (refRecord?.count || 0) > 0;
    const item = signature
      ? { type, name: normalized, signature, inMigrations, referencedInCode }
      : { type, name: normalized, inMigrations, referencedInCode };

    if (!inMigrations && !referencedInCode) {
      highConfidenceLegacyCandidates.push(item);
    } else if (inMigrations && !referencedInCode) {
      potentiallyUnused.push(item);
    }
  }

  for (const table of dbData.tables) classifyObject("table", table);
  for (const view of dbData.views) classifyObject("view", view);
  for (const fn of dbData.functions) classifyObject("function", fn.name, fn.signature);

  highConfidenceLegacyCandidates.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
  potentiallyUnused.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));

  const orphanPolicies = dbData.policies.filter((policy) => !dbData.tables.includes(policy.table));
  const orphanIndexes = dbData.indexes.filter((index) => !dbData.tables.includes(index.table));

  return {
    highConfidenceLegacyCandidates,
    potentiallyUnused,
    duplicateMigrationObjects,
    orphanPolicies,
    orphanIndexes,
    environmentIssues: envIssues,
  };
}

function evaluateEnvironmentIssues(repoRoot) {
  const issues = [];
  const rootEnvExample = path.join(repoRoot, ".env.example");
  const dashboardEnvExample = path.join(repoRoot, "dashboard", ".env.example");
  const readmePath = path.join(repoRoot, "README.md");
  const supabaseConfigPath = path.join(repoRoot, "supabase", "config.toml");
  const supabaseSeedPath = path.join(repoRoot, "supabase", "seed.sql");

  if (!fs.existsSync(rootEnvExample)) {
    issues.push({ severity: "blocking", message: "Missing root .env.example template." });
  }
  if (!fs.existsSync(dashboardEnvExample)) {
    issues.push({ severity: "blocking", message: "Missing dashboard/.env.example template." });
  }

  const readme = readTextFileSafe(readmePath);
  if (readme.includes("VITE_DASHBOARD_LOOKBACK_DAYS (`730`)")) {
    issues.push({
      severity: "warning",
      message: "README still documents 730-day lookback defaults, but code defaults are 365/120 in dashboard/src/lib/env.js.",
    });
  }

  const supabaseConfig = readTextFileSafe(supabaseConfigPath);
  const verifyJwtFalseMatches = supabaseConfig.match(/verify_jwt\s*=\s*false/gi) || [];
  if (verifyJwtFalseMatches.length > 0) {
    issues.push({
      severity: "warning",
      message: `${verifyJwtFalseMatches.length} edge functions have verify_jwt=false; validate each endpoint against explicit secret/header guards.`,
    });
  }
  if (/db\.seed[\s\S]*enabled\s*=\s*true/i.test(supabaseConfig) && !fs.existsSync(supabaseSeedPath)) {
    issues.push({
      severity: "warning",
      message: "supabase/config.toml enables db.seed but supabase/seed.sql is missing.",
    });
  }

  if (!issues.length) {
    issues.push({ severity: "info", message: "No environment issues were detected by static checks." });
  }

  return issues;
}

function parseProjectRefFromDbUrl(dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    const host = parsed.hostname || "";
    if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
      const parts = host.split(".");
      return parts.length >= 3 ? parts[1] : "";
    }
    if (host.endsWith(".pooler.supabase.com")) {
      const username = decodeURIComponent(parsed.username || "");
      const userParts = username.split(".");
      return userParts.length >= 2 ? userParts[userParts.length - 1] : "";
    }
    return "";
  } catch (_error) {
    return "";
  }
}

function buildRecommendations(result) {
  const schemaSimplification = [
    "Promote `raw_hubspot_contacts`, `raw_hubspot_meeting_activities`, `hubspot_activity_contact_associations`, and `raw_fb_ads_insights_daily` as the only core KPI ingest tables.",
    "Move high-confidence legacy objects to `archive` schema first; avoid immediate drops.",
    "Keep qualification logic in one canonical module (`dashboard/src/lib/leadsQualificationRules.js`) and reference it from all KPI snapshots.",
    "Publish a single `north_star_kpi_snapshot` contract document and reject undocumented metric formulas.",
  ];

  if (result.findings.duplicateMigrationObjects.length > 0) {
    schemaSimplification.push("Consolidate duplicate object-creation migrations into one canonical migration per object.");
  }

  const migrationCleanup = [
    "Create a consolidation migration that supersedes duplicate object definitions and marks legacy files as archived (do not delete applied history).",
    "Apply missing local migrations in staging, run integrity checks, then apply to production after PASS.",
    "Add CI check to fail when local migration versions diverge from expected production snapshot.",
  ];

  if (result.migrations.pendingLocalNotApplied.length > 0) {
    migrationCleanup.push(
      `Pending local migrations not applied remotely: ${result.migrations.pendingLocalNotApplied.join(", ")}.`,
    );
  }
  if (result.migrations.appliedNotInRepo.length > 0) {
    migrationCleanup.push(
      `Applied remote migration versions missing in repo history: ${result.migrations.appliedNotInRepo.join(", ")}.`,
    );
  }

  const targetArchitecture = [
    "Layer 1 (Ingest): HubSpot/Meta raw tables with source IDs + sync timestamps + idempotency keys.",
    "Layer 2 (Canonical): deterministic SQL views/materialized views for leads, attendance, and spend.",
    "Layer 3 (Contract): dashboard reads from versioned KPI snapshot helpers with explicit date-window and timezone policy.",
    "Layer 4 (Integrity): scheduled reconciliation (`npm run integrity:check:strict`) with alerts on mismatch or stale sync.",
    "Environment split: separate secrets and project refs for local/staging/prod; no shared production credentials in local files.",
  ];

  return {
    schemaSimplification,
    migrationCleanup,
    targetArchitecture,
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const dbUrl = mustGetDbUrl();

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const headRes = await client.query("select current_database() as db_name");

    const dbProjectRef = parseProjectRefFromDbUrl(dbUrl);

    const dbData = await queryDatabase(client);
    const migrationInventory = collectMigrationInventory(repoRoot);
    const referenceFiles = collectReferenceFiles(repoRoot);

    const referenceMaps = {
      table: collectObjectReferences(dbData.tables, referenceFiles, repoRoot),
      view: collectObjectReferences(dbData.views, referenceFiles, repoRoot),
      function: collectObjectReferences(dbData.functions.map((fn) => fn.name), referenceFiles, repoRoot),
    };

    const pendingLocalNotApplied = migrationInventory.localVersions
      .filter((version) => !dbData.appliedVersions.includes(version))
      .sort();
    const appliedNotInRepo = dbData.appliedVersions
      .filter((version) => !migrationInventory.localVersions.includes(version))
      .sort();

    const envIssues = evaluateEnvironmentIssues(repoRoot);
    const findings = buildFindings({
      dbData,
      migrationInventory,
      referenceMaps,
      envIssues,
    });

    const gitHead = gitRevParse("HEAD");
    const gitOriginMain = gitRevParse("origin/main");
    const recommendations = buildRecommendations({
      findings,
      migrations: {
        pendingLocalNotApplied,
        appliedNotInRepo,
      },
    });

    const result = {
      generatedAt: new Date().toISOString(),
      git: {
        head: process.env.GIT_HEAD || gitHead,
        originMain: process.env.GIT_ORIGIN_MAIN || gitOriginMain,
      },
      db: {
        projectRef: dbProjectRef,
        database: headRes.rows?.[0]?.db_name || "",
        tables: dbData.tables,
        views: dbData.views,
        functions: dbData.functions,
        policies: dbData.policies,
        indexes: dbData.indexes,
      },
      migrations: {
        files: migrationInventory.migrationFiles,
        localVersions: migrationInventory.localVersions,
        appliedVersions: dbData.appliedVersions,
        pendingLocalNotApplied,
        appliedNotInRepo,
        creates: {
          table: mapToSortedObject(migrationInventory.creates.table),
          view: mapToSortedObject(migrationInventory.creates.view),
          function: mapToSortedObject(migrationInventory.creates.function),
        },
      },
      references: {
        filesScanned: referenceFiles.map((file) => path.relative(repoRoot, file).replace(/\\/g, "/")).sort(),
        tables: Object.fromEntries([...referenceMaps.table.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
        views: Object.fromEntries([...referenceMaps.view.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
        functions: Object.fromEntries([...referenceMaps.function.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      },
      findings,
      recommendations,
      paths: {
        reportPath: options.reportPath,
        jsonPath: options.jsonPath,
        sqlPlanPath: options.sqlPlanPath,
      },
    };

    const reportPath = path.resolve(repoRoot, options.reportPath);
    const sqlPlanPath = path.resolve(repoRoot, options.sqlPlanPath);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.mkdirSync(path.dirname(sqlPlanPath), { recursive: true });
    fs.writeFileSync(reportPath, renderMarkdown(result), "utf8");
    fs.writeFileSync(sqlPlanPath, renderSqlPlan(result), "utf8");

    if (options.jsonPath) {
      const jsonPath = path.resolve(repoRoot, options.jsonPath);
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      report_path: options.reportPath,
      json_path: options.jsonPath || null,
      sql_plan_path: options.sqlPlanPath,
      high_confidence_legacy_candidates: result.findings.highConfidenceLegacyCandidates.length,
      potentially_unused_objects: result.findings.potentiallyUnused.length,
      duplicate_migration_objects: result.findings.duplicateMigrationObjects.length,
      pending_local_migrations: result.migrations.pendingLocalNotApplied.length,
      applied_missing_in_repo: result.migrations.appliedNotInRepo.length,
    }, null, 2));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({
    error: error?.message || String(error),
  }, null, 2));
  process.exitCode = 1;
});
