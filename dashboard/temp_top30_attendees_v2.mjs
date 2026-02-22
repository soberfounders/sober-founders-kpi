import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { buildAliasMap, resolveCanonicalAttendeeName } from './src/lib/attendeeCanonicalization.js';

const LOOKBACK_DAYS = 120;
const ATTRIBUTION_LOOKBACK_DAYS = 365;
const PAGE = 1000;

function readEnv(path) {
  const out = {};
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}
function parseDateKey(value) { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0,10) : null; }
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function normalizeName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]s\s*(iphone|ipad|android|galaxy|phone|pc|macbook|desktop|laptop)$/gi, '')
    .replace(/\((iphone|ipad|android|galaxy|phone)\)$/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function fullName(r) { return `${String(r?.firstname || '').trim()} ${String(r?.lastname || '').trim()}`.trim(); }
function contactCreatedTs(r) { const ts = Date.parse(r?.createdate || ''); return Number.isFinite(ts) ? ts : 0; }
function contactScore(r) {
  let s = 0;
  if (r?.annual_revenue_in_dollars__official_ !== null && r?.annual_revenue_in_dollars__official_ !== undefined && r?.annual_revenue_in_dollars__official_ !== '') s += 4;
  else if (r?.annual_revenue_in_dollars !== null && r?.annual_revenue_in_dollars !== undefined && r?.annual_revenue_in_dollars !== '') s += 2;
  if (r?.sobriety_date) s += 1;
  if (r?.hs_analytics_source) s += 1;
  if (r?.hs_analytics_source_data_1) s += 1;
  if (r?.hs_analytics_source_data_2) s += 1;
  return s;
}
function pickBestContact(candidates, eventDateKey) {
  if (!candidates?.length) return { contact: null, matchType: 'not_found', candidateCount: 0 };
  if (candidates.length === 1) return { contact: candidates[0], matchType: 'exact_name', candidateCount: 1 };
  const eventTs = eventDateKey ? Date.parse(`${eventDateKey}T00:00:00.000Z`) : NaN;
  let best = null, bestScore = -Infinity, bestDist = Infinity, bestCreated = -Infinity;
  for (const c of candidates) {
    const s = contactScore(c);
    const created = contactCreatedTs(c);
    const dist = Number.isFinite(eventTs) ? Math.abs(eventTs - created) : Infinity;
    if (s > bestScore || (s === bestScore && dist < bestDist) || (s === bestScore && dist === bestDist && created > bestCreated)) {
      best = c; bestScore = s; bestDist = dist; bestCreated = created;
    }
  }
  return { contact: best || candidates[0], matchType: 'ambiguous_name', candidateCount: candidates.length };
}
function resolveRevenue(contact) {
  const off = Number(contact?.annual_revenue_in_dollars__official_); if (Number.isFinite(off)) return off;
  const fb = Number(contact?.annual_revenue_in_dollars); if (Number.isFinite(fb)) return fb;
  return null;
}
function sourceBucketFromContact(contact) {
  const src = String(contact?.hs_analytics_source || '').trim().toUpperCase();
  if (!src) return 'Unknown';
  if (src === 'PAID_SOCIAL') return 'Paid Social (Meta)';
  if (src === 'ORGANIC_SEARCH') return 'Organic Search';
  if (src === 'REFERRALS') return 'Referral';
  if (src === 'DIRECT_TRAFFIC') return 'Direct';
  if (src === 'EMAIL_MARKETING') return 'Email';
  if (src === 'PAID_SEARCH') return 'Paid Search';
  if (src === 'SOCIAL_MEDIA') return 'Social (Organic)';
  return src.replace(/_/g, ' ');
}
function normalizeAnswerLabel(answerRow) {
  return [answerRow?.label, answerRow?.question, answerRow?.prompt, answerRow?.title, answerRow?.key, answerRow?.field_label]
    .map((v) => String(v || '').trim().toLowerCase()).filter(Boolean).join(' | ');
}
function answerValueToText(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (Array.isArray(raw)) return raw.map(answerValueToText).filter(Boolean).join(', ');
  if (typeof raw === 'object') {
    const p = raw.answer ?? raw.value ?? raw.label ?? raw.text ?? raw.name ?? null;
    if (p !== null && p !== undefined) return answerValueToText(p);
    try { return JSON.stringify(raw); } catch { return ''; }
  }
  return String(raw).trim();
}
function extractHearAboutAnswer(answers) {
  if (!Array.isArray(answers)) return null;
  const m = answers.find((row) => {
    const label = normalizeAnswerLabel(row);
    return label && ((label.includes('how did you hear') && label.includes('sober founders')) || label.includes('how did you hear about'));
  });
  if (!m) return null;
  return answerValueToText(m?.answer ?? m?.value ?? m?.response ?? m?.selected_option ?? m?.selected_options ?? m?.text) || null;
}
function classifyHearAbout(value) {
  const t = String(value || '').trim(); if (!t) return 'Unknown';
  const n = ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const hasAny = (arr) => arr.some((p) => n.includes(` ${p} `));
  if (hasAny(['chatgpt','openai','gpt','ai','claude','gemini','perplexity'])) return 'ChatGPT / AI';
  if (hasAny(['google','googled','search','youtube','google ads','google ad','seo'])) return 'Google';
  if (hasAny(['refer','referral','referred','friend','word of mouth','recommendation','recommended','someone sent me','community'])) return 'Referral';
  if (hasAny(['instagram','insta','ig','facebook','fb','meta','facebook ad','facebook ads','fb ad','fb ads','meta ad','meta ads','ads manager','paid social'])) return 'Meta (Facebook/Instagram)';
  const compact = t.replace(/\s+/g, ' ').trim();
  const lower = compact.toLowerCase();
  const placeholder = ['n/a','na','none','unknown','not sure','not answering','no'].includes(lower);
  const personLike = compact.replace(/[^a-zA-Z\s.-]/g, ' ').split(/\s+/).filter(Boolean);
  if (!placeholder && personLike.length >= 1 && personLike.length <= 3 && personLike.every((tok) => /^[a-zA-Z][a-zA-Z.-]*$/.test(tok))) return 'Referral';
  return 'Other';
}
function sourceBucketFromLumaEvidence(ev) {
  if (!ev) return { bucket: 'Unknown', method: 'No Luma Evidence' };
  const ots = String(ev.originalTrafficSource || '').trim().toUpperCase();
  const heard = String(ev.hearAboutCategory || '').trim();
  const heardBucket =
    heard === 'Meta (Facebook/Instagram)' ? { bucket:'Paid Social (Meta)', method:'Luma How Heard' } :
    heard === 'Google' ? { bucket:'Organic Search', method:'Luma How Heard' } :
    heard === 'Referral' ? { bucket:'Referral', method:'Luma How Heard' } :
    heard === 'ChatGPT / AI' ? { bucket:'ChatGPT / AI', method:'Luma How Heard' } :
    heard === 'Other' ? { bucket:'Other', method:'Luma How Heard' } :
    { bucket:'Unknown', method:'No Luma Attribution' };
  if (ots === 'OFFLINE' && heardBucket.bucket !== 'Unknown' && heardBucket.bucket !== 'Other') {
    return { ...heardBucket, method: `${heardBucket.method} (preferred over Lu.ma HubSpot OFFLINE)` };
  }
  if (ots && ots !== 'NOT FOUND') {
    const m = { PAID_SOCIAL:'Paid Social (Meta)', ORGANIC_SEARCH:'Organic Search', REFERRALS:'Referral', DIRECT_TRAFFIC:'Direct', EMAIL_MARKETING:'Email', PAID_SEARCH:'Paid Search', SOCIAL_MEDIA:'Social (Organic)', OFFLINE:'OFFLINE' };
    return { bucket: m[ots] || ots.replace(/_/g, ' '), method: 'Luma HubSpot Original Source' };
  }
  return heardBucket;
}
async function pagedSelect(table, columns, gteCol, gteValue) {
  let from = 0; let all = [];
  for (;;) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (gteCol && gteValue) q = q.gte(gteCol, gteValue);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const env = readEnv('.env');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const start = new Date(); start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);
const startKey = start.toISOString().slice(0,10);
const attrStart = new Date(); attrStart.setUTCDate(attrStart.getUTCDate() - ATTRIBUTION_LOOKBACK_DAYS);
const attrStartKey = attrStart.toISOString().slice(0,10);

const zoomRows = await pagedSelect('kpi_metrics', 'metric_name,metric_date,metadata', 'metric_date', startKey);
const zoomFiltered = zoomRows.filter(r => r.metric_name === 'Zoom Meeting Attendees');
const hubspotRows = await pagedSelect('raw_hubspot_contacts', 'hubspot_contact_id,createdate,email,hs_additional_emails,firstname,lastname,annual_revenue_in_dollars,annual_revenue_in_dollars__official_,sobriety_date,hs_analytics_source,hs_analytics_source_data_1,hs_analytics_source_data_2,campaign', 'createdate', `${attrStartKey}T00:00:00.000Z`);
const lumaRows = await pagedSelect('raw_luma_registrations', 'guest_name,guest_email,event_date,event_start_at,registered_at,approval_status,is_thursday,registration_answers,matched_zoom,matched_hubspot,matched_hubspot_name,matched_hubspot_email,matched_hubspot_contact_id', 'event_date', attrStartKey);
const aliasRows = await pagedSelect('attendee_aliases', 'original_name,target_name');

const aliasMap = buildAliasMap(aliasRows || []);
const hubspotNameIndex = new Map();
const hubspotByEmail = new Map();
for (const row of hubspotRows) {
  const nk = normalizeName(fullName(row));
  if (nk) { if (!hubspotNameIndex.has(nk)) hubspotNameIndex.set(nk, []); hubspotNameIndex.get(nk).push(row); }
  for (const e of [normalizeEmail(row.email), ...String(row.hs_additional_emails || '').split(',').map(normalizeEmail)]) {
    if (!e) continue;
    if (!hubspotByEmail.has(e)) hubspotByEmail.set(e, []);
    hubspotByEmail.get(e).push(row);
  }
}

function pickBestLumaEvidence(existing, candidate) {
  if (!existing) return candidate;
  const score = (r) => (r.originalTrafficSource !== 'Not Found' ? 4 : 0) + (r.hearAboutCategory !== 'Unknown' ? 2 : 0) + (r.hearAbout ? 1 : 0) + (r.matchedZoom ? 1 : 0);
  return score(candidate) > score(existing) ? candidate : existing;
}
const lumaEvidenceByEmail = new Map();
const lumaEvidenceByName = new Map();
for (const row of lumaRows) {
  const approval = String(row?.approval_status || 'approved').toLowerCase();
  if (approval && approval !== 'approved') continue;
  const email = normalizeEmail(row.guest_email);
  const cands = email ? (hubspotByEmail.get(email) || []) : [];
  const contact = pickBestContact(cands, parseDateKey(row.event_date || row.registered_at)).contact;
  const hearAbout = extractHearAboutAnswer(row.registration_answers);
  const ev = {
    name: String(row.guest_name || '').trim() || 'Not Found',
    email: email || 'Not Found',
    matchedZoom: !!row.matched_zoom,
    matchedHubspot: !!row.matched_hubspot,
    matchedHubspotName: row?.matched_hubspot_name || null,
    matchedHubspotEmail: row?.matched_hubspot_email || null,
    hearAbout,
    hearAboutCategory: classifyHearAbout(hearAbout),
    originalTrafficSource: contact?.hs_analytics_source || 'Not Found'
  };
  if (email && email !== 'not found') lumaEvidenceByEmail.set(email, pickBestLumaEvidence(lumaEvidenceByEmail.get(email), ev));
  const nk = normalizeName(ev.name);
  if (nk) lumaEvidenceByName.set(nk, pickBestLumaEvidence(lumaEvidenceByName.get(nk), ev));
}

function dayType(row) {
  const md = row?.metadata || {};
  const group = String(md.group_name || '').toLowerCase();
  if (group === 'tuesday' || group === 'thursday') return group[0].toUpperCase() + group.slice(1);
  const meetingId = String(md.meeting_id || '');
  if (meetingId === '87199667045') return 'Tuesday';
  if (meetingId === '84242212480') return 'Thursday';
  const dk = parseDateKey(md.start_time || row.metric_date);
  if (!dk) return 'Other';
  const dow = new Date(`${dk}T00:00:00.000Z`).getUTCDay();
  if (dow === 2) return 'Tuesday';
  if (dow === 4) return 'Thursday';
  return 'Other';
}

const history = new Map();
for (const row of zoomFiltered) {
  const dateKey = parseDateKey(row?.metadata?.start_time || row?.metric_date);
  if (!dateKey || dateKey < startKey) continue;
  const dt = dayType(row);
  if (dt !== 'Tuesday' && dt !== 'Thursday') continue;
  const attendees = Array.isArray(row?.metadata?.attendees) ? row.metadata.attendees : [];
  const dedup = new Map();
  for (const raw of attendees) {
    const canonical = resolveCanonicalAttendeeName(raw, aliasMap) || String(raw || '').trim();
    const key = normalizeName(canonical);
    if (!key) continue;
    if (!dedup.has(key)) dedup.set(key, canonical);
  }
  for (const [attendeeKey, attendeeName] of dedup.entries()) {
    if (!history.has(attendeeKey)) history.set(attendeeKey, { attendeeKey, attendeeName, total: 0, tuesday: 0, thursday: 0, firstSeen: dateKey, lastSeen: dateKey });
    const h = history.get(attendeeKey);
    h.total += 1;
    if (dt === 'Tuesday') h.tuesday += 1;
    if (dt === 'Thursday') h.thursday += 1;
    if (dateKey < h.firstSeen) h.firstSeen = dateKey;
    if (dateKey > h.lastSeen) h.lastSeen = dateKey;
  }
}

const top30 = Array.from(history.values()).map((h) => {
  const match = pickBestContact(hubspotNameIndex.get(h.attendeeKey) || [], h.lastSeen);
  const contact = match.contact;
  const revenue = resolveRevenue(contact || {});
  const contactBucket = sourceBucketFromContact(contact);
  const em = normalizeEmail(contact?.email);
  const ev = (em && lumaEvidenceByEmail.get(em)) || lumaEvidenceByName.get(h.attendeeKey) || null;
  const lumaFallback = sourceBucketFromLumaEvidence(ev);
  const ots = String(contact?.hs_analytics_source || '').trim().toUpperCase();
  const d1 = String(contact?.hs_analytics_source_data_1 || '').trim().toUpperCase();
  const offlineIntegration = ots === 'OFFLINE' && (d1 === 'INTEGRATION' || d1 === 'CRM_UI');
  const useFallback = lumaFallback.bucket !== 'Unknown' && (
    contactBucket === 'Unknown' ||
    contactBucket === 'Other' ||
    (offlineIntegration && lumaFallback.bucket !== 'Other')
  );
  const sourceBucket = useFallback ? lumaFallback.bucket : contactBucket;
  const sourceAttributionMethod = useFallback
    ? (contact ? (offlineIntegration ? `HubSpot OFFLINE -> ${lumaFallback.method}` : `HubSpot Unknown -> ${lumaFallback.method}`) : lumaFallback.method)
    : (contact ? 'HubSpot Original Source' : 'Unattributed');
  let missingReason = '';
  if (!contact) {
    if (ev) {
      if (String(ev.originalTrafficSource || '').trim().toUpperCase() !== 'NOT FOUND') {
        missingReason = 'No HubSpot contact match by Zoom name; using Lu.ma-linked HubSpot source';
      } else if (String(ev.hearAboutCategory || '') !== 'Unknown') {
        missingReason = 'No HubSpot contact match by Zoom name; using Lu.ma self-reported source';
      } else {
        missingReason = 'No HubSpot match by Zoom name; Lu.ma record exists but no usable attribution';
      }
    } else {
      missingReason = 'No HubSpot match by normalized Zoom name; no Lu.ma evidence by name/email';
    }
  } else if (offlineIntegration) {
    missingReason = 'HubSpot original source is OFFLINE (integration/CRM), treated as provisional for acquisition';
  } else if (contactBucket === 'Unknown') {
    missingReason = 'HubSpot matched but original traffic source missing';
  }
  return {
    attendeeName: h.attendeeName,
    totalAttendances: h.total,
    tuesdayAttendances: h.tuesday,
    thursdayAttendances: h.thursday,
    goodMember3PlusRevenue250k: h.total >= 3 && Number.isFinite(revenue) && revenue >= 250000,
    hubspotMatched: !!contact,
    matchType: match.matchType,
    hubspotName: contact ? (fullName(contact) || 'Not Found') : 'Not Found',
    email: contact?.email || 'Not Found',
    sourceBucket,
    sourceAttributionMethod,
    originalTrafficSource: contact?.hs_analytics_source || 'Not Found',
    originalTrafficSourceDetail1: contact?.hs_analytics_source_data_1 || 'Not Found',
    originalTrafficSourceDetail2: contact?.hs_analytics_source_data_2 || contact?.campaign || 'Not Found',
    lumaFallbackCategory: ev?.hearAboutCategory || 'Not Found',
    lumaFallbackRaw: ev?.hearAbout || 'Not Found',
    missingReason,
  };
}).sort((a,b) => (b.totalAttendances - a.totalAttendances) || (Number(b.goodMember3PlusRevenue250k) - Number(a.goodMember3PlusRevenue250k)) || a.attendeeName.localeCompare(b.attendeeName)).slice(0,30);

const out = { lookbackDays: LOOKBACK_DAYS, attributionLookbackDays: ATTRIBUTION_LOOKBACK_DAYS, startKey, attributionStartKey: attrStartKey, totalZoomSessionsRows: zoomFiltered.length, totalUniqueAttendees: history.size, top30 };
fs.writeFileSync('temp_top30_attendees_v2.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
