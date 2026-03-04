import React from 'react';

function formatValue(value, unit) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  const numeric = Number(value);
  if (unit === 'currency') return `$${numeric.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (unit === 'percent') return `${(numeric * 100).toFixed(1)}%`;
  if (unit === 'ratio') return numeric.toFixed(2);
  return Math.round(numeric).toLocaleString();
}

function formatDelta(delta) {
  if (delta === null || delta === undefined || Number.isNaN(Number(delta))) return 'N/A';
  const numeric = Number(delta) * 100;
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(1)}%`;
}

function statusStyle(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'green') {
    return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
  }
  if (normalized === 'red') {
    return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
  }
  return { bg: '#fef9c3', text: '#854d0e', border: '#fde047' };
}

export default function KpiScoreboard({ rows = [] }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: '#fff' }}>
        <thead>
          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
            <th style={thStyle}>Metric</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Current</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Previous</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Delta</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Target</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Driver</th>
            <th style={thStyle}>Next action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const style = statusStyle(row?.status);
            return (
              <tr key={row.metric_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tdStyle}>{row.name}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{formatValue(row.current, row.unit)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatValue(row.previous, row.unit)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatDelta(row.delta)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatValue(row.target, row.unit)}</td>
                <td style={tdStyle}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '3px 9px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: style.bg,
                    color: style.text,
                    border: `1px solid ${style.border}`,
                  }}
                  >
                    {row.status || 'Watch'}
                  </span>
                </td>
                <td style={tdStyle}>{row.driver || '—'}</td>
                <td style={tdStyle}>{row.next_action || '—'}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                No KPI rows available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  padding: '10px 12px',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#64748b',
  textAlign: 'left',
};

const tdStyle = {
  padding: '10px 12px',
  color: '#0f172a',
  verticalAlign: 'top',
};
