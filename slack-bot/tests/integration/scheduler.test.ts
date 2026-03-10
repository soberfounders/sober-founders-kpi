import { beforeEach, describe, expect, it, vi } from "vitest";

const sendSlackSummary = vi.fn(async () => ({ deduped: false, summary_id: "sum-1" }));
const logAuditEvent = vi.fn(async () => "audit-1");

const selectChain: any = {
  eq: vi.fn(() => selectChain),
  lte: vi.fn(() => selectChain),
  limit: vi.fn(async () => ({
    data: [
      {
        id: "pref-1",
        slack_user_id: "U1",
        channel_id: "C1",
        summary_type: "weekly_executive",
        schedule_interval_minutes: 60,
      },
    ],
    error: null,
  })),
};

const updateChain: any = {
  eq: vi.fn(async () => ({ error: null })),
};

const supabase = {
  from: vi.fn((table: string) => {
    if (table === "user_channel_preferences") {
      return {
        select: vi.fn(() => selectChain),
        update: vi.fn(() => updateChain),
      };
    }

    return {
      insert: vi.fn(async () => ({ data: { id: "audit-1" }, error: null })),
      update: vi.fn(() => updateChain),
      eq: vi.fn(() => updateChain),
    };
  }),
};

vi.mock("../../src/config/env.js", () => ({
  env: {
    schedulerEnabled: true,
    schedulerPollIntervalMs: 60000,
  },
}));

vi.mock("../../src/clients/supabase.js", () => ({
  supabase,
}));

vi.mock("../../src/actions/sendSlackSummary.js", () => ({
  sendSlackSummary,
}));

vi.mock("../../src/actions/logAuditEvent.js", () => ({
  logAuditEvent,
}));

vi.mock("../../src/observability/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("SummaryScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("polls due preferences and posts summaries", async () => {
    const { SummaryScheduler } = await import("../../src/slack/services/scheduler.js");
    const scheduler = new SummaryScheduler();

    await (scheduler as any).poll();

    expect(sendSlackSummary).toHaveBeenCalledTimes(1);
    expect(sendSlackSummary).toHaveBeenCalledWith("weekly_executive", "C1", undefined, "sched_pref-1");
    expect(logAuditEvent).toHaveBeenCalled();
  });
});
