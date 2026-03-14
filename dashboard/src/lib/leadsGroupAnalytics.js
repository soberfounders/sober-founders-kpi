/**
 * leadsGroupAnalytics.js
 *
 * Pure JS (no React). Consumes already-fetched Supabase rows and a selected
 * date range, then returns a fully-structured snapshot for rendering.
 *
 * Groups:
 *   Group 1 – Free Leads (funnel_key !== 'phoenix')
 *     Sub-row A: Free Tuesday  (Zoom meeting 87199667045)
 *     Sub-row B: Free Thursday (Zoom meeting 84242212480)
 *   Group 2 – Phoenix Forum Leads (funnel_key === 'phoenix')
 */

import {
    isQualifiedLead,
    isPhoenixQualifiedLead,
    leadQualityTierFromOfficialRevenue,
    parseOfficialRevenue,
} from './leadsQualificationRules.js';


// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toUtcDate(dateKey) {
    return new Date(`${dateKey}T00:00:00.000Z`);
}

function isoDate(d) {
    return d.toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
    const d = toUtcDate(dateKey);
    d.setUTCDate(d.getUTCDate() + days);
    return isoDate(d);
}

/** Monday of the ISO week containing a given date */
function mondayOf(dateKey) {
    const d = toUtcDate(dateKey);
    // getUTCDay(): 0=Sun, 1=Mon ... 6=Sat
    const day = d.getUTCDay();
    const offsetToMon = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + offsetToMon);
    return isoDate(d);
}

function firstDayOfMonth(dateKey) {
    const d = toUtcDate(dateKey);
    d.setUTCDate(1);
    return isoDate(d);
}

function firstDayOfQuarter(dateKey) {
    const d = toUtcDate(dateKey);
    const month = d.getUTCMonth(); // 0–11
    const quarterStart = month - (month % 3);
    d.setUTCMonth(quarterStart, 1);
    return isoDate(d);
}

function firstDayOfYear(dateKey) {
    const d = toUtcDate(dateKey);
    d.setUTCMonth(0, 1);
    return isoDate(d);
}

function dateInRange(dateKey, startKey, endKey) {
    return !!dateKey && dateKey >= startKey && dateKey <= endKey;
}

function parseDateKey(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return isoDate(d);
}

const HUBSPOT_REPORTING_TIMEZONE = 'America/New_York';

function dateKeyInTimeZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
}

function parseDateKeyInTimeZone(value, timeZone) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return dateKeyInTimeZone(d, timeZone);
}

function parseHubspotCreatedDateKey(value) {
    return parseDateKeyInTimeZone(value, HUBSPOT_REPORTING_TIMEZONE);
}

// ---------------------------------------------------------------------------
// Date range windows builder
// ---------------------------------------------------------------------------

/**
 * @param {string} rangeType  one of:
 *   'this_week'|'this_month'|'this_quarter'|'this_year'|
 *   'last_week'|'last_2_weeks'|'last_month'|'last_quarter'|'last_year'|'custom'
 * @param {string|null} customStart  YYYY-MM-DD (only for rangeType='custom')
 * @param {string|null} customEnd    YYYY-MM-DD (only for rangeType='custom')
 * @param {string} todayKey  YYYY-MM-DD (today's date)
 * @returns {{ current: {start, end, label}, previous: {start, end, label} | null }}
 */
