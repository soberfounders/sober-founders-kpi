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
  return html.replace(/<[^>]*>/g, "").replace(/&#8217;/g, "'").replace(/&amp;/g, "&").replace(/&#8211;/g, "-").replace(/&nbsp;/g, " ").trim();
}

async function main() {
  const allPosts = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `${SITE}/wp-json/wp/v2/posts?status=publish&per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) break;
    const posts = await res.json();
    if (!posts.length) break;
    allPosts.push(...posts);
  }

  // Also get drafts and scheduled
  const drafts = [];
  for (const status of ["draft", "future"]) {
    for (let page = 1; ; page++) {
      const res = await fetch(
        `${SITE}/wp-json/wp/v2/posts?status=${status}&per_page=100&page=${page}`,
        { headers }
      );
      if (!res.ok) break;
      const posts = await res.json();
      if (!posts.length) break;
      drafts.push(...posts.map(p => ({ ...p, _status: status })));
    }
  }

  // Published posts
  const titles = allPosts.map(p => ({
    title: strip(p.title.rendered),
    slug: p.slug,
    date: p.date.substring(0, 10),
    phoenix: p.tags.includes(24),
    wordCount: strip(p.content.rendered).split(/\s+/).length,
  }));
  titles.sort((a, b) => b.date.localeCompare(a.date));

  console.log(`\n=== PUBLISHED POSTS (${titles.length}) ===\n`);
  for (const t of titles) {
    const tag = t.phoenix ? "[PHX]" : "     ";
    console.log(`${t.date} ${tag} ${String(t.wordCount).padStart(5)}w | ${t.title.substring(0, 75)}`);
  }

  // Drafts/scheduled
  console.log(`\n=== DRAFTS & SCHEDULED (${drafts.length}) ===\n`);
  for (const d of drafts) {
    const title = strip(d.title.rendered);
    const status = d._status === "future" ? "SCHED" : "DRAFT";
    const date = d.date.substring(0, 10);
    console.log(`${date} [${status}] ${title.substring(0, 75)}`);
  }

  // Topic clusters
  console.log("\n=== TOPIC ANALYSIS ===\n");
  const clusters = {
    "City/Local SEO": t => /in .+,\s*[A-Z]{2}|city|local|new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas|atlanta/i.test(t.title),
    "Competitor (YPO/EO/Vistage)": t => /ypo|vistage|tiger 21|entrepreneur.?s organization|eo for/i.test(t.title),
    "Recovery + Business": t => /recovery|sobriety|sober|addiction|relapse|12.step|mental health/i.test(t.title),
    "Scaling/Growth": t => /scale|scaling|growth|revenue|million|employees|payroll|hiring/i.test(t.title),
    "Networking/Community": t => /network|mastermind|peer|community|group|meeting/i.test(t.title),
    "General Business": t => /business|entrepreneur|startup|funding|crowdfund|ai|trigger|mistake/i.test(t.title),
  };

  for (const [name, fn] of Object.entries(clusters)) {
    const matches = titles.filter(fn);
    console.log(`${name}: ${matches.length} posts`);
    for (const m of matches) {
      console.log(`  - ${m.title.substring(0, 70)}`);
    }
    console.log();
  }

  // Word count stats
  const wc = titles.map(t => t.wordCount).sort((a, b) => a - b);
  console.log("=== WORD COUNT STATS ===");
  console.log(`Min: ${wc[0]}, Max: ${wc[wc.length - 1]}, Median: ${wc[Math.floor(wc.length / 2)]}`);
  console.log(`Average: ${Math.round(wc.reduce((a, b) => a + b, 0) / wc.length)}`);
  console.log(`Under 1000 words: ${wc.filter(w => w < 1000).length}`);
  console.log(`1000-2000 words: ${wc.filter(w => w >= 1000 && w < 2000).length}`);
  console.log(`2000+ words: ${wc.filter(w => w >= 2000).length}`);
}

main().catch(console.error);
