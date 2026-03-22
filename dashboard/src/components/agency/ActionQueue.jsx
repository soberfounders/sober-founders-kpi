import React, { useState } from 'react';
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, FileText, Mail, Globe, MessageSquare, Pencil } from 'lucide-react';

const TYPE_META = {
  email:          { icon: Mail,          label: 'Email',         cssVar: '--color-info' },
  wp_post:        { icon: FileText,      label: 'Blog Post',     cssVar: '--color-purple' },
  crm_update:     { icon: Globe,         label: 'CRM Update',    cssVar: '--color-cyan' },
  slack_message:  { icon: MessageSquare,  label: 'Slack',         cssVar: '--color-rose' },
  content_draft:  { icon: Pencil,        label: 'Content Draft', cssVar: '--color-warning' },
  seo_audit:      { icon: Globe,         label: 'SEO Audit',     cssVar: '--color-emerald' },
  other:          { icon: FileText,      label: 'Task',          cssVar: '--color-neutral' },
};

function TaskCard({ task, agentName, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState('');
  const meta = TYPE_META[task.type] || TYPE_META.other;
  const Icon = meta.icon;
  const accentColor = `var(${meta.cssVar})`;

  const isPending = task.status === 'pending';
  const statusStyle = {
    pending:  { bg: 'var(--color-warning-bg)',  color: 'var(--color-warning)',  label: 'Review Needed' },
    approved: { bg: 'var(--color-success-bg)',  color: 'var(--color-success)',  label: 'Approved' },
    rejected: { bg: 'var(--color-danger-bg)',   color: 'var(--color-danger)',   label: 'Rejected' },
    executed: { bg: 'var(--color-info-bg)',      color: 'var(--color-info)',     label: 'Executed' },
  }[task.status] || { bg: 'transparent', color: 'var(--color-text-muted)', label: task.status };

  return (
    <div className="agency-task-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {/* Type icon */}
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: `color-mix(in srgb, ${accentColor} 13%, transparent)`,
          border: `1px solid color-mix(in srgb, ${accentColor} 27%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={16} style={{ color: accentColor }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>{task.title}</span>
            <span style={{
              fontSize: '10px', padding: '2px 8px', borderRadius: '6px',
              background: statusStyle.bg, color: statusStyle.color, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              {statusStyle.label}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {agentName} - {meta.label} - {task.cost_estimate_cents > 0 ? `~$${(task.cost_estimate_cents / 100).toFixed(2)}` : 'Free'}
          </p>
        </div>

        {/* Expand toggle */}
        <button
          type="button"
          className="btn-glass"
          onClick={() => setExpanded(!expanded)}
          style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
          {task.reasoning && (
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Reasoning</p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{task.reasoning}</p>
            </div>
          )}

          {task.payload && Object.keys(task.payload).length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Payload</p>
              <pre style={{
                fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.4,
                background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '8px',
                overflow: 'auto', maxHeight: '200px', whiteSpace: 'pre-wrap',
              }}>
                {JSON.stringify(task.payload, null, 2)}
              </pre>
            </div>
          )}

          {task.feedback_text && (
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Feedback</p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>{task.feedback_text}</p>
            </div>
          )}

          {/* Actions for pending tasks */}
          {isPending && (
            <div style={{ marginTop: '12px' }}>
              <textarea
                className="neo-input"
                placeholder="Optional feedback..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                style={{ width: '100%', marginBottom: '8px', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onApprove(task.id, feedback)}
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  <CheckCircle2 size={14} /> Approve
                </button>
                <button
                  type="button"
                  className="btn-glass"
                  onClick={() => onReject(task.id, feedback)}
                  style={{ fontSize: '13px', padding: '8px 16px', color: 'var(--color-danger)' }}
                >
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActionQueue({ tasks, agentsById, onApprove, onReject }) {
  const [activeColumn, setActiveColumn] = useState('pending');

  const columns = [
    { key: 'pending',  label: 'Review Needed', icon: Clock,        statuses: ['pending'] },
    { key: 'approved', label: 'Approved',       icon: CheckCircle2, statuses: ['approved', 'executed'] },
    { key: 'history',  label: 'History',         icon: FileText,     statuses: ['rejected'] },
  ];

  // Mobile: tabs. Desktop: side-by-side columns.
  return (
    <div className="agency-kanban-container">
      {/* Mobile tab bar */}
      <div className="agency-kanban-tabs">
        {columns.map((col) => {
          const count = tasks.filter((t) => col.statuses.includes(t.status)).length;
          return (
            <button
              key={col.key}
              type="button"
              className={`agency-kanban-tab ${activeColumn === col.key ? 'active' : ''}`}
              onClick={() => setActiveColumn(col.key)}
            >
              <col.icon size={14} />
              {col.label}
              {count > 0 && <span className="agency-kanban-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Columns */}
      <div className="agency-kanban-columns">
        {columns.map((col) => {
          const colTasks = tasks
            .filter((t) => col.statuses.includes(t.status))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          const isVisible = activeColumn === col.key;

          return (
            <div
              key={col.key}
              className={`agency-kanban-column ${isVisible ? 'visible' : ''}`}
            >
              <div className="agency-kanban-column-header">
                <col.icon size={16} style={{ color: 'var(--color-dark-green)' }} />
                <span>{col.label}</span>
                <span className="agency-kanban-count">{colTasks.length}</span>
              </div>
              <div className="agency-kanban-column-body">
                {colTasks.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                    No tasks
                  </p>
                ) : (
                  colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      agentName={agentsById[task.agent_id]?.role_name || 'Unknown'}
                      onApprove={onApprove}
                      onReject={onReject}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
