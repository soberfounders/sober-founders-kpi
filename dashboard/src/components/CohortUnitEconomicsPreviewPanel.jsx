import React, { useMemo, useState } from 'react';
import preview from '../data/metaCohortUnitEconPreview.json';

const card = {
  backgroundColor: '#fff',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
};

const subCard = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '12px',
};

function currency(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Insufficient sample';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function int(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString();
}

function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'N/A';
  return `${(n * 100).toFixed(1)}%`;
}

function formatDateTime(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v || 'Unknown');
  return d.toLocaleString();
}

function statusBadge(status) {
  if (status === 'pass') return { bg: '#dcfce7', color: '#166534', label: 'Pass' };
  if (status === 'warn') return { bg: '#fef3c7', color: '#92400e', label: 'Watch' };
  return { bg: '#f1f5f9', color: '#475569', label: 'Info' };
}

function signalBadge(status) {
  if (status === 'ok') return { bg: '#dcfce7', color: '#166534', label: 'OK' };
  if (status === 'warning' || status === 'warn') return { bg: '#fef3c7', color: '#92400e', label: 'Warning' };
  if (status === 'alert' || status === 'action_required') return { bg: '#fee2e2', color: '#991b1b', label: 'Action Required' };
  return { bg: '#e2e8f0', color: '#334155', label: 'Info' };
}

function formatValueByFormat(value, format) {
  if (format === 'currency') return currency(value);
  if (format === 'number') return int(value);
  if (format === 'percent') return pct(value);
  return String(value ?? 'N/A');
}

function ratioLabel(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n)) return 'N/A';
  const delta = ((n - 1) * 100).toFixed(0);
  if (n === 1) return 'same as baseline';
  return `${Math.abs(Number(delta))}% ${n > 1 ? 'higher' : 'lower'}`;
}

function signoffBadge(status) {
  if (status === 'signed_off') return { bg: '#dcfce7', color: '#166534', label: 'Signed Off' };
  if (status === 'provisional') return { bg: '#fef3c7', color: '#92400e', label: 'Provisional' };
  if (status === 'blocked') return { bg: '#fee2e2', color: '#991b1b', label: 'Blocked' };
  return { bg: '#e2e8f0', color: '#334155', label: 'Unknown' };
}

function compareValues(a, b, type = 'number') {
  if (type === 'string') return String(a ?? '').localeCompare(String(b ?? ''));
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) && !Number.isFinite(nb)) return 0;
  if (!Number.isFinite(na)) return -1;
  if (!Number.isFinite(nb)) return 1;
  return na - nb;
}

