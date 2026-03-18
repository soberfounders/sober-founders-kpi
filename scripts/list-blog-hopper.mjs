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
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { Authorization: `Basic ${auth}` };

function strip(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/\s+/g, " ").trim();
}

async function main() {
  for (const status of ["draft", "pending", "future", "private"]) {
    const res = await fetch(`${SITE}/wp-json/wp/v2/posts?status=${status}&per_page=100&context=edit`, { headers });
    if (!res.ok) { console.log(`${status.toUpperCase()}: (fetch error ${res.status})`); continue; }
    const posts = await res.json();
    if (!posts.length) { console.log(`${status.toUpperCase()}: none`); continue; }
    console.log(`\n${status.toUpperCase()}: ${posts.length} posts`);
    console.log("-".repeat(90));
    for (const p of posts) {
      const title = strip(p.title?.raw || p.title?.rendered || "(untitled)");
      const date = p.date ? p.date.substring(0, 10) : "no date";
      const modified = p.modified ? p.modified.substring(0, 10) : "";
      const content = p.content?.raw || "";
      const wordCount = strip(content).split(/\s+/).filter(Boolean).length;
      const slug = p.slug || "(no slug)";
      console.log(`  ${String(p.id).padEnd(6)}| ${date} | ${String(wordCount).padStart(5)} words | ${title.substring(0, 65)}`);
    }
  }
}
main().catch(console.error);
