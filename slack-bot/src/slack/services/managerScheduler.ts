import { env } from "../../config/env.js";
import { slackWeb } from "../../clients/slack.js";
import { supabase, invokeMasterSync } from "../../clients/supabase.js";
import { getMissedCheckinStreak, storeMorningBriefing, storeCheckin } from "../../data/accountability.js";
import { buildMorningBriefing, buildCheckin } from "./managerBriefing.js";
import { listOpenTasks } from "../../data/managers.js";
import { logger } from "../../observability/logger.js";

const getEtHour = (): number => {
  const now = new Date();
  const etParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const hourPart = etParts.find((p) => p.type === "hour");
  return hourPart ? Number(hourPart.value) : now.getUTCHours();
};

const getTodayKeyEt = (): string => {
  const now = new Date();
  // en-CA locale formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(now);
};

export class DailyManagerScheduler {
  private timer: NodeJS.Timeout | null = null;

  public start(): void {
    if (!env.managerEnabled) {
      logger.info("Daily manager scheduler disabled by configuration (MANAGER_ENABLED=false)");
      return;
    }

    if (!env.managerTargetSlackUserId) {
      logger.warn("Daily manager scheduler: MANAGER_TARGET_SLACK_USER_ID is not set — skipping start");
      return;
    }

    if (this.timer) return;

    this.timer = setInterval(() => {
      this.poll().catch((error: unknown) => {
        logger.error({ err: error }, "DailyManagerScheduler poll failed");
      });
    }, env.schedulerPollIntervalMs);

    void this.poll();
    logger.info(
      { poll_interval_ms: env.schedulerPollIntervalMs, target_user: env.managerTargetSlackUserId },
      "Daily manager scheduler started",
    );
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("Daily manager scheduler stopped");
    }
  }

  private async poll(): Promise<void> {
    const targetUserId = env.managerTargetSlackUserId;
    if (!targetUserId) {
      logger.warn("DailyManagerScheduler.poll: no target user ID configured, skipping");
      return;
    }

    const etHour = getEtHour();
    const todayKey = getTodayKeyEt();

    logger.debug({ etHour, todayKey }, "DailyManagerScheduler.poll: running");

    if (etHour === env.managerBriefingHourEt) {
      await this.sendMorningBriefing(targetUserId, todayKey);
    }

    const checkinHours = env.managerCheckinHoursEt;
    const slotIndex = checkinHours.indexOf(etHour);
    if (slotIndex !== -1) {
      await this.sendCheckin(targetUserId, todayKey, slotIndex, checkinHours);
    }
  }

  private async getDmChannelId(targetUserId: string): Promise<string> {
    const result = await slackWeb.conversations.open({ users: targetUserId });
    const channelId = (result.channel as { id?: string } | undefined)?.id;
    if (!channelId) {
      throw new Error(`DailyManagerScheduler: could not open DM channel with user ${targetUserId}`);
    }
    return channelId;
  }

  private async sendMorningBriefing(targetUserId: string, todayKey: string): Promise<void> {
    // Get DM channel first — needed for dedup key
    const channelId = await this.getDmChannelId(targetUserId);

    // Check dedup without inserting: query directly
    const { data: existing } = await supabase
      .from("generated_summaries")
      .select("id,posted_message_ts")
      .eq("summary_type", "daily_manager_briefing")
      .eq("channel_id", channelId)
      .gte("created_at", `${todayKey}T00:00:00.000Z`)
      .lte("created_at", `${todayKey}T23:59:59.999Z`)
      .limit(1);

    if ((existing || []).length > 0) {
      logger.info({ todayKey }, "DailyManagerScheduler: morning briefing already sent today, skipping");
      return;
    }

    // Sync Notion tasks first so the task list is current
    try {
      await invokeMasterSync({ action: "sync_notion" });
      logger.info("DailyManagerScheduler: Notion tasks synced before morning briefing");
    } catch (err) {
      logger.error({ err }, "DailyManagerScheduler: Notion sync failed (continuing with stale data)");
    }

    // Build message
    const missedStreak = await getMissedCheckinStreak(targetUserId);
    const text = await buildMorningBriefing(missedStreak);

    // Load tasks for metadata
    const tasks = await listOpenTasks().catch((err: unknown) => {
      logger.error({ err }, "DailyManagerScheduler: failed to load tasks for metadata");
      return [] as Array<{ id: string; title: string; priority: string }>;
    });

    const taskMeta = tasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority }));

    // Store in generated_summaries (handles final dedup in case of race)
    const { alreadySent, summaryId } = await storeMorningBriefing(channelId, text, taskMeta, todayKey);

    if (alreadySent) {
      logger.info({ summaryId, todayKey }, "DailyManagerScheduler: morning briefing already sent (race dedup), skipping");
      return;
    }

    // Post to Slack
    const result = await slackWeb.chat.postMessage({
      channel: channelId,
      text,
    });

    // Record the posted_message_ts
    if (result.ts) {
      await supabase
        .from("generated_summaries")
        .update({ posted_message_ts: result.ts })
        .eq("id", summaryId);
    }

    logger.info(
      { summaryId, todayKey, missedStreak, ts: result.ts },
      "DailyManagerScheduler: morning briefing sent",
    );
  }

  private async sendCheckin(
    targetUserId: string,
    todayKey: string,
    slotIndex: number,
    checkinHours: readonly number[],
  ): Promise<void> {
    const slotLabels = ["noon", "midafternoon", "final"];
    const slotLabel = slotLabels[slotIndex] ?? `slot${slotIndex}`;
    const summaryType = `daily_manager_checkin_${slotLabel}`;

    const channelId = await this.getDmChannelId(targetUserId);

    // Fast dedup check before building the message
    const { data: existing } = await supabase
      .from("generated_summaries")
      .select("id")
      .eq("summary_type", summaryType)
      .eq("channel_id", channelId)
      .gte("created_at", `${todayKey}T00:00:00.000Z`)
      .lte("created_at", `${todayKey}T23:59:59.999Z`)
      .limit(1);

    if ((existing || []).length > 0) {
      logger.info({ todayKey, slotLabel }, "DailyManagerScheduler: check-in already sent for slot, skipping");
      return;
    }

    const missedStreak = await getMissedCheckinStreak(targetUserId);
    const text = await buildCheckin(missedStreak, todayKey, slotIndex);

    const { alreadySent, summaryId } = await storeCheckin(channelId, text, todayKey, slotLabel);

    if (alreadySent) {
      logger.info({ summaryId, todayKey, slotLabel }, "DailyManagerScheduler: check-in race dedup, skipping");
      return;
    }

    const result = await slackWeb.chat.postMessage({ channel: channelId, text });

    if (result.ts) {
      await supabase
        .from("generated_summaries")
        .update({ posted_message_ts: result.ts })
        .eq("id", summaryId);
    }

    logger.info(
      { summaryId, todayKey, slotLabel, slotIndex, missedStreak, checkinHours, ts: result.ts },
      "DailyManagerScheduler: check-in sent",
    );
  }
}
