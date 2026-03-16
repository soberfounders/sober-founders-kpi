#!/usr/bin/env node
/**
 * update-networking-blog.mjs — SEO improvements for "7 Mistakes with Sober Business Networking"
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

const POST_ID = 4077;

const FAQ_AND_CTA = `

<h2>Frequently Asked Questions</h2>

<h3>How do you network as a sober entrepreneur?</h3>
<p>Focus on substance-free environments — morning meetings, coffee chats, virtual masterminds, and industry conferences where alcohol isn't the centerpiece. Lead with genuine curiosity rather than a pitch. Your clarity and reliability are competitive advantages that others notice immediately. Communities like <a href="/weekly-mastermind-group/">Sober Founders' weekly masterminds</a> are built specifically for this.</p>

<h3>Is it harder to do business without drinking?</h3>
<p>It feels harder at first because so much traditional networking revolves around bars and happy hours. But sober entrepreneurs consistently report <em>better</em> business outcomes — you remember every conversation, you follow up reliably, and you build trust through authenticity rather than "liquid courage." The relationships you build sober are deeper and more productive.</p>

<h3>What are the best networking groups for sober business owners?</h3>
<p>Look for groups that prioritize substance-free environments and understand recovery. <a href="/our-story/">Sober Founders</a> is the largest peer community for entrepreneurs in recovery, with 500+ members and over $1B in combined revenue. We offer <a href="/events/">free weekly masterminds</a> and the <a href="/phoenix-forum-registration/">Phoenix Forum</a> for founders generating $1M+ in revenue.</p>

<hr style="margin: 48px 0; border: none; border-top: 1px solid #e5e7eb;" />

<div style="background: #f6f7f9; border-radius: 16px; padding: 40px 32px; text-align: center; margin: 32px 0;">
  <h2 style="font-family: 'DM Serif Display', serif; font-size: 1.6rem; color: #101828; margin-bottom: 12px;">Stop Networking Alone</h2>
  <p style="color: #475467; font-size: 1.05rem; max-width: 560px; margin: 0 auto 24px; line-height: 1.7;">Join 500+ sober entrepreneurs who network with integrity, build real relationships, and grow businesses that support their recovery.</p>
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
      "name": "How do you network as a sober entrepreneur?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Focus on substance-free environments — morning meetings, coffee chats, virtual masterminds, and industry conferences where alcohol isn't the centerpiece. Lead with genuine curiosity rather than a pitch. Your clarity and reliability are competitive advantages. Communities like Sober Founders' weekly masterminds are built specifically for sober entrepreneurs."
      }
    },
    {
      "@type": "Question",
      "name": "Is it harder to do business without drinking?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "It feels harder at first because so much traditional networking revolves around bars and happy hours. But sober entrepreneurs consistently report better business outcomes — you remember every conversation, you follow up reliably, and you build trust through authenticity rather than liquid courage."
      }
    },
    {
      "@type": "Question",
      "name": "What are the best networking groups for sober business owners?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Look for groups that prioritize substance-free environments and understand recovery. Sober Founders is the largest peer community for entrepreneurs in recovery, with 500+ members and over $1B in combined revenue. They offer free weekly masterminds and the Phoenix Forum for founders generating $1M+ in revenue."
      }
    }
  ]
}
</script>`;

async function main() {
  console.log("Fetching post 4077...");
  const postRes = await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}?context=edit&_fields=id,content,slug`, { headers });
  const post = await postRes.json();
  let content = post.content?.raw || "";
  console.log("  Current slug:", post.slug);
  console.log("  Current content length:", content.length);

  // --- 1. Remove empty opening paragraph ---
  content = content.replace(/^\s*<p><\/p>\s*/, "");

  // --- 2. Add internal links ---

  // Link "weekly masterminds" in the intro area
  content = content.replace(
    'In our community, we find that the most <a href="https://soberfounders.org/is-being-sober-worth-it-7-unexpected-business-advantages-sober-entrepreneurs-dont-want-you-to-know">successful women business</a> owners and founders focus on service first.',
    'In <a href="/our-story/">our community</a>, we find that the most successful founders focus on service first.'
  );

  // Link "Join a Sober Mastermind" section to our actual page
  content = content.replace(
    '<strong>The Fix: Join a Sober Mastermind</strong>',
    '<strong>The Fix: <a href="/weekly-mastermind-group/">Join a Sober Mastermind</a></strong>'
  );

  // Link "Traditional business groups" to our sober mastermind blog
  content = content.replace(
    'Traditional business groups often fall short for entrepreneurs in recovery.',
    '<a href="/sober-mastermind-meaning-explained-why-traditional-business-groups-fall-short-for-entrepreneurs-in-recovery">Traditional business groups</a> often fall short for entrepreneurs in recovery.'
  );

  // Clean up keyword-stuffed phrases in overachiever section
  content = content.replace(
    'You don&#39;t need to know everyone in the &quot;national association of women business owners&quot; or the &quot;young presidents organization.&quot;',
    'You don\'t need to know everyone in every professional organization.'
  );

  // Link "overachievers anonymous" to the actual blog post about it
  content = content.replace(
    'Many of us are &quot;overachievers anonymous&quot; candidates.',
    'Many of us are <a href="/overachievers-anonymous-7-signs-youre-sabotaging-your-sober-business-and-how-to-fix-it">"overachievers anonymous"</a> candidates.'
  );

  // Clean up keyword-stuffed "Taking the Next Step" section
  content = content.replace(
    'If you find yourself struggling with the &quot;difference between owner and ceo&quot; or how to scale your sales team while maintaining your peace, you need a tribe. Don&#39;t let the &quot;fear of people&quot; stop you from growing your business. ',
    'If you find yourself struggling to scale your business while maintaining your peace, you need a tribe. Don\'t let fear stop you from growing. '
  );

  content = content.replace(
    'There are &quot;major success stories in the entrepreneurial world&quot; from people just like us.',
    'There are incredible success stories from people just like us.'
  );

  // Link "good problems" / growth triggers to the Good Problems Guide
  content = content.replace(
    'Business pressure is one of the biggest relapse triggers.',
    'Business pressure is one of the biggest <a href="/good-problems-guide-sober-entrepreneurs/">relapse triggers</a>.'
  );

  // Link events in the curate your calendar section
  content = content.replace(
    'Host a &quot;Sober Founder Breakfast&quot; or a morning walking meeting.',
    'Host a "Sober Founder Breakfast" or a morning walking meeting. Or join one of our <a href="/events/">free weekly masterminds</a>.'
  );

  // --- 3. Replace weak CTA at end ---
  content = content.replace(
    /If this resonates with you.*$/s,
    ''
  );

  // --- 4. Append FAQ + CTA ---
  if (!content.includes('FAQPage')) {
    content = content.trimEnd() + FAQ_AND_CTA;
  }

  console.log("  Updated content length:", content.length);

  // --- 5. Push content + new slug ---
  const newSlug = "sober-business-networking-mistakes";
  const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, slug: newSlug }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status}: ${body.substring(0, 300)}`);
  }

  const result = await res.json();
  console.log(`\n  ✓ Post updated (ID ${result.id})`);
  console.log(`  ✓ New slug: ${result.slug}`);
  console.log(`  ✓ Scheduled: ${result.date}`);
  console.log(`  ✓ Will be live at: ${result.link}`);

  // --- 6. Update Yoast meta ---
  try {
    await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        meta: {
          _yoast_wpseo_title: "7 Sober Business Networking Mistakes (and How to Fix Them) | Sober Founders",
          _yoast_wpseo_metadesc: "Sober entrepreneurs have an unfair networking advantage — if they stop making these 7 mistakes. Learn how to build authentic business connections without alcohol.",
        },
      }),
    });
    console.log("  ✓ Yoast meta updated");
  } catch {
    console.log("  Note: Yoast meta not writable via REST API.");
  }

  // --- Verify ---
  const check = await fetch(`${SITE}/wp-json/wp/v2/posts/${POST_ID}?context=edit&_fields=content,slug`, { headers }).then(r => r.json());
  const raw = check.content?.raw || "";
  console.log("\n  Verification:");
  console.log("  - Slug:", check.slug);
  console.log("  - Has FAQ schema:", raw.includes("FAQPage"));
  console.log("  - Has Phoenix Forum link:", raw.includes("phoenix-forum-registration"));
  console.log("  - Has mastermind link:", raw.includes("weekly-mastermind-group"));
  console.log("  - Has our-story link:", raw.includes("/our-story/"));
  console.log("  - Has events link:", raw.includes("/events/"));
  console.log("  - Has Good Problems crosslink:", raw.includes("good-problems-guide"));
  console.log("  - Has overachiever crosslink:", raw.includes("overachievers-anonymous"));
  console.log("  - Styled CTA:", raw.includes("Attend a Free Meeting"));
  console.log("  - Bare URL removed:", !raw.includes('">https://'));
  console.log("  - Empty <p> removed:", !raw.startsWith("<p></p>"));
  console.log("  - Keyword stuffing cleaned:", !raw.includes("national association of women"));
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
