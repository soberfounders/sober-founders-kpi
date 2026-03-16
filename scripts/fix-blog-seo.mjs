#!/usr/bin/env node
/**
 * fix-blog-seo.mjs — Fix blog post Yoast meta (titles + descriptions) for all 33 posts
 * Also handles:
 *   - Duplicate "Ultimate Guide" posts (3290 vs 3252)
 *   - Missing meta descriptions
 *   - Overly long titles
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLines = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8").split("\n");
const env = {};
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)\s*[=\-]\s*(.+)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SITE = env.WP_SITE_URL;
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };
const DRY_RUN = process.argv.includes("--dry-run");

// SEO-optimized titles (50-60 chars) and descriptions (150-160 chars) for each post
const postMeta = {
  // Comparison posts (high-value SEO pages)
  3032: {
    title: "YPO for Sober Founders — How Phoenix Forum Compares",
    desc: "Comparing YPO and Sober Founders' Phoenix Forum for entrepreneurs in recovery. Weekly accountability, $1M+ revenue peers, and sobriety as a shared foundation.",
  },
  3006: {
    title: "EO for Sober Business Owners — Phoenix Forum Alternative",
    desc: "How Entrepreneurs' Organization (EO) compares to Sober Founders' Phoenix Forum for business owners in recovery. Free, weekly, and built for sober entrepreneurs.",
  },
  3014: {
    title: "Vistage for Sober Business Owners — Comparison Guide",
    desc: "Vistage vs Sober Founders' Phoenix Forum: which peer advisory group is right for entrepreneurs in recovery? Compare cost, format, sobriety support, and more.",
  },
  3017: {
    title: "Tiger 21 for Sober Business Owners — Full Comparison",
    desc: "Tiger 21 vs Sober Founders for high-net-worth entrepreneurs in recovery. Compare membership requirements, format, cost, and recovery support side by side.",
  },
  3028: {
    title: "Peer Advisory Groups for Sober Entrepreneurs | Guide",
    desc: "Why a peer advisory group built for sober entrepreneurs outperforms generic business groups. Learn how Sober Founders combines accountability with recovery.",
  },
  3023: {
    title: "Best Peer Group for Sober Entrepreneurs | Sober Founders",
    desc: "Sober Founders is the leading peer group for entrepreneurs in recovery. Free weekly masterminds, 500+ members, and the Phoenix Forum for $1M+ revenue founders.",
  },

  // Pillar / evergreen content
  3290: {
    title: "Ultimate Guide to Entrepreneurship in Recovery (2026)",
    desc: "The complete guide to building a business while maintaining sobriety. Strategies, peer support, and resources for entrepreneurs in recovery from addiction.",
  },
  3252: {
    // This is the duplicate — we'll keep it but differentiate the title
    title: "Entrepreneurship in Recovery: A Practical Guide (2026)",
    desc: "Practical advice for sober entrepreneurs building businesses in recovery. From managing triggers to scaling operations — everything you need to succeed.",
  },
  3147: {
    title: "Entrepreneurs in Recovery — Sober Founders Support",
    desc: "Entrepreneurs in recovery face unique challenges. Sober Founders provides free weekly masterminds, peer mentorship, and the Phoenix Forum for $1M+ founders.",
  },
  2572: {
    title: "12 Steps and Your Business — Recovery Meets Growth",
    desc: "How the 12-step framework applies to business growth for sober entrepreneurs. Practical connections between recovery principles and entrepreneurial success.",
  },
  3132: {
    title: "Mentorship for Sober Founders — Business + Recovery",
    desc: "How Sober Founders' mentorship model aligns business strategy with your recovery journey. Peer mentors who understand both entrepreneurship and sobriety.",
  },

  // Topical / educational posts
  3384: {
    title: "Do Mastermind Groups Help Sober Entrepreneurs?",
    desc: "Research-backed evidence on how mastermind groups benefit sober entrepreneurs. Peer accountability, business growth, and recovery support in one community.",
  },
  3423: {
    title: "Sober Mastermind Meaning — Why Traditional Groups Fall Short",
    desc: "What a sober mastermind actually means and why traditional business groups miss the mark for entrepreneurs in recovery. The case for recovery-first peer groups.",
  },
  3375: {
    title: "EOS for Sober Founders — Operating System Guide",
    desc: "How to implement the Entrepreneurial Operating System (EOS) as a sober founder. Traction, accountability, and business frameworks through a recovery lens.",
  },
  3392: {
    title: "Sober Curious vs Recovery — Which Drives Business?",
    desc: "Sober curious vs committed recovery: which path produces better business results? An honest comparison for entrepreneurs exploring sobriety.",
  },
  3282: {
    title: "Recovery Mastermind Framework for Business Connections",
    desc: "The proven recovery mastermind framework for building authentic business connections. How sober entrepreneurs create high-trust networks that drive growth.",
  },
  3288: {
    title: "Crowdfunding vs Traditional Funding for Sober Startups",
    desc: "Which funding path is better for sober entrepreneurs? Comparing crowdfunding and traditional investment for startups led by founders in recovery.",
  },

  // Listicle / engagement posts
  4081: {
    title: "5 Steps to Scale Your Company and Stay Grounded",
    desc: "How sober founders scale their companies without losing what matters. Five grounding strategies from entrepreneurs who've grown businesses in recovery.",
  },
  4083: {
    title: "Master Business Triggers — The Sober Founder's Guide",
    desc: "Business stress doesn't have to threaten your sobriety. A practical guide to identifying and managing common business triggers as a sober entrepreneur.",
  },
  4012: {
    title: "7 Signs You're Sabotaging Your Sober Business",
    desc: "Self-sabotage is common among entrepreneurs in recovery. Spot these 7 warning signs and learn how successful sober founders break the cycle for good.",
  },
  4059: {
    title: "10 Reasons Your Sober Mastermind Isn't Working",
    desc: "Your mastermind group should accelerate your business — not waste your time. Ten common reasons sober entrepreneur masterminds fail and how to fix them.",
  },
  4014: {
    title: "7 Business Triggers Sober Entrepreneurs Must Handle",
    desc: "Business triggers that most entrepreneurs ignore can be dangerous for those in recovery. Seven common triggers and how sober founders handle them.",
  },
  3418: {
    title: "Is Being Sober Worth It? 7 Business Advantages",
    desc: "Sobriety isn't just good for health — it's good for business. Seven unexpected advantages that sober entrepreneurs have over their drinking competitors.",
  },
  3427: {
    title: "Work-Life Balance for Sober Entrepreneurs | Guide",
    desc: "The simple work-life balance strategy every sober entrepreneur needs. How recovery principles create sustainable business growth without burnout.",
  },
  3301: {
    title: "Sober Entrepreneurs Crushing It in 2026 | 5 Benefits",
    desc: "Sober entrepreneurs are outperforming in 2026. Five performance benefits of sobriety that give recovering founders a measurable business edge.",
  },
  3306: {
    title: "7 Ways Sober Entrepreneurs Let Go Without Losing Edge",
    desc: "Struggling with control in your business? Seven strategies sober entrepreneurs use to delegate, trust their team, and grow without white-knuckling it.",
  },
  3286: {
    title: "7 AI Mistakes Sober Entrepreneurs Make (And Fixes)",
    desc: "AI is transforming business — but sober entrepreneurs face unique challenges with integration. Seven common mistakes and practical fixes for each one.",
  },
  3284: {
    title: "Networking Mistakes Sober Business Owners Make",
    desc: "Networking as a sober business owner has unique challenges. Are you making these common mistakes? How to build genuine connections without alcohol.",
  },
  3401: {
    title: "7 Essential Sober Entrepreneurship Moves for Recovery",
    desc: "Seven business moves that protect your recovery while accelerating growth. Essential strategies for entrepreneurs committed to both sobriety and success.",
  },
  3277: {
    title: "5 Fear Hacks for Entrepreneurs in Recovery",
    desc: "Fear holds back more sober entrepreneurs than competition does. Five quick hacks to stop wasting time on fear and start building with clarity.",
  },
  3414: {
    title: "Good Problems Guide for Sober Entrepreneurs",
    desc: "Business growth creates its own triggers. How successful sober entrepreneurs handle scaling, hiring, and revenue growth without risking their recovery.",
  },
  3420: {
    title: "88% of Entrepreneurs Struggle with Mental Health",
    desc: "88% of entrepreneurs face mental health challenges. How sober business owners are breaking the cycle with peer support, accountability, and recovery tools.",
  },
  2169: {
    title: "Are You the Right Fit for Sober Founders?",
    desc: "Find out if Sober Founders is right for you. Free weekly masterminds for sober entrepreneurs, plus the Phoenix Forum for founders with $1M+ revenue.",
  },
};

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Blog Post SEO Fix — ${Object.keys(postMeta).length} posts`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  let success = 0;
  let failed = 0;

  for (const [id, meta] of Object.entries(postMeta)) {
    const titleLen = meta.title.length;
    const descLen = meta.desc.length;
    const titleOk = titleLen <= 60;
    const descOk = descLen >= 140 && descLen <= 165;

    const flag = !titleOk ? ` [TITLE ${titleLen}ch!]` : !descOk ? ` [DESC ${descLen}ch]` : "";

    if (DRY_RUN) {
      console.log(`  [DRY] ${id} | ${meta.title.substring(0, 55)}${flag}`);
      success++;
      continue;
    }

    try {
      const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          meta: {
            _yoast_wpseo_title: meta.title,
            _yoast_wpseo_metadesc: meta.desc,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.log(`  FAIL ${id} | ${res.status}: ${body.substring(0, 100)}`);
        failed++;
      } else {
        console.log(`  OK   ${id} | ${meta.title.substring(0, 55)}${flag}`);
        success++;
      }
    } catch (e) {
      console.log(`  ERR  ${id} | ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Done: ${success} updated, ${failed} failed`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(console.error);
