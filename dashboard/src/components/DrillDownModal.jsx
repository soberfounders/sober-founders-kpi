import React, { useEffect } from 'react';

/**
 * DrillDownModal — reusable overlay modal for data drill-downs.
 *
 * Props:
 *   isOpen      : boolean
 *   onClose     : () => void
 *   title       : string
 *   columns     : [{ key: string, label: string, type?: 'text'|'currency'|'number' }]
 *   rows        : [{}]
 *   emptyMessage: string (optional)
 */

function formatCell(value, type = 'text') {
    if (value === null || value === undefined || value === '') return '—';
    if (type === 'currency') {
        const n = Number(value);
        return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : String(value);
    }
    if (type === 'number') {
        const n = Number(value);
        return Number.isFinite(n) ? Math.round(n).toLocaleString() : String(value);
    }
    return String(value);
}

const TIER_COLORS = {
    great: { bg: '#dcfce7', color: '#166534' },
    qualified: { bg: '#dbeafe', color: '#1e40af' },
    ok: { bg: '#fef9c3', color: '#854d0e' },
    bad: { bg: '#fee2e2', color: '#991b1b' },
    unknown: { bg: '#f1f5f9', color: '#475569' },
};

export default function DrillDownModal({ isOpen, onClose, title, columns, rows, emptyMessage, highlightKey }) {
    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handle = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const safeRows = rows || [];
    const safeCols = columns || [];
    const safeMessage = emptyMessage || 'No data available.';

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9000,
                backgroundColor: 'rgba(15, 23, 42, 0.55)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '40px 16px',
                overflowY: 'auto',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    width: '100%',
                    maxWidth: '1200px', // Increased from 900px to accommodate more columns
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                    }}
                >
                    <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>{title}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                            {safeRows.length.toLocaleString()} row{safeRows.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            border: 'none',
                            background: '#e2e8f0',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#475569',
                        }}
                    >
                        ✕ Close
                    </button>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: safeCols.length > 4 ? '1000px' : 'auto' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc' }}>
                                {safeCols.map((col) => (
                                    <th
                                        key={col.key}
                                        style={{
                                            textAlign: 'left',
                                            padding: '10px 12px',
                                            borderBottom: '1px solid #e2e8f0',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            color: '#475569',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {safeRows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={safeCols.length || 1}
                                        style={{ padding: '20px 12px', fontSize: '13px', color: '#64748b', textAlign: 'center' }}
                                    >
                                        {safeMessage}
                                    </td>
                                </tr>
                            )}
                            {safeRows.map((row, rowIdx) => {
                                const isHighlighted = highlightKey && row[highlightKey];
                                return (
                                    <tr
                                        key={rowIdx}
                                        style={{ backgroundColor: isHighlighted ? '#f0fdf4' : (rowIdx % 2 === 0 ? '#fff' : '#f8fafc') }}
                                    >
                                        {safeCols.map((col) => {
                                            // Special rendering for 'tier' column
                                            if (col.key === 'tier') {
                                                const tier = String(row[col.key] || 'unknown').toLowerCase();
                                                const style = TIER_COLORS[tier] || TIER_COLORS.unknown;
                                                return (
                                                    <td key={col.key} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>
                                                        <span style={{
                                                            backgroundColor: style.bg,
                                                            color: style.color,
                                                            borderRadius: '6px',
                                                            padding: '2px 8px',
                                                            fontWeight: 600,
                                                            fontSize: '11px',
                                                        }}>
                                                            {tier.charAt(0).toUpperCase() + tier.slice(1)}
                                                        </span>
                                                    </td>
                                                );
                                            }
                                            return (
                                                <td
                                                    key={col.key}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderBottom: '1px solid #f1f5f9',
                                                        fontSize: '12px',
                                                        color: '#334155',
                                                        maxWidth: '280px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {formatCell(row[col.key], col.type)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
