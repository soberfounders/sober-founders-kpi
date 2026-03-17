#!/usr/bin/env node
/**
 * qa-phoenix-cta.mjs — QA verification of Phoenix CTA deployment
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
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { Authorization: `Basic ${auth}` };

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? " — " + detail : ""}`);
}

function strip(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&#8217;/g, "'").replace(/&amp;/g, "&").replace(/&#8211;/g, "-").replace(/&nbsp;/g, " ").trim();
}

async function main() {
  console.log("Phoenix CTA QA Verification\n" + "=".repeat(50) + "\n");

  // 1. Tag check
  console.log("--- 1. Tag exists ---");
  const tagRes = await fetch(`${SITE}/wp-json/wp/v2/tags?slug=phoenix-cta`, { headers });
  const tags = await tagRes.json();
  check("phoenix-cta tag exists", tags.length > 0, `ID: ${tags[0]?.id}`);
  const tagId = tags[0]?.id;

  // 2. Snippet check
  console.log("\n--- 2. Code Snippet #14 ---");
  const snipRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/14`, {
    headers: { ...headers, "Content-Type": "application/json" },
  });
  const snip = await snipRes.json();
  check("Snippet 14 active", snip.active === true);
  check("Snippet has has_tag check", snip.code.includes("has_tag('phoenix-cta')"));
  check("Snippet has phoenix-forum-registration URL", snip.code.includes("phoenix-forum-registration"));
  check("Snippet targets singular posts", snip.code.includes("is_singular('post')"));

  // 3. Post tagging
  console.log("\n--- 3. Post tagging ---");
  const allPosts = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `${SITE}/wp-json/wp/v2/posts?status=publish&per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) break;
    const posts = await res.json();
    if (!posts.length) break;
    allPosts.push(...posts);
  }

  const phoenixTagged = allPosts.filter((p) => p.tags.includes(tagId));
  const eventsDefault = allPosts.filter((p) => !p.tags.includes(tagId));

  check("Total posts found", allPosts.length > 0, `${allPosts.length} posts`);
  check("Phoenix-tagged count is 13", phoenixTagged.length === 13, `got ${phoenixTagged.length}`);
  check("Events default count is correct", eventsDefault.length === allPosts.length - 13, `got ${eventsDefault.length} of ${allPosts.length} total`);

  console.log("\n  Phoenix-tagged posts:");
  for (const p of phoenixTagged) {
    console.log(`    ${p.id} | ${strip(p.title.rendered).substring(0, 65)}`);
  }

  // 4. City pages should NOT have phoenix tag
  console.log("\n--- 4. City pages not phoenix-tagged ---");
  const CITY_IDS = new Set([4190, 4189, 4188, 4187, 4186, 4185, 4184, 4183, 4182, 4181]);
  const cityPhoenix = phoenixTagged.filter((p) => CITY_IDS.has(p.id));
  check("No city pages tagged phoenix", cityPhoenix.length === 0, `${cityPhoenix.length} mistagged`);

  // 5. Live page spot checks
  console.log("\n--- 5. Live page spot checks ---");

  // Pick specific posts to check
  const spotChecks = [
    // Phoenix posts (should have swap script)
    ...phoenixTagged.slice(0, 4).map((p) => ({
      slug: p.slug,
      expect: "phoenix",
      title: strip(p.title.rendered).substring(0, 40),
    })),
    // Events posts (should NOT have swap script)
    ...eventsDefault.slice(0, 3).map((p) => ({
      slug: p.slug,
      expect: "events",
      title: strip(p.title.rendered).substring(0, 40),
    })),
  ];

  for (const c of spotChecks) {
    const res = await fetch(`${SITE}/${c.slug}/?nocache=${Date.now()}`);
    const html = await res.text();
    // Check for the actual swap SCRIPT tag, not just the text (which may appear in post content)
    const hasSwapScript = html.includes("textContent = 'Apply to Phoenix Forum'");
    const hasElemBtn = html.includes("elementor-button-link");

    if (c.expect === "phoenix") {
      check(
        `Phoenix swap on "${c.title}..."`,
        hasSwapScript,
        `swap=${hasSwapScript}, elemBtn=${hasElemBtn}`
      );
    } else {
      check(
        `No swap on "${c.title}..."`,
        !hasSwapScript,
        `swap=${hasSwapScript}, elemBtn=${hasElemBtn}`
      );
    }
  }

  // 6. No duplicate appended CTAs in post content
  console.log("\n--- 6. No duplicate sf-blog-cta blocks ---");
  let dupes = 0;
  for (const p of allPosts) {
    const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${p.id}?context=edit`, { headers });
    const d = await res.json();
    const raw = d.content?.raw || "";
    if (raw.includes("sf-blog-cta")) {
      dupes++;
      console.log(`  DUPE in ${p.id}: ${strip(d.title?.raw || "").substring(0, 50)}`);
    }
  }
  check("No posts have appended sf-blog-cta blocks", dupes === 0, `${dupes} found`);

  // 7. Original Elementor template integrity
  console.log("\n--- 7. Elementor template integrity ---");
  const tmplRes = await fetch(
    `${SITE}/wp-json/wp/v2/elementor_library/3308?context=edit`,
    { headers: { ...headers, "Content-Type": "application/json" } }
  );
  const tmpl = await tmplRes.json();
  const eData = JSON.parse(tmpl.meta._elementor_data);
  const btn = eData[2]?.elements?.[0];
  check(
    "Template 3308 button text unchanged",
    btn?.settings?.text === "Check Out Our Free Online Events!",
    `"${btn?.settings?.text}"`
  );
  check(
    "Template 3308 button URL unchanged",
    btn?.settings?.link?.url === "https://soberfounders.org/events",
    btn?.settings?.link?.url
  );

  // 8. Phoenix template 4243 exists
  console.log("\n--- 8. Phoenix template 4243 ---");
  const ptRes = await fetch(
    `${SITE}/wp-json/wp/v2/elementor_library/4243?context=edit`,
    { headers: { ...headers, "Content-Type": "application/json" } }
  );
  const pt = await ptRes.json();
  check("Phoenix template exists", pt.id === 4243);
  check("Phoenix template status published", pt.status === "publish");
  const ptData = JSON.parse(pt.meta._elementor_data);
  const ptBtn = ptData[2]?.elements?.[0];
  check(
    "Phoenix template button text correct",
    ptBtn?.settings?.text === "Apply to Phoenix Forum",
    `"${ptBtn?.settings?.text}"`
  );
  check(
    "Phoenix template button URL correct",
    ptBtn?.settings?.link?.url === "https://soberfounders.org/phoenix-forum-registration/",
    ptBtn?.settings?.link?.url
  );

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`QA SUMMARY: ${pass} passed, ${fail} failed out of ${pass + fail} checks`);
  if (fail > 0) {
    console.log("\nFailed checks need attention!");
    process.exit(1);
  } else {
    console.log("\nAll checks passed!");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
