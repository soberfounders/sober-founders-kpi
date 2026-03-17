#!/usr/bin/env node
/**
 * audit-blog-ctas.mjs — Fetch all blog posts and analyze their CTAs and content
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
const headers = { Authorization: `Basic ${auth}` };

function strip(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&mdash;/g, "—").replace(/\s+/g, " ").trim();
}

async function main() {
  // Fetch all published posts (paginate)
  const allPosts = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${SITE}/wp-json/wp/v2/posts?status=publish&per_page=100&page=${page}`, { headers });
    if (!res.ok) break;
    const posts = await res.json();
    if (!posts.length) break;
    allPosts.push(...posts);
  }

  console.log(`Found ${allPosts.length} published blog posts.\n`);

  // Keywords that suggest $1M+ / high-level content
  const phoenixKeywords = [
    "phoenix forum", "$1m", "$1 million", "million dollar", "high-revenue",
    "peer advisory", "ypo", "eo ", "vistage", "tiger 21", "scaling",
    "ceo peer", "executive", "seven figure", "8-figure", "multi-million"
  ];

  const results = [];

  for (const post of allPosts) {
    const content = post.content.rendered || "";
    const text = strip(content).toLowerCase();
    const title = strip(post.title.rendered || "");

    const hasEventsLink = /\/events\/|\/thursday\/|\/tuesday\//i.test(content);
    const hasPhoenixLink = /\/phoenix-forum|\/apply\//i.test(content);
    const hasCta = /class="[^"]*(?:btn|cta|button|wp-block-button)/i.test(content) ||
                   />(?:Apply|Join Now|Register|Sign Up|Attend|Get Started)<\//i.test(content);

    // Determine if content is phoenix-level
    const phoenixScore = phoenixKeywords.filter(kw => text.includes(kw) || title.toLowerCase().includes(kw)).length;
    const suggestedCta = phoenixScore >= 2 ? "phoenix" : "events";

    results.push({
      id: post.id,
      slug: post.slug,
      title,
      hasEventsLink,
      hasPhoenixLink,
      hasCta,
      suggestedCta,
      phoenixScore,
      snippet: strip(content).substring(0, 150),
    });
  }

  // Print results
  console.log("ID    | CTA? | Events? | Phoenix? | Suggested | Title");
  console.log("-".repeat(100));
  for (const r of results) {
    console.log(
      `${String(r.id).padEnd(6)}| ${r.hasCta ? "YES " : "NO  "}| ${r.hasEventsLink ? "YES    " : "NO     "}| ${r.hasPhoenixLink ? "YES     " : "NO      "}| ${r.suggestedCta.padEnd(10)}| ${r.title.substring(0, 60)}`
    );
  }

  // Summary
  const noCta = results.filter(r => !r.hasCta);
  const noLinks = results.filter(r => !r.hasEventsLink && !r.hasPhoenixLink);
  console.log(`\n--- Summary ---`);
  console.log(`Total posts: ${results.length}`);
  console.log(`Posts with CTA buttons: ${results.filter(r => r.hasCta).length}`);
  console.log(`Posts with /events/ link: ${results.filter(r => r.hasEventsLink).length}`);
  console.log(`Posts with /phoenix-forum/ link: ${results.filter(r => r.hasPhoenixLink).length}`);
  console.log(`Posts WITHOUT any CTA: ${noCta.length}`);
  console.log(`Posts without ANY internal link: ${noLinks.length}`);
  console.log(`\nSuggested phoenix CTA: ${results.filter(r => r.suggestedCta === "phoenix").length}`);
  console.log(`Suggested events CTA: ${results.filter(r => r.suggestedCta === "events").length}`);

  // List posts that need CTAs
  if (noCta.length) {
    console.log(`\n--- Posts needing CTA ---`);
    for (const r of noCta) {
      console.log(`  ${r.id} (${r.suggestedCta}) — ${r.title}`);
    }
  }
}

main().catch(console.error);
