import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  RefreshCw, Loader2, TrendingUp, TrendingDown, Users, Mail,
  ArrowRight, CheckCircle2, XCircle, Clock, BarChart3,
} from 'lucide-react';

/* ── Style constants ── */
const CAMPAIGN_COLORS = {
  no_show_followup: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)', label: 'No-Show Recovery' },
  at_risk_nudge:    { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)', label: 'At-Risk Retention' },
  winback:          { bg: 'rgba(59, 130, 246, 0.15)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.3)', label: 'Winback' },
};

const cardStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '24px',
};

const metricCardStyle = {
  ...cardStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  minWidth: '180px',
};

const labelStyle = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--color-text-secondary)',
  fontWeight: 600,
};

const bigNumberStyle = {
  fontSize: '32px',
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  lineHeight: 1.1,
};

/* ── Conversion bar component ── */
function ConversionBar({ sent, converted, label, color }) {
  const rate = sent > 0 ? ((converted / sent) * 100).toFixed(1) : '0.0';
  const barWidth = sent > 0 ? Math.max((converted / sent) * 100, 2) : 0;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: color.text }}>{label}</span>
        <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          {converted}/{sent} ({rate}%)
        </span>
      </div>
      <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${barWidth}%`,
          borderRadius: '4px',
          background: color.text,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

/* ── Baseline cohort table ── */
function BaselineTable({ data }) {
  if (!data || data.length === 0) {
    return <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>No baseline data yet.</p>;
  }

  const thStyle = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
    borderBottom: '1px solid var(--color-border)',
  };

  const tdStyle = {
    padding: '10px 12px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Cohort Month</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>New Attendees</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Returned 14d</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Returned 30d</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Returned 60d</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Avg Meetings</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 12).map((row, i) => (
            <tr key={i}>
              <td style={tdStyle}>{row.cohort_month?.slice(0, 7)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.cohort_size}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: row.pct_returned_14d >= 30 ? '#34d399' : '#f87171' }}>
                {row.pct_returned_14d}%
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', color: row.pct_returned_30d >= 40 ? '#34d399' : '#fbbf24' }}>
                {row.pct_returned_30d}%
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', color: row.pct_returned_60d >= 50 ? '#34d399' : '#fbbf24' }}>
                {row.pct_returned_60d}%
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.avg_total_meetings}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Recent outreach table ── */
function RecentOutreachTable({ data }) {
  if (!data || data.length === 0) {
    return <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>No outreach sent yet. Campaigns will populate once scheduled cron jobs run.</p>;
  }

  const thStyle = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
    borderBottom: '1px solid var(--color-border)',
  };

  const tdStyle = {
    padding: '10px 12px',
    fontSize: '13px',
    color: 'var(--color-text-primary)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Recipient</th>
            <th style={thStyle}>Campaign</th>
            <th style={thStyle}>Converted</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Days to Return</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const camp = CAMPAIGN_COLORS[row.event_type] || CAMPAIGN_COLORS.no_show_followup;
            return (
              <tr key={i}>
                <td style={tdStyle}>{row.delivered_at?.slice(0, 10)}</td>
                <td style={tdStyle}>{row.attendee_email}</td>
                <td style={tdStyle}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: camp.bg,
                    color: camp.text,
                    border: `1px solid ${camp.border}`,
                  }}>
                    {camp.label}
                  </span>
                </td>
                <td style={tdStyle}>
                  {row.converted
                    ? <CheckCircle2 size={16} color="#34d399" />
                    : <Clock size={16} color="#94a3b8" />
                  }
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {row.converted ? `${row.days_to_return}d` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Main Dashboard ── */
export default function OutreachExperimentDashboard() {
  const [loading, setLoading] = useState(true);
  const [conversions, setConversions] = useState([]);
  const [baseline, setBaseline] = useState([]);
  const [experimentResults, setExperimentResults] = useState([]);
  const [recentOutreach, setRecentOutreach] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [convRes, baseRes, expRes, recentRes] = await Promise.all([
        supabase.from('vw_outreach_conversions').select('*').order('delivered_at', { ascending: false }),
        supabase.from('vw_baseline_retention').select('*').order('cohort_month', { ascending: false }),
        supabase.from('vw_experiment_results').select('*').order('week_cohort', { ascending: false }),
        supabase.from('vw_outreach_conversions').select('*').order('delivered_at', { ascending: false }).limit(50),
      ]);

      setConversions(convRes.data || []);
      setBaseline(baseRes.data || []);
      setExperimentResults(expRes.data || []);
      setRecentOutreach(recentRes.data || []);
    } catch (err) {
      console.error('Outreach dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Compute summary metrics ── */
  const summary = useMemo(() => {
    const byCampaign = {};
    for (const c of conversions) {
      const key = c.event_type || 'unknown';
      if (!byCampaign[key]) byCampaign[key] = { sent: 0, converted: 0, totalDays: 0 };
      byCampaign[key].sent++;
      if (c.converted) {
        byCampaign[key].converted++;
        byCampaign[key].totalDays += (c.days_to_return || 0);
      }
    }

    const totalSent = conversions.length;
    const totalConverted = conversions.filter(c => c.converted).length;
    const overallRate = totalSent > 0 ? ((totalConverted / totalSent) * 100).toFixed(1) : '0.0';

    // Latest baseline averages (last 3 months)
    const recentBaseline = (baseline || []).slice(0, 3);
    const avgRepeat30d = recentBaseline.length > 0
      ? (recentBaseline.reduce((sum, r) => sum + (parseFloat(r.pct_returned_30d) || 0), 0) / recentBaseline.length).toFixed(1)
      : null;

    return { byCampaign, totalSent, totalConverted, overallRate, avgRepeat30d };
  }, [conversions, baseline]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={{ ...labelStyle, color: 'var(--color-dark-green)' }}>Outreach Experiments</p>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
            Attendee Notification Automation
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Measuring whether personal outreach improves retention. 4-week experiment window.
          </p>
        </div>
        <button
          className="btn-glass"
          onClick={fetchData}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px' }}
        >
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {/* Top-level metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div style={metricCardStyle}>
          <span style={labelStyle}>Total Emails Sent</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={20} color="var(--color-dark-green)" />
            <span style={bigNumberStyle}>{summary.totalSent}</span>
          </div>
        </div>

        <div style={metricCardStyle}>
          <span style={labelStyle}>Total Conversions</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={20} color="#34d399" />
            <span style={bigNumberStyle}>{summary.totalConverted}</span>
          </div>
        </div>

        <div style={metricCardStyle}>
          <span style={labelStyle}>Overall Conversion Rate</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} color={parseFloat(summary.overallRate) > 0 ? '#34d399' : '#94a3b8'} />
            <span style={bigNumberStyle}>{summary.overallRate}%</span>
          </div>
        </div>

        <div style={metricCardStyle}>
          <span style={labelStyle}>Baseline 30d Repeat Rate</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={20} color="#fbbf24" />
            <span style={bigNumberStyle}>{summary.avgRepeat30d ?? '—'}%</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Last 3 months avg</span>
        </div>
      </div>

      {/* Conversion rates by campaign */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
          Conversion by Campaign
        </h3>
        {Object.entries(CAMPAIGN_COLORS).map(([key, color]) => {
          const data = summary.byCampaign[key] || { sent: 0, converted: 0 };
          return (
            <ConversionBar
              key={key}
              sent={data.sent}
              converted={data.converted}
              label={color.label}
              color={color}
            />
          );
        })}
        {summary.totalSent === 0 && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '8px' }}>
            No outreach data yet. Results will appear after the first scheduled campaign runs.
          </p>
        )}
      </div>

      {/* Weekly experiment results */}
      {experimentResults.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            Weekly Results
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Week', 'Campaign', 'Sent', 'Converted', 'Rate', 'Avg Days to Return'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px',
                      textAlign: h === 'Week' || h === 'Campaign' ? 'left' : 'right',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--color-border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {experimentResults.map((row, i) => {
                  const camp = CAMPAIGN_COLORS[row.event_type] || CAMPAIGN_COLORS.no_show_followup;
                  return (
                    <tr key={i}>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--color-text-primary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {row.week_cohort?.slice(0, 10)}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                          background: camp.bg, color: camp.text, border: `1px solid ${camp.border}`,
                        }}>{camp.label}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', color: 'var(--color-text-primary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {row.total_sent}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', color: 'var(--color-text-primary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {row.total_converted}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)',
                        color: parseFloat(row.conversion_rate_pct) >= 20 ? '#34d399' : parseFloat(row.conversion_rate_pct) > 0 ? '#fbbf24' : 'var(--color-text-secondary)' }}>
                        {row.conversion_rate_pct}%
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', color: 'var(--color-text-primary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {row.avg_days_to_return ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Baseline retention cohorts */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          Baseline Retention (Before Automation)
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
          Historical repeat rates by monthly cohort. Compare these numbers against campaign conversion rates to measure impact.
        </p>
        <BaselineTable data={baseline} />
      </div>

      {/* Recent outreach log */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          Recent Outreach Activity
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
          Last 50 outreach emails sent. Check HubSpot contact timelines for full delivery details.
        </p>
        <RecentOutreachTable data={recentOutreach} />
      </div>
    </div>
  );
}
