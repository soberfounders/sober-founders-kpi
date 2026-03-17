#!/usr/bin/env node
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

async function main() {
  const url = `${SITE}/is-being-sober-worth-it-7-unexpected-business-advantages-sober-entrepreneurs-dont-want-you-to-know/`;
  const res = await fetch(url);
  const html = await res.text();

  // Find all elementor-button links
  const btnRegex = /<a[^>]*class="[^"]*elementor-button[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
  const matches = html.match(btnRegex) || [];

  console.log(`Found ${matches.length} Elementor buttons:\n`);
  for (let i = 0; i < matches.length; i++) {
    const btn = matches[i];
    const href = (btn.match(/href="([^"]+)"/) || [])[1] || "no href";
    const text = btn.replace(/<[^>]*>/g, "").trim();
    console.log(`  ${i + 1}. "${text}" → ${href}`);
  }

  // Also find wp-block-button links
  const wpBtnRegex = /<a[^>]*class="[^"]*wp-block-button__link[^"]*"[^>]*>[^<]*<\/a>/gi;
  const wpMatches = html.match(wpBtnRegex) || [];
  console.log(`\nFound ${wpMatches.length} WP Block buttons:\n`);
  for (let i = 0; i < wpMatches.length; i++) {
    const btn = wpMatches[i];
    const href = (btn.match(/href="([^"]+)"/) || [])[1] || "no href";
    const text = btn.replace(/<[^>]*>/g, "").trim();
    console.log(`  ${i + 1}. "${text}" → ${href}`);
  }

  // Find any link with "Attend" or "Free Meeting" text
  const attendRegex = /<a[^>]*>[^<]*(?:Attend|Free Meeting|Join Our)[^<]*<\/a>/gi;
  const attendMatches = html.match(attendRegex) || [];
  console.log(`\nLinks with "Attend/Free Meeting/Join Our" text (${attendMatches.length}):\n`);
  for (const m of attendMatches) {
    const href = (m.match(/href="([^"]+)"/) || [])[1] || "no href";
    const text = m.replace(/<[^>]*>/g, "").trim();
    console.log(`  "${text}" → ${href}`);
  }
}

main().catch(console.error);
