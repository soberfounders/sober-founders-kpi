#!/usr/bin/env node
/**
 * update-good-problems-blog.mjs — SEO improvements for "The Good Problems Guide"
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
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${AUTH}` };

const POST_ID = 3414;

// ---------------------------------------------------------------------------
// FAQ + CTA block to append
// ---------------------------------------------------------------------------
const FAQ_AND_CTA = `

<h2>Frequently Asked Questions</h2>

<h3>Can business growth trigger relapse?</h3>
<p>Yes. Business growth creates stress, and stress is one of the most common relapse triggers. The pressure of scaling — hiring, managing cash flow, making high-stakes decisions — can activate the same neural pathways that addiction exploits. That's why sober entrepreneurs need growth strategies that protect recovery, not undermine it. <a href="/weekly-mastermind-group/">Our weekly mastermind groups</a> give founders a safe place to process these pressures in real time.</p>

<h3>How do sober entrepreneurs manage stress without substances?</h3>
<p>Successful sober entrepreneurs build proactive stress management systems: morning routines, exercise, therapy, peer support groups, and clear boundaries around work hours. The key is creating these systems <em>before</em> crisis hits, not after. Many of our members credit <a href="/events/">the weekly mastermind sessions</a> as a core part of their stress management toolkit.</p>

<h3>What's the biggest advantage sober entrepreneurs have over their peers?</h3>
<p>Clarity. Without substances clouding judgment, sober entrepreneurs make sharper decisions, build more authentic relationships, and assess risk more accurately. Recovery also teaches resilience, accountability, and radical honesty — skills that translate directly into stronger businesses. At <a href="/our-story/">Sober Founders</a>, we've seen members leverage these advantages to build companies generating $1M+ in annual revenue.</p>

<hr style="margin: 48px 0; border: none; border-top: 1px solid #e5e7eb;" />

<div style="background: #f6f7f9; border-radius: 16px; padding: 40px 32px; text-align: center; margin: 32px 0;">
  <h2 style="font-family: 'DM Serif Display', serif; font-size: 1.6rem; color: #101828; margin-bottom: 12px;">You Don't Have to Scale Alone</h2>
  <p style="color: #475467; font-size: 1.05rem; max-width: 560px; margin: 0 auto 24px; line-height: 1.7;">Join 500+ sober entrepreneurs who understand that business growth and recovery aren't competing priorities — they're complementary strengths.</p>
  <p>
    <a href="/events/" style="display: inline-block; background: #00b286; color: #fff; font-weight: 600; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 8px 12px;">Attend a Free Meeting</a>
    <a href="/phoenix-forum-registration/" style="display: inline-block; background: transparent; color: #00b286; font-weight: 600; padding: 12px 28px; border-radius: 30px; text-decoration: none; font-size: 0.95rem; border: 2px solid #00b286; margin: 0 8px 12px;">Apply to Phoenix Forum</a>
  </p>
</div>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Can business growth trigger relapse?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Business growth creates stress, and stress is one of the most common relapse triggers. The pressure of scaling — hiring, managing cash flow, making high-stakes decisions — can activate the same neural pathways that addiction exploits. That's why sober entrepreneurs need growth strategies that protect recovery, not undermine it."
      }
    },
    {
      "@type": "Question",
      "name": "How do sober entrepreneurs manage stress without substances?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Successful sober entrepreneurs build proactive stress management systems: morning routines, exercise, therapy, peer support groups, and clear boundaries around work hours. The key is creating these systems before crisis hits, not after."
      }
    },
    {
      "@type": "Question",
      "name": "What's the biggest advantage sober entrepreneurs have over their peers?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Clarity. Without substances clouding judgment, sober entrepreneurs make sharper decisions, build more authentic relationships, and assess risk more accurately. Recovery also teaches resilience, accountability, and radical honesty — skills that translate directly into stronger businesses."
      }
    }
  ]
}
</script>`;

async function main() {
  console.log("Fetching post...");
  const postRes = await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}?context=edit&_fields=id,content,slug`, { headers });
  const post = await postRes.json();
  let content = post.content?.raw || "";
  const currentSlug = post.slug;
  console.log("  Current slug:", currentSlug);
  console.log("  Current content length:", content.length);

  // --- 1. Add internal links throughout the body ---

  // Link "peer group" to mastermind page
  content = content.replace(
    'Your peer group handles the intersection of both.',
    'Your <a href="/weekly-mastermind-group/">peer group</a> handles the intersection of both.'
  );

  // Link "mastermind" mention to events
  content = content.replace(
    'One member of our mastermind shared',
    'One member of our <a href="/weekly-mastermind-group/">weekly mastermind</a> shared'
  );

  // Link recovery practices section to events
  content = content.replace(
    'Whether it\'s AA, therapy, or peer support, these appointments',
    'Whether it\'s AA, therapy, or <a href="/events/">peer support</a>, these appointments'
  );

  // Link "Mentor newer entrepreneurs" to our story
  content = content.replace(
    '<strong>Mentor newer entrepreneurs in recovery.</strong>',
    '<strong><a href="/our-story/">Mentor newer entrepreneurs in recovery.</a></strong>'
  );

  // Link "community for other struggling entrepreneurs" to homepage
  content = content.replace(
    'creates community for other struggling entrepreneurs.',
    'creates <a href="/">community for other struggling entrepreneurs</a>.'
  );

  // Add link to Phoenix Forum in the delegation section
  content = content.replace(
    'This skill proves invaluable when scaling requires calculated risks.',
    'This skill proves invaluable when scaling requires calculated risks. (Founders at this level often find their fit in the <a href="/phoenix-forum-registration/">Phoenix Forum</a>, our peer advisory board for $1M+ entrepreneurs.)'
  );

  // Link "12 Steps" concept to the 12 Steps blog post
  content = content.replace(
    'meditation, prayer, journaling:',
    'meditation, prayer, <a href="/12-steps-and-your-business/">journaling</a>:'
  );

  // --- 2. Replace weak CTA at end ---
  content = content.replace(
    'If this resonates with you, then you should check out one of our weekly masterminds at <a href="https://soberfounders.org/events">https://soberfounders.org/events</a>.',
    ''
  );

  // --- 3. Append FAQ + CTA block ---
  if (!content.includes('FAQPage')) {
    content = content.trimEnd() + FAQ_AND_CTA;
  }

  console.log("  Updated content length:", content.length);

  // --- 4. Push content + new slug ---
  const newSlug = "good-problems-guide-sober-entrepreneurs";
  const updateBody = {
    content,
    slug: newSlug,
  };

  const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}`, {
    method: "POST",
    headers,
    body: JSON.stringify(updateBody),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status}: ${body.substring(0, 300)}`);
  }

  const result = await res.json();
  console.log(`\n  ✓ Post updated (ID ${result.id})`);
  console.log(`  ✓ New slug: ${result.slug}`);
  console.log(`  ✓ Live: ${result.link}`);

  // --- 5. Try to update Yoast meta ---
  try {
    await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        meta: {
          _yoast_wpseo_title: "The Good Problems Guide for Sober Entrepreneurs | Sober Founders",
          _yoast_wpseo_metadesc: "Business growth can threaten recovery. Learn how successful sober entrepreneurs scale without relapse triggers — stress management, delegation, financial planning, and more.",
        },
      }),
    });
    console.log("  ✓ Yoast meta updated");
  } catch {
    console.log("  Note: Yoast meta not writable via REST API. Update manually.");
  }

  // --- Verify ---
  const check = await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}?context=edit&_fields=content,slug`, { headers }).then(r => r.json());
  const raw = check.content?.raw || "";
  console.log("\n  Verification:");
  console.log("  - Slug:", check.slug);
  console.log("  - Has FAQ schema:", raw.includes("FAQPage"));
  console.log("  - Has Phoenix Forum link:", raw.includes("phoenix-forum-registration"));
  console.log("  - Has mastermind link:", raw.includes("weekly-mastermind-group"));
  console.log("  - Has our-story link:", raw.includes("our-story"));
  console.log("  - Has 12-steps link:", raw.includes("12-steps-and-your-business"));
  console.log("  - Has styled CTA:", raw.includes("Attend a Free Meeting"));
  console.log("  - Old bare URL removed:", !raw.includes("https://soberfounders.org/events\">https://"));
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