function buildMetaExpertPlaybook({ key, metaDiagnostics, campaignDiagnostics, weeklySignoff }) {
  const cards = metaDiagnostics?.cards || [];
  const cardMap = new Map(cards.map((c) => [c.key, c]));
  const cpl4 = cardMap.get('cpl_trailing_4w');
  const cpl12 = cardMap.get('cpl_trailing_12w');
  const cpqlForecast = cardMap.get('cpql_current_entry_forecast');
  const cpglForecast = cardMap.get('cpgl_current_entry_forecast');
  const signoff = weeklySignoff || {};
  const topCampaign = campaignDiagnostics?.rows?.find((r) => (r.exact_match_leads || 0) > 0) || null;
  const bestCpqlCampaign = (campaignDiagnostics?.rows || [])
    .filter((r) => Number.isFinite(Number(r.cpql_exact_campaign_week)))
    .sort((a, b) => Number(a.cpql_exact_campaign_week) - Number(b.cpql_exact_campaign_week))[0] || null;
  const underperformer = (campaignDiagnostics?.rows || [])
    .filter((r) => Number.isFinite(Number(r.cpql_exact_campaign_week)) && (r.exact_match_leads || 0) >= 10)
    .sort((a, b) => Number(b.cpql_exact_campaign_week) - Number(a.cpql_exact_campaign_week))[0] || null;

  const contextLines = [
    `Snapshot signoff: ${signoff.status || 'unknown'} (${signoff.summary || 'no summary'})`,
    `Current CPL (trailing 4 cohort weeks): ${formatValueByFormat(cpl4?.value, cpl4?.format)}`,
    `CPL (trailing 12 cohort weeks): ${formatValueByFormat(cpl12?.value, cpl12?.format)}`,
    `Current-entry forecast CPQL: ${formatValueByFormat(cpqlForecast?.value, cpqlForecast?.format)}`,
    `Current-entry forecast cost/great lead: ${formatValueByFormat(cpglForecast?.value, cpglForecast?.format)}`,
    `Campaign attribution exact-match coverage: ${pct(campaignDiagnostics?.attribution_coverage?.exact_campaign_week_match_rate_all_leads)}`,
    bestCpqlCampaign ? `Best exact-subset CPQL campaign: ${bestCpqlCampaign.campaign_label} (${currency(bestCpqlCampaign.cpql_exact_campaign_week)})` : null,
    underperformer ? `Campaign to triage first: ${underperformer.campaign_label} (${currency(underperformer.cpql_exact_campaign_week)} CPQL exact-subset)` : null,
  ].filter(Boolean);

  if (key === 'creative_refresh_sprint') {
    return [
      'META ADS EXPERT PLAYBOOK: Creative Refresh Sprint (7 Days)',
      '',
      'Context (from dashboard snapshot):',
      ...contextLines.map((line) => `- ${line}`),
      '',
      'Goal:',
      '- Lower CPL without hurting CPQL/CPGL by refreshing creative angles and hooks.',
      '',
      'Step-by-step actions:',
      '1. Keep your best quality campaign running as control (do not pause the winner while testing).',
      `2. Create 3-5 net-new ads in the same campaign/ad set family as the control${bestCpqlCampaign ? ` (use "${bestCpqlCampaign.campaign_label}" as benchmark)` : ''}.`,
      '3. Build creative variations across at least 3 angles:',
      '   - Pain/urgency angle ("You built a business but feel stuck...")',
      '   - Identity angle ("Sober founders scaling with accountability...")',
      '   - Outcome angle ("High-quality founder room, better decisions...")',
      '4. Keep offer and qualification criteria consistent so CPQL comparisons remain valid.',
      '5. Launch with equal budgets for test ads (or ABO split) to avoid early bias.',
      '6. Review at 3 checkpoints: 24h, 72h, 7d.',
      '7. Use decision rules:',
      '   - CPL higher but CPQL stable/improving: keep testing, not a red alert.',
      '   - CPL higher and CPQL worse: pause loser angle and replace quickly.',
      '   - Good CPL but poor CPQL: tighten message/qualification and form copy.',
      '',
      'Copy/paste ad brief template for new creative:',
      'Headline ideas:',
      '- Sober founders making real decisions together',
      '- Build your business with founders who actually get it',
      '- If you are sober and scaling, this room is for you',
      'Primary text framework:',
      '- Hook: call out founder pain + sobriety identity',
      '- Credibility: mention high-caliber room/accountability',
      '- Outcome: better decisions / less isolation / growth with clarity',
      '- CTA: apply / join / reserve a spot',
      '',
      'What to log after launch (for weekly check-in):',
      '- CPL',
      '- CPQL forecast',
      '- Great lead rate proxy',
      '- Weird form responses count',
      '- Which hooks/themes produced strongest qualified lead rate',
    ].join('\n');
  }

  if (key === 'campaign_triage') {
    return [
      'META ADS EXPERT PLAYBOOK: Campaign Triage + Reallocation',
      '',
      'Context (from dashboard snapshot):',
      ...contextLines.map((line) => `- ${line}`),
      '',
      'Goal:',
      '- Reallocate spend toward campaigns that produce better qualified/great leads, not just cheaper leads.',
      '',
      'Step-by-step actions:',
      `1. Pull the Campaign Diagnostics table and sort by "CPQL (Exact Match)" ascending for campaigns with at least 10 exact-matched leads.`,
      `2. Mark 1-2 protect campaigns${bestCpqlCampaign ? ` (start with "${bestCpqlCampaign.campaign_label}")` : ''}.`,
      `3. Mark 1-2 triage campaigns${underperformer ? ` (start with "${underperformer.campaign_label}")` : ''}.`,
      '4. For triage campaigns, inspect:',
      '   - Creative fatigue (same ads too long, weak new hooks)',
      '   - Audience overlap / saturation',
      '   - Form clarity and malformed responses',
      '   - Qualification mismatch (too broad ad message)',
      '5. Reallocate a small test budget (10-20%) from triage to protect/new-test campaigns.',
      '6. Do not judge on CPL alone; compare CPQL and great lead rate.',
      '7. Re-check after one full cohort week and compare against prior week.',
      '',
      'Weekly decision rubric:',
      '- Keep: CPL high but CPQL/CPGL competitive',
      '- Refresh: CPL high and CPQL weak',
      '- Scale: CPQL strong + volume adequate + stable lead quality',
      '- Pause: repeated weak CPQL after creative refresh',
    ].join('\n');
  }

  return [
    'META ADS EXPERT PLAYBOOK: Weekly Optimization Checklist',
    '',
    'Context (from dashboard snapshot):',
    ...contextLines.map((line) => `- ${line}`),
    '',
    'Goal:',
    '- Make weekly Meta decisions using audited cohort math and trend diagnostics, not raw CPL alone.',
    '',
    'Step-by-step actions:',
    '1. Confirm Weekly Signoff is not blocked.',
    '2. Read the AI Trend Summary and note whether this is "warning" vs "action required."',
    '3. Compare 4-week CPL vs 12-week CPL to determine spike vs sustained shift.',
    '4. Compare current-entry forecast CPQL / CPGL vs finalized benchmarks.',
    '5. Review campaign diagnostics on the exact-match subset and sort by CPQL + qualified lead rate.',
    '6. Pick one protect campaign, one triage campaign, and one new creative test for this week.',
    '7. Document what changed (creative, audience, budget, form copy) so next week comparisons are interpretable.',
    '8. Review nudge candidates / strong non-ICP members in Leads for retention opportunities while acquisition is being optimized.',
    '',
    'Decision guardrails:',
    '- If CPL rises but CPQL is stable: optimize, but not a red alert.',
    '- If CPL rises and CPQL/CPGL rise: active intervention required (creative + targeting + form QA).',
    '- Treat ideal-member metrics as directional until sample size improves.',
  ].join('\n');
}

function confidenceLabel(metric) {
  const conv = Number(metric?.finalized?.conversions);
  if (!Number.isFinite(conv) || conv <= 0) return { label: 'Insufficient Sample', bg: '#f1f5f9', color: '#475569' };
  if (conv < 10) return { label: 'Early Signal', bg: '#fef3c7', color: '#92400e' };
  if (conv < 40) return { label: 'Directional', bg: '#dbeafe', color: '#1d4ed8' };
  return { label: 'Decision-Grade', bg: '#dcfce7', color: '#166534' };
}

function metricOrderKey(key) {
  const order = [
    'lead',
    'luma_signup',
    'first_showup',
    'qualified_lead',
    'great_lead',
    'great_member',
    'ideal_member',
  ];
  const idx = order.indexOf(key);
  return idx === -1 ? 999 : idx;
}

