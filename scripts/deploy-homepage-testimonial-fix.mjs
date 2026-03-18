#!/usr/bin/env node
/**
 * deploy-homepage-testimonial-fix.mjs
 *
 * Temporary homepage render fix for the production WordPress homepage, which is
 * still serving older Elementor-rendered markup. Replaces the live testimonial
 * HTML and restores the homepage stat/benefit icons so production stays
 * aligned with the current source content.
 *
 * Usage:
 *   node scripts/deploy-homepage-testimonial-fix.mjs [--dry-run]
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
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString(
  "base64",
);
const DRY_RUN = process.argv.includes("--dry-run");

const headers = {
  "Content-Type": "application/json",
  Authorization: `Basic ${AUTH}`,
};

const SNIPPET_NAME = "SF Homepage Testimonial Render Fix v2";
const LEGACY_SNIPPET_NAMES = ["SF Homepage Testimonial Render Fix"];

const phpCode = `
function sf_homepage_testimonial_render_fix_v2( $html ) {
    if ( strpos( $html, 'What Our Members Say' ) === false ) {
        return $html;
    }

    $icon_style = <<<'HTML'
<style id="sf-homepage-icon-glyphs">
.sf-stat-icon,
.sf-benefit-icon {
    overflow: hidden !important;
}
.sf-stat-icon {
    background:
        radial-gradient(circle at 30% 28%, rgba(94,236,192,0.16), transparent 36%),
        linear-gradient(145deg, rgba(7,61,48,0.98) 0%, rgba(3,34,27,0.98) 100%) !important;
    border: 1px solid rgba(94,236,192,0.16) !important;
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.05),
        0 16px 28px rgba(0,0,0,0.18) !important;
}
.sf-benefit-icon {
    background:
        radial-gradient(circle at 30% 28%, rgba(94,236,192,0.18), transparent 38%),
        linear-gradient(145deg, rgba(6,69,54,0.98) 0%, rgba(2,41,33,0.98) 100%) !important;
    border: 1px solid rgba(94,236,192,0.2) !important;
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.06),
        0 18px 32px rgba(0,0,0,0.22) !important;
}
.sf-icon-glyph {
    display: block;
    width: 24px;
    height: 24px;
    background: #5eecc0;
    -webkit-mask-image: var(--sf-icon-mask);
    mask-image: var(--sf-icon-mask);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-size: contain;
    mask-size: contain;
    filter: drop-shadow(0 0 10px rgba(94,236,192,0.08));
}
.sf-benefit-icon .sf-icon-glyph {
    width: 26px;
    height: 26px;
}
.sf-icon-glyph--people { --sf-icon-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20640%20512%27%3E%3Cpath%20d%3D%27M144%200a80%2080%200%201%201%200%20160A80%2080%200%201%201%20144%200zM512%200a80%2080%200%201%201%200%20160A80%2080%200%201%201%20512%200zM0%20298.7C0%20239.8%2047.8%20192%20106.7%20192h42.7c15.9%200%2031%203.5%2044.6%209.7c-1.3%207.2-1.9%2014.7-1.9%2022.3c0%2038.2%2016.8%2072.5%2043.3%2096H21.3C9.6%20320%200%20310.4%200%20298.7zM405.3%20320H235.4c26.5-23.5%2043.3-57.8%2043.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3%2028.7-9.7%2044.6-9.7h42.7C423.2%20192%20471%20239.8%20471%20298.7c0%2011.8-9.6%2021.3-21.3%2021.3h-44.3zM320%20256a96%2096%200%201%200%200-192%2096%2096%200%201%200%200%20192zm-94.8%2032c-47%200-87.9%2026.2-108.8%2064.8C100.2%20378.7%2092.9%20400.8%2086.5%20432H553.5c-6.4-31.2-13.7-53.3-29.9-79.2C502.7%20314.2%20461.8%20288%20414.8%20288H225.2z%27%2F%3E%3C%2Fsvg%3E"); }
.sf-icon-glyph--money { --sf-icon-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20576%20512%27%3E%3Cpath%20d%3D%27M64%2064C28.7%2064%200%2092.7%200%20128V384c0%2035.3%2028.7%2064%2064%2064H512c35.3%200%2064-28.7%2064-64V128c0-35.3-28.7-64-64-64H64zm64%20160c-8.8%200-16-7.2-16-16s7.2-16%2016-16h16c44.2%200%2080%2035.8%2080%2080v16c0%208.8-7.2%2016-16%2016s-16-7.2-16-16V272c0-26.5-21.5-48-48-48H128zm224-16c0-8.8%207.2-16%2016-16h16c26.5%200%2048%2021.5%2048%2048v16c0%208.8-7.2%2016-16%2016s-16-7.2-16-16V256c0-8.8-7.2-16-16-16H368c-8.8%200-16-7.2-16-16zm-160%2032a64%2064%200%201%201%20128%200%2064%2064%200%201%201-128%200zM288%20160a80%2080%200%201%201%200%20160%2080%2080%200%201%201%200-160z%27%2F%3E%3C%2Fsvg%3E"); }
.sf-icon-glyph--growth { --sf-icon-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20512%20512%27%3E%3Cpath%20d%3D%27M470.7%209.4c3%203.1%205.3%206.6%206.9%2010.3s2.4%207.8%202.4%2012.2V128c0%2017.7-14.3%2032-32%2032s-32-14.3-32-32V109.3L310.6%20214.6c-12.5%2012.5-32.8%2012.5-45.3%200L192%20141.3%2054.6%20278.6c-12.5%2012.5-32.8%2012.5-45.3%200s-12.5-32.8%200-45.3l160-160c12.5-12.5%2032.8-12.5%2045.3%200L288%20146.7%20383.4%2051.3H352c-17.7%200-32-14.3-32-32s14.3-32%2032-32h96c8.8%200%2016.8%203.6%2022.6%209.3l.1%20.1z%27%2F%3E%3C%2Fsvg%3E"); }
.sf-icon-glyph--heart { --sf-icon-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20512%20512%27%3E%3Cpath%20d%3D%27M47.6%20300.4L228.3%20469.1c7.5%207%2017.4%2010.9%2027.7%2010.9s20.2-3.9%2027.7-10.9L464.4%20300.4c30.4-28.3%2047.6-68%2047.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347%2036.5%20300.6%2051.4%20268%2084L256%2096%20244%2084c-32.6-32.6-79-47.5-124.6-39.9C50.5%2055.6%200%20115.2%200%20185.1v5.8c0%2041.5%2017.2%2081.2%2047.6%20109.5z%27%2F%3E%3C%2Fsvg%3E"); }
.sf-icon-glyph--calendar { --sf-icon-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20448%20512%27%3E%3Cpath%20d%3D%27M152%2024c0-13.3-10.7-24-24-24s-24%2010.7-24%2024V64H64C28.7%2064%200%2092.7%200%20128v16%2048V448c0%2035.3%2028.7%2064%2064%2064H384c35.3%200%2064-28.7%2064-64V192%20144%20128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24%2010.7-24%2024V64H152V24zM48%20192H400V448c0%208.8-7.2%2016-16%2016H64c-8.8%200-16-7.2-16-16V192z%27%2F%3E%3C%2Fsvg%3E"); }
.sf-icon-glyph--check { --sf-icon-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20512%20512%27%3E%3Cpath%20d%3D%27M256%2048a208%20208%200%201%201%200%20416%20208%20208%200%201%201%200-416zm0%20464A256%20256%200%201%200%20256%200a256%20256%200%201%200%200%20512zM369%20209c9.4-9.4%209.4-24.6%200-33.9s-24.6-9.4-33.9%200l-111%20111-47-47c-9.4-9.4-24.6-9.4-33.9%200s-9.4%2024.6%200%2033.9l64%2064c9.4%209.4%2024.6%209.4%2033.9%200L369%20209z%27%2F%3E%3C%2Fsvg%3E"); }
</style>
HTML;

    if ( strpos( $html, 'sf-homepage-icon-glyphs' ) === false && strpos( $html, '</head>' ) !== false ) {
        $html = str_replace( '</head>', $icon_style . "\n</head>", $html );
    }

    $stat_icons = array(
        '<div class="sf-stat-icon"><span class="sf-icon-glyph sf-icon-glyph--people" aria-hidden="true"></span></div>',
        '<div class="sf-stat-icon"><span class="sf-icon-glyph sf-icon-glyph--money" aria-hidden="true"></span></div>',
        '<div class="sf-stat-icon"><span class="sf-icon-glyph sf-icon-glyph--growth" aria-hidden="true"></span></div>',
        '<div class="sf-stat-icon"><span class="sf-icon-glyph sf-icon-glyph--heart" aria-hidden="true"></span></div>',
        '<div class="sf-stat-icon"><span class="sf-icon-glyph sf-icon-glyph--calendar" aria-hidden="true"></span></div>',
        '<div class="sf-stat-icon"><span class="sf-icon-glyph sf-icon-glyph--check" aria-hidden="true"></span></div>',
    );
    $stat_index = 0;
    $html = preg_replace_callback(
        '#<div class="sf-stat-icon">.*?</div>#s',
        static function ( $matches ) use ( $stat_icons, &$stat_index ) {
            $replacement = $stat_icons[ $stat_index ] ?? $matches[0];
            $stat_index++;
            return $replacement;
        },
        $html,
        count( $stat_icons )
    );

    $benefit_icons = array(
        '<div class="sf-benefit-icon"><span class="sf-icon-glyph sf-icon-glyph--people" aria-hidden="true"></span></div>',
        '<div class="sf-benefit-icon"><span class="sf-icon-glyph sf-icon-glyph--check" aria-hidden="true"></span></div>',
        '<div class="sf-benefit-icon"><span class="sf-icon-glyph sf-icon-glyph--growth" aria-hidden="true"></span></div>',
    );
    $benefit_index = 0;
    $html = preg_replace_callback(
        '#<div class="sf-benefit-icon">.*?</div>#s',
        static function ( $matches ) use ( $benefit_icons, &$benefit_index ) {
            $replacement = $benefit_icons[ $benefit_index ] ?? $matches[0];
            $benefit_index++;
            return $replacement;
        },
        $html,
        count( $benefit_icons )
    );

    $pattern = '#<div class="sf-testimonials-grid">.*?</div>\\s*</div>\\s*</div>\\s*<!-- Benefits -->#s';
    $replacement = <<<'HTML'
<div class="sf-testimonials-grid">
  <div class="sf-testimonial-card">
    <blockquote>"Sober Founders helped me grow from $36k MRR to $120k MRR and helped me get 1 year sober for the first time in my life."</blockquote>
    <cite>Adam C.<span>Sober Founders Member</span></cite>
  </div>
  <div class="sf-testimonial-card">
    <blockquote>"Every morning I wake up energized and ready to take on the world, substance free. My business is growing, my relationships are better, and Sober Founders played a big role in shifting how I viewed things."</blockquote>
    <cite>Josh C.<span>Sober Founders Member</span></cite>
  </div>
  <div class="sf-testimonial-card">
    <blockquote>"I love that it combines two of my biggest passions, business and recovery."</blockquote>
    <cite>Matt S.<span>Sober Founders Member</span></cite>
  </div>
  <div class="sf-testimonial-card">
    <blockquote>"I cannot recommend Sober Founders enough. I want to shout from the rooftops about how much this group has impacted my life. One profound enlightenment after another. It's totally divinely inspired. I have truly found a home."</blockquote>
    <cite>Joe G.<span>Sober Founders Member</span></cite>
  </div>
</div>
</div>
</div>
<!-- Benefits -->
HTML;

    $html = preg_replace_callback(
        $pattern,
        static function () use ( $replacement ) {
            return $replacement;
        },
        $html,
        1
    );

    if ( strpos( $html, 'grid-template-columns: repeat(3, 1fr);' ) !== false ) {
        $html = str_replace(
            'grid-template-columns: repeat(3, 1fr);',
            'grid-template-columns: repeat(2, 1fr);',
            $html
        );
    }

    return $html;
}

add_action( 'template_redirect', function () {
    if ( ! is_front_page() ) {
        return;
    }

    ob_start( 'sf_homepage_testimonial_render_fix_v2' );
}, 0 );
`.trim();

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Homepage Testimonial Render Fix");
  console.log(`  Target: ${SITE}/`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("  [DRY RUN] Would create or update the homepage testimonial fix snippet.");
    console.log(`  PHP code length: ${phpCode.length} chars\n`);
    return;
  }

  const listRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    headers,
  });
  if (!listRes.ok) {
    throw new Error(`Failed to list snippets: ${listRes.status} ${listRes.statusText}`);
  }

  const snippets = await listRes.json();
  const existing = snippets.find((snippet) => snippet.name === SNIPPET_NAME);
  const legacySnippets = snippets.filter((snippet) =>
    LEGACY_SNIPPET_NAMES.includes(snippet.name),
  );

  for (const snippet of legacySnippets) {
    if (!snippet.active) continue;
    const deactivateRes = await fetch(
      `${SITE}/wp-json/code-snippets/v1/snippets/${snippet.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: snippet.name,
          code: snippet.code,
          active: false,
          scope: snippet.scope ?? "global",
          priority: snippet.priority ?? 10,
        }),
      },
    );
    if (!deactivateRes.ok) {
      const body = await deactivateRes.text();
      throw new Error(`Failed to deactivate legacy snippet ${snippet.id}: ${body}`);
    }
    console.log(`  ✓ Legacy snippet ${snippet.id} deactivated`);
  }

  let res;
  if (existing) {
    res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${existing.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        name: SNIPPET_NAME,
        code: phpCode,
        active: true,
        scope: "global",
        priority: 3,
      }),
    });
  } else {
    res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: SNIPPET_NAME,
        code: phpCode,
        active: true,
        scope: "global",
        priority: 3,
      }),
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Snippet deploy failed ${res.status}: ${body}`);
  }

  const data = await res.json();
  console.log(`  ✓ Snippet ${data.id} active`);

  const homepage = await fetch(`${SITE}/?nocache=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
  }).then((response) => response.text());

  const hasJoe = homepage.includes("Joe G.");
  const hasQuote = homepage.includes("I cannot recommend Sober Founders enough");
  console.log(`  ✓ Joe G. visible: ${hasJoe}`);
  console.log(`  ✓ Joe quote visible: ${hasQuote}\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
