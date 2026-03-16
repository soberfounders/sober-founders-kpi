#!/usr/bin/env node
/**
 * delete-junk-pages.mjs — Trash /sample-page/ and /elementor-3440/
 * These are WordPress default and orphan test pages wasting crawl budget.
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
const SITE = env.WP_SITE_URL;
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };

const JUNK_SLUGS = ["sample-page", "elementor-3440"];

async function main() {
  for (const slug of JUNK_SLUGS) {
    console.log(`\nLooking for /${slug}/...`);

    // Search published AND draft pages
    const res = await fetch(
      `${SITE}/wp-json/wp/v2/pages?slug=${slug}&status=publish,draft,private&per_page=5`,
      { headers }
    );
    const pages = await res.json();

    if (!pages.length) {
      console.log(`  Not found — may already be deleted.`);
      continue;
    }

    for (const page of pages) {
      console.log(`  Found page ID ${page.id}: "${page.title?.rendered}" (status: ${page.status})`);

      // Trash the page
      const delRes = await fetch(`${SITE}/wp-json/wp/v2/pages/${page.id}`, {
        method: "DELETE",
        headers,
      });
      const deleted = await delRes.json();
      console.log(`  Trashed: ${deleted.status === "trash" ? "YES" : "NO"} (status: ${deleted.status})`);
    }
  }

  console.log("\nDone. Junk pages trashed.");
}

main().catch(console.error);
