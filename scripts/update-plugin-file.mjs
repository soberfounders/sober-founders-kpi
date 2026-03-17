#!/usr/bin/env node
/**
 * update-plugin-file.mjs — Update the sober-seo-rest plugin PHP file on the server
 * via a one-time Code Snippet that writes the file using file_put_contents.
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

async function main() {
  // Read the updated plugin PHP
  const phpPath = resolve(__dirname, "wp-plugins", "sober-seo-rest", "sober-seo-rest.php");
  const phpContent = readFileSync(phpPath, "utf8");

  // Base64 encode to avoid escaping issues
  const b64 = Buffer.from(phpContent).toString("base64");

  const snippetCode = `$path = WP_PLUGIN_DIR . '/sober-seo-rest/sober-seo-rest.php';
$content = base64_decode('${b64}');
file_put_contents($path, $content);
if (function_exists('opcache_invalidate')) { opcache_invalidate($path, true); }
if (function_exists('opcache_reset')) { opcache_reset(); }`;

  // Create and run the snippet
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "SF Update Plugin File (one-time)",
      code: snippetCode,
      scope: "global",
      priority: 1,
      active: true,
    }),
  });
  const snippet = await res.json();
  console.log("Created snippet:", snippet.id, "Active:", snippet.active);

  // Wait for execution
  await new Promise((r) => setTimeout(r, 2000));

  // Deactivate
  await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${snippet.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ active: false }),
  });
  console.log("Deactivated snippet", snippet.id);

  // Verify the footer endpoint still works (plugin didn't break)
  const footerRes = await fetch(`${SITE}/wp-json/sober/v1/footer`, { headers });
  const footer = await footerRes.json();
  console.log("Footer endpoint works:", !!footer.html);
  console.log("Footer has <style>:", footer.html.includes("<style>"));
}

main().catch(console.error);
