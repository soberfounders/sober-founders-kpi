#!/usr/bin/env node
/**
 * Rewrite an existing WordPress post using OpenAI + the full SEO/ICP system prompt.
 * Saves output to a local HTML file for review before pushing.
 *
 * Usage:
 *   node scripts/rewrite-post.mjs
 */

import 'dotenv/config';
import https from 'node:https';
import fs from 'node:fs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1); }

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

const SYSTEM = `You are a content writer for Sober Founders Inc. (soberfounders.org), a nonprofit that runs free masterminds and mentorship for sober entrepreneurs.

## ICP — Write for This Person
A U.S.-based entrepreneur in recovery, age 30-60, who owns a small to mid-sized business ($250K to several million revenue). They run solo or teams of 1-10 employees in professional services, wellness, trades, tech, or creative agencies. They value confidentiality around their recovery but are open to honest conversations in safe, curated spaces. They are looking for a peer community that understands both P&L statements and the realities of staying sober.

Core pain points to weave in where relevant:
1. Loneliness — no peer group that gets both entrepreneurship and recovery.
2. Cash flow volatility and financial uncertainty — past financial chaos, shame about wreckage.
3. Chronic stress — fear that business pressure could threaten recovery.
4. Boundary issues — overwork, difficulty saying no, underpricing, over-delivering.
5. Guilt and shame about past chaos — shows up in pricing, negotiations, and self-worth.
6. Ambivalence about being "out" — wrestling with how visible to be about recovery.
7. Work becoming the new compulsion — when the business replaces the old substance.

## Voice & Tone Rules (MANDATORY)
1. Peer-to-peer, not guru-to-follower — write as a fellow founder who has been there. Use "we" and "you" naturally.
2. Practical, specific, tactical — give actual scripts, dollar amounts, time frames, templates, checklists.
3. Hopeful but not cheesy — acknowledge difficulty honestly. "This is hard" before "here is what works."
4. Non-stigmatizing recovery language — use "in recovery," "sober entrepreneur," "founder in recovery." NEVER use "addict" as an identity label.
5. Lead with lived experience — specific scenarios (the client dinner, the investor meeting, the 2am anxiety spiral about making payroll).
6. Normalize ambivalence and struggle — not just success stories.
7. Emphasize safety and confidentiality.

## Writing Quality Rules (MANDATORY)
- DEPTH over breadth. Go deep on 4-6 sections rather than shallow on 10+.
- Each section needs at least 150-250 words of substantive content, not just a bulleted list.
- Tell micro-stories with specific details.
- Include at least ONE specific, usable template/script/checklist per article.
- Vary sentence length. Mix short punchy sentences with longer explanatory ones.
- Avoid starting consecutive paragraphs with the same word.
- Do NOT use generic filler like "In today's fast-paced world" or "As entrepreneurs, we all know..."

## 2026 SEO + GEO Framework (MANDATORY)
- Start the article with <p><em>Last updated: 2026-03-16</em></p>
- BLUF Method: First H2 must have an Atomic Answer Block — a 40-60 word self-contained answer in wiki-voice tone with at least one specific data point. This block must make sense if extracted and cited by an AI verbatim.
- Question-Based H2s: Structure all subheaders as natural language questions.
- Information Gain: Every article MUST contain unique insights — proprietary perspectives, specific member scenarios, or expert analysis.
- Modular Chunking: Use bulleted lists, tables, and short paragraphs (3-5 sentences max).
- Fact-Density Reinforcement: Include at least 2 statistic citations from credible sources (SAMHSA, NIDA, journal studies, etc.) with the source named inline.
- Include at least 1 direct quote from a hypothetical Phoenix Forum member as a <blockquote>. Include their first name, industry, and approximate revenue range.

### FAQ Section
- Add a FAQ section at the end with 4-5 Q&A pairs matching real search queries.

## Internal Linking (MANDATORY)
- Link to Phoenix Forum: <a href="https://soberfounders.org/phoenix-forum-registration/">Phoenix Forum</a>
- Link to weekly mastermind: <a href="https://soberfounders.org/weekly-mastermind-group/">free weekly mastermind</a>
- Link to at least 1 existing blog post:
  - <a href="https://soberfounders.org/12-steps-and-your-business/">12 Steps and Your Business</a>
  - <a href="https://soberfounders.org/entrepreneurial-operating-system-eos/">EOS for Sober Founders</a>
  - <a href="https://soberfounders.org/do-mastermind-groups-help-sober-entrepreneurs/">Do Mastermind Groups Help Sober Entrepreneurs?</a>
  - <a href="https://soberfounders.org/peer-advisory-sober-entrepreneurs/">Peer Advisory for Sober Entrepreneurs</a>
Do NOT dump all links in one paragraph. Spread them across different sections.

## On-Page SEO Checklist
- Focus keyword in first 100 words, at least one H2, and 3-5 more times naturally.
- Use semantic variations of the keyword.
- At least one image alt text suggestion as an HTML comment.
- Short paragraphs (3-5 sentences max).

## Content Rules
- Article length: 1,800-2,500 words MINIMUM.
- Include a contextual CTA to <a href="https://soberfounders.org">Sober Founders</a>.
- Do not start with "Discover" or "Learn"
- No clickbait, no ALL CAPS headlines

## Output Format
Return ONLY valid HTML content. Use <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <blockquote>, <strong>, <em>, <a> tags. Do NOT include <html>, <head>, <body>, or <h1> tags. Do not wrap output in code fences.`;

