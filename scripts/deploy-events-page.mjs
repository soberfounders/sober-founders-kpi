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
// Page content — Full events page redesign (dark cinematic theme)
// ---------------------------------------------------------------------------
const PAGE_CONTENT = `<!-- wp:html -->
<!-- SF Events Page — deployed by deploy-events-page.mjs -->
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap');

  /* Force dark background on this page */
  body.page-template-default { background: #0a0a0a !important; }
  .ast-container, .site-content { background: transparent !important; }
  .entry-content { padding: 0 !important; max-width: 100% !important; }
  #primary { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
  .ast-separate-container .ast-article-single { padding: 0 !important; margin: 0 !important; background: transparent !important; }
  .ast-separate-container #primary { padding: 0 !important; }
  header.site-header { position: relative; z-index: 100; }

  .sf-ev { font-family: 'Outfit', 'Inter', sans-serif; color: #fff; line-height: 1.7; -webkit-font-smoothing: antialiased; }
  .sf-ev * { box-sizing: border-box; }
  .sf-ev img { max-width: 100%; display: block; }
  .sf-ev a { text-decoration: none; }

  /* ── Glassmorphism utility ── */
  .sf-glass {
    background: rgba(10, 10, 10, 0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  /* ── Section wrapper ── */
  .sf-ev-section {
    max-width: 1100px;
    margin: 0 auto;
    padding: 80px 24px;
  }
  .sf-ev-section-sm { padding: 60px 24px; }
  .sf-ev-pad { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

  /* ── Heading ── */
  .sf-ev-heading { text-align: center; margin-bottom: 48px; }
  .sf-ev-heading h2 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #ffffff;
    margin: 0 0 12px;
  }
  .sf-ev-heading p {
    color: rgba(255, 255, 255, 0.6);
    font-size: 1.05rem;
    max-width: 560px;
    margin: 0 auto;
  }

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
  .sf-ev-btn-primary { background: #00b286; color: #fff !important; text-decoration: none !important; }
  .sf-ev-btn-primary:hover {
    background: #00c090;
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
    background: rgba(255,255,255,0.08);
    transform: translateY(-2px);
  }

  /* ── Three tiers — glassmorphism cards ── */
  .sf-ev-tiers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    max-width: 1100px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .sf-ev-tiers { grid-template-columns: 1fr; }
  }
  .sf-ev-tier {
    background: rgba(10, 10, 10, 0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 32px 28px;
    display: flex;
    flex-direction: column;
    transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s;
  }
  .sf-ev-tier:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .sf-ev-tier-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px; height: 38px;
    background: rgba(0,178,134,0.2);
    color: #5eecc0;
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: 10px;
    margin-bottom: 16px;
  }
  .sf-ev-tier h3 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.35rem;
    font-weight: 400;
    color: #ffffff;
    margin: 0 0 6px;
  }
  .sf-ev-tier-schedule {
    font-size: 0.85rem;
    font-weight: 600;
    color: #5eecc0;
    margin-bottom: 12px;
  }
  .sf-ev-tier p {
    font-size: 0.97rem;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.7);
    flex: 1;
    margin: 0 0 16px;
  }
  .sf-ev-tag {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 12px;
    border-radius: 20px;
    width: fit-content;
  }
  .sf-ev-tag-free { background: rgba(94,236,192,0.12); color: #5eecc0; }
  .sf-ev-tag-paid { background: rgba(241,151,44,0.15); color: #f1972c; }
  .sf-ev-tier-link {
    display: inline-block;
    margin-top: 20px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #5eecc0 !important;
    text-decoration: none !important;
    transition: color 0.2s;
  }
  .sf-ev-tier-link:hover { color: #8ff4d8 !important; }
  .sf-ev-tier-link::after { content: " \\2192"; }

  /* Featured tier (Phoenix — full width) */
  .sf-ev-tier-featured {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    padding: 0;
    background: rgba(10, 10, 10, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.1);
    position: relative;
    overflow: hidden;
  }
  .sf-ev-tier-featured::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(circle at 70% 30%, rgba(0,178,134,0.08) 0%, transparent 50%);
    pointer-events: none;
  }
  @media (max-width: 768px) {
    .sf-ev-tier-featured { grid-template-columns: 1fr; }
  }
  .sf-ev-tier-featured-img {
    width: 100%; height: 100%; min-height: 320px; object-fit: cover;
  }
  .sf-ev-tier-featured .sf-ev-tier-body {
    padding: 48px 36px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
  }
  .sf-ev-tier-featured .sf-ev-tier-num { background: rgba(0,178,134,0.2); }
  .sf-ev-tier-featured h3 { color: #ffffff; font-size: 1.6rem; }
  .sf-ev-tier-featured p { color: rgba(255,255,255,0.75); }
  .sf-ev-tier-featured .sf-ev-tag { background: rgba(241,151,44,0.15); color: #f1972c; }
  .sf-ev-tier-featured .sf-ev-tier-cta {
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
    width: fit-content;
  }
  .sf-ev-tier-featured .sf-ev-tier-cta:hover {
    background: #00c090;
    transform: translateY(-2px);
  }

  /* ── How it works ── */
  .sf-ev-how {
    background: rgba(10, 10, 10, 0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
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
  .sf-ev-step { text-align: center; }
  .sf-ev-step-num {
    width: 48px; height: 48px;
    background: rgba(0,178,134,0.15);
    border: 1px solid rgba(94,236,192,0.2);
    color: #5eecc0;
    font-weight: 700;
    font-size: 1.1rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
  }
  .sf-ev-step h4 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.08rem;
    font-weight: 400;
    color: #fff;
    margin: 0 0 8px;
  }
  .sf-ev-step p {
    font-size: 0.88rem;
    color: rgba(255,255,255,0.6);
    line-height: 1.6;
    margin: 0;
  }

  /* ── Calendar ── */
  .sf-ev-calendar {
    background: rgba(10, 10, 10, 0.5);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 24px;
    padding: 60px 24px;
    max-width: 1100px;
    margin: 0 auto;
    position: relative;
    overflow: hidden;
  }
  .sf-ev-calendar::before {
    content: "";
    position: absolute; inset: 0;
    background:
      radial-gradient(circle at 25% 50%, rgba(0,178,134,0.08) 0%, transparent 50%),
      radial-gradient(circle at 75% 50%, rgba(0,178,134,0.06) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-ev-calendar-wrap {
    max-width: 650px;
    margin: 0 auto;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 20px;
    position: relative;
  }
  .sf-ev-calendar-wrap iframe {
    width: 100%;
    border-radius: 12px;
    border: none;
  }

  /* ── WhatsApp community ── */
  .sf-ev-community {
    display: flex;
    align-items: center;
    gap: 32px;
    max-width: 900px;
    margin: 0 auto;
    background: rgba(10, 10, 10, 0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 40px 36px;
    transition: transform 0.25s, border-color 0.25s;
  }
  .sf-ev-community:hover {
    transform: translateY(-4px);
    border-color: rgba(255, 255, 255, 0.15);
  }
  @media (max-width: 768px) {
    .sf-ev-community {
      flex-direction: column;
      text-align: center;
      padding: 32px 24px;
      gap: 24px;
    }
  }
  .sf-ev-community-icon {
    width: 72px; height: 72px;
    background: rgba(37,211,102,0.15);
    border: 1px solid rgba(37,211,102,0.25);
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sf-ev-community-icon svg { width: 36px; height: 36px; fill: #25D366; }
  .sf-ev-community-text { flex: 1; }
  .sf-ev-community-text h3 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.3rem;
    font-weight: 400;
    color: #fff;
    margin: 0 0 8px;
  }
  .sf-ev-community-text p {
    font-size: 0.93rem;
    color: rgba(255,255,255,0.65);
    line-height: 1.7;
    margin: 0 0 16px;
  }
  .sf-ev-btn-wa {
    display: inline-block;
    background: #25D366;
    color: #fff !important;
    text-decoration: none !important;
    font-size: 0.88rem;
    font-weight: 600;
    padding: 12px 28px;
    border-radius: 30px;
    transition: all 0.25s;
  }
  .sf-ev-btn-wa:hover {
    background: #20bd5a;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(37,211,102,0.25);
  }
  .sf-ev-community-note {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.4);
    font-style: italic;
    margin: 12px 0 0 !important;
    padding-top: 12px;
    border-top: 1px solid rgba(255,255,255,0.06);
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
    background: rgba(255, 255, 255, 0.12);
  }
  .sf-ev-divider svg {
    width: 20px; height: 20px;
    fill: #5eecc0;
    flex-shrink: 0;
  }

  /* ── Internal links ── */
  .sf-ev-internal {
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px 24px 60px;
    font-size: 0.9rem;
    color: rgba(255,255,255,0.4);
    line-height: 2;
  }
  .sf-ev-internal a {
    color: #5eecc0 !important;
    text-decoration: none !important;
    font-weight: 500;
    transition: color 0.2s;
  }
  .sf-ev-internal a:hover { color: #8ff4d8 !important; }
  .sf-ev-sep { margin: 0 6px; color: rgba(255,255,255,0.15); }
</style>

<div class="sf-ev">

  <!-- ═══ Three Ways to Get Involved ═══ -->
  <div class="sf-ev-section">
    <div class="sf-ev-heading">
      <h2>Three Ways to Get Involved</h2>
      <p>Whether you're just getting started or leading an eight-figure company, there's a seat at the table for you.</p>
    </div>

    <div class="sf-ev-tiers">

      <!-- 01 — Thursday -->
      <div class="sf-ev-tier">
        <div class="sf-ev-tier-num">01</div>
        <h3>Thursday Open Mastermind</h3>
        <div class="sf-ev-tier-schedule">Every Thursday &bull; 11:00 AM ET</div>
        <p>Open to any sober entrepreneur. Show up, share what's real, and get honest feedback from peers who understand the intersection of business pressure and recovery. No application required&mdash;just be sober and own a business.</p>
        <span class="sf-ev-tag sf-ev-tag-free">Free &bull; Open to All</span>
        <a href="#sf-calendar" class="sf-ev-tier-link">View Upcoming Events</a>
      </div>

      <!-- 02 — Tuesday -->
      <div class="sf-ev-tier">
        <div class="sf-ev-tier-num">02</div>
        <h3>Tuesday &ldquo;All Our Affairs&rdquo;</h3>
        <div class="sf-ev-tier-schedule">Every Tuesday &bull; 12:00 PM ET</div>
        <p>For verified sober founders with $250K+ revenue, 2+ employees, and 1+ year sober working the 12 steps. Deeper conversations, higher trust, real accountability.</p>
        <span class="sf-ev-tag sf-ev-tag-free">Free &bull; Verified Members</span>
        <a href="/apply/" class="sf-ev-tier-link">Apply to Join</a>
      </div>

      <!-- 03 — Phoenix Forum (featured) -->
      <div class="sf-ev-tier sf-ev-tier-featured">
        <img class="sf-ev-tier-featured-img" src="https://soberfounders.org/wp-content/uploads/2025/01/pexels-rdne-5756743-1024x683.jpg" alt="Intimate peer advisory group discussion" />
        <div class="sf-ev-tier-body">
          <div class="sf-ev-tier-num">03</div>
          <h3>Phoenix Forum</h3>
          <div class="sf-ev-tier-schedule">Monthly &bull; Curated Schedule</div>
          <p>An exclusive peer advisory board for sober entrepreneurs generating $1M+ in revenue with multiple years of sobriety. Intimate groups of up to 10 members for curated, high-trust discussions around growth, sobriety, and life.</p>
          <span class="sf-ev-tag sf-ev-tag-paid">Curated &bull; Application Only</span>
          <a href="/phoenix-forum-2nd-group/" class="sf-ev-tier-cta">Learn More</a>
        </div>
      </div>

    </div>
  </div>

  <!-- ═══ How It Works ═══ -->
  <div class="sf-ev-section-sm sf-ev-pad" style="padding-bottom: 80px;">
    <div class="sf-ev-how">
      <div class="sf-ev-heading" style="margin-bottom: 40px;">
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
  <div class="sf-ev-pad" style="padding-bottom: 80px;" id="sf-calendar">
    <div class="sf-ev-calendar">
      <div class="sf-ev-heading" style="margin-bottom: 36px; position: relative;">
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
        <a href="https://chat.whatsapp.com/HfxeP3enQtN3oGFnwVOH8D" class="sf-ev-btn-wa" target="_blank" rel="noopener">Join the WhatsApp Group</a>
        <p class="sf-ev-community-note">Zero solicitation policy. If you join and start spamming, you will be removed immediately.</p>
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
