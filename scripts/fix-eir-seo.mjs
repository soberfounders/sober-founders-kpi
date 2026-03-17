#!/usr/bin/env node
/**
 * fix-eir-seo.mjs — Fix SEO on "Entrepreneurs in Recovery" post (ID 3147)
 *
 * Part 1: Fix post 3147 content (classic editor HTML, no Gutenberg block comments)
 *   - Increase keyword density for "entrepreneurs in recovery"
 *   - Add external citation links (Freeman/UCSF, SAMHSA)
 *   - Add FAQPage JSON-LD schema
 *   - Add CTA button blocks mid-article and bottom
 *   - Fix Yoast meta description
 *
 * Part 2: Set up 301 redirects for duplicates (3252 → 3147, 3290 → 3147)
 *   - Create/update Code Snippet with redirect logic
 *   - Trash posts 3252 and 3290
 *
 * Part 3: Add internal links from city pages (4181–4190) to post 3147
 *
 * Usage:
 *   node scripts/fix-eir-seo.mjs           (dry-run, default)
 *   node scripts/fix-eir-seo.mjs --dry-run  (explicit dry-run)
 *   node scripts/fix-eir-seo.mjs --live     (actually write)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Env loading — tries .env.local first, falls back to .env
// ---------------------------------------------------------------------------
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
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };
const DRY_RUN = !process.argv.includes("--live");

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countKeyword(text, kw) {
  const lower = text.toLowerCase();
  const kwLower = kw.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = lower.indexOf(kwLower, idx)) !== -1) {
    count++;
    idx += kwLower.length;
  }
  return count;
}

function log(msg) {
  process.stdout.write(msg + "\n");
}

function logSection(title) {
  log(`\n${"=".repeat(70)}`);
  log(`  ${title}`);
  log("=".repeat(70));
}

// ---------------------------------------------------------------------------
// PART 1 — Build modified content for post 3147
//
// The post uses classic editor HTML (no <!-- wp: --> block comments in raw).
// All manipulation works directly on the HTML string.
// ---------------------------------------------------------------------------

/**
 * Injection 1: Modify H2 headings to include the keyword phrase.
 * Strategy: find the first H2 that doesn't already contain the phrase and
 * append "for Entrepreneurs in Recovery" to its text, but only if the heading
 * is about challenges/support/sobriety/community themes.
 */
function injectKeywordInH2(raw) {
  let injected = false;
  return raw.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (match, attrs, text) => {
    if (injected) return match;
    const plain = stripHtml(text).toLowerCase();
    if (plain.includes("entrepreneurs in recovery")) return match;
    // Only modify headings with topically relevant words
    const relevant = [
      "challenge", "support", "sobriety", "founder", "recovery",
      "business", "community", "specific", "sober",
    ];
    if (relevant.some(word => plain.includes(word))) {
      injected = true;
      return `<h2${attrs}>${text} for Entrepreneurs in Recovery</h2>`;
    }
    return match;
  });
}

/**
 * Injection 2: Add phrase to the opening of the second <p> block.
 */
function injectKeywordInSecondParagraph(raw) {
  let paraCount = 0;
  return raw.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, text) => {
    paraCount++;
    if (paraCount !== 2) return match;
    const plain = stripHtml(text).toLowerCase();
    if (plain.includes("entrepreneurs in recovery")) return match;
    // Lowercase 'r' in "Recovery" if the original text starts with uppercase
    const trimmed = text.trimStart();
    const firstChar = trimmed[0];
    const rest = firstChar === firstChar.toUpperCase()
      ? firstChar.toLowerCase() + trimmed.slice(1)
      : trimmed;
    return `<p${attrs}>For entrepreneurs in recovery, ${rest}</p>`;
  });
}

/**
 * Injection 3: Insert a bridging paragraph before the last H2 (conclusion area).
 * The last H2 in the article body is "How Do You Get Started If You Are a Sober Entrepreneur?"
 * We'll insert before the second-to-last H2 (which avoids the FAQ H2).
 */
