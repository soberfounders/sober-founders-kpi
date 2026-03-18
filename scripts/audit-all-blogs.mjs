#!/usr/bin/env node
/**
 * audit-all-blogs.mjs — Fetch all blog posts and output audit data as JSON lines
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
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&mdash;/g, "—").replace(/\s+/g, " ").trim();
}

async function main() {
  const allPosts = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${SITE}/wp-json/wp/v2/posts?status=publish&per_page=100&page=${page}&context=edit`, { headers });
    if (!res.ok) break;
    const posts = await res.json();
    if (!posts.length) break;
    allPosts.push(...posts);
  }
  console.log(`Total posts: ${allPosts.length}`);
  console.log("---");

  for (const post of allPosts) {
    const title = strip(post.title?.raw || post.title?.rendered || "");
    const slug = post.slug;
    const content = post.content?.raw || post.content?.rendered || "";
    const text = strip(content);
    const wordCount = text.split(/\s+/).length;
    const yoastTitle = post.meta?._yoast_wpseo_title || "";
    const yoastDesc = post.meta?._yoast_wpseo_metadesc || "";
    const excerpt = strip(post.excerpt?.raw || post.excerpt?.rendered || "");

    const h2Count = (content.match(/<h2/gi) || []).length;
    const h3Count = (content.match(/<h3/gi) || []).length;
    const hasCta = content.includes("sf-blog-cta");
    const internalLinks = (content.match(/href=["']https?:\/\/soberfounders\.org/gi) || []).length;

    // AI writing tells
    const emDashCount = (text.match(/—/g) || []).length;
    const aiVerbs = ["delve", "leverage", "utilize", "foster", "bolster", "underscore", "unveil", "navigate", "streamline", "endeavour"];
    const aiVerbsFound = aiVerbs.filter(v => text.toLowerCase().includes(v));
    const aiAdj = ["robust", "comprehensive", "pivotal", "transformative", "cutting-edge", "groundbreaking", "seamless", "intricate", "nuanced", "multifaceted", "holistic"];
    const aiAdjFound = aiAdj.filter(a => text.toLowerCase().includes(a));
    const aiPhrases = ["in today's", "in the realm of", "let's delve", "at its core", "it's worth noting", "that being said", "in conclusion"];
    const aiPhrasesFound = aiPhrases.filter(p => text.toLowerCase().includes(p));

    console.log(JSON.stringify({
      id: post.id,
      slug,
      title: title.substring(0, 80),
      wordCount,
      h2Count,
      h3Count,
      hasCta,
      internalLinks,
      yoastTitle: yoastTitle.substring(0, 70),
      yoastTitleLen: yoastTitle.length,
      yoastDesc: yoastDesc.substring(0, 80),
      yoastDescLen: yoastDesc.length,
      excerptLen: excerpt.length,
      emDashCount,
      aiVerbsFound,
      aiAdjFound,
      aiPhrasesFound,
    }));
  }
}
main().catch(console.error);
