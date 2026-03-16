#!/usr/bin/env node
/**
 * Push the custom robots.txt PHP snippet to WordPress via Code Snippets REST API
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envLines = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8").split("\n");
const env = {};
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)\s*[=\-]\s*(.+)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SITE = env.WP_SITE_URL;
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };

const phpCode = `add_filter('robots_txt', function($output, $public) {
    $output  = "# START YOAST BLOCK\\n";
    $output .= "User-agent: *\\nDisallow:\\n\\n";
    $output .= "Sitemap: https://www.soberfounders.org/sitemap_index.xml\\n";
    $output .= "# END YOAST BLOCK\\n\\n";
    $output .= "# AI Search Bot Access Policy — Sober Founders\\n";
    $output .= "# We ALLOW AI search engines so founders find us via AI tools.\\n\\n";
    $output .= "User-agent: GPTBot\\nAllow: /\\n\\n";
    $output .= "User-agent: ChatGPT-User\\nAllow: /\\n\\n";
    $output .= "User-agent: PerplexityBot\\nAllow: /\\n\\n";
    $output .= "User-agent: ClaudeBot\\nAllow: /\\n\\n";
    $output .= "User-agent: anthropic-ai\\nAllow: /\\n\\n";
    $output .= "User-agent: Google-Extended\\nAllow: /\\n\\n";
    $output .= "User-agent: Bingbot\\nAllow: /\\n\\n";
    $output .= "# Block training-only crawlers (no search citation value)\\n";
    $output .= "User-agent: CCBot\\nDisallow: /\\n";
    return $output;
}, 99, 2);`;

async function main() {
  // First, delete the broken snippet (ID 5)
  try {
    await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/5`, { method: "DELETE", headers });
    console.log("Deleted broken snippet #5");
  } catch (e) {
    // ignore
  }

  // Create new snippet
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "SF Custom Robots.txt - AI Bot Access",
      desc: "Allow AI search bots to crawl soberfounders.org. Fix sitemap to HTTPS. Block CCBot training crawler.",
      code: phpCode,
      active: true,
      scope: "global",
      priority: 10,
    }),
  });

  const data = await res.json();
  console.log("Snippet ID:", data.id);
  console.log("Active:", data.active);
  console.log("Code error:", data.code_error || "none");

  if (data.code_error) {
    console.log("\nSnippet has errors, not activated. Code preview:");
    console.log(data.code?.substring(0, 200));
    return;
  }

  if (!data.active) {
    // Activate it
    console.log("Activating snippet...");
    const activateRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${data.id}/activate`, {
      method: "POST",
      headers,
    });
    const activated = await activateRes.json();
    console.log("Activated:", activated.active);
  }

  // Verify robots.txt
  console.log("\nVerifying robots.txt...");
  const robotsRes = await fetch(`${SITE}/robots.txt`);
  const robotsTxt = await robotsRes.text();
  console.log(robotsTxt);
}

main().catch(console.error);
