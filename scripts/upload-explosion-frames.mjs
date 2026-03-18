#!/usr/bin/env node
/**
 * upload-explosion-frames.mjs — Upload 122 explosion frame JPGs to WordPress media
 *
 * Usage:
 *   node scripts/upload-explosion-frames.mjs [--dry-run]
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
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const DRY_RUN = process.argv.includes("--dry-run");

const FRAME_COUNT = 122;
const FRAME_DIR = resolve(ROOT, "website/public/assets/explosion");
const CONCURRENCY = 5;

async function uploadFrame(index) {
  const padded = String(index).padStart(3, "0");
  const fileName = `frame_${padded}.jpg`;
  const filePath = resolve(FRAME_DIR, fileName);
  const fileData = readFileSync(filePath);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would upload ${fileName} (${fileData.length} bytes)`);
    return `${SITE}/wp-content/uploads/2026/03/${fileName}`;
  }

  const res = await fetch(`${SITE}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${AUTH}`,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "image/jpeg",
    },
    body: fileData,
  });

  if (!res.ok) {
    const body = await res.text();
    // If already exists, try to find its URL
    if (res.status === 409 || body.includes("already exists")) {
      console.log(`  ${fileName} already exists, skipping`);
      return null;
    }
    throw new Error(`Upload ${fileName} failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const media = await res.json();
  console.log(`  Uploaded ${fileName} → ${media.source_url}`);
  return media.source_url;
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Upload Explosion Frames to WordPress");
  console.log(`  Frames: ${FRAME_COUNT} JPGs from ${FRAME_DIR}`);
  console.log(`  Target: ${SITE}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  const urls = [];

  // Upload in batches for concurrency
  for (let i = 0; i < FRAME_COUNT; i += CONCURRENCY) {
    const batch = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, FRAME_COUNT); j++) {
      batch.push(uploadFrame(j + 1));
    }
    const results = await Promise.all(batch);
    urls.push(...results);
  }

  console.log(`\n  Done. ${urls.filter(Boolean).length} frames uploaded.`);

  // Print the base URL pattern
  const sample = urls.find(Boolean);
  if (sample) {
    const base = sample.replace(/frame_\d+\.jpg$/, "");
    console.log(`  Base URL: ${base}frame_NNN.jpg`);
  }
}

main().catch((err) => {
  console.error("Upload failed:", err.message);
  process.exit(1);
});
