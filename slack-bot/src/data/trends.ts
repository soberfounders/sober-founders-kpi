import { supabase } from "../clients/supabase.js";
import type { DateRangeInput } from "../types.js";

// Group session title signals — mirrors DashboardOverview.jsx inferTitleSignal
const TUESDAY_TITLE_SIGNALS = ["tactic tuesday"];
const THURSDAY_TITLE_SIGNALS = ["all are welcome", "entrepreneur's big book", "big book"];
const GROUP_TITLE_SIGNALS = [...TUESDAY_TITLE_SIGNALS, ...THURSDAY_TITLE_SIGNALS, "mastermind"];

export interface NormalizedDateRange {
  from: string;
  to: string;
  label: string;
}

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const parseDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const normalizeDateRange = (dateRange?: DateRangeInput, fallbackDays = 7): NormalizedDateRange => {
  const now = new Date();
  const defaultTo = toDateOnly(now);
  const defaultFromDate = new Date(now);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - (fallbackDays - 1));
  const defaultFrom = toDateOnly(defaultFromDate);

  const from = parseDate(dateRange?.from) ? (dateRange?.from as string) : defaultFrom;
  const to = parseDate(dateRange?.to) ? (dateRange?.to as string) : defaultTo;
  const sorted = from <= to ? { from, to } : { from: to, to: from };

  return {
    from: sorted.from,
    to: sorted.to,
    label: dateRange?.label || `${sorted.from} to ${sorted.to}`,
  };
};

const getPreviousRange = (range: NormalizedDateRange): NormalizedDateRange => {
  const fromDate = parseDate(range.from) as Date;
  const toDate = parseDate(range.to) as Date;
  const spanDays = Math.max(1, Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);

  const prevToDate = new Date(fromDate);
  prevToDate.setUTCDate(prevToDate.getUTCDate() - 1);

  const prevFromDate = new Date(prevToDate);
  prevFromDate.setUTCDate(prevFromDate.getUTCDate() - (spanDays - 1));

  return {
    from: toDateOnly(prevFromDate),
    to: toDateOnly(prevToDate),
    label: `previous ${spanDays}-day period`,
  };
};

interface AggregateResult {
  value: number | null;
  source: string;
  notes: string[];
}

// New leads = active, non-merged HubSpot contacts created in window
const aggregateLeads = async (from: string, to: string): Promise<AggregateResult> => {
  const { count, error } = await supabase
    .from("raw_hubspot_contacts")
    .select("*", { count: "exact", head: true })
    .gte("createdate", `${from}T00:00:00.000Z`)
    .lte("createdate", `${to}T23:59:59.999Z`)
    .neq("is_deleted", true)
    .neq("hubspot_archived", true)
    .is("merged_into_hubspot_contact_id", null);

  if (error) throw new Error(`raw_hubspot_contacts leads query failed: ${error.message}`);
  return { value: count ?? 0, source: "raw_hubspot_contacts", notes: [] };
};

// Qualified leads = leads with revenue >= $250k (sobriety gate requires in-memory parsing; not applied here)
const aggregateQualifiedLeads = async (from: string, to: string): Promise<AggregateResult> => {
  const { count, error } = await supabase
    .from("raw_hubspot_contacts")
    .select("*", { count: "exact", head: true })
    .gte("createdate", `${from}T00:00:00.000Z`)
    .lte("createdate", `${to}T23:59:59.999Z`)
    .neq("is_deleted", true)
    .neq("hubspot_archived", true)
    .is("merged_into_hubspot_contact_id", null)
    .or("annual_revenue_in_dollars__official_.gte.250000,and(annual_revenue_in_dollars__official_.is.null,annual_revenue_in_dollars.gte.250000)");

  if (error) throw new Error(`raw_hubspot_contacts qualified_leads query failed: ${error.message}`);
  return {
    value: count ?? 0,
    source: "raw_hubspot_contacts",
    notes: ["Revenue ≥ $250k filter applied; sobriety gate requires in-memory parsing and is not applied"],
  };
};

