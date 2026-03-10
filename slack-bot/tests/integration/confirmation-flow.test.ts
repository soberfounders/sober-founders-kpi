import { describe, expect, it, vi } from "vitest";
import { createToolRuntime } from "../../src/ai/tools.js";
import type { PendingConfirmation } from "../../src/types.js";

const pending: PendingConfirmation = {
  id: "pending-x",
  actorUserId: "U1",
  channelId: "C1",
  actionType: "post_summary",
  toolName: "post_summary",
  input: {
    summary_type: "weekly_executive",
    channel: "C1",
  },
  traceId: "trace-pending",
  createdAt: new Date("2026-03-10T00:00:00.000Z"),
  expiresAt: new Date("2026-03-10T00:20:00.000Z"),
};

const baseDeps = {
  getKpiSnapshot: vi.fn(async () => ({})),
  getMetricTrend: vi.fn(async () => ({})),
  getManagerReport: vi.fn(async () => ({})),
  listOpenTasks: vi.fn(async () => []),
  createTask: vi.fn(async () => ({})),
  createFollowup: vi.fn(async () => ({})),
  sendSlackMessage: vi.fn(async () => ({ ok: true })),
  postSummary: vi.fn(async () => ({ deduped: false, summary_id: "sum-1" })),
  getDataQualityWarnings: vi.fn(async () => []),
  getOrgContext: vi.fn(async () => ({ dashboardUrl: "x", timezone: "America/New_York", executiveChannels: [], capabilities: [] })),
  logAuditEvent: vi.fn(async () => "audit"),
  canCreateTask: vi.fn(async () => true),
  canCreateFollowup: vi.fn(async () => true),
  canPostToChannel: vi.fn(async () => true),
  isHighImpactAction: vi.fn(async () => true),
  createPendingConfirmation: vi.fn((payload) => ({ ...payload, ...pending })),
  getPendingConfirmation: vi.fn(() => pending),
  consumePendingConfirmation: vi.fn(() => pending),
};

describe("confirmation flow", () => {
  it("blocks approval when approver differs from requester", async () => {
    const runtime = createToolRuntime(baseDeps as any);
    const result = await runtime.approvePendingAction("pending-x", "U2", "C1");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Only the requesting user");
  });

  it("executes after valid approval", async () => {
    const runtime = createToolRuntime({
      ...baseDeps,
      consumePendingConfirmation: vi.fn(() => pending),
    } as any);

    const result = await runtime.approvePendingAction("pending-x", "U1", "C1");
    expect(result.ok).toBe(true);
    expect(result.execution?.ok).toBe(true);
    expect(baseDeps.postSummary).toHaveBeenCalled();
  });
});