function injectKeywordBeforeConclusion(raw) {
  // Collect all H2 positions
  const h2Re = /<h2[^>]*>[\s\S]*?<\/h2>/gi;
  const matches = [...raw.matchAll(h2Re)];

  // We want to insert before the last non-FAQ H2 (second-to-last overall or the "Get Started" H2)
  // Find "How Do You Get Started" H2
  const getStartedIdx = raw.search(/<h2[^>]*>How Do You Get Started/i);
  if (getStartedIdx === -1) return raw; // fallback: don't modify

  const bridgePara = `\n<p>The growing movement of <strong>entrepreneurs in recovery</strong> proves that sobriety and business success are not opposites — they are mutually reinforcing. When you remove the fog, the shame, and the compulsive coping, you are left with something rare: a founder who can think clearly, lead honestly, and build something that actually lasts.</p>\n`;

  return raw.slice(0, getStartedIdx) + bridgePara + raw.slice(getStartedIdx);
}

/**
 * Injection 4: Swap "founders in sobriety" → "entrepreneurs in recovery" (first occurrence).
 */
function swapFoundersInSobriety(raw) {
  return raw.replace(/founders in sobriety/i, "entrepreneurs in recovery");
}

/**
 * Add external citation links:
 *   - First occurrence of "Dr. Michael Freeman" or "Freeman at UCSF" → michaelafreemanmd.com
 *   - First occurrence of "SAMHSA" → samhsa.gov/data/
 *
 * Skips matches that are already inside an <a> tag.
 */