const buildGroupSessionTitleFilter = (): string =>
  GROUP_TITLE_SIGNALS.map((signal) => `title.ilike.%${signal}%`).join(",");

// Total attendee-sessions across Tuesday + Thursday group calls in window
const aggregateAttendance = async (from: string, to: string): Promise<AggregateResult> => {
  const { data: sessions, error: sessErr } = await supabase
    .from("raw_hubspot_meeting_activities")
    .select("hubspot_activity_id")
    .gte("hs_timestamp", `${from}T00:00:00.000Z`)
    .lte("hs_timestamp", `${to}T23:59:59.999Z`)
    .eq("activity_type", "MEETING")
    .or(buildGroupSessionTitleFilter());

  if (sessErr) throw new Error(`raw_hubspot_meeting_activities query failed: ${sessErr.message}`);

  const ids = (sessions || []).map((s: Record<string, unknown>) => s.hubspot_activity_id);
  if (!ids.length) {
    return { value: 0, source: "raw_hubspot_meeting_activities", notes: ["No group sessions found in selected window"] };
  }

  const { count, error: assocErr } = await supabase
    .from("hubspot_activity_contact_associations")
    .select("*", { count: "exact", head: true })
    .in("hubspot_activity_id", ids);

  if (assocErr) throw new Error(`hubspot_activity_contact_associations query failed: ${assocErr.message}`);
  return {
    value: count ?? 0,
    source: "raw_hubspot_meeting_activities + hubspot_activity_contact_associations",
    notes: [],
  };
};

const aggregateDonations = async (from: string, to: string): Promise<AggregateResult> => {
  const { data, error } = await supabase
    .from("donation_transactions_unified")
    .select("amount,donated_at")
    .gte("donated_at", `${from}T00:00:00.000Z`)
    .lte("donated_at", `${to}T23:59:59.999Z`);

  if (error) {
    throw new Error(`donation_transactions_unified query failed: ${error.message}`);
  }

  const rows = data || [];
  if (!rows.length) {
    return { value: null, source: "donation_transactions_unified", notes: ["No donations in selected window"] };
  }

  const total = rows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  return { value: total, source: "donation_transactions_unified", notes: [] };
};

const aggregateEmailOpenRate = async (from: string, to: string): Promise<AggregateResult> => {
  const { data, error } = await supabase
    .from("mailchimp_campaigns")
    .select("human_open_rate,send_time")
    .gte("send_time", `${from}T00:00:00.000Z`)
    .lte("send_time", `${to}T23:59:59.999Z`);

  if (error) {
    throw new Error(`mailchimp_campaigns query failed: ${error.message}`);
  }

  const rows = data || [];
  if (!rows.length) {
    return { value: null, source: "mailchimp_campaigns", notes: ["No campaigns in selected window"] };
  }

  const openRates = rows
    .map((row) => Number(row.human_open_rate))
    .filter((value) => Number.isFinite(value));

  if (!openRates.length) {
    return { value: null, source: "mailchimp_campaigns", notes: ["No usable human_open_rate values"] };
  }

  const avgOpenRate = openRates.reduce((sum, current) => sum + current, 0) / openRates.length;
  return { value: avgOpenRate, source: "mailchimp_campaigns", notes: [] };
};

