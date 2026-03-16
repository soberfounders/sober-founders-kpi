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

const phpCode = `// Override robots.txt: use output buffering to capture and replace everything
add_action('do_robotstxt', function() {
    // Start output buffering to capture Yoast's echo output
    ob_start();
}, 0);

add_action('do_robotstxt', function() {
    // Discard whatever Yoast/WP core echoed
    ob_end_clean();
    // Echo our clean robots.txt
    echo "User-agent: *\\nDisallow:\\n\\n";
    echo "Sitemap: https://www.soberfounders.org/sitemap_index.xml\\n\\n";
    echo "# AI Search Bot Access Policy — Sober Founders\\n\\n";
    echo "User-agent: GPTBot\\nAllow: /\\n\\n";
    echo "User-agent: ChatGPT-User\\nAllow: /\\n\\n";
    echo "User-agent: PerplexityBot\\nAllow: /\\n\\n";
    echo "User-agent: ClaudeBot\\nAllow: /\\n\\n";
    echo "User-agent: anthropic-ai\\nAllow: /\\n\\n";
    echo "User-agent: Google-Extended\\nAllow: /\\n\\n";
    echo "User-agent: Bingbot\\nAllow: /\\n\\n";
    echo "# Block training-only crawlers\\n";
    echo "User-agent: CCBot\\nDisallow: /\\n";
}, 99999);`;

async function main() {
  console.log("Updating snippet #6...");
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/6`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ code: phpCode, active: true }),
  });
  const data = await res.json();
  console.log("Active:", data.active, "| Error:", data.code_error || "none");

  if (!data.active) {
    console.log("Activating...");
    const actRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/6/activate`, {
      method: "POST",
      headers,
    });
    const actData = await actRes.json();
    console.log("Now active:", actData.active);
  }

  console.log("\nVerifying robots.txt...");
  const robots = await fetch(`${SITE}/robots.txt?cb=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
  }).then(r => r.text());
  const sitemapCount = (robots.match(/Sitemap:/g) || []).length;
  const hasHttps = robots.includes("Sitemap: https://");
  const hasHttp = robots.includes("Sitemap: http://soberfounders");
  console.log(robots);
  console.log(`Sitemap count: ${sitemapCount} | HTTPS: ${hasHttps} | HTTP duplicate: ${hasHttp}`);
  console.log(sitemapCount === 1 && hasHttps && !hasHttp ? "PASS" : "Needs attention");
}

main().catch(console.error);
