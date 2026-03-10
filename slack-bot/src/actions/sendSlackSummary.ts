import { slackWeb } from "../clients/slack.js";
import { supabase } from "../clients/supabase.js";
import type { DateRangeInput } from "../types.js";
import { buildSummary } from "../data/summaries.js";
import { normalizeDateRange } from "../data/trends.js";

export const sendSlackMessage = async (channel: string, text: string, blocks?: Array<Record<string, unknown>>) => {
  const response = await slackWeb.chat.postMessage({
    channel,
    text,
    blocks: blocks as any,
  });

  return {
    ok: Boolean(response.ok),
    channel: String(response.channel || channel),
    ts: String(response.ts || ""),
  };
};

export const sendSlackSummary = async (
  summaryType: string,
  channel: string,
  dateRange: DateRangeInput | undefined,
  traceId: string,
) => {
  const range = normalizeDateRange(dateRange, 7);

  const { data: existing } = await supabase
    .from("generated_summaries")
    .select("id,posted_message_ts,created_at")
    .eq("summary_type", summaryType)
    .eq("channel_id", channel)
    .contains("date_range", { from: range.from, to: range.to })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      deduped: true,
      summary_id: String(existing.id),
      posted_message_ts: String(existing.posted_message_ts || ""),
      created_at: String(existing.created_at || ""),
    };
  }

  const summary = await buildSummary(summaryType, range);
  const postResult = await sendSlackMessage(channel, summary.text, summary.blocks);

  const { data, error } = await supabase
    .from("generated_summaries")
    .insert({
      summary_type: summaryType,
      channel_id: channel,
      date_range: {
        from: range.from,
        to: range.to,
      },
      summary_text: summary.text,
      summary_blocks: summary.blocks,
      source_metrics: summary.sourceMetrics,
      confidence: summary.confidence,
      posted_message_ts: postResult.ts || null,
      generated_by: "slack_bot",
      metadata: {
        trace_id: traceId,
      },
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to persist generated summary: ${error.message}`);
  }

  return {
    deduped: false,
    summary_id: String(data.id),
    posted_message_ts: postResult.ts,
    source_metrics: summary.sourceMetrics,
    confidence: summary.confidence,
  };
};
