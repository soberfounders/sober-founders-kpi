import React, { useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export default function AutonomousActions({
  managerKey,
  period,
  compare,
  filters,
  actions = [],
  onCompleted,
  onNotify,
}) {
  const [runState, setRunState] = useState({});
  const list = useMemo(() => (actions || []).slice(0, 3), [actions]);

  const runAction = async (action) => {
    if (!action?.action_id) return;
    setRunState((prev) => ({ ...prev, [action.action_id]: { status: 'running', message: '' } }));

    try {
      const { data, error } = await supabase.functions.invoke('ai-manager-action', {
        body: {
          manager_key: managerKey,
          action_id: action.action_id,
          period,
          compare,
          filters: filters || {},
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'ai-manager-action failed');

      const successMessage = data?.result?.what_changed || 'Action completed.';
      setRunState((prev) => ({ ...prev, [action.action_id]: { status: 'success', message: successMessage } }));
      onNotify?.({ type: 'success', message: `${action.title}: ${successMessage}` });
      await onCompleted?.();
    } catch (err) {
      const message = err?.message || 'Action failed.';
      setRunState((prev) => ({ ...prev, [action.action_id]: { status: 'error', message } }));
      onNotify?.({ type: 'error', message: `${action.title}: ${message}` });
    }
  };

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {list.map((action) => {
        const state = runState[action.action_id] || {};
        const isRunning = state.status === 'running';
        return (
          <div
            key={action.action_id}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              backgroundColor: '#fff',
              padding: '12px',
              display: 'grid',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{action.title}</p>
                <p style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', lineHeight: 1.45 }}>{action.description}</p>
                <p style={{ marginTop: '4px', fontSize: '12px', color: '#475569' }}>
                  Impact: {action.expected_impact} | Risk: {String(action.risk || '').toUpperCase()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => runAction(action)}
                disabled={isRunning}
                style={{
                  border: 'none',
                  borderRadius: '9px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'white',
                  backgroundColor: isRunning ? '#86efac' : '#16a34a',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isRunning ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
                {isRunning ? 'Running...' : 'Run'}
              </button>
            </div>
            {(state.status === 'success' || state.status === 'error') && (
              <p style={{ fontSize: '12px', color: state.status === 'error' ? '#b91c1c' : '#166534' }}>
                {state.message}
              </p>
            )}
          </div>
        );
      })}
      {list.length === 0 && (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: '10px', padding: '10px', color: '#64748b', fontSize: '12px' }}>
          No autonomous actions available.
        </div>
      )}
    </div>
  );
}
