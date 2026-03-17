#!/usr/bin/env node
/**
 * Daily Blog Publisher — Sober Founders
 *
 * Automated pipeline: picks next topic from content calendar,
 * generates an SEO-optimized article via OpenAI, validates against
 * 19-check SEO scorecard, publishes to WordPress, and updates the calendar.
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
import { fileURLToPath } from 'node:url';
import { validateArticle, formatReport, buildFeedbackPrompt } from './lib/seo-validator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config (from environment — never hardcoded) ─────────────────────────────
const WP_USER = process.env.WP_USERNAME || 'andrew';
const WP_APP_PASS = process.env.WP_APP_PASSWORD;
const WP_BASE = (process.env.WP_SITE_URL || 'https://soberfounders.org') + '/wp-json';
const WP_AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString('base64');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const CALENDAR_PATH = path.join(__dirname, 'content-calendar.json');
const LOGS_DIR = path.join(__dirname, 'logs');

const MAX_RETRIES = 2;
const QUEUE_LOW_THRESHOLD = 7;

// ── Validate environment ────────────────────────────────────────────────────
if (!OPENAI_API_KEY) { console.error('Missing OPENAI_API_KEY in .env'); process.exit(1); }
if (!WP_APP_PASS) { console.error('Missing WP_APP_PASSWORD in .env'); process.exit(1); }

// ── CLI args ────────────────────────────────────────────────────────────────
function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const DRY_RUN = process.argv.includes('--dry-run');
const AS_DRAFT = process.argv.includes('--draft');
const SPECIFIC_ID = getArg('--id') ? parseInt(getArg('--id'), 10) : null;

// ── HTTP helper ─────────────────────────────────────────────────────────────
function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
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

// ── OpenAI call ─────────────────────────────────────────────────────────────
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

// ── System prompts (from publish-article.mjs) ───────────────────────────────
const ARTICLE_SYSTEM_PROMPT = `You are a content writer for Sober Founders Inc. (soberfounders.org), a nonprofit that runs free masterminds and mentorship for sober entrepreneurs.

## ICP — Write for This Person
A U.S.-based entrepreneur in recovery, age 30–60, who owns a small to mid-sized business ($250K to several million revenue). They run solo or teams of 1–10 employees in professional services, wellness, trades, tech, or creative agencies. They value confidentiality around their recovery but are open to honest conversations in safe, curated spaces. They are looking for a peer community that understands both P&L statements and the realities of staying sober.

Core pain points to weave in where relevant:
1. Loneliness — no peer group that gets both entrepreneurship and recovery. Being the only sober person in the room at conferences, dinners, and networking events.
2. Cash flow volatility and financial uncertainty — past financial chaos, shame about wreckage, stress of building without old coping mechanisms.
3. Chronic stress — fear that business pressure could threaten recovery. The weight of being the one who signs payroll.
4. Boundary issues — overwork, difficulty saying no, underpricing, over-delivering, people-pleasing that drains profit margins.
5. Guilt and shame about past chaos — shows up in pricing, negotiations, and self-worth.
6. Ambivalence about being "out" — wrestling with how visible to be about recovery in professional settings.
7. Work becoming the new compulsion — when the business replaces the old substance.

## Voice & Tone Rules (MANDATORY — violations will be rejected)
1. Peer-to-peer, not guru-to-follower — write as a fellow founder who's been there, not an authority dispensing wisdom. Use "we" and "you" naturally.
2. Practical, specific, tactical — give actual scripts, dollar amounts, time frames, templates, checklists. NO vague advice like "set boundaries" without showing HOW.
3. Hopeful but not cheesy — acknowledge difficulty honestly. "This is hard" before "here's what works." Do not paper over struggle with positivity.
4. Non-stigmatizing recovery language — use "in recovery," "sober entrepreneur," "founder in recovery." NEVER use "addict" as an identity label.
5. Lead with lived experience — "Here's what actually happened. Here's how we handled it." Use specific scenarios (the client dinner, the investor meeting, the 2am anxiety spiral about making payroll).
6. Normalize ambivalence and struggle — not just success stories. It's okay to be unsure, afraid, or still figuring it out.
7. Emphasize safety and confidentiality — "You don't have to perform here" is the subtext of everything.

## Writing Quality Rules (MANDATORY)
- DEPTH over breadth. Go deep on 4-6 sections rather than shallow on 10+.
- Each section needs at least 150-250 words of substantive content, not just a bulleted list.
- Tell micro-stories: "A founder in our community was at a tech conference in Austin. Three VCs wanted to take him to dinner. Every restaurant they suggested had a bar scene..." — then show how he handled it.
- Include at least ONE specific, usable template/script/checklist per article that the reader can copy and use today.
- Vary sentence length. Mix short punchy sentences with longer explanatory ones.
- Avoid starting consecutive paragraphs with the same word.
- Do NOT use generic filler like "In today's fast-paced world" or "As entrepreneurs, we all know..."

## 2026 SEO + GEO Framework (MANDATORY)
In 2026, SEO has shifted from "Ranking Links" to "Owning the Answer." Every article must be optimized for both traditional search AND generative engines (ChatGPT, Gemini, Perplexity, Google AI Overviews).

### GEO & AI-Ready Content
- Start the article with <p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>
- BLUF Method (Bottom Line Up Front): First H2 must have an Atomic Answer Block — a 40–60 word self-contained answer in wiki-voice tone with at least one specific data point or source. This block must make sense if extracted and cited by an AI verbatim.
- Question-Based H2s: Structure all subheaders as natural language questions matching how users prompt AI assistants (e.g., "How do sober founders handle X?").
- Information Gain: Every article MUST contain unique insights — proprietary perspectives, specific member scenarios, or expert analysis. If the content only summarizes existing web data, LLMs will ignore it.
- Modular Chunking: Use bulleted lists, tables, and short paragraphs (3-5 sentences max). AI engines prioritize extractable structured blocks over rambling narratives.
- Fact-Density Reinforcement: Include at least 2 statistic citations from credible sources (SAMHSA, NIDA, journal studies, etc.) with the source named inline. AI agents use these as "grounding truths" to increase confidence scores.
- Include at least 1 direct quote from a hypothetical Phoenix Forum member as a <blockquote>. Include their first name, industry, and approximate revenue range. This serves as an "expert quote" E-E-A-T signal.

### Authority & Trust (E-E-A-T)
- Write with demonstrated expertise — reference specific recovery and business scenarios that only someone with lived experience would know.
- Include "Proof of Work" signals: specific numbers, time frames, dollar amounts, named frameworks.
- Every claim should be grounded — no unsourced assertions. If you state a fact, name the source.
- Zero-Click Value: Include at least ONE original asset per article (a usable template, script, checklist, or decision framework) that AI could extract and present as a standalone answer.

### FAQ Section
- Add a FAQ section at the end: use <h2>Frequently Asked Questions</h2>, then <h3>Question text here?</h3> (plain text, no ### prefix) followed by a <p> answer. Include 4-5 Q&A pairs.
- FAQ questions should match real search queries and AI prompts for the topic.
- Every paragraph should convey one clear, self-contained idea.
- Tables beat prose for comparisons. Numbered lists beat paragraphs for processes.

## Internal Linking (MANDATORY)
Every article MUST include these internal links woven naturally into the content:
- Link to the Phoenix Forum application: <a href="https://soberfounders.org/phoenix-forum-2nd-group/">Phoenix Forum</a> — mention once in the body and/or FAQ as the flagship program for founders with $1M+ revenue and 1+ year sobriety.
- Link to the weekly mastermind: <a href="https://soberfounders.org/weekly-mastermind-group/">free weekly mastermind</a> — for founders who want to start with the free community.
- Link to at least 1 existing blog post from this list (pick whichever is most relevant to the topic):
  - <a href="https://soberfounders.org/entrepreneurs-in-recovery/">Entrepreneurs in Recovery</a>
  - <a href="https://soberfounders.org/12-steps-and-your-business/">12 Steps and Your Business</a>
  - <a href="https://soberfounders.org/entrepreneurial-operating-system-eos/">EOS for Sober Founders</a>
  - <a href="https://soberfounders.org/do-mastermind-groups-help-sober-entrepreneurs/">Do Mastermind Groups Help Sober Entrepreneurs?</a>
  - <a href="https://soberfounders.org/peer-advisory-sober-entrepreneurs/">Peer Advisory for Sober Entrepreneurs</a>
Do NOT dump all links in one paragraph. Spread them across different sections where they fit contextually.

## On-Page SEO Checklist (built into writing)
- Focus keyword appears in: first 100 words, at least one H2, and naturally 3-5 more times throughout (no stuffing).
- Use semantic variations of the keyword (e.g., for "sober networking" also use "alcohol-free networking," "networking in recovery," "sober professional events").
- At least one image alt text suggestion as an HTML comment: <!-- Alt: description of suggested image -->
- Short paragraphs (3-5 sentences max). No walls of text.

## Content Rules
- Article length: 1,800–2,500 words MINIMUM. Count your output. If under 1,800 words, expand your weakest sections.
- Include a clear, contextual CTA linking to <a href="https://soberfounders.org">Sober Founders</a> — not pushy, frame as "if this resonates" or "if you're looking for a room where you don't have to explain yourself."
- Do not start the article with "Discover" or "Learn"
- No clickbait, no ALL CAPS headlines

## Output Format
Return ONLY valid HTML content (no markdown syntax anywhere — no #, no **, no \`\`\`). Use <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <blockquote>, <strong>, <em>, <a> tags. Do NOT include <html>, <head>, <body>, or <h1> tags — WordPress handles those. Do not wrap output in code fences. Do not include any preamble or explanation — just the article HTML.`;

const META_SYSTEM_PROMPT = `You generate SEO metadata for soberfounders.org articles. Return a JSON object with these fields:
- "seo_title": Page title tag, 50-60 characters, includes the focus keyword naturally. Include "| Sober Founders" at the end if space allows.
- "meta_description": 130-155 characters, specific to the article content, includes a benefit/hook. Do not start with "Discover", "Learn", or "Join".
- "slug": URL slug, under 60 characters, lowercase, hyphens only, includes the focus keyword.

Return ONLY the JSON object, no explanation.`;

// ── Calendar helpers ────────────────────────────────────────────────────────
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

// ── Logging ─────────────────────────────────────────────────────────────────
function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);

  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logFile = path.join(LOGS_DIR, `daily-publish-${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(logFile, line + '\n');
}

// ── Generate with validation + retry ────────────────────────────────────────
async function generateWithValidation(topic, keyword) {
  let feedback = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) log(`  Retry ${attempt}/${MAX_RETRIES}...`);

    // Generate article
    const userPrompt = `Write an article about: "${topic}"

Primary focus keyword: "${keyword}"

Target audience: sober entrepreneurs and founders in recovery.

CRITICAL REQUIREMENTS — your article will be automatically scored and rejected if these are missing:
1. MINIMUM 2,000 words (this is non-negotiable — count your output, expand sections if short)
2. Use the exact focus keyword "${keyword}" at least 3 times naturally in the text AND in at least one H2
3. Include at least 1 <blockquote> with a Phoenix Forum member quote (first name, industry, revenue range)
4. Include at least 1 <table> comparing options or data
5. Use semantic variations of the keyword (synonyms, related phrases)
6. Include <!-- Alt: description --> for at least 1 suggested image${feedback}`;

    const article = await callOpenAI(ARTICLE_SYSTEM_PROMPT, userPrompt, { temperature: 0.7, maxTokens: 8000 });
    log(`  Article generated (${article.length} chars, attempt ${attempt + 1})`);

    // Generate metadata
    const metaRaw = await callOpenAI(
      META_SYSTEM_PROMPT,
      `Article topic: "${topic}"\nFocus keyword: "${keyword}"\n\nArticle excerpt (first 500 chars):\n${article.substring(0, 500)}`,
      { temperature: 0.3, maxTokens: 200 },
    );

    let meta;
    try {
      meta = JSON.parse(metaRaw.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
    } catch {
      log(`  Failed to parse metadata: ${metaRaw.substring(0, 200)}`);
      continue;
    }

    // Validate
    const result = validateArticle(article, keyword, meta);
    log(`  SEO Score: ${result.score}/${result.maxScore} (${result.passed ? 'PASS' : 'FAIL'})`);

    if (result.passed) {
      return { article, meta, result };
    }

    // Build feedback for retry
    feedback = buildFeedbackPrompt(result);
    log(`  Failing checks: ${result.checks.filter((c) => c.earned < c.points).map((c) => c.name).join(', ')}`);
  }

  // Final attempt — return whatever we have
  log('  Max retries exceeded. Will publish as draft.');
  const article = await callOpenAI(ARTICLE_SYSTEM_PROMPT,
    `Write an article about: "${topic}"\n\nPrimary focus keyword: "${keyword}"\n\nTarget audience: sober entrepreneurs and founders in recovery.\n\nCRITICAL: Article MUST be at least 2,000 words. Use the keyword "${keyword}" at least 3 times. Include a <blockquote>, a <table>, and <!-- Alt: --> comment.${feedback}`,
    { temperature: 0.7, maxTokens: 8000 });
  const metaRaw = await callOpenAI(META_SYSTEM_PROMPT,
    `Article topic: "${topic}"\nFocus keyword: "${keyword}"\n\nArticle excerpt:\n${article.substring(0, 500)}`,
    { temperature: 0.3, maxTokens: 200 });
  let meta;
  try {
    meta = JSON.parse(metaRaw.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
  } catch {
    meta = { seo_title: topic.substring(0, 60), meta_description: topic.substring(0, 155), slug: keyword.toLowerCase().replace(/\s+/g, '-').substring(0, 60) };
  }
  const result = validateArticle(article, keyword, meta);
  return { article, meta, result, forceDraft: true };
}

// ── WordPress publish ───────────────────────────────────────────────────────
async function checkSlugExists(slug) {
  const { body } = await httpJson(
    `${WP_BASE}/wp/v2/posts?slug=${encodeURIComponent(slug)}&per_page=1`,
    { headers: { Authorization: WP_AUTH } },
  );
  return Array.isArray(body) && body.length > 0;
}

async function publishToWordPress(article, meta, status) {
  const wpPayload = {
    title: meta.seo_title.replace(/\s*\|.*$/, ''),
    content: article,
    status,
    slug: meta.slug,
  };

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

// ── Main pipeline ───────────────────────────────────────────────────────────
async function main() {
  log('=== Daily Blog Publisher ===');
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
  const { article, meta, result, forceDraft } = await generateWithValidation(entry.topic, entry.keyword);

  log('\n' + formatReport(result) + '\n');
  log(`Meta title: ${meta.seo_title} (${meta.seo_title.length} chars)`);
  log(`Meta desc: ${meta.meta_description} (${meta.meta_description.length} chars)`);
  log(`Slug: ${meta.slug}`);

  if (DRY_RUN) {
    log('\n=== DRY RUN — Article Preview ===');
    console.log(article);
    log('=== End Preview ===');
    return;
  }

  // Check slug collision
  const slugExists = await checkSlugExists(meta.slug);
  if (slugExists) {
    meta.slug = meta.slug + '-' + Date.now().toString(36).slice(-4);
    log(`Slug collision — using: ${meta.slug}`);
  }

  // Publish
  const publishStatus = (AS_DRAFT || forceDraft) ? 'draft' : 'publish';
  if (forceDraft && !AS_DRAFT) {
    log('SEO validation failed after retries — publishing as DRAFT for manual review');
  }

  log(`Publishing to WordPress as ${publishStatus}...`);
  const { postId, postLink, slug } = await publishToWordPress(article, meta, publishStatus);
  log(`Published: ID ${postId} | ${postLink}`);

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
