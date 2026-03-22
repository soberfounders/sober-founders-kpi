import React, { useState } from 'react';
import { X, Play, Pause, DollarSign, Brain, Activity, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export default function AgentDetailPanel({ agent, budgetInfo, rejectionInfo, onClose, onRefresh }) {
  const [saving, setSaving] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(agent.daily_budget_cents));

  const toggleStatus = async () => {
    setSaving(true);
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    await supabase.from('agents').update({ status: newStatus }).eq('id', agent.id);
    onRefresh();
    setSaving(false);
  };

  const saveBudget = async () => {
    if (!/^\d+$/.test(budgetInput.trim())) return;
    const cents = Number(budgetInput.trim());
    if (cents < 0) return;
    setSaving(true);
    await supabase.from('agents').update({ daily_budget_cents: cents }).eq('id', agent.id);
    onRefresh();
    setSaving(false);
  };

  const spent = budgetInfo ? Number(budgetInfo.spent_24h_cents) : 0;
  const remaining = budgetInfo ? Number(budgetInfo.remaining_cents) : agent.daily_budget_cents;

  return (
    <div className="agency-detail-overlay" onClick={onClose}>
      <div className="agency-detail-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>{agent.avatar_emoji}</span>
            <div>
              <h3 style={{ fontSize: '18px', color: 'var(--color-text-primary)' }}>{agent.role_name}</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                {agent.description || 'No description'}
              </p>
            </div>
          </div>
          <button type="button" className="btn-glass" onClick={onClose} style={{ width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Status toggle */}
        <div className="agency-detail-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Activity size={14} style={{ color: 'var(--color-dark-green)' }} />
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Status</span>
          </div>
          <button
            type="button"
            onClick={toggleStatus}
            disabled={saving}
            className={agent.status === 'active' ? 'btn-glass' : 'btn-primary'}
            style={{ fontSize: '13px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {agent.status === 'active' ? <><Pause size={14} /> Pause Agent</> : <><Play size={14} /> Activate Agent</>}
          </button>
        </div>

        {/* Budget management */}
        <div className="agency-detail-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <DollarSign size={14} style={{ color: 'var(--color-dark-green)' }} />
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Daily Budget</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
            <span>Spent (24h): ${(spent / 100).toFixed(2)}</span>
            <span>Remaining: ${(remaining / 100).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="neo-input"
              type="number"
              min="0"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              style={{ width: '120px' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', alignSelf: 'center' }}>cents/day</span>
            <button type="button" className="btn-primary" onClick={saveBudget} disabled={saving} style={{ fontSize: '12px', padding: '6px 12px' }}>
              Save
            </button>
          </div>
        </div>

        {/* Model routing */}
        <div className="agency-detail-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Brain size={14} style={{ color: 'var(--color-dark-green)' }} />
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Model Routing</span>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            <p>Simple tasks: <strong style={{ color: 'var(--color-text-primary)' }}>{agent.model_routing_config?.simple || 'gpt-4o-mini'}</strong></p>
            <p style={{ marginTop: '4px' }}>Complex tasks: <strong style={{ color: 'var(--color-text-primary)' }}>{agent.model_routing_config?.complex || 'claude-opus-4-6'}</strong></p>
          </div>
        </div>

        {/* Rejection rate */}
        {rejectionInfo && (
          <div className="agency-detail-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Clock size={14} style={{ color: 'var(--color-dark-green)' }} />
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Performance (Last 10)</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              <p>Resolved: {rejectionInfo.total_resolved} - Rejected: {rejectionInfo.total_rejected}</p>
              {rejectionInfo.recommend_pause && (
                <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '8px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={14} style={{ color: 'var(--color-danger)' }} />
                  <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>
                    Rejection rate exceeds 30%. Consider pausing and retraining this agent.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
