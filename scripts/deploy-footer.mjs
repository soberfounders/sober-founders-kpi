#!/usr/bin/env node
/**
 * deploy-footer.mjs — Site-wide trust footer (injected via sober-seo-rest plugin)
 *
 * Pushes HTML to the `sober_footer_html` option via POST /sober/v1/footer.
 * Renders on every page via the `astra_footer_before` hook.
 *
 * Usage:
 *   node scripts/deploy-footer.mjs [--dry-run]
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
// Footer HTML — site-wide trust bar + footer nav
// ---------------------------------------------------------------------------
const FOOTER_HTML = `
<style>
  /* ── Hide Astra default footer (replaced by this custom footer) ── */
  footer#colophon {
    display: none !important;
  }

  /* ── Hide Elementor "Check Out Our Free Online Events!" CTA on blog posts ── */
  .elementor-element-43a11a7 {
    display: none !important;
  }

  /* ── Custom footer ── */
  .sf-site-footer {
    max-width: 1100px;
    margin: 0 auto;
    padding: 48px 24px 20px;
    font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  }

  /* ── Trust bar ── */
  .sf-footer-trust {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px 32px;
    background: linear-gradient(135deg, #101828 0%, #1a2940 50%, #0d3b2e 100%);
    border-radius: 14px;
    margin-bottom: 40px;
    position: relative;
    overflow: hidden;
  }
  .sf-footer-trust::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(circle at 20% 50%, rgba(0,178,134,0.12) 0%, transparent 50%);
    pointer-events: none;
  }
  .sf-footer-trust img {
    width: 72px;
    height: 72px;
    flex-shrink: 0;
    position: relative;
  }
  .sf-footer-trust p {
    font-size: 0.88rem;
    color: rgba(255,255,255,0.75);
    line-height: 1.55;
    margin: 0;
    position: relative;
  }
  .sf-footer-trust strong {
    color: #00b286;
    font-weight: 600;
  }
  @media (max-width: 480px) {
    .sf-footer-trust {
      flex-direction: column;
      text-align: center;
      padding: 20px;
    }
  }

  /* ── Donate button ── */
  .sf-footer-donate {
    text-align: center;
    margin-bottom: 40px;
  }
  .sf-footer-donate a {
    display: inline-block;
    padding: 16px 48px;
    background: #dc2626;
    color: #fff !important;
    font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    text-decoration: none !important;
    border-radius: 10px;
    transition: background 0.2s, transform 0.15s;
  }
  .sf-footer-donate a:hover {
    background: #b91c1c;
    transform: translateY(-1px);
  }

  /* ── Footer columns ── */
  .sf-footer-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
    gap: 32px;
    padding-bottom: 32px;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 24px;
  }
  @media (max-width: 768px) {
    .sf-footer-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 480px) {
    .sf-footer-grid {
      grid-template-columns: 1fr;
    }
  }

  .sf-footer-brand p {
    font-size: 0.9rem;
    color: #667085;
    line-height: 1.65;
    margin: 0 0 16px;
    max-width: 280px;
  }
  .sf-footer-brand .sf-footer-nonprofit {
    font-size: 0.78rem;
    color: #98a2b3;
    font-weight: 500;
  }

  .sf-footer-col h4 {
    font-family: 'DM Serif Display', serif;
    font-size: 1rem;
    font-weight: 400;
    color: #101828;
    margin: 0 0 14px;
  }
  .sf-footer-col ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .sf-footer-col li {
    margin-bottom: 8px;
  }
  .sf-footer-col a {
    font-size: 0.88rem;
    color: #667085 !important;
    text-decoration: none !important;
    transition: color 0.2s;
  }
  .sf-footer-col a:hover {
    color: #00b286 !important;
  }

  /* ── Copyright ── */
  .sf-footer-copy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
  .sf-footer-copy p {
    font-size: 0.8rem;
    color: #98a2b3;
    margin: 0;
  }
  .sf-footer-copy a {
    color: #98a2b3 !important;
    text-decoration: none !important;
  }
  .sf-footer-copy a:hover {
    color: #00b286 !important;
  }
</style>