export function buildDateRangeWindows(rangeType, customStart, customEnd, todayKey) {
    const today = todayKey || isoDate(new Date());
    const buildMatchingPreviousWindow = (currentStart, currentEnd, label) => {
        const currentStartDate = toUtcDate(currentStart);
        const currentEndDate = toUtcDate(currentEnd);
        const spanDays = Math.max(1, Math.round((currentEndDate.getTime() - currentStartDate.getTime()) / 86400000) + 1);
        const previousEnd = addDays(currentStart, -1);
        const previousStart = addDays(previousEnd, -(spanDays - 1));
        return {
            current: { start: currentStart, end: currentEnd, label },
            previous: { start: previousStart, end: previousEnd, label: `Previous matching ${spanDays}-day period` },
        };
    };

    if (rangeType === 'custom') {
        const start = customStart || addDays(today, -6);
        const end = customEnd || today;
        return {
            current: { start, end, label: `${start} → ${end}` },
            previous: null, // no comparison for custom ranges
        };
    }

    if (rangeType === 'this_week') {
        const currentStart = mondayOf(today);
        return buildMatchingPreviousWindow(currentStart, today, `This Week (${currentStart} to date)`);
    }

    if (rangeType === 'this_month') {
        const currentStart = firstDayOfMonth(today);
        return buildMatchingPreviousWindow(currentStart, today, `This Month (${currentStart.slice(0, 7)} to date)`);
    }

    if (rangeType === 'this_quarter') {
        const currentStart = firstDayOfQuarter(today);
        return buildMatchingPreviousWindow(currentStart, today, `This Quarter (${currentStart} to date)`);
    }

    if (rangeType === 'this_year') {
        const currentStart = firstDayOfYear(today);
        return buildMatchingPreviousWindow(currentStart, today, `This Year (${currentStart.slice(0, 4)} to date)`);
    }

    if (rangeType === 'last_week') {
        // Previous full Mon–Sun week
        const lastSun = addDays(mondayOf(today), -1);
        const lastMon = mondayOf(lastSun);
        const prevSun = addDays(lastMon, -1);
        const prevMon = mondayOf(prevSun);
        return {
            current: { start: lastMon, end: lastSun, label: `Week of ${lastMon}` },
            previous: { start: prevMon, end: prevSun, label: `Week of ${prevMon}` },
        };
    }

    if (rangeType === 'last_2_weeks') {
        const lastSun = addDays(mondayOf(today), -1);
        const twoMonAgo = addDays(lastSun, -13);
        const priorEnd = addDays(twoMonAgo, -1);
        const priorStart = addDays(priorEnd, -13);
        return {
            current: { start: twoMonAgo, end: lastSun, label: '2-week block (current)' },
            previous: { start: priorStart, end: priorEnd, label: '2-week block (prior)' },
        };
    }

    if (rangeType === 'last_month') {
        // Previous full calendar month
        const thisMonthFirst = firstDayOfMonth(today);
        const lastMonthEnd = addDays(thisMonthFirst, -1);
        const lastMonthStart = firstDayOfMonth(lastMonthEnd);
        const priorEnd = addDays(lastMonthStart, -1);
        const priorStart = firstDayOfMonth(priorEnd);
        return {
            current: { start: lastMonthStart, end: lastMonthEnd, label: `Month of ${lastMonthStart.slice(0, 7)}` },
            previous: { start: priorStart, end: priorEnd, label: `Month of ${priorStart.slice(0, 7)}` },
        };
    }

    if (rangeType === 'last_quarter') {
        const thisQStart = firstDayOfQuarter(today);
        const lastQEnd = addDays(thisQStart, -1);
        const lastQStart = firstDayOfQuarter(lastQEnd);
        const prevQEnd = addDays(lastQStart, -1);
        const prevQStart = firstDayOfQuarter(prevQEnd);
        return {
            current: { start: lastQStart, end: lastQEnd, label: `Quarter of ${lastQStart}` },
            previous: { start: prevQStart, end: prevQEnd, label: `Quarter of ${prevQStart}` },
        };
    }

    if (rangeType === 'last_year') {
        const thisYearStart = firstDayOfYear(today);
        const lastYearEnd = addDays(thisYearStart, -1);
        const lastYearStart = firstDayOfYear(lastYearEnd);
        const prevYearEnd = addDays(lastYearStart, -1);
        const prevYearStart = firstDayOfYear(prevYearEnd);
        return {
            current: { start: lastYearStart, end: lastYearEnd, label: `Year ${lastYearStart.slice(0, 4)}` },
            previous: { start: prevYearStart, end: prevYearEnd, label: `Year ${prevYearStart.slice(0, 4)}` },
        };
    }

    // Fallback — last 7 days
    return {
        current: { start: addDays(today, -6), end: today, label: 'Last 7 days' },
        previous: { start: addDays(today, -13), end: addDays(today, -7), label: 'Prior 7 days' },
    };
}

// ---------------------------------------------------------------------------
// Lead tier classifier — 4-tier spec per task requirements
// ---------------------------------------------------------------------------

/**
 * @param {number|string|null} revenueValue
 * @returns {'bad'|'ok'|'qualified'|'great'|'unknown'}
 */
export function leadTierFromRevenue(revenueValue) {
    const canonical = leadQualityTierFromOfficialRevenue(revenueValue);
    if (canonical === 'good') return 'qualified';
    return canonical;
}

// ---------------------------------------------------------------------------
// Safe computation helpers
// ---------------------------------------------------------------------------

function safeDivide(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    return numerator / denominator;
}

/**
 * Returns { pct: number|null, direction: 'up'|'down'|'neutral' }
 * Uses the conventional (current - previous) / previous formula.
 */
