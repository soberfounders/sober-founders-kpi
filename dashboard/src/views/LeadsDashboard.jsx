import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { buildLeadAnalytics } from '../lib/leadAnalytics';
import { buildGroupedLeadsSnapshot, buildDateRangeWindows, computeChangePct } from '../lib/leadsGroupAnalytics';
import { buildAliasMap, resolveCanonicalAttendeeName } from '../lib/attendeeCanonicalization';
import DrillDownModal from '../components/DrillDownModal';
import AIAnalysisCard from '../components/AIAnalysisCard';
import KPICard from '../components/KPICard';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';

const LOOKBACK_DAYS = 120;

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

function normalizeHearAboutCategoryLabel(rawLabel) {
  if (!rawLabel) return 'Unknown';
  if (HEAR_ABOUT_KEY_BY_LABEL[rawLabel]) return rawLabel;
  return 'Other';
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

// ─── Category bar ─────────────────────────────────────────────────────────────
const TIER_COLORS = { great: '#16a34a', qualified: '#2563eb', ok: '#d97706', bad: '#dc2626', unknown: '#94a3b8' };
const TIER_LABELS = { great: 'Great ≥$1M', qualified: 'Qualified $250k–$1M', ok: 'OK $100k–$249k', bad: 'Bad <$100k', unknown: 'Unknown' };

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
  const [adModal, setAdModal] = useState(null);
  const [error, setError] = useState(null);

  const runAnalysis = useCallback(async () => {
    if (!groupedData) return;
    setLoading(true); setError(null);
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-leads-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({
          mode: 'analyze',
          dateLabel: groupedData.dateRange?.current?.label || 'Selected Period',
          currentData: groupedData.current,
          previousData: groupedData.previous,
        }),
      });
      const json = await resp.json();
      if (json.ok) setAiData(json);
      else setError(json.error || 'Unknown error');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [groupedData, supabaseUrl, supabaseKey]);

  const generateAd = useCallback(async () => {
    if (!groupedData) return;
    setLoading(true);
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
        </>
      ) : (
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Click "Run AI Analysis" to generate insights.</p>
      )}
    </div>
  );

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>🤖 AI Manager Insights</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>AI-powered analysis of your leads funnel. Mock responses until API keys are configured.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={runAnalysis} disabled={loading} style={{ padding: '8px 16px', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? '⏳ Running…' : '▶ Run AI Analysis'}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '12px' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '12px', color: '#1e40af' }}>✅ AI Can Do Autonomously</p>
            {(aiData.autonomous_actions || []).map((a, i) => <p key={i} style={{ margin: '3px 0', fontSize: '11px', color: '#1e40af' }}>• {a}</p>)}
          </div>
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '12px', padding: '12px' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '12px', color: '#854d0e' }}>👤 Requires Human</p>
            {(aiData.human_actions || []).map((a, i) => <p key={i} style={{ margin: '3px 0', fontSize: '11px', color: '#854d0e' }}>• {a}</p>)}
          </div>
        </div>
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

  // Date range state
  const [rangeType, setRangeType] = useState('last_week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Drill-down modal state
  const [modal, setModal] = useState(null); // { title, columns, rows }

  // Legacy drilldown
  const [drilldownWindowKey, setDrilldownWindowKey] = useState('monthCurrent');
  const [drilldownMetricKey, setDrilldownMetricKey] = useState('leads');

  // Supabase connection info for AI panel
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    setLoadErrors([]);
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - LOOKBACK_DAYS);
    const startKey = startDate.toISOString().slice(0, 10);
    const errors = [];

    const [adsR, zoomR, hubspotR, aliasR] = await Promise.all([
      supabase.from('raw_fb_ads_insights_daily')
        .select('date_day,ad_account_id,funnel_key,campaign_name,adset_name,ad_name,ad_id,spend,impressions,clicks,leads')
        .gte('date_day', startKey).order('date_day', { ascending: true }),
      supabase.from('kpi_metrics')
        .select('metric_name,metric_value,metric_date,metadata')
        .eq('metric_name', 'Zoom Meeting Attendees')
        .gte('metric_date', startKey).order('metric_date', { ascending: true }),
      supabase.from('raw_hubspot_contacts')
        .select('*')
        .gte('createdate', `${startKey}T00:00:00.000Z`).order('createdate', { ascending: false }),
      supabase.from('attendee_aliases').select('original_name,target_name'),
    ]);

    const lumaR = await supabase.from('raw_luma_registrations')
      .select('event_date,event_start_at,event_api_id,guest_api_id,guest_name,guest_email,registered_at,approval_status,is_thursday,matched_zoom,matched_zoom_net_new,matched_hubspot,matched_hubspot_tier,funnel_key,matched_hubspot_revenue,registration_answers,custom_source')
      .gte('event_date', startKey).order('event_date', { ascending: true });

    if (adsR.error) errors.push(`Meta ads unavailable: ${adsR.error.message}`);
    if (zoomR.error) errors.push(`Zoom data unavailable: ${zoomR.error.message}`);
    if (lumaR.error) errors.push(`Luma data unavailable: ${lumaR.error.message}`);
    if (hubspotR.error) errors.push(`HubSpot data unavailable: ${hubspotR.error.message}`);
    if (aliasR.error) errors.push(`Alias data unavailable: ${aliasR.error.message}`);

    setRawAds(adsR.data || []);
    setRawZoom(zoomR.data || []);
    setRawLuma(lumaR.data || []);
    setRawHubspot(hubspotR.data || []);
    setAliases(aliasR.data || []);

    // Legacy analytics for charts
    const nextAnalytics = buildLeadAnalytics({
      adsRows: adsR.data || [],
      hubspotRows: hubspotR.data || [],
      zoomRows: zoomR.data || [],
      lumaRows: lumaR.data || [],
      aliases: aliasR.data || [],
      lookbackDays: LOOKBACK_DAYS
    });
    setAnalytics(nextAnalytics);

    setLoadErrors(errors);
    setLoading(false);
  }

  // Build date range windows
  const today = new Date().toISOString().slice(0, 10);
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
      const revenueOfficial = Number(row?.revenueOfficial);
      const revenueFallback = Number(row?.revenue);
      const revenueForGood = Number.isFinite(revenueOfficial)
        ? revenueOfficial
        : (Number.isFinite(revenueFallback) ? revenueFallback : null);
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
      if (row?.annual_revenue_in_dollars__official_ !== null && row?.annual_revenue_in_dollars__official_ !== undefined && row?.annual_revenue_in_dollars__official_ !== '') score += 4;
      else if (row?.annual_revenue_in_dollars !== null && row?.annual_revenue_in_dollars !== undefined && row?.annual_revenue_in_dollars !== '') score += 2;
      if (row?.sobriety_date) score += 1;
      if (row?.hs_analytics_source) score += 1;
      if (row?.hs_analytics_source_data_1) score += 1;
      if (row?.hs_analytics_source_data_2) score += 1;
      return score;
    };

    const fullNameFromContact = (row) => `${String(row?.firstname || '').trim()} ${String(row?.lastname || '').trim()}`.trim();

    const hubspotNameIndex = new Map();
    (rawHubspot || []).forEach((row) => {
      const full = fullNameFromContact(row);
      const key = normalizeName(full);
      if (!key) return;
      if (!hubspotNameIndex.has(key)) hubspotNameIndex.set(key, []);
      hubspotNameIndex.get(key).push(row);
    });

    const pickContactForAttendee = (nameKey, eventDateKey) => {
      const candidates = hubspotNameIndex.get(nameKey) || [];
      if (!candidates.length) return { contact: null, matchType: 'not_found', candidateCount: 0 };
      if (candidates.length === 1) return { contact: candidates[0], matchType: 'exact_name', candidateCount: 1 };

      const eventTs = eventDateKey ? Date.parse(`${eventDateKey}T00:00:00.000Z`) : NaN;
      let best = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestCreated = Number.NEGATIVE_INFINITY;

      candidates.forEach((candidate) => {
        const score = contactScore(candidate);
        const createdTs = contactCreatedTs(candidate);
        const distance = Number.isFinite(eventTs) ? Math.abs(eventTs - createdTs) : Number.POSITIVE_INFINITY;
        if (
          score > bestScore ||
          (score === bestScore && distance < bestDistance) ||
          (score === bestScore && distance === bestDistance && createdTs > bestCreated)
        ) {
          best = candidate;
          bestScore = score;
          bestDistance = distance;
          bestCreated = createdTs;
        }
      });

      return { contact: best || candidates[0], matchType: 'ambiguous_name', candidateCount: candidates.length };
    };

    const resolveRevenue = (contact) => {
      const official = Number(contact?.annual_revenue_in_dollars__official_);
      if (Number.isFinite(official)) return { revenue: official, revenueOfficial: official };
      const fallback = Number(contact?.annual_revenue_in_dollars);
      if (Number.isFinite(fallback)) return { revenue: fallback, revenueOfficial: null };
      return { revenue: null, revenueOfficial: null };
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

      const heard = String(row?.hearAboutCategory || '').trim();
      if (heard === 'Meta (Facebook/Instagram)') return { bucket: 'Paid Social (Meta)', method: 'Luma How Heard' };
      if (heard === 'Google') return { bucket: 'Organic Search', method: 'Luma How Heard' };
      if (heard === 'Referral') return { bucket: 'Referral', method: 'Luma How Heard' };
      if (heard === 'ChatGPT / AI') return { bucket: 'ChatGPT / AI', method: 'Luma How Heard' };
      if (heard === 'Other') return { bucket: 'Other', method: 'Luma How Heard' };
      return { bucket: 'Unknown', method: 'No Luma Attribution' };
    };

    const aliasMap = buildAliasMap(aliases || []);

    const sessionRows = [];
    const historyByAttendee = new Map();

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

    const enrichRows = (rowsInRange) => rowsInRange.map((row) => {
      const match = pickContactForAttendee(row.attendeeKey, row.date);
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
      const contactEmail = String(contact?.email || '').trim().toLowerCase();
      const lumaEvidence = (contactEmail && lumaEvidenceByEmail.get(contactEmail)) || lumaEvidenceByName.get(row.attendeeKey) || null;
      const lumaFallback = sourceBucketFromLumaEvidence(lumaEvidence);
      const useLumaFallback = (contactSourceBucket === 'Unknown' || contactSourceBucket === 'Other') && lumaFallback.bucket !== 'Unknown';
      const sourceBucket = useLumaFallback ? lumaFallback.bucket : contactSourceBucket;
      const sourceAttributionMethod = useLumaFallback
        ? (contact ? `HubSpot Unknown → ${lumaFallback.method}` : lumaFallback.method)
        : (contact ? 'HubSpot Original Source' : 'Unattributed');

      return {
        ...row,
        matchedHubspot: !!contact,
        matchType: match.matchType,
        matchCandidateCount: match.candidateCount || 0,
        hubspotName: contact ? (fullNameFromContact(contact) || 'Not Found') : 'Not Found',
        email: contact?.email || 'Not Found',
        originalTrafficSource: contact?.hs_analytics_source || 'Not Found',
        originalTrafficSourceDetail1: contact?.hs_analytics_source_data_1 || 'Not Found',
        originalTrafficSourceDetail2: contact?.hs_analytics_source_data_2 || contact?.campaign || 'Not Found',
        revenue: Number.isFinite(revenue.revenue) ? revenue.revenue : 'Not Found',
        revenueOfficial: Number.isFinite(revenue.revenueOfficial) ? revenue.revenueOfficial : null,
        sourceBucket,
        sourceAttributionMethod,
        sourceFamily: sourceBucket.startsWith('Paid Social') ? 'Paid' : 'Non-Paid',
        lumaHowHeardCategoryFallback: lumaEvidence?.hearAboutCategory || 'Not Found',
        lumaHowHeardFallback: lumaEvidence?.hearAbout || 'Not Found',
        netNewAttendee: hist.firstSeenDate === row.date ? 'Yes' : 'No',
        repeatAttendee: isRepeat ? 'Yes' : 'No',
        goodRepeatMember: goodRepeat ? 'Yes' : 'No',
        totalZoomAttendances: hist.totalSessions || 0,
        tuesdayAttendances: hist.tuesdaySessions || 0,
        thursdayAttendances: hist.thursdaySessions || 0,
        firstSeenDate: hist.firstSeenDate || 'Not Found',
        isMetaPaid: sourceBucket === 'Paid Social (Meta)',
      };
    });

    const buildPeriodRows = (startKey, endKey) => enrichRows(
      sessionRows.filter((row) => dateInRange(row.date, startKey, endKey))
    );

    const aggregatePeriod = (rows, freeSpend) => {
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
        if (row.matchType === 'ambiguous_name') ambiguousRows += 1;

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
        if (row.matchType === 'ambiguous_name') agg.ambiguousRows += 1;
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
      const goodMemberSourceRows = sourceRows
        .filter((r) => r.goodRepeatMembers > 0 || r.bucket === 'Unknown' || r.bucket === 'Other')
        .map((r) => ({
          ...r,
          goodMemberShare: safeRatio(r.goodRepeatMembers, allGoodMemberKeys.size),
        }))
        .sort((a, b) => (b.goodRepeatMembers - a.goodRepeatMembers) || (b.repeatMembers - a.repeatMembers) || a.bucket.localeCompare(b.bucket));

      return {
        rows,
        sourceRows,
        goodMemberSourceRows,
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

    return {
      current: aggregatePeriod(currentRows, currentFreeSpend),
      previous: groupedData?.previous ? aggregatePeriod(previousRows, previousFreeSpend) : null,
      loadedHistoryDays: LOOKBACK_DAYS,
    };
  }, [rawZoom, rawHubspot, aliases, dateWindows, groupedData]);

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

    const paidRepeatRate = paid.repeatRateAmongUnique;
    const nonPaidRepeatRate = current.nonPaid?.repeatRateAmongUnique;
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

    const headline = (Number.isFinite(Number(paid.costPerGoodRepeatMember)))
      ? `Meta paid cost to create a good repeating member is currently ${maybeCurrency(paid.costPerGoodRepeatMember)} (estimate).`
      : 'Meta paid is generating show-ups, but there is not yet enough good-repeat volume for a stable cost-per-good-member estimate.';

    return { headline, bullets, moves, warnings };
  }, [zoomSourceModule, attendanceCostModule]);

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
  const activeDrilldownWindow = analytics?.drilldowns?.byWindow?.[drilldownWindowKey] || null;
  const activeDrilldownTable = activeDrilldownWindow?.tables?.[drilldownMetricKey] || null;
  const drilldownQuickMetrics = ['leads', 'registrations', 'showups', 'qualified', 'great', 'cpl', 'cpql', 'cost_per_showup', 'cost_per_registration'];

  const topAttributionRows = useMemo(() => {
    if (!analytics?.adAttributionRows) return [];
    return [...analytics.adAttributionRows].sort((a, b) => (b.attributedShowUps - a.attributedShowUps) || (b.spend - a.spend)).slice(0, 15);
  }, [analytics]);

  function trendDirection(cur, prev) {
    if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return 'neutral';
    return cur > prev ? 'up' : cur < prev ? 'down' : 'neutral';
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <GroupSkeleton /><GroupSkeleton />
        <div style={{ ...card }}><Skeleton h="300px" /></div>
      </div>
    );
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
      <div style={card}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: '#0f172a' }}>📅 Date Range</h3>
        <DateRangeFilter
          rangeType={rangeType} setRangeType={setRangeType}
          customStart={customStart} setCustomStart={setCustomStart}
          customEnd={customEnd} setCustomEnd={setCustomEnd}
          windows={dateWindows}
        />
      </div>

      {/* ── TOP INSIGHTS: BEST MEMBERS (ZOOM-FIRST) ── */}
      <div style={card}>
        <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#0f172a' }}>Best Member Source Insights (Zoom-First)</h3>
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
          Starts from actual Zoom attendance (Tuesday + Thursday), then matches to HubSpot to identify where the best members came from.
          Good member = 3+ Zoom attendances and revenue ≥ $250k.
        </p>

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
          </div>
          <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Paid Meta Good Members</p>
            <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmt.int(zoomSourceModule.current.paidMeta.goodRepeatMembers || 0)}</p>
          </div>
          <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Tuesday Meta Share (Matched)</p>
            <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtMaybePct(zoomSourceModule.current.tuesdayAssumptionTest.paidMetaShareOfMatchedTuesday)}</p>
          </div>
          <div style={{ ...subCard, borderLeft: '4px solid #0f766e' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Zoom Attribution Match Rate</p>
            <p style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{fmtMaybePct(zoomSourceModule.current.matchRate)}</p>
          </div>
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
                        { key: 'matchCandidateCount', label: 'Name Candidates', type: 'number' },
                        { key: 'hubspotName', label: 'HubSpot Name' },
                        { key: 'email', label: 'Email Address' },
                        { key: 'sourceBucket', label: 'Source Bucket' },
                        { key: 'sourceAttributionMethod', label: 'Source Attribution Method' },
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
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '16px', color: '#0f172a', listStyle: 'none' }}>
                Fact Check Drilldown
                <span style={{ marginLeft: '8px', fontWeight: 500, fontSize: '12px', color: '#64748b' }}>
                  Click to expand raw supporting rows
                </span>
              </summary>
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Click KPI numbers above, or choose a metric and window below.</p>
                  <select value={drilldownWindowKey} onChange={(e) => setDrilldownWindowKey(e.target.value)} style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    {Object.entries(analytics.drilldowns.windows || {}).map(([k, w]) => <option key={k} value={k}>{w.label}: {w.startKey} to {w.endKey}</option>)}
                  </select>
                </div>
                <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {drilldownQuickMetrics.map((k) => (
                    <button key={k} onClick={() => setDrilldownMetricKey(k)} style={{ border: '1px solid #cbd5e1', backgroundColor: drilldownMetricKey === k ? '#0f766e' : '#f8fafc', color: drilldownMetricKey === k ? '#fff' : '#334155', borderRadius: '999px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      {analytics.drilldowns.metricLabels?.[k] || k}
                    </button>
                  ))}
                </div>
                {activeDrilldownWindow && activeDrilldownTable ? (
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
            </details>
          </div>
        </>
      )}

      {/* ── AI Insights Panel ── */}
      <AIInsightsPanel supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} groupedData={groupedData} />

      {/* ── Drill-down Modal ── */}
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
