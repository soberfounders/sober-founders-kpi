import React, { useMemo } from 'react';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
};

const listCardStyle = {
  backgroundColor: '#f8fafc',
  borderRadius: '10px',
  padding: '12px',
  border: '1px solid #e2e8f0',
};

const levelTone = {
  high: { badgeBg: '#dcfce7', badgeText: '#166534', warningBorder: '#86efac', warningBg: '#f0fdf4', warningText: '#166534' },
  medium: { badgeBg: '#ffedd5', badgeText: '#9a3412', warningBorder: '#fdba74', warningBg: '#fff7ed', warningText: '#9a3412' },
  low: { badgeBg: '#fee2e2', badgeText: '#991b1b', warningBorder: '#fca5a5', warningBg: '#fef2f2', warningText: '#991b1b' },
  unknown: { badgeBg: '#e2e8f0', badgeText: '#334155', warningBorder: '#cbd5e1', warningBg: '#f8fafc', warningText: '#475569' },
};

function normalizeScore(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const normalized = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, normalized));
}

function inferLevel(level, score) {
  const normalizedLevel = String(level || '').trim().toLowerCase();
  if (normalizedLevel === 'high' || normalizedLevel === 'medium' || normalizedLevel === 'low') return normalizedLevel;
  if (!Number.isFinite(score)) return 'unknown';
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}

function toBlockerList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
      if (item && typeof item === 'object') {
        const message = String(item.message ?? '').trim();
        if (message) return message;
        const code = String(item.code ?? '').trim();
        if (code) return code;
      }
      return '';
    })
    .filter(Boolean);
}

function toTaskList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
      if (item && typeof item === 'object') {
        const title = String(item.title ?? '').trim();
        if (title) return title;
        const taskId = String(item.task_id ?? '').trim();
        if (taskId) return taskId;
      }
      return '';
    })
    .filter(Boolean);
}

function renderListCard({ title, rows, emptyMessage, accentColor }) {
  return (
    <div style={{ ...listCardStyle, borderLeft: `4px solid ${accentColor}` }}>
      <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        {title}
      </p>
      {rows.length > 0 ? (
        <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'grid', gap: '6px' }}>
          {rows.map((row, idx) => (
            <li key={`${title}-${idx}-${row}`} style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>{row}</li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>{emptyMessage}</p>
      )}
    </div>
  );
}

export default function LeadsConfidenceActionPanel({ data, isLoading = false }) {
  const normalized = useMemo(() => {
    const score = normalizeScore(data?.confidence_score);
    const level = inferLevel(data?.confidence_level, score);
    return {
      score,
      level,
      blockers: toBlockerList(data?.blockers).slice(0, 5),
      autonomousTasks: toTaskList(data?.autonomous_tasks),
      humanTasks: toTaskList(data?.human_tasks),
    };
  }, [data]);

  if (isLoading) {
    return (
      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          Confidence and Action Queue
        </p>
        <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Lead quality confidence panel</h3>
        <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
          {[0, 1, 2].map((idx) => (
            <div key={`lead-confidence-loading-${idx}`} style={{ height: '16px', backgroundColor: '#e2e8f0', borderRadius: '6px' }} />
          ))}
        </div>
      </section>
    );
  }

  const tone = levelTone[normalized.level] || levelTone.unknown;
  const hasData = !!data;
  const isLowConfidence = hasData && (normalized.level === 'low' || (Number.isFinite(normalized.score) && normalized.score < 0.6));

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Confidence and Action Queue
          </p>
          <h3 style={{ margin: '6px 0 0', fontSize: '17px', color: '#0f172a' }}>Lead quality confidence panel</h3>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
            Uses confidence payload from W1 when available and safely falls back when it is missing.
          </p>
        </div>
        <div style={{ ...listCardStyle, minWidth: '210px', backgroundColor: '#fff' }}>
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Confidence score
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
            {Number.isFinite(normalized.score) ? `${Math.round(normalized.score * 100)}%` : 'N/A'}
          </p>
          <span style={{ display: 'inline-flex', marginTop: '6px', borderRadius: '999px', padding: '3px 8px', backgroundColor: tone.badgeBg, color: tone.badgeText, fontSize: '11px', fontWeight: 700 }}>
            {normalized.level.toUpperCase()}
          </span>
        </div>
      </div>

      {isLowConfidence && (
        <div style={{ marginTop: '10px', border: `1px solid ${tone.warningBorder}`, backgroundColor: tone.warningBg, borderRadius: '10px', padding: '10px 12px' }}>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: tone.warningText }}>
            Low confidence warning: verify blockers and prioritize human review tasks before acting on this queue.
          </p>
        </div>
      )}

      {!hasData && (
        <div style={{ marginTop: '10px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', borderRadius: '10px', padding: '10px 12px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>
            No confidence queue payload is available yet. Showing placeholders until W1 data is present.
          </p>
        </div>
      )}

      <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '10px' }}>
        {renderListCard({
          title: 'Top blockers',
          rows: normalized.blockers,
          emptyMessage: 'No blockers reported.',
          accentColor: '#f59e0b',
        })}
        {renderListCard({
          title: 'Autonomous tasks',
          rows: normalized.autonomousTasks,
          emptyMessage: 'No autonomous tasks available.',
          accentColor: '#2563eb',
        })}
        {renderListCard({
          title: 'Human-required tasks',
          rows: normalized.humanTasks,
          emptyMessage: 'No human review tasks available.',
          accentColor: '#0f766e',
        })}
      </div>
    </section>
  );
}
