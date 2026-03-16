#!/usr/bin/env node
/**
 * deploy-thursday-page.mjs — Combine /thursday + /weekly-mastermind-group into one page
 *
 * What this does:
 *   1. Replaces /thursday page content with redesigned combined content
 *   2. Sets /weekly-mastermind-group to redirect status (draft) and adds 301 meta redirect
 *   3. Creates a Yoast/Redirection-style 301 from /weekly-mastermind-group/ → /thursday/
 *
 * Usage:
 *   node scripts/deploy-thursday-page.mjs [--dry-run]
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
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

async function findPageBySlug(slug) {
  const pages = await wpFetch(`/pages?slug=${slug}&status=publish,draft,private`);
  return pages[0] || null;
}

// ---------------------------------------------------------------------------
// Combined page content
// ---------------------------------------------------------------------------
const PAGE_CONTENT = `<!-- wp:html -->
<!-- SF Thursday Page — Combined mastermind landing — deployed by deploy-thursday-page.mjs -->
<style>
  .sf-thu-page { font-family: inherit; color: #2e3443; }
  .sf-thu-page * { box-sizing: border-box; }

  /* ── Hero ── */
  .sf-thu-hero {
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    padding: 80px 24px 70px;
    text-align: center;
    border-radius: 16px;
    margin-bottom: 48px;
    position: relative;
    overflow: hidden;
  }
  .sf-thu-hero::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(circle at 30% 20%, rgba(0,178,134,0.15) 0%, transparent 50%),
                radial-gradient(circle at 70% 80%, rgba(0,178,134,0.1) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-thu-hero .sf-thu-eyebrow {
    display: inline-block;
    font-family: Inter, Arial, sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #00b286;
    margin: 0 0 16px;
    position: relative;
  }
  .sf-thu-hero h1 {
    font-family: "DM Serif Display", Georgia, serif;
    font-size: clamp(2.2rem, 5vw, 3.2rem);
    font-weight: 400;
    color: #ffffff;
    margin: 0 0 18px;
    position: relative;
    line-height: 1.1;
  }
  .sf-thu-hero h1 .sf-accent { color: #00b286; }
  .sf-thu-hero .sf-thu-hero-desc {
    font-size: 1.15rem;
    color: rgba(255,255,255,0.78);
    max-width: 640px;
    margin: 0 auto 32px;
    line-height: 1.7;
    position: relative;
  }
  .sf-thu-hero-badges {
    display: flex;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
    position: relative;
  }
  .sf-thu-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 999px;
    padding: 8px 18px;
    font-size: 0.85rem;
    color: rgba(255,255,255,0.85);
    font-family: Inter, Arial, sans-serif;
    font-weight: 500;
  }
  .sf-thu-badge svg { width: 16px; height: 16px; fill: #00b286; flex-shrink: 0; }

  /* ── Meeting card ── */
  .sf-thu-meeting {
    max-width: 900px;
    margin: 0 auto 56px;
    background: linear-gradient(180deg, #ffffff 0%, #fcfefe 100%);
    border: 1px solid rgba(0, 142, 101, 0.10);
    border-radius: 24px;
    padding: 42px;
    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.06);
  }
  .sf-thu-meeting-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }
  .sf-thu-meeting-icon {
    width: 52px; height: 52px;
    background: linear-gradient(135deg, #00b286, #00c090);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sf-thu-meeting-icon svg { width: 26px; height: 26px; fill: #fff; }
  .sf-thu-meeting h2 {
    font-family: "DM Serif Display", Georgia, serif;
    font-size: 1.6rem;
    font-weight: 400;
    color: #101828;
    margin: 0;
  }
  .sf-thu-meeting-desc {
    font-size: 1.05rem;
    line-height: 1.75;
    color: #475467;
    margin: 0 0 28px;
    max-width: 720px;
  }
  .sf-thu-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin: 0 0 28px;
    padding: 22px 24px;
    background: rgba(248, 251, 250, 0.95);
    border: 1px solid rgba(0, 142, 101, 0.09);
    border-radius: 16px;
  }
  .sf-thu-meta-item {
    color: #0f172a;
    font-family: Inter, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
  }
  .sf-thu-meta-item strong { color: #008e65; }
  .sf-thu-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
    margin-bottom: 0;
    flex-wrap: wrap;
  }
  .sf-thu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 52px;
    padding: 0 28px;
    border-radius: 999px;
    text-decoration: none !important;
    font-family: Inter, Arial, sans-serif;
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }
  .sf-thu-btn svg { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }
  .sf-thu-btn-primary {
    background: #008e65;
    color: #ffffff !important;
    border: 1px solid #008e65;
    box-shadow: 0 10px 24px rgba(0, 142, 101, 0.18);
  }
  .sf-thu-btn-primary:hover {
    background: #007a58;
    border-color: #007a58;
    color: #ffffff !important;
    transform: translateY(-1px);
  }
  .sf-thu-btn-secondary {
    background: #ffffff;
    color: #008e65 !important;
    border: 1px solid rgba(0, 142, 101, 0.18);
  }
  .sf-thu-btn-secondary:hover {
    background: #f8fbfa;
    color: #007a58 !important;
    border-color: rgba(0, 142, 101, 0.32);
    transform: translateY(-1px);
  }
  .sf-thu-btn-whatsapp {
    background: #25D366;
    color: #ffffff !important;
    border: 1px solid #25D366;
  }
  .sf-thu-btn-whatsapp:hover {
    background: #20bd5a;
    color: #ffffff !important;
    transform: translateY(-1px);
  }
  .sf-thu-btn-donate {
    background: transparent;
    color: #667085 !important;
    border: 1px solid #e5e7eb;
  }
  .sf-thu-btn-donate:hover {
    background: #f9fafb;
    color: #475467 !important;
    border-color: #d1d5db;
    transform: translateY(-1px);
  }

  /* ── Calendar section ── */
  .sf-thu-calendar {
    max-width: 900px;
    margin: 0 auto 56px;
    padding: 28px;
    background: linear-gradient(180deg, #fcfefe 0%, #f7fbfa 100%);
    border: 1px solid rgba(0, 142, 101, 0.08);
    border-radius: 20px;
  }
  .sf-thu-calendar h3 {
    font-family: "DM Serif Display", Georgia, serif;
    font-size: 1.3rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 6px;
  }
  .sf-thu-calendar-sub {
    color: #64748b;
    font-size: 0.9rem;
    margin: 0 0 20px;
    line-height: 1.6;
  }
  .sf-thu-cal-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .sf-thu-cal-option {
    padding: 18px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(15, 23, 42, 0.06);
    border-radius: 18px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
  }
  .sf-thu-cal-top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }
  .sf-thu-cal-icon {
    width: 42px; height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 42px;
    background: #ffffff;
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
  }
  .sf-thu-cal-icon svg { width: 24px; height: 24px; display: block; }
  .sf-thu-cal-label {
    margin: 0;
    color: #0f172a;
    font-family: Inter, Arial, sans-serif;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.35;
  }
  .sf-thu-cal-note {
    margin: 10px 0 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.5;
  }
  .sf-thu-cal-option add-to-calendar-button { width: 100%; }
  .sf-thu-cal-option [atcb-button] { width: 100% !important; }
  .sf-thu-cal-option [atcb-button] button,
  .sf-thu-cal-option button.atcb-button { width: 100% !important; border-radius: 999px !important; }

  /* ── Divider ── */
  .sf-thu-divider {
    max-width: 900px;
    margin: 0 auto 56px;
    border: none;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0,178,134,0.2), transparent);
  }

  /* ── What to Expect section ── */
  .sf-thu-expect {
    max-width: 900px;
    margin: 0 auto 56px;
    padding: 0 24px;
  }
  .sf-thu-section-label {
    display: inline-block;
    font-family: Inter, Arial, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #00b286;
    margin: 0 0 12px;
  }
  .sf-thu-expect h2 {
    font-family: "DM Serif Display", Georgia, serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 12px;
  }
  .sf-thu-expect-sub {
    color: #667085;
    font-size: 1.05rem;
    max-width: 600px;
    line-height: 1.6;
    margin: 0 0 40px;
  }
  .sf-thu-steps {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .sf-thu-step {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    padding: 28px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .sf-thu-step:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(0,0,0,0.06);
  }
  .sf-thu-step-num {
    flex-shrink: 0;
    width: 48px; height: 48px;
    background: linear-gradient(135deg, #00b286, #00c090);
    color: #fff;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Inter, Arial, sans-serif;
    font-weight: 800;
    font-size: 1.1rem;
  }
  .sf-thu-step h3 {
    font-family: "DM Serif Display", Georgia, serif;
    font-size: 1.2rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 6px;
  }
  .sf-thu-step p {
    font-size: 0.95rem;
    line-height: 1.7;
    color: #475467;
    margin: 0;
  }

  /* ── Benefits section ── */
  .sf-thu-benefits {
    background: #f6f7f9;
    border-radius: 20px;
    padding: 70px 24px;
    margin: 0 auto 56px;
    max-width: 960px;
  }
  .sf-thu-benefits h2 {
    font-family: "DM Serif Display", Georgia, serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #101828;
    text-align: center;
    margin: 0 0 12px;
  }
  .sf-thu-benefits-sub {
    text-align: center;
    color: #667085;
    font-size: 1.05rem;
    margin: 0 auto 48px;
    max-width: 560px;
    line-height: 1.6;
  }
  .sf-thu-benefits-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    max-width: 840px;
    margin: 0 auto;
  }
  .sf-thu-benefit {
    padding: 28px 24px;
    background: #ffffff;
    border-radius: 14px;
    border: 1px solid #e5e7eb;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .sf-thu-benefit:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(0,0,0,0.05);
  }
  .sf-thu-benefit-icon {
    width: 48px; height: 48px;
    background: linear-gradient(135deg, #00b286, #00c090);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }
  .sf-thu-benefit-icon svg { width: 22px; height: 22px; fill: #fff; }
  .sf-thu-benefit h3 {
    font-family: "DM Serif Display", Georgia, serif;
    font-size: 1.1rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 8px;
  }
  .sf-thu-benefit p {
    font-size: 0.93rem;
    line-height: 1.65;
    color: #667085;
    margin: 0;
  }
  .sf-thu-benefit ul {
    margin: 8px 0 0;
    padding: 0 0 0 18px;
    font-size: 0.9rem;
    line-height: 1.8;
    color: #475467;
  }

  /* ── Luma calendar embed ── */
  .sf-thu-luma {
    max-width: 900px;
    margin: 0 auto 56px;
    text-align: center;
  }
  .sf-thu-luma h2 {
    font-family: "DM Serif Display", Georgia, serif;
    font-size: clamp(1.4rem, 3vw, 1.8rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 8px;
  }
  .sf-thu-luma-sub {
    color: #667085;
    font-size: 0.95rem;
    margin: 0 0 24px;
    line-height: 1.6;
  }
  .sf-thu-luma iframe {
    max-width: 100%;
    border: 1px solid rgba(0,142,101,0.12);
    border-radius: 12px;
  }

  /* ── Testimonial ── */
  .sf-thu-testimonial {
    max-width: 700px;
    margin: 0 auto 56px;
    padding: 36px 40px;
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    border-radius: 20px;
    position: relative;
    overflow: hidden;
  }
  .sf-thu-testimonial::before {
    content: "\\201C";
    position: absolute;
    top: 16px; left: 28px;
    font-size: 6rem;
    font-family: Georgia, serif;
    color: rgba(0,178,134,0.15);
    line-height: 1;
    pointer-events: none;
  }
  .sf-thu-testimonial blockquote {
    margin: 0 0 20px;
    font-size: 1.1rem;
    line-height: 1.75;
    color: rgba(255,255,255,0.88);
    font-style: italic;
    position: relative;
  }
  .sf-thu-testimonial cite {
    display: block;
    font-style: normal;
    font-size: 0.95rem;
    color: #00b286;
    font-weight: 600;
    position: relative;
  }
  .sf-thu-testimonial cite span {
    display: block;
    font-weight: 400;
    font-size: 0.85rem;
    color: rgba(255,255,255,0.55);
    margin-top: 2px;
  }

  /* ── CTA bottom ── */
  .sf-thu-cta {
    text-align: center;
    padding: 60px 24px;
    background: linear-gradient(135deg, rgba(0,178,134,0.06), rgba(0,178,134,0.02));
    border-radius: 20px;
    margin: 0 auto 40px;
    max-width: 900px;
  }
  .sf-thu-cta h2 {
    font-family: "DM Serif Display", Georgia, serif;
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 14px;
  }
  .sf-thu-cta p {
    color: #667085;
    font-size: 1.05rem;
    max-width: 520px;
    margin: 0 auto 28px;
    line-height: 1.65;
  }
  .sf-thu-cta-btn {
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
  .sf-thu-cta-btn:hover {
    background: #00c090;
    transform: translateY(-2px);
  }

  /* ── Responsive ── */
  @media (max-width: 767px) {
    .sf-thu-hero { padding: 56px 20px 48px; }
    .sf-thu-meeting { padding: 26px; border-radius: 18px; }
    .sf-thu-actions { flex-direction: column; }
    .sf-thu-btn { width: 100%; }
    .sf-thu-cal-grid { grid-template-columns: 1fr; }
    .sf-thu-step { flex-direction: column; gap: 14px; padding: 22px; }
    .sf-thu-benefits-grid { grid-template-columns: 1fr; }
    .sf-thu-testimonial { padding: 28px 24px; }
  }
</style>

<script src="https://cdn.jsdelivr.net/npm/add-to-calendar-button@2" async defer></script>

<div class="sf-thu-page">

  <!-- ═══════════════════════ HERO ═══════════════════════ -->
  <div class="sf-thu-hero">
    <p class="sf-thu-eyebrow">Every Thursday &middot; 11 AM Eastern</p>
    <h1>The Mastermind for <span class="sf-accent">Sober Founders</span></h1>
    <p class="sf-thu-hero-desc">
      A free weekly mastermind where entrepreneurs in recovery share real challenges, real wins, and real accountability. No pitches. No minimums. Just founders who get it.
    </p>
    <div class="sf-thu-hero-badges">
      <span class="sf-thu-badge">
        <svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.5 5.5a.75.75 0 0 0-1.06-1.06L7 7.88 5.56 6.44a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l4-4z"/></svg>
        100% Free
      </span>
      <span class="sf-thu-badge">
        <svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.5 5.5a.75.75 0 0 0-1.06-1.06L7 7.88 5.56 6.44a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l4-4z"/></svg>
        Open to All Sober Entrepreneurs
      </span>
      <span class="sf-thu-badge">
        <svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.5 5.5a.75.75 0 0 0-1.06-1.06L7 7.88 5.56 6.44a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l4-4z"/></svg>
        No Revenue Minimum
      </span>
    </div>
  </div>

  <!-- ═══════════════════════ MEETING DETAILS ═══════════════════════ -->
  <div class="sf-thu-meeting">
    <div class="sf-thu-meeting-header">
      <div class="sf-thu-meeting-icon">
        <svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
      </div>
      <h2>Join This Thursday's Session</h2>
    </div>

    <p class="sf-thu-meeting-desc">
      Every week, sober founders from across the country come together on Zoom for an hour of support, shared experience, and real conversations about running a business in recovery.
    </p>

    <div class="sf-thu-meta">
      <div class="sf-thu-meta-item"><strong>When:</strong> Every Thursday, 11:00 AM&ndash;12:00 PM ET / 8:00&ndash;9:00 AM PT</div>
      <div class="sf-thu-meta-item"><strong>Where:</strong> Zoom (Meeting ID: 842 4221 2480)</div>
      <div class="sf-thu-meta-item"><strong>Passcode:</strong> 932389</div>
      <div class="sf-thu-meta-item"><strong>Cost:</strong> Free &mdash; always</div>
    </div>

    <div class="sf-thu-actions">
      <a class="sf-thu-btn sf-thu-btn-primary"
         href="https://us02web.zoom.us/j/84242212480?pwd=e8eQwD55guBhjGNwcfLRAix14AGjnF.1"
         target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
        Join on Zoom Now
      </a>
      <a class="sf-thu-btn sf-thu-btn-whatsapp"
         href="https://chat.whatsapp.com/HfxeP3enQtN3oGFnwVOH8D"
         target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
        Join WhatsApp Group
      </a>
      <a class="sf-thu-btn sf-thu-btn-donate"
         href="https://soberfounders.org/donate"
         target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        Donate to Support Us
      </a>
    </div>
  </div>

  <!-- ═══════════════════════ CALENDAR ADD ═══════════════════════ -->
  <div class="sf-thu-calendar">
    <h3>Add to Your Calendar</h3>
    <p class="sf-thu-calendar-sub">Pick the calendar you use most. Each option is set up for the recurring Thursday meeting.</p>

    <div class="sf-thu-cal-grid">
      <div class="sf-thu-cal-option">
        <div class="sf-thu-cal-top">
          <div class="sf-thu-cal-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48"><path fill="#4285F4" d="M34.91 24.04c0-.79-.07-1.55-.2-2.29H24v4.33h6.13a5.24 5.24 0 0 1-2.27 3.44v2.85h3.68c2.15-1.98 3.37-4.91 3.37-8.33z"/><path fill="#34A853" d="M24 35c3.06 0 5.62-1.01 7.49-2.73l-3.68-2.85c-1.02.68-2.32 1.08-3.81 1.08-2.93 0-5.42-1.98-6.31-4.64h-3.81v2.92A11.31 11.31 0 0 0 24 35z"/><path fill="#FBBC05" d="M17.69 25.86a6.8 6.8 0 0 1 0-3.72v-2.92h-3.81a11.3 11.3 0 0 0 0 9.56l3.81-2.92z"/><path fill="#EA4335" d="M24 17.5c1.66 0 3.14.57 4.31 1.69l3.23-3.23C29.61 14.14 27.05 13 24 13a11.31 11.31 0 0 0-10.12 6.22l3.81 2.92c.89-2.66 3.38-4.64 6.31-4.64z"/></svg>
          </div>
          <p class="sf-thu-cal-label">Google Calendar</p>
        </div>
        <add-to-calendar-button
          name="Sober Founders Mastermind"
          description="Weekly Sober Founders mastermind. Meeting ID: 842 4221 2480 Passcode: 932389"
          location="https://us02web.zoom.us/j/84242212480?pwd=e8eQwD55guBhjGNwcfLRAix14AGjnF.1"
          startDate="2026-03-20"
          startTime="11:00"
          endTime="12:00"
          timeZone="America/New_York"
          recurrence="weekly"
          recurrence_interval="1"
          recurrence_byDay="TH"
          options="'Google'"
          label="Add to Google Calendar"
          buttonStyle="round"
          hideBranding
          inline
          lightMode="bodyScheme">
        </add-to-calendar-button>
      </div>

      <div class="sf-thu-cal-option">
        <div class="sf-thu-cal-top">
          <div class="sf-thu-cal-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48"><path fill="#0A64AC" d="M8 10h18v28H8z"/><path fill="#1976D2" d="M26 12h14v24H26z"/><path fill="#2B88D8" d="M18 18h22v18H18z"/><path fill="#fff" d="M14.2 31l-2.7-4.2h2.2l1.4 2.5 1.4-2.5h2.1L16 31l2.8 4.2h-2.2l-1.5-2.5-1.5 2.5h-2.1z"/></svg>
          </div>
          <p class="sf-thu-cal-label">Outlook / Microsoft 365</p>
        </div>
        <add-to-calendar-button
          name="Sober Founders Mastermind"
          description="Weekly Sober Founders mastermind. Meeting ID: 842 4221 2480 Passcode: 932389"
          location="https://us02web.zoom.us/j/84242212480?pwd=e8eQwD55guBhjGNwcfLRAix14AGjnF.1"
          startDate="2026-03-20"
          startTime="11:00"
          endTime="12:00"
          timeZone="America/New_York"
          recurrence="weekly"
          recurrence_interval="1"
          recurrence_byDay="TH"
          options="'Microsoft365','Outlook.com'"
          label="Add to Outlook"
          buttonStyle="round"
          hideBranding
          inline
          lightMode="bodyScheme">
        </add-to-calendar-button>
        <p class="sf-thu-cal-note">If Outlook does not open the recurring event correctly, use the ICS download.</p>
      </div>

      <div class="sf-thu-cal-option">
        <div class="sf-thu-cal-top">
          <div class="sf-thu-cal-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48"><rect x="10" y="8" width="28" height="32" rx="8" fill="#F5F5F7"/><rect x="10" y="8" width="28" height="9" rx="8" fill="#FF6159"/><rect x="14" y="22" width="20" height="2.2" rx="1.1" fill="#C7CAD1"/><rect x="14" y="27" width="14" height="2.2" rx="1.1" fill="#D7DAE0"/><circle cx="18" cy="12.5" r="1.2" fill="#fff"/><circle cx="24" cy="12.5" r="1.2" fill="#fff"/><circle cx="30" cy="12.5" r="1.2" fill="#fff"/></svg>
          </div>
          <p class="sf-thu-cal-label">Apple Calendar / iCal</p>
        </div>
        <add-to-calendar-button
          name="Sober Founders Mastermind"
          description="Weekly Sober Founders mastermind. Meeting ID: 842 4221 2480 Passcode: 932389"
          location="https://us02web.zoom.us/j/84242212480?pwd=e8eQwD55guBhjGNwcfLRAix14AGjnF.1"
          startDate="2026-03-20"
          startTime="11:00"
          endTime="12:00"
          timeZone="America/New_York"
          recurrence="weekly"
          recurrence_interval="1"
          recurrence_byDay="TH"
          options="'Apple','iCal'"
          label="Add to Apple Calendar"
          buttonStyle="round"
          hideBranding
          inline
          lightMode="bodyScheme">
        </add-to-calendar-button>
      </div>

      <div class="sf-thu-cal-option">
        <div class="sf-thu-cal-top">
          <div class="sf-thu-cal-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48"><rect x="9" y="11" width="30" height="27" rx="6" fill="#ffffff" stroke="#D6DCE5" stroke-width="2"/><rect x="9" y="11" width="30" height="8" rx="6" fill="#008e65"/><rect x="15" y="7" width="2.5" height="8" rx="1.25" fill="#008e65"/><rect x="30.5" y="7" width="2.5" height="8" rx="1.25" fill="#008e65"/><rect x="15" y="24" width="18" height="2.2" rx="1.1" fill="#C4CCD6"/><rect x="15" y="29" width="12" height="2.2" rx="1.1" fill="#D9E0E7"/></svg>
          </div>
          <p class="sf-thu-cal-label">ICS File (Any Calendar)</p>
        </div>
        <a class="sf-thu-btn sf-thu-btn-secondary" style="width:100%; min-height:46px;"
           href="https://soberfounders.org/wp-content/uploads/2026/03/mastermind-thursday.ics"
           target="_blank" rel="noopener">
          Download Recurring ICS
        </a>
        <p class="sf-thu-cal-note">Best fallback for Outlook desktop and other calendar apps.</p>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════ DIVIDER ═══════════════════════ -->
  <hr class="sf-thu-divider" />

  <!-- ═══════════════════════ WHAT TO EXPECT ═══════════════════════ -->
  <div class="sf-thu-expect">
    <p class="sf-thu-section-label">What to Expect</p>
    <h2>Your First Hour With Us</h2>
    <p class="sf-thu-expect-sub">
      No prep required. No awkward icebreakers. Here's exactly what happens when you show up.
    </p>

    <div class="sf-thu-steps">
      <div class="sf-thu-step">
        <div class="sf-thu-step-num">1</div>
        <div>
          <h3>Introductions &amp; Wins</h3>
          <p>Quick round-robin: your name, your business, and something you're proud of this week. We start with wins because that's how momentum works.</p>
        </div>
      </div>

      <div class="sf-thu-step">
        <div class="sf-thu-step-num">2</div>
        <div>
          <h3>Set the Agenda</h3>
          <p>Members surface real challenges &mdash; a pricing decision, a difficult partner, a hiring call, a cash-flow crunch. We vote on topics from Luma registration or bring one live. No topic is off limits.</p>
        </div>
      </div>

      <div class="sf-thu-step">
        <div class="sf-thu-step-num">3</div>
        <div>
          <h3>Top-of-Mind Deep Dive</h3>
          <p>This is where the magic happens. The group works through your toughest issue together &mdash; experience, strength, and hope as it relates to both recovery and business. The majority of the meeting is spent here because this is what moves the needle.</p>
        </div>
      </div>

      <div class="sf-thu-step">
        <div class="sf-thu-step-num">4</div>
        <div>
          <h3>Commitments &amp; Close</h3>
          <p>Everyone leaves with one concrete commitment for the week. Short, specific, and said out loud &mdash; because accountability is the whole point.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════ BENEFITS ═══════════════════════ -->
  <div class="sf-thu-benefits">
    <h2>Why Founders Keep Coming Back</h2>
    <p class="sf-thu-benefits-sub">This isn't a networking event. It's a room full of people who understand what it takes to build a business while staying sober.</p>

    <div class="sf-thu-benefits-grid">
      <div class="sf-thu-benefit">
        <div class="sf-thu-benefit-icon">
          <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
        </div>
        <h3>Peer Support That Gets It</h3>
        <p>Connect with founders who understand how recovery shapes business decisions. No explaining yourself &mdash; everyone here has walked a similar path.</p>
      </div>

      <div class="sf-thu-benefit">
        <div class="sf-thu-benefit-icon">
          <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>
        </div>
        <h3>Business Growth &amp; Strategy</h3>
        <ul>
          <li>Brainstorm solutions with experienced entrepreneurs</li>
          <li>Get honest feedback on offers, messaging, and marketing</li>
          <li>Discover tools, tactics, and resources for scaling</li>
        </ul>
      </div>

      <div class="sf-thu-benefit">
        <div class="sf-thu-benefit-icon">
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
        <h3>Weekly Accountability</h3>
        <ul>
          <li>Set and report on short- and long-term goals</li>
          <li>Stay focused with consistent weekly check-ins</li>
          <li>Follow through on commitments &mdash; not lip service</li>
        </ul>
      </div>

      <div class="sf-thu-benefit">
        <div class="sf-thu-benefit-icon">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        </div>
        <h3>Sobriety-First Culture</h3>
        <p>Keep sobriety front and center while you grow. Discuss mindset, discipline, and balance with people who genuinely understand both worlds &mdash; the boardroom and the meeting room.</p>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════ LUMA CALENDAR ═══════════════════════ -->
  <div class="sf-thu-luma" id="thursday-signup">
    <h2>Upcoming Sessions</h2>
    <p class="sf-thu-luma-sub">Register for a session on Luma to get reminders and submit your topic in advance.</p>
    <iframe
      src="https://lu.ma/embed/calendar/cal-rU4i5G8WMp8lWrH/events"
      width="680"
      height="900"
      frameborder="0"
      style="border: 1px solid rgba(0,142,101,0.12); border-radius: 12px;"
      allowfullscreen=""
      aria-hidden="false"
      tabindex="0"
      loading="lazy">
    </iframe>
  </div>

  <!-- ═══════════════════════ TESTIMONIAL ═══════════════════════ -->
  <div class="sf-thu-testimonial">
    <blockquote>
      The Sober Founders mastermind has been instrumental in helping me get clarity on my business and what steps to take next. Having a group of trusted advisors who understand both recovery and entrepreneurship &mdash; it's something I never knew I needed. Grateful this exists.
    </blockquote>
    <cite>
      Ryan R.
      <span>RPR Pools, LLC</span>
    </cite>
  </div>

  <!-- ═══════════════════════ BOTTOM CTA ═══════════════════════ -->
  <div class="sf-thu-cta">
    <h2>Your Next Breakthrough Starts Thursday</h2>
    <p>Show up once. That's all we ask. If it's not for you, no hard feelings. But most founders who try one session keep coming back.</p>
    <a href="https://us02web.zoom.us/j/84242212480?pwd=e8eQwD55guBhjGNwcfLRAix14AGjnF.1"
       class="sf-thu-cta-btn" target="_blank" rel="noopener">
      Join This Thursday
    </a>
  </div>

</div>
<!-- /wp:html -->`;

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------
const SEO_TITLE = "Thursday Mastermind | Free Weekly Group for Sober Entrepreneurs";
const SEO_DESCRIPTION = "Join the Sober Founders Thursday mastermind — a free weekly Zoom call for entrepreneurs in recovery. Grow your business with peers who get it.";

// ---------------------------------------------------------------------------
// Redirect content for old /weekly-mastermind-group/ page
// ---------------------------------------------------------------------------
const REDIRECT_CONTENT = `<!-- wp:html -->
<meta http-equiv="refresh" content="0;url=https://soberfounders.org/thursday/" />
<p>This page has moved. <a href="https://soberfounders.org/thursday/">Click here</a> if you are not redirected.</p>
<!-- /wp:html -->`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Thursday Page — Combined Mastermind Landing");
  console.log(`  Target: ${SITE}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  // ── Step 1: Find pages ──
  const thursdayPage = await findPageBySlug("thursday");
  const mastermindPage = await findPageBySlug("weekly-mastermind-group");

  if (!thursdayPage) {
    throw new Error("Could not find /thursday/ page.");
  }
  console.log(`  Found /thursday/ page (ID ${thursdayPage.id})`);

  if (mastermindPage) {
    console.log(`  Found /weekly-mastermind-group/ page (ID ${mastermindPage.id})`);
  } else {
    console.log("  Warning: /weekly-mastermind-group/ page not found — skipping redirect.");
  }

  if (DRY_RUN) {
    console.log("\n  [DRY RUN] Would update /thursday/ with combined content.");
    console.log(`  Content length: ${PAGE_CONTENT.length} chars`);
    if (mastermindPage) {
      console.log("  [DRY RUN] Would replace /weekly-mastermind-group/ with redirect content.");
    }
    return;
  }

  // ── Step 2: Update /thursday/ page ──
  console.log("\n  Deploying combined content to /thursday/...");
  const thursdayResult = await wpFetch(`/pages/${thursdayPage.id}`, {
    method: "POST",
    body: JSON.stringify({ content: PAGE_CONTENT }),
  });
  console.log(`  ✓ /thursday/ updated (ID ${thursdayResult.id})`);

  // ── Step 3: Update SEO via sober-seo-rest plugin ──
  try {
    const seoUrl = `${SITE}/wp-json/sober/v1/seo`;
    const seoRes = await fetch(seoUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        post_id: thursdayPage.id,
        title: SEO_TITLE,
        description: SEO_DESCRIPTION,
      }),
    });
    if (seoRes.ok) {
      console.log("  ✓ SEO meta updated via sober-seo-rest plugin");
    } else {
      console.log(`  ⚠ SEO plugin returned ${seoRes.status} — update Yoast meta manually`);
    }
  } catch {
    console.log("  ⚠ SEO plugin not available — update Yoast meta manually");
  }

  // ── Step 4: Redirect /weekly-mastermind-group/ ──
  if (mastermindPage) {
    console.log("\n  Setting /weekly-mastermind-group/ redirect...");
    await wpFetch(`/pages/${mastermindPage.id}`, {
      method: "POST",
      body: JSON.stringify({
        content: REDIRECT_CONTENT,
        status: "publish",
      }),
    });
    console.log(`  ✓ /weekly-mastermind-group/ now redirects to /thursday/`);
    console.log("  ⚠ IMPORTANT: Also add a server-level 301 redirect:");
    console.log("     /weekly-mastermind-group/ → /thursday/");
    console.log("     Use Yoast Premium Redirects, Redirection plugin, or .htaccess");
  }

  console.log(`\n  ✓ Done! Check live:`);
  console.log(`    ${SITE}/thursday/`);
  console.log(`    ${SITE}/weekly-mastermind-group/ (should redirect)\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
