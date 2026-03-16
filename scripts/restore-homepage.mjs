#!/usr/bin/env node
/**
 * restore-homepage.mjs — Restore homepage from revision with full Gutenberg block markup
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
const headers = { "Content-Type": "application/json", Authorization: `Basic ${AUTH}` };

const PAGE_ID = 1989;
const REVISION_ID = 4055; // Feb 26 — last revision with full Gutenberg block markup

async function main() {
  console.log(`Fetching revision ${REVISION_ID} with raw block markup...`);

  const revRes = await fetch(`${SITE}/wp-json/wp/v2/pages/${PAGE_ID}/revisions/${REVISION_ID}?context=edit&_fields=content`, { headers });
  const rev = await revRes.json();
  const rawContent = rev.content?.raw || "";

  console.log(`  Raw content length: ${rawContent.length}`);
  console.log(`  Has Gutenberg blocks: ${rawContent.includes("<!-- wp:uagb")}`);

  if (!rawContent.includes("<!-- wp:uagb")) {
    throw new Error("Revision does not contain Gutenberg block markup. Aborting.");
  }

  console.log("Restoring homepage...");
  const res = await fetch(`${SITE}/wp-json/wp/v2/pages/${PAGE_ID}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: rawContent }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status}: ${body.substring(0, 300)}`);
  }

  const result = await res.json();
  console.log(`\n  ✓ Restored from revision ${REVISION_ID} (Feb 26)`);
  console.log(`  ✓ Page: ${result.id} ${result.link}`);

  // Verify
  const check = await fetch(`${SITE}/wp-json/wp/v2/pages/${PAGE_ID}?context=edit&_fields=content`, { headers }).then(r => r.json());
  const checkRaw = check.content?.raw || "";
  console.log(`\n  Verification:`);
  console.log(`  - Raw length: ${checkRaw.length}`);
  console.log(`  - Has Gutenberg blocks: ${checkRaw.includes("<!-- wp:uagb")}`);
  console.log(`  - Has hero section: ${checkRaw.includes("Join Our Free Sober Entrepreneur Community")}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
