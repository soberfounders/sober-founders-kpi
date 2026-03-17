#!/usr/bin/env node
/**
 * deploy-homepage-v2.mjs — Deploy the cinematic scroll homepage to soberfounders.org/
 *
 * Takes the same content from deploy-website-test.mjs and pushes it to the
 * actual homepage (page ID 1989) with Elementor Canvas template.
 *
 * Usage:
 *   node scripts/deploy-homepage-v2.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  let envPath = resolve(ROOT, ".env.local");
  try {
    readFileSync(envPath, "utf8");
  } catch {
    envPath = resolve(ROOT, ".env");
  }
  const lines = readFileSync(envPath, "utf8").replace(/\r/g, "").split("\n");
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const DRY_RUN = process.argv.includes("--dry-run");

const headers = {
  "Content-Type": "application/json",
  Authorization: `Basic ${AUTH}`,
};

// Extract PAGE_CONTENT from deploy-website-test.mjs
const testScript = readFileSync(resolve(__dirname, "deploy-website-test.mjs"), "utf8");
const contentMatch = testScript.match(/const PAGE_CONTENT = `([\s\S]*?)`;\s*\n\s*\/\//);
if (!contentMatch) {
  console.error("ERROR: Could not extract PAGE_CONTENT from deploy-website-test.mjs");
  process.exit(1);
}
// Unescape template literal escapes:
// - <\/script> → </script>  (JS string escape to avoid parser issues)
// - \uXXXX → actual Unicode char (JS unicode escapes)
const PAGE_CONTENT = contentMatch[1]
  .replace(/<\\\/script>/g, "</script>")
  .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const PAGE_ID = 1989; // WordPress homepage

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Homepage Deploy — Cinematic Scroll Design");
  console.log(`  Target: ${SITE}/ (page ID ${PAGE_ID})`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);
  console.log(`  Content length: ${PAGE_CONTENT.length} chars`);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would replace homepage with cinematic scroll design.");
    return;
  }

  const url = `${SITE}/wp-json/wp/v2/pages/${PAGE_ID}`;
  const body = {
    title: "Sober Founders — Sobriety Is a Competitive Advantage",
    content: PAGE_CONTENT,
    template: "elementor_canvas",
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`WP API ${res.status} ${res.statusText}: ${errBody}`);
  }

  const result = await res.json();
  console.log(`  ✓ Homepage updated successfully (ID ${result.id})`);
  console.log(`  ✓ Live: ${result.link}\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
