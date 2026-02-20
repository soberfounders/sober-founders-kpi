import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Database,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  GitMerge,
  User,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  Search,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────

function isMissingTableError(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '').toUpperCase();
  return code === 'PGRST205' || msg.includes('could not find') || (msg.includes('relation') && msg.includes('does not exist'));
}

function formatDateMMDDYY(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Styles ──────────────────────────────────────────────────

const cardStyle = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

const tabStyle = (active) => ({
  padding: '10px 20px',
  borderRadius: '10px 10px 0 0',
  fontWeight: active ? 700 : 500,
  fontSize: '14px',
  cursor: 'pointer',
  backgroundColor: active ? 'white' : '#f1f5f9',
  color: active ? '#0f172a' : '#64748b',
  border: active ? '1px solid var(--color-border)' : '1px solid transparent',
  borderBottom: active ? '2px solid white' : '1px solid var(--color-border)',
  marginBottom: '-1px',
  transition: 'all 0.15s ease',
});

const badgeStyle = (color) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 10px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  backgroundColor: color === 'green' ? '#dcfce7' : color === 'blue' ? '#dbeafe' : color === 'yellow' ? '#fef9c3' : color === 'red' ? '#fee2e2' : color === 'purple' ? '#ede9fe' : '#f1f5f9',
  color: color === 'green' ? '#166534' : color === 'blue' ? '#1e40af' : color === 'yellow' ? '#854d0e' : color === 'red' ? '#991b1b' : color === 'purple' ? '#6b21a8' : '#475569',
});

const btnStyle = (variant = 'primary') => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 16px',
  borderRadius: '10px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  border: 'none',
  ...(variant === 'primary' ? {
    background: 'linear-gradient(135deg, #0f766e 0%, #155e75 100%)',
    color: 'white',
  } : variant === 'danger' ? {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fca5a5',
  } : variant === 'ghost' ? {
    background: 'transparent',
    color: '#64748b',
    border: '1px solid #e2e8f0',
  } : {
    background: '#f1f5f9',
    color: '#334155',
    border: '1px solid #e2e8f0',
  }),
});

// ─── Component ───────────────────────────────────────────────

