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
<!-- SF Events Page — CSS (do not edit in Elementor, edit via deploy script) -->
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap');

  /* ── Full-bleed dark canvas (elementor_canvas template) ── */
  html, body {
    background: #0a0a0a !important;
    margin: 0; padding: 0;
    overflow-x: hidden;
  }
  /* Kill Astra theme's native smooth scroll — it fights with Lenis */
  html { scroll-behavior: auto !important; }
  #ast-scroll-top { display: none !important; }

  /* ── Canvas scroll animation background ── */
  #sf-scroll-canvas {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    z-index: 0;
  }
  #sf-scroll-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background-color: rgba(10,10,10,0.15);
    z-index: 1;
    pointer-events: none;
    transition: background-color 0.1s;
  }
  .sf-ev-mobile-bg {
    display: none;
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    object-fit: cover; z-index: 0;
  }
  @media (max-width: 767px) {
    #sf-scroll-canvas { display: none; }
    .sf-ev-mobile-bg { display: block; }
  }

  .sf-ev { font-family: 'Outfit', 'Inter', sans-serif; color: #fff; line-height: 1.7; -webkit-font-smoothing: antialiased; position: relative; z-index: 2; background: rgba(10,10,10,0.35); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
  @media (max-width: 767px) {
    .sf-ev {
      background: rgba(10,10,10,0.65);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
  }
  .sf-ev * { box-sizing: border-box; }
  .sf-ev img { max-width: 100%; display: block; }
  .sf-ev a { text-decoration: none; }

  /* ── Hero intro ── */
  .sf-ev-hero {
    max-width: 780px;
    margin: 0 auto;
    padding: 100px 24px 40px;
    text-align: center;
  }
  .sf-ev-hero h1 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(2rem, 4.5vw, 2.8rem);
    font-weight: 400;
    color: #ffffff;
    line-height: 1.25;
    margin: 0 0 20px;
  }
  .sf-ev-hero h1 .sf-accent { color: #5eecc0; }
  .sf-ev-hero-sub {
    font-size: 1.1rem;
    color: rgba(255,255,255,0.7);
    line-height: 1.8;
    max-width: 620px;
    margin: 0 auto 32px;
  }
  .sf-ev-hero-cta {
    display: flex;
    gap: 14px;
    justify-content: center;
    flex-wrap: wrap;
  }

  /* ── Founder quote ── */
  .sf-ev-quote {
    display: flex;
    gap: 24px;
    align-items: flex-start;
    max-width: 700px;
    margin: 0 auto;
    padding: 32px 28px;
    background: rgba(10,10,10,0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.08);
    border-left: 3px solid #5eecc0;
    border-radius: 16px;
  }
  .sf-ev-quote img {
    width: 72px; height: 72px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .sf-ev-quote blockquote {
    margin: 0;
    font-size: 1.02rem;
    color: rgba(255,255,255,0.8);
    line-height: 1.75;
    font-style: italic;
  }
  .sf-ev-quote cite {
    display: block;
    font-style: normal;
    font-weight: 600;
    color: #5eecc0;
    font-size: 0.88rem;
    margin-top: 10px;
  }
  @media (max-width: 600px) {
    .sf-ev-quote { flex-direction: column; align-items: center; text-align: center; }
  }

  /* ── Testimonial + rating ── */
  .sf-ev-testimonials {
    max-width: 800px;
    margin: 0 auto;
  }
  .sf-ev-rating {
    text-align: center;
    margin-bottom: 36px;
  }
  .sf-ev-rating-stars {
    font-size: 1.6rem;
    color: #fbbf24;
    letter-spacing: 4px;
    margin-bottom: 6px;
  }
  .sf-ev-rating-text {
    font-size: 0.95rem;
    color: rgba(255,255,255,0.6);
  }
  .sf-ev-rating-num {
    font-weight: 700;
    color: #fbbf24;
  }
  .sf-ev-testimonial {
    background: rgba(10,10,10,0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 28px 28px 24px;
    margin-bottom: 20px;
  }
  .sf-ev-testimonial blockquote {
    margin: 0 0 12px;
    font-size: 0.95rem;
    color: rgba(255,255,255,0.8);
    line-height: 1.7;
    font-style: italic;
  }
  .sf-ev-testimonial cite {
    display: block;
    font-style: normal;
    font-weight: 600;
    color: #5eecc0;
    font-size: 0.85rem;
  }

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

  /* ── Three tiers — pricing page style ── */
  .sf-ev-tiers {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 1100px;
    margin: 0 auto;
  }
  @media (max-width: 900px) {
    .sf-ev-tiers { grid-template-columns: 1fr; max-width: 440px; }
  }
  .sf-ev-tier {
    background: rgba(10, 10, 10, 0.5);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 40px 28px 36px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    transition: transform 0.3s, box-shadow 0.3s, border-color 0.3s;
    position: relative;
  }
  .sf-ev-tier:hover {
    transform: translateY(-6px);
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    border-color: rgba(255, 255, 255, 0.18);
  }
  /* Middle card pop */
  .sf-ev-tier-pop {
    border-color: rgba(94,236,192,0.25);
    transform: scale(1.03);
    box-shadow: 0 12px 40px rgba(0,178,134,0.15);
  }
  .sf-ev-tier-pop:hover { transform: scale(1.03) translateY(-6px); }
  .sf-ev-tier-pop::after {
    content: "MOST POPULAR";
    position: absolute;
    top: -13px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(135deg, #00b286, #5eecc0);
    color: #0a0a0a;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 1.5px;
    padding: 5px 18px;
    border-radius: 20px;
  }

  .sf-ev-tier-icon {
    width: 56px; height: 56px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
  }
  .sf-ev-tier-icon svg { width: 26px; height: 26px; fill: #fff; }
  .sf-ev-tier-icon-green { background: rgba(0,178,134,0.15); border: 1px solid rgba(94,236,192,0.2); }
  .sf-ev-tier-icon-green svg { fill: #5eecc0; }
  .sf-ev-tier-icon-blue { background: rgba(59,130,246,0.15); border: 1px solid rgba(96,165,250,0.2); }
  .sf-ev-tier-icon-blue svg { fill: #60a5fa; }
  .sf-ev-tier-icon-gold { background: rgba(245,158,11,0.15); border: 1px solid rgba(251,191,36,0.2); }
  .sf-ev-tier-icon-gold svg { fill: #fbbf24; }

  .sf-ev-tier h3 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.4rem;
    font-weight: 400;
    color: #ffffff;
    margin: 0 0 4px;
  }
  .sf-ev-tier-schedule {
    font-size: 0.82rem;
    font-weight: 600;
    color: #5eecc0;
    margin-bottom: 16px;
  }
  .sf-ev-tier-price {
    font-family: 'DM Serif Display', serif;
    font-size: 2.4rem;
    color: #5eecc0;
    margin-bottom: 4px;
    line-height: 1;
  }
  .sf-ev-tier-price-note {
    font-size: 0.78rem;
    color: rgba(255,255,255,0.45);
    margin-bottom: 20px;
  }
  .sf-ev-tier-divider {
    width: 100%;
    height: 1px;
    background: rgba(255,255,255,0.08);
    margin-bottom: 20px;
  }
  .sf-ev-tier p {
    font-size: 0.9rem;
    line-height: 1.65;
    color: rgba(255, 255, 255, 0.6);
    margin: 0 0 20px;
    flex: 1;
  }
  .sf-ev-tier-reqs {
    list-style: none;
    padding: 0;
    margin: 0 0 24px;
    font-size: 0.85rem;
    color: rgba(255,255,255,0.65);
    text-align: left;
    width: 100%;
  }
  .sf-ev-tier-reqs li {
    padding: 5px 0 5px 22px;
    position: relative;
    line-height: 1.5;
  }
  .sf-ev-tier-reqs li::before {
    content: "\\2713";
    position: absolute;
    left: 0;
    color: #5eecc0;
    font-weight: 700;
  }
  .sf-ev-tier-gold .sf-ev-tier-reqs li::before { color: #fbbf24; }
  .sf-ev-tier-gold .sf-ev-tier-schedule { color: #fbbf24; }
  .sf-ev-tier-gold .sf-ev-tier-price { color: #fbbf24; }

  .sf-ev-tier-cta {
    display: inline-block;
    width: 100%;
    text-align: center;
    padding: 14px 28px;
    border-radius: 30px;
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 0.25s;
    text-decoration: none !important;
    margin-top: auto;
  }
  .sf-ev-cta-primary {
    background: #00b286;
    color: #fff !important;
  }
  .sf-ev-cta-primary:hover {
    background: #00c090;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,178,134,0.3);
  }
  .sf-ev-cta-outline {
    background: transparent;
    color: #fff !important;
    border: 1.5px solid rgba(255,255,255,0.25);
  }
  .sf-ev-cta-outline:hover {
    border-color: rgba(255,255,255,0.5);
    background: rgba(255,255,255,0.05);
    transform: translateY(-2px);
  }
  .sf-ev-cta-gold {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #fff !important;
  }
  .sf-ev-cta-gold:hover {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(245,158,11,0.3);
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

  /* ── Application modal ── */
  .sf-modal-backdrop {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 9998;
  }
  .sf-modal-backdrop.sf-modal-open { display: flex; align-items: center; justify-content: center; }
  .sf-modal {
    position: relative;
    width: 90%; max-width: 600px;
    max-height: 85vh;
    overflow-y: auto;
    background: rgba(240,243,248,0.93);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255,255,255,0.6);
    border-radius: 20px;
    padding: 48px 36px 36px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.4);
    z-index: 9999;
  }
  .sf-modal-close {
    position: absolute; top: 16px; right: 20px;
    background: none; border: none;
    color: rgba(0,0,0,0.35);
    font-size: 1.6rem; cursor: pointer;
    transition: color 0.2s;
    line-height: 1;
  }
  .sf-modal-close:hover { color: #111; }
  .sf-modal h3 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.5rem; font-weight: 400;
    color: #111 !important; margin: 0 0 6px; text-align: center;
  }
  .sf-modal > p {
    font-size: 0.9rem; color: #555 !important;
    text-align: center; margin: 0 0 24px;
  }
  /* Dark text on frost background */
  .sf-modal .hs-form,
  .sf-modal .hs-form *,
  .sf-modal .hs-form fieldset,
  .sf-modal .hs-form .hs-field-desc,
  .sf-modal .hs-form .hs-richtext,
  .sf-modal .hs-form .hs-richtext *,
  .sf-modal .hs-form span,
  .sf-modal .hs-form p,
  .sf-modal .hs-form legend {
    color: #333 !important;
    font-family: 'Outfit', 'Inter', sans-serif !important;
  }
  .sf-modal .hs-form label,
  .sf-modal .hs-form .hs-form-field > label,
  .sf-modal .hs-form .hs-form-field > label span {
    color: #333 !important;
    font-size: 0.85rem !important;
    font-weight: 600 !important;
  }
  .sf-modal .hs-form input[type="text"],
  .sf-modal .hs-form input[type="email"],
  .sf-modal .hs-form input[type="tel"],
  .sf-modal .hs-form input[type="number"],
  .sf-modal .hs-form input[type="url"],
  .sf-modal .hs-form textarea,
  .sf-modal .hs-form select,
  .sf-modal .hs-form .hs-input {
    background: #fff !important;
    border: 1px solid #d0d5dd !important;
    border-radius: 10px !important;
    color: #111 !important;
    padding: 12px 14px !important;
    font-size: 0.9rem !important;
    width: 100% !important;
  }
  .sf-modal .hs-form input::placeholder,
  .sf-modal .hs-form textarea::placeholder {
    color: #999 !important;
  }
  .sf-modal .hs-form select option {
    background: #fff !important;
    color: #111 !important;
  }
  .sf-modal .hs-form .hs-button,
  .sf-modal .hs-form input[type="submit"] {
    background: #00b286 !important;
    color: #fff !important;
    border: none !important;
    border-radius: 30px !important;
    padding: 14px 32px !important;
    font-weight: 600 !important;
    font-size: 0.95rem !important;
    cursor: pointer !important;
    width: 100% !important;
    transition: background 0.2s !important;
    margin-top: 8px !important;
  }
  .sf-modal .hs-form .hs-button:hover,
  .sf-modal .hs-form input[type="submit"]:hover { background: #00c090 !important; }
  .sf-modal .hs-form .hs-error-msgs label,
  .sf-modal .hs-form .hs-error-msgs span { color: #dc2626 !important; }
  .sf-modal .hs-form .hs-form-required { color: #dc2626 !important; }
  .sf-modal .hs-form .legal-consent-container,
  .sf-modal .hs-form .legal-consent-container * { color: #888 !important; font-size: 0.8rem !important; }
  .sf-modal .hs-form a { color: #00b286 !important; }
</style>

<!-- Canvas + overlay (infrastructure — do not edit) -->
<canvas id="sf-scroll-canvas"></canvas>
<div id="sf-scroll-overlay"></div>
<img class="sf-ev-mobile-bg" src="https://soberfounders.org/wp-content/uploads/2026/03/phoenix-static.jpg" alt="" />
<!-- /wp:html -->

<!-- wp:html -->
<!-- ═══ HERO INTRO — edit heading & body copy below ═══ -->
<div class="sf-ev">
  <div class="sf-ev-hero">
    <h1>Business Masterminds for<br><span class="sf-accent">Entrepreneurs in Recovery</span></h1>
    <p class="sf-ev-hero-sub">Running a business in recovery means facing challenges most people don&rsquo;t understand &mdash; the stress that used to end in a drink, the loneliness of leading sober in a drinking culture, the days when staying clean and staying profitable feel like competing goals. You don&rsquo;t have to figure it out alone.</p>
    <p class="sf-ev-hero-sub" style="margin-bottom: 36px;">Sober Founders is a free weekly mastermind where entrepreneurs in recovery bring real struggles &mdash; a partnership falling apart, a cash&ndash;flow crisis, a relapse scare &mdash; and get honest feedback from a room full of people who actually get it.</p>
    <div class="sf-ev-hero-cta">
      <a href="#sf-calendar" class="sf-ev-btn sf-ev-btn-primary">Join a Free Session</a>
      <a href="#sf-how-it-works" class="sf-ev-btn sf-ev-btn-outline">See How It Works</a>
    </div>
  </div>
</div>
<!-- /wp:html -->

<!-- wp:html -->
<!-- ═══ THREE TIERS — edit tier names, schedules, requirements below ═══ -->
<div class="sf-ev">
  <div class="sf-ev-section" style="padding-top: 0;">
    <div class="sf-ev-heading">
      <h2>Three Ways to Get Involved</h2>
      <p>Whether you&rsquo;re just getting started or leading an eight-figure company, there&rsquo;s a seat at the table for you.</p>
    </div>

    <div class="sf-ev-tiers">

      <!-- Tuesday -->
      <div class="sf-ev-tier">
        <div class="sf-ev-tier-icon sf-ev-tier-icon-blue">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 0c36.8 0 68.8 20.7 84.9 51.1C373.8 41 411 49 437 75s34 63.3 23.9 96.1C491.3 187.2 512 219.2 512 256s-20.7 68.8-51.1 84.9C471 373.8 463 411 437 437s-63.3 34-96.1 23.9C324.8 491.3 292.8 512 256 512s-68.8-20.7-84.9-51.1C138.2 471 101 463 75 437s-34-63.3-23.9-96.1C20.7 324.8 0 292.8 0 256s20.7-68.8 51.1-84.9C41 138.2 49 101 75 75s63.3-34 96.1-23.9C187.2 20.7 219.2 0 256 0zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
        </div>
        <h3>Tuesday &ldquo;All Our Affairs&rdquo; Business Mastermind</h3>
        <div class="sf-ev-tier-schedule">Every Tuesday &bull; 12:00 PM ET</div>
        <div class="sf-ev-tier-price">Free</div>
        <div class="sf-ev-tier-price-note">Verified members only</div>
        <div class="sf-ev-tier-divider"></div>
        <ul class="sf-ev-tier-reqs">
          <li>$250K+ annual revenue</li>
          <li>2+ full-time employees</li>
          <li>1+ year sober &amp; working the steps</li>
          <li>Short verification interview</li>
        </ul>
        <a href="javascript:void(0)" onclick="document.getElementById('sf-apply-modal').classList.add('sf-modal-open')" class="sf-ev-tier-cta sf-ev-cta-outline">Apply Now</a>
      </div>

      <!-- Thursday -->
      <div class="sf-ev-tier sf-ev-tier-pop">
        <div class="sf-ev-tier-icon sf-ev-tier-icon-green">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192h42.7c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96H21.3C9.6 320 0 310.4 0 298.7zM405.3 320H235.4c26.5-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7h42.7C423.2 192 471 239.8 471 298.7c0 11.8-9.6 21.3-21.3 21.3h-44.3zM320 256a96 96 0 1 0 0-192 96 96 0 1 0 0 192zm-94.8 32c-47 0-87.9 26.2-108.8 64.8C100.2 378.7 92.9 400.8 86.5 432H553.5c-6.4-31.2-13.7-53.3-29.9-79.2C502.7 314.2 461.8 288 414.8 288H225.2z"/></svg>
        </div>
        <h3>Thursday Business Mastermind</h3>
        <div class="sf-ev-tier-schedule">Every Thursday &bull; 11:00 AM ET</div>
        <div class="sf-ev-tier-price">Free</div>
        <div class="sf-ev-tier-price-note">Open to all sober entrepreneurs</div>
        <div class="sf-ev-tier-divider"></div>
        <ul class="sf-ev-tier-reqs">
          <li>Sober &amp; own a business</li>
          <li>No application required</li>
          <li>10&ndash;25 founders per session</li>
          <li>Bring any challenge &mdash; business or recovery</li>
        </ul>
        <a href="#sf-calendar" class="sf-ev-tier-cta sf-ev-cta-primary">Sign Up Free</a>
      </div>

      <!-- Phoenix Forum -->
      <div class="sf-ev-tier sf-ev-tier-gold">
        <div class="sf-ev-tier-icon sf-ev-tier-icon-gold">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6H426.6c30.9 0 57.5-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>
        </div>
        <h3>Phoenix Forum</h3>
        <div class="sf-ev-tier-schedule">Monthly &bull; Curated Schedule</div>
        <div class="sf-ev-tier-price">Paid</div>
        <div class="sf-ev-tier-price-note">Exclusive peer advisory board</div>
        <div class="sf-ev-tier-divider"></div>
        <ul class="sf-ev-tier-reqs">
          <li>$1M+ annual revenue</li>
          <li>1+ year of sobriety</li>
          <li>Intimate groups of 10</li>
          <li>Legacy &amp; leadership focused</li>
        </ul>
        <a href="/phoenix-forum-2nd-group/" class="sf-ev-tier-cta sf-ev-cta-gold">Learn More</a>
      </div>

    </div>
  </div>
</div>
<!-- /wp:html -->

<!-- wp:html -->
<!-- ═══ WHAT HAPPENS IN A SESSION — edit steps & descriptions below ═══ -->
<div class="sf-ev">
  <div class="sf-ev-section-sm sf-ev-pad" style="padding-bottom: 80px;" id="sf-how-it-works">
    <div class="sf-ev-how">
      <div class="sf-ev-heading" style="margin-bottom: 40px;">
        <h2>What Happens in a Business Mastermind</h2>
        <p>No lectures. No networking pitches. Just sober entrepreneurs helping each other solve the problems that keep them up at night.</p>
      </div>
      <div class="sf-ev-steps">
        <div class="sf-ev-step">
          <div class="sf-ev-step-num">1</div>
          <h4>Quick Intros</h4>
          <p>Everyone goes through and shares their name, business, sobriety date, and a recent win.</p>
        </div>
        <div class="sf-ev-step">
          <div class="sf-ev-step-num">2</div>
          <h4>COPI&rsquo;s</h4>
          <p>We collect members&rsquo; Challenges, Opportunities, Problems, and Issues.</p>
        </div>
        <div class="sf-ev-step">
          <div class="sf-ev-step-num">3</div>
          <h4>Experience, Strength &amp; Hope</h4>
          <p>The group shares what worked for them. Not advice &mdash; real experience from founders who&rsquo;ve been exactly where you are.</p>
        </div>
        <div class="sf-ev-step">
          <div class="sf-ev-step-num">4</div>
          <h4>Pay It Forward</h4>
          <p>Next week, you help someone else. That&rsquo;s how a room full of strangers becomes a room full of people who have your back.</p>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- /wp:html -->

<!-- wp:html -->
<!-- ═══ CALENDAR — Luma embed ═══ -->
<div class="sf-ev">
  <div class="sf-ev-pad" style="padding-bottom: 80px;" id="sf-calendar">
    <div class="sf-ev-calendar">
      <div class="sf-ev-heading" style="margin-bottom: 36px; position: relative;">
        <h2>Upcoming Free Thursday Events</h2>
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
</div>
<!-- /wp:html -->

<!-- wp:html -->
<!-- ═══ TESTIMONIAL + RATING — edit testimonials below ═══ -->
<div class="sf-ev">
  <div class="sf-ev-section" style="padding-top: 20px; padding-bottom: 60px;">
    <div class="sf-ev-testimonials">
      <div class="sf-ev-rating">
        <div class="sf-ev-rating-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <p class="sf-ev-rating-text">Average Member Rating: <span class="sf-ev-rating-num">4.78</span></p>
      </div>
      <div class="sf-ev-testimonial">
        <blockquote>&ldquo;I&rsquo;ve been in other masterminds, but none where I could talk about my sobriety and my business in the same sentence. The first session I attended, someone shared a challenge I was literally going through that week. I knew I&rsquo;d found my people.&rdquo;</blockquote>
        <cite>&mdash; Member, Thursday Business Mastermind</cite>
      </div>
      <div class="sf-ev-testimonial">
        <blockquote>&ldquo;Every Thursday I show up and get more value in one hour than most paid programs give in a month. The hot seat format cuts straight to the real issues &mdash; no fluff, just founders who get it helping each other win.&rdquo;</blockquote>
        <cite>&mdash; Member, Thursday Business Mastermind</cite>
      </div>
    </div>
  </div>
</div>
<!-- /wp:html -->

<!-- wp:html -->
<!-- ═══ FOUNDER QUOTE — edit quote text below ═══ -->
<div class="sf-ev">
  <div class="sf-ev-section" style="padding-top: 0; padding-bottom: 40px;">
    <div class="sf-ev-quote">
      <img src="http://soberfounders.org/wp-content/uploads/2026/03/andrew-lassise-headshot.jpg" alt="Andrew Lassise, Founder" />
      <div>
        <blockquote>&ldquo;I started Sober Founders because business masterminds didn&rsquo;t understand my recovery, and 12&ndash;step meetings didn&rsquo;t understand my P&amp;L. If you&rsquo;re tired of balancing those two worlds alone, join us this Thursday. No solicitation &mdash; just experience, strength, and hope.&rdquo;</blockquote>
        <cite>&mdash; Andrew Lassise, Founder</cite>
      </div>
    </div>
  </div>
</div>
<!-- /wp:html -->

<!-- wp:html -->
<!-- ═══ DIVIDER — decorative section break ═══ -->
<div class="sf-ev">
  <div style="padding: 0 0 60px;">
    <div class="sf-ev-divider">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
    </div>
  </div>
</div>
<!-- /wp:html -->

<!-- wp:html -->
<!-- ═══ WHATSAPP COMMUNITY — edit copy below ═══ -->
<div class="sf-ev">
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
</div>
<!-- /wp:html -->

<!-- wp:html -->
<!-- ═══ INTERNAL LINKS — edit links below ═══ -->
<div class="sf-ev">
  <div class="sf-ev-internal">
    <a href="/">Home</a>
    <span class="sf-ev-sep">|</span>
    <a href="/our-story/">Our Story</a>
    <span class="sf-ev-sep">|</span>
    <a href="/weekly-mastermind-group/">Weekly Business Mastermind</a>
    <span class="sf-ev-sep">|</span>
    <a href="/phoenix-forum-registration/">Phoenix Forum</a>
    <span class="sf-ev-sep">|</span>
    <a href="/donate/">Support Our Mission</a>
    <span class="sf-ev-sep">|</span>
    <a href="/blog/">Blog</a>
  </div>
</div>
<!-- /wp:html -->

<!-- wp:html -->
<!-- Schema JSON-LD (infrastructure — do not edit in Elementor) -->
<script type="application/ld+json">
[
  {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    "@id": "https://www.soberfounders.org/events/#event-series",
    "name": "Sober Founders Weekly Business Mastermind Sessions",
    "description": "Free recurring online business mastermind sessions for entrepreneurs in recovery. Held every Tuesday and Thursday at 12 PM ET.",
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
    "name": "Sober Founders Thursday Business Mastermind",
    "description": "Free weekly online business mastermind for sober entrepreneurs. Open to all — no application required.",
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
    "name": "Sober Founders Tuesday Business Mastermind — All Our Affairs",
    "description": "Free weekly business mastermind for verified sober founders with $250K+ revenue, 2+ employees, and 1+ year sober.",
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
<!-- /wp:html -->

<!-- wp:html -->
<!-- Animation Scripts (infrastructure — do not edit in Elementor) -->
<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/ScrollTrigger.min.js"></script>
<script>
(function() {
  /* ── Kill Astra theme scroll handlers that fight with Lenis ── */
  document.documentElement.style.scrollBehavior = 'auto';
  if (window.astra) { window.astra.is_scroll_to_id = ''; window.astra.is_scroll_to_top = ''; }

  /* ── Lenis smooth scroll (synced to GSAP ticker for frame-perfect timing) ── */
  gsap.registerPlugin(ScrollTrigger);
  var lenis = new Lenis({
    duration: 1.0,
    easing: function(t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
    touchMultiplier: 1.5
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(function(time) { lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);

  /* ── Pre-loaded image frame animation (mirrors homepage HeroScroll.tsx) ── */
  var canvas = document.getElementById('sf-scroll-canvas');
  var overlay = document.getElementById('sf-scroll-overlay');
  if (!canvas || !overlay) return;
  if (window.innerWidth < 768) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var FRAME_COUNT = 122;
  var FRAME_BASE = 'https://soberfounders.org/wp-content/uploads/2026/03/frame_';
  var images = [];
  var loadedCount = 0;

  function getFrameSrc(index) {
    var padded = String(index).padStart(3, '0');
    return FRAME_BASE + padded + '-1.jpg';
  }

  function drawFrame(index) {
    var img = images[index];
    if (!img) return;
    var cw = canvas.width, ch = canvas.height;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;
    var canvasRatio = cw / ch, imgRatio = iw / ih;
    var sx, sy, sw, sh;
    if (canvasRatio > imgRatio) {
      sw = iw; sh = iw / canvasRatio; sx = 0; sy = (ih - sh) / 2;
    } else {
      sh = ih; sw = ih * canvasRatio; sx = (iw - sw) / 2; sy = 0;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function onAllLoaded() {
    drawFrame(0);
    var frameObj = { current: 0 };

    ScrollTrigger.create({
      trigger: document.documentElement,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: function(self) {
        var frameIndex = Math.min(FRAME_COUNT - 1, Math.floor(self.progress * (FRAME_COUNT - 1)));

        if (frameIndex !== frameObj.current) {
          frameObj.current = frameIndex;
          drawFrame(frameIndex);
        }

        /* Motion blur based on scroll velocity (matches homepage) */
        var velocity = Math.abs(self.getVelocity());
        var blur = Math.min(velocity / 2000, 4);
        canvas.style.filter = blur > 0.2 ? 'blur(' + blur + 'px)' : 'none';

        /* Overlay dimming (matches homepage HeroScroll.tsx) */
        var p = self.progress;
        var darkness;
        if (p < 0.05) {
          darkness = 0.15;
        } else if (p < 0.25) {
          darkness = 0.15 + ((p - 0.05) / 0.2) * 0.35;
        } else if (p < 0.4) {
          darkness = 0.5 - ((p - 0.25) / 0.15) * 0.15;
        } else {
          darkness = 0.35;
        }
        overlay.style.backgroundColor = 'rgba(10,10,10,' + darkness + ')';
      }
    });
  }

  /* Pre-load all 122 frames (same pattern as homepage) */
  resize();
  window.addEventListener('resize', resize);
  for (var i = 0; i < FRAME_COUNT; i++) {
    var img = new Image();
    img.src = getFrameSrc(i + 1);
    img.onload = function() {
      loadedCount++;
      if (loadedCount === FRAME_COUNT) onAllLoaded();
    };
    images.push(img);
  }
})();
</script>
<!-- /wp:html -->

<!-- wp:html -->
<!-- Application Modal + HubSpot Form (infrastructure — do not edit in Elementor) -->
<div id="sf-apply-modal" class="sf-modal-backdrop" onclick="if(event.target===this)this.classList.remove('sf-modal-open')">
  <div class="sf-modal">
    <button class="sf-modal-close" onclick="document.getElementById('sf-apply-modal').classList.remove('sf-modal-open')">&times;</button>
    <h3>Apply for Tuesday &ldquo;All Our Affairs&rdquo; Business Mastermind</h3>
    <p>Fill out this form and you&rsquo;ll be redirected to schedule a quick Zoom call.</p>
    <div id="sf-hs-form"></div>
  </div>
</div>
<script charset="utf-8" type="text/javascript" src="//js.hsforms.net/forms/embed/v2.js"></script>
<script>
  hbspt.forms.create({
    portalId: "45070276",
    formId: "c5d12c41-5cf8-40a3-b559-810375c6fd99",
    target: "#sf-hs-form"
  });
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
    body: JSON.stringify({ content: PAGE_CONTENT, template: "elementor_canvas" }),
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
