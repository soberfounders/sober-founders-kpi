import { describe, expect, it } from "vitest";
import { buildPromptFromCommand, parseKpiCommand } from "../../src/slack/commands/kpi.js";

describe("parseKpiCommand", () => {
  it("parses ask subcommand", () => {
    const parsed = parseKpiCommand("ask What changed this week?");
    expect(parsed.subcommand).toBe("ask");
    expect(parsed.query).toBe("What changed this week?");
  });

  it("parses summary with post and date range", () => {
    const parsed = parseKpiCommand("summary weekly_executive post from=2026-03-01 to=2026-03-07");
    expect(parsed.subcommand).toBe("summary");
    expect(parsed.summaryType).toBe("weekly_executive");
    expect(parsed.post).toBe(true);
    expect(parsed.from).toBe("2026-03-01");
    expect(parsed.to).toBe("2026-03-07");
  });

  it("parses tasks filters", () => {
    const parsed = parseKpiCommand("tasks owner=Andrew team=ops priority=High Priority");
    expect(parsed.subcommand).toBe("tasks");
    expect(parsed.owner).toBe("Andrew");
    expect(parsed.team).toBe("ops");
    expect(parsed.priority).toBe("High");
  });

  it("parses followup owner and due date", () => {
    const parsed = parseKpiCommand("followup attendance drop owner=Andrew due=2026-03-14");
    expect(parsed.subcommand).toBe("followup");
    expect(parsed.query).toBe("attendance drop");
    expect(parsed.owner).toBe("Andrew");
    expect(parsed.dueDate).toBe("2026-03-14");
  });
});

describe("buildPromptFromCommand", () => {
  it("builds posting prompt for summary post", () => {
    const prompt = buildPromptFromCommand({
      subcommand: "summary",
      query: "weekly_executive",
      summaryType: "weekly_executive",
      post: true,
    });

    expect(prompt.toLowerCase()).toContain("post");
    expect(prompt).toContain("weekly_executive");
  });
});
