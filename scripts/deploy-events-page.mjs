#!/usr/bin/env node
/**
 * deploy-events-page.mjs — Full visual redesign of /events/ page
 *
 * Usage:
 *   node scripts/deploy-events-page.mjs [--dry-run]
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
// Page content — Full events page redesign
// ---------------------------------------------------------------------------
const PAGE_CONTENT = `<!-- wp:html -->
<!-- SF Events Page — deployed by deploy-events-page.mjs -->
<style>
  .sf-ev { font-family: inherit; color: #2e3443; }
  .sf-ev * { box-sizing: border-box; }
  .sf-ev img { max-width: 100%; display: block; }
  .sf-ev a { text-decoration: none; }

  /* ── Hero removed ── */

  /* ── Buttons ── */
  .sf-ev-btn {
    display: inline-block;
    font-size: 0.95rem;
    font-weight: 600;
    padding: 14px 32px;
    border-radius: 30px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 0.25s;
    cursor: pointer;
  }
  .sf-ev-btn-primary {
    background: #00b286;
    color: #fff !important;
    text-decoration: none !important;
  }
  .sf-ev-btn-primary:hover {
    background: #00c090;
    color: #fff !important;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,178,134,0.3);
  }
  .sf-ev-btn-outline {
    background: transparent;
    color: #fff !important;
    border: 1.5px solid rgba(255,255,255,0.3);
    text-decoration: none !important;
  }
  .sf-ev-btn-outline:hover {
    border-color: rgba(255,255,255,0.6);
    background: rgba(255,255,255,0.05);
    color: #fff !important;
    transform: translateY(-2px);
  }
  .sf-ev-btn-wa {
    background: #25D366;
    color: #fff !important;
    text-decoration: none !important;
  }
  .sf-ev-btn-wa:hover {
    background: #20bd5a;
    color: #fff !important;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(37,211,102,0.3);
  }

  /* ── Sections ── */
  .sf-ev-section {
    max-width: 1100px;
    margin: 0 auto;
    padding: 80px 24px;
  }
  .sf-ev-section-heading {
    text-align: center;
    margin-bottom: 48px;
  }
  .sf-ev-section-heading h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 12px;
  }
  .sf-ev-section-heading p {
    color: #667085;
    font-size: 1.05rem;
    max-width: 560px;
    margin: 0 auto;
    line-height: 1.7;
  }

  /* ── Three tiers — stacked horizontal cards ── */
  .sf-ev-tiers {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .sf-ev-tier {
    display: grid;
    grid-template-columns: 64px 1fr auto;
    align-items: center;
    gap: 28px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    padding: 32px 36px;
    position: relative;
    overflow: hidden;
    transition: transform 0.3s, box-shadow 0.3s;
  }
  .sf-ev-tier::before {
    content: "";
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 5px;
    border-radius: 20px 0 0 20px;
  }
  .sf-ev-tier:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 48px rgba(0,0,0,0.08);
  }
  @media (max-width: 768px) {
    .sf-ev-tier {
      grid-template-columns: 1fr;
      text-align: center;
      padding: 32px 24px;
    }
  }

  /* Color accents per tier */
  .sf-ev-tier-green::before { background: linear-gradient(180deg, #00b286, #00c090); }
  .sf-ev-tier-blue::before { background: linear-gradient(180deg, #3b82f6, #60a5fa); }
  .sf-ev-tier-gold::before { background: linear-gradient(180deg, #f59e0b, #fbbf24); }

  /* Icon circle */
  .sf-ev-tier-icon {
    width: 64px; height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sf-ev-tier-icon svg { width: 28px; height: 28px; fill: #fff; }
  .sf-ev-tier-icon-green { background: linear-gradient(135deg, #00b286, #00c090); box-shadow: 0 6px 20px rgba(0,178,134,0.3); }
  .sf-ev-tier-icon-blue { background: linear-gradient(135deg, #3b82f6, #60a5fa); box-shadow: 0 6px 20px rgba(59,130,246,0.3); }
  .sf-ev-tier-icon-gold { background: linear-gradient(135deg, #f59e0b, #fbbf24); box-shadow: 0 6px 20px rgba(245,158,11,0.3); }
  @media (max-width: 768px) {
    .sf-ev-tier-icon { margin: 0 auto; }
  }

  /* Middle content */
  .sf-ev-tier-body h3 {
    font-family: "DM Serif Display", serif;
    font-size: 1.4rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 4px;
  }
  .sf-ev-tier-schedule {
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .sf-ev-tier-green .sf-ev-tier-schedule { color: #00b286; }
  .sf-ev-tier-blue .sf-ev-tier-schedule { color: #3b82f6; }
  .sf-ev-tier-gold .sf-ev-tier-schedule { color: #d97706; }
  .sf-ev-tier-body p {
    font-size: 0.93rem;
    line-height: 1.65;
    color: #475467;
    margin: 0 0 10px;
  }
  .sf-ev-tier-reqs {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 0.85rem;
    color: #667085;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
  }
  .sf-ev-tier-reqs li {
    padding-left: 18px;
    position: relative;
    line-height: 1.6;
  }
  .sf-ev-tier-reqs li::before {
    content: "\\2713";
    position: absolute;
    left: 0;
    font-weight: 700;
  }
  .sf-ev-tier-green .sf-ev-tier-reqs li::before { color: #00b286; }
  .sf-ev-tier-blue .sf-ev-tier-reqs li::before { color: #3b82f6; }
  .sf-ev-tier-gold .sf-ev-tier-reqs li::before { color: #d97706; }

  /* Right-side CTA */
  .sf-ev-tier-action {
    flex-shrink: 0;
  }
  @media (max-width: 768px) {
    .sf-ev-tier-action { margin: 0 auto; }
  }
  .sf-ev-tier-link {
    display: inline-block;
    font-size: 0.88rem;
    font-weight: 600;
    padding: 12px 28px;
    border-radius: 30px;
    text-decoration: none !important;
    transition: all 0.25s;
    white-space: nowrap;
  }
  .sf-ev-tier-link:hover {
    transform: translateY(-2px);
  }
  .sf-ev-link-green {
    background: #00b286;
    color: #fff !important;
  }
  .sf-ev-link-green:hover {
    background: #00c090;
    box-shadow: 0 8px 24px rgba(0,178,134,0.3);
  }
  .sf-ev-link-blue {
    background: #3b82f6;
    color: #fff !important;
  }
  .sf-ev-link-blue:hover {
    background: #2563eb;
    box-shadow: 0 8px 24px rgba(59,130,246,0.3);
  }
  .sf-ev-link-gold {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #fff !important;
  }
  .sf-ev-link-gold:hover {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    box-shadow: 0 8px 24px rgba(245,158,11,0.3);
  }

  /* ── How it works ── */
  .sf-ev-how {
    background: #f6f7f9;
    border-radius: 24px;
    padding: 60px 24px;
    max-width: 1100px;
    margin: 0 auto;
  }
  .sf-ev-steps {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 32px;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .sf-ev-steps { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .sf-ev-steps { grid-template-columns: 1fr; }
  }
  .sf-ev-step { text-align: center; position: relative; }
  .sf-ev-step-num {
    width: 48px; height: 48px;
    background: linear-gradient(135deg, #00b286, #00c090);
    color: #fff;
    font-weight: 700;
    font-size: 1.1rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    position: relative;
    z-index: 1;
  }
  .sf-ev-step h4 {
    font-family: "DM Serif Display", serif;
    font-size: 1.08rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 8px;
  }
  .sf-ev-step p {
    font-size: 0.88rem;
    color: #667085;
    line-height: 1.6;
    margin: 0;
  }

  /* ── Calendar section ── */
  .sf-ev-calendar-section {
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    border-radius: 24px;
    padding: 60px 24px;
    max-width: 1100px;
    margin: 0 auto;
    position: relative;
    overflow: hidden;
  }
  .sf-ev-calendar-section::before {
    content: "";
    position: absolute; inset: 0;
    background:
      radial-gradient(circle at 25% 50%, rgba(0,178,134,0.1) 0%, transparent 50%),
      radial-gradient(circle at 75% 50%, rgba(0,178,134,0.08) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-ev-calendar-heading {
    text-align: center;
    margin-bottom: 36px;
    position: relative;
  }
  .sf-ev-calendar-heading h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #ffffff;
    margin: 0 0 8px;
  }
  .sf-ev-calendar-heading p {
    color: rgba(255,255,255,0.6);
    font-size: 1rem;
    margin: 0;
  }
  .sf-ev-calendar-wrap {
    max-width: 650px;
    margin: 0 auto;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 20px;
    position: relative;
    backdrop-filter: blur(4px);
  }
  .sf-ev-calendar-wrap iframe {
    width: 100%;
    border-radius: 12px;
    border: none;
  }

  /* ── Community CTA ── */
  .sf-ev-community {
    display: flex;
    align-items: center;
    gap: 40px;
    max-width: 900px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    padding: 48px 40px;
    transition: transform 0.3s, box-shadow 0.3s;
  }
  .sf-ev-community:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 48px rgba(0,0,0,0.06);
  }
  @media (max-width: 768px) {
    .sf-ev-community {
      flex-direction: column;
      text-align: center;
      padding: 36px 28px;
      gap: 24px;
    }
  }
  .sf-ev-community-icon {
    width: 80px; height: 80px;
    background: linear-gradient(135deg, #25D366, #128C7E);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sf-ev-community-icon svg { width: 40px; height: 40px; fill: #fff; }
  .sf-ev-community-text { flex: 1; }
  .sf-ev-community-text h3 {
    font-family: "DM Serif Display", serif;
    font-size: 1.4rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 8px;
  }
  .sf-ev-community-text p {
    font-size: 0.95rem;
    color: #667085;
    line-height: 1.7;
    margin: 0 0 20px;
  }
  .sf-ev-community-note {
    font-size: 0.82rem;
    color: #98a2b3;
    font-style: italic;
    margin: 0 !important;
    padding-top: 12px;
    border-top: 1px solid #f2f4f7;
  }

  /* ── Divider ── */
  .sf-ev-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin: 0 auto;
    max-width: 1100px;
    padding: 0 24px;
  }
  .sf-ev-divider::before,
  .sf-ev-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e5e7eb;
  }
  .sf-ev-divider svg {
    width: 20px; height: 20px;
    fill: #00b286;
    flex-shrink: 0;
  }

  /* ── Internal links (SEO) ── */
  .sf-ev-internal {
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px 24px 0;
    font-size: 0.9rem;
    color: #667085;
    line-height: 2;
  }
  .sf-ev-internal a {
    color: #00b286 !important;
    text-decoration: none !important;
    font-weight: 500;
    transition: color 0.2s;
  }
  .sf-ev-internal a:hover { color: #008e65 !important; }
  .sf-ev-sep { margin: 0 6px; color: #d1d5db; }
</style>

<div class="sf-ev">

  <!-- ═══ Three Ways to Get Involved ═══ -->
  <div class="sf-ev-section">
    <div class="sf-ev-section-heading">
      <h2>Three Ways to Get Involved</h2>
      <p>Whether you're just getting started or leading an eight-figure company, there's a seat at the table for you.</p>
    </div>

    <div class="sf-ev-tiers">

      <!-- Thursday -->
      <div class="sf-ev-tier sf-ev-tier-green">
        <div class="sf-ev-tier-icon sf-ev-tier-icon-green">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192h42.7c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96H21.3C9.6 320 0 310.4 0 298.7zM405.3 320H235.4c26.5-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7h42.7C423.2 192 471 239.8 471 298.7c0 11.8-9.6 21.3-21.3 21.3h-44.3zM320 256a96 96 0 1 0 0-192 96 96 0 1 0 0 192zm-94.8 32c-47 0-87.9 26.2-108.8 64.8C100.2 378.7 92.9 400.8 86.5 432H553.5c-6.4-31.2-13.7-53.3-29.9-79.2C502.7 314.2 461.8 288 414.8 288H225.2z"/></svg>
        </div>
        <div class="sf-ev-tier-body">
          <h3>Thursday Mastermind</h3>
          <div class="sf-ev-tier-schedule">Every Thursday &bull; 11:00 AM ET</div>
          <p>Free and open to every sober entrepreneur. No revenue minimum, no interview, no gatekeeping.</p>
          <ul class="sf-ev-tier-reqs">
            <li>Sober &amp; own a business</li>
            <li>No application required</li>
            <li>10&ndash;25 founders per session</li>
          </ul>
        </div>
        <div class="sf-ev-tier-action">
          <a href="#sf-calendar" class="sf-ev-tier-link sf-ev-link-green">Sign Up Free</a>
        </div>
      </div>

      <!-- Tuesday -->
      <div class="sf-ev-tier sf-ev-tier-blue">
        <div class="sf-ev-tier-icon sf-ev-tier-icon-blue">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 0c36.8 0 68.8 20.7 84.9 51.1C373.8 41 411 49 437 75s34 63.3 23.9 96.1C491.3 187.2 512 219.2 512 256s-20.7 68.8-51.1 84.9C471 373.8 463 411 437 437s-63.3 34-96.1 23.9C324.8 491.3 292.8 512 256 512s-68.8-20.7-84.9-51.1C138.2 471 101 463 75 437s-34-63.3-23.9-96.1C20.7 324.8 0 292.8 0 256s20.7-68.8 51.1-84.9C41 138.2 49 101 75 75s63.3-34 96.1-23.9C187.2 20.7 219.2 0 256 0zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
        </div>
        <div class="sf-ev-tier-body">
          <h3>Tuesday &ldquo;All Our Affairs&rdquo;</h3>
          <div class="sf-ev-tier-schedule">Every Tuesday &bull; 12:00 PM ET</div>
          <p>For verified founders ready for deeper accountability. Smaller groups, higher trust.</p>
          <ul class="sf-ev-tier-reqs">
            <li>$250K+ revenue</li>
            <li>2+ employees</li>
            <li>1+ year sober</li>
            <li>Interview required</li>
          </ul>
        </div>
        <div class="sf-ev-tier-action">
          <a href="/apply/" class="sf-ev-tier-link sf-ev-link-blue">Apply Now</a>
        </div>
      </div>

      <!-- Phoenix Forum -->
      <div class="sf-ev-tier sf-ev-tier-gold">
        <div class="sf-ev-tier-icon sf-ev-tier-icon-gold">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6H426.6c30.9 0 57.5-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>
        </div>
        <div class="sf-ev-tier-body">
          <h3>Phoenix Forum</h3>
          <div class="sf-ev-tier-schedule">Monthly &bull; Curated Schedule</div>
          <p>Exclusive peer advisory board for $1M+ revenue founders. Intimate groups of up to 10.</p>
          <ul class="sf-ev-tier-reqs">
            <li>$1M+ revenue</li>
            <li>1+ year sober</li>
            <li>Legacy &amp; leadership focused</li>
          </ul>
        </div>
        <div class="sf-ev-tier-action">
          <a href="/phoenix-forum-2nd-group/" class="sf-ev-tier-link sf-ev-link-gold">Learn More</a>
        </div>
      </div>

    </div>
  </div>

  <!-- ═══ How It Works ═══ -->
  <div style="max-width:1100px;margin:0 auto;padding:0 24px 80px;">
    <div class="sf-ev-how">
      <div class="sf-ev-section-heading" style="margin-bottom: 40px;">
        <h2>How a Mastermind Works</h2>
        <p>Each session follows a simple, powerful format designed to give you real answers from people who've been there.</p>
      </div>
      <div class="sf-ev-steps">
        <div class="sf-ev-step">
          <div class="sf-ev-step-num">1</div>
          <h4>Show Up</h4>
          <p>Join the Zoom call. Intros are quick &mdash; name, business, sobriety date.</p>
        </div>
        <div class="sf-ev-step">
          <div class="sf-ev-step-num">2</div>
          <h4>Bring a Challenge</h4>
          <p>Share something real &mdash; a toxic partner, cash flow crisis, or sobriety struggle.</p>
        </div>
        <div class="sf-ev-step">
          <div class="sf-ev-step-num">3</div>
          <h4>Get Peer Insights</h4>
          <p>The group spends 10&ndash;15 minutes helping you solve with experience, strength, and hope.</p>
        </div>
        <div class="sf-ev-step">
          <div class="sf-ev-step-num">4</div>
          <h4>Pay It Forward</h4>
          <p>Help someone else with what you've learned. That's the real magic.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ Calendar ═══ -->
  <div style="max-width:1100px;margin:0 auto;padding:0 24px 80px;" id="sf-calendar">
    <div class="sf-ev-calendar-section">
      <div class="sf-ev-calendar-heading">
        <h2>Upcoming Events</h2>
        <p>Pick a session and register &mdash; it takes 30 seconds.</p>
      </div>
      <div class="sf-ev-calendar-wrap">
        <iframe
          src="https://lu.ma/embed/calendar/cal-rU4i5G8WMp8lWrH/events"
          width="100%"
          height="900"
          frameborder="0"
          allowfullscreen=""
          aria-hidden="false"
          tabindex="0"
          style="border-radius: 12px;"
        ></iframe>
      </div>
    </div>
  </div>

  <!-- ═══ Divider ═══ -->
  <div style="padding: 0 0 60px;">
    <div class="sf-ev-divider">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
    </div>
  </div>

  <!-- ═══ WhatsApp Community ═══ -->
  <div class="sf-ev-section" style="padding-top: 0;">
    <div class="sf-ev-community">
      <div class="sf-ev-community-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>
      </div>
      <div class="sf-ev-community-text">
        <h3>Connect Between Meetings</h3>
        <p>Our private WhatsApp group keeps the conversation going between sessions. Share wins, ask for advice, and stay connected with founders who get it.</p>
        <a href="https://chat.whatsapp.com/HfxeP3enQtN3oGFnwVOH8D" class="sf-ev-btn sf-ev-btn-wa" target="_blank" rel="noopener">Join the WhatsApp Group</a>
        <p class="sf-ev-community-note">Zero solicitation policy. If you join and start spamming, you will be removed immediately. This is about community and connection, not selling.</p>
      </div>
    </div>
  </div>

  <!-- Internal links (SEO) -->
  <div class="sf-ev-internal">
    <a href="/">Home</a>
    <span class="sf-ev-sep">|</span>
    <a href="/our-story/">Our Story</a>
    <span class="sf-ev-sep">|</span>
    <a href="/weekly-mastermind-group/">Weekly Mastermind</a>
    <span class="sf-ev-sep">|</span>
    <a href="/phoenix-forum-registration/">Phoenix Forum</a>
    <span class="sf-ev-sep">|</span>
    <a href="/donate/">Support Our Mission</a>
    <span class="sf-ev-sep">|</span>
    <a href="/blog/">Blog</a>
  </div>

</div>

<!-- Event Schema (Weekly Sessions) -->
<script type="application/ld+json">
[
  {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    "@id": "https://www.soberfounders.org/events/#event-series",
    "name": "Sober Founders Weekly Mastermind Sessions",
    "description": "Free recurring online mastermind sessions for entrepreneurs in recovery. Held every Tuesday and Thursday at 12 PM ET.",
    "url": "https://www.soberfounders.org/events/",
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "isAccessibleForFree": true,
    "organizer": { "@type": "Organization", "name": "Sober Founders Inc.", "url": "https://www.soberfounders.org/" },
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "availability": "https://schema.org/InStock" },
    "location": { "@type": "VirtualLocation", "url": "https://www.soberfounders.org/events/" }
  },
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Sober Founders Thursday Mastermind",
    "description": "Free weekly online mastermind for sober entrepreneurs. Open to all — no application required.",
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "isAccessibleForFree": true,
    "startDate": "2026-03-19T12:00:00-04:00",
    "eventSchedule": { "@type": "Schedule", "byDay": "https://schema.org/Thursday", "repeatFrequency": "P1W", "scheduleTimezone": "America/New_York" },
    "superEvent": { "@id": "https://www.soberfounders.org/events/#event-series" },
    "organizer": { "@type": "Organization", "name": "Sober Founders Inc." },
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "location": { "@type": "VirtualLocation", "url": "https://www.soberfounders.org/events/" }
  },
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Sober Founders Tuesday Mastermind — All Our Affairs",
    "description": "Free weekly mastermind for verified sober founders with $250K+ revenue, 2+ employees, and 1+ year sober.",
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "isAccessibleForFree": true,
    "startDate": "2026-03-17T12:00:00-04:00",
    "eventSchedule": { "@type": "Schedule", "byDay": "https://schema.org/Tuesday", "repeatFrequency": "P1W", "scheduleTimezone": "America/New_York" },
    "superEvent": { "@id": "https://www.soberfounders.org/events/#event-series" },
    "organizer": { "@type": "Organization", "name": "Sober Founders Inc." },
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "location": { "@type": "VirtualLocation", "url": "https://www.soberfounders.org/events/" }
  }
]
</script>
<!-- /wp:html -->`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Events Page — Full Redesign");
  console.log(`  Target: ${SITE}/events/`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  // Find events page
  const url = `${SITE}/wp-json/wp/v2/pages?slug=events`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to find events page: ${res.status}`);
  const pages = await res.json();
  if (!pages.length) throw new Error("Could not find /events/ page.");

  const pageId = pages[0].id;
  console.log(`  Found /events/ page (ID ${pageId})`);
  console.log(`  Content length: ${PAGE_CONTENT.length} chars`);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would replace events page with redesigned version.");
    return;
  }

  const updateRes = await fetch(`${SITE}/wp-json/wp/v2/pages/${pageId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: PAGE_CONTENT }),
  });

  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new Error(`WP API ${updateRes.status} ${updateRes.statusText}: ${body}`);
  }

  const result = await updateRes.json();
  console.log(`  Page updated successfully (ID ${result.id})`);
  console.log(`  Live: ${result.link}\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
