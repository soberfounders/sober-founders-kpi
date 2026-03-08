import React, { useMemo } from 'react';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
};

const sectionCardStyle = {
  backgroundColor: '#f8fafc',
  borderRadius: '10px',
  padding: '12px',
  border: '1px solid #e2e8f0',
};

const IMPACT_ROWS = [
  { key: 'cpl_pct', metricLabel: 'CPL', baselineFormat: 'currency', targetFormat: 'currency', impactFormat: 'pct' },
  { key: 'cpql_pct', metricLabel: 'CPQL', baselineFormat: 'currency', targetFormat: 'currency', impactFormat: 'pct' },
  { key: 'qualified_rate_pp', metricLabel: 'Qualified %', baselineFormat: 'rate', targetFormat: 'rate', impactFormat: 'pp' },
  { key: 'non_qualified_rate_pp', metricLabel: 'Non-Qualified %', baselineFormat: 'rate', targetFormat: 'rate', impactFormat: 'pp' },
];

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtPct(value, digits = 1) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return 'N/A';
  const sign = parsed >= 0 ? '+' : '';
  return `${sign}${(parsed * 100).toFixed(digits)}%`;
}

function fmtPp(value, digits = 1) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return 'N/A';
  const sign = parsed >= 0 ? '+' : '';
  return `${sign}${parsed.toFixed(digits)} pp`;
}

