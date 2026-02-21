import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { buildLeadAnalytics } from '../lib/leadAnalytics';
import { buildGroupedLeadsSnapshot, buildDateRangeWindows, computeChangePct } from '../lib/leadsGroupAnalytics';
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

          {/* Fact Check Drilldown */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Fact Check Drilldown</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Click KPI numbers above, or choose a metric and window below.</p>
              </div>
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
