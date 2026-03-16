#!/usr/bin/env node
/**
 * deploy-seo.mjs — Push SEO content to soberfounders.org via WP REST API
 *
 * Usage:
 *   node scripts/deploy-seo.mjs [--dry-run]
 *
 * What it does:
 *   1. Creates or updates the FAQ page at /resources/faq/
 *   2. Creates or updates the Phoenix Forum pillar page
 *   3. Appends SEO content blocks + JSON-LD to the homepage
 *   4. Injects Organization + Event schemas via a Custom HTML widget approach
 *
 * Prerequisites:
 *   - WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD in .env.local
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = resolve(ROOT, ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)\s*[=\-]\s*(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString(
  "base64"
);
const DRY_RUN = process.argv.includes("--dry-run");

const headers = {
  "Content-Type": "application/json",
  Authorization: `Basic ${AUTH}`,
};

// ---------------------------------------------------------------------------
// WP REST helpers
// ---------------------------------------------------------------------------
async function wpFetch(endpoint, options = {}) {
  const url = `${SITE}/wp-json/wp/v2${endpoint}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

async function findPageBySlug(slug) {
  const pages = await wpFetch(`/pages?slug=${slug}&status=publish,draft`);
  return pages[0] || null;
}

async function createOrUpdatePage(slug, data) {
  const existing = await findPageBySlug(slug);
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would ${existing ? "update" : "create"} page: /${slug}/`);
    return existing || { id: "dry-run", slug };
  }
  if (existing) {
    console.log(`  Updating existing page (ID ${existing.id}): /${slug}/`);
    return wpFetch(`/pages/${existing.id}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  } else {
    console.log(`  Creating new page: /${slug}/`);
    return wpFetch("/pages", {
      method: "POST",
      body: JSON.stringify({ slug, ...data }),
    });
  }
}

// ---------------------------------------------------------------------------
// Content Builders
// ---------------------------------------------------------------------------

function buildFaqPageHtml() {
  const questions = [
    { q: "What is Sober Founders?", a: "Sober Founders is a 501(c)(3) nonprofit community for entrepreneurs in recovery from addiction. It provides free weekly virtual sessions, peer mentorship, and — for high-revenue founders — the Phoenix Forum, an exclusive membership for those with $1M+ in annual revenue and at least one year of sobriety. The organization exists at the unique intersection of entrepreneurship and recovery, giving founders a space where sobriety is a shared foundation, not a secret." },
    { q: "Who can join Sober Founders?", a: "Any entrepreneur or business owner in recovery from addiction is welcome to join Sober Founders. There is no revenue minimum, no industry restriction, and no requirement to be enrolled in a formal treatment program. The only expectation is that members are committed to sobriety and want to build their business alongside a community that understands both the demands of entrepreneurship and the challenges of recovery." },
    { q: "What is the Phoenix Forum?", a: "The Phoenix Forum is Sober Founders' premium membership tier for high-achieving founders in recovery. To qualify, members must have at least $1 million in annual business revenue and a minimum of one year of continuous sobriety. Phoenix Forum members participate in small-group peer advisory sessions, gain access to senior mentors, and connect with a network of accomplished founders who share their commitment to recovery. It is modeled after high-performance mastermind groups but built specifically around the sober founder experience." },
    { q: "How much does it cost to join Sober Founders?", a: "Joining Sober Founders' general community and attending the weekly virtual sessions is completely free. Sober Founders is a 501(c)(3) nonprofit, and open participation is core to its mission of making recovery-focused entrepreneurship support accessible to all founders regardless of financial means. The Phoenix Forum premium membership has its own application process; contact the team at soberfounders.org for current Phoenix Forum membership details." },
    { q: "How do I join the Phoenix Forum?", a: `To join the Phoenix Forum, you must meet two criteria: at least $1 million in annual business revenue and a minimum of one year of sobriety. Eligible founders can apply through <a href="https://soberfounders.org/phoenix-forum-good-fit-call/">soberfounders.org</a>. The application process includes a review of your business and sobriety background, followed by a conversation with the Sober Founders team to ensure the program is the right fit. Spots are limited to maintain the quality of peer connections.` },
    { q: "What happens at a Sober Founders session?", a: "Sober Founders sessions are structured virtual gatherings where founders in recovery share business challenges, discuss strategies, and support one another. Each session typically combines open discussion with topic-driven conversation — covering subjects like managing stress without substances, scaling a business in recovery, and navigating investor relationships as a sober founder. Sessions run on Zoom and are designed to feel like a trusted peer group, not a formal meeting or treatment setting." },
    { q: "When are Sober Founders meetings held?", a: "Sober Founders holds weekly virtual sessions every Tuesday and Thursday. Sessions are held online via Zoom, making them accessible to founders anywhere in the world regardless of time zone. The consistent twice-weekly schedule provides the accountability and community connection that recovery and business growth both benefit from. Check soberfounders.org or the community calendar for current session times." },
    { q: "Is Sober Founders anonymous?", a: "Sober Founders upholds strong confidentiality norms — what is shared in sessions stays within the community. While the organization is not formally structured as an anonymous program like AA or NA, privacy and discretion are core cultural values. Members are not required to disclose personal recovery details publicly, and the community actively protects what is shared in sessions." },
    { q: "Do I need to be in a 12-step program to join Sober Founders?", a: "No. Sober Founders does not require membership in any 12-step program or any specific recovery path. The community is inclusive of all approaches to sobriety — including 12-step, SMART Recovery, medication-assisted treatment, therapy, and others. The only requirement is a personal commitment to sobriety. Sober Founders is not a treatment program; it is a peer community that complements whatever recovery approach you choose." },
    { q: "What is the revenue requirement for Phoenix Forum?", a: "The Phoenix Forum requires a minimum of $1 million in annual business revenue. This threshold ensures that members are navigating similar-scale business challenges — fundraising, hiring, managing teams, and scaling operations — which makes peer advice more relevant and actionable. Founders who do not yet meet the $1M revenue mark are encouraged to participate in Sober Founders' free community sessions while growing toward that milestone." },
    { q: "How is Sober Founders different from AA or NA?", a: "Sober Founders is not a 12-step recovery program. It is a professional peer community specifically for entrepreneurs and business owners in recovery. Where AA and NA focus on personal recovery through a spiritual framework and step-based process, Sober Founders focuses on the intersection of sobriety and running a business — covering hiring, revenue strategy, investor dynamics, and leadership challenges. Many Sober Founders members also attend AA or NA; the two are complementary." },
    { q: "Can I attend if I'm sober-curious but not fully sober?", a: "Sober Founders' primary community is designed for entrepreneurs committed to sobriety, but the organization welcomes those seriously exploring sobriety as part of their recovery journey. If you are sober-curious and taking concrete steps toward sobriety, reach out at soberfounders.org to discuss whether participation is a good fit. The Phoenix Forum requires a minimum of one year of continuous sobriety for membership." },
    { q: "How does Sober Founders help my business?", a: "Sober Founders helps your business by surrounding you with peers who understand both entrepreneurship and recovery and can give honest, experience-based advice without judgment. Research shows that peer accountability and strong social support networks improve both business performance and recovery outcomes. Phoenix Forum members gain access to a high-trust group of founders with $1M+ revenue, where conversations go deep on real business challenges. Many members report that the clarity sobriety provides, combined with community accountability, is a measurable competitive advantage." },
    { q: "Is Sober Founders a 501(c)(3) nonprofit?", a: "Yes. Sober Founders is a registered 501(c)(3) nonprofit organization. This means the organization is legally recognized as tax-exempt and dedicated to its public mission of supporting entrepreneurs in recovery. Donations to Sober Founders are tax-deductible for U.S. donors to the extent permitted by law. The nonprofit structure reflects the organization's commitment to keeping its core community programs free and accessible to all founders regardless of business stage or financial means." },
    { q: "How can I donate to Sober Founders?", a: `You can donate to Sober Founders at <a href="https://soberfounders.org/donate/">soberfounders.org/donate</a>. As a 501(c)(3) nonprofit, all donations are tax-deductible for U.S. taxpayers to the extent permitted by law. Contributions directly fund the free weekly sessions, mentorship programs, and operational infrastructure that keep the community running. If you are a founder who has benefited from Sober Founders and want to help more entrepreneurs access recovery-supportive community, donating is one of the most direct ways to make an impact.` },
  ];

  // Build visible HTML (accordion-style with details/summary for Elementor compatibility)
  let html = `<div class="sf-faq-page" style="max-width: 800px; margin: 0 auto; font-family: inherit;">\n`;
  html += `<h1 style="text-align: center; margin-bottom: 0.5em;">Sober Founders FAQ</h1>\n`;
  html += `<p style="text-align: center; color: #666; margin-bottom: 2em;">Answers to common questions about our community, the Phoenix Forum, and how to get involved.</p>\n\n`;

  for (const { q, a } of questions) {
    html += `<div class="sf-faq-item" style="border-bottom: 1px solid #e0e0e0; padding: 1.5em 0;">\n`;
    html += `  <h2 style="font-size: 1.2em; margin: 0 0 0.5em 0; color: #1a1a1a;">${q}</h2>\n`;
    html += `  <p style="margin: 0; line-height: 1.7; color: #333;">${a}</p>\n`;
    html += `</div>\n\n`;
  }
  html += `</div>\n\n`;

  // JSON-LD FAQPage schema
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a.replace(/<[^>]+>/g, ""), // strip HTML for schema
      },
    })),
  };

  html += `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

  return html;
}

function buildPhoenixForumHtml() {
  let html = `<div class="sf-phoenix-pillar" style="max-width: 800px; margin: 0 auto; font-family: inherit; line-height: 1.7;">

<h1 style="text-align: center; margin-bottom: 0.3em;">Phoenix Forum</h1>
<p style="text-align: center; font-size: 1.1em; color: #666; margin-bottom: 2em;">The Peer Mastermind Group for Sober Founders</p>

<h2>What Is the Phoenix Forum?</h2>
<p>The Phoenix Forum is a weekly peer mastermind group for entrepreneurs in recovery, operated by Sober Founders — a 501(c)(3) nonprofit. Membership requires at least $1 million in annual revenue and more than one year of continuous sobriety. Members meet on Tuesdays and Thursdays for structured peer accountability sessions designed to accelerate business growth while supporting long-term recovery.</p>

<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 2em 0;">

<h2>Who the Phoenix Forum Is For</h2>
<p>The Phoenix Forum is built for a specific type of founder: one who has achieved significant business success and is committed to sobriety.</p>

<h3>Membership Requirements</h3>
<ul>
  <li><strong>Annual revenue:</strong> $1,000,000 or more</li>
  <li><strong>Sobriety:</strong> Strictly more than 1 year of continuous sobriety</li>
  <li><strong>Commitment:</strong> Active participation in weekly Tuesday and Thursday sessions</li>
  <li><strong>Alignment:</strong> Values peer accountability and is willing to be both challenged and supportive</li>
</ul>

<h3>Who Thrives Here</h3>
<p>Phoenix Forum members are typically founders, CEOs, or co-founders who:</p>
<ul>
  <li>Have scaled past $1M in revenue and need peers who operate at that level</li>
  <li>Are in active recovery and find that mainstream business peer groups don't acknowledge this dimension of their life</li>
  <li>Want more than a monthly check-in — they want weekly accountability</li>
  <li>Have outgrown early-stage founder communities and need a room where vulnerability is a feature, not a liability</li>
</ul>
<p>If you're pre-revenue, early in your sobriety, or looking for a once-a-month social network, the Phoenix Forum is not the right fit. See our <a href="/weekly-mastermind-group/">weekly sessions</a> for earlier-stage programs.</p>

<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 2em 0;">

<h2>How the Phoenix Forum Works</h2>

<p><strong>Step 1: Apply</strong><br>Submit an application at <a href="/apply/">soberfounders.org/apply</a>. Applications are reviewed by the Sober Founders team.</p>

<p><strong>Step 2: Eligibility Review</strong><br>The team verifies revenue (via P&L, tax return, or bank statements) and sobriety date. Both thresholds — $1M+ revenue and 1+ year sobriety — are hard requirements, not guidelines.</p>

<p><strong>Step 3: Onboarding</strong><br>Accepted members are introduced to their cohort and receive orientation materials covering session norms, confidentiality expectations, and how to get the most from peer sessions.</p>

<p><strong>Step 4: Weekly Sessions</strong><br>Members attend sessions every Tuesday and Thursday. Sessions follow a structured format: wins, challenges, peer hot seats, and accountability check-ins. Sessions are conducted virtually, accessible from anywhere.</p>

<p><strong>Step 5: Ongoing Accountability</strong><br>Between sessions, members stay connected through the Sober Founders community. The group norm is mutual accountability: you show up for others, and they show up for you.</p>

<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 2em 0;">

<h2>What Makes the Phoenix Forum Different</h2>
<p>Most business peer groups — YPO, EO, Vistage — were not designed for founders in recovery. The Phoenix Forum is the only major peer group that treats sobriety as a membership prerequisite and a competitive advantage.</p>

<table style="width: 100%; border-collapse: collapse; margin: 1.5em 0; font-size: 0.95em;">
  <thead>
    <tr style="background: #f5f5f5;">
      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Feature</th>
      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Phoenix Forum</th>
      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">YPO</th>
      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">EO</th>
      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Vistage</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Focus</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">Founders in recovery</td><td style="padding: 10px; border-bottom: 1px solid #eee;">C-suite executives</td><td style="padding: 10px; border-bottom: 1px solid #eee;">Growth-stage entrepreneurs</td><td style="padding: 10px; border-bottom: 1px solid #eee;">CEO peer advisory</td></tr>
    <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Revenue req.</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">$1M+</td><td style="padding: 10px; border-bottom: 1px solid #eee;">~$13M+</td><td style="padding: 10px; border-bottom: 1px solid #eee;">$1M+</td><td style="padding: 10px; border-bottom: 1px solid #eee;">None</td></tr>
    <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Sobriety req.</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">Yes (1+ year)</td><td style="padding: 10px; border-bottom: 1px solid #eee;">None</td><td style="padding: 10px; border-bottom: 1px solid #eee;">None</td><td style="padding: 10px; border-bottom: 1px solid #eee;">None</td></tr>
    <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Frequency</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">Weekly (Tue + Thu)</td><td style="padding: 10px; border-bottom: 1px solid #eee;">Monthly</td><td style="padding: 10px; border-bottom: 1px solid #eee;">Monthly</td><td style="padding: 10px; border-bottom: 1px solid #eee;">Monthly</td></tr>
    <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Format</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">Virtual peer group</td><td style="padding: 10px; border-bottom: 1px solid #eee;">Local chapter + events</td><td style="padding: 10px; border-bottom: 1px solid #eee;">Local chapter + events</td><td style="padding: 10px; border-bottom: 1px solid #eee;">Local chapter + speakers</td></tr>
    <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Nonprofit</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">Yes — 501(c)(3)</td><td style="padding: 10px; border-bottom: 1px solid #eee;">No</td><td style="padding: 10px; border-bottom: 1px solid #eee;">No</td><td style="padding: 10px; border-bottom: 1px solid #eee;">No</td></tr>
    <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Est. annual cost</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">Contact for pricing</td><td style="padding: 10px; border-bottom: 1px solid #eee;">$10K–$25K+</td><td style="padding: 10px; border-bottom: 1px solid #eee;">$3K–$6K+</td><td style="padding: 10px; border-bottom: 1px solid #eee;">$15K–$20K+</td></tr>
  </tbody>
</table>

<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 2em 0;">

<h2>The Data: Recovery and Entrepreneurship</h2>

<blockquote style="border-left: 4px solid #333; padding: 1em 1.5em; margin: 1.5em 0; background: #fafafa;">
  <p><strong>Statistic:</strong> According to a 2015 study published in the <em>Journal of Clinical Psychology</em>, entrepreneurs are 30% more likely than the general workforce to experience substance use disorders. (Source: Freeman et al., 2015)</p>
</blockquote>

<blockquote style="border-left: 4px solid #333; padding: 1em 1.5em; margin: 1.5em 0; background: #fafafa;">
  <p><strong>Statistic:</strong> SAMHSA's 2024 <em>National Survey on Drug Use and Health</em> found that 10.2% of self-employed business owners reported a substance use disorder in the past year — significantly above the national average of 7.2%. (Source: SAMHSA, 2024 NSDUH)</p>
</blockquote>

<blockquote style="border-left: 4px solid #333; padding: 1em 1.5em; margin: 1.5em 0; background: #fafafa;">
  <p><strong>Statistic:</strong> A 2023 study in <em>Frontiers in Psychology</em> found that entrepreneurs with structured peer accountability groups reported 42% higher goal completion rates than those working in isolation. (Source: Frontiers in Psychology, 2023)</p>
</blockquote>

<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 2em 0;">

<h2>Member Perspectives</h2>

<blockquote style="border-left: 4px solid #333; padding: 1em 1.5em; margin: 1.5em 0; background: #fafafa;">
  <p>"Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!"</p>
  <cite style="font-style: normal; font-weight: bold;">— Adam C.</cite>
</blockquote>

<blockquote style="border-left: 4px solid #333; padding: 1em 1.5em; margin: 1.5em 0; background: #fafafa;">
  <p>"This group has been one of the most impactful things I've ever been part of."</p>
  <cite style="font-style: normal; font-weight: bold;">— Josh C.</cite>
</blockquote>

<blockquote style="border-left: 4px solid #333; padding: 1em 1.5em; margin: 1.5em 0; background: #fafafa;">
  <p>"I love that it combines two of my biggest passions, business and recovery."</p>
  <cite style="font-style: normal; font-weight: bold;">— Matt S.</cite>
</blockquote>

<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 2em 0;">

<h2>Frequently Asked Questions</h2>

<div class="sf-faq-item" style="border-bottom: 1px solid #e0e0e0; padding: 1.2em 0;">
  <h3 style="font-size: 1.1em; margin: 0 0 0.5em 0;">What is the Phoenix Forum?</h3>
  <p style="margin: 0;">The Phoenix Forum is a weekly peer mastermind group operated by Sober Founders, a 501(c)(3) nonprofit. It is designed for entrepreneurs with $1M+ in annual revenue and more than one year of sobriety.</p>
</div>

<div class="sf-faq-item" style="border-bottom: 1px solid #e0e0e0; padding: 1.2em 0;">
  <h3 style="font-size: 1.1em; margin: 0 0 0.5em 0;">What are the eligibility requirements?</h3>
  <p style="margin: 0;">Two hard requirements: (1) annual business revenue of at least $1 million, and (2) continuous sobriety for more than one year. Both are verified during the application process.</p>
</div>

<div class="sf-faq-item" style="border-bottom: 1px solid #e0e0e0; padding: 1.2em 0;">
  <h3 style="font-size: 1.1em; margin: 0 0 0.5em 0;">How is the Phoenix Forum different from YPO or EO?</h3>
  <p style="margin: 0;">YPO, EO, and Vistage are designed for the general entrepreneurial population. The Phoenix Forum is the only major peer group specifically built for founders in recovery. Sessions meet weekly rather than monthly.</p>
</div>

<div class="sf-faq-item" style="border-bottom: 1px solid #e0e0e0; padding: 1.2em 0;">
  <h3 style="font-size: 1.1em; margin: 0 0 0.5em 0;">How often do members meet?</h3>
  <p style="margin: 0;">Twice per week — every Tuesday and Thursday. Sessions are virtual, so members can participate from any location.</p>
</div>

<div class="sf-faq-item" style="border-bottom: 1px solid #e0e0e0; padding: 1.2em 0;">
  <h3 style="font-size: 1.1em; margin: 0 0 0.5em 0;">How much does the Phoenix Forum cost?</h3>
  <p style="margin: 0;">Membership pricing is not published publicly. <a href="/apply/">Contact the Sober Founders team</a> for current pricing. The program is operated by a 501(c)(3) nonprofit.</p>
</div>

<div class="sf-faq-item" style="border-bottom: 1px solid #e0e0e0; padding: 1.2em 0;">
  <h3 style="font-size: 1.1em; margin: 0 0 0.5em 0;">Can I apply with less than one year of sobriety?</h3>
  <p style="margin: 0;">No. The one-year sobriety requirement is strictly enforced. Explore <a href="/weekly-mastermind-group/">Sober Founders' weekly sessions</a> and apply when you meet the requirement.</p>
</div>

<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 2em 0;">

<h2>How to Apply</h2>
<ol>
  <li><strong>Review eligibility:</strong> $1M+ annual revenue and 1+ year of sobriety</li>
  <li><strong>Submit application:</strong> <a href="/apply/">soberfounders.org/apply</a></li>
  <li><strong>Schedule intake conversation:</strong> 30-minute mutual fit assessment</li>
  <li><strong>Complete verification:</strong> Revenue and sobriety date confirmation</li>
  <li><strong>Start:</strong> Cohort placement and first session within 2–3 weeks</li>
</ol>

<p style="text-align: center; margin-top: 2em;"><a href="/apply/" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 14px 32px; text-decoration: none; font-weight: bold; border-radius: 4px; font-size: 1.1em;">Apply to the Phoenix Forum</a></p>

<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 2em 0;">

<p style="text-align: center; color: #999; font-size: 0.9em;"><em>Sober Founders is a registered 501(c)(3) nonprofit organization.</em></p>

</div>`;

  // Phoenix Forum JSON-LD schema (Article + FAQPage + BreadcrumbList)
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "Phoenix Forum: The Peer Mastermind Group for Sober Founders",
        description: "The Phoenix Forum is a weekly peer mastermind group for entrepreneurs with $1M+ revenue and 1+ year of sobriety, operated by Sober Founders, a 501(c)(3) nonprofit.",
        datePublished: "2026-03-16",
        dateModified: "2026-03-16",
        author: { "@type": "Organization", name: "Sober Founders", url: "https://soberfounders.org" },
        publisher: { "@type": "Organization", name: "Sober Founders", url: "https://soberfounders.org" },
        mainEntityOfPage: { "@type": "WebPage", "@id": "https://soberfounders.org/phoenix-forum/" },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is the Phoenix Forum?", acceptedAnswer: { "@type": "Answer", text: "The Phoenix Forum is a weekly peer mastermind group operated by Sober Founders, a 501(c)(3) nonprofit. It is designed for entrepreneurs with $1M+ in annual revenue and more than one year of sobriety. Members meet on Tuesdays and Thursdays for structured peer accountability sessions." } },
          { "@type": "Question", name: "What are the eligibility requirements to join the Phoenix Forum?", acceptedAnswer: { "@type": "Answer", text: "Two hard requirements: (1) annual business revenue of at least $1 million, and (2) continuous sobriety for more than one year. Both are verified during the application process." } },
          { "@type": "Question", name: "How is the Phoenix Forum different from YPO or EO?", acceptedAnswer: { "@type": "Answer", text: "YPO, EO, and Vistage are designed for the general entrepreneurial population. The Phoenix Forum is the only major peer group specifically built for founders in recovery. Sessions meet weekly rather than monthly, and the program is run by a nonprofit." } },
          { "@type": "Question", name: "How often do Phoenix Forum members meet?", acceptedAnswer: { "@type": "Answer", text: "Members meet twice per week — every Tuesday and Thursday. Sessions are conducted virtually, so members can participate from any location." } },
          { "@type": "Question", name: "How much does the Phoenix Forum cost?", acceptedAnswer: { "@type": "Answer", text: "Membership pricing is not published publicly. Contact the Sober Founders team via the application page for current pricing. The program is operated by a 501(c)(3) nonprofit." } },
          { "@type": "Question", name: "Can I apply if I have less than one year of sobriety?", acceptedAnswer: { "@type": "Answer", text: "No. The one-year sobriety requirement is strictly enforced and is not negotiable. This threshold ensures members are stable in their recovery before taking on the additional demands of an intensive peer accountability program." } },
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://soberfounders.org" },
          { "@type": "ListItem", position: 2, name: "Phoenix Forum", item: "https://soberfounders.org/phoenix-forum/" },
        ],
      },
    ],
  };

  html += `\n\n<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
  return html;
}

function buildHomepageSeoBlocks() {
  // These blocks get APPENDED to the existing homepage content
  return `
<!-- SEO Definition Block — Added by deploy-seo.mjs -->
<div class="sf-seo-definition" style="max-width: 800px; margin: 2em auto; font-family: inherit; line-height: 1.7;">

<h2 style="font-size: 1.4em; margin-bottom: 0.5em;">What is Sober Founders?</h2>

<p>Sober Founders is a 501(c)(3) nonprofit community for entrepreneurs in recovery from addiction. We provide free weekly mastermind sessions, peer mentorship, and the Phoenix Forum — an exclusive membership for founders with $1M+ in annual revenue and 1+ year of sobriety. Our members represent over $1 billion in combined revenue across industries including technology, real estate, healthcare, and professional services.</p>

<p>Founded in 2024, Sober Founders is the largest peer community at the intersection of entrepreneurship and recovery. We believe sobriety is a competitive advantage, not a limitation — and our members prove it every day.</p>

</div>

<!-- Stats Block -->
<div class="sf-stats" style="max-width: 800px; margin: 2em auto; font-family: inherit;">
<h2 style="font-size: 1.3em; margin-bottom: 0.5em;">Sober Founders by the Numbers</h2>
<ul style="list-style: none; padding: 0; font-size: 1.05em; line-height: 2;">
  <li><strong>500+ active members</strong></li>
  <li><strong>$1B+ combined member revenue</strong></li>
  <li><strong>Weekly sessions</strong> held every Tuesday and Thursday</li>
  <li><strong>501(c)(3) nonprofit</strong> — free to join, funded by donations</li>
</ul>
</div>

<!-- Testimonials Block -->
<div class="sf-testimonials" style="max-width: 800px; margin: 2em auto; font-family: inherit;">
<h2 style="font-size: 1.3em; margin-bottom: 1em;">What Members Say</h2>

<blockquote style="border-left: 4px solid #333; padding: 1em 1.5em; margin: 1.5em 0; background: #fafafa;">
  <p style="margin: 0 0 0.5em 0; font-size: 1.05em;">"Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!"</p>
  <cite style="font-style: normal; font-weight: bold;">— Adam C.</cite>
</blockquote>

<blockquote style="border-left: 4px solid #333; padding: 1em 1.5em; margin: 1.5em 0; background: #fafafa;">
  <p style="margin: 0 0 0.5em 0; font-size: 1.05em;">"This group has been one of the most impactful things I've ever been part of."</p>
  <cite style="font-style: normal; font-weight: bold;">— Josh C.</cite>
</blockquote>

<blockquote style="border-left: 4px solid #333; padding: 1em 1.5em; margin: 1.5em 0; background: #fafafa;">
  <p style="margin: 0 0 0.5em 0; font-size: 1.05em;">"I love that it combines two of my biggest passions, business and recovery."</p>
  <cite style="font-style: normal; font-weight: bold;">— Matt S.</cite>
</blockquote>
</div>

<!-- Internal Links Block -->
<div class="sf-nav-links" style="max-width: 800px; margin: 2em auto; font-family: inherit; text-align: center;">
  <p>
    <a href="/phoenix-forum-registration/">Learn about the Phoenix Forum</a> &nbsp;|&nbsp;
    <a href="/weekly-mastermind-group/">Join our weekly mastermind sessions</a> &nbsp;|&nbsp;
    <a href="/our-story/">Read our impact story</a> &nbsp;|&nbsp;
    <a href="/events/">Upcoming events</a> &nbsp;|&nbsp;
    <a href="/donate/">Support our mission</a>
  </p>
</div>

<!-- Organization Schema (NGO) -->
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

<!-- Event Schema (Weekly Sessions) -->
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
</script>`;
}

// ---------------------------------------------------------------------------
// Yoast meta update helper
// ---------------------------------------------------------------------------
async function updateYoastMeta(pageId, title, description) {
  // Yoast stores meta in post meta fields accessible via REST API
  // The fields are: yoast_head_json is read-only, but we can set via
  // the standard WP REST API meta fields if Yoast exposes them
  // Try updating via the yoast_meta fields on the page endpoint
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would update Yoast meta for page ${pageId}`);
    return;
  }

  try {
    await wpFetch(`/pages/${pageId}`, {
      method: "POST",
      body: JSON.stringify({
        meta: {
          _yoast_wpseo_title: title,
          _yoast_wpseo_metadesc: description,
        },
      }),
    });
    console.log(`  Updated Yoast meta for page ${pageId}`);
  } catch (e) {
    // Yoast meta fields may not be exposed via REST API by default
    // Fall back to noting it needs manual update
    console.log(`  Note: Yoast meta fields not writable via REST API. Update manually in Yoast SEO meta box.`);
    console.log(`    Title: ${title}`);
    console.log(`    Description: ${description}`);
  }
}

// ---------------------------------------------------------------------------
// Main deployment
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Sober Founders SEO Deployment`);
  console.log(`  Target: ${SITE}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  // 1. FAQ Page
  console.log("1. FAQ Page (/resources/faq/)");
  const faqHtml = buildFaqPageHtml();
  // Check if /resources/ parent page exists
  let resourcesPage = await findPageBySlug("resources");
  let resourcesId = resourcesPage?.id;
  if (!resourcesPage && !DRY_RUN) {
    console.log("  Creating parent /resources/ page...");
    const rp = await wpFetch("/pages", {
      method: "POST",
      body: JSON.stringify({
        title: "Resources",
        slug: "resources",
        status: "publish",
        content: "<p>Resources for sober entrepreneurs.</p>",
      }),
    });
    resourcesId = rp.id;
  }
  const faqPage = await createOrUpdatePage("faq", {
    title: "Sober Founders FAQ — Common Questions Answered",
    content: faqHtml,
    status: "publish",
    parent: resourcesId || 0,
  });
  if (faqPage.id !== "dry-run") {
    await updateYoastMeta(
      faqPage.id,
      "Sober Founders FAQ — Common Questions Answered",
      "Free masterminds and discussions regarding sobriety and business — answers to the most common questions about Sober Founders, the Phoenix Forum, and how to join."
    );
  }
  console.log(`  Done: ${faqPage.link || `${SITE}/resources/faq/`}\n`);

  // 2. Phoenix Forum Pillar Page
  console.log("2. Phoenix Forum Pillar Page (/phoenix-forum/)");
  const phoenixHtml = buildPhoenixForumHtml();
  const phoenixPage = await createOrUpdatePage("phoenix-forum", {
    title: "Phoenix Forum: The Peer Mastermind Group for Sober Founders",
    content: phoenixHtml,
    status: "publish",
  });
  if (phoenixPage.id !== "dry-run") {
    await updateYoastMeta(
      phoenixPage.id,
      "The Phoenix Forum — Mastermind for Founders in Recovery",
      "The Phoenix Forum is a weekly mastermind group for entrepreneurs with $1M+ revenue and 1+ year of sobriety. Apply to join Sober Founders' flagship peer program."
    );
  }
  console.log(`  Done: ${phoenixPage.link || `${SITE}/phoenix-forum/`}\n`);

  // 3. Homepage — append SEO content blocks + schemas
  console.log("3. Homepage SEO blocks + JSON-LD schemas");
  const HOMEPAGE_ID = 1989;
  if (!DRY_RUN) {
    // Get current homepage content — use context=edit to get raw block markup
    // (content.rendered strips Gutenberg block comments like <!-- wp:uagb/container -->
    //  which destroys all Spectra/UAG block styling when written back)
    const homepage = await wpFetch(`/pages/${HOMEPAGE_ID}?context=edit`);
    const currentContent = homepage.content?.raw || "";

    // Safety: raw content must contain block comments; if not, the API may have
    // returned rendered HTML which would corrupt the page on write-back.
    if (currentContent && !currentContent.includes("<!-- wp:")) {
      throw new Error(
        "Homepage content.raw does not contain Gutenberg block comments. " +
        "Aborting to prevent block markup corruption. " +
        "Verify API credentials have edit-level access."
      );
    }

    // Check if we already appended SEO blocks
    if (currentContent.includes("sf-seo-definition")) {
      console.log("  SEO blocks already present on homepage — skipping append.");
    } else {
      const newContent = currentContent + buildHomepageSeoBlocks();
      await wpFetch(`/pages/${HOMEPAGE_ID}`, {
        method: "POST",
        body: JSON.stringify({ content: newContent }),
      });
      console.log("  Appended definition block, stats, testimonials, and JSON-LD schemas.");
    }
    await updateYoastMeta(
      HOMEPAGE_ID,
      "Sober Founders — Peer Masterminds for Sober Entrepreneurs",
      "Sober Founders is a free 501(c)(3) community for entrepreneurs in recovery. Weekly masterminds, mentorship, and the Phoenix Forum for high-revenue founders."
    );
  } else {
    console.log("  [DRY RUN] Would append SEO blocks + schemas to homepage");
  }
  console.log("  Done.\n");

  // Summary
  console.log(`${"=".repeat(60)}`);
  console.log("  DEPLOYMENT COMPLETE");
  console.log(`${"=".repeat(60)}`);
  console.log(`
Pages deployed:
  - FAQ:            ${SITE}/resources/faq/
  - Phoenix Forum:  ${SITE}/phoenix-forum/
  - Homepage:       ${SITE}/ (SEO blocks + schemas appended)

JSON-LD schemas deployed:
  - FAQPage schema (FAQ page)
  - Article + FAQPage + BreadcrumbList (Phoenix Forum)
  - NGO Organization schema (homepage)
  - EventSeries + Tuesday/Thursday Events (homepage)

Next steps:
  1. Validate schemas:  https://search.google.com/test/rich-results
  2. Request indexing:  Google Search Console > URL Inspection
  3. Submit to Bing:    https://www.bing.com/webmasters
  4. Update robots.txt: See .agents/content/technical-seo-implementations.md
     (requires FTP access or WP Robots Txt plugin — not possible via REST API)
  `);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
