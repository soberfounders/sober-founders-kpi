#!/usr/bin/env node
/**
 * setup-phoenix-template.mjs — Assign the Phoenix CTA Elementor template
 * to phoenix-classified blog posts, and create a "phoenix-cta" tag for
 * future use.
 *
 * The Phoenix template (ID 4243) uses conditions to target posts with
 * the "phoenix-cta" tag. Posts that don't have the tag get the default
 * events CTA template (ID 3308).
 *
 * Usage:
 *   node scripts/setup-phoenix-template.mjs          # dry run
 *   node scripts/setup-phoenix-template.mjs --live    # actually update
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

// Phoenix classification (same logic as add-blog-ctas.mjs)
const FORCE_EVENTS = new Set([4190, 4189, 4188, 4187, 4186, 4185, 4184, 4183, 4182, 4181]);
const PHOENIX_KEYWORDS = [
  "ypo", "vistage", "tiger 21",
  "peer advisory", "peer group for sober",
  "$1m", "$1 million", "million dollar", "multi-million",
  "seven figure", "8-figure",
  "scale your company", "scaling past", "scaling beyond",
  "employees", "payroll", "hiring team", "lawsuit",
  "good problems",
];
const COMPETITOR_TITLE_KEYWORDS = ["ypo", "vistage", "tiger 21"];

function strip(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/\s+/g, " ").trim();
}

function isPhoenixPost(postId, title, content) {
  if (FORCE_EVENTS.has(postId)) return false;
  const titleLower = title.toLowerCase();
  const textLower = (content + " " + title).toLowerCase();
  if (COMPETITOR_TITLE_KEYWORDS.some(kw => titleLower.includes(kw))) return true;
  const hasEo = /\beo\b|entrepreneur.?s organization/i.test(title + " " + content);
  const phoenixScore = PHOENIX_KEYWORDS.filter(kw => textLower.includes(kw)).length + (hasEo ? 1 : 0);
  return phoenixScore >= 2;
}

async function main() {
  console.log(`\nPhoenix Template Setup — ${LIVE ? "LIVE MODE" : "DRY RUN"}`);
  console.log("=".repeat(60) + "\n");

  // Step 1: Find or create the "phoenix-cta" tag
  console.log("--- Step 1: Find/create 'phoenix-cta' tag ---");
  let tagId;
  const tagSearch = await fetch(`${SITE}/wp-json/wp/v2/tags?slug=phoenix-cta`, { headers });
  const existingTags = await tagSearch.json();
  if (existingTags.length > 0) {
    tagId = existingTags[0].id;
    console.log(`  Tag already exists: ID ${tagId}\n`);
  } else if (LIVE) {
    const tagRes = await fetch(`${SITE}/wp-json/wp/v2/tags`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "phoenix-cta", slug: "phoenix-cta", description: "Posts that show the Phoenix Forum CTA instead of the general events CTA" }),
    });
    const newTag = await tagRes.json();
    tagId = newTag.id;
    console.log(`  Created tag: ID ${tagId}\n`);
  } else {
    console.log(`  Would create 'phoenix-cta' tag\n`);
    tagId = "TBD";
  }

  // Step 2: Classify posts and add the tag
  console.log("--- Step 2: Classify and tag phoenix posts ---");
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
  console.log(`  Found ${allPosts.length} published posts.\n`);

  const phoenixPosts = [];
  for (const post of allPosts) {
    const title = strip(post.title?.raw || "");
    const text = strip(post.content?.raw || "");
    if (isPhoenixPost(post.id, title, text)) {
      phoenixPosts.push({ id: post.id, title, tags: post.tags || [] });
    }
  }

  console.log(`  Phoenix posts (${phoenixPosts.length}):`);
  for (const p of phoenixPosts) {
    const hasTag = typeof tagId === "number" && p.tags.includes(tagId);
    console.log(`    ${p.id} ${hasTag ? "[already tagged]" : "[needs tag]"} — ${p.title.substring(0, 65)}`);

    if (LIVE && typeof tagId === "number" && !hasTag) {
      const newTags = [...p.tags, tagId];
      const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${p.id}`, {
        method: "POST", headers,
        body: JSON.stringify({ tags: newTags }),
      });
      if (!res.ok) {
        console.log(`      ERROR tagging: ${res.status}`);
      }
    }
  }

  // Step 3: Set up the Phoenix template conditions
  console.log(`\n--- Step 3: Set Phoenix template conditions ---`);
  if (LIVE && typeof tagId === "number") {
    // Set the Phoenix template to target posts with the phoenix-cta tag
    // Elementor condition format: include/singular/post/in_post_tag/{tag_id}
    const condition = `include/singular/post/in_post_tag/${tagId}`;
    const res = await fetch(`${SITE}/wp-json/wp/v2/elementor_library/4243`, {
      method: "POST", headers,
      body: JSON.stringify({
        meta: {
          _elementor_conditions: [condition],
        },
      }),
    });
    const result = await res.json();
    console.log(`  Set condition on template 4243: ${condition}`);
    console.log(`  Verify conditions: ${JSON.stringify(result.meta?._elementor_conditions)}`);
  } else {
    console.log(`  Would set condition: include/singular/post/in_post_tag/${tagId}`);
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Phoenix template ID: 4243 ("Single Post – Phoenix CTA")`);
  console.log(`Phoenix tag: "phoenix-cta" (ID: ${tagId})`);
  console.log(`Posts to tag: ${phoenixPosts.length}`);
  console.log(`\nHow it works:`);
  console.log(`  - Posts with "phoenix-cta" tag → Phoenix CTA button`);
  console.log(`  - All other posts → Events CTA button (default template 3308)`);
  console.log(`  - For future posts: just add the "phoenix-cta" tag in WordPress`);
  if (!LIVE) {
    console.log(`\nRun with --live to apply:\n  node scripts/setup-phoenix-template.mjs --live`);
  }
}

main().catch(console.error);
