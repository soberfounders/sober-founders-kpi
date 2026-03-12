import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { X, Loader2, Check, Send } from 'lucide-react';

/**
 * Reusable modal for sending AI recommendations to Notion To-Do list.
 * 
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   defaultTaskName: string — pre-filled from the AI recommendation text
 *   onSuccess: () => void — optional callback after successful creation
 */

const PERSON_OPTIONS = ['Andrew Lassise', 'Kandace'];
const PRIORITY_OPTIONS = ['High Priority', 'Medium Priority', 'Low Priority'];
const EFFORT_OPTIONS = ['Easy Effort', 'Medium Effort', 'Hard Effort'];
const STATUS_OPTIONS = ['Not started', 'In progress', 'Waiting on Others', 'Done'];

const SendToNotionModal = ({ isOpen, onClose, defaultTaskName = '', onSuccess }) => {
    const [taskName, setTaskName] = useState(defaultTaskName);
    const [person, setPerson] = useState('Andrew Lassise');
    const [priority, setPriority] = useState('Medium Priority');
    const [effort, setEffort] = useState('Medium Effort');
    const [status, setStatus] = useState('Not started');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    // Reset form when modal opens with new default
    React.useEffect(() => {
        if (isOpen) {
            setTaskName(defaultTaskName);
            setPerson('Andrew Lassise');
            setPriority('Medium Priority');
            setEffort('Medium Effort');
            setStatus('Not started');
            setDone(false);
        }
    }, [isOpen, defaultTaskName]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!taskName.trim()) return;

        setLoading(true);
        try {
            const properties = {
                'Task name': { title: [{ text: { content: taskName.trim() } }] },
                'Status': { status: { name: status } },
                'Priority': { select: { name: priority } },
                'Effort level': { select: { name: effort } },
            };

            // Person field requires Notion user IDs — pass as metadata for backend lookup
            if (person) {
                properties['_person_name'] = person;
            }

            const { error } = await supabase.functions.invoke('master-sync', {
                body: { action: 'create_task', properties },
            });

            if (error) throw error;

            setDone(true);
            setTimeout(() => {
                onSuccess?.();
                onClose();
            }, 1200);
        } catch (err) {
            console.error('Failed to create Notion task:', err);
            alert('Failed to send to Notion: ' + (err.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    const labelStyle = {
        display: 'block',
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--color-text-secondary)',
        marginBottom: '6px',
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid var(--color-border)',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.2s',
        backgroundColor: 'var(--color-input-surface)',
        color: 'var(--color-text-primary)',
        boxSizing: 'border-box',
    };

    const selectStyle = {
        ...inputStyle,
        cursor: 'pointer',
        appearance: 'auto',
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'var(--color-overlay-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                backdropFilter: 'blur(4px)',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '480px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden',
                    animation: 'slideUp 0.2s ease-out',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--color-surface-elevated)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-primary)',
                            fontSize: '16px',
                            fontWeight: 800,
                        }}>
                            N
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                Send to Notion
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                Create a task in your To-Do list
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            color: 'var(--color-text-secondary)',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Task Name */}
                        <div>
                            <label style={labelStyle}>Task Name</label>
                            <textarea
                                value={taskName}
                                onChange={(e) => setTaskName(e.target.value)}
                                placeholder="What needs to be done?"
                                rows={2}
                                style={{
                                    ...inputStyle,
                                    resize: 'vertical',
                                    minHeight: '60px',
                                    fontFamily: 'inherit',
                                }}
                            />
                        </div>

                        {/* Two-column grid for selects */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {/* Person */}
                            <div>
                                <label style={labelStyle}>Person</label>
                                <select value={person} onChange={(e) => setPerson(e.target.value)} style={selectStyle}>
                                    {PERSON_OPTIONS.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Priority */}
                            <div>
                                <label style={labelStyle}>Priority</label>
                                <select value={priority} onChange={(e) => setPriority(e.target.value)} style={selectStyle}>
                                    {PRIORITY_OPTIONS.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Effort Level */}
                            <div>
                                <label style={labelStyle}>Effort Level</label>
                                <select value={effort} onChange={(e) => setEffort(e.target.value)} style={selectStyle}>
                                    {EFFORT_OPTIONS.map(e => (
                                        <option key={e} value={e}>{e}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Status */}
                            <div>
                                <label style={labelStyle}>Status</label>
                                <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
                                    {STATUS_OPTIONS.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading || !taskName.trim() || done}
                        style={{
                            marginTop: '20px',
                            width: '100%',
                            padding: '12px',
                            borderRadius: '10px',
                            border: 'none',
                            backgroundColor: done ? 'var(--color-success)' : 'var(--color-surface-elevated)',
                            color: 'var(--color-text-primary)',
                            fontSize: '14px',
                            fontWeight: 700,
                            cursor: loading || done ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            opacity: (!taskName.trim() && !loading) ? 0.5 : 1,
                        }}
                    >
                        {loading ? (
                            <><Loader2 size={16} className="animate-spin" /> Sending...</>
                        ) : done ? (
                            <><Check size={16} /> Sent to Notion!</>
                        ) : (
                            <><Send size={16} /> Send to Notion</>
                        )}
                    </button>
                </form>
            </div>

            <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
};

export default SendToNotionModal;
