#!/usr/bin/env node
/**
 * Autonomous Article Publishing Pipeline
 *
 * Generates an SEO-optimized article aligned to the Sober Founders ICP,
 * publishes it to WordPress, and sets Yoast SEO fields.
 *
 * Usage:
 *   node scripts/publish-article.mjs --topic "How to network without alcohol" --keyword "sober networking"
 *   node scripts/publish-article.mjs --topic "..." --keyword "..." --dry-run     # preview only
 *   node scripts/publish-article.mjs --topic "..." --keyword "..." --draft       # publish as draft
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

// ── CLI args ────────────────────────────────────────────────────────────────
function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const TOPIC = getArg('--topic');
const KEYWORD = getArg('--keyword');
const DRY_RUN = process.argv.includes('--dry-run');
const AS_DRAFT = process.argv.includes('--draft');
const SLUG = getArg('--slug');
const CATEGORY = getArg('--category');

if (!TOPIC || !KEYWORD) {
  console.error('Usage: node scripts/publish-article.mjs --topic "..." --keyword "..." [--dry-run] [--draft] [--slug short-slug] [--category name]');
  process.exit(1);
}

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

// ── System prompt (ICP + voice + SEO structure) ─────────────────────────────
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

// ── Main pipeline ───────────────────────────────────────────────────────────
async function main() {
  console.log(`Topic: ${TOPIC}`);
  console.log(`Keyword: ${KEYWORD}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : AS_DRAFT ? 'DRAFT' : 'PUBLISH'}\n`);

  // Step 1: Generate article
  console.log('Generating article...');
  const article = await callOpenAI(
    ARTICLE_SYSTEM_PROMPT,
    `Write an article about: "${TOPIC}"\n\nPrimary focus keyword: "${KEYWORD}"\n\nTarget audience: sober entrepreneurs and founders in recovery.`,
    { temperature: 0.7, maxTokens: 6000 },
  );
  console.log(`  Article generated (${article.length} chars)\n`);

  // Step 2: Generate SEO metadata
  console.log('Generating SEO metadata...');
  const metaRaw = await callOpenAI(
    META_SYSTEM_PROMPT,
    `Article topic: "${TOPIC}"\nFocus keyword: "${KEYWORD}"\n\nArticle excerpt (first 500 chars):\n${article.substring(0, 500)}`,
    { temperature: 0.3, maxTokens: 200 },
  );

  let meta;
  try {
    meta = JSON.parse(metaRaw.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
  } catch {
    console.error('Failed to parse SEO metadata:', metaRaw);
    process.exit(1);
  }

  // CLI overrides
  if (SLUG) meta.slug = SLUG;

  console.log(`  Title: ${meta.seo_title} (${meta.seo_title.length} chars)`);
  console.log(`  Description: ${meta.meta_description} (${meta.meta_description.length} chars)`);
  console.log(`  Slug: ${meta.slug}\n`);

  if (DRY_RUN) {
    console.log('=== DRY RUN — Article Preview ===\n');
    console.log(article);
    console.log('\n=== End Preview ===');
    return;
  }

  // Step 3: Publish to WordPress
  console.log('Publishing to WordPress...');
  const wpPayload = {
    title: meta.seo_title.replace(/\s*\|.*$/, ''), // strip "| Sober Founders" from WP title
    content: article,
    status: AS_DRAFT ? 'draft' : 'publish',
    slug: meta.slug,
  };

  // Resolve category ID if provided
  if (CATEGORY) {
    const { body: cats } = await httpJson(
      `${WP_BASE}/wp/v2/categories?search=${encodeURIComponent(CATEGORY)}&per_page=5`,
      { headers: { Authorization: WP_AUTH } },
    );
    if (Array.isArray(cats) && cats.length > 0) {
      wpPayload.categories = [cats[0].id];
      console.log(`  Category: ${cats[0].name} (ID: ${cats[0].id})`);
    }
  }

  const { status, body } = await httpJson(`${WP_BASE}/wp/v2/posts`, {
    method: 'POST',
    headers: { Authorization: WP_AUTH },
    body: wpPayload,
  });

  if (status >= 400) {
    console.error(`  WordPress error (${status}):`, JSON.stringify(body));
    process.exit(1);
  }

  const postId = body.id;
  const postLink = body.link;
  console.log(`  Published: ID ${postId}`);
  console.log(`  URL: ${postLink}\n`);

  // Step 4: Set Yoast SEO fields
  console.log('Setting Yoast SEO fields...');
  const { body: seoResult } = await httpJson(`${WP_BASE}/sober/v1/seo`, {
    method: 'POST',
    headers: { Authorization: WP_AUTH },
    body: {
      post_id: postId,
      title: meta.seo_title,
      description: meta.meta_description,
      focus_keyword: KEYWORD,
    },
  });

  if (seoResult?.success) {
    console.log(`  SEO fields set: ${seoResult.updated.join(', ')}\n`);
  } else {
    console.error('  SEO write failed:', JSON.stringify(seoResult));
  }

  // Step 5: Verify
  console.log('Verifying...');
  const { body: verify } = await httpJson(
    `${WP_BASE}/sober/v1/seo/${postId}`,
    { headers: { Authorization: WP_AUTH } },
  );
  console.log(`  Title: ${verify.title}`);
  console.log(`  Description: ${verify.description}`);
  console.log(`  Focus keyword: ${verify.focus_keyword}`);

  console.log(`\nDone. Post live at: ${postLink}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
