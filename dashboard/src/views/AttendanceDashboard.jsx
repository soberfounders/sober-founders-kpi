import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Calendar,
  Users,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
  UserRoundCheck,
  AlertTriangle,
  Brain,
} from 'lucide-react';

const TUE_MEETING_ID = '87199667045';
const THU_MEETING_ID = '84242212480';
const RECENT_WINDOW = 8;

function normalizeName(name = '') {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function safeDate(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isMissingTableError(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '').toUpperCase();
  return code === 'PGRST205' || (msg.includes('could not find the table') && msg.includes('attendee_aliases'));
}

function dayTypeFromMetric(metric) {
  const meetingId = metric?.metadata?.meeting_id ? String(metric.metadata.meeting_id) : '';
  if (meetingId === TUE_MEETING_ID) return 'Tuesday';
  if (meetingId === THU_MEETING_ID) return 'Thursday';
  const d = safeDate(metric?.metadata?.start_time || metric?.metric_date);
  if (!d) return 'Other';
  const day = d.getUTCDay();
  if (day === 2) return 'Tuesday';
  if (day === 4) return 'Thursday';
  return 'Other';
}

function buildPlan(analytics) {
  if (!analytics) return [];
  const { repeatRate, atRiskCount, oneTimeShare, lowRecentShowRatePeople } = analytics;

  return [
    {
      id: 'auto-risk-list',
      owner: 'Autonomous',
      title: 'Build weekly at-risk attendee list',
      detail: `Flag repeat attendees missing 3+ group-specific sessions (${atRiskCount} currently).`,
      proceed: true,
    },
    {
      id: 'auto-retention-summary',
      owner: 'Autonomous',
      title: 'Publish Monday retention summary',
      detail: `Track repeat rate (${formatPct(repeatRate)}) and one-time share (${formatPct(oneTimeShare)}).`,
      proceed: true,
    },
    {
      id: 'auto-low-show-alert',
      owner: 'Autonomous',
      title: 'Alert on low personal show-up rate',
      detail: `${lowRecentShowRatePeople} attendees are below 25% show-up in their group's last ${RECENT_WINDOW} sessions.`,
      proceed: lowRecentShowRatePeople > 0,
    },
    {
      id: 'human-welcome-owner',
      owner: 'Human',
      title: 'Assign meeting welcome owner',
      detail: 'Choose 1 host to greet first-timers by name in first 5 minutes.',
      proceed: true,
    },
    {
      id: 'human-followup-script',
      owner: 'Human',
      title: 'Approve no-show follow-up script',
      detail: 'Create a 2-message sequence for people absent 2+ sessions.',
      proceed: true,
    },
    {
      id: 'human-topic-test',
      owner: 'Human',
      title: 'Run topic A/B test for Thursday',
      detail: 'Test two subject lines and compare next-week show-up by cohort.',
      proceed: repeatRate < 0.55,
    },
  ];
}

function computeAnalytics(metrics, aliases) {
  const aliasMap = new Map(
    (aliases || []).map((a) => [normalizeName(a.original_name), a.target_name?.trim() || a.original_name]),
  );

  // 1. Parse and Sort Sessions
  let sessions = (metrics || [])
    .filter((m) => m.metric_name === 'Zoom Meeting Attendees')
    .map((m) => {
      const type = dayTypeFromMetric(m);
      const start = safeDate(m?.metadata?.start_time || m.metric_date);
      const attendeesRaw = Array.isArray(m?.metadata?.attendees) ? m.metadata.attendees : [];
      const byNormalized = new Map();

      attendeesRaw.forEach((raw) => {
        const normalized = normalizeName(raw);
        if (!normalized) return;
        const canonical = aliasMap.get(normalized) || raw.trim();
        byNormalized.set(normalizeName(canonical), canonical.trim());
      });

      const attendees = Array.from(byNormalized.values()).filter(Boolean);
      const derivedCount = attendees.length;
      const sourceCount = Number(m.metric_value || 0);
      const dateLabel = start ? start.toISOString().slice(0, 10) : 'Unknown';

      return {
        id: m.id || `${dateLabel}-${type}`,
        type,
        date: start,
        dateLabel,
        attendees,
        derivedCount,
        sourceCount,
        mismatch: sourceCount !== derivedCount,
      };
    })
    .filter((s) => s.type === 'Tuesday' || s.type === 'Thursday')
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  // 2. Identify New vs Repeat & Calculate Running Avg Visits
  const globalSeen = new Set();
  const groupStats = {
      Tuesday: { visits: 0, unique: new Set(), trend: [] },
      Thursday: { visits: 0, unique: new Set(), trend: [] }
  };

  sessions = sessions.map(session => {
      const newNames = [];
      session.attendees.forEach(name => {
          const key = normalizeName(name);
          if (!globalSeen.has(key)) {
              globalSeen.add(key);
              newNames.push(name);
          }
      });

      const newCount = newNames.length;
      const repeatCount = session.derivedCount - newCount;

      // Update Group Running Stats
      const gs = groupStats[session.type];
      if (gs) {
          gs.visits += session.derivedCount;
          session.attendees.forEach(a => gs.unique.add(normalizeName(a)));
          
          const uniqueCount = gs.unique.size;
          const avg = uniqueCount > 0 ? gs.visits / uniqueCount : 0;
          
          gs.trend.push({
              date: session.dateLabel.slice(5),
              fullDate: session.dateLabel,
              avgVisits: Number(avg.toFixed(2)),
          });
      }

      return {
          ...session,
          newNames,
          newCount,
          repeatCount
      };
  });

  // 3. Build People Stats (for Cohorts & KPI Cards)
  const people = new Map();
  let mismatches = 0;
  let totalAppearances = 0;

  sessions.forEach((session, idx) => {
    if (session.mismatch) mismatches += 1;
    totalAppearances += session.derivedCount;

    session.attendees.forEach((name) => {
      if (!people.has(name)) {
        people.set(name, {
          name,
          visits: 0,
          tueVisits: 0,
          thuVisits: 0,
          sessionIndexes: [],
          firstSeen: session.dateLabel,
          lastSeen: session.dateLabel,
          primaryGroup: session.type, // Initially assigned to first group they join
        });
      }

      const p = people.get(name);
      p.visits += 1;
      if (session.type === 'Tuesday') p.tueVisits += 1;
      if (session.type === 'Thursday') p.thuVisits += 1;
      p.sessionIndexes.push(idx);
      p.lastSeen = session.dateLabel;
      
      // Re-assign primary group based on majority visits
      if (normalizeName(name).includes('chris lipper')) {
          p.primaryGroup = 'Thursday'; // Special case for coach
      } else {
          p.primaryGroup = p.tueVisits >= p.thuVisits ? 'Tuesday' : 'Thursday';
      }
    });
  });

  const peopleArr = Array.from(people.values()).map((p) => {
    const groupSessions = sessions.filter(s => s.type === p.primaryGroup);
    const attendedInGroup = groupSessions.filter(gs => 
        p.sessionIndexes.map(i => sessions[i].id).includes(gs.id)
    );

    const recentGroupSessions = groupSessions.slice(-RECENT_WINDOW);
    const recentGroupShows = recentGroupSessions.filter(gs => 
        attendedInGroup.some(a => a.id === gs.id)
    ).length;
    
    const recentWindowCount = recentGroupSessions.length;
    const recentShowRate = recentWindowCount ? recentGroupShows / recentWindowCount : 0;
    
    // Streak logic: missed last 3 sessions of THEIR group
    const last3GroupSessions = groupSessions.slice(-3);
    const last3GroupShows = last3GroupSessions.filter(gs => attendedInGroup.some(a => a.id === gs.id));
    // At risk if they have >=2 visits total, but missed the last 3 consecutive sessions of their group
    const isAtRisk = p.visits >= 2 && last3GroupShows.length === 0 && last3GroupSessions.length >= 3;

    return {
      ...p,
      recentShows: recentGroupShows,
      recentShowRate,
      isAtRisk,
    };
  });

  const uniquePeople = peopleArr.length;
  const uniqueTue = peopleArr.filter(p => p.tueVisits > 0).length;
  const uniqueThu = peopleArr.filter(p => p.thuVisits > 0).length;

  const repeatersTue = peopleArr.filter(p => p.tueVisits > 1).length;
  const repeatersThu = peopleArr.filter(p => p.thuVisits > 1).length;

  const repeatRateTue = uniqueTue ? repeatersTue / uniqueTue : 0;
  const repeatRateThu = uniqueThu ? repeatersThu / uniqueThu : 0;

  const repeaters = peopleArr.filter((p) => p.visits > 1).length;
  const oneTimers = peopleArr.filter((p) => p.visits === 1).length;
  const repeatRate = uniquePeople ? repeaters / uniquePeople : 0;
  const oneTimeShare = uniquePeople ? oneTimers / uniquePeople : 0;
  const avgVisitsPerPerson = uniquePeople ? totalAppearances / uniquePeople : 0;
  const avgAttendance = sessions.length ? totalAppearances / sessions.length : 0;
  const lowRecentShowRatePeople = peopleArr.filter((p) => p.recentShowRate < 0.25).length;

  const trendDataTue = sessions.filter(s => s.type === 'Tuesday').map((s) => ({
    date: s.dateLabel.slice(5),
    newCount: s.newCount,
    repeatCount: s.repeatCount,
    total: s.derivedCount,
    newNames: s.newNames
  }));
  const trendDataThu = sessions.filter(s => s.type === 'Thursday').map((s) => ({
    date: s.dateLabel.slice(5),
    newCount: s.newCount,
    repeatCount: s.repeatCount,
    total: s.derivedCount,
    newNames: s.newNames
  }));

  const cohortData = [
    { cohort: '1x', people: peopleArr.filter((p) => p.visits === 1).length, color: '#f97316' },
    { cohort: '2-3x', people: peopleArr.filter((p) => p.visits >= 2 && p.visits <= 3).length, color: '#06b6d4' },
    { cohort: '4-7x', people: peopleArr.filter((p) => p.visits >= 4 && p.visits <= 7).length, color: '#2563eb' },
    { cohort: '8x+', people: peopleArr.filter((p) => p.visits >= 8).length, color: '#1d4ed8' },
  ];

  const repeatPieData = [
    { name: 'Repeaters', value: repeaters, color: '#0ea5e9' },
    { name: 'One-time', value: oneTimers, color: '#fb923c' },
  ];

  return {
    sessions,
    people: peopleArr,
    stats: {
      sessions: sessions.length,
      uniquePeople,
      uniqueTue,
      uniqueThu,
      repeatRateTue,
      repeatRateThu,
      repeatRate,
      avgVisitsPerPerson,
      avgAttendance,
      mismatches,
      atRiskCount: peopleArr.filter((p) => p.isAtRisk).length,
      oneTimeShare,
      lowRecentShowRatePeople,
    },
    trendDataTue,
    trendDataThu,
    avgTrendTue: groupStats.Tuesday.trend,
    avgTrendThu: groupStats.Thursday.trend,
    cohortData,
    repeatPieData,
    topRepeaters: [...peopleArr].sort((a, b) => b.visits - a.visits).slice(0, 10),
    atRiskPeople: peopleArr.filter((p) => p.isAtRisk).sort((a, b) => b.visits - a.visits).slice(0, 10),
  };
}

const cardStyle = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

const AttendanceDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [aliasWarning, setAliasWarning] = useState('');
  const [syncSummary, setSyncSummary] = useState('');
  const [metrics, setMetrics] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [planState, setPlanState] = useState({});

  const analytics = useMemo(() => computeAnalytics(metrics, aliases), [metrics, aliases]);
  const planItems = useMemo(() => buildPlan(analytics?.stats), [analytics]);

  useEffect(() => {
    const defaultState = {};
    planItems.forEach((item) => {
      defaultState[item.id] = planState[item.id] ?? item.proceed;
    });
    setPlanState(defaultState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planItems.length]);

  useEffect(() => {
    loadAll(true);
  }, []);

  async function runZoomSync() {
    setSyncing(true);
    setSyncSummary('');
    const { data, error: syncError } = await supabase.functions.invoke('sync_zoom_attendance', {
      method: 'POST',
    });
    setSyncing(false);

    if (syncError) {
      throw new Error(syncError.message || 'Zoom sync failed.');
    }

    if (data?.ok === false) {
      throw new Error(data?.error || 'Zoom sync failed.');
    }

    const sessions = Number(data?.sessions_processed || 0);
    const rows = Number(data?.rows_written || 0);
    setSyncSummary(`Zoom sync completed: ${sessions} sessions processed, ${rows} metric rows written.`);
  }

  async function loadAll(autoSyncIfEmpty = false) {
    setLoading(true);
    setError('');
    setAliasWarning('');

    let { data: metricData, error: metricErr } = await supabase
      .from('kpi_metrics')
      .select('id, metric_name, metric_value, metric_date, metadata, created_at')
      .eq('metric_name', 'Zoom Meeting Attendees')
      .order('created_at', { ascending: true });

    if (metricErr) {
      setError(metricErr.message || 'Failed loading attendance data.');
      setLoading(false);
      return;
    }

    if ((metricData || []).length === 0 && autoSyncIfEmpty) {
      try {
        await runZoomSync();
      } catch (syncErr) {
        setError(`Attendance sync failed: ${syncErr.message}`);
        setLoading(false);
        return;
      }

      const retry = await supabase
        .from('kpi_metrics')
        .select('id, metric_name, metric_value, metric_date, metadata, created_at')
        .eq('metric_name', 'Zoom Meeting Attendees')
        .order('created_at', { ascending: true });

      metricData = retry.data || [];
      metricErr = retry.error;

      if (metricErr) {
        setError(metricErr.message || 'Failed loading attendance data after sync.');
        setLoading(false);
        return;
      }
    }

    const { data: aliasData, error: aliasErr } = await supabase
      .from('attendee_aliases')
      .select('id, original_name, target_name');

    if (aliasErr && !isMissingTableError(aliasErr)) {
      setAliasWarning(`Alias rules unavailable: ${aliasErr.message}`);
    } else if (aliasErr && isMissingTableError(aliasErr)) {
      setAliasWarning('Alias table is missing. Analytics still loaded using raw attendee names.');
    }

    setMetrics(metricData || []);
    setAliases(aliasErr ? [] : (aliasData || []));
    setLoading(false);
  }

  const selectedCount = Object.values(planState).filter(Boolean).length;
  const autonomousTasks = planItems.filter((p) => p.owner === 'Autonomous');
  const humanTasks = planItems.filter((p) => p.owner === 'Human');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Loading attendance analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, color: '#b91c1c' }}>
        <p style={{ fontWeight: 700 }}>Attendance load failed</p>
        <p style={{ marginTop: '8px' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {aliasWarning && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ color: '#92400e', fontWeight: 700 }}>Alias Warning</p>
          <p style={{ marginTop: '6px', color: '#92400e' }}>{aliasWarning}</p>
        </div>
      )}

      <div
        style={{
          ...cardStyle,
          background: 'linear-gradient(120deg, #0f766e 0%, #155e75 45%, #1e3a8a 100%)',
          color: 'white',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div>
          <p style={{ fontSize: '13px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Zoom KPI</p>
          <h2 style={{ fontSize: '30px', lineHeight: 1.1, marginTop: '6px' }}>Attendance Intelligence Dashboard</h2>
          <p style={{ marginTop: '8px', opacity: 0.9 }}>
            Accurate attendee counts, repeat behavior, and execution plan to improve show-up rate per person.
          </p>
          {syncSummary && <p style={{ marginTop: '8px', opacity: 0.9, fontSize: '13px' }}>{syncSummary}</p>}
        </div>
        <button
          onClick={async () => {
            try {
              await runZoomSync();
              await loadAll(false);
            } catch (syncErr) {
              setError(`Attendance sync failed: ${syncErr.message}`);
            }
          }}
          disabled={syncing}
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.15)',
            color: 'white',
            borderRadius: '10px',
            padding: '10px 14px',
            border: '1px solid rgba(255,255,255,0.3)',
            fontWeight: 600,
            opacity: syncing ? 0.75 : 1,
          }}
        >
          <RefreshCcw size={16} />
          {syncing ? 'Syncing Zoom...' : 'Sync Zoom'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Unique Tue</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px' }}>{analytics.stats.uniqueTue}</p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Tactic Tuesday
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Unique Thu</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px' }}>{analytics.stats.uniqueThu}</p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            SF Mastermind
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Repeat Rate Tue</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0ea5e9' }}>
            {formatPct(analytics.stats.repeatRateTue)}
          </p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Tue Retention
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Repeat Rate Thu</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#6366f1' }}>
            {formatPct(analytics.stats.repeatRateThu)}
          </p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Thu Retention
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Avg Visits / Person</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0f766e' }}>
            {analytics.stats.avgVisitsPerPerson.toFixed(2)}
          </p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Overall engagement
          </p>
        </div>
      </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <TrendingUp size={17} color="#0f766e" />
              <h3 style={{ fontSize: '18px' }}>Tuesday Attendance Trend</h3>
            </div>
            <div style={{ height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.trendDataTue} stacked>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div style={{ backgroundColor: 'white', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                            <p style={{ fontWeight: 700, marginBottom: '6px' }}>{label}</p>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                                <span style={{ color: '#22c55e', fontWeight: 600 }}>New: {d.newCount}</span>
                                <span style={{ color: '#64748b', fontWeight: 600 }}>Return: {d.repeatCount}</span>
                                <span style={{ color: '#0f172a', fontWeight: 700 }}>Total: {d.total}</span>
                            </div>
                            {d.newNames && d.newNames.length > 0 && (
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Welcome New:</p>
                                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#334155' }}>
                                        {d.newNames.map(n => <li key={n}>{n}</li>)}
                                    </ul>
                                </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  <Bar dataKey="newCount" name="New" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="repeatCount" name="Returning" stackId="a" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <TrendingUp size={17} color="#4f46e5" />
              <h3 style={{ fontSize: '18px' }}>Thursday Attendance Trend</h3>
            </div>
            <div style={{ height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={analytics.trendDataThu} stacked>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div style={{ backgroundColor: 'white', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                            <p style={{ fontWeight: 700, marginBottom: '6px' }}>{label}</p>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                                <span style={{ color: '#22c55e', fontWeight: 600 }}>New: {d.newCount}</span>
                                <span style={{ color: '#64748b', fontWeight: 600 }}>Return: {d.repeatCount}</span>
                                <span style={{ color: '#0f172a', fontWeight: 700 }}>Total: {d.total}</span>
                            </div>
                            {d.newNames && d.newNames.length > 0 && (
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Welcome New:</p>
                                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#334155' }}>
                                        {d.newNames.map(n => <li key={n}>{n}</li>)}
                                    </ul>
                                </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  <Bar dataKey="newCount" name="New" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="repeatCount" name="Returning" stackId="a" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <TrendingUp size={17} color="#2563eb" />
              <h3 style={{ fontSize: '18px' }}>Average Visits per Person (Trend)</h3>
            </div>
            <div style={{ height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" allowDuplicatedCategory={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis domain={[1, 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line data={analytics.avgTrendTue} type="monotone" dataKey="avgVisits" name="Tuesday Group" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  <Line data={analytics.avgTrendThu} type="monotone" dataKey="avgVisits" name="Thursday Group" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <ShieldCheck size={17} color="#1d4ed8" />
            <h3 style={{ fontSize: '18px' }}>Repeat Mix</h3>
          </div>
          <div style={{ height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analytics.repeatPieData} dataKey="value" nameKey="name" outerRadius={85}>
                  {analytics.repeatPieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            At-risk repeaters: <strong>{analytics.stats.atRiskCount}</strong>
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Users size={17} color="#2563eb" />
            <h3 style={{ fontSize: '18px' }}>Repeat Cohorts</h3>
          </div>
          <div style={{ height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.cohortData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="cohort" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="people" radius={[8, 8, 0, 0]}>
                  {analytics.cohortData.map((entry) => (
                    <Cell key={entry.cohort} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <UserRoundCheck size={17} color="#0f766e" />
            <h3 style={{ fontSize: '18px' }}>Top Repeat Attendees</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
            {analytics.topRepeaters.map((p) => (
              <div
                key={p.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: '10px',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{p.name}</span>
                  <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>
                    Group: {p.primaryGroup}
                  </span>
                </div>
                <span style={{ fontSize: '13px', color: '#0f766e', fontWeight: 700 }}>{p.visits} visits</span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatPct(p.recentShowRate)}</span>
              </div>
            ))}
            {analytics.topRepeaters.length === 0 && <p style={{ color: 'var(--color-text-secondary)' }}>No attendee rows yet.</p>}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, borderLeft: '5px solid #f59e0b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} color="#b45309" />
          <h3 style={{ fontSize: '18px' }}>At-Risk Repeaters (Missed 3+ sessions in their group)</h3>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {analytics.atRiskPeople.map((p) => (
            <span
              key={p.name}
              style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fcd34d',
                color: '#92400e',
                fontSize: '13px',
                padding: '6px 10px',
                borderRadius: '999px',
                fontWeight: 600,
              }}
            >
              {p.name} ({p.primaryGroup[0]}) - {p.visits} visits
            </span>
          ))}
          {analytics.atRiskPeople.length === 0 && (
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>No at-risk repeaters detected.</span>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={18} color="#1d4ed8" />
            <h3 style={{ fontSize: '20px' }}>Action Plan: Human + Autonomous</h3>
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '999px',
              backgroundColor: '#eff6ff',
              color: '#1e3a8a',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {selectedCount}/{planItems.length} marked proceed
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[{ title: 'Autonomous', items: autonomousTasks, icon: Calendar }, { title: 'Human', items: humanTasks, icon: Users }].map(
            (group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.title} style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <GroupIcon size={16} color="#0f766e" />
                    <h4 style={{ fontSize: '16px' }}>{group.title}</h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {group.items.map((item) => (
                      <label
                        key={item.id}
                        style={{
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#f8fafc',
                          borderRadius: '10px',
                          padding: '10px',
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          alignItems: 'start',
                          gap: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        <div>
                          <p style={{ fontSize: '14px', fontWeight: 700 }}>{item.title}</p>
                          <p style={{ marginTop: '4px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>{item.detail}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="checkbox"
                            checked={!!planState[item.id]}
                            onChange={(e) => setPlanState((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                          />
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>Proceed</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceDashboard;