export function computeChangePct(current, previous) {
    const pct = safeDivide(current - previous, previous);
    if (pct === null) return { pct: null, direction: 'neutral' };
    return { pct, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' };
}

// ---------------------------------------------------------------------------
// HubSpot helpers: build email → contact index
// ---------------------------------------------------------------------------

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function parseEmailList(value) {
    return String(value || '')
        .split(',')
        .map((item) => normalizeEmail(item))
        .filter(Boolean);
}

function contactCreatedTs(row) {
    const raw = row?.createdate;
    const ts = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(ts) ? ts : 0;
}

function pickNewerContact(current, candidate) {
    if (!current) return candidate;
    if (!candidate) return current;
    return contactCreatedTs(candidate) > contactCreatedTs(current) ? candidate : current;
}

function contactDataScore(row) {
    const official = resolveHubspotOfficialRevenue(row);
    const fallback = row?.annual_revenue_in_dollars;
    const sobriety = extractHubspotSobrietyRaw(row);
    let score = 0;
    if (official !== null && official !== undefined) score += 4;
    else if (fallback !== null && fallback !== undefined && fallback !== '') score += 2;
    if (sobriety !== null && sobriety !== undefined && sobriety !== '') score += 1;
    return score;
}

function pickMostRelevantContact(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestTs = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < rows.length; i += 1) {
        const candidate = rows[i];
        const score = contactDataScore(candidate);
        const candidateTs = contactCreatedTs(candidate);
        if (score > bestScore || (score === bestScore && candidateTs > bestTs)) {
            best = candidate;
            bestScore = score;
            bestTs = candidateTs;
        }
    }
    return best || rows[0];
}

function fullNameFromContact(contact) {
    return `${String(contact?.firstname || '').trim()} ${String(contact?.lastname || '').trim()}`.trim();
}

function resolveHubspotOfficialRevenue(contact) {
    return parseOfficialRevenue(contact);
}

function resolveHubspotRevenue(contact) {
    return resolveHubspotOfficialRevenue(contact);
}

const HUBSPOT_SOBRIETY_FIELDS = [
    'sobriety_date',
    'sobriety_date__official_',
    'sober_date',
    'clean_date',
    'sobrietydate',
];

function extractHubspotSobrietyRaw(contact) {
    for (const key of HUBSPOT_SOBRIETY_FIELDS) {
        const value = contact?.[key];
        if (value !== null && value !== undefined && value !== '') return value;
    }
    return null;
}

function formatDateMMDDYYYY(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const text = String(raw).trim();
    if (!text) return null;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;

    const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return `${ymd[2]}/${ymd[3]}/${ymd[1]}`;

    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return null;
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear());
    return `${mm}/${dd}/${yyyy}`;
}

function resolveHubspotSobrietyDate(contact) {
    return formatDateMMDDYYYY(extractHubspotSobrietyRaw(contact));
}

function isPaidSocialHubspotContact(row) {
    const sourceBlob = [
        row?.hs_analytics_source,
        row?.hs_latest_source,
        row?.original_traffic_source,
    ].join(' ').toUpperCase();
    return sourceBlob.includes('PAID_SOCIAL');
}

function isPhoenixHubspotContact(row) {
    const blob = [
        row?.hs_analytics_source_data_2,
        row?.hs_latest_source_data_2,
        row?.campaign,
        row?.campaign_source,
        row?.membership_s,
    ].join(' ').toLowerCase();
    return blob.includes('phoenix');
}

function isActiveHubspotContact(row) {
    const isDeleted = row?.is_deleted === true || row?.hubspot_archived === true;
    const mergedIntoRaw = row?.merged_into_hubspot_contact_id;
    const mergedInto = Number(mergedIntoRaw);
    const hasMergedInto = mergedIntoRaw !== null
        && mergedIntoRaw !== undefined
        && mergedIntoRaw !== ''
        && Number.isFinite(mergedInto)
        && mergedInto > 0;
    return !isDeleted && !hasMergedInto;
}

/**
 * Build an email-keyed map from HubSpot rows.
 * Checks both the primary `email` field AND `hs_additional_emails`
 * (a comma-separated list used for merged contacts).
 */
function buildHubspotEmailIndex(hubspotRows) {
    const byEmail = new Map();

    for (const row of hubspotRows || []) {
        if (!isActiveHubspotContact(row)) continue;
        const primary = normalizeEmail(row?.email);
        if (primary) {
            if (!byEmail.has(primary)) byEmail.set(primary, []);
            byEmail.get(primary).push(row);
        }

        // hs_additional_emails: comma-separated (may not exist in all schemas)
        for (const e of parseEmailList(row?.hs_additional_emails)) {
            if (e && e !== primary) {
                if (!byEmail.has(e)) byEmail.set(e, []);
                byEmail.get(e).push(row);
            }
        }
    }

    return byEmail;
}

// ---------------------------------------------------------------------------
// Zoom show-up helpers
// ---------------------------------------------------------------------------
// Luma registration helpers
// ---------------------------------------------------------------------------

function normalizeCampaignKey(value) {
    return String(value || '').trim().toLowerCase();
}

function upsertAdsetStat(map, adsetName, leadsValue, spendValue) {
    const name = String(adsetName || '').trim();
    if (!name) return;
    if (!map.has(name)) map.set(name, { leads: 0, spend: 0 });
    const row = map.get(name);
    row.leads += Number(leadsValue || 0);
    row.spend += Number(spendValue || 0);
}

