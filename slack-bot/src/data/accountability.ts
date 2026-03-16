import { supabase } from "../clients/supabase.js";
import { logger } from "../observability/logger.js";

/**
 * Returns how many consecutive days Andrew has NOT responded to any check-in.
 * Uses daily_manager_checkin_noon (the first slot of each day) as the anchor.
 * A "response" = any inbound slack_conversations row from targetUserId
 * after that day's noon check-in was created.
 * Checks up to 7 days back. Returns 0 if he responded to the last check-in.
 */
export const getMissedCheckinStreak = async (targetUserId: string): Promise<number> => {
  // Load up to 7 most recent noon check-ins (first slot of each day), ordered newest first
  const { data: summaries, error: summErr } = await supabase
    .from("generated_summaries")
    .select("id,created_at")
    .eq("summary_type", "daily_manager_checkin_noon")
    .order("created_at", { ascending: false })
    .limit(7);

  if (summErr) {
    logger.error({ err: summErr }, "getMissedCheckinStreak: failed to load generated_summaries");
    return 0;
  }

  const checkins = (summaries || []) as Array<{ id: string; created_at: string }>;
  if (!checkins.length) return 0;

  let streak = 0;

  for (const checkin of checkins) {
    // Look for any inbound message from targetUserId after this checkin was created
    const { data: responses, error: respErr } = await supabase
      .from("slack_conversations")
      .select("message_ts")
      .eq("actor_user_id", targetUserId)
      .eq("direction", "inbound")
      .gt("created_at", checkin.created_at)
      .limit(1);

    if (respErr) {
      logger.error({ err: respErr }, "getMissedCheckinStreak: failed to query slack_conversations");
      break;
    }

    if ((responses || []).length > 0) {
      // He responded to this checkin — streak ends here
      break;
    }

    streak += 1;
  }

  return streak;
};

/**
 * Store the morning briefing in generated_summaries (dedup by date + type).
 * Returns { alreadySent: boolean, summaryId: string }
 */
export const storeMorningBriefing = async (
  channelId: string,
  text: string,
  tasks: Array<{ id: string; title: string; priority: string }>,
  todayKey: string, // YYYY-MM-DD
): Promise<{ alreadySent: boolean; summaryId: string }> => {
  // Check for existing record for today
  const { data: existing, error: checkErr } = await supabase
    .from("generated_summaries")
    .select("id")
    .eq("summary_type", "daily_manager_briefing")
    .eq("channel_id", channelId)
    .gte("created_at", `${todayKey}T00:00:00.000Z`)
    .lte("created_at", `${todayKey}T23:59:59.999Z`)
    .limit(1);

  if (checkErr) {
    logger.error({ err: checkErr }, "storeMorningBriefing: failed to check for existing summary");
  }

  if ((existing || []).length > 0) {
    const existingId = String((existing as Array<{ id: string }>)[0].id);
    logger.info({ summaryId: existingId, todayKey }, "storeMorningBriefing: already sent today, skipping");
    return { alreadySent: true, summaryId: existingId };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("generated_summaries")
    .insert({
      summary_type: "daily_manager_briefing",
      channel_id: channelId,
      date_range: { from: todayKey, to: todayKey, label: todayKey },
      summary_text: text,
      metadata: { tasks },
      confidence: 0.9,
      generated_by: "daily_manager_scheduler",
    })
    .select("id")
    .single();

  if (insertErr) {
    throw new Error(`storeMorningBriefing: failed to insert summary: ${insertErr.message}`);
  }

  const summaryId = String((inserted as { id: string }).id);
  logger.info({ summaryId, todayKey }, "storeMorningBriefing: stored morning briefing");
  return { alreadySent: false, summaryId };
};

/**
 * Store a check-in for a specific slot. Each slot gets its own summary_type so all
 * three check-ins can fire on the same day without deduping each other.
 * slotLabel: "noon" | "midafternoon" | "final"
 */
export const storeCheckin = async (
  channelId: string,
  text: string,
  todayKey: string, // YYYY-MM-DD
  slotLabel: string,
): Promise<{ alreadySent: boolean; summaryId: string }> => {
  const summaryType = `daily_manager_checkin_${slotLabel}`;

  const { data: existing, error: checkErr } = await supabase
    .from("generated_summaries")
    .select("id")
    .eq("summary_type", summaryType)
    .eq("channel_id", channelId)
    .gte("created_at", `${todayKey}T00:00:00.000Z`)
    .lte("created_at", `${todayKey}T23:59:59.999Z`)
    .limit(1);

  if (checkErr) {
    logger.error({ err: checkErr, slotLabel }, "storeCheckin: failed to check for existing summary");
  }

  if ((existing || []).length > 0) {
    const existingId = String((existing as Array<{ id: string }>)[0].id);
    logger.info({ summaryId: existingId, todayKey, slotLabel }, "storeCheckin: already sent, skipping");
    return { alreadySent: true, summaryId: existingId };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("generated_summaries")
    .insert({
      summary_type: summaryType,
      channel_id: channelId,
      date_range: { from: todayKey, to: todayKey, label: todayKey },
      summary_text: text,
      metadata: { slot: slotLabel },
      confidence: 0.9,
      generated_by: "daily_manager_scheduler",
    })
    .select("id")
    .single();

  if (insertErr) {
    throw new Error(`storeCheckin: failed to insert summary: ${insertErr.message}`);
  }

  const summaryId = String((inserted as { id: string }).id);
  logger.info({ summaryId, todayKey, slotLabel }, "storeCheckin: stored check-in");
  return { alreadySent: false, summaryId };
};
