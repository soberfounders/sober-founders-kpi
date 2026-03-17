#!/usr/bin/env node
/**
 * deploy-website-test.mjs — Deploy the glassmorphism dark-theme homepage to /website-test
 *
 * Usage:
 *   node scripts/deploy-website-test.mjs [--dry-run]
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
// Page content — Glassmorphism dark-theme homepage (from Next.js /test)
// ---------------------------------------------------------------------------
const PAGE_CONTENT = `<!-- wp:html -->
<!-- SF Homepage — cinematic scroll — v${Date.now()} -->

<!-- CDN: GSAP + ScrollTrigger -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"><\/script>

<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@300;400;500;600;700;800&display=swap');

  /* ── RESET for Elementor Canvas + Astra theme override ── */
  html, body { margin: 0; padding: 0; background: #0a0a0a !important; overflow-x: hidden; }
  /* Force full-width on Astra containers when used as homepage */
  .ast-container, .site-content .ast-container,
  .elementor-section-wrap, .elementor-element,
  .entry-content, .page-content,
  .ast-page-builder-template .site-content > .ast-container,
  .ast-plain-container .site-content > .ast-container,
  #content, .site-content, #primary, #main,
  .ast-separate-container .ast-article-single { width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; background: #0a0a0a !important; border: none !important; }
  .ast-separate-container .ast-article-single { box-shadow: none !important; }
  /* Hide Astra header/footer on this page (Elementor Canvas should do it, but just in case) */
  .home .site-header, .home .site-footer, .home .ast-footer-overlay,
  .elementor-template-canvas .site-header, .elementor-template-canvas .site-footer { display: none !important; }

  /* ── BASE ── */
  .sf-test { font-family: 'Outfit', 'Inter', sans-serif; color: #fff; line-height: 1.7; -webkit-font-smoothing: antialiased; }
  .sf-test * { box-sizing: border-box; }
  .sf-test img { max-width: 100%; display: block; }
  .sf-test a { text-decoration: none; }

  /* ── FIXED CANVAS BACKGROUND (z-0) ── */
  #sf-canvas-wrap {
    position: fixed;
    inset: 0;
    z-index: 0;
  }
  #sf-canvas-wrap canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    will-change: filter;
  }
  #sf-dim-overlay {
    position: absolute;
    inset: 0;
    background-color: rgba(10,10,10,0.15);
    transition: background-color 0.05s linear;
  }

  /* ── FIXED HERO TEXT (z-10) ── */
  #sf-hero-text {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    pointer-events: none;
    z-index: 10;
    height: 100vh;
  }
  #sf-hero-text-inner {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 32px;
  }
  .sf-hero-card {
    max-width: 680px;
    background: rgba(10,10,10,0.25);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 24px;
    padding: 40px;
  }
  .sf-hero-label {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #5eecc0;
    background: rgba(94,236,192,0.1);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(94,236,192,0.15);
    padding: 6px 16px;
    border-radius: 20px;
    margin-bottom: 28px;
  }
  .sf-hero-card h1 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(2.4rem, 5vw, 3.6rem);
    font-weight: 400;
    color: #fff;
    line-height: 1.1;
    margin: 0 0 20px;
    text-shadow: 0 2px 16px rgba(0,0,0,0.7);
  }
  .sf-hero-card h1 .sf-accent {
    color: #5eecc0;
    filter: drop-shadow(0 0 24px rgba(94,236,192,0.35));
  }
  .sf-hero-card .sf-hero-sub {
    font-size: 1.1rem;
    color: rgba(255,255,255,0.8);
    max-width: 480px;
    margin: 0 0 36px;
    line-height: 1.8;
    text-shadow: 0 1px 6px rgba(0,0,0,0.5);
  }
  .sf-hero-actions {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    pointer-events: auto;
  }

  /* ── SCROLLABLE CONTENT (z-20) ── */
  #sf-scroll-content {
    position: relative;
    z-index: 20;
  }
  .sf-spacer { height: 100vh; }
  .sf-content-body { background: transparent; }

  /* ── MOBILE FALLBACK ── */
  #sf-mobile-hero {
    display: none;
    position: relative;
    min-height: 100vh;
    align-items: center;
    overflow: hidden;
    background: #0a0a0a;
  }
  #sf-mobile-hero img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  }
  #sf-mobile-hero .sf-mobile-dim {
    position: absolute; inset: 0; background: rgba(10,10,10,0.5);
  }
  #sf-mobile-hero .sf-mobile-inner {
    position: relative; width: 100%; max-width: 1200px; margin: 0 auto; padding: 60px 20px;
  }

  @media (max-width: 767px) {
    /* Switch from canvas to static hero */
    #sf-canvas-wrap, #sf-hero-text { display: none !important; }
    #sf-mobile-hero { display: flex !important; }
    .sf-spacer { height: 0 !important; }

    /* Solid dark background — no canvas behind content on mobile */
    .sf-test { background: #0a0a0a; }
    .sf-content-body { background: #0a0a0a !important; }

    /* Hero card — full-width on mobile */
    .sf-hero-card {
      max-width: 100%;
      padding: 28px 24px;
      border-radius: 20px;
      background: rgba(10,10,10,0.35);
    }
    .sf-hero-card h1 { font-size: 2rem; margin: 0 0 16px; }
    .sf-hero-card .sf-hero-sub { font-size: 1rem; margin: 0 0 28px; line-height: 1.7; }
    .sf-hero-label { font-size: 0.7rem; padding: 5px 14px; margin-bottom: 20px; }
    .sf-hero-actions { flex-direction: column; gap: 12px; }
    .sf-hero-actions .sf-btn { text-align: center; width: 100%; padding: 14px 24px; font-size: 0.9rem; }

    /* Sections — tighter padding */
    .sf-section { padding: 48px 16px; }
    .sf-section-sm { padding: 36px 16px; }
    .sf-pad-wrap { padding: 0 16px; }

    /* Definition block */
    .sf-definition { padding: 32px 20px; border-radius: 20px; }
    .sf-definition h2 { font-size: 1.4rem; }
    .sf-definition p { font-size: 0.95rem; }

    /* Stats */
    .sf-stats-section { padding: 36px 16px; border-radius: 16px; }
    .sf-stat-num { font-size: 1.8rem; }
    .sf-stat-label { font-size: 0.85rem; }

    /* Service cards — single column */
    .sf-svc-grid { grid-template-columns: 1fr; gap: 20px; }
    .sf-svc-card-body { padding: 24px 20px; }
    .sf-svc-card h3 { font-size: 1.2rem; }
    .sf-svc-card p { font-size: 0.9rem; }
    .sf-services-heading h2 { font-size: 1.4rem; }
    .sf-services-heading p { font-size: 0.95rem; }

    /* Testimonials — single column */
    .sf-testimonials-bg { padding: 48px 16px; border-radius: 20px; }
    .sf-testimonials-grid { grid-template-columns: 1fr; gap: 16px; }
    .sf-testimonial-card { padding: 24px 20px; }
    .sf-testimonial-card blockquote { font-size: 0.95rem; }
    .sf-testimonials-heading h2 { font-size: 1.4rem; }

    /* Benefits — single column */
    .sf-benefits-grid { grid-template-columns: 1fr; gap: 16px; }
    .sf-benefit-card { padding: 28px 20px; }
    .sf-benefit-card h3 { font-size: 1.05rem; }
    .sf-benefit-card p { font-size: 0.88rem; }

    /* Trust strip */
    .sf-trust { flex-direction: column; text-align: center; padding: 28px 20px; gap: 16px; }
    .sf-trust img { margin: 0 auto; }
    .sf-trust p { font-size: 0.88rem; }

    /* CTA */
    .sf-cta-section { padding: 48px 20px; border-radius: 16px; }
    .sf-cta-section h2 { font-size: 1.4rem; }
    .sf-cta-section p { font-size: 0.95rem; }
    .sf-cta-actions { flex-direction: column; gap: 12px; }
    .sf-cta-actions .sf-btn { width: 100%; text-align: center; }

    /* Closing tagline */
    .sf-closing-tagline { padding: 48px 20px 80px; }
    .sf-closing-tagline h2 { font-size: 1.2rem; }

    /* Divider */
    .sf-divider { padding: 0 16px; }

    /* Internal links */
    .sf-internal-links { font-size: 0.82rem; padding: 16px 16px 48px; }

    /* General button sizing */
    .sf-btn { font-size: 0.88rem; padding: 12px 24px; }
  }

  /* ── BUTTONS ── */
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
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }
  .sf-btn-primary:hover {
    background: #00c090;
    color: #fff !important;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,178,134,0.4);
  }
  .sf-btn-outline {
    background: transparent;
    color: #fff !important;
    border: 1.5px solid rgba(255,255,255,0.3);
    backdrop-filter: blur(6px);
  }
  .sf-btn-outline:hover {
    border-color: rgba(255,255,255,0.6);
    background: rgba(255,255,255,0.1);
    color: #fff !important;
    transform: translateY(-2px);
  }

  /* ── SECTIONS ── */
  .sf-section { max-width: 1100px; margin: 0 auto; padding: 80px 24px; }
  .sf-section-sm { padding: 60px 24px; }
  .sf-pad-wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

  /* ── DEFINITION BLOCK ── */
  .sf-definition {
    text-align: center;
    max-width: 780px;
    margin: 0 auto;
    background: rgba(10,10,10,0.5);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 24px;
    padding: 48px 36px;
  }
  .sf-definition h2 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #fff;
    margin: 0 0 20px;
  }
  .sf-definition p {
    font-size: 1.08rem;
    color: rgba(255,255,255,0.75);
    line-height: 1.8;
    margin: 0 0 16px;
  }
  .sf-definition p:last-child { margin-bottom: 0; }

  /* ── DIVIDER ── */
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
    background: rgba(255,255,255,0.12);
  }
  .sf-divider svg { width: 20px; height: 20px; fill: #5eecc0; flex-shrink: 0; }

  /* ── STATS ── */
  .sf-stats-section {
    background: rgba(10,10,10,0.5);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.08);
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
      radial-gradient(circle at 25% 50%, rgba(0,178,134,0.08) 0%, transparent 50%),
      radial-gradient(circle at 75% 50%, rgba(0,178,134,0.06) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
  .sf-stat a { text-decoration: none; color: inherit; display: block; }
  .sf-stat-icon {
    width: 52px; height: 52px;
    background: rgba(0,178,134,0.15);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
  }
  .sf-stat-icon svg { width: 24px; height: 24px; fill: #5eecc0; }
  .sf-stat-num {
    font-family: 'DM Serif Display', serif;
    font-size: 2.2rem;
    color: #5eecc0;
    margin-bottom: 4px;
  }
  .sf-stat-label {
    font-size: 0.95rem;
    color: rgba(255,255,255,0.65);
    line-height: 1.4;
  }

  /* ── SERVICES CARDS ── */
  .sf-services-heading { text-align: center; margin-bottom: 48px; }
  .sf-services-heading h2 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #fff;
    margin: 0 0 12px;
  }
  .sf-services-heading p {
    color: rgba(255,255,255,0.6);
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
    background: rgba(10,10,10,0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    overflow: hidden;
    transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s;
    display: flex;
    flex-direction: column;
  }
  .sf-svc-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    border-color: rgba(255,255,255,0.15);
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
    background: rgba(0,178,134,0.2);
    color: #5eecc0;
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: 10px;
    margin-bottom: 16px;
  }
  .sf-svc-card h3 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.35rem;
    font-weight: 400;
    color: #fff;
    margin: 0 0 12px;
  }
  .sf-svc-card p {
    font-size: 0.97rem;
    line-height: 1.7;
    color: rgba(255,255,255,0.7);
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
  .sf-tag-free { background: rgba(94,236,192,0.12); color: #5eecc0; }
  .sf-tag-paid { background: rgba(241,151,44,0.15); color: #f1972c; }
  .sf-svc-card-link {
    display: inline-block;
    margin-top: 20px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #5eecc0 !important;
    text-decoration: none !important;
    transition: color 0.2s;
  }
  .sf-svc-card-link:hover { color: #8ff4d8 !important; }
  .sf-svc-card-link::after { content: " \u2192"; }

  /* ── TESTIMONIALS ── */
  .sf-testimonials-bg {
    background: rgba(10,10,10,0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 24px;
    padding: 80px 24px;
    max-width: 1100px;
    margin: 0 auto;
  }
  .sf-testimonials-heading { text-align: center; margin-bottom: 48px; }
  .sf-testimonials-heading h2 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: #fff;
    margin: 0 0 12px;
  }
  .sf-testimonials-heading p { color: rgba(255,255,255,0.6); font-size: 1.05rem; margin: 0; }
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
    background: rgba(255,255,255,0.04);
    border-radius: 16px;
    padding: 32px 28px;
    border: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
    position: relative;
    transition: border-color 0.25s;
  }
  .sf-testimonial-card:hover { border-color: rgba(255,255,255,0.15); }
  .sf-testimonial-card::before {
    content: "\u201C";
    font-family: 'DM Serif Display', serif;
    font-size: 4rem;
    color: rgba(94,236,192,0.15);
    position: absolute;
    top: 16px; left: 24px;
    line-height: 1;
  }
  .sf-testimonial-card blockquote {
    font-size: 1.02rem;
    line-height: 1.75;
    color: rgba(255,255,255,0.85);
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
    color: #fff;
  }
  .sf-testimonial-card cite span {
    display: block;
    font-weight: 400;
    font-size: 0.82rem;
    color: rgba(255,255,255,0.5);
    margin-top: 2px;
  }

  /* ── BENEFITS ── */
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
    background: rgba(10,10,10,0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.08);
    transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s;
  }
  .sf-benefit-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.2);
    border-color: rgba(255,255,255,0.15);
  }
  .sf-benefit-icon {
    width: 56px; height: 56px;
    background: rgba(0,178,134,0.15);
    border: 1px solid rgba(94,236,192,0.2);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 18px;
  }
  .sf-benefit-icon svg { width: 26px; height: 26px; fill: #5eecc0; }
  .sf-benefit-card h3 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.15rem;
    font-weight: 400;
    color: #fff;
    margin: 0 0 10px;
  }
  .sf-benefit-card p {
    font-size: 0.93rem;
    line-height: 1.65;
    color: rgba(255,255,255,0.6);
    margin: 0;
  }

  /* ── TRUST STRIP ── */
  .sf-trust {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    max-width: 700px;
    margin: 0 auto;
    text-align: left;
    padding: 36px 32px;
    background: rgba(10,10,10,0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
  }
  @media (max-width: 480px) {
    .sf-trust { flex-direction: column; text-align: center; }
  }
  .sf-trust img { width: 80px; height: 80px; flex-shrink: 0; }
  .sf-trust p { font-size: 0.95rem; color: rgba(255,255,255,0.7); line-height: 1.65; margin: 0; }
  .sf-trust strong { color: #fff; }

  /* ── FINAL CTA ── */
  .sf-cta-section {
    background: rgba(10,10,10,0.55);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255,255,255,0.1);
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
      radial-gradient(circle at 30% 40%, rgba(0,178,134,0.1) 0%, transparent 50%),
      radial-gradient(circle at 70% 60%, rgba(0,178,134,0.06) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-cta-section h2 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(1.6rem, 3.5vw, 2.4rem);
    font-weight: 400;
    color: #fff;
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
  .sf-cta-actions {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
    position: relative;
  }

  /* ── CLOSING TAGLINE ── */
  .sf-closing-tagline {
    text-align: center;
    padding: 80px 24px 120px;
    max-width: 1100px;
    margin: 0 auto;
  }
  .sf-closing-tagline h2 {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(1.4rem, 3.5vw, 2.2rem);
    font-weight: 400;
    color: rgba(255,255,255,0.9);
    font-style: italic;
    letter-spacing: 0.5px;
    text-shadow: 0 2px 20px rgba(0,0,0,0.8);
    margin: 0;
  }
  .sf-closing-tagline .sf-accent {
    color: #5eecc0;
    filter: drop-shadow(0 0 24px rgba(94,236,192,0.35));
  }

  /* ── INTERNAL LINKS ── */
  .sf-internal-links {
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px 24px 60px;
    font-size: 0.9rem;
    color: rgba(255,255,255,0.5);
    line-height: 2;
  }
  .sf-internal-links a {
    color: #5eecc0 !important;
    text-decoration: none !important;
    font-weight: 500;
    transition: color 0.2s;
  }
  .sf-internal-links a:hover { color: #8ff4d8 !important; }
  .sf-link-sep { margin: 0 6px; color: rgba(255,255,255,0.2); }
</style>

<div class="sf-test">

  <!-- FIXED: Canvas background with image sequence (z-0) -->
  <div id="sf-canvas-wrap">
    <canvas id="sf-canvas"></canvas>
    <div id="sf-dim-overlay"></div>
  </div>

  <!-- FIXED: Hero text with glassmorphism card (z-10) -->
  <div id="sf-hero-text">
    <div id="sf-hero-text-inner">
      <div class="sf-hero-card">
        <div class="sf-hero-label">501(c)(3) Nonprofit Community</div>
        <h1>Sober Founders &mdash; A Community For <span class="sf-accent">Entrepreneurs In Recovery</span></h1>
        <p class="sf-hero-sub">The peer community for entrepreneurs who build thriving businesses and protect their recovery&mdash;not one at the expense of the other.</p>
        <div class="sf-hero-actions">
          <a href="/events/" class="sf-btn sf-btn-primary">Attend a Free Meeting</a>
          <a href="/our-story/" class="sf-btn sf-btn-outline">Learn Our Story</a>
        </div>
      </div>
    </div>
  </div>

  <!-- MOBILE FALLBACK: static image hero -->
  <div id="sf-mobile-hero">
    <img src="https://soberfounders.org/wp-content/uploads/2026/03/phoenix-static.jpg" alt="Phoenix rising from ashes" />
    <div class="sf-mobile-dim"></div>
    <div class="sf-mobile-inner">
      <div class="sf-hero-card">
        <div class="sf-hero-label">501(c)(3) Nonprofit Community</div>
        <h1>Sober Founders &mdash; A Community For <span class="sf-accent">Entrepreneurs In Recovery</span></h1>
        <p class="sf-hero-sub">The peer community for entrepreneurs who build thriving businesses and protect their recovery&mdash;not one at the expense of the other.</p>
        <div class="sf-hero-actions">
          <a href="/events/" class="sf-btn sf-btn-primary">Attend a Free Meeting</a>
          <a href="/our-story/" class="sf-btn sf-btn-outline">Learn Our Story</a>
        </div>
      </div>
    </div>
  </div>

  <!-- SCROLLABLE CONTENT (z-20) -->
  <div id="sf-scroll-content">
    <div class="sf-spacer"></div>
    <div class="sf-content-body">

    <!-- What is Sober Founders? -->
    <div class="sf-section">
      <div class="sf-definition">
        <h2>What is Sober Founders?</h2>
        <p>Sober Founders is a 501(c)(3) nonprofit community for entrepreneurs in recovery from addiction. Founded in 2024 after a successful exit, our creator knew there had to be a way to bridge the gap between sobriety and business&mdash;and set out to dedicate his next chapter to bringing together like-minded, successful sober entrepreneurs.</p>
        <p>Our members represent over $500 million in combined revenue across all industries. We provide free weekly mastermind sessions, peer support, and the Phoenix Forum&mdash;an exclusive peer advisory board for founders with $1M+ in annual revenue and 1+ year of sobriety.</p>
      </div>
    </div>

    <!-- How We Support Founders -->
    <div class="sf-section">
      <div class="sf-services-heading">
        <h2>How We Support Founders</h2>
        <p>Four tiers of community&mdash;from open masterminds to an exclusive peer advisory board&mdash;so you can find your fit.</p>
      </div>

      <div class="sf-svc-grid">

        <!-- 01 — Free Business Mastermind -->
        <div class="sf-svc-card">
          <div class="sf-svc-card-body">
            <div class="sf-svc-card-num">01</div>
            <h3>Free Business Mastermind</h3>
            <p>Open to any sober entrepreneur. Show up, share what's real, and get honest feedback from peers who understand the intersection of business pressure and recovery. No application required&mdash;just be sober and own a business.</p>
            <span class="sf-tag sf-tag-free">Free &bull; Open to All</span>
            <a href="/events/" class="sf-svc-card-link">View Upcoming Events</a>
          </div>
        </div>

        <!-- 02 — All Our Affairs Mastermind (Tuesday) -->
        <div class="sf-svc-card">
          <div class="sf-svc-card-body">
            <div class="sf-svc-card-num">02</div>
            <h3>All Our Affairs Mastermind</h3>
            <p>For sober entrepreneurs with 2+ full-time employees and over a year of sobriety working the 12 steps. A structured mastermind where business growth and step work go hand in hand&mdash;because scaling a company and maintaining recovery require the same rigorous honesty.</p>
            <span class="sf-tag sf-tag-free">Free &bull; Verified Members</span>
            <a href="/tuesday/" class="sf-svc-card-link">Learn How to Join</a>
          </div>
        </div>

        <!-- 03 — Private WhatsApp Community -->
        <div class="sf-svc-card">
          <div class="sf-svc-card-body">
            <div class="sf-svc-card-num">03</div>
            <h3>Private WhatsApp Community</h3>
            <p>Get instant access to our private WhatsApp group&mdash;a 24/7 lifeline of sober entrepreneurs who get it. Share wins, ask for advice, and stay connected between meetings. Real-time support from people who understand both the grind and the recovery.</p>
            <span class="sf-tag sf-tag-free">Free &bull; Open to All</span>
            <a href="https://chat.whatsapp.com/HfxeP3enQtN3oGFnwVOH8D" class="sf-svc-card-link">Join the Community</a>
          </div>
        </div>

        <!-- 04 — Phoenix Forum -->
        <div class="sf-svc-card">
          <div class="sf-svc-card-body">
            <div class="sf-svc-card-num">04</div>
            <h3>Phoenix Forum</h3>
            <p>An exclusive peer advisory board for sober entrepreneurs generating $1M+ in revenue with multiple years of sobriety. Intimate groups of up to 10 members meet weekly for curated, high-trust discussions around growth, sobriety, and life&mdash;because at this level, the stakes are higher and the isolation is real.</p>
            <span class="sf-tag sf-tag-paid">Curated &bull; Application Only</span>
            <a href="/phoenix-forum-registration/" class="sf-svc-card-link">Apply to Join</a>
          </div>
        </div>

      </div>
    </div>

    <!-- Divider -->
    <div style="padding: 40px 0;">
      <div class="sf-divider">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M208 32a48 48 0 0 0-96 0v16H64C28.7 48 0 76.7 0 112v48H512V112c0-35.3-28.7-64-64-64H400V32a48 48 0 0 0-96 0v16H208V32zM0 192V464c0 26.5 21.5 48 48 48H464c26.5 0 48-21.5 48-48V192H0z"/></svg>
      </div>
    </div>

    <!-- Stats — Year 1 Achievements -->
    <div style="max-width:1100px;margin:0 auto;padding:0 24px 60px;">
      <div class="sf-services-heading" style="margin-bottom:40px;">
        <h2>Year 1 Achievements</h2>
      </div>
      <div class="sf-stats-section">
        <div class="sf-stats-grid">
          <div class="sf-stat">
            <div class="sf-stat-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192h42.7c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96H21.3C9.6 320 0 310.4 0 298.7zM405.3 320H235.4c26.5-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7h42.7C423.2 192 471 239.8 471 298.7c0 11.8-9.6 21.3-21.3 21.3h-44.3zM320 256a96 96 0 1 0 0-192 96 96 0 1 0 0 192zm-94.8 32c-47 0-87.9 26.2-108.8 64.8C100.2 378.7 92.9 400.8 86.5 432H553.5c-6.4-31.2-13.7-53.3-29.9-79.2C502.7 314.2 461.8 288 414.8 288H225.2z"/></svg>
            </div>
            <div class="sf-stat-num">500+</div>
            <div class="sf-stat-label">Entrepreneurs Helped</div>
          </div>
          <div class="sf-stat">
            <div class="sf-stat-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M64 64C28.7 64 0 92.7 0 128V384c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64H64zm64 160c-8.8 0-16-7.2-16-16s7.2-16 16-16h16c44.2 0 80 35.8 80 80v16c0 8.8-7.2 16-16 16s-16-7.2-16-16V272c0-26.5-21.5-48-48-48H128zm224-16c0-8.8 7.2-16 16-16h16c26.5 0 48 21.5 48 48v16c0 8.8-7.2 16-16 16s-16-7.2-16-16V256c0-8.8-7.2-16-16-16H368c-8.8 0-16-7.2-16-16zm-160 32a64 64 0 1 1 128 0 64 64 0 1 1-128 0zM288 160a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"/></svg>
            </div>
            <div class="sf-stat-num">$500M+</div>
            <div class="sf-stat-label">Combined Member Revenue</div>
          </div>
          <div class="sf-stat">
            <div class="sf-stat-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M470.7 9.4c3 3.1 5.3 6.6 6.9 10.3s2.4 7.8 2.4 12.2V128c0 17.7-14.3 32-32 32s-32-14.3-32-32V109.3L310.6 214.6c-12.5 12.5-32.8 12.5-45.3 0L192 141.3 54.6 278.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l160-160c12.5-12.5 32.8-12.5 45.3 0L288 146.7 383.4 51.3H352c-17.7 0-32-14.3-32-32s14.3-32 32-32h96c8.8 0 16.8 3.6 22.6 9.3l.1 .1z"/></svg>
            </div>
            <div class="sf-stat-num">$1M+</div>
            <div class="sf-stat-label">Additional Revenue Generated for Members</div>
          </div>
          <div class="sf-stat">
            <div class="sf-stat-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z"/></svg>
            </div>
            <div class="sf-stat-num">98%</div>
            <div class="sf-stat-label">Say We Helped Them Stay Sober Longer</div>
          </div>
          <div class="sf-stat">
            <a href="/events/">
              <div class="sf-stat-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>
              </div>
              <div class="sf-stat-num">2x Weekly</div>
              <div class="sf-stat-label">Tuesday &amp; Thursday Sessions</div>
            </a>
          </div>
          <div class="sf-stat">
            <a href="/donate/">
              <div class="sf-stat-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/></svg>
              </div>
              <div class="sf-stat-num">501(c)(3)</div>
              <div class="sf-stat-label">Free to Join, Funded by Donations</div>
            </a>
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
        <p><strong>Transparency</strong> - Candid (formerly GuideStar) awarded Sober Founders Inc their Silver Transparency Seal - the highest level a nonprofit can earn in its first year. Every dollar is accounted for and goes directly toward the mission!</p>
      </div>
    </div>

    <!-- Final CTA -->
    <div style="max-width:1100px;margin:0 auto;padding:0 24px 60px;">
      <div class="sf-cta-section">
        <h2>Your Next Chapter Starts Here</h2>
        <p>You don't have to build alone. Attend a free meeting and see what this community is all about.</p>
        <div class="sf-cta-actions">
          <a href="/events/" class="sf-btn sf-btn-primary">Attend a Free Meeting</a>
          <a href="/phoenix-forum-registration/" class="sf-btn sf-btn-outline">Apply to Phoenix Forum</a>
        </div>
      </div>
    </div>

    <!-- Closing Tagline -->
    <div class="sf-closing-tagline">
      <h2>"It's not the stopping of using, it's the <span class="sf-accent">starting of living.</span>"</h2>
    </div>

    <!-- Internal Links (SEO) -->
    <div class="sf-internal-links">
      <a href="/phoenix-forum-registration/">Learn about the Phoenix Forum</a>
      <span class="sf-link-sep">|</span>
      <a href="/tuesday/">Join our Tuesday mastermind</a>
      <span class="sf-link-sep">|</span>
      <a href="/our-story/">Read our impact story</a>
      <span class="sf-link-sep">|</span>
      <a href="/events/">Upcoming events</a>
      <span class="sf-link-sep">|</span>
      <a href="/donate/">Support our mission</a>
      <span class="sf-link-sep">|</span>
      <a href="/blog/">Read the blog</a>
    </div>

  </div><!-- /sf-content-body -->
  </div><!-- /sf-scroll-content -->
</div>

<!-- ═══ SCROLL ANIMATION ENGINE ═══ -->
<script>
(function() {
  // Skip animation on mobile
  if (window.innerWidth < 768) return;

  gsap.registerPlugin(ScrollTrigger);

  // Native scroll — no Lenis (it conflicts with WordPress themes and causes jank)

  // ── Image sequence config ──
  var FRAME_COUNT = 122;
  var FRAME_BASE = 'https://soberfounders.org/wp-content/uploads/2026/03/frame_';
  var canvas = document.getElementById('sf-canvas');
  var ctx = canvas.getContext('2d');
  var overlay = document.getElementById('sf-dim-overlay');
  var heroText = document.getElementById('sf-hero-text');
  var images = [];
  var loadedCount = 0;
  var currentFrame = -1;

  function getFrameSrc(i) {
    var num = String(i).padStart(3, '0');
    return FRAME_BASE + num + '.jpg';
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (currentFrame >= 0) drawFrame(currentFrame);
  }

  function drawFrame(index) {
    var img = images[index];
    if (!img || !img.complete) return;
    var cw = canvas.width, ch = canvas.height;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var canvasRatio = cw / ch, imgRatio = iw / ih;
    var sx, sy, sw, sh;
    if (canvasRatio > imgRatio) {
      sw = iw; sh = iw / canvasRatio; sx = 0; sy = (ih - sh) / 2;
    } else {
      sh = ih; sw = ih * canvasRatio; sx = (iw - sw) / 2; sy = 0;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    currentFrame = index;
  }

  function onAllLoaded() {
    drawFrame(0);

    // Hero text fade-out
    gsap.to(heroText, {
      opacity: 0, y: -60, ease: 'power2.in',
      scrollTrigger: { trigger: document.body, start: 'top top', end: '8% top', scrub: 0.3 }
    });

    // Main scroll-scrub
    ScrollTrigger.create({
      trigger: document.documentElement,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: function(self) {
        // Accelerated mapping — animation completes in first 55% of scroll
        var accelerated = Math.min(1, self.progress / 0.55);
        var eased = Math.pow(accelerated, 1.3);
        var frameIndex = Math.min(FRAME_COUNT - 1, Math.floor(eased * (FRAME_COUNT - 1)));
        if (frameIndex !== currentFrame) drawFrame(frameIndex);

        // Motion blur based on scroll velocity
        var velocity = Math.abs(self.getVelocity());
        var blur = Math.min(velocity / 2000, 4);
        canvas.style.filter = blur > 0.2 ? 'blur(' + blur + 'px)' : 'none';

        // Scroll-sync dimming
        var p = self.progress, darkness;
        if (p < 0.05) { darkness = 0.15; }
        else if (p < 0.25) { darkness = 0.15 + ((p - 0.05) / 0.2) * 0.35; }
        else if (p < 0.4) { darkness = 0.5 - ((p - 0.25) / 0.15) * 0.15; }
        else { darkness = 0.35; }
        overlay.style.backgroundColor = 'rgba(10,10,10,' + darkness + ')';
      }
    });
  }

  // Preload all frames
  for (var i = 0; i < FRAME_COUNT; i++) {
    var img = new Image();
    img.src = getFrameSrc(i + 1);
    img.onload = function() {
      loadedCount++;
      if (loadedCount === FRAME_COUNT) onAllLoaded();
    };
    images.push(img);
  }

  resize();
  window.addEventListener('resize', resize);
})();
<\/script>
<!-- /wp:html -->`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const SLUG = "website-test";

async function findPageBySlug(slug) {
  const url = `${SITE}/wp-json/wp/v2/pages?slug=${slug}&status=publish,draft,private&per_page=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const pages = await res.json();
  return pages.length > 0 ? pages[0] : null;
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Website Test — Glassmorphism Dark Theme");
  console.log(`  Target: ${SITE}/${SLUG}/`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would create/update page with glassmorphism dark theme.");
    console.log(`  Content length: ${PAGE_CONTENT.length} chars`);
    return;
  }

  // Check if page already exists
  const existing = await findPageBySlug(SLUG);

  let url, method;
  if (existing) {
    console.log(`  Found existing page (ID ${existing.id}), updating...`);
    url = `${SITE}/wp-json/wp/v2/pages/${existing.id}`;
    method = "POST";
  } else {
    console.log("  Creating new page...");
    url = `${SITE}/wp-json/wp/v2/pages`;
    method = "POST";
  }

  const body = {
    title: "Website Test — Glassmorphism Dark Theme",
    slug: SLUG,
    status: "publish",
    content: PAGE_CONTENT,
    template: "elementor_canvas", // full page — no header/footer
  };

  // If creating new, we send the full body. If updating, same thing.
  const res = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`WP API ${res.status} ${res.statusText}: ${errBody}`);
  }

  const result = await res.json();
  console.log(`  ✓ Page ${existing ? "updated" : "created"} successfully (ID ${result.id})`);
  console.log(`  ✓ Live: ${result.link}\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
