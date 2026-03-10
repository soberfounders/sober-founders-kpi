import { describe, expect, it } from "vitest";
import { classifyIntent } from "../../src/ai/orchestrator.js";

describe("classifyIntent", () => {
  it("returns informational for standard KPI questions", () => {
    expect(classifyIntent("What changed this week in attendance?")).toBe("informational");
  });

  it("returns recommendation intent", () => {
    expect(classifyIntent("What should we do next to improve leads?")).toBe("recommendation");
  });

  it("returns action_task_creation intent", () => {
    expect(classifyIntent("Create a follow-up task for Andrew")).toBe("action_task_creation");
  });

  it("returns outbound_posting intent", () => {
    expect(classifyIntent("Post a weekly executive summary to Slack")).toBe("outbound_posting");
  });
});
