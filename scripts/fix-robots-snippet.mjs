#!/usr/bin/env node
/**
 * Fix robots.txt snippet to also remove the duplicate Yoast block.
 * The filter now strips any existing Yoast output first, then writes our own.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLines = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8").split("\n");
const env = {};
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)\s*[=\-]\s*(.+)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SITE = env.WP_SITE_URL;
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };

// Updated PHP code: completely replaces $output (ignores whatever Yoast passed in)
const phpCode = [
  "// Override robots.txt completely — replaces Yoast output",
  "add_filter('robots_txt', function($output, $public) {",
  '    // Ignore $output entirely to prevent duplicate Yoast block',
  '    $custom  = "User-agent: *\\nDisallow:\\n\\n";',
  '    $custom .= "Sitemap: https://www.soberfounders.org/sitemap_index.xml\\n\\n";',
  '    $custom .= "# AI Search Bot Access Policy — Sober Founders\\n\\n";',
  '    $custom .= "User-agent: GPTBot\\nAllow: /\\n\\n";',
  '    $custom .= "User-agent: ChatGPT-User\\nAllow: /\\n\\n";',
  '    $custom .= "User-agent: PerplexityBot\\nAllow: /\\n\\n";',
  '    $custom .= "User-agent: ClaudeBot\\nAllow: /\\n\\n";',
  '    $custom .= "User-agent: anthropic-ai\\nAllow: /\\n\\n";',
  '    $custom .= "User-agent: Google-Extended\\nAllow: /\\n\\n";',
  '    $custom .= "User-agent: Bingbot\\nAllow: /\\n\\n";',
  '    $custom .= "# Block training-only crawlers\\n";',
  '    $custom .= "User-agent: CCBot\\nDisallow: /\\n";',
  "    return $custom;",
  "}, 99999, 2);",
].join("\n");

async function main() {
  // Update existing snippet #6
  console.log("Updating snippet #6 with fix...");
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/6`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ code: phpCode, active: true }),
  });
  const data = await res.json();
  console.log("Active:", data.active, "| Error:", data.code_error || "none");

  // Verify
  console.log("\nVerifying robots.txt...");
  const robots = await fetch(`${SITE}/robots.txt?cb=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
  }).then(r => r.text());
  console.log(robots);

  // Check for duplicate Yoast blocks
  const yoastCount = (robots.match(/Sitemap:/g) || []).length;
  console.log(`\nSitemap declarations: ${yoastCount}`);
  console.log(yoastCount === 1 ? "PASS — no duplicate" : "FAIL — still duplicated");
}

main().catch(console.error);
