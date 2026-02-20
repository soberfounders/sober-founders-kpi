import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import KPICard from '../components/KPICard';
import AIAnalysisCard from '../components/AIAnalysisCard';
import { supabase } from '../lib/supabaseClient';
import { buildLeadAnalytics } from '../lib/leadAnalytics';

const LOOKBACK_DAYS = 120;

function formatCurrency(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 'N/A';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 'N/A';
  return `${(n * 100).toFixed(1)}%`;
}

function formatDeltaPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function trendDirection(current, previous, betterWhen = 'lower') {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 'neutral';
  if (betterWhen === 'lower') return current <= previous ? 'up' : 'down';
  return current >= previous ? 'up' : 'down';
}

const containerCard = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
};

const LeadsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setLoadErrors([]);

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - LOOKBACK_DAYS);
    const startKey = startDate.toISOString().slice(0, 10);

    const errors = [];

    const adsPromise = supabase
      .from('raw_fb_ads_insights_daily')
      .select('date_day,ad_account_id,funnel_key,campaign_name,adset_name,ad_name,ad_id,spend,impressions,clicks,leads')
      .gte('date_day', startKey)
      .order('date_day', { ascending: true });

    const zoomPromise = supabase
      .from('kpi_metrics')
      .select('metric_name,metric_value,metric_date,metadata')
      .eq('metric_name', 'Zoom Meeting Attendees')
      .gte('metric_date', startKey)
      .order('metric_date', { ascending: true });

    const lumaPromise = supabase
      .from('raw_luma_registrations')
      .select('event_date,event_start_at,event_api_id,guest_api_id,guest_name,guest_email,registered_at,approval_status,is_thursday,matched_zoom,matched_zoom_net_new,matched_hubspot,matched_hubspot_tier,funnel_key')
      .gte('event_date', startKey)
      .order('event_date', { ascending: true });

    const aliasPromise = supabase
      .from('attendee_aliases')
      .select('original_name,target_name');

    const [adsResp, zoomResp, lumaResp, aliasResp] = await Promise.all([adsPromise, zoomPromise, lumaPromise, aliasPromise]);

    if (adsResp.error) {
      errors.push(`Meta ads data unavailable: ${adsResp.error.message}`);
    }
    if (zoomResp.error) {
      errors.push(`Zoom attendance data unavailable: ${zoomResp.error.message}`);
    }
    if (lumaResp.error) {
      errors.push(`Lu.ma registrations unavailable: ${lumaResp.error.message}`);
    }
    if (aliasResp.error) {
      errors.push(`Attendee alias rules unavailable: ${aliasResp.error.message}`);
    }

    let hubspotRows = [];
    const hubspotPrimaryColumns = [
      'createdate',
      'email',
      'firstname',
      'lastname',
      'annual_revenue_in_dollars',
      'membership_s',
      'hs_analytics_source',
      'hs_analytics_source_data_1',
      'hs_analytics_source_data_2',
      'campaign',
      'hs_latest_source',
    ].join(',');

    const hubspotFallbackColumns = [
      'createdate',
      'email',
      'firstname',
      'lastname',
      'annual_revenue_in_dollars',
      'membership_s',
      'hs_analytics_source',
      'hs_analytics_source_data_1',
      'hs_analytics_source_data_2',
      'campaign',
    ].join(',');

    const hubspotPrimaryResp = await supabase
      .from('raw_hubspot_contacts')
      .select(hubspotPrimaryColumns)
      .gte('createdate', `${startKey}T00:00:00.000Z`)
      .order('createdate', { ascending: true });

    if (hubspotPrimaryResp.error) {
      const hubspotFallbackResp = await supabase
        .from('raw_hubspot_contacts')
        .select(hubspotFallbackColumns)
        .gte('createdate', `${startKey}T00:00:00.000Z`)
        .order('createdate', { ascending: true });

      if (hubspotFallbackResp.error) {
        errors.push(`HubSpot data unavailable: ${hubspotFallbackResp.error.message}`);
      } else {
        hubspotRows = hubspotFallbackResp.data || [];
        errors.push('HubSpot advanced attribution columns missing; running in fallback mode.');
      }
    } else {
      hubspotRows = hubspotPrimaryResp.data || [];
    }

    const nextAnalytics = buildLeadAnalytics({
      adsRows: adsResp.data || [],
      hubspotRows,
      zoomRows: zoomResp.data || [],
      lumaRows: lumaResp.data || [],
      aliases: aliasResp.data || [],
      lookbackDays: LOOKBACK_DAYS,
    });

    setAnalytics(nextAnalytics);
    setLoadErrors(errors);
    setLoading(false);
  }

  const topAttributionRows = useMemo(() => {
    if (!analytics?.adAttributionRows) return [];
    return [...analytics.adAttributionRows]
      .sort((a, b) => (b.attributedShowUps - a.attributedShowUps) || (b.spend - a.spend))
      .slice(0, 15);
  }, [analytics]);

  if (loading) return <div>Loading Leads Data...</div>;
  if (!analytics) return <div>No lead analytics data available.</div>;

  const showupRows = analytics.showUpTracker.rows.slice(-20);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {loadErrors.length > 0 && (
        <div style={{ ...containerCard, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#92400e' }}>Data Quality Notes</p>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {loadErrors.map((message) => (
              <p key={message} style={{ margin: 0, fontSize: '13px', color: '#92400e' }}>{message}</p>
            ))}
          </div>
        </div>
      )}

      <AIAnalysisCard analysis={analytics.analysis} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {analytics.costCards.slice(0, 4).map((card) => (
          <KPICard
            key={card.key}
            title={card.label}
            value={formatCurrency(card.value)}
            trend={trendDirection(card.value, card.previous, 'lower')}
            color="var(--color-orange)"
          />
        ))}
      </div>

      <div style={containerCard}>
        <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Thursday Lu.ma Funnel Integrity</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '10px' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Registrations</p>
            <p style={{ margin: '4px 0 0 0', fontWeight: 700 }}>{Math.round(analytics.thursdayLumaFunnel.registrations).toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '10px' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Matched in Zoom</p>
            <p style={{ margin: '4px 0 0 0', fontWeight: 700 }}>{Math.round(analytics.thursdayLumaFunnel.zoomMatches).toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '10px' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Matched Net New</p>
            <p style={{ margin: '4px 0 0 0', fontWeight: 700 }}>{Math.round(analytics.thursdayLumaFunnel.zoomNetNewMatches).toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '10px' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Matched in HubSpot</p>
            <p style={{ margin: '4px 0 0 0', fontWeight: 700 }}>{Math.round(analytics.thursdayLumaFunnel.hubspotMatches).toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '10px' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Reg to Net New Show Rate</p>
            <p style={{ margin: '4px 0 0 0', fontWeight: 700 }}>{formatPercent(analytics.thursdayLumaFunnel.regToShowRate)}</p>
          </div>
        </div>
      </div>

      <div style={containerCard}>
        <h3 style={{ fontSize: '18px', marginBottom: '14px' }}>Funnel Visualization</h3>
        <div style={{ height: '310px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.funnelStages} layout="vertical" margin={{ left: 24, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis dataKey="label" type="category" width={140} tick={{ fontSize: 12, fill: '#334155' }} />
              <Tooltip
                formatter={(value, _name, payload) => [
                  Number(value || 0).toLocaleString(),
                  payload?.payload?.label || '',
                ]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload;
                  if (!row) return '';
                  if (row.conversionFromPrevious === null) return 'Stage start';
                  return `From previous stage: ${(row.conversionFromPrevious * 100).toFixed(1)}%`;
                }}
              />
              <Bar dataKey="value" fill="#0f766e" radius={[4, 4, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={containerCard}>
          <h3 style={{ fontSize: '18px', marginBottom: '14px' }}>Lead Quality Breakdown</h3>
          <div style={{ height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.leadQualityBreakdown.chartRows}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={92}
                >
                  {analytics.leadQualityBreakdown.chartRows.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => Number(value || 0).toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {analytics.leadQualityBreakdown.chartRows.map((row) => (
              <div key={row.name} style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '8px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{row.name}</p>
                <p style={{ margin: '4px 0 0 0', fontWeight: 700 }}>{Math.round(row.value).toLocaleString()}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b' }}>{formatPercent(row.pct)}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={containerCard}>
          <h3 style={{ fontSize: '18px', marginBottom: '14px' }}>Show-Up Tracker (Net New)</h3>
          <div style={{ height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={showupRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="netNewTuesday" name="Tuesday Net New" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="netNewThursday" name="Thursday Net New" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="netNewTotal" name="Total Net New" stroke="#0f766e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '8px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Tuesday Avg Net New</p>
              <p style={{ margin: '4px 0 0 0', fontWeight: 700 }}>{analytics.showUpTracker.averageTuesday.toFixed(2)}</p>
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '8px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Thursday Avg Net New</p>
              <p style={{ margin: '4px 0 0 0', fontWeight: 700 }}>{analytics.showUpTracker.averageThursday.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div style={containerCard}>
        <h3 style={{ fontSize: '18px', marginBottom: '14px' }}>Ad Attribution Table (Ad to Lead to Registration to Show-Up)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                {[
                  'Campaign',
                  'Ad Set',
                  'Ad',
                  'Spend',
                  'Meta Leads',
                  'Attr Leads',
                  'Attr Registrations',
                  'Attr Show-Ups',
                  'Attr Qualified',
                  'Attr Great',
                  'CPL',
                  'CPQL',
                  'CPGL',
                  'Show-Up Rate',
                  'Quality Score',
                ].map((header) => (
                  <th key={header} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topAttributionRows.map((row) => (
                <tr key={row.adId}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.campaignName}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.adsetName}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', fontWeight: 600 }}>{row.adName}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.spend)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{Math.round(row.metaLeads).toLocaleString()}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.attributedLeads.toFixed(2)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.attributedRegistrations.toFixed(2)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.attributedShowUps.toFixed(2)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.attributedQualifiedLeads.toFixed(2)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.attributedGreatLeads.toFixed(2)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.cpl)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.attributedQualifiedLeads > 0 ? formatCurrency(row.cpql) : 'N/A'}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.attributedGreatLeads > 0 ? formatCurrency(row.cpgl) : 'N/A'}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatPercent(row.showUpRate)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.qualityScore.toFixed(1)}</td>
                </tr>
              ))}
              {topAttributionRows.length === 0 && (
                <tr>
                  <td colSpan={15} style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>
                    No ad attribution rows available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={containerCard}>
          <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Top Performing Ads</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {analytics.topAds.map((row) => (
              <div key={row.adId} style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '10px' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>{row.adName}</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>{row.adsetName}</p>
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#0f766e' }}>
                  CPGL: {row.attributedGreatLeads > 0 ? formatCurrency(row.cpgl) : 'N/A'} | CPQL: {row.attributedQualifiedLeads > 0 ? formatCurrency(row.cpql) : 'N/A'} | Show-Up Rate: {formatPercent(row.showUpRate)}
                </p>
              </div>
            ))}
            {analytics.topAds.length === 0 && (
              <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>No top ads available.</p>
            )}
          </div>
        </div>

        <div style={containerCard}>
          <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Bottom Performing Ads</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {analytics.bottomAds.map((row) => (
              <div key={row.adId} style={{ backgroundColor: '#fff7ed', borderRadius: '10px', padding: '10px', border: '1px solid #fed7aa' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>{row.adName}</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#9a3412' }}>{row.adsetName}</p>
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#9a3412' }}>
                  Spend: {formatCurrency(row.spend)} | CPL: {formatCurrency(row.cpl)} | Great Leads: {row.attributedGreatLeads.toFixed(2)}
                </p>
              </div>
            ))}
            {analytics.bottomAds.length === 0 && (
              <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>No bottom ads available.</p>
            )}
          </div>
        </div>
      </div>

      <div style={containerCard}>
        <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Week-over-Week and Month-over-Month Highlights</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '780px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>Metric</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>Current</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>WoW</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>MoM</th>
              </tr>
            </thead>
            <tbody>
              {analytics.analysis.metricSnapshotRows.slice(0, 10).map((row) => (
                <tr key={`delta-${row.id}`}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{row.label}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>
                    {row.format === 'currency' ? formatCurrency(row.current) : row.format === 'percent' ? formatPercent(row.current) : Math.round(row.current).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>
                    {formatDeltaPct(row.weeklyDelta?.deltaPct)}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', textAlign: 'right' }}>
                    {formatDeltaPct(row.monthlyDelta?.deltaPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LeadsDashboard;