function MetricPreviewCard({ metric, lagStat }) {
  const conf = confidenceLabel(metric);
  const finalized = metric?.finalized || {};
  const projected = metric?.projected || null;
  return (
    <div style={{ ...subCard, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {metric.label}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>
            {metric.type === 'behavior'
              ? `Lag-aware behavior metric${Number.isFinite(metric.finalized_horizon_days) ? ` · Horizon ${int(metric.finalized_horizon_days)}d` : ''}`
              : metric.type === 'quality'
                ? `Quality metric · ${int(metric.finalized_horizon_days)}d stabilization buffer`
                : 'Instant cohort metric'}
          </p>
        </div>
        <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, backgroundColor: conf.bg, color: conf.color, whiteSpace: 'nowrap' }}>
          {conf.label}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px' }}>
          <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Finalized CPA</p>
          <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{currency(finalized.cpa)}</p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
            {int(finalized.conversions)} conv · {int(finalized.cohorts_included)} cohorts
          </p>
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px' }}>
          <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Projected CPA</p>
          <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{currency(projected?.projected_cpa)}</p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
            {projected ? `${int(projected.projected_conversions)} est conv · ${int(projected.cohorts_included)} cohorts` : 'Not used for this metric'}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: '#eef2ff', color: '#3730a3', fontSize: '10px', fontWeight: 700 }}>
          Conv Rate {pct(finalized.conversion_rate)}
        </span>
        {lagStat && (
          <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '10px', fontWeight: 700 }}>
            Observed Achievers {int(lagStat.achievers)}
          </span>
        )}
        {lagStat && Number.isFinite(Number(lagStat.p90_days)) && (
          <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: '#f0fdf4', color: '#166534', fontSize: '10px', fontWeight: 700 }}>
            p90 Lag {int(lagStat.p90_days)}d
          </span>
        )}
      </div>
    </div>
  );
}

function MetaDiagnosticCard({ cardData, onClick }) {
  const badge = signalBadge(cardData?.status);
  const drill = cardData?.drilldown || {};
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...subCard,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        cursor: 'pointer',
        backgroundColor: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {cardData?.category || 'metric'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
            {cardData?.label}
          </p>
        </div>
        <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, backgroundColor: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>
          {badge.label}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
        {formatValueByFormat(cardData?.value, cardData?.format)}
      </p>
      <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
        {drill.formula || 'Click for math breakdown'}
      </p>
      {drill?.trend_comparison && (
        <span style={{ alignSelf: 'flex-start', padding: '4px 8px', borderRadius: '999px', backgroundColor: '#f8fafc', color: '#334155', fontSize: '10px', fontWeight: 700 }}>
          {drill.trend_comparison.label}: {ratioLabel(drill.trend_comparison.ratio)}
        </span>
      )}
      <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700 }}>Click for math and rationale</span>
    </button>
  );
}

