#!/usr/bin/env node
/**
 * flush-cache-events.mjs — Flush all caches for the /events/ page
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

async function main() {
  // 1. Run a snippet that flushes all WordPress caches
  const snippetCode = `
// Flush object cache
wp_cache_flush();

// Clear transients
global $wpdb;
$wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '%_transient_%'");

// Flush rewrite rules
flush_rewrite_rules();

// Clear WP Super Cache if present
if (function_exists('wp_cache_clear_cache')) { wp_cache_clear_cache(); }

// Clear W3 Total Cache if present
if (function_exists('w3tc_flush_all')) { w3tc_flush_all(); }

// Clear WP Fastest Cache if present
if (function_exists('wpfc_clear_all_cache')) { wpfc_clear_all_cache(); }

// Clear LiteSpeed Cache if present
if (class_exists('LiteSpeed_Cache_API')) { LiteSpeed_Cache_API::purge_all(); }
if (has_action('litespeed_purge_all')) { do_action('litespeed_purge_all'); }

// Clear SG Optimizer / SiteGround cache if present
if (function_exists('sg_cachepress_purge_cache')) { sg_cachepress_purge_cache(); }

// Clear Breeze cache if present
if (class_exists('Breeze_PurgeCache')) { Breeze_PurgeCache::breeze_cache_flush(); }

// Clear Elementor CSS cache
if (class_exists('\\\\Elementor\\\\Plugin')) {
  \\\\Elementor\\\\Plugin::instance()->files_manager->clear_cache();
}

// OPcache
if (function_exists('opcache_reset')) { opcache_reset(); }
`;

  console.log("Creating cache-flush snippet...");
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "SF Flush All Caches (one-time)",
      code: snippetCode,
      scope: "global",
      priority: 1,
      active: true,
    }),
  });
  const snippet = await res.json();
  console.log("Created snippet:", snippet.id, "Active:", snippet.active);

  await new Promise((r) => setTimeout(r, 3000));

  // Deactivate
  await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${snippet.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ active: false }),
  });
  console.log("Deactivated snippet", snippet.id);

  // 2. Touch the page with a trivial update to bust cache
  console.log("Touching page to bust cache...");
  const touchRes = await fetch(`${SITE}/wp-json/wp/v2/pages/2401`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      date: new Date().toISOString(),
    }),
  });
  console.log("Touch response:", touchRes.status);

  // 3. Fetch the live page and check
  await new Promise((r) => setTimeout(r, 2000));

  const liveRes = await fetch(`${SITE}/events/`, {
    headers: {
      "Cache-Control": "no-cache, no-store",
      "Pragma": "no-cache",
    },
  });
  const html = await liveRes.text();
  console.log("\nLive page check:");
  console.log("  Has sf-scroll-canvas:", html.includes("sf-scroll-canvas"));
  console.log("  Has GSAP:", html.includes("gsap"));
  console.log("  Has Lenis:", html.includes("lenis"));
  console.log("  Has frame_:", html.includes("frame_"));
  console.log("  Has elementor-element:", html.includes("elementor-element"));
  console.log("  Has #0a0a0a:", html.includes("0a0a0a"));
  console.log("  Page length:", html.length);

  // Show a snippet around the body tag
  const bodyIdx = html.indexOf("<body");
  if (bodyIdx > -1) {
    console.log("\n  Body tag:", html.substring(bodyIdx, bodyIdx + 200));
  }
}

main().catch(console.error);
