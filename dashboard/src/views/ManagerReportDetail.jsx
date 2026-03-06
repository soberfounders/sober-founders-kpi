import React, { useMemo, useState } from 'react';
import { ArrowLeft, Database, Loader2, RefreshCw } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../lib/supabaseClient';
import { getManagerDefinition } from '../lib/managerRegistry';
import useManagerReport from '../hooks/useManagerReport';
import KpiScoreboard from '../components/manager-reports/KpiScoreboard';
import AutonomousActions from '../components/manager-reports/AutonomousActions';
import HumanTodos from '../components/manager-reports/HumanTodos';

const PERIOD_OPTIONS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'mtd', label: 'MTD' },
  { value: 'qtd', label: 'QTD' },
];

function normalizeTrend(trend) {
  return {
    id: trend?.id || 'trend',
    title: trend?.title || 'Trend',
    points: Array.isArray(trend?.points)
      ? trend.points
          .map((point) => ({ x: String(point?.x || ''), y: Number(point?.y || 0) }))
          .filter((point) => point.x)
      : [],
  };
}

function formatCell(value) {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function statusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'green') return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
  if (normalized === 'red') return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
  return { bg: '#fef9c3', text: '#854d0e', border: '#fde047' };
}

function ToastList({ items = [] }) {
  if (!items.length) return null;
  return (
    <div style={{ position: 'fixed', top: '84px', right: '18px', zIndex: 1100, display: 'grid', gap: '8px', width: '320px' }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            padding: '10px 12px',
            borderRadius: '10px',
            border: `1px solid ${item.type === 'error' ? '#fca5a5' : '#86efac'}`,
            backgroundColor: item.type === 'error' ? '#fef2f2' : '#ecfdf5',
            color: item.type === 'error' ? '#991b1b' : '#166534',
            fontSize: '12px',
            lineHeight: 1.35,
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
          }}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}

