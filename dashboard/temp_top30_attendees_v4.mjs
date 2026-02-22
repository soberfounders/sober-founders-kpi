import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { buildAliasMap, resolveCanonicalAttendeeName } from './src/lib/attendeeCanonicalization.js';
import { getZoomAttributionOverride, applyZoomAttributionOverride } from './src/lib/zoomAttributionOverrides.js';

const LOOKBACK_DAYS = 120;
const ATTRIBUTION_LOOKBACK_DAYS = 365;
const PAGE = 1000;
const TUESDAY_ID = '87199667045';
const THURSDAY_ID = '84242212480';

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
function parseDateKey(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function normalizeName(v = '') {
  return String(v || '')
    .toLowerCase()
    .replace(/['’]s\s*(iphone|ipad|android|galaxy|phone|pc|macbook|desktop|laptop)$/gi, '')
    .replace(/\((iphone|ipad|android|galaxy|phone)\)$/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function addIndexRow(map, key, row) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
}
function fullName(contact) {
  return `${String(contact?.firstname || '').trim()} ${String(contact?.lastname || '').trim()}`.trim();
}
function hubspotCreatedTs(contact) {
  const ts = Date.parse(contact?.createdate || '');
  return Number.isFinite(ts) ? ts : 0;
}
function contactScore(contact) {
  let score = 0;
  if (contact?.annual_revenue_in_dollars__official_ !== null && contact?.annual_revenue_in_dollars__official_ !== undefined && contact?.annual_revenue_in_dollars__official_ !== '') score += 4;
  else if (contact?.annual_revenue_in_dollars !== null && contact?.annual_revenue_in_dollars !== undefined && contact?.annual_revenue_in_dollars !== '') score += 2;
  if (contact?.sobriety_date) score += 1;
  if (contact?.hs_analytics_source) score += 1;
  if (contact?.hs_analytics_source_data_1) score += 1;
  if (contact?.hs_analytics_source_data_2) score += 1;
  return score;
}
function pickBestContact(candidates, eventDateKey) {
  if (!candidates?.length) return { contact: null, matchType: 'not_found', candidateCount: 0, identityMethod: 'none' };
  const eventTs = eventDateKey ? Date.parse(`${eventDateKey}T00:00:00.000Z`) : NaN;
  const ranked = candidates.map((c) => ({
    contact: c,
    score: contactScore(c),
    createdTs: hubspotCreatedTs(c),
    dist: Number.isFinite(eventTs) ? Math.abs(eventTs - hubspotCreatedTs(c)) : Number.POSITIVE_INFINITY,
  })).sort((a, b) => (b.score - a.score) || (a.dist - b.dist) || (b.createdTs - a.createdTs));
  return {
    contact: ranked[0]?.contact || candidates[0],
    matchType: candidates.length === 1 ? 'exact_name' : 'ambiguous_name',
    candidateCount: candidates.length,
    identityMethod: candidates.length === 1 ? 'HubSpot name exact' : 'HubSpot name exact (ranked)',
  };
}
function parseEmailList(v) {
  return String(v || '')
    .split(/[;,]/g)
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
}
function resolveRevenue(contact) {
  const official = Number(contact?.annual_revenue_in_dollars__official_);
  if (Number.isFinite(official)) return { revenue: official, revenueOfficial: official };
  const fallback = Number(contact?.annual_revenue_in_dollars);
  if (Number.isFinite(fallback)) return { revenue: fallback, revenueOfficial: null };
  return { revenue: null, revenueOfficial: null };
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
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' | ');
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
  const match = answers.find((row) => {
    const label = normalizeAnswerLabel(row);
    return label && ((label.includes('how did you hear') && label.includes('sober founders')) || label.includes('how did you hear about'));
  });
  if (!match) return null;
  return answerValueToText(match?.answer ?? match?.value ?? match?.response ?? match?.selected_option ?? match?.selected_options ?? match?.text) || null;
}
function classifyHearAbout(value) {
  const t = String(value || '').trim();
  if (!t) return 'Unknown';
  const n = ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const hasAny = (arr) => arr.some((p) => n.includes(` ${p} `));
  if (hasAny(['chatgpt', 'openai', 'gpt', 'ai', 'claude', 'gemini', 'perplexity'])) return 'ChatGPT / AI';
  if (hasAny(['google', 'googled', 'search', 'youtube', 'google ads', 'google ad', 'seo'])) return 'Google';
  if (hasAny(['refer', 'referral', 'referred', 'friend', 'word of mouth', 'recommendation', 'recommended', 'community'])) return 'Referral';
  if (hasAny(['instagram', 'insta', 'ig', 'facebook', 'fb', 'meta', 'facebook ad', 'facebook ads', 'fb ad', 'fb ads', 'meta ad', 'meta ads', 'ads manager', 'paid social'])) return 'Meta (Facebook/Instagram)';
  const compact = t.replace(/\s+/g, ' ').trim();
  const lower = compact.toLowerCase();
  const placeholder = ['n/a', 'na', 'none', 'unknown', 'not sure', 'not answering', 'no'].includes(lower);
  const personLike = compact.replace(/[^a-zA-Z\s.-]/g, ' ').split(/\s+/).filter(Boolean);
  if (!placeholder && personLike.length >= 1 && personLike.length <= 3 && personLike.every((tok) => /^[a-zA-Z][a-zA-Z.-]*$/.test(tok))) return 'Referral';
  return 'Other';
}
function sourceBucketFromLumaEvidence(ev) {
  if (!ev) return { bucket: 'Unknown', method: 'No Luma Evidence' };
  const ots = String(ev.originalTrafficSource || '').trim().toUpperCase();
  const heard = String(ev.hearAboutCategory || '').trim();
  const heardBucket =
    heard === 'Meta (Facebook/Instagram)' ? { bucket: 'Paid Social (Meta)', method: 'Luma How Heard' } :
    heard === 'Google' ? { bucket: 'Organic Search', method: 'Luma How Heard' } :
    heard === 'Referral' ? { bucket: 'Referral', method: 'Luma How Heard' } :
    heard === 'ChatGPT / AI' ? { bucket: 'ChatGPT / AI', method: 'Luma How Heard' } :
    heard === 'Other' ? { bucket: 'Other', method: 'Luma How Heard' } :
    { bucket: 'Unknown', method: 'No Luma Attribution' };
  if (ots === 'OFFLINE' && heardBucket.bucket !== 'Unknown' && heardBucket.bucket !== 'Other') {
    return { ...heardBucket, method: `${heardBucket.method} (preferred over Lu.ma HubSpot OFFLINE)` };
  }
  if (ots && ots !== 'NOT FOUND') {
    const map = { PAID_SOCIAL: 'Paid Social (Meta)', ORGANIC_SEARCH: 'Organic Search', REFERRALS: 'Referral', DIRECT_TRAFFIC: 'Direct', EMAIL_MARKETING: 'Email', PAID_SEARCH: 'Paid Search', SOCIAL_MEDIA: 'Social (Organic)', OFFLINE: 'OFFLINE' };
    return { bucket: map[ots] || ots.replace(/_/g, ' '), method: 'Luma HubSpot Original Source' };
  }
  return heardBucket;
}
function dateInRange(dateKey, startKey, endKey) { return !!dateKey && dateKey >= startKey && dateKey <= endKey; }
function startOfQuarterKey(d = new Date()) {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const qStartMonth = Math.floor(month / 3) * 3;
  return new Date(Date.UTC(year, qStartMonth, 1)).toISOString().slice(0, 10);
}
async function pagedSelect(supabase, table, columns, gteCol, gteValue) {
  let from = 0;
  const all = [];
  for (;;) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (gteCol && gteValue) q = q.gte(gteCol, gteValue);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
function fmtMoney(n) {
  return Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }) : 'n/a';
}

const env = readEnv('.env');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const today = new Date();
const start = new Date();
start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);
const startKey = start.toISOString().slice(0, 10);
const attrStart = new Date();
attrStart.setUTCDate(attrStart.getUTCDate() - ATTRIBUTION_LOOKBACK_DAYS);
const attrStartKey = attrStart.toISOString().slice(0, 10);
const qStartKey = startOfQuarterKey(today);
const todayKey = today.toISOString().slice(0, 10);

const [zoomRows, hubspotRows, lumaRows, aliasRows, mappingRows, adRows] = await Promise.all([
  pagedSelect(supabase, 'kpi_metrics', 'metric_name,metric_date,metadata', 'metric_date', startKey),
  pagedSelect(supabase, 'raw_hubspot_contacts', 'hubspot_contact_id,createdate,email,hs_additional_emails,firstname,lastname,annual_revenue_in_dollars,annual_revenue_in_dollars__official_,sobriety_date,hs_analytics_source,hs_analytics_source_data_1,hs_analytics_source_data_2,campaign', 'createdate', `${attrStartKey}T00:00:00.000Z`),
  pagedSelect(supabase, 'raw_luma_registrations', 'guest_name,guest_email,event_date,registered_at,approval_status,registration_answers,matched_zoom,matched_hubspot,matched_hubspot_name,matched_hubspot_email,matched_hubspot_contact_id', 'event_date', attrStartKey),
  pagedSelect(supabase, 'attendee_aliases', 'original_name,target_name'),
  pagedSelect(supabase, 'zoom_attendee_hubspot_mappings', 'session_date,meeting_id,zoom_attendee_canonical_name,hubspot_contact_id,hubspot_email,mapping_source,mapping_confidence,mapping_reason', 'session_date', startKey),
  pagedSelect(supabase, 'raw_fb_ads_insights_daily', 'date_day,funnel_key,campaign_name,spend', 'date_day', attrStartKey),
]);

const zoomFiltered = (zoomRows || []).filter((r) => r.metric_name === 'Zoom Meeting Attendees');
const aliasMap = buildAliasMap(aliasRows || []);

const hubspotById = new Map();
const hubspotByEmail = new Map();
const hubspotByExactName = new Map();
for (const row of hubspotRows || []) {
  const id = Number(row?.hubspot_contact_id);
  if (Number.isFinite(id)) hubspotById.set(id, row);
  const nameKey = normalizeName(fullName(row));
  if (nameKey) addIndexRow(hubspotByExactName, nameKey, row);
  for (const email of [normalizeEmail(row?.email), ...parseEmailList(row?.hs_additional_emails)]) {
    if (!email) continue;
    addIndexRow(hubspotByEmail, email, row);
  }
}

const lumaEvidenceByEmail = new Map();
const lumaEvidenceByName = new Map();
const pickBestLumaEvidence = (existing, candidate) => {
  if (!existing) return candidate;
  const score = (r) => (r.originalTrafficSource !== 'Not Found' ? 4 : 0) + (r.hearAboutCategory !== 'Unknown' ? 2 : 0) + (r.hearAbout ? 1 : 0) + (r.matchedZoom ? 1 : 0);
  return score(candidate) > score(existing) ? candidate : existing;
};
for (const row of lumaRows || []) {
  const approval = String(row?.approval_status || 'approved').toLowerCase();
  if (approval && approval !== 'approved') continue;
  const email = normalizeEmail(row?.guest_email);
  const contactCandidates = email ? (hubspotByEmail.get(email) || []) : [];
  const contact = pickBestContact(contactCandidates, parseDateKey(row?.event_date || row?.registered_at)).contact;
  const hearAbout = extractHearAboutAnswer(row?.registration_answers);
  const ev = {
    name: String(row?.guest_name || '').trim() || 'Not Found',
    email: email || 'Not Found',
    matchedZoom: !!row?.matched_zoom,
    matchedHubspot: !!row?.matched_hubspot,
    matchedHubspotName: row?.matched_hubspot_name || null,
    matchedHubspotEmail: row?.matched_hubspot_email || null,
    hearAbout,
    hearAboutCategory: classifyHearAbout(hearAbout),
    originalTrafficSource: contact?.hs_analytics_source || 'Not Found',
  };
  if (email) lumaEvidenceByEmail.set(email, pickBestLumaEvidence(lumaEvidenceByEmail.get(email), ev));
  const nk = normalizeName(ev.name);
  if (nk) lumaEvidenceByName.set(nk, pickBestLumaEvidence(lumaEvidenceByName.get(nk), ev));
}

const materializedBySessionAttendee = new Map();
const materializedByDateAttendee = new Map();
for (const row of mappingRows || []) {
  const sessionDate = parseDateKey(row?.session_date);
  const meetingId = String(row?.meeting_id || '');
  const attendeeKey = normalizeName(row?.zoom_attendee_canonical_name);
  const contactId = Number(row?.hubspot_contact_id);
  if (!sessionDate || !attendeeKey || !Number.isFinite(contactId)) continue;
  const hit = { row, contactId, contact: hubspotById.get(contactId) || null };
  materializedBySessionAttendee.set(`${sessionDate}|${meetingId}|${attendeeKey}`, hit);
  addIndexRow(materializedByDateAttendee, `${sessionDate}|${attendeeKey}`, hit);
}

function dayType(row) {
  const md = row?.metadata || {};
  const group = String(md.group_name || '').toLowerCase();
  if (group === 'tuesday' || group === 'thursday') return group[0].toUpperCase() + group.slice(1);
  const meetingId = String(md.meeting_id || '');
  if (meetingId === TUESDAY_ID) return 'Tuesday';
  if (meetingId === THURSDAY_ID) return 'Thursday';
  const dk = parseDateKey(md.start_time || row.metric_date);
  if (!dk) return 'Other';
  const dow = new Date(`${dk}T00:00:00.000Z`).getUTCDay();
  if (dow === 2) return 'Tuesday';
  if (dow === 4) return 'Thursday';
  return 'Other';
}

const sessionAttendeeRows = [];
const history = new Map();
for (const row of zoomFiltered) {
  const dateKey = parseDateKey(row?.metadata?.start_time || row?.metric_date);
  if (!dateKey || !dateInRange(dateKey, startKey, todayKey)) continue;
  const dt = dayType(row);
  if (dt !== 'Tuesday' && dt !== 'Thursday') continue;
  const meetingId = String(row?.metadata?.meeting_id || '');
  const attendees = Array.isArray(row?.metadata?.attendees) ? row.metadata.attendees : [];
  const dedup = new Map();
  for (const raw of attendees) {
    const canonical = resolveCanonicalAttendeeName(raw, aliasMap) || String(raw || '').trim();
    const attendeeKey = normalizeName(canonical);
    if (!attendeeKey || dedup.has(attendeeKey)) continue;
    dedup.set(attendeeKey, {
      date: dateKey,
      dayType: dt,
      meetingId,
      attendeeName: canonical,
      rawName: String(raw || '').trim() || canonical,
      attendeeKey,
    });
  }
  for (const attendee of dedup.values()) {
    if (!history.has(attendee.attendeeKey)) {
      history.set(attendee.attendeeKey, {
        attendeeKey: attendee.attendeeKey,
        attendeeName: attendee.attendeeName,
        total: 0,
        tuesday: 0,
        thursday: 0,
        firstSeen: attendee.date,
        lastSeen: attendee.date,
      });
    }
    const h = history.get(attendee.attendeeKey);
    h.total += 1;
    if (dt === 'Tuesday') h.tuesday += 1;
    if (dt === 'Thursday') h.thursday += 1;
    if (attendee.date < h.firstSeen) h.firstSeen = attendee.date;
    if (attendee.date > h.lastSeen) h.lastSeen = attendee.date;
    sessionAttendeeRows.push(attendee);
  }
}

function resolveHubspotForAttendee(attendee, hist) {
  const sessionKey = `${attendee.date}|${attendee.meetingId}|${attendee.attendeeKey}`;
  const materialized = materializedBySessionAttendee.get(sessionKey);
  if (materialized?.contact) {
    return {
      contact: materialized.contact,
      hubspotMatched: true,
      matchType: 'hubspot_activity_materialized_session',
      identityMethod: `HubSpot activity map (${materialized.row?.mapping_source || 'session'})`,
    };
  }
  const dateCandidates = (materializedByDateAttendee.get(`${attendee.date}|${attendee.attendeeKey}`) || []).filter((x) => x?.contact);
  if (dateCandidates.length === 1) {
    return {
      contact: dateCandidates[0].contact,
      hubspotMatched: true,
      matchType: 'hubspot_activity_materialized_date',
      identityMethod: `HubSpot activity map (${dateCandidates[0].row?.mapping_source || 'date'})`,
    };
  }
  if (dateCandidates.length > 1) {
    const ranked = pickBestContact(dateCandidates.map((x) => x.contact), attendee.date);
    return {
      contact: ranked.contact,
      hubspotMatched: !!ranked.contact,
      matchType: 'hubspot_activity_materialized_date_ambiguous',
      identityMethod: 'HubSpot activity map (same-date ambiguous, ranked)',
    };
  }
  const nameMatch = pickBestContact(hubspotByExactName.get(attendee.attendeeKey) || [], hist?.lastSeen || attendee.date);
  return {
    contact: nameMatch.contact,
    hubspotMatched: !!nameMatch.contact,
    matchType: nameMatch.matchType,
    identityMethod: nameMatch.contact ? nameMatch.identityMethod : 'No HubSpot match',
  };
}

const uniqueAttendees = Array.from(history.values()).map((h) => {
  const representative = sessionAttendeeRows.find((r) => r.attendeeKey === h.attendeeKey) || { date: h.lastSeen, meetingId: '', attendeeName: h.attendeeName, rawName: h.attendeeName, attendeeKey: h.attendeeKey };
  const match = resolveHubspotForAttendee(representative, h);
  const contact = match.contact;
  const revenue = resolveRevenue(contact || {});
  const contactBucket = sourceBucketFromContact(contact);
  const contactEmail = normalizeEmail(contact?.email);
  const lumaEv = (contactEmail && lumaEvidenceByEmail.get(contactEmail)) || lumaEvidenceByName.get(h.attendeeKey) || null;
  const lumaFallback = sourceBucketFromLumaEvidence(lumaEv);
  const ots = String(contact?.hs_analytics_source || '').trim().toUpperCase();
  const d1 = String(contact?.hs_analytics_source_data_1 || '').trim().toUpperCase();
  const offlineIntegration = ots === 'OFFLINE' && (d1 === 'INTEGRATION' || d1 === 'CRM_UI');
  const useFallback = lumaFallback.bucket !== 'Unknown' && (
    contactBucket === 'Unknown' || contactBucket === 'Other' || (offlineIntegration && lumaFallback.bucket !== 'Other')
  );
  const sourceBucket = useFallback ? lumaFallback.bucket : contactBucket;
  const sourceAttributionMethod = useFallback
    ? (contact ? (offlineIntegration ? `HubSpot OFFLINE -> ${lumaFallback.method}` : `HubSpot Unknown -> ${lumaFallback.method}`) : lumaFallback.method)
    : (contact ? 'HubSpot Original Source' : 'Unattributed');
  const baseRow = {
    attendeeName: h.attendeeName,
    attendeeKey: h.attendeeKey,
    totalAttendances: h.total,
    tuesdayAttendances: h.tuesday,
    thursdayAttendances: h.thursday,
    firstSeenDate: h.firstSeen,
    lastSeenDate: h.lastSeen,
    goodMember3PlusRevenue250k: h.total >= 3 && Number.isFinite(revenue.revenue) && Number(revenue.revenue) >= 250000,
    hubspotMatched: !!contact,
    matchType: match.matchType,
    identityResolutionMethod: match.identityMethod,
    hubspotName: contact ? (fullName(contact) || 'Not Found') : 'Not Found',
    email: contact?.email || 'Not Found',
    hubspotCreatedDate: parseDateKey(contact?.createdate) || 'Not Found',
    sourceBucket,
    sourceAttributionMethod,
    originalTrafficSource: contact?.hs_analytics_source || 'Not Found',
    originalTrafficSourceDetail1: contact?.hs_analytics_source_data_1 || 'Not Found',
    originalTrafficSourceDetail2: contact?.hs_analytics_source_data_2 || contact?.campaign || 'Not Found',
    revenue: Number.isFinite(revenue.revenue) ? revenue.revenue : 'Not Found',
    revenueOfficial: Number.isFinite(revenue.revenueOfficial) ? revenue.revenueOfficial : null,
    lumaFallbackCategory: lumaEv?.hearAboutCategory || 'Not Found',
    lumaFallbackRaw: lumaEv?.hearAbout || 'Not Found',
    missingAttributionReason: (!contact && !lumaEv) ? 'No HubSpot/Lu.ma evidence' : '',
    sourceFamily: String(sourceBucket || '').startsWith('Paid Social') ? 'Paid' : 'Non-Paid',
    isMetaPaid: sourceBucket === 'Paid Social (Meta)',
    manualAttributionOverride: 'No',
    manualAttributionNote: '',
    manualHubspotContactId: null,
    manualHubspotUrl: '',
  };
  const override = getZoomAttributionOverride(h.attendeeName || h.attendeeKey);
  return applyZoomAttributionOverride(baseRow, override);
});

const top30 = uniqueAttendees
  .slice()
  .sort((a, b) => (b.totalAttendances - a.totalAttendances) || (Number(b.goodMember3PlusRevenue250k) - Number(a.goodMember3PlusRevenue250k)) || String(a.attendeeName).localeCompare(String(b.attendeeName)))
  .slice(0, 30);

const top30PeopleBySource = {};
const top30AttendancesBySource = {};
for (const row of top30) {
  top30PeopleBySource[row.sourceBucket] = (top30PeopleBySource[row.sourceBucket] || 0) + 1;
  top30AttendancesBySource[row.sourceBucket] = (top30AttendancesBySource[row.sourceBucket] || 0) + Number(row.totalAttendances || 0);
}

const allGood = uniqueAttendees.filter((r) => r.goodMember3PlusRevenue250k);
const paidGood = allGood.filter((r) => r.sourceBucket === 'Paid Social (Meta)');
const paidGoodAcqIn120 = paidGood.filter((r) => dateInRange(r.hubspotCreatedDate, startKey, todayKey));
const paidGoodAcqBefore120 = paidGood.filter((r) => r.hubspotCreatedDate && r.hubspotCreatedDate !== 'Not Found' && r.hubspotCreatedDate < startKey);
const paidGoodAcqUnknown = paidGood.filter((r) => !r.hubspotCreatedDate || r.hubspotCreatedDate === 'Not Found');
const paidGoodFirstSeenIn120 = paidGood.filter((r) => dateInRange(r.firstSeenDate, startKey, todayKey));

const freeAdRows = (adRows || []).filter((r) => String(r?.funnel_key || '').toLowerCase() === 'free');
const freeSpend120 = freeAdRows
  .filter((r) => dateInRange(String(r?.date_day || '').slice(0, 10), startKey, todayKey))
  .reduce((sum, r) => sum + (Number(r?.spend) || 0), 0);
const freeSpendQTD = freeAdRows
  .filter((r) => dateInRange(String(r?.date_day || '').slice(0, 10), qStartKey, todayKey))
  .reduce((sum, r) => sum + (Number(r?.spend) || 0), 0);

const costMath = {
  lookbackWindowDays: LOOKBACK_DAYS,
  lookbackWindowStart: startKey,
  lookbackWindowEnd: todayKey,
  freeSpendLookbackWindow: freeSpend120,
  freeSpendQuarterToDate: freeSpendQTD,
  totalGoodMembersAllSourcesInWindow: allGood.length,
  paidGoodMembersActiveInWindow: paidGood.length,
  paidGoodMembersAcquiredInLookbackWindow: paidGoodAcqIn120.length,
  paidGoodMembersAcquiredBeforeLookbackWindow: paidGoodAcqBefore120.length,
  paidGoodMembersAcquiredUnknownDate: paidGoodAcqUnknown.length,
  paidGoodMembersFirstSeenInLookbackWindow: paidGoodFirstSeenIn120.length,
  blendedCostPerPaidGoodMember_lookbackSpend_div_activePaidGood: paidGood.length ? freeSpend120 / paidGood.length : null,
  acquisitionWindowCostPerPaidGoodMember_lookbackSpend_div_paidGoodAcqInWindow: paidGoodAcqIn120.length ? freeSpend120 / paidGoodAcqIn120.length : null,
  firstSeenWindowCostPerPaidGoodMember_lookbackSpend_div_paidGoodFirstSeenInWindow: paidGoodFirstSeenIn120.length ? freeSpend120 / paidGoodFirstSeenIn120.length : null,
  note: 'Blended active denominator can understate true acquisition cost when many paid good members were acquired before the spend window. Use the acquisition-window denominator (HubSpot createdate) for a cleaner estimate.',
};

const out = {
  generatedAtUtc: new Date().toISOString(),
  lookbackDays: LOOKBACK_DAYS,
  attributionLookbackDays: ATTRIBUTION_LOOKBACK_DAYS,
  startKey,
  attributionStartKey: attrStartKey,
  totalZoomSessionsRows: zoomFiltered.length,
  totalUniqueAttendees: uniqueAttendees.length,
  top30,
  top30Summary: {
    sourceCountsByPeople: top30PeopleBySource,
    sourceCountsByAttendances: top30AttendancesBySource,
    top30GoodMembers: top30.filter((r) => r.goodMember3PlusRevenue250k).map((r) => ({
      attendeeName: r.attendeeName,
      totalAttendances: r.totalAttendances,
      sourceBucket: r.sourceBucket,
      sourceAttributionMethod: r.sourceAttributionMethod,
      identityResolutionMethod: r.identityResolutionMethod,
      hubspotName: r.hubspotName,
      hubspotCreatedDate: r.hubspotCreatedDate,
    })),
  },
  costMath,
};

fs.writeFileSync('temp_top30_attendees_v4.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.log('\nCost math quick view:');
console.log(`Free spend (last ${LOOKBACK_DAYS}d, funnel_key=free): ${fmtMoney(freeSpend120)}`);
console.log(`Paid good members active in window: ${paidGood.length}`);
console.log(`Paid good members acquired in window (HubSpot createdate): ${paidGoodAcqIn120.length}`);
console.log(`Blended cost / paid good member (active denominator): ${fmtMoney(costMath.blendedCostPerPaidGoodMember_lookbackSpend_div_activePaidGood)}`);
console.log(`Acq-window cost / paid good member (createdate denominator): ${fmtMoney(costMath.acquisitionWindowCostPerPaidGoodMember_lookbackSpend_div_paidGoodAcqInWindow)}`);
