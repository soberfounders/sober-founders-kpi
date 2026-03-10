import { describe, expect, it } from "vitest";
import { appendSourceFooter } from "../../src/slack/formatters/messages.js";

describe("Slack message formatter", () => {
  it("appends source metrics, window, and confidence", () => {
    const text = appendSourceFooter("Weekly summary", {
      confidence: 0.82,
      timeWindow: "2026-03-01 to 2026-03-07",
      sources: [
        { metric: "leads", window: "2026-03-01 to 2026-03-07" },
        { metric: "attendance", window: "2026-03-01 to 2026-03-07" },
      ],
    });

    expect(text).toContain("Window: 2026-03-01 to 2026-03-07");
    expect(text).toContain("Sources: leads (2026-03-01 to 2026-03-07)");
    expect(text).toContain("Confidence: 82%");
  });
});
