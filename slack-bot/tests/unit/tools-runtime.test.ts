import { describe, expect, it, vi } from "vitest";
import { createToolRuntime, isToolName } from "../../src/ai/tools.js";
import type { PendingConfirmation, ToolExecutionContext } from "../../src/types.js";

const baseContext: ToolExecutionContext = {
  traceId: "trace-1",
  actor: {
    userId: "U123",
    channelId: "C123",
  },
};

const buildPending = (id: string): PendingConfirmation => ({
  id,
  actorUserId: "U123",
  channelId: "C123",
  actionType: "post_summary",
  toolName: "post_summary",
  input: {
    summary_type: "weekly_executive",
    channel: "C123",
  },
  createdAt: new Date("2026-03-10T00:00:00.000Z"),
  expiresAt: new Date("2026-03-10T00:15:00.000Z"),
  traceId: "trace-1",
});

const makeDeps = () => {
  const logAuditEvent = vi.fn(async () => "audit-1");
  return {
    getKpiSnapshot: vi.fn(async () => ({
      metric: "leads",
      value: 12,
      window: "2026-03-01 to 2026-03-07",
      source: "kpi_metrics",
      confidence: 0.9,
      notes: [],
    })),
    getMetricTrend: vi.fn(async () => ({
      metric: "leads",
      current: 12,
      previous: 10,
      delta: 2,
      delta_pct: 0.2,
      window: "2026-03-01 to 2026-03-07",
      compare_to: "previous_period",
      source: "kpi_metrics",
      confidence: 0.9,
      notes: [],
    })),
    getManagerReport: vi.fn(async () => ({
      section: "operations",
      window: "2026-03-01 to 2026-03-07",
      summary: "ok",
      bullets: ["one"],
      source: "vw_kpi_trend",
      confidence: 0.8,
    })),
    listOpenTasks: vi.fn(async () => []),
    createTask: vi.fn(async () => ({ id: "task-1", title: "x", owner: "Andrew", priority: "High Priority" })),
    createFollowup: vi.fn(async () => ({ id: "followup-1", topic: "t", owner: "Andrew", due_date: "2026-03-12", status: "open" })),
    sendSlackMessage: vi.fn(async () => ({ ok: true, channel: "C123", ts: "1.1" })),
    postSummary: vi.fn(async () => ({ deduped: false, summary_id: "sum-1", confidence: 0.8 })),
    getDataQualityWarnings: vi.fn(async () => ["none"]),
    getOrgContext: vi.fn(async () => ({
      dashboardUrl: "https://example.com",
      timezone: "America/New_York",
      executiveChannels: [],
      capabilities: [],
    })),
    logAuditEvent,
    canCreateTask: vi.fn(async () => true),
    canCreateFollowup: vi.fn(async () => true),
    canPostToChannel: vi.fn(async () => true),
    isHighImpactAction: vi.fn(async () => false),
    createPendingConfirmation: vi.fn((payload) => ({
      ...payload,
      id: "pending-1",
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      expiresAt: new Date("2026-03-10T00:15:00.000Z"),
    })),
    getPendingConfirmation: vi.fn(() => buildPending("pending-1")),
    consumePendingConfirmation: vi.fn(() => null),
  };
};

describe("tool runtime validation and permissions", () => {
  it("rejects invalid tool args", async () => {
    const deps = makeDeps();
    const runtime = createToolRuntime(deps as any);

    const result = await runtime.execute("get_kpi_snapshot", { metric: "" }, baseContext);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid arguments");
  });

  it("enforces permission check for create_task", async () => {
    const deps = makeDeps();
    deps.canCreateTask = vi.fn(async () => false);
    const runtime = createToolRuntime(deps as any);

    const result = await runtime.execute("create_task", {
      title: "Task",
      description: "Desc",
      owner: "Andrew",
      priority: "High Priority",
      due_date: "2026-03-12",
      source: "slack",
    }, baseContext);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Permission denied");
    expect(deps.logAuditEvent).toHaveBeenCalled();
  });

  it("requires confirmation for post_summary", async () => {
    const deps = makeDeps();
    const runtime = createToolRuntime(deps as any);

    const result = await runtime.execute("post_summary", {
      summary_type: "weekly_executive",
      channel: "C123",
    }, baseContext);

    expect(result.ok).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.pendingActionId).toBe("pending-1");
  });

  it("denies post_summary when channel permission is missing", async () => {
    const deps = makeDeps();
    deps.canPostToChannel = vi.fn(async () => false);
    const runtime = createToolRuntime(deps as any);

    const result = await runtime.execute("post_summary", {
      summary_type: "weekly_executive",
      channel: "C999",
    }, baseContext);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Permission denied");
  });

  it("approves and executes pending action", async () => {
    const deps = makeDeps();
    const runtime = createToolRuntime({
      ...deps,
      consumePendingConfirmation: vi.fn(() => buildPending("pending-approve")),
    } as any);

    const outcome = await runtime.approvePendingAction("pending-approve", "U123", "C123");
    expect(outcome.ok).toBe(true);
    expect(outcome.execution?.ok).toBe(true);
  });
});

describe("allowlist", () => {
  it("detects allowlisted tool names", () => {
    expect(isToolName("get_kpi_snapshot")).toBe(true);
    expect(isToolName("drop_database" as any)).toBe(false);
  });
});
