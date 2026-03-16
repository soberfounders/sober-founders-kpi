#!/usr/bin/env node
/**
 * deploy-events-block1.mjs — Push "Atomic Answer" GEO block to /events page
 *
 * Usage:
 *   node scripts/deploy-events-block1.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function loadEnv() {
  // Try .env.local first, fall back to .env
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

// ---------------------------------------------------------------------------
// WP REST helpers
// ---------------------------------------------------------------------------
async function wpFetch(endpoint, options = {}) {
  const url = `${SITE}/wp-json/wp/v2${endpoint}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

async function findPageBySlug(slug) {
  const pages = await wpFetch(`/pages?slug=${slug}`);
  return pages[0] || null;
}

// ---------------------------------------------------------------------------
// Block 1: Atomic Answer (GEO)
// ---------------------------------------------------------------------------
const BLOCK_1_HTML = `<!-- wp:html -->
<!-- SF Events Block 1: Atomic Answer (GEO) — deployed by deploy-events-block1.mjs -->
<div class="sf-events-geo-block" style="max-width: 760px; margin: 2em auto; font-family: inherit; line-height: 1.7;">

<h2 style="font-size: 1.4em; margin-bottom: 0.5em;">Three Ways to Get Involved</h2>

<p><strong>Thursday Mastermind</strong> — Free and open to all sober entrepreneurs. No revenue minimum, no interview. Sign up below &darr;</p>

<p><strong><a href="/apply/">Tuesday "All Our Affairs"</a></strong> — For founders with $250K+ revenue, 2+ full-time employees, 1+ year sober, and actively working the 12 steps. Requires a short verification interview. Thursday members are always welcome too. <a href="/apply/">Apply here &rarr;</a></p>

<p><strong><a href="/phoenix-forum-2nd-group/">Phoenix Forum</a></strong> — A paid monthly membership for $1M+ revenue founders with 1+ year sober. A separate, exclusive peer group focused on legacy and leadership. <a href="/phoenix-forum-2nd-group/">Learn more &rarr;</a></p>

</div>
<!-- /wp:html -->`;

const MARKER = "sf-events-geo-block";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Events Page — Block 1 (Atomic Answer) Deployment");
  console.log(`  Target: ${SITE}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  // Find events page
  const eventsPage = await findPageBySlug("events");
  if (!eventsPage) {
    throw new Error("Could not find /events/ page. Check that the slug is 'events'.");
  }
  console.log(`  Found /events/ page (ID ${eventsPage.id})`);

  // Get raw content (preserves Gutenberg blocks)
  const full = await wpFetch(`/pages/${eventsPage.id}?context=edit`);
  const currentContent = full.content?.raw || "";

  // Strip any existing Block 1
  let cleaned = currentContent;
  if (cleaned.includes(MARKER)) {
    console.log("  Removing existing Block 1...");
    cleaned = cleaned.replace(
      /<!-- wp:html -->\s*<!-- SF Events Block 1:.*?<!-- \/wp:html -->\s*/s,
      ""
    ).trim();
  }

  // Insert AFTER the first hero container (the full-width image banner)
  // The hero is the first <!-- wp:uagb/container --> ... <!-- /wp:uagb/container --> block
  const heroEndTag = "<!-- /wp:uagb/container -->";
  const heroEndIdx = cleaned.indexOf(heroEndTag);
  if (heroEndIdx === -1) {
    throw new Error("Could not find hero banner end tag. Page structure may have changed.");
  }
  const insertAt = heroEndIdx + heroEndTag.length;
  const newContent = cleaned.slice(0, insertAt) + "\n\n" + BLOCK_1_HTML + "\n\n" + cleaned.slice(insertAt);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would insert Block 1 after hero banner.");
    return;
  }
  await wpFetch(`/pages/${eventsPage.id}`, {
    method: "POST",
    body: JSON.stringify({ content: newContent }),
  });

  console.log("  Block 1 deployed successfully.");
  console.log(`\n  Check it live: ${SITE}/events/\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
