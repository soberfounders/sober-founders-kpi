#!/usr/bin/env node
/**
 * Quick check: does the Elementor/Astra blog template inject a global CTA
 * on every post? Fetches a few rendered posts and dumps the bottom of the page.
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

const slugs = [
  "is-being-sober-worth-it-7-unexpected-business-advantages-sober-entrepreneurs-dont-want-you-to-know",
  "12-steps-and-your-business",
  "sober-founders-in-new-york-ny-entrepreneurs-in-recovery",
];

async function main() {
  for (const slug of slugs) {
    console.log("\n" + "=".repeat(70));
    console.log(`POST: ${slug}`);
    console.log("=".repeat(70));

    const res = await fetch(`${SITE}/${slug}/`);
    const html = await res.text();

    // Find the content area — look for common WordPress/Astra markers
    const markers = [
      "entry-content",
      "ast-post-format",
      "post-navigation",
      "comments-area",
      "ast-single-related",
      "elementor-widget",
    ];

    for (const marker of markers) {
      const count = (html.match(new RegExp(marker, "g")) || []).length;
      if (count > 0) console.log(`  ${marker}: ${count} occurrences`);
    }

    // Extract all anchor tags with their text
    const anchors = html.match(/<a [^>]*href=[^>]*>[^<]{2,60}<\/a>/g) || [];

    // Filter for CTA-like anchors (events, phoenix, attend, join, apply, register, free)
    const ctaAnchors = anchors.filter(a =>
      /events|phoenix|attend|join now|apply|register|free meeting|sign up/i.test(a)
    );

    console.log(`\n  CTA-like links found (${ctaAnchors.length}):`);
    for (const a of ctaAnchors) {
      // Clean up for display
      const href = (a.match(/href="([^"]+)"/) || [])[1] || "";
      const text = a.replace(/<[^>]+>/g, "").trim();
      const isNav = a.includes("menu-link");
      console.log(`    ${isNav ? "[NAV]" : "[CTA]"} "${text}" → ${href}`);
    }

    // Check for Elementor sections after post content
    const postContentEnd = html.lastIndexOf("entry-content");
    if (postContentEnd > -1) {
      const afterContent = html.substring(postContentEnd);
      const elemSections = afterContent.match(/elementor-section|elementor-widget/g) || [];
      const afterButtons = afterContent.match(/elementor-button|wp-block-button|ast-button/g) || [];
      console.log(`\n  After entry-content:`);
      console.log(`    Elementor sections: ${elemSections.length}`);
      console.log(`    Button elements: ${afterButtons.length}`);

      // Look for any visible text that looks like a CTA
      const afterText = afterContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      const ctaPhrases = afterText.match(/(?:Attend|Join|Register|Apply|Free Meeting|Sign Up)[^.!?]{0,60}/gi) || [];
      if (ctaPhrases.length) {
        console.log(`    CTA phrases after content:`);
        for (const p of ctaPhrases) {
          console.log(`      "${p.trim()}"`);
        }
      } else {
        console.log(`    No CTA phrases found after content`);
      }
    }
  }
}

main().catch(console.error);
