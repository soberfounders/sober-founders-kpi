import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Mail, Send, Loader2, RefreshCw, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, TrendingUp, Tag,
} from 'lucide-react';

/* ── Style constants ── */

const CAMPAIGN_META = {
  no_show_followup: {
    bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171', border: 'rgba(239, 68, 68, 0.25)',
    label: 'No-Show Recovery', icon: '🚫',
  },
  at_risk_nudge: {
    bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.25)',
    label: 'At-Risk Nudge', icon: '⚠️',
  },
  winback: {
    bg: 'rgba(59, 130, 246, 0.12)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.25)',
    label: 'Winback', icon: '🔄',
  },
  streak_break: {
    bg: 'rgba(168, 85, 247, 0.12)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.25)',
    label: 'Streak Break', icon: '💔',
  },
  first_visit_followup: {
    bg: 'rgba(52, 211, 153, 0.12)', text: '#34d399', border: 'rgba(52, 211, 153, 0.25)',
    label: 'First Visit Follow-up', icon: '👋',
  },
};

const cardStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '24px',
};

const labelStyle = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--color-text-secondary)',
  fontWeight: 600,
};

/* ── Lead qualification constants ── */

const QUAL_META = {
  phoenix_qualified: {
    bg: 'rgba(250, 204, 21, 0.15)', text: '#facc15', border: 'rgba(250, 204, 21, 0.3)',
    label: 'Phoenix ($1M+)', short: 'Phoenix',
  },
  qualified: {
    bg: 'rgba(52, 211, 153, 0.15)', text: '#34d399', border: 'rgba(52, 211, 153, 0.3)',
    label: 'Qualified ($250k+)', short: 'Qualified',
  },
  not_qualified: {
    bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171', border: 'rgba(239, 68, 68, 0.25)',
    label: 'Not Qualified', short: 'Not Qual',
  },
  unknown: {
    bg: 'rgba(148, 163, 184, 0.12)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)',
    label: 'Unknown', short: 'Unknown',
  },
};

/* ── Email template builders ── */

function buildNoShowEmail(c) {
  const name = c.name?.split(' ')[0] || c.firstname || 'there';
  const isThursday = c.is_thursday === true;
  const link = isThursday ? 'https://soberfounders.org/thursday' : 'https://soberfounders.org/tuesday';
  const sessionLabel = isThursday ? 'Thursday Mastermind' : 'Tuesday meeting';
  const count = c.prior_meeting_count ?? 0;

  let body;
  if (count <= 1) {
    body = `Hey ${name}, noticed you signed up for the ${sessionLabel} but weren't able to make it \u2014 hope everything's alright!\n\nIf it was just a scheduling issue, you can easily add it to your calendar at ${link}.\n\nIf you decided it wasn't for you, any feedback on how we can make it better would be greatly appreciated!\n\n\u2014 Andrew`;
  } else {
    body = `Hey ${name}, noticed you've been to a couple of our meetings but weren't at this one \u2014 hope everything's okay!\n\nIf it was just a scheduling issue, you can easily add it to your calendar at ${link}.\n\nIf you decided it wasn't for you, any feedback on how we can make it better would be greatly appreciated!\n\n\u2014 Andrew`;
  }

  return { subject: `Hey ${name}, missed you today`, body };
}

function buildAtRiskEmail(c) {
  const name = c.firstname || 'there';
  const group = c.primary_group || 'Tuesday';
  const groupSlug = group === 'Thursday' ? 'thursday' : 'tuesday';
  const link = `https://soberfounders.org/${groupSlug}`;

  const body = `Hey ${name}, I noticed we haven't seen you in a bit and just wanted to invite you back to the Sober Founders mastermind.\n\nIf you need any links or an easy way to get it in your calendar ${link}.\n\nAlso, if you have any feedback on how we can make it better, that would be super appreciated as well.\n\nHope to see you\n\n- Andrew`;
  return { subject: 'Hope to see you tomorrow', body };
}

function buildWinbackEmail(c) {
  const name = c.firstname || 'there';
  const isThursday = c.is_thursday_attendee === true;
  const groupSlug = isThursday ? 'thursday' : 'tuesday';
  const link = `https://soberfounders.org/${groupSlug}`;

  const body = `Hey ${name},\n\nIt was great meeting you at the Sober Founders group! Wanted to reach out because a lot has happened since then and just launched ${link} to make it easier to find everything and get it in your calendar with just a click.\n\nAlso, if it's not for you, any feedback is greatly appreciated!\n\n- Andrew`;
  return { subject: `Hey ${name} - Sober Founders update`, body };
}

