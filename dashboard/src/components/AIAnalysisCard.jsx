import React from 'react';

function formatValue(value, format) {
  const n = Number(value || 0);
  if (format === 'currency') return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (format === 'percent') return `${(n * 100).toFixed(1)}%`;
  return Math.round(n).toLocaleString();
}

function formatDelta(deltaPct, betterWhen) {
  if (deltaPct === null || deltaPct === undefined || Number.isNaN(deltaPct)) return 'N/A';
  const pct = `${deltaPct >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(1)}%`;
  if (betterWhen === 'lower') return deltaPct <= 0 ? `${pct} (better)` : `${pct} (worse)`;
  return deltaPct >= 0 ? `${pct} (better)` : `${pct} (worse)`;
}

const AIAnalysisCard = ({ analysis }) => {
  if (!analysis) return null;

  const metricRows = Array.isArray(analysis.metricSnapshotRows)
    ? analysis.metricSnapshotRows.slice(0, 12)
    : [];
  const funnelRows = Array.isArray(analysis.funnelStages) ? analysis.funnelStages : [];
  const recommendations = Array.isArray(analysis.recommendations) ? analysis.recommendations : [];
  const alerts = Array.isArray(analysis.alerts) ? analysis.alerts : [];

  return (
    <div style={{ backgroundColor: '#ecfeff', padding: '24px', borderRadius: '16px', border: '1px solid #a5f3fc' }}>
      <h3 style={{ fontSize: '18px', color: '#0e7490', margin: 0 }}>AI Cost Reduction Summary</h3>
      <p style={{ marginTop: '10px', color: '#164e63', fontSize: '14px', lineHeight: 1.55 }}>
        {analysis.headline}
      </p>

      <div style={{ marginTop: '16px' }}>
        <p style={{ margin: 0, color: '#155e75', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Metric Snapshot (30d vs prior 30d)
        </p>
        <div style={{ marginTop: '8px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#cffafe' }}>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #a5f3fc' }}>Metric</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #a5f3fc' }}>Current</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #a5f3fc' }}>Prior</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #a5f3fc' }}>MoM</th>
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #cffafe', color: '#0f172a' }}>{row.label}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #cffafe', textAlign: 'right' }}>{formatValue(row.current, row.format)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #cffafe', textAlign: 'right' }}>{formatValue(row.previous, row.format)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #cffafe', textAlign: 'right', color: '#0e7490', fontWeight: 600 }}>
                    {formatDelta(row.monthlyDelta?.deltaPct, row.betterWhen)}
                  </td>
                </tr>
              ))}
              {metricRows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '8px', color: '#164e63' }}>No snapshot metrics available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <p style={{ margin: 0, color: '#155e75', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Funnel Data (Current 30d)
        </p>
        <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
          {funnelRows.map((row) => (
            <div key={row.key} style={{ backgroundColor: 'white', border: '1px solid #bae6fd', borderRadius: '10px', padding: '8px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#155e75' }}>{row.label}</p>
              <p style={{ margin: '4px 0 0 0', fontWeight: 700, color: '#0f172a' }}>{Math.round(row.value).toLocaleString()}</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#164e63' }}>
                {row.conversionFromPrevious === null ? 'Stage start' : `From prior: ${(row.conversionFromPrevious * 100).toFixed(1)}%`}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <p style={{ margin: 0, color: '#155e75', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Top 3 Recommendations (Impact Priority)
        </p>
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {recommendations.map((rec, index) => (
            <div key={`${rec.title}-${index}`} style={{ backgroundColor: 'white', border: '1px solid #bae6fd', borderRadius: '10px', padding: '10px' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>{index + 1}. {rec.title}</p>
              <p style={{ margin: '4px 0 0 0', color: '#334155', fontSize: '13px' }}>{rec.reason}</p>
              <p style={{ margin: '4px 0 0 0', color: '#0e7490', fontSize: '12px', fontWeight: 600 }}>{rec.impact}</p>
            </div>
          ))}
          {recommendations.length === 0 && (
            <p style={{ margin: 0, color: '#164e63', fontSize: '13px' }}>No recommendations available yet.</p>
          )}
        </div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <p style={{ margin: 0, color: '#155e75', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Alerts / Anomalies
        </p>
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {alerts.map((alert, index) => (
            <p key={`${alert}-${index}`} style={{ margin: 0, color: '#9a3412', fontSize: '13px' }}>
              {alert}
            </p>
          ))}
          {alerts.length === 0 && (
            <p style={{ margin: 0, color: '#164e63', fontSize: '13px' }}>No alerts.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIAnalysisCard;
