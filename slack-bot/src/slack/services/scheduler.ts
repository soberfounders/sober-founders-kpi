import { env } from "../../config/env.js";
import { supabase } from "../../clients/supabase.js";
import { sendSlackSummary } from "../../actions/sendSlackSummary.js";
import { logAuditEvent } from "../../actions/logAuditEvent.js";
import { logger } from "../../observability/logger.js";

const nextRunAt = (intervalMinutes: number) => {
  const now = new Date();
  now.setUTCMinutes(now.getUTCMinutes() + intervalMinutes);
  return now.toISOString();
};

export class SummaryScheduler {
  private timer: NodeJS.Timeout | null = null;

  public start() {
    if (!env.schedulerEnabled) {
      logger.info("Summary scheduler disabled by configuration");
      return;
    }

    if (this.timer) return;

    this.timer = setInterval(() => {
      this.poll().catch((error) => {
        logger.error({ err: error }, "Scheduler poll failed");
      });
    }, env.schedulerPollIntervalMs);

    void this.poll();
    logger.info({ poll_interval_ms: env.schedulerPollIntervalMs }, "Summary scheduler started");
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("Summary scheduler stopped");
    }
  }

  private async poll() {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("user_channel_preferences")
      .select("id,slack_user_id,channel_id,summary_type,schedule_interval_minutes,next_run_at")
      .eq("is_active", true)
      .lte("next_run_at", nowIso)
      .limit(100);

    if (error) {
      throw new Error(`Failed to load user_channel_preferences: ${error.message}`);
    }

    const jobs = data || [];
    if (!jobs.length) return;

    for (const job of jobs as Array<Record<string, unknown>>) {
      const traceId = `sched_${String(job.id)}`;
      const summaryType = String(job.summary_type || "daily_health");
      const channel = String(job.channel_id || "");
      const userId = String(job.slack_user_id || "");
      const intervalMinutes = Number(job.schedule_interval_minutes || 10_080);

      try {
        await sendSlackSummary(summaryType, channel, undefined, traceId);

        await supabase
          .from("user_channel_preferences")
          .update({
            last_sent_at: nowIso,
            next_run_at: nextRunAt(intervalMinutes),
            updated_at: new Date().toISOString(),
          })
          .eq("id", String(job.id));

        await logAuditEvent({
          actionType: "scheduled_summary",
          actorUserId: userId,
          channelId: channel,
          intentType: "outbound_posting",
          toolName: "post_summary",
          status: "executed",
          confirmationRequired: false,
          confirmationStatus: "not_required",
          input: {
            summary_type: summaryType,
          },
          output: {
            scheduled: true,
          },
          traceId,
        });
      } catch (pollError) {
        logger.error({ err: pollError, job }, "Failed to process scheduled summary job");

        await logAuditEvent({
          actionType: "scheduled_summary",
          actorUserId: userId,
          channelId: channel,
          intentType: "outbound_posting",
          toolName: "post_summary",
          status: "failed",
          confirmationRequired: false,
          confirmationStatus: "not_required",
          input: {
            summary_type: summaryType,
          },
          errorMessage: pollError instanceof Error ? pollError.message : String(pollError),
          traceId,
        }).catch(() => undefined);
      }
    }
  }
}
