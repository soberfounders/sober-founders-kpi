import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  LEADS_ATTRIBUTION_HISTORY_DAYS,
  LEADS_LOOKBACK_DAYS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from '../lib/env';
import { buildLeadAnalytics } from '../lib/leadAnalytics';
import { buildGroupedLeadsSnapshot, buildDateRangeWindows, computeChangePct } from '../lib/leadsGroupAnalytics';
import * as leadsGroupAnalyticsLib from '../lib/leadsGroupAnalytics';
import { buildLeadsConfidenceSummary } from '../lib/leadsConfidenceModel';
import { buildLeadsActionQueue } from '../lib/leadsActionQueue';
import { buildLeadsManagerInsights } from '../lib/leadsManagerInsights';
import { buildLeadsExperimentAnalyzer } from '../lib/leadsExperimentAnalyzer';
import { buildAliasMap, resolveCanonicalAttendeeName } from '../lib/attendeeCanonicalization';
import { applyZoomAttributionOverride, getZoomAttributionOverride } from '../lib/zoomAttributionOverrides';
import {
  evaluateLeadQualification,
  leadQualityTierFromOfficialRevenue,
  parseOfficialRevenue,
} from '../lib/leadsQualificationRules';
import {
  buildLeadsQualificationSnapshot,
  buildUnifiedKpiSnapshot,
} from '../lib/kpiSnapshot';
import DrillDownModal from '../components/DrillDownModal';
import SendToNotionModal from '../components/SendToNotionModal';
import AIAnalysisCard from '../components/AIAnalysisCard';
import KPICard from '../components/KPICard';
import CohortUnitEconomicsPreviewPanel from '../components/CohortUnitEconomicsPreviewPanel';
import LeadsConfidenceActionPanel from '../components/LeadsConfidenceActionPanel';
import LeadsManagerInsightsPanel from '../components/LeadsManagerInsightsPanel';
import LeadsExperimentAnalyzerPanel from '../components/LeadsExperimentAnalyzerPanel';
import LeadsParityGuardPanel from '../components/LeadsParityGuardPanel';
import LeadsQualificationParityPanel from '../components/LeadsQualificationParityPanel';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, ComposedChart,
} from 'recharts';

const LOOKBACK_DAYS = LEADS_LOOKBACK_DAYS;
const ATTRIBUTION_HISTORY_DAYS = LEADS_ATTRIBUTION_HISTORY_DAYS;
const MIN_GROUP_ATTENDEES = 3;
const EXPECTED_ZERO_GROUP_SESSION_KEYS = new Set(['2025-12-25|Thursday']);


const LEADS_HUBSPOT_CONTACT_REQUIRED_COLUMNS = [
  'hubspot_contact_id',
  'createdate',
  'firstname',
  'lastname',
  'email',
  'hs_additional_emails',
  'hs_analytics_source',
  'hs_analytics_source_data_1',
  'hs_analytics_source_data_2',
  'hs_latest_source',
  'hs_latest_source_data_2',
  'campaign',
  'campaign_source',
  'membership_s',
];

const LEADS_HUBSPOT_CONTACT_OPTIONAL_COLUMNS = [
  'annual_revenue_in_dollars',
  'annual_revenue_in_usd_official',
  'annual_revenue_in_dollars__official_',
  'annual_revenue',
  'sobriety_date',
  'sobriety_date__official_',
  'sober_date',
  'clean_date',
  'sobrietydate',
  'lastmodifieddate',
  'hs_lastmodifieddate',
  'updated_at',
  'hubspot_updated_at',
  'last_synced_at',
  'original_traffic_source',
  'sync_source',
];

const LEADS_HUBSPOT_CONTACT_SILENT_FALLBACK_COLUMNS = new Set([
  // Legacy aliases absent in some environments.
  'annual_revenue_in_usd_official',
  'sobriety_date__official_',
  'annual_revenue',
  'sober_date',
  'clean_date',
  'sobrietydate',
  'lastmodifieddate',
  'hs_lastmodifieddate',
  'updated_at',
]);

function extractMissingRawHubspotContactsColumn(message = '') {
  const text = String(message || '');
  const patterns = [
    /column\s+(?:"?[a-zA-Z0-9_]+"?\.)?(?:"?raw_hubspot_contacts"?\.)?"?([a-zA-Z0-9_]+)"?\s+does not exist/i,
    /Could not find the\s+'([a-zA-Z0-9_]+)'\s+column\s+of\s+'raw_hubspot_contacts'/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function fetchLeadsHubspotContactsWithSchemaFallback({ attributionStartKey }) {
  const requestedColumns = [
    ...LEADS_HUBSPOT_CONTACT_REQUIRED_COLUMNS,
    ...LEADS_HUBSPOT_CONTACT_OPTIONAL_COLUMNS,
  ];
  const schemaWarnings = [];
  let selectedColumns = [...requestedColumns];
  const attemptedMissingColumns = new Set();
  let lastError = null;

  while (selectedColumns.length > 0) {
    const response = await supabase
      .from('raw_hubspot_contacts')
      .select(selectedColumns.join(','))
      .gte('createdate', `${attributionStartKey}T00:00:00.000Z`)
      .order('createdate', { ascending: false });

    if (!response.error) return { ...response, schemaWarnings };
    lastError = response.error;

    const missingColumn = extractMissingRawHubspotContactsColumn(response.error?.message || response.error?.details || '');
    if (!missingColumn || !selectedColumns.includes(missingColumn) || attemptedMissingColumns.has(missingColumn)) break;

    attemptedMissingColumns.add(missingColumn);
    selectedColumns = selectedColumns.filter((columnName) => columnName !== missingColumn);
    if (!LEADS_HUBSPOT_CONTACT_SILENT_FALLBACK_COLUMNS.has(missingColumn)) {
      schemaWarnings.push(
        `Leads HubSpot contacts query auto-recovered from missing optional column \`${missingColumn}\`.`,
      );
    }
  }

  // Fail open to keep KPI surfaces alive when select-column drift happens.
  const wildcardResponse = await supabase
    .from('raw_hubspot_contacts')
    .select('*')
    .gte('createdate', `${attributionStartKey}T00:00:00.000Z`)
    .order('createdate', { ascending: false });
  if (!wildcardResponse.error) {
    schemaWarnings.push(
      'Leads HubSpot contacts query fell back to `select(*)` because preferred projection failed. Run schema alignment to restore lean projection safely.',
    );
    return { ...wildcardResponse, schemaWarnings };
  }

  return {
    data: null,
    error: lastError || wildcardResponse.error || new Error('HubSpot contacts query failed in Leads after schema fallback attempts.'),
    schemaWarnings,
  };
}

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = {
  currency: (v) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return 'N/A';
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  },
  int: (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : 'N/A';
  },
  pct: (v) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return 'N/A';
    return `${(n * 100).toFixed(1)}%`;
  },
  deltaPct: (v) => {
    if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
    return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
  },
};

// ─── Shared styles ────────────────────────────────────────────────────────────
const card = { backgroundColor: '#fff', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '20px' };
const subCard = { backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px' };

const HEAR_ABOUT_CATEGORIES = [
  { key: 'meta', label: 'Meta (Facebook/Instagram)', color: '#2563eb' },
  { key: 'google', label: 'Google', color: '#16a34a' },
  { key: 'referral', label: 'Referral', color: '#d97706' },
  { key: 'chatgpt', label: 'ChatGPT / AI', color: '#7c3aed' },
  { key: 'other', label: 'Other', color: '#64748b' },
  { key: 'unknown', label: 'Unknown', color: '#94a3b8' },
];

const HEAR_ABOUT_KEY_BY_LABEL = HEAR_ABOUT_CATEGORIES.reduce((acc, item) => {
  acc[item.label] = item.key;
  return acc;
}, {});

function mondayKey(dateKey) {
  if (!dateKey) return null;
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  const offsetToMon = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offsetToMon);
  return d.toISOString().slice(0, 10);
}

function dateKeyInTimeZone(date = new Date(), timeZone = 'UTC') {
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
  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

function normalizeHearAboutCategoryLabel(rawLabel) {
  if (!rawLabel) return 'Unknown';
  if (HEAR_ABOUT_KEY_BY_LABEL[rawLabel]) return rawLabel;
  return 'Other';
}

// Shared identity helpers for additive funnel-unification analytics.
function normalizeEmailKey(value) {
  return String(value || '').trim().toLowerCase();
}

function parseEmailList(value) {
  return String(value || '')
    .split(',')
    .map((part) => normalizeEmailKey(part))
    .filter(Boolean);
}

function hubspotIdentityEmails(contact) {
  return Array.from(new Set([
    normalizeEmailKey(contact?.email),
    ...parseEmailList(contact?.hs_additional_emails),
  ].filter(Boolean)));
}

function hubspotIdentityKey(contact) {
  const emails = hubspotIdentityEmails(contact);
  if (emails.length > 0) return `email:${emails[0]}`;
  const id = Number(contact?.hubspot_contact_id);
  if (Number.isFinite(id)) return `id:${id}`;
  return null;
}

function normalizePersonNameKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]s\s*(iphone|ipad|android|galaxy|phone|pc|macbook|desktop|laptop)$/gi, '')
    .replace(/\((iphone|ipad|android|galaxy|phone)\)$/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDateKeyLoose(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDaysKey(dateKey, days) {
  if (!dateKey) return dateKey;
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateKeyToUtcDate(dateKey) {
  if (!dateKey) return null;
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetweenDateKeys(laterDateKey, earlierDateKey) {
  const later = dateKeyToUtcDate(laterDateKey);
  const earlier = dateKeyToUtcDate(earlierDateKey);
  if (!later || !earlier) return null;
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

function summarizeLeadQualificationAndQuality(leadRows) {
  const rows = Array.isArray(leadRows) ? leadRows : [];
  const qualityCounts = { bad: 0, ok: 0, good: 0, great: 0, unknown: 0 };
  let qualified = 0;
  let officialQualified = 0;
  let fallbackQualified = 0;

  for (const row of rows) {
    const revenue = parseOfficialRevenue(row?.revenueOfficial ?? row?.revenue);
    const qualityTier = leadQualityTierFromOfficialRevenue(revenue);
    const qualification = evaluateLeadQualification({
      revenue: {
        annual_revenue_in_dollars__official_: row?.revenueOfficial,
        annual_revenue_in_dollars: row?.revenue,
      },
      sobrietyDate: row?.sobrietyDate,
    });

    if (qualityCounts[qualityTier] !== undefined) qualityCounts[qualityTier] += 1;
    if (qualification.qualified) {
      qualified += 1;
      if (qualification.qualificationBasis === 'official') officialQualified += 1;
      if (qualification.qualificationBasis === 'fallback') fallbackQualified += 1;
    }
  }

  const total = rows.length;
  const nonQualified = Math.max(0, total - qualified);
  const fallbackSharePct = qualified > 0 ? fallbackQualified / qualified : null;
  return {
    total,
    qualified,
    nonQualified,
    qualityCounts,
    qualificationBasis: {
      official_qualified_count: officialQualified,
      fallback_qualified_count: fallbackQualified,
      fallback_share_pct: fallbackSharePct,
    },
  };
}

function formatDateKeyShort(dateKey) {
  const d = dateKeyToUtcDate(dateKey);
  if (!d) return dateKey || 'N/A';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function formatWeekKeyLabel(weekKey) {
  const d = dateKeyToUtcDate(weekKey);
  if (!d) return weekKey || 'N/A';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function hubspotFullName(contact) {
  return `${String(contact?.firstname || '').trim()} ${String(contact?.lastname || '').trim()}`.trim();
}

function hubspotContactCreatedTs(contact) {
  const ts = Date.parse(contact?.createdate || '');
  return Number.isFinite(ts) ? ts : 0;
}

const HUBSPOT_REVENUE_FIELDS = [
  'annual_revenue_in_usd_official',
  'annual_revenue_in_dollars__official_',
  'annual_revenue_in_dollars',
  'annual_revenue',
];

const HUBSPOT_SOBRIETY_FIELDS = [
  'sobriety_date',
  'sobriety_date__official_',
  'sober_date',
  'clean_date',
  'sobrietydate',
];

function hubspotFirstPresentField(contact, fieldNames = []) {
  for (const fieldName of fieldNames) {
    const value = contact?.[fieldName];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function hubspotSobrietyValue(contact) {
  return hubspotFirstPresentField(contact, HUBSPOT_SOBRIETY_FIELDS);
}

function hubspotRevenueOfficialValue(contact) {
  const officialRaw = hubspotFirstPresentField(contact, HUBSPOT_REVENUE_FIELDS.slice(0, 2));
  if (officialRaw !== null && officialRaw !== undefined && officialRaw !== '') {
    const official = Number(officialRaw);
    if (Number.isFinite(official)) return official;
  }
  return null;
}

function hubspotContactQualityScore(contact) {
  let score = 0;
  if (hubspotRevenueOfficialValue(contact) !== null) score += 4;
  else if (contact?.annual_revenue_in_dollars !== null && contact?.annual_revenue_in_dollars !== undefined && contact?.annual_revenue_in_dollars !== '') score += 2;
  if (hubspotSobrietyValue(contact)) score += 1;
  if (contact?.hs_analytics_source) score += 2;
  if (contact?.hs_analytics_source_data_1) score += 1;
  if (contact?.hs_analytics_source_data_2) score += 1;
  if (contact?.hs_additional_emails) score += 1;
  return score;
}

function pickBestHubspotContact(candidates, eventDateKey) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const eventTs = eventDateKey ? Date.parse(`${eventDateKey}T00:00:00.000Z`) : NaN;
  const ranked = candidates.map((candidate) => {
    const createdTs = hubspotContactCreatedTs(candidate);
    const distance = Number.isFinite(eventTs) ? Math.abs(eventTs - createdTs) : Number.POSITIVE_INFINITY;
    return {
      candidate,
      createdTs,
      distance,
      score: hubspotContactQualityScore(candidate),
    };
  }).sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.createdTs - b.createdTs; // oldest wins tie for merge/original-source anchoring
  });
  return ranked[0]?.candidate || candidates[0];
}

function hubspotSourceBucket(contact) {
  const src = String(contact?.hs_analytics_source || '').trim().toUpperCase();
  if (!src) return 'Unknown';
  if (src === 'PAID_SOCIAL') return 'Paid Social (Meta)';
  if (src === 'ORGANIC_SEARCH') return 'Organic Search';
  if (src === 'REFERRALS') return 'Referral';
  if (src === 'SOCIAL_MEDIA') return 'Social (Organic)';
  if (src === 'PAID_SEARCH') return 'Paid Search';
  if (src === 'DIRECT_TRAFFIC') return 'Direct';
  if (src === 'EMAIL_MARKETING') return 'Email';
  return src.replace(/_/g, ' ');
}

function isPaidSocialHubspot(row) {
  const blob = [row?.hs_analytics_source, row?.hs_latest_source, row?.original_traffic_source].join(' ').toUpperCase();
  return blob.includes('PAID_SOCIAL');
}

function isPhoenixHubspot(row) {
  const blob = [row?.hs_analytics_source_data_2, row?.hs_latest_source_data_2, row?.campaign, row?.campaign_source, row?.membership_s].join(' ').toLowerCase();
  return blob.includes('phoenix');
}

function hubspotRevenueValue(contact) {
  return parseOfficialRevenue(contact);
}

function mapZoomMatchTypeToConfidence(matchType, matchedHubspot) {
  const mt = String(matchType || '').toLowerCase();
  if (!matchedHubspot) return 'unmatched';
  if (mt.includes('exact_name')) return 'full_name';
  if (mt.includes('first_last_initial')) return 'fuzzy_name';
  if (mt.includes('first_prefix_last_initial')) return 'fuzzy_name';
  if (mt.includes('ambiguous')) return 'unmatched';
  if (mt.includes('not_found')) return 'unmatched';
  return 'full_name';
}

// ─── Change badge ─────────────────────────────────────────────────────────────
function ChangeBadge({ changePct, invertColor }) {
  if (changePct === null || changePct === undefined) return <span style={{ fontSize: '11px', color: '#94a3b8' }}>—</span>;
  const up = changePct >= 0;
  const better = invertColor ? !up : up;
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, color: better ? '#16a34a' : '#dc2626', marginLeft: '4px' }}>
      {up ? '↑' : '↓'} {Math.abs(changePct * 100).toFixed(1)}%
    </span>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skeleton({ h = '20px', w = '100%', mb = '0' }) {
  return (
    <div style={{ height: h, width: w, backgroundColor: '#e2e8f0', borderRadius: '6px', marginBottom: mb, animation: 'pulse 1.5s infinite' }} />
  );
}

function GroupSkeleton() {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Skeleton h="22px" w="180px" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '10px' }}>
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h="60px" />)}
      </div>
    </div>
  );
}

// ─── Metric cell ──────────────────────────────────────────────────────────────
function MetricCell({ label, value, changePct, onClick, invertColor, formatFn = fmt.currency }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...subCard,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = '0 0 0 2px #0f766e'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
        {formatFn(value)}
        {changePct !== undefined && <ChangeBadge changePct={changePct} invertColor={invertColor} />}
      </p>
    </div>
  );
}

function ExecutiveKpiCard({ label, value, note, changePct, format = 'count', invertColor = false, color = '#0f766e' }) {
  const formatter = format === 'currency' ? fmt.currency : format === 'percent' ? fmt.pct : fmt.int;
  return (
    <div
      style={{
        background: 'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
      }}
    >
      <p style={{ margin: 0, fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>
        {label}
      </p>
      <p style={{ margin: '10px 0 0', fontSize: '30px', lineHeight: 1.1, color: '#0f172a', fontWeight: 800 }}>
        {formatter(value)}
        {(changePct !== null && changePct !== undefined) && <ChangeBadge changePct={changePct} invertColor={invertColor} />}
      </p>
      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '999px', backgroundColor: color }} />
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{note}</p>
      </div>
    </div>
  );
}

