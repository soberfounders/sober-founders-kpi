#!/usr/bin/env node
/**
 * Content Calendar Expander — Sober Founders
 *
 * Generates new topic/keyword entries when the queue runs low.
 * Uses OpenAI to create fresh angles from existing keyword categories.
 *
 * Usage:
 *   node scripts/expand-calendar.mjs              # add 14 new entries
 *   node scripts/expand-calendar.mjs --count 7    # add 7 new entries
 *   node scripts/expand-calendar.mjs --dry-run    # preview without saving
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CALENDAR_PATH = path.join(__dirname, 'content-calendar.json');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

if (!OPENAI_API_KEY) { console.error('Missing OPENAI_API_KEY in .env'); process.exit(1); }

// ── CLI args ────────────────────────────────────────────────────────────────
function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const DRY_RUN = process.argv.includes('--dry-run');
const COUNT = parseInt(getArg('--count') || '14', 10);

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
async function callOpenAI(systemPrompt, userPrompt) {
  const { body } = await httpJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: {
      model: OPENAI_MODEL,
      temperature: 0.8,
      max_tokens: 3000,
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

// ── Expansion prompt ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You generate blog topic ideas for Sober Founders (soberfounders.org), a nonprofit for sober entrepreneurs.

## Target Audience (ICP)
U.S.-based entrepreneur in recovery, age 30–60, small to mid-sized business ($250K to several million revenue). They value confidentiality, peer community, and practical business advice through the lens of sobriety.

## Keyword Categories
1. recovery-business: Intersection of addiction recovery and entrepreneurship
2. peer-advisory: Mastermind groups, peer advisory, accountability groups
3. competitor: Comparisons with EO, YPO, Vistage, Tiger 21
4. long-tail: Question-based queries about sober business life
5. brand: Sober Founders brand-specific content

## Topic Generation Rules
- Each topic must have a clear SEO keyword target (2-5 words)
- Topics should be specific and tactical, not generic
- Mix seasonal angles, sub-topic deep dives, and fresh pain-point angles
- Include both awareness (top of funnel) and consideration (mid-funnel) topics
- Every topic should naturally lead readers toward the Phoenix Forum or weekly mastermind
- Use current month/quarter context for timely angles
- Avoid duplicating the existing topics provided

## Output Format
Return a JSON array of objects, each with:
- "keyword": the primary SEO keyword (2-5 words)
- "topic": compelling article title (under 80 chars)
- "category": one of the 5 categories above
- "priority": "high" or "medium"

Return ONLY the JSON array. No explanation or code fences.`;

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Expanding calendar by ${COUNT} entries...`);

  const calendar = JSON.parse(fs.readFileSync(CALENDAR_PATH, 'utf-8'));
  const existingTopics = calendar.entries.map((e) => `${e.keyword} | ${e.topic}`).join('\n');
  const maxId = Math.max(...calendar.entries.map((e) => e.id), 0);

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const userPrompt = `Generate ${COUNT} new blog topics for ${currentMonth}.

EXISTING TOPICS (do NOT duplicate these):
${existingTopics}

Generate ${COUNT} fresh, unique topics spread across all 5 categories. Favor "recovery-business" and "long-tail" categories.`;

  console.log('Calling OpenAI...');
  const raw = await callOpenAI(SYSTEM_PROMPT, userPrompt);

  let newEntries;
  try {
    newEntries = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
  } catch {
    console.error('Failed to parse response:', raw.substring(0, 500));
    process.exit(1);
  }

  if (!Array.isArray(newEntries)) {
    console.error('Response is not an array:', typeof newEntries);
    process.exit(1);
  }

  // Deduplicate against existing keywords
  const existingKeywords = new Set(calendar.entries.map((e) => e.keyword.toLowerCase()));
  const filtered = newEntries.filter((e) => !existingKeywords.has(e.keyword?.toLowerCase()));

  console.log(`Generated ${newEntries.length} topics, ${filtered.length} are unique.\n`);

  const entries = filtered.slice(0, COUNT).map((e, i) => ({
    id: maxId + i + 1,
    keyword: e.keyword,
    topic: e.topic,
    category: e.category || 'recovery-business',
    priority: e.priority || 'medium',
    status: 'queued',
    publishedDate: null,
    wpPostId: null,
    wpSlug: null,
    seoScore: null,
  }));

  for (const e of entries) {
    console.log(`  [${e.id}] (${e.priority}) ${e.keyword} — "${e.topic}"`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — not saving.');
    return;
  }

  calendar.entries.push(...entries);
  calendar.meta.lastExpanded = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(CALENDAR_PATH, JSON.stringify(calendar, null, 2) + '\n');

  console.log(`\nSaved ${entries.length} new entries. Total: ${calendar.entries.length}`);
  console.log(`Queued: ${calendar.entries.filter((e) => e.status === 'queued').length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
