#!/usr/bin/env node
/**
 * qa-events-page.mjs — QA validation for /events/ page deployment
 *
 * Checks: content integrity, frame URLs, naming ("Business Mastermind"),
 * headshot URL, modal text, mobile fallback, CDN scripts, schema JSON-LD,
 * Elementor block structure, and HubSpot form embed.
 *
 * Usage:
 *   node scripts/qa-events-page.mjs [--live]
 *
 * Without --live: validates the deploy script's PAGE_CONTENT string locally.
 * With --live: fetches the live page from soberfounders.org/events/ and validates.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIVE = process.argv.includes("--live");

// ─── Helpers ──────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(label) {
  passCount++;
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}
function fail(label, detail) {
  failCount++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}`);
  if (detail) console.log(`    → ${detail}`);
}
function warn(label, detail) {
  warnCount++;
  console.log(`  \x1b[33m⚠\x1b[0m ${label}`);
  if (detail) console.log(`    → ${detail}`);
}

function check(condition, label, detail) {
  if (condition) pass(label);
  else fail(label, detail);
}

function checkNotPresent(html, pattern, label) {
  const regex = typeof pattern === "string" ? new RegExp(pattern, "gi") : pattern;
  const matches = html.match(regex);
  if (!matches) pass(label);
  else fail(label, `Found ${matches.length} match(es): ${matches.slice(0, 3).join(", ")}`);
}

// ─── Get HTML content ─────────────────────────────────────────────────
async function getContent() {
  if (LIVE) {
    console.log("\n  Fetching live page from soberfounders.org/events/ ...\n");
    const res = await fetch("https://soberfounders.org/events/");
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching live page`);
    return await res.text();
  } else {
    console.log("\n  Validating deploy script PAGE_CONTENT (local) ...\n");
    const script = readFileSync(resolve(ROOT, "scripts/deploy-events-page.mjs"), "utf8");
    // Extract PAGE_CONTENT between the backtick template literal
    const start = script.indexOf("const PAGE_CONTENT = `");
    if (start === -1) throw new Error("Could not find PAGE_CONTENT in deploy script");
    const contentStart = start + "const PAGE_CONTENT = `".length;
    // Find the closing backtick (the one followed by ;)
    let depth = 0;
    let i = contentStart;
    while (i < script.length) {
      if (script[i] === "$" && script[i + 1] === "{") {
        depth++;
        i += 2;
      } else if (depth > 0 && script[i] === "}") {
        depth--;
        i++;
      } else if (depth === 0 && script[i] === "`") {
        break;
      } else {
        i++;
      }
    }
    return script.slice(contentStart, i);
  }
}

// ─── QA Checks ────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  Events Page QA Validation");
  console.log(`  Mode: ${LIVE ? "LIVE (soberfounders.org)" : "LOCAL (deploy script)"}`);
  console.log(`${"═".repeat(60)}`);

  const html = await getContent();

  // ── 1. Elementor block structure ──
  console.log("\n  ─── Elementor Block Structure ───");
  if (LIVE) {
    // WordPress strips <!-- wp:html --> comments when rendering — check for multiple
    // sf-ev root divs instead (each block wraps content in .sf-ev)
    const sfEvRoots = (html.match(/<div class="sf-ev">/g) || []).length;
    check(sfEvRoots >= 4, `Has ${sfEvRoots} .sf-ev root containers (expect ≥4, WP strips block comments)`, `Found ${sfEvRoots}`);
  } else {
    const wpHtmlOpens = (html.match(/<!-- wp:html -->/g) || []).length;
    const wpHtmlCloses = (html.match(/<!-- \/wp:html -->/g) || []).length;
    check(wpHtmlOpens >= 7, `Has ${wpHtmlOpens} <!-- wp:html --> blocks (expect 7-8)`, `Found ${wpHtmlOpens}`);
    check(wpHtmlOpens === wpHtmlCloses, `Open/close block count matches (${wpHtmlOpens}/${wpHtmlCloses})`, `Mismatch: ${wpHtmlOpens} opens vs ${wpHtmlCloses} closes`);
  }

  // ── 2. "Business Mastermind" naming ──
  console.log("\n  ─── Naming: Business Mastermind ───");
  // All visible occurrences of "Mastermind" should be "Business Mastermind"
  // Exceptions: "All Our Affairs" tier name, schema description context
  const bareMastermindRegex = /(?<!Business\s)(?<!Weekly\s)Mastermind(?!\s*Sessions|.*Affairs)/gi;
  const allMasterminds = html.match(/Business Mastermind/gi) || [];
  check(allMasterminds.length >= 3, `"Business Mastermind" appears ${allMasterminds.length} times (expect ≥3)`, "Missing 'Business Mastermind' references");

  // Check heading specifically
  check(html.includes("Business Masterminds for"), "Hero heading says 'Business Masterminds for'", "Hero heading missing");
  check(html.includes("Thursday Business Mastermind"), "Thursday tier says 'Thursday Business Mastermind'", "Missing in Thursday tier");
  check(html.includes("Tuesday Business Mastermind") || html.includes('Tuesday Business Mastermind'), "Tuesday modal says 'Apply for Tuesday Business Mastermind'", "Missing in Tuesday modal");

  // ── 3. Headshot URL ──
  console.log("\n  ─── Headshot URL ───");
  const headshotPath = "soberfounders.org/wp-content/uploads/2026/03/andrew-lassise-headshot.jpg";
  const correctHeadshot = "http://" + headshotPath;
  if (LIVE) {
    // WordPress may rewrite http:// to https:// when rendering — accept either
    check(html.includes(headshotPath), `Headshot URL contains correct path`, `Expected path: ${headshotPath}`);
  } else {
    check(html.includes(correctHeadshot), `Headshot URL is correct (http:// as specified by user)`, `Expected: ${correctHeadshot}`);
  }

  // ── 4. Founder quote ──
  console.log("\n  ─── Founder Quote ───");
  check(html.includes("Andrew Lassise"), "Andrew Lassise name present");
  check(html.includes("business masterminds didn") || html.includes("business masterminds didn&rsquo;t"), "Quote text about masterminds present");
  check(html.includes("12") && (html.includes("step") || html.includes("ndash;step")), "Quote references 12-step");
  check(html.includes("experience, strength, and hope") || html.includes("experience, strength, and hope"), "Quote includes 'experience, strength, and hope'");

  // ── 5. Modal text ──
  console.log("\n  ─── Modal Text ───");
  const modalText = "Fill out this form and you";
  check(html.includes(modalText), "Modal has correct text: 'Fill out this form and you'll...'", "Modal text not found");
  check(html.includes("schedule a quick Zoom call") || html.includes("schedule a quick Zoom call"), "Modal mentions 'schedule a quick Zoom call'");
  // Make sure old text is gone
  checkNotPresent(html, /Fill out a quick application/i, "Old modal text 'Fill out a quick application' is removed");

  // ── 6. Frame animation infrastructure ──
  console.log("\n  ─── Frame Animation ───");
  check(html.includes("sf-scroll-canvas"), "Canvas element (#sf-scroll-canvas) present");
  check(html.includes("sf-scroll-overlay"), "Overlay element (#sf-scroll-overlay) present");
  check(html.includes("FRAME_COUNT = 122") || html.includes("FRAME_COUNT=122"), "FRAME_COUNT = 122");
  check(html.includes("frame_") && html.includes("-1.jpg"), "Frame URL pattern includes '-1.jpg' suffix (WP media naming)");
  check(html.includes("wp-content/uploads/2026/03/frame_"), "Frame base URL points to WP uploads");
  check(html.includes("drawFrame"), "drawFrame function present");
  check(html.includes("onAllLoaded"), "onAllLoaded callback present");
  check(html.includes("scrub") && html.includes("0.5"), "ScrollTrigger scrub: 0.5 configured");

  // ── 7. CDN scripts ──
  console.log("\n  ─── CDN Scripts ───");
  check(html.includes("lenis@1.1.18") || html.includes("lenis@"), "Lenis CDN script loaded");
  check(html.includes("gsap@3.12") || html.includes("gsap@"), "GSAP CDN script loaded");
  check(html.includes("ScrollTrigger.min.js") || html.includes("ScrollTrigger"), "GSAP ScrollTrigger plugin loaded");
  check(html.includes("new Lenis"), "Lenis instantiated");
  check(html.includes("gsap.registerPlugin(ScrollTrigger)") || html.includes("gsap.registerPlugin"), "GSAP ScrollTrigger registered");

  // ── 8. Motion blur + overlay dimming ──
  console.log("\n  ─── Motion Blur & Overlay ───");
  check(html.includes("getVelocity"), "Velocity-based motion blur present");
  check(html.includes("blur(") || html.includes("blur("), "CSS blur filter applied");
  check(html.includes("rgba(10,10,10,"), "Overlay dimming with rgba(10,10,10,...) present");

  // ── 9. Mobile fallback ──
  console.log("\n  ─── Mobile ───");
  check(html.includes("sf-ev-mobile-bg"), "Mobile fallback background class present");
  check(html.includes("phoenix-static.jpg"), "Mobile static phoenix image referenced");
  check(html.includes("max-width: 767px") || html.includes("max-width:767px"), "Mobile breakpoint at 767px");
  check(html.includes("window.innerWidth < 768"), "JS mobile check at 768px");

  // ── 10. Schema JSON-LD ──
  console.log("\n  ─── Schema JSON-LD ───");
  check(html.includes('type="application/ld+json"'), "JSON-LD script tag present");
  check(html.includes('"EventSeries"'), "EventSeries schema type");
  check(html.includes('"Event"'), "Event schema type");
  check(html.includes("Sober Founders Inc."), "Organizer: Sober Founders Inc.");
  check(html.includes('"isAccessibleForFree": true') || html.includes('"isAccessibleForFree":true'), "isAccessibleForFree: true");
  // Validate JSON-LD parseable
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ldMatch) {
    try {
      const schema = JSON.parse(ldMatch[1]);
      pass("Schema JSON-LD parses as valid JSON");
      const types = Array.isArray(schema) ? schema.map((s) => s["@type"]) : [schema["@type"]];
      check(types.includes("EventSeries"), "Schema includes EventSeries");
      check(types.filter((t) => t === "Event").length >= 2, `Schema includes ${types.filter((t) => t === "Event").length} Event entries (expect ≥2)`);
    } catch (e) {
      fail("Schema JSON-LD parses as valid JSON", e.message);
    }
  } else {
    fail("Could not extract JSON-LD block for parsing");
  }

  // ── 11. HubSpot form ──
  console.log("\n  ─── HubSpot Form ───");
  check(html.includes("hsforms.net") || html.includes("hbspt.forms.create"), "HubSpot forms script loaded");
  check(html.includes("45070276"), "HubSpot portal ID: 45070276");
  check(html.includes("c5d12c41-5cf8-40a3-b559-810375c6fd99"), "HubSpot form ID present");
  check(html.includes("sf-hs-form"), "HubSpot form target container (#sf-hs-form)");

  // ── 12. CRO content sections ──
  console.log("\n  ─── CRO Content ───");
  check(html.includes("Entrepreneurs in Recovery"), "Hero: 'Entrepreneurs in Recovery'");
  check(html.includes("don't have to figure it out alone") || html.includes("don&rsquo;t have to figure it out alone"), "'You don't have to figure it out alone' messaging");
  check(html.includes("Three Ways to Get Involved"), "Tier heading: 'Three Ways to Get Involved'");
  check(html.includes("What Happens in a Session"), "Session section: 'What Happens in a Session'");
  check(html.includes("Hot Seat"), "Hot Seat step present");
  check(html.includes("Pay It Forward"), "Pay It Forward step present");
  check(html.includes("Quick Intros"), "Quick Intros step present");

  // ── 13. Tier details ──
  console.log("\n  ─── Tier Details ───");
  check(html.includes("Thursday") && html.includes("11:00 AM ET"), "Thursday tier: 11:00 AM ET");
  check(html.includes("Tuesday") && html.includes("12:00 PM ET"), "Tuesday tier: 12:00 PM ET");
  check(html.includes("Phoenix Forum"), "Phoenix Forum tier present");
  check(html.includes("$250K"), "Tuesday tier: $250K revenue requirement");
  check(html.includes("$1M"), "Phoenix Forum: $1M revenue requirement");
  check(html.includes("MOST POPULAR"), "Thursday tier: 'MOST POPULAR' badge (CSS)");

  // ── 14. Links ──
  console.log("\n  ─── Links ───");
  check(html.includes('href="#sf-calendar"'), "CTA links to #sf-calendar");
  check(html.includes('href="#sf-how-it-works"'), "CTA links to #sf-how-it-works");
  check(html.includes("/phoenix-forum-2nd-group/") || html.includes("/phoenix-forum-registration/"), "Phoenix Forum link present");
  check(html.includes("chat.whatsapp.com"), "WhatsApp community link present");
  check(html.includes("lu.ma/embed"), "Luma calendar embed present");

  // ── 15. CSS / design system ──
  console.log("\n  ─── CSS & Design ───");
  check(html.includes("DM Serif Display"), "DM Serif Display font loaded");
  check(html.includes("Outfit"), "Outfit font loaded");
  check(html.includes("#5eecc0"), "Accent color #5eecc0 present");
  check(html.includes("#00b286"), "Primary CTA color #00b286 present");
  check(html.includes("backdrop-filter"), "Glassmorphism backdrop-filter used");
  check(html.includes("elementor_canvas") || !LIVE, LIVE ? "Elementor canvas template active" : "Template set in deploy script (check separately)");

  // ── 16. Luma calendar ──
  console.log("\n  ─── Luma Calendar ───");
  check(html.includes("lu.ma/embed/calendar/cal-rU4i5G8WMp8lWrH"), "Correct Luma calendar ID embedded");

  // ── 17. No stale/wrong content ──
  console.log("\n  ─── Stale Content Check ───");
  checkNotPresent(html, /Fill out a quick application/i, "No old modal text");
  checkNotPresent(html, /verification call/i, "No 'verification call' (should be 'Zoom call')");

  // ── 18. Frame URL spot check ──
  if (LIVE) {
    console.log("\n  ─── Frame URL Spot Check (live) ───");
    const framesToCheck = [1, 61, 122];
    for (const frameNum of framesToCheck) {
      const padded = String(frameNum).padStart(3, "0");
      const url = `https://soberfounders.org/wp-content/uploads/2026/03/frame_${padded}-1.jpg`;
      try {
        const res = await fetch(url, { method: "HEAD" });
        check(res.ok, `Frame ${padded} loads (${res.status})`, `HTTP ${res.status}`);
      } catch (e) {
        fail(`Frame ${padded} loads`, e.message);
      }
    }

    // Check mobile fallback image
    try {
      const res = await fetch("https://soberfounders.org/wp-content/uploads/2026/03/phoenix-static.jpg", { method: "HEAD" });
      check(res.ok, `phoenix-static.jpg loads (${res.status})`, `HTTP ${res.status}`);
    } catch (e) {
      fail("phoenix-static.jpg loads", e.message);
    }

    // Check headshot
    try {
      const res = await fetch(correctHeadshot, { method: "HEAD", redirect: "follow" });
      check(res.ok, `Headshot image loads (${res.status})`, `HTTP ${res.status}`);
    } catch (e) {
      fail("Headshot image loads", e.message);
    }
  }

  // ── Summary ──
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Results: \x1b[32m${passCount} passed\x1b[0m, \x1b[31m${failCount} failed\x1b[0m, \x1b[33m${warnCount} warnings\x1b[0m`);
  console.log(`${"═".repeat(60)}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("QA script error:", err.message);
  process.exit(1);
});
