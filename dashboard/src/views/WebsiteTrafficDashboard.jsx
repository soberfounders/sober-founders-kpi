import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import {
  AlertTriangle,
  Bot,
  Globe,
  RefreshCcw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';

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
  Organic: 'var(--color-dark-green)',
  Paid: 'var(--color-orange)',
  Direct: '#60a5fa',
  Referral: '#34d399',
  Email: '#a78bfa',
  Social: '#38bdf8',
  Other: 'var(--color-text-muted)',
};

const cardStyle = {
  background: 'var(--color-card)',
  backdropFilter: 'blur(16px)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: 'var(--glass-shadow)',
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatInt(value) {
  return Math.round(toNumber(value)).toLocaleString();
}

function formatPct(value, digits = 1) {
  return `${(toNumber(value) * 100).toFixed(digits)}%`;
}

function formatChangePct(current, previous) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function inLastDays(metricDate, endDate, days) {
  const date = new Date(`${metricDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  const start = new Date(endDate);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return date >= start && date <= endDate;
}

function normalizePersonKey(row) {
  const hubspotId = Number(row?.hubspot_contact_id ?? row?.contact_id ?? row?.hs_object_id);
  const email = String(row?.email || row?.hubspot_email || '').trim().toLowerCase();
  const name = String(row?.attendee_name || row?.name || '').trim().toLowerCase().replace(/\s+/g, ' ');

  if (Number.isFinite(hubspotId) && hubspotId > 0) return `hs:${hubspotId}`;
  if (email) return `email:${email}`;
  if (name) return `name:${name}`;
  return '';
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function summaryTone(pctChange) {
  if (pctChange == null) return 'flat';
  if (pctChange > 5) return 'up';
  if (pctChange < -5) return 'down';
  return 'flat';
}

export default function WebsiteTrafficDashboard() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncSummary, setSyncSummary] = useState('');
  const [rows, setRows] = useState([]);
  const [seoOppPages, setSeoOppPages] = useState([]);
  const [seoRankingDrops, setSeoRankingDrops] = useState([]);
  const [onlineDiscoveryRows, setOnlineDiscoveryRows] = useState([]);
  const [planState, setPlanState] = useState({});

  const runTrafficSync = useCallback(async () => {
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
        summaries.push(`GA rows written ${Number(gaSync.value.data?.metric_rows_written || 0)}`);
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
        summaries.push(`GSC rows written ${Number(gscSync.value.data?.metric_rows_written || 0)}`);
      }
    } else {
      errors.push(`Search Console: ${gscSync.reason?.message || 'sync failed'}`);
    }

    if (errors.length > 0) {
      throw new Error(errors.join(' | '));
    }

    setSyncSummary(`Traffic sync complete. ${summaries.join(' | ')}`);
  }, []);

  const loadData = useCallback(async (autoSyncIfEmpty = false) => {
    setLoading(true);
    setError('');

    try {
      let trafficQuery = await supabase
        .from('kpi_metrics')
        .select('source_slug, metric_name, metric_value, metric_date, metadata')
        .in('source_slug', ['google_analytics', 'google_search_console'])
        .in('metric_name', [...GA_METRICS, ...GSC_METRICS])
        .order('metric_date', { ascending: true });

      if (trafficQuery.error) {
        throw new Error(trafficQuery.error.message || 'Failed loading website traffic.');
      }

      if ((trafficQuery.data || []).length === 0 && autoSyncIfEmpty) {
        await runTrafficSync();
        trafficQuery = await supabase
          .from('kpi_metrics')
          .select('source_slug, metric_name, metric_value, metric_date, metadata')
          .in('source_slug', ['google_analytics', 'google_search_console'])
          .in('metric_name', [...GA_METRICS, ...GSC_METRICS])
          .order('metric_date', { ascending: true });

        if (trafficQuery.error) {
          throw new Error(trafficQuery.error.message || 'Failed loading website traffic after sync.');
        }
      }

      const [oppsQuery, dropsQuery, discoveryQuery] = await Promise.all([
        supabase.from('vw_seo_opportunity_pages').select('*').limit(60),
        supabase.from('vw_seo_ranking_drops').select('*').limit(60),
        supabase.from('vw_seo_organic_zoom_attendees').select('*').limit(500),
      ]);

      if (oppsQuery.error) console.warn('[Online Discovery] vw_seo_opportunity_pages:', oppsQuery.error.message);
      if (dropsQuery.error) console.warn('[Online Discovery] vw_seo_ranking_drops:', dropsQuery.error.message);
      if (discoveryQuery.error) console.warn('[Online Discovery] vw_seo_organic_zoom_attendees:', discoveryQuery.error.message);

      setRows(trafficQuery.data || []);
      setSeoOppPages(oppsQuery.data || []);
      setSeoRankingDrops(dropsQuery.data || []);
      setOnlineDiscoveryRows(discoveryQuery.data || []);
    } catch (loadErr) {
      setError(loadErr.message || 'Failed loading online discovery analytics.');
    } finally {
      setLoading(false);
    }
  }, [runTrafficSync]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const analytics = useMemo(() => {
    const gaRows = rows.filter((r) => r.source_slug === 'google_analytics');
    const gscRows = rows.filter((r) => r.source_slug === 'google_search_console');

    const byDate = new Map();

    const seedDate = (dateKey) => {
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, {
          date: dateKey,
          sessions: 0,
          users: 0,
          pageviews: 0,
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
      return byDate.get(dateKey);
    };

    gaRows.forEach((row) => {
      const day = seedDate(row.metric_date);
      const value = toNumber(row.metric_value);
      if (row.metric_name === 'GA Sessions') day.sessions = value;
      if (row.metric_name === 'GA Users') day.users = value;
      if (row.metric_name === 'GA Pageviews') day.pageviews = value;
      if (row.metric_name === 'GA Engagement Rate') day.engagementRate = value;
      if (row.metric_name === 'GA Sessions - Organic') day.organic = value;
      if (row.metric_name === 'GA Sessions - Paid') day.paid = value;
      if (row.metric_name === 'GA Sessions - Direct') day.direct = value;
      if (row.metric_name === 'GA Sessions - Referral') day.referral = value;
      if (row.metric_name === 'GA Sessions - Email') day.email = value;
      if (row.metric_name === 'GA Sessions - Social') day.social = value;
      if (row.metric_name === 'GA Sessions - Other') day.other = value;
    });

    gscRows.forEach((row) => {
      if (row.metric_name !== 'GSC Clicks') return;
      const day = seedDate(row.metric_date);
      day.clicks = toNumber(row.metric_value);
    });

    const chartData = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const latestDate = chartData[chartData.length - 1]?.date || null;

    const last7 = chartData.slice(-7);
    const prev7 = chartData.slice(-14, -7);
    const last30 = chartData.slice(-30);

    const sessions7d = last7.reduce((acc, d) => acc + d.sessions, 0);
    const users7d = last7.reduce((acc, d) => acc + d.users, 0);
    const sessionsPrev7d = prev7.reduce((acc, d) => acc + d.sessions, 0);
    const organic7d = last7.reduce((acc, d) => acc + d.organic, 0);
    const organicPrev7d = prev7.reduce((acc, d) => acc + d.organic, 0);

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

    const trackedSessions30 = Object.values(channelTotals30).reduce((acc, val) => acc + val, 0);
    const paidShare = trackedSessions30 > 0 ? channelTotals30.paid / trackedSessions30 : 0;
    const organicShare = trackedSessions30 > 0 ? channelTotals30.organic / trackedSessions30 : 0;

    const endDate = chartData.length > 0
      ? new Date(`${chartData[chartData.length - 1].date}T00:00:00.000Z`)
      : new Date();

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
    keywordRowsLatest.forEach((row) => {
      const query = String(row.metadata?.query || '').trim();
      const page = String(row.metadata?.page || '').trim();
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
      const target = keywordMap.get(key);
      const value = toNumber(row.metric_value);
      if (row.metric_name === 'GSC Keyword Clicks') target.clicks = value;
      if (row.metric_name === 'GSC Keyword Impressions') target.impressions = value;
      if (row.metric_name === 'GSC Keyword CTR') target.ctr = value;
      if (row.metric_name === 'GSC Keyword Position') target.position = value;
    });

    const keywords = Array.from(keywordMap.values())
      .filter((k) => k.impressions > 0)
      .sort((a, b) => b.clicks - a.clicks);

    const keywordOpportunities = [
      ...keywords
        .filter((k) => k.impressions >= 120 && k.ctr > 0 && k.ctr < 0.03)
        .map((k) => ({
          ...k,
          type: 'Low CTR',
          score: k.impressions * (0.03 - k.ctr),
          action: 'Rewrite title/meta description and align search intent.',
        })),
      ...keywords
        .filter((k) => k.impressions >= 80 && k.position >= 8 && k.position <= 20)
        .map((k) => ({
          ...k,
          type: 'Page 2 Potential',
          score: k.impressions / Math.max(k.position, 1),
          action: 'Refresh content, add internal links, and improve topical depth.',
        })),
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const impactRank = { high: 3, medium: 2, low: 1 };
    const prioritizedPages = [...seoOppPages]
      .sort((a, b) => {
        const ai = impactRank[String(a?.impact_label || '').toLowerCase()] || 0;
        const bi = impactRank[String(b?.impact_label || '').toLowerCase()] || 0;
        if (bi !== ai) return bi - ai;
        return toNumber(b?.impressions) - toNumber(a?.impressions);
      })
      .slice(0, 6);

    const criticalDrops = seoRankingDrops.filter((row) => String(row?.urgency || '').toLowerCase() === 'critical');
    const warningDrops = seoRankingDrops.filter((row) => String(row?.urgency || '').toLowerCase() === 'warning');

    const peopleByKey = new Map();
    onlineDiscoveryRows.forEach((row) => {
      const personKey = normalizePersonKey(row);
      if (!personKey) return;

      const sessionDate = String(row?.session_date || row?.metric_date || '').trim();
      const meetingName = String(row?.meeting_name || row?.group_name || '').trim();
      const eventKey = `${sessionDate}|${meetingName}`;

      if (!peopleByKey.has(personKey)) {
        peopleByKey.set(personKey, {
          key: personKey,
          name: String(row?.attendee_name || row?.name || 'Not Found').trim() || 'Not Found',
          email: String(row?.email || row?.hubspot_email || '').trim(),
          source: String(row?.traffic_source_label || row?.traffic_source || 'Organic Search').trim(),
          totalEventsAttended: 0,
          eventKeys: new Set(),
          firstSeen: sessionDate || null,
          lastSeen: sessionDate || null,
        });
      }

      const person = peopleByKey.get(personKey);
      if (eventKey !== '|' && !person.eventKeys.has(eventKey)) {
        person.eventKeys.add(eventKey);
        person.totalEventsAttended += 1;
      }

      if (sessionDate) {
        if (!person.firstSeen || sessionDate < person.firstSeen) person.firstSeen = sessionDate;
        if (!person.lastSeen || sessionDate > person.lastSeen) person.lastSeen = sessionDate;
      }

      if (!person.email && row?.email) person.email = String(row.email).trim();
      if ((person.name === 'Not Found' || !person.name) && row?.attendee_name) person.name = String(row.attendee_name).trim();
    });

    const onlineDiscoveryPeople = Array.from(peopleByKey.values())
      .map((person) => ({
        ...person,
        eventKeys: undefined,
      }))
      .sort((a, b) => {
        if (b.totalEventsAttended !== a.totalEventsAttended) return b.totalEventsAttended - a.totalEventsAttended;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

    const summaryBullets = [];
    const trafficTrend = summaryTone(formatChangePct(sessions7d, sessionsPrev7d));
    if (trafficTrend === 'up') {
      summaryBullets.push(`Website sessions increased to ${formatInt(sessions7d)} over the last 7 days.`);
    } else if (trafficTrend === 'down') {
      summaryBullets.push(`Website sessions are down to ${formatInt(sessions7d)} over the last 7 days and need attention.`);
    } else {
      summaryBullets.push(`Website sessions are steady at ${formatInt(sessions7d)} over the last 7 days.`);
    }

    const organicChangePct = formatChangePct(organic7d, organicPrev7d);
    if (organicChangePct != null) {
      summaryBullets.push(`Organic sessions changed ${organicChangePct >= 0 ? '+' : ''}${organicChangePct.toFixed(1)}% week over week.`);
    }

    summaryBullets.push(`Paid share is ${formatPct(paidShare)} and organic share is ${formatPct(organicShare)} across the last 30 days.`);

    if (criticalDrops.length > 0) {
      summaryBullets.push(`${criticalDrops.length} critical ranking drop${criticalDrops.length === 1 ? '' : 's'} need immediate SEO fixes.`);
    }
    if (keywordOpportunities.length > 0) {
      summaryBullets.push(`${keywordOpportunities.length} keyword opportunities are ready for title/meta and content refreshes.`);
    }
    if (prioritizedPages.length > 0) {
      summaryBullets.push(`${prioritizedPages.length} page-level SEO quick wins are flagged for immediate updates.`);
    }

    if (onlineDiscoveryPeople.length > 0) {
      const mostActive = onlineDiscoveryPeople[0];
      summaryBullets.push(
        `${onlineDiscoveryPeople.length} unique people have joined after finding you online. Top attendee: ${mostActive.name} (${mostActive.totalEventsAttended} events).`,
      );
    }

    const channelPie = [
      { name: 'Organic', value: channelTotals30.organic, color: CHANNEL_COLORS.Organic },
      { name: 'Paid', value: channelTotals30.paid, color: CHANNEL_COLORS.Paid },
      { name: 'Direct', value: channelTotals30.direct, color: CHANNEL_COLORS.Direct },
      { name: 'Referral', value: channelTotals30.referral, color: CHANNEL_COLORS.Referral },
      { name: 'Email', value: channelTotals30.email, color: CHANNEL_COLORS.Email },
      { name: 'Social', value: channelTotals30.social, color: CHANNEL_COLORS.Social },
      { name: 'Other', value: channelTotals30.other, color: CHANNEL_COLORS.Other },
    ].filter((entry) => entry.value > 0);

    const trafficTrendData = chartData.slice(-45).map((d) => ({
      ...d,
      label: d.date.slice(5),
    }));

    return {
      latestDate,
      sessions7d,
      users7d,
      paidShare,
      organicShare,
      channelTotals30,
      channelPie,
      topSource,
      topSourceShare,
      organicSources: organicSources.slice(0, 8),
      trafficTrendData,
      keywordSnapshotDate,
      keywordOpportunities,
      prioritizedPages,
      criticalDrops,
      warningDrops,
      onlineDiscoveryPeople,
      summaryBullets,
    };
  }, [onlineDiscoveryRows, rows, seoOppPages, seoRankingDrops]);

  const actionPlan = useMemo(() => {
    const items = [
      {
        id: 'seo-critical-drop-remediation',
        owner: 'Human',
        title: 'Resolve critical ranking drops',
        detail: `${analytics.criticalDrops.length} critical issue${analytics.criticalDrops.length === 1 ? '' : 's'} flagged in SEO rankings.`,
        proceed: analytics.criticalDrops.length > 0,
      },
      {
        id: 'seo-low-ctr-rewrite',
        owner: 'Human',
        title: 'Rewrite snippets for low-CTR terms',
        detail: `${analytics.keywordOpportunities.filter((row) => row.type === 'Low CTR').length} keywords with high impressions need better titles/meta.`,
        proceed: analytics.keywordOpportunities.some((row) => row.type === 'Low CTR'),
      },
      {
        id: 'seo-page-two-push',
        owner: 'Human',
        title: 'Push page-two terms into top 5',
        detail: `${analytics.keywordOpportunities.filter((row) => row.type === 'Page 2 Potential').length} terms are close to page one and should be prioritized.`,
        proceed: analytics.keywordOpportunities.some((row) => row.type === 'Page 2 Potential'),
      },
      {
        id: 'auto-weekly-report',
        owner: 'Autonomous',
        title: 'Publish weekly online discovery brief',
        detail: 'Summarize traffic trend, SEO risks, and attendance conversion in a single report.',
        proceed: true,
      },
      {
        id: 'auto-anomaly-alerts',
        owner: 'Autonomous',
        title: 'Trigger channel anomaly alerts',
        detail: `Alert if paid share moves by >10 points from current ${formatPct(analytics.paidShare)} baseline.`,
        proceed: true,
      },
      {
        id: 'auto-source-watch',
        owner: 'Autonomous',
        title: 'Monitor organic source concentration',
        detail: `${analytics.topSource.source || 'Top source'} currently contributes ${formatPct(analytics.topSourceShare)} of organic sessions.`,
        proceed: analytics.topSourceShare > 0.5,
      },
    ];
    return items;
  }, [analytics]);

  useEffect(() => {
    const next = {};
    actionPlan.forEach((item) => {
      next[item.id] = planState[item.id] ?? item.proceed;
    });
    setPlanState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionPlan.length]);

  const selectedCount = Object.values(planState).filter(Boolean).length;
  const autonomousTasks = actionPlan.filter((item) => item.owner === 'Autonomous');
  const humanTasks = actionPlan.filter((item) => item.owner === 'Human');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Loading online discovery analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, color: '#fca5a5' }}>
        <p style={{ fontWeight: 700 }}>Online discovery load failed</p>
        <p style={{ marginTop: '8px', color: 'var(--color-text-secondary)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        style={{
          ...cardStyle,
          background: 'linear-gradient(125deg, #0f766e 0%, #155e75 36%, #1e3a8a 100%)',
          color: 'white',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p style={{ fontSize: '13px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.08em' }}>GA4 + Search Console + SEO</p>
          <h2 style={{ fontSize: '30px', lineHeight: 1.1, marginTop: '6px' }}>Online Discovery Intelligence</h2>
          <p style={{ marginTop: '8px', opacity: 0.92 }}>
            Combined Website Traffic and SEO overview with online-to-attendance conversion tracking.
          </p>
          <p style={{ marginTop: '6px', opacity: 0.9, fontSize: '12px' }}>
            Data as of {analytics.latestDate ? formatDate(analytics.latestDate) : 'Unavailable'}
          </p>
          {syncSummary && <p style={{ marginTop: '8px', opacity: 0.9, fontSize: '13px' }}>{syncSummary}</p>}
        </div>

        <button
          onClick={async () => {
            try {
              await runTrafficSync();
              await loadData(false);
            } catch (syncErr) {
              setError(syncErr.message || 'Traffic sync failed.');
            }
          }}
          disabled={syncing}
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.12)',
            color: 'white',
            borderRadius: '10px',
            padding: '10px 14px',
            border: '1px solid rgba(255,255,255,0.25)',
            fontWeight: 600,
            opacity: syncing ? 0.75 : 1,
          }}
        >
          <RefreshCcw size={16} />
          {syncing ? 'Syncing...' : 'Sync Discovery Data'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Sessions (7d)</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px' }}>{formatInt(analytics.sessions7d)}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Users (7d) {formatInt(analytics.users7d)}</p>
        </div>

        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Organic Sessions (30d)</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', color: 'var(--color-dark-green)' }}>
            {formatInt(analytics.channelTotals30.organic)}
          </p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Organic share {formatPct(analytics.organicShare)}</p>
        </div>

        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Paid Sessions (30d)</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', color: 'var(--color-orange)' }}>
            {formatInt(analytics.channelTotals30.paid)}
          </p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Paid share {formatPct(analytics.paidShare)}</p>
        </div>

        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Top Organic Source</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px' }}>{analytics.topSource.source}</p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {formatInt(analytics.topSource.sessions)} sessions ({formatPct(analytics.topSourceShare)})
          </p>
        </div>

        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>SEO Priority Alerts</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', color: analytics.criticalDrops.length > 0 ? '#f87171' : 'var(--color-dark-green)' }}>
            {analytics.criticalDrops.length}
          </p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Critical drops, {analytics.warningDrops.length} warnings
          </p>
        </div>

        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Online Discovery Members</p>
          <p style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', color: '#93c5fd' }}>
            {analytics.onlineDiscoveryPeople.length}
          </p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Unique attendees from online discovery</p>
        </div>
      </div>

      <div style={{ ...cardStyle, borderLeft: '4px solid var(--color-dark-green)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Sparkles size={17} color="var(--color-dark-green)" />
          <h3 style={{ fontSize: '18px' }}>Executive Summary</h3>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {analytics.summaryBullets.map((line) => (
            <p key={line} style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>• {line}</p>
          ))}
          {analytics.summaryBullets.length === 0 && (
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>No summary available yet. Sync discovery data to generate insights.</p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <TrendingUp size={17} color="var(--color-dark-green)" />
            <h3 style={{ fontSize: '18px' }}>Traffic Trend (45 Days)</h3>
          </div>
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.trafficTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '10px' }}
                  labelStyle={{ color: 'var(--color-text-primary)' }}
                  itemStyle={{ color: 'var(--color-text-primary)' }}
                />
                <Legend wrapperStyle={{ color: 'var(--color-text-primary)' }} />
                <Line type="monotone" dataKey="sessions" stroke="var(--color-dark-green)" strokeWidth={3} dot={false} name="GA Sessions" />
                <Line type="monotone" dataKey="organic" stroke="#38bdf8" strokeWidth={2} dot={false} name="Organic" />
                <Line type="monotone" dataKey="paid" stroke="var(--color-orange)" strokeWidth={2} dot={false} name="Paid" />
                <Line type="monotone" dataKey="clicks" stroke="#a78bfa" strokeWidth={2} dot={false} name="GSC Clicks" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Target size={17} color="#93c5fd" />
            <h3 style={{ fontSize: '18px' }}>Channel Mix (30d)</h3>
          </div>
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analytics.channelPie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88}>
                  {analytics.channelPie.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatInt(value)}
                  contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '10px' }}
                  labelStyle={{ color: 'var(--color-text-primary)' }}
                  itemStyle={{ color: 'var(--color-text-primary)' }}
                />
                <Legend wrapperStyle={{ color: 'var(--color-text-primary)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Globe size={17} color="#93c5fd" />
            <h3 style={{ fontSize: '18px' }}>Top Organic Sources (30d)</h3>
          </div>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.organicSources}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="source" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => formatInt(value)}
                  contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '10px' }}
                  labelStyle={{ color: 'var(--color-text-primary)' }}
                  itemStyle={{ color: 'var(--color-text-primary)' }}
                />
                <Bar dataKey="sessions" fill="#38bdf8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ ...cardStyle, borderLeft: '4px solid #93c5fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={17} color="#93c5fd" />
            <h3 style={{ fontSize: '18px' }}>SEO Priority Queue</h3>
          </div>
          <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Keyword snapshot {analytics.keywordSnapshotDate || 'N/A'} | Page quick wins {analytics.prioritizedPages.length}
          </p>

          <div style={{ marginTop: '12px', display: 'grid', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
            {analytics.keywordOpportunities.map((op) => (
              <div
                key={`${op.type}-${op.query}-${op.page}`}
                style={{
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderRadius: '10px',
                  padding: '10px',
                }}
              >
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase' }}>{op.type}</p>
                <p style={{ marginTop: '4px', fontWeight: 700 }}>{op.query}</p>
                <p style={{ marginTop: '3px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Clicks {formatInt(op.clicks)} | Impr {formatInt(op.impressions)} | CTR {formatPct(op.ctr)} | Pos {op.position.toFixed(1)}
                </p>
                <p style={{ marginTop: '5px', fontSize: '12px', color: 'var(--color-text-primary)' }}>{op.action}</p>
              </div>
            ))}

            {analytics.keywordOpportunities.length === 0 && (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                No keyword opportunities detected yet. Sync Search Console keyword data first.
              </div>
            )}

            {analytics.prioritizedPages.slice(0, 3).map((row, idx) => (
              <div
                key={`page-opportunity-${idx}`}
                style={{
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'rgba(3,218,198,0.08)',
                  borderRadius: '10px',
                  padding: '10px',
                }}
              >
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-dark-green)', textTransform: 'uppercase' }}>
                  Page Quick Win {row?.impact_label ? `(${row.impact_label})` : ''}
                </p>
                <p style={{ marginTop: '4px', fontWeight: 700 }}>{row?.query || 'Untitled Opportunity'}</p>
                <p style={{ marginTop: '3px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {row?.recommended_action || 'Review and optimize this page for better organic performance.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={17} color={analytics.criticalDrops.length > 0 ? '#f87171' : 'var(--color-dark-green)'} />
            <h3 style={{ fontSize: '18px' }}>Urgent SEO Issues</h3>
          </div>
          <span
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              backgroundColor: analytics.criticalDrops.length > 0 ? 'rgba(248,113,113,0.16)' : 'rgba(3,218,198,0.16)',
              color: analytics.criticalDrops.length > 0 ? '#fca5a5' : 'var(--color-dark-green)',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {analytics.criticalDrops.length} critical / {analytics.warningDrops.length} warning
          </span>
        </div>

        {analytics.criticalDrops.length === 0 && analytics.warningDrops.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
            No urgent ranking drops detected from the current SEO data snapshot.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {[...analytics.criticalDrops, ...analytics.warningDrops].slice(0, 8).map((drop, index) => {
              const isCritical = String(drop?.urgency || '').toLowerCase() === 'critical';
              return (
                <div
                  key={`${drop?.query || 'drop'}-${index}`}
                  style={{
                    border: `1px solid ${isCritical ? 'rgba(248,113,113,0.45)' : 'rgba(251,191,36,0.45)'}`,
                    backgroundColor: isCritical ? 'rgba(127,29,29,0.18)' : 'rgba(120,53,15,0.18)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>{drop?.query || 'Unknown Query'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      Rank #{Math.round(toNumber(drop?.avg_position)) || '-'} | Impressions {formatInt(drop?.impressions)}
                    </span>
                  </div>
                  <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {drop?.plain_english_explanation || 'Ranking movement detected and needs review.'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Online Discovery to Group Attendance</h3>
        <p style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          Each person appears once. Total events attended counts all their matched group sessions.
        </p>

        {analytics.onlineDiscoveryPeople.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
            No online-discovery attendance rows found yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
            <table style={{ width: '100%', minWidth: '860px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Discovery Source</th>
                  <th style={{ textAlign: 'right', padding: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Total Events Attended</th>
                  <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>First Seen</th>
                  <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {analytics.onlineDiscoveryPeople.map((person, index) => (
                  <tr
                    key={person.key}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.12)',
                    }}
                  >
                    <td style={{ padding: '10px', fontSize: '13px', fontWeight: 600 }}>{person.name || 'Not Found'}</td>
                    <td style={{ padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{person.email || 'Not Found'}</td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: 'rgba(3,218,198,0.14)',
                          border: '1px solid var(--color-border-glow)',
                          color: 'var(--color-dark-green)',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {person.source || 'Organic Search'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontSize: '13px', fontWeight: 700 }}>{formatInt(person.totalEventsAttended)}</td>
                    <td style={{ padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(person.firstSeen)}</td>
                    <td style={{ padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(person.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={18} color="var(--color-dark-green)" />
            <h3 style={{ fontSize: '20px' }}>Online Discovery Action Plan</h3>
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '999px',
              backgroundColor: 'rgba(3,218,198,0.14)',
              border: '1px solid var(--color-border-glow)',
              color: 'var(--color-dark-green)',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {selectedCount}/{actionPlan.length} marked proceed
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
          {[{ title: 'Autonomous', items: autonomousTasks }, { title: 'Human', items: humanTasks }].map((group) => (
            <div key={group.title} style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px' }}>
              <h4 style={{ fontSize: '16px', marginBottom: '8px' }}>{group.title}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.items.map((item) => (
                  <label
                    key={item.id}
                    style={{
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'rgba(255,255,255,0.03)',
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

