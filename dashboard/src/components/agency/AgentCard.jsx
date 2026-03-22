import React from 'react';
import { AlertTriangle, Pause, DollarSign } from 'lucide-react';

const STATUS_GLOW = {
  active:              'var(--color-success)',
  paused:              'var(--color-warning)',
  needs_intervention:  'var(--color-danger)',
};

const STATUS_LABEL = {
  active:              'Active',
  paused:              'Paused',
  needs_intervention:  'Needs Review',
};

export default function AgentCard({ agent, budgetInfo, rejectionInfo, isManager, onClick }) {
  const glow = STATUS_GLOW[agent.status] || 'var(--color-text-muted)';
  const budgetPct = budgetInfo
    ? Math.min(100, Math.round((Number(budgetInfo.spent_24h_cents) / Math.max(1, agent.daily_budget_cents)) * 100))
    : 0;
  const showPauseAlert = rejectionInfo?.recommend_pause;

  return (
    <button
      type="button"
      onClick={onClick}
      className="agency-agent-card"
      style={{
        '--agent-glow': glow,
        border: isManager ? '1px solid var(--color-border-glow)' : '1px solid var(--color-border)',
      }}
    >
      {/* Pulse ring */}
      <div className={`agency-pulse-ring agency-pulse-${agent.status}`} />

      {/* Avatar */}
      <div className="agency-agent-avatar" style={{ fontSize: isManager ? '32px' : '26px' }}>
        {agent.avatar_emoji}
      </div>

      {/* Name + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="agency-agent-name">{agent.role_name}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
          <span
            className="agency-status-dot"
            style={{ background: glow }}
          />
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {STATUS_LABEL[agent.status]}
          </span>
        </div>
      </div>

      {/* Budget bar */}
      <div style={{ width: '100%', marginTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <DollarSign size={11} />
            Budget
          </span>
          <span>{budgetPct}%</span>
        </div>
        <div className="agency-budget-track">
          <div
            className="agency-budget-fill"
            style={{
              width: `${budgetPct}%`,
              background: budgetPct >= 90
                ? 'var(--color-danger)'
                : budgetPct >= 70
                  ? 'var(--color-warning)'
                  : 'var(--color-dark-green)',
            }}
          />
        </div>
      </div>

      {/* Alerts */}
      {showPauseAlert && (
        <div className="agency-alert-badge" style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)' }}>
          <AlertTriangle size={12} style={{ color: 'var(--color-danger)' }} />
          <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>High rejection rate - consider retraining</span>
        </div>
      )}

      {budgetInfo?.budget_exceeded && (
        <div className="agency-alert-badge" style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)' }}>
          <Pause size={12} style={{ color: 'var(--color-warning)' }} />
          <span style={{ fontSize: '11px', color: 'var(--color-warning)' }}>Budget exhausted - paused</span>
        </div>
      )}
    </button>
  );
}
