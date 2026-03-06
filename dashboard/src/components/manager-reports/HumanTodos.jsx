import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

function addDays(date, days) {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

export default function HumanTodos({ managerKey, todos = [], onNotify }) {
  const [addedMap, setAddedMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({});
  const list = useMemo(() => (todos || []).slice(0, 3), [todos]);

  useEffect(() => {
    let mounted = true;

    async function loadExisting() {
      if (!managerKey || list.length === 0) return;
      const todoIds = list.map((item) => item.todo_id).filter(Boolean);
      if (todoIds.length === 0) return;

      const { data, error } = await supabase
        .from('notion_tasks')
        .select('todo_id,status,notion_page_id')
        .eq('manager_key', managerKey)
        .in('todo_id', todoIds)
        .order('created_at', { ascending: false });

      if (error || !mounted) return;

      const nextMap = {};
      (data || []).forEach((row) => {
        if (!row?.todo_id) return;
        if (String(row?.status || '').toLowerCase() === 'created') {
          nextMap[row.todo_id] = {
            added: true,
            notionPageId: row?.notion_page_id || null,
          };
        }
      });
      setAddedMap(nextMap);
    }

    loadExisting();
    return () => {
      mounted = false;
    };
  }, [managerKey, list]);

  const addTodoToNotion = async (todo) => {
    const todoId = todo?.todo_id;
    if (!todoId) return;
    setLoadingMap((prev) => ({ ...prev, [todoId]: true }));

    const dueDate = Number.isFinite(Number(todo?.due_in_days))
      ? dateKey(addDays(new Date(), Number(todo.due_in_days)))
      : null;

    try {
      const { data, error } = await supabase.functions.invoke('notion-add-todo', {
        body: {
          manager_key: managerKey,
          todo_id: todo.todo_id,
          title: todo.title,
          description: todo.description,
          priority: todo.priority,
          due_date: dueDate,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'notion-add-todo failed');

      setAddedMap((prev) => ({
        ...prev,
        [todoId]: {
          added: true,
          notionPageId: data?.notion_page_id || null,
        },
      }));

      onNotify?.({
        type: 'success',
        message: data?.existing
          ? `${todo.title} already exists in Notion.`
          : `${todo.title} added to Notion.`,
      });
    } catch (err) {
      onNotify?.({ type: 'error', message: `${todo.title}: ${err?.message || 'Failed to add todo.'}` });
    } finally {
      setLoadingMap((prev) => ({ ...prev, [todoId]: false }));
    }
  };

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {list.map((todo) => {
        const todoId = todo.todo_id;
        const isAdded = !!addedMap[todoId]?.added;
        const isLoading = !!loadingMap[todoId];
        return (
          <div
            key={todoId}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              backgroundColor: '#fff',
              padding: '12px',
              display: 'grid',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{todo.title}</p>
                <p style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', lineHeight: 1.45 }}>{todo.description}</p>
                <p style={{ marginTop: '4px', fontSize: '12px', color: '#475569' }}>
                  Priority: {todo.priority || 'P1'}
                  {Number.isFinite(Number(todo?.due_in_days)) ? ` | Due in ${Number(todo.due_in_days)}d` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => addTodoToNotion(todo)}
                disabled={isAdded || isLoading}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '9px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: isAdded ? '#166534' : '#0f172a',
                  backgroundColor: isAdded ? '#dcfce7' : '#f8fafc',
                  cursor: (isAdded || isLoading) ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : (isAdded ? <Check size={14} /> : <Plus size={14} />)}
                {isAdded ? 'Added' : 'Add to Notion'}
              </button>
            </div>
          </div>
        );
      })}
      {list.length === 0 && (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: '10px', padding: '10px', color: '#64748b', fontSize: '12px' }}>
          No human to-dos available.
        </div>
      )}
    </div>
  );
}
