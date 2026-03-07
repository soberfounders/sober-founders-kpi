import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { TrendingDown, TrendingUp, AlertTriangle, Target, ChevronDown, ChevronUp, Edit3, Check, X, RefreshCw, Minus } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Mini sparkline SVG                                                 */
/* ------------------------------------------------------------------ */
function Sparkline({ values, color = '#6366f1', width = 72, height = 28 }) {
    if (!values || values.length < 2) return <div style={{ width, height }} />;
    const nums = values.map(Number);
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    const range = max - min || 1;
    const barW = Math.max(1, (width / nums.length) - 1.5);

    return (
        <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
            {nums.map((v, i) => {
                const h = Math.max(2, ((v - min) / range) * (height - 4));
                const isLast = i === nums.length - 1;
                return (
                    <rect
                        key={i}
                        x={i * (barW + 1.5)}
                        y={height - h}
                        width={barW}
                        height={h}
                        rx={1.5}
                        fill={isLast ? color : `${color}55`}
                    />
                );
            })}
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/*  Health ring SVG                                                    */
/* ------------------------------------------------------------------ */
function HealthRing({ pct, size = 76 }) {
    const r = size / 2 - 9;
    const circ = 2 * Math.PI * r;
    const dash = pct == null ? 0 : circ * (pct / 100);
    const color = pct == null ? '#cbd5e1' : pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626';
    const label = pct == null ? 'N/A' : `${pct}%`;

    return (
        <svg width={size} height={size}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={color} strokeWidth={8}
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
            <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fill={color} fontSize={13} fontWeight="700" fontFamily="inherit">
                {label}
            </text>
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/*  Goal status helpers                                                */
/* ------------------------------------------------------------------ */
const STATUS_STYLES = {
    on_track: { bg: '#f0fdf4', border: '#bbf7d0', badge: '#16a34a', label: 'On Track', icon: '✅' },
    near_goal: { bg: '#fffbeb', border: '#fde68a', badge: '#d97706', label: 'Near Goal', icon: '🟡' },
    off_track: { bg: '#fef2f2', border: '#fecaca', badge: '#dc2626', label: 'Off Track', icon: '🔴' },
    no_goal: { bg: '#f8fafc', border: '#e2e8f0', badge: '#94a3b8', label: 'No Goal', icon: '⚪' },
};

function fmtPct(v) {
    if (v == null) return 'n/a';
    const n = Number(v);
    return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtVal(v) {
    if (v == null || v === '') return '—';
    const n = Number(v);
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n % 1 === 0 ? String(n) : n.toFixed(1);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function TrendIntelligencePanel() {
    const [rows, setRows] = useState([]);
    const [, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showGoals, setShowGoals] = useState(false);
    const [editingKey, setEditingKey] = useState(null); // "kpi_key::funnel_key"
    const [editVal, setEditVal] = useState('');
    const [saving, setSaving] = useState(false);
    const [, setLastLoaded] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        // Fetch latest trend row per KPI/funnel
        const { data: trendRows } = await supabase
            .from('vw_kpi_trend')
            .select('kpi_key,kpi_name,funnel_key,week_start,value,z_score,wow_pct,wow_delta,consecutive_declines,goal_value,higher_is_better,goal_status,pct_to_goal,rolling_avg_8w,trailing_8w_values')
            .order('week_start', { ascending: false })
            .limit(500);

        // Also fetch all goals for the manager
        const { data: goalRows } = await supabase
            .from('kpi_goals')
            .select('kpi_key,funnel_key,target_value,higher_is_better,notes');

        if (trendRows) {
            const latestMap = new Map();
            for (const r of trendRows) {
                const k = `${r.kpi_key}::${r.funnel_key}`;
                if (!latestMap.has(k)) latestMap.set(k, r);
            }
            setRows(Array.from(latestMap.values()));
        }

        if (goalRows) setGoals(goalRows);
        setLastLoaded(new Date());
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    /* ---- derived ---- */
    const withGoals = rows.filter(r => r.goal_status !== 'no_goal');
    const onTrack = withGoals.filter(r => r.goal_status === 'on_track');
    const nearGoal = withGoals.filter(r => r.goal_status === 'near_goal');
    const offTrack = withGoals.filter(r => r.goal_status === 'off_track');
    const healthPct = withGoals.length > 0 ? Math.round((onTrack.length / withGoals.length) * 100) : null;

    const anomalies = rows
        .filter(r => r.z_score !== null && Math.abs(Number(r.z_score)) >= 1.5)
        .sort((a, b) => Math.abs(Number(b.z_score)) - Math.abs(Number(a.z_score)))
        .slice(0, 5);

    const decliners = rows
        .filter(r => Number(r.consecutive_declines) >= 2)
        .sort((a, b) => Number(b.consecutive_declines) - Number(a.consecutive_declines))
        .slice(0, 5);

    /* ---- goal editing ---- */
    const startEdit = (row) => {
        setEditingKey(`${row.kpi_key}::${row.funnel_key}`);
        setEditVal(String(row.goal_value ?? row.target_value ?? ''));
    };

    const cancelEdit = () => { setEditingKey(null); setEditVal(''); };

    const saveGoal = async (kpi_key, funnel_key) => {
        const num = parseFloat(editVal);
        if (isNaN(num) || num < 0) return;
        setSaving(true);
        await supabase.from('kpi_goals').upsert(
            { kpi_key, funnel_key, target_value: num },
            { onConflict: 'kpi_key,funnel_key' }
        );
        cancelEdit();
        await load();
        setSaving(false);
    };

    /* ---------------------------------------------------------------- */
    /*  Render                                                           */
    /* ---------------------------------------------------------------- */
    const card = {
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '14px',
        padding: '18px 20px',
        boxShadow: '0 1px 3px rgb(0 0 0 / 0.06)',
    };

    if (loading) {
        return (
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Loading trend intelligence…
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Header row: health ring + summary stats ── */}
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <HealthRing pct={healthPct} />
                <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                        KPI Health Score
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                        {withGoals.length > 0 ? `${onTrack.length} of ${withGoals.length} goals on track` : 'No goals configured yet'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {[
                            { label: 'On Track', count: onTrack.length, bg: '#f0fdf4', color: '#16a34a' },
                            { label: 'Near Goal', count: nearGoal.length, bg: '#fffbeb', color: '#d97706' },
                            { label: 'Off Track', count: offTrack.length, bg: '#fef2f2', color: '#dc2626' },
                        ].map(s => (
                            <span key={s.label} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.color }}>
                                {s.count} {s.label}
                            </span>
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                    {[
                        { icon: '🚨', label: 'Statistical Anomalies', count: anomalies.length, color: '#7c3aed' },
                        { icon: '📉', label: 'Declining 2+ Weeks', count: decliners.length, color: '#dc2626' },
                    ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, lineHeight: 1 }}>{s.icon}</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, marginTop: 2 }}>{s.count}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', maxWidth: 80, lineHeight: 1.3, marginTop: 2 }}>{s.label}</div>
                        </div>
                    ))}
                </div>
                <button onClick={load} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                    <RefreshCw size={12} /> Refresh
                </button>
            </div>

            {/* ── Anomalies ── */}
            {anomalies.length > 0 && (
                <div style={{ ...card, borderLeft: '3px solid #7c3aed', background: '#faf5ff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        <span style={{ fontSize: 14 }}>🚨</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9' }}>Statistical Anomalies</span>
                        <span style={{ fontSize: 11, color: '#a78bfa', marginLeft: 4 }}>z-score ≥ 1.5σ from 8-week mean</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {anomalies.map(r => {
                            const zAbs = Math.abs(Number(r.z_score));
                            const isSpike = Number(r.z_score) > 0;
                            return (
                                <div key={`${r.kpi_key}-${r.funnel_key}`}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'white', border: '1px solid #e9d5ff', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                        {isSpike ? <TrendingUp size={14} color="#7c3aed" /> : <TrendingDown size={14} color="#dc2626" />}
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.kpi_name}</div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Funnel: {r.funnel_key}</div>
                                        </div>
                                    </div>
                                    {r.trailing_8w_values && (
                                        <Sparkline values={r.trailing_8w_values} color={isSpike ? '#7c3aed' : '#dc2626'} />
                                    )}
                                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: isSpike ? '#7c3aed' : '#dc2626' }}>{fmtVal(r.value)}</div>
                                        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>WoW: {fmtPct(r.wow_pct)}</div>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isSpike ? '#ede9fe' : '#fee2e2', color: isSpike ? '#6d28d9' : '#b91c1c', whiteSpace: 'nowrap' }}>
                                        {isSpike ? '↑' : '↓'} {zAbs.toFixed(1)}σ {isSpike ? 'spike' : 'drop'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Consecutive Decliners ── */}
            {decliners.length > 0 && (
                <div style={{ ...card, borderLeft: '3px solid #dc2626', background: '#fff8f8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        <span style={{ fontSize: 14 }}>📉</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>Consecutive Decline Warning</span>
                        <span style={{ fontSize: 11, color: '#fca5a5', marginLeft: 4 }}>declining week-over-week</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {decliners.map(r => {
                            const wks = Number(r.consecutive_declines);
                            const isCritical = wks >= 3;
                            return (
                                <div key={`${r.kpi_key}-${r.funnel_key}`}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'white', border: `1px solid ${isCritical ? '#fca5a5' : '#fecaca'}`, gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                        <TrendingDown size={14} color={isCritical ? '#991b1b' : '#dc2626'} />
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.kpi_name}</div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Funnel: {r.funnel_key}</div>
                                        </div>
                                    </div>
                                    {r.trailing_8w_values && (
                                        <Sparkline values={r.trailing_8w_values} color="#dc2626" />
                                    )}
                                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>{fmtVal(r.value)}</div>
                                        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>WoW: {fmtPct(r.wow_pct)}</div>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isCritical ? '#fee2e2' : '#fef2f2', color: isCritical ? '#991b1b' : '#b91c1c', whiteSpace: 'nowrap' }}>
                                        {isCritical ? '🔴' : '🟠'} {wks}-week decline
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Off-track KPIs ── */}
            {offTrack.length > 0 && (
                <div style={{ ...card, borderLeft: '3px solid #f59e0b', background: '#fffbef' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        <Target size={14} color="#d97706" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>Off-Track vs Goals</span>
                        <span style={{ fontSize: 11, color: '#fbbf24', marginLeft: 4 }}>&gt;15% below target</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {offTrack.map(r => {
                            const gap = Number(r.pct_to_goal);
                            const higher = r.higher_is_better !== false;
                            return (
                                <div key={`${r.kpi_key}-${r.funnel_key}`}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'white', border: '1px solid #fde68a', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                        <AlertTriangle size={14} color="#d97706" />
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.kpi_name}</div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Funnel: {r.funnel_key}</div>
                                        </div>
                                    </div>
                                    {r.trailing_8w_values && (
                                        <Sparkline values={r.trailing_8w_values} color="#d97706" />
                                    )}
                                    <div style={{ textAlign: 'right', minWidth: 120, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#b45309' }}>{fmtVal(r.value)}</div>
                                        <div>Goal: <strong>{fmtVal(r.goal_value)}</strong></div>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#b45309', whiteSpace: 'nowrap' }}>
                                        {higher ? fmtPct(gap) : `+${Math.abs(gap).toFixed(1)}%`} vs goal
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Goals Manager (expandable) ── */}
            <div style={card}>
                <button
                    onClick={() => setShowGoals(v => !v)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Target size={16} color="var(--color-text-secondary)" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>Goals Manager</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>— click any goal value to edit</span>
                    </div>
                    {showGoals ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showGoals && (
                    <div style={{ marginTop: 16, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                                    {['KPI', 'Funnel', 'Direction', 'Current', 'Goal Target', 'Status', 'Trend'].map(h => (
                                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows
                                    .sort((a, b) => {
                                        const order = { off_track: 0, near_goal: 1, on_track: 2, no_goal: 3 };
                                        return (order[a.goal_status] ?? 3) - (order[b.goal_status] ?? 3);
                                    })
                                    .map(r => {
                                        const key = `${r.kpi_key}::${r.funnel_key}`;
                                        const isEditing = editingKey === key;
                                        const st = STATUS_STYLES[r.goal_status] || STATUS_STYLES.no_goal;
                                        return (
                                            <tr key={key} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--color-text-primary)', maxWidth: 200 }}>
                                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.kpi_name}</div>
                                                </td>
                                                <td style={{ padding: '7px 10px', color: 'var(--color-text-secondary)' }}>
                                                    <span style={{ fontSize: 10, background: '#f1f5f9', borderRadius: 4, padding: '2px 6px' }}>{r.funnel_key}</span>
                                                </td>
                                                <td style={{ padding: '7px 10px', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                                                    {r.higher_is_better !== false ? (
                                                        <span style={{ color: '#16a34a' }}>↑ Higher</span>
                                                    ) : (
                                                        <span style={{ color: '#dc2626' }}>↓ Lower</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                                    {fmtVal(r.value)}
                                                </td>
                                                <td style={{ padding: '7px 10px' }}>
                                                    {isEditing ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <input
                                                                type="number"
                                                                value={editVal}
                                                                onChange={e => setEditVal(e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter') saveGoal(r.kpi_key, r.funnel_key); if (e.key === 'Escape') cancelEdit(); }}
                                                                autoFocus
                                                                style={{ width: 70, padding: '3px 6px', fontSize: 12, border: '1px solid #6366f1', borderRadius: 4, outline: 'none' }}
                                                            />
                                                            <button onClick={() => saveGoal(r.kpi_key, r.funnel_key)} disabled={saving}
                                                                style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                                <Check size={11} />
                                                            </button>
                                                            <button onClick={cancelEdit}
                                                                style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                                <X size={11} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => startEdit(r)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px dashed #cbd5e1', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 12 }}>
                                                            {r.goal_value != null ? fmtVal(r.goal_value) : <span style={{ opacity: 0.5 }}>Set goal</span>}
                                                            <Edit3 size={10} />
                                                        </button>
                                                    )}
                                                </td>
                                                <td style={{ padding: '7px 10px' }}>
                                                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: st.bg, color: st.badge, border: `1px solid ${st.border}` }}>
                                                        {st.icon} {st.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '7px 10px' }}>
                                                    {r.trailing_8w_values ? (
                                                        <Sparkline values={r.trailing_8w_values} color={r.goal_status === 'on_track' ? '#16a34a' : r.goal_status === 'off_track' ? '#dc2626' : '#d97706'} width={60} height={22} />
                                                    ) : <Minus size={12} color="#cbd5e1" />}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