export default function DataCleaning() {
  const [activeTab, setActiveTab] = useState('log');
  const [loading, setLoading] = useState(true);
  const [tablesExist, setTablesExist] = useState(true);

  // Data
  const [mergeLogs, setMergeLogs] = useState([]);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [identities, setIdentities] = useState([]);
  const [blocklist, setBlocklist] = useState([]);
  const [aliases, setAliases] = useState([]);

  // UI State
  const [logFilter, setLogFilter] = useState('');
  const [mergeModalPair, setMergeModalPair] = useState(null);
  const [nameEditId, setNameEditId] = useState(null);
  const [nameEditValue, setNameEditValue] = useState('');
  const [newBlockPattern, setNewBlockPattern] = useState('');
  const [newBlockZoomId, setNewBlockZoomId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);

    // Check if new tables exist
    const { error: checkErr } = await supabase.from('zoom_identities').select('canonical_id').limit(1);
    if (checkErr && isMissingTableError(checkErr)) {
      setTablesExist(false);
      // Still load legacy data
      await fetchLegacyData();
      setLoading(false);
      return;
    }

    setTablesExist(true);

    // Load merge logs (most recent 200)
    const { data: logs } = await supabase
      .from('zoom_merge_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setMergeLogs(logs || []);

    // Load pending reviews
    const { data: reviews } = await supabase
      .from('zoom_pending_review')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setPendingReviews(reviews || []);

    // Load identities
    const { data: ids } = await supabase
      .from('zoom_identities')
      .select('*')
      .eq('is_note_taker', false)
      .order('total_appearances', { ascending: false });
    setIdentities(ids || []);

    // Load blocklist
    const { data: bl } = await supabase
      .from('zoom_notetaker_blocklist')
      .select('*')
      .order('created_at', { ascending: false });
    setBlocklist(bl || []);

    // Load legacy aliases
    const { data: al, error: alErr } = await supabase
      .from('attendee_aliases')
      .select('*')
      .order('created_at', { ascending: false });
    if (!alErr) setAliases(al || []);

    setLoading(false);
  }

  async function fetchLegacyData() {
    const { data: al, error: alErr } = await supabase
      .from('attendee_aliases')
      .select('*')
      .order('created_at', { ascending: false });
    if (!alErr) setAliases(al || []);
  }

  // ─── Pending Review Actions ────────────────────────────────

  async function handleMergeReview(review) {
    // Merge candidate_b into candidate_a
    const { data: recordA } = await supabase.from('zoom_identities').select('*').eq('canonical_id', review.candidate_a_id).single();
    const { data: recordB } = await supabase.from('zoom_identities').select('*').eq('canonical_id', review.candidate_b_id).single();

    if (!recordA || !recordB) {
      alert('Could not find one of the identity records');
      return;
    }

    // Merge B into A
    const mergedAliases = [...new Set([...(recordA.name_aliases || []), ...(recordB.name_aliases || [])])];
    const mergedZoomIds = [...new Set([...(recordA.zoom_user_ids || []), ...(recordB.zoom_user_ids || [])])];
    const mergedFrom = [...(recordA.merged_from || []), recordB.canonical_id];

    await supabase.from('zoom_identities').update({
      name_aliases: mergedAliases,
      zoom_user_ids: mergedZoomIds,
      merged_from: mergedFrom,
      total_appearances: (recordA.total_appearances || 0) + (recordB.total_appearances || 0),
      email: recordA.email || recordB.email || null,
      updated_at: new Date().toISOString(),
    }).eq('canonical_id', review.candidate_a_id);

    // Remap attendance records
    await supabase.from('zoom_attendance').update({
      canonical_id: review.candidate_a_id,
    }).eq('canonical_id', review.candidate_b_id);

    // Delete the merged record
    await supabase.from('zoom_identities').delete().eq('canonical_id', review.candidate_b_id);

    // Mark review as resolved
    await supabase.from('zoom_pending_review').update({
      status: 'merged',
      resolved_at: new Date().toISOString(),
    }).eq('id', review.id);

    // Log the merge
    await supabase.from('zoom_merge_log').insert({
      action: 'manual_merge',
      source_name: recordB.canonical_name,
      target_canonical_id: review.candidate_a_id,
      target_canonical_name: recordA.canonical_name,
      confidence: 100,
      reason: `Manual merge from Pending Review queue`,
    });

    fetchAll();
  }

  async function handleKeepSeparate(review) {
    await supabase.from('zoom_pending_review').update({
      status: 'kept_separate',
      resolved_at: new Date().toISOString(),
    }).eq('id', review.id);
    fetchAll();
  }

  async function handleMarkNoteTaker(review, candidateId) {
    await supabase.from('zoom_identities').update({
      is_note_taker: true,
      updated_at: new Date().toISOString(),
    }).eq('canonical_id', candidateId);

    await supabase.from('zoom_pending_review').update({
      status: 'marked_notetaker',
      resolved_at: new Date().toISOString(),
    }).eq('id', review.id);

    fetchAll();
  }

  // ─── Name Override ─────────────────────────────────────────

  async function handleNameOverride(canonicalId) {
    if (!nameEditValue.trim()) return;
    await supabase.from('zoom_identities').update({
      canonical_name: nameEditValue.trim(),
      updated_at: new Date().toISOString(),
    }).eq('canonical_id', canonicalId);

    await supabase.from('zoom_merge_log').insert({
      action: 'name_override',
      source_name: nameEditValue.trim(),
      target_canonical_id: canonicalId,
      target_canonical_name: nameEditValue.trim(),
      confidence: 100,
      reason: 'Manual name override by operator',
    });

    setNameEditId(null);
    setNameEditValue('');
    fetchAll();
  }

  // ─── Blocklist Management ──────────────────────────────────

  async function handleAddBlocklistEntry() {
    if (!newBlockPattern.trim() && !newBlockZoomId.trim()) return;

    await supabase.from('zoom_notetaker_blocklist').insert({
      name_pattern: newBlockPattern.trim() || null,
      zoom_user_id: newBlockZoomId.trim() || null,
      added_by: 'manual',
    });

    setNewBlockPattern('');
    setNewBlockZoomId('');
    fetchAll();
  }

  async function handleRemoveBlocklistEntry(id) {
    if (!confirm('Remove this blocklist entry?')) return;
    await supabase.from('zoom_notetaker_blocklist').delete().eq('id', id);
    fetchAll();
  }

  // ─── Manual Merge Tool ─────────────────────────────────────

  async function handleManualMerge(keepId, mergeId) {
    const keepRecord = identities.find(i => i.canonical_id === keepId);
    const mergeRecord = identities.find(i => i.canonical_id === mergeId);
    if (!keepRecord || !mergeRecord) return;

    const mergedAliases = [...new Set([...(keepRecord.name_aliases || []), ...(mergeRecord.name_aliases || [])])];
    const mergedZoomIds = [...new Set([...(keepRecord.zoom_user_ids || []), ...(mergeRecord.zoom_user_ids || [])])];
    const mergedFrom = [...(keepRecord.merged_from || []), mergeRecord.canonical_id];

    await supabase.from('zoom_identities').update({
      name_aliases: mergedAliases,
      zoom_user_ids: mergedZoomIds,
      merged_from: mergedFrom,
      total_appearances: (keepRecord.total_appearances || 0) + (mergeRecord.total_appearances || 0),
      email: keepRecord.email || mergeRecord.email || null,
      updated_at: new Date().toISOString(),
    }).eq('canonical_id', keepId);

    await supabase.from('zoom_attendance').update({ canonical_id: keepId }).eq('canonical_id', mergeId);
    await supabase.from('zoom_identities').delete().eq('canonical_id', mergeId);

    await supabase.from('zoom_merge_log').insert({
      action: 'manual_merge',
      source_name: mergeRecord.canonical_name,
      target_canonical_id: keepId,
      target_canonical_name: keepRecord.canonical_name,
      confidence: 100,
      reason: 'Manual merge via Merge Tool',
    });

    setMergeModalPair(null);
    fetchAll();
  }

  // ─── Filtered Data ─────────────────────────────────────────

  const filteredLogs = useMemo(() => {
    if (!logFilter) return mergeLogs;
    return mergeLogs.filter(l => l.action === logFilter);
  }, [mergeLogs, logFilter]);

  const filteredIdentities = useMemo(() => {
    if (!searchQuery) return identities;
    const q = searchQuery.toLowerCase();
    return identities.filter(i =>
      i.canonical_name?.toLowerCase().includes(q) ||
      (i.name_aliases || []).some(a => a.toLowerCase().includes(q)) ||
      i.email?.toLowerCase().includes(q)
    );
  }, [identities, searchQuery]);

  // ─── Action Counts for Tab Badges ──────────────────────────

  const actionCounts = useMemo(() => {
    const counts = {};
    for (const log of mergeLogs) {
      counts[log.action] = (counts[log.action] || 0) + 1;
    }
    return counts;
  }, [mergeLogs]);

  const actionLabel = (action) => {
    const map = {
      'new_record': 'New',
      'auto_merge_fuzzy': 'Fuzzy Merge',
      'auto_merge_name': 'Name Merge',
      'auto_merge_email': 'Email Merge',
      'alias_added': 'Alias Added',
      'note_taker_removed': 'Bot Removed',
      'manual_merge': 'Manual Merge',
      'name_override': 'Name Override',
      'new_record_pending_review': 'New (Pending)',
    };
    return map[action] || action;
  };

  const actionColor = (action) => {
    if (action === 'new_record' || action === 'new_record_pending_review') return 'green';
    if (action.includes('merge')) return 'blue';
    if (action === 'note_taker_removed') return 'red';
    if (action === 'alias_added') return 'purple';
    if (action === 'name_override') return 'yellow';
    return 'gray';
  };

  // ─── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Loading Data Integrity...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{
        ...cardStyle,
        background: 'linear-gradient(120deg, #1e3a5f 0%, #0f766e 45%, #155e75 100%)',
        color: 'white',
        border: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Database size={24} />
          <div>
            <h2 style={{ fontSize: '24px', lineHeight: 1.1 }}>Zoom Data Integrity</h2>
            <p style={{ opacity: 0.85, fontSize: '13px', marginTop: '4px' }}>
              Identity resolution, deduplication pipeline, and manual review tools
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '10px', fontSize: '13px' }}>
            <span style={{ opacity: 0.7 }}>Identities:</span> <strong>{identities.length}</strong>
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '10px', fontSize: '13px' }}>
            <span style={{ opacity: 0.7 }}>Pending Review:</span> <strong>{pendingReviews.length}</strong>
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '10px', fontSize: '13px' }}>
            <span style={{ opacity: 0.7 }}>Merge Logs:</span> <strong>{mergeLogs.length}</strong>
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '10px', fontSize: '13px' }}>
            <span style={{ opacity: 0.7 }}>Blocklist:</span> <strong>{blocklist.length}</strong>
          </div>
        </div>
      </div>

      {!tablesExist && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="#b45309" />
            <p style={{ color: '#92400e', fontWeight: 700 }}>Identity tables not deployed</p>
          </div>
          <p style={{ color: '#92400e', fontSize: '13px', marginTop: '6px' }}>
            Run the migration <code>20260219100000_zoom_identity_tables.sql</code> in the Supabase SQL Editor to enable the full data integrity system.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)' }}>
        {[
          { id: 'log', label: '🔍 Dedup Log', count: mergeLogs.length },
          { id: 'pending', label: '⚠️ Pending Review', count: pendingReviews.length },
          { id: 'merge', label: '🔗 Merge Tool', count: null },
          { id: 'blocklist', label: '🛡️ Note Taker Blocklist', count: blocklist.length },
          { id: 'identities', label: '👤 Identities', count: identities.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={tabStyle(activeTab === tab.id)}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span style={{
                marginLeft: '6px',
                backgroundColor: activeTab === tab.id ? '#0f766e' : '#94a3b8',
                color: 'white',
                padding: '1px 7px',
                borderRadius: '999px',
                fontSize: '11px',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════ TAB: Dedup Log (Temporary) ═══════ */}
      {activeTab === 'log' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={17} color="#0f766e" /> Deduplication Log
              </h3>
              <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
                Temporary section — shows identity resolution actions for transparency. Displays user names, not Zoom IDs.
              </p>
            </div>
          </div>

          {/* Action filters */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <button onClick={() => setLogFilter('')} style={{ ...btnStyle(logFilter === '' ? 'primary' : 'ghost'), padding: '5px 12px' }}>
              All ({mergeLogs.length})
            </button>
            {Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
              <button key={action} onClick={() => setLogFilter(action)} style={{ ...btnStyle(logFilter === action ? 'primary' : 'ghost'), padding: '5px 12px' }}>
                {actionLabel(action)} ({count})
              </button>
            ))}
          </div>

          {/* Log entries */}
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {filteredLogs.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>No log entries yet. Run a Zoom sync to populate.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Time</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Action</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Source Name</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>→ Canonical Name</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Confidence</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, idx) => (
                    <tr key={log.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {timeAgo(log.created_at)}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={badgeStyle(actionColor(log.action))}>{actionLabel(log.action)}</span>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{log.source_name}</td>
                      <td style={{ padding: '8px 12px', color: '#0f766e', fontWeight: 600 }}>{log.target_canonical_name || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {log.confidence != null ? (
                          <span style={{
                            fontWeight: 700,
                            color: log.confidence >= 90 ? '#166534' : log.confidence >= 60 ? '#854d0e' : '#991b1b',
                          }}>
                            {log.confidence}%
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '12px', maxWidth: '300px' }}>
                        {log.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══════ TAB: Pending Review ═══════ */}
      {activeTab === 'pending' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <AlertTriangle size={17} color="#b45309" /> Pending Review Queue
          </h3>
          <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '16px' }}>
            Fuzzy matches that need human judgment. One-click actions — no typing required.
          </p>

          {pendingReviews.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <CheckCircle2 size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
              <p style={{ fontWeight: 600 }}>Queue is empty</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>All identity matches have been resolved automatically.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingReviews.map(review => (
                <div key={review.id} style={{
                  border: '1px solid #fcd34d',
                  borderRadius: '12px',
                  padding: '16px',
                  backgroundColor: '#fffbeb',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={badgeStyle('yellow')}>Confidence: {review.confidence}%</span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{review.reason}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{timeAgo(review.created_at)}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center' }}>
                    {/* Candidate A */}
                    <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontWeight: 700, fontSize: '15px' }}>{review.candidate_a_name}</p>
                      <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Existing Identity</p>
                    </div>

                    <div style={{ fontSize: '24px', color: '#94a3b8' }}>↔</div>

                    {/* Candidate B */}
                    <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontWeight: 700, fontSize: '15px' }}>{review.candidate_b_name}</p>
                      <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>New Participant</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                    <button onClick={() => handleMergeReview(review)} style={btnStyle('primary')}>
                      <GitMerge size={14} /> Merge
                    </button>
                    <button onClick={() => handleKeepSeparate(review)} style={btnStyle('ghost')}>
                      <XCircle size={14} /> Keep Separate
                    </button>
                    <button onClick={() => handleMarkNoteTaker(review, review.candidate_b_id)} style={btnStyle('danger')}>
                      <Shield size={14} /> Mark as Note Taker
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB: Merge Tool ═══════ */}
      {activeTab === 'merge' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <GitMerge size={17} color="#2563eb" /> Manual Merge Tool
          </h3>
          <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '16px' }}>
            Select two identity records to merge. The winning record keeps all data.
          </p>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search identities by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 10px 10px 36px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Left: Select records */}
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
              {filteredIdentities.map(identity => (
                <div
                  key={identity.canonical_id}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    backgroundColor: mergeModalPair?.keep === identity.canonical_id ? '#dcfce7' :
                                     mergeModalPair?.merge === identity.canonical_id ? '#fee2e2' : 'white',
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() => {
                    if (!mergeModalPair) {
                      setMergeModalPair({ keep: identity.canonical_id, merge: null });
                    } else if (!mergeModalPair.merge && mergeModalPair.keep !== identity.canonical_id) {
                      setMergeModalPair({ ...mergeModalPair, merge: identity.canonical_id });
                    } else {
                      setMergeModalPair(null);
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '14px' }}>{identity.canonical_name}</p>
                      <p style={{ fontSize: '11px', color: '#64748b' }}>
                        {identity.total_appearances} visits • {(identity.name_aliases || []).length} aliases
                        {identity.email && ` • ${identity.email}`}
                      </p>
                    </div>
                    {mergeModalPair?.keep === identity.canonical_id && (
                      <span style={badgeStyle('green')}>KEEP</span>
                    )}
                    {mergeModalPair?.merge === identity.canonical_id && (
                      <span style={badgeStyle('red')}>MERGE INTO</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Preview */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
              {!mergeModalPair ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
                  <p>Click a record to select it as the <strong style={{ color: '#166534' }}>KEEP</strong> target</p>
                  <p style={{ fontSize: '12px', marginTop: '4px' }}>Then click a second record to <strong style={{ color: '#991b1b' }}>MERGE</strong> into it</p>
                </div>
              ) : (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Merge Preview</h4>

                  {['keep', 'merge'].map(role => {
                    const id = mergeModalPair[role];
                    const record = identities.find(i => i.canonical_id === id);
                    if (!record) return <p key={role} style={{ color: '#94a3b8' }}>Select {role === 'keep' ? 'keep' : 'merge'} target...</p>;
                    return (
                      <div key={role} style={{
                        marginBottom: '12px',
                        padding: '12px',
                        borderRadius: '10px',
                        border: `2px solid ${role === 'keep' ? '#22c55e' : '#ef4444'}`,
                        backgroundColor: role === 'keep' ? '#f0fdf4' : '#fef2f2',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={badgeStyle(role === 'keep' ? 'green' : 'red')}>{role === 'keep' ? '✓ KEEP' : '✗ MERGE INTO'}</span>
                        </div>
                        <p style={{ fontWeight: 700, fontSize: '16px', marginTop: '8px' }}>{record.canonical_name}</p>
                        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          Zoom IDs: {(record.zoom_user_ids || []).join(', ') || 'None'}
                        </p>
                        <p style={{ fontSize: '12px', color: '#64748b' }}>
                          Aliases: {(record.name_aliases || []).join(', ')}
                        </p>
                        <p style={{ fontSize: '12px', color: '#64748b' }}>
                          Visits: {record.total_appearances} • Email: {record.email || 'N/A'}
                        </p>
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    {mergeModalPair.keep && mergeModalPair.merge && (
                      <button
                        onClick={() => handleManualMerge(mergeModalPair.keep, mergeModalPair.merge)}
                        style={btnStyle('primary')}
                      >
                        <GitMerge size={14} /> Confirm Merge
                      </button>
                    )}
                    <button onClick={() => setMergeModalPair(null)} style={btnStyle('ghost')}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ TAB: Blocklist ═══════ */}
      {activeTab === 'blocklist' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Shield size={17} color="#991b1b" /> Note Taker Blocklist
          </h3>
          <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '16px' }}>
            Name patterns and Zoom User IDs permanently excluded from all counts. Retroactively removed on add.
          </p>

          {/* Add new entry */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Name Pattern</label>
              <input
                type="text"
                placeholder="e.g. notetaker, otter"
                value={newBlockPattern}
                onChange={(e) => setNewBlockPattern(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', marginTop: '4px' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Zoom User ID</label>
              <input
                type="text"
                placeholder="Optional — specific Zoom ID"
                value={newBlockZoomId}
                onChange={(e) => setNewBlockZoomId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', marginTop: '4px' }}
              />
            </div>
            <button onClick={handleAddBlocklistEntry} style={btnStyle('primary')}>
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Current blocklist */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {blocklist.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Blocklist is empty.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Pattern</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Zoom User ID</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Added By</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Added</th>
                    <th style={{ width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {blocklist.map(entry => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{entry.name_pattern || '—'}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px' }}>{entry.zoom_user_id || '—'}</td>
                      <td style={{ padding: '8px 12px' }}><span style={badgeStyle(entry.added_by === 'system' ? 'blue' : 'yellow')}>{entry.added_by}</span></td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{timeAgo(entry.created_at)}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <button onClick={() => handleRemoveBlocklistEntry(entry.id)} style={{ ...btnStyle('danger'), padding: '4px 8px' }}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══════ TAB: Identities (with Name Override) ═══════ */}
      {activeTab === 'identities' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <User size={17} color="#6b21a8" /> Identity Records
          </h3>
          <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '16px' }}>
            All canonical identity records. Click a name to override the display name (aliases preserved).
          </p>

          <div style={{ marginBottom: '12px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by name, alias, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none' }}
            />
          </div>

          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, backgroundColor: 'white' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Aliases</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Visits</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>First Seen</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>Zoom IDs</th>
                  <th style={{ width: '100px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredIdentities.map(identity => (
                  <tr key={identity.canonical_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>
                      {nameEditId === identity.canonical_id ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input
                            type="text"
                            value={nameEditValue}
                            onChange={(e) => setNameEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleNameOverride(identity.canonical_id)}
                            style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #0f766e', fontSize: '13px', flex: 1, outline: 'none' }}
                            autoFocus
                          />
                          <button onClick={() => handleNameOverride(identity.canonical_id)} style={{ ...btnStyle('primary'), padding: '4px 8px' }}>✓</button>
                          <button onClick={() => setNameEditId(null)} style={{ ...btnStyle('ghost'), padding: '4px 8px' }}>✗</button>
                        </div>
                      ) : (
                        <span
                          style={{ fontWeight: 700, cursor: 'pointer' }}
                          onClick={() => { setNameEditId(identity.canonical_id); setNameEditValue(identity.canonical_name); }}
                          title="Click to override display name"
                        >
                          {identity.canonical_name}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '11px', color: '#64748b', maxWidth: '200px' }}>
                      {(identity.name_aliases || []).filter(a => a !== identity.canonical_name).join(', ') || '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#0f766e' }}>
                      {identity.total_appearances}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b' }}>
                      {identity.email || '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b' }}>
                      {formatDateMMDDYY(identity.first_seen_date)}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(identity.zoom_user_ids || []).length > 0 ? `${(identity.zoom_user_ids || []).length} ID(s)` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {(identity.merged_from || []).length > 0 && (
                        <span style={badgeStyle('purple')}>Merged ×{(identity.merged_from || []).length}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
