#!/usr/bin/env node
/**
 * push-phoenix-cta-snippet.mjs — Deploy a Code Snippet that swaps the
 * Elementor blog template CTA button on posts tagged "phoenix-cta".
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

const PHP_CODE = `
// SF Phoenix CTA Swap — Replace the Elementor blog template CTA button
// on posts tagged "phoenix-cta" with the Phoenix Forum apply button.
add_action('wp_footer', function() {
    if (!is_singular('post')) return;
    if (!has_tag('phoenix-cta')) return;
    ?>
    <script>
    (function() {
        var buttons = document.querySelectorAll('.elementor-button-link');
        for (var i = 0; i < buttons.length; i++) {
            var href = buttons[i].getAttribute('href') || '';
            if (href.indexOf('/events') !== -1) {
                buttons[i].setAttribute('href', 'https://soberfounders.org/phoenix-forum-registration/');
                var textEl = buttons[i].querySelector('.elementor-button-text');
                if (textEl) textEl.textContent = 'Apply to Phoenix Forum';
            }
        }
    })();
    </script>
    <?php
});
`;

async function main() {
  // Check if snippet already exists
  const listRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, { headers });
  const snippets = await listRes.json();
  const existing = snippets.find(s => s.name.includes("Phoenix CTA Swap"));

  const payload = {
    name: "SF Phoenix CTA Swap — Blog Template Override",
    code: PHP_CODE.trim(),
    scope: "global",
    priority: 10,
    active: true,
  };

  let res;
  if (existing) {
    console.log(`Updating existing snippet ID ${existing.id}...`);
    res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${existing.id}`, {
      method: "PUT", headers, body: JSON.stringify(payload),
    });
  } else {
    console.log("Creating new snippet...");
    res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
  }

  const result = await res.json();
  console.log(`Snippet ID: ${result.id}`);
  console.log(`Name: ${result.name}`);
  console.log(`Active: ${result.active}`);
  console.log(`\nDone! Posts with the "phoenix-cta" tag will now show "Apply to Phoenix Forum" instead of "Check Out Our Free Online Events!"`);
}

main().catch(console.error);
