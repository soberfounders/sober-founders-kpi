import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { CheckCircle2, Circle, Clock, AlertCircle, Plus, Loader2, ExternalLink } from 'lucide-react';

const TodosDashboard = () => {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTodo, setNewTodo] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchTodos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notion_todos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch error:', error);
      alert('Error fetching To-Dos: ' + error.message + '\nCheck console for details.');
    } else if (data) {
      setTodos(data);
      if (data.length === 0) {
        supabase.functions.invoke('sync-metrics', {
          method: 'GET',
          queryString: { trigger_refresh: 'true' }
        }).then(() => fetchTodos());
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTodos();
  }, []);

  const handleUpdateStatus = async (todo) => {
    const statusCycle = ['To Do', 'Doing', 'Done'];
    const currentStatus = todo.status || 'To Do';
    const currentIdx = statusCycle.indexOf(currentStatus) === -1 ? 0 : statusCycle.indexOf(currentStatus);
    const nextStatus = statusCycle[(currentIdx + 1) % statusCycle.length];

    // Optimistic update
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: nextStatus } : t));

    try {
      const { error } = await supabase.functions.invoke('sync-metrics', {
        method: 'PATCH',
        body: {
          pageId: todo.notion_page_id,
          properties: {
            Status: { status: { name: nextStatus } }
          }
        }
      });

      if (error) throw error;
      // Fetch again to sync the last_updated_at and other fields
      const { data: updatedData } = await supabase
        .from('notion_todos')
        .select('*')
        .eq('notion_page_id', todo.notion_page_id)
        .single();
      
      if (updatedData) {
        setTodos(prev => prev.map(t => t.notion_page_id === todo.notion_page_id ? updatedData : t));
      }
    } catch (err) {
      console.error('Update failed:', err);
      alert('Failed to update Notion: ' + err.message);
      fetchTodos(); // Revert to source of truth
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTodo.trim()) return;

    setIsAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-metrics', {
        method: 'POST',
        headers: { 'x-pathname': '/tasks' },
        body: {
          properties: {
            Name: { title: [{ text: { content: newTodo } }] },
            Status: { status: { name: 'To Do' } }
          }
        }
      });

      if (error) throw error;
      
      setNewTodo('');
      // Trigger a sync pull to get the new task into our DB
      await supabase.functions.invoke('sync-metrics', {
        method: 'GET',
        queryString: { trigger_refresh: 'true' }
      });
      fetchTodos();
    } catch (err) {
      alert('Failed to create task: ' + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'done':
      case 'completed':
        return <CheckCircle2 size={18} color="#10b981" />;
      case 'doing':
      case 'in progress':
        return <Clock size={18} color="#f1972c" />;
      default:
        return <Circle size={18} color="#94a3b8" />;
    }
  };

  if (loading && todos.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--color-dark-green)' }}>
        <p style={{ fontSize: '18px', fontWeight: '600' }}>Loading your To-Do list...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: '600' }}>Notion To-Do List</h3>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Status: LIVE TWO-WAY SYNC ACTIVE</p>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>{todos.length} items synced</p>
      </div>

      {/* Add Task Input */}
      <form onSubmit={handleCreateTask} style={{ 
        display: 'flex', 
        gap: '12px',
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '16px',
        border: '1px solid var(--color-border)',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input 
            type="text" 
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="What needs to be done? (Synced to Notion)" 
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              fontSize: '15px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
        </div>
        <button 
          type="submit"
          disabled={isAdding || !newTodo.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            borderRadius: '10px',
            backgroundColor: 'var(--color-dark-green)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '600',
            transition: 'all 0.2s',
            opacity: (isAdding || !newTodo.trim()) ? 0.7 : 1
          }}
        >
          {isAdding ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
          Add to Notion
        </button>
      </form>

      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '16px', 
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)'
      }}>
        <div style={{ 
          padding: '16px 24px', 
          backgroundColor: '#f8fafc', 
          borderBottom: '1px solid var(--color-border)',
          display: 'grid',
          gridTemplateColumns: '40px 1fr 120px 120px 40px',
          fontWeight: '600',
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          <div></div>
          <div>Task Name</div>
          <div>Status</div>
          <div>Due Date</div>
          <div></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {todos.map((todo) => (
            <div key={todo.id} style={{ 
              padding: '16px 24px', 
              borderBottom: '1px solid var(--color-border)',
              display: 'grid',
              gridTemplateColumns: '40px 1fr 120px 120px 40px',
              alignItems: 'center',
              fontSize: '14px',
              transition: 'background-color 0.2s',
              backgroundColor: todo.status?.toLowerCase() === 'done' ? '#fcfdfd' : 'transparent'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = todo.status?.toLowerCase() === 'done' ? '#fcfdfd' : 'transparent'}
            >
              <div 
                onClick={() => handleUpdateStatus(todo)}
                style={{ cursor: 'pointer', display: 'flex' }}
                title="Toggle Status"
              >
                {getStatusIcon(todo.status)}
              </div>
              <div style={{ 
                fontWeight: '500', 
                color: todo.status?.toLowerCase() === 'done' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                textDecoration: todo.status?.toLowerCase() === 'done' ? 'line-through' : 'none'
              }}>
                {todo.task_title}
              </div>
              <div>
                <span 
                  onClick={() => handleUpdateStatus(todo)}
                  style={{ 
                    padding: '4px 10px', 
                    borderRadius: '12px', 
                    fontSize: '11px', 
                    fontWeight: '700',
                    cursor: 'pointer',
                    backgroundColor: todo.status?.toLowerCase() === 'done' ? '#f0fdf4' : todo.status?.toLowerCase() === 'doing' ? '#fff7ed' : '#f1f5f9',
                    color: todo.status?.toLowerCase() === 'done' ? '#16a34a' : todo.status?.toLowerCase() === 'doing' ? '#c2410c' : '#64748b',
                    border: '1px solid rgba(0,0,0,0.05)'
                  }}
                  title="Click to cycle status"
                >
                  {todo.status || 'No Status'}
                </span>
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                {todo.due_date ? new Date(todo.due_date).toLocaleDateString() : '-'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <a 
                  href={todo.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ color: '#94a3b8', hover: { color: 'var(--color-dark-green)' } }}
                  title="Open in Notion"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            </div>
          ))}
          {todos.length === 0 && !loading && (
            <div style={{ padding: '64px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              <AlertCircle size={40} style={{ marginBottom: '16px', opacity: 0.3, margin: '0 auto' }} />
              <p style={{ fontSize: '16px', fontWeight: '500' }}>Your Notion To-Do list is empty!</p>
              <p style={{ marginTop: '4px' }}>Add a task above to see it sync to Notion.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodosDashboard;
