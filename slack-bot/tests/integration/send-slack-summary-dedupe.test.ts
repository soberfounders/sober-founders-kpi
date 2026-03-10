import { beforeEach, describe, expect, it, vi } from "vitest";

let hasExistingSummary = true;

const selectChain: any = {
  eq: vi.fn(() => selectChain),
  contains: vi.fn(() => selectChain),
  limit: vi.fn(() => selectChain),
  maybeSingle: vi.fn(async () => {
    if (hasExistingSummary) {
      return {
        data: {
          id: "existing-summary",
          posted_message_ts: "123.456",
          created_at: "2026-03-10T00:00:00.000Z",
        },
        error: null,
      };
    }

    return { data: null, error: null };
  }),
};

const insertChain: any = {
  select: vi.fn(() => insertChain),
  single: vi.fn(async () => ({ data: { id: "new-summary" }, error: null })),
};

const supabase = {
  from: vi.fn((table: string) => {
    if (table !== "generated_summaries") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };
  }),
};

const buildSummary = vi.fn(async () => ({
  summaryType: "weekly_executive",
  window: "2026-03-01 to 2026-03-07",
  text: "Weekly summary",
  blocks: [{ type: "section", text: { type: "mrkdwn", text: "Weekly summary" } }],
  sourceMetrics: ["leads", "attendance"],
  confidence: 0.85,
}));

const postMessage = vi.fn(async () => ({
  ok: true,
  channel: "C1",
  ts: "111.222",
}));

vi.mock("../../src/clients/supabase.js", () => ({
  supabase,
}));

vi.mock("../../src/data/summaries.js", () => ({
  buildSummary,
}));

vi.mock("../../src/clients/slack.js", () => ({
  slackWeb: {
    chat: {
      postMessage,
    },
  },
}));

describe("sendSlackSummary dedupe behavior", () => {
  beforeEach(() => {
    hasExistingSummary = true;
    vi.clearAllMocks();
  });

  it("returns deduped result and skips posting when summary already exists", async () => {
    const { sendSlackSummary } = await import("../../src/actions/sendSlackSummary.js");
    const result = await sendSlackSummary("weekly_executive", "C1", { from: "2026-03-01", to: "2026-03-07" }, "trace-1");

    expect(result.deduped).toBe(true);
    expect(buildSummary).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("builds/posts/persists when dedupe match does not exist", async () => {
    hasExistingSummary = false;

    const { sendSlackSummary } = await import("../../src/actions/sendSlackSummary.js");
    const result = await sendSlackSummary("weekly_executive", "C1", { from: "2026-03-01", to: "2026-03-07" }, "trace-2");

    expect(result.deduped).toBe(false);
    expect(buildSummary).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(insertChain.single).toHaveBeenCalledTimes(1);
  });
});
