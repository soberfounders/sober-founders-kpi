#!/usr/bin/env node
/**
 * upload-frames.mjs — Upload all 122 explosion frames to WordPress media library
 *
 * Usage:
 *   node scripts/upload-frames.mjs [--dry-run]
 */

import { readFileSync, readdirSync } from "fs";
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
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const DRY_RUN = process.argv.includes("--dry-run");

const FRAMES_DIR = resolve(ROOT, "website/public/assets/explosion");
const FRAME_COUNT = 122;

async function checkExistingFrame(filename) {
  const slug = filename.replace(".jpg", "");
  const url = `${SITE}/wp-json/wp/v2/media?slug=${slug}&per_page=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${AUTH}` },
  });
  if (!res.ok) return null;
  const items = await res.json();
  return items.length > 0 ? items[0] : null;
}

async function uploadFrame(filename, filepath) {
  const data = readFileSync(filepath);
  const res = await fetch(`${SITE}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${AUTH}`,
      "Content-Disposition": `attachment; filename=${filename}`,
      "Content-Type": "image/jpeg",
    },
    body: data,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed for ${filename}: ${res.status} ${body}`);
  }
  return res.json();
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Upload Explosion Frames to WordPress");
  console.log(`  Source: ${FRAMES_DIR}`);
  console.log(`  Frames: ${FRAME_COUNT}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  // Check if first frame already exists
  const firstCheck = await checkExistingFrame("frame_001");
  if (firstCheck) {
    const baseUrl = firstCheck.source_url.replace("frame_001.jpg", "");
    console.log(`  Frames already uploaded! Base URL: ${baseUrl}`);
    console.log(`  Sample: ${firstCheck.source_url}`);
    console.log(`\n  To re-upload, delete existing frames first.\n`);
    return;
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would upload ${FRAME_COUNT} frames.`);
    return;
  }

  // Upload in batches of 5 to avoid overwhelming the server
  const BATCH_SIZE = 5;
  const urls = [];

  for (let batch = 0; batch < Math.ceil(FRAME_COUNT / BATCH_SIZE); batch++) {
    const start = batch * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, FRAME_COUNT);
    const promises = [];

    for (let i = start; i < end; i++) {
      const num = String(i + 1).padStart(3, "0");
      const filename = `frame_${num}.jpg`;
      const filepath = resolve(FRAMES_DIR, filename);
      promises.push(
        uploadFrame(filename, filepath).then((result) => {
          console.log(`  ✓ ${filename} → ${result.source_url}`);
          return result.source_url;
        })
      );
    }

    const batchUrls = await Promise.all(promises);
    urls.push(...batchUrls);

    // Brief pause between batches
    if (end < FRAME_COUNT) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\n  ✓ All ${urls.length} frames uploaded successfully!`);

  // Derive base URL from first frame
  const baseUrl = urls[0].replace("frame_001.jpg", "");
  console.log(`  Base URL: ${baseUrl}\n`);
}

main().catch((err) => {
  console.error("Upload failed:", err.message);
  process.exit(1);
});
