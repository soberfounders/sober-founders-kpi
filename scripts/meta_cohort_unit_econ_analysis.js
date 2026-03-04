const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'dashboard', '.env');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2] || '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const BASE = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = String(env.VITE_SUPABASE_ANON_KEY || '');
if (!BASE || !KEY) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function dateKey(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
function floorDays(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}
function addDays(dateLike, days) {
  const d = new Date(dateLike);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function mondayOf(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(0,0,0,0);
  return d;
}
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalizeEmail(v='') { return String(v || '').trim().toLowerCase(); }
function parseAdditionalEmails(v='') {
  return String(v || '').split(',').map(normalizeEmail).filter(Boolean);
}
function pctile(nums, p) {
  const arr = (nums || []).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!arr.length) return null;
  if (arr.length === 1) return arr[0];
  const pos = (arr.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return arr[lo];
  const w = pos - lo;
  return arr[lo] * (1 - w) + arr[hi] * w;
}
function median(nums) { return pctile(nums, 0.5); }
function roundUpToWeek(days) {
  if (!Number.isFinite(days)) return null;
  return Math.ceil(days / 7) * 7;
}
function fmtCurrency(n) { return n == null || !Number.isFinite(n) ? null : Number(n.toFixed(2)); }
function normalizeTextKey(v='') {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
function likelyGenericCampaignLabel(v='') {
  const s = normalizeTextKey(v);
  if (!s) return true;
  return [
    'organic facebook lead',
    'facebook lead',
    'paid social',
    'meta ads',
    'facebook',
    'instagram',
  ].includes(s);
}
function toPctSafe(num, den) {
  return (Number.isFinite(num) && Number.isFinite(den) && den > 0) ? (num / den) : null;
}
function parseMdyDateUTC(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yy = Number(m[3]);
  const d = new Date(Date.UTC(yy, mm - 1, dd));
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseCurrency(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function parseCsvLine(line = '') {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function addToMapNum(map, key, amount) {
  if (!key || !Number.isFinite(amount)) return;
  map.set(key, (map.get(key) || 0) + amount);
}
function normalizeFunnelKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'free' || key === 'phoenix' || key === 'donation') return key;
  return key || 'unknown';
}
function summarizeMetaSpendScope(adsRows = []) {
  const out = {
    total: { rows: 0, spend: 0, leads: 0 },
    lead_gen: { rows: 0, spend: 0, leads: 0 },
    free: { rows: 0, spend: 0, leads: 0 },
    phoenix: { rows: 0, spend: 0, leads: 0 },
    other: { rows: 0, spend: 0, leads: 0 },
    by_account: [],
  };
  const byAccount = new Map();

  for (const row of adsRows || []) {
    const spend = safeNum(row?.spend) || 0;
    const leads = safeNum(row?.leads) || 0;
    const funnelKey = normalizeFunnelKey(row?.funnel_key);
    const bucket = funnelKey === 'phoenix'
      ? 'phoenix'
      : funnelKey === 'free'
        ? 'free'
        : 'other';
    const accountId = String(row?.ad_account_id || '').trim() || 'unknown';

    out.total.rows += 1;
    out.total.spend += spend;
    out.total.leads += leads;

    out[bucket].rows += 1;
    out[bucket].spend += spend;
    out[bucket].leads += leads;
    if (bucket === 'free' || bucket === 'phoenix') {
      out.lead_gen.rows += 1;
      out.lead_gen.spend += spend;
      out.lead_gen.leads += leads;
    }

    if (!byAccount.has(accountId)) {
      byAccount.set(accountId, {
        ad_account_id: accountId,
        rows: 0,
        spend: 0,
        leads: 0,
        free_rows: 0,
        free_spend: 0,
        free_leads: 0,
        phoenix_rows: 0,
        phoenix_spend: 0,
        phoenix_leads: 0,
        other_rows: 0,
        other_spend: 0,
        other_leads: 0,
      });
    }
    const acc = byAccount.get(accountId);
    acc.rows += 1;
    acc.spend += spend;
    acc.leads += leads;
    acc[`${bucket}_rows`] += 1;
    acc[`${bucket}_spend`] += spend;
    acc[`${bucket}_leads`] += leads;
  }

  out.by_account = [...byAccount.values()]
    .sort((a, b) => (b.spend - a.spend) || String(a.ad_account_id).localeCompare(String(b.ad_account_id)));
  return out;
}
function detectManualMetaBackfillCsvPath() {
  const candidates = [
    process.env.MANUAL_META_SPEND_BACKFILL_CSV,
    path.join(__dirname, 'manual_meta_spend_backfill.csv'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'KPI Sober Founders - Before I ran my own meta ads, manual import.csv'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {
      // ignore path access issues; next candidate may still work
    }
  }
  return null;
}
function loadManualMetaSpendBackfill() {
  const csvPath = detectManualMetaBackfillCsvPath();
  if (!csvPath) return null;
  const raw = fs.readFileSync(csvPath, 'utf8').trim();
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return null;
  const rows = lines.map(parseCsvLine);
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  const spendRow = dataRows.find((r) => String(r?.[0] || '').trim().toLowerCase() === 'total ad spend');
  if (!spendRow) throw new Error(`Manual backfill CSV missing "Total Ad Spend" row: ${csvPath}`);

  const lumpLabel = 'All Data Before 2/23/2025';
  const weekEndRows = [];
  let lumpBefore = null;
  for (let i = 1; i < headers.length; i += 1) {
    const label = String(headers[i] || '').trim();
    if (!label) continue;
    if (label === lumpLabel) {
      lumpBefore = { label, spend: parseCurrency(spendRow[i]) };
      continue;
    }
    const endDate = parseMdyDateUTC(label);
    if (!endDate) continue;
    weekEndRows.push({
      label,
      week_end: dateKey(endDate),
      weekEndDate: endDate,
      spend: parseCurrency(spendRow[i]), // null => unknown / blank
    });
  }
  weekEndRows.sort((a, b) => a.week_end.localeCompare(b.week_end));

  // User clarified labels are week-end dates. We preserve irregular 6/7/8 day gaps
  // by allocating each record over its interval since the prior week-end.
  const intervals = [];
  const dailySpend = new Map();
  let knownRows = 0;
  let unknownRows = 0;
  let knownSpendTotal = 0;
  let allocatedSpendTotal = 0;
  for (let i = 0; i < weekEndRows.length; i += 1) {
    const cur = weekEndRows[i];
    const prev = weekEndRows[i - 1] || null;
    const startDate = prev ? addDays(prev.weekEndDate, 1) : addDays(cur.weekEndDate, -6); // assume 7-day first period
    const endDate = cur.weekEndDate;
    const spanDays = Math.max(1, floorDays(endDate, startDate) + 1);
    const interval = {
      label: cur.label,
      week_end: cur.week_end,
      start_date: dateKey(startDate),
      end_date: dateKey(endDate),
      days: spanDays,
      spend: cur.spend,
      status: cur.spend == null ? 'unknown' : 'known',
    };
    intervals.push(interval);
    if (cur.spend == null) {
      unknownRows += 1;
      continue;
    }
    knownRows += 1;
    knownSpendTotal += cur.spend;
    const perDay = cur.spend / spanDays;
    for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
      addToMapNum(dailySpend, dateKey(d), perDay);
      allocatedSpendTotal += perDay;
    }
  }

  return {
    csv_path: csvPath,
    week_end_rows: weekEndRows,
    intervals,
    daily_spend: dailySpend,
    stats: {
      week_end_columns: weekEndRows.length,
      known_spend_rows: knownRows,
      unknown_spend_rows: unknownRows,
      known_spend_total: knownSpendTotal,
      allocated_spend_total: allocatedSpendTotal,
      first_week_end: weekEndRows[0]?.week_end || null,
      last_week_end: weekEndRows[weekEndRows.length - 1]?.week_end || null,
      first_allocated_day: intervals[0]?.start_date || null,
      last_allocated_day: intervals[intervals.length - 1]?.end_date || null,
      lump_before_first_week_end_spend: lumpBefore?.spend ?? null,
    },
  };
}

async function fetchAll(table, { select='*', filters='', order='', limit=1000 } = {}) {
  let from = 0;
  const out = [];
  for (;;) {
    const to = from + limit - 1;
    const params = [];
    params.push(`select=${encodeURIComponent(select)}`);
    if (filters) params.push(filters);
    if (order) params.push(`order=${encodeURIComponent(order)}`);
    const url = `${BASE}/rest/v1/${table}?${params.join('&')}`;
    const res = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${to}`,
      },
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`${table} ${res.status}: ${txt.slice(0, 500)}`);
    const rows = JSON.parse(txt);
    out.push(...rows);
    if (rows.length < limit) break;
    from += limit;
    if (from > 500000) throw new Error(`Too many rows from ${table}`);
  }
  return out;
}

function isPaidSocialHubspot(row) {
  const blob = [row?.hs_analytics_source, row?.hs_latest_source, row?.original_traffic_source].join(' ').toUpperCase();
  return blob.includes('PAID_SOCIAL');
}
function isPhoenixHubspot(row) {
  const blob = [row?.hs_analytics_source_data_2, row?.hs_latest_source_data_2, row?.campaign, row?.campaign_source, row?.membership_s].join(' ').toLowerCase();
  return blob.includes('phoenix');
}
function officialRevenue(row) {
  const n = safeNum(row?.annual_revenue_in_dollars__official_);
  return Number.isFinite(n) ? n : null;
}
function fallbackRevenue(row) {
  const n = safeNum(row?.annual_revenue_in_dollars);
  return Number.isFinite(n) ? n : null;
}
function parseSobrietyDate(row) {
  const raw = row?.sobriety_date;
  const d = parseDate(raw);
  if (!d) return null;
  d.setUTCHours(0,0,0,0);
  return d;
}
function addYearsUTC(d, years) {
  if (!d) return null;
  const out = new Date(Date.UTC(d.getUTCFullYear()+years, d.getUTCMonth(), d.getUTCDate()));
  if (out.getUTCMonth() !== d.getUTCMonth()) return new Date(Date.UTC(d.getUTCFullYear()+years, d.getUTCMonth()+1, 0));
  return out;
}
function soberOverOneYearAtLead(row, leadAt) {
  const sd = parseSobrietyDate(row);
  if (!sd || !leadAt) return false;
  const oneYear = addYearsUTC(sd, 1);
  return oneYear && oneYear.getTime() <= leadAt.getTime();
}

function contactScore(row) {
  let s = 0;
  if (officialRevenue(row) != null) s += 5;
  else if (fallbackRevenue(row) != null) s += 2;
  if (row?.sobriety_date) s += 2;
  if (row?.hs_analytics_source) s += 1;
  if (row?.hs_additional_emails) s += 1;
  return s;
}
function contactTs(row) {
  const d = parseDate(row?.ingested_at || row?.createdate);
  return d ? d.getTime() : 0;
}
function dedupeContacts(rows) {
  const byId = new Map();
  for (const row of rows) {
    const id = Number(row?.hubspot_contact_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const prev = byId.get(id);
    if (!prev) { byId.set(id, row); continue; }
    const ps = contactScore(prev);
    const cs = contactScore(row);
    if (cs > ps || (cs === ps && contactTs(row) > contactTs(prev))) byId.set(id, row);
  }
  return [...byId.values()];
}

function classifyGroupSession(activity, attendeeCount) {
  const title = String(activity?.title || '').toLowerCase();
  const start = parseDate(activity?.hs_timestamp || activity?.created_at_hubspot);
  if (!start) return null;
  const day = start.getUTCDay();
  if (title.includes('tactic tuesday')) return 'Tuesday';
  if (title.includes('mastermind on zoom') || title.includes('all are welcome')) return 'Thursday';
  if (title.includes("entrepreneur's big book") || title.includes('big book')) return 'Thursday';
  if (title.includes('sober founders mastermind') && !title.includes('intro')) return 'Thursday';
  if (attendeeCount >= 5) {
    if (day === 2) return 'Tuesday';
    if (day === 4) return 'Thursday';
  }
  return null;
}

function cdfFromLagsWithinHorizon(lags, horizonDays) {
  const arr = (lags || []).filter((x) => Number.isFinite(x) && x >= 0 && x <= horizonDays).sort((a,b)=>a-b);
  const total = arr.length;
  return {
    total,
    at(ageDays) {
      if (total === 0) return null;
      if (!Number.isFinite(ageDays)) return null;
      if (ageDays < 0) return 0;
      if (ageDays >= horizonDays) return 1;
      let lo = 0, hi = total;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] <= ageDays) lo = mid + 1; else hi = mid;
      }
      return lo / total;
    }
  };
}

(async () => {
  const [adsRaw, contactsRaw, lumaRaw, actsRaw, assocsRaw] = await Promise.all([
    fetchAll('raw_fb_ads_insights_daily', { select: 'date_day,spend,funnel_key,campaign_name,ad_account_id' }),
    fetchAll('raw_hubspot_contacts', { select: 'hubspot_contact_id,ingested_at,createdate,email,hs_additional_emails,firstname,lastname,annual_revenue_in_dollars,annual_revenue_in_dollars__official_,sobriety_date,hs_analytics_source,hs_latest_source,original_traffic_source,hs_analytics_source_data_1,hs_analytics_source_data_2,hs_latest_source_data_2,campaign,campaign_source,membership_s,first_conversion_event_name,recent_conversion_event_name' }),
    fetchAll('raw_luma_registrations', { select: 'event_date,registered_at,approval_status,guest_email,matched_hubspot,matched_hubspot_contact_id,matched_hubspot_email,is_thursday' }),
    fetchAll('raw_hubspot_meeting_activities', { select: 'hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title', filters: 'activity_type=eq.call' }),
    fetchAll('hubspot_activity_contact_associations', { select: 'hubspot_activity_id,activity_type,hubspot_contact_id,contact_email,contact_firstname,contact_lastname,metadata', filters: 'activity_type=eq.call' }),
  ]);

  const contacts = dedupeContacts(contactsRaw);
  const contactById = new Map(contacts.map((r) => [Number(r.hubspot_contact_id), r]));
  const contactEmailIndex = new Map();
  for (const c of contacts) {
    const emails = [normalizeEmail(c.email), ...parseAdditionalEmails(c.hs_additional_emails)];
    for (const e of emails) {
      if (!e) continue;
      if (!contactEmailIndex.has(e)) contactEmailIndex.set(e, []);
      contactEmailIndex.get(e).push(c);
    }
  }

  const metaSpendScope = summarizeMetaSpendScope(adsRaw);
  const adsFree = adsRaw.filter((r) => normalizeFunnelKey(r.funnel_key) === 'free');
  const adsMinDate = adsFree.map((r)=>String(r.date_day||'')).filter(Boolean).sort()[0];
  const adsMaxDate = adsFree.map((r)=>String(r.date_day||'')).filter(Boolean).sort().slice(-1)[0];
  const adsMax = parseDate(`${adsMaxDate}T00:00:00.000Z`);
  const maxAdsMonday = mondayOf(adsMax);
  const lastCompleteWeekStart = (adsMax && adsMax.getUTCDay() === 0) ? maxAdsMonday : addDays(maxAdsMonday, -7);

  const liveSpendByDay = new Map();
  for (const row of adsFree) {
    const d = parseDate(`${row.date_day}T00:00:00.000Z`);
    if (!d) continue;
    addToMapNum(liveSpendByDay, dateKey(d), safeNum(row.spend) || 0);
  }
  const manualBackfill = loadManualMetaSpendBackfill();
  const blendedSpendByDay = new Map(liveSpendByDay);
  if (manualBackfill?.daily_spend) {
    for (const [day, spend] of manualBackfill.daily_spend.entries()) {
      addToMapNum(blendedSpendByDay, day, spend);
    }
  }
  const blendedSpendDays = [...blendedSpendByDay.keys()].sort();
  const spendMinDateBlended = blendedSpendDays[0] || adsMinDate;
  const spendMaxDateBlended = blendedSpendDays.length ? blendedSpendDays[blendedSpendDays.length - 1] : adsMaxDate;
  const spendByWeek = new Map();
  for (const [day, spend] of blendedSpendByDay.entries()) {
    const d = parseDate(`${day}T00:00:00.000Z`);
    if (!d) continue;
    const wk = dateKey(mondayOf(d));
    addToMapNum(spendByWeek, wk, spend);
  }

  const assocsByActivity = new Map();
  for (const a of assocsRaw) {
    const aid = String(a.hubspot_activity_id || '');
    if (!aid) continue;
    if (!assocsByActivity.has(aid)) assocsByActivity.set(aid, []);
    assocsByActivity.get(aid).push(a);
  }

  const sessions = [];
  for (const activity of actsRaw) {
    const aid = String(activity.hubspot_activity_id || '');
    const assocs = assocsByActivity.get(aid) || [];
    const type = classifyGroupSession(activity, assocs.length);
    if (!type) continue;
    const start = parseDate(activity.hs_timestamp || activity.created_at_hubspot);
    if (!start) continue;
    const seen = new Set();
    const contactIds = [];
    for (const assoc of assocs) {
      const id = Number(assoc.hubspot_contact_id);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      contactIds.push(id);
    }
    sessions.push({
      activityId: aid,
      type,
      start,
      contactIds,
    });
  }
  sessions.sort((a,b)=>a.start-b.start);
  const attendanceAsOf = sessions.length ? sessions[sessions.length-1].start : new Date();

  const attendanceByContact = new Map();
  const attendanceSessionsByContact = new Map();
  for (const s of sessions) {
    for (const id of s.contactIds) {
      if (!attendanceByContact.has(id)) attendanceByContact.set(id, []);
      attendanceByContact.get(id).push(s.start);
      if (!attendanceSessionsByContact.has(id)) attendanceSessionsByContact.set(id, []);
      attendanceSessionsByContact.get(id).push({ start: s.start, type: s.type });
    }
  }
  for (const [id, arr] of attendanceByContact) {
    arr.sort((a,b)=>a-b);
    // de-dupe same timestamp just in case
    const dedup = [];
    let prev = null;
    for (const d of arr) {
      const t = d.getTime();
      if (prev === t) continue;
      dedup.push(d);
      prev = t;
    }
    attendanceByContact.set(id, dedup);
  }
  for (const [id, arr] of attendanceSessionsByContact) {
    arr.sort((a, b) => a.start - b.start || String(a.type || '').localeCompare(String(b.type || '')));
    const dedup = [];
    let prevKey = null;
    for (const row of arr) {
      const key = `${row.start?.getTime?.() || 0}|${row.type || ''}`;
      if (key === prevKey) continue;
      dedup.push(row);
      prevKey = key;
    }
    attendanceSessionsByContact.set(id, dedup);
  }
  const groupSessionsByType = new Map();
  for (const s of sessions) {
    if (!groupSessionsByType.has(s.type)) groupSessionsByType.set(s.type, []);
    groupSessionsByType.get(s.type).push(s.start);
  }
  for (const [group, arr] of groupSessionsByType) {
    arr.sort((a, b) => a - b);
    const dedup = [];
    let prev = null;
    for (const d of arr) {
      const ts = d?.getTime?.();
      if (!Number.isFinite(ts)) continue;
      if (ts === prev) continue;
      dedup.push(d);
      prev = ts;
    }
    groupSessionsByType.set(group, dedup);
  }

  function buildAttendanceEngagementStats(contactId, attendanceAsOfRef) {
    const rows = attendanceSessionsByContact.get(contactId) || [];
    if (!rows.length) {
      return {
        firstShowAt: null,
        lastShowAt: null,
        daysSinceLastShowup: null,
        primaryGroup: null,
        primaryGroupShowups: 0,
        missedPrimaryGroupSessionsSinceLastShowup: 0,
        missedAllGroupSessionsSinceLastShowup: 0,
        recentShowups30d: 0,
        recentShowups60d: 0,
      };
    }
    const countsByGroup = new Map();
    const lastByGroup = new Map();
    for (const row of rows) {
      const type = row?.type || null;
      if (!type) continue;
      countsByGroup.set(type, (countsByGroup.get(type) || 0) + 1);
      lastByGroup.set(type, row.start);
    }
    let primaryGroup = null;
    let primaryCount = -1;
    let primaryLastTs = -1;
    for (const [group, count] of countsByGroup) {
      const lastTs = lastByGroup.get(group)?.getTime?.() || 0;
      if (count > primaryCount || (count === primaryCount && lastTs > primaryLastTs)) {
        primaryGroup = group;
        primaryCount = count;
        primaryLastTs = lastTs;
      }
    }
    const firstShowAt = rows[0]?.start || null;
    const lastShowAt = rows[rows.length - 1]?.start || null;
    const lastPrimaryShowAt = primaryGroup ? (lastByGroup.get(primaryGroup) || null) : null;
    const primarySchedule = primaryGroup ? (groupSessionsByType.get(primaryGroup) || []) : [];
    const missedPrimaryGroupSessionsSinceLastShowup = lastPrimaryShowAt
      ? primarySchedule.filter((d) => d > lastPrimaryShowAt).length
      : 0;
    const allGroupSchedule = sessions.map((s) => s.start);
    const missedAllGroupSessionsSinceLastShowup = lastShowAt
      ? allGroupSchedule.filter((d) => d > lastShowAt).length
      : 0;
    const daysSinceLastShowup = (lastShowAt && attendanceAsOfRef)
      ? Math.max(0, floorDays(attendanceAsOfRef, lastShowAt))
      : null;
    const recentShowups30d = (lastShowAt && attendanceAsOfRef)
      ? rows.filter((r) => r.start && floorDays(attendanceAsOfRef, r.start) <= 30).length
      : 0;
    const recentShowups60d = (lastShowAt && attendanceAsOfRef)
      ? rows.filter((r) => r.start && floorDays(attendanceAsOfRef, r.start) <= 60).length
      : 0;

    return {
      firstShowAt,
      lastShowAt,
      daysSinceLastShowup,
      primaryGroup,
      primaryGroupShowups: Math.max(0, primaryCount),
      missedPrimaryGroupSessionsSinceLastShowup,
      missedAllGroupSessionsSinceLastShowup,
      recentShowups30d,
      recentShowups60d,
    };
  }

  const lumaByContact = new Map();
  let lumaFallbackEmailMatches = 0;
  for (const row of lumaRaw) {
    const approval = String(row.approval_status || 'approved').toLowerCase();
    if (approval && approval !== 'approved') continue;
    const registered = parseDate(row.registered_at) || parseDate(`${row.event_date}T00:00:00.000Z`);
    if (!registered) continue;
    let id = Number(row.matched_hubspot_contact_id);
    if (!Number.isFinite(id) || id <= 0 || !contactById.has(id)) {
      const emails = [normalizeEmail(row.guest_email), normalizeEmail(row.matched_hubspot_email)].filter(Boolean);
      let best = null;
      for (const e of emails) {
        const cands = contactEmailIndex.get(e) || [];
        if (cands.length === 1) { best = cands[0]; break; }
        if (cands.length > 1) {
          cands.sort((a,b)=>contactScore(b)-contactScore(a) || contactTs(b)-contactTs(a));
          best = cands[0];
          break;
        }
      }
      if (best) {
        id = Number(best.hubspot_contact_id);
        lumaFallbackEmailMatches += 1;
      }
    }
    if (!Number.isFinite(id) || id <= 0) continue;
    const prev = lumaByContact.get(id);
    if (!prev || registered < prev) lumaByContact.set(id, registered);
  }
  const lumaAsOf = [...lumaByContact.values()].sort((a,b)=>a-b).slice(-1)[0] || attendanceAsOf;

  const metaFreeContacts = [];
  let excludedPhoenix = 0;
  let excludedNonPaid = 0;
  for (const c of contacts) {
    if (String(c?.original_traffic_source || '').toUpperCase() !== 'PAID_SOCIAL') { excludedNonPaid += 1; continue; }
    if (isPhoenixHubspot(c)) { excludedPhoenix += 1; continue; }
    const leadAt = parseDate(c.createdate);
    if (!leadAt) continue;
    metaFreeContacts.push({ ...c, leadAt });
  }

  const rangeStartWeek = mondayOf(parseDate(`${spendMinDateBlended}T00:00:00.000Z`));
  const rangeEndWeek = lastCompleteWeekStart;
  const rangeStartKey = dateKey(rangeStartWeek);
  const rangeEndKey = dateKey(rangeEndWeek);

  const cohortRows = [];
  let preexistingAttendanceExcluded = 0;
  let preexistingLumaExcluded = 0;
  let outOfRangeLeadExcluded = 0;

  for (const c of metaFreeContacts) {
    const contactId = Number(c.hubspot_contact_id);
    const leadAt = c.leadAt;
    const leadWeek = dateKey(mondayOf(leadAt));
    if (!leadWeek || leadWeek < rangeStartKey || leadWeek > rangeEndKey) {
      outOfRangeLeadExcluded += 1;
      continue;
    }

    const attendance = attendanceByContact.get(contactId) || [];
    const engagement = buildAttendanceEngagementStats(contactId, attendanceAsOf);
    const lumaAt = lumaByContact.get(contactId) || null;
    const firstShow = attendance[0] || null;

    let exclude = false;
    if (firstShow && floorDays(firstShow, leadAt) < -14) {
      preexistingAttendanceExcluded += 1;
      exclude = true;
    }
    if (lumaAt && floorDays(lumaAt, leadAt) < -14) {
      preexistingLumaExcluded += 1;
      exclude = true;
    }
    if (exclude) continue;

    const show6 = attendance[5] || null;
    const show11 = attendance[10] || null;
    const revenueOfficial = officialRevenue(c);
    const sober1yAtLead = soberOverOneYearAtLead(c, leadAt);
    const qualifiedLead = sober1yAtLead && revenueOfficial != null && revenueOfficial >= 250000 && revenueOfficial < 1000000;
    const greatLead = sober1yAtLead && revenueOfficial != null && revenueOfficial >= 1000000;
    const idealLeadProfile = sober1yAtLead && revenueOfficial != null && revenueOfficial >= 250000;

    cohortRows.push({
      contactId,
      leadAt,
      leadWeek,
      lumaAt,
      firstShowAt: firstShow,
      show6At: show6,
      show11At: show11,
      qualifiedLead,
      greatLead,
      greatMember: !!show6,
      idealMember: !!show11 && idealLeadProfile,
      idealLeadProfile,
      revenueOfficial,
      revenueAny: fallbackRevenue(c),
      sober1yAtLead,
      hasSobrietyDate: !!parseSobrietyDate(c),
      sobrietyDate: dateKey(parseSobrietyDate(c)) || null,
      totalShowups: attendance.length,
      firstGroupShowupAt: engagement.firstShowAt || firstShow,
      lastGroupShowupAt: engagement.lastShowAt || (attendance[attendance.length - 1] || null),
      daysSinceLastShowup: engagement.daysSinceLastShowup,
      primaryAttendanceGroup: engagement.primaryGroup,
      primaryAttendanceGroupShowups: engagement.primaryGroupShowups,
      missedPrimaryGroupSessionsSinceLastShowup: engagement.missedPrimaryGroupSessionsSinceLastShowup,
      missedAllGroupSessionsSinceLastShowup: engagement.missedAllGroupSessionsSinceLastShowup,
      recentShowups30d: engagement.recentShowups30d,
      recentShowups60d: engagement.recentShowups60d,
      contactName: `${String(c.firstname || '').trim()} ${String(c.lastname || '').trim()}`.trim(),
      email: normalizeEmail(c.email) || null,
      hsAdditionalEmails: parseAdditionalEmails(c.hs_additional_emails),
      originalTrafficSource: c.original_traffic_source || null,
      hsAnalyticsSource: c.hs_analytics_source || null,
      hsAnalyticsSourceData1: c.hs_analytics_source_data_1 || null,
      hsAnalyticsSourceData2: c.hs_analytics_source_data_2 || null,
      campaign: c.campaign || null,
      campaignSource: c.campaign_source || null,
      membershipS: c.membership_s || null,
      firstConversionEventName: c.first_conversion_event_name || null,
      recentConversionEventName: c.recent_conversion_event_name || null,
    });
  }

  const cohortMap = new Map();
  function getCohort(wk) {
    if (!cohortMap.has(wk)) cohortMap.set(wk, {
      week: wk,
      weekStart: parseDate(`${wk}T00:00:00.000Z`),
      weekEnd: parseDate(`${wk}T00:00:00.000Z`),
      spend: 0,
      leads: 0,
      qualifiedLead: 0,
      greatLead: 0,
      luma_signup: 0,
      first_showup: 0,
      great_member: 0,
      ideal_member: 0,
    });
    const c = cohortMap.get(wk);
    c.weekEnd = addDays(c.weekStart, 6);
    return c;
  }

  // Seed all weeks in spend range
  for (let d = new Date(rangeStartWeek); d <= rangeEndWeek; d = addDays(d, 7)) {
    getCohort(dateKey(d));
  }

  for (const [wk, spend] of spendByWeek) {
    if (wk < rangeStartKey || wk > rangeEndKey) continue;
    getCohort(wk).spend += spend;
  }

  const lagCollector = {
    luma_signup: [],
    first_showup: [],
    great_member: [],
    ideal_member: [],
  };
  const leadAsOf = parseDate(`${rangeEndKey}T23:59:59.999Z`) || new Date();

  for (const row of cohortRows) {
    const c = getCohort(row.leadWeek);
    c.leads += 1;
    if (row.qualifiedLead) c.qualifiedLead += 1;
    if (row.greatLead) c.greatLead += 1;

    const events = [
      ['luma_signup', row.lumaAt, lumaAsOf],
      ['first_showup', row.firstShowAt, attendanceAsOf],
      ['great_member', row.show6At, attendanceAsOf],
      ['ideal_member', row.idealMember ? row.show11At : null, attendanceAsOf],
    ];
    for (const [metric, evtAt, asOf] of events) {
      if (!evtAt || evtAt > asOf) continue;
      const lag = Math.max(0, floorDays(evtAt, row.leadAt));
      lagCollector[metric].push({ lag, leadWeek: row.leadWeek });
      c[metric] += 1;
    }
  }

  const cohortList = [...cohortMap.values()].sort((a,b)=>a.week.localeCompare(b.week));
  const asOfByMetric = {
    lead: parseDate(`${rangeEndKey}T23:59:59.999Z`) || attendanceAsOf,
    qualified_lead: parseDate(`${rangeEndKey}T23:59:59.999Z`) || attendanceAsOf,
    great_lead: parseDate(`${rangeEndKey}T23:59:59.999Z`) || attendanceAsOf,
    luma_signup: lumaAsOf,
    first_showup: attendanceAsOf,
    great_member: attendanceAsOf,
    ideal_member: attendanceAsOf,
  };

  function cohortAgeDays(cohort, asOf) {
    return floorDays(asOf, cohort.weekEnd);
  }

  const lagStats = {};
  const metricHorizons = {};
  for (const metric of ['luma_signup','first_showup','great_member','ideal_member']) {
    const lagsAll = lagCollector[metric].map(x=>x.lag);
    const p50 = pctile(lagsAll, 0.5);
    const p75 = pctile(lagsAll, 0.75);
    const p90obs = pctile(lagsAll, 0.9);
    const provisional = roundUpToWeek(p90obs == null ? 0 : p90obs);
    const matureLags = lagCollector[metric]
      .filter((x) => {
        const c = cohortMap.get(x.leadWeek);
        return c && cohortAgeDays(c, asOfByMetric[metric]) >= (provisional || 0);
      })
      .map((x) => x.lag);
    const baseLags = matureLags.length >= Math.max(10, Math.floor(lagsAll.length * 0.35)) ? matureLags : lagsAll;
    const p90 = pctile(baseLags, 0.9);
    const p95 = pctile(baseLags, 0.95);
    const horizon = Math.max(7, roundUpToWeek(p90 == null ? 0 : p90));
    lagStats[metric] = {
      achievers: lagsAll.length,
      cdfBaseAchievers: baseLags.length,
      p50_days: p50 == null ? null : Math.round(p50),
      p75_days: p75 == null ? null : Math.round(p75),
      p90_days: p90 == null ? null : Math.round(p90),
      p95_days: p95 == null ? null : Math.round(p95),
      horizon_days: horizon,
    };
    metricHorizons[metric] = horizon;
  }

  const qualityBufferDays = 28; // practical stabilization buffer for revenue/sobriety cache completion

  const results = [];

  function addMetric({ key, label, countField, type }) {
    const asOf = asOfByMetric[key];
    let finalizedCohorts = cohortList;
    let finalizedHorizonDays = null;
    let projected = null;

    if (type === 'behavior') {
      const H = metricHorizons[key];
      finalizedHorizonDays = H;
      finalizedCohorts = cohortList.filter((c) => cohortAgeDays(c, asOf) >= H);

      const matureCohortWeeks = new Set(finalizedCohorts.map((c) => c.week));
      const lagsWithinH = lagCollector[key]
        .filter((x) => x.lag <= H && (matureCohortWeeks.has(x.leadWeek) || lagStats[key].cdfBaseAchievers === lagCollector[key].length))
        .map((x) => x.lag);
      const cdf = cdfFromLagsWithinHorizon(lagsWithinH, H);

      let projSpend = 0;
      let projObserved = 0;
      let projEstimated = 0;
      let projCohorts = 0;
      let observableMinAge = null;
      for (const c of cohortList) {
        const age = cohortAgeDays(c, asOf);
        const maturity = cdf.at(age);
        if (maturity == null || maturity <= 0) continue;
        projCohorts += 1;
        projSpend += c.spend;
        projObserved += c[countField];
        const est = Math.min(c.leads, c[countField] / maturity);
        projEstimated += est;
        if (observableMinAge === null || age < observableMinAge) observableMinAge = age;
      }
      projected = {
        observability_horizon_days: H,
        cdf_sample_achievers_within_horizon: cdf.total,
        cohorts_included: projCohorts,
        min_observed_age_days_included: observableMinAge,
        spend: projSpend,
        observed_conversions: projObserved,
        projected_conversions: projEstimated,
        projected_cpa: projEstimated > 0 ? projSpend / projEstimated : null,
      };
    }

    if (type === 'quality') {
      finalizedHorizonDays = qualityBufferDays;
      finalizedCohorts = cohortList.filter((c) => cohortAgeDays(c, asOf) >= qualityBufferDays);
    }

    const finalizedSpend = finalizedCohorts.reduce((s,c)=>s+c.spend,0);
    const finalizedConv = finalizedCohorts.reduce((s,c)=>s+c[countField],0);
    const finalizedLeads = finalizedCohorts.reduce((s,c)=>s+c.leads,0);

    results.push({
      key,
      label,
      type,
      finalized_horizon_days: finalizedHorizonDays,
      finalized: {
        cohorts_included: finalizedCohorts.length,
        spend: finalizedSpend,
        conversions: finalizedConv,
        leads: finalizedLeads,
        conversion_rate: finalizedLeads > 0 ? finalizedConv / finalizedLeads : null,
        cpa: finalizedConv > 0 ? finalizedSpend / finalizedConv : null,
      },
      projected,
    });
  }

  addMetric({ key: 'lead', label: 'Meta Free Lead', countField: 'leads', type: 'instant' });
  addMetric({ key: 'luma_signup', label: 'Luma Signup (first approved registration)', countField: 'luma_signup', type: 'behavior' });
  addMetric({ key: 'first_showup', label: 'First Show-Up (HubSpot Calls Tue/Thu)', countField: 'first_showup', type: 'behavior' });
  addMetric({ key: 'qualified_lead', label: 'Qualified Lead ($250k-$999,999 official + >1y sober at lead date)', countField: 'qualifiedLead', type: 'quality' });
  addMetric({ key: 'great_lead', label: 'Great Lead (>= $1M official + >1y sober at lead date)', countField: 'greatLead', type: 'quality' });
  addMetric({ key: 'great_member', label: 'Great Member (6+ show-ups)', countField: 'great_member', type: 'behavior' });
  addMetric({ key: 'ideal_member', label: 'Ideal Member (11+ show-ups + ICP profile)', countField: 'ideal_member', type: 'behavior' });

  const metricResultByKey = new Map(results.map((r) => [r.key, r]));
  function calcCpaFromCohorts(cohorts, countField) {
    const spend = (cohorts || []).reduce((s, c) => s + (safeNum(c?.spend) || 0), 0);
    const conversions = (cohorts || []).reduce((s, c) => s + (safeNum(c?.[countField]) || 0), 0);
    const leads = (cohorts || []).reduce((s, c) => s + (safeNum(c?.leads) || 0), 0);
    const conversionRate = leads > 0 ? conversions / leads : null;
    const cpa = conversions > 0 ? spend / conversions : null;
    return { spend, conversions, leads, conversionRate, cpa };
  }
  function trailingCohorts(n, list = cohortList) {
    return (list || []).slice(Math.max(0, (list || []).length - n));
  }
  function trailingCohortsOffset(n, offset = 0, list = cohortList) {
    const arr = list || [];
    const end = Math.max(0, arr.length - offset);
    const start = Math.max(0, end - n);
    return arr.slice(start, end);
  }
  function findMetricCard(key, fallbackLabel = key) {
    return metricResultByKey.get(key) || { key, label: fallbackLabel, finalized: {}, projected: null };
  }
  function makeCard({ key, label, category, value, format = 'currency', status = 'info', formula, numerator, denominator, notes = [], windowWeeks = [], trendComparison = null, referenceValues = {} }) {
    return {
      key,
      label,
      category,
      value,
      format,
      status,
      drilldown: {
        formula,
        numerator,
        denominator,
        notes,
        window_weeks: windowWeeks,
        trend_comparison: trendComparison,
        reference_values: referenceValues,
      },
    };
  }

  const allCohorts = cohortList;
  const last4wCohorts = trailingCohorts(4, allCohorts);
  const last8wCohorts = trailingCohorts(8, allCohorts);
  const last12wCohorts = trailingCohorts(12, allCohorts);
  const cplAll = calcCpaFromCohorts(allCohorts, 'leads');
  const cpl4 = calcCpaFromCohorts(last4wCohorts, 'leads');
  const cpl8 = calcCpaFromCohorts(last8wCohorts, 'leads');
  const cpl12 = calcCpaFromCohorts(last12wCohorts, 'leads');

  const qualityAsOf = asOfByMetric.qualified_lead;
  const qualityMaturedCohorts = cohortList.filter((c) => cohortAgeDays(c, qualityAsOf) >= qualityBufferDays);
  const qualityMatured12w = trailingCohorts(12, qualityMaturedCohorts);
  const cpqlAllMatured = calcCpaFromCohorts(qualityMaturedCohorts, 'qualifiedLead');
  const cpql12Matured = calcCpaFromCohorts(qualityMatured12w, 'qualifiedLead');
  const cpglAllMatured = calcCpaFromCohorts(qualityMaturedCohorts, 'greatLead');

  const firstShowMetric = findMetricCard('first_showup', 'First Show-Up');
  const greatMemberMetric = findMetricCard('great_member', 'Great Member');
  const qualifiedLeadMetric = findMetricCard('qualified_lead', 'Qualified Lead');
  const greatLeadMetric = findMetricCard('great_lead', 'Great Lead');
  const idealMetric = findMetricCard('ideal_member', 'Ideal Member');

  const finalizedQualifiedRate = safeNum(qualifiedLeadMetric?.finalized?.conversion_rate);
  const finalizedGreatRate = safeNum(greatLeadMetric?.finalized?.conversion_rate);
  const finalizedFirstShowRate = safeNum(firstShowMetric?.finalized?.conversion_rate);
  const finalizedGreatMemberRate = safeNum(greatMemberMetric?.finalized?.conversion_rate);
  const finalizedIdealRate = safeNum(idealMetric?.finalized?.conversion_rate);

  function forecastFromCurrentCpl(currentCpl, finalizedConversionRate) {
    if (!Number.isFinite(currentCpl) || !Number.isFinite(finalizedConversionRate) || finalizedConversionRate <= 0) return null;
    return currentCpl / finalizedConversionRate;
  }

  const currentCpl4w = safeNum(cpl4.cpa);
  const currentCpl8w = safeNum(cpl8.cpa);
  const currentCpl12w = safeNum(cpl12.cpa);
  const blendedCpl = safeNum(cplAll.cpa);

  const currentForecastCpql = forecastFromCurrentCpl(currentCpl4w, finalizedQualifiedRate);
  const currentForecastCpgl = forecastFromCurrentCpl(currentCpl4w, finalizedGreatRate);
  const currentForecastFirstShow = forecastFromCurrentCpl(currentCpl4w, finalizedFirstShowRate);
  const currentForecastGreatMember = forecastFromCurrentCpl(currentCpl4w, finalizedGreatMemberRate);
  const currentForecastIdeal = forecastFromCurrentCpl(currentCpl4w, finalizedIdealRate);

  const cplRatio4wVsBlended = (Number.isFinite(currentCpl4w) && Number.isFinite(blendedCpl) && blendedCpl > 0) ? (currentCpl4w / blendedCpl) : null;
  const cplRatio4wVs12w = (Number.isFinite(currentCpl4w) && Number.isFinite(currentCpl12w) && currentCpl12w > 0) ? (currentCpl4w / currentCpl12w) : null;
  const cpqlRatioForecastVsFinalized = (Number.isFinite(currentForecastCpql) && Number.isFinite(qualifiedLeadMetric?.finalized?.cpa) && qualifiedLeadMetric.finalized.cpa > 0)
    ? (currentForecastCpql / qualifiedLeadMetric.finalized.cpa)
    : null;
  const cpglRatioForecastVsFinalized = (Number.isFinite(currentForecastCpgl) && Number.isFinite(greatLeadMetric?.finalized?.cpa) && greatLeadMetric.finalized.cpa > 0)
    ? (currentForecastCpgl / greatLeadMetric.finalized.cpa)
    : null;

  const cplTrendLast12Weeks = last12wCohorts.map((c) => ({
    week: c.week,
    spend: fmtCurrency(c.spend),
    leads: c.leads,
    cpl: c.leads > 0 ? fmtCurrency(c.spend / c.leads) : null,
    qualified_leads: c.qualifiedLead || 0,
    great_leads: c.greatLead || 0,
  }));

  function aiStatusFromRatios() {
    if (Number.isFinite(cplRatio4wVsBlended) && cplRatio4wVsBlended >= 2 && Number.isFinite(cpqlRatioForecastVsFinalized) && cpqlRatioForecastVsFinalized >= 1.6) {
      return 'action_required';
    }
    if (Number.isFinite(cplRatio4wVsBlended) && cplRatio4wVsBlended >= 1.5) return 'warning';
    return 'ok';
  }
  const metaAiStatus = aiStatusFromRatios();
  const cplHighButCpqlStable = Number.isFinite(cplRatio4wVsBlended) && cplRatio4wVsBlended >= 1.5 && Number.isFinite(cpqlRatioForecastVsFinalized) && cpqlRatioForecastVsFinalized <= 1.25;
  const cplAndQualityCostsUp = Number.isFinite(cplRatio4wVsBlended) && cplRatio4wVsBlended >= 1.5 && Number.isFinite(cpqlRatioForecastVsFinalized) && cpqlRatioForecastVsFinalized > 1.35;

  const metaSpecialistCards = [
    makeCard({
      key: 'blended_cpl_all_cohorts',
      label: 'Blended CPL (All Cohorts)',
      category: 'cpl',
      value: blendedCpl,
      format: 'currency',
      status: 'info',
      formula: 'Total blended spend across all cohort weeks / total paid-social leads across all cohort weeks',
      numerator: { label: 'Spend (all cohort weeks)', value: cplAll.spend, format: 'currency' },
      denominator: { label: 'Paid-social leads (all cohort weeks)', value: cplAll.conversions, format: 'number' },
      notes: ['Historical benchmark only. Useful for context, not for current Meta decisions.'],
      windowWeeks: allCohorts.map((c) => c.week),
    }),
    makeCard({
      key: 'cpl_trailing_4w',
      label: 'Current CPL (Trailing 4 Cohort Weeks)',
      category: 'cpl',
      value: currentCpl4w,
      format: 'currency',
      status: Number.isFinite(cplRatio4wVsBlended) && cplRatio4wVsBlended >= 1.5 ? 'warn' : 'ok',
      formula: 'Blended spend in last 4 cohort weeks / paid-social leads created in those same 4 cohort weeks',
      numerator: { label: 'Spend (last 4 cohort weeks)', value: cpl4.spend, format: 'currency' },
      denominator: { label: 'Leads (last 4 cohort weeks)', value: cpl4.conversions, format: 'number' },
      trendComparison: { label: 'vs blended all-cohort CPL', ratio: cplRatio4wVsBlended },
      notes: ['This is the most useful near-term entry-cost number for budget decisions.'],
      windowWeeks: last4wCohorts.map((c) => c.week),
    }),
    makeCard({
      key: 'cpl_trailing_12w',
      label: 'CPL (Trailing 12 Cohort Weeks)',
      category: 'cpl',
      value: currentCpl12w,
      format: 'currency',
      status: 'info',
      formula: 'Blended spend in last 12 cohort weeks / paid-social leads created in those same 12 cohort weeks',
      numerator: { label: 'Spend (last 12 cohort weeks)', value: cpl12.spend, format: 'currency' },
      denominator: { label: 'Leads (last 12 cohort weeks)', value: cpl12.conversions, format: 'number' },
      trendComparison: { label: '4-week CPL vs 12-week CPL', ratio: cplRatio4wVs12w },
      notes: ['Use this to separate short-term spikes from a genuine pricing regime shift.'],
      windowWeeks: last12wCohorts.map((c) => c.week),
    }),
    makeCard({
      key: 'cpql_finalized',
      label: 'Finalized CPQL (Qualified Lead)',
      category: 'quality',
      value: qualifiedLeadMetric?.finalized?.cpa ?? null,
      format: 'currency',
      status: (qualifiedLeadMetric?.finalized?.conversions || 0) >= 100 ? 'ok' : 'warn',
      formula: 'Spend across matured quality cohorts / qualified lead conversions in those cohorts',
      numerator: { label: 'Spend (matured quality cohorts)', value: qualifiedLeadMetric?.finalized?.spend ?? null, format: 'currency' },
      denominator: { label: 'Qualified leads (matured quality cohorts)', value: qualifiedLeadMetric?.finalized?.conversions ?? null, format: 'number' },
      notes: [`Quality cohorts use a ${qualityBufferDays} day stabilization buffer.`],
      windowWeeks: qualityMaturedCohorts.map((c) => c.week),
    }),
    makeCard({
      key: 'cpql_current_entry_forecast',
      label: 'Current-Entry Forecast CPQL',
      category: 'quality',
      value: currentForecastCpql,
      format: 'currency',
      status: cplHighButCpqlStable ? 'warn' : (cplAndQualityCostsUp ? 'alert' : 'ok'),
      formula: 'Trailing 4-week CPL / finalized qualified-lead conversion rate',
      numerator: { label: 'Trailing 4-week CPL', value: currentCpl4w, format: 'currency' },
      denominator: { label: 'Finalized qualified-lead conversion rate', value: finalizedQualifiedRate, format: 'percent' },
      trendComparison: { label: 'Forecast CPQL vs finalized CPQL', ratio: cpqlRatioForecastVsFinalized },
      referenceValues: {
        finalized_cpql: qualifiedLeadMetric?.finalized?.cpa ?? null,
        finalized_qualified_lead_rate: finalizedQualifiedRate ?? null,
      },
      notes: ['This estimates what today’s lead cost implies for qualified leads if conversion quality remains similar.'],
      windowWeeks: last4wCohorts.map((c) => c.week),
    }),
    makeCard({
      key: 'cpgl_current_entry_forecast',
      label: 'Current-Entry Forecast Cost / Great Lead',
      category: 'quality',
      value: currentForecastCpgl,
      format: 'currency',
      status: Number.isFinite(cpglRatioForecastVsFinalized) && cpglRatioForecastVsFinalized > 1.35 ? 'warn' : 'ok',
      formula: 'Trailing 4-week CPL / finalized great-lead conversion rate',
      numerator: { label: 'Trailing 4-week CPL', value: currentCpl4w, format: 'currency' },
      denominator: { label: 'Finalized great-lead conversion rate', value: finalizedGreatRate, format: 'percent' },
      trendComparison: { label: 'Forecast cost / great lead vs finalized', ratio: cpglRatioForecastVsFinalized },
      referenceValues: { finalized_cost_per_great_lead: greatLeadMetric?.finalized?.cpa ?? null },
      windowWeeks: last4wCohorts.map((c) => c.week),
    }),
    makeCard({
      key: 'first_showup_current_entry_forecast',
      label: 'Current-Entry Forecast Cost / First Show-Up',
      category: 'showup',
      value: currentForecastFirstShow,
      format: 'currency',
      status: 'info',
      formula: 'Trailing 4-week CPL / finalized first-show-up conversion rate',
      numerator: { label: 'Trailing 4-week CPL', value: currentCpl4w, format: 'currency' },
      denominator: { label: 'Finalized first-show-up conversion rate', value: finalizedFirstShowRate, format: 'percent' },
      referenceValues: { finalized_cost_per_first_showup: firstShowMetric?.finalized?.cpa ?? null },
      windowWeeks: last4wCohorts.map((c) => c.week),
    }),
    makeCard({
      key: 'great_member_current_entry_forecast',
      label: 'Current-Entry Forecast Cost / Great Member (6+)',
      category: 'member',
      value: currentForecastGreatMember,
      format: 'currency',
      status: (lagStats?.great_member?.achievers || 0) < 10 ? 'warn' : 'info',
      formula: 'Trailing 4-week CPL / finalized great-member conversion rate',
      numerator: { label: 'Trailing 4-week CPL', value: currentCpl4w, format: 'currency' },
      denominator: { label: 'Finalized great-member conversion rate', value: finalizedGreatMemberRate, format: 'percent' },
      notes: ['Low sample size. Directional until more great-member outcomes accrue.'],
      referenceValues: { finalized_cost_per_great_member: greatMemberMetric?.finalized?.cpa ?? null },
      windowWeeks: last4wCohorts.map((c) => c.week),
    }),
    makeCard({
      key: 'ideal_member_current_entry_forecast',
      label: 'Current-Entry Forecast Cost / Ideal Member',
      category: 'member',
      value: currentForecastIdeal,
      format: 'currency',
      status: (lagStats?.ideal_member?.achievers || 0) < 5 ? 'warn' : 'info',
      formula: 'Trailing 4-week CPL / finalized ideal-member conversion rate',
      numerator: { label: 'Trailing 4-week CPL', value: currentCpl4w, format: 'currency' },
      denominator: { label: 'Finalized ideal-member conversion rate', value: finalizedIdealRate, format: 'percent' },
      notes: ['Very sparse sample. Treat as directional / planning-only.'],
      referenceValues: { finalized_cost_per_ideal_member: idealMetric?.finalized?.cpa ?? null },
      windowWeeks: last4wCohorts.map((c) => c.week),
    }),
  ];

  const metaAiSummary = (() => {
    const status = metaAiStatus;
    const summary = cplHighButCpqlStable
      ? 'CPL has risen materially versus the blended historical benchmark, but qualified-lead economics are holding up well enough that this is a warning to optimize, not a red alert.'
      : cplAndQualityCostsUp
        ? 'CPL is materially above the historical benchmark and the downstream forecast costs (especially qualified leads / great leads) are also rising, so this needs active optimization, not passive monitoring.'
        : 'Current CPL is elevated relative to the full historical average, but downstream economics do not yet indicate a major breakdown. Keep monitoring while testing improvements.';
    const observations = [
      Number.isFinite(currentCpl4w) && Number.isFinite(blendedCpl)
        ? `Trailing 4-week CPL is ${fmtCurrency(currentCpl4w)} vs blended cohort CPL ${fmtCurrency(blendedCpl)} (${((cplRatio4wVsBlended - 1) * 100).toFixed(0)}% ${(cplRatio4wVsBlended >= 1 ? 'higher' : 'lower')}).`
        : null,
      Number.isFinite(currentCpl12w)
        ? `Trailing 12-week CPL is ${fmtCurrency(currentCpl12w)}; compare this to the 4-week CPL to determine whether the recent rise is a spike or a sustained regime shift.`
        : null,
      Number.isFinite(currentForecastCpql) && Number.isFinite(qualifiedLeadMetric?.finalized?.cpa)
        ? `Current-entry forecast CPQL is ${fmtCurrency(currentForecastCpql)} vs finalized CPQL ${fmtCurrency(qualifiedLeadMetric.finalized.cpa)} (${((cpqlRatioForecastVsFinalized - 1) * 100).toFixed(0)}% ${(cpqlRatioForecastVsFinalized >= 1 ? 'higher' : 'lower')}).`
        : null,
      Number.isFinite(currentForecastCpgl) && Number.isFinite(greatLeadMetric?.finalized?.cpa)
        ? `Current-entry forecast cost per great lead is ${fmtCurrency(currentForecastCpgl)} vs finalized ${fmtCurrency(greatLeadMetric.finalized.cpa)}.`
        : null,
    ].filter(Boolean);
    const actionSteps = [
      'Launch a fresh creative batch this week (new hooks/angles + updated visual treatments) and run a clean A/B test against the current winners rather than tweaking small details only.',
      'Evaluate results using CPL and CPQL/CPGL together: if CPL rises but CPQL stays stable, optimize but do not panic; if both rise, rework targeting/creative more aggressively.',
      'Review form quality signals on the top-spend campaigns (especially malformed revenue answers / weird submissions) and confirm qualification copy is clear enough to filter low-fit leads without killing volume.',
      'Use the campaign/ad-set view (as attribution coverage improves) to protect higher-CPQL winners even if their raw CPL is above average.',
    ];
    const watchItems = [
      'Trailing 4-week CPL vs trailing 12-week CPL gap',
      'Forecast CPQL vs finalized CPQL ratio',
      'Forecast cost / great lead vs finalized cost / great lead ratio',
      'Great-member and ideal-member sample size (still limited, directional only)',
    ];
    return {
      status,
      summary,
      observations,
      action_steps: actionSteps,
      watch_items: watchItems,
      guidance: {
        cpl_elevated_but_quality_stable: cplHighButCpqlStable,
        cpl_and_quality_costs_up: cplAndQualityCostsUp,
      },
    };
  })();

  // Campaign diagnostics (best-effort exact normalized campaign-name match using HubSpot first-touch campaign detail).
  const adsCampaignSpendByWeekNorm = new Map();
  let adsLiveFreeSpendInCohortRange = 0;
  for (const ad of adsFree) {
    const day = parseDate(ad?.date_day);
    const spend = safeNum(ad?.spend) || 0;
    if (!day || !Number.isFinite(spend) || spend <= 0) continue;
    const wk = dateKey(mondayOf(day));
    if (!wk || wk < rangeStartKey || wk > rangeEndKey) continue;
    adsLiveFreeSpendInCohortRange += spend;
    const norm = normalizeTextKey(ad?.campaign_name);
    if (!norm) continue;
    const key = `${wk}__${norm}`;
    const prev = adsCampaignSpendByWeekNorm.get(key) || { spend: 0, campaign_name: String(ad?.campaign_name || '').trim(), week: wk };
    prev.spend += spend;
    if (!prev.campaign_name && ad?.campaign_name) prev.campaign_name = String(ad.campaign_name).trim();
    adsCampaignSpendByWeekNorm.set(key, prev);
  }

  function rowCampaignDetailLabel(row) {
    return String(row?.hsAnalyticsSourceData2 || row?.campaign || '').trim();
  }
  const campaignAggMap = new Map();
  let campaignDetailAny = 0;
  let campaignDetailNonGeneric = 0;
  let exactCampaignWeekMatchedLeads = 0;
  let genericOrBlankCampaignDetailLeads = 0;
  const unmatchedCampaignLabelCounts = new Map();

  for (const row of cohortRows) {
    const rawCampaignLabel = rowCampaignDetailLabel(row);
    const normCampaignLabel = normalizeTextKey(rawCampaignLabel);
    const isBlankOrGeneric = !normCampaignLabel || likelyGenericCampaignLabel(rawCampaignLabel);
    if (rawCampaignLabel) campaignDetailAny += 1;
    if (isBlankOrGeneric) genericOrBlankCampaignDetailLeads += 1;
    if (!isBlankOrGeneric) campaignDetailNonGeneric += 1;

    const groupKey = normCampaignLabel || '__unattributed_or_generic__';
    let agg = campaignAggMap.get(groupKey);
    if (!agg) {
      agg = {
        key: groupKey,
        displayLabel: rawCampaignLabel || 'Unattributed / Generic Facebook Lead',
        labels: new Map(),
        leads: 0,
        qualifiedLead: 0,
        greatLead: 0,
        firstShowup: 0,
        lumaSignup: 0,
        greatMember: 0,
        idealMember: 0,
        exactMatchLeads: 0,
        nonGenericCampaignDetailLeads: 0,
        isGenericBucket: groupKey === '__unattributed_or_generic__' || isBlankOrGeneric,
        topForms: new Map(),
        leadWeeks: new Set(),
        matchedWeekKeys: new Set(),
        rows: [],
      };
      campaignAggMap.set(groupKey, agg);
    }
    if (rawCampaignLabel) agg.labels.set(rawCampaignLabel, (agg.labels.get(rawCampaignLabel) || 0) + 1);
    agg.leads += 1;
    if (!isBlankOrGeneric) agg.nonGenericCampaignDetailLeads += 1;
    if (row.qualifiedLead) agg.qualifiedLead += 1;
    if (row.greatLead) agg.greatLead += 1;
    if (row.firstShowAt && row.firstShowAt <= attendanceAsOf) agg.firstShowup += 1;
    if (row.lumaAt && row.lumaAt <= lumaAsOf) agg.lumaSignup += 1;
    if (row.greatMember) agg.greatMember += 1;
    if (row.idealMember) agg.idealMember += 1;
    if (row.leadWeek) agg.leadWeeks.add(row.leadWeek);
    if (row.firstConversionEventName) agg.topForms.set(row.firstConversionEventName, (agg.topForms.get(row.firstConversionEventName) || 0) + 1);
    agg.rows.push(row);

    if (!isBlankOrGeneric && normCampaignLabel && row.leadWeek) {
      const exactKey = `${row.leadWeek}__${normCampaignLabel}`;
      if (adsCampaignSpendByWeekNorm.has(exactKey)) {
        agg.exactMatchLeads += 1;
        agg.matchedWeekKeys.add(exactKey);
        exactCampaignWeekMatchedLeads += 1;
      } else {
        unmatchedCampaignLabelCounts.set(rawCampaignLabel || '(blank)', (unmatchedCampaignLabelCounts.get(rawCampaignLabel || '(blank)') || 0) + 1);
      }
    }
  }

  const campaignRows = [...campaignAggMap.values()].map((agg) => {
    const sortedLabels = [...agg.labels.entries()].sort((a, b) => b[1] - a[1]);
    const sortedForms = [...agg.topForms.entries()].sort((a, b) => b[1] - a[1]);
    const matchedSpend = [...agg.matchedWeekKeys].reduce((sum, k) => sum + (safeNum(adsCampaignSpendByWeekNorm.get(k)?.spend) || 0), 0);
    const matchedWeekCount = agg.matchedWeekKeys.size;
    const exactMatchLeadRate = toPctSafe(agg.exactMatchLeads, agg.leads);
    const spendCoverageVsLive = adsLiveFreeSpendInCohortRange > 0 ? matchedSpend / adsLiveFreeSpendInCohortRange : null;
    const cplExact = agg.exactMatchLeads > 0 && matchedSpend > 0 ? matchedSpend / agg.exactMatchLeads : null;
    const cpqlExact = agg.qualifiedLead > 0 && matchedSpend > 0 ? matchedSpend / agg.qualifiedLead : null;
    const cpglExact = agg.greatLead > 0 && matchedSpend > 0 ? matchedSpend / agg.greatLead : null;
    const cpaFirstShowExact = agg.firstShowup > 0 && matchedSpend > 0 ? matchedSpend / agg.firstShowup : null;
    const cpaGreatMemberExact = agg.greatMember > 0 && matchedSpend > 0 ? matchedSpend / agg.greatMember : null;
    const cpaIdealExact = agg.idealMember > 0 && matchedSpend > 0 ? matchedSpend / agg.idealMember : null;
    return {
      campaign_key: agg.key,
      campaign_label: sortedLabels[0]?.[0] || agg.displayLabel,
      campaign_label_variants: sortedLabels.slice(0, 4).map(([label, count]) => ({ label, count })),
      leads: agg.leads,
      qualified_leads: agg.qualifiedLead,
      great_leads: agg.greatLead,
      luma_signups: agg.lumaSignup,
      first_showups: agg.firstShowup,
      great_members: agg.greatMember,
      ideal_members: agg.idealMember,
      qualified_lead_rate: toPctSafe(agg.qualifiedLead, agg.leads),
      great_lead_rate: toPctSafe(agg.greatLead, agg.leads),
      first_showup_rate: toPctSafe(agg.firstShowup, agg.leads),
      great_member_rate: toPctSafe(agg.greatMember, agg.leads),
      ideal_member_rate: toPctSafe(agg.idealMember, agg.leads),
      exact_match_leads: agg.exactMatchLeads,
      exact_match_lead_rate: exactMatchLeadRate,
      non_generic_campaign_detail_leads: agg.nonGenericCampaignDetailLeads,
      matched_spend_exact_campaign_week: matchedSpend,
      matched_spend_share_of_live_free_spend: spendCoverageVsLive,
      cpl_exact_campaign_week: cplExact,
      cpql_exact_campaign_week: cpqlExact,
      cpgl_exact_campaign_week: cpglExact,
      cost_per_first_showup_exact_campaign_week: cpaFirstShowExact,
      cost_per_great_member_exact_campaign_week: cpaGreatMemberExact,
      cost_per_ideal_member_exact_campaign_week: cpaIdealExact,
      matched_campaign_weeks: matchedWeekCount,
      lead_weeks_count: agg.leadWeeks.size,
      latest_lead_week: [...agg.leadWeeks].sort().slice(-1)[0] || null,
      top_first_conversion_forms: sortedForms.slice(0, 3).map(([form, count]) => ({ form, count })),
      attribution_quality: agg.isGenericBucket ? 'generic_or_unattributed' : (matchedWeekCount > 0 ? 'exact_campaign_week_match_available' : 'non_generic_label_no_exact_meta_campaign_match'),
    };
  });

  const campaignRowsSorted = campaignRows.sort((a, b) =>
    (b.ideal_members || 0) - (a.ideal_members || 0) ||
    (b.great_members || 0) - (a.great_members || 0) ||
    (b.qualified_leads || 0) - (a.qualified_leads || 0) ||
    (b.leads || 0) - (a.leads || 0)
  );
  const campaignRowsExactMatched = campaignRowsSorted.filter((r) => r.matched_campaign_weeks > 0 && r.exact_match_leads > 0);
  const campaignAggByKey = new Map([...campaignAggMap.entries()]);
  const topCampaignByLeads = campaignRowsExactMatched
    .filter((r) => r.exact_match_leads >= 10)
    .slice()
    .sort((a, b) => (b.exact_match_leads || 0) - (a.exact_match_leads || 0))[0] || null;
  const topCampaignByIdeal = campaignRowsSorted.find((r) => (r.ideal_members || 0) > 0) || null;
  const bestCpqlCampaign = campaignRowsExactMatched
    .filter((r) => (r.exact_match_leads || 0) >= 15 && (r.qualified_leads || 0) >= 3 && Number.isFinite(r.cpql_exact_campaign_week))
    .slice()
    .sort((a, b) => (a.cpql_exact_campaign_week || Infinity) - (b.cpql_exact_campaign_week || Infinity))[0] || null;
  const highCplStrongQualityCampaign = campaignRowsExactMatched
    .filter((r) =>
      (r.exact_match_leads || 0) >= 10 &&
      Number.isFinite(r.cpl_exact_campaign_week) &&
      Number.isFinite(r.qualified_lead_rate) &&
      Number.isFinite(finalizedQualifiedRate) &&
      r.cpl_exact_campaign_week > (currentCpl4w || Infinity) &&
      r.qualified_lead_rate >= finalizedQualifiedRate
    )
    .slice()
    .sort((a, b) => (b.qualified_lead_rate || 0) - (a.qualified_lead_rate || 0) || (b.exact_match_leads || 0) - (a.exact_match_leads || 0))[0] || null;
  const underperformingCampaign = campaignRowsExactMatched
    .filter((r) =>
      (r.exact_match_leads || 0) >= 10 &&
      Number.isFinite(r.cpl_exact_campaign_week) &&
      Number.isFinite(r.qualified_lead_rate) &&
      Number.isFinite(finalizedQualifiedRate) &&
      r.cpl_exact_campaign_week >= (currentCpl4w || Infinity) &&
      r.qualified_lead_rate < finalizedQualifiedRate
    )
    .slice()
    .sort((a, b) => (b.cpl_exact_campaign_week || 0) - (a.cpl_exact_campaign_week || 0))[0] || null;

  const campaignCoverage = {
    lead_rows_total: cohortRows.length,
    leads_with_any_campaign_detail: campaignDetailAny,
    leads_with_non_generic_campaign_detail: campaignDetailNonGeneric,
    generic_or_blank_campaign_detail_leads: genericOrBlankCampaignDetailLeads,
    exact_campaign_week_match_leads: exactCampaignWeekMatchedLeads,
    exact_campaign_week_match_rate_all_leads: toPctSafe(exactCampaignWeekMatchedLeads, cohortRows.length),
    exact_campaign_week_match_rate_non_generic_details: toPctSafe(exactCampaignWeekMatchedLeads, campaignDetailNonGeneric),
    distinct_campaign_buckets_in_hubspot: campaignRows.length,
    distinct_campaigns_with_exact_match_and_spend: campaignRowsExactMatched.length,
    live_meta_free_spend_in_cohort_range: adsLiveFreeSpendInCohortRange,
    exact_matched_campaign_spend_total: campaignRowsExactMatched.reduce((s, r) => s + (safeNum(r.matched_spend_exact_campaign_week) || 0), 0),
    exact_matched_campaign_spend_share_of_live_meta_free_spend: adsLiveFreeSpendInCohortRange > 0
      ? campaignRowsExactMatched.reduce((s, r) => s + (safeNum(r.matched_spend_exact_campaign_week) || 0), 0) / adsLiveFreeSpendInCohortRange
      : null,
    adset_support_status: 'not_available_in_current_attribution_fields',
  };

  const campaignDiagCards = [
    makeCard({
      key: 'campaign_exact_match_coverage',
      label: 'Campaign Attribution Coverage (Exact Campaign+Week Match)',
      category: 'campaign',
      value: campaignCoverage.exact_campaign_week_match_rate_all_leads,
      format: 'percent',
      status: (campaignCoverage.exact_campaign_week_match_rate_all_leads || 0) >= 0.5 ? 'ok' : ((campaignCoverage.exact_campaign_week_match_rate_all_leads || 0) >= 0.25 ? 'warn' : 'alert'),
      formula: 'Paid-social cohort leads with non-generic HubSpot campaign detail that exactly normalized-match a Meta campaign_name in the same lead cohort week / all paid-social cohort leads',
      numerator: { label: 'Exact campaign+week matched leads', value: campaignCoverage.exact_campaign_week_match_leads, format: 'number' },
      denominator: { label: 'All paid-social cohort leads', value: campaignCoverage.lead_rows_total, format: 'number' },
      notes: ['Campaign CPA rows are decision-grade only for the exact-match subset. Ad set diagnostics are not yet supported with current attribution fields.'],
      windowWeeks: allCohorts.map((c) => c.week),
      referenceValues: {
        exact_match_rate_non_generic_details: campaignCoverage.exact_campaign_week_match_rate_non_generic_details ?? null,
        exact_matched_campaign_spend_share_of_live_meta_free_spend: campaignCoverage.exact_matched_campaign_spend_share_of_live_meta_free_spend ?? null,
      },
    }),
    topCampaignByLeads ? makeCard({
      key: 'campaign_top_by_matched_leads',
      label: `Top Campaign by Exact-Matched Leads: ${topCampaignByLeads.campaign_label}`,
      category: 'campaign',
      value: topCampaignByLeads.exact_match_leads,
      format: 'number',
      status: 'info',
      formula: 'Exact-matched leads attributed to this campaign across matched campaign-week rows',
      numerator: { label: 'Exact-matched leads for campaign', value: topCampaignByLeads.exact_match_leads, format: 'number' },
      denominator: { label: 'Total exact-matched leads (all campaigns)', value: campaignCoverage.exact_campaign_week_match_leads, format: 'number' },
      notes: [`CPL (exact campaign-week): ${fmtCurrency(topCampaignByLeads.cpl_exact_campaign_week) == null ? 'N/A' : `$${fmtCurrency(topCampaignByLeads.cpl_exact_campaign_week)}`}`, `Qualified lead rate: ${topCampaignByLeads.qualified_lead_rate == null ? 'N/A' : `${(topCampaignByLeads.qualified_lead_rate * 100).toFixed(1)}%`}`],
      windowWeeks: [],
    }) : null,
    bestCpqlCampaign ? makeCard({
      key: 'campaign_best_cpql',
      label: `Best Campaign CPQL (Exact Subset): ${bestCpqlCampaign.campaign_label}`,
      category: 'campaign',
      value: bestCpqlCampaign.cpql_exact_campaign_week,
      format: 'currency',
      status: 'ok',
      formula: 'Matched campaign-week spend for this campaign / qualified leads from this campaign (exact-match subset)',
      numerator: { label: 'Matched campaign-week spend', value: bestCpqlCampaign.matched_spend_exact_campaign_week, format: 'currency' },
      denominator: { label: 'Qualified leads', value: bestCpqlCampaign.qualified_leads, format: 'number' },
      trendComparison: Number.isFinite(qualifiedLeadMetric?.finalized?.cpa) ? { label: 'Campaign CPQL vs finalized CPQL', ratio: bestCpqlCampaign.cpql_exact_campaign_week / qualifiedLeadMetric.finalized.cpa } : null,
      notes: ['Use this to protect efficient winners even if raw CPL is not the lowest.'],
      windowWeeks: [],
    }) : null,
    highCplStrongQualityCampaign ? makeCard({
      key: 'campaign_high_cpl_strong_quality',
      label: `High CPL but Strong Quality: ${highCplStrongQualityCampaign.campaign_label}`,
      category: 'campaign',
      value: highCplStrongQualityCampaign.cpl_exact_campaign_week,
      format: 'currency',
      status: 'warn',
      formula: 'Matched campaign-week spend / exact-matched leads for this campaign',
      numerator: { label: 'Matched campaign-week spend', value: highCplStrongQualityCampaign.matched_spend_exact_campaign_week, format: 'currency' },
      denominator: { label: 'Exact-matched leads', value: highCplStrongQualityCampaign.exact_match_leads, format: 'number' },
      notes: [`Qualified lead rate ${((highCplStrongQualityCampaign.qualified_lead_rate || 0) * 100).toFixed(1)}% is at/above finalized benchmark ${(Number((finalizedQualifiedRate || 0) * 100)).toFixed(1)}%. Consider protecting this campaign while testing cheaper variants.`],
      windowWeeks: [],
    }) : null,
    underperformingCampaign ? makeCard({
      key: 'campaign_underperformer_watch',
      label: `Campaign Watch / Triage: ${underperformingCampaign.campaign_label}`,
      category: 'campaign',
      value: underperformingCampaign.cpql_exact_campaign_week,
      format: 'currency',
      status: 'alert',
      formula: 'Matched campaign-week spend / qualified leads for this campaign (exact-match subset)',
      numerator: { label: 'Matched campaign-week spend', value: underperformingCampaign.matched_spend_exact_campaign_week, format: 'currency' },
      denominator: { label: 'Qualified leads', value: underperformingCampaign.qualified_leads, format: 'number' },
      notes: [`CPL ${fmtCurrency(underperformingCampaign.cpl_exact_campaign_week) == null ? 'N/A' : `$${fmtCurrency(underperformingCampaign.cpl_exact_campaign_week)}`} with below-benchmark qualified lead rate ${((underperformingCampaign.qualified_lead_rate || 0) * 100).toFixed(1)}%. Candidate for creative refresh / tighter targeting.`],
      windowWeeks: [],
    }) : null,
  ].filter(Boolean);

  const campaignDiagnostics = {
    attribution_coverage: campaignCoverage,
    cards: campaignDiagCards,
    rows: campaignRowsSorted.slice(0, 40),
    drilldowns_by_campaign: {},
    unmatched_campaign_labels_top: [...unmatchedCampaignLabelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, leads]) => ({ label, leads })),
    notes: [
      'Campaign metrics use exact normalized HubSpot campaign detail -> Meta campaign_name matches in the same lead cohort week when available.',
      'Rows without exact campaign+week match stay visible for outcome rates, but spend-based campaign CPA fields remain null for those rows.',
      'Ad set diagnostics require persistent first-touch ad set IDs/names on contacts and are not yet decision-grade.',
    ],
    recommended_actions: [
      bestCpqlCampaign ? `Protect and scale-test "${bestCpqlCampaign.campaign_label}" as a quality benchmark (best exact-subset CPQL in current snapshot).` : 'Identify a stable campaign winner with enough exact-match volume before making major budget shifts.',
      underperformingCampaign ? `Triage "${underperformingCampaign.campaign_label}" first: refresh creative and inspect audience/form quality before increasing spend.` : 'Use the campaign table to flag high-CPL + low-quality campaigns once enough exact-match coverage exists.',
      highCplStrongQualityCampaign ? `Do not cut "${highCplStrongQualityCampaign.campaign_label}" solely because CPL is high; compare CPQL/CPGL and member outcomes before pausing.` : 'As coverage improves, look for campaigns with above-average CPL but strong qualified/great lead rates and protect them.',
    ],
  };

  const metaSpecialistDiagnostics = {
    generated_at: new Date().toISOString(),
    status: metaAiStatus,
    cards: metaSpecialistCards,
    campaign_diagnostics: campaignDiagnostics,
    cpl_trend_last_12_weeks: cplTrendLast12Weeks,
    ai_analysis: metaAiSummary,
  };

  // Naive comparison over last 90 days (period spend / period outcomes) to illustrate distortion.
  const naiveEnd = parseDate(`${rangeEndKey}T23:59:59.999Z`);
  const naiveStart = addDays(naiveEnd, -89);
  const naiveSpend90 = [...blendedSpendByDay.entries()]
    .filter(([day]) => {
      const d = parseDate(`${day}T00:00:00.000Z`);
      return d && d >= naiveStart && d <= naiveEnd;
    })
    .reduce((s, [, spend]) => s + (safeNum(spend) || 0), 0);
  const naiveCounts90 = {
    leads: cohortRows.filter((r)=>r.leadAt >= naiveStart && r.leadAt <= naiveEnd).length,
    luma_signup: cohortRows.filter((r)=>r.lumaAt && r.lumaAt >= naiveStart && r.lumaAt <= naiveEnd).length,
    first_showup: cohortRows.filter((r)=>r.firstShowAt && r.firstShowAt >= naiveStart && r.firstShowAt <= naiveEnd).length,
    qualified_lead: cohortRows.filter((r)=>r.qualifiedLead && r.leadAt >= naiveStart && r.leadAt <= naiveEnd).length,
    great_lead: cohortRows.filter((r)=>r.greatLead && r.leadAt >= naiveStart && r.leadAt <= naiveEnd).length,
    great_member: cohortRows.filter((r)=>r.show6At && r.show6At >= naiveStart && r.show6At <= naiveEnd).length,
    ideal_member: cohortRows.filter((r)=>r.idealMember && r.show11At && r.show11At >= naiveStart && r.show11At <= naiveEnd).length,
  };
  const naiveCpa90 = Object.fromEntries(Object.entries(naiveCounts90).map(([k,v]) => [k, v > 0 ? naiveSpend90 / v : null]));

  const dataQuality = {
    counts: {
      ads_rows: metaSpendScope.total.rows,
      ads_free_rows: adsFree.length,
      ads_phoenix_rows: metaSpendScope.phoenix.rows,
      ads_other_rows: metaSpendScope.other.rows,
      ads_lead_gen_rows: metaSpendScope.lead_gen.rows,
      ads_meta_accounts: metaSpendScope.by_account.length,
      ads_spend_total: metaSpendScope.total.spend,
      ads_spend_lead_gen: metaSpendScope.lead_gen.spend,
      ads_spend_free: metaSpendScope.free.spend,
      ads_spend_phoenix: metaSpendScope.phoenix.spend,
      spend_blended_daily_rows: blendedSpendByDay.size,
      hubspot_contacts_raw_rows: contactsRaw.length,
      hubspot_contacts_deduped: contacts.length,
      luma_rows: lumaRaw.length,
      luma_contact_matches: lumaByContact.size,
      luma_email_fallback_matches: lumaFallbackEmailMatches,
      hubspot_call_activities: actsRaw.length,
      hubspot_call_associations: assocsRaw.length,
      classified_group_sessions: sessions.length,
      contacts_with_any_group_showup: attendanceByContact.size,
      meta_paid_free_contacts_total: metaFreeContacts.length,
      cohort_contacts_in_range_pre_exclusion: metaFreeContacts.filter(c => {
        const wk = dateKey(mondayOf(c.leadAt));
        return wk >= rangeStartKey && wk <= rangeEndKey;
      }).length,
      cohort_contacts_analyzed: cohortRows.length,
      excluded_preexisting_attendance: preexistingAttendanceExcluded,
      excluded_preexisting_luma: preexistingLumaExcluded,
      excluded_out_of_range_leads: outOfRangeLeadExcluded,
      excluded_phoenix_meta_contacts: excludedPhoenix,
    },
    date_range: {
      ads_live_min: adsMinDate,
      ads_live_max: adsMaxDate,
      spend_blended_min: spendMinDateBlended,
      spend_blended_max: spendMaxDateBlended,
      last_complete_ad_week_start: rangeEndKey,
      luma_as_of: dateKey(lumaAsOf),
      attendance_as_of: dateKey(attendanceAsOf),
    },
    spend_backfill_manual_week_end: manualBackfill ? {
      csv_path: manualBackfill.csv_path,
      assumption: 'Labels are week-end dates; each value allocated evenly across interval since prior label (first label assumed 7-day interval). Blank cells treated as unknown and not allocated. Manual spend is additive to live Meta free-funnel spend only (Phoenix remains separated in meta_spend_scope), including overlap during transition.',
      ...manualBackfill.stats,
      overlap_week_end_rows_with_live_ads_window: manualBackfill.week_end_rows
        .filter((r) => adsMinDate && r.week_end >= adsMinDate)
        .map((r) => ({ week_end: r.week_end, spend: r.spend })),
    } : null,
    completeness_meta_free_analyzed: {
      official_revenue_present: cohortRows.filter(r => r.revenueOfficial != null).length,
      official_revenue_rate: cohortRows.length ? cohortRows.filter(r => r.revenueOfficial != null).length / cohortRows.length : null,
      sobriety_present: cohortRows.filter(r => r.hasSobrietyDate).length,
      sobriety_rate: cohortRows.length ? cohortRows.filter(r => r.hasSobrietyDate).length / cohortRows.length : null,
      both_for_icp: cohortRows.filter(r => r.revenueOfficial != null && r.hasSobrietyDate).length,
      both_for_icp_rate: cohortRows.length ? cohortRows.filter(r => r.revenueOfficial != null && r.hasSobrietyDate).length / cohortRows.length : null,
    },
  };

  // Short diagnostics on lag hypotheses
  const lagHypotheses = {
    luma_within_14_days_share: (() => {
      const l = lagCollector.luma_signup.map(x => x.lag);
      return l.length ? l.filter(d=>d<=14).length / l.length : null;
    })(),
    first_showup_within_21_days_share: (() => {
      const l = lagCollector.first_showup.map(x => x.lag);
      return l.length ? l.filter(d=>d<=21).length / l.length : null;
    })(),
  };

  const allContactsMembershipContains250k = contacts.filter((c) => String(c?.membership_s || '').includes('Main Free $250k+ Group'));
  const allContactsMembershipExact250k = contacts.filter((c) => String(c?.membership_s || '').trim() === 'Main Free $250k+ Group');
  const allContactsMembership250kZeroRevenue = allContactsMembershipContains250k.filter((c) => {
    const rev = officialRevenue(c);
    return rev == null || rev === 0;
  });

  function toHubspotUrl(contactId) {
    return Number.isFinite(Number(contactId))
      ? `https://app.hubspot.com/contacts/45070276/record/0-1/${Number(contactId)}`
      : null;
  }
  function summarizeCohortPerson(row) {
    return {
      hubspot_contact_id: row.contactId,
      display_name: row.contactName || '',
      email: row.email || null,
      original_traffic_source: row.originalTrafficSource || null,
      lead_date: dateKey(row.leadAt),
      lead_week: row.leadWeek,
      total_showups: row.totalShowups || 0,
      first_group_showup_at: row.firstGroupShowupAt ? row.firstGroupShowupAt.toISOString() : null,
      last_group_showup_at: row.lastGroupShowupAt ? row.lastGroupShowupAt.toISOString() : null,
      days_since_last_showup: row.daysSinceLastShowup,
      primary_attendance_group: row.primaryAttendanceGroup || null,
      primary_attendance_group_showups: row.primaryAttendanceGroupShowups || 0,
      missed_primary_group_sessions_since_last_showup: row.missedPrimaryGroupSessionsSinceLastShowup || 0,
      missed_all_group_sessions_since_last_showup: row.missedAllGroupSessionsSinceLastShowup || 0,
      recent_showups_30d: row.recentShowups30d || 0,
      recent_showups_60d: row.recentShowups60d || 0,
      revenue_official_cached: row.revenueOfficial,
      sobriety_date: row.sobrietyDate || null,
      sobriety_date_present: !!row.hasSobrietyDate,
      sober_over_1y_at_lead: !!row.sober1yAtLead,
      qualified_lead: !!row.qualifiedLead,
      great_lead: !!row.greatLead,
      great_member: !!row.greatMember,
      ideal_member: !!row.idealMember,
      membership_s: row.membershipS || null,
      hs_analytics_source_data_1: row.hsAnalyticsSourceData1 || null,
      hs_analytics_source_data_2: row.hsAnalyticsSourceData2 || null,
      first_conversion_event_name: row.firstConversionEventName || null,
      recent_conversion_event_name: row.recentConversionEventName || null,
      campaign: row.campaign || null,
      campaign_source: row.campaignSource || null,
      hubspot_url: toHubspotUrl(row.contactId),
    };
  }
  function summarizeContactForQa(c) {
    const contactId = Number(c?.hubspot_contact_id);
    return {
      hubspot_contact_id: contactId,
      display_name: `${String(c?.firstname || '').trim()} ${String(c?.lastname || '').trim()}`.trim(),
      email: normalizeEmail(c?.email) || null,
      hs_additional_emails: parseAdditionalEmails(c?.hs_additional_emails),
      createdate: c?.createdate || null,
      membership_s: c?.membership_s || null,
      revenue_official_cached: officialRevenue(c),
      revenue_fallback_cached: fallbackRevenue(c),
      sobriety_date: c?.sobriety_date || null,
      original_traffic_source: c?.original_traffic_source || null,
      hs_analytics_source_data_1: c?.hs_analytics_source_data_1 || null,
      hs_analytics_source_data_2: c?.hs_analytics_source_data_2 || null,
      campaign: c?.campaign || null,
      campaign_source: c?.campaign_source || null,
      first_conversion_event_name: c?.first_conversion_event_name || null,
      recent_conversion_event_name: c?.recent_conversion_event_name || null,
      hubspot_url: toHubspotUrl(contactId),
    };
  }

  function pctChange(current, prior) {
    const c = Number(current);
    const p = Number(prior);
    if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
    return (c - p) / p;
  }

  function cohortLeadType(row) {
    if (row?.greatLead) return 'Great';
    if (row?.qualifiedLead) return 'Qualified';
    return 'Lead';
  }

  function freeEventsHowFoundUs(row) {
    return (
      row?.firstConversionEventName ||
      row?.hsAnalyticsSourceData1 ||
      row?.hsAnalyticsSourceData2 ||
      row?.campaign ||
      row?.campaignSource ||
      row?.originalTrafficSource ||
      null
    );
  }

  function summarizeFreeEventsDrilldownRow(row) {
    return {
      hubspot_contact_id: row.contactId,
      name: row.contactName || '',
      email: row.email || null,
      annual_revenue_in_usd_official: row.revenueOfficial,
      sobriety_date: row.sobrietyDate || null,
      how_they_found_us: freeEventsHowFoundUs(row),
      show_up: row.firstShowAt ? 'Yes' : 'No',
      type: cohortLeadType(row),
      hubspot_url: toHubspotUrl(row.contactId),
    };
  }

  function sortFreeEventsRows(rows) {
    return [...rows].sort((a, b) =>
      Number(!!b.firstShowAt) - Number(!!a.firstShowAt) ||
      ((Number.isFinite(b.revenueOfficial) ? b.revenueOfficial : -Infinity) - (Number.isFinite(a.revenueOfficial) ? a.revenueOfficial : -Infinity)) ||
      String(a.contactName || '').localeCompare(String(b.contactName || ''))
    );
  }

  const compactWindowWeeksCurrent = trailingCohortsOffset(4, 0, cohortList);
  const compactWindowWeeksPrior = trailingCohortsOffset(4, 4, cohortList);
  const compactCurrentWeekSet = new Set(compactWindowWeeksCurrent.map((c) => c.week));
  const compactPriorWeekSet = new Set(compactWindowWeeksPrior.map((c) => c.week));

  const compactMetricsByField = {
    leads: {
      current: calcCpaFromCohorts(compactWindowWeeksCurrent, 'leads'),
      prior: calcCpaFromCohorts(compactWindowWeeksPrior, 'leads'),
    },
    qualifiedLead: {
      current: calcCpaFromCohorts(compactWindowWeeksCurrent, 'qualifiedLead'),
      prior: calcCpaFromCohorts(compactWindowWeeksPrior, 'qualifiedLead'),
    },
    greatLead: {
      current: calcCpaFromCohorts(compactWindowWeeksCurrent, 'greatLead'),
      prior: calcCpaFromCohorts(compactWindowWeeksPrior, 'greatLead'),
    },
    luma_signup: {
      current: calcCpaFromCohorts(compactWindowWeeksCurrent, 'luma_signup'),
      prior: calcCpaFromCohorts(compactWindowWeeksPrior, 'luma_signup'),
    },
    first_showup: {
      current: calcCpaFromCohorts(compactWindowWeeksCurrent, 'first_showup'),
      prior: calcCpaFromCohorts(compactWindowWeeksPrior, 'first_showup'),
    },
  };

  const freeEventsDrilldownRows = {
    free_events_meta_leads: sortFreeEventsRows(cohortRows.filter((r) => compactCurrentWeekSet.has(r.leadWeek))).map(summarizeFreeEventsDrilldownRow),
    free_events_meta_qualified_leads: sortFreeEventsRows(cohortRows.filter((r) => compactCurrentWeekSet.has(r.leadWeek) && r.qualifiedLead)).map(summarizeFreeEventsDrilldownRow),
    free_events_meta_great_leads: sortFreeEventsRows(cohortRows.filter((r) => compactCurrentWeekSet.has(r.leadWeek) && r.greatLead)).map(summarizeFreeEventsDrilldownRow),
    free_events_luma_signups: sortFreeEventsRows(cohortRows.filter((r) => compactCurrentWeekSet.has(r.leadWeek) && r.lumaAt)).map(summarizeFreeEventsDrilldownRow),
    free_events_net_new_showups: sortFreeEventsRows(cohortRows.filter((r) => compactCurrentWeekSet.has(r.leadWeek) && r.firstShowAt)).map(summarizeFreeEventsDrilldownRow),
  };

  function compactStageCard({ key, label, countFieldKey, drilldownKey }) {
    const current = compactMetricsByField[countFieldKey]?.current || {};
    const prior = compactMetricsByField[countFieldKey]?.prior || {};
    return {
      key,
      label,
      drilldown_key: drilldownKey,
      current_count: current.conversions ?? null,
      prior_count: prior.conversions ?? null,
      count_change_pct: pctChange(current.conversions, prior.conversions),
      current_cost: current.cpa ?? null,
      prior_cost: prior.cpa ?? null,
      cost_change_pct: pctChange(current.cpa, prior.cpa),
      current_spend: current.spend ?? null,
      prior_spend: prior.spend ?? null,
      current_leads: current.leads ?? null,
      prior_leads: prior.leads ?? null,
    };
  }

  const freeEventsSummary = {
    category: 'Free Events',
    window_label_current: compactWindowWeeksCurrent.length
      ? `${compactWindowWeeksCurrent[0].week} to ${compactWindowWeeksCurrent[compactWindowWeeksCurrent.length - 1].week}`
      : null,
    window_label_prior: compactWindowWeeksPrior.length
      ? `${compactWindowWeeksPrior[0].week} to ${compactWindowWeeksPrior[compactWindowWeeksPrior.length - 1].week}`
      : null,
    window_type: 'Trailing 4 cohort weeks vs prior 4 cohort weeks',
    cards: [
      compactStageCard({ key: 'meta_leads', label: 'Meta Leads', countFieldKey: 'leads', drilldownKey: 'free_events_meta_leads' }),
      compactStageCard({ key: 'meta_qualified_leads', label: 'Meta Qualified Leads', countFieldKey: 'qualifiedLead', drilldownKey: 'free_events_meta_qualified_leads' }),
      compactStageCard({ key: 'meta_great_leads', label: 'Meta Great Leads', countFieldKey: 'greatLead', drilldownKey: 'free_events_meta_great_leads' }),
      compactStageCard({ key: 'luma_signups_paid', label: 'Luma Sign Ups (Paid Ads)', countFieldKey: 'luma_signup', drilldownKey: 'free_events_luma_signups' }),
      compactStageCard({ key: 'net_new_showups', label: 'Net New Show Ups', countFieldKey: 'first_showup', drilldownKey: 'free_events_net_new_showups' }),
    ],
  };

  const greatMemberRows = cohortRows
    .filter((r) => r.greatMember)
    .sort((a, b) =>
      (b.totalShowups || 0) - (a.totalShowups || 0) ||
      String(a.leadAt?.toISOString?.() || '').localeCompare(String(b.leadAt?.toISOString?.() || ''))
    )
    .map(summarizeCohortPerson);

  const idealMemberRows = cohortRows
    .filter((r) => r.idealMember)
    .sort((a, b) =>
      (b.totalShowups || 0) - (a.totalShowups || 0) ||
      String(a.leadAt?.toISOString?.() || '').localeCompare(String(b.leadAt?.toISOString?.() || ''))
    )
    .map(summarizeCohortPerson);

  function nonIcpReasonForRow(row) {
    const reasons = [];
    if (!row.sober1yAtLead) reasons.push('Sobriety under 1 year at lead date');
    if (row.revenueOfficial == null) reasons.push('Official revenue missing');
    else if (row.revenueOfficial < 250000) reasons.push('Official revenue under $250k');
    return reasons.join('; ');
  }
  function idealCandidateSignals(row) {
    const showsRemaining = Math.max(0, 11 - (row.totalShowups || 0));
    const missedPrimary = row.missedPrimaryGroupSessionsSinceLastShowup || 0;
    const daysSinceLast = row.daysSinceLastShowup;
    const isNear = showsRemaining <= 2;
    const nudgeNow = missedPrimary >= 2 || (Number.isFinite(daysSinceLast) && daysSinceLast >= 21);
    let likelihood = 'Longer Path';
    if (showsRemaining <= 1) likelihood = 'High';
    else if (showsRemaining <= 2) likelihood = 'Medium';
    if ((row.recentShowups30d || 0) === 0 && showsRemaining >= 4) likelihood = 'Low';
    const notes = [];
    if (isNear) notes.push(`${showsRemaining} more show-up${showsRemaining === 1 ? '' : 's'} to reach ideal threshold`);
    if (nudgeNow) notes.push('Good nudge candidate (missed recent sessions)');
    return { showsRemaining, missedPrimary, daysSinceLast, nudgeNow, likelihood, note: notes.join(' · ') };
  }

  const highValueNudgeCandidateRows = cohortRows
    .filter((r) => r.greatMember && !r.idealMember && r.idealLeadProfile)
    .map((r) => {
      const sig = idealCandidateSignals(r);
      return {
        ...summarizeCohortPerson(r),
        shows_remaining_to_ideal: sig.showsRemaining,
        ideal_candidate_likelihood: sig.likelihood,
        nudge_recommended_now: sig.nudgeNow,
        nudge_reason: sig.note || null,
      };
    })
    .sort((a, b) =>
      (a.shows_remaining_to_ideal || 0) - (b.shows_remaining_to_ideal || 0) ||
      (Number(b.nudge_recommended_now) - Number(a.nudge_recommended_now)) ||
      (b.missed_primary_group_sessions_since_last_showup || 0) - (a.missed_primary_group_sessions_since_last_showup || 0) ||
      (b.total_showups || 0) - (a.total_showups || 0)
    );

  const strongNonIcpMemberRows = cohortRows
    .filter((r) => r.greatMember && !r.idealLeadProfile)
    .map((r) => {
      const sig = idealCandidateSignals(r);
      return {
        ...summarizeCohortPerson(r),
        icp_gap_reason: nonIcpReasonForRow(r),
        shows_remaining_to_ideal_threshold: Math.max(0, 11 - (r.totalShowups || 0)),
        nudge_recommended_now: sig.nudgeNow,
        nudge_reason: sig.note || null,
      };
    })
    .sort((a, b) =>
      (Number(b.nudge_recommended_now) - Number(a.nudge_recommended_now)) ||
      (b.missed_primary_group_sessions_since_last_showup || 0) - (a.missed_primary_group_sessions_since_last_showup || 0) ||
      (b.total_showups || 0) - (a.total_showups || 0)
    );

  function greatLeadOutreachPriority(row) {
    const noShow = !row.firstShowAt;
    const total = row.totalShowups || 0;
    const missedPrimary = row.missedPrimaryGroupSessionsSinceLastShowup || 0;
    const daysSinceLast = row.daysSinceLastShowup;
    if (noShow) {
      return {
        priority: 'High',
        priorityScore: 100,
        reason: 'Great lead has not shown up yet (manual invite may outperform automated funnel)',
        destination: 'Tuesday Free Group + Phoenix Forum',
      };
    }
    if (total <= 1 && (missedPrimary >= 1 || (Number.isFinite(daysSinceLast) && daysSinceLast >= 14))) {
      return {
        priority: 'High',
        priorityScore: 85,
        reason: 'Great lead attended once but has not built momentum yet',
        destination: 'Tuesday Free Group + Phoenix Forum',
      };
    }
    if (total < 6 && (missedPrimary >= 2 || (Number.isFinite(daysSinceLast) && daysSinceLast >= 21))) {
      return {
        priority: 'Medium',
        priorityScore: 65,
        reason: 'Great lead is qualified but attendance momentum is slipping',
        destination: 'Tuesday Free Group + Phoenix Forum',
      };
    }
    return {
      priority: 'Low',
      priorityScore: 35,
      reason: 'Great lead is engaged; use light-touch relationship follow-up only',
      destination: 'Phoenix Forum (light invite)',
    };
  }

  function buildGreatLeadOutreachEmail(row, routing) {
    const firstName = String(row.contactName || '').trim().split(/\s+/)[0] || 'there';
    const intro = row.firstShowAt
      ? 'Wanted to reach out because you are a strong fit for this community, and I noticed we have not seen you recently.'
      : 'Wanted to reach out because you look like a great fit for our founder community, and I did not want you to get buried in the automated funnel.';
    const inviteLine = String(routing.destination || '').includes('Phoenix')
      ? 'You are welcome to join the Tuesday free group, and if it feels like a fit, Phoenix Forum may also be a strong next step for you.'
      : 'I would love to invite you to check out the Tuesday free group.';
    return [
      `Hi ${firstName},`,
      '',
      intro,
      '',
      inviteLine,
      'If it was just a scheduling conflict, no problem at all. If it is not a fit, that is also helpful to know.',
      '',
      'Quick reply is perfect:',
      '- bad timing right now',
      '- interested, send me the next link',
      '- not a fit',
      '',
      'Tuesday Free Group link: [insert current link]',
      'Phoenix Forum link: [insert current link]',
    ].join('\n');
  }

  const greatLeadOutreachQueueRows = cohortRows
    .filter((r) => r.greatLead)
    .map((r) => {
      const routing = greatLeadOutreachPriority(r);
      return {
        ...summarizeCohortPerson(r),
        outreach_priority: routing.priority,
        outreach_priority_score: routing.priorityScore,
        outreach_reason: routing.reason,
        recommended_destination: routing.destination,
        outreach_recommended_now: routing.priority !== 'Low',
        suggested_subject: !r.firstShowAt ? 'Quick invite to our Tuesday founder group' : 'Missed you in the founder room',
        suggested_plain_text_email: buildGreatLeadOutreachEmail(r, routing),
        phoenix_forum_eligible_by_profile: true,
      };
    })
    .filter((r) => !r.great_member || r.outreach_recommended_now || (r.missed_primary_group_sessions_since_last_showup || 0) >= 2)
    .sort((a, b) =>
      (b.outreach_priority_score || 0) - (a.outreach_priority_score || 0) ||
      (Number(b.outreach_recommended_now) - Number(a.outreach_recommended_now)) ||
      (b.missed_primary_group_sessions_since_last_showup || 0) - (a.missed_primary_group_sessions_since_last_showup || 0) ||
      (b.total_showups || 0) - (a.total_showups || 0)
    );

  const exactMembership250kZeroRows = allContactsMembershipExact250k
    .filter((c) => {
      const rev = officialRevenue(c);
      return rev == null || rev === 0;
    })
    .sort((a, b) => contactTs(a) - contactTs(b))
    .map(summarizeContactForQa);

  const containsMembership250kZeroRows = allContactsMembership250kZeroRevenue
    .sort((a, b) => contactTs(a) - contactTs(b))
    .map(summarizeContactForQa);

  // Campaign person-level drilldowns (limited to top visible rows to keep snapshot JSON manageable).
  const campaignDrilldownRowsLimit = 200;
  const campaignDrilldownsByKey = {};
  for (const campaignRow of campaignRowsSorted.slice(0, 40)) {
    const agg = campaignAggByKey.get(campaignRow.campaign_key);
    const sourceRows = Array.isArray(agg?.rows) ? agg.rows : [];
    const summarized = sourceRows
      .map((r) => ({
        ...summarizeCohortPerson(r),
        campaign_bucket_label: campaignRow.campaign_label,
        campaign_attribution_quality: campaignRow.attribution_quality,
        exact_campaign_week_match: !!(r.leadWeek && adsCampaignSpendByWeekNorm.has(`${r.leadWeek}__${campaignRow.campaign_key}`)),
        luma_signup: !!r.lumaAt,
        first_showup: !!r.firstShowAt,
        first_showup_at: r.firstShowAt ? r.firstShowAt.toISOString() : null,
        great_lead_outreach_candidate: !!r.greatLead && (!r.greatMember || (r.missedPrimaryGroupSessionsSinceLastShowup || 0) >= 2),
      }))
      .sort((a, b) =>
        Number(b.exact_campaign_week_match) - Number(a.exact_campaign_week_match) ||
        Number(b.ideal_member) - Number(a.ideal_member) ||
        Number(b.great_member) - Number(a.great_member) ||
        Number(b.great_lead) - Number(a.great_lead) ||
        (b.total_showups || 0) - (a.total_showups || 0) ||
        String(a.display_name || '').localeCompare(String(b.display_name || ''))
      );

    campaignDrilldownsByKey[campaignRow.campaign_key] = {
      campaign_key: campaignRow.campaign_key,
      campaign_label: campaignRow.campaign_label,
      attribution_quality: campaignRow.attribution_quality,
      row_limit: campaignDrilldownRowsLimit,
      stage_counts: {
        all_leads: campaignRow.leads || 0,
        luma_signups: campaignRow.luma_signups || 0,
        first_showups: campaignRow.first_showups || 0,
        qualified_leads: campaignRow.qualified_leads || 0,
        great_leads: campaignRow.great_leads || 0,
        great_members: campaignRow.great_members || 0,
        ideal_members: campaignRow.ideal_members || 0,
      },
      rows: {
        all_leads: summarized.slice(0, campaignDrilldownRowsLimit),
        luma_signups: summarized.filter((r) => r.luma_signup).slice(0, campaignDrilldownRowsLimit),
        first_showups: summarized.filter((r) => r.first_showup).slice(0, campaignDrilldownRowsLimit),
        qualified_leads: summarized.filter((r) => r.qualified_lead).slice(0, campaignDrilldownRowsLimit),
        great_leads: summarized.filter((r) => r.great_lead).slice(0, campaignDrilldownRowsLimit),
        great_members: summarized.filter((r) => r.great_member).slice(0, campaignDrilldownRowsLimit),
        ideal_members: summarized.filter((r) => r.ideal_member).slice(0, campaignDrilldownRowsLimit),
      },
    };
  }
  campaignDiagnostics.drilldowns_by_campaign = campaignDrilldownsByKey;

  const weeklyCheckin = {
    cadence: 'weekly',
    recommended_day: 'Monday',
    checks: [
      {
        key: 'membership_250k_exact_zero_revenue',
        label: 'Exact membership tag "Main Free $250k+ Group" with cached official revenue 0/null',
        status: exactMembership250kZeroRows.length === 0 ? 'pass' : 'warn',
        value: exactMembership250kZeroRows.length,
        drilldown_key: 'membership_250k_exact_zero_revenue',
      },
      {
        key: 'membership_250k_contains_zero_revenue',
        label: 'Any membership string containing "Main Free $250k+ Group" with cached official revenue 0/null',
        status: containsMembership250kZeroRows.length === 0 ? 'pass' : 'warn',
        value: containsMembership250kZeroRows.length,
        drilldown_key: 'membership_250k_contains_zero_revenue',
      },
      {
        key: 'official_revenue_coverage',
        label: 'Cohort analyzed contacts with cached official revenue',
        status: (cohortRows.length ? (cohortRows.filter(r => r.revenueOfficial != null).length / cohortRows.length) : 0) >= 0.98 ? 'pass' : 'warn',
        value: cohortRows.length ? cohortRows.filter(r => r.revenueOfficial != null).length / cohortRows.length : null,
        format: 'percent',
      },
      {
        key: 'sobriety_coverage',
        label: 'Cohort analyzed contacts with sobriety date present',
        status: (cohortRows.length ? (cohortRows.filter(r => r.hasSobrietyDate).length / cohortRows.length) : 0) >= 0.95 ? 'pass' : 'warn',
        value: cohortRows.length ? cohortRows.filter(r => r.hasSobrietyDate).length / cohortRows.length : null,
        format: 'percent',
      },
      {
        key: 'great_member_observed',
        label: 'Observed great members (6+ show-ups) in current cohort range',
        status: lagStats.great_member?.achievers >= 10 ? 'pass' : 'warn',
        value: lagStats.great_member?.achievers ?? 0,
        drilldown_key: 'great_members',
      },
      {
        key: 'ideal_member_observed',
        label: 'Observed ideal members (11+ show-ups + ICP) in current cohort range',
        status: lagStats.ideal_member?.achievers >= 5 ? 'pass' : 'warn',
        value: lagStats.ideal_member?.achievers ?? 0,
        drilldown_key: 'ideal_members',
      },
      {
        key: 'high_value_nudge_candidates',
        label: 'High-value nudge candidates (ICP profile, strong member, not yet ideal)',
        status: highValueNudgeCandidateRows.length > 0 ? 'warn' : 'pass',
        value: highValueNudgeCandidateRows.length,
        drilldown_key: 'high_value_nudge_candidates',
      },
      {
        key: 'strong_non_icp_members',
        label: 'Strong non-ICP members (great attendance but currently fail ICP)',
        status: strongNonIcpMemberRows.length > 0 ? 'info' : 'pass',
        value: strongNonIcpMemberRows.length,
        drilldown_key: 'strong_non_icp_members',
      },
      {
        key: 'great_lead_outreach_queue',
        label: 'Great leads with manual outreach opportunity',
        status: greatLeadOutreachQueueRows.some((r) => r.outreach_priority === 'High') ? 'warn' : (greatLeadOutreachQueueRows.length > 0 ? 'info' : 'pass'),
        value: greatLeadOutreachQueueRows.length,
        drilldown_key: 'great_lead_outreach_queue',
      },
    ],
  };

  const numberAuditChecks = [];
  function addAuditCheck({ key, label, status, actual = null, expected = null, tolerance = null, notes = [] }) {
    numberAuditChecks.push({ key, label, status, actual, expected, tolerance, notes });
  }
  function approxEq(a, b, tol = 1e-9) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= tol;
  }

  const leadMetric = metricResultByKey.get('lead');
  addAuditCheck({
    key: 'cohort_lead_count_matches_rows',
    label: 'Cohort lead count matches analyzed cohort row count',
    status: (leadMetric?.finalized?.conversions || 0) === cohortRows.length ? 'pass' : 'fail',
    actual: leadMetric?.finalized?.conversions || 0,
    expected: cohortRows.length,
  });
  addAuditCheck({
    key: 'sum_cohort_leads_matches_rows',
    label: 'Sum of cohort-week leads equals analyzed cohort row count',
    status: cohortList.reduce((s, c) => s + (c.leads || 0), 0) === cohortRows.length ? 'pass' : 'fail',
    actual: cohortList.reduce((s, c) => s + (c.leads || 0), 0),
    expected: cohortRows.length,
  });

  const freeEventsCardToDrilldown = {
    meta_leads: 'free_events_meta_leads',
    meta_qualified_leads: 'free_events_meta_qualified_leads',
    meta_great_leads: 'free_events_meta_great_leads',
    luma_signups_paid: 'free_events_luma_signups',
    net_new_showups: 'free_events_net_new_showups',
  };
  for (const card of (freeEventsSummary?.cards || [])) {
    const drilldownKey = freeEventsCardToDrilldown[card?.key];
    if (!drilldownKey) continue;
    const rowCount = (freeEventsDrilldownRows?.[drilldownKey] || []).length;
    const expectedCount = Number(card?.current_count);
    const ok = Number.isFinite(expectedCount) ? rowCount === expectedCount : rowCount === 0;
    addAuditCheck({
      key: `free_events_${card.key}_count_matches_drilldown_rows`,
      label: `Free Events "${card.label}" current count matches drilldown row count`,
      status: ok ? 'pass' : 'fail',
      actual: rowCount,
      expected: Number.isFinite(expectedCount) ? expectedCount : null,
      notes: [
        `Drilldown key: ${drilldownKey}`,
        'Protects against card math and row-scope drifting apart for the same cohort window.',
      ],
    });
  }

  for (const m of results) {
    const f = m?.finalized || {};
    const recomputedFinalizedCpa = (f.conversions > 0 && Number.isFinite(f.spend)) ? (f.spend / f.conversions) : null;
    const finalizedOk = (recomputedFinalizedCpa == null && f.cpa == null) || approxEq(recomputedFinalizedCpa, f.cpa, 1e-7);
    addAuditCheck({
      key: `metric_${m.key}_finalized_formula`,
      label: `${m.label} finalized CPA formula check`,
      status: finalizedOk ? 'pass' : 'fail',
      actual: f.cpa,
      expected: recomputedFinalizedCpa,
      tolerance: 1e-7,
    });
    if (m?.projected) {
      const p = m.projected;
      const recomputedProjected = (p.projected_conversions > 0 && Number.isFinite(p.spend)) ? (p.spend / p.projected_conversions) : null;
      const projectedOk = (recomputedProjected == null && p.projected_cpa == null) || approxEq(recomputedProjected, p.projected_cpa, 1e-7);
      addAuditCheck({
        key: `metric_${m.key}_projected_formula`,
        label: `${m.label} projected CPA formula check`,
        status: projectedOk ? 'pass' : 'fail',
        actual: p.projected_cpa,
        expected: recomputedProjected,
        tolerance: 1e-7,
      });
    }
  }

  const diagCardAuditTargets = new Map((metaSpecialistDiagnostics?.cards || []).map((c) => [c.key, c]));
  for (const key of ['cpl_trailing_4w', 'cpl_trailing_12w', 'cpql_current_entry_forecast', 'cpgl_current_entry_forecast', 'first_showup_current_entry_forecast']) {
    const c = diagCardAuditTargets.get(key);
    if (!c?.drilldown?.numerator || !c?.drilldown?.denominator) continue;
    const n = safeNum(c.drilldown.numerator.value);
    const d = safeNum(c.drilldown.denominator.value);
    const expected = (Number.isFinite(n) && Number.isFinite(d) && d > 0) ? (n / d) : null;
    const ok = (expected == null && c.value == null) || approxEq(expected, safeNum(c.value), 1e-7);
    addAuditCheck({
      key: `diag_${key}_formula`,
      label: `${c.label} drilldown math check`,
      status: ok ? 'pass' : 'fail',
      actual: c.value,
      expected,
      tolerance: 1e-7,
    });
  }

  const idealAchievers = lagStats?.ideal_member?.achievers || 0;
  const greatAchievers = lagStats?.great_member?.achievers || 0;
  addAuditCheck({
    key: 'ideal_leq_great_achievers',
    label: 'Observed ideal-member achievers do not exceed great-member achievers',
    status: idealAchievers <= greatAchievers ? 'pass' : 'fail',
    actual: idealAchievers,
    expected: `<= ${greatAchievers}`,
  });
  addAuditCheck({
    key: 'official_revenue_coverage_threshold',
    label: 'Official revenue coverage in cohort analyzed contacts',
    status: (dataQuality?.completeness_meta_free_analyzed?.official_revenue_rate || 0) >= 0.98 ? 'pass' : 'warn',
    actual: dataQuality?.completeness_meta_free_analyzed?.official_revenue_rate || null,
    expected: '>= 98%',
    notes: ['Lower coverage can bias qualified/great/ideal classifications.'],
  });
  addAuditCheck({
    key: 'campaign_exact_match_coverage_threshold',
    label: 'Campaign exact-match attribution coverage is sufficient for campaign-level CPA decisions',
    status: (campaignDiagnostics?.attribution_coverage?.exact_campaign_week_match_rate_all_leads || 0) >= 0.25 ? 'pass' : 'warn',
    actual: campaignDiagnostics?.attribution_coverage?.exact_campaign_week_match_rate_all_leads || null,
    expected: '>= 25%',
    notes: ['Below threshold means campaign tables are still directional for a subset only.'],
  });
  addAuditCheck({
    key: 'ideal_member_sample_size',
    label: 'Ideal-member sample size is decision-grade',
    status: idealAchievers >= 5 ? 'pass' : 'warn',
    actual: idealAchievers,
    expected: '>= 5 observed ideal members',
    notes: ['Below threshold: use ideal-member metrics as directional/planning only.'],
  });

  const auditCounts = numberAuditChecks.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, { pass: 0, warn: 0, fail: 0 });
  const criticalFailures = numberAuditChecks.filter((c) => c.status === 'fail');
  const warnings = numberAuditChecks.filter((c) => c.status === 'warn');
  const weeklySignoff = (() => {
    let status = 'signed_off';
    if (criticalFailures.length > 0) status = 'blocked';
    else if (warnings.length > 0 || metaAiStatus === 'warning' || metaAiStatus === 'action_required') status = 'provisional';
    const summary = status === 'blocked'
      ? 'Blocked: at least one formula/consistency check failed. Do not use these metrics for spend decisions until fixed.'
      : status === 'provisional'
        ? 'Provisional signoff: core math checks passed, but warnings remain (sample size / coverage / trend pressure). Use for decisions with explicit caveats.'
        : 'Signed off: math checks and coverage thresholds are healthy for this snapshot.';
    const decisionUse = {
      safe_for_decisions: status !== 'blocked',
      finalized_metrics: criticalFailures.length === 0,
      campaign_cpa_subset_only: (campaignDiagnostics?.attribution_coverage?.exact_campaign_week_match_rate_all_leads || 0) < 0.8,
      ideal_member_directional_only: idealAchievers < 5,
    };
    return {
      status,
      summary,
      counts: auditCounts,
      top_warnings: warnings.slice(0, 5).map((w) => w.label),
      blocked_reasons: criticalFailures.map((f) => f.label),
      decision_use: decisionUse,
      recommended_review_day: weeklyCheckin?.recommended_day || 'Monday',
    };
  })();

  const numberAudit = {
    generated_at: new Date().toISOString(),
    counts: auditCounts,
    checks: numberAuditChecks,
  };

  const out = {
    generated_at: new Date().toISOString(),
    methodology: {
      cohort_unit: 'weekly (Monday UTC) based on HubSpot contact createdate for Meta-paid, non-Phoenix contacts',
      spend_source: manualBackfill
        ? 'Cohort CPA uses raw_fb_ads_insights_daily filtered funnel_key=free + additive manual weekly free-funnel spend backfill (week-end labels allocated across intervals; blanks ignored as unknown). Phoenix spend is intentionally excluded from cohort CPA and reported separately in meta_spend_scope.'
        : 'Cohort CPA uses raw_fb_ads_insights_daily filtered funnel_key=free. Phoenix spend is intentionally excluded from cohort CPA and reported separately in meta_spend_scope.',
      spend_segmentation: 'meta_spend_scope reports all Meta spend by funnel bucket (free, phoenix, other) and by ad account so account coverage can be audited independently of free-funnel cohort CPA.',
      showup_source: 'HubSpot call activities + contact associations (Tuesday/Thursday group sessions only)',
      luma_source: 'raw_luma_registrations approved rows (matched_hubspot_contact_id with email fallback)',
      preexisting_exclusion: 'Exclude contacts with first group show-up or Luma signup more than 14 days before lead createdate',
      quality_definition: 'official revenue field + sobriety >1y at lead date (current cached contact snapshot; no property history yet)',
      great_member_definition: '6+ group show-ups',
      ideal_member_definition: '11+ group show-ups + revenue >=250k official + >1y sober at lead date',
      quality_buffer_days: qualityBufferDays,
      manual_backfill_used: !!manualBackfill,
    },
    data_quality: dataQuality,
    meta_spend_scope: metaSpendScope,
    lag_stats: lagStats,
    lag_hypotheses: lagHypotheses,
    metrics: results,
    meta_specialist_diagnostics: metaSpecialistDiagnostics,
    free_events_summary: freeEventsSummary,
    number_audit: numberAudit,
    weekly_signoff: weeklySignoff,
    weekly_checkin: weeklyCheckin,
    drilldowns: {
      ...freeEventsDrilldownRows,
      great_members: greatMemberRows,
      ideal_members: idealMemberRows,
      high_value_nudge_candidates: highValueNudgeCandidateRows,
      strong_non_icp_members: strongNonIcpMemberRows,
      great_lead_outreach_queue: greatLeadOutreachQueueRows,
      membership_250k_exact_zero_revenue: exactMembership250kZeroRows,
      membership_250k_contains_zero_revenue: containsMembership250kZeroRows,
    },
    naive_90d_period_cpa: {
      window_start: dateKey(naiveStart),
      window_end: dateKey(naiveEnd),
      spend: naiveSpend90,
      counts: naiveCounts90,
      cpa: naiveCpa90,
    },
  };

  fs.writeFileSync(path.join(__dirname, 'meta_cohort_unit_econ_analysis_output.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    saved: path.join(__dirname, 'meta_cohort_unit_econ_analysis_output.json'),
    summary: {
      analyzed_contacts: cohortRows.length,
      range: { start_week: rangeStartKey, end_week: rangeEndKey },
      lagStats,
      metrics: results.map(r => ({ key: r.key, finalized_cpa: r.finalized.cpa, projected_cpa: r.projected?.projected_cpa ?? null })),
    }
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
