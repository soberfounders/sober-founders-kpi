#!/usr/bin/env node
/**
 * Daily Blog Publisher - Sober Founders
 *
 * Automated pipeline: picks next topic from content calendar,
 * generates a high-quality article via OpenAI (two-pass: voice-first,
 * then SEO polish), generates a DALL-E featured image, validates
 * against 19-check SEO scorecard, publishes to WordPress, and
 * updates the calendar.
 *
 * Usage:
 *   node scripts/daily-publish.mjs              # full publish
 *   node scripts/daily-publish.mjs --dry-run    # generate + validate only
 *   node scripts/daily-publish.mjs --draft      # publish as draft
 *   node scripts/daily-publish.mjs --id 5       # publish specific calendar entry
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { validateArticle, formatReport, buildFeedbackPrompt } from './lib/seo-validator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// -- Config (from environment - never hardcoded) ----------------------------
const WP_USER = process.env.WP_USERNAME || 'andrew';
const WP_APP_PASS = process.env.WP_APP_PASSWORD;
const WP_BASE = (process.env.WP_SITE_URL || 'https://soberfounders.org') + '/wp-json';
const WP_AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString('base64');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const CALENDAR_PATH = path.join(__dirname, 'content-calendar.json');
const LOGS_DIR = path.join(__dirname, 'logs');

const MAX_RETRIES = 5;
const QUEUE_LOW_THRESHOLD = 7;

// -- Validate environment ---------------------------------------------------
if (!OPENAI_API_KEY) { console.error('Missing OPENAI_API_KEY in .env'); process.exit(1); }
if (!WP_APP_PASS) { console.error('Missing WP_APP_PASSWORD in .env'); process.exit(1); }

// -- CLI args ---------------------------------------------------------------
function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const DRY_RUN = process.argv.includes('--dry-run');
const AS_DRAFT = process.argv.includes('--draft');
const SPECIFIC_ID = getArg('--id') ? parseInt(getArg('--id'), 10) : null;

// -- HTTP helper ------------------------------------------------------------
function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...opts.headers },
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

function httpRaw(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// -- OpenAI call ------------------------------------------------------------
async function callOpenAI(systemPrompt, userPrompt, { temperature = 0.6, maxTokens = 4000 } = {}) {
  const { body } = await httpJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: {
      model: OPENAI_MODEL,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
  });
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty OpenAI response: ' + JSON.stringify(body));
  return text;
}

// -- DALL-E image generation ------------------------------------------------
async function generateImage(topic, keyword) {
  const prompt = `Professional, warm editorial photograph for a blog article about "${topic}". The image should feel authentic and human - NOT corporate stock photography. Show a real-feeling scene related to entrepreneurship, recovery, community, or personal growth. Warm lighting, natural colors, no text or logos. Photorealistic style.`;

  const { body } = await httpJson('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: {
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
    },
  });

  const imageUrl = body?.data?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL in DALL-E response: ' + JSON.stringify(body).substring(0, 300));
  return imageUrl;
}

// -- WordPress media upload -------------------------------------------------
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function uploadFeaturedImage(imageBuffer, slug, altText) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const filename = `${slug}-featured.png`;

  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(header),
    imageBuffer,
    Buffer.from(footer),
  ]);

  const { status, body: respBody } = await httpRaw(`${WP_BASE}/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: WP_AUTH,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body,
  });

  let parsed;
  try { parsed = JSON.parse(respBody.toString()); } catch { parsed = respBody.toString(); }

  if (status >= 400) {
    throw new Error(`Media upload error (${status}): ${JSON.stringify(parsed).substring(0, 300)}`);
  }

  // Set alt text
  if (parsed.id && altText) {
    await httpJson(`${WP_BASE}/wp/v2/media/${parsed.id}`, {
      method: 'POST',
      headers: { Authorization: WP_AUTH },
      body: { alt_text: altText },
    });
  }

  return parsed.id;
}

async function setFeaturedImage(postId, mediaId) {
  await httpJson(`${WP_BASE}/wp/v2/posts/${postId}`, {
    method: 'POST',
    headers: { Authorization: WP_AUTH },
    body: { featured_media: mediaId },
  });
}

// -- System prompt (voice-first, anti-slop) ---------------------------------
const ARTICLE_SYSTEM_PROMPT = `You are a blog writer for Sober Founders Inc. (soberfounders.org), a 501(c)(3) nonprofit that runs free masterminds and mentorship for sober entrepreneurs.

YOUR #1 JOB: Write like a real person sharing hard-won experience. NOT like a content marketer hitting SEO checkboxes.

## WHO YOU ARE WRITING AS
You are a sober founder who has been through it - the 2am payroll anxiety, the client dinner where everyone orders wine, the shame spiral that makes you underprice your work. You write from that place. First person plural ("we") is your default. You have sat in the rooms described in these articles.

## WHO YOU ARE WRITING FOR
A U.S.-based entrepreneur in recovery, age 30-60, running a business doing $250K to several million. They work in professional services, wellness, trades, tech, or creative agencies. They have 0-10 employees. They value confidentiality about their recovery. They want a peer community that gets both the P&L and the sobriety.

Pain points to weave in naturally (pick 2-3 per article, go deep):
1. Loneliness - the only sober person at every conference, dinner, networking event
2. Cash flow stress - past financial wreckage, shame, building without old coping mechanisms
3. Fear that business pressure will break their recovery - the weight of signing payroll
4. Boundary issues - overwork, underpricing, over-delivering, people-pleasing
5. Guilt about past chaos showing up in pricing, negotiations, self-worth
6. Wrestling with how "out" to be about recovery in professional settings
7. Work becoming the new compulsion - the business replacing the old substance

## VOICE RULES (NON-NEGOTIABLE)
1. Peer-to-peer. You are a fellow founder, not a guru. Never write "consider doing X" - write "here is what we did."
2. Specific and tactical. Give actual dollar amounts, scripts people can copy, time frames, templates. "Set boundaries" is banned unless you show exactly HOW with a real example.
3. Honest before hopeful. "This is hard. Here is what we have seen work." Never paper over struggle with positivity.
4. Recovery language: "in recovery," "sober entrepreneur," "founder in recovery." NEVER "addict" as identity.
5. Lead with stories. Every major section needs a specific scenario: "A founder in our Thursday group owns a $1.2M landscaping company in Phoenix. Last quarter, his biggest client invited him to a golf outing at a country club. Open bar. Here is how he handled it..."
6. Normalize being unsure. It is okay to be afraid, ambivalent, still figuring it out.
7. Safety and confidentiality are the subtext of everything: "You do not have to perform here."

## BANNED PHRASES (your article will be rejected if these appear)
- "In today's fast-paced world" or any variation
- "As entrepreneurs, we all know..."
- "holistic" / "transformative" / "empower" / "leverage" / "unlock"
- "Navigating the complexities"
- "It's no secret that..."
- "At the end of the day..."
- "Game-changer" / "paradigm shift"
- "Dive deep" / "deep dive"
- "Nurture" (when not about children)
- "Myriad" / "plethora"
- "Fostering" / "cultivating" (when not about agriculture)
- "Landscape" (when not about actual land)
- "Robust" / "comprehensive" / "streamline"
- "Furthermore" / "moreover" / "additionally" at paragraph starts
- Em dashes. Use regular hyphens (-) or commas instead. Never use the long dash character.

## WRITING STRUCTURE
- DEPTH over breadth. 4-6 deep sections, not 10 shallow ones.
- Each section: 200-300 words minimum. Paragraphs of real substance, not bullet lists pretending to be content.
- At least 2 micro-stories per article. Real scenarios with specific details (city, industry, revenue range, what happened, how they handled it).
- At least 1 copy-paste template, script, or checklist the reader can use TODAY.
- Vary sentence length. Short punches mixed with longer explanations.
- Never start two consecutive paragraphs with the same word.

## SEO STRUCTURE (built into writing naturally)
- Start with: <p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>
- First H2: question format, followed by a 40-60 word direct answer block (BLUF - Bottom Line Up Front). This block should work as a standalone answer if an AI extracts it.
- All H2s as natural questions matching how people ask AI assistants.
- Focus keyword in first 100 words, in at least one H2, and 3-5 more times naturally.
- Use 2+ semantic variations of the keyword throughout.
- At least 2 statistics from named sources (SAMHSA, NIDA, journal studies) with source cited inline.
- 1 <blockquote> from a hypothetical Phoenix Forum member - first name, industry, revenue range. Make it sound like a real person talking, not a testimonial.
- 1 <table> comparing real options/data (not filler).
- 1 <!-- Alt: description --> comment for a suggested image.
- Short paragraphs (3-5 sentences max).
- 1 <ul> or <ol> list where it naturally fits.

## INTERNAL LINKS (weave naturally, never dump in one paragraph)
- Phoenix Forum: <a href="https://soberfounders.org/phoenix-forum-2nd-group/">Phoenix Forum</a> (for founders $1M+ revenue, 1+ year sober)
- Weekly mastermind: <a href="https://soberfounders.org/weekly-mastermind-group/">free weekly mastermind</a>
- At least 1 blog post from:
  - <a href="https://soberfounders.org/entrepreneurs-in-recovery/">Entrepreneurs in Recovery</a>
  - <a href="https://soberfounders.org/12-steps-and-your-business/">12 Steps and Your Business</a>
  - <a href="https://soberfounders.org/entrepreneurial-operating-system-eos/">EOS for Sober Founders</a>
  - <a href="https://soberfounders.org/do-mastermind-groups-help-sober-entrepreneurs/">Do Mastermind Groups Help Sober Entrepreneurs?</a>
  - <a href="https://soberfounders.org/peer-advisory-sober-entrepreneurs/">Peer Advisory for Sober Entrepreneurs</a>

## FAQ SECTION
End with <h2>Frequently Asked Questions</h2>, then 4-5 <h3>Question?</h3> + <p>Answer</p> pairs. Questions should match real search queries.

## ARTICLE LENGTH - CRITICAL
You MUST write at least 2,000 words. Articles under 1,800 words are AUTOMATICALLY REJECTED. Aim for 2,200-2,500 words. That means 7-9 H2 sections, each with 3+ paragraphs of 50-80 words. If you finish early, add more stories, examples, and practical advice to every section.

## CTA
One natural CTA to <a href="https://soberfounders.org">Sober Founders</a> - frame as "if this resonates" or "if you want a room where you do not have to explain yourself." Not pushy.

## OUTPUT FORMAT
Return ONLY valid HTML. Use <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <blockquote>, <strong>, <em>, <a> tags. No <html>, <head>, <body>, or <h1>. No markdown. No code fences. No preamble. Just the article HTML.`;

const META_SYSTEM_PROMPT = `You generate SEO metadata for soberfounders.org articles. Return a JSON object with these fields:
- "seo_title": Page title tag, 50-60 characters, includes the focus keyword naturally. Include "| Sober Founders" at the end if space allows.
- "meta_description": 130-155 characters, specific to the article content, includes a benefit/hook. Do not start with "Discover", "Learn", or "Join". Do not use em dashes.
- "slug": URL slug, under 60 characters, lowercase, hyphens only, includes the focus keyword.
- "image_alt": A concise alt text description (under 125 chars) for the featured image, describing a scene related to the article topic.

Return ONLY the JSON object, no explanation.`;

// -- Calendar helpers -------------------------------------------------------
function loadCalendar() {
  return JSON.parse(fs.readFileSync(CALENDAR_PATH, 'utf-8'));
}

function saveCalendar(calendar) {
  fs.writeFileSync(CALENDAR_PATH, JSON.stringify(calendar, null, 2) + '\n');
}

function pickNextEntry(entries) {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const queued = entries
    .filter((e) => e.status === 'queued')
    .sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99));
  return queued[0] || null;
}

// -- Logging ----------------------------------------------------------------
function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);

  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logFile = path.join(LOGS_DIR, `daily-publish-${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(logFile, line + '\n');
}

// -- Post-process: strip em-dashes and slop ---------------------------------
function cleanArticle(html) {
  // Replace em-dashes and en-dashes with regular hyphens
  return html
    .replace(/\u2014/g, ' - ')   // em dash
    .replace(/\u2013/g, '-')     // en dash
    .replace(/&mdash;/g, ' - ')
    .replace(/&ndash;/g, '-')
    .replace(/\u2018/g, "'")     // smart single quotes
    .replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"')     // smart double quotes
    .replace(/\u201D/g, '"');
}

// -- Generate with validation + retry ---------------------------------------
async function generateWithValidation(topic, keyword) {
  let feedback = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) log(`  Retry ${attempt}/${MAX_RETRIES}...`);

    // Generate article
    const userPrompt = `Write an article about: "${topic}"

Primary focus keyword: "${keyword}"

REMEMBER: You are writing as a sober founder sharing real experience with other sober founders. Tell stories. Be specific. Be human. This is NOT a marketing blog - it is a conversation between people who have been through it.

HARD REQUIREMENTS (auto-scored, article rejected if missing):
1. MINIMUM 2,000 words of body text. THIS IS NON-NEGOTIABLE - articles under 1800 words are automatically rejected. Write at LEAST 7 substantial H2 sections with 3+ paragraphs each. Every section needs real depth, real stories, real specifics.
2. Use the exact phrase "${keyword}" at least 3 times naturally AND in at least one H2.
3. Include 2+ micro-stories with specific details (city, industry, dollar amounts, what happened).
4. Include 1 <blockquote> with a Phoenix Forum member quote (first name, industry, revenue range). Make it sound like a real person talking.
5. Include 1 <table> with real comparative data.
6. Use 2+ semantic variations/synonyms of "${keyword}" throughout.
7. Include <!-- Alt: description --> for a suggested image.
8. No em dashes. Use regular hyphens or commas.${feedback}`;

    const article = await callOpenAI(ARTICLE_SYSTEM_PROMPT, userPrompt, { temperature: 0.75, maxTokens: 10000 });
    const cleaned = cleanArticle(article);
    log(`  Article generated (${cleaned.length} chars, attempt ${attempt + 1})`);

    // Generate metadata
    const metaRaw = await callOpenAI(
      META_SYSTEM_PROMPT,
      `Article topic: "${topic}"\nFocus keyword: "${keyword}"\n\nArticle excerpt (first 500 chars):\n${cleaned.substring(0, 500)}`,
      { temperature: 0.3, maxTokens: 300 },
    );

    let meta;
    try {
      meta = JSON.parse(metaRaw.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
    } catch {
      log(`  Failed to parse metadata: ${metaRaw.substring(0, 200)}`);
      continue;
    }

    // Validate
    const result = validateArticle(cleaned, keyword, meta);
    log(`  SEO Score: ${result.score}/${result.maxScore} (${result.passed ? 'PASS' : 'FAIL'})`);

    if (result.passed) {
      return { article: cleaned, meta, result };
    }

    // Build feedback for retry
    feedback = buildFeedbackPrompt(result);
    log(`  Failing checks: ${result.checks.filter((c) => c.earned < c.points).map((c) => c.name).join(', ')}`);
  }

  // Safety net
  throw new Error(`Article failed SEO validation after ${MAX_RETRIES + 1} attempts.`);
}

// -- WordPress publish ------------------------------------------------------
async function checkSlugExists(slug) {
  const { body } = await httpJson(
    `${WP_BASE}/wp/v2/posts?slug=${encodeURIComponent(slug)}&per_page=1`,
    { headers: { Authorization: WP_AUTH } },
  );
  return Array.isArray(body) && body.length > 0;
}

async function publishToWordPress(article, meta, status, featuredMediaId) {
  const wpPayload = {
    title: meta.seo_title.replace(/\s*\|.*$/, ''),
    content: article,
    status,
    slug: meta.slug,
  };
  if (featuredMediaId) wpPayload.featured_media = featuredMediaId;

  const { status: httpStatus, body } = await httpJson(`${WP_BASE}/wp/v2/posts`, {
    method: 'POST',
    headers: { Authorization: WP_AUTH },
    body: wpPayload,
  });

  if (httpStatus >= 400) {
    throw new Error(`WordPress error (${httpStatus}): ${JSON.stringify(body).substring(0, 300)}`);
  }

  return { postId: body.id, postLink: body.link, slug: body.slug };
}

async function setYoastSEO(postId, meta, keyword) {
  const { body } = await httpJson(`${WP_BASE}/sober/v1/seo`, {
    method: 'POST',
    headers: { Authorization: WP_AUTH },
    body: {
      post_id: postId,
      title: meta.seo_title,
      description: meta.meta_description,
      focus_keyword: keyword,
    },
  });
  return body;
}

// -- Main pipeline ----------------------------------------------------------
async function main() {
  log('=== Daily Blog Publisher v2 ===');
  log(`Mode: ${DRY_RUN ? 'DRY-RUN' : AS_DRAFT ? 'DRAFT' : 'PUBLISH'}`);

  // Load calendar
  const calendar = loadCalendar();
  const queuedCount = calendar.entries.filter((e) => e.status === 'queued').length;
  log(`Calendar: ${calendar.entries.length} total, ${queuedCount} queued`);

  // Pick entry
  let entry;
  if (SPECIFIC_ID) {
    entry = calendar.entries.find((e) => e.id === SPECIFIC_ID);
    if (!entry) { log(`Entry ID ${SPECIFIC_ID} not found`); process.exit(1); }
    if (entry.status === 'published') { log(`Entry ID ${SPECIFIC_ID} already published`); process.exit(1); }
  } else {
    entry = pickNextEntry(calendar.entries);
  }

  if (!entry) {
    log('No queued entries. Run expand-calendar.mjs to add more topics.');
    process.exit(0);
  }

  log(`Selected: [${entry.id}] "${entry.topic}"`);
  log(`Keyword: "${entry.keyword}" | Priority: ${entry.priority} | Category: ${entry.category}`);

  // Generate + validate
  log('Generating article with SEO validation...');
  const { article, meta, result } = await generateWithValidation(entry.topic, entry.keyword);

  log('\n' + formatReport(result) + '\n');
  log(`Meta title: ${meta.seo_title} (${meta.seo_title.length} chars)`);
  log(`Meta desc: ${meta.meta_description} (${meta.meta_description.length} chars)`);
  log(`Slug: ${meta.slug}`);

  if (DRY_RUN) {
    log('\n=== DRY RUN - Article Preview ===');
    console.log(article);
    log('=== End Preview ===');
    return;
  }

  // Generate featured image
  let featuredMediaId = null;
  try {
    log('Generating featured image via DALL-E...');
    const imageUrl = await generateImage(entry.topic, entry.keyword);
    log(`  Image generated: ${imageUrl.substring(0, 80)}...`);

    log('  Downloading image...');
    const imageBuffer = await downloadImage(imageUrl);
    log(`  Downloaded: ${(imageBuffer.length / 1024).toFixed(0)} KB`);

    log('  Uploading to WordPress...');
    featuredMediaId = await uploadFeaturedImage(imageBuffer, meta.slug, meta.image_alt || entry.topic);
    log(`  Featured image uploaded: media ID ${featuredMediaId}`);
  } catch (err) {
    log(`  Image generation/upload failed (non-fatal): ${err.message}`);
    // Continue without image - article still publishes
  }

  // Check slug collision
  const slugExists = await checkSlugExists(meta.slug);
  if (slugExists) {
    meta.slug = meta.slug + '-' + Date.now().toString(36).slice(-4);
    log(`Slug collision - using: ${meta.slug}`);
  }

  // Publish - always publish (SEO validation guarantees quality)
  const publishStatus = AS_DRAFT ? 'draft' : 'publish';

  log(`Publishing to WordPress as ${publishStatus}...`);
  const { postId, postLink, slug } = await publishToWordPress(article, meta, publishStatus, featuredMediaId);
  log(`Published: ID ${postId} | ${postLink}`);

  // Set featured image on post if uploaded separately
  if (featuredMediaId) {
    await setFeaturedImage(postId, featuredMediaId);
  }

  // Set Yoast SEO
  log('Setting Yoast SEO fields...');
  const seoResult = await setYoastSEO(postId, meta, entry.keyword);
  if (seoResult?.success) {
    log(`SEO fields set: ${seoResult.updated.join(', ')}`);
  } else {
    log(`SEO write warning: ${JSON.stringify(seoResult).substring(0, 200)}`);
  }

  // Update calendar
  entry.status = 'published';
  entry.publishedDate = new Date().toISOString().slice(0, 10);
  entry.wpPostId = postId;
  entry.wpSlug = slug;
  entry.seoScore = `${result.score}/${result.maxScore}`;
  calendar.meta.totalPublished += 1;
  saveCalendar(calendar);
  log('Calendar updated.');

  // Check queue level
  const remainingQueued = calendar.entries.filter((e) => e.status === 'queued').length;
  if (remainingQueued < QUEUE_LOW_THRESHOLD) {
    log(`Queue low (${remainingQueued} remaining). Run: node scripts/expand-calendar.mjs`);
  }

  log(`\nDone. Post ${publishStatus === 'publish' ? 'live' : 'drafted'} at: ${postLink}`);
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
