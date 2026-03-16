#!/usr/bin/env node
/**
 * Google Search Console Keyword Audit
 *
 * Pulls actual search query data from GSC to understand:
 * - What keywords we're already ranking for
 * - Impressions, clicks, CTR, average position
 * - Quick wins (high impressions, low CTR = improve content)
 * - Gaps (keywords we should rank for but don't)
 *
 * Usage:
 *   node scripts/gsc-keyword-audit.mjs                    # last 90 days
 *   node scripts/gsc-keyword-audit.mjs --days 30          # last 30 days
 *   node scripts/gsc-keyword-audit.mjs --pages             # also show top pages
 */

import 'dotenv/config';
import https from 'node:https';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SITE_URL = process.env.GSC_SITE_URL || 'https://soberfounders.org/';

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN in .env');
  process.exit(1);
}

const DAYS = (() => {
  const idx = process.argv.indexOf('--days');
  return idx !== -1 ? Number(process.argv[idx + 1]) : 90;
})();
const SHOW_PAGES = process.argv.includes('--pages');

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

// ── Auth ────────────────────────────────────────────────────────────────────
async function getAccessToken() {
  const { body } = await httpJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    },
  });
  if (!body.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(body));
  return body.access_token;
}

// ── GSC Query ───────────────────────────────────────────────────────────────
async function queryGSC(token, dimensions, rowLimit = 1000) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS);

  const { body } = await httpJson(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        dimensions,
        rowLimit,
        dataState: 'all',
      },
    },
  );
  return body;
}

// ── Formatting ──────────────────────────────────────────────────────────────
function pad(str, len) {
  const s = String(str);
  return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i]).length))
  );
  console.log(headers.map((h, i) => pad(h, widths[i])).join('  '));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  rows.forEach(row => {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '));
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`GSC Keyword Audit — Last ${DAYS} days`);
  console.log(`Site: ${SITE_URL}\n`);

  const token = await getAccessToken();

  // 1. Top queries
  console.log('═══ TOP QUERIES (by impressions) ═══\n');
  const queries = await queryGSC(token, ['query'], 500);
  if (!queries.rows?.length) {
    console.log('No data returned from GSC. Check that the site is verified.\n');
    return;
  }

  const qRows = queries.rows
    .sort((a, b) => b.impressions - a.impressions)
    .map(r => [
      r.keys[0],
      r.clicks.toString(),
      r.impressions.toString(),
      (r.ctr * 100).toFixed(1) + '%',
      r.position.toFixed(1),
    ]);

  printTable(['Query', 'Clicks', 'Impressions', 'CTR', 'Avg Pos'], qRows.slice(0, 50));

  // 2. Quick wins: high impressions, low CTR, rankable position
  console.log('\n\n═══ QUICK WINS (high impressions, CTR < 3%, position 4-20) ═══\n');
  const quickWins = queries.rows
    .filter(r => r.impressions >= 10 && r.ctr < 0.03 && r.position >= 4 && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20)
    .map(r => [
      r.keys[0],
      r.clicks.toString(),
      r.impressions.toString(),
      (r.ctr * 100).toFixed(1) + '%',
      r.position.toFixed(1),
    ]);

  if (quickWins.length) {
    printTable(['Query', 'Clicks', 'Impressions', 'CTR', 'Avg Pos'], quickWins);
    console.log('\n→ These queries get impressions but few clicks. Improve title tags, meta descriptions, or content to boost CTR.');
  } else {
    console.log('No quick wins found in this date range.');
  }

  // 3. Almost page 1 (position 8-20)
  console.log('\n\n═══ ALMOST PAGE 1 (position 8-20, 10+ impressions) ═══\n');
  const almostPage1 = queries.rows
    .filter(r => r.impressions >= 10 && r.position >= 8 && r.position <= 20)
    .sort((a, b) => a.position - b.position)
    .slice(0, 20)
    .map(r => [
      r.keys[0],
      r.clicks.toString(),
      r.impressions.toString(),
      (r.ctr * 100).toFixed(1) + '%',
      r.position.toFixed(1),
    ]);

  if (almostPage1.length) {
    printTable(['Query', 'Clicks', 'Impressions', 'CTR', 'Avg Pos'], almostPage1);
    console.log('\n→ These are close to page 1. A content refresh or backlink could push them up.');
  }

  // 4. Top pages
  if (SHOW_PAGES) {
    console.log('\n\n═══ TOP PAGES (by clicks) ═══\n');
    const pages = await queryGSC(token, ['page'], 100);
    const pRows = (pages.rows || [])
      .sort((a, b) => b.clicks - a.clicks)
      .map(r => [
        r.keys[0].replace(SITE_URL, '/').replace('https://soberfounders.org', ''),
        r.clicks.toString(),
        r.impressions.toString(),
        (r.ctr * 100).toFixed(1) + '%',
        r.position.toFixed(1),
      ]);
    printTable(['Page', 'Clicks', 'Impressions', 'CTR', 'Avg Pos'], pRows.slice(0, 30));
  }

  // 5. Summary stats
  const totalClicks = queries.rows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = queries.rows.reduce((s, r) => s + r.impressions, 0);
  const avgCTR = totalClicks / totalImpressions;

  console.log('\n\n═══ SUMMARY ═══\n');
  console.log(`Total unique queries: ${queries.rows.length}`);
  console.log(`Total clicks: ${totalClicks.toLocaleString()}`);
  console.log(`Total impressions: ${totalImpressions.toLocaleString()}`);
  console.log(`Average CTR: ${(avgCTR * 100).toFixed(2)}%`);
}

main().catch((err) => { console.error(err); process.exit(1); });
