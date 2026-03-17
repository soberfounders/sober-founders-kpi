#!/usr/bin/env node
/**
 * deploy-snippet-seo-rest.mjs — Deploy sober-seo-rest as a Code Snippet
 *
 * Replaces the standalone plugin with a Code Snippet for easier management.
 * Installs via the Code Snippets REST API — no manual plugin upload needed.
 *
 * Usage:
 *   node scripts/deploy-snippet-seo-rest.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  let envPath = resolve(ROOT, ".env.local");
  try { readFileSync(envPath, "utf8"); } catch { envPath = resolve(ROOT, ".env"); }
  const lines = readFileSync(envPath, "utf8").replace(/\r/g, "").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };
const DRY_RUN = process.argv.includes("--dry-run");

// Read the PHP plugin source and strip the <?php tag + plugin header
const pluginPath = resolve(__dirname, "wp-plugins/sober-seo-rest/sober-seo-rest.php");
let phpCode = readFileSync(pluginPath, "utf8");

// Remove opening <?php tag
phpCode = phpCode.replace(/^<\?php\s*/, "");

// Remove plugin header comment block
phpCode = phpCode.replace(/\/\*\*[\s\S]*?\*\/\s*/, "");

// Remove the ABSPATH guard (not needed in Code Snippets)
phpCode = phpCode.replace(/if\s*\(\s*!\s*defined\s*\(\s*'ABSPATH'\s*\)\s*\)\s*\{\s*exit;\s*\}\s*/, "");

// Add a version comment at the top
phpCode = "// Sober SEO REST v1.3.0 — SEO endpoints, redirects, and footer injection\n// Deployed as Code Snippet (replaces standalone plugin)\n\n" + phpCode.trim();

const SNIPPET_NAME = "Sober SEO REST — SEO Endpoints, Redirects, Footer Injection (v1.3.0)";

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Sober SEO REST — Code Snippet Deployment");
  console.log(`  Target: ${SITE}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`  PHP code length: ${phpCode.length} chars`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would create/update Code Snippet with sober-seo-rest functionality.");
    console.log("  First 200 chars of PHP:\n");
    console.log("  " + phpCode.substring(0, 200).replace(/\n/g, "\n  "));
    return;
  }

  // List existing snippets to check for updates
  const listRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, { headers });
  if (!listRes.ok) {
    throw new Error(`Failed to list snippets: ${listRes.status} ${listRes.statusText}`);
  }
  const snippets = await listRes.json();

  let existingId = null;
  for (const s of snippets) {
    if (s.name && s.name.includes("Sober SEO REST")) {
      existingId = s.id;
      console.log(`  Found existing snippet #${existingId}: "${s.name}"`);
      break;
    }
  }

  let data;
  if (existingId) {
    console.log(`  Updating snippet #${existingId}...`);
    const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${existingId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: SNIPPET_NAME, code: phpCode, active: true }),
    });
    data = await res.json();
    console.log(`  ✓ Updated | Active: ${data.active} | Error: ${data.code_error || "none"}`);
  } else {
    console.log("  Creating new snippet...");
    const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: SNIPPET_NAME,
        desc: "Replaces the sober-seo-rest plugin. REST endpoints for Yoast SEO meta, 301 redirects, and site-wide footer injection via astra_footer_before.",
        code: phpCode,
        active: true,
        scope: "global",
        priority: 10,
      }),
    });
    data = await res.json();
    console.log(`  ✓ Created snippet #${data.id} | Active: ${data.active} | Error: ${data.code_error || "none"}`);
  }

  // Verify endpoints are live
  console.log("\n  Verifying REST endpoints...");

  const checks = [
    { name: "SEO read", url: `${SITE}/wp-json/sober/v1/seo/1989` },
    { name: "Redirects", url: `${SITE}/wp-json/sober/v1/redirects` },
    { name: "Footer read", url: `${SITE}/wp-json/sober/v1/footer` },
  ];

  for (const check of checks) {
    try {
      const res = await fetch(check.url, { headers });
      const status = res.status;
      console.log(`  ${status < 400 ? "✓" : "✗"} ${check.name}: ${status}`);
    } catch (e) {
      console.log(`  ✗ ${check.name}: ${e.message}`);
    }
  }

  console.log("\n  Done.\n");
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
