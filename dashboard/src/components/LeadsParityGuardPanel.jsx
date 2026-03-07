import React, { useMemo } from 'react';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
};

const STATUS_STYLE = {
  pass: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  warn: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  fail: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  skip: { bg: '#e2e8f0', text: '#334155', border: '#cbd5e1' },
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickCount(raw = {}, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw || {}, key)) return toNumber(raw[key]);
  }
  return 0;
}

function formatTimestamp(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function normalizeStatus(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'pass' || text === 'warn' || text === 'fail' || text === 'skip') return text;
  if (text === 'warning') return 'warn';
  if (text === 'failed') return 'fail';
  if (text === 'passed') return 'pass';
  if (text === 'skipped') return 'skip';
  return 'skip';
}

export default function LeadsParityGuardPanel({ report, isLoading = false }) {
  const normalized = useMemo(() => {
    const summary = report?.summary || {};
    const rawCounts = report?.status_counts || report?.statusCounts || summary?.counts || {};
    const counts = {
      pass: pickCount(rawCounts, ['pass', 'passed']),
      warn: pickCount(rawCounts, ['warn', 'warning', 'warnings']),
      fail: pickCount(rawCounts, ['fail', 'failed', 'failures']),
      skip: pickCount(rawCounts, ['skip', 'skipped']),
    };

    const rows = Array.isArray(report?.metrics)
      ? report.metrics
      : Array.isArray(report?.metric_rows)
        ? report.metric_rows
        : Array.isArray(report?.rows)
          ? report.rows
          : [];

    const failingOrWarningRows = rows
      .map((row) => {
        const status = normalizeStatus(row?.status);
        return {
          metric: String(row?.metric || row?.key || row?.label || 'Unnamed metric'),
          status,
          legacy: row?.legacy_value ?? row?.legacyValue ?? row?.old_value ?? row?.expected ?? null,
          grouped: row?.grouped_value ?? row?.groupedValue ?? row?.new_value ?? row?.actual ?? null,
          deltaPct: row?.delta_pct ?? row?.deltaPct ?? row?.pct_delta ?? null,
          note: String(row?.note || row?.reason || row?.message || '').trim(),
        };
      })
      .filter((row) => row.status === 'fail' || row.status === 'warn')
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'fail' ? -1 : 1;
        return Math.abs(toNumber(b.deltaPct)) - Math.abs(toNumber(a.deltaPct));
      })
      .slice(0, 8);

    return {
      counts,
      rows: failingOrWarningRows,
      generatedAt: report?.generated_at || report?.generatedAt || summary?.generated_at || summary?.generatedAt || null,
    };
  }, [report]);

  if (isLoading) {
    return (
      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          Parity Guard
        </p>
        <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Legacy vs grouped parity status</h3>
        <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
          {[0, 1, 2].map((idx) => (
            <div key={`parity-loading-${idx}`} style={{ height: '16px', backgroundColor: '#e2e8f0', borderRadius: '6px' }} />
          ))}
        </div>
      </section>
    );
  }

  const hasReport = !!report;
  const hasParityRows = normalized.rows.length > 0;

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Parity Guard
          </p>
          <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Legacy vs grouped parity status</h3>
        </div>
        <div style={{ fontSize: '11px', color: '#64748b' }}>
          Last generated: {formatTimestamp(normalized.generatedAt)}
        </div>
      </div>

      <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '8px' }}>
        {[
          { key: 'pass', label: 'Pass' },
          { key: 'warn', label: 'Warn' },
          { key: 'fail', label: 'Fail' },
          { key: 'skip', label: 'Skip' },
        ].map((item) => {
          const style = STATUS_STYLE[item.key];
          return (
            <div key={item.key} style={{ border: `1px solid ${style.border}`, backgroundColor: style.bg, borderRadius: '10px', padding: '8px 10px' }}>
              <p style={{ margin: 0, fontSize: '11px', color: style.text, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                {item.label}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 800, color: style.text }}>
                {normalized.counts[item.key]}
              </p>
            </div>
          );
        })}
      </div>

      {!hasReport && (
        <div style={{ marginTop: '10px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', borderRadius: '10px', padding: '10px 12px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>
            Parity report is unavailable in this environment. The panel will populate when `computeLeadsParityReport` output is available.
          </p>
        </div>
      )}

      {hasReport && !hasParityRows && (
        <div style={{ marginTop: '10px', border: '1px solid #dbeafe', backgroundColor: '#eff6ff', borderRadius: '10px', padding: '10px 12px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#1e3a8a' }}>
            No failing or warning parity metrics in the latest report.
          </p>
        </div>
      )}

      {hasReport && hasParityRows && (
        <div style={{ marginTop: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>Metric</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>Legacy</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>Grouped</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>Delta %</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {normalized.rows.map((row, idx) => {
                const style = STATUS_STYLE[row.status] || STATUS_STYLE.skip;
                return (
                  <tr key={`${row.metric}-${idx}`}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#0f172a', fontWeight: 700 }}>{row.metric}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ display: 'inline-flex', borderRadius: '999px', border: `1px solid ${style.border}`, backgroundColor: style.bg, color: style.text, padding: '2px 8px', fontSize: '10px', fontWeight: 700 }}>
                        {row.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>{row.legacy ?? 'N/A'}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>{row.grouped ?? 'N/A'}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155', textAlign: 'right' }}>
                      {Number.isFinite(Number(row.deltaPct)) ? `${Number(row.deltaPct).toFixed(2)}%` : 'N/A'}
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#475569' }}>{row.note || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
