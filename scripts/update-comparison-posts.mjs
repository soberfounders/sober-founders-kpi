#!/usr/bin/env node
/**
 * Append Phoenix Forum CTA + internal links to comparison blog posts.
 * Uses raw Gutenberg content (context=edit) to preserve block markup.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLines = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8").split("\n");
const env = {};
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)\s*[=\-]\s*(.+)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SITE = env.WP_SITE_URL;
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };

// Comparison posts to update
const comparisonPosts = [
  { id: 3032, competitor: "YPO", slug: "ypo-for-sober-founders" },
  { id: 3006, competitor: "EO", slug: "entrepreneurs-organization-eo-for-sober-business-owners" },
  { id: 3014, competitor: "Vistage", slug: "vistage-for-sober-business-owners" },
  { id: 3017, competitor: "Tiger 21", slug: "tiger-21-for-sober-business-owners" },
];

function buildCTABlock(competitor) {
  // Gutenberg-compatible HTML block with Phoenix Forum CTA
  return `

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Looking for a Peer Group Built for Recovery?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>${competitor} is an excellent organization for the founders it was designed for. But if you're in recovery and want a peer group where sobriety is the shared foundation — not a personal detail you manage privately — the <a href="/phoenix-forum-2nd-group/">Phoenix Forum</a> was built for you.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>Phoenix Forum highlights:</strong></p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list">
<li>Weekly sessions (Tuesday + Thursday) — not monthly</li>
<li>$1M+ revenue requirement ensures peers at your level</li>
<li>Sobriety is a membership prerequisite and competitive advantage</li>
<li>Operated by <a href="/our-story/">Sober Founders</a>, a 501(c)(3) nonprofit</li>
<li>500+ active members across the broader community</li>
</ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>Not ready for the Phoenix Forum? Our <a href="/weekly-mastermind-group/">free weekly sessions</a> are open to all sober entrepreneurs — no revenue minimum required.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
<!-- wp:button {"backgroundColor":"black"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-black-background-color has-background wp-element-button" href="/phoenix-forum-2nd-group/">Learn About the Phoenix Forum</a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="/apply/">Apply for Membership</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Related Reading</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><a href="/resources/faq/">Sober Founders FAQ</a> — Common questions answered</li>
<li><a href="/peer-advisory-sober-entrepreneurs/">Why Peer Advisory Groups Matter for Sober Entrepreneurs</a></li>
<li><a href="/peer-group-sober-entrepreneurs/">Best Peer Group for Sober Entrepreneurs</a></li>
<li><a href="/the-ultimate-guide-to-entrepreneurship-in-recovery-everything-you-need-to-succeed-in-2026/">Ultimate Guide to Entrepreneurship in Recovery</a></li>
</ul>
<!-- /wp:list -->`;
}

async function main() {
  console.log(`Updating ${comparisonPosts.length} comparison posts with Phoenix Forum CTA...\n`);

  for (const post of comparisonPosts) {
    // Get raw content
    const res = await fetch(`${SITE}/wp-json/wp/v2/posts/${post.id}?context=edit&_fields=content`, { headers });
    const data = await res.json();
    const raw = data.content?.raw || "";

    if (!raw.includes("<!-- wp:")) {
      console.log(`SKIP ${post.id} (${post.competitor}) — no Gutenberg blocks found`);
      continue;
    }

    if (raw.includes("phoenix-forum")) {
      console.log(`SKIP ${post.id} (${post.competitor}) — already has Phoenix Forum link`);
      continue;
    }

    const newContent = raw + buildCTABlock(post.competitor);

    const updateRes = await fetch(`${SITE}/wp-json/wp/v2/posts/${post.id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: newContent }),
    });

    if (updateRes.ok) {
      console.log(`OK   ${post.id} | ${post.competitor} — CTA + internal links appended`);
    } else {
      const err = await updateRes.text();
      console.log(`FAIL ${post.id} | ${post.competitor} — ${updateRes.status}: ${err.substring(0, 100)}`);
    }
  }

  // Verify
  console.log("\nVerifying Phoenix Forum links...");
  for (const post of comparisonPosts) {
    const page = await fetch(`${SITE}/${post.slug}/`).then(r => r.text());
    const hasPF = page.includes("phoenix-forum");
    const hasApply = page.includes("/apply/");
    console.log(`  ${post.competitor}: Phoenix Forum link=${hasPF}, Apply CTA=${hasApply}`);
  }
}

main().catch(console.error);
