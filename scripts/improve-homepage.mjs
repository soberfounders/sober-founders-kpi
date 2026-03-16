#!/usr/bin/env node
/**
 * improve-homepage.mjs — Improve existing homepage content + add SEO blocks
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

const PAGE_ID = 1989;

const SEO_BLOCKS = `

<!-- wp:html -->
<!-- SEO Content Blocks — appended by improve-homepage.mjs -->
<style>
  .sf-seo-definition { max-width: 800px; margin: 3em auto 0; font-family: inherit; line-height: 1.7; padding: 0 24px; }
  .sf-seo-definition h2 { font-family: 'DM Serif Display', serif; font-size: 1.4em; margin-bottom: 0.5em; color: #101828; }
  .sf-seo-definition p { color: #475467; font-size: 1.05em; margin-bottom: 1em; }
  .sf-stats-seo { max-width: 800px; margin: 2em auto; font-family: inherit; padding: 0 24px; }
  .sf-stats-seo h2 { font-family: 'DM Serif Display', serif; font-size: 1.3em; margin-bottom: 0.5em; color: #101828; }
  .sf-stats-seo ul { list-style: none; padding: 0; font-size: 1.05em; line-height: 2; color: #475467; }
  .sf-stats-seo strong { color: #101828; }
  .sf-testimonials-seo { max-width: 800px; margin: 2em auto; font-family: inherit; padding: 0 24px; }
  .sf-testimonials-seo h2 { font-family: 'DM Serif Display', serif; font-size: 1.3em; margin-bottom: 1em; color: #101828; }
  .sf-testimonials-seo blockquote {
    border-left: 4px solid #00b286;
    padding: 1em 1.5em;
    margin: 1.5em 0;
    background: #f6f7f9;
    border-radius: 0 12px 12px 0;
  }
  .sf-testimonials-seo blockquote p { margin: 0 0 0.5em 0; font-size: 1.05em; color: #2e3443; }
  .sf-testimonials-seo cite { font-style: normal; font-weight: 600; color: #101828; }
  .sf-nav-links-seo {
    max-width: 800px; margin: 2em auto; font-family: inherit;
    text-align: center; padding: 0 24px; font-size: 0.95rem; line-height: 2.2;
  }
  .sf-nav-links-seo a { color: #00b286; text-decoration: none; font-weight: 500; }
  .sf-nav-links-seo a:hover { color: #008e65; }
  .sf-nav-links-seo .sf-sep { margin: 0 8px; color: #d1d5db; }
</style>

<div class="sf-seo-definition">
  <h2>What is Sober Founders?</h2>
  <p>Sober Founders is a 501(c)(3) nonprofit community for entrepreneurs in recovery from addiction. We provide free weekly mastermind sessions, peer support, and the Phoenix Forum &mdash; an exclusive peer advisory board for founders with $1M+ in annual revenue and 1+ year of sobriety. Our members represent over $1 billion in combined revenue across industries including technology, real estate, healthcare, and professional services.</p>
  <p>Founded in 2020, Sober Founders is the largest peer community at the intersection of entrepreneurship and recovery. We believe sobriety is a competitive advantage, not a limitation &mdash; and our members prove it every day.</p>
</div>

<div class="sf-stats-seo">
  <h2>Sober Founders by the Numbers</h2>
  <ul>
    <li><strong>500+ active members</strong></li>
    <li><strong>$1B+ combined member revenue</strong></li>
    <li><strong>Weekly sessions</strong> held every Tuesday and Thursday</li>
    <li><strong>501(c)(3) nonprofit</strong> &mdash; free to join, funded by donations</li>
  </ul>
</div>

<div class="sf-testimonials-seo">
  <h2>What Members Say</h2>
  <blockquote>
    <p>&ldquo;Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!&rdquo;</p>
    <cite>&mdash; Adam C.</cite>
  </blockquote>
  <blockquote>
    <p>&ldquo;This group has been one of the most impactful things I&rsquo;ve ever been part of.&rdquo;</p>
    <cite>&mdash; Josh C.</cite>
  </blockquote>
  <blockquote>
    <p>&ldquo;I love that it combines two of my biggest passions, business and recovery.&rdquo;</p>
    <cite>&mdash; Matt S.</cite>
  </blockquote>
</div>

<div class="sf-nav-links-seo">
  <a href="/phoenix-forum-registration/">Learn about the Phoenix Forum</a>
  <span class="sf-sep">|</span>
  <a href="/weekly-mastermind-group/">Join our weekly mastermind sessions</a>
  <span class="sf-sep">|</span>
  <a href="/our-story/">Read our impact story</a>
  <span class="sf-sep">|</span>
  <a href="/events/">Upcoming events</a>
  <span class="sf-sep">|</span>
  <a href="/donate/">Support our mission</a>
  <span class="sf-sep">|</span>
  <a href="/blog/">Read the blog</a>
</div>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "NGO",
  "@id": "https://www.soberfounders.org/#organization",
  "name": "Sober Founders",
  "legalName": "Sober Founders Inc.",
  "alternateName": ["Sober Founders Community", "SoberFounders"],
  "url": "https://www.soberfounders.org/",
  "description": "Sober Founders is a free 501(c)(3) nonprofit community for entrepreneurs in sobriety and addiction recovery. We run free weekly online mastermind sessions every Tuesday and Thursday.",
  "foundingDate": "2020",
  "nonprofitStatus": "Nonprofit501c3",
  "mission": "To support entrepreneurs navigating sobriety by providing free community, peer accountability, and resources that help them build thriving businesses and maintain lasting recovery.",
  "keywords": "sober entrepreneurs, founders in recovery, sobriety community, addiction recovery business owners, sober mastermind",
  "contactPoint": [{ "@type": "ContactPoint", "contactType": "community support", "url": "https://www.soberfounders.org/", "availableLanguage": "English" }],
  "sameAs": [
    "https://www.linkedin.com/company/sober-founders",
    "https://www.instagram.com/soberfounders",
    "https://twitter.com/soberfounders"
  ],
  "offers": { "@type": "Offer", "name": "Free Weekly Mastermind Sessions", "price": "0", "priceCurrency": "USD" }
}
</script>

<script type="application/ld+json">
[
  {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    "@id": "https://www.soberfounders.org/#event-series-weekly-sessions",
    "name": "Sober Founders Weekly Mastermind Sessions",
    "description": "Free recurring online mastermind sessions for entrepreneurs in recovery. Held every Tuesday and Thursday.",
    "url": "https://www.soberfounders.org/",
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "isAccessibleForFree": true,
    "organizer": { "@type": "Organization", "name": "Sober Founders Inc.", "url": "https://www.soberfounders.org/" },
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "availability": "https://schema.org/InStock" },
    "location": { "@type": "VirtualLocation", "url": "https://www.soberfounders.org/" }
  },
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Sober Founders Tuesday Mastermind",
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "isAccessibleForFree": true,
    "startDate": "2026-03-17T12:00:00-05:00",
    "eventSchedule": { "@type": "Schedule", "byDay": "https://schema.org/Tuesday", "repeatFrequency": "P1W", "scheduleTimezone": "America/New_York" },
    "superEvent": { "@id": "https://www.soberfounders.org/#event-series-weekly-sessions" },
    "organizer": { "@type": "Organization", "name": "Sober Founders Inc." },
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "location": { "@type": "VirtualLocation", "url": "https://www.soberfounders.org/" }
  },
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Sober Founders Thursday Mastermind",
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "isAccessibleForFree": true,
    "startDate": "2026-03-19T12:00:00-05:00",
    "eventSchedule": { "@type": "Schedule", "byDay": "https://schema.org/Thursday", "repeatFrequency": "P1W", "scheduleTimezone": "America/New_York" },
    "superEvent": { "@id": "https://www.soberfounders.org/#event-series-weekly-sessions" },
    "organizer": { "@type": "Organization", "name": "Sober Founders Inc." },
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "location": { "@type": "VirtualLocation", "url": "https://www.soberfounders.org/" }
  }
]
</script>
<!-- /wp:html -->`;

async function main() {
  console.log("Fetching current homepage...");
  const page = await fetch(`${SITE}/wp-json/wp/v2/pages/${PAGE_ID}?context=edit&_fields=content`, { headers }).then(r => r.json());
  let content = page.content?.raw || "";
  console.log("Current length:", content.length);

  // --- Content improvements ---

  // 1. Replace "Free Mentorship" with "Private WhatsApp Community"
  content = content.replace(
    'Free Mentorship</h3><p class="uagb-desc-text">Volunteer to help other entrepreneurs in recovery, or receive expert guidance from one of our certified mentors! Get invaluable insight and strategic knowhow from those who have been there before.',
    'Private WhatsApp Community</h3><p class="uagb-desc-text">Get instant access to our private WhatsApp group\u2014a 24/7 lifeline of sober entrepreneurs who get it. Share wins, ask for advice, and stay connected between meetings. Real-time support from people who understand both the grind and the recovery.'
  );

  // 2. Fix double period
  content = content.replace("focuses on accountability..", "focuses on accountability.");

  // 3. Update hero description to mention current offerings
  content = content.replace(
    "We accomplish this through free online mastermind groups and mentorship for sober entrepreneurs.",
    "We accomplish this through free weekly online mastermind groups, a private WhatsApp community, and the Phoenix Forum for high-revenue founders."
  );

  // 4. Replace vague "tons of" with specific stats
  content = content.replace(
    "We've served tons of successful, sober entrepreneurs, helping them to build businesses while staying sober.",
    "With 500+ active members and over $1 billion in combined revenue, we\u2019re proof that sobriety is a competitive advantage."
  );

  // Also handle HTML entity version
  content = content.replace(
    "We&#8217;ve served tons of successful, sober entrepreneurs, helping them to build businesses while staying sober.",
    "With 500+ active members and over $1 billion in combined revenue, we&#8217;re proof that sobriety is a competitive advantage."
  );

  // 5. Append SEO blocks if not already present
  if (!content.includes("sf-seo-definition")) {
    content = content + SEO_BLOCKS;
    console.log("Appended SEO blocks + JSON-LD schemas.");
  } else {
    console.log("SEO blocks already present, skipping append.");
  }

  console.log("Updated length:", content.length);

  // Push to WordPress
  const res = await fetch(`${SITE}/wp-json/wp/v2/pages/${PAGE_ID}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status}: ${body}`);
  }

  const result = await res.json();
  console.log(`\n  ✓ Homepage updated (ID ${result.id})`);
  console.log(`  ✓ Live: ${result.link}`);

  // Verify
  const check = await fetch(`${SITE}/wp-json/wp/v2/pages/${PAGE_ID}?context=edit&_fields=content`, { headers }).then(r => r.json());
  const raw = check.content?.raw || "";
  console.log("\n  Verification:");
  console.log("  - Mentorship replaced:", raw.includes("Private WhatsApp Community"));
  console.log("  - SEO definition:", raw.includes("sf-seo-definition"));
  console.log("  - JSON-LD schemas:", raw.includes("application/ld+json"));
  console.log("  - Internal links:", raw.includes("sf-nav-links-seo"));
  console.log("  - Double period fixed:", !raw.includes("accountability.."));
  console.log("  - Stats updated:", raw.includes("500+ active members"));
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
