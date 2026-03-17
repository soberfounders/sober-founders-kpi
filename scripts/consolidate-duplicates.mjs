#!/usr/bin/env node
/**
 * consolidate-duplicates.mjs — Trash duplicate/redundant draft and scheduled posts
 *
 * Only trashes posts that are in draft or future (scheduled) status.
 * Published posts are NEVER touched.
 *
 * Usage:
 *   node scripts/consolidate-duplicates.mjs            # dry-run (default, safe)
 *   node scripts/consolidate-duplicates.mjs --dry-run  # explicit dry-run
 *   node scripts/consolidate-duplicates.mjs --live     # actually trash posts
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

const IS_LIVE = process.argv.includes("--live");
const IS_DRY  = !IS_LIVE; // dry-run is the default

// ── Posts to trash, grouped by topic ────────────────────────────────────────
const GROUPS = [
  {
    label: "AA Promises duplicates (keep 4006)",
    keep: 4006,
    trash: [4159, 3959, 4022, 4024, 4002, 3997, 3980, 3978, 4010, 4008, 4016],
  },
  {
    label: "Overachievers Anonymous duplicates (keep 4012)",
    keep: 4012,
    trash: [3982, 4004, 4018],
  },
  {
    label: "Business Triggers scheduled",
    keep: null,
    trash: [4157, 4139, 4000, 3984, 4065, 4069],
  },
  {
    label: "Sober Mastermind duplicates",
    keep: null,
    trash: [4249, 4199, 4020, 4057, 3995, 4067, 4073],
  },
  {
    label: "Work-Life Balance exact duplicate",
    keep: null,
    trash: [3425],
  },
  {
    label: "12-Step duplicates",
    keep: null,
    trash: [3453, 3314],
  },
  {
    label: "Sober Networking scheduled",
    keep: null,
    trash: [3928],
  },
  {
    label: "Ultimate Guide draft",
    keep: null,
    trash: [4061],
  },
];

// Flatten to a single list of IDs to process (deduplicated)
const ALL_IDS = [...new Set(GROUPS.flatMap((g) => g.trash))];

// Build a map of id -> group label for reporting
const ID_TO_GROUP = {};
for (const g of GROUPS) {
  for (const id of g.trash) {
    ID_TO_GROUP[id] = g.label;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function strip(html = "") {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function getPost(id) {
  // The REST API returns published posts at /posts/{id}, but draft/future posts
  // require authentication + status param. Passing context=edit retrieves all statuses.
  const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${id}?context=edit`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET /posts/${id} → HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function trashPost(id) {
  // DELETE without force=true moves to trash (WordPress default)
  const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE /posts/${id} → HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  consolidate-duplicates.mjs — ${IS_DRY ? "DRY RUN (no changes)" : "LIVE MODE — trashing posts"}`);
  console.log(`${"=".repeat(70)}\n`);

  const results = {
    trashed:   [],
    skipped:   [],  // published — never touch
    notFound:  [],
    errors:    [],
  };

  // Process by group so output is organized
  for (const group of GROUPS) {
    console.log(`\n── ${group.label} ${"─".repeat(Math.max(0, 60 - group.label.length))}`);
    if (group.keep) {
      console.log(`   Keeper: post ${group.keep} (not fetched, just noted)`);
    }

    for (const id of group.trash) {
      let post;
      try {
        post = await getPost(id);
      } catch (err) {
        console.log(`  [ERROR]   ID ${id} — ${err.message}`);
        results.errors.push({ id, reason: err.message });
        continue;
      }

      if (!post) {
        console.log(`  [NOT FOUND] ID ${id}`);
        results.notFound.push(id);
        continue;
      }

      const title  = strip(post.title?.rendered || post.title?.raw || "(no title)");
      const status = post.status;

      // Safety gate: never touch published posts
      if (status === "publish" || status === "private") {
        console.log(`  [SKIP]    ID ${id} | "${title}" | status: ${status} — PUBLISHED, skipping`);
        results.skipped.push({ id, title, status });
        continue;
      }

      // Only trash draft or future (scheduled)
      if (status === "draft" || status === "future") {
        if (IS_DRY) {
          console.log(`  [DRY-RUN] ID ${id} | "${title}" | status: ${status} — would trash`);
          results.trashed.push({ id, title, status, action: "would-trash" });
        } else {
          try {
            const deleted = await trashPost(id);
            const newStatus = deleted.status;
            console.log(`  [TRASHED] ID ${id} | "${title}" | was: ${status} → now: ${newStatus}`);
            results.trashed.push({ id, title, status, action: "trashed", newStatus });
          } catch (err) {
            console.log(`  [ERROR]   ID ${id} | "${title}" — ${err.message}`);
            results.errors.push({ id, title, status, reason: err.message });
          }
        }
      } else {
        // Unexpected status (e.g. "trash" already, "pending")
        console.log(`  [SKIP]    ID ${id} | "${title}" | status: ${status} — unexpected status, skipping`);
        results.skipped.push({ id, title, status });
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  SUMMARY`);
  console.log(`${"=".repeat(70)}`);
  console.log(`  Mode         : ${IS_DRY ? "DRY RUN" : "LIVE"}`);
  console.log(`  Total IDs    : ${ALL_IDS.length}`);
  console.log(`  Trashed      : ${results.trashed.length}${IS_DRY ? " (would be trashed)" : ""}`);
  console.log(`  Skipped      : ${results.skipped.length} (published/unexpected status — untouched)`);
  console.log(`  Not found    : ${results.notFound.length}`);
  console.log(`  Errors       : ${results.errors.length}`);

  if (results.skipped.length) {
    console.log(`\n  Skipped (NEVER trashed):`);
    for (const s of results.skipped) {
      console.log(`    ID ${s.id} | "${s.title}" | status: ${s.status}`);
    }
  }
  if (results.errors.length) {
    console.log(`\n  Errors:`);
    for (const e of results.errors) {
      console.log(`    ID ${e.id} — ${e.reason}`);
    }
  }
  if (results.notFound.length) {
    console.log(`\n  Not found: ${results.notFound.join(", ")}`);
  }

  console.log(`\n  Done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