export default function CohortUnitEconomicsPreviewPanel() {
  const [activeDrilldownKey, setActiveDrilldownKey] = useState(null);
  const [activeDiagnosticCardKey, setActiveDiagnosticCardKey] = useState(null);
  const [showAuditChecks, setShowAuditChecks] = useState(false);
  const [campaignSort, setCampaignSort] = useState({ key: 'ideal_members', dir: 'desc' });
  const [activePlaybookKey, setActivePlaybookKey] = useState('weekly_checklist');
  const [copyState, setCopyState] = useState('idle');
  const data = preview || null;
  if (!data?.metrics?.length) return null;

  const metrics = [...data.metrics].sort((a, b) => metricOrderKey(a.key) - metricOrderKey(b.key));
  const lagStats = data.lag_stats || {};
  const dq = data.data_quality || {};
  const counts = dq.counts || {};
  const dates = dq.date_range || {};
  const backfill = dq.spend_backfill_manual_week_end || null;
  const naive = data.naive_90d_period_cpa || null;
  const weeklyCheckin = data.weekly_checkin || { checks: [] };
  const drilldowns = data.drilldowns || {};
  const metaDiagnostics = data.meta_specialist_diagnostics || null;
  const metaCards = metaDiagnostics?.cards || [];
  const campaignDiagnostics = metaDiagnostics?.campaign_diagnostics || null;
  const campaignCards = campaignDiagnostics?.cards || [];
  const campaignRows = campaignDiagnostics?.rows || [];
  const metaAiAnalysis = metaDiagnostics?.ai_analysis || null;
  const cplTrend = metaDiagnostics?.cpl_trend_last_12_weeks || [];
  const weeklySignoff = data.weekly_signoff || null;
  const numberAudit = data.number_audit || { counts: {}, checks: [] };
  const diagnosticCards = [...metaCards, ...campaignCards];

  const drilldownConfigs = useMemo(() => ({
    great_members: {
      title: 'Great Members (6+ show-ups) Cohort Drilldown',
      columns: [
        { key: 'display_name', label: 'Member' },
        { key: 'original_traffic_source', label: 'Source' },
        { key: 'lead_date', label: 'Lead Date' },
        { key: 'total_showups', label: 'Show-Ups', type: 'number' },
        { key: 'revenue_official_cached', label: 'Revenue (Cached)', type: 'currency' },
        { key: 'first_conversion_event_name', label: 'Meta Form / First Conversion' },
        { key: 'hs_analytics_source_data_2', label: 'Meta Campaign Detail' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    ideal_members: {
      title: 'Ideal Members (11+ show-ups + ICP) Cohort Drilldown',
      columns: [
        { key: 'display_name', label: 'Member' },
        { key: 'original_traffic_source', label: 'Source' },
        { key: 'lead_date', label: 'Lead Date' },
        { key: 'total_showups', label: 'Show-Ups', type: 'number' },
        { key: 'revenue_official_cached', label: 'Revenue (Cached)', type: 'currency' },
        { key: 'first_conversion_event_name', label: 'Meta Form / First Conversion' },
        { key: 'hs_analytics_source_data_2', label: 'Meta Campaign Detail' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    high_value_nudge_candidates: {
      title: 'High-Value Nudge Candidates (ICP Profile, Strong Member, Not Yet Ideal)',
      columns: [
        { key: 'display_name', label: 'Member' },
        { key: 'shows_remaining_to_ideal', label: 'Shows to 11+', type: 'number' },
        { key: 'total_showups', label: 'Show-Ups', type: 'number' },
        { key: 'primary_attendance_group', label: 'Primary Group' },
        { key: 'days_since_last_showup', label: 'Days Since Last', type: 'number' },
        { key: 'missed_primary_group_sessions_since_last_showup', label: 'Missed in Group', type: 'number' },
        { key: 'ideal_candidate_likelihood', label: 'Likelihood' },
        { key: 'nudge_recommended_now', label: 'Nudge Now?' },
        { key: 'nudge_reason', label: 'Nudge Reason' },
        { key: 'revenue_official_cached', label: 'Revenue (Cached)', type: 'currency' },
        { key: 'first_conversion_event_name', label: 'Meta Form / First Conversion' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    strong_non_icp_members: {
      title: 'Strong Non-ICP Members (Great Attendance, Not Ideal-Eligible Yet)',
      columns: [
        { key: 'display_name', label: 'Member' },
        { key: 'total_showups', label: 'Show-Ups', type: 'number' },
        { key: 'primary_attendance_group', label: 'Primary Group' },
        { key: 'days_since_last_showup', label: 'Days Since Last', type: 'number' },
        { key: 'missed_primary_group_sessions_since_last_showup', label: 'Missed in Group', type: 'number' },
        { key: 'icp_gap_reason', label: 'Why Not ICP (Current Model)' },
        { key: 'nudge_recommended_now', label: 'Nudge Now?' },
        { key: 'nudge_reason', label: 'Nudge Reason' },
        { key: 'revenue_official_cached', label: 'Revenue (Cached)', type: 'currency' },
        { key: 'first_conversion_event_name', label: 'Meta Form / First Conversion' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    membership_250k_exact_zero_revenue: {
      title: 'QA Watchlist: Exact "Main Free $250k+ Group" with Cached Official Revenue 0/Null',
      columns: [
        { key: 'display_name', label: 'Contact' },
        { key: 'email', label: 'Email' },
        { key: 'original_traffic_source', label: 'Source' },
        { key: 'membership_s', label: 'Membership Tags' },
        { key: 'revenue_official_cached', label: 'Revenue (Cached)', type: 'currency' },
        { key: 'first_conversion_event_name', label: 'Meta Form / First Conversion' },
        { key: 'createdate', label: 'Created' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    membership_250k_contains_zero_revenue: {
      title: 'QA Watchlist: Any Membership Tag Containing "Main Free $250k+ Group" with Cached Official Revenue 0/Null',
      columns: [
        { key: 'display_name', label: 'Contact' },
        { key: 'email', label: 'Email' },
        { key: 'original_traffic_source', label: 'Source' },
        { key: 'membership_s', label: 'Membership Tags' },
        { key: 'revenue_official_cached', label: 'Revenue (Cached)', type: 'currency' },
        { key: 'first_conversion_event_name', label: 'Meta Form / First Conversion' },
        { key: 'createdate', label: 'Created' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
  }), []);

  const activeDrilldown = activeDrilldownKey
    ? {
        key: activeDrilldownKey,
        ...(drilldownConfigs[activeDrilldownKey] || { title: activeDrilldownKey, columns: [] }),
        rows: drilldowns[activeDrilldownKey] || [],
      }
    : null;
  const activeDiagnosticCard = activeDiagnosticCardKey
    ? diagnosticCards.find((c) => c.key === activeDiagnosticCardKey) || null
    : null;
  const nudgeCandidates = drilldowns.high_value_nudge_candidates || [];
  const strongNonIcpMembers = drilldowns.strong_non_icp_members || [];
  const signoff = weeklySignoff || { status: 'unknown', summary: 'No signoff available' };
  const signoffUi = signoffBadge(signoff.status);

  const sortedCampaignRows = [...campaignRows].sort((a, b) => {
    const order = compareValues(a?.[campaignSort.key], b?.[campaignSort.key], campaignSort.key === 'campaign_label' ? 'string' : 'number');
    return campaignSort.dir === 'asc' ? order : -order;
  });
  const activePlaybookText = buildMetaExpertPlaybook({
    key: activePlaybookKey,
    metaDiagnostics,
    campaignDiagnostics,
    weeklySignoff,
  });

  async function copyPlaybook() {
    try {
      await navigator.clipboard.writeText(activePlaybookText);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1200);
    } catch (_) {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 1800);
    }
  }

  function toggleCampaignSort(key) {
    setCampaignSort((prev) => (
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'campaign_label' ? 'asc' : 'desc' }
    ));
  }

  function renderCell(row, col) {
    const value = row?.[col.key];
    if (col.type === 'currency') return currency(value);
    if (col.type === 'number') return int(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (col.type === 'link') {
      if (!value) return '—';
      return (
        <a href={value} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>
          Open
        </a>
      );
    }
    if (col.key === 'createdate' && value) return formatDateTime(value);
    return String(value ?? '—');
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Cohort Unit Economics Preview (Bottom Test Section)</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
            Snapshot from the cohort analysis script with manual weekly Meta spend backfill. Existing Leads module above is unchanged for comparison.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Snapshot Generated</p>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#0f172a', fontWeight: 700 }}>{formatDateTime(data.generated_at)}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        <div style={subCard}>
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Cohort Range</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
            {dates.spend_blended_min || dates.ads_live_min} to {dates.last_complete_ad_week_start}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
            Blended spend window ends {dates.spend_blended_max || dates.ads_live_max}
          </p>
        </div>
        <div style={subCard}>
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Analyzed Paid-Social Leads</p>
          <p style={{ margin: '4px 0 0', fontSize: '18px', color: '#0f172a', fontWeight: 800 }}>{int(counts.cohort_contacts_analyzed)}</p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
            Excluded out-of-range: {int(counts.excluded_out_of_range_leads)} · Phoenix: {int(counts.excluded_phoenix_meta_contacts)}
          </p>
        </div>
        <div style={subCard}>
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Great / Ideal Members (Observed)</p>
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveDrilldownKey('great_members')}
              style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#1d4ed8', borderRadius: '999px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
            >
              {int(lagStats.great_member?.achievers)} great
            </button>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>·</span>
            <button
              type="button"
              onClick={() => setActiveDrilldownKey('ideal_members')}
              style={{ border: '1px solid #fde68a', backgroundColor: '#fefce8', color: '#92400e', borderRadius: '999px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
            >
              {int(lagStats.ideal_member?.achievers)} ideal
            </button>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
            6+ show-ups · 11+ show-ups + ICP
          </p>
        </div>
        <div style={subCard}>
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Revenue + Sobriety Coverage</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
            Official rev {pct(dq.completeness_meta_free_analyzed?.official_revenue_rate)} · Sobriety {pct(dq.completeness_meta_free_analyzed?.sobriety_rate)}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
            Cached `annual_revenue_in_dollars__official_` + sobriety date coverage
          </p>
        </div>
      </div>

      {weeklySignoff && (
        <div style={{ ...subCard, marginBottom: '14px', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Weekly Signoff (Decision Gate)</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                {signoff.summary}
              </p>
            </div>
            <span style={{ padding: '5px 10px', borderRadius: '999px', backgroundColor: signoffUi.bg, color: signoffUi.color, fontSize: '11px', fontWeight: 700 }}>
              {signoffUi.label}
            </span>
          </div>
          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Audit Checks</p>
              <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                {int(numberAudit.counts?.pass)} pass · {int(numberAudit.counts?.warn)} warn · {int(numberAudit.counts?.fail)} fail
              </p>
            </div>
            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Campaign CPA Scope</p>
              <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                {signoff?.decision_use?.campaign_cpa_subset_only ? 'Subset only (exact-match)' : 'Broad coverage'}
              </p>
            </div>
            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Ideal Member Metric</p>
              <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                {signoff?.decision_use?.ideal_member_directional_only ? 'Directional only' : 'Decision-grade'}
              </p>
            </div>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowAuditChecks((v) => !v)}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '6px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
            >
              {showAuditChecks ? 'Hide Audit Checks' : 'View Audit Checks'}
            </button>
            {Array.isArray(signoff.top_warnings) && signoff.top_warnings.length > 0 && (
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Top warning: {signoff.top_warnings[0]}
              </span>
            )}
          </div>
          {showAuditChecks && (
            <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto', backgroundColor: '#fff' }}>
              <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    {['Status', 'Check', 'Actual', 'Expected', 'Tolerance'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '10px', color: '#475569', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(numberAudit.checks || []).map((check) => {
                    const b = signalBadge(check.status === 'pass' ? 'ok' : (check.status === 'fail' ? 'alert' : 'warn'));
                    return (
                      <tr key={`audit-${check.key}`}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>
                          <span style={{ padding: '3px 7px', borderRadius: '999px', backgroundColor: b.bg, color: b.color, fontWeight: 700 }}>{b.label}</span>
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{check.label}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{typeof check.actual === 'number' ? check.actual : String(check.actual ?? '—')}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{typeof check.expected === 'number' ? check.expected : String(check.expected ?? '—')}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{check.tolerance == null ? '—' : String(check.tolerance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {metaDiagnostics && (
        <div style={{ ...subCard, marginBottom: '14px', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Meta Specialist Diagnosis (CPL + Quality Trend Explainer)</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                Click any box for the drilldown math (formula, numerator, denominator, windows, and comparison baselines).
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: signalBadge(metaDiagnostics.status).bg, color: signalBadge(metaDiagnostics.status).color, fontSize: '10px', fontWeight: 700 }}>
                {signalBadge(metaDiagnostics.status).label}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                {metaDiagnostics.generated_at ? `Updated ${formatDateTime(metaDiagnostics.generated_at)}` : ''}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            {metaCards.map((diagCard) => (
              <MetaDiagnosticCard
                key={diagCard.key}
                cardData={diagCard}
                onClick={() => setActiveDiagnosticCardKey(diagCard.key)}
              />
            ))}
          </div>

          {metaAiAnalysis && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '10px' }}>
              <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>AI Trend Summary (Meta Ads Specialist Style)</p>
                  <span style={{ padding: '3px 7px', borderRadius: '999px', backgroundColor: signalBadge(metaAiAnalysis.status).bg, color: signalBadge(metaAiAnalysis.status).color, fontSize: '10px', fontWeight: 700 }}>
                    {signalBadge(metaAiAnalysis.status).label}
                  </span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#334155', lineHeight: 1.45 }}>{metaAiAnalysis.summary}</p>

                {!!metaAiAnalysis.observations?.length && (
                  <div style={{ marginTop: '10px' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>What the data/trends are telling us</p>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#334155', fontSize: '11px', lineHeight: 1.45 }}>
                      {metaAiAnalysis.observations.map((item, idx) => (
                        <li key={`obs-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {!!metaAiAnalysis.action_steps?.length && (
                  <div style={{ marginTop: '10px' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>Recommended action steps</p>
                    <ol style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#334155', fontSize: '11px', lineHeight: 1.45 }}>
                      {metaAiAnalysis.action_steps.map((item, idx) => (
                        <li key={`act-${idx}`}>{item}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>CPL Trend (Last 12 Cohort Weeks)</p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                  Use this with CPQL/CPGL forecast boxes to decide if rising CPL is a spike or sustained pressure.
                </p>
                <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto', backgroundColor: '#fff' }}>
                  <table style={{ width: '100%', minWidth: '420px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        {['Week', 'Spend', 'Leads', 'CPL', 'Q Leads', 'Great Leads'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '10px', color: '#475569', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cplTrend.map((row) => (
                        <tr key={`cpltrend-${row.week}`}>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{row.week}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{currency(row.spend)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{int(row.leads)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#0f172a', fontWeight: 700 }}>{currency(row.cpl)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{int(row.qualified_leads)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{int(row.great_leads)}</td>
                        </tr>
                      ))}
                      {cplTrend.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: '8px', fontSize: '11px', color: '#64748b' }}>No CPL trend rows in this snapshot.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {!!metaAiAnalysis.watch_items?.length && (
                  <div style={{ marginTop: '8px' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>Weekly watch items</p>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#334155', fontSize: '11px', lineHeight: 1.45 }}>
                      {metaAiAnalysis.watch_items.map((item, idx) => (
                        <li key={`watch-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {campaignDiagnostics && (
            <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '10px' }}>
              <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Campaign Diagnostics (Exact-Match Subset)</p>
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                      Spend-based campaign CPA is shown only where HubSpot campaign detail exactly matches a Meta campaign name in the same lead cohort week.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveDiagnosticCardKey('campaign_exact_match_coverage')}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '6px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    View Coverage Math
                  </button>
                </div>

                {!!campaignCards.length && (
                  <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                    {campaignCards.map((diagCard) => (
                      <MetaDiagnosticCard
                        key={diagCard.key}
                        cardData={diagCard}
                        onClick={() => setActiveDiagnosticCardKey(diagCard.key)}
                      />
                    ))}
                  </div>
                )}

                <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto', backgroundColor: '#fff' }}>
                  <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        {[
                          ['campaign_label', 'Campaign'],
                          ['exact_match_leads', 'Exact Leads'],
                          ['leads', 'All Leads'],
                          ['cpl_exact_campaign_week', 'CPL (Exact)'],
                          ['cpql_exact_campaign_week', 'CPQL (Exact)'],
                          ['cpgl_exact_campaign_week', 'CPGL (Exact)'],
                          ['qualified_lead_rate', 'Q Lead Rate'],
                          ['great_member_rate', 'Great Member Rate'],
                          ['ideal_members', 'Ideal'],
                          ['matched_campaign_weeks', 'Matched Weeks'],
                        ].map(([key, label]) => (
                          <th
                            key={key}
                            style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '10px', color: '#475569', textTransform: 'uppercase', cursor: 'pointer' }}
                            onClick={() => toggleCampaignSort(key)}
                          >
                            {label}{campaignSort.key === key ? ` ${campaignSort.dir === 'asc' ? '↑' : '↓'}` : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCampaignRows.map((row) => (
                        <tr key={`camp-${row.campaign_key}`}>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155', maxWidth: '280px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.campaign_label}</div>
                            <div style={{ color: '#64748b', marginTop: '2px' }}>{row.attribution_quality}</div>
                          </td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{int(row.exact_match_leads)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{int(row.leads)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{currency(row.cpl_exact_campaign_week)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{currency(row.cpql_exact_campaign_week)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{currency(row.cpgl_exact_campaign_week)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{pct(row.qualified_lead_rate)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{pct(row.great_member_rate)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{int(row.ideal_members)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{int(row.matched_campaign_weeks)}</td>
                        </tr>
                      ))}
                      {sortedCampaignRows.length === 0 && (
                        <tr>
                          <td colSpan={10} style={{ padding: '8px', fontSize: '11px', color: '#64748b' }}>No campaign rows in this snapshot.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Campaign Coverage + Caveats</p>
                  <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#334155' }}>
                    Exact campaign+week coverage across all paid-social cohort leads: <strong>{pct(campaignDiagnostics.attribution_coverage?.exact_campaign_week_match_rate_all_leads)}</strong>
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>
                    Exact coverage across non-generic campaign details: <strong>{pct(campaignDiagnostics.attribution_coverage?.exact_campaign_week_match_rate_non_generic_details)}</strong>
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>
                    Exact-matched campaign spend coverage (live Meta free spend only): <strong>{pct(campaignDiagnostics.attribution_coverage?.exact_matched_campaign_spend_share_of_live_meta_free_spend)}</strong>
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
                    Ad set diagnostics are not supported yet because first-touch ad set IDs are not stored reliably on contacts.
                  </p>
                  {!!campaignDiagnostics.notes?.length && (
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#334155', fontSize: '11px', lineHeight: 1.45 }}>
                      {campaignDiagnostics.notes.map((note, idx) => <li key={`camp-note-${idx}`}>{note}</li>)}
                    </ul>
                  )}
                </div>

                <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>What To Do (Campaign-Level)</p>
                  <ol style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#334155', fontSize: '11px', lineHeight: 1.45 }}>
                    {(campaignDiagnostics.recommended_actions || []).map((item, idx) => (
                      <li key={`camp-act-${idx}`}>{item}</li>
                    ))}
                  </ol>
                </div>

                <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Unmatched Campaign Labels (HubSpot)</p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                    These labels had non-generic campaign detail but did not exact-match a Meta campaign name in the same week.
                  </p>
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {(campaignDiagnostics.unmatched_campaign_labels_top || []).slice(0, 8).map((row) => (
                      <div key={`unmatched-${row.label}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px', color: '#334155' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                        <strong>{int(row.leads)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '10px' }}>
            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Meta Ads Expert (Click-to-Generate Playbook)</p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                    Generates step-by-step, copy/paste instructions using this snapshot’s CPL/CPQL/campaign signals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyPlaybook}
                  style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '6px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy Failed' : 'Copy Playbook'}
                </button>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  ['weekly_checklist', 'Weekly Checklist'],
                  ['creative_refresh_sprint', 'Creative Refresh Sprint'],
                  ['campaign_triage', 'Campaign Triage'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActivePlaybookKey(key)}
                    style={{
                      border: '1px solid #cbd5e1',
                      backgroundColor: activePlaybookKey === key ? '#e0f2fe' : '#fff',
                      color: activePlaybookKey === key ? '#075985' : '#334155',
                      borderRadius: '999px',
                      padding: '6px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                readOnly
                value={activePlaybookText}
                style={{
                  marginTop: '8px',
                  width: '100%',
                  minHeight: '320px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '11px',
                  lineHeight: 1.4,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  color: '#0f172a',
                  backgroundColor: '#fff',
                }}
              />
            </div>

            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>How To Use This Safely</p>
              <ol style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#334155', fontSize: '11px', lineHeight: 1.45 }}>
                <li>Use this as the weekly execution guide after checking Weekly Signoff.</li>
                <li>Validate the math by clicking the CPL / CPQL / campaign boxes before changing spend.</li>
                <li>Make one major change set per week (creative, audience, or form), not all three at once.</li>
                <li>Judge winners on CPQL/CPGL and member quality signals, not CPL alone.</li>
                <li>Treat ideal-member outputs as directional until the sample size warning clears.</li>
              </ol>
              <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#64748b' }}>
                Next step for true ad-set diagnostics: store first-touch Meta ad set/ad IDs on the HubSpot contact at lead creation.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeDiagnosticCard && (
        <div style={{ ...subCard, marginBottom: '14px', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{activeDiagnosticCard.label}</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                {activeDiagnosticCard.drilldown?.formula || 'No formula provided'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: signalBadge(activeDiagnosticCard.status).bg, color: signalBadge(activeDiagnosticCard.status).color, fontSize: '10px', fontWeight: 700 }}>
                {signalBadge(activeDiagnosticCard.status).label}
              </span>
              <button
                type="button"
                onClick={() => setActiveDiagnosticCardKey(null)}
                style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '6px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
              >
                Close Math
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '8px' }}>
            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Result</p>
              <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                {formatValueByFormat(activeDiagnosticCard.value, activeDiagnosticCard.format)}
              </p>
            </div>
            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                {activeDiagnosticCard.drilldown?.numerator?.label || 'Numerator'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                {formatValueByFormat(activeDiagnosticCard.drilldown?.numerator?.value, activeDiagnosticCard.drilldown?.numerator?.format)}
              </p>
            </div>
            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                {activeDiagnosticCard.drilldown?.denominator?.label || 'Denominator'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                {formatValueByFormat(activeDiagnosticCard.drilldown?.denominator?.value, activeDiagnosticCard.drilldown?.denominator?.format)}
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>How this box was calculated</p>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#334155', lineHeight: 1.5 }}>
                {activeDiagnosticCard.drilldown?.formula || 'N/A'}
              </p>
              {!!activeDiagnosticCard.drilldown?.trend_comparison && (
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#334155' }}>
                  {activeDiagnosticCard.drilldown.trend_comparison.label}: <strong>{ratioLabel(activeDiagnosticCard.drilldown.trend_comparison.ratio)}</strong>
                  {' '}({Number.isFinite(Number(activeDiagnosticCard.drilldown.trend_comparison.ratio))
                    ? `${Number(activeDiagnosticCard.drilldown.trend_comparison.ratio).toFixed(2)}x`
                    : 'N/A'})
                </p>
              )}
              {!!Object.entries(activeDiagnosticCard.drilldown?.reference_values || {}).length && (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>Reference values</p>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#334155', fontSize: '11px', lineHeight: 1.45 }}>
                    {Object.entries(activeDiagnosticCard.drilldown.reference_values).map(([key, value]) => (
                      <li key={key}>
                        {key.replaceAll('_', ' ')}: {typeof value === 'number'
                          ? (key.includes('rate') || key.includes('share') ? pct(value) : currency(value))
                          : String(value ?? 'N/A')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!activeDiagnosticCard.drilldown?.notes?.length && (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>Interpretation notes</p>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#334155', fontSize: '11px', lineHeight: 1.45 }}>
                    {activeDiagnosticCard.drilldown.notes.map((note, idx) => (
                      <li key={`note-${idx}`}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>Cohort weeks included</p>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#334155' }}>
                {int(activeDiagnosticCard.drilldown?.window_weeks?.length || 0)} week(s)
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                {(activeDiagnosticCard.drilldown?.window_weeks || []).slice(0, 1)[0] || 'N/A'}
                {(activeDiagnosticCard.drilldown?.window_weeks || []).length > 1
                  ? ` to ${(activeDiagnosticCard.drilldown?.window_weeks || []).slice(-1)[0]}`
                  : ''}
              </p>
              <div style={{ marginTop: '8px', maxHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff', padding: '6px' }}>
                {(activeDiagnosticCard.drilldown?.window_weeks || []).map((week) => (
                  <div key={`week-${week}`} style={{ fontSize: '11px', color: '#334155', padding: '2px 0' }}>{week}</div>
                ))}
                {(!activeDiagnosticCard.drilldown?.window_weeks || activeDiagnosticCard.drilldown.window_weeks.length === 0) && (
                  <div style={{ fontSize: '11px', color: '#64748b' }}>No week list provided</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
        <div style={subCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>High-Value Nudge Candidates</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                ICP profile + strong attendance, not yet at 11 show-ups
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrilldownKey('high_value_nudge_candidates')}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
            >
              {int(nudgeCandidates.length)} rows
            </button>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {nudgeCandidates.slice(0, 4).map((row) => (
              <button
                key={`nudge-${row.hubspot_contact_id}`}
                type="button"
                onClick={() => setActiveDrilldownKey('high_value_nudge_candidates')}
                style={{ textAlign: 'left', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{row.display_name}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#1d4ed8', backgroundColor: '#eff6ff', borderRadius: '999px', padding: '3px 7px' }}>
                    {row.ideal_candidate_likelihood || 'N/A'}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                  {int(row.total_showups)} show-ups · {int(row.shows_remaining_to_ideal)} to ideal · {int(row.missed_primary_group_sessions_since_last_showup)} missed in {row.primary_attendance_group || 'group'}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: row.nudge_recommended_now ? '#b45309' : '#64748b', fontWeight: row.nudge_recommended_now ? 700 : 500 }}>
                  {row.nudge_reason || 'No nudge signal yet'}
                </p>
              </button>
            ))}
            {nudgeCandidates.length === 0 && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>No current candidates in this snapshot.</p>}
          </div>
        </div>

        <div style={subCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Strong Members Outside ICP</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                Great members worth retention even if they fail current ICP math
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrilldownKey('strong_non_icp_members')}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
            >
              {int(strongNonIcpMembers.length)} rows
            </button>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {strongNonIcpMembers.slice(0, 5).map((row) => (
              <button
                key={`nonicp-${row.hubspot_contact_id}`}
                type="button"
                onClick={() => setActiveDrilldownKey('strong_non_icp_members')}
                style={{ textAlign: 'left', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{row.display_name}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155', backgroundColor: '#f8fafc', borderRadius: '999px', padding: '3px 7px' }}>
                    {int(row.total_showups)} shows
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                  {row.icp_gap_reason || 'Outside ICP (current model)'}{row.primary_attendance_group ? ` · ${row.primary_attendance_group}` : ''}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: row.nudge_recommended_now ? '#b45309' : '#64748b', fontWeight: row.nudge_recommended_now ? 700 : 500 }}>
                  {row.nudge_reason || 'No nudge signal yet'}
                </p>
              </button>
            ))}
            {strongNonIcpMembers.length === 0 && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>No rows in this snapshot.</p>}
          </div>
        </div>
      </div>

      <div style={{ ...subCard, marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Weekly Accuracy Check-In</p>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
              Run this review weekly ({weeklyCheckin.recommended_day || 'Monday'}) before making spend decisions or removing legacy metrics.
            </p>
          </div>
          <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: '#eef2ff', color: '#3730a3', fontSize: '10px', fontWeight: 700 }}>
            Snapshot QA
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '8px' }}>
          {(weeklyCheckin.checks || []).map((check) => {
            const badge = statusBadge(check.status);
            const valueLabel = check.format === 'percent' ? pct(check.value) : int(check.value);
            const canDrill = !!check.drilldown_key && (drilldowns?.[check.drilldown_key] || []).length > 0;
            return (
              <div key={check.key} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '11px', color: '#334155', lineHeight: 1.35 }}>{check.label}</p>
                  <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '3px 7px', borderRadius: '999px', backgroundColor: badge.bg, color: badge.color, fontSize: '10px', fontWeight: 700 }}>{badge.label}</span>
                    {canDrill ? (
                      <button
                        type="button"
                        onClick={() => setActiveDrilldownKey(check.drilldown_key)}
                        style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '999px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {valueLabel} (view rows)
                      </button>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: '999px', backgroundColor: '#f8fafc', color: '#334155', fontSize: '11px', fontWeight: 700 }}>{valueLabel}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        {metrics.map((metric) => (
          <MetricPreviewCard key={metric.key} metric={metric} lagStat={lagStats[metric.key]} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div style={{ ...subCard, overflowX: 'auto' }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Metric Detail Table (Preview Snapshot)</p>
          <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#fff' }}>
                {['Metric', 'Finalized CPA', 'Projected CPA', 'Finalized Conv', 'Finalized Spend', 'Finalized Rate', 'Horizon'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#0f172a', fontWeight: 600 }}>{m.label}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px' }}>{currency(m?.finalized?.cpa)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px' }}>{currency(m?.projected?.projected_cpa)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px' }}>{int(m?.finalized?.conversions)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px' }}>{currency(m?.finalized?.spend)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px' }}>{pct(m?.finalized?.conversion_rate)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '12px' }}>
                    {Number.isFinite(Number(m?.finalized_horizon_days)) ? `${int(m.finalized_horizon_days)}d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={subCard}>
            <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Methodology Notes</p>
            <p style={{ margin: 0, fontSize: '11px', color: '#475569', lineHeight: 1.5 }}>{data.methodology?.cohort_unit}</p>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#475569', lineHeight: 1.5 }}>{data.methodology?.spend_source}</p>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#475569', lineHeight: 1.5 }}>{data.methodology?.quality_definition}</p>
          </div>

          {backfill && (
            <div style={subCard}>
              <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Manual Spend Backfill Used</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#475569' }}>
                Week-end rows: {int(backfill.week_end_columns)} · Known: {int(backfill.known_spend_rows)} · Unknown blanks: {int(backfill.unknown_spend_rows)}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#475569' }}>
                Added spend: {currency(backfill.allocated_spend_total)} (including transition overlap)
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>
                {backfill.assumption}
              </p>
            </div>
          )}

          {naive && (
            <div style={subCard}>
              <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Naive 90-Day Period Math (Reference)</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#475569' }}>
                Window {naive.window_start} to {naive.window_end}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>Spend: {currency(naive.spend)}</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                First Show-Up CPA: {currency(naive?.cpa?.first_showup)} · Great Member CPA: {currency(naive?.cpa?.great_member)}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
                Included for comparison only. Cohort lag-aware metrics above are the decision path.
              </p>
            </div>
          )}
        </div>
      </div>

      {activeDrilldown && (
        <div style={{ ...subCard, marginTop: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{activeDrilldown.title}</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>Rows: {int(activeDrilldown.rows.length)}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrilldownKey(null)}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              Close Drilldown
            </button>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto', backgroundColor: '#fff' }}>
            <table style={{ width: '100%', minWidth: '960px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  {(activeDrilldown.columns || []).map((col) => (
                    <th key={col.key} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569', textTransform: 'uppercase' }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(activeDrilldown.rows || []).map((row, idx) => (
                  <tr key={`${activeDrilldown.key}-${row?.hubspot_contact_id || idx}`}>
                    {(activeDrilldown.columns || []).map((col) => (
                      <td key={col.key} style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', verticalAlign: 'top' }}>
                        {renderCell(row, col)}
                      </td>
                    ))}
                  </tr>
                ))}
                {(!activeDrilldown.rows || activeDrilldown.rows.length === 0) && (
                  <tr>
                    <td colSpan={(activeDrilldown.columns || []).length || 1} style={{ padding: '12px', fontSize: '12px', color: '#64748b' }}>
                      No rows available in this drilldown.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