function buildStreakBreakEmail(c) {
  const name = c.firstname || 'there';
  const groupSlug = c.last_was_thursday ? 'thursday' : 'tuesday';
  const link = `https://soberfounders.org/${groupSlug}`;
  const body = `Hey ${name},\n\nHaven't seen you in a few weeks - just wanted to check in and make sure everything's good.\n\nNo pressure at all, if you want to pop back in we're still running and if you need any links you can go to ${link}\n\nIf it's not for you, any feedback is really appreciated, good or bad.\n\nHope to see you!\n\n- Andrew`;
  return { subject: `Hey ${name}, checking in`, body };
}

function buildFirstVisitEmail(c) {
  const name = c.firstname || 'there';
  const isThursday = c.group_type === 'Thursday' || c.is_thursday === true;
  const slug = isThursday ? 'thursday' : 'tuesday';
  const link = `https://soberfounders.org/${slug}`;

  const body = `Hey ${name}, hope you enjoyed last week's mastermind group and we'll see you again at this week's? The links can be found here as well as an easy way to put it in your calendar ${link}.\n\nIf it's not for you, any feedback (good or bad) is really appreciated.\n\nSee you!\n\n-Andrew`;
  return { subject: 'See you again?', body };
}

function buildEmailForCandidate(candidate) {
  switch (candidate._campaign) {
    case 'no_show_followup': return buildNoShowEmail(candidate);
    case 'at_risk_nudge': return buildAtRiskEmail(candidate);
    case 'winback': return buildWinbackEmail(candidate);
    case 'streak_break': return buildStreakBreakEmail(candidate);
    case 'first_visit_followup': return buildFirstVisitEmail(candidate);
    default: return { subject: '', body: '' };
  }
}

function buildReason(c) {
  switch (c._campaign) {
    case 'no_show_followup':
      return `Registered for ${c.meeting_date || 'recent'} meeting but didn't attend. ${c.prior_meeting_count ?? 0} prior meetings on record.`;
    case 'at_risk_nudge':
      return `Attended ${c.meetings_60d ?? '?'} meetings in the last 60 days. Last attended ${c.last_attended || '?'} (${c.days_since_last ?? '?'} days ago). Going quiet.`;
    case 'winback':
      return `Came once on ${c.first_attended || '?'} (${c.days_since_last ?? '?'} days ago) and never returned. ${c.is_thursday_attendee ? 'Thursday' : 'Tuesday'} attendee.`;
    case 'streak_break':
      return `Was a regular (${c.total_meetings ?? '?'} total meetings). Last attended ${c.last_attended || '?'} (${c.days_since_last ?? '?'} days ago). Silent for ${c.days_since_last ?? '?'} days.`;
    case 'first_visit_followup':
      return `First group meeting was ${c.meeting_date || '?'} (${c.group_type || '?'}). ${c.total_meetings ?? 1} total meeting(s) so far.`;
    default:
      return '';
  }
}

/* ── Candidate card ── */

function getGroupTag(candidate) {
  // Derive which group(s) this person attends
  const pg = candidate.primary_group; // at-risk + winback views
  const isThurs = candidate.is_thursday; // no-show view
  const lastThurs = candidate.last_was_thursday; // streak-break view
  const gt = candidate.group_type; // first-visit view
  if (pg === 'Tuesday' || isThurs === false || lastThurs === false || gt === 'Tuesday') return 'Tuesday';
  if (pg === 'Thursday' || isThurs === true || lastThurs === true || gt === 'Thursday') return 'Thursday';
  return null;
}