function addExternalLinks(raw) {
  let content = raw;

  // Freeman / UCSF patterns
  const freemanPatterns = [
    /Dr\.\s*Michael\s*A?\.?\s*Freeman\b/,
    /Freeman\s+et\s+al\.?/,
    /\bUCSF\b/,
    /Freeman\s+at\s+(?:the\s+)?University\s+of\s+California/i,
  ];

  for (const re of freemanPatterns) {
    const gre = new RegExp(re.source, re.flags + "g");
    let replaced = false;
    content = content.replace(gre, (match, offset) => {
      if (replaced) return match;
      // Check if this match is inside an existing <a> tag
      const before = content.slice(0, offset);
      const openACount = (before.match(/<a\b/gi) || []).length;
      const closeACount = (before.match(/<\/a>/gi) || []).length;
      if (openACount > closeACount) return match; // inside <a>
      replaced = true;
      return `<a href="https://www.michaelafreemanmd.com/Research.html" target="_blank" rel="noopener noreferrer">${match}</a>`;
    });
    if (replaced) break; // only apply the first pattern that matches
  }

  // SAMHSA — first occurrence not already linked
  let samhsaReplaced = false;
  content = content.replace(/\bSAMHSA\b/g, (match, offset) => {
    if (samhsaReplaced) return match;
    const before = content.slice(0, offset);
    const openACount = (before.match(/<a\b/gi) || []).length;
    const closeACount = (before.match(/<\/a>/gi) || []).length;
    if (openACount > closeACount) return match;
    samhsaReplaced = true;
    return `<a href="https://www.samhsa.gov/data/" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });

  return content;
}

/**
 * Extract FAQ questions and answers from classic HTML.
 * Looks for <h3>...</h3> immediately followed by <p>...</p>.
 */
function extractFAQs(raw) {
  const faqs = [];
  // Match H3 + the very next paragraph
  const h3Re = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = h3Re.exec(raw)) !== null) {
    const question = stripHtml(m[1]).trim();
    const answer = stripHtml(m[2]).trim();
    if (question && answer && question.length > 5) {
      faqs.push({ question, answer });
    }
  }
  return faqs;
}

/**
 * Build FAQPage JSON-LD schema block (classic editor: raw script tag in HTML).
 */
function buildFAQSchema(faqs) {
  if (faqs.length === 0) return "";

  const schemaObj = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer,
      },
    })),
  };

  return `\n<script type="application/ld+json">\n${JSON.stringify(schemaObj, null, 2)}\n</script>\n`;
}

/**
 * Build mid-article CTA block (classic editor HTML).
 * Uses inline styles to match the site's existing CTA styling patterns.
 */
function buildMidCTABlock() {
  return `
<hr style="margin: 32px 0; border: none; border-top: 2px solid #e5e7eb;" />

<div style="background: #f6f7f9; border-radius: 12px; padding: 32px; text-align: center; margin: 32px 0;">
  <h3 style="font-size: 1.3rem; color: #101828; margin-bottom: 12px;">Connect with Other Entrepreneurs in Recovery</h3>
  <p style="color: #475467; max-width: 520px; margin: 0 auto 20px; line-height: 1.7;">Join 500+ founders who've discovered that sobriety isn't a limitation — it's your competitive edge. Free weekly virtual masterminds for entrepreneurs in recovery.</p>
  <a href="https://soberfounders.org/events/" style="display: inline-block; background: #101828; color: #fff; font-weight: 600; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 0.95rem;">Join a Free Mastermind</a>
</div>

<hr style="margin: 32px 0; border: none; border-top: 2px solid #e5e7eb;" />
`;
}

/**
 * Build bottom CTA block (before FAQ schema).
 */
function buildBottomCTABlock() {
  return `
<hr style="margin: 48px 0; border: none; border-top: 2px solid #e5e7eb;" />

<div style="background: #101828; border-radius: 12px; padding: 40px 32px; text-align: center; margin: 32px 0;">
  <h2 style="color: #fff; font-size: 1.6rem; margin-bottom: 12px;">Take the Next Step as an Entrepreneur in Recovery</h2>
  <p style="color: #d0d5dd; max-width: 560px; margin: 0 auto 24px; line-height: 1.7;">Sober Founders offers free weekly mastermind sessions every Tuesday and Thursday, plus the Phoenix Forum exclusive peer group for founders with $1M+ revenue. All sessions are virtual. No cost to join the general community.</p>
  <p>
    <a href="https://soberfounders.org/events/" style="display: inline-block; background: #00b286; color: #fff; font-weight: 600; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 0.95rem; margin: 0 8px 12px;">Attend a Free Meeting</a>
    <a href="https://soberfounders.org/apply/" style="display: inline-block; background: transparent; color: #fff; font-weight: 600; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 0.95rem; border: 2px solid #fff; margin: 0 8px 12px;">Apply for Membership</a>
  </p>
</div>

<hr style="margin: 48px 0; border: none; border-top: 2px solid #e5e7eb;" />
`;
}

/**
 * Inject mid-article CTA after the 3rd H2 block.
 * Post has H2s: What Does It Mean / Why Are Entrepreneurs / How Does Recovery / What Specific Challenges / ...
 * After the 3rd H2's section content (before the 4th H2) is a natural midpoint.
 */
function injectMidCTA(raw) {
  // Find all H2 opening tags positions
  const h2Re = /<h2[^>]*>/gi;
  const h2Positions = [];
  let m;
  while ((m = h2Re.exec(raw)) !== null) {
    h2Positions.push(m.index);
  }

  if (h2Positions.length < 4) return raw; // safety

  // Insert just before the 4th H2
  const insertIdx = h2Positions[3];
  return raw.slice(0, insertIdx) + buildMidCTABlock() + raw.slice(insertIdx);
}

/**
 * Inject bottom CTA before the "Frequently Asked Questions" H2.
 */
function injectBottomCTA(raw) {
  const faqH2Idx = raw.search(/<h2[^>]*>Frequently Asked Questions<\/h2>/i);
  if (faqH2Idx === -1) {
    // Fallback: before last H2
    const lastH2Idx = raw.lastIndexOf("<h2");
    if (lastH2Idx === -1) return raw + buildBottomCTABlock();
    return raw.slice(0, lastH2Idx) + buildBottomCTABlock() + raw.slice(lastH2Idx);
  }
  return raw.slice(0, faqH2Idx) + buildBottomCTABlock() + raw.slice(faqH2Idx);
}

/**
 * Master function: takes raw classic HTML content and returns modified version.
 */
function buildModifiedContent(raw) {
  let content = raw;

  // 1. Keyword injections (order matters — each step sees the previous result)
  content = injectKeywordInH2(content);
  content = injectKeywordInSecondParagraph(content);
  content = injectKeywordBeforeConclusion(content);
  content = swapFoundersInSobriety(content);

  // 2. External citation links (applied before CTAs to avoid modifying CTA HTML)
  content = addExternalLinks(content);

  // 3. Mid-article CTA
  content = injectMidCTA(content);

  // 4. Bottom CTA
  content = injectBottomCTA(content);

  // 5. FAQ schema appended at end (extract from original content before modifications)
  const faqs = extractFAQs(raw);
  const faqSchema = buildFAQSchema(faqs);
  if (faqSchema) {
    content = content + faqSchema;
  }

  return { content, faqCount: faqs.length };
}

// ---------------------------------------------------------------------------
// PART 2 — 301 Redirects via Code Snippet
// ---------------------------------------------------------------------------

const REDIRECT_PHP = `// EIR duplicate redirect — 301s to canonical /entrepreneurs-in-recovery/
// Deployed by fix-eir-seo.mjs
add_action('template_redirect', function() {
    $request = $_SERVER['REQUEST_URI'];

    // Strip query string for matching
    $path = strtok($request, '?');

    $redirects = array(
        '/the-ultimate-guide-to-entrepreneurship-in-recovery-everything-you-need-to-succeed-in-2026/'  => '/entrepreneurs-in-recovery/',
        '/the-ultimate-guide-to-entrepreneurship-in-recovery-everything-you-need-to-succeed-in-2026-2/' => '/entrepreneurs-in-recovery/',
    );

    if (isset($redirects[$path])) {
        wp_redirect(home_url($redirects[$path]), 301);
        exit;
    }
}, 1);`;

const SNIPPET_NAME = "EIR Duplicate Redirects — 301 to /entrepreneurs-in-recovery/";

async function upsertRedirectSnippet() {
  logSection("Part 2: Redirect Snippet");

  if (DRY_RUN) {
    log("[DRY] Would create/update Code Snippet:");
    log(`  Name: ${SNIPPET_NAME}`);
    log("  Redirects:");
    log("    /the-ultimate-guide-to-entrepreneurship-in-recovery-everything-you-need-to-succeed-in-2026/ → /entrepreneurs-in-recovery/");
    log("    /the-ultimate-guide-to-entrepreneurship-in-recovery-everything-you-need-to-succeed-in-2026-2/ → /entrepreneurs-in-recovery/");
    log(`  PHP snippet (first 200 chars): ${REDIRECT_PHP.slice(0, 200)}...`);
    return;
  }

  // List existing snippets to check for existing one
  const listRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, { headers });
  if (!listRes.ok) {
    log(`FAIL listing snippets: ${listRes.status} ${await listRes.text().then(t => t.slice(0, 100))}`);
    return;
  }
  const snippets = await listRes.json();

  let existingId = null;
  for (const s of snippets) {
    if (s.name && s.name.includes("EIR Duplicate Redirect")) {
      existingId = s.id;
      log(`Found existing snippet #${existingId}: "${s.name}"`);
      break;
    }
  }

  let data;
  if (existingId) {
    log(`Updating snippet #${existingId}...`);
    const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${existingId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: SNIPPET_NAME, code: REDIRECT_PHP, active: true }),
    });
    data = await res.json();
    log(`OK   Updated #${existingId} | Active: ${data.active} | Error: ${data.code_error || "none"}`);
  } else {
    log("Creating new redirect snippet...");
    const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: SNIPPET_NAME,
        desc: "301 redirects from duplicate EIR posts to canonical /entrepreneurs-in-recovery/",
        code: REDIRECT_PHP,
        active: true,
        scope: "front-end",
        priority: 1,
      }),
    });
    data = await res.json();
    log(`OK   Created snippet #${data.id} | Active: ${data.active} | Error: ${data.code_error || "none"}`);
  }
}

