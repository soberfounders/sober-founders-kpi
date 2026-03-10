import type { App, SlackCommandMiddlewareArgs } from "@slack/bolt";
import { handlePromptRequest } from "../handlers/events.js";

export type KpiSubcommand = "ask" | "summary" | "tasks" | "followup";

export interface ParsedKpiCommand {
  subcommand: KpiSubcommand;
  query: string;
  summaryType?: string;
  from?: string;
  to?: string;
  owner?: string;
  team?: string;
  priority?: string;
  dueDate?: string;
  post?: boolean;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseKeyValueTokens = (tokens: string[]): { values: Record<string, string>; freeText: string[] } => {
  const values: Record<string, string> = {};
  const freeText: string[] = [];

  for (const token of tokens) {
    const idx = token.indexOf("=");
    if (idx > 0) {
      const key = token.slice(0, idx).trim().toLowerCase();
      const value = token.slice(idx + 1).trim();
      if (key && value) {
        values[key] = value;
        continue;
      }
    }
    freeText.push(token);
  }

  return { values, freeText };
};

export const parseKpiCommand = (rawText: string): ParsedKpiCommand => {
  const text = String(rawText || "").trim();
  if (!text) {
    return { subcommand: "summary", query: "daily_health" };
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  const requestedSubcommand = tokens[0].toLowerCase();

  const subcommand: KpiSubcommand = (["ask", "summary", "tasks", "followup"].includes(requestedSubcommand)
    ? requestedSubcommand
    : "ask") as KpiSubcommand;

  const args = requestedSubcommand === subcommand ? tokens.slice(1) : tokens;
  const { values, freeText } = parseKeyValueTokens(args);

  if (subcommand === "summary") {
    const summaryType = freeText.find((token) => !["post", "publish"].includes(token.toLowerCase())) || values.type || "daily_health";
    const from = values.from && DATE_KEY_RE.test(values.from) ? values.from : undefined;
    const to = values.to && DATE_KEY_RE.test(values.to) ? values.to : undefined;
    const post = freeText.some((token) => ["post", "publish"].includes(token.toLowerCase())) || values.post === "true";

    return {
      subcommand,
      query: summaryType,
      summaryType,
      from,
      to,
      post,
    };
  }

  if (subcommand === "tasks") {
    return {
      subcommand,
      query: freeText.join(" ").trim() || "open tasks",
      owner: values.owner,
      team: values.team,
      priority: values.priority,
    };
  }

  if (subcommand === "followup") {
    const dueDate = values.due && DATE_KEY_RE.test(values.due) ? values.due : undefined;
    return {
      subcommand,
      query: freeText.join(" ").trim(),
      owner: values.owner,
      dueDate,
    };
  }

  return {
    subcommand: "ask",
    query: args.join(" ").trim(),
  };
};

export const buildPromptFromCommand = (parsed: ParsedKpiCommand): string => {
  if (parsed.subcommand === "summary") {
    const fromTo = parsed.from || parsed.to ? ` from=${parsed.from || ""} to=${parsed.to || ""}` : "";
    if (parsed.post) {
      return `Post a ${parsed.summaryType || "daily_health"} summary to this channel${fromTo}. Include action items.`;
    }
    return `Generate a concise ${parsed.summaryType || "daily_health"} KPI summary${fromTo}. Include key risks and action items.`;
  }

  if (parsed.subcommand === "tasks") {
    const filters = [
      parsed.owner ? `owner=${parsed.owner}` : "",
      parsed.team ? `team=${parsed.team}` : "",
      parsed.priority ? `priority=${parsed.priority}` : "",
    ].filter(Boolean).join(" ");

    return `List open tasks ${filters}`.trim();
  }

  if (parsed.subcommand === "followup") {
    const owner = parsed.owner ? `owner=${parsed.owner}` : "";
    const due = parsed.dueDate ? `due=${parsed.dueDate}` : "";
    return `Create follow-up for: ${parsed.query}. ${owner} ${due}`.trim();
  }

  return parsed.query;
};

export const registerKpiCommand = (app: App): void => {
  app.command("/kpi", async ({ ack, command, respond }: SlackCommandMiddlewareArgs) => {
    await ack({
      response_type: "ephemeral",
      text: "Processing KPI request...",
    });

    const parsed = parseKpiCommand(command.text || "");
    const prompt = buildPromptFromCommand(parsed);

    await handlePromptRequest({
      prompt,
      actor: {
        userId: command.user_id,
        channelId: command.channel_id,
        teamId: command.team_id,
      },
      reply: async (payload) => {
        await respond({
          response_type: payload.ephemeral ? "ephemeral" : "in_channel",
          text: payload.text,
          blocks: payload.blocks as any,
          thread_ts: payload.threadTs,
        });
      },
      confirmationEphemeral: true,
    });
  });
};
