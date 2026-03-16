#!/usr/bin/env node
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

const phpCode = `add_action('wp_head', function() {
    if (!is_page('phoenix-forum-2nd-group')) return;

    $schema = [
        '@context' => 'https://schema.org',
        '@graph' => [
            [
                '@type' => 'Article',
                'headline' => 'Phoenix Forum: The Peer Mastermind Group for Sober Founders',
                'description' => 'The Phoenix Forum is a weekly peer mastermind group for entrepreneurs with $1M+ revenue and 1+ year of sobriety, operated by Sober Founders, a 501(c)(3) nonprofit.',
                'datePublished' => '2026-03-16',
                'dateModified' => '2026-03-16',
                'author' => ['@type' => 'Organization', 'name' => 'Sober Founders', 'url' => 'https://soberfounders.org'],
                'publisher' => ['@type' => 'Organization', 'name' => 'Sober Founders', 'url' => 'https://soberfounders.org'],
                'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => 'https://soberfounders.org/phoenix-forum-2nd-group/'],
            ],
            [
                '@type' => 'FAQPage',
                'mainEntity' => [
                    ['@type' => 'Question', 'name' => 'What is the Phoenix Forum?', 'acceptedAnswer' => ['@type' => 'Answer', 'text' => 'The Phoenix Forum is a weekly peer mastermind group operated by Sober Founders, a 501(c)(3) nonprofit. It is designed for entrepreneurs with $1M+ in annual revenue and more than one year of sobriety. Members meet on Tuesdays and Thursdays for structured peer accountability sessions.']],
                    ['@type' => 'Question', 'name' => 'What are the eligibility requirements?', 'acceptedAnswer' => ['@type' => 'Answer', 'text' => 'Two hard requirements: (1) annual business revenue of at least $1 million, and (2) continuous sobriety for more than one year. Both are verified during the application process.']],
                    ['@type' => 'Question', 'name' => 'How is the Phoenix Forum different from YPO or EO?', 'acceptedAnswer' => ['@type' => 'Answer', 'text' => 'YPO, EO, and Vistage are designed for the general entrepreneurial population. The Phoenix Forum is the only major peer group specifically built for founders in recovery. Sessions meet weekly rather than monthly.']],
                    ['@type' => 'Question', 'name' => 'How often do Phoenix Forum members meet?', 'acceptedAnswer' => ['@type' => 'Answer', 'text' => 'Members meet twice per week, every Tuesday and Thursday. Sessions are conducted virtually.']],
                    ['@type' => 'Question', 'name' => 'How much does the Phoenix Forum cost?', 'acceptedAnswer' => ['@type' => 'Answer', 'text' => 'Membership pricing is not published publicly. Contact the Sober Founders team via the application page for current pricing.']],
                    ['@type' => 'Question', 'name' => 'Can I apply with less than one year of sobriety?', 'acceptedAnswer' => ['@type' => 'Answer', 'text' => 'No. The one-year sobriety requirement is strictly enforced. Explore Sober Founders free weekly sessions and apply when you meet the requirement.']],
                ],
            ],
            [
                '@type' => 'BreadcrumbList',
                'itemListElement' => [
                    ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => 'https://soberfounders.org'],
                    ['@type' => 'ListItem', 'position' => 2, 'name' => 'Phoenix Forum', 'item' => 'https://soberfounders.org/phoenix-forum-2nd-group/'],
                ],
            ],
        ],
    ];
    echo '<script type="application/ld+json">' . json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . '</script>' . "\\n";
});`;

async function main() {
  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "SF Phoenix Forum Schemas - Article + FAQ + Breadcrumb",
      desc: "Injects Article, FAQPage, and BreadcrumbList JSON-LD into the Phoenix Forum page head.",
      code: phpCode,
      active: true,
      scope: "global",
      priority: 10,
    }),
  });
  const data = await res.json();
  console.log("Snippet ID:", data.id, "| Active:", data.active, "| Error:", data.code_error || "none");

  if (!data.active && !data.code_error) {
    await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${data.id}/activate`, { method: "POST", headers });
    console.log("Activated.");
  }

  // Verify
  console.log("\nVerifying schemas on Phoenix Forum page...");
  const page = await fetch(`${SITE}/phoenix-forum-2nd-group/`).then(r => r.text());
  const schemaCount = (page.match(/application\/ld\+json/g) || []).length;
  console.log("JSON-LD blocks found:", schemaCount);
}

main().catch(console.error);
