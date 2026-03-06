import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { MANAGER_REGISTRY } from '../lib/managerRegistry';

function stableObject(value) {
  if (Array.isArray(value)) return value.map((item) => stableObject(item));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = stableObject(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableObject(value || {}));
}

function statusFromScoreboard(scoreboard = []) {
  const statuses = scoreboard.map((row) => String(row?.status || '').toLowerCase());
  if (statuses.includes('red')) return 'Red';
  if (statuses.includes('watch')) return 'Watch';
  return 'Green';
}

function statusStyle(status) {
  if (status === 'Green') return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
  if (status === 'Red') return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
  return { bg: '#fef9c3', text: '#854d0e', border: '#fde047' };
}

function formatMetricValue(row) {
  const value = row?.current;
  const unit = row?.unit;
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  const n = Number(value);
  if (unit === 'currency') return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (unit === 'percent') return `${(n * 100).toFixed(1)}%`;
  if (unit === 'ratio') return n.toFixed(2);
  return Math.round(n).toLocaleString();
}

export default function ManagerReportsIndex({ onOpenManager }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cardData, setCardData] = useState({});

  useEffect(() => {
    let mounted = true;

    async function loadCards() {
      setLoading(true);
      setError('');
      const defaultFiltersJson = stableJson({});

      try {
        const { data, error: snapshotError } = await supabase
          .from('analysis_snapshots')
          .select('manager_key,period,compare,filters,output,created_at,status')
          .eq('period', '30d')
          .eq('compare', 'previous')
          .eq('status', 'success')
          .order('created_at', { ascending: false })
          .limit(200);

        if (snapshotError) throw snapshotError;
        if (!mounted) return;

        const latestByManager = {};
        (data || []).forEach((row) => {
          if (!row?.manager_key || latestByManager[row.manager_key]) return;
          if (stableJson(row?.filters || {}) !== defaultFiltersJson) return;
          latestByManager[row.manager_key] = row;
        });

        const missingManagers = MANAGER_REGISTRY
          .map((manager) => manager.key)
          .filter((key) => !latestByManager[key]);

        if (missingManagers.length > 0) {
          const generatedRows = await Promise.all(
            missingManagers.map(async (managerKey) => {
              const invoke = await supabase.functions.invoke('ai-manager-report', {
                body: { manager_key: managerKey, period: '30d', compare: 'previous', filters: {}, force: false },
              });
              if (invoke.error || !invoke.data?.ok) return null;
              return {
                manager_key: managerKey,
                output: invoke.data,
                created_at: invoke.data.generated_at,
              };
            }),
          );
          generatedRows.filter(Boolean).forEach((row) => {
            latestByManager[row.manager_key] = row;
          });
        }

        const nextData = {};
        MANAGER_REGISTRY.forEach((manager) => {
          const snapshot = latestByManager[manager.key];
          const output = snapshot?.output || null;
          const scoreboard = Array.isArray(output?.scoreboard) ? output.scoreboard : [];
          const keyMetric = scoreboard[0] || null;

          nextData[manager.key] = {
            manager,
            status: statusFromScoreboard(scoreboard),
            lastUpdated: output?.generated_at || snapshot?.created_at || null,
            keyMetricLabel: keyMetric?.name || 'No KPI yet',
            keyMetricValue: keyMetric ? formatMetricValue(keyMetric) : 'N/A',
          };
        });

        if (mounted) setCardData(nextData);
      } catch (err) {
        if (mounted) setError(err?.message || 'Failed loading manager reports.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCards();
    return () => {
      mounted = false;
    };
  }, []);

  const cards = useMemo(
    () => MANAGER_REGISTRY.map((manager) => cardData[manager.key]).filter(Boolean),
    [cardData],
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '240px', color: '#0f766e' }}>
        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', marginRight: '10px' }} />
        <span style={{ fontWeight: 600 }}>Loading Manager Reports...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={errorCardStyle}>
        <p style={{ fontWeight: 700 }}>Manager Reports unavailable</p>
        <p style={{ marginTop: '6px' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={headerCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={18} color="#0f766e" />
          <p style={{ fontSize: '12px', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.08em' }}>Manager Reports</p>
        </div>
        <h2 style={{ marginTop: '6px', fontSize: '30px', color: '#0f172a' }}>Manager Report Hub</h2>
        <p style={{ marginTop: '8px', color: '#475569' }}>
          Open a manager report to view structured analysis, KPI scoreboards, trends, autonomous actions, and human follow-ups.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
        {cards.map((card) => {
          const statusColors = statusStyle(card.status);
          return (
            <button
              key={card.manager.key}
              type="button"
              onClick={() => onOpenManager?.(card.manager.key)}
              style={{
                textAlign: 'left',
                border: '1px solid var(--color-border)',
                borderRadius: '14px',
                backgroundColor: '#fff',
                padding: '16px',
                display: 'grid',
                gap: '10px',
                boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                <p style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{card.manager.name}</p>
                <span style={{
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '4px 8px',
                  backgroundColor: statusColors.bg,
                  color: statusColors.text,
                  border: `1px solid ${statusColors.border}`,
                }}
                >
                  {card.status}
                </span>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>{card.keyMetricLabel}</p>
                <p style={{ marginTop: '4px', fontSize: '26px', fontWeight: 700, color: '#0f172a' }}>{card.keyMetricValue}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '12px' }}>
                <span>
                  Last updated: {card.lastUpdated ? new Date(card.lastUpdated).toLocaleString() : 'Not generated'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: '#0f766e' }}>
                  Open <ArrowRight size={14} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const headerCardStyle = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

const errorCardStyle = {
  backgroundColor: 'white',
  border: '1px solid #fecaca',
  borderRadius: '16px',
  padding: '18px',
  color: '#991b1b',
};
