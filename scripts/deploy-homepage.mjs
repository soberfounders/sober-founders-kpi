#!/usr/bin/env node
/**
 * deploy-homepage.mjs — Redesign Homepage
 *
 * Usage:
 *   node scripts/deploy-homepage.mjs [--dry-run]
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
<!-- SF Homepage — deployed by deploy-homepage.mjs -->
<style>
  .sf-home { font-family: inherit; color: #2e3443; }
  .sf-home * { box-sizing: border-box; }
  .sf-home img { max-width: 100%; display: block; }
  .sf-home a { text-decoration: none; }

  /* ── Hero ── */
  .sf-hero {
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    padding: 100px 24px 90px;
    text-align: center;
    border-radius: 0 0 0 80px;
    position: relative;
    overflow: hidden;
  }
  .sf-hero::before {
    content: "";
    position: absolute; inset: 0;
    background:
      radial-gradient(circle at 20% 30%, rgba(0,178,134,0.18) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(0,178,134,0.12) 0%, transparent 50%),
      radial-gradient(circle at 50% 90%, rgba(0,178,134,0.08) 0%, transparent 40%);
    pointer-events: none;
  }
  .sf-hero-inner {
    position: relative;
    max-width: 820px;
    margin: 0 auto;
  }
  .sf-hero-label {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #00b286;
    background: rgba(0,178,134,0.12);
    padding: 6px 18px;
    border-radius: 20px;
    margin-bottom: 28px;
  }
  .sf-hero h1 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(2.2rem, 5.5vw, 3.4rem);
    font-weight: 400;
    color: #ffffff;
    line-height: 1.2;
    margin: 0 0 20px;
  }
  .sf-hero h1 .sf-accent { color: #00b286; }
  .sf-hero .sf-hero-sub {
    font-size: 1.15rem;
    color: rgba(255,255,255,0.7);
    max-width: 600px;
    margin: 0 auto 36px;
    line-height: 1.75;
  }
  .sf-hero-actions {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .sf-btn {
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
  .sf-btn-primary {
    background: #00b286;
    color: #fff !important;
    text-decoration: none !important;
  }
  .sf-btn-primary:hover {
    background: #00c090;
    color: #fff !important;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,178,134,0.3);
  }
  .sf-btn-outline {
    background: transparent;
    color: #fff !important;
    border: 1.5px solid rgba(255,255,255,0.3);
    text-decoration: none !important;
  }
  .sf-btn-outline:hover {
    border-color: rgba(255,255,255,0.6);
    background: rgba(255,255,255,0.05);
    color: #fff !important;
    transform: translateY(-2px);
  }

  /* ── Section wrappers ── */
  .sf-section {
    max-width: 1100px;
    margin: 0 auto;
    padding: 80px 24px;
  }
  .sf-section-sm { padding: 60px 24px; }

  /* ── Definition block ── */
  .sf-definition {
    text-align: center;
    max-width: 780px;
    margin: 0 auto;
  }
  .sf-definition h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 20px;
  }
  .sf-definition p {
    font-size: 1.08rem;
    color: #475467;
    line-height: 1.8;
    margin: 0 0 16px;
  }
  .sf-definition p:last-child { margin-bottom: 0; }

  /* ── Divider ── */
  .sf-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin: 0 auto;
    max-width: 1100px;
    padding: 0 24px;
  }
  .sf-divider::before,
  .sf-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e5e7eb;
  }
  .sf-divider svg {
    width: 20px; height: 20px;
    fill: #00b286;
    flex-shrink: 0;
  }

  /* ── Stats ── */
  .sf-stats-section {
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    border-radius: 20px;
    padding: 60px 24px;
    margin: 0 auto;
    max-width: 1100px;
    position: relative;
    overflow: hidden;
  }
  .sf-stats-section::before {
    content: "";
    position: absolute; inset: 0;
    background:
      radial-gradient(circle at 25% 50%, rgba(0,178,134,0.1) 0%, transparent 50%),
      radial-gradient(circle at 75% 50%, rgba(0,178,134,0.08) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 32px;
    position: relative;
  }
  @media (max-width: 768px) {
    .sf-stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .sf-stats-grid { grid-template-columns: 1fr; }
  }
  .sf-stat { text-align: center; padding: 8px; }
  .sf-stat-icon {
    width: 52px; height: 52px;
    background: rgba(0,178,134,0.15);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
  }
  .sf-stat-icon svg { width: 24px; height: 24px; fill: #00b286; }
  .sf-stat-num {
    font-family: "DM Serif Display", serif;
    font-size: 2.2rem;
    color: #00b286;
    margin-bottom: 4px;
  }
  .sf-stat-label {
    font-size: 0.95rem;
    color: rgba(255,255,255,0.65);
    line-height: 1.4;
  }

  /* ── Services cards ── */
  .sf-services-heading {
    text-align: center;
    margin-bottom: 48px;
  }
  .sf-services-heading h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 12px;
  }
  .sf-services-heading p {
    color: #667085;
    font-size: 1.05rem;
    max-width: 560px;
    margin: 0 auto;
  }
  .sf-svc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    max-width: 1100px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .sf-svc-grid { grid-template-columns: 1fr; }
  }
  .sf-svc-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    overflow: hidden;
    transition: transform 0.25s, box-shadow 0.25s;
    display: flex;
    flex-direction: column;
  }
  .sf-svc-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.08);
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
  .sf-tag {
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
  .sf-tag-free { background: rgba(0,178,134,0.1); color: #008e65; }
  .sf-tag-paid { background: rgba(241,151,44,0.1); color: #c67a1e; }
  .sf-svc-card-link {
    display: inline-block;
    margin-top: 20px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #00b286 !important;
    text-decoration: none !important;
    transition: color 0.2s;
  }
  .sf-svc-card-link:hover { color: #008e65 !important; }
  .sf-svc-card-link::after { content: " \\2192"; }

  /* Featured card (Phoenix) */
  .sf-svc-featured {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    border: none;
    position: relative;
    overflow: hidden;
  }
  .sf-svc-featured::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(circle at 70% 30%, rgba(0,178,134,0.12) 0%, transparent 50%);
    pointer-events: none;
  }
  @media (max-width: 768px) {
    .sf-svc-featured { grid-template-columns: 1fr; }
  }
  .sf-svc-featured .sf-svc-card-img {
    width: 100%;
    height: 100%;
    min-height: 320px;
    object-fit: cover;
  }
  .sf-svc-featured .sf-svc-card-body {
    padding: 48px 36px;
    justify-content: center;
    position: relative;
  }
  .sf-svc-featured .sf-svc-card-num { background: rgba(0,178,134,0.2); }
  .sf-svc-featured h3 { color: #ffffff; font-size: 1.6rem; }
  .sf-svc-featured p { color: rgba(255,255,255,0.75); }
  .sf-svc-featured .sf-tag {
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

  /* ── Testimonials ── */
  .sf-testimonials-bg {
    background: #f6f7f9;
    border-radius: 24px;
    padding: 80px 24px;
    max-width: 1100px;
    margin: 0 auto;
  }
  .sf-testimonials-heading {
    text-align: center;
    margin-bottom: 48px;
  }
  .sf-testimonials-heading h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #101828;
    margin: 0 0 12px;
  }
  .sf-testimonials-heading p {
    color: #667085;
    font-size: 1.05rem;
    margin: 0;
  }
  .sf-testimonials-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
    max-width: 1000px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .sf-testimonials-grid { grid-template-columns: 1fr; }
  }
  .sf-testimonial-card {
    background: #ffffff;
    border-radius: 16px;
    padding: 32px 28px;
    border: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .sf-testimonial-card::before {
    content: "\\201C";
    font-family: "DM Serif Display", serif;
    font-size: 4rem;
    color: rgba(0,178,134,0.15);
    position: absolute;
    top: 16px;
    left: 24px;
    line-height: 1;
  }
  .sf-testimonial-card blockquote {
    font-size: 1.02rem;
    line-height: 1.75;
    color: #2e3443;
    font-style: italic;
    margin: 20px 0 0;
    flex: 1;
  }
  .sf-testimonial-card cite {
    display: block;
    margin-top: 20px;
    font-style: normal;
    font-weight: 600;
    font-size: 0.9rem;
    color: #101828;
  }
  .sf-testimonial-card cite span {
    display: block;
    font-weight: 400;
    font-size: 0.82rem;
    color: #667085;
    margin-top: 2px;
  }

  /* ── Benefits ── */
  .sf-benefits-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
    max-width: 1000px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .sf-benefits-grid { grid-template-columns: 1fr; }
  }
  .sf-benefit-card {
    text-align: center;
    padding: 36px 24px;
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    transition: transform 0.25s, box-shadow 0.25s;
  }
  .sf-benefit-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.06);
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
  .sf-benefit-icon svg { width: 26px; height: 26px; fill: #fff; }
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

  /* ── Trust strip ── */
  .sf-trust {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    max-width: 700px;
    margin: 0 auto;
    text-align: left;
    padding: 36px 32px;
    background: #f6f7f9;
    border-radius: 16px;
  }
  @media (max-width: 480px) {
    .sf-trust { flex-direction: column; text-align: center; }
  }
  .sf-trust img {
    width: 80px; height: 80px;
    flex-shrink: 0;
  }
  .sf-trust p {
    font-size: 0.95rem;
    color: #475467;
    line-height: 1.65;
    margin: 0;
  }
  .sf-trust strong { color: #101828; }

  /* ── Final CTA ── */
  .sf-cta-section {
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    border-radius: 20px;
    padding: 80px 24px;
    text-align: center;
    max-width: 1100px;
    margin: 0 auto;
    position: relative;
    overflow: hidden;
  }
  .sf-cta-section::before {
    content: "";
    position: absolute; inset: 0;
    background:
      radial-gradient(circle at 30% 40%, rgba(0,178,134,0.15) 0%, transparent 50%),
      radial-gradient(circle at 70% 60%, rgba(0,178,134,0.1) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-cta-section h2 {
    font-family: "DM Serif Display", serif;
    font-size: clamp(1.6rem, 3.5vw, 2.4rem);
    font-weight: 400;
    color: #ffffff;
    margin: 0 0 16px;
    position: relative;
  }
  .sf-cta-section p {
    color: rgba(255,255,255,0.7);
    font-size: 1.1rem;
    max-width: 540px;
    margin: 0 auto 32px;
    line-height: 1.7;
    position: relative;
  }
  .sf-cta-section .sf-hero-actions { position: relative; }

  /* ── Internal links (SEO) ── */
  .sf-internal-links {
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px 24px 0;
    font-size: 0.9rem;
    color: #667085;
    line-height: 2;
  }
  .sf-internal-links a {
    color: #00b286 !important;
    text-decoration: none !important;
    font-weight: 500;
    transition: color 0.2s;
  }
  .sf-internal-links a:hover { color: #008e65 !important; }
  .sf-link-sep { margin: 0 6px; color: #d1d5db; }
</style>

<div class="sf-home">

  <!-- Hero -->
  <div class="sf-hero">
    <div class="sf-hero-inner">
      <div class="sf-hero-label">501(c)(3) Nonprofit Community</div>
      <h1>Sobriety Is a <span class="sf-accent">Competitive Advantage</span></h1>
      <p class="sf-hero-sub">The peer community for entrepreneurs who build thriving businesses and protect their recovery&mdash;not one at the expense of the other.</p>
      <div class="sf-hero-actions">
        <a href="/events/" class="sf-btn sf-btn-primary">Attend a Free Meeting</a>
        <a href="/our-story/" class="sf-btn sf-btn-outline">Learn Our Story</a>
      </div>
    </div>
  </div>

  <!-- What is Sober Founders? (SEO definition block) -->
  <div class="sf-section">
    <div class="sf-definition">
      <h2>What is Sober Founders?</h2>
      <p>Sober Founders is a 501(c)(3) nonprofit community for entrepreneurs in recovery from addiction. We provide free weekly mastermind sessions, peer support, and the Phoenix Forum&mdash;an exclusive peer advisory board for founders with $1M+ in annual revenue and 1+ year of sobriety. Our members represent over $1 billion in combined revenue across industries including technology, real estate, healthcare, and professional services.</p>
      <p>Founded in 2020, Sober Founders is the largest peer community at the intersection of entrepreneurship and recovery. We believe sobriety is a competitive advantage, not a limitation&mdash;and our members prove it every day.</p>
    </div>
  </div>

  <!-- Stats -->
  <div style="max-width:1100px;margin:0 auto;padding:0 24px 60px;">
    <div class="sf-stats-section">
      <div class="sf-stats-grid">
        <div class="sf-stat">
          <div class="sf-stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192h42.7c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96H21.3C9.6 320 0 310.4 0 298.7zM405.3 320H235.4c26.5-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7h42.7C423.2 192 471 239.8 471 298.7c0 11.8-9.6 21.3-21.3 21.3h-44.3zM320 256a96 96 0 1 0 0-192 96 96 0 1 0 0 192zm-94.8 32c-47 0-87.9 26.2-108.8 64.8C100.2 378.7 92.9 400.8 86.5 432H553.5c-6.4-31.2-13.7-53.3-29.9-79.2C502.7 314.2 461.8 288 414.8 288H225.2z"/></svg>
          </div>
          <div class="sf-stat-num">500+</div>
          <div class="sf-stat-label">Active Members</div>
        </div>
        <div class="sf-stat">
          <div class="sf-stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M64 64C28.7 64 0 92.7 0 128V384c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64H64zm64 160c-8.8 0-16-7.2-16-16s7.2-16 16-16h16c44.2 0 80 35.8 80 80v16c0 8.8-7.2 16-16 16s-16-7.2-16-16V272c0-26.5-21.5-48-48-48H128zm224-16c0-8.8 7.2-16 16-16h16c26.5 0 48 21.5 48 48v16c0 8.8-7.2 16-16 16s-16-7.2-16-16V256c0-8.8-7.2-16-16-16H368c-8.8 0-16-7.2-16-16zm-160 32a64 64 0 1 1 128 0 64 64 0 1 1-128 0zM288 160a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"/></svg>
          </div>
          <div class="sf-stat-num">$1B+</div>
          <div class="sf-stat-label">Combined Member Revenue</div>
        </div>
        <div class="sf-stat">
          <div class="sf-stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>
          </div>
          <div class="sf-stat-num">2x Weekly</div>
          <div class="sf-stat-label">Tuesday &amp; Thursday Sessions</div>
        </div>
        <div class="sf-stat">
          <div class="sf-stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
          </div>
          <div class="sf-stat-num">501(c)(3)</div>
          <div class="sf-stat-label">Free to Join, Funded by Donations</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Divider -->
  <div style="padding: 20px 0 40px;">
    <div class="sf-divider">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M208 32a48 48 0 0 0-96 0v16H64C28.7 48 0 76.7 0 112v48H512V112c0-35.3-28.7-64-64-64H400V32a48 48 0 0 0-96 0v16H208V32zM0 192V464c0 26.5 21.5 48 48 48H464c26.5 0 48-21.5 48-48V192H0z"/></svg>
    </div>
  </div>

  <!-- How We Support Founders -->
  <div class="sf-section">
    <div class="sf-services-heading">
      <h2>How We Support Founders</h2>
      <p>Three tiers of community&mdash;from open masterminds to an exclusive peer advisory board&mdash;so you can find your fit.</p>
    </div>

    <div class="sf-svc-grid">

      <!-- 01 — Thursday -->
      <div class="sf-svc-card">
        <div class="sf-svc-card-body">
          <div class="sf-svc-card-num">01</div>
          <h3>Thursday Open Mastermind</h3>
          <p>Open to any sober entrepreneur. Show up, share what's real, and get honest feedback from peers who understand the intersection of business pressure and recovery. No application required&mdash;just be sober and own a business.</p>
          <span class="sf-tag sf-tag-free">Free &bull; Open to All</span>
          <a href="/events/" class="sf-svc-card-link">View Upcoming Events</a>
        </div>
      </div>

      <!-- 02 — Tuesday -->
      <div class="sf-svc-card">
        <div class="sf-svc-card-body">
          <div class="sf-svc-card-num">02</div>
          <h3>Tuesday Verified Mastermind</h3>
          <p>For verified sober business owners ready for deeper accountability. Smaller groups, more focused discussions, and the trust that comes from knowing everyone in the room has skin in the game&mdash;both in business and recovery.</p>
          <span class="sf-tag sf-tag-free">Free &bull; Verified Members</span>
          <a href="/weekly-mastermind-group/" class="sf-svc-card-link">Learn How to Join</a>
        </div>
      </div>

      <!-- 03 — Phoenix Forum -->
      <div class="sf-svc-card sf-svc-featured">
        <img class="sf-svc-card-img" src="https://soberfounders.org/wp-content/uploads/2025/01/pexels-rdne-5756743-1024x683.jpg" alt="Intimate peer advisory group discussion" />
        <div class="sf-svc-card-body">
          <div class="sf-svc-card-num">03</div>
          <h3>Phoenix Forum</h3>
          <p>An exclusive peer advisory board for sober entrepreneurs generating $1M+ in revenue with multiple years of sobriety. Intimate groups of up to 10 members meet weekly for curated, high-trust discussions around growth, sobriety, and life&mdash;because at this level, the stakes are higher and the isolation is real.</p>
          <span class="sf-tag sf-tag-paid">Curated &bull; Application Only</span>
          <a href="/phoenix-forum-registration/" class="sf-svc-card-link">Apply to Join</a>
        </div>
      </div>

    </div>
  </div>

  <!-- Testimonials -->
  <div class="sf-section">
    <div class="sf-testimonials-bg">
      <div class="sf-testimonials-heading">
        <h2>What Our Members Say</h2>
        <p>Real words from real founders in recovery.</p>
      </div>
      <div class="sf-testimonials-grid">
        <div class="sf-testimonial-card">
          <blockquote>"Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!"</blockquote>
          <cite>Adam C.<span>Sober Founders Member</span></cite>
        </div>
        <div class="sf-testimonial-card">
          <blockquote>"This group has been one of the most impactful things I've ever been part of."</blockquote>
          <cite>Josh C.<span>Sober Founders Member</span></cite>
        </div>
        <div class="sf-testimonial-card">
          <blockquote>"I love that it combines two of my biggest passions, business and recovery."</blockquote>
          <cite>Matt S.<span>Sober Founders Member</span></cite>
        </div>
      </div>
    </div>
  </div>

  <!-- Benefits -->
  <div class="sf-section">
    <div class="sf-services-heading">
      <h2>Why Founders Choose Us</h2>
      <p>Every program is built around what sober entrepreneurs actually need.</p>
    </div>
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
        <p>Access peer insights, workshops, and resources designed to sharpen your skills and scale your business.</p>
      </div>
    </div>
  </div>

  <!-- Trust -->
  <div style="max-width:1100px;margin:0 auto;padding:0 24px 60px;">
    <div class="sf-trust">
      <img src="https://soberfounders.org/wp-content/uploads/2025/09/candid-seal-silver-2025.png" alt="Candid Silver Transparency Seal 2025" />
      <p><strong>Highest Transparency Rating for a First-Year Nonprofit</strong> &mdash; Candid (formerly GuideStar) awarded Sober Founders their Silver Transparency Seal&mdash;the highest level a nonprofit can earn in its first year. Every dollar is accounted for, every program is open to scrutiny.</p>
    </div>
  </div>

  <!-- Final CTA -->
  <div style="max-width:1100px;margin:0 auto;padding:0 24px 60px;">
    <div class="sf-cta-section">
      <h2>Your Next Chapter Starts Here</h2>
      <p>You don't have to build alone. Attend a free meeting and see what this community is all about.</p>
      <div class="sf-hero-actions">
        <a href="/events/" class="sf-btn sf-btn-primary">Attend a Free Meeting</a>
        <a href="/phoenix-forum-registration/" class="sf-btn sf-btn-outline">Apply to Phoenix Forum</a>
      </div>
    </div>
  </div>

  <!-- Internal links (SEO) -->
  <div class="sf-internal-links">
    <a href="/phoenix-forum-registration/">Learn about the Phoenix Forum</a>
    <span class="sf-link-sep">|</span>
    <a href="/weekly-mastermind-group/">Join our weekly mastermind sessions</a>
    <span class="sf-link-sep">|</span>
    <a href="/our-story/">Read our impact story</a>
    <span class="sf-link-sep">|</span>
    <a href="/events/">Upcoming events</a>
    <span class="sf-link-sep">|</span>
    <a href="/donate/">Support our mission</a>
    <span class="sf-link-sep">|</span>
    <a href="/blog/">Read the blog</a>
  </div>

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
</script>
<!-- /wp:html -->`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const PAGE_ID = 1989;

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Homepage — Full Redesign");
  console.log(`  Target: ${SITE}/`);
  console.log(`  Page ID: ${PAGE_ID}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would replace homepage content with redesigned version.");
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
