#!/usr/bin/env node
/**
 * optimize-hopper-blogs.mjs — SEO/GEO optimization for draft + scheduled posts
 *
 * Same treatment as optimize-all-blogs.mjs:
 *   1. Yoast SEO title (50-60 chars) + meta description (150-160 chars)
 *   2. AI writing tell fixes (em dashes, AI verbs/adjectives/phrases)
 *   3. Internal links where missing
 *   4. Contextual CTA (Events or Phoenix Forum)
 *
 * Usage:
 *   node scripts/optimize-hopper-blogs.mjs          # dry run (audit first)
 *   node scripts/optimize-hopper-blogs.mjs --live   # apply changes
 */
import { readFileSync, writeFileSync } from "fs";
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. SEO META
// ─────────────────────────────────────────────────────────────────────────────

const seoMeta = {
  // Drafts
  4407: {
    title: "Why Entrepreneurs Struggle with Addiction | Guide",
    desc: "Why entrepreneurs face higher addiction rates than most professionals. The unique pressures of building a business and how recovery creates stronger founders.",
  },
  4405: {
    title: "Addiction and Entrepreneurship: Turning Struggle",
    desc: "How entrepreneurs turn addiction struggles into business strengths. Real stories of founders who used recovery as fuel for sharper leadership and growth.",
  },
  4211: {
    title: "Work Addiction Recovery: Recognize the Signs",
    desc: "Work addiction is easy to miss when hustle culture rewards it. How to recognize the signs as an entrepreneur and recover without losing your business edge.",
  },

  // Scheduled — publishing soon
  4075: {
    title: "7 Mistakes Overachieving Sober Entrepreneurs Make",
    desc: "Overachieving sober entrepreneurs fall into the same traps. Seven common mistakes that stall your growth and how to fix each one without risking recovery.",
  },
  3421: {
    title: "Sober Entrepreneurship: Proven Stress Strategies",
    desc: "Proven stress management strategies for sober entrepreneurs. How to handle business pressure, tough decisions, and daily grind without risking your sobriety.",
  },
  4071: {
    title: "10 Reasons Your Business Growth Is Stalled (Fix)",
    desc: "Your business growth is stuck and generic advice is not helping. Ten real reasons sober entrepreneurs stall out and how mentorship breaks through each one.",
  },
  3416: {
    title: "Stop Networking at Happy Hours: 5 Better Hacks",
    desc: "Happy hour networking does not work for sober entrepreneurs. Five proven ways to build real business connections without alcohol-centered events or awkward exits.",
  },
  4063: {
    title: "Looking for a Sober Mentor? 5 Things to Know",
    desc: "Finding a sober mentor who understands business and recovery is not easy. Five things every entrepreneur in recovery should know before choosing a mentor.",
  },
  4006: {
    title: "AA Promises Applied to Business: 10 Sober Wins",
    desc: "The AA promises are not just for recovery meetings. Ten ways sober entrepreneurs apply these principles to build better businesses and stronger leadership.",
  },
  4044: {
    title: "7 Mistakes High-Functioning Sober Founders Make",
    desc: "High-functioning sober entrepreneurs hide behind productivity. Seven mistakes that look like success but quietly undermine your business and your recovery.",
  },
  4042: {
    title: "Sober Forum Success: The Entrepreneur's Edge",
    desc: "How sober forums give entrepreneurs an edge that generic business groups cannot match. The structure, accountability, and trust that drive real business results.",
  },
  3930: {
    title: "Board Meetings When Everyone Drinks: A Guide",
    desc: "How to handle board meetings, client dinners, and business events when everyone else is drinking. A practical guide for sober entrepreneurs who refuse to hide.",
  },
  3892: {
    title: "Lead Generation Stuck? 10 Recovery Founder Fixes",
    desc: "Lead generation stalled? Ten strategies from entrepreneurs in recovery who broke through plateaus using the same principles that keep their sobriety strong.",
  },
  3504: {
    title: "Empathetic Leadership for Sober Business Owners",
    desc: "How sober business owners use empathetic leadership to inspire loyalty, retain talent, and build teams that outperform. Recovery makes you a better leader.",
  },
  3450: {
    title: "7 Ways Sober Entrepreneurs Let Go of Control",
    desc: "Struggling with control in your business? Seven ways sober entrepreneurs learn to delegate, trust their teams, and grow without white-knuckling every decision.",
  },
  4079: {
    title: "Why a Sober Business Mastermind Changes Everything",
    desc: "A sober business mastermind is not just another networking group. Why entrepreneurs in recovery who join peer groups grow faster and stay sober longer.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. AI WRITING TELL FIXES (same as optimize-all-blogs.mjs)
// ─────────────────────────────────────────────────────────────────────────────

function fixEmDashes(content) {
  let result = content;
  // Paired em dashes (parenthetical): " — text — " → ", text, "
  result = result.replace(/ — ([^—]{3,80}?) — /g, ", $1, ");
  // Single em dash before explanation: " — " → ": "
  result = result.replace(/(?<=[a-zA-Z0-9.?!]) — (?=[A-Za-z])/g, ": ");
  return result;
}

const aiVerbReplacements = [
  [/\bdelve(?:s|d)? into\b/gi, (m) => m.replace(/delve/i, "explore").replace(/Delve/i, "Explore")],
  [/\bdelve(?:s|d)?\b/gi, (m) => m.replace(/delve/i, "explore").replace(/Delve/i, "Explore")],
  [/\bleverage(?:s|d)?\b/gi, (m) => m.replace(/leverage/i, "use").replace(/Leverage/i, "Use")],
  [/\butilize(?:s|d)?\b/gi, (m) => m.replace(/utilize/i, "use").replace(/Utilize/i, "Use")],
  [/\bfoster(?:s|ed|ing)?\b/gi, (m) => m.replace(/foster/i, "build").replace(/Foster/i, "Build")],
  [/\bbolster(?:s|ed|ing)?\b/gi, (m) => m.replace(/bolster/i, "strengthen").replace(/Bolster/i, "Strengthen")],
  [/\bunderscore(?:s|d)?\b/gi, (m) => m.replace(/underscore/i, "highlight").replace(/Underscore/i, "Highlight")],
  [/\bunveil(?:s|ed|ing)?\b/gi, (m) => m.replace(/unveil/i, "reveal").replace(/Unveil/i, "Reveal")],
  [/\bstreamline(?:s|d)?\b/gi, (m) => m.replace(/streamline/i, "simplify").replace(/Streamline/i, "Simplify")],
  [/\bendeavou?r(?:s|ed|ing)?\b/gi, (m) => m.replace(/endeavou?r/i, "try").replace(/Endeavou?r/i, "Try")],
];

const aiAdjReplacements = [
  [/\brobust\b/gi, "strong"],
  [/\bcomprehensive\b/gi, "complete"],
  [/\bpivotal\b/gi, "key"],
  [/\btransformative\b/gi, "powerful"],
  [/\bcutting-edge\b/gi, "modern"],
  [/\bgroundbreaking\b/gi, "new"],
  [/\bseamless(?:ly)?\b/gi, (m) => m.toLowerCase().includes("ly") ? "smoothly" : "smooth"],
  [/\bintricate\b/gi, "complex"],
  [/\bnuanced\b/gi, "subtle"],
  [/\bmultifaceted\b/gi, "varied"],
  [/\bholistic\b/gi, "complete"],
];

const aiPhraseReplacements = [
  [/In today's (?:fast-paced |digital |ever-evolving |modern )?(?:world|landscape|age|era)/gi, "Today"],
  [/in the realm of/gi, "in"],
  [/Let's delve into/gi, "Here's a look at"],
  [/at its core/gi, "at heart"],
  [/it's worth noting that/gi, "note that"],
  [/that being said/gi, "still"],
  [/In conclusion,?\s*/gi, ""],
  [/in the ever-evolving landscape of/gi, "in"],
];

function fixAiWritingTells(content) {
  let result = content;
  const segments = result.split(/(<[^>]*>)/);
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].startsWith("<")) continue;
    let text = segments[i];
    text = fixEmDashes(text);
    for (const [pattern, replacement] of aiVerbReplacements) {
      text = text.replace(pattern, replacement);
    }
    for (const [pattern, replacement] of aiAdjReplacements) {
      text = text.replace(pattern, replacement);
    }
    for (const [pattern, replacement] of aiPhraseReplacements) {
      text = text.replace(pattern, replacement);
    }
    segments[i] = text;
  }
  return segments.join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INTERNAL LINKS
// ─────────────────────────────────────────────────────────────────────────────

const GENERIC_LINK_BLOCK = `
<!-- wp:paragraph -->
<p><strong>Related reading:</strong> <a href="https://soberfounders.org/blog/entrepreneurs-in-recovery/">Entrepreneurs in Recovery</a> | <a href="https://soberfounders.org/events/">Free Thursday Mastermind</a> | <a href="https://soberfounders.org/resources/faq/">FAQ</a></p>
<!-- /wp:paragraph -->`;

// ─────────────────────────────────────────────────────────────────────────────
// 4. CTAs
// ─────────────────────────────────────────────────────────────────────────────

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
  <p style="color: rgba(255,255,255,0.7); font-size: 1.05rem; max-width: 540px; margin: 0 auto 16px; line-height: 1.65; position: relative;">The Phoenix Forum is a weekly peer advisory group for sober entrepreneurs handling the real challenges of growth: hiring, payroll, partnerships, and everything that comes with scaling.</p>
  <p style="color: rgba(255,255,255,0.5); font-size: 0.9rem; margin: 0 auto 24px; position: relative;"><strong style="color: rgba(255,255,255,0.7);">Requirements:</strong> $1M+ annual revenue &bull; 1+ year of sobriety &bull; Application only</p>
  <a href="https://soberfounders.org/phoenix-forum-registration/" style="display: inline-block; background: #00b286; color: #fff; font-size: 0.95rem; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 30px; text-transform: uppercase; letter-spacing: 0.5px; position: relative;">Apply to Phoenix Forum</a>
</div>
<!-- /sf-blog-cta -->
<!-- /wp:html -->`;

// Phoenix CTA for leadership/scaling/mentorship posts
const PHOENIX_POST_IDS = new Set([
  3504, // Empathetic Leadership
  4042, // Sober Forum Success
  4063, // Sober Mentor
  4006, // AA Promises Applied to Business
]);

function strip(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&mdash;/g, ",").replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  Hopper Blog Optimization — ${LIVE ? "LIVE MODE" : "DRY RUN"}`);
  console.log(`${"=".repeat(70)}\n`);

  // Fetch draft + scheduled posts
  const allPosts = [];
  for (const status of ["draft", "future"]) {
    const res = await fetch(
      `${SITE}/wp-json/wp/v2/posts?status=${status}&per_page=100&context=edit`,
      { headers }
    );
    if (!res.ok) continue;
    const posts = await res.json();
    allPosts.push(...posts);
  }
  console.log(`Found ${allPosts.length} draft/scheduled posts.\n`);

  const report = [];
  let updated = 0;
  let failed = 0;

  for (const post of allPosts) {
    const id = post.id;
    const rawContent = post.content?.raw || "";
    const title = strip(post.title?.raw || post.title?.rendered || "");
    const status = post.status;
    const changes = [];

    // ── 1. SEO Meta ──────────────────────────────────────────────────────
    const meta = seoMeta[id];
    const metaPayload = {};
    if (meta) {
      metaPayload.meta = {
        _yoast_wpseo_title: meta.title,
        _yoast_wpseo_metadesc: meta.desc,
      };
      changes.push(`SEO title (${meta.title.length}ch) + desc (${meta.desc.length}ch)`);
    }

    // ── 2. AI Writing Fixes ──────────────────────────────────────────────
    let newContent = rawContent;
    const beforeText = strip(rawContent);

    newContent = fixAiWritingTells(newContent);
    const afterText = strip(newContent);

    if (beforeText !== afterText) {
      const emBefore = (rawContent.match(/ — /g) || []).length;
      const emAfter = (newContent.match(/ — /g) || []).length;
      const emFixed = emBefore - emAfter;
      if (emFixed > 0) changes.push(`${emFixed} em dashes fixed`);

      const aiWords = ["delve", "leverage", "utilize", "foster", "bolster", "underscore", "unveil", "streamline", "endeavour",
                       "robust", "comprehensive", "pivotal", "transformative", "cutting-edge", "groundbreaking", "seamless", "intricate", "nuanced", "multifaceted", "holistic"];
      const wordsBefore = aiWords.filter(w => beforeText.toLowerCase().includes(w));
      const wordsAfter = aiWords.filter(w => afterText.toLowerCase().includes(w));
      const wordsFixed = wordsBefore.filter(w => !wordsAfter.includes(w));
      if (wordsFixed.length > 0) changes.push(`replaced AI words: ${wordsFixed.join(", ")}`);

      const phrasesBefore = ["in today's", "in the realm of", "let's delve", "at its core", "it's worth noting", "that being said", "in conclusion"];
      const phrasesFixed = phrasesBefore.filter(p => beforeText.toLowerCase().includes(p) && !afterText.toLowerCase().includes(p));
      if (phrasesFixed.length > 0) changes.push(`removed AI phrases: ${phrasesFixed.join(", ")}`);
    }

    // ── 3. Internal Links ────────────────────────────────────────────────
    const hasInternalLinks = /href=["']https?:\/\/soberfounders\.org/i.test(rawContent);
    if (!hasInternalLinks) {
      newContent = newContent + "\n" + GENERIC_LINK_BLOCK;
      changes.push("added internal links");
    }

    // ── 4. CTA ───────────────────────────────────────────────────────────
    if (!rawContent.includes("sf-blog-cta")) {
      const ctaType = PHOENIX_POST_IDS.has(id) ? "phoenix" : "events";
      const ctaHtml = ctaType === "phoenix" ? PHOENIX_CTA : EVENTS_CTA;
      newContent = newContent + "\n" + ctaHtml;
      changes.push(`added ${ctaType} CTA`);
    }

    // ── Build payload ────────────────────────────────────────────────────
    if (changes.length === 0) {
      console.log(`  SKIP ${id} | ${title.substring(0, 55)} — no changes`);
      continue;
    }

    const payload = { ...metaPayload };
    if (newContent !== rawContent) {
      payload.content = newContent;
    }

    const changeSummary = changes.join("; ");
    const statusTag = status === "draft" ? "DRAFT" : "SCHED";
    console.log(`  [${statusTag}] ${String(id).padEnd(5)} | ${title.substring(0, 48).padEnd(48)} | ${changeSummary}`);

    if (LIVE) {
      try {
        const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${id}`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.text();
          console.log(`              ERROR: ${res.status} — ${err.substring(0, 120)}`);
          failed++;
        } else {
          updated++;
        }
      } catch (e) {
        console.log(`              ERROR: ${e.message}`);
        failed++;
      }
      await new Promise(r => setTimeout(r, 200));
    } else {
      updated++;
    }

    report.push({ id, slug: post.slug, status, title: title.substring(0, 80), changes: changeSummary });
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${LIVE ? "Updated" : "Would update"}: ${updated} posts`);
  if (failed) console.log(`  Failed: ${failed}`);
  console.log(`${"=".repeat(70)}\n`);

  if (!LIVE && updated > 0) {
    console.log(`Run with --live to apply:\n  node scripts/optimize-hopper-blogs.mjs --live\n`);
  }

  const reportPath = resolve(ROOT, "hopper-optimization-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved to: ${reportPath}`);
}

main().catch(console.error);
