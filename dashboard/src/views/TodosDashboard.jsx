import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import AddToNotionButton from '../components/AddToNotionButton';
import {
  CheckCircle2, Circle, Clock, AlertCircle, Plus, Loader2, ExternalLink,
  RefreshCw, Filter, Sparkles, Bot, Users, Zap, Lightbulb, ChevronDown, ChevronUp,
  User
} from 'lucide-react';

/* ── Status helpers ── */
const STATUS_ORDER = ['Not started', 'In progress', 'Waiting on Others', 'Done'];
const STATUS_COLORS = {
  'not started': { bg: 'rgba(255,255,255,0.05)', text: 'var(--color-text-secondary)', border: 'var(--color-border)' },
  'in progress': { bg: 'rgba(59, 130, 246, 0.15)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.3)' },
  'waiting on others': { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
  'done': { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
  'completed': { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
  'to do': { bg: 'rgba(255,255,255,0.05)', text: 'var(--color-text-secondary)', border: 'var(--color-border)' },
};
const PRIORITY_COLORS = {
  'high': { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', icon: '🔴' },
  'high priority': { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', icon: '🔴' },
  'medium': { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', icon: '🟡' },
  'medium priority': { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', icon: '🟡' },
  'low': { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', icon: '🟢' },
  'low priority': { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', icon: '🟢' },
};

const EFFORT_COLORS = {
  'easy effort': { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399' },
  'medium effort': { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' },
  'hard effort': { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171' },
};

const PERSON_OPTIONS = ['All', 'Andrew Lassise', 'Kandace'];

const getStatusStyle = (status) => STATUS_COLORS[status?.toLowerCase()] || STATUS_COLORS['to do'];
const getPriorityStyle = (priority) => PRIORITY_COLORS[priority?.toLowerCase()] || null;
const getEffortStyle = (effort) => EFFORT_COLORS[effort?.toLowerCase()] || null;

const getStatusIcon = (status) => {
  switch (status?.toLowerCase()) {
    case 'done': case 'completed': return <CheckCircle2 size={18} color="#10b981" />;
    case 'in progress': return <Clock size={18} color="#2563eb" />;
    case 'waiting on others': return <AlertCircle size={18} color="#f1972c" />;
    default: return <Circle size={18} color="#94a3b8" />;
  }
};

/* ── Status Dropdown Component ── */
const StatusDropdown = ({ todo, onStatusChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const statusStyle = getStatusStyle(todo.status);
  const currentStatus = todo.status || 'No Status';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onClick={() => setOpen(!open)}
        style={{
          padding: '4px 10px', borderRadius: '12px',
          fontSize: '11px', fontWeight: '700', cursor: 'pointer',
          backgroundColor: statusStyle.bg, color: statusStyle.text,
          border: `1px solid ${statusStyle.border}`,
          display: 'inline-flex', alignItems: 'center', gap: '4px',
        }}
      >
        {currentStatus}
        <ChevronDown size={10} />
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: '4px',
          zIndex: 50, minWidth: '160px',
          background: 'var(--color-card, #1a1f2e)', backdropFilter: 'blur(16px)',
          borderRadius: '10px', border: '1px solid var(--color-border)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}>
          {STATUS_ORDER.map((s) => {
            const sStyle = getStatusStyle(s);
            const isActive = s.toLowerCase() === currentStatus.toLowerCase();
            return (
              <div
                key={s}
                onClick={() => {
                  setOpen(false);
                  if (!isActive) onStatusChange(todo, s);
                }}
                style={{
                  padding: '8px 14px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: '600',
                  color: sStyle.text,
                  backgroundColor: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  transition: 'background-color 0.15s',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActive ? 'rgba(255,255,255,0.08)' : 'transparent'}
              >
                {getStatusIcon(s)}
                {s}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── AI Analysis engine (rule-based) ── */
function analyzeTaskList(todos) {
  if (!todos || todos.length === 0) return null;

  const open = todos.filter(t => t.status?.toLowerCase() !== 'done' && t.status?.toLowerCase() !== 'completed');
  const overdue = open.filter(t => t.due_date && new Date(t.due_date) < new Date());
  const highPriority = open.filter(t => {
    const p = t.priority?.toLowerCase() || '';
    return p === 'high' || p === 'high priority';
  });
  const noDueDate = open.filter(t => !t.due_date);

  // AI Can Handle — simple, routine tasks
  const aiCanHandle = open.filter(t => {
    const title = t.task_title?.toLowerCase() || '';
    return (
      title.includes('update') || title.includes('check') || title.includes('review') ||
      title.includes('send') || title.includes('schedule') || title.includes('reminder') ||
      title.includes('follow up') || title.includes('organize') || title.includes('clean') ||
      title.includes('draft') || title.includes('format') || title.includes('compile')
    );
  });

  // Delegate — low-level operational tasks
  const delegate = open.filter(t => {
    const title = t.task_title?.toLowerCase() || '';
    return (
      title.includes('data entry') || title.includes('upload') || title.includes('copy') ||
      title.includes('move') || title.includes('file') || title.includes('sort') ||
      title.includes('setup') || title.includes('install') || title.includes('configure') ||
      title.includes('create account') || title.includes('research') || title.includes('gather')
    );
  }).filter(t => !aiCanHandle.includes(t));

  // Next Steps — prioritized by urgency
  const nextSteps = [];
  if (overdue.length > 0) {
    nextSteps.push({ type: 'urgent', message: `⚠️ ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} need immediate attention`, items: overdue.slice(0, 3) });
  }
  if (highPriority.length > 0) {
    nextSteps.push({ type: 'high', message: `🔴 ${highPriority.length} high-priority task${highPriority.length > 1 ? 's' : ''} waiting`, items: highPriority.slice(0, 3) });
  }
  const upcoming = open
    .filter(t => t.due_date && new Date(t.due_date) >= new Date())
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 3);
  if (upcoming.length > 0) {
    nextSteps.push({ type: 'upcoming', message: `📅 Next due tasks`, items: upcoming });
  }

  // Suggestions
  const suggestions = [];
  if (noDueDate.length > 3) {
    suggestions.push(`📋 ${noDueDate.length} tasks have no due date — consider adding deadlines to maintain momentum.`);
  }
  const doneCount = todos.filter(t => t.status?.toLowerCase() === 'done' || t.status?.toLowerCase() === 'completed').length;
  if (doneCount > 5) {
    suggestions.push(`🧹 You have ${doneCount} completed tasks. Consider archiving them in Notion to keep the list focused.`);
  }
  if (open.length > 15) {
    suggestions.push(`⚡ ${open.length} open tasks is a lot! Try the "2-minute rule" — if a task takes <2 min, do it now.`);
  }
  if (open.length > 0 && highPriority.length === 0) {
    suggestions.push(`🏷️ None of your open tasks are marked as High priority. Consider prioritizing to focus your energy.`);
  }
  if (aiCanHandle.length === 0 && delegate.length === 0 && suggestions.length === 0) {
    suggestions.push(`✅ Your task list looks well-organized! Keep up the great work.`);
  }

  return { aiCanHandle, delegate, nextSteps, suggestions, stats: { total: todos.length, open: open.length, overdue: overdue.length, done: doneCount } };
}

/* Helper: extract assignee/person from metadata */
const getAssignee = (todo) => todo.metadata?.assignee || null;
const getEffortLevel = (todo) => todo.metadata?.effort_level || null;

/* ── Main Component ── */
const TodosDashboard = () => {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newTodo, setNewTodo] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [filter, setFilter] = useState('Active');
  const [personFilter, setPersonFilter] = useState('Andrew Lassise');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notion_todos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch error:', error);
    } else if (data) {
      setTodos(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  /* ── Sync from Notion ── */
  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('master-sync', {
        body: { action: 'sync_notion' }
      });
      if (error) throw error;
      await fetchTodos();
    } catch (err) {
      console.error('Sync error:', err);
      alert('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  /* ── Update Status (now accepts explicit status value) ── */
  const handleUpdateStatus = async (todo, newStatus) => {
    const previousStatus = todo.status;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: newStatus } : t));

    try {
      const { error } = await supabase.functions.invoke('master-sync', {
        body: {
          action: 'update_task',
          pageId: todo.notion_page_id,
          properties: { 'Status': { status: { name: newStatus } } }
        }
      });
      if (error) throw error;

      // Update local DB too
      await supabase.from('notion_todos')
        .update({ status: newStatus })
        .eq('notion_page_id', todo.notion_page_id);
    } catch (err) {
      console.error('Update failed:', err);
      alert('Failed to update Notion: ' + err.message);
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: previousStatus } : t));
    }
  };

  /* ── Inline Title Edit ── */
  const handleTitleSave = async (todo) => {
    if (!editTitle.trim() || editTitle === todo.task_title) {
      setEditingId(null);
      return;
    }

    const oldTitle = todo.task_title;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, task_title: editTitle } : t));
    setEditingId(null);

    try {
      const { error } = await supabase.functions.invoke('master-sync', {
        body: {
          action: 'update_task',
          pageId: todo.notion_page_id,
          properties: { 'Task name': { title: [{ text: { content: editTitle } }] } }
        }
      });
      if (error) throw error;

      // Update local DB too
      await supabase.from('notion_todos')
        .update({ task_title: editTitle })
        .eq('notion_page_id', todo.notion_page_id);
    } catch (err) {
      console.error('Rename failed:', err);
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, task_title: oldTitle } : t));
      alert('Failed to rename: ' + err.message);
    }
  };

  /* ── Create Task ── */
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTodo.trim()) return;

    setIsAdding(true);
    try {
      const { error } = await supabase.functions.invoke('master-sync', {
        body: {
          action: 'create_task',
          properties: {
            'Task name': { title: [{ text: { content: newTodo } }] },
            Status: { status: { name: 'Not started' } },
            ...(personFilter !== 'All' ? { '_person_name': personFilter } : {}),
          }
        }
      });
      if (error) throw error;
      setNewTodo('');
      // Quick re-sync to get the new task
      await handleSync();
    } catch (err) {
      alert('Failed to create task: ' + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  /* ── Filter & Analyze ── */
  const filteredTodos = useMemo(() => {
    let result = todos;

    // Person filter
    if (personFilter !== 'All') {
      result = result.filter(t => {
        const assignee = getAssignee(t);
        return assignee && assignee.toLowerCase() === personFilter.toLowerCase();
      });
    }

    // Status filter
    if (filter === 'Active') {
      // Default: exclude Done/Completed
      result = result.filter(t => {
        const s = t.status?.toLowerCase() || '';
        return s !== 'done' && s !== 'completed';
      });
    } else if (filter !== 'All') {
      result = result.filter(t => {
        const s = t.status?.toLowerCase() || '';
        if (filter === 'Not started') return !t.status || s === 'not started' || s === 'no status' || s === 'to do';
        if (filter === 'In progress') return s === 'in progress';
        if (filter === 'Waiting') return s === 'waiting on others';
        if (filter === 'Done') return s === 'done' || s === 'completed';
        return true;
      });
    }

    return result;
  }, [todos, filter, personFilter]);

  const analysis = useMemo(() => analyzeTaskList(todos), [todos]);

  const cardStyle = {
    background: 'var(--color-card)',
    backdropFilter: 'blur(16px)',
    borderRadius: '16px',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    boxShadow: 'var(--glass-shadow)',
  };

  if (loading && todos.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--color-dark-green)' }}>
        <Loader2 size={24} className="animate-spin" style={{ marginRight: '12px' }} />
        <p style={{ fontSize: '18px', fontWeight: '600' }}>Loading your To-Do list...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ═══ Header ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Notion To-Do List</h3>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Two-way sync active · {todos.length} items
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '10px',
              backgroundColor: syncing ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
              cursor: syncing ? 'wait' : 'pointer',
              fontSize: '13px', fontWeight: '600',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '10px',
              backgroundColor: showAnalysis ? 'var(--color-dark-green)' : 'rgba(255, 255, 255, 0.05)',
              color: showAnalysis ? '#0a0f18' : 'var(--color-text-primary)',
              border: `1px solid ${showAnalysis ? 'var(--color-dark-green)' : 'var(--color-border)'}`,
              cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              transition: 'all 0.2s',
            }}
          >
            <Sparkles size={14} />
            AI Analysis
            {showAnalysis ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ═══ Stats Bar ═══ */}
      {analysis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { label: 'Total Tasks', value: analysis.stats.total, color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.1)' },
            { label: 'Open', value: analysis.stats.open, color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.1)' },
            { label: 'Overdue', value: analysis.stats.overdue, color: '#f87171', bg: 'rgba(239, 68, 68, 0.1)' },
            { label: 'Completed', value: analysis.stats.done, color: '#34d399', bg: 'rgba(16, 185, 129, 0.1)' },
          ].map(s => (
            <div key={s.label} style={{
              ...cardStyle, padding: '16px 20px',
              borderLeft: `4px solid ${s.color}`,
              backgroundColor: s.bg,
            }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{s.label}</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-text-primary)', margin: '4px 0 0 0' }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══ AI Analysis Panel ═══ */}
      {showAnalysis && analysis && (
        <div style={{
          ...cardStyle, padding: '24px',
          background: 'linear-gradient(135deg, rgba(3, 218, 198, 0.1) 0%, rgba(0, 230, 118, 0.05) 100%)',
          border: '1px solid var(--color-border-glow)',
        }}>
          <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="var(--color-dark-green)" /> AI Task Analysis
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {/* AI Can Handle */}
            <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', padding: '16px', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Bot size={18} color="#818cf8" />
                <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#818cf8', margin: 0 }}>AI Can Handle</h5>
              </div>
              {analysis.aiCanHandle.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {analysis.aiCanHandle.slice(0, 5).map(t => (
                    <li key={t.id} style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{t.task_title}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>No automatable tasks detected. Try adding tasks with keywords like "send," "schedule," or "review."</p>
              )}
            </div>

            {/* Delegate */}
            <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', padding: '16px', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Users size={18} color="#38bdf8" />
                <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#38bdf8', margin: 0 }}>Delegate</h5>
              </div>
              {analysis.delegate.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {analysis.delegate.slice(0, 5).map(t => (
                    <li key={t.id} style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{t.task_title}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>No obvious delegation candidates found. Tasks with keywords like "research," "data entry," or "setup" would appear here.</p>
              )}
            </div>

            {/* Next Steps */}
            <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', padding: '16px', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Zap size={18} color="#fbbf24" />
                <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#fbbf24', margin: 0 }}>Next Steps</h5>
              </div>
              {analysis.nextSteps.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analysis.nextSteps.map((step, i) => (
                    <div key={i}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary)', margin: '0 0 4px 0' }}>{step.message}</p>
                      <ul style={{ margin: 0, paddingLeft: '18px' }}>
                        {step.items.map(t => (
                          <li key={t.id} style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                            {t.task_title}
                            {t.due_date && <span style={{ marginLeft: '6px', color: new Date(t.due_date) < new Date() ? '#f87171' : 'var(--color-text-muted)' }}>
                              ({new Date(t.due_date).toLocaleDateString()})
                            </span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>You're all caught up! No urgent next steps.</p>
              )}
            </div>

            {/* Suggestions */}
            <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', padding: '16px', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Lightbulb size={18} color="#34d399" />
                <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#34d399', margin: 0 }}>Suggestions</h5>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analysis.suggestions.map((s, i) => (
                  <p key={i} style={{ fontSize: '13px', color: 'var(--color-text-primary)', margin: 0, lineHeight: '1.5' }}>{s}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Add Task Input ═══ */}
      <form onSubmit={handleCreateTask} style={{
        ...cardStyle, display: 'flex', gap: '12px', padding: '20px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="What needs to be done? (Synced to Notion)"
            className="neo-input"
            style={{
              width: '100%',
            }}
          />
        </div>
        <button
          type="submit"
          disabled={isAdding || !newTodo.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', borderRadius: '10px',
            backgroundColor: 'var(--color-dark-green)', color: '#0a0f18',
            border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: '600',
            transition: 'all 0.2s',
            opacity: (isAdding || !newTodo.trim()) ? 0.7 : 1,
          }}
        >
          {isAdding ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
          Add to Notion
        </button>
      </form>

      {/* ═══ Person Filter + Status Filter ═══ */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Person Filter */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <User size={14} color="var(--color-text-secondary)" />
          {PERSON_OPTIONS.map(p => (
            <button
              key={p}
              onClick={() => setPersonFilter(p)}
              style={{
                padding: '6px 16px', borderRadius: '20px',
                backgroundColor: personFilter === p ? 'var(--color-dark-green)' : 'rgba(255,255,255,0.05)',
                color: personFilter === p ? '#0a0f18' : 'var(--color-text-secondary)',
                border: `1px solid ${personFilter === p ? 'var(--color-dark-green)' : 'var(--color-border)'}`,
                cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                transition: 'all 0.2s',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--color-border)' }} />

        {/* Status Filter */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Filter size={14} color="var(--color-text-secondary)" />
          {['Active', 'All', 'Not started', 'In progress', 'Waiting', 'Done'].map(f => {
            // Count based on person-filtered todos
            const personFiltered = personFilter === 'All' ? todos : todos.filter(t => {
              const assignee = getAssignee(t);
              return assignee && assignee.toLowerCase() === personFilter.toLowerCase();
            });
            const count = f === 'Active' ? personFiltered.filter(t => { const s = t.status?.toLowerCase() || ''; return s !== 'done' && s !== 'completed'; }).length :
              f === 'All' ? null :
                f === 'Not started' ? personFiltered.filter(t => { const s = t.status?.toLowerCase() || ''; return !t.status || s === 'not started' || s === 'no status' || s === 'to do'; }).length :
                  f === 'In progress' ? personFiltered.filter(t => t.status?.toLowerCase() === 'in progress').length :
                    f === 'Waiting' ? personFiltered.filter(t => t.status?.toLowerCase() === 'waiting on others').length :
                      personFiltered.filter(t => t.status?.toLowerCase() === 'done' || t.status?.toLowerCase() === 'completed').length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 16px', borderRadius: '20px',
                  backgroundColor: filter === f ? 'var(--color-dark-green)' : 'rgba(255,255,255,0.05)',
                  color: filter === f ? '#0a0f18' : 'var(--color-text-secondary)',
                  border: `1px solid ${filter === f ? 'var(--color-dark-green)' : 'var(--color-border)'}`,
                  cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                  transition: 'all 0.2s',
                }}
              >
                {f} {count !== null && `(${count})`}
              </button>);
          })}
        </div>
      </div>

      {/* ═══ Task List ═══ */}
      <div style={cardStyle}>
        {/* Header Row */}
        <div style={{
          padding: '16px 24px', backgroundColor: 'rgba(0,0,0,0.2)',
          borderBottom: '1px solid var(--color-border)',
          display: 'grid', gridTemplateColumns: '40px 1fr 110px 100px 130px 110px 100px 40px',
          fontWeight: '600', fontSize: '13px', color: 'var(--color-text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <div></div>
          <div>Task Name</div>
          <div>Priority</div>
          <div>Effort</div>
          <div>Status</div>
          <div>Due Date</div>
          <div>Person</div>
          <div></div>
        </div>

        {/* Task Rows */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredTodos.map((todo) => {
            const priorityStyle = getPriorityStyle(todo.priority);
            const effortLevel = getEffortLevel(todo);
            const effortStyle = getEffortStyle(effortLevel);
            const assignee = getAssignee(todo);
            const isEditing = editingId === todo.id;

            return (
              <div key={todo.id} style={{
                padding: '14px 24px', borderBottom: '1px solid var(--color-border)',
                display: 'grid', gridTemplateColumns: '40px 1fr 110px 100px 130px 110px 100px 40px',
                alignItems: 'center', fontSize: '14px',
                transition: 'background-color 0.15s',
                backgroundColor: todo.status?.toLowerCase() === 'done' ? 'rgba(0,0,0,0.1)' : 'transparent',
              }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = todo.status?.toLowerCase() === 'done' ? 'rgba(0,0,0,0.1)' : 'transparent'}
              >
                {/* Status Icon */}
                <div style={{ display: 'flex' }}>
                  {getStatusIcon(todo.status)}
                </div>

                {/* Task Title (editable) */}
                <div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleTitleSave(todo)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTitleSave(todo);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      style={{
                        width: '100%', padding: '4px 8px', borderRadius: '6px',
                        backgroundColor: 'rgba(255,255,255,0.1)', color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-dark-green)', fontSize: '14px', fontWeight: '500',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => { setEditingId(todo.id); setEditTitle(todo.task_title); }}
                      style={{
                        fontWeight: '500', cursor: 'text',
                        color: todo.status?.toLowerCase() === 'done' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                        textDecoration: todo.status?.toLowerCase() === 'done' ? 'line-through' : 'none',
                      }}
                      title="Click to edit"
                    >
                      {todo.task_title}
                    </span>
                  )}
                </div>

                {/* Priority */}
                <div>
                  {priorityStyle ? (
                    <span style={{
                      padding: '3px 10px', borderRadius: '12px',
                      fontSize: '11px', fontWeight: '700',
                      backgroundColor: priorityStyle.bg, color: priorityStyle.text,
                    }}>
                      {priorityStyle.icon} {todo.priority}
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </div>

                {/* Effort Level */}
                <div>
                  {effortStyle ? (
                    <span style={{
                      padding: '3px 8px', borderRadius: '12px',
                      fontSize: '10px', fontWeight: '700',
                      backgroundColor: effortStyle.bg, color: effortStyle.text,
                    }}>
                      {effortLevel}
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </div>

                {/* Status Badge (dropdown) */}
                <div>
                  <StatusDropdown todo={todo} onStatusChange={handleUpdateStatus} />
                </div>

                {/* Due Date */}
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                  {todo.due_date ? (
                    <span style={{
                      color: new Date(todo.due_date) < new Date() && todo.status?.toLowerCase() !== 'done'
                        ? '#f87171' : 'var(--color-text-secondary)',
                      fontWeight: new Date(todo.due_date) < new Date() && todo.status?.toLowerCase() !== 'done' ? '600' : '400',
                    }}>
                      {new Date(todo.due_date).toLocaleDateString()}
                    </span>
                  ) : '—'}
                </div>

                {/* Person */}
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {assignee || '—'}
                </div>

                {/* External Link */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <a href={todo.url} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--color-text-secondary)', transition: 'color 0.2s' }}
                    title="Open in Notion"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            );
          })}

          {filteredTodos.length === 0 && !loading && (
            <div style={{ padding: '64px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              <AlertCircle size={40} style={{ marginBottom: '16px', opacity: 0.3, margin: '0 auto' }} />
              <p style={{ fontSize: '16px', fontWeight: '500', marginTop: '16px' }}>
                {filter === 'All' && personFilter === 'All' ? 'Your Notion To-Do list is empty!' : `No tasks found for current filters.`}
              </p>
              {filter === 'All' && personFilter === 'All' && (
                <p style={{ marginTop: '4px' }}>Add a task above or click "Sync Now" to pull from Notion.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodosDashboard;