const USER = `You are REWRITING an existing blog post. The current post is titled "Entrepreneurs in Recovery: The Unique Support Network at Sober Founders" and it is weak: generic AI-sounding copy, no statistics, no real scenarios, no internal links, vague FAQ answers, no BLUF, headers are not question-based, and it reads like a brochure.

Rewrite this post from scratch targeting these keywords:
- Primary: "entrepreneurs in recovery"
- Secondary: "sober entrepreneur", "addiction and entrepreneurship", "sober business owner"

This is Tier 1 Critical content — Sober Founders should be the #1 result for "entrepreneurs in recovery." The post currently ranks at position 11.3 on Google with 20 impressions and needs to move to page 1.

GSC data shows these related queries people are searching:
- "sober entrepreneurs" (30 impressions, position 3.0)
- "entrepreneurs in recovery" (20 impressions, position 11.3)
- "sober community" (7 impressions)
- "percentage of entrepreneurs with mental health issues" (1 impression, position 7.0)

Make this the definitive resource on entrepreneurship and recovery. Go deep on WHY entrepreneurs are disproportionately affected by addiction, HOW recovery actually makes you a better founder, and WHAT specific support looks like (with Sober Founders as the example, not the sales pitch).

Key stats to work in naturally:
- SAMHSA: ~46.3 million Americans aged 12+ had a substance use disorder in 2021
- Michael Freeman (UCSF) study: entrepreneurs are 2x more likely to suffer from addiction than the general population
- National Survey on Drug Use and Health data on substance use among self-employed professionals

Remember: this is a REWRITE of the page at /entrepreneurs-in-recovery/ — do NOT link back to itself. Link to the other internal pages instead.

CRITICAL LENGTH REQUIREMENT: The article MUST be at least 2,000 words. Count your output. Your last attempt was only 900 words — that is unacceptable. Each of your 5-6 H2 sections needs 200-300 words of SUBSTANTIVE prose, not surface-level summaries. Tell specific stories. Paint scenarios. Give dollar amounts, time frames, and names.

CRITICAL FAQ FORMAT: The FAQ section MUST use this exact HTML structure:
<h2>Frequently Asked Questions</h2>
<h3>Question text here?</h3>
<p>Answer paragraph here.</p>
(Repeat for 4-5 questions. Do NOT use <ul>/<li> for the FAQ section.)

CRITICAL DEPTH REQUIREMENT: Do NOT write like a marketing brochure. Write like a founder who has been sober for 6 years and is telling another founder what they wish someone had told them. Include:
- At least 2 detailed micro-stories (100+ words each) about specific scenarios founders face
- A complete, copy-paste-ready checklist or template (not just 3 bullet points)
- Specific numbers: dollar amounts, percentages, time frames
- Name the tension between recovery and business honestly — do not gloss over it

YOUR OUTPUT MUST EXCEED 12,000 CHARACTERS OF HTML. If your output is under 12,000 characters, you have failed the task. Write long, detailed, substantive sections. Do not summarize — elaborate.`;

console.log('Generating rewrite via OpenAI...');
const { body } = await httpJson('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
  body: {
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    temperature: 0.7,
    max_tokens: 10000,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: USER },
    ],
  },
});

const article = body?.choices?.[0]?.message?.content?.trim();
if (!article) { console.error('Empty response:', JSON.stringify(body)); process.exit(1); }

console.log(`Article generated (${article.length} chars)`);
fs.writeFileSync('rewrite-entrepreneurs-in-recovery.html', article);
console.log('Saved to rewrite-entrepreneurs-in-recovery.html');