function fmtCurrency(value) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return 'N/A';
  return `$${parsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatByType(value, type) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return 'N/A';
  if (type === 'currency') return fmtCurrency(parsed);
  if (type === 'rate') return `${(parsed * 100).toFixed(1)}%`;
  return String(parsed);
}

function formatImpactDisplay(impactMetric, impactFormat) {
  if (!impactMetric || impactMetric.insufficient_evidence || impactMetric.impact_value === null) {
    return 'insufficient_evidence';
  }
  if (impactFormat === 'pp') return fmtPp(impactMetric.impact_value);
  return fmtPct(impactMetric.impact_value);
}

function formatConfidence(confidenceRaw) {
  const confidence = String(confidenceRaw || '').toUpperCase();
  if (!confidence) return 'UNKNOWN';
  return confidence;
}

function priorityTone(priorityRaw) {
  const priority = String(priorityRaw || '').toLowerCase();
  if (priority === 'high') return { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' };
  if (priority === 'medium') return { bg: '#ffedd5', color: '#9a3412', border: '#fdba74' };
  return { bg: '#e2e8f0', color: '#334155', border: '#cbd5e1' };
}

export default function LeadsManagerInsightsPanel({
  data,
  isLoading = false,
  onSendToNotion,
}) {
  const normalized = useMemo(() => ({
    trendInsights: Array.isArray(data?.trend_insights) ? data.trend_insights.filter(Boolean) : [],
    autonomousActions: Array.isArray(data?.autonomous_actions) ? data.autonomous_actions.filter(Boolean).slice(0, 3) : [],
    humanRequired: Array.isArray(data?.human_required_actions) ? data.human_required_actions.filter(Boolean) : [],
  }), [data]);

  if (isLoading) {
    return (
      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          Leads Manager Insights
        </p>
        <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Actionable manager queue</h3>
        <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
          {[0, 1, 2].map((idx) => (
            <div key={`manager-insights-loading-${idx}`} style={{ height: '16px', backgroundColor: '#e2e8f0', borderRadius: '6px' }} />
          ))}
        </div>
      </section>
    );
  }

  const hasAnyData = normalized.trendInsights.length > 0
    || normalized.autonomousActions.length > 0
    || normalized.humanRequired.length > 0;

  return (
    <section style={cardStyle}>
      <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
        Leads Manager Insights
      </p>
      <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Actionable manager queue</h3>
      <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
        Data-backed target-gap view: projections are historical benchmark gaps, not causal promises.
      </p>

      {!hasAnyData && (
        <div style={{ marginTop: '12px', ...sectionCardStyle }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>
            Insufficient sample/data for the selected window.
          </p>
        </div>
      )}

      {hasAnyData && (
        <div style={{ marginTop: '12px', display: 'grid', gap: '12px' }}>
          <div style={{ ...sectionCardStyle, borderLeft: '4px solid #2563eb' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Trending Insights
            </p>
            {normalized.trendInsights.length > 0 ? (
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'grid', gap: '6px' }}>
                {normalized.trendInsights.map((line, idx) => (
                  <li key={`trend-${idx}-${line}`} style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>{line}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>Insufficient sample/data for trend insights.</p>
            )}
          </div>

          <div style={{ ...sectionCardStyle, borderLeft: '4px solid #0f766e' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#115e59', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Top 3 Autonomous Actions
            </p>
            <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
              {normalized.autonomousActions.length > 0 ? normalized.autonomousActions.map((action, idx) => (
                <div key={`auto-action-${idx}-${action.title || idx}`} style={{ border: '1px solid #ccfbf1', borderRadius: '10px', padding: '10px', backgroundColor: '#f0fdfa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      {action.title || `Action ${idx + 1}`}
                    </p>
                    <span style={{ borderRadius: '999px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, backgroundColor: '#cffafe', color: '#0f766e', border: '1px solid #99f6e4' }}>
                      {String(action.priority || 'Medium').toUpperCase()}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#475569' }}>
                    {action.summary || 'Insufficient sample/data for action summary.'}
                  </p>
                  <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
                    {IMPACT_ROWS.map((entry) => {
                      const impactMetric = action?.projected_impact?.[entry.key];
                      const confidence = formatConfidence(impactMetric?.confidence);
                      const sampleSize = toNumberOrNull(impactMetric?.sample_size);
                      return (
                        <div key={`${action.title || idx}-${entry.key}`} style={{ border: '1px solid #ccfbf1', borderRadius: '8px', padding: '8px', backgroundColor: '#f8fffe' }}>
                          <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>{entry.metricLabel}</p>
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#334155' }}>
                            <strong>Target gap:</strong> {formatImpactDisplay(impactMetric, entry.impactFormat)}
                          </p>
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                            <strong>Baseline:</strong> {formatByType(impactMetric?.baseline_value, entry.baselineFormat)} | <strong>Target:</strong> {formatByType(impactMetric?.target_value, entry.targetFormat)}
                          </p>
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                            <strong>Method:</strong> {String(impactMetric?.method || 'N/A')}
                          </p>
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                            <strong>Sample Size:</strong> {sampleSize !== null ? Math.round(sampleSize) : 'N/A'} | <strong>Confidence:</strong> {confidence}
                          </p>
                          {impactMetric?.insufficient_evidence && (
                            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9a3412', fontWeight: 700 }}>
                              insufficient_evidence
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )) : (
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Insufficient sample/data for autonomous actions.</p>
              )}
            </div>
          </div>

          <div style={{ ...sectionCardStyle, borderLeft: '4px solid #d97706' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Human Required Actions
            </p>
            <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
              {normalized.humanRequired.length > 0 ? normalized.humanRequired.map((item, idx) => {
                const tone = priorityTone(item.priority);
                const taskLabel = String(item.task || `Human task ${idx + 1}`);
                return (
                  <div key={`human-action-${idx}-${taskLabel}`} style={{ border: '1px solid #fde68a', borderRadius: '10px', padding: '10px', backgroundColor: '#fffbeb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a', flex: 1 }}>
                        {taskLabel}
                      </p>
                      <span style={{ borderRadius: '999px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, backgroundColor: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}>
                        {String(item.priority || 'Medium').toUpperCase()}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#78350f' }}>
                      {String(item.reason || 'Manual review required.')}
                    </p>
                    {typeof onSendToNotion === 'function' && (
                      <div style={{ marginTop: '8px' }}>
                        <button
                          onClick={() => onSendToNotion(taskLabel)}
                          title="Send to Notion To-Do"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #d4d4d4',
                            backgroundColor: '#fff',
                            color: '#0f172a',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ fontWeight: 800, fontSize: '11px' }}>N</span> to Notion
                        </button>
                      </div>
                    )}
                  </div>
                );
              }) : (
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Insufficient sample/data for human-required actions.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

