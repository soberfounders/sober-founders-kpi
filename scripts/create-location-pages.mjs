#!/usr/bin/env node
/**
 * Create programmatic SEO landing pages for locations and personas.
 * These target long-tail searches like "sober founders in New York" or
 * "entrepreneurs in recovery in tech".
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

// Top metro areas with high entrepreneur + recovery populations
const locations = [
  { city: "New York", state: "NY", slug: "new-york" },
  { city: "Los Angeles", state: "CA", slug: "los-angeles" },
  { city: "Miami", state: "FL", slug: "miami" },
  { city: "Austin", state: "TX", slug: "austin" },
  { city: "Nashville", state: "TN", slug: "nashville" },
  { city: "Denver", state: "CO", slug: "denver" },
  { city: "Chicago", state: "IL", slug: "chicago" },
  { city: "San Francisco", state: "CA", slug: "san-francisco" },
  { city: "Dallas", state: "TX", slug: "dallas" },
  { city: "Atlanta", state: "GA", slug: "atlanta" },
];

function buildLocationPage(loc) {
  const content = `<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading">Sober Founders in ${loc.city}, ${loc.state}</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Sober Founders connects entrepreneurs in recovery in ${loc.city} and across the country through free weekly virtual mastermind sessions. Whether you're building a startup in ${loc.city} or running an established business, our community gives you the peer accountability and honest business conversations that only happen when everyone in the room shares the foundation of sobriety.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">What Sober Founders Offers in ${loc.city}</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Sober Founders is a 501(c)(3) nonprofit with 500+ members nationwide. All sessions are virtual, so ${loc.city}-based founders get the same access as members anywhere:</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><strong>Tuesday — "All Our Affairs":</strong> Business mastermind for entrepreneurs with $250k+ revenue, 1+ year sobriety, and 2+ employees. Free.</li>
<li><strong>Thursday — "Business Mastermind":</strong> Open to all sober entrepreneurs who own a business. No revenue minimum. Free.</li>
<li><strong><a href="/phoenix-forum-2nd-group/">Phoenix Forum:</a></strong> Exclusive weekly peer group for founders with $1M+ revenue and 1+ year of sobriety.</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Why ${loc.city} Founders Choose Sober Founders</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>${loc.city} has one of the most competitive entrepreneurial ecosystems in the country. For founders in recovery, that competitive pressure can be both a motivator and a risk factor. Research shows that entrepreneurs are 30% more likely to experience substance use disorders than the general workforce (Freeman et al., 2015, <em>Journal of Clinical Psychology</em>).</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Sober Founders gives ${loc.city} entrepreneurs a peer group where sobriety isn't something to manage or explain — it's the shared foundation. Members report that removing the "code-switching" they experience in mainstream business groups allows for deeper, more productive conversations about revenue, hiring, leadership, and growth.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">How to Join from ${loc.city}</h2>
<!-- /wp:heading -->

<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list">
<li><strong><a href="/apply/">Apply for membership</a></strong> — takes less than 5 minutes</li>
<li><strong>Attend a free session</strong> — Tuesday or Thursday, virtual via Zoom</li>
<li><strong>Connect with peers</strong> — meet founders who understand both business and recovery</li>
</ol>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>There is no cost to join the general community. Sober Founders is funded by donations and operates as a registered 501(c)(3) nonprofit.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">What Members Say</h2>
<!-- /wp:heading -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><p>"Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!"</p><cite>— Adam C.</cite></blockquote>
<!-- /wp:quote -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><p>"This group has been one of the most impactful things I've ever been part of."</p><cite>— Josh C.</cite></blockquote>
<!-- /wp:quote -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><p>"I love that it combines two of my biggest passions, business and recovery."</p><cite>— Matt S.</cite></blockquote>
<!-- /wp:quote -->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Frequently Asked Questions</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Are there in-person meetings in ${loc.city}?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Sober Founders sessions are currently virtual, held via Zoom every Tuesday and Thursday. This makes the community accessible to founders in ${loc.city} and everywhere else. As the community grows, in-person events may be organized in major metro areas including ${loc.city}.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Is Sober Founders free to join?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Yes. The general community and weekly sessions are completely free. Sober Founders is a 501(c)(3) nonprofit. The Phoenix Forum premium membership has its own application and pricing — <a href="/phoenix-forum-2nd-group/">learn more here</a>.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Do I need to live in ${loc.city} to join?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>No. Sober Founders is a national community. Sessions are virtual. You can participate from ${loc.city}, ${loc.state}, or anywhere in the world.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
<!-- wp:button {"backgroundColor":"black"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-black-background-color has-background wp-element-button" href="/apply/">Join Sober Founders — Free</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Related</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><a href="/resources/faq/">Sober Founders FAQ</a></li>
<li><a href="/phoenix-forum-2nd-group/">Phoenix Forum — Premium Peer Group</a></li>
<li><a href="/weekly-mastermind-group/">Free Weekly Mastermind Sessions</a></li>
<li><a href="/our-story/">Our Story</a></li>
</ul>
<!-- /wp:list -->`;

  return {
    title: `Sober Founders in ${loc.city}, ${loc.state} — Entrepreneurs in Recovery`,
    slug: `sober-founders-${loc.slug}`,
    content,
    yoastTitle: `Sober Founders in ${loc.city} — Free Mastermind for Sober Entrepreneurs`,
    yoastDesc: `Connect with sober entrepreneurs in ${loc.city}. Free weekly virtual masterminds, peer accountability, and the Phoenix Forum for $1M+ revenue founders. Join free.`,
  };
}

async function main() {
  console.log(`Creating ${locations.length} location landing pages...\n`);

  let created = 0;
  let skipped = 0;

  for (const loc of locations) {
    const page = buildLocationPage(loc);

    // Check if page already exists
    const existing = await fetch(`${SITE}/wp-json/wp/v2/posts?slug=${page.slug}&status=publish,draft`, { headers }).then(r => r.json());

    if (existing.length > 0) {
      console.log(`SKIP ${page.slug} — already exists (ID ${existing[0].id})`);
      skipped++;
      continue;
    }

    const res = await fetch(`${SITE}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: page.title,
        slug: page.slug,
        content: page.content,
        status: "publish",
        meta: {
          _yoast_wpseo_title: page.yoastTitle,
          _yoast_wpseo_metadesc: page.yoastDesc,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`OK   ${page.slug} (ID ${data.id})`);
      created++;
    } else {
      const err = await res.text();
      console.log(`FAIL ${page.slug} — ${res.status}: ${err.substring(0, 100)}`);
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped`);

  // Verify a couple
  console.log("\nVerifying...");
  for (const loc of locations.slice(0, 3)) {
    const slug = `sober-founders-${loc.slug}`;
    const status = await fetch(`${SITE}/${slug}/`, { redirect: "manual" }).then(r => r.status);
    console.log(`  ${slug}: HTTP ${status}`);
  }
}

main().catch(console.error);
