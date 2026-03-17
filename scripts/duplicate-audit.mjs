#!/usr/bin/env node
/**
 * duplicate-audit.mjs — Read-only duplicate/near-duplicate content audit
 * Fetches all posts (published, draft, future) and groups by topic similarity
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

function strip(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .trim();
}

function normalize(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein distance for near-duplicate detection
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// Topic keyword clusters for deliberate grouping
const TOPIC_CLUSTERS = [
  { name: "AA Promises / Alcoholics Anonymous Promises", keywords: [/aa promises/i, /alcoholics anonymous promises/i, /twelve.?step promises/i, /12.step promises/i, /promises of.?a\.a/i, /the promises/i] },
  { name: "Business Triggers", keywords: [/business triggers/i, /trigger/i] },
  { name: "Overachievers Anonymous", keywords: [/overachievers anonymous/i, /overachiever/i] },
  { name: "Sober Mastermind", keywords: [/sober mastermind/i, /mastermind/i] },
  { name: "Work-Life Balance", keywords: [/work.?life balance/i, /work life/i] },
  { name: "YPO Comparison", keywords: [/ypo/i] },
  { name: "EO Comparison", keywords: [/entrepreneurs.?organization|eo for|eo vs/i] },
  { name: "Vistage Comparison", keywords: [/vistage/i] },
  { name: "Tiger 21 Comparison", keywords: [/tiger.?21/i] },
  { name: "Peer Advisory / Mastermind Groups", keywords: [/peer advisory/i, /peer group/i] },
  { name: "Ultimate Guide to Entrepreneurship in Recovery", keywords: [/ultimate guide/i] },
  { name: "Sober Entrepreneur / Sobriety in Business", keywords: [/sober entrepreneur/i, /sobriety.*business|business.*sobriety/i, /entrepreneurship in recovery/i, /recovery.*entrepreneur|entrepreneur.*recovery/i] },
  { name: "Networking (Sober)", keywords: [/sober.*network|network.*sober/i] },
  { name: "Mental Health / Anxiety / ADHD", keywords: [/mental health/i, /anxiety/i, /adhd/i, /depression/i] },
  { name: "Phoenix Forum / Phoenix Group", keywords: [/phoenix forum/i, /phoenix group/i, /phoenix program/i] },
  { name: "Fundraising / Crowdfunding / Grants", keywords: [/fundrais/i, /crowdfund/i, /grant/i] },
  { name: "Scaling / Growth", keywords: [/scaling/i, /scale your/i, /grow.*business|business.*grow/i] },
  { name: "12-Step / Recovery Program", keywords: [/12.step/i, /twelve.step/i, /recovery program/i] },
];

async function fetchAllPosts(SITE, headers) {
  const allPosts = [];
  const statuses = ["publish", "draft", "future", "pending", "private"];

  for (const status of statuses) {
    let page = 1;
    while (true) {
      const url = `${SITE}/wp-json/wp/v2/posts?status=${status}&per_page=100&page=${page}&_fields=id,title,status,date,modified,slug,content,excerpt`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 400) break; // No more pages
        const txt = await res.text();
        console.warn(`  [WARN] ${status} page ${page}: HTTP ${res.status} — ${txt.substring(0, 100)}`);
        break;
      }
      const posts = await res.json();
      if (!posts.length) break;
      allPosts.push(...posts.map(p => ({
        id: p.id,
        title: strip(p.title.rendered),
        status: p.status === "future" ? "scheduled" : p.status,
        date: p.date ? p.date.substring(0, 10) : "unknown",
        modified: p.modified ? p.modified.substring(0, 10) : "unknown",
        slug: p.slug,
        wordCount: strip(p.content?.rendered || "").split(/\s+/).filter(Boolean).length,
      })));
      if (posts.length < 100) break;
      page++;
    }
  }

  // Deduplicate by ID
  const seen = new Set();
  return allPosts.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
}

function buildTopicClusters(posts) {
  const assigned = new Set();
  const results = [];

  for (const cluster of TOPIC_CLUSTERS) {
    const matches = posts.filter(p =>
      cluster.keywords.some(kw => kw.test(p.title))
    );
    if (matches.length > 0) {
      for (const m of matches) assigned.add(m.id);
      results.push({ name: cluster.name, posts: matches });
    }
  }
  return { clusters: results, assigned };
}

function findNearDuplicates(posts, threshold = 0.65) {
  const groups = [];
  const used = new Set();

  for (let i = 0; i < posts.length; i++) {
    if (used.has(posts[i].id)) continue;
    const group = [posts[i]];
    for (let j = i + 1; j < posts.length; j++) {
      if (used.has(posts[j].id)) continue;
      const sim = similarity(posts[i].title, posts[j].title);
      if (sim >= threshold) {
        group.push(posts[j]);
        used.add(posts[j].id);
      }
    }
    if (group.length > 1) {
      for (const p of group) used.add(p.id);
      groups.push(group);
    }
  }
  return groups;
}

function pickKeeper(posts) {
  // Prefer: published > scheduled > draft > pending > private
  const statusOrder = { publish: 0, scheduled: 1, draft: 2, pending: 3, private: 4 };
  const sorted = [...posts].sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    // Among same status: prefer longer content
    return b.wordCount - a.wordCount;
  });
  return sorted[0];
}

function formatPost(p, isKeeper) {
  const flag = isKeeper ? "KEEP " : "TRASH";
  const statusLabel = p.status === "publish" ? "PUBLISHED " : p.status.toUpperCase().padEnd(10);
  return `  [${flag}] ID:${String(p.id).padStart(6)} | ${statusLabel} | ${p.date} | ${String(p.wordCount).padStart(5)}w | ${p.title.substring(0, 70)}`;
}

async function main() {
  const env = loadEnv();
  const SITE = env.WP_SITE_URL;
  if (!SITE) { console.error("WP_SITE_URL not set in .env"); process.exit(1); }

  const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}` };

  console.log(`\nFetching all posts from ${SITE}...\n`);
  const posts = await fetchAllPosts(SITE, headers);

  console.log(`Total posts fetched: ${posts.length}`);
  const byStatus = {};
  for (const p of posts) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  for (const [s, n] of Object.entries(byStatus)) {
    console.log(`  ${s.padEnd(12)}: ${n}`);
  }

  // ─── SECTION 1: Full post listing ───────────────────────────────────────────
  console.log("\n\n════════════════════════════════════════════════════════════");
  console.log("SECTION 1: ALL POSTS");
  console.log("════════════════════════════════════════════════════════════\n");

  const sorted = [...posts].sort((a, b) => {
    const statusOrder = { publish: 0, scheduled: 1, draft: 2, pending: 3, private: 4 };
    const s = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    return s !== 0 ? s : b.date.localeCompare(a.date);
  });

  for (const p of sorted) {
    const statusLabel = p.status === "publish" ? "PUBLISHED " : p.status.toUpperCase().padEnd(10);
    console.log(`ID:${String(p.id).padStart(6)} | ${statusLabel} | ${p.date} | ${String(p.wordCount).padStart(5)}w | ${p.title.substring(0, 80)}`);
  }

  // ─── SECTION 2: Topic keyword clusters ──────────────────────────────────────
  console.log("\n\n════════════════════════════════════════════════════════════");
  console.log("SECTION 2: TOPIC CLUSTERS (keyword-based)");
  console.log("════════════════════════════════════════════════════════════\n");

  const { clusters, assigned } = buildTopicClusters(posts);
  let totalInClusters = 0;
  for (const c of clusters) {
    if (c.posts.length < 2) continue; // Only report clusters with 2+ posts
    totalInClusters += c.posts.length;
    console.log(`\n--- ${c.name} (${c.posts.length} posts) ---`);
    const keeper = pickKeeper(c.posts);
    for (const p of c.posts) {
      console.log(formatPost(p, p.id === keeper.id));
    }
    console.log(`  Recommendation: Keep ID:${keeper.id} ("${keeper.title.substring(0, 55)}")`);
    const toTrash = c.posts.filter(p => p.id !== keeper.id);
    if (toTrash.length > 0) {
      console.log(`  Trash/consolidate: ${toTrash.map(p => `ID:${p.id}`).join(", ")}`);
    }
  }

  // Single-match clusters (only 1 post — no duplication needed)
  const singleClusters = clusters.filter(c => c.posts.length === 1);
  if (singleClusters.length > 0) {
    console.log(`\n--- Single-post clusters (no duplicate risk) ---`);
    for (const c of singleClusters) {
      const p = c.posts[0];
      console.log(`  ${c.name}: ID:${p.id} "${p.title.substring(0, 60)}" [${p.status}]`);
    }
  }

  // ─── SECTION 3: Near-duplicate title detection (Levenshtein) ────────────────
  console.log("\n\n════════════════════════════════════════════════════════════");
  console.log("SECTION 3: NEAR-DUPLICATE TITLES (≥65% similarity)");
  console.log("════════════════════════════════════════════════════════════\n");

  const nearDups = findNearDuplicates(posts, 0.65);
  if (nearDups.length === 0) {
    console.log("No near-duplicate titles found at ≥65% threshold.");
  } else {
    for (const group of nearDups) {
      const keeper = pickKeeper(group);
      const pairs = [];
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          pairs.push({ a: group[i].title, b: group[j].title, sim: similarity(group[i].title, group[j].title) });
        }
      }
      const maxSim = Math.max(...pairs.map(p => p.sim));
      console.log(`\nSimilarity group (max ${(maxSim * 100).toFixed(0)}%):`);
      for (const p of group) {
        console.log(formatPost(p, p.id === keeper.id));
      }
      console.log(`  Recommendation: Keep ID:${keeper.id}, consolidate others`);
    }
  }

  // ─── SECTION 4: Unclustered posts ───────────────────────────────────────────
  console.log("\n\n════════════════════════════════════════════════════════════");
  console.log("SECTION 4: POSTS NOT IN ANY NAMED CLUSTER");
  console.log("════════════════════════════════════════════════════════════\n");

  const allAssignedIds = new Set(clusters.flatMap(c => c.posts.map(p => p.id)));
  const unclustered = posts.filter(p => !allAssignedIds.has(p.id));
  if (unclustered.length === 0) {
    console.log("All posts matched a named cluster.");
  } else {
    for (const p of unclustered) {
      const statusLabel = p.status === "publish" ? "PUBLISHED " : p.status.toUpperCase().padEnd(10);
      console.log(`ID:${String(p.id).padStart(6)} | ${statusLabel} | ${p.date} | ${String(p.wordCount).padStart(5)}w | ${p.title.substring(0, 80)}`);
    }
  }

  // ─── SECTION 5: Consolidation Plan Summary ──────────────────────────────────
  console.log("\n\n════════════════════════════════════════════════════════════");
  console.log("SECTION 5: CONSOLIDATION PLAN SUMMARY");
  console.log("════════════════════════════════════════════════════════════\n");

  let totalKeep = 0, totalTrash = 0;
  const dupClusters = clusters.filter(c => c.posts.length >= 2);

  for (const c of dupClusters) {
    const keeper = pickKeeper(c.posts);
    const toTrash = c.posts.filter(p => p.id !== keeper.id);
    totalKeep++;
    totalTrash += toTrash.length;
    console.log(`TOPIC: ${c.name}`);
    console.log(`  KEEP    → ID:${keeper.id} | ${keeper.status} | "${keeper.title}"`);
    for (const p of toTrash) {
      const action = p.status === "publish" ? "REDIRECT+TRASH" : "TRASH";
      console.log(`  ${action} → ID:${p.id} | ${p.status} | "${p.title}"`);
    }
    console.log();
  }

  // Near-dup summary (if not already in topic clusters)
  const nearDupIdsInClusters = new Set(dupClusters.flatMap(c => c.posts.map(p => p.id)));
  const novelNearDups = nearDups.filter(group =>
    group.some(p => !nearDupIdsInClusters.has(p.id)) && group.length >= 2
  );
  if (novelNearDups.length > 0) {
    console.log("NEAR-DUPLICATE TITLE PAIRS (not caught by keyword clusters):");
    for (const group of novelNearDups) {
      const keeper = pickKeeper(group);
      const toTrash = group.filter(p => p.id !== keeper.id);
      totalKeep++;
      totalTrash += toTrash.length;
      console.log(`  KEEP    → ID:${keeper.id} | ${keeper.status} | "${keeper.title}"`);
      for (const p of toTrash) {
        const action = p.status === "publish" ? "REDIRECT+TRASH" : "TRASH";
        console.log(`  ${action} → ID:${p.id} | ${p.status} | "${p.title}"`);
      }
    }
    console.log();
  }

  console.log(`\nTOTAL: Keep ${totalKeep} definitive posts, eliminate ${totalTrash} duplicates`);
  console.log(`Total posts audited: ${posts.length}`);
  console.log("\nNOTE: This is a READ-ONLY audit. No content was modified.\n");
}

main().catch(err => { console.error(err); process.exit(1); });