async function trashDuplicatePosts() {
  const idsToTrash = [3252, 3290];
  logSection("Part 2b: Trash Duplicate Posts");

  for (const id of idsToTrash) {
    if (DRY_RUN) {
      log(`[DRY] Would trash post ${id}`);
      continue;
    }

    // Verify the post exists before trashing
    const checkRes = await fetch(
      `${SITE}/wp-json/wp/v2/posts/${id}?context=edit&_fields=id,status,title,slug`,
      { headers },
    );
    if (!checkRes.ok) {
      log(`SKIP ${id} — fetch failed (${checkRes.status}), may already be trashed or missing`);
      continue;
    }
    const post = await checkRes.json();
    const title = stripHtml(post.title?.raw || post.title?.rendered || "").slice(0, 60);

    if (post.status === "trash") {
      log(`SKIP ${id} ("${title}") — already trashed`);
      continue;
    }

    const trashRes = await fetch(`${SITE}/wp-json/wp/v2/posts/${id}`, {
      method: "DELETE",
      headers,
    });
    if (trashRes.ok) {
      log(`OK   Trashed post ${id} (slug: ${post.slug})`);
    } else {
      const err = await trashRes.text();
      log(`FAIL Trash ${id} — ${trashRes.status}: ${err.slice(0, 100)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// PART 3 — Add internal links from city pages to post 3147
// ---------------------------------------------------------------------------

// IDs 4181-4190 (city landing pages created by create-location-pages.mjs)
const CITY_PAGE_IDS = [4181, 4182, 4183, 4184, 4185, 4186, 4187, 4188, 4189, 4190];

/**
 * Returns a paragraph with an internal link to the EIR post.
 * Varies anchor text per page index to avoid exact-duplicate anchors.
 */
function buildInternalLinkParagraph(idx) {
  const variants = [
    `<p>Read more about how <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> are building stronger businesses with peer support and accountability.</p>`,
    `<p>Learn how <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> are leveraging sobriety as a competitive advantage in today's market.</p>`,
    `<p>Discover why <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> consistently outperform their peers — and how Sober Founders supports that journey.</p>`,
    `<p>Find out how the <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> community uses peer accountability to scale businesses while protecting sobriety.</p>`,
    `<p>Explore the research-backed story of why <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> are thriving in business across America.</p>`,
    `<p>See how <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> build high-trust networks that drive both personal and professional growth.</p>`,
    `<p>Read our guide for <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> — covering mindset, peer support, and the frameworks that actually work.</p>`,
    `<p>Learn the real advantages <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> have, and why more founders are choosing sobriety as their foundation.</p>`,
    `<p>Understand the unique challenges and opportunities facing <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> building businesses in today's economy.</p>`,
    `<p>Explore our resource for <a href="/entrepreneurs-in-recovery/">entrepreneurs in recovery</a> who want peer community, accountability, and business growth in one place.</p>`,
  ];
  return "\n" + variants[idx % variants.length] + "\n";
}

async function addCityInternalLinks() {
  logSection("Part 3: City Pages — Internal Links to /entrepreneurs-in-recovery/");

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (let i = 0; i < CITY_PAGE_IDS.length; i++) {
    const id = CITY_PAGE_IDS[i];

    // Fetch raw content
    const fetchRes = await fetch(
      `${SITE}/wp-json/wp/v2/posts/${id}?context=edit&_fields=id,title,slug,status,content`,
      { headers },
    );
    if (!fetchRes.ok) {
      log(`FAIL  ${id} — fetch error ${fetchRes.status}`);
      failCount++;
      continue;
    }

    const post = await fetchRes.json();
    const title = stripHtml(post.title?.raw || post.title?.rendered || "").slice(0, 60);
    const raw = post.content?.raw || "";

    // Skip if already links to /entrepreneurs-in-recovery/
    if (raw.includes("/entrepreneurs-in-recovery/")) {
      log(`SKIP  ${id} "${title}" — already has EIR link`);
      skipCount++;
      continue;
    }

    // Build the link paragraph
    const linkPara = buildInternalLinkParagraph(i);

    // Detect if it's Gutenberg blocks or classic HTML
    const isGutenberg = raw.includes("<!-- wp:");

    let newContent;
    if (isGutenberg) {
      // For Gutenberg: insert before the last <!-- wp:buttons --> or <!-- wp:separator -->,
      // wrapped in a wp:paragraph block
      const gutenbergPara = `\n<!-- wp:paragraph -->\n${linkPara.trim()}\n<!-- /wp:paragraph -->\n`;
      const buttonsIdx = raw.lastIndexOf("<!-- wp:buttons");
      const separatorIdx = raw.lastIndexOf("<!-- wp:separator");
      const insertBefore = Math.max(buttonsIdx, separatorIdx);
      if (insertBefore > -1) {
        newContent = raw.slice(0, insertBefore) + gutenbergPara + raw.slice(insertBefore);
      } else {
        newContent = raw + gutenbergPara;
      }
    } else {
      // Classic editor: append before the closing </div> of the content, or just append
      // Try to insert before the last <hr> if any, otherwise append
      const lastHrIdx = raw.lastIndexOf("<hr");
      if (lastHrIdx > -1) {
        newContent = raw.slice(0, lastHrIdx) + linkPara + raw.slice(lastHrIdx);
      } else {
        newContent = raw + linkPara;
      }
    }

    if (DRY_RUN) {
      log(`[DRY] ${id} "${title}" — would insert EIR link (${isGutenberg ? "Gutenberg" : "classic"})`);
      log(`      ${linkPara.slice(0, 120).trim()}`);
      successCount++;
      continue;
    }

    const updateRes = await fetch(`${SITE}/wp-json/wp/v2/posts/${id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: newContent }),
    });

    if (updateRes.ok) {
      log(`OK    ${id} "${title}"`);
      successCount++;
    } else {
      const err = await updateRes.text();
      log(`FAIL  ${id} "${title}" — ${updateRes.status}: ${err.slice(0, 100)}`);
      failCount++;
    }
  }

  log(`\nCity pages: ${successCount} updated, ${skipCount} skipped, ${failCount} failed`);
}

// ---------------------------------------------------------------------------
// PART 1 — Fix post 3147
// ---------------------------------------------------------------------------

const POST_ID = 3147;
const META_DESC = "Entrepreneurs in recovery are 2x more likely to struggle with addiction. Learn why sobriety is your competitive edge and join 500+ founders building sober.";

async function fixPost3147() {
  logSection("Part 1: Fix Post 3147 — Entrepreneurs in Recovery");

  // Fetch raw post with full context=edit
  log(`Fetching post ${POST_ID} with context=edit...`);
  const fetchRes = await fetch(
    `${SITE}/wp-json/wp/v2/posts/${POST_ID}?context=edit`,
    { headers },
  );
  if (!fetchRes.ok) {
    throw new Error(
      `Failed to fetch post ${POST_ID}: ${fetchRes.status} ${await fetchRes.text().then(t => t.slice(0, 200))}`,
    );
  }

  const post = await fetchRes.json();
  const raw = post.content?.raw || "";
  const title = stripHtml(post.title?.raw || post.title?.rendered || "");
  const isGutenberg = raw.includes("<!-- wp:");

  log(`Title: ${title}`);
  log(`Slug: ${post.slug}`);
  log(`Status: ${post.status}`);
  log(`Editor type: ${isGutenberg ? "Gutenberg blocks" : "Classic editor HTML"}`);
  log(`Raw content length: ${raw.length} chars`);

  // Count current keyword occurrences
  const plainText = stripHtml(raw);
  const beforeCount = countKeyword(plainText, "entrepreneurs in recovery");
  log(`\nKeyword "entrepreneurs in recovery" count BEFORE: ${beforeCount}`);

  // Extract FAQs for preview
  const faqs = extractFAQs(raw);
  log(`\nFAQ H3 questions found (${faqs.length}):`);
  for (const faq of faqs) {
    log(`  Q: ${faq.question.slice(0, 80)}`);
    log(`  A: ${faq.answer.slice(0, 100)}...`);
  }

  // Build modified content
  const { content: newContent, faqCount } = buildModifiedContent(raw);

  // Count keyword in new version
  const afterCount = countKeyword(stripHtml(newContent), "entrepreneurs in recovery");
  const delta = afterCount - beforeCount;
  log(`\nKeyword count AFTER: ${afterCount} (+${delta})`);
  log(`Content length: ${raw.length} → ${newContent.length} chars (+${newContent.length - raw.length})`);

  // Verify external links were injected
  const freemanLinked = newContent.includes("michaelafreemanmd.com");
  const samhsaLinked = newContent.includes("samhsa.gov");
  log(`\nExternal links injected:`);
  log(`  Freeman/UCSF → michaelafreemanmd.com: ${freemanLinked ? "YES" : "NO (pattern not found in content)"}`);
  log(`  SAMHSA → samhsa.gov: ${samhsaLinked ? "YES" : "NO (pattern not found in content)"}`);

  // Verify CTA blocks
  const hasMidCTA = newContent.includes("Join a Free Mastermind");
  const hasBottomCTA = newContent.includes("Attend a Free Meeting");
  log(`\nCTA blocks injected:`);
  log(`  Mid-article "Join a Free Mastermind": ${hasMidCTA ? "YES" : "MISSING"}`);
  log(`  Bottom "Attend a Free Meeting": ${hasBottomCTA ? "YES" : "MISSING"}`);

  // Verify FAQ schema
  log(`\nFAQ schema entries: ${faqCount}`);
  const hasFAQSchema = newContent.includes('"FAQPage"');
  log(`FAQPage JSON-LD added: ${hasFAQSchema ? "YES" : "NO"}`);

  if (DRY_RUN) {
    log(`\n[DRY] Would update post ${POST_ID}:`);
    log(`  - Keyword count: ${beforeCount} → ${afterCount} (+${delta})`);
    log(`  - FAQ schema entries: ${faqCount}`);
    log(`  - Yoast meta description: "${META_DESC}"`);

    // Show first keyword injection site
    const firstKwIdx = newContent.toLowerCase().indexOf("entrepreneurs in recovery");
    if (firstKwIdx > -1) {
      log(`\nFirst keyword context (chars ${Math.max(0, firstKwIdx - 40)}–${firstKwIdx + 60}):`);
      log("  " + newContent.slice(Math.max(0, firstKwIdx - 40), firstKwIdx + 60).replace(/\n/g, " "));
    }

    // Show bridge paragraph injection
    const bridgeIdx = newContent.indexOf("The growing movement of");
    if (bridgeIdx > -1) {
      log(`\nBridge paragraph (first 120 chars):`);
      log("  " + newContent.slice(bridgeIdx, bridgeIdx + 120).replace(/\n/g, " "));
    }
    return;
  }

  // --- LIVE: Update post content ---
  log(`\nUpdating post ${POST_ID} content...`);
  const updateRes = await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: newContent }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    throw new Error(`Failed to update post ${POST_ID}: ${updateRes.status} ${err.slice(0, 300)}`);
  }

  const updated = await updateRes.json();
  log(`OK   Post ${POST_ID} content updated. Modified: ${updated.modified}`);

  // --- Update Yoast meta description via sober/v1/seo endpoint ---
  log(`\nUpdating Yoast meta description via sober/v1/seo...`);
  const seoRes = await fetch(`${SITE}/wp-json/sober/v1/seo`, {
    method: "POST",
    headers,
    body: JSON.stringify({ post_id: POST_ID, description: META_DESC }),
  });
  if (seoRes.ok) {
    const seoData = await seoRes.json();
    log(`OK   Meta description: ${JSON.stringify(seoData)}`);
  } else {
    const seoErr = await seoRes.text();
    log(`WARN Meta description update failed (${seoRes.status}): ${seoErr.slice(0, 100)}`);
  }

  // Verify keyword count via re-fetch
  log("\nVerifying — re-fetching post content...");
  const verifyRes = await fetch(
    `${SITE}/wp-json/wp/v2/posts/${POST_ID}?context=edit&_fields=content,modified`,
    { headers },
  );
  if (verifyRes.ok) {
    const verifyData = await verifyRes.json();
    const verifyRaw = verifyData.content?.raw || "";
    const verifyCount = countKeyword(stripHtml(verifyRaw), "entrepreneurs in recovery");
    const freemanOk = verifyRaw.includes("michaelafreemanmd.com");
    const samhsaOk = verifyRaw.includes("samhsa.gov");
    const faqOk = verifyRaw.includes('"FAQPage"');
    const midCtaOk = verifyRaw.includes("Join a Free Mastermind");
    const bottomCtaOk = verifyRaw.includes("Attend a Free Meeting");

    log(`  Keyword count: ${verifyCount} (was ${beforeCount}, added +${verifyCount - beforeCount})`);
    log(`  Freeman link: ${freemanOk ? "PASS" : "FAIL"}`);
    log(`  SAMHSA link: ${samhsaOk ? "PASS" : "FAIL"}`);
    log(`  FAQPage schema: ${faqOk ? "PASS" : "FAIL"}`);
    log(`  Mid CTA: ${midCtaOk ? "PASS" : "FAIL"}`);
    log(`  Bottom CTA: ${bottomCtaOk ? "PASS" : "FAIL"}`);

    if (verifyCount < beforeCount + 3) {
      log(`  WARN: Expected at least +3 occurrences, got +${verifyCount - beforeCount}`);
    } else {
      log(`  PASS: Keyword density improved`);
    }
  }

  // Verify Yoast meta via sober/v1/seo read endpoint
  log("\nVerifying Yoast meta description...");
  const metaCheckRes = await fetch(
    `${SITE}/wp-json/sober/v1/seo/${POST_ID}`,
    { headers },
  );
  if (metaCheckRes.ok) {
    const metaData = await metaCheckRes.json();
    const desc = metaData.description || "";
    if (desc.toLowerCase().includes("entrepreneurs in recovery")) {
      log(`  PASS: Meta description contains keyword`);
      log(`  Desc: ${desc}`);
    } else {
      log(`  WARN: Unexpected description — "${desc.slice(0, 150)}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Verification (live mode only)
// ---------------------------------------------------------------------------
async function verifyRedirects() {
  logSection("Verification: 301 Redirects");
  const slugsToCheck = [
    "/the-ultimate-guide-to-entrepreneurship-in-recovery-everything-you-need-to-succeed-in-2026/",
    "/the-ultimate-guide-to-entrepreneurship-in-recovery-everything-you-need-to-succeed-in-2026-2/",
  ];
  for (const slug of slugsToCheck) {
    const url = `${SITE}${slug}`;
    try {
      const res = await fetch(url, { redirect: "manual" });
      const location = res.headers.get("location") || "";
      const passed = res.status === 301 && location.includes("entrepreneurs-in-recovery");
      log(`  ${passed ? "PASS" : "FAIL"} HTTP ${res.status} | ${slug}`);
      if (location) log(`         → Location: ${location}`);
    } catch (e) {
      log(`  ERR  ${slug} — ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log(`\n${"=".repeat(70)}`);
  log("  fix-eir-seo.mjs — Entrepreneurs in Recovery SEO Fix");
  log(`  Site: ${SITE}`);
  log(`  Mode: ${DRY_RUN ? "DRY RUN (pass --live to apply changes)" : "LIVE"}`);
  log(`  Date: ${new Date().toISOString()}`);
  log("=".repeat(70));

  // Part 1: Fix post 3147
  await fixPost3147();

  // Part 2: Redirect snippet + trash duplicates
  await upsertRedirectSnippet();
  await trashDuplicatePosts();

  // Part 3: City page internal links
  await addCityInternalLinks();

  // Final verification (live only)
  if (!DRY_RUN) {
    await verifyRedirects();
  }

  log(`\n${"=".repeat(70)}`);
  log(`  Complete — Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  log("=".repeat(70));
  log("");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
