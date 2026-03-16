#!/usr/bin/env node
/**
 * deploy-services-page.mjs — Redesign Services page
 *
 * Usage:
 *   node scripts/deploy-services-page.mjs [--dry-run]
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
// Page content — Full visual redesign
// ---------------------------------------------------------------------------
const PAGE_CONTENT = `<!-- wp:html -->
<!-- SF Services Page — deployed by deploy-services-page.mjs -->
<style>
  .sf-services-page { font-family: inherit; color: #2e3443; }
  .sf-services-page * { box-sizing: border-box; }

  /* ── Hero ── */
  .sf-svc-hero {
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    padding: 80px 24px 70px;
    text-align: center;
    border-radius: 16px;
    margin-bottom: 64px;
    position: relative;
    overflow: hidden;
  }
  .sf-svc-hero::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(circle at 30% 20%, rgba(0,178,134,0.15) 0%, transparent 50%),
                radial-gradient(circle at 70% 80%, rgba(0,178,134,0.1) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-svc-hero h1 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 400;
    color: #ffffff;
    margin: 0 0 16px;
    position: relative;
  }
  .sf-svc-hero h1 .sf-accent { color: #00b286; }
  .sf-svc-hero p {
    font-size: 1.15rem;
    color: rgba(255,255,255,0.75);
    max-width: 620px;
    margin: 0 auto;
    line-height: 1.7;
    position: relative;
  }

  /* ── Service cards grid ── */
  .sf-svc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    max-width: 1080px;
    margin: 0 auto 72px;
    padding: 0 24px;
  }
  @media (max-width: 768px) {
    .sf-svc-grid { grid-template-columns: 1fr; }
  }

  .sf-svc-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 0;
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex;
    flex-direction: column;
  }
  .sf-svc-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.08);
  }

  .sf-svc-card-img {
    width: 100%;
    height: 220px;
    object-fit: cover;
    display: block;
  }

  .sf-svc-card-body {
    padding: 32px 28px;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .sf-svc-card-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px; height: 38px;
    background: linear-gradient(135deg, #00b286, #00c090);
    color: #fff;
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: 10px;
    margin-bottom: 16px;
    flex-shrink: 0;
  }

  .sf-svc-card h3 {
    font-family: "DM Serif Display", serif;
    font-size: 1.35rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 12px;
  }
  .sf-svc-card p {
    font-size: 0.97rem;
    line-height: 1.7;
    color: #475467;
    margin: 0;
    flex: 1;
  }

  .sf-svc-tag {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 12px;
    border-radius: 20px;
    margin-top: 18px;
    width: fit-content;
  }
  .sf-tag-free {
    background: rgba(0,178,134,0.1);
    color: #008e65;
  }
  .sf-tag-paid {
    background: rgba(241,151,44,0.1);
    color: #c67a1e;
  }

  .sf-svc-card-link {
    display: inline-block;
    margin-top: 20px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #00b286 !important;
    text-decoration: none !important;
    transition: color 0.2s;
  }
  .sf-svc-card-link:hover {
    color: #008e65 !important;
  }
  .sf-svc-card-link::after {
    content: " \\2192";
  }

  /* ── Featured card (Phoenix Forum) ── */
  .sf-svc-featured {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    border: none;
  }
  @media (max-width: 768px) {
    .sf-svc-featured { grid-template-columns: 1fr; }
  }
  .sf-svc-featured .sf-svc-card-img {
    height: 100%;
    min-height: 300px;
  }
  .sf-svc-featured .sf-svc-card-body {
    padding: 44px 36px;
    justify-content: center;
  }
  .sf-svc-featured .sf-svc-card-num {
    background: rgba(0,178,134,0.2);
  }
  .sf-svc-featured h3 {
    color: #ffffff;
    font-size: 1.6rem;
  }
  .sf-svc-featured p {
    color: rgba(255,255,255,0.75);
  }
  .sf-svc-featured .sf-svc-tag {
    background: rgba(241,151,44,0.15);
    color: #f1972c;
  }
  .sf-svc-featured .sf-svc-card-link {
    display: inline-block;
    background: #00b286;
    color: #fff !important;
    padding: 12px 28px;
    border-radius: 30px;
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: background 0.2s, transform 0.2s;
    text-decoration: none !important;
    margin-top: 24px;
  }
  .sf-svc-featured .sf-svc-card-link::after { content: ""; }
  .sf-svc-featured .sf-svc-card-link:hover {
    background: #00c090;
    color: #fff !important;
    transform: translateY(-2px);
  }

  /* ── Benefits section ── */
  .sf-svc-benefits {
    background: #f6f7f9;
    border-radius: 20px;
    padding: 70px 24px;
    margin: 0 auto 72px;
    max-width: 1080px;
  }
  .sf-svc-benefits h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #101828;
    text-align: center;
    margin: 0 0 12px;
  }
  .sf-svc-benefits .sf-benefits-sub {
    text-align: center;
    color: #667085;
    font-size: 1.05rem;
    margin: 0 auto 48px;
    max-width: 540px;
    line-height: 1.6;
  }
  .sf-benefits-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .sf-benefits-grid { grid-template-columns: 1fr; }
  }
  .sf-benefit-card {
    text-align: center;
    padding: 32px 24px;
    background: #ffffff;
    border-radius: 14px;
    border: 1px solid #e5e7eb;
  }
  .sf-benefit-icon {
    width: 56px; height: 56px;
    background: linear-gradient(135deg, #00b286, #00c090);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 18px;
  }
  .sf-benefit-icon svg {
    width: 26px; height: 26px; fill: #fff;
  }
  .sf-benefit-card h3 {
    font-family: "DM Serif Display", serif;
    font-size: 1.15rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 10px;
  }
  .sf-benefit-card p {
    font-size: 0.93rem;
    line-height: 1.65;
    color: #667085;
    margin: 0;
  }

  /* ── CTA ── */
  .sf-svc-cta {
    text-align: center;
    padding: 60px 24px;
    background: linear-gradient(135deg, rgba(0,178,134,0.06), rgba(0,178,134,0.02));
    border-radius: 20px;
    margin: 0 auto 40px;
    max-width: 1080px;
  }
  .sf-svc-cta h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 14px;
  }
  .sf-svc-cta p {
    color: #667085;
    font-size: 1.05rem;
    max-width: 520px;
    margin: 0 auto 28px;
    line-height: 1.65;
  }
  .sf-svc-cta-btn {
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
  .sf-svc-cta-btn:hover {
    background: #00c090;
    transform: translateY(-2px);
  }
</style>

<div class="sf-services-page">

  <!-- Hero -->
  <div class="sf-svc-hero">
    <h1>How We Help <span class="sf-accent">Sober Founders</span> Win</h1>
    <p>Free community programs and curated peer groups designed for entrepreneurs in recovery&mdash;so you never have to build alone.</p>
  </div>

  <!-- Services Grid -->
  <div class="sf-svc-grid">

    <!-- 01 — Free Weekly Masterminds -->
    <div class="sf-svc-card">
      <img class="sf-svc-card-img" src="https://soberfounders.org/wp-content/uploads/2024/10/pexels-photo-3228690.jpeg" alt="Group of entrepreneurs collaborating at a meeting" />
      <div class="sf-svc-card-body">
        <div class="sf-svc-card-num">01</div>
        <h3>Free Weekly Mastermind Events</h3>
        <p>Join a group of entrepreneurs who understand the challenges of entrepreneurship and sobriety. Build lasting relationships, share wins and obstacles, and get real-time feedback from peers who genuinely care about your success.</p>
        <span class="sf-svc-tag sf-tag-free">Free</span>
        <a href="/events/" class="sf-svc-card-link">View Upcoming Events</a>
      </div>
    </div>

    <!-- 02 — Networking Events -->
    <div class="sf-svc-card">
      <img class="sf-svc-card-img" src="https://soberfounders.org/wp-content/uploads/2024/10/pexels-photo-8349428.jpeg" alt="Entrepreneurs networking at a sober event" />
      <div class="sf-svc-card-body">
        <div class="sf-svc-card-num">02</div>
        <h3>Networking Events</h3>
        <p>Connect with sober entrepreneurs from every industry in a safe, substance-free environment. Our in-person and virtual events are designed to spark collaboration, partnerships, and friendships that fuel both recovery and revenue.</p>
        <span class="sf-svc-tag sf-tag-free">Free</span>
        <a href="/events/" class="sf-svc-card-link">See What's Coming Up</a>
      </div>
    </div>

    <!-- 03 — Workshops & Resources -->
    <div class="sf-svc-card">
      <img class="sf-svc-card-img" src="https://soberfounders.org/wp-content/uploads/2024/10/pexels-photo-5257759.jpeg" alt="Workshop session for sober entrepreneurs" />
      <div class="sf-svc-card-body">
        <div class="sf-svc-card-num">03</div>
        <h3>Workshops &amp; Resources</h3>
        <p>Sharpen your skills with workshops on business strategy, financial management, and personal development. Plus, access our growing library of articles, templates, and guides built specifically for founders in recovery.</p>
        <span class="sf-svc-tag sf-tag-free">Free</span>
        <a href="/events/" class="sf-svc-card-link">Browse Workshops</a>
      </div>
    </div>

    <!-- 04 — Phoenix Forum (Featured, full-width) -->
    <div class="sf-svc-card sf-svc-featured">
      <img class="sf-svc-card-img" src="https://soberfounders.org/wp-content/uploads/2025/01/pexels-rdne-5756743-1024x683.jpg" alt="Intimate peer advisory group discussion" />
      <div class="sf-svc-card-body">
        <div class="sf-svc-card-num">04</div>
        <h3>Phoenix Forum</h3>
        <p>An exclusive peer advisory board for sober entrepreneurs generating $1M+ in revenue with multiple years of sobriety. Intimate groups of up to 10 members engage in curated, high-trust discussions around business growth, sobriety, and personal life&mdash;because at this level, the stakes are higher and the isolation is real.</p>
        <span class="sf-svc-tag sf-svc-tag">Curated &bull; Application Only</span>
        <a href="/phoenix-forum-2nd-group/" class="sf-svc-card-link">Apply to Join the Phoenix Forum</a>
      </div>
    </div>

  </div>

  <!-- Benefits -->
  <div class="sf-svc-benefits">
    <h2>Why Founders Choose Us</h2>
    <p class="sf-benefits-sub">Every program is built around what sober entrepreneurs actually need&mdash;not what looks good on a brochure.</p>
    <div class="sf-benefits-grid">
      <div class="sf-benefit-card">
        <div class="sf-benefit-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192h42.7c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96H21.3C9.6 320 0 310.4 0 298.7zM405.3 320H235.4c26.5-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7h42.7C423.2 192 471 239.8 471 298.7c0 11.8-9.6 21.3-21.3 21.3h-44.3zM320 256a96 96 0 1 0 0-192 96 96 0 1 0 0 192zm-94.8 32c-47 0-87.9 26.2-108.8 64.8C100.2 378.7 92.9 400.8 86.5 432H553.5c-6.4-31.2-13.7-53.3-29.9-79.2C502.7 314.2 461.8 288 414.8 288H225.2z"/></svg>
        </div>
        <h3>Peer Support</h3>
        <p>Connect with others who truly understand how recovery shapes your business decisions. Real talk, real support.</p>
      </div>
      <div class="sf-benefit-card">
        <div class="sf-benefit-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
        </div>
        <h3>Accountability</h3>
        <p>Stay on track with sobriety and business goals through a community built on follow-through, not lip service.</p>
      </div>
      <div class="sf-benefit-card">
        <div class="sf-benefit-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm320 96c0-26.9-16.5-49.9-40-59.3V88c0-13.3-10.7-24-24-24s-24 10.7-24 24V292.7c-23.5 9.5-40 32.5-40 59.3c0 35.3 28.7 64 64 64s64-28.7 64-64z"/></svg>
        </div>
        <h3>Professional Growth</h3>
        <p>Access workshops, resources, and peer insights designed to sharpen your skills and scale your business.</p>
      </div>
    </div>
  </div>

  <!-- CTA -->
  <div class="sf-svc-cta">
    <h2>Ready to Join the Movement?</h2>
    <p>Your next breakthrough starts with showing up. Attend a free event and see what this community is all about.</p>
    <a href="/events/" class="sf-svc-cta-btn">Attend a Free Meeting</a>
  </div>

</div>
<!-- /wp:html -->`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const PAGE_ID = 1992;

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Services — Page Redesign");
  console.log(`  Target: ${SITE}/services/`);
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
