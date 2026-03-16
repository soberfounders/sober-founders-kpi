#!/usr/bin/env node
/**
 * Backfill Yoast meta descriptions for all WordPress posts/pages that are
 * missing one.  Uses the OpenAI API (gpt-4o) to generate descriptions from
 * each post's title + excerpt/content, then writes them via the custom
 * Sober SEO REST plugin endpoint.
 *
 * Usage:
 *   node scripts/backfill-meta-descriptions.mjs              # dry-run (default)
 *   node scripts/backfill-meta-descriptions.mjs --write      # actually write
 *   node scripts/backfill-meta-descriptions.mjs --write --id 3418   # single post
 */

import 'dotenv/config';
import https from 'node:https';

// ── Config ──────────────────────────────────────────────────────────────────
const WP_USER = 'andrew';
const WP_APP_PASS = 'EWqW lnfe Ara0 PGys lcBj 9x01';
const WP_BASE = 'https://soberfounders.org/wp-json';
const WP_AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString('base64');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

const WRITE_MODE = process.argv.includes('--write');
const SINGLE_ID = (() => {
  const idx = process.argv.indexOf('--id');
  return idx !== -1 ? Number(process.argv[idx + 1]) : null;
})();

// Skip junk / internal pages
const SKIP_IDS = new Set([2, 3440]);

// ── HTTP helpers ────────────────────────────────────────────────────────────
function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

// ── WordPress helpers ───────────────────────────────────────────────────────
async function wpGet(path) {
  const { body } = await httpJson(`${WP_BASE}${path}`, {
    headers: { Authorization: WP_AUTH },
  });
  return body;
}

async function wpGetAll(path) {
  const results = [];
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${WP_BASE}${path}${sep}per_page=50&page=${page}`;
    const res = await httpJson(url, { headers: { Authorization: WP_AUTH } });
    if (!Array.isArray(res.body) || res.body.length === 0) break;
    results.push(...res.body);
    if (res.body.length < 50) break;
  }
  return results;
}

async function getSeoMeta(postId) {
  return wpGet(`/sober/v1/seo/${postId}`);
}

async function writeSeoMeta(postId, description) {
  return httpJson(`${WP_BASE}/sober/v1/seo`, {
    method: 'POST',
    headers: { Authorization: WP_AUTH },
    body: { post_id: postId, description },
  });
}

// ── OpenAI helper ───────────────────────────────────────────────────────────
async function generateMetaDescription(title, contentSnippet) {
  const { body } = await httpJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: {
      model: OPENAI_MODEL,
      temperature: 0.4,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content: `You write SEO meta descriptions for pages on soberfounders.org (Sober Founders Inc. — a nonprofit for sober entrepreneurs). Rules:
- Exactly 1 sentence, 130-155 characters (hard limit).
- The description MUST be specific to THIS page's actual content and topic. Summarize what the page is about, not the organization in general.
- Include a clear benefit or hook relevant to the page topic.
- Natural tone, no clickbait, no ALL CAPS.
- Do not start with "Discover", "Learn", or "Join".
- Do not write a generic org description. If the page is about statistics, mention statistics. If it's about masterminds, mention masterminds. Match the page.
- Return ONLY the meta description text, no quotes, no label.`,
        },
        {
          role: 'user',
          content: `Title: ${title}\n\nContent excerpt:\n${contentSnippet}`,
        },
      ],
    },
  });

  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty OpenAI response: ' + JSON.stringify(body));
  return text;
}

// ── HTML → plain text ───────────────────────────────────────────────────────
function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${WRITE_MODE ? 'WRITE' : 'DRY-RUN (use --write to commit changes)'}`);
  if (SINGLE_ID) console.log(`Single post: ${SINGLE_ID}\n`);

  // Fetch all posts + pages
  const [posts, pages] = await Promise.all([
    wpGetAll('/wp/v2/posts?_fields=id,title,excerpt,content,link'),
    wpGetAll('/wp/v2/pages?_fields=id,title,excerpt,content,link'),
  ]);
  const all = [...posts, ...pages];
  console.log(`Found ${posts.length} posts + ${pages.length} pages = ${all.length} total\n`);

  // Filter to those missing descriptions
  const targets = [];
  for (const item of all) {
    if (SKIP_IDS.has(item.id)) continue;
    if (SINGLE_ID && item.id !== SINGLE_ID) continue;
    const meta = await getSeoMeta(item.id);
    if (!meta.description || meta.description.trim() === '' || meta.description === 'test-ping-delete-me') {
      targets.push(item);
    }
  }
  console.log(`${targets.length} items need meta descriptions\n`);

  let success = 0;
  let failed = 0;

  for (const item of targets) {
    const title = stripHtml(item.title?.rendered || '');
    const excerpt = stripHtml(item.excerpt?.rendered || '');
    const contentSnippet = stripHtml(item.content?.rendered || '').substring(0, 800);
    const snippet = excerpt || contentSnippet;

    if (!title) {
      console.log(`SKIP ${item.id} — no title`);
      continue;
    }

    try {
      const desc = await generateMetaDescription(title, snippet);
      console.log(`[${item.id}] ${title.substring(0, 60)}`);
      console.log(`  → ${desc} (${desc.length} chars)`);

      if (WRITE_MODE) {
        const { status, body } = await writeSeoMeta(item.id, desc);
        if (body?.success) {
          console.log(`  ✓ written`);
          success++;
        } else {
          console.log(`  ✗ write failed (${status}): ${JSON.stringify(body)}`);
          failed++;
        }
      } else {
        success++;
      }
      console.log('');
    } catch (err) {
      console.error(`  ✗ error on ${item.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
