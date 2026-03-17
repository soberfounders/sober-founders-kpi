#!/usr/bin/env node
/**
 * seo-audit-eir.mjs — SEO audit for "entrepreneurs in recovery" posts
 * READ ONLY — does not modify anything
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

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function extractHeadings(html) {
  const headings = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    headings.push({ level: parseInt(m[1]), text: stripHtml(m[2]).trim() });
  }
  return headings;
}

function extractLinks(html, siteUrl) {
  const links = { internal: [], external: [] };
  const re = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = stripHtml(m[2]).trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.includes("soberfounders.org") || href.startsWith("/")) {
      links.internal.push({ href, text });
    } else if (href.startsWith("http")) {
      links.external.push({ href, text });
    }
  }
  return links;
}

function extractImages(html) {
  const images = [];
  const re = /<img([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const srcM = attrs.match(/src="([^"]*)"/);
    const altM = attrs.match(/alt="([^"]*)"/);
    images.push({
      src: srcM ? srcM[1] : "(no src)",
      alt: altM ? altM[1] : null,
    });
  }
  return images;
}

function keywordDensity(text, keyword) {
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 0);
  // Count phrase occurrences
  let count = 0;
  let idx = 0;
  while ((idx = lower.indexOf(kw, idx)) !== -1) {
    count++;
    idx += kw.length;
  }
  const kwWords = kw.split(/\s+/).length;
  const density = words.length > 0 ? ((count * kwWords) / words.length) * 100 : 0;
  return { count, density: density.toFixed(2) };
}

function extractSchemaMarkup(html) {
  const schemas = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim());
      schemas.push(obj["@type"] || "unknown");
    } catch {
      schemas.push("(parse error)");
    }
  }
  return schemas;
}

function checkCta(html) {
  const ctas = [];
  // Button blocks
  if (/class="[^"]*wp-block-button[^"]*"/i.test(html)) ctas.push("Gutenberg button block");
  if (/class="[^"]*btn[^"]*"/i.test(html)) ctas.push("CSS btn class");
  // Link text CTAs
  const ctaTexts = ["apply now", "join now", "register", "sign up", "attend", "get started", "learn more", "join the group", "join us", "rsvp"];
  const lc = html.toLowerCase();
  for (const t of ctaTexts) {
    if (lc.includes(t)) ctas.push(`Text CTA: "${t}"`);
  }
  return ctas;
}

function parseMeta(html) {
  const meta = {};
  // Title tag
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  meta.title = titleM ? stripHtml(titleM[1]).trim() : null;

  // Meta description
  const descM = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"[^>]*>/i)
    || html.match(/<meta[^>]+content="([^"]*)"[^>]+name="description"[^>]*>/i);
  meta.description = descM ? descM[1] : null;

  // OG tags
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"[^>]*>/i);
  meta.ogTitle = ogTitle ? ogTitle[1] : null;

  const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"[^>]*>/i);
  meta.ogDescription = ogDesc ? ogDesc[1] : null;

  const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"[^>]*>/i);
  meta.ogImage = ogImage ? ogImage[1] : null;

  const ogUrl = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]*)"[^>]*>/i);
  meta.ogUrl = ogUrl ? ogUrl[1] : null;

  // Canonical
  const canonM = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"[^>]*>/i);
  meta.canonical = canonM ? canonM[1] : null;

  // Robots
  const robotsM = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"[^>]*>/i);
  meta.robots = robotsM ? robotsM[1] : null;

  return meta;
}

async function auditPost(postId) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`AUDITING POST ID: ${postId}`);
  console.log("=".repeat(80));

  // 1. Fetch post via REST API with context=edit for raw content + Yoast fields
  const apiUrl = `${SITE}/wp-json/wp/v2/posts/${postId}?context=edit`;
  console.log(`\nFetching: ${apiUrl}`);
  const apiRes = await fetch(apiUrl, { headers });

  if (!apiRes.ok) {
    console.log(`ERROR: ${apiRes.status} ${apiRes.statusText}`);
    return null;
  }

  const post = await apiRes.json();

  // Basic metadata
  console.log(`\nTitle: ${stripHtml(post.title?.rendered || post.title?.raw || "")}`);
  console.log(`Slug: ${post.slug}`);
  console.log(`Status: ${post.status}`);
  console.log(`Date: ${post.date}`);
  console.log(`Modified: ${post.modified}`);
  console.log(`URL: ${post.link}`);

  // --- CONTENT ANALYSIS (rendered HTML) ---
  const renderedHtml = post.content?.rendered || "";
  const plainText = stripHtml(renderedHtml);
  const wordCount = countWords(plainText);

  console.log(`\n--- CONTENT METRICS ---`);
  console.log(`Word count: ${wordCount}`);

  // Headings
  const headings = extractHeadings(renderedHtml);
  console.log(`\nHeadings (${headings.length} total):`);
  for (const h of headings) {
    console.log(`  H${h.level}: ${h.text.substring(0, 100)}`);
  }

  // Check for H1
  const h1s = headings.filter(h => h.level === 1);
  if (h1s.length === 0) console.log(`  ⚠ NO H1 found in content (usually H1 is the post title)`);
  if (h1s.length > 1) console.log(`  ⚠ MULTIPLE H1s found: ${h1s.length}`);

  // Links
  const links = extractLinks(renderedHtml, SITE);
  console.log(`\nInternal links (${links.internal.length}):`);
  for (const l of links.internal) {
    console.log(`  [${l.text.substring(0, 50)}] → ${l.href}`);
  }
  console.log(`External links (${links.external.length}):`);
  for (const l of links.external) {
    console.log(`  [${l.text.substring(0, 50)}] → ${l.href.substring(0, 80)}`);
  }

  // Images
  const images = extractImages(renderedHtml);
  console.log(`\nImages (${images.length}):`);
  let missingAlt = 0;
  let emptyAlt = 0;
  for (const img of images) {
    if (img.alt === null) {
      missingAlt++;
      console.log(`  ⚠ MISSING ALT: ${img.src.substring(0, 80)}`);
    } else if (img.alt === "") {
      emptyAlt++;
      console.log(`  ⚠ EMPTY ALT (decorative?): ${img.src.substring(0, 80)}`);
    } else {
      console.log(`  ✓ alt="${img.alt.substring(0, 60)}" → ${img.src.substring(img.src.lastIndexOf("/") + 1, img.src.lastIndexOf("/") + 50)}`);
    }
  }

  // Keyword density
  const kd = keywordDensity(plainText, "entrepreneurs in recovery");
  console.log(`\nKeyword: "entrepreneurs in recovery"`);
  console.log(`  Occurrences: ${kd.count}`);
  console.log(`  Density: ${kd.density}%`);
  console.log(`  (Target: 1-2%, i.e. ~${Math.round(wordCount * 0.01)}-${Math.round(wordCount * 0.02)} words coverage)`);

  // Also check title keyword
  const titleText = stripHtml(post.title?.rendered || "").toLowerCase();
  console.log(`  Keyword in title: ${titleText.includes("entrepreneurs in recovery") ? "YES" : "NO"}`);

  // CTAs
  const ctas = checkCta(renderedHtml);
  console.log(`\nCTAs found (${ctas.length}):`);
  if (ctas.length === 0) console.log("  ⚠ NO CTAs found");
  for (const c of ctas) console.log(`  - ${c}`);

  // Raw content (block markup) — check for schema in content
  const rawContent = post.content?.raw || "";
  const schemas = extractSchemaMarkup(renderedHtml);
  console.log(`\nSchema markup in content: ${schemas.length ? schemas.join(", ") : "NONE"}`);

  // Yoast SEO fields — check meta fields
  console.log(`\nYoast / SEO meta fields from API:`);
  const yoastFields = ["yoast_head", "yoast_head_json", "_yoast_wpseo_title", "_yoast_wpseo_metadesc",
    "_yoast_wpseo_focuskw", "_yoast_wpseo_canonical", "_yoast_wpseo_schema_article_type",
    "_yoast_wpseo_schema_page_type", "_yoast_wpseo_primary_category"];
  for (const field of yoastFields) {
    if (post[field] !== undefined) {
      const val = typeof post[field] === "object" ? JSON.stringify(post[field]).substring(0, 200) : String(post[field]).substring(0, 200);
      console.log(`  ${field}: ${val}`);
    }
  }

  // Check yoast_head if present
  if (post.yoast_head) {
    const yMeta = parseMeta(post.yoast_head);
    console.log(`\nYoast head meta:`);
    for (const [k, v] of Object.entries(yMeta)) {
      if (v) console.log(`  ${k}: ${v}`);
    }
    // Schema in yoast_head
    const ySchemas = extractSchemaMarkup(post.yoast_head);
    if (ySchemas.length) console.log(`  Schema types: ${ySchemas.join(", ")}`);
  }

  if (post.yoast_head_json) {
    const yj = post.yoast_head_json;
    console.log(`\nYoast JSON data:`);
    if (yj.title) console.log(`  SEO title: ${yj.title}`);
    if (yj.description) console.log(`  SEO description: ${yj.description}`);
    if (yj.robots) console.log(`  Robots: ${JSON.stringify(yj.robots)}`);
    if (yj.canonical) console.log(`  Canonical: ${yj.canonical}`);
    if (yj.og_title) console.log(`  OG title: ${yj.og_title}`);
    if (yj.og_description) console.log(`  OG description: ${yj.og_description}`);
    if (yj.og_image) console.log(`  OG image: ${JSON.stringify(yj.og_image)}`);
    if (yj.schema) console.log(`  Schema @types: ${JSON.stringify(yj.schema?.["@graph"]?.map(n => n["@type"]) || [])}`);
  }

  // 2. Fetch rendered page HTML
  console.log(`\n--- FETCHING RENDERED PAGE HTML: ${post.link} ---`);
  try {
    const pageRes = await fetch(post.link, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SEOAudit/1.0)",
        "Accept": "text/html"
      }
    });
    if (!pageRes.ok) {
      console.log(`  ERROR fetching page: ${pageRes.status}`);
    } else {
      const pageHtml = await pageRes.text();
      const pageMeta = parseMeta(pageHtml);

      console.log(`\nPage meta tags:`);
      for (const [k, v] of Object.entries(pageMeta)) {
        if (v) console.log(`  ${k}: ${v}`);
      }

      // Schema in page
      const pageSchemas = extractSchemaMarkup(pageHtml);
      console.log(`\nSchema markup types in page HTML: ${pageSchemas.length ? pageSchemas.join(", ") : "NONE"}`);

      // Check keyword in title tag
      const titleLc = (pageMeta.title || "").toLowerCase();
      console.log(`\nKeyword "entrepreneurs in recovery" in title tag: ${titleLc.includes("entrepreneurs in recovery") ? "YES" : "NO"}`);
      console.log(`Keyword in meta description: ${(pageMeta.description || "").toLowerCase().includes("entrepreneurs in recovery") ? "YES" : "NO"}`);

      // Check for noindex
      if (pageMeta.robots && pageMeta.robots.includes("noindex")) {
        console.log(`  ⚠⚠ NOINDEX DETECTED: ${pageMeta.robots}`);
      }

      // First 500 chars of body text
      const bodyMatch = pageHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        const bodyText = stripHtml(bodyMatch[1]);
        const pageWordCount = countWords(bodyText);
        console.log(`\nPage body word count: ${pageWordCount}`);
        const pageKd = keywordDensity(bodyText, "entrepreneurs in recovery");
        console.log(`Keyword density on page: ${pageKd.count} occurrences, ${pageKd.density}%`);
      }
    }
  } catch (err) {
    console.log(`  Error fetching page: ${err.message}`);
  }

  return {
    id: postId,
    slug: post.slug,
    title: stripHtml(post.title?.rendered || ""),
    wordCount,
    headings,
    internalLinks: links.internal,
    externalLinks: links.external,
    images,
    missingAlt,
    emptyAlt,
    keywordCount: kd.count,
    keywordDensity: parseFloat(kd.density),
    ctas,
    url: post.link,
  };
}

async function findEirPosts() {
  console.log("\n--- SEARCHING FOR ALL EIR-RELATED POSTS ---");
  // Search by keyword
  const searchRes = await fetch(`${SITE}/wp-json/wp/v2/posts?search=entrepreneurs+in+recovery&status=publish&per_page=20`, { headers });
  const searchPosts = await searchRes.json();
  console.log(`Search results for "entrepreneurs in recovery": ${searchPosts.length} posts`);
  for (const p of searchPosts) {
    console.log(`  ID ${p.id}: ${stripHtml(p.title.rendered)} — ${p.slug} — ${p.link}`);
  }

  // Also check by slug
  const slugSearch = await fetch(`${SITE}/wp-json/wp/v2/posts?slug=entrepreneurs-in-recovery&status=publish`, { headers });
  const slugPosts = await slugSearch.json();
  console.log(`\nSlug search results: ${slugPosts.length} posts`);
  for (const p of slugPosts) {
    console.log(`  ID ${p.id}: ${p.slug} — ${p.link}`);
  }

  return [...new Set([...searchPosts.map(p => p.id), ...slugPosts.map(p => p.id)])];
}

async function compareForDuplicates(posts) {
  if (posts.length < 2) return;
  console.log("\n\n" + "=".repeat(80));
  console.log("DUPLICATE CONTENT ANALYSIS");
  console.log("=".repeat(80));

  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const a = posts[i];
      const b = posts[j];
      if (!a || !b) continue;

      console.log(`\nComparing Post ${a.id} vs Post ${b.id}:`);
      console.log(`  A: "${a.title}" (${a.wordCount} words, ${a.keywordCount} KW mentions)`);
      console.log(`  B: "${b.title}" (${b.wordCount} words, ${b.keywordCount} KW mentions)`);

      // Compare headings
      const aHeadTexts = a.headings.map(h => h.text.toLowerCase());
      const bHeadTexts = b.headings.map(h => h.text.toLowerCase());
      const sharedHeadings = aHeadTexts.filter(h => bHeadTexts.includes(h));
      console.log(`  Shared headings: ${sharedHeadings.length} / ${Math.max(aHeadTexts.length, bHeadTexts.length)}`);
      if (sharedHeadings.length > 0) {
        for (const h of sharedHeadings) console.log(`    - "${h}"`);
      }

      // URL check
      console.log(`  A URL: ${a.url}`);
      console.log(`  B URL: ${b.url}`);
    }
  }
}

async function main() {
  console.log("SEO AUDIT: Entrepreneurs in Recovery Posts");
  console.log(`Site: ${SITE}`);
  console.log(`Date: ${new Date().toISOString()}`);

  // First find all EIR posts
  const foundIds = await findEirPosts();

  // Target IDs (from brief + search results)
  const targetIds = [...new Set([3147, 3290, 3252, ...foundIds])];
  console.log(`\nTarget post IDs to audit: ${targetIds.join(", ")}`);

  // Audit each
  const results = [];
  for (const id of targetIds) {
    const result = await auditPost(id);
    if (result) results.push(result);
  }

  // Duplicate comparison
  await compareForDuplicates(results);

  // Final summary
  console.log("\n\n" + "=".repeat(80));
  console.log("FINAL SEO AUDIT SUMMARY");
  console.log("=".repeat(80));

  for (const r of results) {
    if (!r) continue;
    const issues = [];
    if (r.wordCount < 1000) issues.push(`LOW WORD COUNT: ${r.wordCount} (target 1500+)`);
    if (r.wordCount > 3000) issues.push(`VERY LONG: ${r.wordCount} words (may need splitting)`);
    if (r.keywordCount < 3) issues.push(`LOW KEYWORD FREQUENCY: "${r.keywordCount}" occurrences`);
    if (r.keywordDensity > 3) issues.push(`KEYWORD STUFFING: ${r.keywordDensity}% density`);
    if (r.internalLinks.length < 2) issues.push(`FEW INTERNAL LINKS: ${r.internalLinks.length}`);
    if (r.missingAlt > 0) issues.push(`${r.missingAlt} images missing alt text`);
    if (r.emptyAlt > 0) issues.push(`${r.emptyAlt} images with empty alt text`);
    if (r.ctas.length === 0) issues.push("NO CTAs");
    if (r.headings.filter(h => h.level === 2).length < 3) issues.push(`FEW H2s: ${r.headings.filter(h => h.level === 2).length}`);

    console.log(`\nPost ${r.id}: "${r.title}"`);
    console.log(`  URL: ${r.url}`);
    console.log(`  Words: ${r.wordCount} | KW occurrences: ${r.keywordCount} (${r.keywordDensity}%) | Internal links: ${r.internalLinks.length} | Images: ${r.images.length}`);
    console.log(`  Issues (${issues.length}): ${issues.length ? issues.join(" | ") : "None"}`);
  }
}

main().catch(console.error);
