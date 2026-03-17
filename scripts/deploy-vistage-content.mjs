#!/usr/bin/env node
/**
 * Deploy the full Vistage rewrite content to post 3014.
 * Uses Content-Length header to ensure the full payload is sent.
 */

import https from 'node:https';
import fs from 'node:fs';

const WP_USER = 'andrew';
const WP_APP_PASS = 'EWqW lnfe Ara0 PGys lcBj 9x01';
const WP_BASE = 'https://soberfounders.org/wp-json';
const WP_AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString('base64');

function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = opts.body ? JSON.stringify(opts.body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...opts.headers,
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(url, {
      method: opts.method || 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Read the content from the deploy script (extract inline)
const CONTENT = fs.readFileSync('vistage-rewrite-content.html', 'utf8');

console.log(`Content length: ${CONTENT.length} chars`);
console.log('Updating post 3014...');

const { status, body } = await httpJson(`${WP_BASE}/wp/v2/posts/3014`, {
  method: 'POST',
  headers: { Authorization: WP_AUTH },
  body: { content: CONTENT },
});

if (status >= 400) {
  console.error(`Error (${status}):`, JSON.stringify(body));
  process.exit(1);
}

const rendered = body.content?.rendered || '';
const text = rendered.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const words = text.split(/\s+/).length;

console.log(`Status: ${status}`);
console.log(`Rendered content: ${rendered.length} chars`);
console.log(`Word count: ${words}`);
console.log(`Has comparison table: ${rendered.includes('Revenue Requirement')}`);
console.log(`Has FAQ: ${rendered.includes('Frequently Asked Questions')}`);
console.log(`Has Marcus blockquote: ${rendered.includes('Marcus')}`);
console.log(`Has FAQ schema: ${rendered.includes('FAQPage')}`);
console.log(`Has events CTA: ${rendered.includes('/events/')}`);
console.log(`Has keyword: ${rendered.includes('vistage for sober entrepreneurs')}`);
console.log('Done.');
