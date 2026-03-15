import React, { useState } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, X } from 'lucide-react';
import notionLogo from '../assets/notion-logo.png';

/**
 * Inline insight bar displayed below each KPI section.
 *
 * Shows a one-sentence data-driven summary ("so what") and one suggested
 * action with an "Add to Notion" button and a dismiss button.
 *
 * Props:
 *   summary      – string, one-sentence "so what" driven by KPI data
 *   action       – string, one concrete next step
 *   taskName     – string, pre-filled Notion task name when user clicks add
 *   trend        – 'up' | 'down' | 'neutral', drives the icon and border color
 *   toneIsGood   – boolean, whether the trend direction is good for the org
 *   onAddToNotion – (taskName: string) => void, opens the Notion modal
 *   dismissKey   – string, unique key for localStorage dismiss tracking
 */
const DISMISS_STORAGE_KEY = 'dashboard-section-insight-dismissed-v1';

function getDismissedSet() {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function persistDismissedSet(dismissedSet) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([...dismissedSet]));
  } catch {
    // Ignore write failures.
  }
}

const SectionInsightBar = ({
  summary,
  action,
  taskName,
  trend = 'neutral',
  toneIsGood = false,
  onAddToNotion,
  dismissKey,
}) => {
  const [dismissed, setDismissed] = useState(() => {
    if (!dismissKey) return false;
    return getDismissedSet().has(dismissKey);
  });

  if (dismissed || (!summary && !action)) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey) {
      const set = getDismissedSet();
      set.add(dismissKey);
      persistDismissedSet(set);
    }
  };

  const isDown = trend === 'down';
  const isUp = trend === 'up';
  const isRedFlag = isDown && !toneIsGood;
  const isGreen = (isUp && toneIsGood) || (isDown && toneIsGood);

  const borderColor = isRedFlag
    ? 'var(--color-danger-border)'
    : isGreen
      ? 'var(--color-success-border)'
      : 'var(--color-border)';

  const accentColor = isRedFlag
    ? 'var(--color-danger)'
    : isGreen
      ? 'var(--color-success)'
      : 'var(--color-neutral)';

  const bgColor = isRedFlag
    ? 'var(--color-danger-bg)'
    : isGreen
      ? 'var(--color-success-bg)'
      : 'var(--color-surface-elevated)';

  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const LeadIcon = isRedFlag ? AlertTriangle : TrendIcon;

  return (
    <div
      style={{
        marginTop: '10px',
        padding: '10px 14px',
        borderRadius: '10px',
        border: `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
      }}
    >
      {/* Icon */}
      <LeadIcon size={16} color={accentColor} style={{ flexShrink: 0 }} />

      {/* Summary + action text */}
      <div style={{ flex: 1, minWidth: '200px' }}>
        {summary && (
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
            {summary}
          </p>
        )}
        {action && (
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: summary ? '2px' : 0, lineHeight: 1.4 }}>
            {action}
          </p>
        )}
      </div>

      {/* Add to Notion */}
      {onAddToNotion && taskName && (
        <button
          type="button"
          className="btn-glass"
          aria-label="Add to Notion"
          title="Add to Notion to-do list"
          onClick={() => onAddToNotion(taskName)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '7px',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = accentColor; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
        >
          <img
            src={notionLogo}
            alt=""
            style={{ width: '16px', height: '16px', borderRadius: '3px', display: 'block' }}
          />
          <span style={{ fontSize: '14px', fontWeight: 800, lineHeight: 1 }}>+</span>
        </button>
      )}

      {/* Dismiss */}
      <button
        type="button"
        aria-label="Dismiss insight"
        title="Dismiss"
        onClick={handleDismiss}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          borderRadius: '6px',
          border: 'none',
          background: 'none',
          color: 'var(--color-text-muted)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default SectionInsightBar;
