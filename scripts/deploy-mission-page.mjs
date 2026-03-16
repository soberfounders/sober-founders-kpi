#!/usr/bin/env node
/**
 * deploy-mission-page.mjs — Redesign Mission, Vision & Principles page
 *
 * Usage:
 *   node scripts/deploy-mission-page.mjs [--dry-run]
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
  let envPath = resolve(ROOT, ".env.local");
  try {
    readFileSync(envPath, "utf8");
  } catch {
    envPath = resolve(ROOT, ".env");
  }
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

// ---------------------------------------------------------------------------
// Page content — Full visual redesign
// ---------------------------------------------------------------------------
const PAGE_CONTENT = `<!-- wp:html -->
<!-- SF Mission Page — deployed by deploy-mission-page.mjs -->
<style>
  .sf-mission-page { font-family: inherit; color: #2e3443; }
  .sf-mission-page * { box-sizing: border-box; }

  /* ── Hero ── */
  .sf-mission-hero {
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    padding: 80px 24px 70px;
    text-align: center;
    border-radius: 16px;
    margin-bottom: 60px;
    position: relative;
    overflow: hidden;
  }
  .sf-mission-hero::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(circle at 30% 20%, rgba(0,178,134,0.15) 0%, transparent 50%),
                radial-gradient(circle at 70% 80%, rgba(0,178,134,0.1) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-mission-hero h1 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 400;
    color: #ffffff;
    margin: 0 0 16px;
    position: relative;
  }
  .sf-mission-hero .sf-hero-accent {
    color: #00b286;
  }
  .sf-mission-hero p {
    font-size: 1.15rem;
    color: rgba(255,255,255,0.75);
    max-width: 600px;
    margin: 0 auto;
    line-height: 1.7;
    position: relative;
  }

  /* ── Mission + Vision cards ── */
  .sf-mv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    max-width: 1000px;
    margin: 0 auto 70px;
    padding: 0 24px;
  }
  @media (max-width: 768px) {
    .sf-mv-grid { grid-template-columns: 1fr; }
  }
  .sf-mv-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 40px 36px;
    position: relative;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .sf-mv-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.08);
  }
  .sf-mv-card .sf-mv-icon {
    width: 56px; height: 56px;
    background: linear-gradient(135deg, #00b286, #00c090);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
  }
  .sf-mv-card .sf-mv-icon svg {
    width: 28px; height: 28px; fill: #fff;
  }
  .sf-mv-card h2 {
    font-family: "DM Serif Display", serif;
    font-size: 1.5rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 12px;
  }
  .sf-mv-card p {
    font-size: 1.05rem;
    line-height: 1.75;
    color: #475467;
    margin: 0;
  }

  /* ── Principles section ── */
  .sf-principles {
    background: #f6f7f9;
    border-radius: 20px;
    padding: 70px 24px;
    margin: 0 auto 70px;
  }
  .sf-principles h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #101828;
    text-align: center;
    margin: 0 0 12px;
  }
  .sf-principles .sf-principles-sub {
    text-align: center;
    color: #667085;
    font-size: 1.05rem;
    margin: 0 auto 48px;
    max-width: 540px;
    line-height: 1.6;
  }
  .sf-principles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 24px;
    max-width: 1060px;
    margin: 0 auto;
  }
  .sf-principle-card {
    background: #ffffff;
    border-radius: 14px;
    padding: 28px 26px;
    border: 1px solid #e5e7eb;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .sf-principle-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 30px rgba(0,0,0,0.06);
  }
  .sf-principle-card .sf-p-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px; height: 36px;
    background: linear-gradient(135deg, #00b286, #00c090);
    color: #fff;
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: 10px;
    margin-bottom: 14px;
  }
  .sf-principle-card h3 {
    font-family: "DM Serif Display", serif;
    font-size: 1.15rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 8px;
  }
  .sf-principle-card p {
    font-size: 0.95rem;
    line-height: 1.65;
    color: #667085;
    margin: 0;
  }

  /* ── Results section ── */
  .sf-results {
    text-align: center;
    padding: 0 24px 20px;
    margin-bottom: 60px;
  }
  .sf-results h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 48px;
  }
  .sf-results-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .sf-results-grid { grid-template-columns: 1fr; gap: 24px; }
  }
  .sf-result-card {
    background: linear-gradient(135deg, #101828, #1a2940);
    border-radius: 16px;
    padding: 40px 28px;
    text-align: center;
  }
  .sf-result-card .sf-r-icon {
    width: 60px; height: 60px;
    background: rgba(0,178,134,0.15);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
  }
  .sf-result-card .sf-r-icon svg {
    width: 28px; height: 28px; fill: #00b286;
  }
  .sf-result-card .sf-r-num {
    font-family: "DM Serif Display", serif;
    font-size: 2.2rem;
    font-weight: 400;
    color: #00b286;
    margin: 0 0 8px;
  }
  .sf-result-card p {
    font-size: 0.95rem;
    color: rgba(255,255,255,0.7);
    line-height: 1.5;
    margin: 0;
  }

  /* ── CTA ── */
  .sf-mission-cta {
    text-align: center;
    padding: 60px 24px;
    background: linear-gradient(135deg, rgba(0,178,134,0.06), rgba(0,178,134,0.02));
    border-radius: 20px;
    margin-bottom: 40px;
  }
  .sf-mission-cta h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 14px;
  }
  .sf-mission-cta p {
    color: #667085;
    font-size: 1.05rem;
    max-width: 520px;
    margin: 0 auto 28px;
    line-height: 1.65;
  }
  .sf-cta-btn {
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
  .sf-cta-btn:hover {
    background: #00c090;
    transform: translateY(-2px);
  }
</style>

<div class="sf-mission-page">

  <!-- Hero -->
  <div class="sf-mission-hero">
    <h1>Our <span class="sf-hero-accent">Mission</span>, Vision &amp; Principles</h1>
    <p>The beliefs that guide every conversation, every meeting, and every breakthrough in our community of sober entrepreneurs.</p>
  </div>

  <!-- Mission + Vision -->
  <div class="sf-mv-grid">
    <div class="sf-mv-card">
      <div class="sf-mv-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm50.7-186.9L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.2-15.8 16.9-20.8l107.6-69.2c5.1-3.3 11.8 1.4 10.3 7.2l-24.1 98.7c-1.7 7 .2 14.4 5.2 19.4l68.2 68.2c4.6 4.6 2 12.5-4.6 13.8l-59.7 12.3c-7.3 1.5-13.5 6.5-16.6 13.4z"/></svg>
      </div>
      <h2>Our Mission</h2>
      <p>Sober Founders exists to empower entrepreneurs in recovery through connection, accountability, and growth&mdash;so they can build thriving businesses and better lives.</p>
    </div>
    <div class="sf-mv-card">
      <div class="sf-mv-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M288 0c17.7 0 32 14.3 32 32V49.7C451.8 63.4 557.7 161 573.9 285.9c2 15.6-17.3 24.4-27.8 12.7C532.1 283 504.8 272 480 272c-38.7 0-71.2 24.8-83.2 59.4c-5.2 14.9-24.4 18.2-34.1 5.8C342.9 311.7 313.5 296 288 296s-54.9 15.7-74.7 41.2c-9.7 12.5-28.9 9.1-34.1-5.8C167.2 296.8 134.7 272 96 272c-24.8 0-52.1 11-66.1 26.7C19.4 310.4 .1 301.5 2.1 285.9 18.3 161 124.2 63.4 256 49.7V32c0-17.7 14.3-32 32-32zm0 304c12.3 0 23.5 4.6 32.8 11.9 23.9-36.9 64.1-61.9 110.9-65.4C407.1 177.7 352.3 128 288 128s-119.1 49.7-143.7 122.5c46.8 3.5 87 28.5 110.9 65.4C264.5 308.6 275.7 304 288 304z"/></svg>
      </div>
      <h2>Our Vision</h2>
      <p>A global movement of sober entrepreneurs leading with integrity, scaling with purpose, and lifting others as they rise. We will be synonymous with recovery-centered programs and peer-to-peer entrepreneur groups.</p>
    </div>
  </div>

  <!-- Guiding Principles -->
  <div class="sf-principles">
    <h2>Our Guiding Principles</h2>
    <p class="sf-principles-sub">Ten values we live by&mdash;in every meeting, every conversation, and every decision.</p>
    <div class="sf-principles-grid">
      <div class="sf-principle-card">
        <div class="sf-p-num">01</div>
        <h3>Real Talk Over Small Talk</h3>
        <p>We value transparency. Honest conversations create real breakthroughs.</p>
      </div>
      <div class="sf-principle-card">
        <div class="sf-p-num">02</div>
        <h3>Confidentiality Is Non-Negotiable</h3>
        <p>What happens in the group stays in the group. Trust is everything.</p>
      </div>
      <div class="sf-principle-card">
        <div class="sf-p-num">03</div>
        <h3>Accountability Builds Momentum</h3>
        <p>We don't just share&mdash;we commit and follow through.</p>
      </div>
      <div class="sf-principle-card">
        <div class="sf-p-num">04</div>
        <h3>Experience, Not Advice</h3>
        <p>We speak from what we've lived, not from theory.</p>
      </div>
      <div class="sf-principle-card">
        <div class="sf-p-num">05</div>
        <h3>Leave the Ego at the Door</h3>
        <p>This is a no-BS zone. Titles and revenue don't define us here.</p>
      </div>
      <div class="sf-principle-card">
        <div class="sf-p-num">06</div>
        <h3>Recovery First, Always</h3>
        <p>Without sobriety, nothing else works. We protect it at all costs.</p>
      </div>
      <div class="sf-principle-card">
        <div class="sf-p-num">07</div>
        <h3>We Grow Together</h3>
        <p>Support, feedback, and community fuel our personal and business growth.</p>
      </div>
      <div class="sf-principle-card">
        <div class="sf-p-num">08</div>
        <h3>Business Is a Tool for Impact</h3>
        <p>Making money and making a difference aren't mutually exclusive.</p>
      </div>
      <div class="sf-principle-card">
        <div class="sf-p-num">09</div>
        <h3>Clarity Beats Hustle</h3>
        <p>We prioritize alignment, not burnout.</p>
      </div>
      <div class="sf-principle-card">
        <div class="sf-p-num">10</div>
        <h3>Purpose Over Posturing</h3>
        <p>We're here to do the work&mdash;on ourselves and in our businesses.</p>
      </div>
    </div>
  </div>

  <!-- Results -->
  <div class="sf-results">
    <h2>Results That Speak for Themselves</h2>
    <div class="sf-results-grid">
      <div class="sf-result-card">
        <div class="sf-r-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192h42.7c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96H21.3C9.6 320 0 310.4 0 298.7zM405.3 320H235.4c26.5-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7h42.7C423.2 192 471 239.8 471 298.7c0 11.8-9.6 21.3-21.3 21.3h-44.3zM320 256a96 96 0 1 0 0-192 96 96 0 1 0 0 192zm-94.8 32c-47 0-87.9 26.2-108.8 64.8C100.2 378.7 92.9 400.8 86.5 432H553.5c-6.4-31.2-13.7-53.3-29.9-79.2C502.7 314.2 461.8 288 414.8 288H225.2z"/></svg>
        </div>
        <div class="sf-r-num">500+</div>
        <p>Entrepreneurs helped through our community programs</p>
      </div>
      <div class="sf-result-card">
        <div class="sf-r-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
        </div>
        <div class="sf-r-num">98%</div>
        <p>Say Sober Founders has helped them stay sober</p>
      </div>
      <div class="sf-result-card">
        <div class="sf-r-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><path d="M160 0c17.7 0 32 14.3 32 32V67.7c1.6 .3 3.2 .7 4.7 1.1l16.4 4.4c17.1 4.5 27.2 22.1 22.7 39.1s-22.1 27.2-39.1 22.7l-16.4-4.4c-9.1-2.4-18.6-3.5-28.1-3.2c-16.5 .5-30.5 7.2-38.6 17.2c-6.4 7.9-9 17.1-6.7 27.3c1.7 7.5 6.4 13.6 15.7 19.1c10.9 6.4 25.8 10.8 44.7 16.2l.7 .2c16.6 4.7 36.5 10.4 51.6 20.8c18.1 12.5 30 30.8 33.3 55.4c3.5 25.6-3.3 49.4-19.1 67.5c-10.3 11.8-23.5 20.3-38.7 25.4V480c0 17.7-14.3 32-32 32s-32-14.3-32-32V445.1c-.4-.1-.9-.1-1.3-.2l-24-6.4c-17.1-4.5-27.2-22.1-22.7-39.1s22.1-27.2 39.1-22.7l24 6.4c9.4 2.5 19.3 3.6 29 3.2c16.2-.5 29.8-6.9 37.6-16.6c6.2-7.6 8.6-16.7 6.4-26.2c-1.5-6.5-5.6-12-14.6-17.2c-11.3-6.6-26.8-11.2-46.3-16.8c-16.2-4.6-35.2-10-49.3-19.4c-18.2-12.1-30.6-30.1-34.1-54.8c-3.7-26.1 3-50.7 19.2-69.4c11-12.7 25.3-21.7 41.4-27V32c0-17.7 14.3-32 32-32z"/></svg>
        </div>
        <div class="sf-r-num">$1M+</div>
        <p>In additional revenue reported by our members</p>
      </div>
    </div>
  </div>

  <!-- CTA -->
  <div class="sf-mission-cta">
    <h2>Ready to Join the Movement?</h2>
    <p>Connect with sober entrepreneurs who understand the unique challenges of building a business in recovery.</p>
    <a href="/events/" class="sf-cta-btn">Attend a Free Meeting</a>
  </div>

</div>
<!-- /wp:html -->`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const PAGE_ID = 2349;

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Mission, Vision & Principles — Page Redesign");
  console.log(`  Target: ${SITE}/mission-vision-and-principles/`);
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
