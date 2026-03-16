#!/usr/bin/env node
/**
 * fix-robots-v2.mjs — Update the robots.txt Code Snippet to use
 * remove_all_filters approach for a clean, single-block output.
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

// PHP code: clear ALL robots_txt filters after plugins load, add ours as the only one
const phpCode = `// Clear all robots_txt filters after all plugins load, then register ours
add_action('init', function() {
    remove_all_filters('robots_txt');
    add_filter('robots_txt', function() {
        $r  = "# robots.txt - Sober Founders (soberfounders.org)\\n";
        $r .= "# Managed via Code Snippets\\n\\n";
        $r .= "User-agent: *\\nDisallow:\\n\\n";
        $r .= "Sitemap: https://www.soberfounders.org/sitemap_index.xml\\n\\n";
        $r .= "# AI Search Bot Access Policy\\n";
        $r .= "# We ALLOW AI search engines so founders find us via AI tools.\\n\\n";
        $r .= "User-agent: GPTBot\\nAllow: /\\n\\n";
        $r .= "User-agent: ChatGPT-User\\nAllow: /\\n\\n";
        $r .= "User-agent: PerplexityBot\\nAllow: /\\n\\n";
        $r .= "User-agent: ClaudeBot\\nAllow: /\\n\\n";
        $r .= "User-agent: anthropic-ai\\nAllow: /\\n\\n";
        $r .= "User-agent: Google-Extended\\nAllow: /\\n\\n";
        $r .= "User-agent: Bingbot\\nAllow: /\\n\\n";
        $r .= "# Block training-only crawlers (no search citation value)\\n";
        $r .= "User-agent: CCBot\\nDisallow: /\\n";
        return $r;
    }, 0, 2);
}, 999);`;

async function main() {
  // Update snippet #12
  console.log("Updating snippet #12 with remove_all_filters approach...");
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/12`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ code: phpCode, active: true }),
  });
  const data = await res.json();
  console.log(`Active: ${data.active} | Error: ${data.code_error || "none"}`);

  if (data.code_error) {
    console.log("Code error detected, aborting.");
    return;
  }

  // Verify
  console.log("\nVerifying robots.txt...\n");
  const robotsRes = await fetch(`${SITE}/robots.txt`);
  const txt = await robotsRes.text();
  const sitemapCount = (txt.match(/Sitemap:/g) || []).length;
  const hasHttp = txt.includes("http://soberfounders");
  console.log(txt);
  console.log(`\nSitemap count: ${sitemapCount} | HTTP leak: ${hasHttp}`);
  console.log(sitemapCount === 1 && !hasHttp ? "PASS" : "NEEDS ATTENTION");
}

main().catch(console.error);
