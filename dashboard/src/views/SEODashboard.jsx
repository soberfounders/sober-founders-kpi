/**
 * SEODashboard.jsx
 *
 * SEO Expert Dashboard — Sober Founders KPI Dashboard
 *
 * What this does:
 *   Displays GA4 and GSC data in plain English across 7 panels, answering:
 *     1. Is traffic growing or shrinking, and why?
 *     2. What is the most important thing to fix this week?
 *     3. Are AI platforms sending people to the site?
 *
 * Data sources:
 *   vw_seo_channel_daily, vw_seo_ai_traffic_estimate,
 *   vw_seo_search_performance, vw_seo_opportunity_pages,
 *   vw_seo_ranking_drops, vw_seo_organic_zoom_attendees
 *
 * Brand colors used:
 *   Dark Green  #008e65  — primary actions, organic traffic
 *   Light Green #00B286  — secondary highlights, growth
 *   Orange      #f1972c  — AI traffic, warnings, quick-wins
 *
 * AI Traffic Note:
 *   GA4 sync pre-buckets channels; raw referrer domains are not stored.
 *   "Referral" is used as a proxy for possible AI traffic. Per-platform
 *   attribution requires adding sessionSource to sync_google_analytics.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
    AreaChart, Area,
    PieChart, Pie, Cell,
    LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
    TrendingUp, TrendingDown, Minus,
    Globe, Search, Zap, AlertTriangle, CheckCircle,
    Info, RefreshCw, Users, Eye, MousePointerClick,
    Target, Star, Bot, BarChart2
} from 'lucide-react';

// ─── Brand palette ─────────────────────────────────────────────────────────────
const B = {
    darkGreen: '#008e65',
    lightGreen: '#00B286',
    orange: '#f1972c',
    // Derived tints (alpha overlays on white)
    greenBg: '#f0faf7',
    greenBorder: '#b3e0d5',
    orangeBg: '#fff8f0',
    orangeBorder: '#fcd9a8',
    blueBg: '#eff6ff',
    blueBorder: '#bfdbfe',
    redBg: '#fef2f2',
    redBorder: '#fecaca',
};

const CHANNEL_COLORS = {
    organic: B.darkGreen,
    referral: B.orange,
    direct: '#3b82f6',
    social: '#8b5cf6',
    paid: '#ef4444',
    email: '#06b6d4',
    other: '#9ca3af',
};

const CHANNEL_LABELS = {
    organic: 'Organic Search (Google)',
    referral: 'Referral / Possible AI',
    direct: 'Direct / Dark Traffic',
    social: 'Social Media',
    paid: 'Paid Ads',
    email: 'Email',
    other: 'Other',
};

// ─── Shared styles ─────────────────────────────────────────────────────────────
const card = {
    backgroundColor: '#ffffff',
    border: '1px solid var(--color-border)',
    borderRadius: 16,
    padding: '22px 26px',
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.07)',
    marginBottom: 20,
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(Math.round(Number(n)));
}
function fmtPct(n, d = 1) {
    if (n == null || isNaN(n)) return '—';
    return (Number(n) * 100).toFixed(d) + '%';
}
function fmtPos(n) {
    if (!n || n === 0) return '—';
    return '#' + Math.round(Number(n));
}
function fmtChange(cur, prev) {
    if (!prev || prev === 0) return null;
    return ((cur - prev) / prev) * 100;
}
function sumLast(arr, key, days = 7) {
    return (arr || []).slice(-days).reduce((a, r) => a + (Number(r[key]) || 0), 0);
}
function dateLabel(d) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function pageSlug(url) {
    if (!url) return '—';
    try { return new URL(url).pathname || url; } catch { return url.slice(0, 50); }
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, change, subtitle, color = B.darkGreen, tooltip }) {
    const isPos = change > 0;
    const isNeg = change < 0;
    const TrendIcon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
    const trendColor = isPos ? B.darkGreen : isNeg ? '#ef4444' : '#9ca3af';

    return (
        <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: '18px 20px',
            flex: '1 1 160px',
            minWidth: 145,
            boxShadow: '0 1px 3px rgb(0 0 0 / 0.06)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{
                    background: color + '18',
                    borderRadius: 8, padding: 6,
                    display: 'flex', alignItems: 'center',
                }}>
                    <Icon size={15} color={color} />
                </div>
                <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {label}
                </span>
                {tooltip && (
                    <span title={tooltip} style={{ cursor: 'help', color: '#94a3b8', marginLeft: 'auto' }}>
                        <Info size={12} />
                    </span>
                )}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>{value}</div>
            {subtitle && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{subtitle}</div>
            )}
            {change != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                    <TrendIcon size={12} color={trendColor} />
                    <span style={{ fontSize: 12, color: trendColor, fontWeight: 600 }}>
                        {Math.abs(change).toFixed(1)}% vs last week
                    </span>
                </div>
            )}
        </div>
    );
}

// ─── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, badge, badgeColor = B.orange, subtitle }) {
    return (
        <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {Icon && (
                    <div style={{
                        background: B.greenBg, borderRadius: 8, padding: '5px',
                        display: 'flex', alignItems: 'center',
                    }}>
                        <Icon size={16} color={B.darkGreen} />
                    </div>
                )}
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1e293b', fontFamily: 'DM Serif Display, serif' }}>
                    {title}
                </h2>
                {badge && (
                    <span style={{
                        background: badgeColor + '20',
                        color: badgeColor,
                        fontSize: 11, fontWeight: 700,
                        padding: '2px 9px', borderRadius: 20,
                        border: `1px solid ${badgeColor}40`,
                    }}>{badge}</span>
                )}
            </div>
            {subtitle && (
                <p style={{ margin: '5px 0 0 34px', fontSize: 13, color: '#64748b', lineHeight: 1.55 }}>
                    {subtitle}
                </p>
            )}
        </div>
    );
}

// ─── InfoBox ──────────────────────────────────────────────────────────────────
function InfoBox({ type = 'info', children }) {
    const s = {
        info: { bg: B.blueBg, border: B.blueBorder, icon: Info, iconColor: '#3b82f6' },
        warn: { bg: B.orangeBg, border: B.orangeBorder, icon: AlertTriangle, iconColor: B.orange },
        success: { bg: B.greenBg, border: B.greenBorder, icon: CheckCircle, iconColor: B.darkGreen },
    }[type] || {};
    const IconComp = s.icon;
    return (
        <div style={{
            background: s.bg, border: `1px solid ${s.border}`,
            borderRadius: 10, padding: '11px 15px',
            display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14,
        }}>
            <IconComp size={14} color={s.iconColor} style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{children}</div>
        </div>
    );
}

// ─── DataTable ────────────────────────────────────────────────────────────────
function DataTable({ columns, rows, emptyMessage = 'No data yet.' }) {
    if (!rows || rows.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '28px 0', color: '#94a3b8', fontSize: 13 }}>
                {emptyMessage}
            </div>
        );
    }
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: '#374151' }}>
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th key={col.key} style={{
                                textAlign: col.align || 'left',
                                padding: '7px 10px',
                                color: '#64748b',
                                fontWeight: 600,
                                fontSize: 11,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                borderBottom: '2px solid var(--color-border)',
                                whiteSpace: 'nowrap',
                            }}>{col.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} style={{
                            borderBottom: '1px solid var(--color-border)',
                            background: i % 2 === 0 ? 'transparent' : '#f8fafc',
                        }}>
                            {columns.map(col => (
                                <td key={col.key} style={{
                                    padding: '8px 10px',
                                    textAlign: col.align || 'left',
                                    maxWidth: col.maxWidth || 'none',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: col.wrap ? 'normal' : 'nowrap',
                                }}>
                                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Action Plan Builder ──────────────────────────────────────────────────────
function buildActionPlan({ channelData, opportunities, rankingDrops, gscTotals }) {
    const items = [];

    // Autonomous (always present)
    items.push(
        {
            type: 'auto', priority: 10, headline: '📊 Tracking your traffic trends automatically', impact: 'Low',
            why: 'Every sync compares this week to last week across every channel so you can spot growth or decline without doing anything.'
        },
        {
            type: 'auto', priority: 11, headline: '🔍 Monitoring Google Search Console weekly', impact: 'Low',
            why: 'We track every search term, how often you appear, and how many people click — alerting you when rankings drop.'
        },
        {
            type: 'auto', priority: 12, headline: '🤖 Watching for AI platform traffic', impact: 'Low',
            why: 'Tools like ChatGPT and Perplexity increasingly send people to websites. We watch the Referral channel for signs of AI-driven visitors.'
        },
    );

    // Critical ranking drops
    const crit = (rankingDrops || []).find(r => r.urgency === 'critical');
    if (crit) items.push({
        type: 'human', priority: 1, impact: 'High',
        headline: `🚨 Fix ranking for: "${crit.query}"`, why: crit.plain_english_explanation
    });

    // Low-CTR pages
    const lowCtr = (opportunities || []).find(o => o.opportunity_type === 'high_impressions_low_ctr');
    if (lowCtr) items.push({
        type: 'human', priority: 2, impact: 'High',
        headline: `✏️ Rewrite page title for: "${lowCtr.query}"`,
        why: `Appears ${fmtNum(lowCtr.impressions)} times in Google but only ${fmtPct(lowCtr.ctr)} click. A specific, benefit-focused title could double traffic from this search.`
    });

    // Page 2 opportunity
    const p2 = (opportunities || []).find(o => o.opportunity_type === 'page_two_potential');
    if (p2) items.push({
        type: 'human', priority: 3, impact: 'Medium',
        headline: `📝 Refresh content for: "${p2.query}"`,
        why: `You rank #${Math.round(p2.avg_position)} — just off page 1. More detail or clearer copy could push this into the top 10.`
    });

    // Organic drop
    if (channelData && channelData.length >= 14) {
        const last7 = sumLast(channelData, 'organic', 7);
        const prev7 = sumLast(channelData.slice(0, -7), 'organic', 7);
        const ch = fmtChange(last7, prev7);
        if (ch !== null && ch < -10) items.push({
            type: 'human', priority: 2, impact: 'High',
            headline: '📉 Organic traffic dropped — investigate now',
            why: `Organic traffic fell ${Math.abs(ch).toFixed(0)}% last week. Could be a Google update, technical issue, or page losing its ranking. Check Search Console for crawl errors.`
        });
    }

    // Low overall CTR
    if (gscTotals?.avgCtr > 0 && gscTotals.avgCtr < 0.02 && gscTotals.impressions > 1000)
        items.push({
            type: 'human', priority: 4, impact: 'Medium',
            headline: '🎯 Your overall click-through rate is below average',
            why: `Only ${fmtPct(gscTotals.avgCtr)} of people who see you in Google results click. Industry average is 2–5%. Better page titles and descriptions site-wide could fix this.`
        });

    const human = items.filter(i => i.type === 'human').sort((a, b) => a.priority - b.priority);
    const auto = items.filter(i => i.type === 'auto').sort((a, b) => a.priority - b.priority);
    return [...human, ...auto];
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SEODashboard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [channelData, setChannelData] = useState([]);
    const [aiData, setAiData] = useState([]);
    const [perfData, setPerfData] = useState([]);
    const [oppsData, setOppsData] = useState([]);
    const [dropsData, setDropsData] = useState([]);
    const [zoomAtts, setZoomAtts] = useState([]);
    const [planChecked, setPlanChecked] = useState({});

    const loadData = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [
                { data: ch, error: chErr },
                { data: ai, error: aiErr },
                { data: perf, error: perfErr },
                { data: opps, error: oppsErr },
                { data: drops, error: dropsErr },
                { data: zoom, error: zoomErr },
            ] = await Promise.all([
                supabase.from('vw_seo_channel_daily').select('*').order('metric_date'),
                supabase.from('vw_seo_ai_traffic_estimate').select('*').order('metric_date'),
                supabase.from('vw_seo_search_performance').select('*').limit(200),
                supabase.from('vw_seo_opportunity_pages').select('*').limit(50),
                supabase.from('vw_seo_ranking_drops').select('*').limit(30),
                supabase.from('vw_seo_organic_zoom_attendees').select('*').limit(50),
            ]);
            if (chErr) console.warn('[SEO] channel:', chErr.message);
            if (aiErr) console.warn('[SEO] ai:', aiErr.message);
            if (perfErr) console.warn('[SEO] perf:', perfErr.message);
            if (oppsErr) console.warn('[SEO] opps:', oppsErr.message);
            if (dropsErr) console.warn('[SEO] drops:', dropsErr.message);
            if (zoomErr) console.warn('[SEO] zoom:', zoomErr.message);
            setChannelData(ch || []); setAiData(ai || []);
            setPerfData(perf || []); setOppsData(opps || []);
            setDropsData(drops || []); setZoomAtts(zoom || []);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const analytics = useMemo(() => {
        const last7 = channelData.slice(-7);
        const prev7 = channelData.length >= 14 ? channelData.slice(-14, -7) : [];
        const sum = (arr, key) => arr.reduce((a, r) => a + (Number(r[key]) || 0), 0);

        const totalSessions = sum(last7, 'total_sessions');
        const prevTotal = sum(prev7, 'total_sessions');
        const organicSessions = sum(last7, 'organic');
        const prevOrganic = sum(prev7, 'organic');

        const last7Ai = aiData.slice(-7);
        const aiVisits = last7Ai.reduce((a, r) => a + (Number(r.total_estimated_ai) || 0), 0);
        const prev7Ai = aiData.length >= 14 ? aiData.slice(-14, -7) : [];
        const prevAi = prev7Ai.reduce((a, r) => a + (Number(r.total_estimated_ai) || 0), 0);

        const totalClicks = perfData.reduce((a, r) => a + (Number(r.clicks) || 0), 0);
        const totalImpressions = perfData.reduce((a, r) => a + (Number(r.impressions) || 0), 0);
        const avgCtr = perfData.length ? perfData.reduce((a, r) => a + (Number(r.ctr) || 0), 0) / perfData.length : 0;
        const avgPosition = perfData.length ? perfData.reduce((a, r) => a + (Number(r.avg_position) || 0), 0) / perfData.length : 0;
        const topQuery = perfData.length ? [...perfData].sort((a, b) => (Number(b.clicks) || 0) - (Number(a.clicks) || 0))[0]?.query : null;

        const last30 = channelData.slice(-30);
        const ct = { organic: sum(last30, 'organic'), referral: sum(last30, 'referral'), direct: sum(last30, 'direct'), social: sum(last30, 'social'), paid: sum(last30, 'paid'), email: sum(last30, 'email'), other: sum(last30, 'other') };
        const ct30 = Object.values(ct).reduce((a, v) => a + v, 0);
        const channelPie = Object.entries(ct).map(([key, val]) => ({
            name: CHANNEL_LABELS[key] || key, value: val,
            color: CHANNEL_COLORS[key] || '#9ca3af',
            pct: ct30 > 0 ? (val / ct30 * 100).toFixed(1) : '0.0', key
        })).filter(r => r.value > 0).sort((a, b) => b.value - a.value);

        const totalChange = fmtChange(totalSessions, prevTotal);
        const organicChange = fmtChange(organicSessions, prevOrganic);
        const aiChange = fmtChange(aiVisits, prevAi);

        let narrative = '';
        if (totalSessions === 0) {
            narrative = 'No traffic data synced yet. Click "Sync" on the Website Traffic tab to import your Google Analytics data.';
        } else {
            const trend = totalChange === null ? '' : totalChange > 5 ? ' and growing 📈' : totalChange < -5 ? ', down from last week ⚠️' : ', steady';
            narrative = `Your website had ${fmtNum(totalSessions)} visitors in the last 7 days${trend}.${topQuery ? ` Top Google search: "${topQuery}".` : ''}${avgPosition > 0 ? ` Average Google rank: #${Math.round(avgPosition)}.` : ''}`;
            if (organicChange !== null && organicChange < -15) narrative += ' ⚠️ Organic traffic has dropped significantly — see Urgent Issues below.';
        }

        return {
            totalSessions, prevTotal, totalChange,
            organicSessions, prevOrganic, organicChange,
            aiVisits, prevAi, aiChange,
            totalClicks, totalImpressions, avgCtr, avgPosition, topQuery,
            channelPie, gscTotals: { avgCtr, impressions: totalImpressions }, narrative,
        };
    }, [channelData, aiData, perfData]);

    const actionPlan = useMemo(() => buildActionPlan({
        channelData, opportunities: oppsData, rankingDrops: dropsData, gscTotals: analytics.gscTotals,
    }), [channelData, oppsData, dropsData, analytics.gscTotals]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280 }}>
                <RefreshCw size={22} color={B.darkGreen} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ marginLeft: 12, color: '#64748b', fontWeight: 600 }}>Loading SEO data…</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    const hasGa = channelData.length > 0;
    const hasGsc = perfData.length > 0;
    const critDrops = dropsData.filter(d => d.urgency === 'critical');
    const warnDrops = dropsData.filter(d => d.urgency === 'warning');

    const trendChartData = channelData.slice(-30).map(r => ({
        date: dateLabel(r.metric_date),
        organic: Number(r.organic) || 0,
        referral: Number(r.referral) || 0,
        direct: Number(r.direct) || 0,
    }));
    const aiChartData = aiData.slice(-30).map(r => ({
        date: dateLabel(r.metric_date),
        confirmed: Number(r.confirmed_referral) || 0,
        darkEst: Number(r.possible_ai_dark) || 0,
    }));

    return (
        <div style={{ maxWidth: 1140, margin: '0 auto', paddingBottom: 48 }}>

            {/* ── Hero header ─────────────────────────────────────────────────── */}
            <div style={{
                background: `linear-gradient(130deg, ${B.darkGreen} 0%, ${B.lightGreen} 100%)`,
                borderRadius: 16,
                padding: '24px 28px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
            }}>
                <div>
                    <h1 style={{
                        margin: 0, color: '#fff',
                        fontSize: 26, fontFamily: 'DM Serif Display, serif',
                    }}>SEO Expert Dashboard</h1>
                    <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}>
                        Plain-English website insights — no SEO expertise required.
                    </p>
                </div>
                <button
                    onClick={loadData}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'rgba(255,255,255,0.18)',
                        border: '1px solid rgba(255,255,255,0.35)',
                        borderRadius: 8, padding: '8px 18px',
                        color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {error && <InfoBox type="warn"><strong>Error:</strong> {error}. Some panels may show zeros.</InfoBox>}

            {/* ══════════════════════════════════════════════════════════════════
          PANEL 1 — Your Website This Week
         ══════════════════════════════════════════════════════════════════ */}
            <div style={card}>
                <SectionHeader icon={Globe} title="Your Website This Week" subtitle={analytics.narrative} />
                {!hasGa && (
                    <InfoBox type="info">No Google Analytics data yet. Go to <strong>Website Traffic</strong> → <strong>Sync Traffic Data</strong>.</InfoBox>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                    <StatCard icon={Users} label="Total Visits (7d)" value={fmtNum(analytics.totalSessions)} change={analytics.totalChange} color={B.darkGreen} />
                    <StatCard icon={Search} label="Organic (Google)" value={fmtNum(analytics.organicSessions)} change={analytics.organicChange} color={B.darkGreen} subtitle="Found you via Google" />
                    <StatCard icon={Bot} label="AI / Referral *" value={fmtNum(analytics.aiVisits)} change={analytics.aiChange} color={B.orange} tooltip="Includes all referral + 5% dark-traffic estimate. Cannot confirm AI platform without extra config." subtitle="Estimated" />
                    <StatCard icon={Star} label="Top Search Term" value={analytics.topQuery ? analytics.topQuery.slice(0, 22) + (analytics.topQuery.length > 22 ? '…' : '') : '—'} color={B.orange} subtitle="Most-clicked keyword" />
                    <StatCard icon={Target} label="Avg. Google Rank" value={analytics.avgPosition > 0 ? '#' + Math.round(analytics.avgPosition) : '—'} color="#3b82f6" subtitle="Lower = closer to top" tooltip="Average position across all GSC keywords." />
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
          PANEL 2 — Traffic Channel Breakdown
         ══════════════════════════════════════════════════════════════════ */}
            <div style={card}>
                <SectionHeader icon={BarChart2} title="Where Your Visitors Come From" subtitle="Last 30 days, broken down by how people found your site." />

                {!hasGa ? (
                    <InfoBox type="info">Sync GA4 data to see channel breakdown.</InfoBox>
                ) : (
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        {/* Donut */}
                        <div style={{ flex: '0 0 250px', height: 240 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={analytics.channelPie} cx="50%" cy="50%" innerRadius={60} outerRadius={105} paddingAngle={2} dataKey="value">
                                        {analytics.channelPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                                        formatter={(v, n) => [fmtNum(v) + ' sessions', n]}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div style={{ flex: '1 1 280px' }}>
                            <DataTable
                                columns={[
                                    { key: 'name', label: 'Channel' },
                                    { key: 'value', label: 'Sessions', align: 'right', render: v => fmtNum(v) },
                                    { key: 'pct', label: 'Share', align: 'right', render: v => v + '%' },
                                ]}
                                rows={analytics.channelPie.map(r => ({
                                    ...r,
                                    name: (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, display: 'inline-block', flexShrink: 0 }} />
                                            {r.name}
                                            {r.key === 'referral' && (
                                                <span style={{ fontSize: 10, color: B.orange, background: B.orangeBg, padding: '1px 6px', borderRadius: 4, border: `1px solid ${B.orangeBorder}` }}>
                                                    may include AI
                                                </span>
                                            )}
                                        </span>
                                    ),
                                }))}
                            />
                            {trendChartData.length > 0 && (
                                <div style={{ marginTop: 18 }}>
                                    <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        30-day organic vs referral
                                    </p>
                                    <ResponsiveContainer width="100%" height={72}>
                                        <AreaChart data={trendChartData}>
                                            <Area type="monotone" dataKey="organic" stroke={B.darkGreen} fill={B.greenBg} strokeWidth={2} dot={false} />
                                            <Area type="monotone" dataKey="referral" stroke={B.orange} fill={B.orangeBg} strokeWidth={1.5} dot={false} />
                                            <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 11 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════
          PANEL 3 — AI Traffic Deep Dive
         ══════════════════════════════════════════════════════════════════ */}
            <div style={card}>
                <SectionHeader
                    icon={Bot}
                    title="AI Traffic Deep Dive"
                    badge="Estimated"
                    badgeColor={B.orange}
                    subtitle="Estimates of traffic from AI tools like ChatGPT, Perplexity, and Google AI Overviews."
                />
                <InfoBox type="warn">
                    <strong>Why this is estimated:</strong> GA4 groups ChatGPT, Perplexity, and blog links together in "Referral". We cannot split them without extra configuration. The "dark traffic" figure uses a 5% heuristic on Direct sessions. Treat these as directional signals, not exact counts.
                </InfoBox>
                {!hasGa ? (
                    <InfoBox type="info">Sync GA4 data to see AI traffic estimates.</InfoBox>
                ) : (
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 320px' }}>
                            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                                Referral + estimated dark traffic (30 days)
                            </p>
                            {aiChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={190}>
                                    <AreaChart data={aiChartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                        <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Area type="monotone" dataKey="confirmed" name="Referral Sessions" stroke={B.orange} fill={B.orangeBg} strokeWidth={2} dot={false} />
                                        <Area type="monotone" dataKey="darkEst" name="Possible AI Dark Traffic" stroke={B.lightGreen} fill={B.greenBg} strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <p style={{ color: '#94a3b8', fontSize: 13 }}>No data yet.</p>
                            )}
                        </div>
                        <div style={{ flex: '1 1 260px' }}>
                            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                                Your most Google-visible pages
                            </p>
                            <DataTable
                                columns={[
                                    { key: 'page', label: 'Page', render: v => pageSlug(v), maxWidth: 190 },
                                    { key: 'impressions', label: 'Shown', align: 'right', render: v => fmtNum(v) },
                                    { key: 'clicks', label: 'Clicks', align: 'right', render: v => fmtNum(v) },
                                ]}
                                rows={[...perfData].sort((a, b) => (Number(b.impressions) || 0) - (Number(a.impressions) || 0)).slice(0, 8)}
                                emptyMessage="Sync GSC data to see visible pages."
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════
          PANEL 4 — Google Search Performance
         ══════════════════════════════════════════════════════════════════ */}
            <div style={card}>
                <SectionHeader icon={Search} title="Google Search Performance" subtitle="How your site performs in Google results — clicks, visibility, and quick-win opportunities." />

                {!hasGsc ? (
                    <InfoBox type="info">No Google Search Console data. Go to <strong>Website Traffic</strong> → <strong>Sync Traffic Data</strong>.</InfoBox>
                ) : (
                    <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
                            <StatCard icon={MousePointerClick} label="Total Clicks" value={fmtNum(analytics.totalClicks)} color={B.darkGreen} subtitle="People who clicked from Google" />
                            <StatCard icon={Eye} label="Total Impressions" value={fmtNum(analytics.totalImpressions)} color="#3b82f6" subtitle="Times you appeared in results" />
                            <StatCard icon={Target} label="Click-Through Rate" value={fmtPct(analytics.avgCtr)} color={B.orange} subtitle="% of viewers who clicked" tooltip="Industry avg 2–5%." />
                            <StatCard icon={Search} label="Avg. Position" value={analytics.avgPosition > 0 ? '#' + Math.round(analytics.avgPosition) : '—'} color="#8b5cf6" subtitle="Lower = closer to top" />
                        </div>

                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 300px' }}>
                                <p style={{
                                    fontSize: 12, fontWeight: 700, color: '#1e293b',
                                    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6
                                }}>
                                    <span style={{ color: B.lightGreen }}>🏆</span> Top Search Terms (by clicks)
                                </p>
                                <DataTable
                                    columns={[
                                        { key: 'query', label: 'Search Term', maxWidth: 170 },
                                        { key: 'clicks', label: 'Clicks', align: 'right', render: v => fmtNum(v) },
                                        { key: 'impressions', label: 'Shown', align: 'right', render: v => fmtNum(v) },
                                        { key: 'avg_position', label: 'Rank', align: 'right', render: v => fmtPos(v) },
                                    ]}
                                    rows={[...perfData].sort((a, b) => (Number(b.clicks) || 0) - (Number(a.clicks) || 0)).slice(0, 10)}
                                    emptyMessage="No search terms yet."
                                />
                            </div>
                            <div style={{ flex: '1 1 300px' }}>
                                <p style={{
                                    fontSize: 12, fontWeight: 700, color: '#1e293b',
                                    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6
                                }}>
                                    <span style={{ color: B.orange }}>⚡</span> Quick Wins — Easy Improvement Opportunities
                                </p>
                                {oppsData.length === 0 ? (
                                    <InfoBox type="success">No quick wins needed — top pages look well-optimized!</InfoBox>
                                ) : (
                                    <DataTable
                                        columns={[
                                            { key: 'query', label: 'Search Term', maxWidth: 150 },
                                            {
                                                key: 'impact_label', label: 'Impact', render: v => (
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                                        background: v === 'High' ? '#fef2f2' : v === 'Medium' ? B.orangeBg : '#f8fafc',
                                                        color: v === 'High' ? '#ef4444' : v === 'Medium' ? B.orange : '#64748b',
                                                    }}>{v}</span>
                                                )
                                            },
                                            {
                                                key: 'recommended_action', label: 'What to do', wrap: true, maxWidth: 240, render: v => (
                                                    <span style={{ fontSize: 12, color: '#64748b' }}>{v}</span>
                                                )
                                            },
                                        ]}
                                        rows={oppsData.slice(0, 8)}
                                    />
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════
          PANEL 5 — Urgent Issues
         ══════════════════════════════════════════════════════════════════ */}
            <div style={card}>
                <SectionHeader
                    icon={AlertTriangle}
                    title="Urgent Issues"
                    badge={critDrops.length > 0 ? `${critDrops.length} critical` : warnDrops.length > 0 ? `${warnDrops.length} warnings` : 'All clear'}
                    badgeColor={critDrops.length > 0 ? '#ef4444' : warnDrops.length > 0 ? B.orange : B.darkGreen}
                    subtitle="Pages or keywords that need immediate attention."
                />
                {dropsData.length === 0 ? (
                    <InfoBox type="success">
                        <strong>No urgent issues.</strong> {hasGsc ? 'All tracked pages are within expected ranges.' : 'Sync your GSC data to enable ranking drop alerts.'}
                    </InfoBox>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {dropsData.slice(0, 10).map((d, i) => (
                            <div key={i} style={{
                                background: d.urgency === 'critical' ? B.redBg : B.orangeBg,
                                border: `1px solid ${d.urgency === 'critical' ? B.redBorder : B.orangeBorder}`,
                                borderLeft: `4px solid ${d.urgency === 'critical' ? '#ef4444' : B.orange}`,
                                borderRadius: 10, padding: '13px 16px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <AlertTriangle size={13} color={d.urgency === 'critical' ? '#ef4444' : B.orange} />
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>"{d.query}"</span>
                                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>
                                        Rank #{Math.round(d.avg_position)} · {fmtNum(d.impressions)} impressions
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{d.plain_english_explanation}</p>
                                {d.page && <p style={{ margin: '5px 0 0', fontSize: 11, color: '#94a3b8' }}>{pageSlug(d.page)}</p>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════
          PANEL 6 — SEO Action Plan
         ══════════════════════════════════════════════════════════════════ */}
            <div style={card}>
                <SectionHeader icon={Zap} title="Your SEO Action Plan" subtitle="Prioritized checklist — sorted by impact. Check off items as you complete them." />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {actionPlan.map((item, i) => {
                        const checked = !!planChecked[i];
                        const isHuman = item.type === 'human';
                        const impactStyle = {
                            High: { bg: '#fef2f2', color: '#ef4444' },
                            Medium: { bg: B.orangeBg, color: B.orange },
                            Low: { bg: '#f8fafc', color: '#94a3b8' },
                        }[item.impact] || {};
                        return (
                            <div key={i} style={{
                                display: 'flex', gap: 12, alignItems: 'flex-start',
                                background: checked ? B.greenBg : isHuman ? '#ffffff' : '#f8fafc',
                                border: `1px solid ${checked ? B.greenBorder : 'var(--color-border)'}`,
                                borderLeft: isHuman ? `3px solid ${item.impact === 'High' ? '#ef4444' : item.impact === 'Medium' ? B.orange : B.darkGreen}` : `3px solid #e2e8f0`,
                                borderRadius: 10, padding: '13px 14px',
                                opacity: checked ? 0.55 : 1, transition: 'opacity 0.2s',
                            }}>
                                {isHuman ? (
                                    <button
                                        onClick={() => setPlanChecked(p => ({ ...p, [i]: !p[i] }))}
                                        style={{
                                            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                                            border: `2px solid ${checked ? B.darkGreen : '#cbd5e1'}`,
                                            background: checked ? B.darkGreen : 'transparent',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            padding: 0, marginTop: 2,
                                        }}
                                    >
                                        {checked && <CheckCircle size={11} color="white" />}
                                    </button>
                                ) : (
                                    <div style={{
                                        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                                        border: '2px solid #e2e8f0', marginTop: 2,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <RefreshCw size={9} color="#94a3b8" />
                                    </div>
                                )}
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                                        <span style={{
                                            fontSize: 13, fontWeight: 700, color: '#1e293b',
                                            textDecoration: checked ? 'line-through' : 'none',
                                        }}>{item.headline}</span>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                                            background: impactStyle.bg, color: impactStyle.color,
                                        }}>{item.impact}</span>
                                        <span style={{
                                            fontSize: 10, padding: '1px 7px', borderRadius: 4,
                                            background: isHuman ? B.orangeBg : '#f0fdf4',
                                            color: isHuman ? B.orange : B.darkGreen,
                                            fontWeight: 600,
                                        }}>{isHuman ? '👤 Your task' : '🤖 Auto-monitored'}</span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.55 }}>{item.why}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
          PANEL 7 — Organic → Zoom Attendees
         ══════════════════════════════════════════════════════════════════ */}
            <div style={card}>
                <SectionHeader
                    icon={Users}
                    title="Organic Search → Zoom Attendees"
                    badge="Bonus Insight"
                    badgeColor={B.darkGreen}
                    subtitle="Zoom attendees whose HubSpot record shows they originally found Sober Founders through Google search. Your SEO investment driving real community engagement."
                />
                {zoomAtts.length === 0 ? (
                    <InfoBox type="info">
                        No organic-attributed Zoom attendees found yet. This will populate once HubSpot contacts with organic traffic sources are mapped to Zoom sessions.
                    </InfoBox>
                ) : (
                    <>
                        <InfoBox type="success">
                            <strong>{zoomAtts.length} Zoom attendee{zoomAtts.length !== 1 ? 's' : ''}</strong> originally found Sober Founders through Google organic search.
                        </InfoBox>
                        <DataTable
                            columns={[
                                { key: 'attendee_name', label: 'Name' },
                                { key: 'email', label: 'Email' },
                                { key: 'session_date', label: 'Date', render: v => v?.slice(0, 10) || '—' },
                                { key: 'meeting_name', label: 'Meeting' },
                                {
                                    key: 'traffic_source_label', label: 'Source', render: v => (
                                        <span style={{
                                            background: B.greenBg, color: B.darkGreen,
                                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                            border: `1px solid ${B.greenBorder}`,
                                        }}>{v}</span>
                                    )
                                },
                            ]}
                            rows={zoomAtts.slice(0, 20)}
                        />
                    </>
                )}
            </div>

        </div>
    );
}
