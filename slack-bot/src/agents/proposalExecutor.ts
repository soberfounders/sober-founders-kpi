/**
 * Executes approved proposals.
 * Most proposals are "advisory" - the agent records the decision and
 * schedules outcome measurement. Concrete actions (create task, post content)
 * can be wired in later.
 */

import { updateProposalStatus, upsertContext } from "./proposalStore.js";
import type { AgentProposal } from "./proposalStore.js";
import { logger } from "../observability/logger.js";

export interface ExecutionResult {
  success: boolean;
  summary: string;
}

export const executeProposal = async (proposal: AgentProposal): Promise<ExecutionResult> => {
  try {
    // Calculate measure_after based on measurement_window_days
    const measureAfter = new Date();
    measureAfter.setDate(measureAfter.getDate() + (proposal.measurement_window_days || 7));

    // Update status to completed and set measurement window
    await updateProposalStatus(proposal.id, "completed", {
      execution_result: {
        action: "advisory_approved",
        notes: `Approved. Will measure ${proposal.target_metric} in ${proposal.measurement_window_days || 7} days.`,
      },
      executed_at: new Date().toISOString(),
      measure_after: measureAfter.toISOString(),
    });

    // Store the decision as context for future proposals
    await upsertContext(
      proposal.agent_persona,
      "decision",
      `proposal_${proposal.id.slice(0, 8)}`,
      {
        proposal_id: proposal.id,
        title: proposal.title,
        target_metric: proposal.target_metric,
        expected_delta: proposal.expected_delta,
        approved_at: new Date().toISOString(),
      },
      `Approved: "${proposal.title}" targeting ${proposal.target_metric} with expected delta ${proposal.expected_delta}`,
    );

    logger.info(
      { proposalId: proposal.id, measureAfter: measureAfter.toISOString() },
      "Proposal executed and measurement scheduled",
    );

    return {
      success: true,
      summary: `Approved and tracking. I'll measure the impact on *${proposal.target_metric}* in ${proposal.measurement_window_days || 7} days and report back here.`,
    };
  } catch (err) {
    logger.error({ err, proposalId: proposal.id }, "Proposal execution failed");

    await updateProposalStatus(proposal.id, "approved", {
      execution_result: { error: String(err) },
    });

    return {
      success: false,
      summary: `Execution failed: ${String(err)}`,
    };
  }
};