function ProgressGapBar({ label, current, target, format = 'count', color = '#0f766e' }) {
  const formatter = format === 'currency' ? fmt.currency : format === 'percent' ? fmt.pct : fmt.int;
  const safeCurrent = Number.isFinite(Number(current)) ? Number(current) : 0;
  const safeTarget = Number.isFinite(Number(target)) ? Number(target) : null;
  const pct = safeTarget && safeTarget > 0 ? Math.min(100, (safeCurrent / safeTarget) * 100) : null;
  const gap = safeTarget !== null ? Math.max(0, safeTarget - safeCurrent) : null;

  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: '12px', color: '#334155', fontWeight: 700 }}>{label}</p>
        <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>
          Current {formatter(safeCurrent)}{safeTarget !== null ? ` / Target ${formatter(safeTarget)}` : ''}
        </p>
      </div>
      <div style={{ marginTop: '8px', height: '10px', borderRadius: '999px', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${pct || 0}%`, height: '100%', backgroundColor: color }} />
      </div>
      <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
        {gap === null ? 'No prior efficiency baseline in comparison window.' : gap > 0 ? `Gap: ${formatter(gap)}` : 'On or above target.'}
      </p>
    </div>
  );
}

// ─── Category bar ─────────────────────────────────────────────────────────────
const TIER_COLORS = { great: '#16a34a', qualified: '#2563eb', ok: '#b45309', bad: '#dc2626', unknown: '#94a3b8' };
const TIER_LABELS = { great: 'Great >=$1M', qualified: 'Good $250k-$999,999', ok: 'OK $100k-$249k', bad: 'Bad <$100k', unknown: 'Unknown' };

function CategoryRow({ cat, total }) {
  if (!cat) return null;
  const tiers = ['great', 'qualified', 'ok', 'bad', 'unknown'];
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '4px', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
        {tiers.map((t) => {
          const pct = total > 0 ? ((cat[t] || 0) / total) * 100 : 0;
          return pct > 0 ? <div key={t} style={{ width: `${pct}%`, backgroundColor: TIER_COLORS[t] }} title={`${TIER_LABELS[t]}: ${cat[t]}`} /> : null;
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
        {tiers.map((t) => cat[t] > 0 && (
          <span key={t} style={{ fontSize: '11px', color: TIER_COLORS[t], fontWeight: 600 }}>
            {TIER_LABELS[t]}: {cat[t]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Mismatch warning ─────────────────────────────────────────────────────────
function MismatchWarning({ cat }) {
  if (!cat?.mismatch || !cat?.unmatched?.length) return null;
  return (
    <div style={{ marginTop: '10px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '10px' }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: '12px', color: '#9a3412' }}>
        ⚠ Categorization mismatch: Meta shows {cat.total} leads, {cat.categorizedTotal} matched in HubSpot
      </p>
      <div style={{ marginTop: '6px', maxHeight: '100px', overflowY: 'auto' }}>
        {cat.unmatched.slice(0, 8).map((u, i) => (
          <p key={i} style={{ margin: '2px 0', fontSize: '11px', color: '#9a3412' }}>
            • {u.name || '(unnamed)'} {u.email ? `(${u.email})` : ''} — {u.reason}
          </p>
        ))}
        {cat.unmatched.length > 8 && (
          <p style={{ margin: '2px 0', fontSize: '11px', color: '#9a3412' }}>…and {cat.unmatched.length - 8} more</p>
        )}
      </div>
    </div>
  );
}

// ─── Single group/subrow panel ────────────────────────────────────────────────
function GroupPanel({ label, snap, prevSnap, onOpenModal }) {
  if (!snap) return null;
  const diff = (field) => {
    if (!prevSnap) return undefined;
    const { pct } = computeChangePct(snap[field] ?? 0, prevSnap[field] ?? 0);
    return pct;
  };
  const costDiff = (field) => {
    if (!prevSnap) return undefined;
    // For cost metrics, lower is better — we flip the sign for display
    const cur = snap[field] ?? 0, prev = prevSnap[field] ?? 0;
    if (!prev) return undefined;
    return (cur - prev) / prev;
  };

  return (
    <div style={{ ...subCard, marginBottom: '12px' }}>
      <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#334155' }}>{label}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '8px' }}>
        <MetricCell label="Ad Spend" value={snap.spend} changePct={costDiff('spend')} invertColor={true} formatFn={fmt.currency} />
        <MetricCell label="Impressions" value={snap.impressions} changePct={diff('impressions')} formatFn={fmt.int} />
        <MetricCell label="Clicks" value={snap.clicks} changePct={diff('clicks')} formatFn={fmt.int} />
        <MetricCell
          label="Leads Generated"
          value={snap.metaLeads}
          changePct={diff('metaLeads')}
          formatFn={fmt.int}
          onClick={() => onOpenModal('leads', snap, label)}
        />
        <MetricCell label="CPL" value={snap.cpl} changePct={costDiff('cpl')} invertColor={true} formatFn={fmt.currency} />
        <MetricCell
          label="Luma Registrations"
          value={snap.lumaRegistrations}
          changePct={diff('lumaRegistrations')}
          formatFn={fmt.int}
          onClick={() => onOpenModal('luma', snap, label)}
        />
        <MetricCell
          label="Zoom Show-Ups"
          value={snap.zoomShowUps}
          changePct={diff('zoomShowUps')}
          formatFn={fmt.int}
          onClick={() => onOpenModal('zoom', snap, label)}
        />
        <MetricCell label="Cost / Registration" value={snap.costPerRegistration} changePct={costDiff('costPerRegistration')} invertColor={true} formatFn={fmt.currency} />
        <MetricCell label="Cost / Show-Up" value={snap.costPerShowUp} changePct={costDiff('costPerShowUp')} invertColor={true} formatFn={fmt.currency} />
      </div>
      <CategoryRow cat={snap.categorization} total={snap.metaLeads} />
      <MismatchWarning cat={snap.categorization} />
    </div>
  );
}

// ─── AI Insights panel ────────────────────────────────────────────────────────
function AIInsightsPanel({ supabaseUrl, supabaseKey, groupedData }) {
  const [aiData, setAiData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [adModal, setAdModal] = useState(null);
  const [error, setError] = useState(null);
  const [notionModal, setNotionModal] = useState({ open: false, taskName: '' });

  const runProviderAnalysis = useCallback(async (provider) => {
    if (!groupedData) return;
    const modeByProvider = {
      openai: 'analyze_openai',
      gemini: 'analyze_gemini',
    };
    const mode = modeByProvider[provider];
    if (!mode) return;
    setLoading(true); setError(null);
    setLoadingProvider(provider);
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-leads-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({
          mode,
          dateLabel: groupedData.dateRange?.current?.label || 'Selected Period',
          currentData: groupedData.current,
          previousData: groupedData.previous,
        }),
      });
      const json = await resp.json();
      if (json.ok) {
        setAiData(prev => ({
          ...(prev || {}),
          provider: json.provider || provider,
          ...(json.claude ? { claude: json.claude } : {}),
          ...(json.openai ? { openai: json.openai } : {}),
          ...(json.gemini ? { gemini: json.gemini } : {}),
          ...(Array.isArray(json.consensus) && json.consensus.length ? { consensus: json.consensus } : {}),
          ...(Array.isArray(json.autonomous_actions) ? { autonomous_actions: json.autonomous_actions } : {}),
          ...(Array.isArray(json.human_actions) ? { human_actions: json.human_actions } : {}),
        }));
      }
      else setError(json.error || 'Unknown error');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingProvider(null);
    }
  }, [groupedData, supabaseUrl, supabaseKey]);

  const generateAd = useCallback(async () => {
    if (!groupedData) return;
    setLoading(true);
    setLoadingProvider('generate_ad');
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-leads-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({ mode: 'generate_ad', currentData: groupedData.current }),
      });
      const json = await resp.json();
      if (json.ok) setAdModal(json.ad_copy);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingProvider(null);
    }
  }, [groupedData, supabaseUrl, supabaseKey]);

  const AIPanel = ({ title, data, color }) => (
    <div style={{ flex: 1, minWidth: '220px', backgroundColor: '#f8fafc', borderRadius: '12px', padding: '14px', border: `2px solid ${color}22` }}>
      <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
      {data ? (
        <>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#334155', lineHeight: 1.5 }}>{data.summary}</p>
          <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
            {(data.insights || []).map((ins, i) => (
              <li key={i} style={{ fontSize: '11px', color: '#475569', marginBottom: '4px', lineHeight: 1.4 }}>{ins}</li>
            ))}
          </ul>
          {data.is_mock && <p style={{ margin: '8px 0 0', fontSize: '10px', color: '#94a3b8' }}>Mock response — real API pending</p>}
          {data.provider_error && <p style={{ margin: '8px 0 0', fontSize: '10px', color: '#b91c1c' }}>Provider error: {data.provider_error}</p>}
        </>
      ) : (
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Click an analyst button (OpenAI or Gemini) to run on-demand analysis.</p>
      )}
    </div>
  );

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>🤖 AI Manager Insights</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>On-demand leads analysis. OpenAI and Gemini run through the Supabase Edge Function using server-side secrets.</p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#92400e', fontWeight: 600 }}>Recommended future: automatic weekly analysis (saved history). For now, run on demand only.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => runProviderAnalysis('openai')} disabled={loading} style={{ padding: '8px 16px', backgroundColor: '#166534', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loadingProvider === 'openai' ? '⏳ Running OpenAI…' : '▶ Run OpenAI Analysis'}
          </button>
          <button onClick={() => runProviderAnalysis('gemini')} disabled={loading} style={{ padding: '8px 16px', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loadingProvider === 'gemini' ? '⏳ Running Gemini…' : '▶ Run Gemini Analysis'}
          </button>
          <button disabled={true} title="Claude key not configured yet" style={{ padding: '8px 16px', backgroundColor: '#e2e8f0', color: '#64748b', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'not-allowed' }}>
            Claude (Key Needed)
          </button>
          <button onClick={generateAd} disabled={loading} style={{ padding: '8px 16px', backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            ✨ Generate Ad
          </button>
        </div>
      </div>

      {error && <div style={{ backgroundColor: '#fee2e2', borderRadius: '8px', padding: '10px', marginBottom: '12px', fontSize: '12px', color: '#991b1b' }}>Error: {error}</div>}

      {/* Three AI panels */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <AIPanel title="Claude" data={aiData?.claude} color="#d97706" />
        <AIPanel title="OpenAI" data={aiData?.openai} color="#16a34a" />
        <AIPanel title="Gemini" data={aiData?.gemini} color="#2563eb" />
      </div>

      {/* Consensus */}
      {aiData?.consensus?.length > 0 && (
        <div style={{ backgroundColor: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '13px', color: '#166534' }}>✅ Where All AIs Agree</p>
          {aiData.consensus.map((c, i) => (
            <p key={i} style={{ margin: '4px 0', fontSize: '12px', color: '#166534' }}>• {c}</p>
          ))}
        </div>
      )}

      {/* Recommended Actions */}
      {aiData && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '12px' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '12px', color: '#1e40af' }}>✅ AI Can Do Autonomously</p>
              {(aiData.autonomous_actions || []).map((a, i) => <p key={i} style={{ margin: '3px 0', fontSize: '11px', color: '#1e40af' }}>• {a}</p>)}
            </div>
            <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '12px', padding: '12px' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '12px', color: '#854d0e' }}>👤 Requires Human</p>
              {(aiData.human_actions || []).map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', margin: '3px 0' }}>
                  <p style={{ margin: 0, fontSize: '11px', color: '#854d0e', flex: 1 }}>• {a}</p>
                  <button
                    onClick={() => setNotionModal({ open: true, taskName: a })}
                    title="Send to Notion To-Do"
                    style={{
                      flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '3px 8px', borderRadius: '6px', border: '1px solid #d4d4d4',
                      backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer',
                      fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                  >
                    <span style={{ fontWeight: 800, fontSize: '11px' }}>N</span> → Notion
                  </button>
                </div>
              ))}
            </div>
          </div>
          <SendToNotionModal
            isOpen={notionModal.open}
            onClose={() => setNotionModal({ open: false, taskName: '' })}
            defaultTaskName={notionModal.taskName}
          />
        </>
      )}

      {/* Ad copy modal */}
      {adModal && (
        <div style={{ marginTop: '16px', backgroundColor: '#1e1b4b', borderRadius: '12px', padding: '16px', color: '#e0e7ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>✨ Generated Ad Copy</p>
            <button onClick={() => setAdModal(null)} style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', fontSize: '14px' }}>✕</button>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#fff' }}>{adModal.headline}</p>
          <p style={{ margin: '0 0 6px', fontSize: '12px', lineHeight: 1.6 }}>{adModal.primary_text}</p>
          <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 600, color: '#a5b4fc' }}>CTA: {adModal.call_to_action}</p>
          <p style={{ margin: 0, fontSize: '10px', color: '#6366f1' }}>{adModal.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Date range filter ────────────────────────────────────────────────────────
const RANGE_OPTIONS = [
  { value: 'this_week', label: 'This Week (to date)' },
  { value: 'this_month', label: 'This Month (to date)' },
  { value: 'this_quarter', label: 'This Quarter (to date)' },
  { value: 'this_year', label: 'This Year (to date)' },
  { value: 'last_week', label: 'Last Week (Mon–Sun)' },
  { value: 'last_2_weeks', label: 'Last 2 Weeks' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
];

function DateRangeFilter({ rangeType, setRangeType, customStart, setCustomStart, customEnd, setCustomEnd, windows }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <select
        value={rangeType}
        onChange={(e) => setRangeType(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#334155', backgroundColor: '#fff' }}
      >
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {rangeType === 'custom' && (
        <>
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>→</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
        </>
      )}
      {windows?.current && (
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {windows.current.start} → {windows.current.end}
          {windows.previous && <span style={{ color: '#94a3b8' }}> vs {windows.previous.start} → {windows.previous.end}</span>}
        </span>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function LeadsDashboard() {
  // Legacy analytics (powers existing charts below the new groups)
  const [analytics, setAnalytics] = useState(null);
  const [loadErrors, setLoadErrors] = useState([]);
  const [loading, setLoading] = useState(true);

  // Raw rows for group analytics
  const [rawAds, setRawAds] = useState([]);
  const [rawHubspot, setRawHubspot] = useState([]);
  const [rawLuma, setRawLuma] = useState([]);
  const [rawZoom, setRawZoom] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [rawHubspotActivities, setRawHubspotActivities] = useState([]);
  const [rawHubspotActivityAssociations, setRawHubspotActivityAssociations] = useState([]);
  const [rawZoomHubspotMappings, setRawZoomHubspotMappings] = useState([]);

  // Date range state
  const [rangeType, setRangeType] = useState('last_week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Drill-down modal state
  const [modal, setModal] = useState(null); // { title, columns, rows }
  const [managerNotionModal, setManagerNotionModal] = useState({ open: false, taskName: '' });
  const [deferredInsightsReady, setDeferredInsightsReady] = useState(false);

  // Legacy drilldown
  const [drilldownWindowKey, setDrilldownWindowKey] = useState('monthCurrent');
  const [drilldownMetricKey, setDrilldownMetricKey] = useState('leads');
  const [legacyComparisonOpen, setLegacyComparisonOpen] = useState(false);
  const [factCheckDrilldownOpen, setFactCheckDrilldownOpen] = useState(false);

  // Supabase connection info for AI panel
  const supabaseUrl = SUPABASE_URL;
  const supabaseKey = SUPABASE_ANON_KEY;

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) {
      setDeferredInsightsReady(false);
      return undefined;
    }
    const timer = setTimeout(() => setDeferredInsightsReady(true), 0);
    return () => clearTimeout(timer);
  }, [loading, rawAds.length, rawHubspot.length, rawLuma.length, rawZoom.length]);

  async function loadOptionalHubspotActivityEnrichment({ startKey, attributionStartKey }) {
    const enrichmentErrors = [];
    let hubspotActivitiesData = [];
    let hubspotActivityAssociationsData = [];
    let zoomHubspotMappingsData = [];

    try {
      const activitiesR = await supabase.from('raw_hubspot_meeting_activities')
        .select('hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title,metadata')
        .or(`hs_timestamp.gte.${attributionStartKey}T00:00:00.000Z,created_at_hubspot.gte.${attributionStartKey}T00:00:00.000Z`)
        .order('hs_timestamp', { ascending: true });

      if (activitiesR.error) {
        enrichmentErrors.push(`HubSpot call/activity mapping tables not available yet: ${activitiesR.error.message}`);
      } else {
        hubspotActivitiesData = activitiesR.data || [];
      }

      const zoomMappingsR = await supabase.from('zoom_attendee_hubspot_mappings')
        .select('session_date,meeting_id,zoom_session_key,zoom_attendee_canonical_name,hubspot_contact_id,hubspot_email,hubspot_activity_id,activity_type,mapping_source,mapping_confidence,mapping_reason,match_note')
        .gte('session_date', startKey)
        .order('session_date', { ascending: true });

      if (zoomMappingsR.error) {
        enrichmentErrors.push(`Zoom attendee HubSpot mapping table not available yet: ${zoomMappingsR.error.message}`);
      } else {
        zoomHubspotMappingsData = zoomMappingsR.data || [];
      }

      const activityIds = Array.from(new Set(
        (hubspotActivitiesData || [])
          .filter((row) => {
            const activityType = String(row?.activity_type || '').toLowerCase();
            return activityType === 'call' || activityType === 'meeting';
          })
          .map((row) => Number(row?.hubspot_activity_id))
          .filter((id) => Number.isFinite(id)),
      ));

      if (activityIds.length > 0) {
        const assocChunks = [];
        for (const ids of Array.from({ length: Math.ceil(activityIds.length / 100) }, (_, i) => activityIds.slice(i * 100, (i + 1) * 100))) {
          const assocR = await supabase.from('hubspot_activity_contact_associations')
            .select('hubspot_activity_id,activity_type,hubspot_contact_id,contact_email,contact_firstname,contact_lastname,association_type')
            .in('hubspot_activity_id', ids);
          if (assocR.error) {
            enrichmentErrors.push(`HubSpot activity associations unavailable: ${assocR.error.message}`);
            assocChunks.length = 0;
            break;
          }
          assocChunks.push(...(assocR.data || []));
        }
        hubspotActivityAssociationsData = assocChunks;
      }
    } catch (optionalErr) {
      enrichmentErrors.push(`Optional HubSpot activity enrichment failed: ${optionalErr.message}`);
    }

    setRawHubspotActivities(hubspotActivitiesData);
    setRawHubspotActivityAssociations(hubspotActivityAssociationsData);
    setRawZoomHubspotMappings(zoomHubspotMappingsData);
    if (enrichmentErrors.length > 0) {
      setLoadErrors((prev) => Array.from(new Set([...(prev || []), ...enrichmentErrors])));
    }
  }

  async function fetchData() {
    setLoading(true);
    setLoadErrors([]);
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - LOOKBACK_DAYS);
    const startKey = startDate.toISOString().slice(0, 10);
    const attributionStartDate = new Date();
    attributionStartDate.setUTCDate(attributionStartDate.getUTCDate() - ATTRIBUTION_HISTORY_DAYS);
    const attributionStartKey = attributionStartDate.toISOString().slice(0, 10);
    const errors = [];

    const [adsR, zoomR, hubspotR, aliasR] = await Promise.all([
      supabase.from('raw_fb_ads_insights_daily')
        .select('date_day,ad_account_id,funnel_key,campaign_name,adset_name,ad_name,ad_id,spend,impressions,clicks,leads')
        .gte('date_day', startKey).order('date_day', { ascending: true }),
      supabase.from('kpi_metrics')
        .select('metric_name,metric_value,metric_date,metadata')
        .eq('metric_name', 'Zoom Meeting Attendees')
        .gte('metric_date', startKey).order('metric_date', { ascending: true }),
      fetchLeadsHubspotContactsWithSchemaFallback({ attributionStartKey }),
      supabase.from('attendee_aliases').select('original_name,target_name'),
    ]);

    const lumaR = await supabase.from('raw_luma_registrations')
      .select('event_date,event_start_at,event_api_id,guest_api_id,guest_name,guest_email,registered_at,approval_status,is_thursday,matched_zoom,matched_zoom_net_new,matched_hubspot,matched_hubspot_tier,funnel_key,matched_hubspot_revenue,registration_answers,custom_source')
      .gte('event_date', attributionStartKey).order('event_date', { ascending: true });

    if (adsR.error) errors.push(`Meta ads unavailable: ${adsR.error.message}`);
    if (zoomR.error) errors.push(`Zoom data unavailable: ${zoomR.error.message}`);
    if (lumaR.error) errors.push(`Luma data unavailable: ${lumaR.error.message}`);
    if (hubspotR.error) errors.push(`HubSpot data unavailable: ${hubspotR.error.message}`);
    if (Array.isArray(hubspotR.schemaWarnings) && hubspotR.schemaWarnings.length > 0) {
      errors.push(...hubspotR.schemaWarnings);
    }
    if (aliasR.error) errors.push(`Alias data unavailable: ${aliasR.error.message}`);

    setRawAds(adsR.data || []);
    setRawZoom(zoomR.data || []);
    setRawLuma(lumaR.data || []);
    setRawHubspot(hubspotR.data || []);
    setAliases(aliasR.data || []);
    setRawHubspotActivities([]);
    setRawHubspotActivityAssociations([]);
    setRawZoomHubspotMappings([]);

    // Legacy analytics for charts
    const nextAnalytics = buildLeadAnalytics({
      adsRows: adsR.data || [],
      hubspotRows: hubspotR.data || [],
      zoomRows: zoomR.data || [],
      lumaRows: lumaR.data || [],
      aliases: aliasR.data || [],
      lookbackDays: LOOKBACK_DAYS,
      includeDrilldowns: false,
    });
    setAnalytics(nextAnalytics);

    setLoadErrors(errors);
    setLoading(false);
    // Hydrate optional identity/enrichment datasets after KPIs paint.
    void loadOptionalHubspotActivityEnrichment({ startKey, attributionStartKey });
  }

  useEffect(() => {
    if (!factCheckDrilldownOpen) return;
    if (!analytics?.drilldowns?.isDeferred) return;

    const drilldownReadyAnalytics = buildLeadAnalytics({
      adsRows: rawAds,
      hubspotRows: rawHubspot,
      zoomRows: rawZoom,
      lumaRows: rawLuma,
      aliases,
      lookbackDays: LOOKBACK_DAYS,
      includeDrilldowns: true,
    });
    setAnalytics(drilldownReadyAnalytics);
  }, [
    factCheckDrilldownOpen,
    analytics?.drilldowns?.isDeferred,
    rawAds,
    rawHubspot,
    rawZoom,
    rawLuma,
    aliases,
  ]);

  // Build date range windows
  const today = dateKeyInTimeZone(new Date(), 'America/New_York');
  const dateWindows = useMemo(() => buildDateRangeWindows(rangeType, customStart, customEnd, today), [rangeType, customStart, customEnd, today]);

  // Build grouped snapshot
  const groupedData = useMemo(() => {
    if (!rawAds.length && !rawHubspot.length) return null;
    return buildGroupedLeadsSnapshot({ adsRows: rawAds, hubspotRows: rawHubspot, lumaRows: rawLuma, zoomRows: rawZoom, dateRange: dateWindows });
  }, [rawAds, rawHubspot, rawLuma, rawZoom, dateWindows]);

  const hearAboutModule = useMemo(() => {
    const currentRows = groupedData?.current?.free?.combined?.lumaRows || [];
    const previousRows = groupedData?.previous?.free?.combined?.lumaRows || [];
    const total = currentRows.length;

    const summaryCounts = HEAR_ABOUT_CATEGORIES.reduce((acc, item) => ({ ...acc, [item.label]: 0 }), {});
    const previousCounts = HEAR_ABOUT_CATEGORIES.reduce((acc, item) => ({ ...acc, [item.label]: 0 }), {});

    currentRows.forEach((row) => {
      const label = normalizeHearAboutCategoryLabel(row?.hearAboutCategory);
      summaryCounts[label] = (summaryCounts[label] || 0) + 1;
    });
    previousRows.forEach((row) => {
      const label = normalizeHearAboutCategoryLabel(row?.hearAboutCategory);
      previousCounts[label] = (previousCounts[label] || 0) + 1;
    });

    const summary = HEAR_ABOUT_CATEGORIES.map((item) => {
      const count = summaryCounts[item.label] || 0;
      const prev = previousCounts[item.label] || 0;
      return {
        ...item,
        count,
        pct: total > 0 ? count / total : 0,
        prevCount: groupedData?.previous ? prev : null,
      };
    });

    const trendMap = new Map();
    currentRows.forEach((row) => {
      const week = mondayKey(row?.date);
      if (!week) return;
      if (!trendMap.has(week)) {
        const base = { week, label: week.slice(5), total: 0 };
        HEAR_ABOUT_CATEGORIES.forEach((item) => { base[item.key] = 0; });
        trendMap.set(week, base);
      }
      const point = trendMap.get(week);
      const label = normalizeHearAboutCategoryLabel(row?.hearAboutCategory);
      const key = HEAR_ABOUT_KEY_BY_LABEL[label] || 'other';
      point[key] += 1;
      point.total += 1;
    });

    const trendRows = Array.from(trendMap.values())
      .sort((a, b) => String(a.week).localeCompare(String(b.week)))
      .slice(-12);

    return { total, summary, trendRows };
  }, [groupedData]);

  const attendanceCostModule = useMemo(() => {
    const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
    const safeRatio = (n, d) => {
      const nn = Number(n);
      const dd = Number(d);
      if (!Number.isFinite(nn) || !Number.isFinite(dd) || dd === 0) return null;
      return nn / dd;
    };

    const historyZoomCounts = new Map();
    (rawLuma || []).forEach((row) => {
      const approval = String(row?.approval_status || 'approved').toLowerCase();
      if (approval && approval !== 'approved') return;
      const isThursday = row?.is_thursday === undefined ? true : !!row.is_thursday;
      if (!isThursday) return;
      if (!row?.matched_zoom) return;
      const email = normalizeEmail(row?.guest_email);
      if (!email) return;
      historyZoomCounts.set(email, (historyZoomCounts.get(email) || 0) + 1);
    });

    const sourceBucketFromRow = (row) => {
      const ots = String(row?.originalTrafficSource || '').trim().toUpperCase();
      if (ots && ots !== 'NOT FOUND') {
        if (ots === 'PAID_SOCIAL') return 'Paid Social (Meta)';
        if (ots === 'ORGANIC_SEARCH') return 'Organic Search';
        if (ots === 'REFERRALS') return 'Referral';
        if (ots === 'PAID_SEARCH') return 'Paid Search';
        if (ots === 'SOCIAL_MEDIA') return 'Social (Organic)';
        if (ots === 'DIRECT_TRAFFIC') return 'Direct';
        if (ots === 'EMAIL_MARKETING') return 'Email';
        return ots.replace(/_/g, ' ');
      }

      const heard = String(row?.hearAboutCategory || '').trim();
      if (heard === 'Meta (Facebook/Instagram)') return 'Paid Social (Meta)';
      if (heard === 'Google') return 'Organic Search';
      if (heard === 'Referral') return 'Referral';
      if (heard === 'ChatGPT / AI') return 'ChatGPT / AI';
      if (heard === 'Other') return 'Other';
      return 'Unknown';
    };

    const enrichRows = (rows) => (rows || []).map((row) => {
      const email = normalizeEmail(row?.email);
      const historyShowUps = email ? (historyZoomCounts.get(email) || 0) : 0;
      const revenueForGood = parseOfficialRevenue(row?.revenueOfficial ?? row?.revenue);
      const isRepeatMember = !!row?.matchedZoom && historyShowUps >= 2;
      const isGoodRepeatMember = !!row?.matchedZoom && historyShowUps >= 3 && Number.isFinite(revenueForGood) && revenueForGood >= 250000;
      const sourceBucket = sourceBucketFromRow(row);
      return {
        ...row,
        sourceBucket,
        repeatMember: isRepeatMember ? 'Yes' : 'No',
        goodRepeatMember: isGoodRepeatMember ? 'Yes' : 'No',
        _historyShowUps: historyShowUps,
        _isRepeatMember: isRepeatMember,
        _isGoodRepeatMember: isGoodRepeatMember,
      };
    });

    const aggregate = (rows, spend) => {
      const byBucket = new Map();
      const totalShowUps = rows.filter((r) => !!r?.matchedZoom).length;

      rows.forEach((row) => {
        const bucket = row.sourceBucket || 'Unknown';
        if (!byBucket.has(bucket)) {
          byBucket.set(bucket, {
            bucket,
            registrations: 0,
            showUps: 0,
            netNewShowUps: 0,
            repeatShowUpRows: 0,
            repeatMembers: new Set(),
            goodRepeatMembers: new Set(),
            rows: [],
          });
        }
        const agg = byBucket.get(bucket);
        agg.registrations += 1;
        agg.rows.push(row);
        if (row?.matchedZoom) agg.showUps += 1;
        if (row?.matchedZoomNetNew) agg.netNewShowUps += 1;
        if (row?._isRepeatMember && row?.matchedZoom) {
          agg.repeatShowUpRows += 1;
          const email = normalizeEmail(row?.email);
          if (email) agg.repeatMembers.add(email);
        }
        if (row?._isGoodRepeatMember && row?.matchedZoom) {
          const email = normalizeEmail(row?.email);
          if (email) agg.goodRepeatMembers.add(email);
        }
      });

      const sourceRows = Array.from(byBucket.values()).map((agg) => {
        const repeatMembers = agg.repeatMembers.size;
        const goodRepeatMembers = agg.goodRepeatMembers.size;
        const showUpRate = safeRatio(agg.showUps, agg.registrations);
        const pctOfShowUps = safeRatio(agg.showUps, totalShowUps);
        return {
          bucket: agg.bucket,
          registrations: agg.registrations,
          showUps: agg.showUps,
          netNewShowUps: agg.netNewShowUps,
          repeatShowUpRows: agg.repeatShowUpRows,
          repeatMembers,
          goodRepeatMembers,
          showUpRate,
          pctOfShowUps,
          rows: agg.rows
            .slice()
            .sort((a, b) => {
              if (!!a.matchedZoom !== !!b.matchedZoom) return a.matchedZoom ? -1 : 1;
              if (a._isGoodRepeatMember !== b._isGoodRepeatMember) return a._isGoodRepeatMember ? -1 : 1;
              if (a._isRepeatMember !== b._isRepeatMember) return a._isRepeatMember ? -1 : 1;
              const aRev = Number(a.revenueOfficial ?? a.revenue);
              const bRev = Number(b.revenueOfficial ?? b.revenue);
              const aHas = Number.isFinite(aRev);
              const bHas = Number.isFinite(bRev);
              if (aHas && bHas && aRev !== bRev) return bRev - aRev;
              if (aHas !== bHas) return aHas ? -1 : 1;
              return String(a.name || '').localeCompare(String(b.name || ''));
            }),
        };
      });

      sourceRows.sort((a, b) => {
        const aPriority = a.bucket === 'Paid Social (Meta)' ? -1 : 0;
        const bPriority = b.bucket === 'Paid Social (Meta)' ? -1 : 0;
        if (aPriority !== bPriority) return aPriority - bPriority;
        if (a.showUps !== b.showUps) return b.showUps - a.showUps;
        if (a.registrations !== b.registrations) return b.registrations - a.registrations;
        return a.bucket.localeCompare(b.bucket);
      });

      const paidRow = sourceRows.find((row) => row.bucket === 'Paid Social (Meta)') || null;
      const nonPaidRows = sourceRows.filter((row) => row.bucket !== 'Paid Social (Meta)');
      const nonPaidShowUps = nonPaidRows.reduce((sum, row) => sum + row.showUps, 0);
      const nonPaidRegs = nonPaidRows.reduce((sum, row) => sum + row.registrations, 0);

      const paid = {
        spend: Number(spend || 0),
        registrations: paidRow?.registrations || 0,
        showUps: paidRow?.showUps || 0,
        netNewShowUps: paidRow?.netNewShowUps || 0,
        repeatMembers: paidRow?.repeatMembers || 0,
        goodRepeatMembers: paidRow?.goodRepeatMembers || 0,
        showUpRate: paidRow?.showUpRate ?? null,
        costPerRegistration: paidRow ? safeRatio(spend, paidRow.registrations) : null,
        costPerShowUp: paidRow ? safeRatio(spend, paidRow.showUps) : null,
        costPerNetNewShowUp: paidRow ? safeRatio(spend, paidRow.netNewShowUps) : null,
        costPerRepeatMember: paidRow ? safeRatio(spend, paidRow.repeatMembers) : null,
        costPerGoodRepeatMember: paidRow ? safeRatio(spend, paidRow.goodRepeatMembers) : null,
      };

      return {
        spend: Number(spend || 0),
        totalRegistrations: rows.length,
        totalShowUps,
        totalNetNewShowUps: rows.filter((r) => !!r?.matchedZoomNetNew).length,
        paid,
        nonPaid: {
          registrations: nonPaidRegs,
          showUps: nonPaidShowUps,
          showUpRate: safeRatio(nonPaidShowUps, nonPaidRegs),
        },
        sourceRows,
      };
    };

    const currentRows = enrichRows(groupedData?.current?.free?.combined?.lumaRows || []);
    const previousRows = enrichRows(groupedData?.previous?.free?.combined?.lumaRows || []);
    const currentSpend = Number(groupedData?.current?.free?.combined?.spend || 0);
    const previousSpend = groupedData?.previous ? Number(groupedData?.previous?.free?.combined?.spend || 0) : null;

    return {
      current: aggregate(currentRows, currentSpend),
      previous: groupedData?.previous ? aggregate(previousRows, previousSpend) : null,
    };
  }, [groupedData, rawLuma]);

  const zoomSourceModule = useMemo(() => {
    const normalizeName = (value = '') => String(value || '')
      .toLowerCase()
      .replace(/['’]s\s*(iphone|ipad|android|galaxy|phone|pc|macbook|desktop|laptop)$/gi, '')
      .replace(/\((iphone|ipad|android|galaxy|phone)\)$/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const parseDateKey = (value) => {
      if (!value) return null;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };

    const toUtcDate = (dateKey) => new Date(`${dateKey}T00:00:00.000Z`);

    const dayTypeFromZoomMetric = (row) => {
      const metadata = row?.metadata || {};
      const group = String(metadata.group_name || '').toLowerCase();
      if (group === 'tuesday' || group === 'thursday') return group[0].toUpperCase() + group.slice(1);
      const meetingId = String(metadata.meeting_id || '');
      if (meetingId === '87199667045') return 'Tuesday';
      if (meetingId === '84242212480') return 'Thursday';
      const dateKey = parseDateKey(metadata.start_time || row?.metric_date);
      if (!dateKey) return 'Other';
      const dow = toUtcDate(dateKey).getUTCDay();
      if (dow === 2) return 'Tuesday';
      if (dow === 4) return 'Thursday';
      return 'Other';
    };

    const ET_TIMEZONE = 'America/New_York';
    const etDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: ET_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
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
    const hubspotCallScheduledMinuteByDay = {
      Tuesday: 12 * 60, // 12pm ET
      Thursday: 11 * 60, // 11am ET
    };
    const HUBSPOT_CALL_TIME_TOLERANCE_MINUTES = 120;

    const formatEtDateKey = (value) => {
      if (!value) return null;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      return etDateFormatter.format(d).replace(/\//g, '-');
    };

    const getEtTimeParts = (value) => {
      if (!value) return null;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      const weekdayShort = etWeekdayFormatter.format(d);
      const parts = etTimePartsFormatter.formatToParts(d);
      const hour = Number(parts.find((p) => p.type === 'hour')?.value || NaN);
      const minute = Number(parts.find((p) => p.type === 'minute')?.value || NaN);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
      const etDateKey = formatEtDateKey(d.toISOString());
      const dayType = weekdayShort === 'Tue' ? 'Tuesday' : (weekdayShort === 'Thu' ? 'Thursday' : null);
      const minuteOfDay = hour * 60 + minute;
      const expectedMinute = dayType ? hubspotCallScheduledMinuteByDay[dayType] : null;
      const minutesFromExpected = Number.isFinite(expectedMinute) ? Math.abs(minuteOfDay - expectedMinute) : null;
      return {
        etDateKey,
        weekdayShort,
        dayType,
        hour,
        minute,
        minuteOfDay,
        expectedMinute,
        minutesFromExpected,
      };
    };

    const dateInRange = (dateKey, startKey, endKey) => !!dateKey && dateKey >= startKey && dateKey <= endKey;
    const safeRatio = (n, d) => {
      const nn = Number(n);
      const dd = Number(d);
      if (!Number.isFinite(nn) || !Number.isFinite(dd) || dd === 0) return null;
      return nn / dd;
    };

    const contactCreatedTs = (row) => {
      const ts = Date.parse(row?.createdate || '');
      return Number.isFinite(ts) ? ts : 0;
    };

    const contactScore = (row) => {
      let score = 0;
      if (hubspotRevenueOfficialValue(row) !== null) score += 4;
      else if (row?.annual_revenue_in_dollars !== null && row?.annual_revenue_in_dollars !== undefined && row?.annual_revenue_in_dollars !== '') score += 2;
      if (hubspotSobrietyValue(row)) score += 1;
      if (row?.hs_analytics_source) score += 1;
      if (row?.hs_analytics_source_data_1) score += 1;
      if (row?.hs_analytics_source_data_2) score += 1;
      return score;
    };

    const fullNameFromContact = (row) => `${String(row?.firstname || '').trim()} ${String(row?.lastname || '').trim()}`.trim();

    const addIndexRow = (map, key, row) => {
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    };

    const nameTokens = (nameKey) => String(nameKey || '').split(' ').map((t) => t.trim()).filter(Boolean);

    const nameKeyVariants = (nameKey) => {
      const tokens = nameTokens(nameKey);
      if (tokens.length < 2) return { firstName: tokens[0] || '', firstLastInitial: null, firstPrefixLastInitial: null };
      const first = tokens[0];
      const last = tokens[tokens.length - 1];
      const lastInitial = last?.[0] || '';
      return {
        firstName: first,
        firstLastInitial: first && lastInitial ? `${first}|${lastInitial}` : null,
        firstPrefixLastInitial: first && first.length >= 3 && lastInitial ? `${first.slice(0, 3)}|${lastInitial}` : null,
      };
    };

    const hubspotByExactName = new Map();
    const hubspotById = new Map();
    const hubspotByFirstLastInitial = new Map();
    const hubspotByFirstPrefixLastInitial = new Map();
    const hubspotByFirstName = new Map();

    (rawHubspot || []).forEach((row) => {
      const id = Number(row?.hubspot_contact_id);
      if (Number.isFinite(id)) hubspotById.set(id, row);
      const full = fullNameFromContact(row);
      const key = normalizeName(full);
      if (!key) return;
      addIndexRow(hubspotByExactName, key, row);

      const variants = nameKeyVariants(key);
      if (variants.firstName) addIndexRow(hubspotByFirstName, variants.firstName, row);
      if (variants.firstLastInitial) addIndexRow(hubspotByFirstLastInitial, variants.firstLastInitial, row);
      if (variants.firstPrefixLastInitial) addIndexRow(hubspotByFirstPrefixLastInitial, variants.firstPrefixLastInitial, row);
    });

    const materializedZoomHubspotBySessionAttendee = new Map();
    const materializedZoomHubspotByDateAttendee = new Map();
    (rawZoomHubspotMappings || []).forEach((row) => {
      const sessionDate = parseDateKey(row?.session_date);
      const meetingId = String(row?.meeting_id || '');
      const attendeeKey = normalizeName(row?.zoom_attendee_canonical_name || '');
      const contactId = Number(row?.hubspot_contact_id);
      if (!sessionDate || !attendeeKey || !Number.isFinite(contactId)) return;
      const contact = hubspotById.get(contactId) || null;
      const hit = {
        row,
        contact,
        contactId,
        source: String(row?.mapping_source || ''),
        confidence: Number(row?.mapping_confidence),
        reason: String(row?.mapping_reason || ''),
      };
      materializedZoomHubspotBySessionAttendee.set(`${sessionDate}|${meetingId}|${attendeeKey}`, hit);
      addIndexRow(materializedZoomHubspotByDateAttendee, `${sessionDate}|${attendeeKey}`, hit);
    });

    const rankCandidates = (candidates, eventDateKey) => {
      const eventTs = eventDateKey ? Date.parse(`${eventDateKey}T00:00:00.000Z`) : NaN;
      const ranked = (candidates || []).map((candidate) => {
        const score = contactScore(candidate);
        const createdTs = contactCreatedTs(candidate);
        const distance = Number.isFinite(eventTs) ? Math.abs(eventTs - createdTs) : Number.POSITIVE_INFINITY;
        return { candidate, score, createdTs, distance };
      }).sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.createdTs - a.createdTs;
      });
      return ranked;
    };

    const candidateExamples = (candidates) => (candidates || [])
      .slice(0, 5)
      .map((row) => fullNameFromContact(row) || row?.email || 'Unknown')
      .filter(Boolean)
      .join(', ');

    const pickContactForAttendee = (nameKey, eventDateKey) => {
      const variants = nameKeyVariants(nameKey);
      const exactCandidates = hubspotByExactName.get(nameKey) || [];

      if (exactCandidates.length > 0) {
        const ranked = rankCandidates(exactCandidates, eventDateKey);
        return {
          contact: ranked[0]?.candidate || exactCandidates[0],
          matchType: exactCandidates.length === 1 ? 'exact_name' : 'exact_name_ambiguous',
          candidateCount: exactCandidates.length,
          lookupStrategy: 'exact_name',
          matchWhy: exactCandidates.length === 1 ? 'Exact normalized full-name match' : 'Exact name matched multiple HubSpot contacts; best candidate selected',
          candidateExamples: candidateExamples(exactCandidates),
        };
      }

      const initialCandidates = variants.firstLastInitial ? (hubspotByFirstLastInitial.get(variants.firstLastInitial) || []) : [];
      if (initialCandidates.length === 1) {
        return {
          contact: initialCandidates[0],
          matchType: 'first_last_initial',
          candidateCount: 1,
          lookupStrategy: 'first_last_initial',
          matchWhy: 'Matched by first name + last initial',
          candidateExamples: candidateExamples(initialCandidates),
        };
      }
      if (initialCandidates.length > 1) {
        return {
          contact: null,
          matchType: 'ambiguous_initial',
          candidateCount: initialCandidates.length,
          lookupStrategy: 'first_last_initial',
          matchWhy: 'Multiple HubSpot candidates matched first name + last initial; needs alias/manual resolution',
          candidateExamples: candidateExamples(initialCandidates),
        };
      }

      const prefixCandidates = variants.firstPrefixLastInitial ? (hubspotByFirstPrefixLastInitial.get(variants.firstPrefixLastInitial) || []) : [];
      if (prefixCandidates.length === 1) {
        return {
          contact: prefixCandidates[0],
          matchType: 'first_prefix_last_initial',
          candidateCount: 1,
          lookupStrategy: 'first_prefix_last_initial',
          matchWhy: 'Matched by first-name prefix + last initial',
          candidateExamples: candidateExamples(prefixCandidates),
        };
      }
      if (prefixCandidates.length > 1) {
        return {
          contact: null,
          matchType: 'ambiguous_prefix_initial',
          candidateCount: prefixCandidates.length,
          lookupStrategy: 'first_prefix_last_initial',
          matchWhy: 'Multiple HubSpot candidates matched first-name prefix + last initial; needs alias/manual resolution',
          candidateExamples: candidateExamples(prefixCandidates),
        };
      }

      const firstNameCandidates = variants.firstName ? (hubspotByFirstName.get(variants.firstName) || []) : [];
      if (firstNameCandidates.length > 0) {
        return {
          contact: null,
          matchType: 'no_exact_name_first_name_candidates',
          candidateCount: firstNameCandidates.length,
          lookupStrategy: 'first_name_only',
          matchWhy: 'No exact/initial match. HubSpot has same first name only; likely display-name mismatch or missing alias',
          candidateExamples: candidateExamples(firstNameCandidates),
        };
      }

      return {
        contact: null,
        matchType: 'not_found',
        candidateCount: 0,
        lookupStrategy: 'none',
        matchWhy: 'No HubSpot name candidates found',
        candidateExamples: '',
      };
    };

    const pickContactForZoomRow = (row) => {
      const sessionKey = `${row.date}|${String(row.meetingId || '')}|${row.attendeeKey}`;
      const materialized = materializedZoomHubspotBySessionAttendee.get(sessionKey);
      if (materialized?.contact) {
        return {
          contact: materialized.contact,
          matchType: 'hubspot_activity_materialized_session',
          candidateCount: 1,
          lookupStrategy: 'hubspot_meeting_activity_session',
          matchWhy: materialized.reason || 'Matched via materialized Zoom attendee -> HubSpot activity association',
          candidateExamples: materialized.contact ? (fullNameFromContact(materialized.contact) || materialized.contact?.email || '') : '',
        };
      }
      if (materialized && !materialized.contact) {
        return {
          contact: null,
          matchType: 'hubspot_activity_materialized_missing_contact',
          candidateCount: 1,
          lookupStrategy: 'hubspot_meeting_activity_session',
          matchWhy: `Materialized Zoom->HubSpot mapping exists (contact ${materialized.contactId}) but raw_hubspot_contacts is missing that contact row`,
          candidateExamples: `HubSpot:${materialized.contactId}`,
        };
      }

      const dateCandidates = materializedZoomHubspotByDateAttendee.get(`${row.date}|${row.attendeeKey}`) || [];
      const resolvedDateCandidates = dateCandidates.filter((hit) => !!hit?.contact);
      if (resolvedDateCandidates.length === 1) {
        return {
          contact: resolvedDateCandidates[0].contact,
          matchType: 'hubspot_activity_materialized_date',
          candidateCount: 1,
          lookupStrategy: 'hubspot_meeting_activity_date',
          matchWhy: resolvedDateCandidates[0].reason || 'Matched via materialized HubSpot activity association on same date',
          candidateExamples: fullNameFromContact(resolvedDateCandidates[0].contact) || resolvedDateCandidates[0].contact?.email || '',
        };
      }
      if (resolvedDateCandidates.length > 1) {
        const ranked = rankCandidates(resolvedDateCandidates.map((hit) => hit.contact), row.date);
        return {
          contact: ranked[0]?.candidate || null,
          matchType: 'hubspot_activity_materialized_date_ambiguous',
          candidateCount: resolvedDateCandidates.length,
          lookupStrategy: 'hubspot_meeting_activity_date',
          matchWhy: 'Multiple materialized HubSpot activity matches found on same date; best candidate selected',
          candidateExamples: candidateExamples(resolvedDateCandidates.map((hit) => hit.contact)),
        };
      }

      return pickContactForAttendee(row.attendeeKey, row.date);
    };

    const resolveRevenue = (contact) => {
      const official = hubspotRevenueOfficialValue(contact);
      const revenue = parseOfficialRevenue(contact);
      if (!Number.isFinite(revenue)) return { revenue: null, revenueOfficial: null };
      return { revenue, revenueOfficial: Number.isFinite(official) ? official : null };
    };

    const sourceBucketFromContact = (contact) => {
      const src = String(contact?.hs_analytics_source || '').trim().toUpperCase();
      if (!src) return 'Unknown';
      if (src === 'PAID_SOCIAL') {
        // Business rule: all HubSpot PAID_SOCIAL is treated as Meta paid for this dashboard.
        return 'Paid Social (Meta)';
      }
      if (src === 'ORGANIC_SEARCH') return 'Organic Search';
      if (src === 'REFERRALS') return 'Referral';
      if (src === 'DIRECT_TRAFFIC') return 'Direct';
      if (src === 'EMAIL_MARKETING') return 'Email';
      if (src === 'PAID_SEARCH') return 'Paid Search';
      if (src === 'SOCIAL_MEDIA') return 'Social (Organic)';
      return src.replace(/_/g, ' ');
    };

    const lumaEvidenceRows = [
      ...(groupedData?.current?.free?.combined?.lumaRows || []),
      ...(groupedData?.previous?.free?.combined?.lumaRows || []),
    ];

    const pickBestLumaEvidence = (existing, candidate) => {
      if (!existing) return candidate;
      const score = (row) => {
        let s = 0;
        if (row?.originalTrafficSource && row.originalTrafficSource !== 'Not Found') s += 4;
        if (row?.hearAboutCategory && row.hearAboutCategory !== 'Unknown') s += 2;
        if (row?.hearAboutSource === 'Luma Answer') s += 2;
        if (row?.adGroup && row.adGroup !== 'Not Found') s += 1;
        const showed = row?.matchedZoom ? 1 : 0;
        return s * 10 + showed;
      };
      return score(candidate) > score(existing) ? candidate : existing;
    };

    const lumaEvidenceByEmail = new Map();
    const lumaEvidenceByName = new Map();
    lumaEvidenceRows.forEach((row) => {
      const emailKey = String(row?.email || '').trim().toLowerCase();
      if (emailKey && emailKey !== 'not found') {
        lumaEvidenceByEmail.set(emailKey, pickBestLumaEvidence(lumaEvidenceByEmail.get(emailKey), row));
      }
      const nameKey = normalizeName(row?.name || '');
      if (nameKey) {
        lumaEvidenceByName.set(nameKey, pickBestLumaEvidence(lumaEvidenceByName.get(nameKey), row));
      }
    });

    const sourceBucketFromLumaEvidence = (row) => {
      if (!row) return { bucket: 'Unknown', method: 'No Luma Evidence' };
      const ots = String(row?.originalTrafficSource || '').trim().toUpperCase();
      const heard = String(row?.hearAboutCategory || '').trim();
      const heardBucket =
        heard === 'Meta (Facebook/Instagram)' ? { bucket: 'Paid Social (Meta)', method: 'Luma How Heard' } :
          heard === 'Google' ? { bucket: 'Organic Search', method: 'Luma How Heard' } :
            heard === 'Referral' ? { bucket: 'Referral', method: 'Luma How Heard' } :
              heard === 'ChatGPT / AI' ? { bucket: 'ChatGPT / AI', method: 'Luma How Heard' } :
                heard === 'Other' ? { bucket: 'Other', method: 'Luma How Heard' } :
                  { bucket: 'Unknown', method: 'No Luma Attribution' };

      // OFFLINE on the Lu.ma-linked HubSpot contact is often just integration/record-creation path.
      // If self-reported "How heard" has a stronger signal, prefer it.
      if (ots === 'OFFLINE' && heardBucket.bucket !== 'Unknown' && heardBucket.bucket !== 'Other') {
        return { ...heardBucket, method: `${heardBucket.method} (preferred over Lu.ma HubSpot OFFLINE)` };
      }
      if (ots && ots !== 'NOT FOUND') {
        if (ots === 'PAID_SOCIAL') return { bucket: 'Paid Social (Meta)', method: 'Luma HubSpot Original Source' };
        if (ots === 'ORGANIC_SEARCH') return { bucket: 'Organic Search', method: 'Luma HubSpot Original Source' };
        if (ots === 'REFERRALS') return { bucket: 'Referral', method: 'Luma HubSpot Original Source' };
        if (ots === 'DIRECT_TRAFFIC') return { bucket: 'Direct', method: 'Luma HubSpot Original Source' };
        if (ots === 'EMAIL_MARKETING') return { bucket: 'Email', method: 'Luma HubSpot Original Source' };
        if (ots === 'PAID_SEARCH') return { bucket: 'Paid Search', method: 'Luma HubSpot Original Source' };
        if (ots === 'SOCIAL_MEDIA') return { bucket: 'Social (Organic)', method: 'Luma HubSpot Original Source' };
        return { bucket: ots.replace(/_/g, ' '), method: 'Luma HubSpot Original Source' };
      }
      return heardBucket;
    };

    const activityAssocKey = (activityType, activityId) => `${String(activityType || '').toLowerCase()}:${Number(activityId)}`;
    const hubspotAssocByActivityId = new Map();
    (rawHubspotActivityAssociations || []).forEach((assoc) => {
      const activityType = String(assoc?.activity_type || '').toLowerCase();
      if (activityType !== 'call' && activityType !== 'meeting') return;
      const activityId = Number(assoc?.hubspot_activity_id);
      if (!Number.isFinite(activityId)) return;
      const key = activityAssocKey(activityType, activityId);
      if (!hubspotAssocByActivityId.has(key)) hubspotAssocByActivityId.set(key, []);
      hubspotAssocByActivityId.get(key).push(assoc);
    });

    const zoomRowsByDateDay = new Map();
    (rawZoom || [])
      .filter((row) => row?.metric_name === 'Zoom Meeting Attendees')
      .forEach((row) => {
        const dateKey = parseDateKey(row?.metadata?.start_time || row?.metric_date);
        if (!dateKey) return;
        const dayType = dayTypeFromZoomMetric(row);
        if (dayType !== 'Tuesday' && dayType !== 'Thursday') return;
        const attendees = Array.isArray(row?.metadata?.attendees) ? row.metadata.attendees : [];
        const key = `${dateKey}|${dayType}`;
        if (!zoomRowsByDateDay.has(key)) {
          zoomRowsByDateDay.set(key, { rowCount: 0, maxAttendees: 0, meetingIds: new Set() });
        }
        const agg = zoomRowsByDateDay.get(key);
        agg.rowCount += 1;
        agg.maxAttendees = Math.max(agg.maxAttendees, attendees.length);
        if (row?.metadata?.meeting_id) agg.meetingIds.add(String(row.metadata.meeting_id));
      });

    const hubspotCallCandidatesByDateDay = new Map();
    (rawHubspotActivities || []).forEach((activity) => {
      const activityType = String(activity?.activity_type || '').toLowerCase();
      if (activityType !== 'call' && activityType !== 'meeting') return;
      const activityId = Number(activity?.hubspot_activity_id);
      if (!Number.isFinite(activityId)) return;
      const ts = activity?.hs_timestamp || activity?.created_at_hubspot;
      const et = getEtTimeParts(ts);
      if (!et?.dayType || !et?.etDateKey) return;
      if (!Number.isFinite(Number(et.minutesFromExpected)) || Number(et.minutesFromExpected) > HUBSPOT_CALL_TIME_TOLERANCE_MINUTES) return;

      const assocs = hubspotAssocByActivityId.get(activityAssocKey(activityType, activityId)) || [];
      const attendeeCount = assocs
        .filter((a) => Number.isFinite(Number(a?.hubspot_contact_id)) || normalizeEmailKey(a?.contact_email))
        .length;
      if (attendeeCount < MIN_GROUP_ATTENDEES) return;

      const title = String(activity?.title || '').trim();
      const titleLc = title.toLowerCase();
      const titleScore =
        (titleLc.includes('sober founders') ? 8 : 0) +
        (titleLc.includes('mastermind') ? 3 : 0) +
        (titleLc.includes('zoom') ? 2 : 0);
      const score = titleScore + (attendeeCount * 0.15) - (Number(et.minutesFromExpected) * 0.01);
      const key = `${et.etDateKey}|${et.dayType}`;
      if (!hubspotCallCandidatesByDateDay.has(key)) hubspotCallCandidatesByDateDay.set(key, []);
      hubspotCallCandidatesByDateDay.get(key).push({
        activity,
        activityId,
        activityType,
        assocs,
        attendeeCount,
        et,
        score,
        title,
      });
    });

    const chosenHubspotCallSessionByDateDay = new Map();
    hubspotCallCandidatesByDateDay.forEach((candidates, key) => {
      const ranked = [...(candidates || [])].sort((a, b) => {
        const aNear = Number.isFinite(Number(a?.et?.minutesFromExpected))
          && Number(a.et.minutesFromExpected) <= HUBSPOT_CALL_TIME_TOLERANCE_MINUTES;
        const bNear = Number.isFinite(Number(b?.et?.minutesFromExpected))
          && Number(b.et.minutesFromExpected) <= HUBSPOT_CALL_TIME_TOLERANCE_MINUTES;
        if (aNear !== bNear) return bNear - aNear;

        if (aNear && bNear) {
          const aDiff = Number(a?.et?.minutesFromExpected || Number.POSITIVE_INFINITY);
          const bDiff = Number(b?.et?.minutesFromExpected || Number.POSITIVE_INFINITY);
          if (aDiff !== bDiff) return aDiff - bDiff;
        }

        if (b.attendeeCount !== a.attendeeCount) return b.attendeeCount - a.attendeeCount;
        if (b.score !== a.score) return b.score - a.score;
        const aTs = Date.parse(a.activity?.hs_timestamp || a.activity?.created_at_hubspot || '');
        const bTs = Date.parse(b.activity?.hs_timestamp || b.activity?.created_at_hubspot || '');
        return aTs - bTs;
      });
      if (ranked[0]) chosenHubspotCallSessionByDateDay.set(key, ranked[0]);
    });

    const aliasMap = buildAliasMap(aliases || []);

    let sessionRows = [];
    let historyByAttendee = new Map();

    (rawZoom || [])
      .filter((row) => row?.metric_name === 'Zoom Meeting Attendees')
      .forEach((row, idx) => {
        const dateKey = parseDateKey(row?.metadata?.start_time || row?.metric_date);
        if (!dateKey) return;
        const dayType = dayTypeFromZoomMetric(row);
        if (dayType !== 'Tuesday' && dayType !== 'Thursday') return;

        const meetingId = String(row?.metadata?.meeting_id || '');
        const sessionKey = `${dateKey}|${dayType}|${meetingId || idx}`;
        const rawAttendees = Array.isArray(row?.metadata?.attendees) ? row.metadata.attendees : [];
        const dedup = new Map();

        rawAttendees.forEach((rawName) => {
          const canonical = resolveCanonicalAttendeeName(rawName, aliasMap) || String(rawName || '').trim();
          const key = normalizeName(canonical);
          if (!key) return;
          if (!dedup.has(key)) {
            dedup.set(key, {
              date: dateKey,
              dayType,
              sessionKey,
              meetingId,
              attendeeName: canonical,
              rawName: String(rawName || '').trim() || canonical,
              attendeeKey: key,
            });
          }
        });

        const attendees = Array.from(dedup.values());
        attendees.forEach((attendee) => {
          if (!historyByAttendee.has(attendee.attendeeKey)) {
            historyByAttendee.set(attendee.attendeeKey, {
              totalSessions: 0,
              tuesdaySessions: 0,
              thursdaySessions: 0,
              firstSeenDate: attendee.date,
              firstSeenDay: attendee.dayType,
              lastSeenDate: attendee.date,
            });
          }
          const hist = historyByAttendee.get(attendee.attendeeKey);
          hist.totalSessions += 1;
          if (attendee.dayType === 'Tuesday') hist.tuesdaySessions += 1;
          if (attendee.dayType === 'Thursday') hist.thursdaySessions += 1;
          if (attendee.date < hist.firstSeenDate) {
            hist.firstSeenDate = attendee.date;
            hist.firstSeenDay = attendee.dayType;
          }
          if (attendee.date > hist.lastSeenDate) hist.lastSeenDate = attendee.date;
        });

        sessionRows.push(...attendees);
      });

    const buildHubspotCallTruthRows = () => {
      const rows = [];
      const history = new Map();
      chosenHubspotCallSessionByDateDay.forEach((chosen, dateDayKey) => {
        const [dateKey, dayType] = String(dateDayKey).split('|');
        if (EXPECTED_ZERO_GROUP_SESSION_KEYS.has(`${dateKey}|${dayType}`)) return;
        const activity = chosen?.activity || {};
        const mergedActivityIds = (chosen?.activityIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id));
        if (mergedActivityIds.length === 0 && Number.isFinite(Number(chosen?.activityId))) {
          mergedActivityIds.push(Number(chosen.activityId));
        }
        const meetingId = `hubspot-call-${mergedActivityIds[0] || chosen?.activityId || ''}`;
        const sessionKey = `${dateKey}|${dayType}|${meetingId}`;
        const dedup = new Map();
        (chosen?.assocs || []).forEach((assoc) => {
          const contactId = Number(assoc?.hubspot_contact_id);
          const contact = Number.isFinite(contactId) ? (hubspotById.get(contactId) || null) : null;
          const assocName = `${String(assoc?.contact_firstname || contact?.firstname || '').trim()} ${String(assoc?.contact_lastname || contact?.lastname || '').trim()}`.trim();
          const assocEmail = String(assoc?.contact_email || contact?.email || '').trim().toLowerCase();
          const displayName = assocName || assocEmail || `HubSpot Contact ${Number.isFinite(contactId) ? contactId : ''}`.trim();
          const attendeeKey = Number.isFinite(contactId)
            ? `hubspot:${contactId}`
            : (assocEmail ? `email:${assocEmail}` : `name:${normalizeName(displayName)}`);
          if (!attendeeKey || dedup.has(attendeeKey)) return;
          dedup.set(attendeeKey, {
            date: dateKey,
            dayType,
            sessionKey,
            meetingId,
            attendeeName: displayName,
            rawName: displayName,
            attendeeKey,
            nameLookupKey: normalizeName(displayName),
            sessionTruthSource: 'hubspot_call',
            hubspotActivityId: Number(chosen?.activityId) || null,
            hubspotActivityIds: mergedActivityIds,
            hubspotContactId: Number.isFinite(contactId) ? contactId : null,
            associationName: assocName || 'Not Found',
            associationEmail: assocEmail || 'Not Found',
            hubspotCallTitle: String(activity?.title || '').trim() || 'Not Found',
            hubspotCallTimestampUtc: String(activity?.hs_timestamp || activity?.created_at_hubspot || ''),
            hubspotCallEtTime: chosen?.et ? `${String(chosen.et.hour).padStart(2, '0')}:${String(chosen.et.minute).padStart(2, '0')}` : 'Not Found',
          });
        });

        const attendees = Array.from(dedup.values());
        attendees.forEach((attendee) => {
          if (!history.has(attendee.attendeeKey)) {
            history.set(attendee.attendeeKey, {
              totalSessions: 0,
              tuesdaySessions: 0,
              thursdaySessions: 0,
              firstSeenDate: attendee.date,
              firstSeenDay: attendee.dayType,
              lastSeenDate: attendee.date,
            });
          }
          const hist = history.get(attendee.attendeeKey);
          hist.totalSessions += 1;
          if (attendee.dayType === 'Tuesday') hist.tuesdaySessions += 1;
          if (attendee.dayType === 'Thursday') hist.thursdaySessions += 1;
          if (attendee.date < hist.firstSeenDate) {
            hist.firstSeenDate = attendee.date;
            hist.firstSeenDay = attendee.dayType;
          }
          if (attendee.date > hist.lastSeenDate) hist.lastSeenDate = attendee.date;
        });

        rows.push(...attendees);
      });
      rows.sort((a, b) => (String(a.date || '').localeCompare(String(b.date || '')) || String(a.attendeeName || '').localeCompare(String(b.attendeeName || ''))));
      return { rows, history };
    };

    const computeMissingHubspotCallSessions = (startKey, endKey) => {
      if (!startKey || !endKey) return [];
      const out = [];
      let cursor = new Date(`${startKey}T00:00:00.000Z`);
      const end = new Date(`${endKey}T00:00:00.000Z`);
      while (cursor <= end) {
        const dow = cursor.getUTCDay();
        const dayType = dow === 2 ? 'Tuesday' : (dow === 4 ? 'Thursday' : null);
        if (dayType) {
          const dateKey = cursor.toISOString().slice(0, 10);
          if (EXPECTED_ZERO_GROUP_SESSION_KEYS.has(`${dateKey}|${dayType}`)) {
            cursor.setUTCDate(cursor.getUTCDate() + 1);
            continue;
          }
          const key = `${dateKey}|${dayType}`;
          const chosen = chosenHubspotCallSessionByDateDay.get(key);
          if (!chosen) {
            const zoomAgg = zoomRowsByDateDay.get(key);
            const zoomFallbackRowCount = zoomAgg?.rowCount || 0;
            const zoomFallbackAttendeeCount = zoomAgg?.maxAttendees || 0;
            const actionable = zoomFallbackRowCount > 0 || zoomFallbackAttendeeCount > 0;
            out.push({
              date: dateKey,
              dayType,
              expectedEtTime: dayType === 'Tuesday' ? '12:00 ET' : '11:00 ET',
              hubspotCallPresent: 'No',
              zoomFallbackRowCount,
              zoomFallbackAttendeeCount,
              zoomFallbackMeetingIds: zoomAgg ? Array.from(zoomAgg.meetingIds || []).join(', ') : '',
              missingCategory: actionable ? 'hubspot_call_missing_with_zoom' : 'likely_no_meeting',
              actionRequired: actionable ? 'Yes' : 'No',
            });
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return out;
    };

    const { rows: hubspotCallTruthRows, history: hubspotCallTruthHistory } = buildHubspotCallTruthRows();
    const useHubspotCallTruth = hubspotCallTruthRows.length > 0;
    if (useHubspotCallTruth) {
      sessionRows = hubspotCallTruthRows;
      historyByAttendee = hubspotCallTruthHistory;
    }

    const enrichRows = (rowsInRange) => rowsInRange.map((row) => {
      const directHubspotContactId = Number(row?.hubspotContactId);
      const directHubspotContact = Number.isFinite(directHubspotContactId) ? (hubspotById.get(directHubspotContactId) || null) : null;
      const match = directHubspotContact
        ? {
          contact: directHubspotContact,
          matchType: 'hubspot_call_contact_association',
          candidateCount: 1,
          lookupStrategy: 'hubspot_call_contact_association',
          matchWhy: 'HubSpot Call attendee association linked directly to HubSpot contact',
          candidateExamples: fullNameFromContact(directHubspotContact) || directHubspotContact?.email || '',
        }
        : (
          row?.sessionTruthSource === 'hubspot_call' && Number.isFinite(directHubspotContactId)
            ? {
              contact: null,
              matchType: 'hubspot_call_contact_missing_raw',
              candidateCount: 1,
              lookupStrategy: 'hubspot_call_contact_association',
              matchWhy: `HubSpot Call attendee association has contact ${directHubspotContactId}, but raw_hubspot_contacts is missing the row`,
              candidateExamples: `HubSpot:${directHubspotContactId}`,
            }
            : pickContactForZoomRow(row)
        );
      const contact = match.contact;
      const revenue = resolveRevenue(contact || {});
      const hist = historyByAttendee.get(row.attendeeKey) || {
        totalSessions: 0,
        tuesdaySessions: 0,
        thursdaySessions: 0,
        firstSeenDate: row.date,
        firstSeenDay: row.dayType,
      };
      const isRepeat = (hist.totalSessions || 0) >= 2;
      const goodRepeat = (hist.totalSessions || 0) >= 3 && Number.isFinite(revenue.revenue) && Number(revenue.revenue) >= 250000;
      const contactSourceBucket = sourceBucketFromContact(contact);
      const contactEmail = String(contact?.email || row?.associationEmail || '').trim().toLowerCase();
      const lumaEvidence = (contactEmail && lumaEvidenceByEmail.get(contactEmail)) || lumaEvidenceByName.get(row.nameLookupKey || row.attendeeKey) || null;
      const lumaFallback = sourceBucketFromLumaEvidence(lumaEvidence);
      const hubspotOriginalSourceCode = String(contact?.hs_analytics_source || '').trim().toUpperCase();
      const hubspotOriginalSourceDetail1 = String(contact?.hs_analytics_source_data_1 || '').trim().toUpperCase();
      const hubspotOfflineLooksIntegration =
        hubspotOriginalSourceCode === 'OFFLINE' &&
        (hubspotOriginalSourceDetail1 === 'INTEGRATION' || hubspotOriginalSourceDetail1 === 'CRM_UI');
      const useLumaFallback =
        lumaFallback.bucket !== 'Unknown' &&
        (
          contactSourceBucket === 'Unknown' ||
          contactSourceBucket === 'Other' ||
          (hubspotOfflineLooksIntegration && lumaFallback.bucket !== 'Other')
        );
      const sourceBucket = useLumaFallback ? lumaFallback.bucket : contactSourceBucket;
      const sourceAttributionMethod = useLumaFallback
        ? (
          contact
            ? (
              hubspotOfflineLooksIntegration
                ? `HubSpot OFFLINE → ${lumaFallback.method}`
                : `HubSpot Unknown → ${lumaFallback.method}`
            )
            : lumaFallback.method
        )
        : (contact ? 'HubSpot Original Source' : 'Unattributed');

      let missingAttributionReason = '';
      if (!contact) {
        if (row?.sessionTruthSource === 'hubspot_call' && Number.isFinite(directHubspotContactId)) {
          missingAttributionReason = 'HubSpot Call linked attendee/contact exists, but raw_hubspot_contacts is missing that contact row (HubSpot contacts backfill needed for attribution)';
        } else if (lumaEvidence) {
          if (String(lumaEvidence?.originalTrafficSource || '').trim().toUpperCase() !== 'NOT FOUND') {
            missingAttributionReason = 'No HubSpot contact match by Zoom name; using Lu.ma-linked HubSpot source';
          } else if (String(lumaEvidence?.hearAboutCategory || '').trim() !== 'Unknown') {
            missingAttributionReason = 'No HubSpot contact match by Zoom name; using Lu.ma self-reported source';
          } else {
            missingAttributionReason = 'No HubSpot match by Zoom name; Lu.ma record exists but no usable attribution';
          }
        } else {
          missingAttributionReason = row?.sessionTruthSource === 'hubspot_call'
            ? 'HubSpot Call attendee row exists but no usable contact/source record found'
            : 'No HubSpot match by normalized Zoom name; no Lu.ma evidence by name/email';
        }
      } else if (hubspotOfflineLooksIntegration) {
        missingAttributionReason = 'HubSpot original source is OFFLINE (Lu.ma/Zap/CRM create path), acquisition source may require merge/duplicate resolution';
      } else if (contactSourceBucket === 'Unknown') {
        missingAttributionReason = 'HubSpot matched but original traffic source missing';
      }

      const enriched = {
        ...row,
        matchedHubspot: row?.sessionTruthSource === 'hubspot_call'
          ? (Number.isFinite(directHubspotContactId) || !!contact)
          : !!contact,
        matchType: match.matchType,
        matchCandidateCount: match.candidateCount || 0,
        matchLookupStrategy: match.lookupStrategy || 'none',
        matchWhy: match.matchWhy || 'Unknown',
        matchCandidateExamples: match.candidateExamples || '',
        hubspotName: contact ? (fullNameFromContact(contact) || 'Not Found') : (row?.associationName || 'Not Found'),
        email: contact?.email || row?.associationEmail || 'Not Found',
        originalTrafficSource: contact?.hs_analytics_source || 'Not Found',
        originalTrafficSourceDetail1: contact?.hs_analytics_source_data_1 || 'Not Found',
        originalTrafficSourceDetail2: contact?.hs_analytics_source_data_2 || contact?.campaign || 'Not Found',
        hubspotCreatedDate: parseDateKey(contact?.createdate) || 'Not Found',
        revenue: Number.isFinite(revenue.revenue) ? revenue.revenue : 'Not Found',
        revenueOfficial: Number.isFinite(revenue.revenueOfficial) ? revenue.revenueOfficial : null,
        sourceBucket,
        sourceAttributionMethod,
        sourceFamily: sourceBucket.startsWith('Paid Social') ? 'Paid' : 'Non-Paid',
        lumaHowHeardCategoryFallback: lumaEvidence?.hearAboutCategory || 'Not Found',
        lumaHowHeardFallback: lumaEvidence?.hearAbout || 'Not Found',
        missingAttributionReason,
        manualAttributionOverride: 'No',
        manualAttributionNote: '',
        manualHubspotContactId: null,
        manualHubspotUrl: '',
        hubspotContactId: Number.isFinite(directHubspotContactId) ? directHubspotContactId : (Number(contact?.hubspot_contact_id) || null),
        attendanceTruthSource: row?.sessionTruthSource === 'hubspot_call' ? 'HubSpot Call' : 'Zoom KPI',
        hubspotCallActivityId: row?.hubspotActivityId || null,
        hubspotCallTitle: row?.hubspotCallTitle || 'Not Found',
        hubspotCallTimestampUtc: row?.hubspotCallTimestampUtc || 'Not Found',
        hubspotCallEtTime: row?.hubspotCallEtTime || 'Not Found',
        netNewAttendee: hist.firstSeenDate === row.date ? 'Yes' : 'No',
        repeatAttendee: isRepeat ? 'Yes' : 'No',
        goodRepeatMember: goodRepeat ? 'Yes' : 'No',
        totalZoomAttendances: hist.totalSessions || 0,
        tuesdayAttendances: hist.tuesdaySessions || 0,
        thursdayAttendances: hist.thursdaySessions || 0,
        firstSeenDate: hist.firstSeenDate || 'Not Found',
        isMetaPaid: sourceBucket === 'Paid Social (Meta)',
      };

      const manualOverride = getZoomAttributionOverride(row.attendeeName || row.attendeeKey);
      return applyZoomAttributionOverride(enriched, manualOverride);
    });

    const buildPeriodRows = (startKey, endKey) => enrichRows(
      sessionRows.filter((row) => dateInRange(row.date, startKey, endKey))
    );

    const aggregatePeriod = (rows, freeSpend, periodStartKey, periodEndKey) => {
      const bySource = new Map();
      const totalShowUpRows = rows.length;
      const totalTuesdayRows = rows.filter((r) => r.dayType === 'Tuesday').length;
      const totalThursdayRows = rows.filter((r) => r.dayType === 'Thursday').length;
      let matchedRows = 0;
      let unmatchedRows = 0;
      let ambiguousRows = 0;

      rows.forEach((row) => {
        if (row.matchedHubspot) matchedRows += 1;
        else unmatchedRows += 1;
        if (String(row.matchType || '').includes('ambiguous')) ambiguousRows += 1;

        const bucket = row.sourceBucket || 'Unknown';
        if (!bySource.has(bucket)) {
          bySource.set(bucket, {
            bucket,
            showUpRows: 0,
            tuesdayShowUps: 0,
            thursdayShowUps: 0,
            netNewRows: 0,
            uniqueAttendees: new Set(),
            repeatMembers: new Set(),
            goodRepeatMembers: new Set(),
            matchedHubspotRows: 0,
            unmatchedHubspotRows: 0,
            ambiguousRows: 0,
            rows: [],
          });
        }
        const agg = bySource.get(bucket);
        agg.showUpRows += 1;
        if (row.dayType === 'Tuesday') agg.tuesdayShowUps += 1;
        if (row.dayType === 'Thursday') agg.thursdayShowUps += 1;
        if (row.netNewAttendee === 'Yes') agg.netNewRows += 1;
        agg.rows.push(row);
        agg.uniqueAttendees.add(row.attendeeKey);
        if (row.repeatAttendee === 'Yes') agg.repeatMembers.add(row.attendeeKey);
        if (row.goodRepeatMember === 'Yes') agg.goodRepeatMembers.add(row.attendeeKey);
        if (row.matchedHubspot) agg.matchedHubspotRows += 1;
        else agg.unmatchedHubspotRows += 1;
        if (String(row.matchType || '').includes('ambiguous')) agg.ambiguousRows += 1;
      });

      const sourceRows = Array.from(bySource.values()).map((agg) => ({
        bucket: agg.bucket,
        showUpRows: agg.showUpRows,
        uniqueAttendees: agg.uniqueAttendees.size,
        tuesdayShowUps: agg.tuesdayShowUps,
        thursdayShowUps: agg.thursdayShowUps,
        netNewRows: agg.netNewRows,
        repeatMembers: agg.repeatMembers.size,
        goodRepeatMembers: agg.goodRepeatMembers.size,
        matchedHubspotRows: agg.matchedHubspotRows,
        unmatchedHubspotRows: agg.unmatchedHubspotRows,
        ambiguousRows: agg.ambiguousRows,
        showUpShare: safeRatio(agg.showUpRows, totalShowUpRows),
        repeatRateAmongUnique: safeRatio(agg.repeatMembers.size, agg.uniqueAttendees.size),
        goodRepeatRateAmongUnique: safeRatio(agg.goodRepeatMembers.size, agg.uniqueAttendees.size),
        rows: agg.rows.slice().sort((a, b) => {
          if (a.goodRepeatMember !== b.goodRepeatMember) return a.goodRepeatMember === 'Yes' ? -1 : 1;
          if (a.repeatAttendee !== b.repeatAttendee) return a.repeatAttendee === 'Yes' ? -1 : 1;
          if (a.dayType !== b.dayType) return a.dayType.localeCompare(b.dayType);
          return String(b.date || '').localeCompare(String(a.date || ''));
        }),
      }));

      sourceRows.sort((a, b) => {
        const priority = (label) => {
          if (label === 'Paid Social (Meta)') return 0;
          if (label === 'Organic Search') return 1;
          if (label === 'Referral') return 2;
          if (label === 'Unknown') return 98;
          return 10;
        };
        const pDiff = priority(a.bucket) - priority(b.bucket);
        if (pDiff !== 0) return pDiff;
        if (a.showUpRows !== b.showUpRows) return b.showUpRows - a.showUpRows;
        return a.bucket.localeCompare(b.bucket);
      });

      const paidMeta = sourceRows.find((r) => r.bucket === 'Paid Social (Meta)') || {
        bucket: 'Paid Social (Meta)',
        showUpRows: 0,
        uniqueAttendees: 0,
        tuesdayShowUps: 0,
        thursdayShowUps: 0,
        netNewRows: 0,
        repeatMembers: 0,
        goodRepeatMembers: 0,
        showUpShare: null,
        repeatRateAmongUnique: null,
        goodRepeatRateAmongUnique: null,
        rows: [],
      };

      const nonPaidRows = sourceRows.filter((r) => r.bucket !== 'Paid Social (Meta)');
      const nonPaidShowUpRows = nonPaidRows.reduce((sum, r) => sum + r.showUpRows, 0);
      const nonPaidUniqueAttendees = nonPaidRows.reduce((sum, r) => sum + r.uniqueAttendees, 0);
      const nonPaidRepeatMembers = nonPaidRows.reduce((sum, r) => sum + r.repeatMembers, 0);
      const nonPaidGoodRepeatMembers = nonPaidRows.reduce((sum, r) => sum + r.goodRepeatMembers, 0);

      const tuesdayRows = rows.filter((r) => r.dayType === 'Tuesday');
      const tuesdayPaidRows = tuesdayRows.filter((r) => r.sourceBucket === 'Paid Social (Meta)');
      const tuesdayMatchedRows = tuesdayRows.filter((r) => r.matchedHubspot);
      const allGoodMemberKeys = new Set(rows.filter((r) => r.goodRepeatMember === 'Yes').map((r) => r.attendeeKey));
      const attributedGoodMemberKeys = new Set(rows.filter((r) => r.goodRepeatMember === 'Yes' && r.sourceBucket !== 'Unknown' && r.sourceBucket !== 'Other').map((r) => r.attendeeKey));
      const unknownOrOtherGoodMemberKeys = new Set(rows.filter((r) => r.goodRepeatMember === 'Yes' && (r.sourceBucket === 'Unknown' || r.sourceBucket === 'Other')).map((r) => r.attendeeKey));
      const paidGoodRepeatMembersAcquiredInRange = new Set();
      const paidGoodRepeatMembersAcquiredBeforeRange = new Set();
      const paidGoodRepeatMembersAcquiredUnknownDate = new Set();
      const paidGoodRepeatMembersFirstSeenInRange = new Set();
      rows
        .filter((r) => r.sourceBucket === 'Paid Social (Meta)' && r.goodRepeatMember === 'Yes')
        .forEach((r) => {
          const createdKey = String(r.hubspotCreatedDate || '');
          if (createdKey && createdKey !== 'Not Found') {
            if ((!periodStartKey || createdKey >= periodStartKey) && (!periodEndKey || createdKey <= periodEndKey)) {
              paidGoodRepeatMembersAcquiredInRange.add(r.attendeeKey);
            } else if (periodStartKey && createdKey < periodStartKey) {
              paidGoodRepeatMembersAcquiredBeforeRange.add(r.attendeeKey);
            } else {
              paidGoodRepeatMembersAcquiredUnknownDate.add(r.attendeeKey);
            }
          } else {
            paidGoodRepeatMembersAcquiredUnknownDate.add(r.attendeeKey);
          }
          if (r.firstSeenDate && r.firstSeenDate !== 'Not Found' && (!periodStartKey || r.firstSeenDate >= periodStartKey) && (!periodEndKey || r.firstSeenDate <= periodEndKey)) {
            paidGoodRepeatMembersFirstSeenInRange.add(r.attendeeKey);
          }
        });
      const goodMemberSourceRows = sourceRows
        .filter((r) => r.goodRepeatMembers > 0 || r.bucket === 'Unknown' || r.bucket === 'Other')
        .map((r) => ({
          ...r,
          goodMemberShare: safeRatio(r.goodRepeatMembers, allGoodMemberKeys.size),
        }))
        .sort((a, b) => (b.goodRepeatMembers - a.goodRepeatMembers) || (b.repeatMembers - a.repeatMembers) || a.bucket.localeCompare(b.bucket));
      const unmatchedRepeatByAttendee = new Map();
      rows
        .filter((r) => !r.matchedHubspot && r.repeatAttendee === 'Yes')
        .forEach((r) => {
          const existing = unmatchedRepeatByAttendee.get(r.attendeeKey);
          if (!existing || (r.totalZoomAttendances || 0) > (existing.totalZoomAttendances || 0)) {
            unmatchedRepeatByAttendee.set(r.attendeeKey, r);
          }
        });
      const topUnmatchedRepeatRows = Array.from(unmatchedRepeatByAttendee.values())
        .sort((a, b) => (b.totalZoomAttendances - a.totalZoomAttendances) || String(a.attendeeName || '').localeCompare(String(b.attendeeName || '')))
        .slice(0, 15);

      return {
        rows,
        sourceRows,
        goodMemberSourceRows,
        topUnmatchedRepeatRows,
        totalShowUpRows,
        totalTuesdayRows,
        totalThursdayRows,
        matchedRows,
        unmatchedRows,
        ambiguousRows,
        matchRate: safeRatio(matchedRows, totalShowUpRows),
        totalGoodMembers: allGoodMemberKeys.size,
        attributedGoodMembers: attributedGoodMemberKeys.size,
        unknownOrOtherGoodMembers: unknownOrOtherGoodMemberKeys.size,
        goodMemberAttributionRate: safeRatio(attributedGoodMemberKeys.size, allGoodMemberKeys.size),
        paidMeta: {
          ...paidMeta,
          costPerShowUp: safeRatio(freeSpend, paidMeta.showUpRows),
          costPerUniqueAttendee: safeRatio(freeSpend, paidMeta.uniqueAttendees),
          costPerRepeatMember: safeRatio(freeSpend, paidMeta.repeatMembers),
          costPerGoodRepeatMember: safeRatio(freeSpend, paidMeta.goodRepeatMembers),
          goodRepeatMembersAcquiredInRange: paidGoodRepeatMembersAcquiredInRange.size,
          goodRepeatMembersAcquiredBeforeRange: paidGoodRepeatMembersAcquiredBeforeRange.size,
          goodRepeatMembersAcquiredUnknownDate: paidGoodRepeatMembersAcquiredUnknownDate.size,
          goodRepeatMembersFirstSeenInRange: paidGoodRepeatMembersFirstSeenInRange.size,
          costPerGoodRepeatMemberAcquiredInRange: safeRatio(freeSpend, paidGoodRepeatMembersAcquiredInRange.size),
          costPerGoodRepeatMemberFirstSeenInRange: safeRatio(freeSpend, paidGoodRepeatMembersFirstSeenInRange.size),
        },
        nonPaid: {
          showUpRows: nonPaidShowUpRows,
          uniqueAttendees: nonPaidUniqueAttendees,
          repeatMembers: nonPaidRepeatMembers,
          goodRepeatMembers: nonPaidGoodRepeatMembers,
          repeatRateAmongUnique: safeRatio(nonPaidRepeatMembers, nonPaidUniqueAttendees),
          goodRepeatRateAmongUnique: safeRatio(nonPaidGoodRepeatMembers, nonPaidUniqueAttendees),
        },
        tuesdayAssumptionTest: {
          totalTuesdayRows: tuesdayRows.length,
          matchedTuesdayRows: tuesdayMatchedRows.length,
          paidMetaTuesdayRows: tuesdayPaidRows.length,
          paidMetaShareOfTuesday: safeRatio(tuesdayPaidRows.length, tuesdayRows.length),
          paidMetaShareOfMatchedTuesday: safeRatio(tuesdayPaidRows.length, tuesdayMatchedRows.length),
          unmatchedTuesdayRows: tuesdayRows.filter((r) => !r.matchedHubspot).length,
        },
        attendanceTruthMode: useHubspotCallTruth ? 'HubSpot Calls (Tue/Thu scheduled) primary' : 'Zoom KPI fallback',
      };
    };

    const currentStart = dateWindows?.current?.start;
    const currentEnd = dateWindows?.current?.end;
    const previousStart = dateWindows?.previous?.start;
    const previousEnd = dateWindows?.previous?.end;

    const currentRows = (currentStart && currentEnd) ? buildPeriodRows(currentStart, currentEnd) : [];
    const previousRows = (previousStart && previousEnd) ? buildPeriodRows(previousStart, previousEnd) : [];
    const currentFreeSpend = Number(groupedData?.current?.free?.combined?.spend || 0);
    const previousFreeSpend = groupedData?.previous ? Number(groupedData?.previous?.free?.combined?.spend || 0) : 0;

    const currentAgg = aggregatePeriod(currentRows, currentFreeSpend, currentStart, currentEnd);
    const previousAgg = groupedData?.previous ? aggregatePeriod(previousRows, previousFreeSpend, previousStart, previousEnd) : null;
    const currentMissingHubspotCallSessions = (currentStart && currentEnd) ? computeMissingHubspotCallSessions(currentStart, currentEnd) : [];
    const previousMissingHubspotCallSessions = (previousStart && previousEnd) ? computeMissingHubspotCallSessions(previousStart, previousEnd) : [];
    const countHubspotCallTruthSessionsInRange = (startKey, endKey) => {
      if (!startKey || !endKey) return 0;
      let count = 0;
      chosenHubspotCallSessionByDateDay.forEach((_, key) => {
        const [dateKey] = String(key || '').split('|');
        if (dateKey && dateKey >= startKey && dateKey <= endKey) count += 1;
      });
      return count;
    };
    const currentHubspotCallTruthSessionCount = countHubspotCallTruthSessionsInRange(currentStart, currentEnd);
    const previousHubspotCallTruthSessionCount = countHubspotCallTruthSessionsInRange(previousStart, previousEnd);

    return {
      current: {
        ...currentAgg,
        missingHubspotCallSessions: currentMissingHubspotCallSessions,
        hubspotCallTruthSessionCount: currentHubspotCallTruthSessionCount,
      },
      previous: previousAgg ? {
        ...previousAgg,
        missingHubspotCallSessions: previousMissingHubspotCallSessions,
        hubspotCallTruthSessionCount: previousHubspotCallTruthSessionCount,
      } : null,
      loadedHistoryDays: LOOKBACK_DAYS,
      attendanceTruthMode: useHubspotCallTruth ? 'HubSpot Calls (Tue/Thu scheduled) primary' : 'Zoom KPI fallback',
    };
  }, [rawZoom, rawHubspot, rawHubspotActivities, rawHubspotActivityAssociations, aliases, rawZoomHubspotMappings, dateWindows, groupedData]);

  const unifiedFunnelModule = useMemo(() => {
    // Source-of-truth behavior (kept inline intentionally):
    // - Meta lead forms create HubSpot contacts automatically.
    // - Lu.ma registrations create HubSpot contacts via Zapier.
    // - Merges often happen later when a person uses a different email, and the absorbed
    //   email is retained in hs_additional_emails on the surviving HubSpot contact.
    // - Therefore we must check primary email, then hs_additional_emails, before any name match.
    // - HubSpot Call records are the highest-confidence Zoom attendee mapping signal when present.
    const buildHubspotIndex = (rows) => {
      const byId = new Map();
      const byPrimaryEmail = new Map();
      const bySecondaryEmail = new Map();
      const byExactName = new Map();
      const byFirstLastInitial = new Map();
      const byFirstPrefixLastInitial = new Map();
      const byFirstName = new Map();

      const add = (map, key, row) => {
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
      };
      const variants = (nameKey) => {
        const tokens = String(nameKey || '').split(' ').filter(Boolean);
        const first = tokens[0] || '';
        const last = tokens[tokens.length - 1] || '';
        const lastInitial = last?.[0] || '';
        return {
          first,
          firstLastInitial: first && lastInitial ? `${first}|${lastInitial}` : '',
          firstPrefixLastInitial: first && first.length >= 2 && lastInitial ? `${first.slice(0, 3)}|${lastInitial}` : '',
        };
      };

      (rows || []).forEach((row) => {
        const id = Number(row?.hubspot_contact_id);
        if (Number.isFinite(id)) byId.set(id, row);

        const primary = normalizeEmailKey(row?.email);
        if (primary) add(byPrimaryEmail, primary, row);
        for (const extra of parseEmailList(row?.hs_additional_emails)) add(bySecondaryEmail, extra, row);

        const full = normalizePersonNameKey(hubspotFullName(row));
        if (!full) return;
        add(byExactName, full, row);
        const v = variants(full);
        add(byFirstName, v.first, row);
        add(byFirstLastInitial, v.firstLastInitial, row);
        add(byFirstPrefixLastInitial, v.firstPrefixLastInitial, row);
      });

      return { byId, byPrimaryEmail, bySecondaryEmail, byExactName, byFirstLastInitial, byFirstPrefixLastInitial, byFirstName, variants };
    };

    const hubspotIndex = buildHubspotIndex(rawHubspot || []);

    const candidateHints = (candidates) => (candidates || [])
      .slice(0, 5)
      .map((c) => hubspotFullName(c) || c?.email || `HubSpot:${c?.hubspot_contact_id || ''}`)
      .filter(Boolean)
      .join(', ');

    const matchHubspotContact = ({ email, name, eventDateKey }) => {
      const emailKey = normalizeEmailKey(email);
      const nameKey = normalizePersonNameKey(name);

      if (emailKey) {
        const primaryCandidates = hubspotIndex.byPrimaryEmail.get(emailKey) || [];
        if (primaryCandidates.length > 0) {
          const contact = pickBestHubspotContact(primaryCandidates, eventDateKey);
          return {
            contact,
            confidence: 'email',
            source: 'primary_email',
            reason: primaryCandidates.length > 1 ? 'Matched by primary email (multiple candidates; best selected)' : 'Matched by primary email',
            candidateHints: candidateHints(primaryCandidates),
          };
        }
        const secondaryCandidates = hubspotIndex.bySecondaryEmail.get(emailKey) || [];
        if (secondaryCandidates.length > 0) {
          const contact = pickBestHubspotContact(secondaryCandidates, eventDateKey);
          return {
            contact,
            confidence: 'secondary_email',
            source: 'secondary_email',
            reason: secondaryCandidates.length > 1 ? 'Matched by hs_additional_emails (multiple candidates; best selected)' : 'Matched by hs_additional_emails',
            candidateHints: candidateHints(secondaryCandidates),
          };
        }
      }

      if (nameKey) {
        const exactCandidates = hubspotIndex.byExactName.get(nameKey) || [];
        if (exactCandidates.length > 0) {
          const contact = pickBestHubspotContact(exactCandidates, eventDateKey);
          return {
            contact,
            confidence: 'full_name',
            source: 'full_name',
            reason: exactCandidates.length > 1 ? 'Matched by normalized full name (multiple candidates; best selected)' : 'Matched by normalized full name',
            candidateHints: candidateHints(exactCandidates),
          };
        }

        const v = hubspotIndex.variants(nameKey);
        const initialCandidates = v.firstLastInitial ? (hubspotIndex.byFirstLastInitial.get(v.firstLastInitial) || []) : [];
        if (initialCandidates.length === 1) {
          return {
            contact: initialCandidates[0],
            confidence: 'fuzzy_name',
            source: 'first_last_initial',
            reason: 'Matched by first name + last initial (fuzzy fallback)',
            candidateHints: candidateHints(initialCandidates),
          };
        }
        if (initialCandidates.length > 1) {
          return {
            contact: null,
            confidence: 'unmatched',
            source: 'ambiguous_first_last_initial',
            reason: 'Ambiguous first name + last initial; manual review needed',
            candidateHints: candidateHints(initialCandidates),
          };
        }

        const prefixCandidates = v.firstPrefixLastInitial ? (hubspotIndex.byFirstPrefixLastInitial.get(v.firstPrefixLastInitial) || []) : [];
        if (prefixCandidates.length === 1) {
          return {
            contact: prefixCandidates[0],
            confidence: 'fuzzy_name',
            source: 'first_prefix_last_initial',
            reason: 'Matched by first-name prefix + last initial (fuzzy fallback)',
            candidateHints: candidateHints(prefixCandidates),
          };
        }
        if (prefixCandidates.length > 1) {
          return {
            contact: null,
            confidence: 'unmatched',
            source: 'ambiguous_prefix_initial',
            reason: 'Ambiguous first-name prefix + last initial; manual review needed',
            candidateHints: candidateHints(prefixCandidates),
          };
        }

        const firstNameCandidates = v.first ? (hubspotIndex.byFirstName.get(v.first) || []) : [];
        if (firstNameCandidates.length > 0) {
          return {
            contact: null,
            confidence: 'unmatched',
            source: 'first_name_only',
            reason: 'No full-name match; only first-name candidates found',
            candidateHints: candidateHints(firstNameCandidates),
          };
        }
      }

      return {
        contact: null,
        confidence: 'unmatched',
        source: 'not_found',
        reason: emailKey ? 'No HubSpot match by primary/secondary email or name fallback' : 'No email available and no HubSpot match by name fallback',
        candidateHints: '',
      };
    };

    const buildCallCoverageIndex = () => {
      const callActivitiesById = new Map();
      (rawHubspotActivities || []).forEach((row) => {
        if (String(row?.activity_type || '').toLowerCase() !== 'call') return;
        const id = Number(row?.hubspot_activity_id);
        if (!Number.isFinite(id)) return;
        callActivitiesById.set(id, {
          ...row,
          dateKey: parseDateKeyLoose(row?.hs_timestamp || row?.created_at_hubspot),
        });
      });

      const byDateName = new Map();
      const byDateEmail = new Map();
      const bySessionAttendee = new Map();
      const add = (map, key, hit) => {
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(hit);
      };

      (rawHubspotActivityAssociations || []).forEach((assoc) => {
        const id = Number(assoc?.hubspot_activity_id);
        const act = callActivitiesById.get(id);
        if (!act?.dateKey) return;
        const contactId = Number(assoc?.hubspot_contact_id);
        const contact = Number.isFinite(contactId) ? hubspotIndex.byId.get(contactId) : null;
        const name = `${String(assoc?.contact_firstname || contact?.firstname || '').trim()} ${String(assoc?.contact_lastname || contact?.lastname || '').trim()}`.trim();
        const email = normalizeEmailKey(assoc?.contact_email || contact?.email);
        const nameKey = normalizePersonNameKey(name);
        const hit = { contactId: Number.isFinite(contactId) ? contactId : null, contact, activityId: id, dateKey: act.dateKey, name, email };
        if (nameKey) add(byDateName, `${act.dateKey}|${nameKey}`, hit);
        if (email) add(byDateEmail, `${act.dateKey}|${email}`, hit);
      });

      (rawZoomHubspotMappings || []).forEach((row) => {
        const sessionDate = parseDateKeyLoose(row?.session_date);
        const meetingId = String(row?.meeting_id || '');
        const attendeeKey = normalizePersonNameKey(row?.zoom_attendee_canonical_name);
        if (!sessionDate || !attendeeKey) return;
        const source = String(row?.mapping_source || '').toLowerCase();
        const isHubspotActivity = source.includes('hubspot_meeting_activity') || Number(row?.hubspot_activity_id) > 0;
        if (!isHubspotActivity) return;
        bySessionAttendee.set(`${sessionDate}|${meetingId}|${attendeeKey}`, row);
      });

      return { byDateName, byDateEmail, bySessionAttendee };
    };

    const callCoverageIndex = buildCallCoverageIndex();

    const summarizeConfidence = (rows, fieldKey) => {
      const keys = ['email', 'secondary_email', 'full_name', 'fuzzy_name', 'unmatched'];
      const counts = new Map(keys.map((k) => [k, 0]));
      (rows || []).forEach((row) => {
        const key = keys.includes(row?.[fieldKey]) ? row[fieldKey] : 'unmatched';
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      const total = (rows || []).length;
      return keys.map((confidence) => ({ confidence, count: counts.get(confidence) || 0, pct: counts.get(confidence) ? (counts.get(confidence) / Math.max(total, 1)) : 0 }));
    };

    const resolveHubspotForZoomRow = (row) => {
      const manualId = Number(row?.manualHubspotContactId);
      if (Number.isFinite(manualId) && hubspotIndex.byId.get(manualId)) {
        return {
          contact: hubspotIndex.byId.get(manualId),
          confidence: 'full_name',
          source: 'manual_hubspot_contact_id',
          reason: 'Manual override HubSpot contact ID',
          candidateHints: '',
        };
      }

      const rowDateKey = parseDateKeyLoose(row?.date);
      const meetingId = String(row?.meetingId || '');
      const attendeeKey = normalizePersonNameKey(row?.attendeeName || row?.rawName);
      if (rowDateKey && attendeeKey) {
        const materialized = callCoverageIndex.bySessionAttendee.get(`${rowDateKey}|${meetingId}|${attendeeKey}`);
        const materializedId = Number(materialized?.hubspot_contact_id);
        const materializedContact = Number.isFinite(materializedId) ? (hubspotIndex.byId.get(materializedId) || null) : null;
        if (materializedContact) {
          return {
            contact: materializedContact,
            confidence: 'full_name',
            source: 'hubspot_call_materialized_mapping',
            reason: 'Matched via materialized Zoom attendee -> HubSpot call association mapping',
            candidateHints: '',
          };
        }
      }

      const email = normalizeEmailKey(row?.email);
      if (email && email !== 'not found') {
        return matchHubspotContact({ email, name: row?.hubspotName || row?.attendeeName || row?.rawName, eventDateKey: row?.date });
      }

      const hubspotNameValue = String(row?.hubspotName || '').trim();
      if (hubspotNameValue && hubspotNameValue !== 'Not Found') {
        return matchHubspotContact({ email: '', name: hubspotNameValue, eventDateKey: row?.date });
      }

      return matchHubspotContact({ email: '', name: row?.attendeeName || row?.rawName, eventDateKey: row?.date });
    };

    const hasHubspotCallCoverage = (zoomRow, resolvedContact) => {
      const dateKey = parseDateKeyLoose(zoomRow?.date);
      if (!dateKey) return { covered: false, source: 'No Date', activityId: null };
      const meetingId = String(zoomRow?.meetingId || '');
      const attendeeKey = normalizePersonNameKey(zoomRow?.attendeeName || zoomRow?.rawName);
      const sessionKey = `${dateKey}|${meetingId}|${attendeeKey}`;
      const materialized = callCoverageIndex.bySessionAttendee.get(sessionKey);
      if (materialized) {
        return { covered: true, source: 'Materialized Zoom->HubSpot mapping', activityId: Number(materialized?.hubspot_activity_id) || null };
      }

      const contactEmail = normalizeEmailKey(resolvedContact?.contact?.email || zoomRow?.email);
      const contactId = Number(resolvedContact?.contact?.hubspot_contact_id);
      const nameKeysToTry = Array.from(new Set([
        normalizePersonNameKey(zoomRow?.attendeeName),
        normalizePersonNameKey(zoomRow?.rawName),
        normalizePersonNameKey(resolvedContact?.contact ? hubspotFullName(resolvedContact.contact) : ''),
      ].filter(Boolean)));
      const dateKeysToTry = [dateKey, addDaysKey(dateKey, -1), addDaysKey(dateKey, 1)];

      for (const dk of dateKeysToTry) {
        if (contactEmail) {
          const hits = callCoverageIndex.byDateEmail.get(`${dk}|${contactEmail}`) || [];
          if (hits.length > 0) return { covered: true, source: dk === dateKey ? 'HubSpot Call email (same day)' : 'HubSpot Call email (+/-1 day)', activityId: hits[0]?.activityId || null };
        }
        for (const nk of nameKeysToTry) {
          const hits = callCoverageIndex.byDateName.get(`${dk}|${nk}`) || [];
          if (hits.length === 0) continue;
          if (Number.isFinite(contactId)) {
            const exactContactHit = hits.find((h) => Number(h?.contactId) === contactId);
            if (exactContactHit) return { covered: true, source: dk === dateKey ? 'HubSpot Call name + contact (same day)' : 'HubSpot Call name + contact (+/-1 day)', activityId: exactContactHit.activityId || null };
          }
          return { covered: true, source: dk === dateKey ? 'HubSpot Call name (same day)' : 'HubSpot Call name (+/-1 day)', activityId: hits[0]?.activityId || null };
        }
      }
      return { covered: false, source: 'No HubSpot Call record match', activityId: null };
    };

    const buildPeriod = (window, zoomPeriodRows) => {
      if (!window?.start || !window?.end) return null;
      const startKey = window.start;
      const endKey = window.end;

      const baseContacts = (rawHubspot || [])
        .filter((row) => {
          const createdKey = parseDateKeyLoose(row?.createdate);
          if (!createdKey || createdKey < startKey || createdKey > endKey) return false;
          if (!isPaidSocialHubspot(row)) return false;
          if (isPhoenixHubspot(row)) return false;
          return true;
        })
        .sort((a, b) => hubspotContactCreatedTs(a) - hubspotContactCreatedTs(b));

      const metaByIdentity = new Map();
      const metaIdentityByContactId = new Map();
      const metaIdentityByEmail = new Map();
      baseContacts.forEach((contact) => {
        const id = Number(contact?.hubspot_contact_id);
        const identityEmails = hubspotIdentityEmails(contact);
        const existingIdentityKeys = Array.from(new Set(identityEmails.map((email) => metaIdentityByEmail.get(email)).filter(Boolean)));
        const fallbackIdentity = hubspotIdentityKey(contact);
        const identityKey = existingIdentityKeys[0] || fallbackIdentity;
        if (!identityKey) return;

        let record = metaByIdentity.get(identityKey);
        if (!record) {
          record = {
            hubspotContactId: Number.isFinite(id) ? id : null,
            hubspotName: hubspotFullName(contact) || 'Not Found',
            hubspotPrimaryEmail: normalizeEmailKey(contact?.email) || 'Not Found',
            hubspotSecondaryEmails: parseEmailList(contact?.hs_additional_emails),
            hubspotCreatedDate: parseDateKeyLoose(contact?.createdate) || 'Not Found',
            originalTrafficSource: contact?.hs_analytics_source || 'Not Found',
            originalTrafficSourceDetail1: contact?.hs_analytics_source_data_1 || 'Not Found',
            originalTrafficSourceDetail2: contact?.hs_analytics_source_data_2 || contact?.campaign || 'Not Found',
            sourceBucket: hubspotSourceBucket(contact),
            revenue: hubspotRevenueValue(contact),
            meta_lead: true,
            luma_registered: false,
            zoom_attended: false,
            lumaMatchConfidence: 'unmatched',
            lumaMatchReason: '',
            lumaMatchSource: '',
            zoomMatchConfidence: 'unmatched',
            zoomMatchReason: '',
            zoomMatchSource: '',
            lumaRegistrationCount: 0,
            zoomAttendanceCount: 0,
            hubspotCallLinked: false,
            hubspotCallMatchCount: 0,
            lumaRows: [],
            zoomRows: [],
            _createdTs: hubspotContactCreatedTs(contact),
          };
          metaByIdentity.set(identityKey, record);
        } else {
          const candidateTs = hubspotContactCreatedTs(contact);
          if (candidateTs >= (record._createdTs || 0)) {
            record._createdTs = candidateTs;
            record.hubspotContactId = Number.isFinite(id) ? id : record.hubspotContactId;
            record.hubspotName = hubspotFullName(contact) || record.hubspotName;
            record.hubspotPrimaryEmail = normalizeEmailKey(contact?.email) || record.hubspotPrimaryEmail;
            record.hubspotCreatedDate = parseDateKeyLoose(contact?.createdate) || record.hubspotCreatedDate;
            record.originalTrafficSource = contact?.hs_analytics_source || record.originalTrafficSource;
            record.originalTrafficSourceDetail1 = contact?.hs_analytics_source_data_1 || record.originalTrafficSourceDetail1;
            record.originalTrafficSourceDetail2 = contact?.hs_analytics_source_data_2 || contact?.campaign || record.originalTrafficSourceDetail2;
            record.sourceBucket = hubspotSourceBucket(contact) || record.sourceBucket;
            record.revenue = hubspotRevenueValue(contact);
          }
          record.hubspotSecondaryEmails = Array.from(new Set([
            ...(Array.isArray(record.hubspotSecondaryEmails) ? record.hubspotSecondaryEmails : []),
            ...parseEmailList(contact?.hs_additional_emails),
          ])).filter(Boolean);
        }

        for (let i = 1; i < existingIdentityKeys.length; i += 1) {
          const oldIdentityKey = existingIdentityKeys[i];
          if (oldIdentityKey === identityKey) continue;
          const oldRecord = metaByIdentity.get(oldIdentityKey);
          if (!oldRecord) continue;

          if ((oldRecord._createdTs || 0) > (record._createdTs || 0)) {
            record._createdTs = oldRecord._createdTs;
            record.hubspotContactId = oldRecord.hubspotContactId;
            record.hubspotName = oldRecord.hubspotName;
            record.hubspotPrimaryEmail = oldRecord.hubspotPrimaryEmail;
            record.hubspotCreatedDate = oldRecord.hubspotCreatedDate;
            record.originalTrafficSource = oldRecord.originalTrafficSource;
            record.originalTrafficSourceDetail1 = oldRecord.originalTrafficSourceDetail1;
            record.originalTrafficSourceDetail2 = oldRecord.originalTrafficSourceDetail2;
            record.sourceBucket = oldRecord.sourceBucket;
            record.revenue = oldRecord.revenue;
          }
          record.hubspotSecondaryEmails = Array.from(new Set([
            ...(Array.isArray(record.hubspotSecondaryEmails) ? record.hubspotSecondaryEmails : []),
            ...(Array.isArray(oldRecord.hubspotSecondaryEmails) ? oldRecord.hubspotSecondaryEmails : []),
          ])).filter(Boolean);

          metaByIdentity.delete(oldIdentityKey);
          metaIdentityByContactId.forEach((mappedKey, contactId) => {
            if (mappedKey === oldIdentityKey) metaIdentityByContactId.set(contactId, identityKey);
          });
          metaIdentityByEmail.forEach((mappedKey, email) => {
            if (mappedKey === oldIdentityKey) metaIdentityByEmail.set(email, identityKey);
          });
        }

        if (Number.isFinite(id)) metaIdentityByContactId.set(id, identityKey);
        identityEmails.forEach((email) => {
          metaIdentityByEmail.set(email, identityKey);
        });
      });
      const metaIdentitySet = new Set(Array.from(metaByIdentity.keys()));

      const lumaRowsDetailed = [];
      const unmatchedLumaRows = [];
      const lumaMatchedNonMetaRows = [];
      (rawLuma || []).forEach((row) => {
        const dateKey = parseDateKeyLoose(row?.event_date || row?.event_start_at || row?.registered_at);
        if (!dateKey || dateKey < startKey || dateKey > endKey) return;
        const approval = String(row?.approval_status || 'approved').toLowerCase();
        if (approval && approval !== 'approved') return;
        if (String(row?.funnel_key || '').toLowerCase() === 'phoenix') return;

        const email = normalizeEmailKey(row?.guest_email);
        const name = String(row?.guest_name || '').trim();
        const match = matchHubspotContact({ email, name, eventDateKey: dateKey });
        const matchedId = Number(match?.contact?.hubspot_contact_id);
        const detailRow = {
          date: dateKey,
          name: name || 'Not Found',
          email: email || 'Not Found',
          matchConfidence: match.confidence || 'unmatched',
          matchSource: match.source || 'not_found',
          matchReason: match.reason || '',
          candidateHints: match.candidateHints || '',
          matchedHubspotContactId: Number.isFinite(matchedId) ? matchedId : null,
          matchedHubspotName: match.contact ? (hubspotFullName(match.contact) || 'Not Found') : 'Not Found',
          matchedHubspotEmail: match.contact?.email || 'Not Found',
        };
        lumaRowsDetailed.push(detailRow);

        if (!match.contact) {
          unmatchedLumaRows.push({ ...detailRow, missingReason: match.reason || 'No HubSpot contact match for Lu.ma registration' });
          return;
        }

        const matchedIdentityKey = Number.isFinite(matchedId) ? metaIdentityByContactId.get(matchedId) : null;
        if (!matchedIdentityKey || !metaIdentitySet.has(matchedIdentityKey)) {
          lumaMatchedNonMetaRows.push({ ...detailRow, missingReason: 'Matched HubSpot contact is not a Meta paid lead in selected date range' });
          return;
        }

        const record = metaByIdentity.get(matchedIdentityKey);
        record.luma_registered = true;
        record.lumaRegistrationCount += 1;
        record.lumaRows.push(detailRow);
        const confidenceRank = { email: 1, secondary_email: 2, full_name: 3, fuzzy_name: 4, unmatched: 99 };
        if ((confidenceRank[detailRow.matchConfidence] || 99) < (confidenceRank[record.lumaMatchConfidence] || 99)) {
          record.lumaMatchConfidence = detailRow.matchConfidence;
          record.lumaMatchReason = detailRow.matchReason;
          record.lumaMatchSource = detailRow.matchSource;
        }
      });

      const zoomRowsDetailed = [];
      const unmatchedZoomRows = [];
      const zoomMatchedNonMetaRows = [];
      (zoomPeriodRows || []).forEach((row) => {
        const resolved = resolveHubspotForZoomRow(row);
        const contact = resolved?.contact || null;
        const matchedId = Number(contact?.hubspot_contact_id);
        const zoomConfidence = mapZoomMatchTypeToConfidence(row?.matchType, !!contact);
        const callCoverage = hasHubspotCallCoverage(row, resolved);
        const detailRow = {
          date: row?.date || 'Not Found',
          dayType: row?.dayType || 'Other',
          attendeeName: row?.attendeeName || row?.rawName || 'Not Found',
          rawZoomName: row?.rawName || row?.attendeeName || 'Not Found',
          sessionKey: row?.sessionKey || '',
          meetingId: row?.meetingId || '',
          matchedHubspot: contact ? 'Yes' : 'No',
          matchConfidence: callCoverage.covered ? 'full_name' : zoomConfidence,
          matchSource: callCoverage.covered ? 'hubspot_call_record' : (resolved?.source || row?.matchLookupStrategy || 'not_found'),
          matchReason: callCoverage.covered ? `HubSpot Call record match (${callCoverage.source})` : (resolved?.reason || row?.matchWhy || ''),
          candidateHints: resolved?.candidateHints || row?.matchCandidateExamples || '',
          matchedHubspotContactId: Number.isFinite(matchedId) ? matchedId : (Number(row?.manualHubspotContactId) || null),
          matchedHubspotName: contact ? (hubspotFullName(contact) || 'Not Found') : (row?.hubspotName || 'Not Found'),
          matchedHubspotEmail: contact?.email || row?.email || 'Not Found',
          hubspotCallLinked: callCoverage.covered ? 'Yes' : 'No',
          hubspotCallCoverageSource: callCoverage.source,
          hubspotCallActivityId: callCoverage.activityId,
          sourceBucket: contact ? hubspotSourceBucket(contact) : (row?.sourceBucket || 'Unknown'),
          originalTrafficSource: contact?.hs_analytics_source || row?.originalTrafficSource || 'Not Found',
          totalZoomAttendances: row?.totalZoomAttendances || 1,
          repeatAttendee: row?.repeatAttendee || ((row?.totalZoomAttendances || 0) >= 2 ? 'Yes' : 'No'),
          goodRepeatMember: row?.goodRepeatMember || 'No',
        };
        zoomRowsDetailed.push(detailRow);

        if (!contact) {
          unmatchedZoomRows.push({ ...detailRow, missingReason: detailRow.matchReason || 'No HubSpot contact match for Zoom attendee' });
          return;
        }
        const matchedIdentityKey = Number.isFinite(matchedId) ? metaIdentityByContactId.get(matchedId) : null;
        if (!matchedIdentityKey || !metaIdentitySet.has(matchedIdentityKey)) {
          zoomMatchedNonMetaRows.push({ ...detailRow, missingReason: 'Matched HubSpot contact is not a Meta paid lead in selected date range' });
          return;
        }

        const record = metaByIdentity.get(matchedIdentityKey);
        record.zoom_attended = true;
        record.zoomAttendanceCount += 1;
        if (detailRow.hubspotCallLinked === 'Yes') {
          record.hubspotCallLinked = true;
          record.hubspotCallMatchCount += 1;
        }
        record.zoomRows.push(detailRow);
        const confidenceRank = { email: 1, secondary_email: 2, full_name: 3, fuzzy_name: 4, unmatched: 99 };
        if ((confidenceRank[detailRow.matchConfidence] || 99) < (confidenceRank[record.zoomMatchConfidence] || 99)) {
          record.zoomMatchConfidence = detailRow.matchConfidence;
          record.zoomMatchReason = detailRow.matchReason;
          record.zoomMatchSource = detailRow.matchSource;
        }
      });

      const unifiedLeadRecords = Array.from(metaByIdentity.values()).map((record) => ({
        ...record,
        luma_registered_label: record.luma_registered ? 'Yes' : 'No',
        zoom_attended_label: record.zoom_attended ? 'Yes' : 'No',
        hubspotCallLinkedLabel: record.hubspotCallLinked ? 'Yes' : 'No',
        hubspotSecondaryEmailsText: record.hubspotSecondaryEmails.length ? record.hubspotSecondaryEmails.join(', ') : 'None',
        lumaMatchConfidence: record.lumaMatchConfidence || 'unmatched',
        zoomMatchConfidence: record.zoomMatchConfidence || 'unmatched',
        revenue: Number.isFinite(Number(record.revenue)) ? Number(record.revenue) : 'Not Found',
        _createdTs: undefined,
      })).sort((a, b) => {
        if (a.zoomAttendanceCount !== b.zoomAttendanceCount) return b.zoomAttendanceCount - a.zoomAttendanceCount;
        if (a.lumaRegistrationCount !== b.lumaRegistrationCount) return b.lumaRegistrationCount - a.lumaRegistrationCount;
        return String(a.hubspotName || '').localeCompare(String(b.hubspotName || ''));
      });

      const funnel = {
        metaLeadCount: unifiedLeadRecords.length,
        lumaRegisteredCount: unifiedLeadRecords.filter((r) => r.luma_registered).length,
        zoomAttendedCount: unifiedLeadRecords.filter((r) => r.zoom_attended).length,
      };
      funnel.metaToLumaRate = funnel.metaLeadCount ? funnel.lumaRegisteredCount / funnel.metaLeadCount : null;
      funnel.lumaToZoomRate = funnel.lumaRegisteredCount ? funnel.zoomAttendedCount / funnel.lumaRegisteredCount : null;
      funnel.metaToZoomRate = funnel.metaLeadCount ? funnel.zoomAttendedCount / funnel.metaLeadCount : null;

      const metaNoLumaRows = unifiedLeadRecords
        .filter((r) => !r.luma_registered)
        .map((r) => ({
          hubspotContactId: r.hubspotContactId,
          hubspotName: r.hubspotName,
          hubspotPrimaryEmail: r.hubspotPrimaryEmail,
          hubspotSecondaryEmails: r.hubspotSecondaryEmailsText,
          metaLeadDate: r.hubspotCreatedDate,
          lumaRegistered: 'No',
          lumaMatchConfidence: r.lumaMatchConfidence,
          sourceBucket: r.sourceBucket,
          originalTrafficSource: r.originalTrafficSource,
          originalTrafficSourceDetail1: r.originalTrafficSourceDetail1,
          originalTrafficSourceDetail2: r.originalTrafficSourceDetail2,
          missingReason: 'No matched Lu.ma registration in selected range',
        }));

      const metaNoZoomRows = unifiedLeadRecords
        .filter((r) => !r.zoom_attended)
        .map((r) => ({
          hubspotContactId: r.hubspotContactId,
          hubspotName: r.hubspotName,
          hubspotPrimaryEmail: r.hubspotPrimaryEmail,
          hubspotSecondaryEmails: r.hubspotSecondaryEmailsText,
          metaLeadDate: r.hubspotCreatedDate,
          lumaRegistered: r.luma_registered ? 'Yes' : 'No',
          lumaMatchConfidence: r.lumaMatchConfidence,
          sourceBucket: r.sourceBucket,
          originalTrafficSource: r.originalTrafficSource,
          originalTrafficSourceDetail1: r.originalTrafficSourceDetail1,
          originalTrafficSourceDetail2: r.originalTrafficSourceDetail2,
          missingReason: 'No matched Zoom attendee in selected range',
        }));

      const reviewQueueRows = [
        ...unmatchedLumaRows.map((r) => ({ ...r, reviewArea: 'Luma -> HubSpot' })),
        ...unmatchedZoomRows.map((r) => ({ ...r, reviewArea: 'Zoom -> HubSpot' })),
        ...lumaRowsDetailed.filter((r) => r.matchConfidence === 'fuzzy_name').map((r) => ({ ...r, reviewArea: 'Luma fuzzy match' })),
        ...zoomRowsDetailed.filter((r) => r.matchConfidence === 'fuzzy_name').map((r) => ({ ...r, reviewArea: 'Zoom fuzzy match' })),
      ].sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));

      const callCoveredCount = zoomRowsDetailed.filter((r) => r.hubspotCallLinked === 'Yes').length;

      return {
        window,
        unifiedLeadRecords,
        funnel,
        matchConfidenceBreakdown: {
          luma: summarizeConfidence(lumaRowsDetailed, 'matchConfidence'),
          zoom: summarizeConfidence(zoomRowsDetailed, 'matchConfidence'),
        },
        hubspotCallCoverage: {
          coveredZoomRows: callCoveredCount,
          totalZoomRows: zoomRowsDetailed.length,
          rate: zoomRowsDetailed.length ? (callCoveredCount / zoomRowsDetailed.length) : null,
        },
        stageRows: {
          lumaRowsDetailed,
          zoomRowsDetailed,
          unmatchedLumaRows,
          unmatchedZoomRows,
          lumaMatchedNonMetaRows,
          zoomMatchedNonMetaRows,
          metaNoLumaRows,
          metaNoZoomRows,
          reviewQueueRows,
        },
      };
    };

    const currentZoomRows = zoomSourceModule?.current?.rows || [];
    const previousZoomRows = zoomSourceModule?.previous?.rows || [];

    const current = buildPeriod(dateWindows?.current, currentZoomRows);
    const previous = dateWindows?.previous ? buildPeriod(dateWindows.previous, previousZoomRows) : null;

    return { current, previous };
  }, [
    rawHubspot,
    rawLuma,
    rawHubspotActivities,
    rawHubspotActivityAssociations,
    rawZoomHubspotMappings,
    zoomSourceModule,
    dateWindows,
  ]);

  const paidDecisionInsights = useMemo(() => {
    const maybeCurrency = (v) => {
      if (v === null || v === undefined || v === '') return 'N/A';
      const n = Number(v);
      return Number.isFinite(n) ? fmt.currency(n) : 'N/A';
    };
    const maybePct = (v) => {
      if (v === null || v === undefined || v === '') return 'N/A';
      const n = Number(v);
      return Number.isFinite(n) ? fmt.pct(n) : 'N/A';
    };

    const current = zoomSourceModule?.current;
    if (!current) {
      return {
        headline: 'No Zoom source data available.',
        bullets: [],
        moves: [],
        warnings: [],
      };
    }

    const previous = zoomSourceModule?.previous;
    const lumaPaid = attendanceCostModule?.current?.paid || {};
    const paid = current.paidMeta || {};
    const tuesday = current.tuesdayAssumptionTest || {};
    const warnings = [];
    const bullets = [];
    const moves = [];

    if (current.totalShowUpRows > 0) {
      bullets.push(`Paid Meta produced ${paid.showUpRows || 0} of ${current.totalShowUpRows} free Zoom show-up rows (${maybePct(paid.showUpShare)}).`);
    }
    if ((tuesday.totalTuesdayRows || 0) > 0) {
      bullets.push(`Tuesday assumption test: ${tuesday.paidMetaTuesdayRows || 0} of ${tuesday.totalTuesdayRows || 0} Tuesday show-up rows matched to Meta paid (${maybePct(tuesday.paidMetaShareOfTuesday)}).`);
    }
    const paidAcqGoodCount = Number(paid.goodRepeatMembersAcquiredInRange || 0);
    const paidOlderActiveGoodCount = Number(paid.goodRepeatMembersAcquiredBeforeRange || 0);
    if (paidAcqGoodCount > 0 && Number.isFinite(Number(paid.costPerGoodRepeatMemberAcquiredInRange))) {
      bullets.push(`Acquisition-window cost per Meta good repeat member is ${maybeCurrency(paid.costPerGoodRepeatMemberAcquiredInRange)} using HubSpot createdate in the selected range (${paidAcqGoodCount} paid good members acquired in-window).`);
      if (paidOlderActiveGoodCount > 0) {
        warnings.push(`${paidOlderActiveGoodCount} paid good members active in this window were acquired before the selected date range. Blended cost-per-good-member can look artificially low.`);
      }
    }
    if (Number.isFinite(Number(paid.costPerGoodRepeatMember))) {
      bullets.push(`Estimated cost per Meta good repeat member is ${maybeCurrency(paid.costPerGoodRepeatMember)} using Group 1 free Meta spend.`);
    } else {
      bullets.push('Meta good repeat members are currently too few to compute a stable cost per good repeat member in this date range.');
    }
    if (Number.isFinite(Number(lumaPaid.costPerShowUp))) {
      bullets.push(`Lu.ma-only paid cost per show-up is ${maybeCurrency(lumaPaid.costPerShowUp)}; compare this with Zoom-wide paid cost per show-up (${maybeCurrency(paid.costPerShowUp)}) to see whether Tuesday changes the story.`);
    }

    const matchRate = current.matchRate;
    if (!Number.isFinite(Number(matchRate)) || Number(matchRate) < 0.75) {
      warnings.push(`Only ${maybePct(matchRate)} of Zoom show-up rows matched to HubSpot source data. Improve alias/name matching before making major budget decisions.`);
    }
    if ((tuesday.unmatchedTuesdayRows || 0) > 0) {
      warnings.push(`Tuesday has ${tuesday.unmatchedTuesdayRows} unmatched show-up rows, which can distort the Meta share assumption.`);
    }
    if ((current.unknownOrOtherGoodMembers || 0) > 0) {
      warnings.push(`${current.unknownOrOtherGoodMembers} good members are still attributed to Unknown/Other. Review the good-member source breakdown and attendee drilldowns to tighten attribution.`);
    }

    const paidGoodRate = paid.goodRepeatRateAmongUnique;
    const nonPaidGoodRate = current.nonPaid?.goodRepeatRateAmongUnique;

    if (Number.isFinite(Number(paidGoodRate)) && Number.isFinite(Number(nonPaidGoodRate))) {
      if (Number(paidGoodRate) < Number(nonPaidGoodRate)) {
        moves.push('Shift optimization from lead volume to quality signals: test tighter targeting/creative hooks aimed at operators at $250k+ revenue.');
        moves.push('Create a paid follow-up path for no-show high-revenue registrants (SMS/email/interview scheduling nudges) before increasing spend.');
      } else {
        moves.push('Meta appears to generate competitive high-value repeat members; scale cautiously with weekly guardrails on cost per good repeat member.');
      }
    }

    if (Number.isFinite(Number(paid.costPerShowUp)) && Number.isFinite(Number(paid.costPerGoodRepeatMember))) {
      const ratio = Number(paid.costPerGoodRepeatMember) / Math.max(Number(paid.costPerShowUp), 1);
      if (ratio > 6) {
        moves.push('Your biggest leverage is conversion after registration/show-up: improve interview qualification and post-show-up nurture before scaling ad spend.');
      }
    }

    const organicRow = current.sourceRows.find((r) => r.bucket === 'Organic Search');
    const referralRow = current.sourceRows.find((r) => r.bucket === 'Referral');
    if ((organicRow?.showUpRows || 0) > 0 || (referralRow?.showUpRows || 0) > 0) {
      moves.push('Track and invest in the highest-performing non-paid source buckets (especially Organic Search / Referral) as scale complements to paid Meta.');
    }

    if (previous) {
      const prevPaidShowUps = previous.paidMeta?.showUpRows || 0;
      const curPaidShowUps = paid.showUpRows || 0;
      const showUpChange = computeChangePct(curPaidShowUps, prevPaidShowUps).pct;
      if (showUpChange !== null && showUpChange !== undefined) {
        bullets.push(`Paid Meta free Zoom show-up rows are ${showUpChange >= 0 ? 'up' : 'down'} ${Math.abs(showUpChange * 100).toFixed(1)}% vs previous comparison window.`);
      }
    }

    const preferredGoodMemberCost = Number.isFinite(Number(paid.costPerGoodRepeatMemberAcquiredInRange))
      ? Number(paid.costPerGoodRepeatMemberAcquiredInRange)
      : (Number.isFinite(Number(paid.costPerGoodRepeatMember)) ? Number(paid.costPerGoodRepeatMember) : null);
    const preferredLabel = Number.isFinite(Number(paid.costPerGoodRepeatMemberAcquiredInRange))
      ? 'acquisition-window estimate'
      : 'estimate';
    const headline = (preferredGoodMemberCost !== null)
      ? `Meta paid cost to create a good repeating member is currently ${maybeCurrency(preferredGoodMemberCost)} (${preferredLabel}).`
      : 'Meta paid is generating show-ups, but there is not yet enough good-repeat volume for a stable cost-per-good-member estimate.';

    return { headline, bullets, moves, warnings };
  }, [zoomSourceModule, attendanceCostModule]);

  const leadsDecisionModule = useMemo(() => {
    const currentCombined = groupedData?.current?.free?.combined;
    const previousCombined = groupedData?.previous?.free?.combined || null;
    const currentZoom = zoomSourceModule?.current;
    const previousZoom = zoomSourceModule?.previous || null;
    const currentWindow = dateWindows?.current || null;
    const previousWindow = dateWindows?.previous || null;

    if (!currentCombined || !currentZoom || !currentWindow) return null;

    const safeRatio = (n, d) => {
      const nn = Number(n);
      const dd = Number(d);
      if (!Number.isFinite(nn) || !Number.isFinite(dd) || dd === 0) return null;
      return nn / dd;
    };
    const toNumberOrNull = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const normalizeCampaignKey = (value) => String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const dateInRangeKey = (dateKey, startKey, endKey) => !!dateKey && !!startKey && !!endKey && dateKey >= startKey && dateKey <= endKey;
    const mean = (values) => {
      const nums = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
      if (nums.length === 0) return null;
      return nums.reduce((sum, v) => sum + v, 0) / nums.length;
    };
    const median = (values) => {
      const nums = values.map((v) => Number(v)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (nums.length === 0) return null;
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 === 0 ? ((nums[mid - 1] + nums[mid]) / 2) : nums[mid];
    };

    const buildAdSpendIndex = (startKey, endKey) => {
      const byCampaign = new Map();
      (rawAds || []).forEach((row) => {
        const dateKey = String(row?.date_day || '').slice(0, 10);
        if (!dateInRangeKey(dateKey, startKey, endKey)) return;
        const funnel = String(row?.funnel_key || row?.campaign_name || '').toLowerCase();
        const isPhoenix = funnel.includes('phoenix') || String(row?.campaign_name || '').toLowerCase().includes('phoenix');
        if (isPhoenix) return;

        const campaignName = String(row?.campaign_name || '').trim();
        const campaignKey = normalizeCampaignKey(campaignName);
        if (!campaignKey) return;
        if (!byCampaign.has(campaignKey)) {
          byCampaign.set(campaignKey, {
            campaignKey,
            campaignName: campaignName || 'Not Found',
            spend: 0,
            leads: 0,
            adsets: new Map(),
          });
        }
        const agg = byCampaign.get(campaignKey);
        const spend = Number(row?.spend || 0);
        const leads = Number(row?.leads || 0);
        agg.spend += Number.isFinite(spend) ? spend : 0;
        agg.leads += Number.isFinite(leads) ? leads : 0;

        const adsetName = String(row?.adset_name || '').trim() || 'Not Found';
        if (!agg.adsets.has(adsetName)) {
          agg.adsets.set(adsetName, { adsetName, spend: 0, leads: 0, ads: new Map() });
        }
        const adsetAgg = agg.adsets.get(adsetName);
        adsetAgg.spend += Number.isFinite(spend) ? spend : 0;
        adsetAgg.leads += Number.isFinite(leads) ? leads : 0;

        const adName = String(row?.ad_name || '').trim() || 'Not Found';
        if (!adsetAgg.ads.has(adName)) adsetAgg.ads.set(adName, { adName, spend: 0, leads: 0 });
        const adAgg = adsetAgg.ads.get(adName);
        adAgg.spend += Number.isFinite(spend) ? spend : 0;
        adAgg.leads += Number.isFinite(leads) ? leads : 0;
      });

      byCampaign.forEach((agg) => {
        agg.topAdsets = Array.from(agg.adsets.values())
          .map((adset) => ({
            ...adset,
            topAds: Array.from(adset.ads.values()).sort((a, b) => (b.spend - a.spend) || (b.leads - a.leads) || a.adName.localeCompare(b.adName)),
          }))
          .sort((a, b) => (b.spend - a.spend) || (b.leads - a.leads) || a.adsetName.localeCompare(b.adsetName));
      });
      return byCampaign;
    };

    const currentAdsByCampaign = buildAdSpendIndex(currentWindow.start, currentWindow.end);

    const dedupeGreatMembers = (rows, window) => {
      const byKey = new Map();
      (rows || [])
        .filter((r) => r?.goodRepeatMember === 'Yes')
        .forEach((r) => {
          const key = String(r?.attendeeKey || r?.hubspotContactId || r?.email || r?.attendeeName || '').trim();
          if (!key) return;
          const existing = byKey.get(key);
          const candidateScore = (Number(r?.totalZoomAttendances || 0) * 1_000_000)
            + (Number.isFinite(Number(r?.revenue)) ? Number(r.revenue) : 0);
          const existingScore = existing
            ? ((Number(existing?.totalZoomAttendances || 0) * 1_000_000) + (Number.isFinite(Number(existing?.revenue)) ? Number(existing.revenue) : 0))
            : -1;
          if (!existing || candidateScore > existingScore) {
            const campaignRaw = String(r?.originalTrafficSourceDetail2 || '').trim();
            const campaignKey = normalizeCampaignKey(campaignRaw);
            const campaignAgg = campaignKey ? currentAdsByCampaign.get(campaignKey) : null;
            const topAdset = campaignAgg?.topAdsets?.[0] || null;
            const topAd = topAdset?.topAds?.[0] || null;
            const createdDate = String(r?.hubspotCreatedDate || '');
            const acquiredInRange = createdDate !== 'Not Found' && dateInRangeKey(createdDate, window?.start, window?.end);
            const bothDays = Number(r?.tuesdayAttendances || 0) > 0 && Number(r?.thursdayAttendances || 0) > 0;

            byKey.set(key, {
              ...r,
              greatMemberName: r?.hubspotName && r.hubspotName !== 'Not Found' ? r.hubspotName : (r?.attendeeName || 'Not Found'),
              greatMemberEmail: r?.email || 'Not Found',
              metaCampaignRaw: campaignRaw || 'Not Found',
              metaCampaignKey: campaignKey || '',
              inferredMetaAdset: topAdset?.adsetName || 'Not Found',
              inferredMetaAdsetSpendInRange: Number(topAdset?.spend || 0),
              inferredMetaTopAd: topAd?.adName || 'Not Found',
              inferredMetaTopAdSpendInRange: Number(topAd?.spend || 0),
              inferredMetaCampaignSpendInRange: Number(campaignAgg?.spend || 0),
              inferredMetaCampaignLeadsInRange: Number(campaignAgg?.leads || 0),
              metaAttributionConfidence: campaignAgg ? 'Campaign match (HubSpot source detail -> Meta spend)' : 'No campaign spend match in selected range',
              acquiredInSelectedRange: acquiredInRange ? 'Yes' : 'No',
              greatMemberCrossesTueThu: bothDays ? 'Yes' : 'No',
            });
          }
        });

      return Array.from(byKey.values()).sort((a, b) => {
        if ((b.totalZoomAttendances || 0) !== (a.totalZoomAttendances || 0)) return (b.totalZoomAttendances || 0) - (a.totalZoomAttendances || 0);
        const aRev = Number(a?.revenue);
        const bRev = Number(b?.revenue);
        if (Number.isFinite(bRev) && Number.isFinite(aRev) && bRev !== aRev) return bRev - aRev;
        return String(a?.greatMemberName || '').localeCompare(String(b?.greatMemberName || ''));
      });
    };

    const currentGreatMembers = dedupeGreatMembers(currentZoom.rows || [], currentWindow);

    const currentGreatSourceRows = (currentZoom.goodMemberSourceRows || []).map((r) => ({
      ...r,
      label: r.bucket,
      greatMembers: Number(r.goodRepeatMembers || 0),
      repeatMembers: Number(r.repeatMembers || 0),
      uniqueAttendees: Number(r.uniqueAttendees || 0),
      share: r.goodMemberShare,
      goodRate: r.goodRepeatRateAmongUnique,
    }));
    const previousGreatSourceRowsByLabel = new Map((previousZoom?.goodMemberSourceRows || []).map((r) => [r.bucket, r]));

    const metaGreatMembers = currentGreatMembers.filter((r) => r.sourceBucket === 'Paid Social (Meta)');
    const metaGreatByCampaignAdset = new Map();
    metaGreatMembers.forEach((r) => {
      const campaign = r.metaCampaignRaw || 'Not Found';
      const adset = r.inferredMetaAdset || 'Not Found';
      const key = `${campaign}|||${adset}`;
      if (!metaGreatByCampaignAdset.has(key)) {
        metaGreatByCampaignAdset.set(key, {
          key,
          metaCampaignRaw: campaign,
          inferredMetaAdset: adset,
          inferredMetaTopAd: r.inferredMetaTopAd || 'Not Found',
          sourceDetail1: r.originalTrafficSourceDetail1 || 'Not Found',
          greatMembers: [],
          totalAttendances: 0,
          revenues: [],
          acquiredInRangeCount: 0,
          campaignSpendInRange: Number(r.inferredMetaCampaignSpendInRange || 0),
          adsetSpendInRange: Number(r.inferredMetaAdsetSpendInRange || 0),
          campaignLeadsInRange: Number(r.inferredMetaCampaignLeadsInRange || 0),
        });
      }
      const agg = metaGreatByCampaignAdset.get(key);
      agg.greatMembers.push(r);
      agg.totalAttendances += Number(r.totalZoomAttendances || 0);
      if (Number.isFinite(Number(r.revenue))) agg.revenues.push(Number(r.revenue));
      if (r.acquiredInSelectedRange === 'Yes') agg.acquiredInRangeCount += 1;
      if (agg.inferredMetaTopAd === 'Not Found' && r.inferredMetaTopAd && r.inferredMetaTopAd !== 'Not Found') agg.inferredMetaTopAd = r.inferredMetaTopAd;
      if (!agg.campaignSpendInRange && Number(r.inferredMetaCampaignSpendInRange || 0) > 0) agg.campaignSpendInRange = Number(r.inferredMetaCampaignSpendInRange || 0);
      if (!agg.adsetSpendInRange && Number(r.inferredMetaAdsetSpendInRange || 0) > 0) agg.adsetSpendInRange = Number(r.inferredMetaAdsetSpendInRange || 0);
      if (!agg.campaignLeadsInRange && Number(r.inferredMetaCampaignLeadsInRange || 0) > 0) agg.campaignLeadsInRange = Number(r.inferredMetaCampaignLeadsInRange || 0);
    });

    const metaGreatAttributionRows = Array.from(metaGreatByCampaignAdset.values()).map((agg) => ({
      key: agg.key,
      metaCampaignRaw: agg.metaCampaignRaw,
      inferredMetaAdset: agg.inferredMetaAdset,
      inferredMetaTopAd: agg.inferredMetaTopAd,
      sourceDetail1: agg.sourceDetail1,
      greatMemberCount: agg.greatMembers.length,
      greatMemberNames: agg.greatMembers.map((r) => r.greatMemberName).join(', '),
      totalAttendances: agg.totalAttendances,
      avgAttendances: mean(agg.greatMembers.map((r) => Number(r.totalZoomAttendances || 0))),
      avgRevenue: mean(agg.revenues),
      medianRevenue: median(agg.revenues),
      acquiredInRangeCount: agg.acquiredInRangeCount,
      campaignSpendInRange: agg.campaignSpendInRange,
      adsetSpendInRange: agg.adsetSpendInRange,
      campaignLeadsInRange: agg.campaignLeadsInRange,
      estCostPerGreatMemberCampaignActive: safeRatio(agg.campaignSpendInRange, agg.greatMembers.length),
      estCostPerGreatMemberCampaignAcqInRange: safeRatio(agg.campaignSpendInRange, agg.acquiredInRangeCount),
      estCplCampaign: safeRatio(agg.campaignSpendInRange, agg.campaignLeadsInRange),
      rows: agg.greatMembers,
    })).sort((a, b) => {
      if (b.greatMemberCount !== a.greatMemberCount) return b.greatMemberCount - a.greatMemberCount;
      if ((b.totalAttendances || 0) !== (a.totalAttendances || 0)) return (b.totalAttendances || 0) - (a.totalAttendances || 0);
      return String(a.metaCampaignRaw || '').localeCompare(String(b.metaCampaignRaw || ''));
    });

    const currentCat = currentCombined.categorization || {};
    const prevCat = previousCombined?.categorization || {};
    const costMetrics = {
      freeMetaSpend: Number(currentCombined.spend || 0),
      costPerLumaRegistrant: toNumberOrNull(currentCombined.costPerRegistration),
      costPerZoomShowUpPaid: toNumberOrNull(currentZoom?.paidMeta?.costPerShowUp),
      costPerGreatMemberPaidBlended: toNumberOrNull(currentZoom?.paidMeta?.costPerGoodRepeatMember),
      costPerGreatMemberPaidAcqInRange: toNumberOrNull(currentZoom?.paidMeta?.costPerGoodRepeatMemberAcquiredInRange),
      costPerBadLead: safeRatio(currentCombined.spend, Number(currentCat.bad || 0)),
      costPerOkLead: safeRatio(currentCombined.spend, Number(currentCat.ok || 0)),
      costPerGoodLeadQualified: safeRatio(currentCombined.spend, Number(currentCat.qualified || 0)),
      costPerGreatLead1m: safeRatio(currentCombined.spend, Number(currentCat.great || 0)),
      costPerHighQualityLead250kPlus: safeRatio(currentCombined.spend, Number(currentCat.qualified || 0) + Number(currentCat.great || 0)),
    };
    const previousCostMetrics = previousCombined && previousZoom ? {
      freeMetaSpend: Number(previousCombined.spend || 0),
      costPerLumaRegistrant: toNumberOrNull(previousCombined.costPerRegistration),
      costPerZoomShowUpPaid: toNumberOrNull(previousZoom?.paidMeta?.costPerShowUp),
      costPerGreatMemberPaidBlended: toNumberOrNull(previousZoom?.paidMeta?.costPerGoodRepeatMember),
      costPerGreatMemberPaidAcqInRange: toNumberOrNull(previousZoom?.paidMeta?.costPerGoodRepeatMemberAcquiredInRange),
      costPerBadLead: safeRatio(previousCombined.spend, Number(prevCat.bad || 0)),
      costPerOkLead: safeRatio(previousCombined.spend, Number(prevCat.ok || 0)),
      costPerGoodLeadQualified: safeRatio(previousCombined.spend, Number(prevCat.qualified || 0)),
      costPerGreatLead1m: safeRatio(previousCombined.spend, Number(prevCat.great || 0)),
      costPerHighQualityLead250kPlus: safeRatio(previousCombined.spend, Number(prevCat.qualified || 0) + Number(prevCat.great || 0)),
    } : null;

    const costCards = [
      { key: 'freeMetaSpend', label: 'Free Meta Spend', value: costMetrics.freeMetaSpend, previous: previousCostMetrics?.freeMetaSpend ?? null, format: 'currency', invertColor: false, note: 'Selected date range' },
      { key: 'costPerLumaRegistrant', label: 'Cost / Lu.ma Registrant', value: costMetrics.costPerLumaRegistrant, previous: previousCostMetrics?.costPerLumaRegistrant ?? null, format: 'currency', invertColor: true, note: 'Free funnel (Group 1)' },
      { key: 'costPerZoomShowUpPaid', label: 'Cost / Paid Show-Up', value: costMetrics.costPerZoomShowUpPaid, previous: previousCostMetrics?.costPerZoomShowUpPaid ?? null, format: 'currency', invertColor: true, note: 'HubSpot Calls Tue/Thu truth' },
      { key: 'costPerGreatMemberPaidAcqInRange', label: 'Cost / Great Member (Acq In Range)', value: costMetrics.costPerGreatMemberPaidAcqInRange, previous: previousCostMetrics?.costPerGreatMemberPaidAcqInRange ?? null, format: 'currency', invertColor: true, note: 'Best current KPI' },
      { key: 'costPerGreatMemberPaidBlended', label: 'Cost / Great Member (Blended Active)', value: costMetrics.costPerGreatMemberPaidBlended, previous: previousCostMetrics?.costPerGreatMemberPaidBlended ?? null, format: 'currency', invertColor: true, note: 'Includes older cohorts active now' },
      { key: 'costPerBadLead', label: 'Cost / Bad Lead', value: costMetrics.costPerBadLead, previous: previousCostMetrics?.costPerBadLead ?? null, format: 'currency', invertColor: true, note: 'Lead tier < $100k' },
      { key: 'costPerGoodLeadQualified', label: 'Cost / Good Lead ($250k-$999k)', value: costMetrics.costPerGoodLeadQualified, previous: previousCostMetrics?.costPerGoodLeadQualified ?? null, format: 'currency', invertColor: true, note: 'Qualified lead tier' },
      { key: 'costPerGreatLead1m', label: 'Cost / Great Lead ($1M+)', value: costMetrics.costPerGreatLead1m, previous: previousCostMetrics?.costPerGreatLead1m ?? null, format: 'currency', invertColor: true, note: 'Top lead tier' },
      { key: 'costPerHighQualityLead250kPlus', label: 'Cost / High-Quality Lead ($250k+)', value: costMetrics.costPerHighQualityLead250kPlus, previous: previousCostMetrics?.costPerHighQualityLead250kPlus ?? null, format: 'currency', invertColor: true, note: 'Qualified + Great leads' },
    ];

    const greatMembersBySource = currentGreatSourceRows.map((row) => ({
      ...row,
      previousGreatMembers: Number(previousGreatSourceRowsByLabel.get(row.label)?.goodRepeatMembers || 0),
      previousShare: previousGreatSourceRowsByLabel.get(row.label)?.goodMemberShare ?? null,
    })).sort((a, b) => (b.greatMembers - a.greatMembers) || (b.repeatMembers - a.repeatMembers) || a.label.localeCompare(b.label));

    const greatRevenueValues = currentGreatMembers.map((r) => toNumberOrNull(r.revenue)).filter((v) => Number.isFinite(v));
    const greatAttendanceValues = currentGreatMembers.map((r) => Number(r.totalZoomAttendances || 0)).filter((v) => Number.isFinite(v));
    const bothDayCount = currentGreatMembers.filter((r) => r.greatMemberCrossesTueThu === 'Yes').length;
    const topSource = greatMembersBySource[0] || null;
    const topMetaCohort = metaGreatAttributionRows[0] || null;

    const similarityBullets = [];
    similarityBullets.push(`Great members (3+ Zoom + $250k+) in range: ${currentGreatMembers.length}.`);
    if (topSource) similarityBullets.push(`Largest great-member source bucket: ${topSource.label} (${topSource.greatMembers} members, ${fmt.pct(topSource.share || 0)} of great members).`);
    if (metaGreatMembers.length > 0) similarityBullets.push(`${metaGreatMembers.length} great members are attributed to Paid Social (Meta).`);
    if (Number.isFinite(mean(greatAttendanceValues))) similarityBullets.push(`Average attendances among great members: ${mean(greatAttendanceValues).toFixed(1)} (median ${median(greatAttendanceValues)?.toFixed(1) || 'N/A'}).`);
    if (Number.isFinite(mean(greatRevenueValues))) similarityBullets.push(`Average revenue among great members: ${fmt.currency(mean(greatRevenueValues))} (median ${fmt.currency(median(greatRevenueValues))}).`);
    if (currentGreatMembers.length > 0) similarityBullets.push(`${bothDayCount} of ${currentGreatMembers.length} great members attend both Tuesday and Thursday (${fmt.pct(safeRatio(bothDayCount, currentGreatMembers.length) || 0)}).`);
    if (topMetaCohort) {
      similarityBullets.push(`Top Meta great-member cohort: ${topMetaCohort.inferredMetaAdset !== 'Not Found' ? topMetaCohort.inferredMetaAdset : topMetaCohort.metaCampaignRaw} (${topMetaCohort.greatMemberCount} members, est ${fmt.currency(topMetaCohort.estCostPerGreatMemberCampaignAcqInRange ?? topMetaCohort.estCostPerGreatMemberCampaignActive)} per great member using campaign spend in selected range).`);
    }

    return {
      currentWindow,
      previousWindow,
      costCards,
      greatMembers: currentGreatMembers,
      greatMembersBySource,
      metaGreatAttributionRows,
      similarityBullets,
      diagnostics: {
        totalGreatMembers: currentGreatMembers.length,
        paidMetaGreatMembers: metaGreatMembers.length,
        unattributedGreatMembers: currentGreatMembers.filter((r) => ['Unknown', 'Other'].includes(String(r.sourceBucket || ''))).length,
      },
    };
  }, [groupedData, zoomSourceModule, rawAds, dateWindows]);

  // Modal helper
  const openModal = useCallback((type, snap, groupLabel) => {
    const PERSON_COLS = [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email Address' },
      { key: 'showedUp', label: 'Showed Up?' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'sobrietyDate', label: 'Sobriety Date' },
    ];
    const LUMA_COLS = [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email Address' },
      { key: 'showedUp', label: 'Showed Up?' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'sobrietyDate', label: 'Sobriety Date' },
      { key: 'adGroup', label: 'Facebook Ad Group' },
      { key: 'originalTrafficSource', label: 'Original Traffic Source' },
      { key: 'originalTrafficSourceDetail1', label: 'Original Traffic Source Detail 1' },
      { key: 'originalTrafficSourceDetail2', label: 'Original Traffic Source Detail 2' },
      { key: 'hearAboutCategory', label: 'How Heard (Category)' },
      { key: 'hearAbout', label: 'How Did You Hear About Sober Founders?' },
      { key: 'hearAboutSource', label: 'Hear About Source' },
    ];
    const ZOOM_COLS = [{ key: 'date', label: 'Date' }, { key: 'name', label: 'Name' }, { key: 'dayType', label: 'Day' }];

    if (type === 'leads') {
      const sortedRows = [...(snap.leadRows || [])].sort((a, b) => {
        if (a.matchedZoom === b.matchedZoom) return String(a.name || '').localeCompare(String(b.name || ''));
        return a.matchedZoom ? -1 : 1;
      });
      setModal({
        title: `${groupLabel} — Leads`,
        columns: PERSON_COLS,
        rows: sortedRows,
        highlightKey: 'matchedZoom',
      });
    }
    if (type === 'luma') {
      // Sort with Showed Up first, then high official-revenue no-shows for nurture follow-up.
      const sortedRows = [...(snap.lumaRows || [])].sort((a, b) => {
        if (a.matchedZoom !== b.matchedZoom) return a.matchedZoom ? -1 : 1;

        // For no-shows, sort by annual_revenue_in_dollars__official_ descending.
        if (!a.matchedZoom && !b.matchedZoom) {
          const aOfficial = Number(a.revenueOfficial);
          const bOfficial = Number(b.revenueOfficial);
          const aHas = Number.isFinite(aOfficial);
          const bHas = Number.isFinite(bOfficial);
          if (aHas && bHas && aOfficial !== bOfficial) return bOfficial - aOfficial;
          if (aHas !== bHas) return aHas ? -1 : 1;
        }

        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      setModal({
        title: `${groupLabel} — Luma Registrations`,
        columns: LUMA_COLS,
        rows: sortedRows,
        highlightKey: 'matchedZoom'
      });
    }
    if (type === 'zoom') {
      setModal({ title: `${groupLabel} — Zoom Show-Ups`, columns: ZOOM_COLS, rows: snap.zoomRows || [] });
    }
  }, []);

  // Legacy drilldown helpers
  const drilldownDataReady = !analytics?.drilldowns?.isDeferred;
  const activeDrilldownWindow = analytics?.drilldowns?.byWindow?.[drilldownWindowKey] || null;
  const activeDrilldownTable = activeDrilldownWindow?.tables?.[drilldownMetricKey] || null;
  const drilldownQuickMetrics = ['leads', 'registrations', 'showups', 'qualified', 'great', 'cpl', 'cpql', 'cost_per_showup', 'cost_per_registration'];

  const topAttributionRows = useMemo(() => {
    if (!legacyComparisonOpen || !analytics?.adAttributionRows) return [];
    return [...analytics.adAttributionRows].sort((a, b) => (b.attributedShowUps - a.attributedShowUps) || (b.spend - a.spend)).slice(0, 15);
  }, [legacyComparisonOpen, analytics]);

  const liveFreshnessModule = useMemo(() => {
    const todayKeyUtc = new Date().toISOString().slice(0, 10);
    const latestDateKeyFromRows = (rows, dateGetter) => {
      let latest = null;
      (rows || []).forEach((row) => {
        const key = parseDateKeyLoose(dateGetter(row));
        if (!key) return;
        if (!latest || key > latest) latest = key;
      });
      return latest;
    };

    const sourceRows = [
      {
        key: 'ads',
        label: 'Meta Ads',
        color: '#0f766e',
        rowCount: (rawAds || []).length,
        dateKey: latestDateKeyFromRows(rawAds, (row) => row?.date_day),
      },
      {
        key: 'hubspot',
        label: 'HubSpot Leads',
        color: '#0284c7',
        rowCount: (rawHubspot || []).length,
        dateKey: latestDateKeyFromRows(rawHubspot, (row) => row?.createdate),
      },
      {
        key: 'luma',
        label: 'Lu.ma Registrations',
        color: '#7c3aed',
        rowCount: (rawLuma || []).length,
        dateKey: latestDateKeyFromRows(rawLuma, (row) => row?.event_date || row?.event_start_at || row?.registered_at),
      },
      {
        key: 'zoom',
        label: 'Zoom KPI',
        color: '#d97706',
        rowCount: (rawZoom || []).length,
        dateKey: latestDateKeyFromRows(rawZoom, (row) => row?.metadata?.start_time || row?.metric_date),
      },
    ].map((row) => {
      const staleDays = row.dateKey ? daysBetweenDateKeys(todayKeyUtc, row.dateKey) : null;
      let tone = 'unknown';
      if (staleDays !== null) tone = staleDays <= 3 ? 'fresh' : staleDays <= 14 ? 'watch' : 'stale';
      return { ...row, staleDays, tone };
    });

    const availableDateKeys = sourceRows
      .map((row) => row.dateKey)
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)));
    const oldestDateKey = availableDateKeys.length > 0 ? availableDateKeys[0] : null;
    const newestDateKey = availableDateKeys.length > 0 ? availableDateKeys[availableDateKeys.length - 1] : null;
    const freshnessSpreadDays = newestDateKey && oldestDateKey
      ? daysBetweenDateKeys(newestDateKey, oldestDateKey)
      : null;

    return {
      sourceRows,
      todayKeyUtc,
      oldestDateKey,
      newestDateKey,
      freshnessSpreadDays,
      staleSources: sourceRows.filter((row) => row.tone === 'stale'),
      watchSources: sourceRows.filter((row) => row.tone === 'watch'),
    };
  }, [rawAds, rawHubspot, rawLuma, rawZoom]);

  const recentMomentumModule = useMemo(() => {
    const currentWindow = dateWindows?.current || null;
    if (!currentWindow?.start || !currentWindow?.end) {
      return { weeklyRows: [], latestWeek: null, previousWeek: null, summaryCards: [] };
    }
    const startKey = currentWindow.start;
    const endKey = currentWindow.end;
    const dateInRange = (dateKey) => !!dateKey && dateKey >= startKey && dateKey <= endKey;
    const weekMap = new Map();
    const ensureWeek = (weekKey) => {
      if (!weekKey) return null;
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, {
          weekKey,
          label: formatWeekKeyLabel(weekKey),
          metaLeads: 0,
          paidHubspotLeads: 0,
          lumaRegistrations: 0,
          zoomAttendees: 0,
          metaSpend: 0,
        });
      }
      return weekMap.get(weekKey);
    };

    (rawAds || []).forEach((row) => {
      const dateKey = parseDateKeyLoose(row?.date_day);
      if (!dateInRange(dateKey)) return;
      const weekKey = mondayKey(dateKey);
      const agg = ensureWeek(weekKey);
      if (!agg) return;
      const leads = Number(row?.leads || 0);
      const spend = Number(row?.spend || 0);
      agg.metaLeads += Number.isFinite(leads) ? leads : 0;
      agg.metaSpend += Number.isFinite(spend) ? spend : 0;
    });

    const paidLeadSeenByWeekIdentity = new Set();
    (rawHubspot || []).forEach((row) => {
      const dateKey = parseDateKeyLoose(row?.createdate);
      if (!dateInRange(dateKey)) return;
      if (!isPaidSocialHubspot(row) || isPhoenixHubspot(row)) return;
      const weekKey = mondayKey(dateKey);
      const agg = ensureWeek(weekKey);
      if (!agg) return;
      const identityKey = hubspotIdentityKey(row);
      if (!identityKey) return;
      const dedupeKey = `${weekKey}|${identityKey}`;
      if (paidLeadSeenByWeekIdentity.has(dedupeKey)) return;
      paidLeadSeenByWeekIdentity.add(dedupeKey);
      agg.paidHubspotLeads += 1;
    });

    (rawLuma || []).forEach((row) => {
      const approvalStatus = String(row?.approval_status || 'approved').toLowerCase();
      if (approvalStatus && approvalStatus !== 'approved') return;
      const dateKey = parseDateKeyLoose(row?.event_date || row?.event_start_at || row?.registered_at);
      if (!dateInRange(dateKey)) return;
      const weekKey = mondayKey(dateKey);
      const agg = ensureWeek(weekKey);
      if (!agg) return;
      agg.lumaRegistrations += 1;
    });

    (rawZoom || []).forEach((row) => {
      const dateKey = parseDateKeyLoose(row?.metadata?.start_time || row?.metric_date);
      if (!dateInRange(dateKey)) return;
      const weekKey = mondayKey(dateKey);
      const agg = ensureWeek(weekKey);
      if (!agg) return;
      const attendees = Number(row?.metric_value || 0);
      agg.zoomAttendees += Number.isFinite(attendees) ? attendees : 0;
    });

    const weeklyRows = Array.from(weekMap.values())
      .sort((a, b) => String(a.weekKey).localeCompare(String(b.weekKey)))
      .map((row) => ({
        ...row,
        cpl: row.metaLeads > 0 ? row.metaSpend / row.metaLeads : null,
      }))
      .slice(-12);

    const latestWeek = weeklyRows[weeklyRows.length - 1] || null;
    const previousWeek = weeklyRows.length > 1 ? weeklyRows[weeklyRows.length - 2] : null;
    const card = (key, label, format = 'count', invertColor = false) => ({
      key,
      label,
      format,
      invertColor,
      value: latestWeek ? latestWeek[key] : null,
      changePct: previousWeek ? computeChangePct(latestWeek?.[key] || 0, previousWeek?.[key] || 0).pct : null,
    });

    return {
      weeklyRows,
      latestWeek,
      previousWeek,
      summaryCards: [
        card('metaLeads', 'Latest Week Meta Leads'),
        card('paidHubspotLeads', 'Latest Week Paid HubSpot Leads'),
        card('lumaRegistrations', 'Latest Week Lu.ma Registrations'),
        card('zoomAttendees', 'Latest Week Zoom Attendees'),
        card('cpl', 'Latest Week Meta CPL', 'currency', true),
      ],
    };
  }, [dateWindows, rawAds, rawHubspot, rawLuma, rawZoom]);

  function trendDirection(cur, prev) {
    if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return 'neutral';
    return cur > prev ? 'up' : cur < prev ? 'down' : 'neutral';
  }

  const showupRows = analytics?.showUpTracker?.rows?.slice(-20) || [];
  const fmtMaybeCurrency = (v) => {
    if (v === null || v === undefined || v === '') return 'N/A';
    const n = Number(v);
    return Number.isFinite(n) ? fmt.currency(n) : 'N/A';
  };
  const fmtMaybePct = (v) => {
    if (v === null || v === undefined || v === '') return 'N/A';
    const n = Number(v);
    return Number.isFinite(n) ? fmt.pct(n) : 'N/A';
  };
  const freshnessToneStyle = {
    fresh: { border: '#86efac', bg: '#f0fdf4', text: '#166534', chipBg: '#dcfce7' },
    watch: { border: '#fcd34d', bg: '#fffbeb', text: '#92400e', chipBg: '#fef3c7' },
    stale: { border: '#fecaca', bg: '#fef2f2', text: '#991b1b', chipBg: '#fee2e2' },
    unknown: { border: '#e2e8f0', bg: '#f8fafc', text: '#334155', chipBg: '#e2e8f0' },
  };
  const freshnessStatusLabel = (row) => {
    if (!row?.dateKey) return 'No data';
    if (!Number.isFinite(row?.staleDays)) return 'Unknown';
    if (row.staleDays <= 3) return 'Fresh';
    if (row.staleDays <= 14) return `Lagging ${row.staleDays}d`;
    return `Stale ${row.staleDays}d`;
  };
  const currentMissingHubspotCallSessions = zoomSourceModule?.current?.missingHubspotCallSessions || [];
  const currentActionableMissingHubspotCallSessions = currentMissingHubspotCallSessions.filter((r) => String(r?.actionRequired || '') === 'Yes');
  const currentLikelyNoMeetingHubspotCallSessions = currentMissingHubspotCallSessions.filter((r) => String(r?.missingCategory || '') === 'likely_no_meeting');
  const unifiedCurrent = unifiedFunnelModule?.current || null;
  const unifiedPrevious = unifiedFunnelModule?.previous || null;
  const openUnifiedDrilldown = (title, columns, rows, options = {}) => {
    setModal({
      title,
      columns,
      rows: rows || [],
      highlightKey: options.highlightKey,
    });
  };
  const confidenceChangePct = (sectionKey, confidence) => {
    const curRow = unifiedCurrent?.matchConfidenceBreakdown?.[sectionKey]?.find((r) => r.confidence === confidence);
    const prevRow = unifiedPrevious?.matchConfidenceBreakdown?.[sectionKey]?.find((r) => r.confidence === confidence);
    if (!curRow || !prevRow) return null;
    return computeChangePct(curRow.count || 0, prevRow.count || 0).pct;
  };

  const overviewCurrentCombined = groupedData?.current?.free?.combined || null;
  const overviewPreviousCombined = groupedData?.previous?.free?.combined || null;
  const overviewCurrentFreeSpend = Number(overviewCurrentCombined?.spend || 0);
  const overviewPreviousFreeSpend = Number(overviewPreviousCombined?.spend || 0);
  const overviewCurrentPhoenixSpend = Number(groupedData?.current?.phoenix?.spend || 0);
  const overviewPreviousPhoenixSpend = Number(groupedData?.previous?.phoenix?.spend || 0);
  const overviewCurrentTotalSpend = overviewCurrentFreeSpend + overviewCurrentPhoenixSpend;
  const overviewPreviousTotalSpend = overviewPreviousFreeSpend + overviewPreviousPhoenixSpend;

  const adSpendAccountBreakdown = useMemo(() => {
    const startKey = dateWindows?.current?.start;
    const endKey = dateWindows?.current?.end;
    if (!startKey || !endKey) {
      return { totalByAccount: [], freeByAccount: [], phoenixByAccount: [], phoenixSplitNote: 'Phoenix Forum Meta spend for selected window' };
    }

    const byAccount = new Map();
    for (const row of rawAds || []) {
      const dateKey = parseDateKeyLoose(row?.date_day);
      if (!dateKey || dateKey < startKey || dateKey > endKey) continue;

      const accountId = String(row?.ad_account_id || '').trim() || 'Unknown account';
      const spend = Number(row?.spend || 0);
      if (!Number.isFinite(spend)) continue;

      if (!byAccount.has(accountId)) byAccount.set(accountId, { total: 0, free: 0, phoenix: 0 });
      const bucket = byAccount.get(accountId);
      bucket.total += spend;

      const funnel = String(row?.funnel_key || row?.campaign_name || '').toLowerCase();
      const isPhoenix = funnel.includes('phoenix') || String(row?.campaign_name || '').toLowerCase().includes('phoenix');
      if (isPhoenix) bucket.phoenix += spend;
      else bucket.free += spend;
    }

    const toRows = (key) => Array.from(byAccount.entries())
      .map(([accountId, values]) => ({ accountId, spend: Number(values?.[key] || 0) }))
      .filter((row) => row.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    const phoenixByAccount = toRows('phoenix');
    const phoenixSplitNote = phoenixByAccount.length > 0
      ? `Phoenix split: ${phoenixByAccount.map((row) => `${row.accountId} ${fmt.currency(row.spend)}`).join(' + ')}`
      : 'Phoenix Forum Meta spend for selected window';

    return {
      totalByAccount: toRows('total'),
      freeByAccount: toRows('free'),
      phoenixByAccount,
      phoenixSplitNote,
    };
  }, [rawAds, dateWindows]);
  const leadsConfidenceActionData = (() => {
    const normalizeQueuePayload = (source) => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
      const pickFirstArray = (...values) => {
        for (const value of values) {
          if (Array.isArray(value)) return value;
        }
        return [];
      };

      const scoreRaw = Number(
        source?.confidence_score
        ?? source?.confidenceScore
        ?? source?.score
        ?? source?.confidence,
      );
      const confidenceScore = Number.isFinite(scoreRaw)
        ? (scoreRaw > 1 ? scoreRaw / 100 : scoreRaw)
        : null;

      return {
        confidence_score: confidenceScore,
        confidence_level: String(source?.confidence_level ?? source?.confidenceLevel ?? '').trim(),
        blockers: pickFirstArray(source?.blockers, source?.top_blockers, source?.topBlockers),
        autonomous_tasks: pickFirstArray(source?.autonomous_tasks, source?.autonomousTasks, source?.autonomous_actions, source?.autonomousActions),
        human_tasks: pickFirstArray(source?.human_tasks, source?.humanTasks, source?.human_actions, source?.humanActions),
      };
    };

    const objectCandidates = [
      analytics?.confidence_action_queue,
      analytics?.confidenceActionQueue,
      analytics?.analysis?.confidence_action_queue,
      analytics?.analysis?.confidenceActionQueue,
      groupedData?.confidence_action_queue,
      groupedData?.confidenceActionQueue,
    ];

    const prebuiltPayload = objectCandidates.find((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate));
    if (prebuiltPayload) return normalizeQueuePayload(prebuiltPayload);

    if (typeof buildLeadsConfidenceSummary === 'function' && typeof buildLeadsActionQueue === 'function') {
      try {
        const confidenceInput = {
          analytics,
          groupedData,
          unifiedCurrent,
          unifiedPrevious,
          loadErrors,
          dateWindows,
        };
        const summary = buildLeadsConfidenceSummary(confidenceInput);
        const queue = buildLeadsActionQueue({ confidence_summary: summary, ...confidenceInput });
        const mergedPayload = {
          ...(summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {}),
          ...(queue && typeof queue === 'object' && !Array.isArray(queue) ? queue : {}),
        };
        if (Object.keys(mergedPayload).length > 0) {
          return normalizeQueuePayload(mergedPayload);
        }
      } catch (confidenceErr) {
        // Keep the page resilient when W1 helpers are unavailable or fail.
      }
    }

    return null;
  })();
  const leadsParityReport = useMemo(() => {
    const parityFnName = 'computeLeadsParityReport';
    const computeLeadsParityReport = leadsGroupAnalyticsLib?.[parityFnName];
    if (typeof computeLeadsParityReport !== 'function') return null;
    try {
      return computeLeadsParityReport({
        analytics,
        groupedData,
        dateWindows,
        rawAds,
        rawHubspot,
        rawLuma,
        rawZoom,
      });
    } catch {
      return null;
    }
  }, [analytics, groupedData, dateWindows, rawAds, rawHubspot, rawLuma, rawZoom]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <LeadsConfidenceActionPanel isLoading />
        <LeadsParityGuardPanel isLoading />
        <GroupSkeleton /><GroupSkeleton />
        <div style={{ ...card }}><Skeleton h="300px" /></div>
      </div>
    );
  }

  const qualificationCurrent = summarizeLeadQualificationAndQuality(
    overviewCurrentCombined?.leadRows || [],
  );
  const qualificationPrevious = summarizeLeadQualificationAndQuality(
    overviewPreviousCombined?.leadRows || [],
  );
  const currentFreeGroupHubspotLeads = Number(
    overviewCurrentCombined?.categorization?.categorizedTotal
    || qualificationCurrent.total
    || 0,
  );
  const previousFreeGroupHubspotLeads = Number(
    overviewPreviousCombined?.categorization?.categorizedTotal
    || qualificationPrevious.total
    || 0,
  );
  const currentLeadsForQualification = currentFreeGroupHubspotLeads;
  const qualifiedLeadRate = currentLeadsForQualification > 0 ? (qualificationCurrent.qualified / currentLeadsForQualification) : null;
  const estimatedCostPerLead = currentLeadsForQualification > 0 ? (overviewCurrentFreeSpend / currentLeadsForQualification) : null;
  const estimatedCostPerQualifiedLead = qualificationCurrent.qualified > 0 ? (overviewCurrentFreeSpend / qualificationCurrent.qualified) : null;
  const estimatedNonQualifiedSpend = Number.isFinite(estimatedCostPerLead)
    ? estimatedCostPerLead * qualificationCurrent.nonQualified
    : null;

  const getChangePct = (currentValue, previousValue) => {
    if (previousValue === null || previousValue === undefined) return null;
    return computeChangePct(Number(currentValue || 0), Number(previousValue || 0)).pct;
  };

  const overviewKpiCards = [
    {
      key: 'ad_spend_total',
      label: 'Ad Spend (Total)',
      value: overviewCurrentTotalSpend,
      previous: overviewPreviousTotalSpend,
      format: 'currency',
      invertColor: true,
      note: 'Meta spend across Free Groups + Phoenix Forum',
      color: '#0f172a',
    },
    {
      key: 'ad_spend_free',
      label: 'Ad Spend (Free Groups)',
      value: overviewCurrentFreeSpend,
      previous: overviewPreviousFreeSpend,
      format: 'currency',
      invertColor: true,
      note: 'Meta spend for non-Phoenix campaigns in selected window',
      color: '#dc2626',
    },
    {
      key: 'ad_spend_phoenix',
      label: 'Ad Spend (Phoenix Forum)',
      value: overviewCurrentPhoenixSpend,
      previous: overviewPreviousPhoenixSpend,
      format: 'currency',
      invertColor: true,
      note: adSpendAccountBreakdown.phoenixSplitNote,
      color: '#ea580c',
    },
    {
      key: 'total_leads',
      label: 'Free Group Leads',
      value: currentFreeGroupHubspotLeads,
      previous: previousFreeGroupHubspotLeads,
      format: 'count',
      note: 'HubSpot paid-social leads in selected window where campaign attribution is non-Phoenix',
      color: '#0f766e',
    },
    {
      key: 'qualified_leads',
      label: 'Free Group Qualified Leads',
      value: Number(qualificationCurrent?.qualified || 0),
      previous: dateWindows?.previous ? Number(qualificationPrevious?.qualified || 0) : null,
      format: 'count',
      note: 'Sobriety > 1 year and revenue >= $250K (official first, fallback only if official is missing)',
      color: '#2563eb',
    },
    {
      key: 'non_qualified_leads',
      label: 'Free Group Non-Qualified Leads',
      value: Number(qualificationCurrent?.nonQualified || 0),
      previous: dateWindows?.previous ? Number(qualificationPrevious?.nonQualified || 0) : null,
      format: 'count',
      note: 'Free Group leads not meeting qualified rule',
      color: '#64748b',
    },
    {
      key: 'great_leads',
      label: 'Free Group Great Leads ($1M+)',
      value: Number(qualificationCurrent?.qualityCounts?.great || 0),
      previous: dateWindows?.previous ? Number(qualificationPrevious?.qualityCounts?.great || 0) : null,
      format: 'count',
      note: 'Top revenue tier in selected range',
      color: '#16a34a',
    },
  ];

  const qualityMixRows = [
    { key: 'bad', label: 'Bad (<$100K)', value: Number(qualificationCurrent?.qualityCounts?.bad || 0), color: '#dc2626' },
    { key: 'ok', label: 'OK ($100K-$249K)', value: Number(qualificationCurrent?.qualityCounts?.ok || 0), color: '#b45309' },
    { key: 'good', label: 'Good ($250K-$999K)', value: Number(qualificationCurrent?.qualityCounts?.good || 0), color: '#2563eb' },
    { key: 'great', label: 'Great ($1M+)', value: Number(qualificationCurrent?.qualityCounts?.great || 0), color: '#16a34a' },
  ];
  const qualificationPieRows = [
    { key: 'qualified', label: 'Qualified', value: Number(qualificationCurrent?.qualified || 0), color: '#2563eb' },
    { key: 'nonQualified', label: 'Non-Qualified', value: Number(qualificationCurrent?.nonQualified || 0), color: '#94a3b8' },
  ];
  const qualityMixTotal = qualityMixRows.reduce((sum, row) => sum + row.value, 0);
  const qualityUnknownCount = Number(qualificationCurrent?.qualityCounts?.unknown || 0);
  const leadsQualificationSnapshot = buildLeadsQualificationSnapshot({
    leadRows: overviewCurrentCombined?.leadRows || [],
    spend: overviewCurrentFreeSpend,
    referenceDate: new Date(),
  });
  const leadsKpiSnapshot = buildUnifiedKpiSnapshot({
    lookbackDays: LOOKBACK_DAYS,
    generatedAt: new Date().toISOString(),
    sourceLineage: (liveFreshnessModule?.sourceRows || []).map((row) => ({
      key: row?.key,
      label: row?.label,
      row_count: row?.rowCount,
      latest_date: row?.dateKey,
    })),
    leads: leadsQualificationSnapshot,
    attendance: {},
    dashboard: {},
  });
  const leadsQualificationParityData = (() => {
    const report = (leadsParityReport && typeof leadsParityReport === 'object') ? leadsParityReport : {};
    const summary = (report.summary && typeof report.summary === 'object') ? report.summary : {};

    const toNumberOrNull = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const qualifiedFromReport = toNumberOrNull(report.qualified_count ?? summary.qualified_count);
    const goodFromReport = toNumberOrNull(report.good_count ?? summary.good_count);
    const greatFromReport = toNumberOrNull(report.great_count ?? summary.great_count);
    const revenueEligibleFromReport = toNumberOrNull(report.revenue_eligible_count ?? summary.revenue_eligible_count);
    const deltaFromReport = toNumberOrNull(report.qualified_quality_parity_delta ?? summary.qualified_quality_parity_delta);
    const sobrietyGapFromReport = toNumberOrNull(report.qualified_sobriety_gap_count ?? summary.qualified_sobriety_gap_count);

    const qualifiedFallback = toNumberOrNull(qualificationCurrent?.qualified);
    const okFallback = toNumberOrNull(qualificationCurrent?.qualityCounts?.ok);
    const goodFallback = toNumberOrNull(qualificationCurrent?.qualityCounts?.good);
    const greatFallback = toNumberOrNull(qualificationCurrent?.qualityCounts?.great);

    const qualifiedCount = qualifiedFromReport ?? qualifiedFallback;
    const goodCount = goodFromReport ?? goodFallback;
    const greatCount = greatFromReport ?? greatFallback;
    const revenueEligibleCount = revenueEligibleFromReport ?? (
      okFallback !== null && goodCount !== null && greatCount !== null
        ? okFallback + goodCount + greatCount
        : null
    );
    const computedDelta = (
      qualifiedCount !== null && revenueEligibleCount !== null
        ? qualifiedCount - revenueEligibleCount
        : null
    );
    const computedSobrietyGap = (
      qualifiedCount !== null && revenueEligibleCount !== null
        ? Math.max(revenueEligibleCount - qualifiedCount, 0)
        : null
    );

    return {
      qualified_count: qualifiedCount,
      good_count: goodCount,
      great_count: greatCount,
      revenue_eligible_count: revenueEligibleCount,
      qualified_quality_parity_delta: deltaFromReport ?? computedDelta,
      qualified_sobriety_gap_count: sobrietyGapFromReport ?? computedSobrietyGap,
    };
  })();

  const leadsManagerInsightsData = deferredInsightsReady
    ? buildLeadsManagerInsights({
      analytics,
      groupedData,
      dateWindows,
      qualificationCurrent,
      qualificationPrevious,
    })
    : null;

  const leadsExperimentAnalyzerData = deferredInsightsReady
    ? buildLeadsExperimentAnalyzer({
      adAttributionRows: analytics?.adAttributionRows || [],
      sourceRows: zoomSourceModule?.current?.sourceRows || [],
      minLeadsThreshold: 8,
    })
    : null;

  const costCardLookup = new Map((leadsDecisionModule?.costCards || []).map((row) => [row.key, row]));
  const previousCpql = Number(costCardLookup.get('costPerGoodLeadQualified')?.previous);
  const previousCpgl = Number(costCardLookup.get('costPerGreatLead1m')?.previous);
  const qualifiedTargetAtPriorEfficiency = Number.isFinite(previousCpql) && previousCpql > 0 ? overviewCurrentFreeSpend / previousCpql : null;
  const greatTargetAtPriorEfficiency = Number.isFinite(previousCpgl) && previousCpgl > 0 ? overviewCurrentFreeSpend / previousCpgl : null;

  const executiveRecommendations = [
    ...(paidDecisionInsights?.moves || []),
    ...(paidDecisionInsights?.warnings || []),
    ...(leadsDecisionModule?.similarityBullets || []),
  ].filter(Boolean).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Errors */}
      {loadErrors.length > 0 && (
        <div style={{ ...card, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#92400e' }}>Data Quality Notes</p>
          {loadErrors.map((m) => <p key={m} style={{ margin: '4px 0 0', fontSize: '13px', color: '#92400e' }}>{m}</p>)}
        </div>
      )}

      {/* ── Date Range Filter ── */}
      <div style={{ ...card, background: 'linear-gradient(140deg,#f8fafc 0%,#eef2ff 55%,#ecfeff 100%)', border: '1px solid #dbeafe' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: '11px', color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800 }}>
              Leads Command Center
            </p>
            <h2 style={{ margin: '8px 0 0', fontSize: '26px', lineHeight: 1.2, color: '#0f172a' }}>
              Recent performance and priority actions
            </h2>
            <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#475569', maxWidth: '820px', lineHeight: 1.55 }}>
              Live view from Meta Ads, HubSpot, Lu.ma, and attendance sources already wired in this module. As-of date updates automatically from the latest loaded source row.
            </p>
          </div>
          <div style={{ ...subCard, minWidth: '260px', border: '1px solid #cbd5e1', backgroundColor: '#fff' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>As of</p>
            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
              {formatDateKeyShort(liveFreshnessModule.newestDateKey)}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
              Current window: {dateWindows?.current?.start || 'N/A'} to {dateWindows?.current?.end || 'N/A'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
              Prior window: {dateWindows?.previous?.start || 'N/A'} to {dateWindows?.previous?.end || 'N/A'}
            </p>
          </div>
        </div>
        <div style={{ marginTop: '14px', ...subCard, border: '1px solid #dbeafe', backgroundColor: '#f8fafc' }}>
          <DateRangeFilter
            rangeType={rangeType} setRangeType={setRangeType}
            customStart={customStart} setCustomStart={setCustomStart}
            customEnd={customEnd} setCustomEnd={setCustomEnd}
            windows={dateWindows}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '14px' }}>
        {overviewKpiCards.map((item) => (
          <ExecutiveKpiCard
            key={item.key}
            label={item.label}
            value={item.value}
            note={item.note}
            format={item.format}
            color={item.color}
            invertColor={!!item.invertColor}
            changePct={getChangePct(item.value, item.previous)}
          />
        ))}
      </div>

      <div
        style={{
          ...card,
          border: '1px solid #c7d2fe',
          background: 'linear-gradient(120deg, #eef2ff 0%, #f8fafc 50%, #ecfeff 100%)',
        }}
        data-testid="leads-kpi-snapshot-card"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, color: '#3730a3' }}>
              Unified KPI Snapshot
            </p>
            <h3 style={{ margin: '6px 0 0', fontSize: '16px', color: '#0f172a' }}>Qualified basis, freshness, and source lineage</h3>
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#475569' }}>
              Qualified = sobriety {'>'} 1 year and revenue {'>='} $250K (official first, fallback only if official is missing).
            </p>
          </div>
          <div style={{ ...subCard, border: '1px solid #cbd5e1', minWidth: '220px', backgroundColor: '#ffffffb3' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Snapshot Generated</p>
            <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
              {new Date(leadsKpiSnapshot?.meta?.generated_at || Date.now()).toLocaleString()}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
              Lookback: {Number(leadsKpiSnapshot?.meta?.lookback_days || 0)} days
            </p>
          </div>
        </div>
        <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '8px' }}>
          {[
            { label: 'Qualified Count', value: fmt.int(leadsKpiSnapshot?.leads?.qualified_count || 0), color: '#1d4ed8' },
            { label: 'Qualified %', value: fmtMaybePct(leadsKpiSnapshot?.leads?.qualified_pct), color: '#0f766e' },
            { label: 'Official Qualified', value: fmt.int(leadsKpiSnapshot?.leads?.qualification_basis?.official_qualified_count || 0), color: '#3730a3' },
            { label: 'Fallback Qualified', value: fmt.int(leadsKpiSnapshot?.leads?.qualification_basis?.fallback_qualified_count || 0), color: '#92400e' },
            { label: 'Fallback Share', value: fmtMaybePct(leadsKpiSnapshot?.leads?.qualification_basis?.fallback_share_pct), color: '#b45309' },
          ].map((metric) => (
            <div key={`leads-snapshot-${metric.label}`} style={{ ...subCard, border: '1px solid #dbeafe', backgroundColor: '#fff' }}>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>{metric.label}</p>
              <p style={{ margin: '6px 0 0', fontSize: '20px', fontWeight: 800, color: metric.color }}>{metric.value}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '8px' }}>
          {(leadsKpiSnapshot?.meta?.sources || []).map((source) => (
            <div key={`leads-source-lineage-${source.key}`} style={{ ...subCard, border: '1px solid #dbeafe', backgroundColor: '#fff' }}>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>{source.label}</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{fmt.int(source.row_count || 0)} rows</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>Latest: {source.latest_date || 'No data'}</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>Status: {String(source.freshness_status || 'unknown').toUpperCase()}</p>
            </div>
          ))}
        </div>
      </div>

      <LeadsConfidenceActionPanel data={leadsConfidenceActionData} isLoading={loading} />
      <LeadsManagerInsightsPanel
        data={leadsManagerInsightsData}
        isLoading={loading || !deferredInsightsReady}
        onSendToNotion={(taskName) => setManagerNotionModal({ open: true, taskName: String(taskName || '').trim() })}
      />
      <LeadsExperimentAnalyzerPanel
        data={leadsExperimentAnalyzerData}
        isLoading={loading || !deferredInsightsReady}
      />
      <SendToNotionModal
        isOpen={managerNotionModal.open}
        onClose={() => setManagerNotionModal({ open: false, taskName: '' })}
        defaultTaskName={managerNotionModal.taskName}
      />
      <LeadsParityGuardPanel report={leadsParityReport} isLoading={loading} />

      <div style={{ ...card, background: 'linear-gradient(120deg,#fffaf0 0%,#fff7ed 45%,#fefce8 100%)', border: '1px solid #fed7aa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: '11px', color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>
              Ad Account Transparency
            </p>
            <h3 style={{ margin: '6px 0 0', fontSize: '16px', color: '#7c2d12' }}>Spend split by ad account in selected window</h3>
          </div>
          <p style={{ margin: 0, fontSize: '11px', color: '#9a3412', fontWeight: 700 }}>
            {dateWindows?.current?.start || 'N/A'} to {dateWindows?.current?.end || 'N/A'}
          </p>
        </div>
        <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '10px' }}>
          {[
            { key: 'total', label: 'Total Meta Spend by Account', rows: adSpendAccountBreakdown.totalByAccount, color: '#0f172a' },
            { key: 'free', label: 'Free Groups Spend by Account', rows: adSpendAccountBreakdown.freeByAccount, color: '#dc2626' },
            { key: 'phoenix', label: 'Phoenix Forum Spend by Account', rows: adSpendAccountBreakdown.phoenixByAccount, color: '#ea580c' },
          ].map((section) => (
            <div key={`spend-account-${section.key}`} style={{ ...subCard, border: `1px solid ${section.color}33`, backgroundColor: '#fff' }}>
              <p style={{ margin: 0, fontSize: '11px', color: section.color, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {section.label}
              </p>
              <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
                {section.rows.length > 0 ? section.rows.map((row) => (
                  <div key={`${section.key}-${row.accountId}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#334155', fontFamily: 'monospace' }}>{row.accountId}</span>
                    <span style={{ fontSize: '13px', color: section.color, fontWeight: 800 }}>{fmt.currency(row.spend)}</span>
                  </div>
                )) : (
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>No spend in this category for the selected window.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: '14px' }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                What Happened
              </p>
              <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Weekly trend: lead volume and CPL</h3>
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Last {Math.max(0, recentMomentumModule.weeklyRows.length)} weeks</p>
          </div>
          {recentMomentumModule.weeklyRows.length > 0 ? (
            <div style={{ marginTop: '12px', height: '310px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={recentMomentumModule.weeklyRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmt.currency(v)} />
                  <Tooltip
                    formatter={(value, name, item) => item?.dataKey === 'cpl' ? [fmtMaybeCurrency(value), name] : [fmt.int(value), name]}
                    labelFormatter={(label) => `Week of ${label}`}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="metaLeads" name="Meta Leads" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="left" dataKey="paidHubspotLeads" name="Paid HubSpot Leads" type="monotone" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" dataKey="cpl" name="Meta CPL" type="monotone" stroke="#dc2626" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#64748b' }}>No trend data in this date range.</p>
          )}
        </div>

        <div style={card}>
          <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Qualification And Quality
          </p>
          <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Free Group Qualified vs Non-Qualified and quality tiers</h3>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
            Qualified = sobriety age {'>'} 1 year and revenue {'>='} $250K (official first, fallback only if official is missing). Good/Great tiers are revenue-only.
          </p>
          <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '10px' }}>
            <div style={{ ...subCard, border: '1px solid #dbeafe', backgroundColor: '#f8fbff' }}>
              <p style={{ margin: 0, fontSize: '11px', color: '#1d4ed8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Free Group Qualified vs Non-Qualified
              </p>
              <div style={{ marginTop: '8px', height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={qualificationPieRows.filter((row) => row.value > 0)} dataKey="value" nameKey="label" outerRadius={78}>
                      {qualificationPieRows.filter((row) => row.value > 0).map((row) => <Cell key={`qualification-${row.key}`} fill={row.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => fmt.int(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'grid', gap: '5px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#334155' }}>
                  Free Group Qualified Leads: <strong>{fmt.int(qualificationCurrent.qualified)}</strong>
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#334155' }}>
                  Free Group Non-Qualified Leads: <strong>{fmt.int(qualificationCurrent.nonQualified)}</strong>
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#334155' }}>
                  Qualified Rate: <strong>{qualifiedLeadRate !== null ? fmt.pct(qualifiedLeadRate) : 'N/A'}</strong>
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#334155' }}>
                  Cost / Qualified Lead: <strong>{fmtMaybeCurrency(estimatedCostPerQualifiedLead)}</strong>
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#991b1b', fontWeight: 700 }}>
                  Estimated Non-Qualified Spend: {fmtMaybeCurrency(estimatedNonQualifiedSpend)}
                </p>
              </div>
            </div>

            <div style={{ ...subCard, border: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
              <p style={{ margin: 0, fontSize: '11px', color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Free Group Lead Quality Breakdown
              </p>
              <div style={{ marginTop: '8px', height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={qualityMixRows.filter((row) => row.value > 0)} dataKey="value" nameKey="label" outerRadius={78}>
                      {qualityMixRows.filter((row) => row.value > 0).map((row) => <Cell key={`quality-${row.key}`} fill={row.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => fmt.int(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {qualityMixRows.map((row) => (
                  <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#475569' }}>{row.label}</span>
                    <span style={{ fontSize: '12px', color: row.color, fontWeight: 800 }}>
                      {fmt.int(row.value)} ({qualityMixTotal > 0 ? fmt.pct(row.value / qualityMixTotal) : '0.0%'})
                    </span>
                  </div>
                ))}
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                  Unclassified revenue rows: {fmt.int(qualityUnknownCount)}
                </p>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <LeadsQualificationParityPanel data={leadsQualificationParityData} isLoading={loading} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: '14px' }}>
        <div style={card}>
          <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            What Needs To Happen
          </p>
          <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Gap to prior-period efficiency at current spend</h3>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
            Targets are calculated from prior period CPQL/CPGL and current spend, using existing live metrics only.
          </p>
          <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
            <ProgressGapBar
              label="Good Leads Target ($250K-$999K)"
              current={qualificationCurrent?.qualityCounts?.good || 0}
              target={qualifiedTargetAtPriorEfficiency}
              color="#2563eb"
            />
            <ProgressGapBar
              label="Great Leads Target ($1M+)"
              current={qualificationCurrent?.qualityCounts?.great || 0}
              target={greatTargetAtPriorEfficiency}
              color="#16a34a"
            />
          </div>
        </div>

        <div style={card}>
          <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Recommendations
          </p>
          <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Priority actions and risk checks</h3>
          <div style={{ marginTop: '10px', display: 'grid', gap: '7px' }}>
            {executiveRecommendations.length > 0 ? executiveRecommendations.map((line, idx) => (
              <p key={`exec-rec-${idx}`} style={{ margin: 0, fontSize: '12px', color: '#334155', lineHeight: 1.45 }}>
                {idx + 1}. {line}
              </p>
            )) : (
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>No recommendations available in this window.</p>
            )}
          </div>
          <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {liveFreshnessModule.sourceRows.map((row) => {
              const tone = freshnessToneStyle[row.tone] || freshnessToneStyle.unknown;
              return (
                <div key={`freshness-chip-${row.key}`} style={{ border: `1px solid ${tone.border}`, backgroundColor: tone.bg, borderRadius: '10px', padding: '8px' }}>
                  <p style={{ margin: 0, fontSize: '11px', color: '#0f172a', fontWeight: 700 }}>{row.label}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: tone.text }}>{freshnessStatusLabel(row)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <details style={card}>
        <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>Detailed Data Explorer</span>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
              Full drilldowns, validation tables, and legacy views. Expand when you need row-level detail.
            </p>
          </div>
          <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: '#e2e8f0', color: '#334155', fontSize: '10px', fontWeight: 700 }}>
            Expand
          </span>
        </summary>
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={card}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: '#0f172a' }}>Date Range Window</h3>
        <DateRangeFilter
          rangeType={rangeType} setRangeType={setRangeType}
          customStart={customStart} setCustomStart={setCustomStart}
          customEnd={customEnd} setCustomEnd={setCustomEnd}
          windows={dateWindows}
        />
        <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#64748b' }}>
          This controls the comparison window. Live source freshness and current momentum are shown below.
        </p>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>Live Freshness and Recent Momentum</h3>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
              Uses live tables loaded for this page. Historical member dates in drilldowns (for example sobriety or first show-up) are person attributes, not refresh timestamps.
            </p>
          </div>
          <div style={{ ...subCard, minWidth: '230px', border: '1px solid #dbeafe', backgroundColor: '#eff6ff' }}>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#1d4ed8' }}>Latest source refresh</p>
            <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 800, color: '#1e3a8a' }}>
              {formatDateKeyShort(liveFreshnessModule.newestDateKey)}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#1e3a8a' }}>
              Spread across sources: {Number.isFinite(liveFreshnessModule.freshnessSpreadDays) ? `${fmt.int(liveFreshnessModule.freshnessSpreadDays)} day(s)` : 'N/A'}
            </p>
          </div>
        </div>

        <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {liveFreshnessModule.sourceRows.map((row) => {
            const tone = freshnessToneStyle[row.tone] || freshnessToneStyle.unknown;
            return (
              <div key={row.key} style={{ ...subCard, border: `1px solid ${tone.border}`, backgroundColor: tone.bg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#0f172a', fontWeight: 700 }}>{row.label}</p>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: tone.text, backgroundColor: tone.chipBg, borderRadius: '999px', padding: '2px 6px' }}>
                    {freshnessStatusLabel(row)}
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                  {formatDateKeyShort(row.dateKey)}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#64748b' }}>
                  Rows loaded: {fmt.int(row.rowCount || 0)}
                </p>
              </div>
            );
          })}
        </div>

        {(liveFreshnessModule.staleSources.length > 0 || liveFreshnessModule.watchSources.length > 0) && (
          <div style={{
            marginTop: '10px',
            borderRadius: '10px',
            border: `1px solid ${liveFreshnessModule.staleSources.length > 0 ? '#fecaca' : '#fde68a'}`,
            backgroundColor: liveFreshnessModule.staleSources.length > 0 ? '#fef2f2' : '#fffbeb',
            padding: '10px 12px',
          }}
          >
            <p style={{ margin: 0, fontSize: '11px', color: liveFreshnessModule.staleSources.length > 0 ? '#991b1b' : '#92400e', fontWeight: 700 }}>
              {liveFreshnessModule.staleSources.length > 0
                ? `Stale source(s): ${liveFreshnessModule.staleSources.map((row) => row.label).join(', ')}.`
                : `Lagging source(s): ${liveFreshnessModule.watchSources.map((row) => row.label).join(', ')}.`}
              {' '}Verify upstream sync jobs before making major budget changes.
            </p>
          </div>
        )}

        <div style={{ marginTop: '14px', ...subCard }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
            Weekly Momentum (up to last 12 weeks in selected window)
          </p>
          {recentMomentumModule.weeklyRows.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '10px', marginBottom: '12px' }}>
                {recentMomentumModule.summaryCards.map((metric) => (
                  <div key={metric.key} style={{ ...subCard, borderLeft: metric.format === 'currency' ? '4px solid #dc2626' : '4px solid #0f766e' }}>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 700 }}>{metric.label}</p>
                    <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                      {metric.format === 'currency' ? fmtMaybeCurrency(metric.value) : fmt.int(metric.value || 0)}
                      {metric.changePct !== null && metric.changePct !== undefined && <ChangeBadge changePct={metric.changePct} invertColor={!!metric.invertColor} />}
                    </p>
                  </div>
                ))}
              </div>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={recentMomentumModule.weeklyRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(value) => {
                        const n = Number(value);
                        return Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : '$0';
                      }}
                    />
                    <Tooltip
                      formatter={(value, name, item) => {
                        if (item?.dataKey === 'cpl') return [fmtMaybeCurrency(value), name];
                        return [fmt.int(value), name];
                      }}
                      labelFormatter={(label) => `Week of ${label}`}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="metaLeads" name="Meta Leads" fill="#0f766e" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="paidHubspotLeads" name="Paid HubSpot Leads" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="left" type="monotone" dataKey="zoomAttendees" name="Zoom Attendees" stroke="#7c3aed" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="cpl" name="Meta CPL" stroke="#dc2626" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>No momentum rows available in this date range.</p>
          )}
        </div>
      </div>

      <CohortUnitEconomicsPreviewPanel supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} placement="top" />

      <details
        style={{ ...card, padding: '16px' }}
        onToggle={(event) => setLegacyComparisonOpen(Boolean(event.currentTarget?.open))}
      >
        <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>Legacy Comparison (Mixed / Zoom-era analytics)</span>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
              Kept temporarily for validation only. Do not use this section as the primary source of truth for show-ups or member economics.
            </p>
          </div>
          <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '10px', fontWeight: 700 }}>
            Comparison Only
          </span>
        </summary>
        {legacyComparisonOpen ? (
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* ── TOP INSIGHTS: BEST MEMBERS (ZOOM-FIRST) ── */}
          <div style={card}>
            {/* Additive unified funnel module: HubSpot-first identity stitching */}
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>Unified Funnel (Meta to Lu.ma to Zoom)</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Uses HubSpot as source of truth for contacts and attribution. Matching priority is primary email, then <code>hs_additional_emails</code>, then full name, then fuzzy name. HubSpot Call coverage is tracked separately for Zoom reliability monitoring.
            </p>

            {!unifiedCurrent ? (
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>No unified funnel data available in this window.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '10px' }}>
                  {[
                    { label: 'Meta Leads (Base)', value: fmt.int(unifiedCurrent.funnel.metaLeadCount || 0), changePct: unifiedPrevious ? computeChangePct(unifiedCurrent.funnel.metaLeadCount || 0, unifiedPrevious?.funnel?.metaLeadCount || 0).pct : null, rows: unifiedCurrent.unifiedLeadRecords },
                    { label: 'Luma Registered', value: fmt.int(unifiedCurrent.funnel.lumaRegisteredCount || 0), changePct: unifiedPrevious ? computeChangePct(unifiedCurrent.funnel.lumaRegisteredCount || 0, unifiedPrevious?.funnel?.lumaRegisteredCount || 0).pct : null, rows: (unifiedCurrent.unifiedLeadRecords || []).filter((r) => r.luma_registered) },
                    { label: 'Zoom Attended', value: fmt.int(unifiedCurrent.funnel.zoomAttendedCount || 0), changePct: unifiedPrevious ? computeChangePct(unifiedCurrent.funnel.zoomAttendedCount || 0, unifiedPrevious?.funnel?.zoomAttendedCount || 0).pct : null, rows: (unifiedCurrent.unifiedLeadRecords || []).filter((r) => r.zoom_attended) },
                    { label: 'Meta -> Luma Rate', value: fmtMaybePct(unifiedCurrent.funnel.metaToLumaRate), changePct: unifiedPrevious ? computeChangePct(unifiedCurrent.funnel.metaToLumaRate || 0, unifiedPrevious?.funnel?.metaToLumaRate || 0).pct : null },
                    { label: 'Luma -> Zoom Rate', value: fmtMaybePct(unifiedCurrent.funnel.lumaToZoomRate), changePct: unifiedPrevious ? computeChangePct(unifiedCurrent.funnel.lumaToZoomRate || 0, unifiedPrevious?.funnel?.lumaToZoomRate || 0).pct : null },
                    { label: 'Meta -> Zoom Rate', value: fmtMaybePct(unifiedCurrent.funnel.metaToZoomRate), changePct: unifiedPrevious ? computeChangePct(unifiedCurrent.funnel.metaToZoomRate || 0, unifiedPrevious?.funnel?.metaToZoomRate || 0).pct : null },
                    { label: 'HubSpot Call Coverage (Zoom)', value: fmtMaybePct(unifiedCurrent.hubspotCallCoverage?.rate), changePct: unifiedPrevious ? computeChangePct(unifiedCurrent.hubspotCallCoverage?.rate || 0, unifiedPrevious?.hubspotCallCoverage?.rate || 0).pct : null, rows: unifiedCurrent.stageRows.zoomRowsDetailed },
                    { label: 'Review Queue', value: fmt.int(unifiedCurrent.stageRows.reviewQueueRows?.length || 0), rows: unifiedCurrent.stageRows.reviewQueueRows },
                  ].map((item) => (
                    <div
                      key={item.label}
                      onClick={() => {
                        if (!item.rows) return;
                        const isBase = item.label === 'Meta Leads (Base)';
                        const isLuma = item.label === 'Luma Registered';
                        const isZoom = item.label === 'Zoom Attended';
                        const isCoverage = item.label.includes('HubSpot Call Coverage');
                        const columns = isBase ? [
                          { key: 'hubspotContactId', label: 'HubSpot Contact ID', type: 'number' },
                          { key: 'hubspotName', label: 'Name' },
                          { key: 'hubspotPrimaryEmail', label: 'Primary Email' },
                          { key: 'hubspotSecondaryEmailsText', label: 'Secondary Emails' },
                          { key: 'hubspotCreatedDate', label: 'Meta Lead Date' },
                          { key: 'luma_registered_label', label: 'Luma Registered?' },
                          { key: 'zoom_attended_label', label: 'Zoom Attended?' },
                          { key: 'lumaMatchConfidence', label: 'Luma Match Confidence' },
                          { key: 'zoomMatchConfidence', label: 'Zoom Match Confidence' },
                          { key: 'hubspotCallLinkedLabel', label: 'HubSpot Call Linked?' },
                          { key: 'sourceBucket', label: 'Source Bucket' },
                          { key: 'revenue', label: 'Revenue', type: 'currency' },
                        ] : isLuma ? [
                          { key: 'hubspotName', label: 'Name' },
                          { key: 'hubspotPrimaryEmail', label: 'Primary Email' },
                          { key: 'lumaRegistrationCount', label: 'Luma Registrations', type: 'number' },
                          { key: 'lumaMatchConfidence', label: 'Luma Match Confidence' },
                          { key: 'lumaMatchSource', label: 'Luma Match Source' },
                          { key: 'lumaMatchReason', label: 'Luma Match Reason' },
                          { key: 'zoom_attended_label', label: 'Zoom Attended?' },
                        ] : (isZoom || isCoverage) ? [
                          { key: isZoom ? 'hubspotName' : 'attendeeName', label: isZoom ? 'Name' : 'Zoom Attendee' },
                          { key: isZoom ? 'hubspotPrimaryEmail' : 'matchedHubspotEmail', label: 'Email' },
                          { key: isZoom ? 'zoomAttendanceCount' : 'date', label: isZoom ? 'Zoom Attendances' : 'Date', type: isZoom ? 'number' : undefined },
                          { key: isZoom ? 'zoomMatchConfidence' : 'matchConfidence', label: 'Match Confidence' },
                          { key: isZoom ? 'zoomMatchSource' : 'matchSource', label: 'Match Source' },
                          { key: isZoom ? 'hubspotCallLinkedLabel' : 'hubspotCallLinked', label: 'HubSpot Call Linked?' },
                          { key: isZoom ? 'hubspotCallMatchCount' : 'hubspotCallCoverageSource', label: isZoom ? 'HubSpot Call Matches' : 'Call Coverage Source', type: isZoom ? 'number' : undefined },
                          { key: isZoom ? 'sourceBucket' : 'matchReason', label: isZoom ? 'Source Bucket' : 'Reason' },
                          { key: isZoom ? 'revenue' : 'candidateHints', label: isZoom ? 'Revenue' : 'Candidate Hints', type: isZoom ? 'currency' : undefined },
                        ] : [
                          { key: 'reviewArea', label: 'Review Area' },
                          { key: 'date', label: 'Date' },
                          { key: 'dayType', label: 'Day' },
                          { key: 'name', label: 'Luma Name' },
                          { key: 'email', label: 'Email' },
                          { key: 'attendeeName', label: 'Zoom Attendee' },
                          { key: 'matchConfidence', label: 'Match Confidence' },
                          { key: 'matchSource', label: 'Match Source' },
                          { key: 'missingReason', label: 'Missing Reason' },
                          { key: 'candidateHints', label: 'Candidate Hints' },
                        ];
                        openUnifiedDrilldown(`Unified Funnel - ${item.label}`, columns, item.rows, { highlightKey: isCoverage ? 'hubspotCallLinked' : undefined });
                      }}
                      style={{ ...subCard, cursor: item.rows ? 'pointer' : 'default', borderLeft: item.label.includes('Coverage') ? '4px solid #2563eb' : item.label.includes('Rate') ? '4px solid #16a34a' : '4px solid #0f766e' }}
                    >
                      <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{item.label}</p>
                      <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                        {item.value}
                        {(item.changePct !== null && item.changePct !== undefined) && <ChangeBadge changePct={item.changePct} />}
                      </p>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[
                    { key: 'luma', title: 'Lu.ma -> HubSpot Match Confidence', rows: unifiedCurrent.matchConfidenceBreakdown?.luma || [], sourceRows: unifiedCurrent.stageRows.lumaRowsDetailed || [] },
                    { key: 'zoom', title: 'Zoom -> HubSpot Match Confidence', rows: unifiedCurrent.matchConfidenceBreakdown?.zoom || [], sourceRows: unifiedCurrent.stageRows.zoomRowsDetailed || [] },
                  ].map((section) => (
                    <div key={section.key} style={{ ...subCard, border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{section.title}</p>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc' }}>
                            <th style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>Confidence</th>
                            <th style={{ textAlign: 'right', padding: '6px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>Count</th>
                            <th style={{ textAlign: 'right', padding: '6px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((row) => (
                            <tr
                              key={`${section.key}-${row.confidence}`}
                              onClick={() => openUnifiedDrilldown(
                                `Unified Funnel - ${section.title}: ${row.confidence}`,
                                section.key === 'luma'
                                  ? [
                                    { key: 'date', label: 'Date' },
                                    { key: 'name', label: 'Name' },
                                    { key: 'email', label: 'Email' },
                                    { key: 'matchConfidence', label: 'Match Confidence' },
                                    { key: 'matchSource', label: 'Match Source' },
                                    { key: 'matchReason', label: 'Reason' },
                                    { key: 'candidateHints', label: 'Candidate Hints' },
                                    { key: 'matchedHubspotContactId', label: 'HubSpot Contact ID', type: 'number' },
                                    { key: 'matchedHubspotName', label: 'HubSpot Name' },
                                    { key: 'matchedHubspotEmail', label: 'HubSpot Email' },
                                  ]
                                  : [
                                    { key: 'date', label: 'Date' },
                                    { key: 'dayType', label: 'Day' },
                                    { key: 'attendeeName', label: 'Zoom Attendee' },
                                    { key: 'matchedHubspot', label: 'Matched HubSpot?' },
                                    { key: 'matchedHubspotName', label: 'HubSpot Name' },
                                    { key: 'matchedHubspotEmail', label: 'HubSpot Email' },
                                    { key: 'matchConfidence', label: 'Match Confidence' },
                                    { key: 'matchSource', label: 'Match Source' },
                                    { key: 'hubspotCallLinked', label: 'HubSpot Call Linked?' },
                                    { key: 'hubspotCallCoverageSource', label: 'Call Coverage Source' },
                                    { key: 'matchReason', label: 'Reason' },
                                    { key: 'candidateHints', label: 'Candidate Hints' },
                                  ],
                                section.sourceRows.filter((r) => (r.matchConfidence || 'unmatched') === row.confidence),
                                { highlightKey: section.key === 'zoom' ? 'hubspotCallLinked' : undefined }
                              )}
                              style={{ cursor: 'pointer' }}
                            >
                              <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{row.confidence}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmt.int(row.count)}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>
                                {fmtMaybePct(row.pct)}
                                {unifiedPrevious && <ChangeBadge changePct={confidenceChangePct(section.key, row.confidence)} />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>Issue Bucket</th>
                        <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>Rows</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>Why It Matters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Meta leads missing Lu.ma', unifiedCurrent.stageRows.metaNoLumaRows || [], 'Meta paid contacts with no Lu.ma registration in this window.'],
                        ['Meta leads missing Zoom', unifiedCurrent.stageRows.metaNoZoomRows || [], 'Meta paid contacts with no Zoom attendance in this window.'],
                        ['Lu.ma unmatched to HubSpot', unifiedCurrent.stageRows.unmatchedLumaRows || [], 'Usually duplicate/merge timing or alternate-email/name mismatch.'],
                        ['Zoom unmatched to HubSpot', unifiedCurrent.stageRows.unmatchedZoomRows || [], 'Alias/device-name or missing call mapping problem.'],
                        ['Lu.ma matched but not Meta lead', unifiedCurrent.stageRows.lumaMatchedNonMetaRows || [], 'Real contacts, but not in the Meta paid base for this date window.'],
                        ['Zoom matched but not Meta lead', unifiedCurrent.stageRows.zoomMatchedNonMetaRows || [], 'Shows attendance outside the Meta paid base.'],
                      ].map(([label, rows, note]) => (
                        <tr
                          key={label}
                          onClick={() => {
                            const lower = String(label).toLowerCase();
                            const isMetaGap = lower.startsWith('meta leads');
                            const isZoomBucket = lower.includes('zoom') && !isMetaGap;
                            const columns = isMetaGap
                              ? [
                                { key: 'hubspotContactId', label: 'HubSpot Contact ID', type: 'number' },
                                { key: 'hubspotName', label: 'Name' },
                                { key: 'hubspotPrimaryEmail', label: 'Primary Email' },
                                { key: 'hubspotSecondaryEmails', label: 'Secondary Emails' },
                                { key: 'metaLeadDate', label: 'Meta Lead Date' },
                                { key: 'lumaRegistered', label: 'Luma Registered?' },
                                { key: 'lumaMatchConfidence', label: 'Luma Match Confidence' },
                                { key: 'sourceBucket', label: 'Source Bucket' },
                                { key: 'originalTrafficSource', label: 'Original Traffic Source' },
                                { key: 'originalTrafficSourceDetail1', label: 'OTS Detail 1' },
                                { key: 'originalTrafficSourceDetail2', label: 'OTS Detail 2' },
                                { key: 'missingReason', label: 'Missing Reason' },
                              ]
                              : isZoomBucket
                                ? [
                                  { key: 'date', label: 'Date' },
                                  { key: 'dayType', label: 'Day' },
                                  { key: 'attendeeName', label: 'Zoom Attendee' },
                                  { key: 'matchedHubspot', label: 'Matched HubSpot?' },
                                  { key: 'matchedHubspotName', label: 'HubSpot Name' },
                                  { key: 'matchedHubspotEmail', label: 'HubSpot Email' },
                                  { key: 'matchConfidence', label: 'Match Confidence' },
                                  { key: 'matchSource', label: 'Match Source' },
                                  { key: 'hubspotCallLinked', label: 'HubSpot Call Linked?' },
                                  { key: 'missingReason', label: 'Missing Reason' },
                                  { key: 'candidateHints', label: 'Candidate Hints' },
                                ]
                                : [
                                  { key: 'date', label: 'Date' },
                                  { key: 'name', label: 'Name' },
                                  { key: 'email', label: 'Email' },
                                  { key: 'matchConfidence', label: 'Match Confidence' },
                                  { key: 'matchSource', label: 'Match Source' },
                                  { key: 'matchedHubspotContactId', label: 'HubSpot Contact ID', type: 'number' },
                                  { key: 'matchedHubspotName', label: 'HubSpot Name' },
                                  { key: 'matchedHubspotEmail', label: 'HubSpot Email' },
                                  { key: 'missingReason', label: 'Missing Reason' },
                                  { key: 'candidateHints', label: 'Candidate Hints' },
                                ];
                            openUnifiedDrilldown(`Unified Funnel - ${label}`, columns, rows);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{label}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right', color: '#334155' }}>{fmt.int(rows.length)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#64748b' }}>{note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#64748b' }}>
                  HubSpot Call coverage = % of Zoom attendee rows in this window with a matching HubSpot Call record (materialized mapping if present, otherwise name/email association checks with +/-1 day tolerance).
                </p>
              </>
            )}
          </div>

          {/* â”€â”€ TOP INSIGHTS: BEST MEMBERS (ZOOM-FIRST) â”€â”€ */}
          {leadsDecisionModule && (
            <div style={card}>
              <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>Leads Decision KPIs (Costs + Great Members)</h3>
              <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
                Decision layer for paid Meta efficiency and member quality. Great member = 3+ Zoom attendances and revenue â‰¥ $250k. HubSpot Calls (Tue/Thu scheduled) are used as the primary attendance truth.
              </p>

              <div style={{ ...subCard, border: '1px solid #dbeafe', backgroundColor: '#eff6ff', marginBottom: '12px' }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>Key Findings In This Range</p>
                {(leadsDecisionModule.similarityBullets || []).slice(0, 6).map((line, idx) => (
                  <p key={`ldm-sim-${idx}`} style={{ margin: '4px 0 0', fontSize: '12px', color: '#1e3a8a' }}>{line}</p>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '10px' }}>
                {(leadsDecisionModule.costCards || []).map((metric) => {
                  const changePct = (metric.previous === null || metric.previous === undefined)
                    ? null
                    : computeChangePct(metric.value, metric.previous).pct;
                  return (
                    <div key={metric.key} style={{ ...subCard, borderLeft: `4px solid ${metric.label.toLowerCase().includes('great member') ? '#1d4ed8' : '#0f766e'}` }}>
                      <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{metric.label}</p>
                      <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                        {metric.format === 'currency' ? fmtMaybeCurrency(metric.value) : fmt.int(metric.value)}
                        {changePct !== null && <ChangeBadge changePct={changePct} invertColor={metric.invertColor !== false} />}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>{metric.note}</p>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ ...subCard, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Great Members by Source</p>
                    <button
                      type="button"
                      onClick={() => setModal({
                        title: 'Great Members (3+ Zoom + $250k+)',
                        columns: [
                          { key: 'greatMemberName', label: 'Name' },
                          { key: 'greatMemberEmail', label: 'Email' },
                          { key: 'sourceBucket', label: 'Source Bucket' },
                          { key: 'sourceAttributionMethod', label: 'Attribution Method' },
                          { key: 'originalTrafficSource', label: 'Original Traffic Source' },
                          { key: 'originalTrafficSourceDetail1', label: 'OTS Detail 1' },
                          { key: 'originalTrafficSourceDetail2', label: 'OTS Detail 2' },
                          { key: 'inferredMetaAdset', label: 'Inferred Meta Ad Set' },
                          { key: 'inferredMetaTopAd', label: 'Top Ad (Spend Proxy)' },
                          { key: 'totalZoomAttendances', label: 'Attendances', type: 'number' },
                          { key: 'revenue', label: 'Revenue', type: 'currency' },
                          { key: 'hubspotCreatedDate', label: 'HubSpot Created Date' },
                          { key: 'acquiredInSelectedRange', label: 'Acq In Range?' },
                        ],
                        rows: leadsDecisionModule.greatMembers || [],
                      })}
                      style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '11px', cursor: 'pointer' }}
                    >
                      Open Great Members
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc' }}>
                          {['Source', 'Great Members', '% Great', 'Repeat (2+)', 'Unique', 'Great Rate'].map((h) => (
                            <th key={h} style={{ textAlign: h === 'Source' ? 'left' : 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(leadsDecisionModule.greatMembersBySource || []).slice(0, 8).map((row) => (
                          <tr key={`great-source-${row.label}`}>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', fontWeight: 600, color: '#0f172a' }}>{row.label}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmt.int(row.greatMembers)}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmtMaybePct(row.share)}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmt.int(row.repeatMembers)}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmt.int(row.uniqueAttendees)}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmtMaybePct(row.goodRate)}</td>
                          </tr>
                        ))}
                        {(leadsDecisionModule.greatMembersBySource || []).length === 0 && (
                          <tr><td colSpan={6} style={{ padding: '8px', fontSize: '11px', color: '#64748b' }}>No great members in this range.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ ...subCard, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Meta Great-Member Cohorts (HubSpot Campaign + Inferred Ad Set)</p>
                    <button
                      type="button"
                      onClick={() => setModal({
                        title: 'Meta Great-Member Attribution Cohorts',
                        columns: [
                          { key: 'metaCampaignRaw', label: 'HubSpot Campaign (OTS Detail 2)' },
                          { key: 'inferredMetaAdset', label: 'Inferred Ad Set' },
                          { key: 'inferredMetaTopAd', label: 'Top Ad (Spend Proxy)' },
                          { key: 'greatMemberCount', label: 'Great Members', type: 'number' },
                          { key: 'acquiredInRangeCount', label: 'Acq In Range', type: 'number' },
                          { key: 'totalAttendances', label: 'Total Attendances', type: 'number' },
                          { key: 'avgRevenue', label: 'Avg Revenue', type: 'currency' },
                          { key: 'medianRevenue', label: 'Median Revenue', type: 'currency' },
                          { key: 'campaignSpendInRange', label: 'Campaign Spend (Range)', type: 'currency' },
                          { key: 'estCostPerGreatMemberCampaignActive', label: 'Est Cost / Great (Active)', type: 'currency' },
                          { key: 'estCostPerGreatMemberCampaignAcqInRange', label: 'Est Cost / Great (Acq In Range)', type: 'currency' },
                          { key: 'estCplCampaign', label: 'Campaign CPL (Range)', type: 'currency' },
                          { key: 'greatMemberNames', label: 'Great Members' },
                        ],
                        rows: leadsDecisionModule.metaGreatAttributionRows || [],
                      })}
                      style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '11px', cursor: 'pointer' }}
                    >
                      Open Full Table
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc' }}>
                          {['Campaign (HubSpot)', 'Inferred Ad Set', 'Great', 'Acq In Range', 'Campaign Spend', 'Est Cost / Great (Acq)', 'Avg Rev', 'Top Ad (Proxy)'].map((h) => (
                            <th key={h} style={{ textAlign: (h.includes('Campaign') || h.includes('Set') || h.includes('Proxy')) ? 'left' : 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(leadsDecisionModule.metaGreatAttributionRows || []).slice(0, 10).map((row) => (
                          <tr key={`meta-great-${row.key}`} style={{ backgroundColor: row.greatMemberCount > 1 ? '#fef2f2' : '#fff' }}>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', fontWeight: 600, color: '#0f172a' }}>{row.metaCampaignRaw || 'Not Found'}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{row.inferredMetaAdset || 'Not Found'}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmt.int(row.greatMemberCount)}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmt.int(row.acquiredInRangeCount)}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmtMaybeCurrency(row.campaignSpendInRange)}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmtMaybeCurrency(row.estCostPerGreatMemberCampaignAcqInRange ?? row.estCostPerGreatMemberCampaignActive)}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', textAlign: 'right' }}>{fmtMaybeCurrency(row.avgRevenue)}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b' }}>{row.inferredMetaTopAd || 'Not Found'}</td>
                          </tr>
                        ))}
                        {(leadsDecisionModule.metaGreatAttributionRows || []).length === 0 && (
                          <tr><td colSpan={8} style={{ padding: '8px', fontSize: '11px', color: '#64748b' }}>No paid Meta great-member cohorts found in this range.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: '10px', color: '#64748b' }}>
                    Ad set/ad detail is inferred from Meta spend rows using HubSpot campaign source detail. This is directional until click-ID-level attribution is captured end-to-end.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>Best Member Source Insights (Zoom-First)</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Starts from actual Zoom attendance (Tuesday + Thursday), then matches to HubSpot to identify where the best members came from.
              Good member = 3+ Zoom attendances and revenue ≥ $250k.
            </p>

            <div
              style={{
                ...subCard,
                border: `1px solid ${currentActionableMissingHubspotCallSessions.length > 0 ? '#fecaca' : '#bbf7d0'}`,
                backgroundColor: currentActionableMissingHubspotCallSessions.length > 0 ? '#fef2f2' : '#f0fdf4',
                marginBottom: '12px',
              }}
            >
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Attendance Truth Source</p>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#334155' }}>
                {zoomSourceModule.attendanceTruthMode || 'HubSpot Calls (Tue/Thu scheduled) primary'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                HubSpot Calls near Tuesday 12:00 ET and Thursday 11:00 ET are the source of truth for show-ups.
                Zoom is fallback/audit only when a HubSpot Call is missing.
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: currentActionableMissingHubspotCallSessions.length > 0 ? '#991b1b' : '#166534',
                }}
              >
                Missing expected HubSpot Calls in selected range (actionable): {fmt.int(currentActionableMissingHubspotCallSessions.length)}
                {' '}| HubSpot Call sessions found (Tue/Thu scheduled): {fmt.int(zoomSourceModule.current?.hubspotCallTruthSessionCount || 0)}
                {' '}| Likely no-meeting/holiday dates: {fmt.int(currentLikelyNoMeetingHubspotCallSessions.length)}
              </p>
            </div>

            <div style={{ ...subCard, border: '1px solid #dbeafe', backgroundColor: '#eff6ff', marginBottom: '12px' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>AI Recommendations (Top Priority)</p>
              <p style={{ margin: '6px 0 0', fontSize: '13px', fontWeight: 700, color: '#1e3a8a' }}>{paidDecisionInsights.headline}</p>
              {paidDecisionInsights.bullets.slice(0, 4).map((line, idx) => (
                <p key={`top-ai-b-${idx}`} style={{ margin: '4px 0 0', fontSize: '12px', color: '#1e3a8a' }}>• {line}</p>
              ))}
              {paidDecisionInsights.moves.slice(0, 4).map((line, idx) => (
                <p key={`top-ai-m-${idx}`} style={{ margin: '4px 0 0', fontSize: '12px', color: '#166534' }}>• {line}</p>
              ))}
              {paidDecisionInsights.warnings.slice(0, 2).map((line, idx) => (
                <p key={`top-ai-w-${idx}`} style={{ margin: '4px 0 0', fontSize: '12px', color: '#92400e' }}>• {line}</p>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '10px' }}>
              <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Total Good Members (3+)</p>
                <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmt.int(zoomSourceModule.current.totalGoodMembers || 0)}</p>
              </div>
              <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Attributed Good Members</p>
                <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmt.int(zoomSourceModule.current.attributedGoodMembers || 0)}</p>
              </div>
              <div style={{ ...subCard, borderLeft: '4px solid #d97706' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Unknown / Other Good Members</p>
                <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#9a3412' }}>{fmt.int(zoomSourceModule.current.unknownOrOtherGoodMembers || 0)}</p>
              </div>
              <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Good Member Attribution Rate</p>
                <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtMaybePct(zoomSourceModule.current.goodMemberAttributionRate)}</p>
              </div>
              <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Paid Meta Cost / Good Member</p>
                <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtMaybeCurrency(zoomSourceModule.current.paidMeta.costPerGoodRepeatMember)}</p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>Blended active-window estimate (can include older paid cohorts)</p>
              </div>
              <div style={{ ...subCard, borderLeft: '4px solid #1d4ed8' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Paid Meta Cost / Good Member (Acq In Range)</p>
                <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtMaybeCurrency(zoomSourceModule.current.paidMeta.costPerGoodRepeatMemberAcquiredInRange)}</p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>
                  Uses paid good members whose HubSpot `createdate` is inside the selected window
                </p>
              </div>
              <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Paid Meta Good Members</p>
                <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmt.int(zoomSourceModule.current.paidMeta.goodRepeatMembers || 0)}</p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>
                  Acq in range: {fmt.int(zoomSourceModule.current.paidMeta.goodRepeatMembersAcquiredInRange || 0)} | Older cohorts active: {fmt.int(zoomSourceModule.current.paidMeta.goodRepeatMembersAcquiredBeforeRange || 0)}
                </p>
              </div>
              <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Tuesday Meta Share (Matched)</p>
                <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtMaybePct(zoomSourceModule.current.tuesdayAssumptionTest.paidMetaShareOfMatchedTuesday)}</p>
              </div>
              <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Zoom Attribution Match Rate</p>
                <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtMaybePct(zoomSourceModule.current.matchRate)}</p>
              </div>
              <div style={{ ...subCard, borderLeft: `4px solid ${currentActionableMissingHubspotCallSessions.length > 0 ? '#dc2626' : '#16a34a'}` }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Missing HubSpot Calls (Tue/Thu)</p>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '16px',
                    fontWeight: 800,
                    color: currentActionableMissingHubspotCallSessions.length > 0 ? '#991b1b' : '#166534',
                  }}
                >
                  {fmt.int(currentActionableMissingHubspotCallSessions.length)}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>
                  Manually backfill in HubSpot, then re-sync to upgrade attendance truth automatically
                </p>
              </div>
            </div>

            <div style={{ marginTop: '12px', ...subCard, border: '1px solid #e2e8f0' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                Missing HubSpot Call Sessions (Tuesday/Thursday)
              </p>
              <p style={{ margin: '4px 0 8px', fontSize: '11px', color: '#64748b' }}>
                Expected Tuesday 12:00 ET and Thursday 11:00 ET sessions with no matching HubSpot Call. Rows with no Zoom data are marked as likely no-meeting / holiday.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      {['Date', 'Day', 'Expected Time (ET)', 'HubSpot Call Present', 'Zoom Fallback Rows', 'Zoom Fallback Attendees', 'Zoom Meeting IDs (Audit)'].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: (h === 'Date' || h === 'Day' || h === 'Expected Time (ET)' || h === 'Zoom Meeting IDs (Audit)') ? 'left' : 'right',
                            padding: '6px 8px',
                            borderBottom: '1px solid #e2e8f0',
                            fontSize: '11px',
                            color: '#475569',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentMissingHubspotCallSessions.slice(0, 25).map((row) => (
                      <tr key={`missing-hs-call-${row.date}-${row.dayType}`} style={{ backgroundColor: row.missingCategory === 'likely_no_meeting' ? '#f8fafc' : '#fff7ed' }}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#0f172a', fontWeight: 600 }}>{row.date}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{row.dayType}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{row.expectedEtTime}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: row.missingCategory === 'likely_no_meeting' ? '#64748b' : '#991b1b', fontWeight: 700, textAlign: 'right' }}>
                          {row.missingCategory === 'likely_no_meeting' ? 'No (Likely No Meeting)' : row.hubspotCallPresent}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155', textAlign: 'right' }}>{fmt.int(row.zoomFallbackRowCount || 0)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155', textAlign: 'right' }}>{fmt.int(row.zoomFallbackAttendeeCount || 0)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b' }}>{row.zoomFallbackMeetingIds || '—'}</td>
                      </tr>
                    ))}
                    {currentMissingHubspotCallSessions.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '8px', fontSize: '11px', color: '#166534' }}>
                          No missing Tuesday/Thursday HubSpot Call sessions in the selected range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {currentMissingHubspotCallSessions.length > 25 && (
                <p style={{ margin: '8px 0 0', fontSize: '10px', color: '#64748b' }}>
                  Showing first 25 missing sessions. Narrow the date range to inspect all.
                </p>
              )}
            </div>

            <div style={{ marginTop: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    {['How They Found Us (Source Bucket)', 'Good Members (3+)', '% of Good Members', 'Repeat Members (2+)', 'Unique Attendees', 'Good Member Rate', 'Share of Free Show-Ups'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'Source Bucket' ? 'left' : 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...(zoomSourceModule.current.goodMemberSourceRows || [])]
                    .sort((a, b) => (b.goodRepeatMembers - a.goodRepeatMembers) || (b.repeatMembers - a.repeatMembers) || (b.uniqueAttendees - a.uniqueAttendees))
                    .slice(0, 8)
                    .map((row) => (
                      <tr key={`best-top-${row.bucket}`} style={{ backgroundColor: row.bucket === 'Paid Social (Meta)' ? '#fef2f2' : '#fff' }}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', fontWeight: 600 }}>{row.bucket}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.goodRepeatMembers)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmtMaybePct(row.goodMemberShare)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.repeatMembers)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.uniqueAttendees)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmtMaybePct(row.goodRepeatRateAmongUnique)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmtMaybePct(row.showUpShare)}</td>
                      </tr>
                    ))}
                  {(!zoomSourceModule.current.goodMemberSourceRows || zoomSourceModule.current.goodMemberSourceRows.length === 0) && (
                    <tr><td colSpan={7} style={{ padding: '12px', fontSize: '12px', color: '#64748b' }}>No good members found in this range yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '12px', ...subCard, border: '1px solid #fde68a', backgroundColor: '#fffbeb' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#92400e' }}>
                Top Unmatched Repeat Attendees (Alias / Matching Cleanup Queue)
              </p>
              <p style={{ margin: '4px 0 8px', fontSize: '11px', color: '#92400e' }}>
                These are repeat attendees (2+) with no HubSpot match. This is where alias cleanup will most improve attribution quality.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#fef3c7' }}>
                      {['Zoom Name', 'Attendances', 'Tuesday', 'Thursday', 'Match Type', 'Why Not Matched', 'Candidate Hints'].map((h) => (
                        <th key={h} style={{ textAlign: h === 'Zoom Name' || h.includes('Why') || h.includes('Hints') ? 'left' : 'right', padding: '6px 8px', borderBottom: '1px solid #fde68a', fontSize: '11px', color: '#78350f' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(zoomSourceModule.current.topUnmatchedRepeatRows || []).map((r) => (
                      <tr key={`unmatched-repeat-${r.attendeeKey}`}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #fef3c7', fontSize: '11px', color: '#78350f', fontWeight: 600 }}>{r.attendeeName}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #fef3c7', fontSize: '11px', color: '#78350f', textAlign: 'right' }}>{fmt.int(r.totalZoomAttendances)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #fef3c7', fontSize: '11px', color: '#78350f', textAlign: 'right' }}>{fmt.int(r.tuesdayAttendances)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #fef3c7', fontSize: '11px', color: '#78350f', textAlign: 'right' }}>{fmt.int(r.thursdayAttendances)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #fef3c7', fontSize: '11px', color: '#78350f', textAlign: 'right' }}>{r.matchType}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #fef3c7', fontSize: '11px', color: '#78350f' }}>{r.matchWhy || '—'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #fef3c7', fontSize: '11px', color: '#78350f' }}>{r.matchCandidateExamples || '—'}</td>
                      </tr>
                    ))}
                    {(!zoomSourceModule.current.topUnmatchedRepeatRows || zoomSourceModule.current.topUnmatchedRepeatRows.length === 0) && (
                      <tr><td colSpan={7} style={{ padding: '8px', fontSize: '11px', color: '#78350f' }}>No unmatched repeat attendees in this range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── GROUP 1: Free Leads ── */}
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>Group 1 — Free Leads</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Meta campaigns where the campaign name does NOT contain "phoenix".
              Tuesday: <a href="https://us02web.zoom.us/j/87199667045?pwd=CBcFMntO4jdoFDU08XrtfaHfBCAfbj.1" target="_blank" rel="noreferrer" style={{ color: '#0f766e' }}>87199667045</a> &nbsp;|&nbsp;
              Thursday: <a href="https://us02web.zoom.us/j/84242212480?pwd=e8eQwD55guBhjGNwcfLRAix14AGjnF.1" target="_blank" rel="noreferrer" style={{ color: '#0f766e' }}>84242212480</a>
            </p>
            <GroupPanel
              label="Free Tuesday"
              snap={groupedData?.current?.free?.tuesday}
              prevSnap={groupedData?.previous?.free?.tuesday}
              onOpenModal={openModal}
            />
            <GroupPanel
              label="Free Thursday"
              snap={groupedData?.current?.free?.thursday}
              prevSnap={groupedData?.previous?.free?.thursday}
              onOpenModal={openModal}
            />
            <GroupPanel
              label="Free Combined"
              snap={groupedData?.current?.free?.combined}
              prevSnap={groupedData?.previous?.free?.combined}
              onOpenModal={openModal}
            />
          </div>

          {/* ── HOW HEARD (LU.MA) ── */}
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>How Leads Heard About Sober Founders</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Group 1 (Free Combined) Lu.ma responses normalized into core categories.
              Meta includes variants like ig, insta, instagram, fb, facebook, and meta.
              If Lu.ma answer is missing, HubSpot original source is used as fallback.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '10px' }}>
              {hearAboutModule.summary.map((item) => {
                const change = item.prevCount === null ? null : computeChangePct(item.count, item.prevCount).pct;
                return (
                  <div key={item.key} style={{ ...subCard, borderLeft: `4px solid ${item.color}` }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#334155', fontWeight: 700 }}>{item.label}</p>
                    <p style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{item.count.toLocaleString()}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                      {fmt.pct(item.pct)}
                      {change !== null && <ChangeBadge changePct={change} />}
                    </p>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '14px', ...subCard }}>
              <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Weekly Trend (last 12 weeks in selected date range)
              </p>
              {hearAboutModule.trendRows.length > 0 ? (
                <div style={{ height: '260px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hearAboutModule.trendRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip formatter={(v, n) => [Number(v || 0).toLocaleString(), n]} />
                      <Legend />
                      {HEAR_ABOUT_CATEGORIES.map((item) => (
                        <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} stackId="hearabout" />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>No Lu.ma registrations in this date range.</p>
              )}
            </div>
          </div>

          {/* ── META ROI / SHOW-UP QUALITY ── */}
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>Meta ROI / Show-Up Quality (Free Leads)</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Uses Group 1 (Free Combined) Lu.ma registrants with HubSpot original source + Lu.ma fallback attribution.
              "Good Repeat Member" = matched Zoom attendee with 3+ matched Zooms in Lu.ma history and revenue ≥ $250k (official preferred).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '10px' }}>
              {[
                {
                  label: 'Free Meta Spend',
                  value: fmt.currency(attendanceCostModule.current.spend || 0),
                  changePct: attendanceCostModule.previous ? computeChangePct(attendanceCostModule.current.spend || 0, attendanceCostModule.previous.spend || 0).pct : null,
                  invertColor: true,
                },
                {
                  label: 'Paid Registrations',
                  value: fmt.int(attendanceCostModule.current.paid.registrations || 0),
                  changePct: attendanceCostModule.previous ? computeChangePct(attendanceCostModule.current.paid.registrations || 0, attendanceCostModule.previous.paid.registrations || 0).pct : null,
                },
                {
                  label: 'Paid Show-Ups',
                  value: fmt.int(attendanceCostModule.current.paid.showUps || 0),
                  changePct: attendanceCostModule.previous ? computeChangePct(attendanceCostModule.current.paid.showUps || 0, attendanceCostModule.previous.paid.showUps || 0).pct : null,
                },
                {
                  label: 'Paid Show-Up Rate',
                  value: fmtMaybePct(attendanceCostModule.current.paid.showUpRate),
                  changePct: attendanceCostModule.previous ? computeChangePct(attendanceCostModule.current.paid.showUpRate || 0, attendanceCostModule.previous.paid.showUpRate || 0).pct : null,
                },
                {
                  label: 'Paid Cost / Show-Up',
                  value: fmtMaybeCurrency(attendanceCostModule.current.paid.costPerShowUp),
                  changePct: attendanceCostModule.previous ? computeChangePct(attendanceCostModule.current.paid.costPerShowUp || 0, attendanceCostModule.previous.paid.costPerShowUp || 0).pct : null,
                  invertColor: true,
                },
                {
                  label: 'Paid Cost / Net-New Show-Up',
                  value: fmtMaybeCurrency(attendanceCostModule.current.paid.costPerNetNewShowUp),
                  changePct: attendanceCostModule.previous ? computeChangePct(attendanceCostModule.current.paid.costPerNetNewShowUp || 0, attendanceCostModule.previous.paid.costPerNetNewShowUp || 0).pct : null,
                  invertColor: true,
                },
                {
                  label: 'Paid Repeat Members',
                  value: fmt.int(attendanceCostModule.current.paid.repeatMembers || 0),
                  changePct: attendanceCostModule.previous ? computeChangePct(attendanceCostModule.current.paid.repeatMembers || 0, attendanceCostModule.previous.paid.repeatMembers || 0).pct : null,
                },
                {
                  label: 'Paid Good Repeat Members',
                  value: fmt.int(attendanceCostModule.current.paid.goodRepeatMembers || 0),
                  changePct: attendanceCostModule.previous ? computeChangePct(attendanceCostModule.current.paid.goodRepeatMembers || 0, attendanceCostModule.previous.paid.goodRepeatMembers || 0).pct : null,
                },
                {
                  label: 'Paid Cost / Good Repeat Member',
                  value: fmtMaybeCurrency(attendanceCostModule.current.paid.costPerGoodRepeatMember),
                  changePct: attendanceCostModule.previous ? computeChangePct(attendanceCostModule.current.paid.costPerGoodRepeatMember || 0, attendanceCostModule.previous.paid.costPerGoodRepeatMember || 0).pct : null,
                  invertColor: true,
                },
              ].map((item) => (
                <div key={item.label} style={{ ...subCard, borderLeft: item.label.includes('Cost') ? '4px solid #dc2626' : '4px solid #0f766e' }}>
                  <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{item.label}</p>
                  <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    {item.value}
                    {item.changePct !== null && item.changePct !== undefined && <ChangeBadge changePct={item.changePct} invertColor={!!item.invertColor} />}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ ...subCard, border: '1px solid #fecaca', backgroundColor: '#fef2f2' }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#991b1b' }}>Paid Cohort Snapshot</p>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#7f1d1d' }}>
                  Show-Up Rate: <strong>{fmtMaybePct(attendanceCostModule.current.paid.showUpRate)}</strong> | Cost / Show-Up: <strong>{fmtMaybeCurrency(attendanceCostModule.current.paid.costPerShowUp)}</strong> | Cost / Good Repeat: <strong>{fmtMaybeCurrency(attendanceCostModule.current.paid.costPerGoodRepeatMember)}</strong>
                </p>
              </div>
              <div style={{ ...subCard, border: '1px solid #bfdbfe', backgroundColor: '#eff6ff' }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>Non-Paid Comparator</p>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#1e3a8a' }}>
                  Registrations: <strong>{fmt.int(attendanceCostModule.current.nonPaid.registrations || 0)}</strong> | Show-Ups: <strong>{fmt.int(attendanceCostModule.current.nonPaid.showUps || 0)}</strong> | Show-Up Rate: <strong>{fmtMaybePct(attendanceCostModule.current.nonPaid.showUpRate)}</strong>
                </p>
              </div>
            </div>

            <div style={{ marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    {['Source Bucket', 'Registrations', 'Show-Ups', 'Net New Show-Ups', 'Repeat Members', 'Good Repeat Members', 'Show-Up Rate', '% of Show-Ups', 'Cost / Show-Up'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'Source Bucket' ? 'left' : 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendanceCostModule.current.sourceRows.map((row) => {
                    const isPaid = row.bucket === 'Paid Social (Meta)';
                    return (
                      <tr
                        key={row.bucket}
                        onClick={() => {
                          const sourceDrillCols = [
                            { key: 'name', label: 'Name' },
                            { key: 'email', label: 'Email Address' },
                            { key: 'showedUp', label: 'Showed Up?' },
                            { key: 'repeatMember', label: 'Repeat Member?' },
                            { key: 'goodRepeatMember', label: 'Good Repeat Member?' },
                            { key: '_historyShowUps', label: 'Matched Zooms (History)', type: 'number' },
                            { key: 'revenue', label: 'Revenue', type: 'currency' },
                            { key: 'sobrietyDate', label: 'Sobriety Date' },
                            { key: 'originalTrafficSource', label: 'Original Traffic Source' },
                            { key: 'originalTrafficSourceDetail1', label: 'Original Traffic Source Detail 1' },
                            { key: 'originalTrafficSourceDetail2', label: 'Original Traffic Source Detail 2' },
                            { key: 'hearAboutCategory', label: 'How Heard (Category)' },
                            { key: 'hearAbout', label: 'How Did You Hear About Sober Founders?' },
                            { key: 'hearAboutSource', label: 'Hear About Source' },
                            { key: 'adGroup', label: 'Facebook Ad Group' },
                            { key: 'sourceBucket', label: 'Source Bucket' },
                          ];
                          setModal({
                            title: `Free Leads — ${row.bucket} Cohort`,
                            columns: sourceDrillCols,
                            rows: row.rows || [],
                            highlightKey: 'matchedZoom',
                          });
                        }}
                        style={{ cursor: 'pointer', backgroundColor: isPaid ? '#fef2f2' : '#fff' }}
                      >
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#0f172a', fontWeight: isPaid ? 700 : 600 }}>{row.bucket}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>{fmt.int(row.registrations)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>{fmt.int(row.showUps)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>{fmt.int(row.netNewShowUps)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>{fmt.int(row.repeatMembers)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>{fmt.int(row.goodRepeatMembers)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>{fmtMaybePct(row.showUpRate)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>{fmtMaybePct(row.pctOfShowUps)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: isPaid ? '#991b1b' : '#94a3b8', textAlign: 'right', fontWeight: isPaid ? 700 : 500 }}>
                          {isPaid ? fmtMaybeCurrency(attendanceCostModule.current.paid.costPerShowUp) : 'N/A'}
                        </td>
                      </tr>
                    );
                  })}
                  {attendanceCostModule.current.sourceRows.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: '12px', fontSize: '12px', color: '#64748b' }}>No Lu.ma registrants available in this date range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#64748b' }}>
              Click any source row to inspect the actual registrants in that cohort. Cost metrics use Group 1 Free Meta spend for the selected date range.
            </p>
          </div>

          {/* ── ZOOM SOURCE ATTRIBUTION (TUESDAY + THURSDAY) ── */}
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>Zoom Source Attribution (Free Meetings)</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Uses Zoom attendee names (Tuesday + Thursday) matched to HubSpot via canonicalized names and aliases, so Tuesday attendees are included even without Lu.ma.
              Costs use Group 1 Free Meta spend in the selected date range. Repeat counts use loaded Zoom history ({zoomSourceModule.loadedHistoryDays} days). Good members = 3+ Zoom attendances and revenue ≥ $250k.
            </p>

            <div style={{ ...subCard, border: '1px solid #dbeafe', backgroundColor: '#eff6ff', marginBottom: '12px' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>AI Paid Strategy Summary</p>
              <p style={{ margin: '6px 0 0', fontSize: '13px', fontWeight: 700, color: '#1e3a8a' }}>{paidDecisionInsights.headline}</p>
              {paidDecisionInsights.bullets.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  {paidDecisionInsights.bullets.map((line, idx) => (
                    <p key={`ai-b-${idx}`} style={{ margin: '4px 0', fontSize: '12px', color: '#1e3a8a' }}>• {line}</p>
                  ))}
                </div>
              )}
              {paidDecisionInsights.warnings.length > 0 && (
                <div style={{ marginTop: '8px', padding: '8px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#92400e' }}>Data / confidence warnings</p>
                  {paidDecisionInsights.warnings.map((line, idx) => (
                    <p key={`ai-w-${idx}`} style={{ margin: '4px 0 0', fontSize: '12px', color: '#92400e' }}>• {line}</p>
                  ))}
                </div>
              )}
              {paidDecisionInsights.moves.length > 0 && (
                <div style={{ marginTop: '8px', padding: '8px', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#166534' }}>Suggested business moves</p>
                  {paidDecisionInsights.moves.map((line, idx) => (
                    <p key={`ai-m-${idx}`} style={{ margin: '4px 0 0', fontSize: '12px', color: '#166534' }}>• {line}</p>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '10px' }}>
              {[
                {
                  label: 'Free Zoom Show-Up Rows',
                  value: fmt.int(zoomSourceModule.current.totalShowUpRows || 0),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.totalShowUpRows || 0, zoomSourceModule.previous.totalShowUpRows || 0).pct : null,
                },
                {
                  label: 'Attribution Match Rate',
                  value: fmtMaybePct(zoomSourceModule.current.matchRate),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.matchRate || 0, zoomSourceModule.previous.matchRate || 0).pct : null,
                },
                {
                  label: 'Paid Meta Zoom Show-Ups',
                  value: fmt.int(zoomSourceModule.current.paidMeta.showUpRows || 0),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.paidMeta.showUpRows || 0, zoomSourceModule.previous.paidMeta.showUpRows || 0).pct : null,
                },
                {
                  label: 'Paid Meta Share of Free Show-Ups',
                  value: fmtMaybePct(zoomSourceModule.current.paidMeta.showUpShare),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.paidMeta.showUpShare || 0, zoomSourceModule.previous.paidMeta.showUpShare || 0).pct : null,
                },
                {
                  label: 'Paid Meta Cost / Zoom Show-Up',
                  value: fmtMaybeCurrency(zoomSourceModule.current.paidMeta.costPerShowUp),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.paidMeta.costPerShowUp || 0, zoomSourceModule.previous.paidMeta.costPerShowUp || 0).pct : null,
                  invertColor: true,
                },
                {
                  label: 'Paid Meta Repeat Members',
                  value: fmt.int(zoomSourceModule.current.paidMeta.repeatMembers || 0),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.paidMeta.repeatMembers || 0, zoomSourceModule.previous.paidMeta.repeatMembers || 0).pct : null,
                },
                {
                  label: 'Paid Meta Good Repeat Members',
                  value: fmt.int(zoomSourceModule.current.paidMeta.goodRepeatMembers || 0),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.paidMeta.goodRepeatMembers || 0, zoomSourceModule.previous.paidMeta.goodRepeatMembers || 0).pct : null,
                },
                {
                  label: 'Paid Meta Cost / Good Repeat',
                  value: fmtMaybeCurrency(zoomSourceModule.current.paidMeta.costPerGoodRepeatMember),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.paidMeta.costPerGoodRepeatMember || 0, zoomSourceModule.previous.paidMeta.costPerGoodRepeatMember || 0).pct : null,
                  invertColor: true,
                },
                {
                  label: 'Tuesday Meta Share (All Rows)',
                  value: fmtMaybePct(zoomSourceModule.current.tuesdayAssumptionTest.paidMetaShareOfTuesday),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.tuesdayAssumptionTest.paidMetaShareOfTuesday || 0, zoomSourceModule.previous.tuesdayAssumptionTest.paidMetaShareOfTuesday || 0).pct : null,
                },
                {
                  label: 'Tuesday Meta Share (Matched Rows)',
                  value: fmtMaybePct(zoomSourceModule.current.tuesdayAssumptionTest.paidMetaShareOfMatchedTuesday),
                  changePct: zoomSourceModule.previous ? computeChangePct(zoomSourceModule.current.tuesdayAssumptionTest.paidMetaShareOfMatchedTuesday || 0, zoomSourceModule.previous.tuesdayAssumptionTest.paidMetaShareOfMatchedTuesday || 0).pct : null,
                },
              ].map((item) => (
                <div key={item.label} style={{ ...subCard, borderLeft: item.label.includes('Cost') ? '4px solid #dc2626' : '4px solid #0f766e' }}>
                  <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{item.label}</p>
                  <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    {item.value}
                    {item.changePct !== null && item.changePct !== undefined && <ChangeBadge changePct={item.changePct} invertColor={!!item.invertColor} />}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ ...subCard, border: '1px solid #fecaca', backgroundColor: '#fef2f2' }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#991b1b' }}>Tuesday Assumption Test</p>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#7f1d1d' }}>
                  Meta paid matched to <strong>{fmt.int(zoomSourceModule.current.tuesdayAssumptionTest.paidMetaTuesdayRows || 0)}</strong> of <strong>{fmt.int(zoomSourceModule.current.tuesdayAssumptionTest.totalTuesdayRows || 0)}</strong> Tuesday show-up rows.
                  Matched-rows share: <strong>{fmtMaybePct(zoomSourceModule.current.tuesdayAssumptionTest.paidMetaShareOfMatchedTuesday)}</strong>.
                </p>
              </div>
              <div style={{ ...subCard, border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#334155' }}>What to Read First</p>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#475569' }}>
                  Use <strong>Paid Meta Cost / Good Repeat</strong> as the north-star metric.
                  Then inspect the source table rows below and click into paid/organic cohorts to validate individual attendees and revenue quality.
                </p>
              </div>
            </div>

            <div style={{ marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1220px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    {['Source Bucket', 'Show-Up Rows', 'Unique Attendees', 'Tuesday', 'Thursday', 'Net New Rows', 'Repeat Members', 'Good Repeat Members', 'Repeat Rate', 'Good Repeat Rate', 'Share of Show-Ups', 'HubSpot Match Rate', 'Cost / Show-Up'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'Source Bucket' ? 'left' : 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zoomSourceModule.current.sourceRows.map((row) => {
                    const isPaidMeta = row.bucket === 'Paid Social (Meta)';
                    const hubspotMatchRate = (row.matchedHubspotRows + row.unmatchedHubspotRows) > 0
                      ? row.matchedHubspotRows / (row.matchedHubspotRows + row.unmatchedHubspotRows)
                      : null;

                    return (
                      <tr
                        key={`zoom-src-${row.bucket}`}
                        onClick={() => {
                          const cols = [
                            { key: 'date', label: 'Date' },
                            { key: 'dayType', label: 'Day' },
                            { key: 'attendeeName', label: 'Zoom Attendee (Canonical)' },
                            { key: 'rawName', label: 'Zoom Attendee (Raw)' },
                            { key: 'matchedHubspot', label: 'Matched HubSpot?' },
                            { key: 'matchType', label: 'Match Type' },
                            { key: 'matchLookupStrategy', label: 'Lookup Strategy' },
                            { key: 'matchWhy', label: 'Why / Match Note' },
                            { key: 'matchCandidateExamples', label: 'Candidate Hints' },
                            { key: 'matchCandidateCount', label: 'Name Candidates', type: 'number' },
                            { key: 'hubspotName', label: 'HubSpot Name' },
                            { key: 'email', label: 'Email Address' },
                            { key: 'sourceBucket', label: 'Source Bucket' },
                            { key: 'sourceAttributionMethod', label: 'Source Attribution Method' },
                            { key: 'missingAttributionReason', label: 'Missing Attribution Reason' },
                            { key: 'manualAttributionOverride', label: 'Manual Override?' },
                            { key: 'manualAttributionNote', label: 'Manual Override Note' },
                            { key: 'manualHubspotContactId', label: 'Manual HubSpot Contact ID', type: 'number' },
                            { key: 'manualHubspotUrl', label: 'Manual HubSpot URL' },
                            { key: 'originalTrafficSource', label: 'Original Traffic Source' },
                            { key: 'originalTrafficSourceDetail1', label: 'Original Traffic Detail 1' },
                            { key: 'originalTrafficSourceDetail2', label: 'Original Traffic Detail 2' },
                            { key: 'lumaHowHeardCategoryFallback', label: 'Luma How Heard (Fallback Category)' },
                            { key: 'lumaHowHeardFallback', label: 'Luma How Heard (Fallback Raw)' },
                            { key: 'netNewAttendee', label: 'Net New Attendee?' },
                            { key: 'repeatAttendee', label: 'Repeat Attendee?' },
                            { key: 'goodRepeatMember', label: 'Good Repeat Member?' },
                            { key: 'totalZoomAttendances', label: 'Zoom Attendances (History)', type: 'number' },
                            { key: 'revenue', label: 'Revenue', type: 'currency' },
                          ];
                          setModal({
                            title: `Free Zoom Show-Ups — ${row.bucket}`,
                            columns: cols,
                            rows: row.rows || [],
                            highlightKey: 'isMetaPaid',
                          });
                        }}
                        style={{ cursor: 'pointer', backgroundColor: isPaidMeta ? '#fef2f2' : '#fff' }}
                      >
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#0f172a', fontWeight: isPaidMeta ? 700 : 600 }}>{row.bucket}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.showUpRows)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.uniqueAttendees)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.tuesdayShowUps)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.thursdayShowUps)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.netNewRows)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.repeatMembers)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.int(row.goodRepeatMembers)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmtMaybePct(row.repeatRateAmongUnique)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmtMaybePct(row.goodRepeatRateAmongUnique)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmtMaybePct(row.showUpShare)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmtMaybePct(hubspotMatchRate)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right', color: isPaidMeta ? '#991b1b' : '#94a3b8', fontWeight: isPaidMeta ? 700 : 500 }}>
                          {isPaidMeta ? fmtMaybeCurrency(zoomSourceModule.current.paidMeta.costPerShowUp) : 'N/A'}
                        </td>
                      </tr>
                    );
                  })}
                  {zoomSourceModule.current.sourceRows.length === 0 && (
                    <tr>
                      <td colSpan={13} style={{ padding: '12px', fontSize: '12px', color: '#64748b' }}>No Zoom attendees in the selected date range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#64748b' }}>
              Click any source row to inspect attendee-level matches (date, day, name match type, traffic source, repeat status, and revenue).
            </p>
          </div>

          {/* ── GROUP 2: Phoenix Forum Leads ── */}
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>Group 2 — Phoenix Forum Leads</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Meta campaigns where the campaign name CONTAINS "phoenix". Paid funnel tracked separately.
            </p>
            <GroupPanel
              label="Phoenix Forum"
              snap={groupedData?.current?.phoenix}
              prevSnap={groupedData?.previous?.phoenix}
              onOpenModal={openModal}
            />
          </div>

          {/* ── Legacy / existing analytics below ── */}
          {analytics && (
            <>
              <AIAnalysisCard analysis={analytics.analysis} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                {analytics.costCards.slice(0, 4).map((c) => (
                  <div key={c.key} onClick={() => setDrilldownMetricKey(c.key)} style={{ cursor: 'pointer', borderRadius: '16px', boxShadow: drilldownMetricKey === c.key ? '0 0 0 2px #0f766e' : 'none' }}>
                    <KPICard title={c.label} value={fmt.currency(c.value)} trend={trendDirection(c.value, c.previous)} invertColor={true} color="var(--color-orange)" />
                  </div>
                ))}
              </div>

              <div style={card}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Thursday Lu.ma Funnel Integrity</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
                  {[
                    { key: 'registrations', label: 'Registrations', value: Math.round(analytics.thursdayLumaFunnel.registrations) },
                    { key: 'luma_zoom_matches', label: 'Matched in Zoom', value: Math.round(analytics.thursdayLumaFunnel.zoomMatches) },
                    { key: 'luma_zoom_net_new_matches', label: 'Matched Net New', value: Math.round(analytics.thursdayLumaFunnel.zoomNetNewMatches) },
                    { key: 'luma_hubspot_matches', label: 'Matched HubSpot', value: Math.round(analytics.thursdayLumaFunnel.hubspotMatches) },
                  ].map((item) => (
                    <div key={item.key} onClick={() => setDrilldownMetricKey(item.key)} style={{ ...subCard, cursor: 'pointer', boxShadow: drilldownMetricKey === item.key ? '0 0 0 2px #0f766e' : 'none' }}>
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{item.label}</p>
                      <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{item.value.toLocaleString()}</p>
                    </div>
                  ))}
                  <div style={subCard}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Reg to Net New Show Rate</p>
                    <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{fmt.pct(analytics.thursdayLumaFunnel.regToShowRate)}</p>
                  </div>
                </div>
              </div>

              <div style={card}>
                <h3 style={{ fontSize: '18px', marginBottom: '14px' }}>Funnel Visualization</h3>
                <div style={{ height: '310px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.funnelStages} layout="vertical" margin={{ left: 24, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis dataKey="label" type="category" width={140} tick={{ fontSize: 12, fill: '#334155' }} />
                      <Tooltip formatter={(v, _, p) => [Number(v || 0).toLocaleString(), p?.payload?.label || '']} labelFormatter={(_, p) => { const r = p?.[0]?.payload; if (!r) return ''; return r.conversionFromPrevious === null ? 'Stage start' : `From previous: ${(r.conversionFromPrevious * 100).toFixed(1)}%`; }} />
                      <Bar dataKey="value" fill="#0f766e" radius={[4, 4, 4, 4]} cursor="pointer" onClick={(p) => { if (p?.key) setDrilldownMetricKey(p.key); }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={card}>
                  <h3 style={{ fontSize: '18px', marginBottom: '14px' }}>Lead Quality Breakdown</h3>
                  <div style={{ height: '240px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={analytics.leadQualityBreakdown.chartRows} dataKey="value" nameKey="name" outerRadius={90}>
                          {analytics.leadQualityBreakdown.chartRows.map((e) => <Cell key={e.name} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v) => Number(v || 0).toLocaleString()} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                    {analytics.leadQualityBreakdown.chartRows.map((r) => (
                      <div key={r.name} onClick={() => setDrilldownMetricKey(r.name.toLowerCase())} style={{ ...subCard, cursor: 'pointer', boxShadow: drilldownMetricKey === r.name.toLowerCase() ? '0 0 0 2px #0f766e' : 'none' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{r.name}</p>
                        <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{Math.round(r.value).toLocaleString()}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>{fmt.pct(r.pct)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={card}>
                  <h3 style={{ fontSize: '18px', marginBottom: '14px' }}>Show-Up Tracker (Net New)</h3>
                  <div style={{ height: '240px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={showupRows}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip /><Legend />
                        <Line type="monotone" dataKey="netNewTuesday" name="Tuesday Net New" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="netNewThursday" name="Thursday Net New" stroke="#6366f1" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="netNewTotal" name="Total Net New" stroke="#0f766e" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={subCard}><p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Tue Avg Net New</p><p style={{ margin: '4px 0 0', fontWeight: 700 }}>{analytics.showUpTracker.averageTuesday.toFixed(2)}</p></div>
                    <div style={subCard}><p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Thu Avg Net New</p><p style={{ margin: '4px 0 0', fontWeight: 700 }}>{analytics.showUpTracker.averageThursday.toFixed(2)}</p></div>
                  </div>
                </div>
              </div>

              {/* Ad Attribution Table */}
              <div style={card}>
                <h3 style={{ fontSize: '18px', marginBottom: '14px' }}>Ad Attribution Table</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        {['Campaign', 'Ad Set', 'Ad', 'Spend', 'Meta Leads', 'Attr Leads', 'Attr Regs', 'Attr Show-Ups', 'Attr Qual', 'Attr Great', 'CPL', 'CPQL', 'CPGL', 'Show-Up Rate', 'Quality Score'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topAttributionRows.map((r) => (
                        <tr key={r.adId}>
                          {[r.campaignName, r.adsetName, r.adName, fmt.currency(r.spend), fmt.int(r.metaLeads), r.attributedLeads.toFixed(2), r.attributedRegistrations.toFixed(2), r.attributedShowUps.toFixed(2), r.attributedQualifiedLeads.toFixed(2), r.attributedGreatLeads.toFixed(2), fmt.currency(r.cpl), r.attributedQualifiedLeads > 0 ? fmt.currency(r.cpql) : 'N/A', r.attributedGreatLeads > 0 ? fmt.currency(r.cpgl) : 'N/A', fmt.pct(r.showUpRate), r.qualityScore.toFixed(1)].map((v, i) => (
                            <td key={i} style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155' }}>{v}</td>
                          ))}
                        </tr>
                      ))}
                      {topAttributionRows.length === 0 && <tr><td colSpan={15} style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>No attribution data.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top / Bottom Ads */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={card}>
                  <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Top Performing Ads</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analytics.topAds.map((r) => (
                      <div key={r.adId} style={{ ...subCard }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>{r.adName}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>{r.adsetName}</p>
                        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#0f766e' }}>CPGL: {r.attributedGreatLeads > 0 ? fmt.currency(r.cpgl) : 'N/A'} | Show-Up: {fmt.pct(r.showUpRate)}</p>
                      </div>
                    ))}
                    {!analytics.topAds.length && <p style={{ color: '#64748b', fontSize: '13px' }}>No top ads.</p>}
                  </div>
                </div>
                <div style={card}>
                  <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Bottom Performing Ads</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analytics.bottomAds.map((r) => (
                      <div key={r.adId} style={{ backgroundColor: '#fff7ed', borderRadius: '10px', padding: '10px', border: '1px solid #fed7aa' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>{r.adName}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9a3412' }}>{r.adsetName}</p>
                        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#9a3412' }}>Spend: {fmt.currency(r.spend)} | CPL: {fmt.currency(r.cpl)}</p>
                      </div>
                    ))}
                    {!analytics.bottomAds.length && <p style={{ color: '#64748b', fontSize: '13px' }}>No bottom ads.</p>}
                  </div>
                </div>
              </div>

              {/* WoW / MoM */}
              <div style={card}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Week-over-Week and Month-over-Month</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '780px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        {['Metric', 'Current', 'WoW', 'MoM'].map((h) => (
                          <th key={h} style={{ textAlign: h === 'Metric' ? 'left' : 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.analysis.metricSnapshotRows.slice(0, 10).map((r) => (
                        <tr key={r.id}>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{r.label}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{r.format === 'currency' ? fmt.currency(r.current) : r.format === 'percent' ? fmt.pct(r.current) : fmt.int(r.current)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.deltaPct(r.weeklyDelta?.deltaPct)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>{fmt.deltaPct(r.monthlyDelta?.deltaPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Fact Check Drilldown (collapsed) */}
              <div style={card}>
                <details onToggle={(event) => setFactCheckDrilldownOpen(Boolean(event.currentTarget?.open))}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '16px', color: '#0f172a', listStyle: 'none' }}>
                    Fact Check Drilldown
                    <span style={{ marginLeft: '8px', fontWeight: 500, fontSize: '12px', color: '#64748b' }}>
                      Click to expand raw supporting rows
                    </span>
                  </summary>
                  {factCheckDrilldownOpen ? (
                    <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Click KPI numbers above, or choose a metric and window below.</p>
                      <select value={drilldownWindowKey} onChange={(e) => setDrilldownWindowKey(e.target.value)} disabled={!drilldownDataReady} style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '12px', fontWeight: 600, color: '#334155', opacity: drilldownDataReady ? 1 : 0.6 }}>
                        {Object.entries(analytics.drilldowns.windows || {}).map(([k, w]) => <option key={k} value={k}>{w.label}: {w.startKey} to {w.endKey}</option>)}
                      </select>
                    </div>
                    <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {drilldownQuickMetrics.map((k) => (
                        <button key={k} onClick={() => setDrilldownMetricKey(k)} disabled={!drilldownDataReady} style={{ border: '1px solid #cbd5e1', backgroundColor: drilldownMetricKey === k ? '#0f766e' : '#f8fafc', color: drilldownMetricKey === k ? '#fff' : '#334155', borderRadius: '999px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: drilldownDataReady ? 'pointer' : 'not-allowed', opacity: drilldownDataReady ? 1 : 0.6 }}>
                          {analytics.drilldowns.metricLabels?.[k] || k}
                        </button>
                      ))}
                    </div>
                    {!drilldownDataReady ? (
                      <p style={{ marginTop: '12px', fontSize: '12px', color: '#64748b' }}>
                        Loading drilldown tables...
                      </p>
                    ) : activeDrilldownWindow && activeDrilldownTable ? (
                      <>
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>{analytics.drilldowns.metricLabels?.[drilldownMetricKey] || drilldownMetricKey}</p>
                          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Rows: {activeDrilldownTable.rows.length.toLocaleString()}</p>
                        </div>
                        <div style={{ marginTop: '10px', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
                          <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f8fafc' }}>
                                {activeDrilldownTable.columns.map((col) => (
                                  <th key={col.key} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>{col.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {activeDrilldownTable.rows.map((row, i) => (
                                <tr key={i}>
                                  {activeDrilldownTable.columns.map((col) => (
                                    <td key={col.key} style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155' }}>
                                      {col.type === 'currency' ? fmt.currency(row[col.key]) : col.type === 'number' ? fmt.int(row[col.key]) : col.type === 'percent' ? fmt.pct(row[col.key]) : String(row[col.key] ?? '—')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                              {activeDrilldownTable.rows.length === 0 && (
                                <tr><td colSpan={activeDrilldownTable.columns.length} style={{ padding: '12px', fontSize: '12px', color: '#64748b' }}>{activeDrilldownTable.emptyMessage}</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p style={{ marginTop: '12px', fontSize: '12px', color: '#64748b' }}>No drilldown data available.</p>
                    )}
                    </div>
                  ) : null}
                </details>
              </div>
            </>
          )}

          {/* ── AI Insights Panel ── */}
          <AIInsightsPanel supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} groupedData={groupedData} />

          </div>
        ) : null}
      </details>

      {/* ── Drill-down Modal ── */}
        </div>
      </details>

      <DrillDownModal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title={modal?.title || ''}
        columns={modal?.columns || []}
        rows={modal?.rows || []}
        highlightKey={modal?.highlightKey}
        emptyMessage="No records in this window."
      />
    </div>
  );
}