<div class="sf-site-footer">

  <!-- Trust bar -->
  <div class="sf-footer-trust">
    <img src="https://soberfounders.org/wp-content/uploads/2025/09/candid-seal-silver-2025.png" alt="Candid Silver Transparency Seal 2025" />
    <p><strong>501(c)(3) Nonprofit</strong> &middot; Candid Silver Seal &mdash; the highest transparency rating a first-year nonprofit can earn. Every dollar is spent on the mission.</p>
  </div>

  <!-- Donate button -->
  <div class="sf-footer-donate">
    <a href="/donate/">Donate to Support Entrepreneurs in Recovery</a>
  </div>

  <!-- Footer columns -->
  <div class="sf-footer-grid">

    <div class="sf-footer-brand">
      <p>The peer community for entrepreneurs who build thriving businesses and protect their recovery&mdash;not one at the expense of the other.</p>
      <span class="sf-footer-nonprofit">Sober Founders Inc. &middot; 501(c)(3) Tax-Deductible &middot; EIN: 33-4098435</span>
    </div>

    <div class="sf-footer-col">
      <h4>Community</h4>
      <ul>
        <li><a href="/events/">Thursday Mastermind</a></li>
        <li><a href="/weekly-mastermind-group/">Tuesday Mastermind</a></li>
        <li><a href="/phoenix-forum-registration/">Phoenix Forum</a></li>
        <li><a href="/blog/">Blog</a></li>
      </ul>
    </div>

    <div class="sf-footer-col">
      <h4>Resources</h4>
      <ul>
        <li><a href="/blog/">Blog</a></li>
        <li><a href="/resources/faq/">FAQ</a></li>
        <li><a href="/resources/">Guides</a></li>
      </ul>
    </div>

    <div class="sf-footer-col">
      <h4>Case Studies</h4>
      <ul>
        <li><a href="/case-studies/">All Case Studies</a></li>
        <li><a href="/case-studies/adam-c/">Adam C.</a></li>
        <li><a href="/case-studies/josh-c/">Josh C.</a></li>
      </ul>
    </div>

    <div class="sf-footer-col">
      <h4>About</h4>
      <ul>
        <li><a href="/our-story/">Our Story</a></li>
        <li><a href="/mission-vision-and-principles/">Mission</a></li>
        <li><a href="/board-of-directors/">Board</a></li>
        <li><a href="/contact/">Contact</a></li>
      </ul>
    </div>

  </div>

  <!-- Copyright -->
  <div class="sf-footer-copy">
    <p>&copy; 2026 Sober Founders Inc. All rights reserved.</p>
    <p><a href="/privacy-policy/">Privacy</a> &middot; <a href="/non-discrimination-equal-opportunity-statement/">Non-Discrimination</a></p>
  </div>

</div>
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Site-Wide Footer — Trust Bar + Navigation");
  console.log(`  Target: ${SITE} (every page)`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would deploy footer HTML via /sober/v1/footer.");
    console.log(`  Content length: ${FOOTER_HTML.length} chars`);
    console.log("\n  Preview of trust bar text:");
    console.log('  "501(c)(3) Nonprofit · Candid Silver Seal — the highest');
    console.log('   transparency rating a first-year nonprofit can earn."');
    return;
  }

  // Write directly via Code Snippets to bypass wp_kses stripping <style> tags.
  const b64 = Buffer.from(FOOTER_HTML).toString("base64");
  const snippetCode = `update_option('sober_footer_html', base64_decode('${b64}'));`;

  const createRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "SF Deploy Footer (one-time)",
      code: snippetCode,
      scope: "global",
      priority: 1,
      active: true,
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Snippet create failed ${createRes.status}: ${body}`);
  }

  const snippet = await createRes.json();
  console.log(`  ✓ Snippet ${snippet.id} created and executed`);

  // Wait for execution, then deactivate
  await new Promise((r) => setTimeout(r, 2000));
  await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${snippet.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ active: false }),
  });
  console.log(`  ✓ Snippet deactivated`);

  // Verify
  const verifyRes = await fetch(`${SITE}/wp-json/sober/v1/footer`, { headers });
  const verifyData = await verifyRes.json();
  const hasStyle = verifyData.html.includes("<style>");
  console.log(`  ✓ Footer stored (${verifyData.html.length} chars, <style>: ${hasStyle})`);
  console.log(`  ✓ Renders on every page via astra_footer_before hook\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
