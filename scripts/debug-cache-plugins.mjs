#!/usr/bin/env node
/**
 * debug-cache-plugins.mjs — Identify caching plugins and purge all caches
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

async function runSnippet(name, code) {
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, code, scope: "global", priority: 1, active: true }),
  });
  const snippet = await res.json();
  console.log(`  Snippet ${snippet.id}: ${name}`);
  await new Promise((r) => setTimeout(r, 3000));
  await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${snippet.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ active: false }),
  });
  return snippet.id;
}

async function main() {
  // Step 1: Identify plugins and write result to a known post's excerpt
  console.log("Step 1: Identifying active plugins...");
  await runSnippet("SF Debug Plugins (one-time)", `
$active = get_option('active_plugins', []);
$names = [];
foreach ($active as $p) {
  $data = get_plugin_data(WP_PLUGIN_DIR . '/' . $p, false, false);
  $names[] = $data['Name'] ?: $p;
}
$excerpt = implode(' | ', $names);
wp_update_post(['ID' => 2401, 'post_excerpt' => $excerpt]);
`);

  // Read the excerpt back
  const pageRes = await fetch(`${SITE}/wp-json/wp/v2/pages/2401?_fields=excerpt`, { headers });
  const page = await pageRes.json();
  const plugins = page.excerpt?.rendered?.replace(/<[^>]+>/g, "").trim();
  console.log("\nActive plugins:");
  for (const p of plugins.split(" | ")) {
    console.log(`  - ${p}`);
  }

  // Step 2: Comprehensive cache purge
  console.log("\nStep 2: Purging all caches...");
  await runSnippet("SF Purge All Caches (one-time)", `
// Object cache
wp_cache_flush();

// SG Optimizer (SiteGround)
if (function_exists('sg_cachepress_purge_everything')) {
  sg_cachepress_purge_everything();
}

// WP Rocket
if (function_exists('rocket_clean_domain')) {
  rocket_clean_domain();
}

// LiteSpeed Cache
if (class_exists('LiteSpeed\\\\Purge')) {
  do_action('litespeed_purge_all');
}

// W3 Total Cache
if (function_exists('w3tc_flush_all')) {
  w3tc_flush_all();
}

// WP Super Cache
if (function_exists('wp_cache_clear_cache')) {
  wp_cache_clear_cache();
}

// Breeze
if (class_exists('Breeze_PurgeCache')) {
  Breeze_PurgeCache::breeze_cache_flush();
}

// WP Fastest Cache
if (isset($GLOBALS['wp_fastest_cache']) && method_exists($GLOBALS['wp_fastest_cache'], 'deleteCache')) {
  $GLOBALS['wp_fastest_cache']->deleteCache(true);
}

// Elementor
if (did_action('elementor/loaded')) {
  \\\\Elementor\\\\Plugin::instance()->files_manager->clear_cache();
}

// Clear transients
global $wpdb;
$wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_%'");
$wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_site_transient_%'");

// OPcache
if (function_exists('opcache_reset')) {
  opcache_reset();
}

// Restore the excerpt
wp_update_post(['ID' => 2401, 'post_excerpt' => '']);
`);

  // Step 3: Verify
  console.log("\nStep 3: Checking live page...");
  await new Promise((r) => setTimeout(r, 3000));
  const liveRes = await fetch(`${SITE}/events/?v=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    redirect: "follow",
  });
  const html = await liveRes.text();
  console.log("  Response status:", liveRes.status);
  console.log("  Has sf-frost:", html.includes("sf-frost"));
  console.log("  Has sf-scroll-canvas:", html.includes("sf-scroll-canvas"));
  console.log("  Has GSAP:", html.includes("gsap"));
  console.log("  Has 0a0a0a:", html.includes("0a0a0a"));
  console.log("  Page length:", html.length);

  // Check response headers for cache info
  console.log("\n  Cache headers:");
  for (const [k, v] of liveRes.headers) {
    if (k.toLowerCase().includes("cache") || k.toLowerCase().includes("x-") || k.toLowerCase() === "cf-ray" || k.toLowerCase() === "server") {
      console.log(`    ${k}: ${v}`);
    }
  }
}

main().catch(console.error);
