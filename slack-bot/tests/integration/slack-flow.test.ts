import { describe, expect, it, vi } from "vitest";

const orchestrateKpiPrompt = vi.fn();
const logConversationTurn = vi.fn(async () => undefined);

vi.mock("../../src/ai/orchestrator.js", () => ({ orchestrateKpiPrompt }));
vi.mock("../../src/slack/services/threading.js", async () => {
  const actual = await vi.importActual<any>("../../src/slack/services/threading.js");
  return {
    ...actual,
    logConversationTurn,
  };
});

describe("handlePromptRequest", () => {
  it("returns formatted threaded response", async () => {
    orchestrateKpiPrompt.mockResolvedValueOnce({
      text: "Leads up 10%",
      confidence: 0.8,
      sources: [{ metric: "leads", window: "2026-03-01 to 2026-03-07" }],
      timeWindow: "2026-03-01 to 2026-03-07",
      intentType: "informational",
    });

    const { handlePromptRequest } = await import("../../src/slack/handlers/events.js");
    const reply = vi.fn(async () => undefined);

    await handlePromptRequest({
      prompt: "What changed this week?",
      actor: {
        userId: "U1",
        channelId: "C1",
        threadTs: "123.45",
      },
      reply,
      confirmationEphemeral: false,
      traceId: "trace-flow",
    });

    expect(reply).toHaveBeenCalledTimes(1);
    const payload = (reply.mock.calls as unknown as any[][])[0]?.[0] as any;
    expect(payload).toBeDefined();
    expect(payload.threadTs).toBe("123.45");
    expect(payload.text).toContain("Leads up 10%");
    expect(payload.text).toContain("Window:");
    expect(logConversationTurn).toHaveBeenCalled();
  });

  it("returns confirmation blocks for high-impact actions", async () => {
    orchestrateKpiPrompt.mockResolvedValueOnce({
      text: "Approval required: post summary",
      confidence: 0.95,
      sources: [{ metric: "generated_summaries", window: "weekly_executive" }],
      timeWindow: "weekly_executive",
      intentType: "outbound_posting",
      requiresConfirmation: true,
      pendingActionId: "pending-1",
    });

    const { handlePromptRequest } = await import("../../src/slack/handlers/events.js");
    const reply = vi.fn(async () => undefined);

    await handlePromptRequest({
      prompt: "Post weekly executive summary",
      actor: {
        userId: "U1",
        channelId: "C1",
      },
      reply,
      confirmationEphemeral: true,
      traceId: "trace-confirm",
    });

    expect(reply).toHaveBeenCalledTimes(1);
    const payload = (reply.mock.calls as unknown as any[][])[0]?.[0] as any;
    expect(payload).toBeDefined();
    expect(payload.ephemeral).toBe(true);
    expect(Array.isArray(payload.blocks)).toBe(true);
  });
});