export default function ManagerReportDetail({ managerKey, onBack }) {
  const manager = getManagerDefinition(managerKey);
  const [period, setPeriod] = useState('30d');
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState([]);

  const { report, loading, refreshing, error, fromCache, refresh } = useManagerReport(
    managerKey,
    period,
    'previous',
    {},
  );

  const notify = (item) => {
    const nextItem = { id: `${Date.now()}-${Math.random()}`, ...item };
    setToasts((prev) => [...prev.slice(-2), nextItem]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((row) => row.id !== nextItem.id));
    }, 4000);
  };

  const handleSyncData = async () => {
    if (!manager?.sync) return;
    setSyncing(true);
    try {
      const options = {};
      if (manager.sync.method) options.method = manager.sync.method;
      if (manager.sync.queryString) options.queryString = manager.sync.queryString;
      if (manager.sync.body) options.body = manager.sync.body;

      const { data, error: invokeError } = await supabase.functions.invoke(manager.sync.functionName, options);
      if (invokeError) throw invokeError;
      if (data?.ok === false) throw new Error(data?.error || 'Sync failed.');

      notify({ type: 'success', message: `${manager.name} sync completed.` });
      await refresh();
    } catch (err) {
      notify({ type: 'error', message: `${manager?.name || 'Manager'} sync failed: ${err?.message || 'unknown error'}` });
    } finally {
      setSyncing(false);
    }
  };

  const summary = useMemo(() => {
    const rows = Array.isArray(report?.executive_summary)
      ? report.executive_summary.map((row) => String(row || '').trim()).filter(Boolean)
      : [];
    while (rows.length < 3) rows.push('No summary insight available for this bullet yet.');
    return rows.slice(0, 3);
  }, [report]);

  const trends = useMemo(() => {
    const rows = Array.isArray(report?.trends) ? report.trends.map(normalizeTrend) : [];
    while (rows.length < 2) rows.push({ id: `placeholder-${rows.length + 1}`, title: `Trend ${rows.length + 1}`, points: [] });
    return rows.slice(0, 2);
  }, [report]);

  const dataFreshness = report?.data_freshness || { last_sync_at: null, sources: [] };
  const freshnessBadge = statusBadge(
    dataFreshness?.last_sync_at && (Date.now() - Date.parse(dataFreshness.last_sync_at) <= 24 * 60 * 60 * 1000)
      ? 'green'
      : 'watch',
  );

  if (!manager) {
    return (
      <div style={errorCardStyle}>
        <p style={{ fontWeight: 700 }}>Unknown manager key</p>
        <p style={{ marginTop: '8px' }}>This report key is not registered.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <ToastList items={toasts} />

      <div style={baseCardStyle}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#0f766e',
            fontWeight: 700,
            fontSize: '13px',
            marginBottom: '12px',
          }}
        >
          <ArrowLeft size={15} />
          Back to Manager Reports
        </button>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <p style={{ fontSize: '12px', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.06em' }}>
              Manager Report
            </p>
            <h2 style={{ marginTop: '4px', fontSize: '30px', color: '#0f172a' }}>{manager.name}</h2>
            <p style={{ marginTop: '6px', color: '#475569', fontSize: '13px' }}>{manager.description}</p>
          </div>

          <div style={{ display: 'grid', gap: '8px', minWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <label style={labelStyle} htmlFor="period-select">Period</label>
              <select
                id="period-select"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                style={selectStyle}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <label style={labelStyle} htmlFor="compare-toggle">Compare (previous period)</label>
              <input
                id="compare-toggle"
                type="checkbox"
                checked={compareEnabled}
                onChange={(event) => setCompareEnabled(event.target.checked)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <span style={{
                borderRadius: '999px',
                padding: '3px 8px',
                backgroundColor: freshnessBadge.bg,
                color: freshnessBadge.text,
                border: `1px solid ${freshnessBadge.border}`,
                fontWeight: 700,
              }}
              >
                Data freshness
              </span>
              <span style={{ color: '#475569' }}>
                Last updated: {report?.generated_at ? new Date(report.generated_at).toLocaleString() : '—'}
                {fromCache ? ' (cached)' : ''}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => refresh()}
                disabled={refreshing || loading}
                style={primaryButtonStyle}
              >
                {refreshing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
                Refresh analysis
              </button>

              {manager.sync && (
                <button
                  type="button"
                  onClick={handleSyncData}
                  disabled={syncing}
                  style={secondaryButtonStyle}
                >
                  {syncing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Database size={14} />}
                  Sync data
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {(loading || refreshing) && (
        <div style={baseCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '120px', color: '#0f766e' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', marginRight: '10px' }} />
            <span>Loading report...</span>
          </div>
        </div>
      )}

      {error && (
        <div style={errorCardStyle}>
          <p style={{ fontWeight: 700 }}>Report generation failed</p>
          <p style={{ marginTop: '6px' }}>{error}</p>
        </div>
      )}

      {!loading && !error && report && (
        <>
          <div style={baseCardStyle}>
            <h3 style={sectionTitleStyle}>Executive Summary</h3>
            <ul style={{ marginTop: '8px', paddingLeft: '18px', display: 'grid', gap: '8px' }}>
              {summary.map((item, idx) => (
                <li key={`${manager.key}-summary-${idx}`} style={{ color: '#0f172a', lineHeight: 1.45 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div style={baseCardStyle}>
            <h3 style={sectionTitleStyle}>KPI Scoreboard</h3>
            <div style={{ marginTop: '10px' }}>
              <KpiScoreboard
                rows={(report?.scoreboard || []).map((row) => ({
                  ...row,
                  previous: compareEnabled ? row.previous : null,
                  delta: compareEnabled ? row.delta : null,
                }))}
              />
            </div>
          </div>

          <div style={baseCardStyle}>
            <h3 style={sectionTitleStyle}>Drivers + Breakdown</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: '10px' }}>
              <ul style={{ paddingLeft: '18px', display: 'grid', gap: '6px' }}>
                {(report?.drivers || []).slice(0, 6).map((driver) => (
                  <li key={driver} style={{ color: '#0f172a', lineHeight: 1.4 }}>{driver}</li>
                ))}
              </ul>

              <div style={{ border: '1px solid var(--color-border)', borderRadius: '12px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: '#fff' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
                      {(report?.breakdown?.columns || []).map((column) => (
                        <th key={column} style={tableHeaderStyle}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.breakdown?.rows || []).map((row, idx) => (
                      <tr key={`${manager.key}-breakdown-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {(report?.breakdown?.columns || []).map((column) => (
                          <td key={`${idx}-${column}`} style={tableCellStyle}>{formatCell(row?.[column])}</td>
                        ))}
                      </tr>
                    ))}
                    {(report?.breakdown?.rows || []).length === 0 && (
                      <tr>
                        <td colSpan={(report?.breakdown?.columns || []).length || 1} style={{ ...tableCellStyle, textAlign: 'center', color: '#64748b' }}>
                          No breakdown rows for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={baseCardStyle}>
            <h3 style={sectionTitleStyle}>Trends</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginTop: '10px' }}>
              {trends.map((trend) => (
                <div key={trend.id} style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '10px', backgroundColor: '#fff' }}>
                  <p style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>{trend.title}</p>
                  <div style={{ height: '220px', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend.points}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="x" tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="y" stroke="#0f766e" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={baseCardStyle}>
            <h3 style={sectionTitleStyle}>Autonomous AI Actions</h3>
            <p style={{ marginTop: '6px', color: '#64748b', fontSize: '13px' }}>
              Exactly three AI actions are available for this manager.
            </p>
            <div style={{ marginTop: '10px' }}>
              <AutonomousActions
                managerKey={managerKey}
                period={period}
                compare="previous"
                filters={{}}
                actions={(report?.autonomous_actions || []).slice(0, 3)}
                onCompleted={() => refresh()}
                onNotify={notify}
              />
            </div>
          </div>

          <div style={baseCardStyle}>
            <h3 style={sectionTitleStyle}>Human To-Dos</h3>
            <p style={{ marginTop: '6px', color: '#64748b', fontSize: '13px' }}>
              Exactly three human follow-ups can be sent to Notion.
            </p>
            <div style={{ marginTop: '10px' }}>
              <HumanTodos
                managerKey={managerKey}
                todos={(report?.human_todos || []).slice(0, 3)}
                onNotify={notify}
              />
            </div>
          </div>

          <div style={baseCardStyle}>
            <h3 style={sectionTitleStyle}>Data Freshness Sources</h3>
            <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
              {(dataFreshness?.sources || []).map((source) => (
                <div key={`${manager.key}-${source.source}`} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                  <p style={{ fontSize: '12px', textTransform: 'uppercase', color: '#64748b' }}>{source.source}</p>
                  <p style={{ marginTop: '4px', color: '#0f172a', fontWeight: 600 }}>
                    Last sync: {source.last_sync_at ? new Date(source.last_sync_at).toLocaleString() : 'N/A'}
                  </p>
                  <p style={{ marginTop: '2px', fontSize: '12px', color: '#64748b' }}>
                    Rows observed: {source.row_count ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const baseCardStyle = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '16px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

const errorCardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #fecaca',
  borderRadius: '16px',
  padding: '16px',
  color: '#991b1b',
};

const sectionTitleStyle = {
  fontSize: '18px',
  color: '#0f172a',
};

const labelStyle = {
  color: '#475569',
  fontSize: '12px',
  fontWeight: 600,
};

const selectStyle = {
  borderRadius: '8px',
  border: '1px solid var(--color-border)',
  padding: '6px 10px',
  backgroundColor: '#fff',
};

const primaryButtonStyle = {
  border: 'none',
  borderRadius: '9px',
  padding: '8px 12px',
  fontSize: '12px',
  fontWeight: 700,
  color: 'white',
  backgroundColor: '#0f766e',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const secondaryButtonStyle = {
  border: '1px solid var(--color-border)',
  borderRadius: '9px',
  padding: '8px 12px',
  fontSize: '12px',
  fontWeight: 700,
  color: '#0f172a',
  backgroundColor: '#f8fafc',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const tableHeaderStyle = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: '11px',
  textTransform: 'uppercase',
  color: '#64748b',
};

const tableCellStyle = {
  padding: '8px 10px',
  color: '#0f172a',
};
