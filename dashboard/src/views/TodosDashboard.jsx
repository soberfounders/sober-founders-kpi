import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import AddToNotionButton from '../components/AddToNotionButton';
import {
  CheckCircle2, Circle, Clock, AlertCircle, Plus, Loader2, ExternalLink,
  RefreshCw, Filter, Sparkles, Bot, Users, Zap, Lightbulb, ChevronDown, ChevronUp
} from 'lucide-react';

/* ── Status helpers ── */
const STATUS_ORDER = ['Not started', 'In progress', 'Waiting on Others', 'Done'];
const STATUS_COLORS = {
  'not started': { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' },
  'in progress': { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd' },
  'waiting on others': { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  'done': { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  'completed': { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  'to do': { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' },
};
const PRIORITY_COLORS = {
  'high': { bg: '#fef2f2', text: '#dc2626', icon: '🔴' },
  'medium': { bg: '#fffbeb', text: '#d97706', icon: '🟡' },
  'low': { bg: '#f0fdf4', text: '#16a34a', icon: '🟢' },
};

const getStatusStyle = (status) => STATUS_COLORS[status?.toLowerCase()] || STATUS_COLORS['to do'];
const getPriorityStyle = (priority) => PRIORITY_COLORS[priority?.toLowerCase()] || null;

const getStatusIcon = (status) => {
  switch (status?.toLowerCase()) {
    case 'done': case 'completed': return <CheckCircle2 size={18} color="#10b981" />;
    case 'in progress': return <Clock size={18} color="#2563eb" />;
    case 'waiting on others': return <AlertCircle size={18} color="#f1972c" />;
    default: return <Circle size={18} color="#94a3b8" />;
  }
};

/* ── AI Analysis engine (rule-based) ── */
function analyzeTaskList(todos) {
  if (!todos || todos.length === 0) return null;

  const open = todos.filter(t => t.status?.toLowerCase() !== 'done' && t.status?.toLowerCase() !== 'completed');
  const overdue = open.filter(t => t.due_date && new Date(t.due_date) < new Date());
  const highPriority = open.filter(t => t.priority?.toLowerCase() === 'high');
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

/* ── Main Component ── */
const TodosDashboard = () => {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newTodo, setNewTodo] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [filter, setFilter] = useState('All');
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

  /* ── Update Status ── */
  const handleUpdateStatus = async (todo) => {
    const currentIdx = STATUS_ORDER.indexOf(todo.status) === -1 ? 0 : STATUS_ORDER.indexOf(todo.status);
    const nextStatus = STATUS_ORDER[(currentIdx + 1) % STATUS_ORDER.length];

    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: nextStatus } : t));

    try {
      const { error } = await supabase.functions.invoke('master-sync', {
        body: {
          action: 'update_task',
          pageId: todo.notion_page_id,
          properties: { 'Status': { status: { name: nextStatus } } }
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error('Update failed:', err);
      alert('Failed to update Notion: ' + err.message);
      fetchTodos();
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
            Status: { status: { name: 'Not started' } }
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
  const filteredTodos = filter === 'All' ? todos
    : todos.filter(t => {
      const s = t.status?.toLowerCase() || '';
      if (filter === 'Not started') return !t.status || s === 'not started' || s === 'no status' || s === 'to do';
      if (filter === 'In progress') return s === 'in progress';
      if (filter === 'Waiting') return s === 'waiting on others';
      if (filter === 'Done') return s === 'done' || s === 'completed';
      return true;
    });

  const analysis = useMemo(() => analyzeTaskList(todos), [todos]);

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '16px',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
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
              backgroundColor: syncing ? '#f1f5f9' : 'white',
              color: 'var(--color-dark-green)',
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
              backgroundColor: showAnalysis ? '#1a5632' : '#f0fdf4',
              color: showAnalysis ? 'white' : '#1a5632',
              border: `1px solid ${showAnalysis ? '#1a5632' : '#86efac'}`,
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
            { label: 'Total Tasks', value: analysis.stats.total, color: '#3b82f6', bg: '#eff6ff' },
            { label: 'Open', value: analysis.stats.open, color: '#f59e0b', bg: '#fffbeb' },
            { label: 'Overdue', value: analysis.stats.overdue, color: '#ef4444', bg: '#fef2f2' },
            { label: 'Completed', value: analysis.stats.done, color: '#10b981', bg: '#f0fdf4' },
          ].map(s => (
            <div key={s.label} style={{
              ...cardStyle, padding: '16px 20px',
              borderLeft: `4px solid ${s.color}`,
              backgroundColor: s.bg,
            }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{s.label}</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: '4px 0 0 0' }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══ AI Analysis Panel ═══ */}
      {showAnalysis && analysis && (
        <div style={{
          ...cardStyle, padding: '24px',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfeff 50%, #eff6ff 100%)',
          border: '1px solid #86efac',
        }}>
          <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="#1a5632" /> AI Task Analysis
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {/* AI Can Handle */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Bot size={18} color="#6366f1" />
                <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#4338ca', margin: 0 }}>AI Can Handle</h5>
              </div>
              {analysis.aiCanHandle.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {analysis.aiCanHandle.slice(0, 5).map(t => (
                    <li key={t.id} style={{ fontSize: '13px', color: '#334155' }}>{t.task_title}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>No automatable tasks detected. Try adding tasks with keywords like "send," "schedule," or "review."</p>
              )}
            </div>

            {/* Delegate */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Users size={18} color="#0ea5e9" />
                <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#0369a1', margin: 0 }}>Delegate</h5>
              </div>
              {analysis.delegate.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {analysis.delegate.slice(0, 5).map(t => (
                    <li key={t.id} style={{ fontSize: '13px', color: '#334155' }}>{t.task_title}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>No obvious delegation candidates found. Tasks with keywords like "research," "data entry," or "setup" would appear here.</p>
              )}
            </div>

            {/* Next Steps */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Zap size={18} color="#f59e0b" />
                <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#b45309', margin: 0 }}>Next Steps</h5>
              </div>
              {analysis.nextSteps.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analysis.nextSteps.map((step, i) => (
                    <div key={i}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{step.message}</p>
                      <ul style={{ margin: 0, paddingLeft: '18px' }}>
                        {step.items.map(t => (
                          <li key={t.id} style={{ fontSize: '12px', color: '#64748b' }}>
                            {t.task_title}
                            {t.due_date && <span style={{ marginLeft: '6px', color: new Date(t.due_date) < new Date() ? '#ef4444' : '#94a3b8' }}>
                              ({new Date(t.due_date).toLocaleDateString()})
                            </span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>You're all caught up! No urgent next steps.</p>
              )}
            </div>

            {/* Suggestions */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Lightbulb size={18} color="#10b981" />
                <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#047857', margin: 0 }}>Suggestions</h5>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analysis.suggestions.map((s, i) => (
                  <p key={i} style={{ fontSize: '13px', color: '#334155', margin: 0, lineHeight: '1.5' }}>{s}</p>
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
            style={{
              width: '100%', padding: '12px 16px', borderRadius: '10px',
              border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none',
              transition: 'border-color 0.2s',
            }}
          />
        </div>
        <button
          type="submit"
          disabled={isAdding || !newTodo.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', borderRadius: '10px',
            backgroundColor: 'var(--color-dark-green)', color: 'white',
            border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: '600',
            transition: 'all 0.2s',
            opacity: (isAdding || !newTodo.trim()) ? 0.7 : 1,
          }}
        >
          {isAdding ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
          Add to Notion
        </button>
      </form>

      {/* ═══ Filter Tabs ═══ */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Filter size={14} color="#94a3b8" />
        {['All', 'Not started', 'In progress', 'Waiting', 'Done'].map(f => {
          const count = f === 'All' ? null :
            f === 'Not started' ? todos.filter(t => { const s = t.status?.toLowerCase() || ''; return !t.status || s === 'not started' || s === 'no status' || s === 'to do'; }).length :
              f === 'In progress' ? todos.filter(t => t.status?.toLowerCase() === 'in progress').length :
                f === 'Waiting' ? todos.filter(t => t.status?.toLowerCase() === 'waiting on others').length :
                  todos.filter(t => t.status?.toLowerCase() === 'done' || t.status?.toLowerCase() === 'completed').length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 16px', borderRadius: '20px',
                backgroundColor: filter === f ? '#1a5632' : '#f8fafc',
                color: filter === f ? 'white' : '#64748b',
                border: `1px solid ${filter === f ? '#1a5632' : '#e2e8f0'}`,
                cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                transition: 'all 0.2s',
              }}
            >
              {f} {count !== null && `(${count})`}
            </button>);
        })}
      </div>

      {/* ═══ Task List ═══ */}
      <div style={cardStyle}>
        {/* Header Row */}
        <div style={{
          padding: '16px 24px', backgroundColor: '#f8fafc',
          borderBottom: '1px solid var(--color-border)',
          display: 'grid', gridTemplateColumns: '40px 1fr 100px 120px 120px 40px',
          fontWeight: '600', fontSize: '13px', color: 'var(--color-text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <div></div>
          <div>Task Name</div>
          <div>Priority</div>
          <div>Status</div>
          <div>Due Date</div>
          <div></div>
        </div>

        {/* Task Rows */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredTodos.map((todo) => {
            const statusStyle = getStatusStyle(todo.status);
            const priorityStyle = getPriorityStyle(todo.priority);
            const isEditing = editingId === todo.id;

            return (
              <div key={todo.id} style={{
                padding: '14px 24px', borderBottom: '1px solid var(--color-border)',
                display: 'grid', gridTemplateColumns: '40px 1fr 100px 120px 120px 40px',
                alignItems: 'center', fontSize: '14px',
                transition: 'background-color 0.15s',
                backgroundColor: todo.status?.toLowerCase() === 'done' ? '#fafbfc' : 'transparent',
              }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = todo.status?.toLowerCase() === 'done' ? '#fafbfc' : 'transparent'}
              >
                {/* Status Icon */}
                <div onClick={() => handleUpdateStatus(todo)} style={{ cursor: 'pointer', display: 'flex' }} title="Toggle Status">
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
                        border: '1px solid #3b82f6', fontSize: '14px', fontWeight: '500',
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
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>—</span>
                  )}
                </div>

                {/* Status Badge */}
                <div>
                  <span
                    onClick={() => handleUpdateStatus(todo)}
                    style={{
                      padding: '4px 10px', borderRadius: '12px',
                      fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                      backgroundColor: statusStyle.bg, color: statusStyle.text,
                      border: `1px solid ${statusStyle.border}`,
                    }}
                    title="Click to cycle status"
                  >
                    {todo.status || 'No Status'}
                  </span>
                </div>

                {/* Due Date */}
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                  {todo.due_date ? (
                    <span style={{
                      color: new Date(todo.due_date) < new Date() && todo.status?.toLowerCase() !== 'done'
                        ? '#ef4444' : 'var(--color-text-secondary)',
                      fontWeight: new Date(todo.due_date) < new Date() && todo.status?.toLowerCase() !== 'done' ? '600' : '400',
                    }}>
                      {new Date(todo.due_date).toLocaleDateString()}
                    </span>
                  ) : '—'}
                </div>

                {/* External Link */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <a href={todo.url} target="_blank" rel="noreferrer"
                    style={{ color: '#94a3b8', transition: 'color 0.2s' }}
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
                {filter === 'All' ? 'Your Notion To-Do list is empty!' : `No "${filter}" tasks found.`}
              </p>
              {filter === 'All' && (
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
