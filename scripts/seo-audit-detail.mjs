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

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&mdash;/g, "—")
    .replace(/&#\d+;/g, " ").replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ").trim();
}

async function main() {
  // Check post 3147 detail
  const res = await fetch(`${SITE}/wp-json/wp/v2/posts/3147?context=edit`, { headers });
  const post = await res.json();

  const html = post.content.rendered;
  const plain = stripHtml(html);

  console.log("=== FIRST 1000 CHARS OF PLAIN TEXT (post 3147) ===");
  console.log(plain.substring(0, 1000));

  console.log("\n=== LAST 500 CHARS ===");
  console.log(plain.substring(plain.length - 500));

  const intro = plain.substring(0, 300).toLowerCase();
  const kw = "entrepreneurs in recovery";
  console.log(`\nKW in intro (first 300 chars): ${intro.includes(kw) ? "YES" : "NO"}`);

  // Find where keyword appears
  let idx = 0;
  let kwPositions = [];
  while ((idx = plain.toLowerCase().indexOf(kw, idx)) !== -1) {
    kwPositions.push({ pos: idx, context: plain.substring(Math.max(0, idx - 50), idx + 80) });
    idx += kw.length;
  }
  console.log(`\nKeyword positions (${kwPositions.length} total):`);
  for (const p of kwPositions) {
    console.log(`  pos ${p.pos}: "...${p.context}..."`);
  }

  // Schema detail
  if (post.yoast_head_json) {
    const yj = post.yoast_head_json;
    console.log("\n=== YOAST SCHEMA DETAIL ===");
    if (yj.schema) {
      const graph = yj.schema["@graph"] || [];
      for (const node of graph) {
        if (node["@type"] === "Article") {
          console.log("\nArticle schema:");
          console.log("  headline:", node.headline);
          console.log("  description:", node.description);
          console.log("  dateModified:", node.dateModified);
          console.log("  wordCount:", node.wordCount);
          console.log("  keywords:", node.keywords);
          console.log("  speakable:", node.speakable ? "YES" : "NO");
        }
      }
    }
    console.log("\nFocus keyphrase:", yj.focus_keyphrase || "(not set)");
  }

  // Check post 3290 vs 3252 raw content comparison
  console.log("\n\n=== POST 3290 vs 3252 RAW CONTENT DIFF ===");
  const res90 = await fetch(`${SITE}/wp-json/wp/v2/posts/3290?context=edit`, { headers });
  const post90 = await res90.json();
  const res52 = await fetch(`${SITE}/wp-json/wp/v2/posts/3252?context=edit`, { headers });
  const post52 = await res52.json();

  const text90 = stripHtml(post90.content.rendered);
  const text52 = stripHtml(post52.content.rendered);

  console.log("Post 3290 first 500:", text90.substring(0, 500));
  console.log("\nPost 3252 first 500:", text52.substring(0, 500));

  // Check if they are similar
  const words90 = new Set(text90.toLowerCase().split(/\s+/));
  const words52 = new Set(text52.toLowerCase().split(/\s+/));
  const intersection = [...words90].filter(w => words52.has(w));
  const union = new Set([...words90, ...words52]);
  const jaccard = intersection.length / union.size;
  console.log(`\nJaccard similarity: ${(jaccard * 100).toFixed(1)}% (>70% = strong duplicate)`);

  // Check 3290 meta description keyword presence
  console.log("\n=== META DESCRIPTION KEYWORD CHECK ===");
  for (const [id, p] of [[3147, post], [3290, post90], [3252, post52]]) {
    const desc = p.yoast_head_json?.description || "";
    const title = stripHtml(p.title?.rendered || "");
    const hasDeskw = desc.toLowerCase().includes("entrepreneurs in recovery");
    const hasTitlekw = title.toLowerCase().includes("entrepreneurs in recovery");
    console.log(`Post ${id}: title_kw=${hasTitlekw}, desc_kw=${hasDeskw}`);
    console.log(`  title: ${title}`);
    console.log(`  desc: ${desc}`);
  }

  // Check 3290 focus keyword
  console.log("\n=== YOAST FOCUS KW (3290, 3252) ===");
  console.log("3290 focus_keyphrase:", post90.yoast_head_json?.focus_keyphrase || "(not set in API)");
  console.log("3252 focus_keyphrase:", post52.yoast_head_json?.focus_keyphrase || "(not set in API)");

  // Both are indexed — check robots
  console.log("\n=== ROBOTS (all three) ===");
  for (const [id, p] of [[3147, post], [3290, post90], [3252, post52]]) {
    console.log(`Post ${id}: ${JSON.stringify(p.yoast_head_json?.robots)}`);
  }
}

main().catch(console.error);
