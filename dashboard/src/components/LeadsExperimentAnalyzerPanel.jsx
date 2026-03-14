import React, { useMemo, useState } from 'react';

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

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtCurrency(value) {
  const n = toNumberOrNull(value);
  if (n === null) return 'N/A';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtCount(value) {
  const n = toNumberOrNull(value);
  if (n === null) return 'N/A';
  const hasFraction = Math.abs(n - Math.round(n)) >= 0.001;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: hasFraction ? 1 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
}

function fmtPct(value, digits = 1) {
  const n = toNumberOrNull(value);
  if (n === null) return 'N/A';
  return `${(n * 100).toFixed(digits)}%`;
}

function decisionTone(decisionRaw) {
  const decision = String(decisionRaw || '').toUpperCase();
  if (decision === 'KEEP') return { bg: '#dcfce7', color: '#166534', border: '#86efac', label: 'KEEP' };
  if (decision === 'KILL') return { bg: '#fee2e2', color: '#991b1b', border: '#fecaca', label: 'KILL' };
  if (decision === 'HOLD_LOW_SAMPLE') return { bg: '#e2e8f0', color: '#334155', border: '#cbd5e1', label: 'HOLD LOW SAMPLE' };
  return { bg: '#ffedd5', color: '#9a3412', border: '#fdba74', label: 'ITERATE' };
}

function confidenceTone(confidenceRaw) {
  const confidence = String(confidenceRaw || '').toUpperCase();
  if (confidence === 'HIGH') return { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd', label: 'HIGH' };
  if (confidence === 'MEDIUM') return { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd', label: 'MEDIUM' };
  if (confidence === 'LOW') return { bg: '#fef9c3', color: '#854d0e', border: '#fde047', label: 'LOW' };
  return { bg: '#e2e8f0', color: '#334155', border: '#cbd5e1', label: 'INSUFFICIENT SAMPLE/DATA' };
}

const TABLE_COLUMNS = [
  { key: 'decision', label: 'Decision', sortable: true },
  { key: 'name', label: 'Campaign / Ad Set', sortable: true },
  { key: 'decision_reason', label: 'Decision Context', sortable: false },
  { key: 'spend', label: 'Spend', sortable: true },
  { key: 'leads', label: 'Leads', sortable: true },
  { key: 'qualified_leads', label: 'Qualified', sortable: true },
  { key: 'great_leads', label: 'Great', sortable: true },
  { key: 'cpl', label: 'CPL', sortable: true },
  { key: 'cpql', label: 'CPQL', sortable: true },
  { key: 'cpgl', label: 'CPGL', sortable: true },
  { key: 'display_qualified_rate', label: 'Qualified Rate', sortable: true },
  { key: 'display_great_rate', label: 'Great Rate', sortable: true },
];

const LEVEL_BUTTON_BASE = {
  padding: '6px 10px',
  borderRadius: '999px',
  border: '1px solid #cbd5e1',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
};

function LevelButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...LEVEL_BUTTON_BASE,
        backgroundColor: active ? '#0f172a' : '#fff',
        color: active ? '#fff' : '#334155',
      }}
    >
      {label}
    </button>
  );
}

