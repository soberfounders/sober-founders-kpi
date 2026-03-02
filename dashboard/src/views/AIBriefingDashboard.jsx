import React, { useEffect, useState, useCallback } from 'react';
import { supabase, hasSupabaseConfig, supabaseConfigError } from '../lib/supabaseClient';
import SendToNotionModal from '../components/SendToNotionModal';
import {
    Bot,
    Sparkles,
    Calendar,
    DollarSign,
    Loader2,
    Clock,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    CheckCircle2,
    Send,
    RefreshCw,
} from 'lucide-react';

const BRIEFING_TYPES = [
    { mode: 'weekly_strategy', label: 'Weekly Strategy Briefing', icon: Sparkles, color: '#6366f1', description: 'Executive summary of all KPIs, anomalies, and strategic recommendations' },
    { mode: 'meeting_prep', label: 'Meeting Prep', icon: Calendar, color: '#059669', description: 'New leads, talking points, and predicted attendance for the next mastermind' },
    { mode: 'budget_allocation', label: 'Budget Allocation', icon: DollarSign, color: '#d97706', description: 'Ad performance ranking with specific reallocation recommendations' },
];

const priorityStyles = {
    high: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: '🔴 High' },
    medium: { bg: '#fffbeb', color: '#d97706', border: '#fde68a', label: '🟡 Medium' },
    low: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', label: '🟢 Low' },
};

