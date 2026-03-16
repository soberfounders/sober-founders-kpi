#!/usr/bin/env node
/**
 * verify-phase1.mjs — Verify all Phase 1 SEO deployments
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  let envPath = resolve(ROOT, ".env.local");
  try { readFileSync(envPath, "utf8"); } catch { envPath = resolve(ROOT, ".env"); }
  const lines = readFileSync(envPath, "utf8").replace(/\r/g, "").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL;

const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  console.log("Phase 1 SEO Verification\n" + "=".repeat(50) + "\n");

  // 1. Robots.txt (note: may be cached by Cloudflare for ~4hrs)
  console.log("--- robots.txt ---");
  const robotsRes = await fetch(`${SITE}/robots.txt`);
  const robots = await robotsRes.text();
  check("robots.txt — HTTPS sitemap present", robots.includes("Sitemap: https://"));
  check("robots.txt — GPTBot Allow", robots.includes("GPTBot") && robots.includes("Allow: /"));
  check("robots.txt — PerplexityBot Allow", robots.includes("PerplexityBot"));
  check("robots.txt — ClaudeBot Allow", robots.includes("ClaudeBot"));
  check("robots.txt — CCBot Disallow", robots.includes("CCBot") && robots.includes("Disallow: /"));
  console.log("  (Note: Cloudflare cache may show stale content for ~4hrs)\n");

  // 2. FAQ Page — FAQPage schema
  console.log("--- FAQ Page (/resources/faq/) ---");
  const faqRes = await fetch(`${SITE}/resources/faq/`);
  const faqHtml = await faqRes.text();
  check("FAQ page — HTTP 200", faqRes.status === 200);
  check("FAQ page — FAQPage schema", faqHtml.includes('"@type":"FAQPage"') || faqHtml.includes('"@type": "FAQPage"'));
  check("FAQ page — Question schema", faqHtml.includes('"@type":"Question"') || faqHtml.includes('"@type": "Question"'));
  const faqQCount = (faqHtml.match(/"@type":\s*"Question"/g) || []).length;
  check("FAQ page — 10+ questions in schema", faqQCount >= 10, `${faqQCount} questions found`);
  console.log();

  // 3. Phoenix Forum pillar page
  console.log("--- Phoenix Forum (/phoenix-forum/) ---");
  const pfRes = await fetch(`${SITE}/phoenix-forum/`);
  const pfHtml = await pfRes.text();
  check("Phoenix Forum — HTTP 200", pfRes.status === 200);
  check("Phoenix Forum — Article schema", pfHtml.includes('"@type":"Article"') || pfHtml.includes('"@type": "Article"'));
  check("Phoenix Forum — FAQPage schema", pfHtml.includes('"@type":"FAQPage"') || pfHtml.includes('"@type": "FAQPage"'));
  console.log();

  // 4. Event schema on /thursday/
  console.log("--- Thursday page (/thursday/) ---");
  const thuRes = await fetch(`${SITE}/thursday/`);
  const thuHtml = await thuRes.text();
  check("/thursday/ — HTTP 200", thuRes.status === 200);
  check("/thursday/ — EventSeries schema", thuHtml.includes('"EventSeries"'));
  check("/thursday/ — Event schema", thuHtml.includes('"@type": "Event"') || thuHtml.includes('"@type":"Event"'));
  check("/thursday/ — Thursday schedule", thuHtml.includes("Thursday"));
  console.log();

  // 5. Event schema on /events/
  console.log("--- Events page (/events/) ---");
  const evRes = await fetch(`${SITE}/events/`);
  const evHtml = await evRes.text();
  check("/events/ — HTTP 200", evRes.status === 200);
  check("/events/ — EventSeries schema", evHtml.includes('"EventSeries"'));
  check("/events/ — Tuesday Event schema", evHtml.includes("Tuesday"));
  check("/events/ — Thursday Event schema", evHtml.includes("Thursday"));
  console.log();

  // 6. Junk pages deleted
  console.log("--- Junk pages ---");
  const sampleRes = await fetch(`${SITE}/sample-page/`, { redirect: "manual" });
  check("/sample-page/ — gone (404 or redirect)", sampleRes.status === 404 || sampleRes.status === 301 || sampleRes.status === 302, `status: ${sampleRes.status}`);
  const elemRes = await fetch(`${SITE}/elementor-3440/`, { redirect: "manual" });
  check("/elementor-3440/ — gone (404 or redirect)", elemRes.status === 404 || elemRes.status === 301 || elemRes.status === 302, `status: ${elemRes.status}`);
  console.log();

  // 7. Homepage schemas
  console.log("--- Homepage schemas ---");
  const homeRes = await fetch(`${SITE}/`);
  const homeHtml = await homeRes.text();
  check("Homepage — NGO/Organization schema", homeHtml.includes('"NGO"') || homeHtml.includes('"Organization"'));
  check("Homepage — EventSeries schema", homeHtml.includes('"EventSeries"'));
  console.log();

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log("=".repeat(50));
  console.log(`SUMMARY: ${passed} passed, ${failed} failed out of ${results.length} checks`);
  if (failed > 0) {
    console.log("\nFailed checks:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  - ${r.name}${r.detail ? " (" + r.detail + ")" : ""}`);
    }
  }
}

main().catch(console.error);
