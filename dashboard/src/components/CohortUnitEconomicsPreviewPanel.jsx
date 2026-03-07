import React, { useMemo, useRef, useState } from 'react';
import preview from '../data/metaCohortUnitEconPreview.json';
import META_AD_TRAINING_INSTRUCTION_PACK from '../data/metaAdTrainingInstructionPack';
import SendToNotionModal from './SendToNotionModal';

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
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);

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

function formatShortDate(v) {
  if (!v) return 'N/A';
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    const alt = new Date(v);
    if (Number.isNaN(alt.getTime())) return String(v);
    return alt.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' });
}

function parseDateOnlyUtc(v) {
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDaysDate(date, days) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function dateKeyUtc(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function floorDaysBetween(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return null;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function parseWeekWindowLabel(label) {
  const txt = String(label || '');
  const m = txt.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const firstWeekStart = parseDateOnlyUtc(m[1]);
  const lastWeekStart = parseDateOnlyUtc(m[2]);
  if (!firstWeekStart || !lastWeekStart) return null;
  const inclusiveEnd = addDaysDate(lastWeekStart, 6);
  return {
    firstWeekStart,
    lastWeekStart,
    firstWeekStartKey: dateKeyUtc(firstWeekStart),
    lastWeekStartKey: dateKeyUtc(lastWeekStart),
    inclusiveEnd,
    inclusiveEndKey: dateKeyUtc(inclusiveEnd),
  };
}

function sobrietyAgeParts(sobrietyDateValue, nowDate = new Date()) {
  if (!sobrietyDateValue) return null;
  const raw = String(sobrietyDateValue);
  const d = raw.length <= 10 ? new Date(`${raw}T00:00:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date(nowDate);
  if (Number.isNaN(now.getTime())) return null;
  if (d > now) return { years: 0, months: 0 };

  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (!Number.isFinite(years) || !Number.isFinite(months)) return null;
  return { years: Math.max(0, years), months: Math.max(0, months) };
}

function formatSobrietyAge(sobrietyDateValue) {
  const parts = sobrietyAgeParts(sobrietyDateValue);
  if (!parts) return 'N/A';
  return `${parts.years}y ${parts.months}m`;
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

function deltaPctLabel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'N/A';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
}

function buildAiRequestPayload(data, { metaDiagnostics, metrics, weeklySignoff, nudgeCandidates, strongNonIcpMembers, greatLeadOutreachQueue }) {
  const compactMetrics = (metrics || []).map((m) => ({
    key: m.key,
    label: m.label,
    type: m.type,
    finalized_horizon_days: m.finalized_horizon_days,
    finalized: {
      cpa: m?.finalized?.cpa ?? null,
      conversions: m?.finalized?.conversions ?? null,
      conversion_rate: m?.finalized?.conversion_rate ?? null,
    },
    projected: m?.projected ? {
      projected_cpa: m.projected.projected_cpa ?? null,
      projected_conversions: m.projected.projected_conversions ?? null,
    } : null,
  }));
  const campaignRows = (metaDiagnostics?.campaign_diagnostics?.rows || []).slice(0, 12).map((r) => ({
    campaign_label: r.campaign_label,
    attribution_quality: r.attribution_quality,
    leads: r.leads,
    exact_match_leads: r.exact_match_leads,
    cpl_exact_campaign_week: r.cpl_exact_campaign_week,
    cpql_exact_campaign_week: r.cpql_exact_campaign_week,
    cpgl_exact_campaign_week: r.cpgl_exact_campaign_week,
    qualified_lead_rate: r.qualified_lead_rate,
    great_lead_rate: r.great_lead_rate,
    great_member_rate: r.great_member_rate,
    ideal_member_rate: r.ideal_member_rate,
    first_showup_rate: r.first_showup_rate,
    top_first_conversion_forms: r.top_first_conversion_forms || [],
  }));
  const compactPeople = (rows = []) => rows.slice(0, 5).map((r) => ({
    hubspot_contact_id: r.hubspot_contact_id,
    display_name: r.display_name,
    lead_date: r.lead_date,
    total_showups: r.total_showups,
    days_since_last_showup: r.days_since_last_showup,
    missed_primary_group_sessions_since_last_showup: r.missed_primary_group_sessions_since_last_showup,
    revenue_official_cached: r.revenue_official_cached,
    first_conversion_event_name: r.first_conversion_event_name,
    outreach_priority: r.outreach_priority,
    outreach_reason: r.outreach_reason,
    recommended_destination: r.recommended_destination,
  }));
  return {
    source_of_truth: 'HubSpot Calls (Tue/Thu group sessions) for attendance/show-ups; no legacy Zoom name matching in this payload',
    generated_at: data?.generated_at || null,
    methodology: {
      cohort_unit: data?.methodology?.cohort_unit || null,
      spend_source: data?.methodology?.spend_source || null,
      showup_source: data?.methodology?.showup_source || null,
      great_member_definition: data?.methodology?.great_member_definition || null,
      ideal_member_definition: data?.methodology?.ideal_member_definition || null,
    },
    weekly_signoff: weeklySignoff || null,
    data_quality: {
      counts: data?.data_quality?.counts || {},
      completeness_meta_free_analyzed: data?.data_quality?.completeness_meta_free_analyzed || {},
      date_range: data?.data_quality?.date_range || {},
    },
    meta_specialist_diagnostics: {
      status: metaDiagnostics?.status || null,
      cards: metaDiagnostics?.cards || [],
      ai_analysis: metaDiagnostics?.ai_analysis || null,
      cpl_trend_last_12_weeks: metaDiagnostics?.cpl_trend_last_12_weeks || [],
      campaign_diagnostics: {
        attribution_coverage: metaDiagnostics?.campaign_diagnostics?.attribution_coverage || null,
        recommended_actions: metaDiagnostics?.campaign_diagnostics?.recommended_actions || [],
        rows: campaignRows,
      },
    },
    metrics: compactMetrics,
    retention_outreach: {
      high_value_nudge_candidates_count: (nudgeCandidates || []).length,
      strong_non_icp_members_count: (strongNonIcpMembers || []).length,
      great_lead_outreach_queue_count: (greatLeadOutreachQueue || []).length,
      high_value_nudge_candidates_sample: compactPeople(nudgeCandidates || []),
      strong_non_icp_members_sample: compactPeople(strongNonIcpMembers || []),
      great_lead_outreach_queue_sample: compactPeople(greatLeadOutreachQueue || []),
    },
  };
}

function buildMetaExpertPlaybook({ key, metaDiagnostics, campaignDiagnostics, weeklySignoff }) {
  const cards = metaDiagnostics?.cards || [];
  const cardMap = new Map(cards.map((c) => [c.key, c]));
  const cpl4 = cardMap.get('cpl_trailing_4w');
  const cpl12 = cardMap.get('cpl_trailing_12w');
  const cpqlForecast = cardMap.get('cpql_current_entry_forecast');
  const cpglForecast = cardMap.get('cpgl_current_entry_forecast');
  const signoff = weeklySignoff || {};
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

export default function CohortUnitEconomicsPreviewPanel({ supabaseUrl = '', supabaseKey = '', placement = 'bottom' }) {
  const [activeDrilldownKey, setActiveDrilldownKey] = useState(null);
  const [activeDiagnosticCardKey, setActiveDiagnosticCardKey] = useState(null);
  const [showAuditChecks, setShowAuditChecks] = useState(false);
  const [campaignSort, setCampaignSort] = useState({ key: 'ideal_members', dir: 'desc' });
  const [activeCampaignKey, setActiveCampaignKey] = useState(null);
  const [activeCampaignStageKey, setActiveCampaignStageKey] = useState('all_leads');
  const [activePlaybookKey, setActivePlaybookKey] = useState('weekly_checklist');
  const [copyState, setCopyState] = useState('idle');
  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingProvider, setAiLoadingProvider] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [metaAdGuide, setMetaAdGuide] = useState(null);
  const [metaAdGuideLoading, setMetaAdGuideLoading] = useState(false);
  const [metaAdGuideError, setMetaAdGuideError] = useState(null);
  const [metaAdGuideCopyState, setMetaAdGuideCopyState] = useState('idle');
  const [showMetaAdTrainingPack, setShowMetaAdTrainingPack] = useState(false);
  const [notionModal, setNotionModal] = useState({ open: false, taskName: '' });
  const drilldownRef = useRef(null);
  const [viewMode, setViewMode] = useState('glance');
  const [sectionOpen, setSectionOpen] = useState({
    signoff: true,
    diagnostics: false,
    outreach: false,
    qa: false,
    metrics: false,
  });
  const data = preview ?? EMPTY_OBJECT;
  const hasMetrics = Array.isArray(data?.metrics) && data.metrics.length > 0;
  const isPrimary = placement === 'top';
  const isGlanceMode = isPrimary && viewMode === 'glance';

  const metrics = [...(hasMetrics ? data.metrics : EMPTY_ARRAY)].sort((a, b) => metricOrderKey(a.key) - metricOrderKey(b.key));
  const lagStats = data.lag_stats ?? EMPTY_OBJECT;
  const dq = data.data_quality ?? EMPTY_OBJECT;
  const counts = dq.counts ?? EMPTY_OBJECT;
  const dates = dq.date_range ?? EMPTY_OBJECT;
  const backfill = dq.spend_backfill_manual_week_end ?? null;
  const naive = data.naive_90d_period_cpa || null;
  const weeklyCheckin = data.weekly_checkin ?? EMPTY_OBJECT;
  const drilldowns = data.drilldowns ?? EMPTY_OBJECT;
  const metaDiagnostics = data.meta_specialist_diagnostics || null;
  const metaCards = metaDiagnostics?.cards ?? EMPTY_ARRAY;
  const campaignDiagnostics = metaDiagnostics?.campaign_diagnostics || null;
  const campaignCards = campaignDiagnostics?.cards ?? EMPTY_ARRAY;
  const campaignRows = campaignDiagnostics?.rows ?? EMPTY_ARRAY;
  const metaAiAnalysis = metaDiagnostics?.ai_analysis || null;
  const cplTrend = metaDiagnostics?.cpl_trend_last_12_weeks ?? EMPTY_ARRAY;
  const freeEventsSummary = data.free_events_summary || null;
  const weeklySignoff = data.weekly_signoff || null;
  const numberAudit = data.number_audit || { counts: {}, checks: [] };
  const diagnosticCards = useMemo(() => [...metaCards, ...campaignCards], [metaCards, campaignCards]);
  const glanceDiagnosticCardKeys = new Set([
    'cpl_trailing_4w',
    'cpl_trailing_12w',
    'cpql_current_entry_forecast',
    'cpgl_current_entry_forecast',
    'great_member_current_entry_forecast',
    'ideal_member_current_entry_forecast',
  ]);
  const metaCardsForDisplay = isGlanceMode
    ? metaCards.filter((c) => glanceDiagnosticCardKeys.has(c.key))
    : metaCards;
  const campaignDrilldowns = campaignDiagnostics?.drilldowns_by_campaign || {};
  const snapshotGeneratedAt = data?.generated_at ? new Date(data.generated_at) : null;
  const snapshotAgeHours = snapshotGeneratedAt && !Number.isNaN(snapshotGeneratedAt.getTime())
    ? (Date.now() - snapshotGeneratedAt.getTime()) / 3600000
    : null;
  const freeEventsWindowCurrentParsed = parseWeekWindowLabel(freeEventsSummary?.window_label_current);
  const attendanceAsOfDate = parseDateOnlyUtc(dates?.attendance_as_of);
  const latestCompleteAdWeekStartDate = parseDateOnlyUtc(dates?.last_complete_ad_week_start);
  const attendanceVsCohortWindowLagDays = (attendanceAsOfDate && freeEventsWindowCurrentParsed?.inclusiveEnd)
    ? floorDaysBetween(attendanceAsOfDate, freeEventsWindowCurrentParsed.inclusiveEnd)
    : null;
  const cohortScopeWarnings = [];
  if (Number.isFinite(snapshotAgeHours) && snapshotAgeHours > 24) {
    cohortScopeWarnings.push(`Snapshot is ${Math.floor(snapshotAgeHours)}h old (generated ${formatDateTime(data.generated_at)}).`);
  }
  if (Number.isFinite(attendanceVsCohortWindowLagDays) && attendanceVsCohortWindowLagDays > 3) {
    cohortScopeWarnings.push(
      `Attendance bars are newer than this cohort window by ${Math.round(attendanceVsCohortWindowLagDays)} day(s) because cohort cards are anchored to complete ad-spend cohort weeks.`,
    );
  }
  if (freeEventsWindowCurrentParsed?.lastWeekStartKey && latestCompleteAdWeekStartDate) {
    const latestCompleteAdWeekStartKey = dateKeyUtc(latestCompleteAdWeekStartDate);
    if (latestCompleteAdWeekStartKey && freeEventsWindowCurrentParsed.lastWeekStartKey !== latestCompleteAdWeekStartKey) {
      cohortScopeWarnings.push(
        `Current cohort window ends at week start ${freeEventsWindowCurrentParsed.lastWeekStartKey} while latest complete ad week start is ${latestCompleteAdWeekStartKey}.`,
      );
    }
  }

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
        { key: 'missed_primary_group_sessions_since_last_showup', label: 'Missed in a Row', type: 'number' },
        { key: 'ideal_candidate_likelihood', label: 'Likelihood' },
        { key: 'nudge_recommended_now', label: 'Nudge Now?' },
        { key: 'nudge_reason', label: 'Nudge Reason' },
        { key: 'revenue_official_cached', label: 'Revenue (Cached)', type: 'currency' },
        { key: 'sobriety_date', label: 'Sobriety Date' },
        { key: 'sobriety_age_current', label: 'Sobriety (Current)' },
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
        { key: 'missed_primary_group_sessions_since_last_showup', label: 'Missed in a Row', type: 'number' },
        { key: 'icp_gap_reason', label: 'Why Not ICP (Current Model)' },
        { key: 'nudge_recommended_now', label: 'Nudge Now?' },
        { key: 'nudge_reason', label: 'Nudge Reason' },
        { key: 'revenue_official_cached', label: 'Revenue (Cached)', type: 'currency' },
        { key: 'sobriety_date', label: 'Sobriety Date' },
        { key: 'sobriety_age_current', label: 'Sobriety (Current)' },
        { key: 'first_conversion_event_name', label: 'Meta Form / First Conversion' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    great_lead_outreach_queue: {
      title: 'Great Lead Outreach Queue (High-Touch Manual Follow-Up)',
      columns: [
        { key: 'display_name', label: 'Lead' },
        { key: 'outreach_priority', label: 'Priority' },
        { key: 'outreach_reason', label: 'Why Reach Out' },
        { key: 'recommended_destination', label: 'Suggested Invite' },
        { key: 'total_showups', label: 'Show-Ups', type: 'number' },
        { key: 'days_since_last_showup', label: 'Days Since Last', type: 'number' },
        { key: 'missed_primary_group_sessions_since_last_showup', label: 'Missed in a Row', type: 'number' },
        { key: 'revenue_official_cached', label: 'Revenue (Cached)', type: 'currency' },
        { key: 'sobriety_date', label: 'Sobriety Date' },
        { key: 'sobriety_age_current', label: 'Sobriety (Current)' },
        { key: 'first_conversion_event_name', label: 'Meta Form / First Conversion' },
        { key: 'suggested_subject', label: 'Email Subject' },
        { key: 'suggested_plain_text_email', label: 'Suggested Email', type: 'multiline' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    free_events_meta_leads: {
      title: 'Free Events — Meta Leads (Trailing 4 Cohort Weeks)',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'annual_revenue_in_usd_official', label: 'Annual Revenue in USD Official', type: 'currency' },
        { key: 'sobriety_date', label: 'Sobriety Date' },
        { key: 'how_they_found_us', label: 'How They Found Us' },
        { key: 'show_up', label: 'Show Up?' },
        { key: 'type', label: 'Type' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    free_events_meta_qualified_leads: {
      title: 'Free Events — Meta Qualified Leads (Trailing 4 Cohort Weeks)',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'annual_revenue_in_usd_official', label: 'Annual Revenue in USD Official', type: 'currency' },
        { key: 'sobriety_date', label: 'Sobriety Date' },
        { key: 'how_they_found_us', label: 'How They Found Us' },
        { key: 'show_up', label: 'Show Up?' },
        { key: 'type', label: 'Type' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    free_events_meta_great_leads: {
      title: 'Free Events — Meta Great Leads (Trailing 4 Cohort Weeks)',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'annual_revenue_in_usd_official', label: 'Annual Revenue in USD Official', type: 'currency' },
        { key: 'sobriety_date', label: 'Sobriety Date' },
        { key: 'how_they_found_us', label: 'How They Found Us' },
        { key: 'show_up', label: 'Show Up?' },
        { key: 'type', label: 'Type' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    free_events_luma_signups: {
      title: 'Free Events — Paid Luma Sign Ups (Trailing 4 Cohort Weeks)',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'annual_revenue_in_usd_official', label: 'Annual Revenue in USD Official', type: 'currency' },
        { key: 'sobriety_date', label: 'Sobriety Date' },
        { key: 'how_they_found_us', label: 'How They Found Us' },
        { key: 'show_up', label: 'Show Up?' },
        { key: 'type', label: 'Type' },
        { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
      ],
    },
    free_events_net_new_showups: {
      title: 'Free Events — Paid Meta Cohort First Show-Ups (Converter-Only, Trailing 4 Cohort Weeks)',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'annual_revenue_in_usd_official', label: 'Annual Revenue in USD Official', type: 'currency' },
        { key: 'sobriety_date', label: 'Sobriety Date' },
        { key: 'how_they_found_us', label: 'How They Found Us' },
        { key: 'show_up', label: 'Show Up?' },
        { key: 'type', label: 'Type' },
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
  const nudgeCandidates = drilldowns.high_value_nudge_candidates ?? EMPTY_ARRAY;
  const strongNonIcpMembers = drilldowns.strong_non_icp_members ?? EMPTY_ARRAY;
  const greatLeadOutreachQueue = drilldowns.great_lead_outreach_queue ?? EMPTY_ARRAY;
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
  const aiRequestPayload = useMemo(() => buildAiRequestPayload(data, {
    metaDiagnostics,
    metrics,
    weeklySignoff,
    nudgeCandidates,
    strongNonIcpMembers,
    greatLeadOutreachQueue,
  }), [data, metaDiagnostics, metrics, weeklySignoff, nudgeCandidates, strongNonIcpMembers, greatLeadOutreachQueue]);
  const metaAdGuideRequestPayload = useMemo(() => {
    const metricMap = new Map((metrics || []).map((m) => [m.key, m]));
    const metricSlice = ['luma_signup', 'first_showup', 'qualified_lead', 'great_lead', 'great_member', 'ideal_member']
      .map((key) => metricMap.get(key))
      .filter(Boolean)
      .map((m) => ({
        key: m.key,
        label: m.label,
        finalized_cpa: m?.finalized?.cpa ?? null,
        finalized_rate: m?.finalized?.conversion_rate ?? null,
        projected_cpa: m?.projected?.projected_cpa ?? null,
        projected_conversions: m?.projected?.projected_conversions ?? null,
      }));
    const diagCardMap = new Map((diagnosticCards || []).map((c) => [c.key, c]));
    const importantCardKeys = [
      'cpl_trailing_4w',
      'cpl_trailing_12w',
      'cpql_finalized',
      'cpql_current_entry_forecast',
      'cpgl_finalized',
      'cpgl_current_entry_forecast',
      'cpgm_finalized',
      'cpgm_current_entry_forecast',
      'cpim_finalized',
      'cpim_current_entry_forecast',
    ];
    const diagnosticCardSlice = importantCardKeys
      .map((key) => diagCardMap.get(key))
      .filter(Boolean)
      .map((c) => ({
        key: c.key,
        label: c.label,
        value: c.value,
        format: c.format,
        status: c.status,
        formula: c?.drilldown?.formula || null,
      }));
    const campaignRowsCompact = [...(campaignRows || [])]
      .sort((a, b) => {
        const aScore = Number.isFinite(Number(a?.cpql_exact_campaign_week)) ? Number(a.cpql_exact_campaign_week) : Number.POSITIVE_INFINITY;
        const bScore = Number.isFinite(Number(b?.cpql_exact_campaign_week)) ? Number(b.cpql_exact_campaign_week) : Number.POSITIVE_INFINITY;
        return aScore - bScore;
      })
      .slice(0, 8)
      .map((r) => ({
        campaign_label: r.campaign_label,
        attribution_quality: r.attribution_quality,
        leads: r.leads,
        exact_match_leads: r.exact_match_leads,
        cpl_exact_campaign_week: r.cpl_exact_campaign_week,
        cpql_exact_campaign_week: r.cpql_exact_campaign_week,
        cpgl_exact_campaign_week: r.cpgl_exact_campaign_week,
        cpgm_exact_campaign_week: r.cpgm_exact_campaign_week ?? null,
        cpim_exact_campaign_week: r.cpim_exact_campaign_week ?? null,
        qualified_lead_rate: r.qualified_lead_rate,
        great_lead_rate: r.great_lead_rate,
        first_showup_rate: r.first_showup_rate,
        great_member_rate: r.great_member_rate,
        ideal_member_rate: r.ideal_member_rate,
        top_first_conversion_forms: r.top_first_conversion_forms || [],
      }));
    const worstCampaignsCompact = [...(campaignRows || [])]
      .filter((r) => Number.isFinite(Number(r?.cpql_exact_campaign_week)) && (r?.exact_match_leads || 0) >= 8)
      .sort((a, b) => Number(b.cpql_exact_campaign_week) - Number(a.cpql_exact_campaign_week))
      .slice(0, 5)
      .map((r) => ({
        campaign_label: r.campaign_label,
        exact_match_leads: r.exact_match_leads,
        cpql_exact_campaign_week: r.cpql_exact_campaign_week,
        cpgl_exact_campaign_week: r.cpgl_exact_campaign_week,
        qualified_lead_rate: r.qualified_lead_rate,
        great_lead_rate: r.great_lead_rate,
      }));
    const samplePerson = (row) => ({
      hubspot_contact_id: row?.hubspot_contact_id,
      display_name: row?.display_name || row?.name,
      email: row?.email || null,
      lead_date: row?.lead_date || null,
      total_showups: row?.total_showups || (row?.show_up ? 1 : 0),
      revenue_official_cached: row?.revenue_official_cached ?? row?.annual_revenue_in_usd_official ?? null,
      sobriety_date: row?.sobriety_date || null,
      first_conversion_event_name: row?.first_conversion_event_name || null,
      hubspot_url: row?.hubspot_url || null,
    });
    return {
      source_of_truth: 'HubSpot Calls for attendance/show-ups (no legacy Zoom matching)',
      generated_at: data?.generated_at || null,
      weekly_signoff: weeklySignoff ? {
        status: weeklySignoff.status,
        summary: weeklySignoff.summary,
        top_warnings: weeklySignoff.top_warnings || [],
      } : null,
      data_quality: {
        counts: dq.counts || {},
        completeness_meta_free_analyzed: dq.completeness_meta_free_analyzed || {},
        campaign_attribution_coverage: campaignDiagnostics?.attribution_coverage || null,
      },
      key_metrics: metricSlice,
      important_diagnostic_cards: diagnosticCardSlice,
      free_events_summary: {
        category: freeEventsSummary?.category || 'Free Events',
        current_window: freeEventsSummary?.window_label_current || null,
        prior_window: freeEventsSummary?.window_label_prior || null,
        cards: (freeEventsSummary?.cards || []).map((c) => ({
          key: c.key,
          label: c.label,
          current_count: c.current_count,
          count_change_pct: c.count_change_pct,
          current_cost: c.current_cost,
          cost_change_pct: c.cost_change_pct,
        })),
      },
      cpl_trend_last_8_weeks: [...(cplTrend || [])]
        .sort((a, b) => String(b.week || '').localeCompare(String(a.week || '')))
        .slice(0, 8)
        .map((r, idx, arr) => {
          const prior = arr[idx + 1] || null;
          const curCpl = Number(r?.cpl);
          const priorCpl = Number(prior?.cpl);
          const wow = Number.isFinite(curCpl) && Number.isFinite(priorCpl) && priorCpl > 0 ? (curCpl - priorCpl) / priorCpl : null;
          return {
            week: r.week,
            cpl: r.cpl,
            leads: r.leads,
            spend: r.spend,
            wow_cpl_pct: wow,
          };
        }),
      campaign_diagnostics: {
        top_quality_candidates: campaignRowsCompact,
        worst_cpql_watchlist: worstCampaignsCompact,
      },
      outcome_examples: {
        ideal_members: (drilldowns.ideal_members || []).slice(0, 5).map(samplePerson),
        great_members: (drilldowns.great_members || []).slice(0, 8).map(samplePerson),
        high_value_nudge_candidates: (nudgeCandidates || []).slice(0, 8).map(samplePerson),
        strong_non_icp_members: (strongNonIcpMembers || []).slice(0, 8).map(samplePerson),
      },
    };
  }, [
    metrics,
    diagnosticCards,
    campaignRows,
    campaignDiagnostics,
    data,
    weeklySignoff,
    dq,
    freeEventsSummary,
    cplTrend,
    drilldowns,
    nudgeCandidates,
    strongNonIcpMembers,
  ]);
  const activeCampaignDrilldown = activeCampaignKey ? (campaignDrilldowns?.[activeCampaignKey] || null) : null;
  const activeCampaignStageRows = activeCampaignDrilldown?.rows?.[activeCampaignStageKey] || [];
  const cplTrendNewestFirst = useMemo(() => {
    const rows = [...(cplTrend || [])].sort((a, b) => String(b.week || '').localeCompare(String(a.week || '')));
    return rows.map((row, idx) => {
      const priorWeek = rows[idx + 1] || null; // older row in display order
      const curCpl = Number(row?.cpl);
      const priorCpl = Number(priorWeek?.cpl);
      const wowPct = Number.isFinite(curCpl) && Number.isFinite(priorCpl) && priorCpl > 0
        ? (curCpl - priorCpl) / priorCpl
        : null;
      return { ...row, wow_cpl_pct: wowPct };
    });
  }, [cplTrend]);
  if (!hasMetrics) return null;
  const campaignStageTabs = [
    ['all_leads', 'All Leads'],
    ['luma_signups', 'Luma'],
    ['first_showups', '1st Show-Up'],
    ['qualified_leads', 'QL'],
    ['great_leads', 'GL'],
    ['great_members', 'GM'],
    ['ideal_members', 'IM'],
  ];
  const campaignStageColumns = [
    { key: 'display_name', label: 'Name' },
    { key: 'lead_week', label: 'Lead Week' },
    { key: 'lead_date', label: 'Lead Date' },
    { key: 'exact_campaign_week_match', label: 'Exact Match?' },
    { key: 'total_showups', label: 'Show-Ups', type: 'number' },
    { key: 'qualified_lead', label: 'QL?' },
    { key: 'great_lead', label: 'GL?' },
    { key: 'great_member', label: 'GM?' },
    { key: 'ideal_member', label: 'IM?' },
    { key: 'revenue_official_cached', label: 'Revenue', type: 'currency' },
    { key: 'first_conversion_event_name', label: 'Meta Form' },
    { key: 'hs_analytics_source_data_2', label: 'HubSpot Campaign Detail' },
    { key: 'hubspot_url', label: 'HubSpot', type: 'link' },
  ];

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

  function toggleSection(key) {
    setSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function openDrilldown(key) {
    if (!key) return;
    setActiveDrilldownKey(key);
    setTimeout(() => {
      try {
        drilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) {
        drilldownRef.current?.scrollIntoView?.();
      }
    }, 0);
  }

  async function runProviderAnalysis(provider) {
    const modeByProvider = {
      openai: 'analyze_openai',
      gemini: 'analyze_gemini',
    };
    const mode = modeByProvider[provider];
    if (!mode) return;
    if (!supabaseUrl || !supabaseKey) {
      setAiError('Missing Supabase URL or anon key in frontend env.');
      return;
    }
    setAiLoading(true);
    setAiLoadingProvider(provider);
    setAiError(null);
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-leads-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          mode,
          dateLabel: 'Cohort Unit Economics Snapshot (HubSpot Calls only)',
          currentData: provider === 'openai' ? metaAdGuideRequestPayload : aiRequestPayload,
          previousData: null,
          ...(provider === 'openai' ? { trainingPack: META_AD_TRAINING_INSTRUCTION_PACK } : {}),
        }),
      });
      const json = await resp.json();
      if (!json?.ok) {
        setAiError(json?.error || 'Analysis request failed');
        return;
      }
      setAiData((prev) => ({
        ...(prev || {}),
        provider: json.provider || provider,
        ...(json.openai ? { openai: json.openai } : {}),
        ...(json.gemini ? { gemini: json.gemini } : {}),
        ...(json.claude ? { claude: json.claude } : {}),
        ...(Array.isArray(json.consensus) ? { consensus: json.consensus } : {}),
        ...(Array.isArray(json.autonomous_actions) ? { autonomous_actions: json.autonomous_actions } : {}),
        ...(Array.isArray(json.human_actions) ? { human_actions: json.human_actions } : {}),
      }));
    } catch (err) {
      setAiError(String(err?.message || err));
    } finally {
      setAiLoading(false);
      setAiLoadingProvider(null);
    }
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(String(text));
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1200);
    } catch (_) {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 1800);
    }
  }

  async function copyMetaAdGuideExport() {
    if (!metaAdGuide?.export_text) return;
    try {
      await navigator.clipboard.writeText(String(metaAdGuide.export_text));
      setMetaAdGuideCopyState('copied');
      setTimeout(() => setMetaAdGuideCopyState('idle'), 1200);
    } catch (_) {
      setMetaAdGuideCopyState('error');
      setTimeout(() => setMetaAdGuideCopyState('idle'), 1800);
    }
  }

  async function runMetaAdGuideGenerator() {
    if (!supabaseUrl || !supabaseKey) {
      setMetaAdGuideError('Missing Supabase URL or anon key in frontend env.');
      return;
    }
    setMetaAdGuideLoading(true);
    setMetaAdGuideError(null);
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-leads-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          mode: 'generate_meta_ad_guide_openai',
          dateLabel: 'Cohort Unit Economics Snapshot (HubSpot Calls only)',
          currentData: metaAdGuideRequestPayload,
          previousData: null,
          trainingPack: META_AD_TRAINING_INSTRUCTION_PACK,
        }),
      });
      const json = await resp.json();
      if (!json?.ok) {
        setMetaAdGuideError(json?.error || 'Meta Ad generator request failed');
        return;
      }
      setMetaAdGuide(json.meta_ad_guide || null);
    } catch (err) {
      setMetaAdGuideError(String(err?.message || err));
    } finally {
      setMetaAdGuideLoading(false);
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
    if ((col.key === 'display_name' || col.key === 'name') && row?.hubspot_url && value) {
      return (
        <a href={row.hubspot_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
          {String(value)}
        </a>
      );
    }
    if (col.key === 'sobriety_age_current') return formatSobrietyAge(row?.sobriety_date);
    if (col.type === 'currency') return currency(value);
    if (col.type === 'number') return int(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (col.type === 'multiline') {
      if (!value) return '—';
      return (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '11px', lineHeight: 1.35, color: '#334155', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
          {String(value)}
        </pre>
      );
    }
    if (col.type === 'link') {
      if (!value) return '—';
      return (
        <a href={value} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>
          Open
        </a>
      );
    }
    if (col.key === 'sobriety_date' && value) return formatShortDate(value);
    if ((col.key === 'createdate' || String(col.key || '').endsWith('_at')) && value) return formatDateTime(value);
    return String(value ?? '—');
  }

  function ProviderPanel({ title, dataRow, color }) {
    return (
      <div style={{ backgroundColor: '#fff', border: `1px solid ${color}33`, borderRadius: '12px', padding: '12px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: '11px', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</p>
          {dataRow?.model && <span style={{ fontSize: '10px', color: '#64748b' }}>{String(dataRow.model).replace(' (LIVE)', '')}</span>}
        </div>
        {dataRow ? (
          <>
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#334155', lineHeight: 1.45 }}>{dataRow.summary || 'No summary returned.'}</p>
            {!!dataRow?.insights?.length && (
              <ul style={{ margin: '8px 0 0', paddingLeft: '16px', fontSize: '11px', color: '#475569', lineHeight: 1.4 }}>
                {dataRow.insights.slice(0, 5).map((item, idx) => <li key={`${title}-${idx}`}>{item}</li>)}
              </ul>
            )}
            {dataRow.is_mock && <p style={{ margin: '8px 0 0', fontSize: '10px', color: '#94a3b8' }}>Fallback response (provider unavailable or quota issue)</p>}
            {dataRow.provider_error && <p style={{ margin: '8px 0 0', fontSize: '10px', color: '#b91c1c' }}>Provider error: {dataRow.provider_error}</p>}
          </>
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#94a3b8' }}>Run on-demand analysis for this HubSpot-call cohort snapshot.</p>
        )}
      </div>
    );
  }

  return (
    <div style={{
      ...card,
      background: isPrimary ? 'linear-gradient(180deg, #fff, #f8fbff 36%, #ffffff 100%)' : card.backgroundColor,
      border: isPrimary ? '1px solid #bfdbfe' : card.border,
      boxShadow: isPrimary ? '0 10px 28px rgba(15, 23, 42, 0.06)' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: isPrimary ? '20px' : '18px', color: '#0f172a' }}>
              {isPrimary ? 'Leads Decision Layer (Meta Cohorts + HubSpot Calls)' : 'Cohort Unit Economics Preview (Bottom Test Section)'}
            </h3>
            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
              HubSpot Calls only for show-ups
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
            {isPrimary
              ? (isGlanceMode
                ? 'Glance view: action summary, Free Events KPIs, and click drilldowns first. Switch to Analyst view for full campaign workbench and QA.'
                : 'Analyst view: full cohort diagnostics, campaign workbench, QA, and AI playbooks. HubSpot Calls only for show-up truth.')
              : 'Snapshot from the cohort analysis script with manual weekly Meta spend backfill. Existing Leads module above is unchanged for comparison.'}
          </p>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
          {isPrimary && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setViewMode('glance')}
                style={{
                  border: '1px solid #cbd5e1',
                  backgroundColor: viewMode === 'glance' ? '#e0f2fe' : '#fff',
                  color: viewMode === 'glance' ? '#075985' : '#334155',
                  borderRadius: '999px',
                  padding: '4px 10px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Glance
              </button>
              <button
                type="button"
                onClick={() => setViewMode('analyst')}
                style={{
                  border: '1px solid #cbd5e1',
                  backgroundColor: viewMode === 'analyst' ? '#e0f2fe' : '#fff',
                  color: viewMode === 'analyst' ? '#075985' : '#334155',
                  borderRadius: '999px',
                  padding: '4px 10px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Analyst
              </button>
            </div>
          )}
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Snapshot Generated</p>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#0f172a', fontWeight: 700 }}>{formatDateTime(data.generated_at)}</p>
        </div>
      </div>

      <details style={{ ...subCard, marginBottom: '14px', backgroundColor: '#fff' }} open={!isGlanceMode}>
        <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
          Data Context ({isGlanceMode ? 'tap to expand' : 'snapshot scope and coverage'})
        </summary>
        <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
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
      </details>

      <div style={{ ...subCard, marginBottom: '14px', backgroundColor: '#fff', borderColor: '#dbeafe' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '10px' }}>
          <div style={{ ...subCard, backgroundColor: '#f8fbff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Action Summary + Analyst Reviews</p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                  {isGlanceMode
                    ? 'Run AI on demand for a concise read + next steps. Expand analyst outputs only when needed.'
                    : 'On-demand AI analysis for the audited cohort snapshot (HubSpot Calls only for attendance/show-up truth).'}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#92400e', fontWeight: 600 }}>
                  Recommended future: automatic weekly analysis (saved history). For now, run on demand only.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => runProviderAnalysis('openai')}
                  disabled={aiLoading}
                  style={{ border: 'none', backgroundColor: '#166534', color: '#fff', borderRadius: '10px', padding: '8px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: aiLoading ? 0.7 : 1 }}
                >
                  {aiLoadingProvider === 'openai' ? 'Running OpenAI...' : 'Run OpenAI'}
                </button>
                <button
                  type="button"
                  onClick={() => runProviderAnalysis('gemini')}
                  disabled={aiLoading}
                  style={{ border: 'none', backgroundColor: '#0f766e', color: '#fff', borderRadius: '10px', padding: '8px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: aiLoading ? 0.7 : 1 }}
                >
                  {aiLoadingProvider === 'gemini' ? 'Running Gemini...' : 'Run Gemini'}
                </button>
                <button
                  type="button"
                  disabled
                  title="Claude key not configured yet"
                  style={{ border: 'none', backgroundColor: '#e2e8f0', color: '#64748b', borderRadius: '10px', padding: '8px 12px', fontSize: '11px', fontWeight: 700, cursor: 'not-allowed' }}
                >
                  Claude (Key Needed)
                </button>
              </div>
            </div>
            {aiError && (
              <div style={{ marginTop: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', color: '#991b1b' }}>
                {aiError}
              </div>
            )}
            <details style={{ marginTop: '8px' }} open={!isGlanceMode}>
              <summary style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                AI Analyst Outputs {aiData ? '(loaded)' : '(collapsed)'}
              </summary>
              <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                <ProviderPanel title="OpenAI" dataRow={aiData?.openai} color="#166534" />
                <ProviderPanel title="Gemini" dataRow={aiData?.gemini} color="#0f766e" />
                <ProviderPanel title="Claude" dataRow={aiData?.claude} color="#b45309" />
              </div>
              {(Array.isArray(aiData?.human_actions) && aiData.human_actions.length > 0) && (
                <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ ...subCard, backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#1d4ed8' }}>AI Can Do (Future Workflow Targets)</p>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '16px', fontSize: '11px', color: '#1e3a8a', lineHeight: 1.4 }}>
                      {(aiData.autonomous_actions || []).slice(0, 6).map((item, idx) => <li key={`auto-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                  <div style={{ ...subCard, backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#92400e' }}>Human Needed Next Steps</p>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '16px', fontSize: '11px', color: '#78350f', lineHeight: 1.4, listStyle: 'none' }}>
                      {(aiData.human_actions || []).slice(0, 6).map((item, idx) => (
                        <li key={`human-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ flex: 1 }}>• {item}</span>
                          <button
                            onClick={() => setNotionModal({ open: true, taskName: item })}
                            title="Send to Notion To-Do"
                            style={{
                              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '2px 7px', borderRadius: '6px', border: '1px solid #d4d4d4',
                              backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer',
                              fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                          >
                            <span style={{ fontWeight: 800, fontSize: '11px' }}>N</span> → Notion
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <SendToNotionModal
                    isOpen={notionModal.open}
                    onClose={() => setNotionModal({ open: false, taskName: '' })}
                    defaultTaskName={notionModal.taskName}
                  />
                </div>
              )}
            </details>
            <div style={{ ...subCard, marginTop: '8px', backgroundColor: '#ffffff', borderColor: '#dbeafe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                    Meta Ad Generator (Expert AI, On Demand)
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                    Generates the next ads and test variants using your Meta training docs + the current audited cohort/campaign snapshot.
                  </p>
                  <div style={{ marginTop: '5px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(META_AD_TRAINING_INSTRUCTION_PACK.sourceDocuments || []).map((doc) => (
                      <span
                        key={`meta-train-doc-${doc}`}
                        style={{ padding: '3px 7px', borderRadius: '999px', backgroundColor: '#eef2ff', color: '#3730a3', fontSize: '10px', fontWeight: 700 }}
                      >
                        {doc}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={runMetaAdGuideGenerator}
                    disabled={metaAdGuideLoading}
                    style={{ border: 'none', backgroundColor: '#1d4ed8', color: '#fff', borderRadius: '10px', padding: '8px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: metaAdGuideLoading ? 0.7 : 1 }}
                  >
                    {metaAdGuideLoading ? 'Generating...' : 'Generate Next Ads'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMetaAdTrainingPack((v) => !v)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '8px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {showMetaAdTrainingPack ? 'Hide Training Pack' : 'View Training Pack'}
                  </button>
                  <button
                    type="button"
                    onClick={copyMetaAdGuideExport}
                    disabled={!metaAdGuide?.export_text}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '8px 12px', fontSize: '11px', fontWeight: 700, cursor: metaAdGuide?.export_text ? 'pointer' : 'not-allowed', opacity: metaAdGuide?.export_text ? 1 : 0.55 }}
                  >
                    {metaAdGuideCopyState === 'copied' ? 'Copied' : metaAdGuideCopyState === 'error' ? 'Copy Failed' : 'Copy Full Guide'}
                  </button>
                </div>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#92400e', fontWeight: 600 }}>
                Recommended future: automatic weekly ad-generation suggestions with snapshot history. Currently runs on demand only.
              </p>
              {metaAdGuideError && (
                <div style={{ marginTop: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', color: '#991b1b' }}>
                  {metaAdGuideError}
                </div>
              )}
              {showMetaAdTrainingPack && (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ margin: 0, fontSize: '11px', color: '#334155', fontWeight: 700 }}>Training Pack Summary</p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569', lineHeight: 1.4 }}>
                    {META_AD_TRAINING_INSTRUCTION_PACK.summary}
                  </p>
                  <textarea
                    readOnly
                    value={META_AD_TRAINING_INSTRUCTION_PACK.instructionPack}
                    style={{
                      marginTop: '6px',
                      width: '100%',
                      minHeight: '180px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '10px',
                      fontSize: '11px',
                      lineHeight: 1.4,
                      color: '#0f172a',
                      backgroundColor: '#fff',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    }}
                  />
                </div>
              )}
              {metaAdGuide && (
                <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                  <div style={{ ...subCard, backgroundColor: '#f8fbff', borderColor: '#dbeafe' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '3px 7px', borderRadius: '999px', backgroundColor: signalBadge(metaAdGuide.status).bg, color: signalBadge(metaAdGuide.status).color, fontSize: '10px', fontWeight: 700 }}>
                          {signalBadge(metaAdGuide.status).label}
                        </span>
                        {metaAdGuide.model && <span style={{ fontSize: '10px', color: '#64748b' }}>{String(metaAdGuide.model).replace(' (LIVE)', '')}</span>}
                        {metaAdGuide.timestamp && <span style={{ fontSize: '10px', color: '#94a3b8' }}>{formatDateTime(metaAdGuide.timestamp)}</span>}
                      </div>
                      {metaAdGuide.is_mock && (
                        <span style={{ fontSize: '10px', color: '#92400e', fontWeight: 700 }}>
                          Fallback response
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#334155', lineHeight: 1.45 }}>
                      {metaAdGuide.summary || 'No guide summary returned.'}
                    </p>
                    {!!metaAdGuide.provider_error && (
                      <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#b91c1c' }}>
                        Provider error: {metaAdGuide.provider_error}
                      </p>
                    )}
                  </div>

                  {!!metaAdGuide.performance_read?.length && (
                    <details style={{ ...subCard, backgroundColor: '#fff' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                        What the Data Says ({metaAdGuide.performance_read.length})
                      </summary>
                      <ul style={{ margin: '8px 0 0', paddingLeft: '16px', fontSize: '11px', color: '#334155', lineHeight: 1.45 }}>
                        {metaAdGuide.performance_read.map((item, idx) => <li key={`metaad-read-${idx}`}>{item}</li>)}
                      </ul>
                    </details>
                  )}

                  {!!metaAdGuide.strategic_direction?.length && (
                    <details open style={{ ...subCard, backgroundColor: '#fff' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                        Strategic Direction ({metaAdGuide.strategic_direction.length})
                      </summary>
                      <ul style={{ margin: '8px 0 0', paddingLeft: '16px', fontSize: '11px', color: '#334155', lineHeight: 1.45 }}>
                        {metaAdGuide.strategic_direction.map((item, idx) => <li key={`metaad-dir-${idx}`}>{item}</li>)}
                      </ul>
                    </details>
                  )}

                  {!!metaAdGuide.ads_to_launch?.length && (
                    <div style={{ ...subCard, backgroundColor: '#fff' }}>
                      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                        Next Ads To Run ({metaAdGuide.ads_to_launch.length})
                      </p>
                      <div style={{ marginTop: '6px', display: 'grid', gap: '6px' }}>
                        {metaAdGuide.ads_to_launch.map((ad, idx) => (
                          <details key={`metaad-${ad.id || idx}`} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px', backgroundColor: '#f8fafc' }} open={idx === 0}>
                            <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>{ad.name || `Ad ${idx + 1}`}</span>
                              {ad.format && <span style={{ fontSize: '10px', color: '#475569' }}>{ad.format}</span>}
                              {ad.angle && <span style={{ fontSize: '10px', color: '#1d4ed8' }}>{ad.angle}</span>}
                            </summary>
                            <div style={{ marginTop: '6px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div>
                                <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Hook</p>
                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>{ad.hook || '—'}</p>
                                <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Overlay Text</p>
                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>{ad.overlay_text || '—'}</p>
                                <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Audience Strategy</p>
                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>{ad.audience_strategy || '—'}</p>
                                <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 700 }}>CTA</p>
                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>{ad.cta || '—'}</p>
                              </div>
                              <div>
                                <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Headlines</p>
                                <ul style={{ margin: '4px 0 0', paddingLeft: '14px', fontSize: '11px', color: '#334155', lineHeight: 1.35 }}>
                                  {(ad.headlines || []).map((h, i) => <li key={`ad-h-${idx}-${i}`}>{h}</li>)}
                                </ul>
                                <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Primary Text Variants</p>
                                <ul style={{ margin: '4px 0 0', paddingLeft: '14px', fontSize: '11px', color: '#334155', lineHeight: 1.35 }}>
                                  {(ad.primary_texts || []).map((t, i) => <li key={`ad-p-${idx}-${i}`}>{t}</li>)}
                                </ul>
                              </div>
                            </div>
                            <div style={{ marginTop: '6px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div>
                                <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Qualification Notes</p>
                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>{ad.qualification_notes || '—'}</p>
                              </div>
                              <div>
                                <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Hypothesis</p>
                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>{ad.test_hypothesis || '—'}</p>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {!!metaAdGuide.tests_to_run?.length && (
                      <details style={{ ...subCard, backgroundColor: '#fff' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                          Tests To Run ({metaAdGuide.tests_to_run.length})
                        </summary>
                        <ul style={{ margin: '8px 0 0', paddingLeft: '16px', fontSize: '11px', color: '#334155', lineHeight: 1.4 }}>
                          {metaAdGuide.tests_to_run.map((t, idx) => (
                            <li key={`metaad-test-${idx}`}>
                              <strong>{t.name}</strong>: {t.hypothesis}
                              {t.success_metric ? ` (Success metric: ${t.success_metric})` : ''}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {!!metaAdGuide.next_7_day_execution_plan?.length && (
                      <details style={{ ...subCard, backgroundColor: '#fff' }} open>
                        <summary style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                          Next 7 Days ({metaAdGuide.next_7_day_execution_plan.length})
                        </summary>
                        <ol style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '11px', color: '#334155', lineHeight: 1.4 }}>
                          {metaAdGuide.next_7_day_execution_plan.map((step, idx) => (
                            <li key={`metaad-step-${idx}`}>{step}</li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>

                  {metaAdGuide.export_text && (
                    <details style={{ ...subCard, backgroundColor: '#fff' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                        Copy/Paste Full Guide
                      </summary>
                      <textarea
                        readOnly
                        value={metaAdGuide.export_text}
                        style={{
                          marginTop: '8px',
                          width: '100%',
                          minHeight: '220px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '10px',
                          padding: '10px',
                          fontSize: '11px',
                          lineHeight: 1.4,
                          color: '#0f172a',
                          backgroundColor: '#fff',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                        }}
                      />
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...subCard, backgroundColor: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>What To Do This Week (Snapshot)</p>
              {metaAiAnalysis && (
                <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: signalBadge(metaAiAnalysis.status).bg, color: signalBadge(metaAiAnalysis.status).color, fontSize: '10px', fontWeight: 700 }}>
                  {signalBadge(metaAiAnalysis.status).label}
                </span>
              )}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#334155', lineHeight: 1.45 }}>
              {metaAiAnalysis?.summary || 'Run an AI analyst or use the Meta Specialist Diagnosis cards below for the audited trend explainer.'}
            </p>
            {!!metaAiAnalysis?.action_steps?.length && (
              <ol style={{ margin: '8px 0 0', paddingLeft: '18px', color: '#334155', fontSize: '11px', lineHeight: 1.45 }}>
                {metaAiAnalysis.action_steps.slice(0, 5).map((step, idx) => <li key={`meta-action-${idx}`}>{step}</li>)}
              </ol>
            )}
            <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setActiveDrilldownKey('great_lead_outreach_queue')}
                style={{ textAlign: 'left', border: '1px solid #dbeafe', backgroundColor: '#eff6ff', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}
              >
                <p style={{ margin: 0, fontSize: '10px', color: '#1d4ed8', fontWeight: 700 }}>Great Lead Outreach Queue</p>
                <p style={{ margin: '4px 0 0', fontSize: '15px', color: '#0f172a', fontWeight: 800 }}>{int(greatLeadOutreachQueue.length)}</p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#475569' }}>Manual touch for great leads before they stall</p>
              </button>
              <button
                type="button"
                onClick={() => setActiveDrilldownKey('high_value_nudge_candidates')}
                style={{ textAlign: 'left', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}
              >
                <p style={{ margin: 0, fontSize: '10px', color: '#334155', fontWeight: 700 }}>Near-Ideal Nudge Candidates</p>
                <p style={{ margin: '4px 0 0', fontSize: '15px', color: '#0f172a', fontWeight: 800 }}>{int(nudgeCandidates.length)}</p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>ICP + strong attendance, not yet 11 show-ups</p>
              </button>
            </div>
          </div>
        </div>
      </div>

      {freeEventsSummary && (
        <div style={{ ...subCard, marginBottom: '14px', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                Category — {freeEventsSummary.category || 'Free Events'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                {freeEventsSummary.window_type || 'Current vs prior period'} · Current: {freeEventsSummary.window_label_current || 'N/A'} · Prior: {freeEventsSummary.window_label_prior || 'N/A'}
              </p>
            </div>
            <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: '#eef2ff', color: '#3730a3', fontSize: '10px', fontWeight: 700 }}>
              Click any box for drilldown
            </span>
          </div>
          <div style={{ marginBottom: '8px', border: '1px solid #dbeafe', backgroundColor: '#f8fbff', color: '#1e3a8a', borderRadius: '10px', padding: '8px 10px' }}>
            <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.35 }}>
              These are cohort metrics for paid Meta free-funnel HubSpot contacts (non-Phoenix). "Net New Show Ups" here means first group show-ups in the cohort window, not the attendance bar chart's all-source new attendees.
            </p>
            {freeEventsWindowCurrentParsed?.inclusiveEndKey && (
              <p style={{ margin: '4px 0 0', fontSize: '11px', lineHeight: 1.35 }}>
                Cohort week labels are week starts. Current window runs through {freeEventsWindowCurrentParsed.inclusiveEndKey} (inclusive).
              </p>
            )}
            {cohortScopeWarnings.length > 0 && (
              <div style={{ marginTop: '6px', borderTop: '1px solid #bfdbfe', paddingTop: '6px' }}>
                {cohortScopeWarnings.map((msg, idx) => (
                  <p key={`cohort-scope-warning-${idx}`} style={{ margin: idx === 0 ? 0 : '4px 0 0', fontSize: '11px', lineHeight: 1.35, color: '#92400e' }}>
                    {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '8px' }}>
            {(freeEventsSummary.cards || []).map((item) => {
              const countUp = Number(item.count_change_pct) >= 0;
              const costUp = Number(item.cost_change_pct) >= 0;
              const displayLabelMap = {
                meta_leads: 'Free Group Leads (HubSpot)',
                meta_qualified_leads: 'Free Group Qualified Leads (HubSpot)',
                meta_great_leads: 'Free Group Great Leads (HubSpot)',
                luma_signups_paid: 'Free Group Appts (HubSpot)',
                net_new_showups: 'Free Group New Show Ups',
              };
              const displayLabel = displayLabelMap[item.key] || item.label;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => item.drilldown_key && openDrilldown(item.drilldown_key)}
                  style={{
                    textAlign: 'left',
                    border: '1px solid #dbeafe',
                    backgroundColor: '#f8fbff',
                    borderRadius: '12px',
                    padding: '10px',
                    cursor: item.drilldown_key ? 'pointer' : 'default',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '11px', color: '#1e3a8a', fontWeight: 700 }}>{displayLabel}</p>
                  {item.key === 'net_new_showups' && (
                    <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>
                      Cohort conversion count only (paid Meta lead cohorts in window)
                    </p>
                  )}
                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{int(item.current_count)}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: Number.isFinite(Number(item.count_change_pct)) ? (countUp ? '#166534' : '#991b1b') : '#64748b' }}>
                      {deltaPctLabel(item.count_change_pct)} vs prior
                    </span>
                  </div>
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #dbeafe' }}>
                    <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                      {item.key === 'meta_leads' ? 'Free Group Ad Cost / Lead' :
                        item.key === 'meta_qualified_leads' ? 'Free Group Ad Cost / Qualified Lead' :
                          item.key === 'meta_great_leads' ? 'Free Group Ad Cost / Great Lead' :
                            item.key === 'luma_signups_paid' ? 'Free Group Cost / Appt' :
                              'Free Group Cost / New Show Up'}
                    </p>
                    <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{currency(item.current_cost)}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: Number.isFinite(Number(item.cost_change_pct)) ? (costUp ? '#991b1b' : '#166534') : '#64748b' }}>
                        {deltaPctLabel(item.cost_change_pct)} vs prior
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <details style={{ ...subCard, marginBottom: '14px', backgroundColor: '#fff' }} open={!isGlanceMode}>
        <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
          Customize Layout ({isGlanceMode ? 'collapsed by default' : 'section visibility'})
        </summary>
        <div style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Section Visibility</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                Keep the page glanceable: open only the sections you need right now.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                ['signoff', 'Signoff'],
                ['diagnostics', 'Meta Diagnostics'],
                ['outreach', 'Outreach'],
                ['qa', 'QA'],
                ['metrics', 'Deep Metrics'],
              ].map(([key, label]) => (
                <button
                  key={`section-${key}`}
                  type="button"
                  onClick={() => toggleSection(key)}
                  style={{
                    border: '1px solid #cbd5e1',
                    backgroundColor: sectionOpen[key] ? '#e0f2fe' : '#fff',
                    color: sectionOpen[key] ? '#075985' : '#334155',
                    borderRadius: '999px',
                    padding: '5px 9px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {sectionOpen[key] ? 'Hide' : 'Show'} {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      {sectionOpen.signoff && weeklySignoff && (
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

      {sectionOpen.diagnostics && metaDiagnostics && (
        <div style={{ ...subCard, marginBottom: '14px', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Meta Specialist Diagnosis (CPL + Quality Trend Explainer)</p>
              {!isGlanceMode && (
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                  Click any box for the drilldown math (formula, numerator, denominator, windows, and comparison baselines).
                </p>
              )}
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
            {metaCardsForDisplay.map((diagCard) => (
              <MetaDiagnosticCard
                key={diagCard.key}
                cardData={diagCard}
                onClick={() => setActiveDiagnosticCardKey(diagCard.key)}
              />
            ))}
          </div>

          {metaAiAnalysis && !isGlanceMode && (
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
                        {['Date', 'Spend', 'Leads', 'CPL', 'WoW % (CPL)', 'Qualified Leads', 'Great Leads'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '10px', color: '#475569', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cplTrendNewestFirst.map((row) => (
                        <tr key={`cpltrend-${row.week}`}>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155', whiteSpace: 'nowrap' }}>{formatShortDate(row.week)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{currency(row.spend)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{int(row.leads)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#0f172a', fontWeight: 700 }}>{currency(row.cpl)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', fontWeight: 700, color: Number.isFinite(Number(row.wow_cpl_pct)) ? (Number(row.wow_cpl_pct) <= 0 ? '#166534' : '#991b1b') : '#64748b' }}>
                            {Number.isFinite(Number(row.wow_cpl_pct))
                              ? `${Number(row.wow_cpl_pct) <= 0 ? '▲ ' : '▼ '}${deltaPctLabel(row.wow_cpl_pct)}`
                              : 'N/A'}
                          </td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{int(row.qualified_leads)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155' }}>{int(row.great_leads)}</td>
                        </tr>
                      ))}
                      {cplTrendNewestFirst.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ padding: '8px', fontSize: '11px', color: '#64748b' }}>No CPL trend rows in this snapshot.</td>
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

          {campaignDiagnostics && !isGlanceMode && (
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
                          ['cost_per_great_member_exact_campaign_week', 'CPGM (Exact)'],
                          ['cost_per_ideal_member_exact_campaign_week', 'CPIM (Exact)'],
                          ['qualified_lead_rate', 'Q Lead Rate'],
                          ['great_member_rate', 'Great Member Rate'],
                          ['ideal_member_rate', 'Ideal Rate'],
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
                            <button
                              type="button"
                              onClick={() => {
                                setActiveCampaignKey(row.campaign_key);
                                setActiveCampaignStageKey('all_leads');
                              }}
                              style={{ border: 'none', background: 'transparent', padding: 0, margin: 0, cursor: 'pointer', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}
                            >
                              {row.campaign_label}
                            </button>
                            <div style={{ color: '#64748b', marginTop: '2px' }}>{row.attribution_quality}</div>
                            <div style={{ color: '#2563eb', marginTop: '2px', fontWeight: 700, fontSize: '10px' }}>Open campaign drilldown</div>
                          </td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{int(row.exact_match_leads)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{int(row.leads)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{currency(row.cpl_exact_campaign_week)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{currency(row.cpql_exact_campaign_week)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{currency(row.cpgl_exact_campaign_week)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{currency(row.cost_per_great_member_exact_campaign_week)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{currency(row.cost_per_ideal_member_exact_campaign_week)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{pct(row.qualified_lead_rate)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{pct(row.great_member_rate)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{pct(row.ideal_member_rate)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{int(row.ideal_members)}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>{int(row.matched_campaign_weeks)}</td>
                        </tr>
                      ))}
                      {sortedCampaignRows.length === 0 && (
                        <tr>
                          <td colSpan={13} style={{ padding: '8px', fontSize: '11px', color: '#64748b' }}>No campaign rows in this snapshot.</td>
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

          {activeCampaignDrilldown && (
            <div style={{ marginTop: '10px', ...subCard, backgroundColor: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                    Campaign Drilldown: {activeCampaignDrilldown.campaign_label}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                    Click stage tabs to inspect names (Luma, QL, GL, GM, IM) for this campaign bucket in the current cohort snapshot.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>Attribution: {activeCampaignDrilldown.attribution_quality}</span>
                  <button
                    type="button"
                    onClick={() => setActiveCampaignKey(null)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '6px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Close Campaign Drilldown
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {campaignStageTabs.map(([stageKey, label]) => (
                  <button
                    key={`stage-${stageKey}`}
                    type="button"
                    onClick={() => setActiveCampaignStageKey(stageKey)}
                    style={{
                      border: '1px solid #cbd5e1',
                      backgroundColor: activeCampaignStageKey === stageKey ? '#e0f2fe' : '#fff',
                      color: activeCampaignStageKey === stageKey ? '#075985' : '#334155',
                      borderRadius: '999px',
                      padding: '5px 9px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {label} ({int(activeCampaignDrilldown.stage_counts?.[stageKey] || 0)})
                  </button>
                ))}
              </div>

              <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto', backgroundColor: '#fff' }}>
                <table style={{ width: '100%', minWidth: '1200px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      {campaignStageColumns.map((col) => (
                        <th key={`camp-stage-col-${col.key}`} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '10px', color: '#475569', textTransform: 'uppercase' }}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeCampaignStageRows.map((row, idx) => (
                      <tr key={`camp-stage-row-${row.hubspot_contact_id || idx}`}>
                        {campaignStageColumns.map((col) => (
                          <td key={`camp-stage-cell-${idx}-${col.key}`} style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#334155', verticalAlign: 'top' }}>
                            {renderCell(row, col)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {activeCampaignStageRows.length === 0 && (
                      <tr>
                        <td colSpan={campaignStageColumns.length} style={{ padding: '10px', fontSize: '11px', color: '#64748b' }}>
                          No rows in this campaign stage for the current snapshot.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {(activeCampaignDrilldown.row_limit && (activeCampaignDrilldown.stage_counts?.[activeCampaignStageKey] || 0) > activeCampaignDrilldown.row_limit) && (
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#92400e' }}>
                  Showing first {int(activeCampaignDrilldown.row_limit)} rows for performance. Full stage count: {int(activeCampaignDrilldown.stage_counts?.[activeCampaignStageKey] || 0)}.
                </p>
              )}
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

      {sectionOpen.outreach && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px', marginBottom: '14px' }}>
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
                <div
                  key={`nudge-${row.hubspot_contact_id}`}
                  style={{ textAlign: 'left', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', padding: '8px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                    <a href={row.hubspot_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                      {row.display_name}
                    </a>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#1d4ed8', backgroundColor: '#eff6ff', borderRadius: '999px', padding: '3px 7px' }}>
                      {row.ideal_candidate_likelihood || 'N/A'}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                    {int(row.total_showups)} show-ups · {int(row.shows_remaining_to_ideal)} to ideal · {int(row.missed_primary_group_sessions_since_last_showup)} missed in {row.primary_attendance_group || 'group'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>
                    Revenue {currency(row.revenue_official_cached)} · Sobriety {formatSobrietyAge(row.sobriety_date)}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: row.nudge_recommended_now ? '#b45309' : '#64748b', fontWeight: row.nudge_recommended_now ? 700 : 500 }}>
                    {row.nudge_reason || 'No nudge signal yet'}
                  </p>
                  <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <a href={row.hubspot_url} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
                      Open HubSpot
                    </a>
                    <button
                      type="button"
                      onClick={() => setActiveDrilldownKey('high_value_nudge_candidates')}
                      style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      View Drilldown
                    </button>
                  </div>
                </div>
              ))}
              {nudgeCandidates.length === 0 && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>No current candidates in this snapshot.</p>}
            </div>
          </div>

          <div style={subCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Great Lead Outreach Queue</p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                  Extra manual outreach for great leads before they stall in the automatic funnel
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrilldownKey('great_lead_outreach_queue')}
                style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
              >
                {int(greatLeadOutreachQueue.length)} rows
              </button>
            </div>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {greatLeadOutreachQueue.slice(0, 4).map((row) => (
                <div key={`outreach-${row.hubspot_contact_id}`} style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', padding: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <a
                      href={row.hubspot_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#2563eb', textAlign: 'left', textDecoration: 'none' }}
                    >
                      {row.display_name}
                    </a>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: row.outreach_priority === 'High' ? '#991b1b' : row.outreach_priority === 'Medium' ? '#92400e' : '#334155',
                      backgroundColor: row.outreach_priority === 'High' ? '#fee2e2' : row.outreach_priority === 'Medium' ? '#fef3c7' : '#f1f5f9',
                      borderRadius: '999px',
                      padding: '3px 7px',
                    }}>
                      {row.outreach_priority}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                    {row.outreach_reason}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>
                    Revenue {currency(row.revenue_official_cached)} · Sobriety {formatSobrietyAge(row.sobriety_date)}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>
                    Invite: <strong>{row.recommended_destination}</strong>
                  </p>
                  <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <a href={row.hubspot_url} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>Open HubSpot</a>
                    <button
                      type="button"
                      onClick={() => setActiveDrilldownKey('great_lead_outreach_queue')}
                      style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      View Drilldown
                    </button>
                    <button
                      type="button"
                      onClick={() => copyText(row.suggested_plain_text_email)}
                      style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Copy Email
                    </button>
                  </div>
                </div>
              ))}
              {greatLeadOutreachQueue.length === 0 && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>No great-lead outreach rows in this snapshot.</p>}
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
                <div
                  key={`nonicp-${row.hubspot_contact_id}`}
                  style={{ textAlign: 'left', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', padding: '8px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                    <a href={row.hubspot_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                      {row.display_name}
                    </a>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155', backgroundColor: '#f8fafc', borderRadius: '999px', padding: '3px 7px' }}>
                      {int(row.total_showups)} shows
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                    {row.icp_gap_reason || 'Outside ICP (current model)'}{row.primary_attendance_group ? ` · ${row.primary_attendance_group}` : ''}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>
                    Missed in a row: <strong>{int(row.missed_primary_group_sessions_since_last_showup)}</strong>
                    {row.primary_attendance_group ? ` (${row.primary_attendance_group})` : ''}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: row.nudge_recommended_now ? '#b45309' : '#64748b', fontWeight: row.nudge_recommended_now ? 700 : 500 }}>
                    {row.nudge_reason || 'No nudge signal yet'}
                  </p>
                  <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <a href={row.hubspot_url} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
                      Open HubSpot
                    </a>
                    <button
                      type="button"
                      onClick={() => setActiveDrilldownKey('strong_non_icp_members')}
                      style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      View Drilldown
                    </button>
                  </div>
                </div>
              ))}
              {strongNonIcpMembers.length === 0 && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>No rows in this snapshot.</p>}
            </div>
          </div>
        </div>
      )}

      {sectionOpen.qa && (
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
      )}

      {sectionOpen.metrics && (
        <>
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
        </>
      )}

      {activeDrilldown && (
        <div ref={drilldownRef} style={{ ...subCard, marginTop: '2px' }}>
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
          {activeDrilldown.key === 'free_events_net_new_showups' && (
            <div style={{ marginBottom: '8px', border: '1px solid #fde68a', backgroundColor: '#fffbeb', borderRadius: '10px', padding: '8px 10px' }}>
              <p style={{ margin: 0, fontSize: '11px', color: '#92400e', lineHeight: 1.35 }}>
                This drilldown is converter-only and cohort-scoped: it lists paid Meta free-funnel contacts whose first group show-up occurred for the displayed trailing cohort-week window. It will not match the attendance bar chart&apos;s all-source "new attendee" totals.
              </p>
              {freeEventsWindowCurrentParsed?.inclusiveEndKey && (
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#92400e', lineHeight: 1.35 }}>
                  Displayed cohort window runs through {freeEventsWindowCurrentParsed.inclusiveEndKey} (inclusive).
                </p>
              )}
            </div>
          )}
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
