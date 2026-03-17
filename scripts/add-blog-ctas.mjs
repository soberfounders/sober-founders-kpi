#!/usr/bin/env node
/**
 * add-blog-ctas.mjs — Append contextual CTA blocks to blog posts that lack them.
 *
 * Logic:
 *   - Most posts → Events CTA (/events/ — free Thursday mastermind)
 *   - Only truly high-level posts (scaling, employees, payroll, lawsuits,
 *     competitor comparisons like YPO/EO/Vistage) → Phoenix Forum CTA
 *   - City pages → Events (they're local SEO, general audience)
 *
 * Safety:
 *   - Only appends if post doesn't already have a CTA block (checks for sf-blog-cta marker)
 *   - Uses context=edit to preserve Gutenberg block markup
 *   - Dry-run mode by default: pass --live to actually update
 *
 * Usage:
 *   node scripts/add-blog-ctas.mjs          # dry run
 *   node scripts/add-blog-ctas.mjs --live   # actually update posts
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
const LIVE = process.argv.includes("--live");

// ── CTA HTML blocks ─────────────────────────────────────────────────────────

const EVENTS_CTA = `
<!-- wp:html -->
<!-- sf-blog-cta:events -->
<div style="background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%); border-radius: 16px; padding: 48px 32px; text-align: center; margin: 48px 0 24px; position: relative; overflow: hidden;">
  <div style="position: absolute; inset: 0; background: radial-gradient(circle at 30% 40%, rgba(0,178,134,0.12) 0%, transparent 50%); pointer-events: none;"></div>
  <h3 style="font-family: 'DM Serif Display', Georgia, serif; font-size: 1.6rem; font-weight: 400; color: #ffffff; margin: 0 0 12px; position: relative;">You Don't Have to Build Alone</h3>
  <p style="color: rgba(255,255,255,0.7); font-size: 1.05rem; max-width: 500px; margin: 0 auto 24px; line-height: 1.65; position: relative;">Join sober entrepreneurs every Thursday for a free mastermind — real challenges, real support, no pitches.</p>
  <a href="https://soberfounders.org/events/" style="display: inline-block; background: #00b286; color: #fff; font-size: 0.95rem; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 30px; text-transform: uppercase; letter-spacing: 0.5px; position: relative;">Attend a Free Meeting</a>
</div>
<!-- /sf-blog-cta -->
<!-- /wp:html -->`;

const PHOENIX_CTA = `
<!-- wp:html -->
<!-- sf-blog-cta:phoenix -->
<div style="background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%); border-radius: 16px; padding: 48px 32px; text-align: center; margin: 48px 0 24px; position: relative; overflow: hidden;">
  <div style="position: absolute; inset: 0; background: radial-gradient(circle at 30% 40%, rgba(0,178,134,0.12) 0%, transparent 50%); pointer-events: none;"></div>
  <h3 style="font-family: 'DM Serif Display', Georgia, serif; font-size: 1.6rem; font-weight: 400; color: #ffffff; margin: 0 0 12px; position: relative;">Building at Scale? You Need the Right Room.</h3>
  <p style="color: rgba(255,255,255,0.7); font-size: 1.05rem; max-width: 540px; margin: 0 auto 16px; line-height: 1.65; position: relative;">The Phoenix Forum is a weekly peer advisory group for sober entrepreneurs navigating the real challenges of growth — hiring, payroll, partnerships, and everything that comes with scaling.</p>
  <p style="color: rgba(255,255,255,0.5); font-size: 0.9rem; margin: 0 auto 24px; position: relative;"><strong style="color: rgba(255,255,255,0.7);">Requirements:</strong> $1M+ annual revenue &bull; 1+ year of sobriety &bull; Application only</p>
  <a href="https://soberfounders.org/phoenix-forum-registration/" style="display: inline-block; background: #00b286; color: #fff; font-size: 0.95rem; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 30px; text-transform: uppercase; letter-spacing: 0.5px; position: relative;">Apply to Phoenix Forum</a>
</div>
<!-- /sf-blog-cta -->
<!-- /wp:html -->`;

// ── Explicit overrides by post ID ────────────────────────────────────────────
// Force specific posts to a CTA type regardless of keyword matching
const FORCE_EVENTS = new Set([
  // City pages — local SEO, general audience
  4190, 4189, 4188, 4187, 4186, 4185, 4184, 4183, 4182, 4181,
]);

// ── Phoenix: only for truly high-level business content ──────────────────────
// Competitor comparisons (readers actively shopping for premium peer groups)
// + content about scaling challenges that $1M+ founders face
const PHOENIX_KEYWORDS = [
  "ypo", "vistage", "tiger 21",
  "peer advisory", "peer group for sober",
  "$1m", "$1 million", "million dollar", "multi-million",
  "seven figure", "8-figure",
  "scale your company", "scaling past", "scaling beyond",
  "employees", "payroll", "hiring team", "lawsuit",
  "good problems",
];

// Need 2+ keyword matches to qualify as phoenix, unless it's a direct
// competitor comparison (has "eo " in title — note trailing space to avoid
// matching random words)
const COMPETITOR_TITLE_KEYWORDS = ["ypo", "vistage", "tiger 21"];

function strip(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/\s+/g, " ").trim();
}

function classifyPost(postId, title, content) {
  // Forced overrides
  if (FORCE_EVENTS.has(postId)) return "events";

  const titleLower = title.toLowerCase();
  const textLower = (content + " " + title).toLowerCase();

  // Direct competitor comparison in title → phoenix
  if (COMPETITOR_TITLE_KEYWORDS.some(kw => titleLower.includes(kw))) return "phoenix";

  // EO special case (need "eo " or "eo)" or "entrepreneur's organization" to avoid false positives)
  const hasEo = /\beo\b|entrepreneur.?s organization/i.test(title + " " + content);

  // Keyword scoring
  const phoenixScore = PHOENIX_KEYWORDS.filter(kw => textLower.includes(kw)).length + (hasEo ? 1 : 0);

  // Need 2+ strong signals for phoenix
  return phoenixScore >= 2 ? "phoenix" : "events";
}

async function main() {
  console.log(`\nBlog CTA Deployment — ${LIVE ? "LIVE MODE" : "DRY RUN"}`);
  console.log("=".repeat(60) + "\n");

  // Fetch all published posts (paginate)
  const allPosts = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `${SITE}/wp-json/wp/v2/posts?status=publish&per_page=100&page=${page}&context=edit`,
      { headers }
    );
    if (!res.ok) break;
    const posts = await res.json();
    if (!posts.length) break;
    allPosts.push(...posts);
  }
  console.log(`Found ${allPosts.length} published posts.\n`);

  let updated = 0;
  let skipped = 0;
  let phoenixCount = 0;
  let eventsCount = 0;

  for (const post of allPosts) {
    const rawContent = post.content?.raw || "";
    const title = strip(post.title?.raw || post.title?.rendered || "");
    const text = strip(rawContent);

    // Skip if already has our CTA
    if (rawContent.includes("sf-blog-cta")) {
      skipped++;
      continue;
    }

    // Classify
    const ctaType = classifyPost(post.id, title, text);
    const ctaHtml = ctaType === "phoenix" ? PHOENIX_CTA : EVENTS_CTA;

    if (ctaType === "phoenix") phoenixCount++;
    else eventsCount++;

    const icon = ctaType === "phoenix" ? "phoenix" : "events ";
    console.log(`  ${icon} | ${String(post.id).padEnd(5)} | ${title.substring(0, 65)}`);

    if (LIVE) {
      const newContent = rawContent + "\n" + ctaHtml;
      const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${post.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content: newContent }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.log(`           ERROR: ${res.status} — ${err.substring(0, 100)}`);
      } else {
        updated++;
      }
    } else {
      updated++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${LIVE ? "Updated" : "Would update"}: ${updated} posts`);
  console.log(`  → Events CTA: ${eventsCount}`);
  console.log(`  → Phoenix CTA: ${phoenixCount}`);
  console.log(`Skipped (already has CTA): ${skipped}`);
  if (!LIVE && updated > 0) {
    console.log(`\nRun with --live to apply changes:`);
    console.log(`  node scripts/add-blog-ctas.mjs --live`);
  }
}

main().catch(console.error);
