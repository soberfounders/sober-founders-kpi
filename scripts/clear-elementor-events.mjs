#!/usr/bin/env node
/**
 * clear-elementor-events.mjs — Remove Elementor's stored data from /events/ page
 * so WordPress renders post_content (our deploy-events-page.mjs content) instead.
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
  const POST_ID = 2401;

  const snippetCode = `
$post_id = ${POST_ID};
delete_post_meta($post_id, '_elementor_data');
delete_post_meta($post_id, '_elementor_edit_mode');
delete_post_meta($post_id, '_elementor_css');
delete_post_meta($post_id, '_elementor_page_assets');
delete_post_meta($post_id, '_elementor_controls_usage');
$upload_dir = wp_upload_dir();
$css_file = $upload_dir['basedir'] . '/elementor/css/post-' . $post_id . '.css';
if (file_exists($css_file)) { unlink($css_file); }
wp_cache_flush();
`;

  console.log("Creating snippet to clear Elementor data for page", POST_ID);
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "SF Clear Elementor Data for Events (one-time)",
      code: snippetCode,
      scope: "global",
      priority: 1,
      active: true,
    }),
  });
  const snippet = await res.json();
  console.log("Created snippet:", snippet.id, "Active:", snippet.active);

  // Wait for execution
  await new Promise((r) => setTimeout(r, 3000));

  // Deactivate
  await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${snippet.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ active: false }),
  });
  console.log("Deactivated snippet", snippet.id);

  // Verify the page no longer has Elementor rendering
  const pageRes = await fetch(`${SITE}/wp-json/wp/v2/pages/${POST_ID}?_fields=content,template`, {
    headers,
  });
  const page = await pageRes.json();
  const hasElementor = page.content?.rendered?.includes("elementor-element");
  console.log("Template:", page.template);
  console.log("Still has Elementor wrappers:", hasElementor);
  console.log("Has canvas element:", page.content?.rendered?.includes("sf-scroll-canvas"));
  console.log("Has GSAP script:", page.content?.rendered?.includes("gsap"));
}

main().catch(console.error);
