#!/usr/bin/env node
/**
 * Push Article schema snippet for all blog posts via Code Snippets API.
 * This dynamically generates Article JSON-LD for every single post on the site.
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

// PHP snippet that dynamically generates Article schema for every blog post
const phpCode = `add_action('wp_head', function() {
    if (!is_single()) return;

    global $post;
    if ($post->post_type !== 'post') return;

    $schema = [
        '@context'        => 'https://schema.org',
        '@type'           => 'Article',
        'headline'        => get_the_title($post),
        'description'     => has_excerpt($post) ? get_the_excerpt($post) : wp_trim_words(strip_tags($post->post_content), 30, '...'),
        'datePublished'   => get_the_date('c', $post),
        'dateModified'    => get_the_modified_date('c', $post),
        'url'             => get_permalink($post),
        'author'          => [
            '@type' => 'Organization',
            'name'  => 'Sober Founders',
            'url'   => 'https://soberfounders.org',
        ],
        'publisher' => [
            '@type' => 'Organization',
            'name'  => 'Sober Founders',
            'url'   => 'https://soberfounders.org',
        ],
        'mainEntityOfPage' => [
            '@type' => 'WebPage',
            '@id'   => get_permalink($post),
        ],
        'isPartOf' => [
            '@type' => 'WebSite',
            'name'  => 'Sober Founders',
            'url'   => 'https://soberfounders.org',
        ],
    ];

    // Add featured image if available
    if (has_post_thumbnail($post)) {
        $img_id  = get_post_thumbnail_id($post);
        $img_url = wp_get_attachment_image_url($img_id, 'full');
        if ($img_url) {
            $schema['image'] = [
                '@type' => 'ImageObject',
                'url'   => $img_url,
            ];
        }
    }

    echo '<script type="application/ld+json">' . json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\\n";
});`;

async function main() {
  console.log("Pushing Article schema snippet for all blog posts...");

  const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "SF Blog Article Schema — All Posts",
      desc: "Dynamically generates Article JSON-LD for every blog post. Includes headline, dates, author (Sober Founders org), featured image, and permalink.",
      code: phpCode,
      active: true,
      scope: "global",
      priority: 10,
    }),
  });
  const data = await res.json();
  console.log("Snippet ID:", data.id, "| Active:", data.active, "| Error:", data.code_error || "none");

  if (data.code_error) {
    console.log("Code error:", JSON.stringify(data.code_error));
    return;
  }

  if (!data.active) {
    await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${data.id}/activate`, { method: "POST", headers });
    console.log("Activated.");
  }

  // Verify on a random blog post
  console.log("\nVerifying on a blog post...");
  const page = await fetch(`${SITE}/ypo-for-sober-founders/`).then(r => r.text());
  const count = (page.match(/application\/ld\+json/g) || []).length;
  const hasArticle = page.includes('"@type":"Article"') || page.includes('"@type": "Article"');
  console.log(`JSON-LD blocks on YPO post: ${count}`);
  console.log(`Article schema present: ${hasArticle}`);
}

main().catch(console.error);