const aggregateSeoOrganic = async (from: string, to: string): Promise<AggregateResult> => {
  const { data, error } = await supabase
    .from("vw_seo_channel_daily")
    .select("metric_date,organic")
    .gte("metric_date", from)
    .lte("metric_date", to);

  if (error) {
    throw new Error(`vw_seo_channel_daily query failed: ${error.message}`);
  }

  const rows = data || [];
  if (!rows.length) {
    return { value: null, source: "vw_seo_channel_daily", notes: ["No SEO daily rows in selected window"] };
  }

  const totalOrganic = rows.reduce((sum, row) => {
    const value = Number((row as Record<string, unknown>).organic);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return { value: totalOrganic, source: "vw_seo_channel_daily", notes: [] };
};

const aggregateOperationsErrors = async (from: string, to: string): Promise<AggregateResult> => {
  const { data, error } = await supabase
    .from("hubspot_sync_errors")
    .select("id,created_at")
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lte("created_at", `${to}T23:59:59.999Z`);

  if (error) {
    throw new Error(`hubspot_sync_errors query failed: ${error.message}`);
  }

  return {
    value: (data || []).length,
    source: "hubspot_sync_errors",
    notes: [],
  };
};

// Phoenix Forum paid members — contacts whose membership_s field contains "Paid Groups"
// HubSpot property label is "Phoenix Forum" but the stored value is "Paid Groups"
const aggregatePhoenixForumMembers = async (_from: string, _to: string): Promise<AggregateResult> => {
  // Total active Phoenix Forum members (regardless of date window)
  const { count, error } = await supabase
    .from("raw_hubspot_contacts")
    .select("*", { count: "exact", head: true })
    .neq("is_deleted", true)
    .neq("hubspot_archived", true)
    .is("merged_into_hubspot_contact_id", null)
    .ilike("membership_s", "%Paid Groups%");

  if (error) throw new Error(`raw_hubspot_contacts phoenix_forum query failed: ${error.message}`);
  return {
    value: count ?? 0,
    source: "raw_hubspot_contacts (membership_s ilike '%Paid Groups%')",
    notes: ["Total active Phoenix Forum members (all-time, not window-scoped)"],
  };
};

export const computeRepeatAttendanceRates = async (range: DateRangeInput | undefined): Promise<{ tuesday: number | null; thursday: number | null; source: string; notes: string[] }> => {
  const normalizedRange = normalizeDateRange(range, 30);

  const { data: sessions, error: sessErr } = await supabase
    .from("raw_hubspot_meeting_activities")
    .select("hubspot_activity_id, hs_timestamp, title")
    .gte("hs_timestamp", `${normalizedRange.from}T00:00:00.000Z`)
    .lte("hs_timestamp", `${normalizedRange.to}T23:59:59.999Z`)
    .eq("activity_type", "MEETING")
    .or(buildGroupSessionTitleFilter());

  if (sessErr) throw new Error(`Repeat attendance session query failed: ${sessErr.message}`);

  const rows = (sessions || []) as Array<Record<string, unknown>>;
  if (!rows.length) {
    return {
      tuesday: null,
      thursday: null,
      source: "raw_hubspot_meeting_activities + hubspot_activity_contact_associations",
      notes: ["No group sessions in selected window"],
    };
  }

  // Classify sessions as Tuesday or Thursday by title then by day-of-week fallback
  const tuesdayIds: unknown[] = [];
  const thursdayIds: unknown[] = [];

  for (const session of rows) {
    const title = String(session.title || "").toLowerCase();
    const ts = new Date(String(session.hs_timestamp || ""));
    const dayOfWeek = Number.isNaN(ts.getTime()) ? -1 : ts.getUTCDay(); // 2=Tue, 4=Thu
    const id = session.hubspot_activity_id;

    const isTuesdayTitle = TUESDAY_TITLE_SIGNALS.some((sig) => title.includes(sig));
    const isThursdayTitle = THURSDAY_TITLE_SIGNALS.some((sig) => title.includes(sig));

    if (isTuesdayTitle || (!isThursdayTitle && dayOfWeek === 2)) {
      tuesdayIds.push(id);
    } else if (isThursdayTitle || dayOfWeek === 4) {
      thursdayIds.push(id);
    }
  }

  const allIds = [...tuesdayIds, ...thursdayIds];
  if (!allIds.length) {
    return {
      tuesday: null,
      thursday: null,
      source: "raw_hubspot_meeting_activities + hubspot_activity_contact_associations",
      notes: ["Sessions found but could not classify as Tuesday or Thursday"],
    };
  }

  const { data: associations, error: assocErr } = await supabase
    .from("hubspot_activity_contact_associations")
    .select("hubspot_activity_id, hubspot_contact_id, contact_email")
    .in("hubspot_activity_id", allIds);

  if (assocErr) throw new Error(`Repeat attendance associations query failed: ${assocErr.message}`);

  const assocRows = (associations || []) as Array<Record<string, unknown>>;

  const computeRate = (sessionIds: unknown[]): number | null => {
    if (!sessionIds.length) return null;
    const idSet = new Set(sessionIds.map(String));
    const visitCounts = new Map<string, number>();

    for (const row of assocRows) {
      if (!idSet.has(String(row.hubspot_activity_id))) continue;
      const key = row.hubspot_contact_id
        ? `id:${row.hubspot_contact_id}`
        : `email:${String(row.contact_email || "").toLowerCase()}`;
      if (!key || key === "email:") continue;
      visitCounts.set(key, (visitCounts.get(key) || 0) + 1);
    }

    if (!visitCounts.size) return null;
    let repeaters = 0;
    for (const count of visitCounts.values()) {
      if (count > 1) repeaters += 1;
    }
    return repeaters / visitCounts.size;
  };

  return {
    tuesday: computeRate(tuesdayIds),
    thursday: computeRate(thursdayIds),
    source: "raw_hubspot_meeting_activities + hubspot_activity_contact_associations",
    notes: [],
  };
};

export const queryMetricAggregate = async (metric: string, range: NormalizedDateRange): Promise<AggregateResult> => {
  const normalized = metric.trim().toLowerCase();

  if (["leads", "hs_contacts_created", "new_leads"].includes(normalized)) {
    return aggregateLeads(range.from, range.to);
  }

  if (["qualified_leads", "hs_contacts_qualified_created"].includes(normalized)) {
    return aggregateQualifiedLeads(range.from, range.to);
  }

  if (["attendance", "showups", "zoom_meeting_attendees"].includes(normalized)) {
    return aggregateAttendance(range.from, range.to);
  }

  if (["donations", "donations_total", "revenue_donations"].includes(normalized)) {
    return aggregateDonations(range.from, range.to);
  }

  if (["email", "email_open_rate", "mailchimp_open_rate"].includes(normalized)) {
    return aggregateEmailOpenRate(range.from, range.to);
  }

  if (["seo", "seo_organic_sessions", "organic_sessions"].includes(normalized)) {
    return aggregateSeoOrganic(range.from, range.to);
  }

  if (["operations", "operations_errors", "sync_errors"].includes(normalized)) {
    return aggregateOperationsErrors(range.from, range.to);
  }

  if (["phoenix_forum_paid_members", "phoenix_paid_members", "phoenix_new_members"].includes(normalized)) {
    return aggregatePhoenixForumMembers(range.from, range.to);
  }

  if (["free_tuesday_repeat_attendance", "free_thursday_repeat_attendance"].includes(normalized)) {
    const repeatRates = await computeRepeatAttendanceRates(range);
    return {
      value: normalized.includes("tuesday") ? repeatRates.tuesday : repeatRates.thursday,
      source: repeatRates.source,
      notes: repeatRates.notes,
    };
  }

  return {
    value: null,
    source: "unknown",
    notes: [`Metric '${metric}' is not mapped to a data source. Available: leads, qualified_leads, attendance, donations, email_open_rate, seo, operations, free_tuesday_repeat_attendance, free_thursday_repeat_attendance`],
  };
};

export const getMetricTrend = async (
  metric: string,
  dateRange: DateRangeInput | undefined,
  compareTo: string = "previous_period",
) => {
  const currentRange = normalizeDateRange(dateRange, 7);
  const previousRange = getPreviousRange(currentRange);

  const [current, previous] = await Promise.all([
    queryMetricAggregate(metric, currentRange),
    queryMetricAggregate(metric, previousRange),
  ]);

  const currentValue = current.value;
  const previousValue = previous.value;
  const delta = (currentValue !== null && previousValue !== null)
    ? currentValue - previousValue
    : null;

  const deltaPct = (delta !== null && previousValue !== null && previousValue !== 0)
    ? delta / Math.abs(previousValue)
    : null;

  return {
    metric,
    current: currentValue,
    previous: previousValue,
    delta,
    delta_pct: deltaPct,
    window: currentRange.label,
    compare_to: compareTo,
    source: current.source,
    confidence: currentValue === null ? 0.35 : 0.8,
    notes: [...current.notes, ...previous.notes],
  };
};
