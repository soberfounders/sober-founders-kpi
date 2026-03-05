import React, { useEffect, useMemo, useState } from 'react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import {
  DASHBOARD_LOOKBACK_DAYS,
  ENABLE_REMOTE_AI_MODULE_ANALYSIS,
  HUBSPOT_CONTACT_LOOKBACK_DAYS,
  USE_DUMMY_DONATIONS,
} from '../lib/env';
import SendToNotionModal from '../components/SendToNotionModal';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';

const SOURCE_KEYS = ['zoom', 'google_analytics', 'google_search_console'];
const LOOKBACK_DAYS = DASHBOARD_LOOKBACK_DAYS;
const MODULE_ANALYSIS_TTL_HOURS = 24;
const REMOTE_AI_MODULE_ANALYSIS_ENABLED = ENABLE_REMOTE_AI_MODULE_ANALYSIS;
const DUMMY_DONATION_ROWS = [
  {
    source_system: 'dummy',
    amount: 5000,
    currency: 'USD',
    is_recurring: false,
    status: 'posted',
    campaign_name: 'Dummy Campaign - Scholarship',
    donated_at: '2026-02-20T15:30:00.000Z',
  },
  {
    source_system: 'dummy',
    amount: 1200,
    currency: 'USD',
    is_recurring: true,
    status: 'posted',
    campaign_name: 'Dummy Campaign - Recurring Circle',
    donated_at: '2026-02-18T13:00:00.000Z',
  },
  {
    source_system: 'dummy',
    amount: 750,
    currency: 'USD',
    is_recurring: false,
    status: 'posted',
    campaign_name: 'Dummy Campaign - Monthly Support',
    donated_at: '2026-01-25T09:15:00.000Z',
  },
];
const ET_TIMEZONE = 'America/New_York';
const GROUP_CALL_ET_MINUTES = {
  Tuesday: 12 * 60,
  Thursday: 11 * 60,
};
const GROUP_CALL_TIME_TOLERANCE_MINUTES = 120;
const MIN_GROUP_ATTENDEES = 3;
const EXPECTED_ZERO_GROUP_SESSION_KEYS = new Set(['Thursday|2025-12-25']);

const etWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_TIMEZONE,
  weekday: 'short',
});

const etTimePartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_TIMEZONE,
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
});

function dateToUtc(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function isoDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function shiftUtcDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function mondayUtc(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function parseMaybeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function etGroupTypeFromDate(dateLike) {
  const d = parseMaybeDate(dateLike);
  if (!d) return null;

  const weekdayShort = etWeekdayFormatter.format(d);
  const dayType = weekdayShort === 'Tue' ? 'Tuesday' : (weekdayShort === 'Thu' ? 'Thursday' : null);
  if (!dayType) return null;

  const parts = etTimePartsFormatter.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || NaN);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || NaN);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const minuteOfDay = hour * 60 + minute;
  const expectedMinute = GROUP_CALL_ET_MINUTES[dayType];
  const minutesFromExpected = Math.abs(minuteOfDay - expectedMinute);
  if (minutesFromExpected <= GROUP_CALL_TIME_TOLERANCE_MINUTES) return dayType;
  return null;
}

function etWeekdayGroupFromDate(dateLike) {
  const d = parseMaybeDate(dateLike);
  if (!d) return null;
  const weekdayShort = etWeekdayFormatter.format(d);
  if (weekdayShort === 'Tue') return 'Tuesday';
  if (weekdayShort === 'Thu') return 'Thursday';
  return null;
}

