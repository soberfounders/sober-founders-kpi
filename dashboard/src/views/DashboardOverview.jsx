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
  Legend,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Clock3, Globe, Search, Users } from 'lucide-react';

const SOURCE_KEYS = ['zoom', 'google_analytics', 'google_search_console'];

function dateToUtc(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function shiftUtcDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
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

const baseCardStyle = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

const DashboardOverview = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');

    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 210);
    const startDate = start.toISOString().slice(0, 10);

    const { data, error: fetchError } = await supabase
      .from('kpi_metrics')
      .select('metric_name,metric_value,metric_date,source_slug,metadata')
      .in('source_slug', SOURCE_KEYS)
      .gte('metric_date', startDate)
      .order('metric_date', { ascending: true });

    if (fetchError) {
      setError(fetchError.message || 'Failed to load dashboard metrics.');
      setLoading(false);
      return;
    }

    setMetrics(data || []);
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
    const users7d = sumWindow('GA Users', 7);
    const engagement7d = avgWindow('GA Engagement Rate', 7);

    const clicks7d = sumWindow('GSC Clicks', 7);
    const clicksTrend = compareWindow('GSC Clicks', 7, 'sum');
    const impressions7d = sumWindow('GSC Impressions', 7);
    const ctr7d = avgWindow('GSC CTR', 7);
    const position7d = avgWindow('GSC Avg Position', 7);

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
      cards: {
        sessions7d,
        clicks7d,
        engagement7d,
        avgAttendance,
        repeatRate,
        ctr7d,
        impressions7d,
        position7d,
      },
      trends: {
        sessionsTrend,
        clicksTrend,
      },
      trendData,
      priorityRows,
      sourceCoverage,
      hasGscData: (bySource.get('google_search_console') || []).length > 0,
    };
  }, [metrics]);

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
          background: 'linear-gradient(120deg, #0f766e 0%, #155e75 45%, #1e3a8a 100%)',
          border: 'none',
          color: 'white',
        }}
      >
        <p style={{ fontSize: '13px', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Executive Focus</p>
        <h2 style={{ fontSize: '30px', marginTop: '6px' }}>What Matters Most This Week</h2>
        <p style={{ marginTop: '8px', opacity: 0.95 }}>
          Prioritized scorecard across traffic, organic search, engagement quality, and community retention.
        </p>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip />
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
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Search size={16} color="#2563eb" />
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Impressions (7d)</p>
              </div>
              <p style={{ marginTop: '6px', fontSize: '24px', fontWeight: 700 }}>{formatInt(dashboard.cards.impressions7d)}</p>
            </div>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={16} color="#0f766e" />
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Average Position (7d)</p>
              </div>
              <p style={{ marginTop: '6px', fontSize: '24px', fontWeight: 700 }}>
                {dashboard.cards.position7d ? dashboard.cards.position7d.toFixed(1) : 'N/A'}
              </p>
            </div>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="#1d4ed8" />
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
            <div key={source.source} style={{ backgroundColor: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{source.source}</p>
              <p style={{ marginTop: '6px', fontWeight: 700 }}>{source.count} rows</p>
              <p style={{ marginTop: '2px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Latest: {source.latest || 'No data'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardOverview;
