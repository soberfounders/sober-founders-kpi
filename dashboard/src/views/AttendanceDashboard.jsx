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
  Download,
  Sparkles,
} from 'lucide-react';

const TUE_MEETING_ID = '87199667045';
const THU_MEETING_ID = '84242212480';
const RECENT_WINDOW = 8;

function normalizeName(name = '') {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function tokenizeName(name = '') {
  return normalizeName(name)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .map((x) => x.trim())
    .filter(Boolean);
}

const NON_PERSON_TOKENS = new Set([
  'iphone',
  'ipad',
  'android',
  'galaxy',
  'phone',
  'zoom',
  'user',
  'guest',
  'host',
  'cohost',
  'admin',
  'desktop',
  'laptop',
  'macbook',
  'pc',
  'meeting',
]);

function isLikelyNoiseToken(token = '') {
  return NON_PERSON_TOKENS.has(String(token || '').toLowerCase());
}

function hasLikelyFirstLastName(name = '') {
  const tokens = tokenizeName(name).filter((t) => /[a-z]/.test(t));
  if (tokens.length < 2) return false;
  const first = tokens[0];
  const second = tokens[1];
  if (!first || !second) return false;
  if (first.length < 2 || second.length < 2) return false;
  if (isLikelyNoiseToken(second)) return false;
  return true;
}

function getNameParts(name = '') {
  const tokens = tokenizeName(name).filter((t) => /[a-z]/.test(t));
  const first = tokens[0] || '';
  const second = tokens[1] || '';
  const last = tokens[tokens.length - 1] || '';
  return {
    tokens,
    first,
    second,
    last,
    isFirstOnly: tokens.length === 1,
    isFirstPlusInitial: tokens.length >= 2 && second.length === 1,
    hasFirstLast: hasLikelyFirstLastName(name),
  };
}

function isShortAliasOfFullName(fullName = '', maybeAlias = '') {
  const full = getNameParts(fullName);
  const alias = getNameParts(maybeAlias);
  if (!full.hasFirstLast || !full.first || alias.first !== full.first) return false;

  if (alias.isFirstOnly) return true;
  if (alias.isFirstPlusInitial && alias.second && full.last.startsWith(alias.second)) return true;

  const aliasHasLikelyNoiseTail =
    alias.tokens.length >= 2
    && alias.tokens.slice(1).every((t) => isLikelyNoiseToken(t) || t.length <= 1);
  if (aliasHasLikelyNoiseTail) return true;

  return false;
}

function duplicateScore(a = '', b = '') {
  const an = normalizeName(a);
  const bn = normalizeName(b);
  if (!an || !bn || an === bn) return 0;

  const at = tokenizeName(a);
  const bt = tokenizeName(b);
  if (!at.length || !bt.length) return 0;

  if (an.startsWith(`${bn} `) || bn.startsWith(`${an} `)) {
    const shortTokens = Math.min(at.length, bt.length);
    if (shortTokens >= 2) return 96;
    if (shortTokens === 1 && at[0] === bt[0]) return 94;
  }

  if (at.length === 1 || bt.length === 1) {
    const single = at.length === 1 ? at[0] : bt[0];
    const multi = at.length === 1 ? bt : at;
    const multiLast = multi[multi.length - 1] || '';

    if (single === multi[0]) return 94;
    if (single === multiLast) return 0;

    if (single.length >= 3 && multi[0].startsWith(single)) return 72;
    if (multi[0].length >= 3 && single.startsWith(multi[0])) return 70;
    return 0;
  }

  if (at[0] === bt[0] && at[1] === bt[1]) return 96;
  if (at[0] === bt[0] && at[1] && bt[1] && at[1][0] === bt[1][0]) return 82;
  if (at[0] === bt[0]) {
    if (hasLikelyFirstLastName(a) || hasLikelyFirstLastName(b)) return 70;
    return 58;
  }

  return 0;
}

function findPotentialDuplicates(name = '', allNames = [], limit = 5) {
  return allNames
    .map((candidate) => ({ candidate, score: duplicateScore(name, candidate) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map((x) => x.candidate);
}

function findSessionPriorityDuplicates(name = '', allNames = [], inSessionSet = new Set()) {
  const row = getNameParts(name);

  const ranked = allNames
    .map((candidate) => ({
      candidate,
      score: duplicateScore(name, candidate),
      inSession: inSessionSet.has(normalizeName(candidate)),
    }))
    .filter((x) => x.score > 0 && normalizeName(x.candidate) !== normalizeName(name))
    .filter((x) => {
      const candidate = x.candidate;
      const c = getNameParts(candidate);

      // If the row is already a likely full name, only show in-session short aliases
      // that share the same first name (e.g. Andrew -> Andrew Lassise).
      if (row.hasFirstLast) {
        if (!x.inSession) return false;
        return isShortAliasOfFullName(name, candidate);
      }

      // For short names, constrain suggestions to same first name.
      if (row.first && c.first && row.first !== c.first) return false;

      // For first+initial forms, target full names whose last name matches that initial.
      if (row.isFirstPlusInitial && c.hasFirstLast && row.second && !c.last.startsWith(row.second)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => Number(b.inSession) - Number(a.inSession) || b.score - a.score || a.candidate.localeCompare(b.candidate));

  if (row.hasFirstLast) {
    return ranked.slice(0, 3).map((x) => x.candidate);
  }

  const sameSession = ranked.filter((x) => x.inSession);
  if (sameSession.length > 0) {
    return sameSession.slice(0, 6).map((x) => x.candidate);
  }

  return ranked.slice(0, 4).map((x) => x.candidate);
}

function resolveAliasTarget(rawName = '', aliasMap = new Map()) {
  const fallback = String(rawName || '').trim();
  let current = fallback;
  let currentKey = normalizeName(current);
  const seen = new Set();

  for (let i = 0; i < 10; i += 1) {
    if (!currentKey || seen.has(currentKey)) break;
    seen.add(currentKey);

    const next = aliasMap.get(currentKey);
    if (!next) break;

    const nextTrimmed = String(next || '').trim();
    const nextKey = normalizeName(nextTrimmed);
    if (!nextTrimmed || !nextKey || nextKey === currentKey) break;

    current = nextTrimmed;
    currentKey = nextKey;
  }

  return current || fallback;
}

function canonicalNameScore(name = '', visits = 0) {
  const normalized = normalizeName(name);
  if (!normalized) return -Infinity;

  const tokens = tokenizeName(name);
  const alphaTokens = tokens.filter((t) => /[a-z]/.test(t));
  const cleanLength = normalized.length;
  const hasDeviceNoise = /(iphone|ipad|android|galaxy|phone|zoom user|guest)\b/i.test(normalized);

  let score = 0;
  if (alphaTokens.length === 1) score -= 25;
  if (alphaTokens.length === 2) score += 40;
  if (alphaTokens.length === 3) score += 30;
  if (alphaTokens.length >= 4) score += 15;

  score += Math.min(cleanLength, 36);
  if (/:/.test(name)) score -= 45;
  if (/\s-\s/.test(name)) score -= 12;
  if (/,/.test(name)) score -= 8;
  if (alphaTokens.length > 4) score -= 18;
  if (hasDeviceNoise) score -= 30;

  score += Math.min(Number(visits || 0), 60) * 0.5;
  return score;
}

function pickPreferredCanonicalName(a = '', b = '', visitsByName = new Map()) {
  const aHasFullName = hasLikelyFirstLastName(a);
  const bHasFullName = hasLikelyFirstLastName(b);
  if (aHasFullName !== bHasFullName) return aHasFullName ? a : b;

  const visitsA = Number(visitsByName.get(normalizeName(a)) || 0);
  const visitsB = Number(visitsByName.get(normalizeName(b)) || 0);
  const scoreA = canonicalNameScore(a, visitsA);
  const scoreB = canonicalNameScore(b, visitsB);

  if (scoreA === scoreB) {
    const tokenCountA = tokenizeName(a).length;
    const tokenCountB = tokenizeName(b).length;
    if (tokenCountA !== tokenCountB) return tokenCountA > tokenCountB ? a : b;
    return normalizeName(a).length >= normalizeName(b).length ? a : b;
  }

  return scoreA > scoreB ? a : b;
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

/** Format date as MM/DD/YYYY (e.g., "02/12/2026") */
function formatDateMMDDYY(dateLike) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (isNaN(d.getTime())) return String(dateLike);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const y = d.getUTCFullYear();
  return `${m}/${day}/${y}`;
}

/** Get day name from date */
function getDayName(dateLike) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getUTCDay()] || '';
}

function safeDate(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Export cleaned attendance data as CSV */
function exportAttendanceCSV(sessions) {
  const rows = [['canonical_name', 'session_date', 'group', 'is_net_new']];
  for (const session of sessions) {
    const dateFormatted = formatDateMMDDYY(session.dateLabel);
    for (const name of session.attendees) {
      const isNew = (session.newNames || []).includes(name);
      rows.push([name, dateFormatted, session.type, isNew ? 'Yes' : 'No']);
    }
  }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zoom_attendance_export_${formatDateMMDDYY(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const { atRiskCount, oneTimeShareTue, oneTimeShareThu, repeatRateTue, repeatRateThu, lowRecentShowRatePeople } = analytics;

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
      detail: `Track repeat rate — Tue: ${formatPct(repeatRateTue)}, Thu: ${formatPct(repeatRateThu)}.`,
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
      proceed: repeatRateThu < 0.55,
    },
  ];
}

/** Build cohort buckets for a set of people based on their day-specific visit counts */
function buildCohortBuckets(peopleArr, visitKey) {
  const buckets = [
    { label: '1 visit', min: 1, max: 1 },
    { label: '2–3 visits', min: 2, max: 3 },
    { label: '4–6 visits', min: 4, max: 6 },
    { label: '7–10 visits', min: 7, max: 10 },
    { label: '11+ visits', min: 11, max: Infinity },
  ];
  const colors = ['#f97316', '#06b6d4', '#2563eb', '#7c3aed', '#0f766e'];
  const total = peopleArr.filter(p => p[visitKey] > 0).length;
  return buckets.map((b, i) => {
    const count = peopleArr.filter(p => p[visitKey] >= b.min && p[visitKey] <= b.max).length;
    return {
      label: b.label,
      count,
      pct: total > 0 ? count / total : 0,
      color: colors[i],
    };
  });
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
        const canonical = resolveAliasTarget(raw, aliasMap) || raw.trim();
        byNormalized.set(normalizeName(canonical), canonical.trim());
      });

      const attendees = Array.from(byNormalized.values()).filter(Boolean);
      const derivedCount = attendees.length;
      const sourceCount = Number(m.metric_value || 0);
      const dateLabel = start ? start.toISOString().slice(0, 10) : 'Unknown';
      const dateFormatted = start ? formatDateMMDDYY(start) : 'Unknown';

      return {
        id: m.id || `${dateLabel}-${type}`,
        type,
        date: start,
        dateLabel,
        dateFormatted,
        attendees,
        derivedCount,
        sourceCount,
        mismatch: sourceCount !== derivedCount,
      };
    })
    .filter((s) => s.type === 'Tuesday' || s.type === 'Thursday')
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  // 2. Identify New vs Repeat — SEPARATELY per day
  const seenTuesday = new Set();
  const seenThursday = new Set();
  const groupStats = {
      Tuesday: { visits: 0, unique: new Set(), trend: [] },
      Thursday: { visits: 0, unique: new Set(), trend: [] }
  };

  sessions = sessions.map(session => {
      const seenPeople = session.type === 'Tuesday' ? seenTuesday : seenThursday;
      const newNames = [];
      session.attendees.forEach(name => {
          const key = normalizeName(name);
          if (!seenPeople.has(key)) {
              seenPeople.add(key);
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
              date: session.dateFormatted,
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
          primaryGroup: session.type,
        });
      }

      const p = people.get(name);
      p.visits += 1;
      if (session.type === 'Tuesday') p.tueVisits += 1;
      if (session.type === 'Thursday') p.thuVisits += 1;
      p.sessionIndexes.push(idx);
      p.lastSeen = session.dateLabel;
      
      if (normalizeName(name).includes('chris lipper')) {
          p.primaryGroup = 'Thursday';
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
    
    const last3GroupSessions = groupSessions.slice(-3);
    const last3GroupShows = last3GroupSessions.filter(gs => attendedInGroup.some(a => a.id === gs.id));
    const isAtRisk = p.visits >= 2 && last3GroupShows.length === 0 && last3GroupSessions.length >= 3;

    return {
      ...p,
      recentShows: recentGroupShows,
      recentShowRate,
      isAtRisk,
    };
  });

  const uniqueTue = peopleArr.filter(p => p.tueVisits > 0).length;
  const uniqueThu = peopleArr.filter(p => p.thuVisits > 0).length;

  const repeatersTue = peopleArr.filter(p => p.tueVisits > 1).length;
  const repeatersThu = peopleArr.filter(p => p.thuVisits > 1).length;
  const oneTimersTue = peopleArr.filter(p => p.tueVisits === 1).length;
  const oneTimersThu = peopleArr.filter(p => p.thuVisits === 1).length;

  const repeatRateTue = uniqueTue ? repeatersTue / uniqueTue : 0;
  const repeatRateThu = uniqueThu ? repeatersThu / uniqueThu : 0;
  const oneTimeShareTue = uniqueTue ? oneTimersTue / uniqueTue : 0;
  const oneTimeShareThu = uniqueThu ? oneTimersThu / uniqueThu : 0;

  const lowRecentShowRatePeople = peopleArr.filter((p) => p.recentShowRate < 0.25).length;
  const allCanonicalNames = peopleArr.map((p) => p.name);
  const duplicateCandidatesByName = {};
  allCanonicalNames.forEach((name) => {
    duplicateCandidatesByName[name] = findPotentialDuplicates(name, allCanonicalNames);
  });

  const trendDataTue = sessions.filter(s => s.type === 'Tuesday').map((s) => ({
    date: s.dateFormatted,
    fullDate: s.dateLabel,
    sessionKey: `${s.type}|${s.dateLabel}`,
    dayName: getDayName(s.dateLabel),
    newCount: s.newCount,
    repeatCount: s.repeatCount,
    total: s.derivedCount,
    newNames: s.newNames
  }));
  const trendDataThu = sessions.filter(s => s.type === 'Thursday').map((s) => ({
    date: s.dateFormatted,
    fullDate: s.dateLabel,
    sessionKey: `${s.type}|${s.dateLabel}`,
    dayName: getDayName(s.dateLabel),
    newCount: s.newCount,
    repeatCount: s.repeatCount,
    total: s.derivedCount,
    newNames: s.newNames
  }));

  // Welcome New: last 6 sessions with new attendees (per-day tracking already applied)
  const welcomeNewSessions = sessions
    .filter(s => s.newNames && s.newNames.length > 0)
    .slice(-6)
    .reverse();

  // Cohort data — separated by day
  const cohortDataTue = buildCohortBuckets(peopleArr, 'tueVisits');
  const cohortDataThu = buildCohortBuckets(peopleArr, 'thuVisits');

  return {
    sessions,
    people: peopleArr,
    stats: {
      sessions: sessions.length,
      uniqueTue,
      uniqueThu,
      repeatRateTue,
      repeatRateThu,
      oneTimeShareTue,
      oneTimeShareThu,
      atRiskCount: peopleArr.filter((p) => p.isAtRisk).length,
      lowRecentShowRatePeople,
    },
    trendDataTue,
    trendDataThu,
    avgTrendTue: groupStats.Tuesday.trend,
    avgTrendThu: groupStats.Thursday.trend,
    cohortDataTue,
    cohortDataThu,
    topRepeaters: [...peopleArr].sort((a, b) => b.visits - a.visits).slice(0, 10),
    atRiskPeople: peopleArr.filter((p) => p.isAtRisk).sort((a, b) => b.visits - a.visits).slice(0, 10),
    welcomeNewSessions,
    duplicateCandidatesByName,
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
  const [selectedSessionKey, setSelectedSessionKey] = useState('');
  const [detailMessage, setDetailMessage] = useState('');
  const [mergingAliasKey, setMergingAliasKey] = useState('');

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

  useEffect(() => {
    if (!analytics?.sessions?.length || selectedSessionKey) return;

    const targetDate = '2026-02-19';
    const targetSession = analytics.sessions.find((s) => s.type === 'Thursday' && s.dateLabel === targetDate);
    const fallbackThursday = [...analytics.sessions].reverse().find((s) => s.type === 'Thursday');
    const fallbackAny = analytics.sessions[analytics.sessions.length - 1];
    const selected = targetSession || fallbackThursday || fallbackAny;

    if (selected) {
      setSelectedSessionKey(`${selected.type}|${selected.dateLabel}`);
      if (!targetSession) {
        setDetailMessage(`No attendance row found for 02/19/2026 yet. Showing ${selected.type} ${selected.dateFormatted} for validation.`);
      }
    }
  }, [analytics, selectedSessionKey]);

  const selectedSessionDetail = useMemo(() => {
    if (!analytics?.sessions?.length || !selectedSessionKey) return null;
    const sessions = analytics.sessions;
    const selectedIndex = sessions.findIndex((s) => `${s.type}|${s.dateLabel}` === selectedSessionKey);
    if (selectedIndex < 0) return null;

    const session = sessions[selectedIndex];
    const totalVisitsByName = new Map();
    const groupVisitsByName = new Map();

    sessions.slice(0, selectedIndex + 1).forEach((s) => {
      (s.attendees || []).forEach((name) => {
        totalVisitsByName.set(name, (totalVisitsByName.get(name) || 0) + 1);
        if (s.type === session.type) {
          groupVisitsByName.set(name, (groupVisitsByName.get(name) || 0) + 1);
        }
      });
    });

    const newSet = new Set(session.newNames || []);
    const visitsByName = new Map(
      (analytics.people || []).map((p) => [normalizeName(p.name), Number(p.visits || 0)]),
    );
    const allKnownNames = (analytics.people || []).map((p) => p.name).filter(Boolean);
    const inSessionSet = new Set((session.attendees || []).map((n) => normalizeName(n)));
    const attendeeRows = (session.attendees || [])
      .map((name) => {
        const rawCandidates = findSessionPriorityDuplicates(name, allKnownNames, inSessionSet);
        const dedupe = new Set();
        const duplicateActions = rawCandidates
          .map((candidate) => {
            const preferred = pickPreferredCanonicalName(name, candidate, visitsByName);
            const source = preferred === name ? candidate : name;
            const target = preferred === name ? name : candidate;
            const key = `${normalizeName(source)}->${normalizeName(target)}`;
            if (normalizeName(source) === normalizeName(target) || dedupe.has(key)) return null;
            dedupe.add(key);
            return {
              source,
              target,
              key,
              label: `Merge ${source} into ${target}`,
            };
          })
          .filter(Boolean);

        return {
          name,
          isNew: newSet.has(name),
          groupVisitsIncludingThisSession: groupVisitsByName.get(name) || 0,
          totalVisitsIncludingThisSession: totalVisitsByName.get(name) || 0,
          duplicateActions,
        };
      })
      .sort((a, b) =>
        b.groupVisitsIncludingThisSession - a.groupVisitsIncludingThisSession
        || b.totalVisitsIncludingThisSession - a.totalVisitsIncludingThisSession
        || a.name.localeCompare(b.name)
      );

    return {
      session,
      attendeeRows,
      hasTargetDate: session.dateLabel === '2026-02-19',
    };
  }, [analytics, selectedSessionKey]);

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

  async function readAliasesFromTable() {
    const { data, error } = await supabase
      .from('attendee_aliases')
      .select('id, original_name, target_name');
    return { data: data || [], error };
  }

  async function readAliasesViaFunction() {
    const { data, error } = await supabase.functions.invoke('manage_attendee_aliases', {
      method: 'POST',
      body: { action: 'list' },
    });

    if (error) return { data: [], error };
    if (data?.ok === false) return { data: [], error: new Error(data?.error || 'Alias function failed.') };
    return { data: Array.isArray(data?.aliases) ? data.aliases : [], error: null };
  }

  async function hasAuthenticatedSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) return false;
    return !!data?.session;
  }

  async function loadAliasesForDashboard() {
    const functionResult = await readAliasesViaFunction();
    if (!functionResult.error) {
      return { aliases: functionResult.data, warning: '' };
    }

    const functionMessage = functionResult.error?.message || 'function read failed';
    const hasSession = await hasAuthenticatedSession();
    if (!hasSession) {
      return {
        aliases: [],
        warning: `Alias rules unavailable: ${functionMessage}. Deploy/manage manage_attendee_aliases or sign in for direct table access.`,
      };
    }

    const tableResult = await readAliasesFromTable();
    if (!tableResult.error) {
      return { aliases: tableResult.data, warning: '' };
    }

    if (isMissingTableError(tableResult.error)) {
      return {
        aliases: [],
        warning: 'Alias table is missing. Analytics still loaded using raw attendee names.',
      };
    }

    const tableMessage = tableResult.error?.message || 'table read failed';
    return {
      aliases: [],
      warning: `Alias rules unavailable: ${tableMessage}. Fallback failed: ${functionMessage}.`,
    };
  }

  async function mergeAliasViaTable(source, target) {
    const sourceNorm = normalizeName(source);
    const targetNorm = normalizeName(target);
    const rowsToDelete = (aliases || []).filter((row) => {
      const originalNorm = normalizeName(row.original_name);
      return originalNorm === sourceNorm || originalNorm === targetNorm;
    });

    for (const row of rowsToDelete) {
      const deleteQuery = row.id
        ? supabase.from('attendee_aliases').delete().eq('id', row.id)
        : supabase.from('attendee_aliases').delete().eq('original_name', row.original_name);
      const { error: deleteErr } = await deleteQuery;
      if (deleteErr) throw deleteErr;
    }

    const { error: insertErr } = await supabase
      .from('attendee_aliases')
      .insert({ original_name: source, target_name: target });
    if (insertErr) throw insertErr;

    const tableReload = await readAliasesFromTable();
    if (tableReload.error) throw tableReload.error;
    return tableReload.data;
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

    const aliasResult = await loadAliasesForDashboard();
    if (aliasResult.warning) {
      setAliasWarning(aliasResult.warning);
    }

    setMetrics(metricData || []);
    setAliases(aliasResult.aliases || []);
    setLoading(false);
  }

  function handleShowUpBarClick(eventState) {
    const payload = eventState?.activePayload?.[0]?.payload || eventState?.payload || null;
    const key = payload?.sessionKey;
    if (!key) return;
    setSelectedSessionKey(key);
    setDetailMessage('');
  }

  async function handleMergeAlias(sourceName, targetName) {
    const source = String(sourceName || '').trim();
    const target = String(targetName || '').trim();
    if (!source || !target) return;

    if (normalizeName(source) === normalizeName(target)) {
      setDetailMessage(`Merge skipped: "${source}" and "${target}" are the same normalized name.`);
      return;
    }

    const existingAlias = (aliases || []).find(
      (row) => normalizeName(row.original_name) === normalizeName(source),
    );
    if (existingAlias && normalizeName(existingAlias.target_name) === normalizeName(target)) {
      setDetailMessage(`Alias already exists: "${existingAlias.original_name}" -> "${existingAlias.target_name}".`);
      return;
    }

    const mergeKey = `${normalizeName(source)}->${normalizeName(target)}`;
    setMergingAliasKey(mergeKey);

    let managedErrorMessage = '';
    try {
      const managed = await supabase.functions.invoke('manage_attendee_aliases', {
        method: 'POST',
        body: { action: 'merge', source_name: source, target_name: target },
      });

      if (!managed.error && managed.data?.ok) {
        setAliases(Array.isArray(managed.data?.aliases) ? managed.data.aliases : []);
        setAliasWarning('');
        setDetailMessage(`Merged "${source}" into "${target}".`);
        return;
      }

      managedErrorMessage = managed.error?.message || managed.data?.error || '';
      const hasSession = await hasAuthenticatedSession();
      if (!hasSession) {
        throw new Error(
          `${managedErrorMessage || 'Alias function unavailable.'} Direct table fallback requires an authenticated dashboard session.`,
        );
      }

      const nextAliases = await mergeAliasViaTable(source, target);
      setAliases(nextAliases);
      if (managedErrorMessage) {
        setAliasWarning('Managed alias endpoint unavailable; used direct table write fallback.');
      }
      setDetailMessage(`Merged "${source}" into "${target}".`);
    } catch (mergeErr) {
      if (isMissingTableError(mergeErr)) {
        setAliasWarning('Alias table is missing. Analytics still loaded using raw attendee names.');
        setDetailMessage('Could not save merge because attendee_aliases is missing.');
      } else {
        const details = [mergeErr?.message, managedErrorMessage].filter(Boolean).join(' | ');
        setDetailMessage(`Failed to merge "${source}" into "${target}": ${details || 'Unknown error'}`);
      }
    } finally {
      setMergingAliasKey('');
    }
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

  /** Shared tooltip renderer for show-up bar charts */
  const showUpTooltip = ({ active, payload, label }) => {
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
  };

  /** Render a cohort breakdown for one day */
  const CohortBreakdown = ({ title, data, accentColor }) => (
    <div>
      <h4 style={{ fontSize: '15px', fontWeight: 700, color: accentColor, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {data.map((bucket) => (
          <div key={bucket.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '110px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>{bucket.label}</div>
            <div style={{ flex: 1, height: '24px', backgroundColor: '#f1f5f9', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${Math.max(bucket.pct * 100, 1)}%`,
                height: '100%',
                backgroundColor: bucket.color,
                borderRadius: '6px',
                transition: 'width 0.3s ease',
                opacity: 0.85,
              }} />
            </div>
            <div style={{ width: '90px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
              {bucket.count} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({(bucket.pct * 100).toFixed(0)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

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
            Accurate attendee counts, repeat behavior, and execution plan — Tuesday and Thursday tracked independently.
          </p>
          {syncSummary && <p style={{ marginTop: '8px', opacity: 0.9, fontSize: '13px' }}>{syncSummary}</p>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
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
              cursor: 'pointer',
              opacity: syncing ? 0.75 : 1,
            }}
          >
            <RefreshCcw size={16} />
            {syncing ? 'Syncing Zoom...' : 'Sync Zoom'}
          </button>
          <button
            onClick={() => exportAttendanceCSV(analytics.sessions)}
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
              cursor: 'pointer',
            }}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Welcome New Section */}
      {analytics.welcomeNewSessions && analytics.welcomeNewSessions.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Sparkles size={20} color="#0f766e" />
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Welcome New</h3>
            <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>Last 6 sessions with first-time attendees (per-day tracking)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {analytics.welcomeNewSessions.map((session, idx) => (
              <div key={idx} style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                backgroundColor: '#f0fdf4',
                borderLeft: `4px solid ${session.type === 'Tuesday' ? '#0ea5e9' : '#6366f1'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <p style={{ fontWeight: 700, fontSize: '14px', color: session.type === 'Tuesday' ? '#0369a1' : '#4338ca' }}>
                    Welcome New — {session.type} {session.dateFormatted}
                  </p>
                  <span style={{
                    backgroundColor: '#dcfce7',
                    color: '#166534',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}>
                    {session.newNames.length} new
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {session.newNames.map((name, nIdx) => (
                    <span key={nIdx} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      backgroundColor: 'white',
                      border: '1px solid #bbf7d0',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#334155',
                    }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Stats — Separated by Day */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Unique Tue</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0ea5e9' }}>{analytics.stats.uniqueTue}</p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Tactic Tuesday
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Unique Thu</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#6366f1' }}>{analytics.stats.uniqueThu}</p>
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
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Sessions</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0f766e' }}>
            {analytics.stats.sessions}
          </p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Total analyzed
          </p>
        </div>
      </div>

      {/* ─── Show-Up Charts (Tue & Thu separate) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <TrendingUp size={17} color="#0ea5e9" />
            <h3 style={{ fontSize: '18px' }}>Tuesday Show-Ups</h3>
          </div>
          <div style={{ height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.trendDataTue} onClick={handleShowUpBarClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip content={showUpTooltip} />
                <Legend verticalAlign="top" height={36}/>
                <Bar dataKey="newCount" name="New (Tue)" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} cursor="pointer" onClick={handleShowUpBarClick} />
                <Bar dataKey="repeatCount" name="Returning (Tue)" stackId="a" fill="#93c5fd" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleShowUpBarClick} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <TrendingUp size={17} color="#6366f1" />
            <h3 style={{ fontSize: '18px' }}>Thursday Show-Ups</h3>
          </div>
          <div style={{ height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
               <BarChart data={analytics.trendDataThu} onClick={handleShowUpBarClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip content={showUpTooltip} />
                <Legend verticalAlign="top" height={36}/>
                <Bar dataKey="newCount" name="New (Thu)" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} cursor="pointer" onClick={handleShowUpBarClick} />
                <Bar dataKey="repeatCount" name="Returning (Thu)" stackId="a" fill="#c4b5fd" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleShowUpBarClick} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Show-Up Drilldown */}
      <div style={{ ...cardStyle, borderLeft: '5px solid #0f766e' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '18px' }}>Show-Up Drilldown</h3>
            <p style={{ marginTop: '4px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              Click any Tuesday/Thursday bar to inspect attendees, visit counts including that meeting, and possible duplicates.
            </p>
          </div>
          {selectedSessionDetail && (
            <div style={{ padding: '6px 10px', borderRadius: '999px', backgroundColor: '#ecfeff', color: '#0f766e', fontSize: '12px', fontWeight: 700 }}>
              {selectedSessionDetail.session.type} {selectedSessionDetail.session.dateFormatted}
            </div>
          )}
        </div>

        {detailMessage && (
          <div style={{ marginTop: '10px', borderRadius: '10px', padding: '10px 12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: '13px' }}>
            {detailMessage}
          </div>
        )}

        {!selectedSessionDetail && (
          <p style={{ marginTop: '12px', color: 'var(--color-text-secondary)' }}>
            No session selected yet. Click a bar in Tuesday or Thursday show-ups.
          </p>
        )}

        {selectedSessionDetail && (
          <>
            {!selectedSessionDetail.hasTargetDate && (
              <div style={{ marginTop: '10px', borderRadius: '10px', padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '13px' }}>
                Validation target is Thursday 02/19/2026. Click that bar when it appears to verify this workflow there first.
              </div>
            )}

            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Total Show-Ups</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>{selectedSessionDetail.session.derivedCount}</p>
              </div>
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: '#166534', textTransform: 'uppercase' }}>Net New</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: '#166534' }}>{selectedSessionDetail.session.newCount}</p>
              </div>
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Returning</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: '#334155' }}>{selectedSessionDetail.session.repeatCount}</p>
              </div>
            </div>

            <div style={{ marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Attendee</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>{selectedSessionDetail.session.type} Visits</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Total Visits</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Potential Duplicates</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSessionDetail.attendeeRows.map((row) => (
                    <tr key={row.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{row.name}</td>
                      <td style={{ padding: '10px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: row.isNew ? '#dcfce7' : '#e2e8f0',
                            color: row.isNew ? '#166534' : '#334155',
                            textTransform: 'uppercase',
                          }}
                        >
                          {row.isNew ? 'Net New' : 'Returning'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', fontSize: '13px', color: '#334155', textAlign: 'right', fontWeight: 700 }}>
                        {row.groupVisitsIncludingThisSession}
                      </td>
                      <td style={{ padding: '10px', fontSize: '13px', color: '#334155', textAlign: 'right', fontWeight: 700 }}>
                        {row.totalVisitsIncludingThisSession}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {row.duplicateActions.length === 0 && (
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>None detected</span>
                        )}
                        {row.duplicateActions.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {row.duplicateActions.map((action) => {
                              const mergeKey = `${normalizeName(action.source)}->${normalizeName(action.target)}`;
                              const isBusy = mergingAliasKey === mergeKey;
                              return (
                                <button
                                  key={mergeKey}
                                  onClick={() => handleMergeAlias(action.source, action.target)}
                                  disabled={!!mergingAliasKey}
                                  style={{
                                    border: '1px solid #cbd5e1',
                                    backgroundColor: '#f8fafc',
                                    color: '#1e293b',
                                    borderRadius: '999px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '4px 10px',
                                    cursor: 'pointer',
                                    opacity: !!mergingAliasKey && !isBusy ? 0.55 : 1,
                                  }}
                                >
                                  {isBusy ? 'Merging...' : action.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {selectedSessionDetail.attendeeRows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '14px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                        No attendees found for this session.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <TrendingUp size={17} color="#2563eb" />
          <h3 style={{ fontSize: '18px' }}>Average Visits per Person (Trend)</h3>
          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>Two lines, same axis — compare Tue vs Thu engagement trajectory</span>
        </div>
        <div style={{ height: '260px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" allowDuplicatedCategory={false} tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis domain={[1, 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line data={analytics.avgTrendTue} type="monotone" dataKey="avgVisits" name="Tuesday" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line data={analytics.avgTrendThu} type="monotone" dataKey="avgVisits" name="Thursday" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Repeat Cohorts — Separated by Day with Percentages ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Users size={17} color="#0ea5e9" />
            <h3 style={{ fontSize: '18px' }}>Tuesday Cohorts</h3>
          </div>
          <CohortBreakdown title="Tuesday" data={analytics.cohortDataTue} accentColor="#0ea5e9" />
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Users size={17} color="#6366f1" />
            <h3 style={{ fontSize: '18px' }}>Thursday Cohorts</h3>
          </div>
          <CohortBreakdown title="Thursday" data={analytics.cohortDataThu} accentColor="#6366f1" />
        </div>
      </div>

      {/* ─── Top Repeaters & At-Risk ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <UserRoundCheck size={17} color="#0f766e" />
            <h3 style={{ fontSize: '18px' }}>Top Repeat Attendees</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
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
                    Tue: {p.tueVisits} · Thu: {p.thuVisits}
                  </span>
                </div>
                <span style={{ fontSize: '13px', color: '#0f766e', fontWeight: 700 }}>{p.visits} total</span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatPct(p.recentShowRate)}</span>
              </div>
            ))}
            {analytics.topRepeaters.length === 0 && <p style={{ color: 'var(--color-text-secondary)' }}>No attendee rows yet.</p>}
          </div>
        </div>

        <div style={{ ...cardStyle, borderLeft: '5px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="#b45309" />
            <h3 style={{ fontSize: '18px' }}>At-Risk Repeaters</h3>
          </div>
          <p style={{ fontSize: '12px', color: '#92400e', marginTop: '4px', marginBottom: '12px' }}>Missed 3+ sessions in their group</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
            {analytics.atRiskPeople.map((p) => (
              <div key={p.name} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: '#fffbeb', border: '1px solid #fcd34d', padding: '8px 12px', borderRadius: '10px',
              }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#92400e' }}>{p.name}</span>
                  <span style={{ fontSize: '11px', color: '#b45309', marginLeft: '8px' }}>
                    ({p.primaryGroup}) — {p.visits} visits
                  </span>
                </div>
              </div>
            ))}
            {analytics.atRiskPeople.length === 0 && (
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>No at-risk repeaters detected.</span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Action Plan ─── */}
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


