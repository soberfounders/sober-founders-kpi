#!/usr/bin/env node
/**
 * deploy-terms-page.mjs — Deploy Terms & Conditions page to soberfounders.org
 *
 * Usage:
 *   node scripts/deploy-terms-page.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

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

// Read the HTML file and extract just the body content (between <body> tags)
const fullHtml = readFileSync(resolve(ROOT, "terms-and-conditions.html"), "utf8");

// Extract style block and body content for WordPress
const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = fullHtml.match(/<body>([\s\S]*?)<\/body>/);

if (!styleMatch || !bodyMatch) {
  throw new Error("Could not parse terms-and-conditions.html");
}

const PAGE_CONTENT = `<!-- wp:html -->
<!-- SF Terms & Conditions Page — deployed via script, do not edit in WP -->
<style>${styleMatch[1]}</style>
${bodyMatch[1].replace(/<script[\s\S]*?<\/script>/g, "").trim()}
<script>
  // Highlight active TOC link on scroll
  const sections = document.querySelectorAll('.section');
  const tocLinks = document.querySelectorAll('.toc a');
  const backBtn = document.querySelector('.back-to-top');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        tocLinks.forEach(a => a.classList.remove('active'));
        const id = entry.target.getAttribute('id');
        const active = document.querySelector('.toc a[href="#' + id + '"]');
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -75% 0px' });

  sections.forEach(s => observer.observe(s));

  // Back-to-top visibility
  window.addEventListener('scroll', () => {
    backBtn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
</script>
<!-- /wp:html -->`;

async function main() {
  console.log("=".repeat(60));
  console.log("  Terms & Conditions Page — Deploy");
  console.log(`  Target: ${SITE}/terms-and-conditions/`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  // Check if terms page already exists
  const searchUrl = `${SITE}/wp-json/wp/v2/pages?slug=terms-and-conditions`;
  const searchRes = await fetch(searchUrl, { headers });
  if (!searchRes.ok) throw new Error(`WP API search failed: ${searchRes.status}`);
  const existing = await searchRes.json();

  if (DRY_RUN) {
    console.log(`  Content length: ${PAGE_CONTENT.length} chars`);
    if (existing.length) {
      console.log(`  [DRY RUN] Would update existing page (ID ${existing[0].id})`);
    } else {
      console.log("  [DRY RUN] Would create new /terms-and-conditions/ page.");
    }
    return;
  }

  let result;

  if (existing.length) {
    // Update existing page
    const pageId = existing[0].id;
    console.log(`  Found existing page (ID ${pageId}), updating...`);
    const updateRes = await fetch(`${SITE}/wp-json/wp/v2/pages/${pageId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: PAGE_CONTENT,
        template: "",
        status: "publish",
      }),
    });
    if (!updateRes.ok) {
      const body = await updateRes.text();
      throw new Error(`WP API ${updateRes.status}: ${body}`);
    }
    result = await updateRes.json();
  } else {
    // Create new page
    console.log("  No existing page found, creating new page...");
    const createRes = await fetch(`${SITE}/wp-json/wp/v2/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Terms & Conditions",
        slug: "terms-and-conditions",
        content: PAGE_CONTENT,
        status: "publish",
        template: "",
      }),
    });
    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`WP API ${createRes.status}: ${body}`);
    }
    result = await createRes.json();
  }

  console.log(`  Page published (ID ${result.id})`);
  console.log(`  Live: ${result.link}\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