function buildAdsAdsetIndex(adsRows) {
    const byCampaignDate = new Map();
    const byCampaign = new Map();

    for (const row of adsRows || []) {
        const campaignKey = normalizeCampaignKey(row?.campaign_name);
        if (!campaignKey) continue;
        const dateKey = parseDateKey(row?.date_day);
        if (!dateKey) continue;

        const dayKey = `${campaignKey}|${dateKey}`;
        if (!byCampaignDate.has(dayKey)) byCampaignDate.set(dayKey, new Map());
        if (!byCampaign.has(campaignKey)) byCampaign.set(campaignKey, new Map());

        upsertAdsetStat(byCampaignDate.get(dayKey), row?.adset_name, row?.leads, row?.spend);
        upsertAdsetStat(byCampaign.get(campaignKey), row?.adset_name, row?.leads, row?.spend);
    }

    return { byCampaignDate, byCampaign };
}

function pickBestAdset(statsMap) {
    if (!(statsMap instanceof Map) || statsMap.size === 0) return null;

    let bestName = null;
    let bestLeads = Number.NEGATIVE_INFINITY;
    let bestSpend = Number.NEGATIVE_INFINITY;

    for (const [name, stats] of statsMap.entries()) {
        const leads = Number(stats?.leads || 0);
        const spend = Number(stats?.spend || 0);
        if (
            leads > bestLeads ||
            (leads === bestLeads && spend > bestSpend) ||
            (leads === bestLeads && spend === bestSpend && String(name).localeCompare(String(bestName || '')) < 0)
        ) {
            bestName = name;
            bestLeads = leads;
            bestSpend = spend;
        }
    }

    return bestName;
}

function inferAdGroupFromCampaign(campaignName, preferredDateKey, adsAdsetIndex) {
    const campaignKey = normalizeCampaignKey(campaignName);
    if (!campaignKey || !adsAdsetIndex) return null;

    if (preferredDateKey) {
        const exact = pickBestAdset(adsAdsetIndex.byCampaignDate.get(`${campaignKey}|${preferredDateKey}`));
        if (exact) return exact;

        // Use nearby days to tolerate timezone offsets and processing delays.
        for (let offset = 1; offset <= 3; offset += 1) {
            const earlier = addDays(preferredDateKey, -offset);
            const later = addDays(preferredDateKey, offset);
            const earlyCandidate = pickBestAdset(adsAdsetIndex.byCampaignDate.get(`${campaignKey}|${earlier}`));
            if (earlyCandidate) return earlyCandidate;
            const laterCandidate = pickBestAdset(adsAdsetIndex.byCampaignDate.get(`${campaignKey}|${later}`));
            if (laterCandidate) return laterCandidate;
        }
    }

    return pickBestAdset(adsAdsetIndex.byCampaign.get(campaignKey));
}

function normalizeAnswerLabel(answerRow) {
    return [
        answerRow?.label,
        answerRow?.question,
        answerRow?.prompt,
        answerRow?.title,
        answerRow?.key,
        answerRow?.field_label,
    ]
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' | ');
}

function answerValueToText(raw) {
    if (raw === null || raw === undefined || raw === '') return '';
    if (Array.isArray(raw)) {
        const parts = raw.map((item) => answerValueToText(item)).filter(Boolean);
        return parts.join(', ');
    }
    if (typeof raw === 'object') {
        const preferred = raw.answer ?? raw.value ?? raw.label ?? raw.text ?? raw.name ?? null;
        if (preferred !== null && preferred !== undefined) return answerValueToText(preferred);
        try {
            return JSON.stringify(raw);
        } catch {
            return '';
        }
    }
    return String(raw).trim();
}

function extractHearAboutAnswer(answers) {
    if (!Array.isArray(answers) || answers.length === 0) return null;
    const match = answers.find((row) => {
        const label = normalizeAnswerLabel(row);
        if (!label) return false;
        if (label.includes('how did you hear') && label.includes('sober founders')) return true;
        return label.includes('how did you hear about');
    });
    if (!match) return null;
    const value = answerValueToText(
        match?.answer ??
        match?.value ??
        match?.response ??
        match?.selected_option ??
        match?.selected_options ??
        match?.text
    );
    return value || null;
}