function etGroupTimingFromDate(dateLike) {
  const d = parseMaybeDate(dateLike);
  if (!d) return null;
  const dayType = etWeekdayGroupFromDate(d);
  if (!dayType) return null;

  const parts = etTimePartsFormatter.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || NaN);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || NaN);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const minuteOfDay = (hour * 60) + minute;
  const expectedMinute = GROUP_CALL_ET_MINUTES[dayType];
  const minutesFromExpected = Math.abs(minuteOfDay - expectedMinute);
  return {
    dayType,
    minuteOfDay,
    expectedMinute,
    minutesFromExpected,
    isNearScheduled: Number.isFinite(minutesFromExpected) && minutesFromExpected <= GROUP_CALL_TIME_TOLERANCE_MINUTES,
  };
}

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function pctDelta(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  const n = Number(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function formatInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '0';
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function avg(values = []) {
  const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function changeLabel(delta, { positiveIsGood = true } = {}) {
  if (delta === null || delta === undefined || Number.isNaN(Number(delta))) return 'flat / insufficient comparison';
  const n = Number(delta);
  if (Math.abs(n) < 0.03) return 'roughly flat';
  const direction = n > 0 ? 'up' : 'down';
  const pctText = `${Math.abs(n * 100).toFixed(0)}%`;
  if (positiveIsGood) return `${direction} ${pctText}`;
  return `${direction} ${pctText}${n < 0 ? ' (better)' : ' (worse)'}`;
}

function comparePeriod(current, previous) {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return (c - p) / p;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isPhoenixText(value) {
  return String(value || '').toLowerCase().includes('phoenix');
}

function isPaidSocialHubspotContact(row) {
  const text = [
    row?.original_traffic_source,
    row?.hs_analytics_source,
    row?.hs_latest_source,
  ].join(' ').toUpperCase();
  return text.includes('PAID_SOCIAL');
}

function isPhoenixHubspotContact(row) {
  const text = [
    row?.campaign,
    row?.campaign_source,
    row?.membership_s,
    row?.hs_analytics_source_data_2,
  ].join(' ').toLowerCase();
  return text.includes('phoenix');
}

function classifyGroupCall(activity, attendeeCount) {
  const title = String(activity?.title || '').toLowerCase();
  const start = parseMaybeDate(activity?.hs_timestamp || activity?.created_at_hubspot);
  if (!start) return null;

  const timing = etGroupTimingFromDate(start);
  const titleType =
    title.includes('tactic tuesday') ? 'Tuesday' :
      (title.includes('mastermind on zoom') || title.includes('all are welcome')) ? 'Thursday' :
        (title.includes("entrepreneur's big book") || title.includes('big book')) ? 'Thursday' :
          (title.includes('sober founders mastermind') && !title.includes('intro')) ? 'Thursday' :
            null;

  if (timing?.isNearScheduled && timing?.dayType) return timing.dayType;
  if (titleType && attendeeCount >= MIN_GROUP_ATTENDEES) return titleType;
  if (timing?.dayType && attendeeCount >= MIN_GROUP_ATTENDEES) return timing.dayType;

  if (titleType) return titleType;

  return null;
}

function calcStatus(value, thresholds) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'watch';
  const n = Number(value);
  if (n < thresholds.critical) return 'critical';
  if (n < thresholds.watch) return 'watch';
  return 'healthy';
}

function calcTrendStatus(value, thresholds) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'watch';
  const n = Number(value);
  if (n <= thresholds.critical) return 'critical';
  if (n <= thresholds.watch) return 'watch';
  return 'healthy';
}

function toUtcDayStart(input) {
  const d = input instanceof Date ? input : parseMaybeDate(input);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function hubspotActivityFreshnessDay(row, todayUtcDay = null) {
  const createdAtDay = toUtcDayStart(row?.created_at_hubspot);
  const scheduledDay = toUtcDayStart(row?.hs_timestamp);
  if (scheduledDay && todayUtcDay && scheduledDay <= todayUtcDay) return scheduledDay;
  return createdAtDay || scheduledDay;
}

function formatDateShort(input) {
  const d = toUtcDayStart(input);
  if (!d) return 'N/A';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatDateRange(start, end) {
  return `${formatDateShort(start)} to ${formatDateShort(end)}`;
}

function inUtcDayRange(input, start, end) {
  const d = toUtcDayStart(input);
  if (!d || !start || !end) return false;
  return d >= start && d <= end;
}

function sumBy(rows, predicate, valueGetter) {
  return rows.reduce((acc, row) => (predicate(row) ? acc + safeNum(valueGetter(row)) : acc), 0);
}

function ratioOrNull(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

function formatAttendanceAvgVisits(avgVisits, uniqueAttendees) {
  const visits = Number(avgVisits);
  const unique = Number(uniqueAttendees);
  if (Number.isFinite(unique) && unique > 0 && Number.isFinite(visits)) {
    return visits.toFixed(2);
  }
  return '0.00 (No attendance recorded)';
}

function formatAttendanceCpna(cpna, freeSpend, newAttendees) {
  if (Number.isFinite(cpna)) return formatCurrency(cpna);
  const spend = Number(freeSpend);
  const netNew = Number(newAttendees);
  if (Number.isFinite(spend) && spend > 0 && (!Number.isFinite(netNew) || netNew <= 0)) {
    return `Unavailable (${formatCurrency(spend)} spend / ${formatInt(netNew)} net-new)`;
  }
  if (!Number.isFinite(spend) || spend <= 0) {
    return 'Unavailable (Meta free-group spend not connected)';
  }
  return 'Unavailable';
}

function attendeeAssocKey(assoc) {
  const id = Number(assoc?.hubspot_contact_id);
  if (Number.isFinite(id)) return `id:${id}`;
  const email = normalizeEmail(assoc?.contact_email);
  if (email) return `email:${email}`;
  const name = [assoc?.contact_firstname, assoc?.contact_lastname]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  if (name) return `name:${name}`;
  return null;
}

function buildNotionTaskProperties(taskName) {
  return {
    'Task name': { title: [{ text: { content: taskName } }] },
    Status: { status: { name: 'Not started' } },
    Priority: { select: { name: 'Medium Priority' } },
    'Effort level': { select: { name: 'Medium Effort' } },
  };
}

function hubspotOfficialRevenue(row) {
  const candidates = [
    row?.annual_revenue_in_dollars__official_,
    // Legacy alias fallback if older cached rows included this name.
    row?.annual_revenue_in_usd_official,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function hubspotPreferredRevenue(row) {
  const official = hubspotOfficialRevenue(row);
  if (Number.isFinite(official)) return official;
  const fallback = Number(row?.annual_revenue_in_dollars);
  if (Number.isFinite(fallback)) return fallback;
  return null;
}

function hubspotSobrietyDateUtc(row) {
  const raw = row?.sobriety_date ?? row?.sobriety_date__official_ ?? null;
  const d = parseMaybeDate(raw);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcYears(date, years) {
  if (!date) return null;
  const out = new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
  if (out.getUTCMonth() !== date.getUTCMonth()) {
    return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth() + 1, 0));
  }
  return out;
}

function isSoberOverOneYearAtLead(row, leadDate) {
  const leadDay = toUtcDayStart(leadDate);
  const sobriety = hubspotSobrietyDateUtc(row);
  if (!leadDay || !sobriety) return false;
  const anniversary = addUtcYears(sobriety, 1);
  return !!anniversary && anniversary.getTime() <= leadDay.getTime();
}

function leadQualityFlags(row) {
  const leadDate = row?._createdAt || row?.createdate;
  const officialRevenue = hubspotOfficialRevenue(row);
  const revenue = hubspotPreferredRevenue(row);
  const hasSobriety = !!hubspotSobrietyDateUtc(row);
  const sober1yAtLead = isSoberOverOneYearAtLead(row, leadDate);
  const greatLead = sober1yAtLead && Number.isFinite(revenue) && revenue >= 1_000_000;
  const qualifiedLead = sober1yAtLead && Number.isFinite(revenue) && revenue >= 250_000 && revenue < 1_000_000;
  const highQualityLead = greatLead || qualifiedLead;
  return {
    officialRevenue,
    revenue,
    hasOfficialRevenue: Number.isFinite(officialRevenue),
    hasRevenue: Number.isFinite(revenue),
    hasSobriety,
    sober1yAtLead,
    greatLead,
    qualifiedLead,
    highQualityLead,
  };
}

function summarizeLeadQuality(rows) {
  const annotated = rows.map((row) => ({ row, q: leadQualityFlags(row) }));
  const count = annotated.length;
  const hasOfficialRevenue = annotated.filter((x) => x.q.hasOfficialRevenue).length;
  const hasRevenue = annotated.filter((x) => x.q.hasRevenue).length;
  const hasSobriety = annotated.filter((x) => x.q.hasSobriety).length;
  const qualityCoverageRows = annotated.filter((x) => x.q.hasRevenue && x.q.hasSobriety).length;
  const qualified = annotated.filter((x) => x.q.qualifiedLead).length;
  const great = annotated.filter((x) => x.q.greatLead).length;
  const highQuality = annotated.filter((x) => x.q.highQualityLead).length;
  return {
    count,
    great,
    qualified,
    highQuality,
    hasOfficialRevenue,
    hasRevenue,
    hasSobriety,
    qualityCoverageRows,
    officialRevenueCoverage: ratioOrNull(hasOfficialRevenue, count),
    revenueCoverage: ratioOrNull(hasRevenue, count),
    sobrietyCoverage: ratioOrNull(hasSobriety, count),
    qualityCoverage: ratioOrNull(qualityCoverageRows, count),
    greatRate: ratioOrNull(great, count),
    qualifiedRate: ratioOrNull(qualified, count),
    highQualityRate: ratioOrNull(highQuality, count),
  };
}

function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

function formatCurrencySignedDelta(delta) {
  if (!Number.isFinite(Number(delta))) return 'N/A';
  const n = Number(delta);
  return `${n >= 0 ? '+' : '-'}${formatCurrency(Math.abs(n))}`;
}

function splitInsightSummary(summary) {
  if (Array.isArray(summary)) {
    return summary.flatMap((item) => splitInsightSummary(item));
  }

  const text = String(summary || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function classifyInsightBullet(sentence) {
  const raw = String(sentence || '').trim();
  if (!raw) return null;

  const patterns = [
    { regex: /^Management call:\s*/i, kind: 'action', label: 'Action' },
    { regex: /^Operationally:\s*/i, kind: 'action', label: 'Action' },
    { regex: /^Supporting signal\b[^:]*:\s*/i, kind: 'evidence', label: 'Evidence' },
    { regex: /^Data quality note:\s*/i, kind: 'note', label: 'Data note' },
    { regex: /^Schedule signal note:\s*/i, kind: 'note', label: 'Data note' },
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(raw)) {
      return {
        kind: pattern.kind,
        label: pattern.label,
        text: raw.replace(pattern.regex, '').trim(),
      };
    }
  }

  return { kind: 'insight', label: '', text: raw };
}

function summaryToInsightBullets(summary) {
  return splitInsightSummary(summary)
    .map(classifyInsightBullet)
    .filter(Boolean);
}

function managerFallbackSummaryBullets(manager) {
  const buckets = [
    ...(summaryToInsightBullets(manager?.summaries?.bigPicture).map((b) => b.text)),
    ...(summaryToInsightBullets(manager?.summaries?.month).map((b) => b.text)),
    ...(summaryToInsightBullets(manager?.summaries?.week).map((b) => b.text)),
  ];
  return buckets
    .map((text) => String(text || '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

function actionCompletionMessage(action, payload) {
  const result = payload || {};
  const isNotionTask = action?.kind === 'create_notion_task';
  if (isNotionTask) return 'Done — task sent to Notion.';

  if (Array.isArray(result?.results)) {
    const okCount = result.results.filter((row) => row?.status === 'success').length;
    const failCount = result.results.filter((row) => row?.status && row.status !== 'success').length;
    if (okCount > 0 || failCount > 0) {
      if (failCount > 0) return `Done — ${okCount} sync step(s) succeeded, ${failCount} had issues.`;
      return `Done — ${okCount} sync step(s) completed.`;
    }
  }

  const numericFields = [
    'count',
    'rows_written',
    'sessions_written',
    'attendee_mappings_written',
    'raw_hubspot_meeting_activities_upserted',
    'hubspot_activity_contact_associations_upserted',
    'raw_hubspot_contacts_upserted',
  ];
  for (const field of numericFields) {
    const value = Number(result?.[field]);
    if (Number.isFinite(value) && value > 0) {
      return `Done — ${Math.round(value)} item(s) updated.`;
    }
  }

  return 'Done — action completed.';
}

const baseCardStyle = {
  background: 'var(--color-card)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: 'var(--glass-shadow)',
};

const DashboardOverview = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [hubspotContacts, setHubspotContacts] = useState([]);
  const [fbAdsRows, setFbAdsRows] = useState([]);
  const [donationRows, setDonationRows] = useState([]);
  const [hubspotActivities, setHubspotActivities] = useState([]);
  const [hubspotActivityAssocs, setHubspotActivityAssocs] = useState([]);
  const [actionState, setActionState] = useState({});
  const [moduleAnalysisState, setModuleAnalysisState] = useState({});
  const [notionModal, setNotionModal] = useState({ open: false, taskName: '' });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    setWarnings([]);

    const start = new Date();
    start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);
    const startDate = start.toISOString().slice(0, 10);
    const contactStart = new Date();
    contactStart.setUTCDate(contactStart.getUTCDate() - HUBSPOT_CONTACT_LOOKBACK_DAYS);
    const contactStartDate = contactStart.toISOString().slice(0, 10);

    const nextWarnings = [];
    const [
      metricsRes,
      hubspotContactsRes,
      fbAdsRes,
      donationsRes,
      hubspotActivitiesRes,
    ] = await Promise.all([
      supabase
        .from('kpi_metrics')
        .select('metric_name,metric_value,metric_date,source_slug,metadata')
        .in('source_slug', SOURCE_KEYS)
        .gte('metric_date', startDate)
        .order('metric_date', { ascending: true }),
      supabase
        .from('raw_hubspot_contacts')
        .select('hubspot_contact_id,createdate,email,firstname,lastname,original_traffic_source,hs_analytics_source,hs_latest_source,hs_analytics_source_data_2,hs_latest_source_data_2,campaign,campaign_source,membership_s,annual_revenue_in_dollars__official_,annual_revenue_in_dollars,sobriety_date')
        .gte('createdate', `${contactStartDate}T00:00:00.000Z`)
        .order('createdate', { ascending: true }),
      supabase
        .from('raw_fb_ads_insights_daily')
        .select('date_day,spend,leads,funnel_key,campaign_name')
        .gte('date_day', startDate)
        .order('date_day', { ascending: true }),
      USE_DUMMY_DONATIONS
        ? Promise.resolve({ data: DUMMY_DONATION_ROWS, error: null, isDummy: true })
        : supabase
          .from('donation_transactions_unified')
          .select('source_system,amount,currency,is_recurring,status,campaign_name,donated_at')
          .gte('donated_at', `${startDate}T00:00:00.000Z`)
          .order('donated_at', { ascending: true }),
      supabase
        .from('raw_hubspot_meeting_activities')
        .select('hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title')
        .in('activity_type', ['call', 'meeting'])
        .or(`hs_timestamp.gte.${startDate},created_at_hubspot.gte.${startDate}`)
        .order('hs_timestamp', { ascending: true }),
    ]);

    if (metricsRes.error) {
      setError(metricsRes.error.message || 'Failed to load dashboard metrics.');
      setLoading(false);
      return;
    }

    if (hubspotContactsRes.error) {
      nextWarnings.push(`HubSpot contacts unavailable for Leads manager: ${hubspotContactsRes.error.message}`);
    }
    if (fbAdsRes.error) {
      nextWarnings.push(`Meta Ads rows unavailable for Leads manager: ${fbAdsRes.error.message}`);
    }
    if (donationsRes.error) {
      nextWarnings.push(`Donations rows unavailable for Donations manager: ${donationsRes.error.message}`);
    } else if (donationsRes.isDummy) {
      nextWarnings.push('Donations manager is currently using dummy data.');
    }
    if (hubspotActivitiesRes.error) {
      nextWarnings.push(`HubSpot call/meeting activities unavailable for Attendance manager: ${hubspotActivitiesRes.error.message}`);
    }

    let assocRows = [];
    const activityRows = hubspotActivitiesRes.data || [];
    if (!hubspotActivitiesRes.error && activityRows.length > 0) {
      const recentActivityIds = Array.from(new Set(
        activityRows.map((row) => Number(row?.hubspot_activity_id)).filter((id) => Number.isFinite(id))
      ));
      const assocChunks = [];
      for (let i = 0; i < recentActivityIds.length; i += 200) {
        const chunk = recentActivityIds.slice(i, i + 200);
        const assocRes = await supabase
          .from('hubspot_activity_contact_associations')
          .select('hubspot_activity_id,activity_type,hubspot_contact_id,contact_email,contact_firstname,contact_lastname')
          .in('hubspot_activity_id', chunk)
          .in('activity_type', ['call', 'meeting']);
        if (assocRes.error) {
          nextWarnings.push(`HubSpot call/meeting associations unavailable for Attendance manager: ${assocRes.error.message}`);
          assocChunks.length = 0;
          break;
        }
        assocChunks.push(...(assocRes.data || []));
      }
      assocRows = assocChunks;
    }

    setMetrics(metricsRes.data || []);
    setHubspotContacts(hubspotContactsRes.data || []);
    setFbAdsRows(fbAdsRes.data || []);
    setDonationRows(donationsRes.data || []);
    setHubspotActivities(activityRows);
    setHubspotActivityAssocs(assocRows);
    setWarnings(nextWarnings);
    setLoading(false);
  }

  const dashboard = useMemo(() => {
    const byMetric = new Map();
    const bySource = new Map();
    let latestDate = null;

    metrics.forEach((row) => {
      if (!byMetric.has(row.metric_name)) byMetric.set(row.metric_name, []);
      byMetric.get(row.metric_name).push(row);

      if (!bySource.has(row.source_slug)) bySource.set(row.source_slug, []);
      bySource.get(row.source_slug).push(row);

      if (!latestDate || row.metric_date > latestDate) latestDate = row.metric_date;
    });

    const endDate = latestDate ? dateToUtc(latestDate) : new Date();

    function metricRows(metricName) {
      return (byMetric.get(metricName) || []).slice().sort((a, b) => a.metric_date.localeCompare(b.metric_date));
    }

    function inRange(dateStr, start, end) {
      const d = dateToUtc(dateStr);
      return d >= start && d <= end;
    }

    function sumWindow(metricName, days) {
      const rows = metricRows(metricName);
      const start = shiftUtcDays(endDate, -(days - 1));
      return rows.filter((r) => inRange(r.metric_date, start, endDate)).reduce((acc, r) => acc + Number(r.metric_value || 0), 0);
    }

    function avgWindow(metricName, days) {
      const rows = metricRows(metricName);
      const start = shiftUtcDays(endDate, -(days - 1));
      const bucket = rows.filter((r) => inRange(r.metric_date, start, endDate));
      if (bucket.length === 0) return null;
      return bucket.reduce((acc, r) => acc + Number(r.metric_value || 0), 0) / bucket.length;
    }

    function compareWindow(metricName, days, mode = 'sum') {
      const rows = metricRows(metricName);
      const curStart = shiftUtcDays(endDate, -(days - 1));
      const prevEnd = shiftUtcDays(endDate, -days);
      const prevStart = shiftUtcDays(endDate, -(days * 2 - 1));

      const curRows = rows.filter((r) => inRange(r.metric_date, curStart, endDate));
      const prevRows = rows.filter((r) => inRange(r.metric_date, prevStart, prevEnd));
      if (curRows.length === 0 || prevRows.length === 0) return null;

      const curValue = mode === 'avg'
        ? curRows.reduce((acc, r) => acc + Number(r.metric_value || 0), 0) / curRows.length
        : curRows.reduce((acc, r) => acc + Number(r.metric_value || 0), 0);
      const prevValue = mode === 'avg'
        ? prevRows.reduce((acc, r) => acc + Number(r.metric_value || 0), 0) / prevRows.length
        : prevRows.reduce((acc, r) => acc + Number(r.metric_value || 0), 0);

      if (prevValue === 0) return null;
      return (curValue - prevValue) / prevValue;
    }

    const zoomRows = metricRows('Zoom Meeting Attendees');
    const recentZoom = zoomRows.slice(-12);
    const repeatMap = new Map();
    recentZoom.forEach((row) => {
      const attendees = Array.isArray(row.metadata?.attendees) ? row.metadata.attendees : [];
      attendees.forEach((name) => {
        const key = String(name || '').toLowerCase().trim();
        if (!key) return;
        repeatMap.set(key, (repeatMap.get(key) || 0) + 1);
      });
    });
    const uniquePeople = repeatMap.size;
    const repeaters = Array.from(repeatMap.values()).filter((count) => count > 1).length;
    const repeatRate = uniquePeople > 0 ? repeaters / uniquePeople : null;
    const avgAttendance = recentZoom.length > 0
      ? recentZoom.reduce((acc, r) => acc + Number(r.metric_value || 0), 0) / recentZoom.length
      : null;

    const sessions7d = sumWindow('GA Sessions', 7);
    const sessionsTrend = compareWindow('GA Sessions', 7, 'sum');
    const sessions30d = sumWindow('GA Sessions', 30);
    const sessions30dTrend = compareWindow('GA Sessions', 30, 'sum');
    const users7d = sumWindow('GA Users', 7);
    const users30d = sumWindow('GA Users', 30);
    const engagement7d = avgWindow('GA Engagement Rate', 7);
    const engagement30d = avgWindow('GA Engagement Rate', 30);

    const clicks7d = sumWindow('GSC Clicks', 7);
    const clicksTrend = compareWindow('GSC Clicks', 7, 'sum');
    const clicks30d = sumWindow('GSC Clicks', 30);
    const clicks30dTrend = compareWindow('GSC Clicks', 30, 'sum');
    const impressions7d = sumWindow('GSC Impressions', 7);
    const impressions30d = sumWindow('GSC Impressions', 30);
    const ctr7d = avgWindow('GSC CTR', 7);
    const ctr30d = avgWindow('GSC CTR', 30);
    const position7d = avgWindow('GSC Avg Position', 7);
    const position30d = avgWindow('GSC Avg Position', 30);

    const trendMap = new Map();
    metricRows('GA Sessions').forEach((r) => {
      if (!trendMap.has(r.metric_date)) trendMap.set(r.metric_date, { date: r.metric_date, sessions: 0, clicks: 0 });
      trendMap.get(r.metric_date).sessions = Number(r.metric_value || 0);
    });
    metricRows('GSC Clicks').forEach((r) => {
      if (!trendMap.has(r.metric_date)) trendMap.set(r.metric_date, { date: r.metric_date, sessions: 0, clicks: 0 });
      trendMap.get(r.metric_date).clicks = Number(r.metric_value || 0);
    });
    const trendData = Array.from(trendMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map((d) => ({ ...d, label: d.date.slice(5) }));

    const priorityRows = [
      {
        area: 'Traffic',
        metric: 'GA Sessions (7d)',
        value: formatInt(sessions7d),
        target: 'Keep week-over-week trend >= 0%',
        status: calcTrendStatus(sessionsTrend, { critical: -0.2, watch: 0 }),
        note: `WoW ${pctDelta(sessionsTrend)}`,
      },
      {
        area: 'Organic',
        metric: 'Search Clicks (7d)',
        value: formatInt(clicks7d),
        target: 'Keep week-over-week trend >= 0%',
        status: calcTrendStatus(clicksTrend, { critical: -0.2, watch: 0 }),
        note: `WoW ${pctDelta(clicksTrend)}`,
      },
      {
        area: 'Engagement',
        metric: 'GA Engagement Rate (7d avg)',
        value: pct(engagement7d),
        target: '>= 60%',
        status: calcStatus(engagement7d, { critical: 0.45, watch: 0.6 }),
        note: `Users 7d ${formatInt(users7d)}`,
      },
      {
        area: 'Community',
        metric: 'Zoom Repeat Rate (last 12 meetings)',
        value: pct(repeatRate),
        target: '>= 55%',
        status: calcStatus(repeatRate, { critical: 0.35, watch: 0.55 }),
        note: `Avg attendance ${avgAttendance ? avgAttendance.toFixed(1) : 'N/A'}`,
      },
    ];

    const sourceCoverage = SOURCE_KEYS.map((source) => {
      const rows = bySource.get(source) || [];
      const sourceLatest = rows.reduce((max, r) => (!max || r.metric_date > max ? r.metric_date : max), null);
      return { source, count: rows.length, latest: sourceLatest };
    });

    return {
      latestDate,
      cards: {
        sessions7d,
        sessions30d,
        clicks7d,
        clicks30d,
        engagement7d,
        engagement30d,
        avgAttendance,
        repeatRate,
        ctr7d,
        ctr30d,
        impressions7d,
        impressions30d,
        position7d,
        position30d,
        users7d,
        users30d,
      },
      trends: {
        sessionsTrend,
        sessions30dTrend,
        clicksTrend,
        clicks30dTrend,
      },
      trendData,
      priorityRows,
      sourceCoverage,
      hasGscData: (bySource.get('google_search_console') || []).length > 0,
    };
  }, [metrics]);

  const aiManagers = useMemo(() => {
    const todayUtcDay = toUtcDayStart(new Date());
    const dateCandidates = [];
    if (dashboard.latestDate) {
      const d = toUtcDayStart(dashboard.latestDate);
      if (d) dateCandidates.push(d);
    }

    hubspotContacts.forEach((row) => {
      const d = toUtcDayStart(row?.createdate);
      if (d) dateCandidates.push(d);
    });
    fbAdsRows.forEach((row) => {
      const d = toUtcDayStart(row?.date_day);
      if (d) dateCandidates.push(d);
    });
    hubspotActivities.forEach((row) => {
      const d = hubspotActivityFreshnessDay(row, todayUtcDay);
      if (d) dateCandidates.push(d);
    });

    const referenceDateRaw = dateCandidates.length
      ? new Date(Math.max(...dateCandidates.map((d) => d.getTime())))
      : todayUtcDay;
    const referenceDate = (todayUtcDay && referenceDateRaw && referenceDateRaw > todayUtcDay)
      ? todayUtcDay
      : referenceDateRaw;
    const lastWeekEnd = referenceDate;
    const lastWeekStart = shiftUtcDays(lastWeekEnd, -6);
    const prevWeekEnd = shiftUtcDays(lastWeekStart, -1);
    const prevWeekStart = shiftUtcDays(prevWeekEnd, -6);

    const monthEnd = referenceDate;
    const monthStart = shiftUtcDays(monthEnd, -29);
    const prevMonthEnd = shiftUtcDays(monthStart, -1);
    const prevMonthStart = shiftUtcDays(prevMonthEnd, -29);

    const periodMeta = {
      lastWeekLabel: formatDateRange(lastWeekStart, lastWeekEnd),
      lastMonthLabel: `${formatDateRange(monthStart, monthEnd)} (30d)`,
      asOfLabel: formatDateShort(referenceDate),
    };
    const attendanceWindowEnd = todayUtcDay || referenceDate;
    const attendanceWeekEnd = attendanceWindowEnd;
    const attendanceWeekStart = shiftUtcDays(attendanceWeekEnd, -6);
    const attendancePrevWeekEnd = shiftUtcDays(attendanceWeekStart, -1);
    const attendancePrevWeekStart = shiftUtcDays(attendancePrevWeekEnd, -6);
    const attendanceMonthEnd = attendanceWindowEnd;
    const attendanceMonthStart = shiftUtcDays(attendanceMonthEnd, -29);
    const attendancePrevMonthEnd = shiftUtcDays(attendanceMonthStart, -1);
    const attendancePrevMonthStart = shiftUtcDays(attendancePrevMonthEnd, -29);
    const attendancePeriodMeta = {
      lastWeekLabel: formatDateRange(attendanceWeekStart, attendanceWeekEnd),
      lastMonthLabel: `${formatDateRange(attendanceMonthStart, attendanceMonthEnd)} (30d completed meetings)`,
      asOfLabel: formatDateShort(attendanceWindowEnd),
    };

    const parsedContacts = hubspotContacts
      .map((row) => ({ ...row, _createdAt: toUtcDayStart(row?.createdate) }))
      .filter((row) => row._createdAt);

    const contactStats = (start, end) => {
      const rows = parsedContacts.filter((row) => inUtcDayRange(row._createdAt, start, end));
      const paidSocial = rows.filter(isPaidSocialHubspotContact);
      const paidPhoenix = paidSocial.filter(isPhoenixHubspotContact);
      const paidFree = paidSocial.filter((row) => !isPhoenixHubspotContact(row));
      const allPhoenix = rows.filter(isPhoenixHubspotContact);
      return {
        total: rows.length,
        paidSocial: paidSocial.length,
        paidPhoenix: paidPhoenix.length,
        paidFree: paidFree.length,
        allPhoenix: allPhoenix.length,
        quality: summarizeLeadQuality(rows),
        paidSocialQuality: summarizeLeadQuality(paidSocial),
        paidPhoenixQuality: summarizeLeadQuality(paidPhoenix),
        paidFreeQuality: summarizeLeadQuality(paidFree),
      };
    };

    const parsedAds = fbAdsRows
      .map((row) => {
        const date = toUtcDayStart(row?.date_day);
        const funnelKey = String(row?.funnel_key || '').trim().toLowerCase();
        const text = `${row?.funnel_key || ''} ${row?.campaign_name || ''}`.toLowerCase();
        const isPhoenix = funnelKey === 'phoenix' || (funnelKey === '' && (isPhoenixText(text) || text.includes('forum')));
        const isDonation = funnelKey === 'donation' || (funnelKey === '' && text.includes('donat'));
        const isFreeGroup = funnelKey === 'free' || (!funnelKey && !isPhoenix && !isDonation);
        return {
          ...row,
          _date: date,
          _funnelKey: funnelKey,
          _isPhoenix: isPhoenix,
          _isDonation: isDonation,
          _isFreeGroup: isFreeGroup,
        };
      })
      .filter((row) => row._date);

    const adStats = (start, end) => {
      const rows = parsedAds.filter((row) => inUtcDayRange(row._date, start, end));
      const spend = rows.reduce((acc, row) => acc + safeNum(row.spend), 0);
      const leads = rows.reduce((acc, row) => acc + safeNum(row.leads), 0);
      const freeSpend = sumBy(rows, (row) => row._isFreeGroup, (row) => row.spend);
      const freeLeads = sumBy(rows, (row) => row._isFreeGroup, (row) => row.leads);
      const phoenixSpend = sumBy(rows, (row) => row._isPhoenix, (row) => row.spend);
      const phoenixLeads = sumBy(rows, (row) => row._isPhoenix, (row) => row.leads);
      const donationSpend = sumBy(rows, (row) => row._isDonation, (row) => row.spend);
      const leadGenSpend = freeSpend + phoenixSpend;
      const leadGenLeads = freeLeads + phoenixLeads;
      return {
        spend,
        leads,
        freeSpend,
        freeLeads,
        phoenixSpend,
        phoenixLeads,
        donationSpend,
        leadGenSpend,
        leadGenLeads,
        freeCpl: ratioOrNull(freeSpend, freeLeads),
        phoenixCpl: ratioOrNull(phoenixSpend, phoenixLeads),
        leadGenCpl: ratioOrNull(leadGenSpend, leadGenLeads),
      };
    };

    const activityAssocKey = (activityId, activityType) => `${String(activityType || '').toLowerCase()}:${String(activityId || '')}`;
    const assocByActivityId = new Map();
    hubspotActivityAssocs.forEach((assoc) => {
      const id = Number(assoc?.hubspot_activity_id);
      const activityType = String(assoc?.activity_type || '').toLowerCase();
      if (!Number.isFinite(id)) return;
      const key = activityAssocKey(id, activityType);
      if (!assocByActivityId.has(key)) assocByActivityId.set(key, []);
      assocByActivityId.get(key).push(assoc);
    });

    const parsedCalls = hubspotActivities
      .map((activity) => {
        const id = Number(activity?.hubspot_activity_id);
        const activityType = String(activity?.activity_type || '').toLowerCase();
        const startedAtInstant = parseMaybeDate(activity?.hs_timestamp || activity?.created_at_hubspot);
        const startedAt = toUtcDayStart(startedAtInstant);
        if (!startedAt || !Number.isFinite(id)) return null;
        // Exclude upcoming sessions from attendance metrics; keep window strictly completed meetings.
        if (startedAtInstant && startedAtInstant.getTime() > Date.now()) return null;
        const timing = etGroupTimingFromDate(activity?.hs_timestamp || activity?.created_at_hubspot);
        const assocs = assocByActivityId.get(activityAssocKey(id, activityType)) || [];
        const attendeeKeys = Array.from(new Set(
          assocs.map(attendeeAssocKey).filter(Boolean)
        ));
        const attendeeCount = attendeeKeys.length;
        const title = String(activity?.title || '');
        const lowerTitle = title.toLowerCase();
        const groupType = classifyGroupCall(activity, attendeeCount);
        const isPhoenixForum = lowerTitle.includes('phoenix forum');
        return {
          id,
          startedAt,
          title,
          lowerTitle,
          attendeeKeys,
          attendeeCount,
          groupType,
          minutesFromExpected: Number(timing?.minutesFromExpected ?? Number.POSITIVE_INFINITY),
          isNearScheduled: !!timing?.isNearScheduled,
          isPhoenixForum,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

    const freeGroupEventsAll = parsedCalls.filter((e) => !!e.groupType && Number(e.attendeeCount || 0) >= MIN_GROUP_ATTENDEES);
    const freeGroupByDate = new Map();
    const compareSessionCandidates = (candidate, existing) => {
      if (!!candidate.isNearScheduled !== !!existing.isNearScheduled) {
        return candidate.isNearScheduled ? 1 : -1;
      }
      if (candidate.isNearScheduled && existing.isNearScheduled) {
        const candidateDiff = Number(candidate?.minutesFromExpected || Number.POSITIVE_INFINITY);
        const existingDiff = Number(existing?.minutesFromExpected || Number.POSITIVE_INFINITY);
        if (candidateDiff !== existingDiff) return candidateDiff < existingDiff ? 1 : -1;
      }
      const candidateCount = Number(candidate?.attendeeCount || 0);
      const existingCount = Number(existing?.attendeeCount || 0);
      if (candidateCount !== existingCount) return candidateCount > existingCount ? 1 : -1;
      return 0;
    };
    freeGroupEventsAll.forEach((event) => {
      const dateKey = event.startedAt.toISOString().slice(0, 10);
      const key = `${event.groupType}|${dateKey}`;
      const existing = freeGroupByDate.get(key);
      if (!existing || compareSessionCandidates(event, existing) > 0) {
        freeGroupByDate.set(key, event);
      }
    });
    EXPECTED_ZERO_GROUP_SESSION_KEYS.forEach((key) => {
      const [groupType, dateKey] = key.split('|');
      const startedAt = toUtcDayStart(dateKey);
      if (!startedAt) return;
      freeGroupByDate.set(key, {
        id: `expected-zero-${key}`,
        startedAt,
        title: 'Holiday (no session)',
        lowerTitle: 'holiday',
        attendeeKeys: [],
        attendeeCount: 0,
        groupType,
        minutesFromExpected: 0,
        isNearScheduled: true,
        isPhoenixForum: false,
        isExpectedZero: true,
      });
    });
    const freeGroupEvents = Array.from(freeGroupByDate.values())
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    const phoenixForumCalls = parsedCalls.filter((e) => e.isPhoenixForum);
    const unclassifiedLargeCalls = parsedCalls.filter((e) => !e.groupType && !e.isPhoenixForum && e.attendeeCount >= MIN_GROUP_ATTENDEES).length;

    const firstSeenFreeGroup = new Map();
    freeGroupEvents.forEach((event) => {
      event.attendeeKeys.forEach((key) => {
        if (!firstSeenFreeGroup.has(key)) firstSeenFreeGroup.set(key, event.startedAt);
      });
    });

    const freeGroupAttendanceStats = (start, end) => {
      const events = freeGroupEvents.filter((event) => inUtcDayRange(event.startedAt, start, end));
      const visitCounts = new Map();
      let attendanceParticipations = 0;
      let tuesdaySessions = 0;
      let thursdaySessions = 0;
      events.forEach((event) => {
        if (event.groupType === 'Tuesday') tuesdaySessions += 1;
        if (event.groupType === 'Thursday') thursdaySessions += 1;
        event.attendeeKeys.forEach((key) => {
          attendanceParticipations += 1;
          visitCounts.set(key, (visitCounts.get(key) || 0) + 1);
        });
      });

      let newAttendees = 0;
      firstSeenFreeGroup.forEach((date) => {
        if (inUtcDayRange(date, start, end)) newAttendees += 1;
      });

      const uniqueAttendees = visitCounts.size;
      const repeaters = Array.from(visitCounts.values()).filter((count) => count > 1).length;
      const avgVisits = uniqueAttendees > 0 ? attendanceParticipations / uniqueAttendees : 0;
      const repeatRate = uniqueAttendees > 0 ? repeaters / uniqueAttendees : 0;
      return {
        sessions: events.length,
        tuesdaySessions,
        thursdaySessions,
        attendanceParticipations,
        uniqueAttendees,
        newAttendees,
        repeaters,
        avgVisits,
        repeatRate,
      };
    };

    const phoenixCallStats = (start, end) => {
      const events = phoenixForumCalls.filter((event) => inUtcDayRange(event.startedAt, start, end));
      const unique = new Set();
      let attendanceParticipations = 0;
      events.forEach((event) => {
        event.attendeeKeys.forEach((key) => {
          unique.add(key);
          attendanceParticipations += 1;
        });
      });
      return {
        sessions: events.length,
        uniqueAttendees: unique.size,
        attendanceParticipations,
      };
    };

    const leadsWeek = contactStats(lastWeekStart, lastWeekEnd);
    const leadsPrevWeek = contactStats(prevWeekStart, prevWeekEnd);
    const leadsMonth = contactStats(monthStart, monthEnd);
    const leadsPrevMonth = contactStats(prevMonthStart, prevMonthEnd);
    const adsWeek = adStats(lastWeekStart, lastWeekEnd);
    const adsPrevWeek = adStats(prevWeekStart, prevWeekEnd);
    const adsMonth = adStats(monthStart, monthEnd);
    const adsPrevMonth = adStats(prevMonthStart, prevMonthEnd);

    const attendeesWeek = freeGroupAttendanceStats(attendanceWeekStart, attendanceWeekEnd);
    const attendeesPrevWeek = freeGroupAttendanceStats(attendancePrevWeekStart, attendancePrevWeekEnd);
    const attendeesMonth = freeGroupAttendanceStats(attendanceMonthStart, attendanceMonthEnd);
    const attendeesPrevMonth = freeGroupAttendanceStats(attendancePrevMonthStart, attendancePrevMonthEnd);
    const phoenixCallsMonth = phoenixCallStats(attendanceMonthStart, attendanceMonthEnd);
    const attendanceAdsWeek = adStats(attendanceWeekStart, attendanceWeekEnd);
    const attendanceAdsPrevWeek = adStats(attendancePrevWeekStart, attendancePrevWeekEnd);
    const attendanceAdsMonth = adStats(attendanceMonthStart, attendanceMonthEnd);
    const attendanceAdsPrevMonth = adStats(attendancePrevMonthStart, attendancePrevMonthEnd);

    const weekFreeCostPerNewAttendee = ratioOrNull(attendanceAdsWeek.freeSpend, attendeesWeek.newAttendees);
    const prevWeekFreeCostPerNewAttendee = ratioOrNull(attendanceAdsPrevWeek.freeSpend, attendeesPrevWeek.newAttendees);
    const monthFreeCostPerNewAttendee = ratioOrNull(attendanceAdsMonth.freeSpend, attendeesMonth.newAttendees);
    const prevMonthFreeCostPerNewAttendee = ratioOrNull(attendanceAdsPrevMonth.freeSpend, attendeesPrevMonth.newAttendees);

    const newAttendeeWeekDelta = comparePeriod(attendeesWeek.newAttendees, attendeesPrevWeek.newAttendees);
    const avgVisitsWeekDelta = comparePeriod(attendeesWeek.avgVisits, attendeesPrevWeek.avgVisits);
    const cpnaWeekDelta = comparePeriod(weekFreeCostPerNewAttendee, prevWeekFreeCostPerNewAttendee);
    const newAttendeeMonthDelta = comparePeriod(attendeesMonth.newAttendees, attendeesPrevMonth.newAttendees);
    const avgVisitsMonthDelta = comparePeriod(attendeesMonth.avgVisits, attendeesPrevMonth.avgVisits);
    const cpnaMonthDelta = comparePeriod(monthFreeCostPerNewAttendee, prevMonthFreeCostPerNewAttendee);

    const phoenixPaidShareMonth = ratioOrNull(leadsMonth.paidPhoenix, leadsMonth.paidSocial);

    const seoWeekSessions = dashboard.cards.sessions7d;
    const seoWeekClicks = dashboard.cards.clicks7d;
    const seoMonthSessions = dashboard.cards.sessions30d;
    const seoMonthClicks = dashboard.cards.clicks30d;

    const weekPaidQuality = leadsWeek.paidSocialQuality;
    const prevWeekPaidQuality = leadsPrevWeek.paidSocialQuality;
    const monthPaidQuality = leadsMonth.paidSocialQuality;
    const prevMonthPaidQuality = leadsPrevMonth.paidSocialQuality;

    const cpqlWeek = ratioOrNull(adsWeek.leadGenSpend, weekPaidQuality.qualified);
    const cpqlPrevWeek = ratioOrNull(adsPrevWeek.leadGenSpend, prevWeekPaidQuality.qualified);
    const cpqlMonth = ratioOrNull(adsMonth.leadGenSpend, monthPaidQuality.qualified);
    const cpqlPrevMonth = ratioOrNull(adsPrevMonth.leadGenSpend, prevMonthPaidQuality.qualified);

    const cpglWeek = ratioOrNull(adsWeek.leadGenSpend, weekPaidQuality.great);
    const cpglPrevWeek = ratioOrNull(adsPrevWeek.leadGenSpend, prevWeekPaidQuality.great);
    const cpglMonth = ratioOrNull(adsMonth.leadGenSpend, monthPaidQuality.great);
    const cpglPrevMonth = ratioOrNull(adsPrevMonth.leadGenSpend, prevMonthPaidQuality.great);

    const paidHighQualityWeekDelta = comparePeriod(weekPaidQuality.highQuality, prevWeekPaidQuality.highQuality);
    const paidHighQualityMonthDelta = comparePeriod(monthPaidQuality.highQuality, prevMonthPaidQuality.highQuality);
    const paidGreatWeekDelta = comparePeriod(weekPaidQuality.great, prevWeekPaidQuality.great);
    const paidGreatMonthDelta = comparePeriod(monthPaidQuality.great, prevMonthPaidQuality.great);
    const paidQualityRateWeekDelta = comparePeriod(weekPaidQuality.highQualityRate, prevWeekPaidQuality.highQualityRate);
    const paidQualityRateMonthDelta = comparePeriod(monthPaidQuality.highQualityRate, prevMonthPaidQuality.highQualityRate);
    const cpqlWeekDelta = comparePeriod(cpqlWeek, cpqlPrevWeek);
    const cpqlMonthDelta = comparePeriod(cpqlMonth, cpqlPrevMonth);
    const cpglWeekDelta = comparePeriod(cpglWeek, cpglPrevWeek);
    const cpglMonthDelta = comparePeriod(cpglMonth, cpglPrevMonth);

    function leadManagerPeriodNarrative({ label, currentLeads, previousLeads, currentAds, previousAds, cpql, cpqlDelta, cpgl, cpglDelta, greatDelta, highQualityDelta, qualityRateDelta }) {
      const q = currentLeads.paidSocialQuality;
      const prevQ = previousLeads.paidSocialQuality;
      const spendDeltaAbs = safeNum(currentAds.leadGenSpend) - safeNum(previousAds.leadGenSpend);
      const spendDelta = comparePeriod(currentAds.leadGenSpend, previousAds.leadGenSpend);
      const paidVolumeDeltaAbs = safeNum(currentLeads.paidSocial) - safeNum(previousLeads.paidSocial);
      const greatDeltaAbs = safeNum(q.great) - safeNum(prevQ.great);
      const highQualityDeltaAbs = safeNum(q.highQuality) - safeNum(prevQ.highQuality);

      const leadVolumeSimilarityThreshold = Math.max(2, Math.round(Math.max(1, previousLeads.paidSocial) * 0.1));
      const volumeRoughlyFlat = Math.abs(paidVolumeDeltaAbs) <= leadVolumeSimilarityThreshold;
      const spendUpMaterially = spendDeltaAbs >= 250;
      const spendDownMaterially = spendDeltaAbs <= -250;
      const qualityCoverageLow = (q.qualityCoverage || 0) < 0.7;
      const qualityCoverageWatch = (q.qualityCoverage || 0) >= 0.7 && (q.qualityCoverage || 0) < 0.9;

      let diagnosis = '';
      let recommendation = '';

      if (spendUpMaterially && volumeRoughlyFlat && highQualityDeltaAbs <= 0) {
        diagnosis = `We spent ${formatCurrencySignedDelta(spendDeltaAbs)} on lead-gen campaigns for roughly the same paid-social lead volume, but high-quality output ($250k+ and >1 year sober) did not improve. That pattern usually signals creative fatigue, audience saturation, or weaker qualification signal quality.`;
        recommendation = 'Management call: refresh creative + qualification hooks on the highest-spend ad sets before scaling budget.';
      } else if (spendUpMaterially && greatDeltaAbs < 0) {
        diagnosis = `Lead-gen spend increased ${changeLabel(spendDelta)} while great-lead output moved ${changeLabel(greatDelta)}. This is a quality regression, not just a volume wobble.`;
        recommendation = 'Management call: reallocate spend toward campaigns/angles producing great leads and cap budgets on broad-volume ad sets.';
      } else if (spendDownMaterially && highQualityDeltaAbs >= 0) {
        diagnosis = `Lead-gen spend is lower (${formatCurrencySignedDelta(spendDeltaAbs)}) while high-quality output held or improved. That suggests targeting/creative efficiency is improving and can likely be scaled carefully.`;
        recommendation = 'Management call: preserve the winning segments and increase budget only where great/qualified lead share stays strong.';
      } else if (paidVolumeDeltaAbs > leadVolumeSimilarityThreshold && highQualityDeltaAbs <= 0) {
        diagnosis = `Top-of-funnel volume increased, but qualified/great output did not rise with it. Volume is growing faster than fit, which usually means the targeting or messaging is broadening beyond the ICP.`;
        recommendation = 'Management call: tighten ad copy and landing-page qualification around revenue + sobriety + founder identity.';
      } else if (greatDeltaAbs > 0 && ((cpqlDelta !== null && cpqlDelta < 0) || (cpglDelta !== null && cpglDelta < 0))) {
        diagnosis = 'Quality and efficiency improved together: great leads increased while cost per qualified/great lead improved. This is the pattern worth scaling.';
        recommendation = 'Management call: scale the best-performing campaigns incrementally and document the winning creative/message combinations.';
      } else {
        diagnosis = 'This period is mixed: lead volume, spend, and quality moved in different directions, so the priority is to protect great-lead output before chasing more volume.';
        recommendation = 'Management call: review campaign-level quality mix (great vs qualified vs low-fit) before making spend changes.';
      }

      const qualityCoverageNote = qualityCoverageLow
        ? `Data quality note: only ${pct(q.qualityCoverage)} of paid-social leads have both revenue and sobriety data, so qualified/great counts may be understated.`
        : qualityCoverageWatch
          ? `Data quality note: ${pct(q.qualityCoverage)} of paid-social leads have both revenue and sobriety data; keep improving form/CRM completion to trust CPQL trends.`
          : '';

      const phoenixShare = ratioOrNull(currentLeads.paidPhoenix, currentLeads.paidSocial);
      const phoenixGreatShare = ratioOrNull(currentLeads.paidPhoenixQuality.great, q.great);
      const mixNote = q.great > 0 && Number.isFinite(phoenixGreatShare)
        ? `Phoenix-related paid leads were ${pct(phoenixShare)} of paid volume and generated ${pct(phoenixGreatShare)} of great leads this period.`
        : Number.isFinite(phoenixShare)
          ? `Phoenix-related paid leads were ${pct(phoenixShare)} of paid-social volume this period.`
          : '';

      const hasCpql = Number.isFinite(cpql);
      const hasCpgl = Number.isFinite(cpgl);
      const hasMetaLeadGenCpl = Number.isFinite(currentAds.leadGenCpl);
      return `${diagnosis} ${recommendation} Supporting signal (${label}): paid social generated ${formatInt(q.great)} great ${pluralize(q.great, 'lead')} (${changeLabel(greatDelta)} vs prior period) and ${formatInt(q.highQuality)} high-quality ${pluralize(q.highQuality, 'lead')} total (${changeLabel(highQualityDelta)}). Meta reported lead-gen CPL was ${hasMetaLeadGenCpl ? formatCurrency(currentAds.leadGenCpl) : 'not available'}${hasMetaLeadGenCpl ? ` across ${formatInt(currentAds.leadGenLeads)} ad leads` : ''}. CPQL was ${hasCpql ? formatCurrency(cpql) : 'not available'}${hasCpql ? ` (${changeLabel(cpqlDelta, { positiveIsGood: false })})` : ''}${hasCpgl ? ` and CPGL was ${formatCurrency(cpgl)} (${changeLabel(cpglDelta, { positiveIsGood: false })})` : ''}. Paid-social quality rate was ${pct(q.highQualityRate)} (${changeLabel(qualityRateDelta)}). ${mixNote}${qualityCoverageNote ? ` ${qualityCoverageNote}` : ''}`;
    }

    const leadsWeekSummary = leadManagerPeriodNarrative({
      label: `the last 7 days (${periodMeta.lastWeekLabel})`,
      currentLeads: leadsWeek,
      previousLeads: leadsPrevWeek,
      currentAds: adsWeek,
      previousAds: adsPrevWeek,
      cpql: cpqlWeek,
      cpqlDelta: cpqlWeekDelta,
      cpgl: cpglWeek,
      cpglDelta: cpglWeekDelta,
      greatDelta: paidGreatWeekDelta,
      highQualityDelta: paidHighQualityWeekDelta,
      qualityRateDelta: paidQualityRateWeekDelta,
    });

    const leadsMonthSummary = leadManagerPeriodNarrative({
      label: `the last 30 days (${periodMeta.lastMonthLabel})`,
      currentLeads: leadsMonth,
      previousLeads: leadsPrevMonth,
      currentAds: adsMonth,
      previousAds: adsPrevMonth,
      cpql: cpqlMonth,
      cpqlDelta: cpqlMonthDelta,
      cpgl: cpglMonth,
      cpglDelta: cpglMonthDelta,
      greatDelta: paidGreatMonthDelta,
      highQualityDelta: paidHighQualityMonthDelta,
      qualityRateDelta: paidQualityRateMonthDelta,
    });

    const monthPhoenixGreatShare = ratioOrNull(leadsMonth.paidPhoenixQuality.great, monthPaidQuality.great);
    const monthFreeGreatShare = ratioOrNull(leadsMonth.paidFreeQuality.great, monthPaidQuality.great);
    const monthCpqlBetterThanCpgl = Number.isFinite(cpqlMonth) && Number.isFinite(cpglMonth) && cpglMonth > cpqlMonth;
    const leadsBigPictureSummary = [
      'This lead report weights quality first, so volume gains do not mask deterioration in fit.',
      `Over the last 30 days, paid-social produced ${formatInt(monthPaidQuality.great)} great ${pluralize(monthPaidQuality.great, 'lead')} and ${formatInt(monthPaidQuality.qualified)} qualified ${pluralize(monthPaidQuality.qualified, 'lead')}; CPQL is ${Number.isFinite(cpqlMonth) ? formatCurrency(cpqlMonth) : 'N/A'} and CPGL is ${Number.isFinite(cpglMonth) ? formatCurrency(cpglMonth) : 'N/A'}.`,
      Number.isFinite(monthPhoenixGreatShare)
        ? `Phoenix-related campaigns are ${pct(phoenixPaidShareMonth)} of paid-social lead volume and ${pct(monthPhoenixGreatShare)} of great leads${Number.isFinite(monthFreeGreatShare) ? ` (free/non-Phoenix contributes ${pct(monthFreeGreatShare)} of great leads)` : ''}, which should guide budget allocation.`
        : `Phoenix-related campaigns are ${pct(phoenixPaidShareMonth)} of paid-social lead volume; great-lead counts are too low this month to infer reliable mix advantage.`,
      monthCpqlBetterThanCpgl
        ? 'Operationally: scale what is producing great leads, while using CPQL as the faster day-to-day guardrail because great-lead counts are lower and noisier.'
        : 'Operationally: monitor both CPQL and CPGL together; CPQL moves faster, but great-lead output is the quality check that prevents budget drift.',
    ].join(' ');

    const repeatRateWeekDelta = comparePeriod(attendeesWeek.repeatRate, attendeesPrevWeek.repeatRate);
    const repeatRateMonthDelta = comparePeriod(attendeesMonth.repeatRate, attendeesPrevMonth.repeatRate);

    function attendeesManagerPeriodNarrative({ label, current, previous, currentAds, previousAds, cpna, cpnaDelta, newDelta, avgVisitsDelta, repeatDelta }) {
      const newDeltaAbs = safeNum(current.newAttendees) - safeNum(previous.newAttendees);
      const spendDeltaAbs = safeNum(currentAds.freeSpend) - safeNum(previousAds.freeSpend);
      const cpnaWorsening = cpnaDelta !== null && cpnaDelta > 0.15;
      const cpnaImproving = cpnaDelta !== null && cpnaDelta < -0.1;
      const retentionSoftening = avgVisitsDelta !== null && avgVisitsDelta < -0.08;
      const retentionImproving = avgVisitsDelta !== null && avgVisitsDelta > 0.08;
      const scheduleGap = current.tuesdaySessions === 0 || current.thursdaySessions === 0;

      let diagnosis = '';
      let recommendation = '';

      if (cpnaWorsening && newDeltaAbs <= 0) {
        diagnosis = `Acquisition efficiency is weakening: free-group spend moved ${formatCurrencySignedDelta(spendDeltaAbs)} while net-new attendees were ${changeLabel(newDelta)}. Paying more for the same (or fewer) new people usually points to ad fatigue, weaker audience fit, or landing-page/message slippage.`;
        recommendation = 'Management call: refresh free-group creatives and tighten audience targeting before increasing spend.';
      } else if (newDeltaAbs > 0 && retentionSoftening) {
        diagnosis = 'Top-of-funnel pull improved, but repeat behavior softened. More people are coming in, yet they are not sticking at the same rate, which can dilute downstream Phoenix Forum pipeline quality.';
        recommendation = 'Management call: strengthen first-session follow-up and session-to-session invites so new attendees return quickly.';
      } else if (newDeltaAbs < 0 && retentionImproving) {
        diagnosis = 'Acquisition volume dipped, but attendee stickiness improved. This often means session quality or audience fit improved even while top-of-funnel reach softened.';
        recommendation = 'Management call: protect the current session format and focus on restoring acquisition volume without broadening targeting too far.';
      } else if (newDeltaAbs > 0 && retentionImproving && (cpnaDelta === null || cpnaImproving)) {
        diagnosis = 'This is a healthy pattern: new-attendee growth and repeat behavior improved together while acquisition cost held or improved.';
        recommendation = 'Management call: maintain the current follow-up cadence and scale acquisition carefully while monitoring classification/data quality.';
      } else {
        diagnosis = 'The free-group funnel is mixed right now: acquisition and retention signals are not moving in the same direction, so the risk is optimizing one while degrading the other.';
        recommendation = 'Management call: review acquisition efficiency and repeat-visit trends together before adjusting ad budget or session format.';
      }

      const scheduleNote = scheduleGap
        ? `Schedule signal note: one of the expected Tue/Thu sessions is missing in this reporting window, which can materially skew comparisons (sync delay or call-title classification issue).`
        : '';
      const avgVisitsText = formatAttendanceAvgVisits(current.avgVisits, current.uniqueAttendees);
      const cpnaText = formatAttendanceCpna(cpna, currentAds.freeSpend, current.newAttendees);
      const cpnaDeltaText = Number.isFinite(cpna) ? ` (${changeLabel(cpnaDelta, { positiveIsGood: false })})` : '';
      const cpnaFallback = !Number.isFinite(cpna)
        ? ` Returning attendee rate is ${pct(current.repeatRate)} (${formatInt(current.repeaters)} repeaters of ${formatInt(current.uniqueAttendees)} unique attendees).`
        : '';

      return `${diagnosis} ${recommendation} Supporting signal (${label}): free groups recorded ${formatInt(current.newAttendees)} net-new ${pluralize(current.newAttendees, 'attendee')} (${changeLabel(newDelta)}), ${formatInt(current.attendanceParticipations)} total attendances, ${avgVisitsText} average visits per attendee (${changeLabel(avgVisitsDelta)}), and repeat participation ${pct(current.repeatRate)} (${changeLabel(repeatDelta)}). Estimated Meta cost per new attendee was ${cpnaText}${cpnaDeltaText}.${cpnaFallback}${scheduleNote ? ` ${scheduleNote}` : ''}`;
    }

    const attendeesWeekSummary = attendeesManagerPeriodNarrative({
      label: `the last 7 days (${attendancePeriodMeta.lastWeekLabel})`,
      current: attendeesWeek,
      previous: attendeesPrevWeek,
      currentAds: attendanceAdsWeek,
      previousAds: attendanceAdsPrevWeek,
      cpna: weekFreeCostPerNewAttendee,
      cpnaDelta: cpnaWeekDelta,
      newDelta: newAttendeeWeekDelta,
      avgVisitsDelta: avgVisitsWeekDelta,
      repeatDelta: repeatRateWeekDelta,
    });

    const attendeesMonthSummary = attendeesManagerPeriodNarrative({
      label: `the last 30 days (${attendancePeriodMeta.lastMonthLabel})`,
      current: attendeesMonth,
      previous: attendeesPrevMonth,
      currentAds: attendanceAdsMonth,
      previousAds: attendanceAdsPrevMonth,
      cpna: monthFreeCostPerNewAttendee,
      cpnaDelta: cpnaMonthDelta,
      newDelta: newAttendeeMonthDelta,
      avgVisitsDelta: avgVisitsMonthDelta,
      repeatDelta: repeatRateMonthDelta,
    });
    const attendeesMonthCostOrFallback = Number.isFinite(monthFreeCostPerNewAttendee)
      ? `estimated Meta cost per new attendee at ${formatCurrency(monthFreeCostPerNewAttendee)}`
      : `returning attendee rate at ${pct(attendeesMonth.repeatRate)} (${formatInt(attendeesMonth.repeaters)} repeaters of ${formatInt(attendeesMonth.uniqueAttendees)} unique attendees)`;

    const attendeesBigPictureSummary = [
      'Attendance reporting here is driven by HubSpot call/meeting attendance (not the legacy Zoom metric), which keeps the manager aligned with the current attendance pipeline.',
      `Over the last 30 days, completed free-group meetings generated ${formatInt(attendeesMonth.newAttendees)} net-new attendees, ${formatInt(attendeesMonth.attendanceParticipations)} total attendances, and ${formatAttendanceAvgVisits(attendeesMonth.avgVisits, attendeesMonth.uniqueAttendees)} average visits per attendee with ${attendeesMonthCostOrFallback}.`,
      `Raw calculation inputs (30d): net-new numerator ${formatInt(attendeesMonth.newAttendees)} first-seen attendees, total attendance numerator ${formatInt(attendeesMonth.attendanceParticipations)} attendee participations across ${formatInt(attendeesMonth.sessions)} completed sessions, avg visits numerator/denominator ${formatInt(attendeesMonth.attendanceParticipations)}/${formatInt(attendeesMonth.uniqueAttendees)}, Meta CPNA numerator/denominator ${formatCurrency(attendanceAdsMonth.freeSpend)}/${formatInt(attendeesMonth.newAttendees)}.`,
      `${phoenixCallsMonth.sessions > 0 ? `Phoenix Forum-tagged calls in the same period: ${formatInt(phoenixCallsMonth.sessions)} sessions and ${formatInt(phoenixCallsMonth.attendanceParticipations)} attendances.` : 'Phoenix Forum-tagged call titles were not detected in the last 30 days from HubSpot call/meeting activity.'}`,
      unclassifiedLargeCalls > 0
        ? `${formatInt(unclassifiedLargeCalls)} high-attendance calls are still unclassified, which can understate free-group counts until titles are standardized.`
        : 'Classification coverage looks clean for high-attendance calls in the current window.',
    ].join(' ');

    function seoManagerPeriodNarrative({ label, sessions, clicks, sessionsDelta, clicksDelta, ctr, position, impressions, engagement }) {
      const clicksDown = clicksDelta !== null && clicksDelta < -0.08;
      const clicksUp = clicksDelta !== null && clicksDelta > 0.08;
      const sessionsDown = sessionsDelta !== null && sessionsDelta < -0.08;
      const sessionsUp = sessionsDelta !== null && sessionsDelta > 0.08;
      const ctrLow = Number.isFinite(ctr) && ctr < 0.02;
      const ctrStrong = Number.isFinite(ctr) && ctr >= 0.035;
      const positionWeak = Number.isFinite(position) && position > 18;
      const positionStrong = Number.isFinite(position) && position <= 10;
      const impressionScale = Number.isFinite(impressions) && impressions > 0 ? ` on ${formatInt(impressions)} impressions` : '';

      let diagnosis = '';
      let recommendation = '';

      if (clicksDown && !sessionsDown) {
        diagnosis = 'Search demand/visibility softened, but overall sessions held up, which usually means non-organic channels are masking SEO softness.';
        recommendation = 'Management call: inspect query-level declines in GSC before this becomes a lead-quality problem upstream.';
      } else if (clicksUp && !sessionsUp) {
        diagnosis = 'Organic search is improving, but total sessions are not keeping pace. That usually points to channel mix offsetting the gain or landing-page/on-site friction limiting the impact.';
        recommendation = 'Management call: review top organic landing pages for conversion friction and match content intent to Phoenix Forum pathways.';
      } else if (clicksDown && sessionsDown) {
        diagnosis = 'Both organic clicks and sessions are declining, which is a broad discovery softness signal rather than a single-channel anomaly.';
        recommendation = 'Management call: prioritize pages/queries with the largest click losses and refresh titles, descriptions, and content depth first.';
      } else if (clicksUp && sessionsUp && (ctrStrong || positionStrong)) {
        diagnosis = 'Discovery momentum looks healthy: traffic and organic clicks are rising together, with search quality metrics in a supportive range.';
        recommendation = 'Management call: double down on topics and pages already generating qualified discovery and strengthen CTAs into Phoenix Forum.';
      } else if (ctrLow && !positionWeak) {
        diagnosis = 'Visibility is present, but click-through is weak. This is more of a snippet/messaging issue than a ranking issue.';
        recommendation = 'Management call: rewrite titles/meta descriptions on high-impression pages to improve intent match and click quality.';
      } else {
        diagnosis = 'SEO signals are mixed, so the key is to watch discovery growth and on-site engagement together instead of optimizing one in isolation.';
        recommendation = 'Management call: review GSC and landing-page performance together before shipping content or metadata changes.';
      }

      return `${diagnosis} ${recommendation} Supporting signal (${label}): ${formatInt(sessions)} sessions and ${formatInt(clicks)} organic clicks${impressionScale}; sessions ${changeLabel(sessionsDelta)} and clicks ${changeLabel(clicksDelta)} vs prior period, with CTR ${pct(ctr)}, average position ${Number.isFinite(position) ? position.toFixed(1) : 'N/A'}, and engagement rate ${pct(engagement)}.`;
    }

    const seoWeekSummary = seoManagerPeriodNarrative({
      label: `the last 7 days (${periodMeta.lastWeekLabel})`,
      sessions: seoWeekSessions,
      clicks: seoWeekClicks,
      sessionsDelta: dashboard.trends.sessionsTrend,
      clicksDelta: dashboard.trends.clicksTrend,
      ctr: dashboard.cards.ctr7d,
      position: dashboard.cards.position7d,
      impressions: dashboard.cards.impressions7d,
      engagement: dashboard.cards.engagement7d,
    });

    const seoMonthSummary = seoManagerPeriodNarrative({
      label: `the last 30 days (${periodMeta.lastMonthLabel})`,
      sessions: seoMonthSessions,
      clicks: seoMonthClicks,
      sessionsDelta: dashboard.trends.sessions30dTrend,
      clicksDelta: dashboard.trends.clicks30dTrend,
      ctr: dashboard.cards.ctr30d,
      position: dashboard.cards.position30d,
      impressions: dashboard.cards.impressions30d,
      engagement: dashboard.cards.engagement30d,
    });

    const seoBigPictureSummary = [
      'SEO is the compounding, lower-cost discovery channel for the nonprofit, but the manager tracks it as a conversion-path system, not just a traffic counter.',
      `The current 30-day picture is ${changeLabel(dashboard.trends.clicks30dTrend)} in organic clicks and ${changeLabel(dashboard.trends.sessions30dTrend)} in sessions, with CTR ${pct(dashboard.cards.ctr30d)} and average position ${Number.isFinite(dashboard.cards.position30d) ? dashboard.cards.position30d.toFixed(1) : 'N/A'}.`,
      'The strongest SEO wins are the ones that route qualified visitors into Phoenix Forum while preparing a clean, compliant path for future donation intent.',
      'If clicks rise without downstream quality, treat it as an intent/conversion-path problem; if clicks fall, treat it as a discovery/ranking problem.',
    ].join(' ');

    const parsedDonations = (donationRows || [])
      .map((row) => {
        const donatedAt = toUtcDayStart(row?.donated_at);
        return {
          ...row,
          _donatedAt: donatedAt,
          _amount: Number(row?.amount || 0),
          _isRecurring: !!row?.is_recurring,
        };
      })
      .filter((row) => row._donatedAt && Number.isFinite(row._amount));

    const donationStats = (start, end) => {
      const rows = parsedDonations.filter((row) => inUtcDayRange(row._donatedAt, start, end));
      const totalAmount = rows.reduce((acc, row) => acc + safeNum(row._amount), 0);
      const recurringCount = rows.filter((row) => row._isRecurring).length;
      return {
        transactions: rows.length,
        totalAmount,
        recurringCount,
        avgGift: ratioOrNull(totalAmount, rows.length),
      };
    };

    const donationsMonth = donationStats(monthStart, monthEnd);
    const donationsPrevMonth = donationStats(prevMonthStart, prevMonthEnd);
    const donationAmountDelta = comparePeriod(donationsMonth.totalAmount, donationsPrevMonth.totalAmount);
    const donationTxnDelta = comparePeriod(donationsMonth.transactions, donationsPrevMonth.transactions);
    const donationRecurringDelta = comparePeriod(donationsMonth.recurringCount, donationsPrevMonth.recurringCount);

    const leadsAnalysisContext = {
      module_key: 'leads',
      as_of: periodMeta.asOfLabel,
      windows: {
        last_7_days: periodMeta.lastWeekLabel,
        last_30_days: periodMeta.lastMonthLabel,
      },
      current_7d: {
        paid_social_leads: leadsWeek.paidSocial,
        great_leads: weekPaidQuality.great,
        high_quality_leads: weekPaidQuality.highQuality,
        high_quality_rate: weekPaidQuality.highQualityRate,
        lead_gen_spend: adsWeek.leadGenSpend,
        cpql: cpqlWeek,
        cpgl: cpglWeek,
      },
      previous_7d: {
        paid_social_leads: leadsPrevWeek.paidSocial,
        great_leads: prevWeekPaidQuality.great,
        high_quality_leads: prevWeekPaidQuality.highQuality,
        high_quality_rate: prevWeekPaidQuality.highQualityRate,
        lead_gen_spend: adsPrevWeek.leadGenSpend,
        cpql: cpqlPrevWeek,
        cpgl: cpglPrevWeek,
      },
      current_30d: {
        paid_social_leads: leadsMonth.paidSocial,
        great_leads: monthPaidQuality.great,
        qualified_leads: monthPaidQuality.qualified,
        high_quality_leads: monthPaidQuality.highQuality,
        high_quality_rate: monthPaidQuality.highQualityRate,
        lead_gen_spend: adsMonth.leadGenSpend,
        cpql: cpqlMonth,
        cpgl: cpglMonth,
        phoenix_paid_lead_share: phoenixPaidShareMonth,
      },
      diagnostics: {
        quality_coverage_rate_30d: monthPaidQuality.qualityCoverage,
      },
    };

    const attendanceAnalysisContext = {
      module_key: 'attendance',
      as_of: attendancePeriodMeta.asOfLabel,
      windows: {
        last_7_days: attendancePeriodMeta.lastWeekLabel,
        last_30_days: attendancePeriodMeta.lastMonthLabel,
      },
      current_7d: {
        sessions: attendeesWeek.sessions,
        tuesday_sessions: attendeesWeek.tuesdaySessions,
        thursday_sessions: attendeesWeek.thursdaySessions,
        new_attendees: attendeesWeek.newAttendees,
        attendance_participations: attendeesWeek.attendanceParticipations,
        unique_attendees: attendeesWeek.uniqueAttendees,
        repeaters: attendeesWeek.repeaters,
        avg_visits: attendeesWeek.avgVisits,
        repeat_rate: attendeesWeek.repeatRate,
        free_group_ad_spend: attendanceAdsWeek.freeSpend,
        cost_per_new_attendee: weekFreeCostPerNewAttendee,
      },
      previous_7d: {
        sessions: attendeesPrevWeek.sessions,
        tuesday_sessions: attendeesPrevWeek.tuesdaySessions,
        thursday_sessions: attendeesPrevWeek.thursdaySessions,
        new_attendees: attendeesPrevWeek.newAttendees,
        attendance_participations: attendeesPrevWeek.attendanceParticipations,
        unique_attendees: attendeesPrevWeek.uniqueAttendees,
        repeaters: attendeesPrevWeek.repeaters,
        avg_visits: attendeesPrevWeek.avgVisits,
        repeat_rate: attendeesPrevWeek.repeatRate,
        free_group_ad_spend: attendanceAdsPrevWeek.freeSpend,
        cost_per_new_attendee: prevWeekFreeCostPerNewAttendee,
      },
      current_30d: {
        sessions: attendeesMonth.sessions,
        tuesday_sessions: attendeesMonth.tuesdaySessions,
        thursday_sessions: attendeesMonth.thursdaySessions,
        new_attendees: attendeesMonth.newAttendees,
        attendance_participations: attendeesMonth.attendanceParticipations,
        unique_attendees: attendeesMonth.uniqueAttendees,
        repeaters: attendeesMonth.repeaters,
        avg_visits: attendeesMonth.avgVisits,
        repeat_rate: attendeesMonth.repeatRate,
        free_group_ad_spend: attendanceAdsMonth.freeSpend,
        cost_per_new_attendee: monthFreeCostPerNewAttendee,
      },
      diagnostics: {
        lineage: {
          attendance_events_table: 'raw_hubspot_meeting_activities',
          attendance_associations_table: 'hubspot_activity_contact_associations',
          spend_table: 'raw_fb_ads_insights_daily',
          include_filter: 'completed Tuesday/Thursday free-group calls only',
        },
        raw_counts_30d: {
          net_new_numerator: attendeesMonth.newAttendees,
          total_attendance_numerator: attendeesMonth.attendanceParticipations,
          average_visits_numerator: attendeesMonth.attendanceParticipations,
          average_visits_denominator: attendeesMonth.uniqueAttendees,
          cpna_numerator_spend: attendanceAdsMonth.freeSpend,
          cpna_denominator_net_new: attendeesMonth.newAttendees,
        },
        unclassified_large_calls: unclassifiedLargeCalls,
        phoenix_sessions_30d: phoenixCallsMonth.sessions,
      },
    };

    const seoAnalysisContext = {
      module_key: 'seo',
      as_of: periodMeta.asOfLabel,
      windows: {
        last_7_days: periodMeta.lastWeekLabel,
        last_30_days: periodMeta.lastMonthLabel,
      },
      current_7d: {
        ga_sessions: dashboard.cards.sessions7d,
        ga_users: dashboard.cards.users7d,
        ga_engagement_rate: dashboard.cards.engagement7d,
        gsc_clicks: dashboard.cards.clicks7d,
        gsc_impressions: dashboard.cards.impressions7d,
        gsc_ctr: dashboard.cards.ctr7d,
        gsc_avg_position: dashboard.cards.position7d,
      },
      current_30d: {
        ga_sessions: dashboard.cards.sessions30d,
        ga_users: dashboard.cards.users30d,
        ga_engagement_rate: dashboard.cards.engagement30d,
        gsc_clicks: dashboard.cards.clicks30d,
        gsc_impressions: dashboard.cards.impressions30d,
        gsc_ctr: dashboard.cards.ctr30d,
        gsc_avg_position: dashboard.cards.position30d,
      },
      trends: {
        sessions_7d_change: dashboard.trends.sessionsTrend,
        clicks_7d_change: dashboard.trends.clicksTrend,
        sessions_30d_change: dashboard.trends.sessions30dTrend,
        clicks_30d_change: dashboard.trends.clicks30dTrend,
      },
    };

    const donationsAnalysisContext = {
      module_key: 'donations',
      as_of: periodMeta.asOfLabel,
      windows: {
        last_30_days: periodMeta.lastMonthLabel,
        previous_30_days: formatDateRange(prevMonthStart, prevMonthEnd),
      },
      current_30d: donationsMonth,
      previous_30d: donationsPrevMonth,
      trends: {
        total_amount_change: donationAmountDelta,
        transaction_change: donationTxnDelta,
        recurring_count_change: donationRecurringDelta,
      },
      data_rows_loaded: parsedDonations.length,
    };
    const attendanceDiagnostics = [
      `Lineage: net-new, total attendances, and avg visits come from raw_hubspot_meeting_activities joined to hubspot_activity_contact_associations (completed Tue/Thu free-group calls only).`,
      `Meta cost per new attendee uses raw_fb_ads_insights_daily free-group spend (${formatCurrency(attendanceAdsMonth.freeSpend)}) / net-new (${formatInt(attendeesMonth.newAttendees)}).`,
      `30d raw counts: net-new=${formatInt(attendeesMonth.newAttendees)}, total attendances=${formatInt(attendeesMonth.attendanceParticipations)}, avg visits=${formatInt(attendeesMonth.attendanceParticipations)}/${formatInt(attendeesMonth.uniqueAttendees)}.`,
      unclassifiedLargeCalls > 0
        ? `${formatInt(unclassifiedLargeCalls)} high-attendance HubSpot calls are unclassified and may affect free-group reporting until titles are standardized.`
        : '',
    ].filter(Boolean).join(' ');

    const managers = [
      {
        key: 'leads',
        title: 'Leads AI Manager',
        icon: Sparkles,
        accent: {
          bg: 'linear-gradient(135deg, #ecfeff 0%, #f0fdfa 100%)',
          border: '#99f6e4',
          pillBg: '#ccfbf1',
          pillText: '#115e59',
        },
        scopeLabel: `HubSpot contacts + Meta Ads (${periodMeta.asOfLabel} as of) | Quality = revenue + sobriety at lead date`,
        sectionFocus: 'Lead quality, source mix, and acquisition efficiency across Phoenix Forum and feeder campaigns',
        analysisContext: leadsAnalysisContext,
        summaries: {
          week: leadsWeekSummary,
          month: leadsMonthSummary,
          bigPicture: leadsBigPictureSummary,
        },
        autonomousActions: [
          {
            id: 'leads-sync-all',
            action_key: 'leads_sync_all',
            label: 'Sync all data',
            description: 'Run full master sync (HubSpot, ads, metrics, SEO, attendance support tables).',
            kind: 'invoke_function',
            functionName: 'master-sync',
            reloadAfter: true,
          },
          {
            id: 'leads-sync-hubspot',
            action_key: 'leads_sync_hubspot',
            label: 'Sync HubSpot leads',
            description: 'Refresh HubSpot contacts/leads used by the Leads manager.',
            kind: 'invoke_function',
            functionName: 'sync_kpis',
            reloadAfter: true,
          },
          {
            id: 'leads-sync-meta',
            action_key: 'leads_sync_meta_ads',
            label: 'Sync Meta ads',
            description: 'Refresh Meta spend/leads for CPL and mix tracking.',
            kind: 'invoke_function',
            functionName: 'sync_fb_ads',
            reloadAfter: true,
          },
        ],
        humanActions: [
          'Review every Great Lead ($1M+ and >1 year sober) from the last 7 days and ensure white-glove follow-up into Phoenix Forum happens same day.',
          'Audit campaign/ad-set quality mix: compare spend vs Great Lead and CPQL output to identify fatigue or targeting drift before changing budgets.',
          'Tighten qualification messaging on ads + landing pages (revenue and sobriety signals) so paid volume improves fit, not just lead count.',
        ],
      },
      {
        key: 'attendance',
        title: 'Attendance AI Manager',
        icon: Users,
        accent: {
          bg: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
          border: '#bfdbfe',
          pillBg: '#dbeafe',
          pillText: '#1e3a8a',
        },
        scopeLabel: `HubSpot call/meeting activities + associations (free groups; not legacy Zoom attendance)`,
        sectionFocus: 'Acquisition efficiency and repeat behavior in free groups (feeder into Phoenix Forum)',
        analysisContext: attendanceAnalysisContext,
        summaries: {
          week: attendeesWeekSummary,
          month: attendeesMonthSummary,
          bigPicture: attendeesBigPictureSummary,
        },
        autonomousActions: [
          {
            id: 'attendees-sync-hubspot-calls',
            action_key: 'attendance_sync_hubspot_calls',
            label: 'Sync HubSpot attendance',
            description: 'Refresh HubSpot call/meeting attendance activities + contact associations.',
            kind: 'invoke_function',
            functionName: 'sync_hubspot_meeting_activities',
            body: { days: 45, include_calls: true, include_meetings: true },
            reloadAfter: true,
          },
          {
            id: 'attendance-create-retention-task',
            action_key: 'attendance_create_retention_playbook_task',
            label: 'Create retention playbook task',
            description: 'Auto-create a Notion task to build/update the attendance retention playbook.',
            kind: 'create_notion_task',
            taskName: 'Build attendance retention playbook: first-time follow-up, repeat cadence, and owner assignments',
          },
          {
            id: 'attendance-create-data-hygiene-task',
            action_key: 'attendance_create_data_hygiene_task',
            label: 'Create data hygiene task',
            description: 'Auto-create a Notion task for HubSpot call title standardization and attendance QA.',
            kind: 'create_notion_task',
            taskName: 'Attendance data hygiene checklist: HubSpot call title standards, missing sessions, and classification QA',
          },
        ],
        humanActions: [
          'Follow up all first-time free-group attendees within 24 hours and invite them to the next session.',
          'Standardize HubSpot call titles (Tuesday / Thursday / Phoenix Forum) so attendance classification stays accurate.',
          'Review free-group session format to increase repeat attendance and average visits per attendee.',
        ],
        diagnostics: attendanceDiagnostics,
      },
      {
        key: 'seo',
        title: 'SEO AI Manager',
        icon: Globe,
        accent: {
          bg: 'linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%)',
          border: '#bbf7d0',
          pillBg: '#dcfce7',
          pillText: '#166534',
        },
        scopeLabel: `Google Analytics + Search Console KPI metrics (${periodMeta.asOfLabel} as of)`,
        sectionFocus: 'Organic discovery quality and conversion-path health into Phoenix Forum (and future donations)',
        analysisContext: seoAnalysisContext,
        summaries: {
          week: seoWeekSummary,
          month: seoMonthSummary,
          bigPicture: seoBigPictureSummary,
        },
        autonomousActions: [
          {
            id: 'seo-sync-ga',
            action_key: 'seo_sync_ga',
            label: 'Sync GA',
            description: 'Refresh Google Analytics KPI metrics.',
            kind: 'invoke_function',
            functionName: 'sync_google_analytics',
            reloadAfter: true,
          },
          {
            id: 'seo-sync-gsc',
            action_key: 'seo_sync_search_console',
            label: 'Sync Search Console',
            description: 'Refresh Search Console KPI metrics and queries.',
            kind: 'invoke_function',
            functionName: 'sync_search_console',
            reloadAfter: true,
          },
          {
            id: 'seo-sync-metrics',
            action_key: 'seo_sync_kpi_metrics',
            label: 'Sync KPI metrics',
            description: 'Refresh derived KPI metrics and dashboard aggregates.',
            kind: 'invoke_function',
            functionName: 'sync-metrics',
            reloadAfter: true,
          },
        ],
        humanActions: [
          'Publish or refresh a Phoenix Forum page/article aimed at high-intent recovery and founder-related queries.',
          'Improve internal links and CTAs from top organic pages into Phoenix Forum and future donations.',
          'Review low-CTR GSC queries/pages and rewrite titles/descriptions to increase qualified clicks.',
        ],
      },
      {
        key: 'donations',
        title: 'Donations AI Manager',
        icon: Bot,
        accent: {
          bg: 'linear-gradient(135deg, #fff7ed 0%, #fefce8 100%)',
          border: '#fed7aa',
          pillBg: '#ffedd5',
          pillText: '#9a3412',
        },
        scopeLabel: `Zeffy + manual donation transactions (${periodMeta.asOfLabel} as of)`,
        sectionFocus: 'Donations readiness, compliance setup, and launch planning',
        analysisContext: donationsAnalysisContext,
        summaries: {
          week: `No 7-day donation rollup is shown in this card; donations are tracked in 30-day windows for now. Use Refresh Analysis to get AI recommendations with current donation records.`,
          month: `Last 30 days: ${formatInt(donationsMonth.transactions)} donation transactions totaling ${formatCurrency(donationsMonth.totalAmount)} (${changeLabel(donationTxnDelta)} transactions and ${changeLabel(donationAmountDelta)} amount vs prior 30-day window). Recurring donations this period: ${formatInt(donationsMonth.recurringCount)} (${changeLabel(donationRecurringDelta)}).`,
          bigPicture: `Donations are now ingesting from Zeffy/manual sources. Operations focus should be acknowledgment quality, recurring donor growth, and campaign-level attribution hygiene while keeping nonprofit compliance workflows clean.`,
        },
        autonomousActions: [
          {
            id: 'donations-create-spec-task',
            action_key: 'donations_create_build_spec_task',
            label: 'Create build spec task',
            description: 'Auto-create a Notion task for donations module schema + event tracking spec.',
            kind: 'create_notion_task',
            taskName: 'Build donations module spec: data model, donation events, and dashboard metrics (compliant public charity flow)',
          },
          {
            id: 'donations-create-compliance-task',
            action_key: 'donations_create_compliance_checklist_task',
            label: 'Create compliance checklist',
            description: 'Auto-create a Notion task for donation compliance requirements and review.',
            kind: 'create_notion_task',
            taskName: 'Create donations compliance checklist for public charity requirements (receipts, acknowledgments, disclosures, storage)',
          },
          {
            id: 'donations-create-ops-task',
            action_key: 'donations_create_donor_ops_task',
            label: 'Create donor ops task',
            description: 'Auto-create a Notion task for donor acknowledgment and stewardship workflow.',
            kind: 'create_notion_task',
            taskName: 'Define donor acknowledgment and stewardship workflow (thank-you timing, segmentation, recurring follow-up)',
          },
        ],
        humanActions: [
          'Confirm legal/compliance requirements for online donations as a public charity before implementation begins.',
          'Define the donation funnel (one-time vs recurring, campaign attribution, and acknowledgment standards).',
          'Prioritize a minimal donation module release plan that does not slow down Phoenix Forum growth work.',
        ],
      },
    ];

    return {
      referenceDate,
      periodMeta,
      managers,
    };
  }, [dashboard, donationRows, fbAdsRows, hubspotActivities, hubspotActivityAssocs, hubspotContacts]);

  const managerByKey = useMemo(() => {
    const out = new Map();
    (aiManagers?.managers || []).forEach((manager) => {
      out.set(manager.key, manager);
    });
    return out;
  }, [aiManagers]);
  const disableRemoteModuleAnalysis = useMemo(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isRemoteFeatureEnabled = REMOTE_AI_MODULE_ANALYSIS_ENABLED && hasSupabaseConfig;
    return isLocalHost || !isRemoteFeatureEnabled;
  }, []);

  const executiveSynthesis = useMemo(() => {
    const managers = aiManagers?.managers || [];
    const managerSnapshots = managers.map((manager) => {
      const analysis = moduleAnalysisState[manager.key] || {};
      const analysisData = analysis?.data || {};
      const summaryBullets = Array.isArray(analysisData?.summary) && analysisData.summary.length > 0
        ? analysisData.summary
        : managerFallbackSummaryBullets(manager);
      const aiAutonomous = Array.isArray(analysisData?.autonomous_actions)
        ? analysisData.autonomous_actions
          .map((item) => ({
            action_key: String(item?.action_key || '').trim(),
            description: String(item?.description || '').trim(),
          }))
          .filter((item) => item.action_key && item.description)
        : [];
      const fallbackAutonomous = (manager.autonomousActions || []).map((action) => ({
        action_key: String(action?.action_key || '').trim(),
        description: String(action?.description || '').trim(),
      })).filter((item) => item.action_key && item.description);

      const autonomousMap = new Map();
      aiAutonomous.forEach((row) => autonomousMap.set(row.action_key, row));
      fallbackAutonomous.forEach((row) => {
        if (!autonomousMap.has(row.action_key)) autonomousMap.set(row.action_key, row);
      });
      const actionCatalogByKey = new Map(
        (manager.autonomousActions || [])
          .filter((action) => action?.action_key)
          .map((action) => [String(action.action_key).trim(), action]),
      );

      return {
        manager,
        summaryBullets: summaryBullets.slice(0, 3),
        humanActions: (Array.isArray(analysisData?.human_actions) && analysisData.human_actions.length > 0
          ? analysisData.human_actions
          : (manager.humanActions || [])
        )
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 3),
        autonomousActions: Array.from(autonomousMap.values())
          .map((row) => {
            const action = actionCatalogByKey.get(String(row.action_key || '').trim());
            if (!action) return null;
            return {
              ...action,
              moduleKey: manager.key,
              aiDescription: String(row?.description || action.description || '').trim(),
            };
          })
          .filter(Boolean)
          .slice(0, 3),
      };
    });

    const priorityFocus = (dashboard?.priorityRows || [])
      .filter((row) => row?.status === 'critical' || row?.status === 'watch')
      .slice(0, 6)
      .map((row) => `${row.area}: ${row.metric} is ${row.status}. Current ${row.value} vs target ${row.target}.`);
    const keySignals = managerSnapshots
      .flatMap((snapshot) => snapshot.summaryBullets.map((bullet) => `${snapshot.manager.title}: ${bullet}`))
      .slice(0, 8);
    const fixNow = [
      ...(warnings || []).map((warning) => `Data warning: ${warning}`),
      ...managerSnapshots
        .map((snapshot) => snapshot.manager?.diagnostics)
        .filter(Boolean)
        .map((diagnostic) => `Diagnostic: ${diagnostic}`),
    ].slice(0, 6);
    const improvementLevers = managerSnapshots
      .flatMap((snapshot) => snapshot.humanActions.map((item) => `${snapshot.manager.title}: ${item}`))
      .slice(0, 8);

    return {
      managerSnapshots,
      keySignals,
      priorityFocus,
      fixNow,
      improvementLevers,
    };
  }, [aiManagers, moduleAnalysisState, dashboard, warnings]);

  async function requestModuleAnalysis(manager, forceRefresh = false) {
    if (!manager?.key) return;
    const key = manager.key;
    const fallbackSummary = managerFallbackSummaryBullets(manager);
    const fallbackHumanActions = (manager.humanActions || []).slice(0, 3);
    const actionCatalog = (manager.autonomousActions || [])
      .map((action) => ({
        action_key: String(action?.action_key || '').trim(),
        description: String(action?.description || '').trim(),
      }))
      .filter((row) => row.action_key && row.description);

    setModuleAnalysisState((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        status: 'loading',
        error: '',
        requestedAt: Date.now(),
      },
    }));

    if (disableRemoteModuleAnalysis) {
      setModuleAnalysisState((prev) => ({
        ...prev,
        [key]: {
          status: 'ready',
          error: '',
          requestedAt: prev[key]?.requestedAt || Date.now(),
          generatedAt: new Date().toISOString(),
          fromCache: false,
          aiModel: 'local-fallback',
          isMock: true,
          data: {
            summary: fallbackSummary,
            autonomous_actions: actionCatalog.slice(0, 3),
            human_actions: fallbackHumanActions,
          },
        },
      }));
      return;
    }

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-module-analysis', {
        body: {
          module_key: key,
          context: manager.analysisContext || {},
          action_catalog: actionCatalog,
          ttl_hours: MODULE_ANALYSIS_TTL_HOURS,
          force_refresh: forceRefresh,
          fallback_summary: fallbackSummary,
          fallback_human_actions: fallbackHumanActions,
        },
      });

      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || 'AI module analysis request failed.');

      const summary = Array.isArray(data?.analysis?.summary)
        ? data.analysis.summary.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
        : [];
      const autonomousActions = Array.isArray(data?.analysis?.autonomous_actions)
        ? data.analysis.autonomous_actions
          .map((item) => ({
            action_key: String(item?.action_key || '').trim(),
            description: String(item?.description || '').trim(),
          }))
          .filter((item) => item.action_key && item.description)
          .slice(0, 3)
        : [];
      const humanActions = Array.isArray(data?.analysis?.human_actions)
        ? data.analysis.human_actions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
        : [];

      setModuleAnalysisState((prev) => ({
        ...prev,
        [key]: {
          status: 'ready',
          error: '',
          requestedAt: prev[key]?.requestedAt || Date.now(),
          generatedAt: String(data?.generated_at || '') || null,
          fromCache: !!data?.from_cache,
          aiModel: String(data?.ai_model || ''),
          isMock: !!data?.is_mock,
          data: {
            summary,
            autonomous_actions: autonomousActions,
            human_actions: humanActions,
          },
        },
      }));
    } catch (err) {
      setModuleAnalysisState((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          status: 'error',
          error: err?.message || 'AI module analysis failed.',
        },
      }));
    }
  }

  useEffect(() => {
    (aiManagers?.managers || []).forEach((manager) => {
      const state = moduleAnalysisState[manager.key];
      if (!state) {
        requestModuleAnalysis(manager, false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiManagers?.managers?.length]);

  async function runAutonomousAction(action) {
    if (!action?.id) return;
    setActionState((prev) => ({
      ...prev,
      [action.id]: { status: 'running', error: '' },
    }));

    try {
      let payload = null;
      if (action.kind === 'invoke_function') {
        const options = action.body ? { body: action.body } : {};
        const { data: invokeData, error: invokeError } = await supabase.functions.invoke(action.functionName, options);
        if (invokeError) throw invokeError;
        payload = invokeData || null;
      } else if (action.kind === 'create_notion_task') {
        const properties = buildNotionTaskProperties(String(action.taskName || '').trim());
        const { data: notionData, error: notionError } = await supabase.functions.invoke('master-sync', {
          body: { action: 'create_task', properties },
        });
        if (notionError) throw notionError;
        payload = notionData || null;
      } else {
        throw new Error(`Unsupported action type: ${action.kind || 'unknown'}`);
      }

      const message = actionCompletionMessage(action, payload);
      setActionState((prev) => ({
        ...prev,
        [action.id]: { status: 'success', error: '', at: Date.now(), message },
      }));

      if (action.reloadAfter) {
        await loadData();
      }

      if (action.moduleKey) {
        const manager = managerByKey.get(action.moduleKey);
        if (manager) {
          await requestModuleAnalysis(manager, true);
        }
      }
    } catch (err) {
      setActionState((prev) => ({
        ...prev,
        [action.id]: { status: 'error', error: err?.message || 'Failed' },
      }));
    }
  }

  function statusBadge(status) {
    if (status === 'healthy') return { bg: '#ecfdf5', border: '#86efac', text: '#166534', label: 'Healthy', icon: CheckCircle2 };
    if (status === 'critical') return { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', label: 'Critical', icon: AlertTriangle };
    return { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', label: 'Watch', icon: Clock3 };
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--color-dark-green)' }}>
        <p style={{ fontSize: '18px', fontWeight: '600' }}>Loading KPI priorities...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...baseCardStyle, color: '#b91c1c' }}>
        <p style={{ fontWeight: 700 }}>Dashboard load failed</p>
        <p style={{ marginTop: '6px' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        style={{
          ...baseCardStyle,
          background: 'linear-gradient(135deg, rgba(3, 218, 198, 0.15) 0%, rgba(0, 230, 118, 0.05) 100%)',
          border: '1px solid var(--color-border-glow)',
          boxShadow: '0 8px 32px var(--color-brand-glow), inset 0 0 20px rgba(3, 218, 198, 0.1)',
          color: 'var(--color-text-primary)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 2 }}>
          <p style={{ fontSize: '12px', color: 'var(--color-dark-green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Executive Focus</p>
          <h2 style={{ fontSize: '32px', marginTop: '6px', textShadow: '0 0 15px rgba(3, 218, 198, 0.3)' }}>What Matters Most This Week</h2>
          <p style={{ marginTop: '8px', color: 'var(--color-text-secondary)', fontSize: '15px' }}>
            Prioritized scorecard across traffic, organic search, engagement quality, and community retention.
          </p>
        </div>
        {/* Decorative elements */}
        <div style={{ position: 'absolute', top: '-50%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(3, 218, 198, 0.1) 0%, transparent 70%)', filter: 'blur(40px)', zIndex: 1 }} />
      </div>

      {!dashboard.hasGscData && (
        <div style={{ ...baseCardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ color: '#92400e', fontWeight: 700 }}>Search Console data missing</p>
          <p style={{ marginTop: '6px', color: '#92400e' }}>
            Run Refresh Data and ensure your Google refresh token includes scope:
            {' '}<code>https://www.googleapis.com/auth/webmasters.readonly</code>
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ ...baseCardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffaf0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="#b45309" />
            <p style={{ fontWeight: 700, color: '#92400e' }}>Partial data warnings</p>
          </div>
          <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
            {warnings.map((warning) => (
              <p key={warning} style={{ color: '#92400e', fontSize: '13px' }}>
                {warning}
              </p>
            ))}
          </div>
        </div>
      )}

      <div style={baseCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '20px' }}>Executive Summary (All KPI Sections)</h3>
            <p style={{ marginTop: '6px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              Synthesized insights from Leads, Attendance, SEO, and Donations AI Managers with top focus and remediation signals.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Reference date</p>
            <p style={{ fontWeight: 700 }}>{aiManagers.periodMeta.asOfLabel}</p>
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '12px' }}>
          {[
            { title: 'Need To Know', rows: executiveSynthesis.keySignals, tone: '#0f766e' },
            { title: 'Focus This Week', rows: executiveSynthesis.priorityFocus, tone: '#2563eb' },
            { title: 'Pay Attention / Fix', rows: executiveSynthesis.fixNow, tone: '#dc2626' },
            { title: 'Improve The Nonprofit', rows: executiveSynthesis.improvementLevers, tone: '#d97706' },
          ].map((group) => (
            <div key={group.title} style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px', backgroundColor: 'rgba(0,0,0,0.18)' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: group.tone, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group.title}</p>
              <ul style={{ marginTop: '8px', paddingLeft: '18px', display: 'grid', gap: '6px' }}>
                {(group.rows || []).slice(0, 6).map((row, idx) => (
                  <li key={`${group.title}-${idx}`} style={{ fontSize: '12px', lineHeight: 1.45, color: 'var(--color-text-primary)' }}>{row}</li>
                ))}
                {(!group.rows || group.rows.length === 0) && (
                  <li style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No items generated yet.</li>
                )}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '14px', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-dark-green)' }}>
            AI Manager Quick Summary + 3 Do This Actions
          </p>
          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: '10px' }}>
            {executiveSynthesis.managerSnapshots.map((snapshot) => (
              <div key={`quick-${snapshot.manager.key}`} style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{snapshot.manager.title}</p>
                <ul style={{ marginTop: '6px', paddingLeft: '18px', display: 'grid', gap: '5px' }}>
                  {snapshot.summaryBullets.slice(0, 2).map((item, idx) => (
                    <li key={`quick-summary-${snapshot.manager.key}-${idx}`} style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item}</li>
                  ))}
                </ul>
                <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                  {snapshot.autonomousActions.slice(0, 3).map((action, idx) => (
                    <div key={`quick-action-${snapshot.manager.key}-${action.action_key}-${idx}`} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{action.aiDescription || action.description}</p>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => runAutonomousAction(action)}
                          disabled={actionState[action.id]?.status === 'running' || loading}
                          style={{ padding: '5px 8px', fontSize: '10px', whiteSpace: 'nowrap' }}
                        >
                          {actionState[action.id]?.status === 'running' ? 'Running...' : 'Do This'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={baseCardStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="#0f766e" />
              <h3 style={{ fontSize: '18px' }}>AI Manager Summary by Section</h3>
            </div>
            <p style={{ marginTop: '6px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              AI-generated module summaries with autonomous actions (Do This) and human-only follow-ups (For You to Do).
            </p>
          </div>
          <div style={{ display: 'grid', gap: '4px', alignContent: 'start', textAlign: 'right' }}>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Reference date</p>
            <p style={{ fontWeight: 700 }}>{aiManagers.periodMeta.asOfLabel}</p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              7-day window: {aiManagers.periodMeta.lastWeekLabel}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {aiManagers.managers.map((manager) => {
            const Icon = manager.icon || Bot;
            const analysis = moduleAnalysisState[manager.key] || {};
            const analysisData = analysis?.data || {};
            const summaryBullets = Array.isArray(analysisData?.summary) && analysisData.summary.length > 0
              ? analysisData.summary
              : managerFallbackSummaryBullets(manager);
            const actionCatalogByKey = new Map(
              (manager.autonomousActions || [])
                .filter((action) => action?.action_key)
                .map((action) => [action.action_key, action]),
            );
            const aiAutonomous = Array.isArray(analysisData?.autonomous_actions)
              ? analysisData.autonomous_actions
              : [];
            const fallbackAutonomous = (manager.autonomousActions || []).map((action) => ({
              action_key: action.action_key,
              description: action.description,
            }));
            const chosenAutonomous = [...aiAutonomous, ...fallbackAutonomous];
            const seenActionKeys = new Set();
            const autonomousActions = chosenAutonomous
              .map((item) => {
                const actionKey = String(item?.action_key || '').trim();
                if (!actionKey || seenActionKeys.has(actionKey)) return null;
                seenActionKeys.add(actionKey);
                const action = actionCatalogByKey.get(actionKey);
                if (!action) return null;
                return {
                  ...action,
                  moduleKey: manager.key,
                  aiDescription: String(item?.description || action.description || '').trim(),
                };
              })
              .filter(Boolean)
              .slice(0, 3);
            const humanActions = (
              Array.isArray(analysisData?.human_actions) && analysisData.human_actions.length > 0
                ? analysisData.human_actions
                : manager.humanActions
            )
              .map((item) => String(item || '').trim())
              .filter(Boolean)
              .slice(0, 3);
            const analysisStatusLabel = analysis?.status === 'loading'
              ? 'Analyzing...'
              : analysis?.generatedAt
                ? `Updated ${new Date(analysis.generatedAt).toLocaleString()}${analysis.fromCache ? ' (cached)' : ''}`
                : 'Analysis pending';
            return (
              <div
                key={manager.key}
                className="glass-panel"
                style={{
                  border: `1px solid var(--color-border)`,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    padding: '14px 14px 12px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '10px',
                          background: 'rgba(3, 218, 198, 0.1)',
                          border: '1px solid var(--color-border-glow)',
                          color: 'var(--color-dark-green)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{manager.title}</p>
                        <p style={{ marginTop: '2px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{manager.sectionFocus}</p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: '6px', justifyItems: 'end' }}>
                      <span
                        style={{
                          background: 'rgba(3, 218, 198, 0.15)',
                          color: 'var(--color-dark-green)',
                          border: '1px solid var(--color-border-glow)',
                          borderRadius: '999px',
                          padding: '5px 9px',
                          fontSize: '11px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        AI Manager
                      </span>
                      <button
                        className="btn-glass"
                        type="button"
                        onClick={() => requestModuleAnalysis(manager, true)}
                        disabled={analysis?.status === 'loading'}
                        style={{
                          padding: '6px 9px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: analysis?.status === 'loading' ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {analysis?.status === 'loading' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                        Refresh Analysis
                      </button>
                    </div>
                  </div>
                  <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{manager.scopeLabel}</p>
                  <p style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-muted)' }}>{analysisStatusLabel}</p>
                  {analysis?.status === 'error' && (
                    <p style={{ marginTop: '6px', fontSize: '11px', color: '#ff5252' }}>
                      Analysis failed: {analysis.error}
                    </p>
                  )}
                  {manager.diagnostics && (
                    <div style={{ marginTop: '8px', padding: '8px 10px', backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: '10px', border: '1px solid rgba(255,152,0,0.3)' }}>
                      <p style={{ fontSize: '12px', color: 'var(--color-orange)' }}>{manager.diagnostics}</p>
                    </div>
                  )}
                </div>

                <div style={{ padding: '14px', display: 'grid', gap: '14px', flex: 1 }}>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px', backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                      <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-dark-green)', fontWeight: 600 }}>
                        Module Summary (AI-Generated)
                      </p>
                      <ul style={{ marginTop: '6px', paddingLeft: '18px', display: 'grid', gap: '6px' }}>
                        {summaryBullets.map((bullet, idx) => (
                          <li key={`${manager.key}-summary-${idx}`} style={{ fontSize: '13px', lineHeight: 1.45, color: 'var(--color-text-primary)' }}>
                            {bullet}
                          </li>
                        ))}
                        {summaryBullets.length === 0 && (
                          <li style={{ fontSize: '13px', lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
                            No summary generated yet for this module.
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Bot size={14} color="var(--color-text-primary)" />
                      <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Autonomous Actions</p>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      AI-selected actions that can run immediately. Click Do This to execute.
                    </p>
                    {autonomousActions.map((action) => {
                      const state = actionState[action.id] || {};
                      const isRunning = state.status === 'running';
                      const isSuccess = state.status === 'success';
                      const isError = state.status === 'error';
                      return (
                        <div key={action.id} style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                            <div>
                              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{action.label}</p>
                              <p style={{ marginTop: '3px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                {action.aiDescription || action.description}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => runAutonomousAction(action)}
                              disabled={isRunning || loading}
                              style={{
                                padding: '6px 12px',
                                fontSize: '11px',
                                cursor: isRunning || loading ? 'not-allowed' : 'pointer',
                                opacity: (isRunning || loading) ? 0.6 : 1,
                              }}
                            >
                              {isRunning ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
                              {isRunning ? 'Running...' : 'Do This'}
                            </button>
                          </div>
                          {(isSuccess || isError) && (
                            <p style={{ marginTop: '6px', fontSize: '12px', color: isError ? '#ff5252' : '#00e676' }}>
                              {isError ? state.error : (state.message || 'Done')}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {autonomousActions.length === 0 && (
                      <div style={{ border: '1px dashed var(--color-border)', borderRadius: '10px', padding: '10px', backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          No runnable autonomous actions available for this module yet.
                        </p>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={14} color="var(--color-orange)" />
                      <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>For You to Do</p>
                    </div>
                    {humanActions.map((item) => (
                      <div key={`${manager.key}-${item}`} style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px', backgroundColor: 'rgba(255, 255, 255, 0.03)', display: 'grid', gap: '8px' }}>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{item}</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            className="btn-glass"
                            type="button"
                            onClick={() => setNotionModal({ open: true, taskName: item })}
                            style={{
                              padding: '6px 10px',
                              fontSize: '11px',
                            }}
                          >
                            Send to Notion
                          </button>
                        </div>
                      </div>
                    ))}
                    {humanActions.length === 0 && (
                      <div style={{ border: '1px dashed var(--color-border)', borderRadius: '10px', padding: '10px', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          No human-only suggestions generated yet.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        <div style={baseCardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Website Sessions (7d)</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px' }}>{formatInt(dashboard.cards.sessions7d)}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>WoW {pctDelta(dashboard.trends.sessionsTrend)}</p>
        </div>
        <div style={baseCardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Organic Clicks (7d)</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px' }}>{formatInt(dashboard.cards.clicks7d)}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>WoW {pctDelta(dashboard.trends.clicksTrend)}</p>
        </div>
        <div style={baseCardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Engagement Rate (7d)</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px' }}>{pct(dashboard.cards.engagement7d)}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Search CTR {pct(dashboard.cards.ctr7d)}</p>
        </div>
        <div style={baseCardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Zoom Avg Attendance</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px' }}>
            {dashboard.cards.avgAttendance ? dashboard.cards.avgAttendance.toFixed(1) : 'N/A'}
          </p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Last 12 meetings</p>
        </div>
        <div style={baseCardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Zoom Repeat Rate</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px' }}>{pct(dashboard.cards.repeatRate)}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Last 12 meetings</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <div style={baseCardStyle}>
          <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Traffic vs Organic Trend (Last 30 Days)</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboard.trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                  itemStyle={{ color: 'var(--color-text-primary)' }}
                  labelStyle={{ color: 'var(--color-text-secondary)' }}
                />
                <Legend />
                <Line type="monotone" dataKey="sessions" name="GA Sessions" stroke="#0f766e" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="clicks" name="GSC Clicks" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={baseCardStyle}>
          <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Search Quality</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div className="glass-panel" style={{ borderRadius: '12px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Search size={16} color="var(--color-dark-green)" />
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Impressions (7d)</p>
              </div>
              <p style={{ marginTop: '6px', fontSize: '24px', fontWeight: 700 }}>{formatInt(dashboard.cards.impressions7d)}</p>
            </div>
            <div className="glass-panel" style={{ borderRadius: '12px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={16} color="var(--color-orange)" />
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Average Position (7d)</p>
              </div>
              <p style={{ marginTop: '6px', fontSize: '24px', fontWeight: 700 }}>
                {dashboard.cards.position7d ? dashboard.cards.position7d.toFixed(1) : 'N/A'}
              </p>
            </div>
            <div className="glass-panel" style={{ borderRadius: '12px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="var(--color-brand-glow)" />
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Organic CTR (7d)</p>
              </div>
              <p style={{ marginTop: '6px', fontSize: '24px', fontWeight: 700 }}>{pct(dashboard.cards.ctr7d)}</p>
            </div>
          </div>
        </div>
      </div>

      <div style={baseCardStyle}>
        <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Priority Queue</h3>
        <div style={{ display: 'grid', gap: '10px' }}>
          {dashboard.priorityRows.map((row) => {
            const badge = statusBadge(row.status);
            const Icon = badge.icon;
            return (
              <div
                key={row.metric}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr auto',
                  gap: '12px',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{row.area}</span>
                <div>
                  <p style={{ fontWeight: 700 }}>{row.metric}</p>
                  <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    Current {row.value} | Target {row.target} | {row.note}
                  </p>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: badge.bg,
                    border: `1px solid ${badge.border}`,
                    color: badge.text,
                    borderRadius: '999px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  <Icon size={14} />
                  {badge.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={baseCardStyle}>
        <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Data Coverage</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          {dashboard.sourceCoverage.map((source) => (
            <div key={source.source} className="glass-panel" style={{ borderRadius: '10px', padding: '10px' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{source.source}</p>
              <p style={{ marginTop: '6px', fontWeight: 700 }}>{source.count} rows</p>
              <p style={{ marginTop: '2px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Latest: {source.latest || 'No data'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <SendToNotionModal
        isOpen={notionModal.open}
        onClose={() => setNotionModal({ open: false, taskName: '' })}
        defaultTaskName={notionModal.taskName}
      />
    </div>
  );
};

export default DashboardOverview;
