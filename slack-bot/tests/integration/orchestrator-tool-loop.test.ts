import { describe, expect, it, vi } from "vitest";
import { createKpiOrchestrator } from "../../src/ai/orchestrator.js";
import type { ToolExecutionResult } from "../../src/ai/tools.js";

describe("orchestrator tool loop", () => {
  it("executes tool calls and returns normalized JSON envelope", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({
        id: "resp-1",
        output: [
          {
            type: "function_call",
            call_id: "call-1",
            name: "get_kpi_snapshot",
            arguments: JSON.stringify({ metric: "leads" }),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "resp-2",
        output_text: JSON.stringify({
          text: "Leads are up 20% WoW.",
          confidence: 0.8,
          sources: [{ metric: "leads", window: "2026-03-01 to 2026-03-07" }],
          timeWindow: "2026-03-01 to 2026-03-07",
          intentType: "informational",
        }),
      });

    const execute = vi.fn(async (): Promise<ToolExecutionResult> => ({
      ok: true,
      toolName: "get_kpi_snapshot",
      intentType: "informational",
      result: { metric: "leads", value: 120 },
      confidence: 0.8,
      sources: [{ metric: "leads", window: "2026-03-01 to 2026-03-07", confidence: 0.8 }],
      timeWindow: "2026-03-01 to 2026-03-07",
    }));

    const orchestrator = createKpiOrchestrator({
      model: "gpt-test",
      responseClient: { create },
      toolRuntime: {
        execute,
        approvePendingAction: vi.fn(),
        denyPendingAction: vi.fn(),
      } as any,
      getOrgContext: vi.fn(async () => ({
        dashboardUrl: "https://example.com",
        timezone: "America/New_York",
        executiveChannels: [],
        capabilities: ["kpi_snapshots"],
      })),
    });

    const envelope = await orchestrator.run({
      prompt: "What changed this week?",
      context: {
        traceId: "trace-orch",
        actor: {
          userId: "U1",
          channelId: "C1",
        },
      },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(envelope.text).toContain("Leads are up 20% WoW.");
    expect(envelope.sources[0].metric).toBe("leads");
    expect(envelope.timeWindow).toBe("2026-03-01 to 2026-03-07");
  });
});
