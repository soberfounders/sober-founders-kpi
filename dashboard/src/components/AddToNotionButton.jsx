import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Loader2, Check } from 'lucide-react';

/**
 * Reusable button to add a task to the Notion To-Do list.
 * 
 * Usage:
 *   <AddToNotionButton taskTitle="Follow up on Lead X" priority="High" onSuccess={() => {}} />
 *   <AddToNotionButton onSuccess={fn} />  // Opens a text input inline
 */
const AddToNotionButton = ({ taskTitle: propTitle, priority, onSuccess, variant = 'button', style: customStyle }) => {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [inlineTitle, setInlineTitle] = useState('');
    const [showInput, setShowInput] = useState(false);

    const handleAdd = async (title) => {
        const finalTitle = title || propTitle;
        if (!finalTitle?.trim()) return;

        setLoading(true);
        try {
            const properties = {
                'Task name': { title: [{ text: { content: finalTitle.trim() } }] },
                Status: { status: { name: 'Not started' } },
            };

            if (priority) {
                properties.Priority = { select: { name: priority } };
            }

            const { error } = await supabase.functions.invoke('master-sync', {
                body: { action: 'create_task', properties },
            });

            if (error) throw error;

            setDone(true);
            setInlineTitle('');
            setShowInput(false);
            setTimeout(() => setDone(false), 2000);
            onSuccess?.();
        } catch (err) {
            alert('Failed to add to Notion: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // If no propTitle, show an inline input mode
    if (!propTitle && variant !== 'icon') {
        return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', ...customStyle }}>
                {showInput ? (
                    <>
                        <input
                            type="text"
                            value={inlineTitle}
                            onChange={(e) => setInlineTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd(inlineTitle)}
                            placeholder="Task name..."
                            autoFocus
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                fontSize: '13px',
                                outline: 'none',
                                minWidth: '200px',
                            }}
                        />
                        <button
                            onClick={() => handleAdd(inlineTitle)}
                            disabled={loading || !inlineTitle.trim()}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '6px 14px', borderRadius: '8px',
                                backgroundColor: '#1a5632', color: 'white',
                                border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                                opacity: (loading || !inlineTitle.trim()) ? 0.6 : 1,
                            }}
                        >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Add
                        </button>
                        <button
                            onClick={() => { setShowInput(false); setInlineTitle(''); }}
                            style={{
                                padding: '6px 10px', borderRadius: '8px',
                                backgroundColor: '#f1f5f9', color: '#64748b',
                                border: 'none', cursor: 'pointer', fontSize: '12px',
                            }}
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => setShowInput(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 14px', borderRadius: '8px',
                            backgroundColor: '#f0fdf4', color: '#1a5632',
                            border: '1px solid #86efac', cursor: 'pointer',
                            fontSize: '13px', fontWeight: '600',
                            transition: 'all 0.2s',
                            ...customStyle,
                        }}
                    >
                        <Plus size={14} />
                        Add to To-Do's
                    </button>
                )}
            </div>
        );
    }

    // Pre-filled title — single click adds immediately
    return (
        <button
            onClick={() => handleAdd()}
            disabled={loading}
            title={`Add "${propTitle}" to Notion To-Do list`}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: variant === 'icon' ? '4px 8px' : '6px 14px',
                borderRadius: '8px',
                backgroundColor: done ? '#dcfce7' : '#f0fdf4',
                color: done ? '#16a34a' : '#1a5632',
                border: `1px solid ${done ? '#86efac' : '#bbf7d0'}`,
                cursor: loading ? 'wait' : 'pointer',
                fontSize: '13px', fontWeight: '600',
                transition: 'all 0.2s',
                opacity: loading ? 0.7 : 1,
                ...customStyle,
            }}
        >
            {loading ? (
                <Loader2 size={14} className="animate-spin" />
            ) : done ? (
                <Check size={14} />
            ) : (
                <Plus size={14} />
            )}
            {variant !== 'icon' && (done ? 'Added!' : 'Add to To-Do\'s')}
        </button>
    );
};

export default AddToNotionButton;
