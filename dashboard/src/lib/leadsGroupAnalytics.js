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

export const TUESDAY_MEETING_ID = '87199667045';
export const THURSDAY_MEETING_ID = '84242212480';

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

function addMonths(dateKey, months) {
    const d = toUtcDate(dateKey);
    d.setUTCMonth(d.getUTCMonth() + months);
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

// ---------------------------------------------------------------------------
// Date range windows builder
// ---------------------------------------------------------------------------

/**
 * @param {string} rangeType  one of: 'last_week'|'last_2_weeks'|'last_month'|'last_quarter'|'last_year'|'custom'
 * @param {string|null} customStart  YYYY-MM-DD (only for rangeType='custom')
 * @param {string|null} customEnd    YYYY-MM-DD (only for rangeType='custom')
 * @param {string} todayKey  YYYY-MM-DD (today's date)
 * @returns {{ current: {start, end, label}, previous: {start, end, label} | null }}
 */
export function buildDateRangeWindows(rangeType, customStart, customEnd, todayKey) {
    const today = todayKey || isoDate(new Date());

    if (rangeType === 'custom') {
        const start = customStart || addDays(today, -6);
        const end = customEnd || today;
        return {
            current: { start, end, label: `${start} → ${end}` },
            previous: null, // no comparison for custom ranges
        };
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
    if (revenueValue === null || revenueValue === undefined || revenueValue === '') return 'unknown';
    const n = Number(revenueValue);
    if (!Number.isFinite(n)) return 'unknown';
    if (n >= 1_000_000) return 'great';
    if (n >= 250_000 && n < 1_000_000) return 'qualified';
    if (n >= 100_000 && n < 250_000) return 'ok';
    return 'bad';
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

function contactDataScore(row) {
    const official = row?.annual_revenue_in_dollars__official_;
    const fallback = row?.annual_revenue_in_dollars;
    const sobriety = row?.sobriety_date;
    let score = 0;
    if (official !== null && official !== undefined && official !== '') score += 4;
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

function resolveHubspotRevenue(contact) {
    const officialRaw = contact?.annual_revenue_in_dollars__official_;
    if (officialRaw !== null && officialRaw !== undefined && officialRaw !== '') {
        const official = Number(officialRaw);
        if (Number.isFinite(official)) return official;
    }

    const fallbackRaw = contact?.annual_revenue_in_dollars;
    if (fallbackRaw !== null && fallbackRaw !== undefined && fallbackRaw !== '') {
        const fallback = Number(fallbackRaw);
        if (Number.isFinite(fallback)) return fallback;
    }

    return null;
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

/**
 * Build an email-keyed map from HubSpot rows.
 * Checks both the primary `email` field AND `hs_additional_emails`
 * (a comma-separated list used for merged contacts).
 */
function buildHubspotEmailIndex(hubspotRows) {
    const byEmail = new Map();

    for (const row of hubspotRows || []) {
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

function getMeetingDayType(row) {
    const meta = row?.metadata || {};
    const meetingId = String(meta.meeting_id || '');
    if (meetingId === TUESDAY_MEETING_ID) return 'tuesday';
    if (meetingId === THURSDAY_MEETING_ID) return 'thursday';

    // Fall back to day-of-week from start_time
    const dateKey = parseDateKey(meta.start_time || row.metric_date);
    if (!dateKey) return 'other';
    const day = toUtcDate(dateKey).getUTCDay();
    if (day === 2) return 'tuesday';
    if (day === 4) return 'thursday';
    return 'other';
}

function buildZoomShowUpRows(zoomRows, startKey, endKey, dayTypeFilter) {
    /** Returns an array of { date, name, dayType } for attendees in range */
    const rows = [];

    for (const row of zoomRows || []) {
        const dateKey = parseDateKey(row?.metadata?.start_time || row?.metric_date);
        if (!dateKey || !dateInRange(dateKey, startKey, endKey)) continue;

        const dayType = getMeetingDayType(row);
        if (dayTypeFilter && dayType !== dayTypeFilter) continue;

        const attendees = Array.isArray(row?.metadata?.attendees) ? row.metadata.attendees : [];
        for (const name of attendees) {
            const n = String(name || '').trim();
            if (n) rows.push({ date: dateKey, name: n, dayType, email: '' });
        }
    }

    return rows;
}

function countZoomShowUps(zoomRows, startKey, endKey, dayTypeFilter) {
    return buildZoomShowUpRows(zoomRows, startKey, endKey, dayTypeFilter).length;
}

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

    return 'Other';
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
        const officialRevenueRaw = contact?.annual_revenue_in_dollars__official_;
        const officialRevenue =
            officialRevenueRaw !== null && officialRevenueRaw !== undefined && officialRevenueRaw !== ''
                ? Number(officialRevenueRaw)
                : null;
        const matchedRevenueRaw = row?.matched_hubspot_revenue;
        const matchedRevenue =
            matchedRevenueRaw !== null && matchedRevenueRaw !== undefined && matchedRevenueRaw !== ''
                ? Number(matchedRevenueRaw)
                : null;
        const revenue = Number.isFinite(matchedRevenue) ? matchedRevenue : resolveHubspotRevenue(contact);
        const sobrietyDate = resolveHubspotSobrietyDate(contact);
        const campaignSource = String(contact?.hs_analytics_source_data_2 || contact?.campaign || '').trim();
        const preferredDateKey = parseDateKey(contact?.createdate || row?.registered_at || row?.event_date || row?.event_start_at);
        const adGroup = inferAdGroupFromCampaign(campaignSource, preferredDateKey, adsAdsetIndex);
        const lumaHearAbout = extractHearAboutAnswer(row?.registration_answers);
        const hubspotHearAbout = hubspotSourceFallback(contact);
        const hearAbout = lumaHearAbout || hubspotHearAbout || null;
        const hearAboutCategory = classifyHearAbout(hearAbout);
        const hearAboutSource = lumaHearAbout ? 'Luma Answer' : hubspotHearAbout ? 'HubSpot Fallback' : 'Not Found';

        return {
            date: parseDateKey(row?.event_date || row?.event_start_at || row?.registered_at) || '',
            name: String(row?.guest_name || '').trim() || fullNameFromContact(contact) || 'Not Found',
            email: email || normalizeEmail(contact?.email) || 'Not Found',
            funnel: String(row?.funnel_key || '').toLowerCase() === 'phoenix' ? 'phoenix' : 'free',
            showedUp: row?.matched_zoom ? 'Yes' : 'No',
            matchedZoom: !!row?.matched_zoom,
            matchedZoomNetNew: !!row?.matched_zoom_net_new,
            matchedHubspot: !!row?.matched_hubspot,
            hubspotTier: row?.matched_hubspot_tier || null,
            revenue: revenue ?? 'Not Found',
            revenueOfficial: Number.isFinite(officialRevenue) ? officialRevenue : null,
            sobrietyDate: sobrietyDate || 'Not Found',
            adGroup: adGroup || 'Not Found',
            hearAboutCategory,
            hearAbout: hearAbout || 'Not Found',
            hearAboutSource,
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

/**
 * Categorizes HubSpot contacts (in the date range) by revenue tier.
 * Also identifies contacts not found in HubSpot or missing revenue.
 *
 * @param {Object}   adsMetrics   { leads: number } — the Meta ads lead count for the group
 * @param {any[]}    hubspotRows  raw HubSpot contacts in date window
 * @param {Map}      emailIndex   from buildHubspotEmailIndex (all contacts)
 * @param {string}   funnelFilter 'free'|'phoenix'
 * @returns {{ bad, ok, qualified, great, unknown, total, unmatched[], mismatch }}
 */
function buildLeadCategorization(adsMetrics, hubspotRows, funnelFilter) {
    const counts = { bad: 0, ok: 0, qualified: 0, great: 0, unknown: 0 };
    const unmatchedLeads = [];

    for (const row of hubspotRows || []) {
        // Only paid-social leads
        if (!isPaidSocialHubspotContact(row)) continue;

        // Funnel filter
        const isPhoenix = isPhoenixHubspotContact(row);
        if (funnelFilter === 'phoenix' && !isPhoenix) continue;
        if (funnelFilter === 'free' && isPhoenix) continue;

        const revenue = resolveHubspotRevenue(row);
        const tier = leadTierFromRevenue(revenue);
        const name = `${String(row?.firstname || '')} ${String(row?.lastname || '')}`.trim();
        const email = String(row?.email || '').trim().toLowerCase();

        if (tier === 'unknown') {
            unmatchedLeads.push({ name, email, reason: 'Missing revenue field in HubSpot' });
        }

        if (counts[tier] !== undefined) counts[tier]++;
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
        counts.unknown += gap;
    }

    return {
        ...counts,
        total: metaTotal,
        categorizedTotal,
        unmatched: unmatchedLeads,
        mismatch,
    };
}

// ---------------------------------------------------------------------------
// Build a single group snapshot
// ---------------------------------------------------------------------------

function buildLeadRows(ads, hubspotInRange, lumaRows, funnelFilter) {
    const targetCount = Math.max(0, Math.round(Number(ads?.leads || 0)));
    if (targetCount === 0) return [];

    const dedup = new Map();
    for (const row of hubspotInRange || []) {
        if (!isPaidSocialHubspotContact(row)) continue;
        const isPhoenix = isPhoenixHubspotContact(row);
        if (funnelFilter === 'phoenix' && !isPhoenix) continue;
        if (funnelFilter === 'free' && isPhoenix) continue;

        const email = normalizeEmail(row?.email);
        const id = row?.hubspot_contact_id;
        const key = id ? `id:${id}` : (email ? `email:${email}` : null);
        if (!key) continue;

        const current = dedup.get(key);
        if (!current || contactCreatedTs(row) > contactCreatedTs(current)) dedup.set(key, row);
    }

    const contacts = Array.from(dedup.values())
        .sort((a, b) => contactCreatedTs(b) - contactCreatedTs(a));

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
        const existingScore = Number(existing?.matchedZoom) * 1_000_000 + existingDateScore;
        const candidateScore = Number(row?.matchedZoom) * 1_000_000 + candidateDateScore;
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
            showedUp: matchedLuma?.matchedZoom ? 'Yes' : 'No',
            matchedZoom: !!matchedLuma?.matchedZoom,
            revenue: revenue ?? 'Not Found',
            sobrietyDate: sobrietyDate || 'Not Found',
        };
    });

    const usedEmails = new Set(rows.map((row) => normalizeEmail(row.email)).filter(Boolean));
    const lumaSorted = [...(lumaRows || [])]
        .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));

    for (const row of lumaSorted) {
        if (rows.length >= targetCount) break;
        const email = normalizeEmail(row?.email);
        if (email && usedEmails.has(email)) continue;
        if (email) usedEmails.add(email);

        rows.push({
            name: String(row?.name || '').trim() || 'Not Found',
            email: email || 'Not Found',
            showedUp: row?.matchedZoom ? 'Yes' : 'No',
            matchedZoom: !!row?.matchedZoom,
            revenue: Number.isFinite(Number(row?.revenue)) ? Number(row.revenue) : 'Not Found',
            sobrietyDate: formatDateMMDDYYYY(row?.sobrietyDate) || 'Not Found',
        });
    }

    if (rows.length > targetCount) return rows.slice(0, targetCount);

    while (rows.length < targetCount) {
        rows.push({
            name: 'Not Found',
            email: 'Not Found',
            showedUp: 'No',
            matchedZoom: false,
            revenue: 'Not Found',
            sobrietyDate: 'Not Found',
        });
    }

    return rows;
}

function buildSubRowSnapshot(label, adsRows, hubspotRows, lumaRows, zoomRows, startKey, endKey, funnelFilter, zoomDayType, adsAdsetIndex) {
    const ads = sumAds(adsRows, startKey, endKey, funnelFilter);
    const lumaFiltered = buildLumaRows(lumaRows, startKey, endKey, hubspotRows, adsAdsetIndex)
        .filter((r) => funnelFilter === 'any' || r.funnel === funnelFilter);
    const lumaCount = lumaFiltered.length;

    const zoomShowUpRows = buildZoomShowUpRows(zoomRows, startKey, endKey, zoomDayType);
    const zoomCount = zoomShowUpRows.length;

    // HubSpot contacts in date window
    const hubspotInRange = (hubspotRows || []).filter((row) => {
        const dk = parseDateKey(row?.createdate);
        return dk && dateInRange(dk, startKey, endKey);
    });
    const categorization = buildLeadCategorization(ads, hubspotInRange, funnelFilter === 'any' ? 'free' : funnelFilter);

    const leadRows = buildLeadRows(ads, hubspotInRange, lumaFiltered, funnelFilter);

    const cpl = safeDivide(ads.spend, ads.leads);
    const costPerRegistration = safeDivide(ads.spend, lumaCount);
    const costPerShowUp = safeDivide(ads.spend, zoomCount);

    return {
        label,
        spend: ads.spend,
        impressions: ads.impressions,
        clicks: ads.clicks,
        metaLeads: Math.round(ads.leads),
        lumaRegistrations: lumaCount,
        zoomShowUps: zoomCount,
        cpl,
        costPerRegistration,
        costPerShowUp,
        categorization,
        leadRows,
        lumaRows: lumaFiltered,
        zoomRows: zoomShowUpRows,
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
export function buildGroupedLeadsSnapshot({ adsRows, hubspotRows, lumaRows, zoomRows, dateRange }) {
    const adsAdsetIndex = buildAdsAdsetIndex(adsRows);

    function buildPeriodSnapshot(start, end) {
        const freeTuesday = buildSubRowSnapshot('Free Tuesday', adsRows, hubspotRows, lumaRows, zoomRows, start, end, 'free', 'tuesday', adsAdsetIndex);
        const freeThursday = buildSubRowSnapshot('Free Thursday', adsRows, hubspotRows, lumaRows, zoomRows, start, end, 'free', 'thursday', adsAdsetIndex);
        const freeCombined = buildSubRowSnapshot('Free Combined', adsRows, hubspotRows, lumaRows, zoomRows, start, end, 'free', null, adsAdsetIndex);
        const phoenix = buildSubRowSnapshot('Phoenix Forum', adsRows, hubspotRows, lumaRows, zoomRows, start, end, 'phoenix', null, adsAdsetIndex);

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