export default function LeadsExperimentAnalyzerPanel({ data, isLoading = false, adActivityMap }) {
  const [level, setLevel] = useState('adset');
  const [sortKey, setSortKey] = useState('cpql');
  const [sortDir, setSortDir] = useState('asc');
  const [runningOnly, setRunningOnly] = useState(true);

  const rows = useMemo(() => {
    let rawRows;
    if (level === 'campaign') {
      rawRows = Array.isArray(data?.campaign_rows) ? data.campaign_rows : [];
    } else if (level === 'ad') {
      rawRows = Array.isArray(data?.ad_rows) ? data.ad_rows : [];
    } else {
      rawRows = Array.isArray(data?.adset_rows) ? data.adset_rows : [];
    }

    const normalized = rawRows.map((row) => {
      let name;
      if (level === 'campaign') {
        name = String(row?.campaign_name || 'Unknown Campaign');
      } else if (level === 'ad') {
        name = `${String(row?.campaign_name || 'Unknown Campaign')} / ${String(row?.adset_name || 'Unknown Ad Set')} / ${String(row?.ad_name || 'Unknown Ad')}`;
      } else {
        name = `${String(row?.campaign_name || 'Unknown Campaign')} / ${String(row?.adset_name || 'Unknown Ad Set')}`;
      }
      return { ...row, name };
    });

    let filtered = normalized;
    if (runningOnly && adActivityMap && adActivityMap.size > 0) {
      const isAdActive = (adId) => {
        const activity = adActivityMap.get(adId);
        return !!activity && (
          Number(activity.spend || 0) > 0
          || Number(activity.impressions || 0) > 0
          || Number(activity.clicks || 0) > 0
          || Number(activity.leads || 0) > 0
        );
      };
      filtered = normalized.filter((row) => {
        const adIds = Array.isArray(row?.ad_ids) ? row.ad_ids : [];
        if (adIds.length === 0) return true;
        return adIds.some((id) => isAdActive(id));
      });
    }

    const direction = sortDir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const left = sortKey === 'name' ? String(a?.name || '') : a?.[sortKey];
      const right = sortKey === 'name' ? String(b?.name || '') : b?.[sortKey];

      if (sortKey === 'decision' || sortKey === 'name') {
        return String(left || '').localeCompare(String(right || '')) * direction;
      }
      const leftNum = toNumberOrNull(left);
      const rightNum = toNumberOrNull(right);
      if (leftNum === null && rightNum === null) return 0;
      if (leftNum === null) return 1 * direction;
      if (rightNum === null) return -1 * direction;
      return (leftNum - rightNum) * direction;
    });
  }, [data, level, sortKey, sortDir, runningOnly, adActivityMap]);

  const onSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  if (isLoading) {
    return (
      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          Experiment Quality Analyzer
        </p>
        <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Campaign and Ad Set Decision Table</h3>
        <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
          {[0, 1, 2, 3].map((idx) => (
            <div key={`exp-loading-${idx}`} style={{ height: '16px', backgroundColor: '#e2e8f0', borderRadius: '6px' }} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Experiment Quality Analyzer
          </p>
          <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Campaign and Ad Set Decision Table</h3>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
            Prioritizes quality outcomes (CPQL/CPGL and qualified/great rates) over low CPL alone.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
            Displayed rates use raw Meta leads for fast scanning. Qualified/Great counts remain directional, and keep/kill decisions still use the attribution model in the background.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <LevelButton label="Ad Set View" active={level === 'adset'} onClick={() => setLevel('adset')} />
            <LevelButton label="Campaign View" active={level === 'campaign'} onClick={() => setLevel('campaign')} />
            <LevelButton label="Ad View" active={level === 'ad'} onClick={() => setLevel('ad')} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={runningOnly}
              onChange={(e) => setRunningOnly(e.target.checked)}
              style={{ accentColor: '#0f172a' }}
            />
            Running Only
          </label>
        </div>
      </div>

      <div style={{ marginTop: '12px', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '960px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {TABLE_COLUMNS.map((col) => (
                <th
                  key={`exp-head-${col.key}`}
                  style={{
                    padding: '8px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '11px',
                    color: '#334155',
                    textAlign: (col.key === 'name' || col.key === 'decision_reason') ? 'left' : 'right',
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => col.sortable && onSort(col.key)}
                >
                  {col.label}{sortKey === col.key ? ` ${sortDir === 'asc' ? '^' : 'v'}` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const decisionStyle = decisionTone(row.decision);
              const confidenceStyle = confidenceTone(row.confidence);
              return (
                <tr
                  key={`exp-row-${row.key}`}
                  style={{
                    backgroundColor: row.low_cpl_weak_quality_trap ? '#fff7ed' : '#fff',
                    borderTop: '1px solid #f1f5f9',
                  }}
                >
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                      <span style={{ display: 'inline-flex', borderRadius: '999px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, backgroundColor: decisionStyle.bg, color: decisionStyle.color, border: `1px solid ${decisionStyle.border}` }}>
                        {decisionStyle.label}
                      </span>
                      <span style={{ display: 'inline-flex', borderRadius: '999px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, backgroundColor: confidenceStyle.bg, color: confidenceStyle.color, border: `1px solid ${confidenceStyle.border}` }}>
                        {confidenceStyle.label}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#0f172a', fontWeight: 600 }}>
                    {row.name}
                    {row.low_cpl_weak_quality_trap && (
                      <span style={{ marginLeft: '6px', borderRadius: '999px', padding: '2px 7px', fontSize: '10px', fontWeight: 700, color: '#9a3412', backgroundColor: '#ffedd5', border: '1px solid #fdba74' }}>
                        Low CPL / Weak Quality
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'left', fontSize: '11px', color: '#475569', minWidth: '220px', lineHeight: 1.35 }}>
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <span>{String(row.decision_reason || 'Insufficient sample/data for decision reason.')}</span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        Confidence: {confidenceStyle.label}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#334155' }}>{fmtCurrency(row.spend)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#334155' }}>{fmtCount(row.leads)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#334155' }}>{fmtCount(row.qualified_leads)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#334155' }}>{fmtCount(row.great_leads)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#334155' }}>{fmtCurrency(row.cpl)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#334155' }}>{fmtCurrency(row.cpql)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#334155' }}>{fmtCurrency(row.cpgl)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#334155' }}>{fmtPct(row.display_qualified_rate)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#334155' }}>{fmtPct(row.display_great_rate)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={TABLE_COLUMNS.length} style={{ padding: '12px', fontSize: '12px', color: '#64748b' }}>
                  Insufficient sample/data for experiment-quality rows in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '10px' }}>
        <div style={{ ...sectionCardStyle, borderLeft: '4px solid #0f766e' }}>
          <p style={{ margin: 0, fontSize: '11px', color: '#115e59', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Paid Optimization Recommendations
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'grid', gap: '6px' }}>
            {(data?.paid_recommendations || []).map((line, idx) => (
              <li key={`paid-rec-${idx}-${line}`} style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>{line}</li>
            ))}
            {(!Array.isArray(data?.paid_recommendations) || data.paid_recommendations.length === 0) && (
              <li style={{ fontSize: '12px', color: '#64748b' }}>Insufficient sample/data for paid recommendations.</li>
            )}
          </ul>
        </div>

        <div style={{ ...sectionCardStyle, borderLeft: '4px solid #2563eb' }}>
          <p style={{ margin: 0, fontSize: '11px', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Organic and Referral Improvement Insights
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'grid', gap: '6px' }}>
            {(data?.organic_referral_insights || []).map((line, idx) => (
              <li key={`organic-rec-${idx}-${line}`} style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>{line}</li>
            ))}
            {(!Array.isArray(data?.organic_referral_insights) || data.organic_referral_insights.length === 0) && (
              <li style={{ fontSize: '12px', color: '#64748b' }}>Insufficient sample/data for organic/referral insights.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
