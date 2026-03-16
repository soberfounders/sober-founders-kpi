#!/usr/bin/env node
/**
 * Google Search Console OAuth2 Setup
 *
 * Starts a temporary local server, opens the Google OAuth consent screen,
 * captures the authorization code, and exchanges it for a refresh token.
 *
 * Prerequisites:
 *   1. Add http://localhost:3333/callback as an authorized redirect URI
 *      in Google Cloud Console for your OAuth 2.0 Web Client ID.
 *   2. Enable the Search Console API in your Google Cloud project.
 *   3. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 *
 * Usage:
 *   node scripts/gsc-auth.mjs
 */

import 'dotenv/config';
import http from 'node:http';
import https from 'node:https';
import { execSync } from 'node:child_process';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3333/callback';
const SCOPES = 'https://www.googleapis.com/auth/webmasters.readonly';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
  process.exit(1);
}

function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...opts.headers },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n=== Google Search Console OAuth Setup ===\n');
console.log('Opening browser for authorization...\n');
console.log('If the browser does not open, visit this URL manually:\n');
console.log(authUrl);
console.log('\nWaiting for callback on http://localhost:3333/callback ...\n');

// Try to open browser
try {
  if (process.platform === 'win32') execSync(`start "" "${authUrl}"`);
  else if (process.platform === 'darwin') execSync(`open "${authUrl}"`);
  else execSync(`xdg-open "${authUrl}"`);
} catch { /* browser open failed, user can use the URL above */ }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3333');

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>Authorization failed</h1><p>Error: ${error}</p>`);
    console.error(`Authorization failed: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h1>No authorization code received</h1>`);
    return;
  }

  // Exchange code for tokens
  console.log('Authorization code received. Exchanging for tokens...');

  const tokenBody = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  }).toString();

  const { body } = await httpJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: tokenBody,
  });

  if (body.refresh_token) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>Success!</h1><p>You can close this tab. Check the terminal for your refresh token.</p>`);

    console.log('\n=== SUCCESS ===\n');
    console.log('Add this to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${body.refresh_token}`);
    console.log('\nThen run: node scripts/gsc-keyword-audit.mjs\n');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>Token exchange failed</h1><pre>${JSON.stringify(body, null, 2)}</pre>`);
    console.error('Token exchange failed:', JSON.stringify(body, null, 2));
  }

  server.close();
});

server.listen(3333, () => {
  console.log('Local server listening on port 3333...');
});