const baseCardStyle = {
    backgroundColor: 'white',
    border: '1px solid var(--color-border)',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

function AIBriefingDashboard() {
    const [activeBriefing, setActiveBriefing] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMode, setLoadingMode] = useState(null);
    const [error, setError] = useState(null);
    const [expandedHistory, setExpandedHistory] = useState(null);
    const [notionModal, setNotionModal] = useState({ open: false, taskName: '' });

    // Load history on mount
    useEffect(() => {
        if (!hasSupabaseConfig) return;
        loadHistory();
    }, []);

    const loadHistory = async () => {
        if (!hasSupabaseConfig) return;
        const { data, error: err } = await supabase
            .from('ai_briefings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
        if (!err && data) setHistory(data);
    };

    const runBriefing = useCallback(async (mode) => {
        if (!hasSupabaseConfig) {
            setError(supabaseConfigError || 'Missing Supabase environment configuration.');
            return;
        }

        setLoading(true);
        setLoadingMode(mode);
        setError(null);
        try {
            const { data: result, error: invokeError } = await supabase.functions.invoke('ai-briefing', {
                body: { mode, send_slack: true },
            });
            if (invokeError) throw invokeError;
            if (!result?.ok) throw new Error(result?.error || 'Briefing generation failed');

            setActiveBriefing(result.briefing);
            loadHistory(); // Refresh history
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
            setLoadingMode(null);
        }
    }, []);

    const viewHistorical = (briefing) => {
        setActiveBriefing({
            ...briefing,
            briefing_type: briefing.briefing_type,
            ai_model: briefing.ai_model,
            is_mock: briefing.metadata?.is_mock || false,
            delivered_to: briefing.delivered_to || [],
            anomalies: briefing.metadata?.anomalies || [],
            predicted_attendance: briefing.metadata?.predicted_attendance || null,
            projected_impact: briefing.metadata?.projected_impact || null,
        });
    };

    const formatDate = (d) => {
        if (!d) return '';
        const date = new Date(d);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const typeLabel = (type) => {
        const t = BRIEFING_TYPES.find(b => b.mode === type);
        return t?.label || type;
    };

    const typeColor = (type) => {
        const t = BRIEFING_TYPES.find(b => b.mode === type);
        return t?.color || '#6366f1';
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Bot size={24} color="white" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-dark-green)' }}>AI Manager</h2>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            Your AI Chief of Staff — strategy briefings, meeting prep, and budget optimization
                        </p>
                    </div>
                </div>
            </div>

            {/* Action Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
                {BRIEFING_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isLoading = loading && loadingMode === type.mode;
                    return (
                        <button
                            key={type.mode}
                            onClick={() => runBriefing(type.mode)}
                            disabled={loading}
                            style={{
                                ...baseCardStyle,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading && !isLoading ? 0.6 : 1,
                                transition: 'all 0.2s ease',
                                textAlign: 'left',
                                position: 'relative',
                                overflow: 'hidden',
                                borderColor: isLoading ? type.color : 'var(--color-border)',
                            }}
                            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = type.color; }}
                            onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                        >
                            {isLoading && (
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                                    background: `linear-gradient(90deg, transparent, ${type.color}, transparent)`,
                                    animation: 'shimmer 1.5s infinite',
                                }} />
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    backgroundColor: `${type.color}15`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {isLoading ? <Loader2 size={18} color={type.color} style={{ animation: 'spin 1s linear infinite' }} /> : <Icon size={18} color={type.color} />}
                                </div>
                                <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-primary)' }}>{type.label}</span>
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>{type.description}</p>
                        </button>
                    );
                })}
            </div>

            {/* Error Banner */}
            {error && (
                <div style={{
                    ...baseCardStyle, marginBottom: '20px',
                    backgroundColor: '#fef2f2', borderColor: '#fecaca',
                    display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                    <AlertTriangle size={18} color="#dc2626" />
                    <span style={{ fontSize: '13px', color: '#dc2626' }}>{error}</span>
                </div>
            )}

            {/* Active Briefing */}
            {activeBriefing && (
                <div style={{ ...baseCardStyle, marginBottom: '28px' }}>
                    {/* Briefing Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <span style={{
                                    fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px',
                                    color: typeColor(activeBriefing.briefing_type),
                                    backgroundColor: `${typeColor(activeBriefing.briefing_type)}15`,
                                    padding: '3px 8px', borderRadius: '4px',
                                }}>
                                    {typeLabel(activeBriefing.briefing_type)}
                                </span>
                                {activeBriefing.is_mock && (
                                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#d97706', backgroundColor: '#fffbeb', padding: '2px 6px', borderRadius: '4px' }}>MOCK</span>
                                )}
                                {activeBriefing.confidence != null && (
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                                        {Math.round(activeBriefing.confidence * 100)}% confidence
                                    </span>
                                )}
                            </div>
                            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{activeBriefing.title}</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            {(activeBriefing.delivered_to || []).map((dest) => (
                                <span key={dest} style={{
                                    fontSize: '10px', fontWeight: '600', textTransform: 'uppercase',
                                    padding: '3px 8px', borderRadius: '4px',
                                    backgroundColor: dest === 'slack' ? '#4a154b15' : '#6366f115',
                                    color: dest === 'slack' ? '#4a154b' : '#6366f1',
                                }}>
                                    {dest === 'slack' ? '📨 Slack' : '📊 Dashboard'}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Summary */}
                    <div style={{
                        backgroundColor: '#f8fafc', borderRadius: '10px', padding: '14px',
                        marginBottom: '20px', borderLeft: `3px solid ${typeColor(activeBriefing.briefing_type)}`,
                    }}>
                        <p style={{ fontSize: '14px', lineHeight: '1.7', color: 'var(--color-text-primary)' }}>{activeBriefing.summary}</p>
                    </div>

                    {/* Anomalies */}
                    {activeBriefing.anomalies?.length > 0 && (
                        <div style={{
                            backgroundColor: '#fffbeb', borderRadius: '10px', padding: '14px',
                            marginBottom: '20px', borderLeft: '3px solid #d97706',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <AlertTriangle size={14} color="#d97706" />
                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#92400e' }}>Anomalies Detected</span>
                            </div>
                            {activeBriefing.anomalies.map((a, i) => (
                                <p key={i} style={{ fontSize: '13px', color: '#92400e', marginBottom: '4px' }}>• {a}</p>
                            ))}
                        </div>
                    )}

                    {/* Projected Impact */}
                    {activeBriefing.projected_impact && (
                        <div style={{
                            backgroundColor: '#f0fdf4', borderRadius: '10px', padding: '14px',
                            marginBottom: '20px', borderLeft: '3px solid #16a34a',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <CheckCircle2 size={14} color="#16a34a" />
                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>Projected Impact</span>
                            </div>
                            <p style={{ fontSize: '13px', color: '#166534' }}>{activeBriefing.projected_impact}</p>
                        </div>
                    )}

                    {/* Sections */}
                    {(activeBriefing.sections || []).map((section, idx) => (
                        <div key={idx} style={{ marginBottom: '18px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                                {section.heading}
                            </h4>
                            <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                {(section.bullets || []).map((bullet, bi) => (
                                    <li key={bi} style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--color-text-secondary)' }}>{bullet}</li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    {/* Action Items */}
                    {(activeBriefing.action_items || []).length > 0 && (
                        <div style={{ marginTop: '20px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '12px' }}>
                                Action Items
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {activeBriefing.action_items.map((item, i) => {
                                    const ps = priorityStyles[item.priority] || priorityStyles.medium;
                                    return (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 14px', borderRadius: '8px',
                                            backgroundColor: ps.bg, border: `1px solid ${ps.border}`,
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{item.text}</span>
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: '600', color: ps.color }}>{ps.label}</span>
                                                    {item.assignee && (
                                                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>→ {item.assignee}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setNotionModal({ open: true, taskName: item.text })}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                    padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                                                    backgroundColor: 'white', border: '1px solid var(--color-border)',
                                                    color: 'var(--color-text-primary)', cursor: 'pointer',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
                                            >
                                                <Send size={12} />
                                                Notion
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                            <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            {formatDate(activeBriefing.created_at)} • {activeBriefing.ai_model || 'unknown model'}
                        </span>
                    </div>
                </div>
            )}

            {/* History */}
            <div style={baseCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)' }}>Briefing History</h3>
                    <button
                        onClick={loadHistory}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
                            borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                            backgroundColor: '#f1f5f9', border: 'none', color: 'var(--color-text-secondary)',
                            cursor: 'pointer',
                        }}
                    >
                        <RefreshCw size={12} /> Refresh
                    </button>
                </div>

                {history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)' }}>
                        <Bot size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                        <p style={{ fontSize: '13px' }}>No briefings yet. Run your first one above!</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {history.map((item) => {
                            const isExpanded = expandedHistory === item.id;
                            return (
                                <div key={item.id}>
                                    <button
                                        onClick={() => {
                                            setExpandedHistory(isExpanded ? null : item.id);
                                            if (!isExpanded) viewHistorical(item);
                                        }}
                                        style={{
                                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-border)',
                                            backgroundColor: isExpanded ? '#f8fafc' : 'white', cursor: 'pointer',
                                            transition: 'background-color 0.15s',
                                            textAlign: 'left',
                                        }}
                                        onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = '#fafafa'; }}
                                        onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'white'; }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{
                                                fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px',
                                                color: typeColor(item.briefing_type),
                                                backgroundColor: `${typeColor(item.briefing_type)}15`,
                                                padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap',
                                            }}>
                                                {typeLabel(item.briefing_type).split(' ').slice(0, 2).join(' ')}
                                            </span>
                                            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
                                                {item.title?.length > 60 ? item.title.slice(0, 60) + '…' : item.title}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                                {formatDate(item.created_at)}
                                            </span>
                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </div>
                                    </button>
                                    {isExpanded && (
                                        <div style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                                            {item.summary}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* CSS for animations */}
            <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

            {/* Notion Modal */}
            {notionModal.open && (
                <SendToNotionModal
                    isOpen={notionModal.open}
                    onClose={() => setNotionModal({ open: false, taskName: '' })}
                    taskName={notionModal.taskName}
                />
            )}
        </div>
    );
}

export default AIBriefingDashboard;
