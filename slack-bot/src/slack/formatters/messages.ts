import type { SlackResponseEnvelope } from "../../types.js";

export const appendSourceFooter = (text: string, envelope: Pick<SlackResponseEnvelope, "sources" | "timeWindow" | "confidence">): string => {
  const sourceBits = envelope.sources.slice(0, 4).map((source) => `${source.metric} (${source.window})`);
  const sourceLine = sourceBits.length ? `Sources: ${sourceBits.join(", ")}` : "Sources: limited";
  const confidenceLine = `Confidence: ${(envelope.confidence * 100).toFixed(0)}%`;
  const windowLine = `Window: ${envelope.timeWindow}`;
  return `${text}\n\n_${windowLine} · ${sourceLine} · ${confidenceLine}_`;
};

export const formatSlackEnvelope = (envelope: SlackResponseEnvelope) => ({
  text: appendSourceFooter(envelope.text, envelope),
  blocks: envelope.blocks,
});
