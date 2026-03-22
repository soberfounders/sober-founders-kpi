import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import OfficeView from '../components/agency/OfficeView';
import ActionQueue from '../components/agency/ActionQueue';
import AgentDetailPanel from '../components/agency/AgentDetailPanel';
import { Building2, ListChecks, RefreshCw, Users, DollarSign, AlertTriangle } from 'lucide-react';

const TABS = [
  { key: 'queue',  label: 'Action Queue', icon: ListChecks },
  { key: 'office', label: 'Office View',  icon: Building2 },
];

function AgencyDashboard() {
  const [activeTab, setActiveTab] = useState('queue');
  const [agents, setAgents] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [budgetMap, setBudgetMap] = useState({});
  const [rejectionMap, setRejectionMap] = useState({});
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  // ── Fetch all agency data ──
  const fetchData = useCallback(async () => {
    if (!hasSupabaseConfig) return;

    const [agenciesRes, agentsRes, tasksRes, budgetRes, rejectionRes] = await Promise.all([
      supabase.from('agencies').select('*'),
      supabase.from('agents').select('*'),
      supabase.from('agent_tasks').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('vw_agent_budget_status').select('*'),
      supabase.from('vw_agent_rejection_rate').select('*'),
    ]);

    if (agenciesRes.data) setAgencies(agenciesRes.data);
    if (agentsRes.data) setAgents(agentsRes.data);
    if (tasksRes.data) setTasks(tasksRes.data);

    if (budgetRes.data) {
      const map = {};
      budgetRes.data.forEach((b) => { map[b.agent_id] = b; });
      setBudgetMap(map);
    }
    if (rejectionRes.data) {
      const map = {};
      rejectionRes.data.forEach((r) => { map[r.agent_id] = r; });
      setRejectionMap(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchData();
  }, [fetchData]);

  // ── Supabase Realtime: agent status changes ──
  useEffect(() => {
    if (!hasSupabaseConfig) return;

    const agentChannel = supabase
      .channel('agency-agents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, (payload) => {
        setAgents((prev) => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new];
          if (payload.eventType === 'UPDATE') return prev.map((a) => a.id === payload.new.id ? payload.new : a);
          if (payload.eventType === 'DELETE') return prev.filter((a) => a.id !== payload.old.id);
          return prev;
        });
      })
      .subscribe();

    const taskChannel = supabase
      .channel('agency-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_tasks' }, (payload) => {
        setTasks((prev) => {
          if (payload.eventType === 'INSERT') return [payload.new, ...prev];
          if (payload.eventType === 'UPDATE') return prev.map((t) => t.id === payload.new.id ? payload.new : t);
          if (payload.eventType === 'DELETE') return prev.filter((t) => t.id !== payload.old.id);
          return prev;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(agentChannel);
      supabase.removeChannel(taskChannel);
    };
  }, []);

  // ── Task actions ──
  const handleApprove = useCallback(async (taskId, feedback) => {
    await supabase.from('agent_tasks').update({
      status: 'approved',
      feedback_text: feedback || null,
      resolved_at: new Date().toISOString(),
    }).eq('id', taskId);
    fetchData();
  }, [fetchData]);

  const handleReject = useCallback(async (taskId, feedback) => {
    // Update task
    await supabase.from('agent_tasks').update({
      status: 'rejected',
      feedback_text: feedback || null,
      resolved_at: new Date().toISOString(),
    }).eq('id', taskId);

    // Save feedback to agent_memory for the learning loop
    const task = tasks.find((t) => t.id === taskId);
    if (task && feedback) {
      await supabase.from('agent_memory').insert({
        agent_id: task.agent_id,
        task_id: taskId,
        feedback_summary: `REJECTED: ${task.title}. Feedback: ${feedback}`,
      });
    }

    fetchData();
  }, [fetchData, tasks]);

  // ── Derived data ──
  const agentsById = {};
  agents.forEach((a) => { agentsById[a.id] = a; });

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const totalSpent = Object.values(budgetMap).reduce((sum, b) => sum + Number(b.spent_24h_cents || 0), 0);
  const alertCount = Object.values(rejectionMap).filter((r) => r.recommend_pause).length;

  if (loading) {
    return (
      <div className="glass-panel page-transition-enter" style={{ padding: '32px', maxWidth: '760px', margin: '0 auto' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Loading agency data...</p>
      </div>
    );
  }

  return (
    <div className="page-transition-enter" style={{ maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--color-dark-green)', fontWeight: 600, letterSpacing: '0.05em' }}>
            Autonomous Agency
          </p>
          <h2 style={{ fontSize: '28px', color: 'var(--color-text-primary)', marginTop: '4px' }}>
            {agencies[0]?.department_name || 'Agency'} Command Center
          </h2>
        </div>
        <button type="button" className="btn-glass" onClick={() => { fetchedRef.current = false; setLoading(true); fetchData(); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="agency-summary-row">
        <div className="agency-summary-card">
          <Users size={18} style={{ color: 'var(--color-dark-green)' }} />
          <div>
            <p className="agency-summary-value">{agents.length}</p>
            <p className="agency-summary-label">Agents</p>
          </div>
        </div>
        <div className="agency-summary-card">
          <ListChecks size={18} style={{ color: 'var(--color-warning)' }} />
          <div>
            <p className="agency-summary-value">{pendingCount}</p>
            <p className="agency-summary-label">Pending Review</p>
          </div>
        </div>
        <div className="agency-summary-card">
          <DollarSign size={18} style={{ color: 'var(--color-light-green)' }} />
          <div>
            <p className="agency-summary-value">${(totalSpent / 100).toFixed(2)}</p>
            <p className="agency-summary-label">Spent (24h)</p>
          </div>
        </div>
        {alertCount > 0 && (
          <div className="agency-summary-card" style={{ borderColor: 'var(--color-danger-border)' }}>
            <AlertTriangle size={18} style={{ color: 'var(--color-danger)' }} />
            <div>
              <p className="agency-summary-value" style={{ color: 'var(--color-danger)' }}>{alertCount}</p>
              <p className="agency-summary-label">Needs Attention</p>
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="agency-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`agency-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'queue' && (
        <ActionQueue
          tasks={tasks}
          agentsById={agentsById}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {activeTab === 'office' && (
        <OfficeView
          agents={agents}
          budgetMap={budgetMap}
          rejectionMap={rejectionMap}
          onAgentClick={setSelectedAgent}
        />
      )}

      {/* Agent detail panel */}
      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          budgetInfo={budgetMap[selectedAgent.id]}
          rejectionInfo={rejectionMap[selectedAgent.id]}
          onClose={() => setSelectedAgent(null)}
          onRefresh={() => { fetchData(); setSelectedAgent(null); }}
        />
      )}
    </div>
  );
}

export default AgencyDashboard;
