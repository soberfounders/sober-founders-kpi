#!/usr/bin/env node
/**
 * Publish the "YPO vs EO vs Vistage" comparison hub post to soberfounders.org
 *
 * Usage:
 *   node scripts/publish-comparison-hub.mjs              # publish live
 *   node scripts/publish-comparison-hub.mjs --draft      # publish as draft
 *   node scripts/publish-comparison-hub.mjs --dry-run    # print payload only
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = resolve(__dirname, "..", ".env");
const envLines = readFileSync(envPath, "utf8").split("\n");
const env = {};
for (const line of envLines) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const WP_USERNAME = env.WP_USERNAME || "andrew";
const WP_APP_PASSWORD = env.WP_APP_PASSWORD || "EWqW lnfe Ara0 PGys lcBj 9x01";
const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };

const DRY_RUN = process.argv.includes("--dry-run");
const AS_DRAFT = process.argv.includes("--draft");

// ── Constants ────────────────────────────────────────────────────────────────
const SLUG = "ypo-vs-eo-vs-vistage-peer-group-comparison";
const TITLE = "YPO vs EO vs Vistage: Which Peer Group Is Right for You? (2026 Comparison)";
const META_DESCRIPTION = "Compare YPO, EO, Vistage, Tiger 21 and more. Find the right peer advisory group for your stage, budget, and values.";
const FOCUS_KEYWORD = "YPO vs EO vs Vistage";
const TAG_IDS = [24]; // phoenix-cta

// ── FAQ JSON-LD Schema ────────────────────────────────────────────────────────
const FAQ_SCHEMA = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the difference between YPO and EO?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "YPO (Young Presidents' Organization) requires members to hold the title of president, CEO, or equivalent before age 45, with at least $2M in annual revenue. EO (Entrepreneurs' Organization) has a lower bar — $1M in revenue — and is open to founders regardless of title. YPO is generally considered more exclusive and expensive (~$25K/year vs. $5–10K/year for EO). Both offer forum-based peer advisory, but YPO skews toward larger, later-stage companies."
      }
    },
    {
      "@type": "Question",
      "name": "Is Vistage worth the cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Vistage charges $15,000–$25,000 per year depending on the chapter and chair. Members report average revenue growth of 4.6x the rate of non-member companies (per Vistage's own research). The format — a professional chair facilitating 14–18 peers — is more structured than YPO or EO forums. It's worth it for leaders who want a professionally facilitated group and regular one-on-one coaching built in."
      }
    },
    {
      "@type": "Question",
      "name": "What is Tiger 21 and who is it for?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Tiger 21 (The Investment Group for Enhanced Results in the 21st Century) is a peer membership organization for ultra-high-net-worth entrepreneurs and investors. Members must have at least $10 million in investable assets. The focus is wealth preservation, portfolio construction, and the personal challenges of managing significant wealth after an exit or liquidity event. Annual fees are approximately $30,000."
      }
    },
    {
      "@type": "Question",
      "name": "Are there peer advisory groups for sober entrepreneurs?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Sober Founders runs two peer advisory tracks for entrepreneurs in recovery: a free weekly Thursday Mastermind (open to any sober business owner) and the Phoenix Forum (application-only, $1M+ revenue, weekly sessions). Unlike YPO, EO, Vistage, and Tiger 21 — which operate in drinking-culture environments — Sober Founders treats recovery as a shared foundation, not a private detail."
      }
    },
    {
      "@type": "Question",
      "name": "What revenue do you need to join YPO?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "YPO's standard membership requires at least $2 million in annual company revenue (or a comparable threshold based on employee count or assets under management) and you must hold a top executive role. You also must qualify before age 45 — after that, you transition to the YPO Gold or WPO (World Presidents' Organization) programs."
      }
    },
    {
      "@type": "Question",
      "name": "Can I join EO without $1M in revenue?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "EO's standard chapter membership requires $1M in annual revenue. However, EO runs an Accelerator program for businesses doing $250K–$1M in revenue, providing coaching and a pathway to full membership. There is no equity or title requirement — you just need to own at least 50% of the business."
      }
    },
    {
      "@type": "Question",
      "name": "Which peer advisory group is best for founders in recovery?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "For founders in recovery, Sober Founders is the only peer advisory network built with sobriety as a shared foundation. YPO, EO, Vistage, and Tiger 21 are excellent programs, but their social environments (retreats with open bars, wine-paired dinners, networking happy hours) can be isolating or triggering. Sober Founders' Phoenix Forum requires $1M+ revenue and active sobriety, mirroring the profile of YPO/EO members while creating a safer, more candid environment."
      }
    }
  ]
}, null, 2);

// ── Post content (Gutenberg blocks) ─────────────────────────────────────────
const CONTENT = `<!-- wp:paragraph -->
<p><em>Last updated: 2026-03-17</em></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Every serious entrepreneur eventually asks the same question: <em>Which peer group is actually worth my time and money?</em> YPO, EO, and Vistage are the three names that come up in almost every conversation. Tiger 21 surfaces for founders who've had an exit. And a growing number of entrepreneurs in recovery are asking a follow-up question no one used to ask: <em>Are any of these built for someone like me?</em></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>This guide breaks down all four — plus one option almost no one talks about — with real numbers, honest assessments, and a clear decision framework. We've tried to be genuinely fair to each organization. They've all helped thousands of founders. The point isn't to declare a winner; it's to help you figure out which one fits your stage, your goals, and your values.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">The Quick Answer: Comparison at a Glance</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Atomic Answer:</strong> YPO requires $2M+ revenue and top executive role (under 45 to join) at ~$25K/year. EO requires $1M+ revenue at $5–10K/year. Vistage costs $15–25K/year with no hard revenue floor. Tiger 21 requires $10M+ investable assets at ~$30K/year. Sober Founders Phoenix Forum requires $1M+ revenue and active sobriety, and is significantly more affordable.</p>
<!-- /wp:paragraph -->

<!-- wp:html -->
<div style="overflow-x:auto;margin:1.5em 0;">
<table style="width:100%;border-collapse:collapse;font-size:0.95em;">
  <thead>
    <tr style="background:#111;color:#fff;">
      <th style="padding:10px 14px;text-align:left;border:1px solid #ddd;">Organization</th>
      <th style="padding:10px 14px;text-align:left;border:1px solid #ddd;">Annual Cost</th>
      <th style="padding:10px 14px;text-align:left;border:1px solid #ddd;">Revenue / Asset Requirement</th>
      <th style="padding:10px 14px;text-align:left;border:1px solid #ddd;">Format</th>
      <th style="padding:10px 14px;text-align:left;border:1px solid #ddd;">Best For</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:9px 14px;border:1px solid #ddd;"><strong><a href="https://www.ypo.org">YPO</a></strong></td>
      <td style="padding:9px 14px;border:1px solid #ddd;">~$25,000+</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">$2M+ revenue, top exec role, under 45</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">Forum of 8–12 peers + chapter events</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">Scaling CEOs who want global prestige network</td>
    </tr>
    <tr style="background:#f9f9f9;">
      <td style="padding:9px 14px;border:1px solid #ddd;"><strong><a href="https://www.eonetwork.org">EO</a></strong></td>
      <td style="padding:9px 14px;border:1px solid #ddd;">$5,000–$10,000</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">$1M+ revenue, 50%+ ownership</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">Forum of 6–8 + global chapter network</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">$1–5M founders who want global community</td>
    </tr>
    <tr>
      <td style="padding:9px 14px;border:1px solid #ddd;"><strong><a href="https://www.vistage.com">Vistage</a></strong></td>
      <td style="padding:9px 14px;border:1px solid #ddd;">$15,000–$25,000</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">None officially (chairs screen for fit)</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">14–18 peers, professional chair, monthly</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">CEOs who want a structured advisory board feel</td>
    </tr>
    <tr style="background:#f9f9f9;">
      <td style="padding:9px 14px;border:1px solid #ddd;"><strong><a href="https://www.tiger21.com">Tiger 21</a></strong></td>
      <td style="padding:9px 14px;border:1px solid #ddd;">~$30,000+</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">$10M+ investable assets</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">12–15 peers, monthly, wealth-focused</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">Post-exit founders focused on capital preservation</td>
    </tr>
    <tr>
      <td style="padding:9px 14px;border:1px solid #ddd;"><strong><a href="/phoenix-forum-registration/">Sober Founders Phoenix Forum</a></strong></td>
      <td style="padding:9px 14px;border:1px solid #ddd;">Affordable (nonprofit)</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">$1M+ revenue, 1+ year sobriety</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">Weekly peer advisory, application-only</td>
      <td style="padding:9px 14px;border:1px solid #ddd;">Founders in recovery who want peer-level candor</td>
    </tr>
  </tbody>
</table>
</div>
<!-- /wp:html -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
<!-- wp:button {"backgroundColor":"black"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-black-background-color has-background wp-element-button" href="/events/">Attend a Free Mastermind</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">YPO (Young Presidents' Organization) — Deep Dive</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>YPO was founded in 1950 by Ray Hickok, a 27-year-old who had just taken over his family's manufacturing business. His premise was simple: no one understands the pressures of being a young CEO better than another young CEO. That insight has scaled into one of the most prestigious business networks in the world — 35,000+ members across 142 countries as of 2025.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Membership Requirements</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>To qualify for YPO standard membership, you must: (1) hold the title of president, CEO, managing director, or equivalent; (2) manage a business with at least $2 million in annual revenue, $4 million in assets, or 50+ employees; and (3) achieve this qualification before age 45. Once you hit 45, you transition to <a href="https://www.ypo.org/membership/ypo-gold/">YPO Gold</a> or WPO (World Presidents' Organization), which allows continued participation.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Cost</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Expect to pay $20,000–$35,000 per year depending on chapter, region, and event participation. Initiation fees add another $5,000–$15,000. This is the most expensive option on this list, though many members report that a single deal, partnership, or introduction pays for multiple years of membership.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Format</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>The core experience is the Forum — an intimate group of 8–12 members who meet monthly for a confidential, facilitated peer session. Forum meetings follow a structured process: members present personal and professional challenges, receive experience-sharing (not advice-giving) from peers, and commit to accountability actions. Chapter events, regional retreats, and global learning events layer on top.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Strengths</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li>Unmatched global network — 35,000 members across 6 continents</li>
<li>Forum confidentiality protocol is among the strongest of any peer group</li>
<li>Diverse, high-caliber peers who genuinely understand operating at scale</li>
<li>Exceptional learning events and speakers</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Weaknesses</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li>Expensive — prohibitive for many founders under $5M revenue</li>
<li>Social culture is heavily event-driven, with alcohol at most gatherings</li>
<li>Age cutoff (45) creates an artificial deadline</li>
<li>Quality varies significantly by chapter and forum group</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Who YPO Is Best For</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>YPO is ideal for founders who are already at $5M+ revenue, have global ambitions, and want a network that opens doors at the highest levels. If you're building a company you want to take international, raise institutional capital for, or eventually sell, the YPO network is hard to beat. The prestige is real and the relationships are deep — but you're paying for both. For more context on YPO from a recovery lens, see our full write-up on <a href="/ypo-for-sober-founders/">YPO for sober founders</a>.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">EO (Entrepreneurs' Organization) — Deep Dive</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Founded in 1987 by a group of young entrepreneurs who felt excluded from older executive networks, EO now has 18,000+ members in 220 chapters across 76 countries. It's designed specifically for entrepreneurs — not corporate executives — and the culture reflects that: scrappier, more candid, more focused on the chaos and joy of building something from scratch.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Membership Requirements</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>To join EO, you must own at least 50% of a business generating $1M or more in annual revenue. There's no age requirement and no title requirement — you just have to be the owner. For businesses in the $250K–$1M range, EO Accelerator provides coaching and a pathway to full membership. This lower bar makes EO accessible to a much wider range of founders than YPO.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Cost</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>EO costs $5,000–$10,000 per year depending on chapter and region, plus a one-time joining fee of approximately $1,000–$2,500. This makes it the most accessible of the major peer networks on a pure cost basis. Global conferences and University programs add cost if you opt in.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Format</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Like YPO, EO's core product is the Forum — groups of 6–8 members who meet monthly and follow the Gestalt protocol (experience sharing, not advice). EO also offers chapter events, EO University (a multi-day learning experience), and a global learning conference. The forum experience varies significantly by chapter, facilitator, and group chemistry.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Strengths</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li>More accessible than YPO — $1M threshold is reachable for many founders</li>
<li>True peer focus — every member is an entrepreneur, not an executive</li>
<li>Strong global chapter network with active programming</li>
<li>EO Accelerator for businesses approaching the $1M threshold</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Weaknesses</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li>Forum quality is highly variable — some groups are transformational, others are social</li>
<li>Chapter culture varies enormously — a great EO chapter and a mediocre one feel like different organizations</li>
<li>Social events, global conferences, and retreats are alcohol-centric</li>
<li>Less structured than Vistage — the quality depends heavily on the forum facilitator</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Who EO Is Best For</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>EO is the right choice for founders in the $1M–$10M range who want a peer community with international reach at a reasonable price point. If you've been the only entrepreneur in the room at every networking event you've attended, EO solves that problem. The global conference infrastructure and diverse peer set are genuine assets. Read our full breakdown of <a href="/entrepreneurs-organization-eo-for-sober-business-owners/">EO for sober business owners</a> if recovery is part of your evaluation.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Vistage — Deep Dive</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Vistage is the largest CEO peer advisory organization in the world, with 45,000+ members in 35 countries. Founded in 1957 by Robert Nourse in Milwaukee, Wisconsin, Vistage's model is fundamentally different from YPO and EO: instead of a peer-led forum, it's a professionally chaired group with a dedicated Vistage Chair — a trained executive coach — who facilitates the group, conducts monthly one-on-one coaching sessions with each member, and curates expert speakers.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Membership Requirements</h3>
<!-- /h3 -->
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Vistage has no official revenue minimum, but chairs generally target business owners with $1M–$50M in revenue. The application involves a conversation with the local chair, who decides on fit. This makes Vistage the most geographically available option — most mid-size U.S. cities have at least one active Vistage group. The target member is a CEO who wants structured accountability and coaching, not just peer connection.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Cost</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Vistage Chief Executive members typically pay $15,000–$25,000 per year. This includes the group meetings (usually one full day per month), monthly one-on-one coaching sessions with the chair, and access to expert speakers. There are also lower-cost tracks for smaller businesses (Vistage Small Business) and for key executive team members (Vistage Inside).</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Format</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>A standard Vistage Chief Executive group meets one full day per month (usually 8am–4pm) with 12–18 members. The agenda typically includes: a morning expert speaker presentation, member issue processing (structured open-floor problem solving), and afternoon peer-to-peer discussion. The chair also meets one-on-one with each member monthly for personal coaching. This structure is more consistent than EO or YPO forums because the professional chair maintains quality control.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Strengths</h3>
<!-- /w:heading -->
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li>Most structured and consistently facilitated of the major peer groups</li>
<li>Monthly one-on-one coaching included in membership</li>
<li>Vistage research shows member companies grow revenue at 4.6x the rate of non-members (Vistage, 2024)</li>
<li>Expert speaker curriculum is curated and high quality</li>
<li>Available in virtually every major U.S. metro</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Weaknesses</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li>Larger groups (14–18) mean less intimacy than YPO/EO forums (8–12)</li>
<li>Quality varies significantly by chair — the chair IS the product</li>
<li>Corporate, structured feel that some entrepreneurs find stifling</li>
<li>Less global than YPO or EO</li>
<li>Peer group luncheons and social events typically involve alcohol</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Who Vistage Is Best For</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Vistage works best for leaders who want a coach-facilitated, structured advisory experience rather than a peer-led forum. If you want someone to hold you accountable to the work — and you respond better to external structure than self-imposed accountability — a great Vistage chair is worth every dollar. The key is finding a chair you trust. Interview at least three before committing. Our full analysis of <a href="/vistage-for-sober-business-owners/">Vistage for sober business owners</a> covers the practical considerations.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Tiger 21 — Deep Dive</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Tiger 21 — which stands for The Investment Group for Enhanced Results in the 21st Century — was founded by Michael Sonnenfeldt in 1999. It's built for a very specific moment in an entrepreneur's life: after a significant liquidity event, when you've gone from building something to figuring out what to do with the proceeds. With 1,100+ members across North America and Europe, Tiger 21 is smaller than the other groups on this list but intensely focused.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Membership Requirements</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Tiger 21 requires a minimum of $10 million in investable assets (cash, securities, real estate — not your business equity). The typical member has sold a company or had a major liquidity event and is navigating wealth management for the first time. Members are self-made wealth creators, not inherited-wealth investors — that distinction matters to the culture.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Cost</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Membership runs approximately $30,000 per year. Given the wealth profile of members, this is a relatively small line item — but it reflects the premium positioning of the network. Tiger 21 also charges for some special events and programs separately.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Format</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Tiger 21 groups of 10–15 members meet monthly for a full day. The signature format is the Portfolio Defense — each member presents their complete investment portfolio to the group for peer review and critique. This level of financial transparency is unusual in peer groups and creates an unusually candid environment. Group discussions cover investment strategy, philanthropy, family dynamics, and the psychological challenges of wealth.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Who Tiger 21 Is Best For</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Tiger 21 is purpose-built for the post-exit founder navigating significant wealth for the first time. If you've sold your company and suddenly have $10M–$100M to manage, you have a completely different set of problems than you had while operating. Tiger 21 solves for those problems specifically — and the peers who've been through the same transition are irreplaceable. For sober founders at this stage, see our dedicated piece on <a href="/tiger-21-for-sober-business-owners/">Tiger 21 for sober business owners</a>.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">What None of These Groups Address</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Here's something that almost never gets said plainly in these comparison articles: all four of these organizations operate in a drinking culture. Not incidentally — structurally. The YPO annual conference is a five-day event with hosted bars at every evening function. EO's chapter retreats feature wine-paired dinners as a standard component. Vistage chapter events often conclude at a restaurant or bar. Tiger 21's social gatherings are no different.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>For most members, this is irrelevant background noise. But for an entrepreneur in recovery, it's a different calculus. You can absolutely attend these events sober — many people do. But you're managing that privately. You're the only one in the room who knows you're not drinking. You're navigating conversations about "having a few too many last night" and "we all need a drink after that." You're doing a layer of social work that your peers aren't doing.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>More significantly: none of these groups are designed for the particular intersection of entrepreneurship and recovery. The cash-flow shame that comes from financial chaos during active addiction. The overwork that becomes the new compulsion. The boundary patterns that develop when substances were your primary coping mechanism. The ambivalence about being visible about your recovery in professional settings. These are real business challenges for entrepreneurs in recovery — and no one in a standard YPO forum is equipped to engage with them.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>According to SAMHSA's 2023 National Survey on Drug Use and Health, approximately 28.9 million Americans had alcohol use disorder in the past year — and research consistently shows higher rates of substance use disorders among entrepreneurs than the general population. There are a lot of sober founders sitting in YPO forums and EO groups who have never once mentioned their recovery, because the environment didn't feel safe enough to do so. That's the gap Sober Founders exists to close.</p>
<!-- /wp:paragraph -->

<!-- wp:blockquote -->
<blockquote class="wp-block-quote">
<p>"I was in a Vistage group for three years and it helped my business. But I never told anyone in that room I was in recovery. The chair would open meetings at a nice restaurant, there was always wine on the table. I spent energy managing that every month. When I found the Phoenix Forum, the first thing I noticed was how much less energy I was spending on not talking about the most important thing about me."</p>
<cite>— Marcus T., founder of a $4M logistics services company, 7 years sober</cite>
</blockquote>
<!-- /wp:blockquote -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Sober Founders: The Missing Option</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Sober Founders is a 501(c)(3) nonprofit with 500+ members that runs peer advisory groups exclusively for entrepreneurs in recovery. It's not a support group — it's a business mastermind where sobriety is the shared foundation, not the topic of conversation. Members talk about payroll, pricing, hiring, exits, and strategy. They just do it in a room where no one is managing a secret.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>There are two tracks:</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Thursday Free Mastermind</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>The Thursday session is open to any sober entrepreneur who owns a business — no revenue minimum, no application. It runs weekly and is free. Members range from pre-revenue solopreneurs to $10M+ operators. The format is informal: hot seat problem-solving, experience sharing, accountability check-ins. It's a good first step to understand the community before deciding whether to pursue the Phoenix Forum. You can <a href="/events/">register for the next session</a> and show up with a business problem you're stuck on.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Phoenix Forum ($1M+ Revenue, Application-Only)</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>The <a href="/phoenix-forum-registration/">Phoenix Forum</a> is Sober Founders' flagship peer advisory program. Requirements: $1M+ annual revenue, 1+ year of continuous sobriety, business owner. It runs weekly — not monthly like YPO, EO, or Vistage — which creates significantly tighter accountability and faster relationship depth. The application process is intentional: peer groups only work when everyone in the room is operating at a comparable level.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>The Phoenix Forum is designed to be the peer group you'd choose over YPO or EO if you're in recovery — not a consolation prize, but the right tool for the job. Weekly cadence. Shared sobriety foundation. Peer-level business challenges. The vulnerability that comes naturally when no one in the room is performing.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>For a full comparison of how the Phoenix Forum stacks up against mainstream peer groups, see our <a href="/peer-advisory-sober-entrepreneurs/">peer advisory for sober entrepreneurs</a> overview, or read about what it means to be an <a href="/entrepreneurs-in-recovery/">entrepreneur in recovery</a> navigating these decisions.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
<!-- wp:button {"backgroundColor":"black"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-black-background-color has-background wp-element-button" href="/phoenix-forum-registration/">Apply to Phoenix Forum</a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="/events/">Attend a Free Thursday Mastermind</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">How to Decide: A Decision Framework</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Use this framework to cut through the noise. Answer each question in order — the first answer that applies is your recommendation.</p>
<!-- /wp:paragraph -->

<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list">
<li><strong>Are you in recovery?</strong> If yes — and you want a peer group where that's a shared foundation, not a managed secret — go to Sober Founders. Start with the free Thursday Mastermind. If you're at $1M+ revenue, apply to the Phoenix Forum. The other groups are excellent, but they weren't built for you.</li>
<li><strong>Have you had a major liquidity event ($10M+ investable assets)?</strong> If yes, Tiger 21 solves a specific and real problem. You need peers who've navigated sudden wealth. Look there first.</li>
<li><strong>Are you at $5M+ revenue with global ambitions?</strong> YPO's network is hard to replicate. If the prestige and deal flow of a 35,000-person global network justify the cost, YPO is the right move. Make sure you join before 45.</li>
<li><strong>Are you at $1–5M revenue and want a peer community at a reasonable cost?</strong> EO is probably your answer. Lower cost, true entrepreneur focus, global reach. Vet the local chapter carefully — quality varies.</li>
<li><strong>Do you want structured facilitation and one-on-one coaching built in?</strong> Vistage's professional-chair model is the most consistent experience on this list. If you respond better to external accountability than self-imposed structure, find a great Vistage chair.</li>
<li><strong>Are you between $250K and $1M in revenue?</strong> EO Accelerator or Sober Founders Thursday Mastermind. You're not yet eligible for most of the groups above, but you need peers now. Don't wait.</li>
</ol>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>One note on mixing: there's no rule that says you can only join one. Some founders belong to both a Vistage group and the Sober Founders community simultaneously, getting different things from each. The peer advisory category has plenty of room for complementary memberships.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Frequently Asked Questions</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">What is the difference between YPO and EO?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>YPO requires members to hold a top executive role (CEO, president, etc.) before age 45, with at least $2M in annual revenue. EO has a lower bar — $1M in revenue and 50%+ ownership — with no age requirement and no title requirement. YPO is generally more expensive (~$25K/year vs. $5–10K/year for EO) and perceived as more exclusive. Both use forum-based peer advisory as their core format, but YPO skews toward larger, later-stage companies and has a more global, prestige-oriented culture.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Is Vistage worth the cost?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Vistage reports that member companies grow revenue at 4.6x the rate of non-member businesses (Vistage Research, 2024). The structured format — a professional chair, monthly full-day meetings, and individual monthly coaching — is more consistent than the peer-led forum model used by YPO and EO. Whether it's worth $15K–$25K/year depends almost entirely on the quality of your chair. A great chair is transformational. A mediocre one is an expensive calendar commitment. Interview multiple chairs before joining.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">What is Tiger 21 and who is it for?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Tiger 21 is a peer membership organization for entrepreneurs and investors with at least $10 million in investable assets — typically people who've sold a company or had a significant liquidity event. The focus is wealth preservation, portfolio construction, and the personal challenges of managing significant capital after an exit. The signature format is the Portfolio Defense, where each member presents their full investment portfolio for peer review. Annual fees are approximately $30,000. It's the right tool for a very specific moment in an entrepreneur's life.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Are there peer advisory groups for sober entrepreneurs?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Yes. Sober Founders is the only peer advisory network built specifically for entrepreneurs in recovery. The free Thursday Mastermind is open to any sober business owner. The Phoenix Forum (application-only, $1M+ revenue, 1+ year sobriety) is the flagship weekly peer advisory program. Unlike YPO, EO, Vistage, and Tiger 21 — which operate in social environments where alcohol is standard — Sober Founders treats sobriety as a shared foundation. Members report that the recovery lens creates a level of candor and trust that is unusual even in high-quality mainstream peer groups.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">What revenue do you need to join YPO?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>YPO's standard membership requires at least $2 million in annual company revenue (or $4M in assets, or 50+ employees), a top executive role, and qualification before age 45. Qualification thresholds vary slightly by chapter and industry. After 45, YPO members transition to YPO Gold or WPO, which allow continued participation with a slightly different peer composition.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Can I join EO without $1M in revenue?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>EO requires $1M in annual revenue for standard chapter membership. For businesses doing $250K–$1M, EO runs the Accelerator program, which provides structured coaching and a pathway to full EO membership. You must own at least 50% of the business to qualify for either track. There is no title requirement and no age limit.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Which peer advisory group is best for founders in recovery?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>For founders in recovery, Sober Founders is the only peer advisory network with sobriety as a shared foundation. YPO, EO, Vistage, and Tiger 21 are all excellent programs for the right person — but their social environments (open bars at retreats, wine-paired dinners, networking happy hours) can be isolating or triggering for members in recovery. Sober Founders' Phoenix Forum mirrors the profile of YPO and EO members ($1M+ revenue, peer-level challenge) while creating an environment where no one is managing their recovery privately. Start with the <a href="/events/">free Thursday session</a> to see whether the community resonates.</p>
<!-- /wp:paragraph -->

<!-- wp:html -->
<script type="application/ld+json">
${FAQ_SCHEMA}
</script>
<!-- /wp:html -->`;

// ── WordPress publish ────────────────────────────────────────────────────────
async function wpRequest(path, options = {}) {
  const url = `${SITE}/wp-json${path}`;
  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function main() {
  console.log("=== Publish Comparison Hub: YPO vs EO vs Vistage ===\n");
  console.log(`Site:   ${SITE}`);
  console.log(`Slug:   ${SLUG}`);
  console.log(`Mode:   ${DRY_RUN ? "DRY-RUN" : AS_DRAFT ? "DRAFT" : "PUBLISH"}`);
  console.log(`Title:  ${TITLE}`);
  console.log(`Tags:   ${TAG_IDS.join(", ")} (phoenix-cta)\n`);

  if (DRY_RUN) {
    console.log("--- CONTENT PREVIEW (first 2000 chars) ---");
    console.log(CONTENT.substring(0, 2000));
    console.log("\n[dry-run] No changes made.");
    return;
  }

  // Check if post already exists by slug
  console.log("Checking for existing post with this slug...");
  const { body: existing } = await wpRequest(`/wp/v2/posts?slug=${SLUG}&_fields=id,link,status`);
  if (Array.isArray(existing) && existing.length > 0) {
    const ex = existing[0];
    console.log(`  Found existing post ID ${ex.id} (${ex.status}) at ${ex.link}`);
    console.log("  Updating existing post...");

    const { status, body } = await wpRequest(`/wp/v2/posts/${ex.id}`, {
      method: "POST",
      body: {
        title: TITLE,
        content: CONTENT,
        status: AS_DRAFT ? "draft" : "publish",
        tags: TAG_IDS,
      },
    });

    if (status >= 400) {
      console.error(`WordPress error (${status}):`, JSON.stringify(body).substring(0, 300));
      process.exit(1);
    }

    console.log(`  Updated: ID ${body.id}, status=${body.status}`);
    console.log(`  URL: ${body.link}`);

    await setYoastSEO(ex.id);
    console.log(`\nDone. Post at: ${body.link}`);
    return;
  }

  // Create new post
  console.log("Creating new post...");
  const { status, body } = await wpRequest("/wp/v2/posts", {
    method: "POST",
    body: {
      title: TITLE,
      content: CONTENT,
      status: AS_DRAFT ? "draft" : "publish",
      slug: SLUG,
      tags: TAG_IDS,
    },
  });

  if (status >= 400) {
    console.error(`WordPress error (${status}):`, JSON.stringify(body).substring(0, 300));
    process.exit(1);
  }

  const postId = body.id;
  const postLink = body.link;
  console.log(`  Created: ID ${postId}, status=${body.status}`);
  console.log(`  URL: ${postLink}\n`);

  await setYoastSEO(postId);

  console.log(`\nDone. Post live at: ${postLink}`);
}

async function setYoastSEO(postId) {
  console.log("Setting Yoast SEO fields...");
  const { body: seoResult } = await wpRequest("/sober/v1/seo", {
    method: "POST",
    body: {
      post_id: postId,
      title: `YPO vs EO vs Vistage: Which Peer Group Is Right for You? | Sober Founders`,
      description: META_DESCRIPTION,
      focus_keyword: FOCUS_KEYWORD,
    },
  });

  if (seoResult?.success) {
    console.log(`  SEO fields set: ${seoResult.updated?.join(", ")}`);
  } else {
    console.warn("  SEO write result:", JSON.stringify(seoResult).substring(0, 200));
  }

  // Verify
  const { body: verify } = await wpRequest(`/sober/v1/seo/${postId}`);
  if (verify?.title) {
    console.log(`  Verified title: ${verify.title}`);
    console.log(`  Verified description: ${verify.description}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message || err);
  process.exit(1);
});
