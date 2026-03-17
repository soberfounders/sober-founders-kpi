#!/usr/bin/env node
/**
 * upload-plugin.mjs — Upload/update the sober-seo-rest plugin via WP REST API
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

async function main() {
  const zipPath = resolve(__dirname, "wp-plugins", "sober-seo-rest.zip");
  const zipBuffer = readFileSync(zipPath);

  // Upload via multipart form data
  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sober-seo-rest.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    zipBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  console.log("Uploading plugin...");
  const res = await fetch(`${SITE}/wp-json/wp/v2/plugins`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Authorization: `Basic ${auth}`,
    },
    body,
  });

  const result = await res.json();

  if (res.ok) {
    console.log("Uploaded successfully:", result.name, result.version);
  } else if (result.code === "folder_exists") {
    // Plugin already exists — need to delete and reinstall, or just update the file directly
    console.log("Plugin already installed. Attempting update via delete + reinstall...");

    // First deactivate
    const deactRes = await fetch(`${SITE}/wp-json/wp/v2/plugins/sober-seo-rest/sober-seo-rest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ status: "inactive" }),
    });
    console.log("Deactivate:", deactRes.status);

    // Delete
    const delRes = await fetch(`${SITE}/wp-json/wp/v2/plugins/sober-seo-rest/sober-seo-rest`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${auth}` },
    });
    console.log("Delete:", delRes.status);

    // Re-upload
    const reRes = await fetch(`${SITE}/wp-json/wp/v2/plugins`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Authorization: `Basic ${auth}`,
      },
      body,
    });
    const reResult = await reRes.json();
    console.log("Re-upload:", reRes.status, reResult.name || reResult.message);

    // Activate
    const actRes = await fetch(`${SITE}/wp-json/wp/v2/plugins/sober-seo-rest/sober-seo-rest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ status: "active" }),
    });
    const actResult = await actRes.json();
    console.log("Activate:", actRes.status, actResult.status);
  } else {
    console.log("Error:", result.code, result.message);
  }
}

main().catch(console.error);
