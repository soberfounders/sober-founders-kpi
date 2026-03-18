#!/usr/bin/env node
/**
 * optimize-all-blogs.mjs — Full SEO/GEO optimization for all blog posts
 *
 * What it does per post:
 *   1. Sets Yoast SEO title (50-60 chars) + meta description (150-160 chars)
 *   2. Replaces AI writing tells (em dashes, AI verbs/adjectives/phrases)
 *   3. Adds internal links to posts missing them (especially city pages)
 *   4. Appends contextual CTA (Events or Phoenix Forum)
 *
 * Usage:
 *   node scripts/optimize-all-blogs.mjs          # dry run
 *   node scripts/optimize-all-blogs.mjs --live   # actually update posts
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
// 1. SEO META — Yoast titles (50-60 chars) + descriptions (150-160 chars)
// ─────────────────────────────────────────────────────────────────────────────

const seoMeta = {
  // ── New batch (no existing Yoast meta) ────────────────────────────────────
  4620: {
    title: "Sober Entrepreneur in 2026: What It Really Means",
    desc: "What it means to be a sober entrepreneur in 2026. How recovery shapes leadership, decision-making, and business growth for founders who choose sobriety.",
  },
  4444: {
    title: "Entrepreneurs and Addiction: Why Founders Struggle",
    desc: "Why entrepreneurs struggle with addiction more than most. The unique pressures of building a business and how recovery creates stronger, sharper founders.",
  },
  4443: {
    title: "Life After Quitting Alcohol: Entrepreneur Stories",
    desc: "Real stories from entrepreneurs who quit drinking and built better businesses. How sobriety cleared the path to sharper focus, better decisions, and growth.",
  },
  4442: {
    title: "Networking Without Alcohol: Sober Entrepreneur Guide",
    desc: "How sober entrepreneurs build real business connections without alcohol. Practical strategies for networking events, client dinners, and industry meetups.",
  },
  4441: {
    title: "Best Mastermind for Founders in Recovery (2026)",
    desc: "The best mastermind groups for founders in recovery. Compare formats, costs, and outcomes to find the right peer group for sober entrepreneurs in 2026.",
  },
  4440: {
    title: "Sober CEO: How to Run a Company in Recovery",
    desc: "Running a company while staying sober brings unique challenges. How sober CEOs manage stress, lead teams, and make better decisions through recovery.",
  },
  4439: {
    title: "High-Functioning Alcoholic Entrepreneur: Hidden Signs",
    desc: "The hidden struggle of high-functioning alcoholic entrepreneurs. Warning signs, real costs to your business, and how founders find recovery before it's too late.",
  },
  4410: {
    title: "Top Mastermind Groups for Sober Founders (2026)",
    desc: "Ranked list of mastermind groups built for sober founders. Weekly accountability, business strategy, and recovery support from entrepreneurs who get it.",
  },
  4258: {
    title: "Phoenix Forum vs YPO vs EO vs Vistage vs Tiger 21",
    desc: "Side-by-side comparison of Phoenix Forum, YPO, EO, Vistage, and Tiger 21 for sober entrepreneurs. Cost, format, requirements, and recovery support compared.",
  },
  4257: {
    title: "Peer Advisory Groups for Entrepreneurs: Full Guide",
    desc: "The complete 2026 guide to peer advisory groups for entrepreneurs. Compare YPO, EO, Vistage, Tiger 21, and options built for founders in recovery.",
  },
  4077: {
    title: "7 Sober Business Networking Mistakes (and Fixes)",
    desc: "Seven networking mistakes sober business owners make and how to fix each one. Build stronger professional connections without alcohol-centered events.",
  },

  // ── City pages ────────────────────────────────────────────────────────────
  4190: {
    title: "Sober Founders Atlanta: Entrepreneurs in Recovery",
    desc: "Connect with sober entrepreneurs in Atlanta, GA. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },
  4189: {
    title: "Sober Founders Dallas: Entrepreneurs in Recovery",
    desc: "Connect with sober entrepreneurs in Dallas, TX. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },
  4188: {
    title: "Sober Founders San Francisco: Recovery Entrepreneurs",
    desc: "Connect with sober entrepreneurs in San Francisco. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },
  4187: {
    title: "Sober Founders Chicago: Entrepreneurs in Recovery",
    desc: "Connect with sober entrepreneurs in Chicago, IL. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },
  4186: {
    title: "Sober Founders Denver: Entrepreneurs in Recovery",
    desc: "Connect with sober entrepreneurs in Denver, CO. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },
  4185: {
    title: "Sober Founders Nashville: Recovery Entrepreneurs",
    desc: "Connect with sober entrepreneurs in Nashville, TN. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },
  4184: {
    title: "Sober Founders Austin: Entrepreneurs in Recovery",
    desc: "Connect with sober entrepreneurs in Austin, TX. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },
  4183: {
    title: "Sober Founders Miami: Entrepreneurs in Recovery",
    desc: "Connect with sober entrepreneurs in Miami, FL. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },
  4182: {
    title: "Sober Founders Los Angeles: Recovery Entrepreneurs",
    desc: "Connect with sober entrepreneurs in Los Angeles. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },
  4181: {
    title: "Sober Founders New York: Entrepreneurs in Recovery",
    desc: "Connect with sober entrepreneurs in New York. Free weekly masterminds, peer support, and business accountability for founders in recovery. Join online.",
  },

  // ── Existing posts (updating from fix-blog-seo.mjs + new ones) ───────────
  4081: {
    title: "5 Steps to Scale Your Company and Stay Grounded",
    desc: "How sober founders scale their companies without losing what matters. Five grounding strategies from entrepreneurs who've grown businesses in recovery.",
  },
  4083: {
    title: "Master Business Triggers: The Sober Founder's Guide",
    desc: "Business stress does not have to threaten your sobriety. A practical guide to identifying and managing common business triggers as a sober entrepreneur.",
  },
  4012: {
    title: "7 Signs You're Sabotaging Your Sober Business",
    desc: "Self-sabotage is common among entrepreneurs in recovery. Spot these seven warning signs and learn how successful sober founders break the cycle for good.",
  },
  4059: {
    title: "10 Reasons Your Sober Mastermind Isn't Working",
    desc: "Your mastermind group should accelerate your business, not waste your time. Ten common reasons sober entrepreneur masterminds fail and how to fix them.",
  },
  4014: {
    title: "7 Business Triggers Sober Entrepreneurs Must Handle",
    desc: "Business triggers that most entrepreneurs ignore can be dangerous for those in recovery. Seven common triggers and how sober founders handle them safely.",
  },
  3418: {
    title: "Is Being Sober Worth It? 7 Business Advantages",
    desc: "Sobriety is not just good for health. It is good for business. Seven unexpected advantages that sober entrepreneurs have over their drinking competitors.",
  },
  3423: {
    title: "Sober Mastermind Meaning: Why Business Groups Fail",
    desc: "What a sober mastermind actually means and why traditional business groups miss the mark for entrepreneurs in recovery. The case for recovery-first peer groups.",
  },
  3427: {
    title: "Work-Life Balance for Sober Entrepreneurs | Guide",
    desc: "The simple work-life balance strategy every sober entrepreneur needs. How recovery principles create sustainable business growth without burnout or relapse.",
  },
  3301: {
    title: "Sober Entrepreneurs Crushing It in 2026: 5 Benefits",
    desc: "Sober entrepreneurs are outperforming in 2026. Five performance benefits of sobriety that give recovering founders a measurable business edge right now.",
  },
  3306: {
    title: "7 Ways Sober Entrepreneurs Let Go Without Losing Edge",
    desc: "Struggling with control in your business? Seven strategies sober entrepreneurs use to delegate, trust their team, and grow without white-knuckling every decision.",
  },
  3286: {
    title: "7 AI Mistakes Sober Entrepreneurs Make (and Fixes)",
    desc: "AI is changing how businesses operate, but sober entrepreneurs face unique challenges with integration. Seven common mistakes and practical fixes for each.",
  },
  3284: {
    title: "Networking Mistakes Sober Business Owners Make",
    desc: "Networking as a sober business owner has unique challenges. Are you making these common mistakes? How to build genuine connections without alcohol as a crutch.",
  },
  3288: {
    title: "Crowdfunding vs Traditional Funding: Sober Startups",
    desc: "Which funding path is better for sober entrepreneurs? Comparing crowdfunding and traditional investment for startups led by founders in recovery from addiction.",
  },
  3401: {
    title: "7 Sober Entrepreneurship Moves for Your Recovery",
    desc: "Seven business moves that protect your recovery while accelerating growth. Essential strategies for entrepreneurs committed to both sobriety and business success.",
  },
  3392: {
    title: "Sober Curious vs Recovery: Which Drives Business?",
    desc: "Sober curious vs committed recovery: which path produces better business results? An honest comparison for entrepreneurs exploring sobriety and its benefits.",
  },
  3384: {
    title: "Do Mastermind Groups Help Sober Entrepreneurs?",
    desc: "Research-backed evidence on how mastermind groups benefit sober entrepreneurs. Peer accountability, business growth, and recovery support in one community.",
  },
  3375: {
    title: "EOS for Sober Founders: Operating System Guide",
    desc: "How to implement the Entrepreneurial Operating System (EOS) as a sober founder. Traction, accountability, and business frameworks through a recovery lens.",
  },
  3277: {
    title: "5 Fear Hacks for Entrepreneurs in Recovery",
    desc: "Fear holds back more sober entrepreneurs than competition does. Five quick hacks to stop wasting time on fear and start building your business with clarity.",
  },
  3147: {
    title: "Entrepreneurs in Recovery: Why Founders Struggle",
    desc: "Why entrepreneurs struggle with addiction and how sobriety fuels business growth. Data, real stories, and peer support resources for founders in recovery.",
  },
  3132: {
    title: "Mentorship for Sober Founders: Business + Recovery",
    desc: "How the Sober Founders mentorship model aligns business strategy with your recovery journey. Peer mentors who understand both entrepreneurship and sobriety.",
  },
  3032: {
    title: "YPO for Sober Entrepreneurs: Phoenix Forum Compared",
    desc: "Comparing YPO and the Phoenix Forum for entrepreneurs in recovery. Weekly accountability, $1M+ revenue peers, and sobriety as a shared competitive advantage.",
  },
  3028: {
    title: "Peer Advisory for Sober Entrepreneurs: Why It Matters",
    desc: "Why a peer advisory group built for sober entrepreneurs outperforms generic business groups. How Sober Founders combines accountability with recovery support.",
  },
  3023: {
    title: "Best Peer Group for Sober Entrepreneurs (2026)",
    desc: "Sober Founders is the leading peer group for entrepreneurs in recovery. Free weekly masterminds, 500+ members, and the Phoenix Forum for $1M+ revenue founders.",
  },
  3017: {
    title: "Tiger 21 for Sober Entrepreneurs: Full Comparison",
    desc: "Tiger 21 vs Sober Founders for high-net-worth entrepreneurs in recovery. Compare membership requirements, format, cost, and recovery support side by side.",
  },
  3014: {
    title: "Vistage for Sober Entrepreneurs: Phoenix Compared",
    desc: "Vistage vs the Phoenix Forum: which peer advisory group is right for entrepreneurs in recovery? Compare cost, format, sobriety support, and outcomes.",
  },
  3006: {
    title: "EO for Sober Business Owners: Phoenix Compared",
    desc: "How Entrepreneurs' Organization compares to the Phoenix Forum for business owners in recovery. Free, weekly, and built specifically for sober entrepreneurs.",
  },
  2572: {
    title: "12 Steps and Your Business: Recovery Meets Growth",
    desc: "How the 12-step framework applies to business growth for sober entrepreneurs. Practical connections between recovery principles and entrepreneurial success.",
  },
  3414: {
    title: "Good Problems Guide for Sober Entrepreneurs",
    desc: "Business growth creates its own triggers. How successful sober entrepreneurs handle scaling, hiring, and revenue growth without risking their recovery journey.",
  },
  3420: {
    title: "Entrepreneur Mental Health: 88% of Founders Struggle",
    desc: "88% of entrepreneurs face mental health challenges. How sober business owners break the cycle with peer support, accountability, and proven recovery tools.",
  },
  2169: {
    title: "Are You the Right Fit for Sober Founders?",
    desc: "Find out if Sober Founders is right for you. Free weekly masterminds for sober entrepreneurs, plus the Phoenix Forum for founders with $1M+ annual revenue.",
  },
  3282: {
    title: "Recovery Mastermind Framework: Business Connections",
    desc: "The proven recovery mastermind framework for building authentic business connections. How sober entrepreneurs create high-trust networks that drive real growth.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. AI WRITING TELL REPLACEMENTS
// ─────────────────────────────────────────────────────────────────────────────

// Em dash replacements (contextual — replace with commas or colons)
function fixEmDashes(content) {
  // Pattern: word — word (parenthetical em dashes used as aside markers)
  // Replace paired em dashes with commas: "X — which is Y — does Z" → "X, which is Y, does Z"
  let result = content;

  // Paired em dashes (parenthetical): " — text — " → ", text, "
  result = result.replace(/ — ([^—]{3,80}?) — /g, ", $1, ");

  // Single em dash before explanation: " — " → ": " when followed by explanation
  // But only in plain text, not inside HTML attributes
  result = result.replace(/(?<=[a-zA-Z0-9.?!]) — (?=[A-Za-z])/g, ": ");

  return result;
}

// AI verb replacements
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

// AI adjective replacements
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

// AI phrase replacements
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

  // Only fix text content, not HTML tags/attributes
  // We'll apply replacements to text segments between HTML tags
  const segments = result.split(/(<[^>]*>)/);
  for (let i = 0; i < segments.length; i++) {
    // Skip HTML tags
    if (segments[i].startsWith("<")) continue;

    let text = segments[i];

    // Apply em dash fixes
    text = fixEmDashes(text);

    // Apply AI verb replacements
    for (const [pattern, replacement] of aiVerbReplacements) {
      text = text.replace(pattern, replacement);
    }

    // Apply AI adjective replacements
    for (const [pattern, replacement] of aiAdjReplacements) {
      text = text.replace(pattern, replacement);
    }

    // Apply AI phrase replacements
    for (const [pattern, replacement] of aiPhraseReplacements) {
      text = text.replace(pattern, replacement);
    }

    segments[i] = text;
  }

  return segments.join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INTERNAL LINKS — add to posts missing them
// ─────────────────────────────────────────────────────────────────────────────

// City-specific internal link blocks
const CITY_INTERNAL_LINKS = {
  4190: "atlanta", 4189: "dallas", 4188: "san-francisco",
  4187: "chicago", 4186: "denver", 4185: "nashville",
  4184: "austin", 4183: "miami", 4182: "los-angeles", 4181: "new-york",
};

const CITY_LINK_BLOCK = `
<!-- wp:paragraph -->
<p><strong>Connect with sober entrepreneurs near you:</strong> Whether you're local or remote, Sober Founders meets online every week. <a href="https://soberfounders.org/events/">Join a free Thursday mastermind</a> or learn about our <a href="https://soberfounders.org/phoenix-forum-2nd-group/">Phoenix Forum</a> for founders with $1M+ revenue.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Explore more: <a href="https://soberfounders.org/blog/entrepreneurs-in-recovery/">Entrepreneurs in Recovery</a> | <a href="https://soberfounders.org/blog/best-mastermind-group-for-founders-in-recovery/">Best Mastermind for Recovery Founders</a> | <a href="https://soberfounders.org/resources/faq/">FAQ</a></p>
<!-- /wp:paragraph -->`;

// Generic internal link block for posts with 0 links
const GENERIC_LINK_BLOCK = `
<!-- wp:paragraph -->
<p><strong>Related reading:</strong> <a href="https://soberfounders.org/blog/entrepreneurs-in-recovery/">Entrepreneurs in Recovery</a> | <a href="https://soberfounders.org/events/">Free Thursday Mastermind</a> | <a href="https://soberfounders.org/resources/faq/">FAQ</a></p>
<!-- /wp:paragraph -->`;

// Posts with 0 internal links (from audit)
const ZERO_LINK_POSTS = new Set([4257, 4190, 4189, 4188, 4187, 4186, 4185, 4184, 4183, 4182, 4181, 3132, 2572, 2169]);

// ─────────────────────────────────────────────────────────────────────────────
// 4. CTAs — Events or Phoenix Forum
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

// Phoenix CTA for competitor comparison + high-level scaling posts
const PHOENIX_POST_IDS = new Set([
  4258, 4257, 3032, 3006, 3014, 3017, 3028, 3023,
  3414, // Good Problems (scaling)
  4410, 4440, // mastermind for founders, sober CEO
]);

function strip(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&mdash;/g, ",").replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  Blog SEO/GEO Optimization — ${LIVE ? "LIVE MODE" : "DRY RUN"}`);
  console.log(`${"=".repeat(70)}\n`);

  // Fetch all posts
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

  const report = [];
  let updated = 0;
  let failed = 0;

  for (const post of allPosts) {
    const id = post.id;
    const rawContent = post.content?.raw || "";
    const title = strip(post.title?.raw || post.title?.rendered || "");
    const changes = [];

    // ── 1. SEO Meta ──────────────────────────────────────────────────────
    const meta = seoMeta[id];
    const metaPayload = {};
    if (meta) {
      const tLen = meta.title.length;
      const dLen = meta.desc.length;
      metaPayload.meta = {
        _yoast_wpseo_title: meta.title,
        _yoast_wpseo_metadesc: meta.desc,
      };
      changes.push(`SEO title (${tLen}ch) + desc (${dLen}ch)`);
    }

    // ── 2. AI Writing Fixes ──────────────────────────────────────────────
    let newContent = rawContent;
    const beforeText = strip(rawContent);

    newContent = fixAiWritingTells(newContent);
    const afterText = strip(newContent);

    if (beforeText !== afterText) {
      // Count what changed
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
    if (ZERO_LINK_POSTS.has(id) && !rawContent.includes("soberfounders.org/events") && !rawContent.includes("soberfounders.org/blog")) {
      if (CITY_INTERNAL_LINKS[id]) {
        newContent = newContent + "\n" + CITY_LINK_BLOCK;
        changes.push("added city internal links");
      } else {
        newContent = newContent + "\n" + GENERIC_LINK_BLOCK;
        changes.push("added internal links");
      }
    }

    // ── 4. CTA ───────────────────────────────────────────────────────────
    if (!rawContent.includes("sf-blog-cta")) {
      const ctaType = PHOENIX_POST_IDS.has(id) ? "phoenix" : "events";
      const ctaHtml = ctaType === "phoenix" ? PHOENIX_CTA : EVENTS_CTA;
      newContent = newContent + "\n" + ctaHtml;
      changes.push(`added ${ctaType} CTA`);
    }

    // ── Build update payload ─────────────────────────────────────────────
    if (changes.length === 0) {
      console.log(`  SKIP ${id} | ${title.substring(0, 60)} — no changes needed`);
      continue;
    }

    const payload = { ...metaPayload };
    if (newContent !== rawContent) {
      payload.content = newContent;
    }

    const changeSummary = changes.join("; ");
    console.log(`  ${String(id).padEnd(5)} | ${title.substring(0, 50).padEnd(50)} | ${changeSummary}`);

    if (LIVE) {
      try {
        const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${id}`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.text();
          console.log(`         ERROR: ${res.status} — ${err.substring(0, 120)}`);
          failed++;
        } else {
          updated++;
        }
      } catch (e) {
        console.log(`         ERROR: ${e.message}`);
        failed++;
      }
      // Rate limit: 200ms between API calls
      await new Promise(r => setTimeout(r, 200));
    } else {
      updated++;
    }

    report.push({ id, slug: post.slug, title: title.substring(0, 80), changes: changeSummary });
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${LIVE ? "Updated" : "Would update"}: ${updated} posts`);
  if (failed) console.log(`  Failed: ${failed}`);
  console.log(`${"=".repeat(70)}\n`);

  if (!LIVE && updated > 0) {
    console.log(`Run with --live to apply:\n  node scripts/optimize-all-blogs.mjs --live\n`);
  }

  // Write report
  const reportPath = resolve(ROOT, "blog-optimization-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved to: ${reportPath}`);
}

main().catch(console.error);
