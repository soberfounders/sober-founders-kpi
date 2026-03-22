import React from 'react';
import AgentCard from './AgentCard';

export default function OfficeView({ agents, budgetMap, rejectionMap, onAgentClick }) {
  // Build tree: managers first (no manager_id), then their reports
  const managers = agents.filter((a) => !a.manager_id);
  const reports  = agents.filter((a) => a.manager_id);

  const tree = managers.map((mgr) => ({
    manager: mgr,
    specialists: reports.filter((r) => r.manager_id === mgr.id),
  }));

  // Orphans (agents with no manager and not a manager themselves)
  const orphans = agents.filter(
    (a) => a.manager_id && !managers.some((m) => m.id === a.manager_id),
  );

  return (
    <div className="agency-office-container">
      {tree.map(({ manager, specialists }) => (
        <div key={manager.id} className="agency-dept-group">
          {/* Manager card */}
          <div className="agency-manager-row">
            <AgentCard
              agent={manager}
              budgetInfo={budgetMap[manager.id]}
              rejectionInfo={rejectionMap[manager.id]}
              isManager
              onClick={() => onAgentClick(manager)}
            />
          </div>

          {/* Connector line */}
          {specialists.length > 0 && (
            <div className="agency-tree-connector">
              <div className="agency-tree-line-v" />
              <div className="agency-tree-line-h" />
            </div>
          )}

          {/* Specialist cards */}
          {specialists.length > 0 && (
            <div className="agency-specialists-row">
              {specialists.map((spec) => (
                <div key={spec.id} className="agency-specialist-slot">
                  <div className="agency-tree-branch" />
                  <AgentCard
                    agent={spec}
                    budgetInfo={budgetMap[spec.id]}
                    rejectionInfo={rejectionMap[spec.id]}
                    onClick={() => onAgentClick(spec)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {orphans.length > 0 && (
        <div className="agency-dept-group">
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>Unassigned</p>
          <div className="agency-specialists-row">
            {orphans.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                budgetInfo={budgetMap[a.id]}
                rejectionInfo={rejectionMap[a.id]}
                onClick={() => onAgentClick(a)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
