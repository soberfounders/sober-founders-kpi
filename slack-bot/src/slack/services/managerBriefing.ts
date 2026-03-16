import { listOpenTasks } from "../../data/managers.js";
import { getMetricTrend } from "../../data/trends.js";
import { logger } from "../../observability/logger.js";

const PHOENIX_KEYWORDS = ["phoenix", "member", "interview", "paid forum"];

const isPhoenixTask = (task: { title: string; priority: string }): boolean => {
  const titleLower = task.title.toLowerCase();
  return (
    PHOENIX_KEYWORDS.some((kw) => titleLower.includes(kw)) ||
    task.priority === "High Priority"
  );
};

const formatDelta = (delta: number | null, deltaPct: number | null): string => {
  if (delta === null) return "no prior data";
  const sign = delta >= 0 ? "+" : "";
  if (deltaPct !== null) {
    const pctSign = deltaPct >= 0 ? "+" : "";
    return `${sign}${Math.round(delta)} (${pctSign}${(deltaPct * 100).toFixed(1)}% vs last week)`;
  }
  return `${sign}${Math.round(delta)} vs last week`;
};

const metricCommentary = (metric: string, delta: number | null, deltaPct: number | null): string => {
  if (delta === null || deltaPct === null) return "";
  if (metric === "qualified_leads" && deltaPct < -0.1) return " ⚠️ Pipeline is shrinking — fix this.";
  if (metric === "qualified_leads" && deltaPct < 0) return " Qualified lead flow is down.";
  if (metric === "leads" && deltaPct < -0.15) return " Lead volume dropping sharply.";
  if (metric === "attendance" && deltaPct < -0.15) return " Attendance drop. Community engagement issue.";
  return "";
};

/**
 * Build the morning briefing text.
 * Pulls: listOpenTasks() + getMetricTrend("leads") + getMetricTrend("attendance") + getMetricTrend("qualified_leads")
 * Phoenix Forum tasks go FIRST.
 * missedStreak: how many days in a row he didn't respond to check-ins.
 */
export const buildMorningBriefing = async (missedStreak: number): Promise<string> => {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [tasks, leadsData, attendanceData, qualifiedLeadsData] = await Promise.all([
    listOpenTasks().catch((err: unknown) => {
      logger.error({ err }, "buildMorningBriefing: failed to load tasks");
      return [] as Array<{ id: string; title: string; priority: string; status: string; owner: string; due_date?: string; source: string; url: string }>;
    }),
    getMetricTrend("leads", undefined).catch((err: unknown) => {
      logger.error({ err }, "buildMorningBriefing: failed to load leads trend");
      return null;
    }),
    getMetricTrend("attendance", undefined).catch((err: unknown) => {
      logger.error({ err }, "buildMorningBriefing: failed to load attendance trend");
      return null;
    }),
    getMetricTrend("qualified_leads", undefined).catch((err: unknown) => {
      logger.error({ err }, "buildMorningBriefing: failed to load qualified_leads trend");
      return null;
    }),
  ]);

  const phoenixTasks = tasks.filter(isPhoenixTask);
  const otherTasks = tasks.filter((t) => !isPhoenixTask(t));

  const lines: string[] = [];

  lines.push(`Good morning. Here's your battle plan for ${dateLabel}.`);

  if (missedStreak === 1) {
    lines.push(`\nYou didn't report back yesterday. That's not how this works. You said you'd follow through — hold yourself accountable.`);
  } else if (missedStreak === 2) {
    lines.push(`\nTwo days in a row with no check-in response. This is becoming a habit. Every day you ghost this check-in is a day the Phoenix Forum pipeline stalls. Get it together.`);
  } else if (missedStreak >= 3) {
    lines.push(`\n${missedStreak} days of silence. You're letting the Phoenix Forum pipeline rot. You talk about $1M revenue — you can't even reply to a check-in. Either show up or admit this isn't a priority. Which is it?`);
  }

  // Phoenix Forum section
  lines.push(`\n🏆 PHOENIX FORUM (top priority)`);
  if (phoenixTasks.length) {
    phoenixTasks.slice(0, 10).forEach((task, i) => {
      const due = task.due_date ? ` [due ${task.due_date}]` : "";
      lines.push(`${i + 1}. ${task.title} — ${task.priority || "No priority"}${due}`);
    });
  } else {
    lines.push("No open Phoenix Forum tasks. Either everything is done (unlikely) or your Notion hygiene is broken.");
  }

  // KPI pulse section
  lines.push(`\n📊 KPI pulse:`);

  if (qualifiedLeadsData) {
    const val = qualifiedLeadsData.current !== null ? String(qualifiedLeadsData.current) : "n/a";
    const deltaStr = formatDelta(qualifiedLeadsData.delta, qualifiedLeadsData.delta_pct);
    const comment = metricCommentary("qualified_leads", qualifiedLeadsData.delta, qualifiedLeadsData.delta_pct);
    lines.push(`• Qualified leads: ${val} (${deltaStr})${comment}`);
  } else {
    lines.push("• Qualified leads: n/a");
  }

  if (leadsData) {
    const val = leadsData.current !== null ? String(leadsData.current) : "n/a";
    const deltaStr = formatDelta(leadsData.delta, leadsData.delta_pct);
    const comment = metricCommentary("leads", leadsData.delta, leadsData.delta_pct);
    lines.push(`• Leads: ${val} (${deltaStr})${comment}`);
  } else {
    lines.push("• Leads: n/a");
  }

  if (attendanceData) {
    const val = attendanceData.current !== null ? String(attendanceData.current) : "n/a";
    const deltaStr = formatDelta(attendanceData.delta, attendanceData.delta_pct);
    const comment = metricCommentary("attendance", attendanceData.delta, attendanceData.delta_pct);
    lines.push(`• Attendance: ${val} (${deltaStr})${comment}`);
  } else {
    lines.push("• Attendance: n/a");
  }

  // Everything else section
  lines.push(`\n📋 Everything else:`);
  if (otherTasks.length) {
    otherTasks.slice(0, 15).forEach((task, i) => {
      const due = task.due_date ? ` [due ${task.due_date}]` : "";
      lines.push(`${i + 1}. ${task.title} — ${task.priority || "No priority"}${due}`);
    });
    if (otherTasks.length > 15) {
      lines.push(`…and ${otherTasks.length - 15} more tasks.`);
    }
  } else {
    lines.push("No other open tasks.");
  }

  lines.push(`\nReply with what you got done tonight.`);

  return lines.join("\n");
};

