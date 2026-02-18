import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { AlertTriangle, Globe, RefreshCcw, Search, Target, TrendingUp } from 'lucide-react';

const GA_METRICS = [
  'GA Sessions',
  'GA Users',
  'GA Pageviews',
  'GA Engaged Sessions',
  'GA Engagement Rate',
  'GA Sessions - Organic',
  'GA Sessions - Paid',
  'GA Sessions - Direct',
  'GA Sessions - Referral',
  'GA Sessions - Email',
  'GA Sessions - Social',
  'GA Sessions - Other',
  'GA Organic Sessions by Source',
];

const GSC_METRICS = [
  'GSC Clicks',
  'GSC Impressions',
  'GSC CTR',
  'GSC Avg Position',
  'GSC Keyword Clicks',
  'GSC Keyword Impressions',
  'GSC Keyword CTR',
  'GSC Keyword Position',
];

const CHANNEL_COLORS = {
  Organic: '#0ea5e9',
  Paid: '#f97316',
  Direct: '#64748b',
  Referral: '#22c55e',
  Email: '#8b5cf6',
  Social: '#2563eb',
  Other: '#94a3b8',
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(value) {
  return `${(toNumber(value) * 100).toFixed(1)}%`;
}

function formatInt(value) {
  return Math.round(toNumber(value)).toLocaleString();
}

function inLastDays(metricDate, endDate, days) {
  const date = new Date(`${metricDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  const start = new Date(endDate);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return date >= start && date <= endDate;
}

function buildTrafficPlan(signals) {
  if (!signals) return [];

  return [
    {
      id: 'auto-weekly-opportunities',
      owner: 'Autonomous',
      title: 'Weekly keyword opportunity digest',
      detail: `${signals.lowCtrCount} low-CTR and ${signals.pageTwoCount} page-two keywords flagged for action.`,
      proceed: true,
    },
    {
      id: 'auto-channel-alerting',
      owner: 'Autonomous',
      title: 'Channel mix anomaly alerts',
      detail: `Alert if paid share shifts by more than 10 points week-over-week (current ${pct(signals.paidShare)}).`,
      proceed: true,
    },
    {
      id: 'auto-source-watch',
      owner: 'Autonomous',
      title: 'Organic source concentration monitor',
      detail: `Track dependence on ${signals.topSourceName || 'top source'} and trigger if source share exceeds 60%.`,
      proceed: signals.topSourceShare > 0.5,
    },
    {
      id: 'human-serp-copy',
      owner: 'Human',
      title: 'Rewrite titles/meta for low CTR terms',
      detail: 'Update top pages with strong impressions but weak click-through.',
      proceed: signals.lowCtrCount > 0,
    },
    {
      id: 'human-content-briefs',
      owner: 'Human',
      title: 'Build content briefs for page-two terms',
      detail: 'Prioritize terms with high impressions and positions between 8 and 20.',
      proceed: signals.pageTwoCount > 0,
    },
    {
      id: 'human-paid-budget',
      owner: 'Human',
      title: 'Review paid budget allocation',
      detail: `Balance spend vs organic lift using current paid share ${pct(signals.paidShare)}.`,
      proceed: signals.paidShare > 0.35,
    },
  ];
}

const cardStyle = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

export default function WebsiteTrafficDashboard() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncSummary, setSyncSummary] = useState('');
  const [rows, setRows] = useState([]);
  const [planState, setPlanState] = useState({});

  useEffect(() => {
    loadData(true);
  }, []);

  async function runTrafficSync() {
    setSyncing(true);
    setSyncSummary('');

    const [gaSync, gscSync] = await Promise.allSettled([
      supabase.functions.invoke('sync_google_analytics', { method: 'POST' }),
      supabase.functions.invoke('sync_search_console', { method: 'POST' }),
    ]);

    setSyncing(false);

    const errors = [];
    const summaries = [];

    if (gaSync.status === 'fulfilled') {
      if (gaSync.value.error) {
        errors.push(`Google Analytics: ${gaSync.value.error.message}`);
      } else if (gaSync.value.data?.ok === false) {
        errors.push(`Google Analytics: ${gaSync.value.data.error || 'sync failed'}`);
      } else {
        const written = Number(gaSync.value.data?.metric_rows_written || 0);
        summaries.push(`GA rows written ${written}`);
      }
    } else {
      errors.push(`Google Analytics: ${gaSync.reason?.message || 'sync failed'}`);
    }

    if (gscSync.status === 'fulfilled') {
      if (gscSync.value.error) {
        errors.push(`Search Console: ${gscSync.value.error.message}`);
      } else if (gscSync.value.data?.ok === false) {
        errors.push(`Search Console: ${gscSync.value.data.error || 'sync failed'}`);
      } else {
        const written = Number(gscSync.value.data?.metric_rows_written || 0);
        summaries.push(`GSC rows written ${written}`);
      }
    } else {
      errors.push(`Search Console: ${gscSync.reason?.message || 'sync failed'}`);
    }

    if (errors.length > 0) {
      throw new Error(errors.join(' | '));
    }

    setSyncSummary(`Traffic sync complete. ${summaries.join(' | ')}`);
  }

  async function loadData(autoSyncIfEmpty = false) {
    setLoading(true);
    setError('');

    let { data, error: fetchError } = await supabase
      .from('kpi_metrics')
      .select('source_slug, metric_name, metric_value, metric_date, metadata')
      .in('source_slug', ['google_analytics', 'google_search_console'])
      .in('metric_name', [...GA_METRICS, ...GSC_METRICS])
      .order('metric_date', { ascending: true });

    if (fetchError) {
      setError(fetchError.message || 'Failed loading website traffic.');
      setLoading(false);
      return;
    }

    if ((data || []).length === 0 && autoSyncIfEmpty) {
      try {
        await runTrafficSync();
      } catch (syncErr) {
        setError(syncErr.message || 'Failed syncing website traffic.');
        setLoading(false);
        return;
      }

      const retry = await supabase
        .from('kpi_metrics')
        .select('source_slug, metric_name, metric_value, metric_date, metadata')
        .in('source_slug', ['google_analytics', 'google_search_console'])
        .in('metric_name', [...GA_METRICS, ...GSC_METRICS])
        .order('metric_date', { ascending: true });

      data = retry.data || [];
      fetchError = retry.error;
      if (fetchError) {
        setError(fetchError.message || 'Failed loading website traffic after sync.');
        setLoading(false);
        return;
      }
    }

    setRows(data || []);
    setLoading(false);
  }

  const analytics = useMemo(() => {
    const gaRows = rows.filter((r) => r.source_slug === 'google_analytics');
    const gscRows = rows.filter((r) => r.source_slug === 'google_search_console');

    const byDate = new Map();
    gaRows.forEach((r) => {
      if (!byDate.has(r.metric_date)) {
        byDate.set(r.metric_date, {
          date: r.metric_date,
          sessions: 0,
          users: 0,
          pageviews: 0,
          engaged: 0,
          engagementRate: 0,
          organic: 0,
          paid: 0,
          direct: 0,
          referral: 0,
          email: 0,
          social: 0,
          other: 0,
          clicks: 0,
        });
      }
      const day = byDate.get(r.metric_date);
      const value = toNumber(r.metric_value);

      if (r.metric_name === 'GA Sessions') day.sessions = value;
      if (r.metric_name === 'GA Users') day.users = value;
      if (r.metric_name === 'GA Pageviews') day.pageviews = value;
      if (r.metric_name === 'GA Engaged Sessions') day.engaged = value;
      if (r.metric_name === 'GA Engagement Rate') day.engagementRate = value;
      if (r.metric_name === 'GA Sessions - Organic') day.organic = value;
      if (r.metric_name === 'GA Sessions - Paid') day.paid = value;
      if (r.metric_name === 'GA Sessions - Direct') day.direct = value;
      if (r.metric_name === 'GA Sessions - Referral') day.referral = value;
      if (r.metric_name === 'GA Sessions - Email') day.email = value;
      if (r.metric_name === 'GA Sessions - Social') day.social = value;
      if (r.metric_name === 'GA Sessions - Other') day.other = value;
    });

    gscRows.forEach((r) => {
      if (r.metric_name !== 'GSC Clicks') return;
      if (!byDate.has(r.metric_date)) {
        byDate.set(r.metric_date, {
          date: r.metric_date,
          sessions: 0,
          users: 0,
          pageviews: 0,
          engaged: 0,
          engagementRate: 0,
          organic: 0,
          paid: 0,
          direct: 0,
          referral: 0,
          email: 0,
          social: 0,
          other: 0,
          clicks: 0,
        });
      }
      byDate.get(r.metric_date).clicks = toNumber(r.metric_value);
    });

    const chartData = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const latest = chartData[chartData.length - 1] || {
      sessions: 0,
      users: 0,
      pageviews: 0,
      engagementRate: 0,
      organic: 0,
      paid: 0,
    };
    const endDate = chartData.length > 0
      ? new Date(`${chartData[chartData.length - 1].date}T00:00:00.000Z`)
      : new Date();

    const last7 = chartData.filter((d) => inLastDays(d.date, endDate, 7));
    const last30 = chartData.filter((d) => inLastDays(d.date, endDate, 30));

    const sessions7d = last7.reduce((acc, d) => acc + d.sessions, 0);
    const users7d = last7.reduce((acc, d) => acc + d.users, 0);
    const sessions30d = last30.reduce((acc, d) => acc + d.sessions, 0);

    const channelTotals30 = last30.reduce(
      (acc, d) => {
        acc.organic += d.organic;
        acc.paid += d.paid;
        acc.direct += d.direct;
        acc.referral += d.referral;
        acc.email += d.email;
        acc.social += d.social;
        acc.other += d.other;
        return acc;
      },
      { organic: 0, paid: 0, direct: 0, referral: 0, email: 0, social: 0, other: 0 },
    );

    const trackedSessions30 =
      channelTotals30.organic +
      channelTotals30.paid +
      channelTotals30.direct +
      channelTotals30.referral +
      channelTotals30.email +
      channelTotals30.social +
      channelTotals30.other;
    const paidShare = trackedSessions30 > 0 ? channelTotals30.paid / trackedSessions30 : 0;

    const organicSourceMap = new Map();
    gaRows
      .filter((r) => r.metric_name === 'GA Organic Sessions by Source' && inLastDays(r.metric_date, endDate, 30))
      .forEach((r) => {
        const sourceName = String(r.metadata?.source_name || '(unknown)');
        organicSourceMap.set(sourceName, (organicSourceMap.get(sourceName) || 0) + toNumber(r.metric_value));
      });

    const organicSources = Array.from(organicSourceMap.entries())
      .map(([source, sessions]) => ({ source, sessions }))
      .sort((a, b) => b.sessions - a.sessions);
    const topSource = organicSources[0] || { source: 'N/A', sessions: 0 };
    const topSourceShare = channelTotals30.organic > 0 ? topSource.sessions / channelTotals30.organic : 0;

    const keywordRows = gscRows.filter((r) => r.metric_name.startsWith('GSC Keyword '));
    const keywordSnapshotDate = keywordRows.reduce((max, r) => (!max || r.metric_date > max ? r.metric_date : max), null);
    const keywordRowsLatest = keywordRows.filter((r) => r.metric_date === keywordSnapshotDate);

    const keywordMap = new Map();
    keywordRowsLatest.forEach((r) => {
      const query = String(r.metadata?.query || '').trim();
      const page = String(r.metadata?.page || '').trim();
      if (!query) return;
      const key = `${query}||${page}`;
      if (!keywordMap.has(key)) {
        keywordMap.set(key, {
          query,
          page,
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0,
        });
      }
      const row = keywordMap.get(key);
      const value = toNumber(r.metric_value);
      if (r.metric_name === 'GSC Keyword Clicks') row.clicks = value;
      if (r.metric_name === 'GSC Keyword Impressions') row.impressions = value;
      if (r.metric_name === 'GSC Keyword CTR') row.ctr = value;
      if (r.metric_name === 'GSC Keyword Position') row.position = value;
    });

    const keywords = Array.from(keywordMap.values())
      .filter((k) => k.impressions > 0)
      .sort((a, b) => b.clicks - a.clicks);

    const lowCtr = keywords
      .filter((k) => k.impressions >= 100 && k.ctr > 0 && k.ctr < 0.03)
      .map((k) => ({
        ...k,
        type: 'Low CTR',
        score: k.impressions * (0.03 - k.ctr),
        action: 'Rewrite title/meta and improve search snippet intent match.',
      }));

    const pageTwo = keywords
      .filter((k) => k.impressions >= 80 && k.position >= 8 && k.position <= 20)
      .map((k) => ({
        ...k,
        type: 'Page 2 Potential',
        score: k.impressions / Math.max(k.position, 1),
        action: 'Refresh on-page copy, internal links, and supporting FAQ blocks.',
      }));

    const quickWins = keywords
      .filter((k) => k.impressions >= 80 && k.position <= 8 && k.ctr >= 0.05)
      .map((k) => ({
        ...k,
        type: 'Scale Winner',
        score: k.clicks,
        action: 'Create adjacent content and link clusters around this query.',
      }));

    const opportunities = [...lowCtr, ...pageTwo, ...quickWins]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const trafficTrend = chartData.slice(-45).map((d) => ({
      ...d,
      label: d.date.slice(5),
    }));

    const channelPie = [
      { name: 'Organic', value: channelTotals30.organic, color: CHANNEL_COLORS.Organic },
      { name: 'Paid', value: channelTotals30.paid, color: CHANNEL_COLORS.Paid },
      { name: 'Direct', value: channelTotals30.direct, color: CHANNEL_COLORS.Direct },
      { name: 'Referral', value: channelTotals30.referral, color: CHANNEL_COLORS.Referral },
      { name: 'Email', value: channelTotals30.email, color: CHANNEL_COLORS.Email },
      { name: 'Social', value: channelTotals30.social, color: CHANNEL_COLORS.Social },
      { name: 'Other', value: channelTotals30.other, color: CHANNEL_COLORS.Other },
    ].filter((d) => d.value > 0);

    const planSignals = {
      paidShare,
      lowCtrCount: lowCtr.length,
      pageTwoCount: pageTwo.length,
      topSourceName: topSource.source,
      topSourceShare,
    };

    return {
      chartData,
      latest,
      sessions7d,
      users7d,
      sessions30d,
      channelTotals30,
      paidShare,
      organicSources: organicSources.slice(0, 8),
      topSource,
      topSourceShare,
      keywords: keywords.slice(0, 12),
      opportunities,
      keywordSnapshotDate,
      trafficTrend,
      channelPie,
      planSignals,
    };
  }, [rows]);

  const planItems = useMemo(() => buildTrafficPlan(analytics.planSignals), [analytics.planSignals]);

  useEffect(() => {
    const nextState = {};
    planItems.forEach((item) => {
      nextState[item.id] = planState[item.id] ?? item.proceed;
    });
    setPlanState(nextState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planItems.length]);

  const autonomousTasks = planItems.filter((item) => item.owner === 'Autonomous');
  const humanTasks = planItems.filter((item) => item.owner === 'Human');
  const selectedCount = Object.values(planState).filter(Boolean).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Loading website traffic analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, color: '#b91c1c' }}>
        <p style={{ fontWeight: 700 }}>Website traffic load failed</p>
        <p style={{ marginTop: '8px' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        style={{
          ...cardStyle,
          background: 'linear-gradient(125deg, #0f766e 0%, #155e75 38%, #1e3a8a 100%)',
          color: 'white',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div>
          <p style={{ fontSize: '13px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.08em' }}>GA4 + Search Console</p>
          <h2 style={{ fontSize: '30px', lineHeight: 1.1, marginTop: '6px' }}>Website Traffic Intelligence</h2>
          <p style={{ marginTop: '8px', opacity: 0.92 }}>
            Keyword performance, paid vs organic split, and where organic traffic is coming from.
          </p>
          {syncSummary && <p style={{ marginTop: '8px', opacity: 0.9, fontSize: '13px' }}>{syncSummary}</p>}
        </div>
        <button
          onClick={async () => {
            try {
              await runTrafficSync();
              await loadData(false);
            } catch (err) {
              setError(err.message || 'Traffic sync failed.');
            }
          }}
          disabled={syncing}
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.15)',
            color: 'white',
            borderRadius: '10px',
            padding: '10px 14px',
            border: '1px solid rgba(255,255,255,0.3)',
            fontWeight: 600,
            opacity: syncing ? 0.75 : 1,
          }}
        >
          <RefreshCcw size={16} />
          {syncing ? 'Syncing Traffic...' : 'Sync Traffic Data'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Sessions (7d)</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px' }}>{formatInt(analytics.sessions7d)}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Users (7d) {formatInt(analytics.users7d)}</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Organic Sessions (30d)</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', color: '#0ea5e9' }}>
            {formatInt(analytics.channelTotals30.organic)}
          </p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Out of {formatInt(analytics.sessions30d)} total sessions
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Paid Sessions (30d)</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', color: '#f97316' }}>
            {formatInt(analytics.channelTotals30.paid)}
          </p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Paid share {pct(analytics.paidShare)}
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Top Organic Source</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px' }}>{analytics.topSource.source}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {formatInt(analytics.topSource.sessions)} sessions ({pct(analytics.topSourceShare)})
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Keyword Opportunities</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', color: '#1d4ed8' }}>{analytics.opportunities.length}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Snapshot {analytics.keywordSnapshotDate || 'N/A'}
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Latest Engagement Rate</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', color: '#0f766e' }}>{pct(analytics.latest.engagementRate)}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Latest day sessions {formatInt(analytics.latest.sessions)}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <TrendingUp size={17} color="#0f766e" />
            <h3 style={{ fontSize: '18px' }}>Traffic Trend (45 Days)</h3>
          </div>
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.trafficTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sessions" stroke="#0f766e" strokeWidth={3} dot={false} name="GA Sessions" />
                <Line type="monotone" dataKey="organic" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Organic Sessions" />
                <Line type="monotone" dataKey="paid" stroke="#f97316" strokeWidth={2} dot={false} name="Paid Sessions" />
                <Line type="monotone" dataKey="clicks" stroke="#1d4ed8" strokeWidth={2} dot={false} name="GSC Clicks" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Target size={17} color="#2563eb" />
            <h3 style={{ fontSize: '18px' }}>Channel Mix (30d)</h3>
          </div>
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analytics.channelPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={92}>
                  {analytics.channelPie.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatInt(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Globe size={17} color="#0ea5e9" />
            <h3 style={{ fontSize: '18px' }}>Where Organic Traffic Comes From (30d)</h3>
          </div>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.organicSources}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="source" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip formatter={(value) => formatInt(value)} />
                <Bar dataKey="sessions" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ ...cardStyle, borderLeft: '4px solid #2563eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={17} color="#1d4ed8" />
            <h3 style={{ fontSize: '18px' }}>Keyword Opportunities</h3>
          </div>
          <div style={{ marginTop: '12px', display: 'grid', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
            {analytics.opportunities.map((op) => (
              <div
                key={`${op.type}-${op.query}-${op.page}`}
                style={{
                  border: '1px solid #dbeafe',
                  backgroundColor: '#f8fbff',
                  borderRadius: '10px',
                  padding: '10px',
                }}
              >
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>{op.type}</p>
                <p style={{ marginTop: '4px', fontWeight: 700 }}>{op.query}</p>
                <p style={{ marginTop: '3px', fontSize: '12px', color: '#475569' }}>
                  Clicks {formatInt(op.clicks)} | Impr {formatInt(op.impressions)} | CTR {pct(op.ctr)} | Pos {op.position.toFixed(1)}
                </p>
                <p style={{ marginTop: '5px', fontSize: '12px', color: '#334155' }}>{op.action}</p>
              </div>
            ))}
            {analytics.opportunities.length === 0 && (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                No opportunities detected yet. Sync Search Console keyword data first.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Top Keywords Snapshot</h3>
        {analytics.keywords.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '10px' }}>
            <AlertTriangle size={16} />
            Sync Search Console data to populate keyword-level analytics.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Keyword</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Clicks</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Impressions</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>CTR</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Position</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Landing Page</th>
                </tr>
              </thead>
              <tbody>
                {analytics.keywords.map((row) => (
                  <tr key={`${row.query}-${row.page}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontWeight: 600 }}>{row.query}</td>
                    <td style={{ padding: '10px' }}>{formatInt(row.clicks)}</td>
                    <td style={{ padding: '10px' }}>{formatInt(row.impressions)}</td>
                    <td style={{ padding: '10px' }}>{pct(row.ctr)}</td>
                    <td style={{ padding: '10px' }}>{row.position.toFixed(1)}</td>
                    <td style={{ padding: '10px', color: '#475569' }}>{row.page || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ fontSize: '20px' }}>Traffic Improvement Plan</h3>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '999px',
              backgroundColor: '#eff6ff',
              color: '#1e3a8a',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {selectedCount}/{planItems.length} marked proceed
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[{ title: 'Autonomous', items: autonomousTasks }, { title: 'Human', items: humanTasks }].map((group) => (
            <div key={group.title} style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px' }}>
              <h4 style={{ fontSize: '16px', marginBottom: '8px' }}>{group.title}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.items.map((item) => (
                  <label
                    key={item.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      borderRadius: '10px',
                      padding: '10px',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      alignItems: 'start',
                      gap: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700 }}>{item.title}</p>
                      <p style={{ marginTop: '4px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>{item.detail}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={!!planState[item.id]}
                        onChange={(e) => setPlanState((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>Proceed</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
