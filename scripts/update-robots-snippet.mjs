#!/usr/bin/env node
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

// PHP code with priority 999 to override Yoast
const phpCode = [
  "add_filter('robots_txt', function($output, $public) {",
  '    $output  = "# START YOAST BLOCK\\n";',
  '    $output .= "User-agent: *\\nDisallow:\\n\\n";',
  '    $output .= "Sitemap: https://www.soberfounders.org/sitemap_index.xml\\n";',
  '    $output .= "# END YOAST BLOCK\\n\\n";',
  '    $output .= "# AI Search Bot Access Policy — Sober Founders\\n";',
  '    $output .= "# We ALLOW AI search engines so founders find us via AI tools.\\n\\n";',
  '    $output .= "User-agent: GPTBot\\nAllow: /\\n\\n";',
  '    $output .= "User-agent: ChatGPT-User\\nAllow: /\\n\\n";',
  '    $output .= "User-agent: PerplexityBot\\nAllow: /\\n\\n";',
  '    $output .= "User-agent: ClaudeBot\\nAllow: /\\n\\n";',
  '    $output .= "User-agent: anthropic-ai\\nAllow: /\\n\\n";',
  '    $output .= "User-agent: Google-Extended\\nAllow: /\\n\\n";',
  '    $output .= "User-agent: Bingbot\\nAllow: /\\n\\n";',
  '    $output .= "# Block training-only crawlers (no search citation value)\\n";',
  '    $output .= "User-agent: CCBot\\nDisallow: /\\n";',
  "    return $output;",
  "}, 999, 2);",
].join("\n");

async function main() {
  // Update snippet #6 with higher priority
  console.log("Updating snippet #6 with priority 999...");
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/6`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ code: phpCode, active: true, priority: 1 }),
  });
  const data = await res.json();
  console.log("Active:", data.active, "| Error:", data.code_error || "none");

  // Activate if not active
  if (!data.active) {
    console.log("Activating...");
    const actRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/6/activate`, {
      method: "POST",
      headers,
    });
    const actData = await actRes.json();
    console.log("Now active:", actData.active);
  }

  // Wait a moment then check robots.txt with cache-busting
  console.log("\nChecking robots.txt (cache-busting)...");
  const robotsRes = await fetch(`${SITE}/robots.txt?cb=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  const robotsTxt = await robotsRes.text();
  console.log(robotsTxt);

  if (robotsTxt.includes("GPTBot")) {
    console.log("SUCCESS: AI bot rules are live!");
  } else {
    console.log("NOTE: Robots.txt may be cached by Cloudflare. Try purging the cache.");
    console.log("Direct check: curl -H 'Cache-Control: no-cache' https://soberfounders.org/robots.txt");
  }
}

main().catch(console.error);