function normalizeHearAboutText(value) {
    return ` ${String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function classifyHearAbout(value) {
    const text = String(value || '').trim();
    if (!text) return 'Unknown';
    const normalized = normalizeHearAboutText(text);

    const hasAny = (patterns) => patterns.some((pattern) => normalized.includes(` ${pattern} `));

    if (hasAny([
        'chatgpt',
        'openai',
        'gpt',
        'ai',
        'claude',
        'gemini',
        'perplexity',
    ])) {
        return 'ChatGPT / AI';
    }

    if (hasAny([
        'google',
        'googled',
        'search',
        'youtube',
        'google ads',
        'google ad',
        'seo',
    ])) {
        return 'Google';
    }

    if (hasAny([
        'refer',
        'referral',
        'referred',
        'friend',
        'word of mouth',
        'recommendation',
        'recommended',
        'someone sent me',
        'community',
    ])) {
        return 'Referral';
    }

    if (hasAny([
        'instagram',
        'insta',
        'ig',
        'facebook',
        'fb',
        'meta',
        'facebook ad',
        'facebook ads',
        'fb ad',
        'fb ads',
        'meta ad',
        'meta ads',
        'ads manager',
        'paid social',
    ])) {
        return 'Meta (Facebook/Instagram)';
    }

    // Heuristic: many valid answers are just a person's name ("Andrew", "Brooke R").
    // Treat short person-name style answers as referrals unless a channel keyword matched above.
    const compact = text.replace(/\s+/g, ' ').trim();
    const personLikeTokens = compact
        .replace(/[^a-zA-Z\s.-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    const lowerCompact = compact.toLowerCase();
    const looksLikePlaceholder = [
        'n/a',
        'na',
        'none',
        'unknown',
        'not sure',
        'not answering',
        'no',
    ].includes(lowerCompact);
    const looksLikePersonReferral =
        !looksLikePlaceholder &&
        personLikeTokens.length >= 1 &&
        personLikeTokens.length <= 3 &&
        personLikeTokens.every((token) => /^[a-zA-Z][a-zA-Z.-]*$/.test(token));
    if (looksLikePersonReferral) {
        return 'Referral';
    }

    return 'Other';
}

const HUBSPOT_LUMA_HEAR_ABOUT_FIELDS = [
    'luma_how_did_you_hear_about_sober_founders',
    'luma_how_did_you_hear_about_sober_founders_',
];

function extractHubspotLumaHearAbout(contact) {
    if (!contact || typeof contact !== 'object') return null;
    for (const field of HUBSPOT_LUMA_HEAR_ABOUT_FIELDS) {
        const value = String(contact?.[field] || '').trim();
        if (value) return value;
    }
    return null;
}

function hubspotSourceFallback(contact) {
    const source = String(contact?.hs_analytics_source || '').trim();
    const sourceData1 = String(contact?.hs_analytics_source_data_1 || '').trim();
    const sourceData2 = String(contact?.hs_analytics_source_data_2 || '').trim();

    if (!source && !sourceData1 && !sourceData2) return null;

    const parts = [source, sourceData1, sourceData2].filter(Boolean);
    if (parts.length === 0) return null;

    return `HubSpot source: ${parts.join(' | ')}`;
}

function buildLumaRows(lumaRows, startKey, endKey, hubspotRows, adsAdsetIndex) {
    const hubspotByEmail = buildHubspotEmailIndex(hubspotRows);

    return (lumaRows || []).filter((row) => {
        const dateKey = parseDateKey(row?.event_date || row?.event_start_at || row?.registered_at);
        if (!dateKey) return false;
        if (!dateInRange(dateKey, startKey, endKey)) return false;
        const approval = String(row?.approval_status || 'approved').toLowerCase();
        if (approval && approval !== 'approved') return false;
        // Only Thursday Luma events (the sync already sets is_thursday)
        const isThursday = row?.is_thursday === undefined ? true : !!row.is_thursday;
        return isThursday;
    }).map((row) => {
        const email = normalizeEmail(row?.guest_email);
        const contact = pickMostRelevantContact(hubspotByEmail.get(email));
        const officialRevenue = resolveHubspotOfficialRevenue(contact);
        const matchedRevenueRaw = row?.matched_hubspot_revenue;
        const matchedRevenue =
            matchedRevenueRaw !== null && matchedRevenueRaw !== undefined && matchedRevenueRaw !== ''
                ? Number(matchedRevenueRaw)
                : null;
        const revenue = Number.isFinite(matchedRevenue) ? matchedRevenue : resolveHubspotRevenue(contact);
        const sobrietyDate = resolveHubspotSobrietyDate(contact);
        const campaignSource = String(contact?.hs_analytics_source_data_2 || contact?.campaign || '').trim();
        const preferredDateKey = parseHubspotCreatedDateKey(contact?.createdate)
            || parseDateKey(row?.registered_at || row?.event_date || row?.event_start_at);
        const adGroup = inferAdGroupFromCampaign(campaignSource, preferredDateKey, adsAdsetIndex);
        const hubspotCentralizedHearAbout = extractHubspotLumaHearAbout(contact);
        const lumaHearAbout = extractHearAboutAnswer(row?.registration_answers);
        const hubspotHearAbout = hubspotSourceFallback(contact);
        const hearAbout = hubspotCentralizedHearAbout || lumaHearAbout || hubspotHearAbout || null;
        const hearAboutCategory = classifyHearAbout(hearAbout);
        const hearAboutSource = hubspotCentralizedHearAbout
            ? 'HubSpot Luma How Heard (Centralized)'
            : lumaHearAbout
                ? 'Luma Answer'
                : hubspotHearAbout
                    ? 'HubSpot Fallback'
                    : 'Not Found';

        return {
            date: parseDateKey(row?.event_date || row?.event_start_at || row?.registered_at) || '',
            name: String(row?.guest_name || '').trim() || fullNameFromContact(contact) || 'Not Found',
            email: email || normalizeEmail(contact?.email) || 'Not Found',
            funnel: String(row?.funnel_key || '').toLowerCase() === 'phoenix' ? 'phoenix' : 'free',
            showedUp: (row?.matched_attendance ?? row?.matched_zoom) ? 'Yes' : 'No',
            matchedAttendance: !!(row?.matched_attendance ?? row?.matched_zoom),
            matchedAttendanceNetNew: !!(row?.matched_attendance_net_new ?? row?.matched_zoom_net_new),
            matchedHubspot: !!row?.matched_hubspot,
            hubspotTier: row?.matched_hubspot_tier || null,
            revenue: revenue ?? 'Not Found',
            revenueOfficial: Number.isFinite(officialRevenue) ? officialRevenue : null,
            sobrietyDate: sobrietyDate || 'Not Found',
            adGroup: adGroup || 'Not Found',
            hearAboutCategory,
            hearAbout: hearAbout || 'Not Found',
            hearAboutSource,
            hubspotLumaHowHeard: hubspotCentralizedHearAbout || 'Not Found',
            lumaHowHeardRaw: lumaHearAbout || 'Not Found',
            originalTrafficSource: contact?.hs_analytics_source || 'Not Found',
            originalTrafficSourceDetail1: contact?.hs_analytics_source_data_1 || 'Not Found',
            originalTrafficSourceDetail2: contact?.hs_analytics_source_data_2 || 'Not Found',
            recordSource: row?.custom_source || contact?.hs_analytics_source || '—',
            adSource: contact?.hs_analytics_source_data_2 || contact?.campaign || '—',
        };
    });
}

// ---------------------------------------------------------------------------
// Ads helpers
// ---------------------------------------------------------------------------

function sumAds(adsRows, startKey, endKey, funnelFilter) {
    let spend = 0, impressions = 0, clicks = 0, leads = 0;

    for (const row of adsRows || []) {
        const dateKey = parseDateKey(row?.date_day);
        if (!dateKey || !dateInRange(dateKey, startKey, endKey)) continue;

        // funnel filtering: 'phoenix' => funnel_key==='phoenix', 'free' => anything else
        const funnel = String(row?.funnel_key || row?.campaign_name || '').toLowerCase();
        const isPhoenix = funnel.includes('phoenix') ||
            String(row?.campaign_name || '').toLowerCase().includes('phoenix');
        if (funnelFilter === 'phoenix' && !isPhoenix) continue;
        if (funnelFilter === 'free' && isPhoenix) continue;

        spend += Number(row?.spend || 0);
        impressions += Number(row?.impressions || 0);
        clicks += Number(row?.clicks || 0);
        leads += Number(row?.leads || 0);
    }

    return { spend, impressions, clicks, leads };
}

// ---------------------------------------------------------------------------
// Lead categorization with mismatch detection
// ---------------------------------------------------------------------------

function buildDedupedPaidHubspotContacts(hubspotRows, funnelFilter) {
    const dedup = new Map();
    const keyByEmail = new Map();

    for (const row of hubspotRows || []) {
        if (!isActiveHubspotContact(row)) continue;
        if (!isPaidSocialHubspotContact(row)) continue;
        const isPhoenix = isPhoenixHubspotContact(row);
        if (funnelFilter === 'phoenix' && !isPhoenix) continue;
        if (funnelFilter === 'free' && isPhoenix) continue;

        const primaryEmail = normalizeEmail(row?.email);
        const extraEmails = parseEmailList(row?.hs_additional_emails);
        const identityEmails = Array.from(new Set([primaryEmail, ...extraEmails].filter(Boolean)));
        const existingKeys = Array.from(new Set(identityEmails.map((email) => keyByEmail.get(email)).filter(Boolean)));
        const id = Number(row?.hubspot_contact_id);
        const fallbackEmail = identityEmails[0] || '';
        const fallbackId = Number.isFinite(id) ? `id:${id}` : null;
        const key = existingKeys[0] || (fallbackEmail ? `email:${fallbackEmail}` : fallbackId);
        if (!key) continue;

        for (let i = 1; i < existingKeys.length; i += 1) {
            const oldKey = existingKeys[i];
            if (oldKey === key) continue;
            const oldRow = dedup.get(oldKey);
            if (oldRow) {
                dedup.set(key, pickNewerContact(dedup.get(key), oldRow));
                dedup.delete(oldKey);
            }
            keyByEmail.forEach((mappedKey, email) => {
                if (mappedKey === oldKey) keyByEmail.set(email, key);
            });
        }

        dedup.set(key, pickNewerContact(dedup.get(key), row));
        identityEmails.forEach((email) => keyByEmail.set(email, key));
    }

    return Array.from(dedup.values())
        .sort((a, b) => contactCreatedTs(b) - contactCreatedTs(a));
}

/**
 * Categorizes HubSpot contacts (in the date range) by revenue tier.
 * Also identifies contacts not found in HubSpot or missing revenue.
 *
 * @param {Object}   adsMetrics   { leads: number } — the Meta ads lead count for the group
 * @param {any[]}    hubspotRows  raw HubSpot contacts in date window
 * @param {string}   funnelFilter 'free'|'phoenix'
 * @returns {{ bad, ok, qualified, great, unknown, total, unmatched[], mismatch }}
 */
function buildLeadCategorization(adsMetrics, hubspotRows, funnelFilter) {
    const counts = { bad: 0, ok: 0, qualified: 0, great: 0, unknown: 0 };
    const unmatchedLeads = [];
    const contacts = buildDedupedPaidHubspotContacts(hubspotRows, funnelFilter);
    let qualifiedCount = 0;
    let phoenixQualifiedCount = 0;
    let goodCount = 0;
    let greatCount = 0;

    for (const row of contacts) {
        const revenue = resolveHubspotRevenue(row);
        const sobrietyRaw = extractHubspotSobrietyRaw(row);
        const qualityTier = leadQualityTierFromOfficialRevenue(revenue);
        const tier = qualityTier === 'good' ? 'qualified' : qualityTier;
        const name = `${String(row?.firstname || '')} ${String(row?.lastname || '')}`.trim();
        const email = String(row?.email || '').trim().toLowerCase();

        if (tier === 'unknown') {
            unmatchedLeads.push({ name, email, reason: 'Missing revenue field in HubSpot' });
        }

        if (counts[tier] !== undefined) counts[tier]++;
        if (isQualifiedLead({ revenue, sobrietyDate: sobrietyRaw })) qualifiedCount += 1;
        if (isPhoenixQualifiedLead({ revenue, sobrietyDate: sobrietyRaw })) phoenixQualifiedCount += 1;
        if (qualityTier === 'good') goodCount += 1;
        if (qualityTier === 'great') greatCount += 1;
    }

    const categorizedTotal = counts.bad + counts.ok + counts.qualified + counts.great + counts.unknown;
    const metaTotal = Math.round(adsMetrics.leads);
    const mismatch = metaTotal > 0 && categorizedTotal !== metaTotal;

    if (mismatch && metaTotal > categorizedTotal) {
        // More Meta leads than HubSpot records found — add synthetic "not found in HubSpot" entries
        const gap = metaTotal - categorizedTotal;
        for (let i = 0; i < gap; i++) {
            unmatchedLeads.push({ name: '(unknown — not in HubSpot)', email: '', reason: 'Not found in HubSpot by email' });
        }
    }

    return {
        ...counts,
        total: metaTotal,
        categorizedTotal,
        qualified_count: qualifiedCount,
        phoenix_qualified_count: phoenixQualifiedCount,
        good_count: goodCount,
        great_count: greatCount,
        revenue_eligible_count: goodCount + greatCount,
        qualified_quality_parity_delta: qualifiedCount - (goodCount + greatCount),
        qualified_sobriety_gap_count: Math.max((goodCount + greatCount) - qualifiedCount, 0),
        unmatched: unmatchedLeads,
        mismatch,
    };
}

// ---------------------------------------------------------------------------
// Build a single group snapshot
// ---------------------------------------------------------------------------

function buildLeadRows(hubspotInRange, lumaRows, funnelFilter) {
    const contacts = buildDedupedPaidHubspotContacts(hubspotInRange, funnelFilter);

    const lumaByEmail = new Map();
    for (const row of lumaRows || []) {
        const email = normalizeEmail(row?.email);
        if (!email) continue;

        const existing = lumaByEmail.get(email);
        if (!existing) {
            lumaByEmail.set(email, row);
            continue;
        }

        const existingDateScoreRaw = Number.parseInt(String(existing?.date || '').replace(/-/g, ''), 10);
        const candidateDateScoreRaw = Number.parseInt(String(row?.date || '').replace(/-/g, ''), 10);
        const existingDateScore = Number.isFinite(existingDateScoreRaw) ? existingDateScoreRaw : 0;
        const candidateDateScore = Number.isFinite(candidateDateScoreRaw) ? candidateDateScoreRaw : 0;
        const existingScore = Number(existing?.matchedAttendance) * 1_000_000 + existingDateScore;
        const candidateScore = Number(row?.matchedAttendance) * 1_000_000 + candidateDateScore;
        if (candidateScore > existingScore) lumaByEmail.set(email, row);
    }

    const rows = contacts.map((contact) => {
        const primaryEmail = normalizeEmail(contact?.email);
        const extraEmails = parseEmailList(contact?.hs_additional_emails);
        const candidateEmails = [primaryEmail, ...extraEmails].filter(Boolean);
        const matchedLuma = candidateEmails.map((email) => lumaByEmail.get(email)).find(Boolean) || null;
        const revenue = resolveHubspotRevenue(contact);
        const sobrietyDate = resolveHubspotSobrietyDate(contact);

        return {
            name: fullNameFromContact(contact) || matchedLuma?.name || 'Not Found',
            email: matchedLuma?.email || primaryEmail || extraEmails[0] || 'Not Found',
            showedUp: matchedLuma?.matchedAttendance ? 'Yes' : 'No',
            matchedAttendance: !!matchedLuma?.matchedAttendance,
            revenue: revenue ?? 'Not Found',
            sobrietyDate: sobrietyDate || 'Not Found',
        };
    });

    return rows;
}

function buildSubRowSnapshot(label, adsRows, hubspotRows, lumaRows, startKey, endKey, funnelFilter, adsAdsetIndex) {
    const ads = sumAds(adsRows, startKey, endKey, funnelFilter);
    const lumaFiltered = buildLumaRows(lumaRows, startKey, endKey, hubspotRows, adsAdsetIndex)
        .filter((r) => funnelFilter === 'any' || r.funnel === funnelFilter);
    const lumaCount = lumaFiltered.length;

    // HubSpot contacts in date window
    const hubspotInRange = (hubspotRows || []).filter((row) => {
        if (!isActiveHubspotContact(row)) return false;
        const dk = parseHubspotCreatedDateKey(row?.createdate);
        return dk && dateInRange(dk, startKey, endKey);
    });
    const categorization = buildLeadCategorization(ads, hubspotInRange, funnelFilter === 'any' ? 'free' : funnelFilter);

    const leadRows = buildLeadRows(hubspotInRange, lumaFiltered, funnelFilter);

    const cpl = safeDivide(ads.spend, ads.leads);
    const costPerRegistration = safeDivide(ads.spend, lumaCount);

    return {
        label,
        spend: ads.spend,
        impressions: ads.impressions,
        clicks: ads.clicks,
        metaLeads: Math.round(ads.leads),
        lumaRegistrations: lumaCount,
        zoomShowUps: 0,
        cpl,
        costPerRegistration,
        costPerShowUp: null,
        categorization,
        leadRows,
        lumaRows: lumaFiltered,
        zoomRows: [],
    };
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Build the full grouped snapshot for both current and previous periods.
 *
 * @param {{
 *   adsRows:      any[],
 *   hubspotRows:  any[],
 *   lumaRows:     any[],
 *   zoomRows:     any[],
 *   dateRange:    { current: {start, end}, previous: {start, end} | null }
 * }} params
 *
 * @returns {{
 *   current:  { free: { tuesday, thursday, combined }, phoenix },
 *   previous: { free: { tuesday, thursday, combined }, phoenix } | null,
 *   dateRange,
 *   generatedAt: string,
 * }}
 */
export function buildGroupedLeadsSnapshot({ adsRows, hubspotRows, lumaRows, dateRange }) {
    const adsAdsetIndex = buildAdsAdsetIndex(adsRows);

    function buildPeriodSnapshot(start, end) {
        const freeTuesday = buildSubRowSnapshot('Free Tuesday', adsRows, hubspotRows, lumaRows, start, end, 'free', adsAdsetIndex);
        const freeThursday = buildSubRowSnapshot('Free Thursday', adsRows, hubspotRows, lumaRows, start, end, 'free', adsAdsetIndex);
        const freeCombined = buildSubRowSnapshot('Free Combined', adsRows, hubspotRows, lumaRows, start, end, 'free', adsAdsetIndex);
        const phoenix = buildSubRowSnapshot('Phoenix Forum', adsRows, hubspotRows, lumaRows, start, end, 'phoenix', adsAdsetIndex);

        return { free: { tuesday: freeTuesday, thursday: freeThursday, combined: freeCombined }, phoenix };
    }

    const { current, previous } = dateRange;

    return {
        current: buildPeriodSnapshot(current.start, current.end),
        previous: previous ? buildPeriodSnapshot(previous.start, previous.end) : null,
        dateRange,
        generatedAt: new Date().toISOString(),
    };
}
