#!/usr/bin/env node
/**
 * deploy-our-story-page.mjs — Redesign /our-story/ page
 *
 * Usage:
 *   node scripts/deploy-our-story-page.mjs [--dry-run]
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
const DRY_RUN = process.argv.includes("--dry-run");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${AUTH}` };

const PAGE_ID = 2352;

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------
const PAGE_CONTENT = `<!-- wp:html -->
<!-- SF Our Story — deployed by deploy-our-story-page.mjs -->
<style>
  .sf-story { font-family: inherit; color: #2e3443; }
  .sf-story * { box-sizing: border-box; }

  /* ── Hero ── */
  .sf-story-hero {
    background: linear-gradient(135deg, #101828 0%, #1a2940 40%, #0d3b2e 100%);
    padding: 100px 24px 90px;
    text-align: center;
    border-radius: 16px;
    margin-bottom: 70px;
    position: relative;
    overflow: hidden;
  }
  .sf-story-hero::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(circle at 25% 30%, rgba(0,178,134,0.12) 0%, transparent 50%),
                radial-gradient(circle at 75% 70%, rgba(0,178,134,0.08) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-story-hero .sf-hero-label {
    font-family: "DM Sans", sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: #00b286;
    margin: 0 0 16px;
    position: relative;
  }
  .sf-story-hero h1 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(2.2rem, 5vw, 3.2rem);
    font-weight: 400;
    color: #ffffff;
    margin: 0 0 20px;
    position: relative;
  }
  .sf-story-hero .sf-hero-sub {
    font-size: 1.15rem;
    color: rgba(255,255,255,0.6);
    max-width: 560px;
    margin: 0 auto;
    line-height: 1.7;
    position: relative;
    font-style: italic;
  }

  /* ── Narrative wrapper ── */
  .sf-narrative {
    max-width: 760px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* ── Chapter sections ── */
  .sf-chapter {
    margin-bottom: 64px;
    position: relative;
  }
  .sf-chapter-label {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-family: "DM Sans", sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #00b286;
    margin-bottom: 20px;
  }
  .sf-chapter-label::before {
    content: "";
    display: inline-block;
    width: 32px;
    height: 2px;
    background: #00b286;
  }
  .sf-chapter p {
    font-size: 1.1rem;
    line-height: 1.85;
    color: #475467;
    margin: 0 0 20px;
  }
  .sf-chapter p:last-child { margin-bottom: 0; }
  .sf-chapter strong { color: #101828; }

  /* ── Pull quote ── */
  .sf-pullquote {
    background: linear-gradient(135deg, #101828, #1a2940);
    border-radius: 16px;
    padding: 48px 40px;
    margin: 48px 0;
    position: relative;
    overflow: hidden;
  }
  .sf-pullquote::before {
    content: "\\201C";
    font-family: "DM Serif Display", serif;
    font-size: 8rem;
    color: rgba(0,178,134,0.15);
    position: absolute;
    top: -20px;
    left: 20px;
    line-height: 1;
    pointer-events: none;
  }
  .sf-pullquote p {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.2rem, 2.5vw, 1.55rem);
    font-weight: 400;
    color: #ffffff;
    line-height: 1.6;
    margin: 0;
    position: relative;
  }
  .sf-pullquote .sf-pq-accent { color: #00b286; }

  /* ── Milestone cards ── */
  .sf-milestone {
    display: flex;
    gap: 24px;
    align-items: flex-start;
    margin: 40px 0;
  }
  @media (max-width: 600px) {
    .sf-milestone { flex-direction: column; gap: 16px; }
  }
  .sf-milestone-year {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #00b286, #00c090);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "DM Serif Display", serif;
    font-size: 1.3rem;
    color: #fff;
    font-weight: 400;
  }
  .sf-milestone-body {
    flex: 1;
    padding-top: 4px;
  }
  .sf-milestone-body h3 {
    font-family: "DM Serif Display", serif;
    font-size: 1.25rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 8px;
  }
  .sf-milestone-body p {
    font-size: 1.05rem;
    line-height: 1.75;
    color: #475467;
    margin: 0;
  }

  /* ── Poetic block ── */
  .sf-poetic {
    background: #f6f7f9;
    border-left: 4px solid #00b286;
    border-radius: 0 14px 14px 0;
    padding: 32px 36px;
    margin: 40px 0;
  }
  .sf-poetic p {
    font-size: 1.1rem;
    line-height: 2;
    color: #344054;
    margin: 0;
  }
  .sf-poetic strong { color: #101828; }

  /* ── Divider ── */
  .sf-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin: 56px 0;
    color: #d0d5dd;
  }
  .sf-divider::before,
  .sf-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e5e7eb;
  }
  .sf-divider svg { width: 20px; height: 20px; fill: #00b286; flex-shrink: 0; }

  /* ── Closing CTA ── */
  .sf-story-cta {
    text-align: center;
    padding: 64px 24px;
    background: linear-gradient(135deg, rgba(0,178,134,0.06), rgba(0,178,134,0.02));
    border-radius: 20px;
    margin: 20px 0 40px;
  }
  .sf-story-cta h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 14px;
  }
  .sf-story-cta p {
    color: #667085;
    font-size: 1.05rem;
    max-width: 500px;
    margin: 0 auto 28px;
    line-height: 1.65;
  }
  .sf-story-cta .sf-cta-btn {
    display: inline-block;
    background: #00b286;
    color: #fff !important;
    font-size: 1rem;
    font-weight: 600;
    text-decoration: none !important;
    padding: 14px 36px;
    border-radius: 30px;
    transition: background 0.2s, transform 0.2s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .sf-story-cta .sf-cta-btn:hover {
    background: #00c090;
    transform: translateY(-2px);
  }

  /* ── Closing statement ── */
  .sf-closing {
    text-align: center;
    margin: 48px 0 16px;
  }
  .sf-closing p {
    font-family: "DM Serif Display", serif;
    font-size: 1.4rem;
    font-weight: 400;
    color: #101828;
    line-height: 1.7;
    margin: 0;
  }
  .sf-closing .sf-accent { color: #00b286; }
</style>

<div class="sf-story">

  <!-- Hero -->
  <div class="sf-story-hero">
    <p class="sf-hero-label">Sober Founders</p>
    <h1>Our Story</h1>
    <p class="sf-hero-sub">The beginning of everything&hellip;</p>
  </div>

  <div class="sf-narrative">

    <!-- Chapter 1: The Struggle -->
    <div class="sf-chapter">
      <div class="sf-chapter-label">The Struggle</div>
      <p>For over a decade, I battled alcoholism and addiction. I couldn&rsquo;t stop&mdash;even when I wanted to. I drank against my own will. It cost me relationships, clarity, peace&hellip; and nearly my freedom.</p>
      <p>In 2013, after a DUI and an arrest, I was given an ultimatum: <strong>jail or rehab</strong>. At the time, it felt like the worst moment of my life. Looking back, it was the turning point that saved it.</p>
      <p>After 30 days in rehab and a newfound outlook on life, I made the best and hardest decision of my life&mdash;to stay sober.</p>
    </div>

    <div class="sf-divider">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm50.7-186.9L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.2-15.8 16.9-20.8l107.6-69.2c5.1-3.3 11.8 1.4 10.3 7.2l-24.1 98.7c-1.7 7 .2 14.4 5.2 19.4l68.2 68.2c4.6 4.6 2 12.5-4.6 13.8l-59.7 12.3c-7.3 1.5-13.5 6.5-16.6 13.4z"/></svg>
    </div>

    <!-- Chapter 2: The Lonely Road -->
    <div class="sf-chapter">
      <div class="sf-chapter-label">The Lonely Road</div>

      <div class="sf-milestone">
        <div class="sf-milestone-year">2014</div>
        <div class="sf-milestone-body">
          <h3>First Company Launched</h3>
          <p>With one year sober, I launched my first real company. From the outside, I looked like I had it all together. But inside, I was juggling a storm&mdash;running a business, managing employees, delivering for clients&mdash;and trying to surrender to God&rsquo;s will while still holding tight to control. There were so many days drinking felt like the only answer.</p>
        </div>
      </div>

      <p>And the environment didn&rsquo;t help.</p>

      <div class="sf-poetic">
        <p>Networking events? <strong>Happy hours.</strong><br>
        Conferences? <strong>Open bars.</strong><br>
        Entrepreneur culture? <strong>Work hard, play harder.</strong><br>
        But for people like us&mdash;alcoholics and addicts&mdash;that &ldquo;play&rdquo; nearly destroyed us.</p>
      </div>

      <p>I&rsquo;ve always loved the concept of helping others, which is the basis of 12-step recovery. We help others, and in turn, our lives get better. I applied those principles in helping other entrepreneurs and had seen the impact it was having in their lives, their families&rsquo; lives, and their employees&rsquo; lives.</p>
    </div>

    <div class="sf-divider">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm50.7-186.9L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.2-15.8 16.9-20.8l107.6-69.2c5.1-3.3 11.8 1.4 10.3 7.2l-24.1 98.7c-1.7 7 .2 14.4 5.2 19.4l68.2 68.2c4.6 4.6 2 12.5-4.6 13.8l-59.7 12.3c-7.3 1.5-13.5 6.5-16.6 13.4z"/></svg>
    </div>

    <!-- Chapter 3: The Turning Point -->
    <div class="sf-chapter">
      <div class="sf-chapter-label">The Turning Point</div>

      <div class="sf-milestone">
        <div class="sf-milestone-year">2023</div>
        <div class="sf-milestone-body">
          <h3>A Successful Exit&mdash;and a Question</h3>
          <p>I exited my company successfully. I had resources, time, and space to reflect. I asked myself, &ldquo;What would I do every day if money didn&rsquo;t matter?&rdquo; and the answer was clear:</p>
        </div>
      </div>

      <div class="sf-pullquote">
        <p>I&rsquo;d dedicate my life to helping other entrepreneurs in recovery <span class="sf-pq-accent">grow their businesses and stay sober.</span></p>
      </div>

      <p>I already had sponsees who were founders. My sponsor ran a business. We&rsquo;d have powerful, honest conversations about sobriety and entrepreneurship&mdash;but always behind closed doors. It never felt appropriate to bring these discussions into a 12-step meeting&hellip; and they didn&rsquo;t belong at a business mastermind either.</p>

      <div class="sf-poetic">
        <p>There had to be a better way.<br>
        A place where recovery and business could <strong>coexist.</strong><br>
        Where we could talk about cash flow <em>and</em> cravings.<br>
        Marketing funnels <em>and</em> mental health.<br>
        Growth <em>and</em> grace.</p>
      </div>

      <p>So I built the thing I couldn&rsquo;t find. The thing I wish existed in the previous decade of building my own company&mdash;through the lonely lows and bittersweet highs that came along with being in recovery at the same time.</p>
    </div>

    <div class="sf-divider">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm50.7-186.9L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.2-15.8 16.9-20.8l107.6-69.2c5.1-3.3 11.8 1.4 10.3 7.2l-24.1 98.7c-1.7 7 .2 14.4 5.2 19.4l68.2 68.2c4.6 4.6 2 12.5-4.6 13.8l-59.7 12.3c-7.3 1.5-13.5 6.5-16.6 13.4z"/></svg>
    </div>

    <!-- Chapter 4: The First Meeting -->
    <div class="sf-chapter">
      <div class="sf-chapter-label">The First Meeting</div>
      <p>The first meeting started as a group text of fellow entrepreneur friends and a random post on Facebook&mdash;for anyone with over $250k in revenue and one year of sobriety to join. I didn&rsquo;t expect much. Maybe a few friends would pop in, say hi, and it would eventually fizzle out.</p>
      <p><strong>But it didn&rsquo;t.</strong></p>
      <p>Strangers joined the group, and then immediately were begging for more (typical addict tendency, haha).</p>
      <p>I realized I had something that wasn&rsquo;t just a little one-off thing, but the potential for something huge.</p>
    </div>

    <div class="sf-divider">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm50.7-186.9L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.2-15.8 16.9-20.8l107.6-69.2c5.1-3.3 11.8 1.4 10.3 7.2l-24.1 98.7c-1.7 7 .2 14.4 5.2 19.4l68.2 68.2c4.6 4.6 2 12.5-4.6 13.8l-59.7 12.3c-7.3 1.5-13.5 6.5-16.6 13.4z"/></svg>
    </div>

    <!-- Chapter 5: The Sign -->
    <div class="sf-chapter">
      <div class="sf-chapter-label">The Sign to Keep Going</div>
      <p>At the time of forming the group, I had made a list: &ldquo;If X happens, keep going. If Y happens, quit.&rdquo; One of the long-shot items on the &ldquo;keep going&rdquo; list was if a random stranger reached out and said this was a great idea&mdash;that would be enough outside validation to keep going.</p>

      <div class="sf-pullquote">
        <p>After the second meeting, I received a DM from an old account manager&mdash;someone from a software we hadn&rsquo;t used in years. She said what we were doing was incredible, something she wished <span class="sf-pq-accent">her father had when she was growing up</span>&hellip; That hit hard.</p>
      </div>

      <p>The same day, I received another DM from a newsletter asking for an interview to learn more about Sober Founders and what we were doing. The idea got a fast proof of concept and has been growing ever since.</p>
    </div>

    <div class="sf-divider">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm50.7-186.9L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.2-15.8 16.9-20.8l107.6-69.2c5.1-3.3 11.8 1.4 10.3 7.2l-24.1 98.7c-1.7 7 .2 14.4 5.2 19.4l68.2 68.2c4.6 4.6 2 12.5-4.6 13.8l-59.7 12.3c-7.3 1.5-13.5 6.5-16.6 13.4z"/></svg>
    </div>

    <!-- Closing -->
    <div class="sf-chapter">
      <div class="sf-chapter-label">The Movement</div>
      <p>What started as a side project became a full-blown nonprofit&mdash;a 501(c)(3)&mdash;thanks to the support of early members, generous donors, and the undeniable impact we were having on each other&rsquo;s lives.</p>
    </div>

    <div class="sf-closing">
      <p><strong>Sober Founders</strong> is more than a group.<br>
      It&rsquo;s a <span class="sf-accent">movement.</span><br>
      And we&rsquo;re just getting started.</p>
    </div>

  </div><!-- /.sf-narrative -->

  <!-- CTA -->
  <div class="sf-story-cta">
    <h2>Be Part of the Story</h2>
    <p>Join a community of sober entrepreneurs who are building businesses and better lives&mdash;together.</p>
    <a href="/events/" class="sf-cta-btn">Attend a Free Meeting</a>
  </div>

</div>
<!-- /wp:html -->`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Our Story — Page Redesign");
  console.log(`  Target: ${SITE}/our-story/`);
  console.log(`  Page ID: ${PAGE_ID}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would replace page content with redesigned version.");
    console.log(`  Content length: ${PAGE_CONTENT.length} chars`);
    return;
  }

  const url = `${SITE}/wp-json/wp/v2/pages/${PAGE_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: PAGE_CONTENT }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status} ${res.statusText}: ${body}`);
  }

  const result = await res.json();
  console.log(`  ✓ Page updated successfully (ID ${result.id})`);
  console.log(`  ✓ Live: ${result.link}\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