function CandidateCard({ candidate, onSend, sendState, onTagQual, qualState }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CAMPAIGN_META[candidate._campaign] || CAMPAIGN_META.at_risk_nudge;
  const { subject, body } = useMemo(() => buildEmailForCandidate(candidate), [candidate]);
  const reason = useMemo(() => buildReason(candidate), [candidate]);
  const displayName = [candidate.firstname, candidate.lastname].filter(Boolean).join(' ')
    || candidate.name || candidate.email?.split('@')[0] || 'Unknown';
  const groupTag = getGroupTag(candidate);

  const isSending = sendState === 'sending';
  const isSent = sendState === 'sent';
  const isError = sendState?.startsWith?.('error');

  return (
    <div style={{
      ...cardStyle,
      padding: '16px 20px',
      borderLeft: `4px solid ${meta.text}`,
      opacity: isSent ? 0.6 : 1,
      transition: 'opacity 0.3s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '11px',
            fontWeight: 700, background: meta.bg, color: meta.text, border: `1px solid ${meta.border}`,
            whiteSpace: 'nowrap',
          }}>
            {meta.label}
          </span>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {displayName}
          </span>
          {groupTag && (
            <span style={{
              padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
              background: groupTag === 'Thursday' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: groupTag === 'Thursday' ? '#c084fc' : '#93c5fd',
              border: `1px solid ${groupTag === 'Thursday' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
              whiteSpace: 'nowrap',
            }}>
              {groupTag}
            </span>
          )}
          {/* Lead qualification badge */}
          {candidate.lead_qualification && (() => {
            const currentQual = qualState || candidate.lead_qualification;
            const qm = QUAL_META[currentQual] || QUAL_META.unknown;
            return (
              <span style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                background: qm.bg, color: qm.text, border: `1px solid ${qm.border}`,
                whiteSpace: 'nowrap',
              }}>
                {qm.short}
              </span>
            );
          })()}
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {candidate.email}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)',
              borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)',
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Hide' : 'Preview'}
          </button>
          <button
            onClick={() => onSend(candidate, subject, body)}
            disabled={isSending || isSent}
            style={{
              background: isSent ? 'rgba(52, 211, 153, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              border: `1px solid ${isSent ? 'rgba(52, 211, 153, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
              borderRadius: '8px', padding: '6px 16px', cursor: isSending || isSent ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', fontWeight: 700,
              color: isSent ? '#34d399' : '#93c5fd',
              opacity: isSending ? 0.7 : 1,
            }}
          >
            {isSending ? <Loader2 size={14} className="spin" /> : isSent ? <CheckCircle2 size={14} /> : <Send size={14} />}
            {isSending ? 'Sending...' : isSent ? 'Sent' : 'Send'}
          </button>
        </div>
      </div>

      {/* Reason (always visible) */}
      <div style={{
        marginTop: '8px', padding: '8px 12px', borderRadius: '8px',
        background: 'rgba(255,255,255,0.03)', fontSize: '12px', color: 'var(--color-text-secondary)',
        lineHeight: 1.5,
      }}>
        <strong style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>Why this person:</strong>{' '}
        {reason}
      </div>

      {/* Lead qualification tag buttons */}
      {candidate.lead_qualification && onTagQual && (
        <div style={{
          marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
        }}>
          <Tag size={12} color="var(--color-text-muted)" />
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Tag:</span>
          {Object.entries(QUAL_META).filter(([k]) => k !== 'unknown').map(([key, qm]) => {
            const currentQual = qualState || candidate.lead_qualification;
            const isActive = currentQual === key;
            const isSaving = qualState === `saving:${key}`;
            return (
              <button
                key={key}
                onClick={() => onTagQual(candidate, key)}
                disabled={isSaving}
                style={{
                  padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                  background: isActive ? qm.bg : 'rgba(255,255,255,0.04)',
                  color: isActive ? qm.text : 'var(--color-text-muted)',
                  border: `1px solid ${isActive ? qm.border : 'var(--color-border)'}`,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {qm.label}
              </button>
            );
          })}
          {candidate.annual_revenue > 0 && (
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>
              Rev: ${(candidate.annual_revenue / 1000).toFixed(0)}k
              {candidate.sobriety_date ? ` | Sober: ${candidate.sobriety_date.slice(0, 10)}` : ' | Sobriety: N/A'}
            </span>
          )}
        </div>
      )}

      {/* Error message */}
      {isError && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <XCircle size={14} />
          {sendState.replace('error:', '')}
        </div>
      )}

      {/* Expanded email preview */}
      {expanded && (
        <div style={{
          marginTop: '12px', padding: '16px', borderRadius: '10px',
          background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
            From: Andrew Lassise &lt;alassise@soberfounders.org&gt;
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
            To: {candidate.email}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Subject: {subject}
          </div>
          <div style={{
            fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: 1.7,
            whiteSpace: 'pre-wrap', fontFamily: 'inherit',
          }}>
            {body}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Comeback rate card ── */

function ComebackRateCard({ conversions }) {
  const stats = useMemo(() => {
    const byCampaign = {};
    for (const c of conversions) {
      const key = c.event_type || 'unknown';
      if (!byCampaign[key]) byCampaign[key] = { sent: 0, converted: 0, totalDays: 0 };
      byCampaign[key].sent++;
      if (c.converted) {
        byCampaign[key].converted++;
        byCampaign[key].totalDays += (c.days_to_return || 0);
      }
    }
    const totalSent = conversions.length;
    const totalConverted = conversions.filter(c => c.converted).length;
    return { byCampaign, totalSent, totalConverted };
  }, [conversions]);

  if (stats.totalSent === 0) return null;

  const overallRate = stats.totalSent > 0
    ? ((stats.totalConverted / stats.totalSent) * 100).toFixed(1) : '0.0';

  return (
    <div style={{ ...cardStyle, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <TrendingUp size={16} color="#34d399" />
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Comeback Rates
        </span>
        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          (within 28 days of outreach)
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{overallRate}%</div>
          <div style={labelStyle}>Overall</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{stats.totalConverted}/{stats.totalSent}</div>
        </div>
        {Object.entries(CAMPAIGN_META).map(([key, meta]) => {
          const data = stats.byCampaign[key];
          if (!data || data.sent === 0) return null;
          const rate = ((data.converted / data.sent) * 100).toFixed(1);
          const avgDays = data.converted > 0 ? Math.round(data.totalDays / data.converted) : null;
          return (
            <div key={key} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: meta.text }}>{rate}%</div>
              <div style={{ ...labelStyle, color: meta.text }}>{meta.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {data.converted}/{data.sent}
                {avgDays ? ` (avg ${avgDays}d)` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main component ── */

export default function OutreachReviewQueue() {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [sendStates, setSendStates] = useState({});
  const [qualStates, setQualStates] = useState({});
  const [collapsed, setCollapsed] = useState(false);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const [noShowRes, atRiskRes, winbackRes, streakRes, firstVisitRes, convRes] = await Promise.all([
        supabase.from('vw_noshow_candidates')
          .select('*')
          .eq('attendance_status', 'no_show')
          .is('last_recovery_sent', null)
          .order('meeting_date', { ascending: false })
          .limit(20),
        supabase.from('vw_at_risk_attendees')
          .select('*')
          .is('last_nudge_sent', null)
          .order('days_since_last', { ascending: false })
          .limit(20),
        supabase.from('vw_winback_candidates')
          .select('*')
          .is('last_winback_sent', null)
          .order('days_since_last', { ascending: true })
          .limit(20),
        supabase.from('vw_streak_break_candidates')
          .select('*')
          .is('last_streak_break_sent', null)
          .is('last_at_risk_nudge_sent', null)
          .order('days_since_last', { ascending: true })
          .limit(10),
        supabase.from('vw_first_visit_followup')
          .select('*')
          .is('last_followup_sent', null)
          .order('meeting_date', { ascending: false })
          .limit(20),
        supabase.from('vw_outreach_conversions')
          .select('*')
          .order('delivered_at', { ascending: false }),
      ]);

      const tagged = [
        ...(firstVisitRes.data || []).map(c => ({ ...c, _campaign: 'first_visit_followup', _key: `fv:${c.email}:${c.meeting_date}` })),
        ...(noShowRes.data || []).map(c => ({ ...c, _campaign: 'no_show_followup', _key: `ns:${c.email}:${c.meeting_date}` })),
        ...(atRiskRes.data || []).map(c => ({ ...c, _campaign: 'at_risk_nudge', _key: `ar:${c.email}` })),
        ...(winbackRes.data || []).map(c => ({ ...c, _campaign: 'winback', _key: `wb:${c.email}` })),
        ...(streakRes.data || []).map(c => ({ ...c, _campaign: 'streak_break', _key: `sb:${c.email}` })),
      ];

      // Dedup by lowercase email — keep highest priority campaign
      const seen = new Set();
      const deduped = [];
      for (const c of tagged) {
        const emailKey = (c.email || '').toLowerCase();
        if (!emailKey || seen.has(emailKey)) continue;
        seen.add(emailKey);
        deduped.push(c);
      }

      setCandidates(deduped);
      setConversions(convRes.data || []);
    } catch (err) {
      console.error('OutreachReviewQueue fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const handleSend = useCallback(async (candidate, subject, body) => {
    const key = candidate._key;
    setSendStates(prev => ({ ...prev, [key]: 'sending' }));

    try {
      const { data, error } = await supabase.functions.invoke('send-outreach-email', {
        body: {
          email: candidate.email,
          firstname: candidate.firstname || candidate.name?.split(' ')[0] || '',
          subject,
          body,
          campaign_type: candidate._campaign,
          meeting_date: candidate.meeting_date || null,
        },
      });

      if (error) {
        setSendStates(prev => ({ ...prev, [key]: `error:${error.message || 'Unknown error'}` }));
        return;
      }

      if (data?.ok) {
        setSendStates(prev => ({ ...prev, [key]: 'sent' }));
      } else {
        setSendStates(prev => ({ ...prev, [key]: `error:${data?.error || 'Send failed'}` }));
      }
    } catch (err) {
      setSendStates(prev => ({ ...prev, [key]: `error:${err.message || 'Network error'}` }));
    }
  }, []);

  const handleTagQualification = useCallback(async (candidate, qualification) => {
    const key = candidate._key;
    setQualStates(prev => ({ ...prev, [key]: `saving:${qualification}` }));

    try {
      const { error } = await supabase
        .from('lead_qualification_overrides')
        .upsert(
          { email: candidate.email.toLowerCase(), qualification, tagged_by: 'dashboard', updated_at: new Date().toISOString() },
          { onConflict: 'email' },
        );

      if (error) {
        console.error('Tag qualification error:', error);
        setQualStates(prev => ({ ...prev, [key]: candidate.lead_qualification }));
      } else {
        setQualStates(prev => ({ ...prev, [key]: qualification }));
      }
    } catch (err) {
      console.error('Tag qualification error:', err);
      setQualStates(prev => ({ ...prev, [key]: candidate.lead_qualification }));
    }
  }, []);

  const pendingCount = candidates.filter(c => sendStates[c._key] !== 'sent').length;
  const sentCount = candidates.filter(c => sendStates[c._key] === 'sent').length;

  return (
    <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
      {/* Header — always visible */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', cursor: 'pointer',
          background: candidates.length > 0 ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
          borderBottom: collapsed ? 'none' : '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Mail size={18} color="#93c5fd" />
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Outreach Review Queue
          </span>
          {candidates.length > 0 && (
            <span style={{
              padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd',
              border: '1px solid rgba(59, 130, 246, 0.25)',
            }}>
              {pendingCount} pending
            </span>
          )}
          {sentCount > 0 && (
            <span style={{
              padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              background: 'rgba(52, 211, 153, 0.15)', color: '#34d399',
            }}>
              {sentCount} sent
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn-glass"
            onClick={(e) => { e.stopPropagation(); fetchCandidates(); }}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '12px' }}
          >
            {loading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
            Refresh
          </button>
          {collapsed ? <ChevronDown size={16} color="var(--color-text-secondary)" /> : <ChevronUp size={16} color="var(--color-text-secondary)" />}
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: '16px 24px 24px' }}>
          {loading && candidates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
              <Loader2 size={20} className="spin" style={{ margin: '0 auto 8px' }} />
              Loading outreach candidates...
            </div>
          ) : candidates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
              <CheckCircle2 size={20} color="#34d399" style={{ margin: '0 auto 8px' }} />
              No pending outreach. All caught up!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Comeback rates */}
              <ComebackRateCard conversions={conversions} />

              {/* Candidate list grouped by campaign */}
              {['first_visit_followup', 'no_show_followup', 'at_risk_nudge', 'streak_break', 'winback'].map(campaignType => {
                const group = candidates.filter(c => c._campaign === campaignType);
                if (group.length === 0) return null;
                const meta = CAMPAIGN_META[campaignType];
                return (
                  <div key={campaignType}>
                    <div style={{
                      fontSize: '13px', fontWeight: 700, color: meta.text,
                      marginBottom: '8px', marginTop: '8px',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      <span>{meta.icon}</span>
                      {meta.label}
                      <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-muted)' }}>
                        ({group.length})
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {group.map(c => (
                        <CandidateCard
                          key={c._key}
                          candidate={c}
                          onSend={handleSend}
                          sendState={sendStates[c._key]}
                          onTagQual={handleTagQualification}
                          qualState={qualStates[c._key]}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