/**
 * Build a check-in message for a specific time slot.
 * slotIndex: 0 = noon (first nudge), 1 = mid-afternoon (urgent), 2 = final (accountability)
 * missedStreak: consecutive prior days with no response
 */
export const buildCheckin = async (
  missedStreak: number,
  todayKey: string,
  slotIndex: number,
): Promise<string> => {
  const dateLabel = new Date(`${todayKey}T12:00:00.000Z`).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Noon — first nudge, light tone
  if (slotIndex === 0) {
    if (missedStreak === 0) {
      return `Midday check-in. What have you knocked out from this morning's list so far?`;
    }
    if (missedStreak === 1) {
      return (
        `Midday check-in. You didn't report back yesterday — not a great start to the week.\n\n` +
        `What's done so far today? Phoenix Forum items first.`
      );
    }
    return (
      `Midday check-in. ${missedStreak} days of silence. Still waiting.\n\n` +
      `What have you actually done today for Phoenix Forum growth? Name it.`
    );
  }

  // 3pm — second nudge, urgency rising
  if (slotIndex === 1) {
    if (missedStreak === 0) {
      return (
        `3pm. You've got a couple hours left. What's still open from this morning?\n\n` +
        `Reply with what you still need to close out.`
      );
    }
    if (missedStreak === 1) {
      return (
        `3pm, ${dateLabel}. You didn't respond at noon and you ghosted yesterday's check-ins too.\n\n` +
        `Two hours left in the workday. What Phoenix Forum work are you getting done before 5? ` +
        `This is the second reminder today.`
      );
    }
    return (
      `3pm — still nothing from you today, and ${missedStreak} days before that too.\n\n` +
      `You have two hours. The Phoenix Forum pipeline is not going to grow while you ignore this. ` +
      `What are you doing right now to change that?`
    );
  }

  // 5pm — final check-in, full accountability mode
  if (missedStreak === 0) {
    return (
      `End of day. Final check-in.\n\n` +
      `What got done today? List it out — Phoenix Forum first, then everything else.`
    );
  }

  if (missedStreak === 1) {
    return (
      `End of day, ${dateLabel}. You skipped yesterday's check-ins and you've been quiet all day today too.\n\n` +
      `I'm not going to pretend that didn't happen. What did you actually get done today? ` +
      `List it out. Phoenix Forum tasks first.`
    );
  }

  if (missedStreak === 2) {
    return (
      `${dateLabel}. Two full days with no check-in response. This is becoming a pattern.\n\n` +
      `You're supposed to be building a $1M Phoenix Forum. Accountability is non-negotiable. ` +
      `What got done today? Don't skip this again.`
    );
  }

  // streak >= 3: ruthless
  return (
    `${dateLabel}. ${missedStreak} consecutive days of silence.\n\n` +
    `The Phoenix Forum pipeline doesn't grow itself. ` +
    `Every day you skip this is a day you're choosing comfort over $1M revenue. ` +
    `No excuses. What did you do today to move Phoenix Forum forward? ` +
    `Name specific tasks. If you can't name one, that's your real problem.`
  );
};
