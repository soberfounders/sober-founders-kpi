#!/usr/bin/env node
/**
 * deploy-demo-dashboard.mjs — Create/update a demo dashboard page on WordPress
 *
 * Usage:
 *   node scripts/deploy-demo-dashboard.mjs [--dry-run]
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

// Read the static demo HTML and extract the body content for WordPress
const demoHtml = readFileSync(resolve(ROOT, "dashboard/public/demo.html"), "utf8");

// Extract the <style> block and body content
const styleMatch = demoHtml.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = demoHtml.match(/<body>([\s\S]*?)<\/body>/);
const fontLink = '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />';

const PAGE_CONTENT = `<!-- wp:html -->
<!-- SF Demo Dashboard — deployed by deploy-demo-dashboard.mjs -->
${fontLink}
<style>
/* Reset WP theme interference for this page */
.sf-demo-wrap, .sf-demo-wrap * { box-sizing: border-box; }
.sf-demo-wrap { all: initial; font-family: 'Outfit','Inter',sans-serif; display: block; }
.sf-demo-wrap h1, .sf-demo-wrap h2, .sf-demo-wrap h3, .sf-demo-wrap h4 {
  font-family: 'DM Serif Display', serif; font-weight: normal; letter-spacing: .02em;
  margin: 0; padding: 0; border: none; line-height: 1.3;
}
.sf-demo-wrap table { border: none; }
.sf-demo-wrap th, .sf-demo-wrap td { border: none; }
${styleMatch ? styleMatch[1] : ''}
</style>
<div class="sf-demo-wrap">
${bodyMatch ? bodyMatch[1] : ''}
</div>
<!-- /wp:html -->`;

const PAGE_SLUG = "demo-dashboard";
const PAGE_TITLE = "KPI Dashboard Demo";

async function findExistingPage() {
  const res = await fetch(`${SITE}/wp-json/wp/v2/pages?slug=${PAGE_SLUG}&status=any`, { headers });
  if (!res.ok) return null;
  const pages = await res.json();
  return pages.length > 0 ? pages[0] : null;
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("  Demo Dashboard — WordPress Deploy");
  console.log(`  Target: ${SITE}/${PAGE_SLUG}/`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`  Content length: ${PAGE_CONTENT.length} chars`);
  console.log("=".repeat(60) + "\n");

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would create/update page with demo dashboard content.");
    return;
  }

  const existing = await findExistingPage();

  if (existing) {
    console.log(`  Found existing page (ID ${existing.id}), updating...`);
    const res = await fetch(`${SITE}/wp-json/wp/v2/pages/${existing.id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: PAGE_CONTENT,
        status: "publish",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WP API ${res.status}: ${body}`);
    }
    const result = await res.json();
    console.log(`  Page updated (ID ${result.id})`);
    console.log(`  Live: ${result.link}\n`);
  } else {
    console.log("  No existing page found, creating new...");
    const res = await fetch(`${SITE}/wp-json/wp/v2/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: PAGE_TITLE,
        slug: PAGE_SLUG,
        content: PAGE_CONTENT,
        status: "publish",
        template: "",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WP API ${res.status}: ${body}`);
    }
    const result = await res.json();
    console.log(`  Page created (ID ${result.id})`);
    console.log(`  Live: ${result.link}\n`);
  }
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
