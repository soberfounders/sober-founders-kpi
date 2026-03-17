#!/usr/bin/env node
/**
 * fix-footer-style.mjs — Fix the site-wide footer CSS by wrapping it in <style> tags.
 * The sober-seo-rest plugin's wp_kses_post sanitizer stripped the <style> tags on save.
 * This script creates a Code Snippet to fix the stored option directly.
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
$html = get_option('sober_footer_html', '');
if (strpos($html, '<style>') === false && strpos($html, '.sf-site-footer') !== false) {
    $divPos = strpos($html, '<div class="sf-site-footer">');
    if ($divPos !== false) {
        $css = substr($html, 0, $divPos);
        $htmlPart = substr($html, $divPos);
        $fixed = '<style>' . $css . '</style>' . "\\n" . $htmlPart;
        update_option('sober_footer_html', $fixed);
    }
}
`;

async function main() {
  // Delete the broken snippet #17 if it exists
  try {
    await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/17`, {
      method: "DELETE", headers,
    });
    console.log("Deleted broken snippet #17");
  } catch {}

  // Create the fix snippet
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "SF Fix Footer Style Tags (one-time)",
      code: PHP_CODE.trim(),
      scope: "global",
      priority: 1,
      active: true,
    }),
  });
  const snippet = await res.json();
  console.log("Created snippet:", snippet.id, "Active:", snippet.active);

  // Wait a moment for it to execute, then check the footer
  console.log("\nWaiting for snippet to execute...");
  await new Promise(r => setTimeout(r, 2000));

  // Verify the fix by hitting the footer endpoint
  const footerRes = await fetch(`${SITE}/wp-json/sober/v1/footer`, { headers });
  const footer = await footerRes.json();
  const hasStyle = footer.html.includes("<style>");
  console.log("Footer now has <style> tag:", hasStyle);
  console.log("First 100 chars:", footer.html.substring(0, 100));

  if (hasStyle) {
    // Deactivate the one-time snippet
    await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${snippet.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ active: false }),
    });
    console.log("Deactivated one-time snippet", snippet.id);
  }

  // Verify on Tuesday page
  console.log("\nChecking /tuesday/ page...");
  const tuesdayRes = await fetch(`${SITE}/tuesday/?nocache=${Date.now()}`);
  const tuesdayHtml = await tuesdayRes.text();
  const idx = tuesdayHtml.indexOf(".sf-site-footer");
  if (idx > -1) {
    const before = tuesdayHtml.substring(Math.max(0, idx - 50), idx);
    const isInStyle = before.includes("<style>");
    console.log("CSS is inside <style> tag:", isInStyle);
    console.log("Context:", before.substring(before.length - 30) + ".sf-site-footer...");
  }
}

main().catch(console.error);
