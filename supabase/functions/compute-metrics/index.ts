/**
 * compute-metrics edge function
 *
 * Phase 2 of the Unified Metrics Layer.
 * Computes all canonical KPI metrics for a given date and UPSERTs them into fact_kpi_daily.
 * Replaces duplicated calculation logic across dashboard JS and Slack bot TS.
 *
 * Invoke: POST /functions/v1/compute-metrics
 *   body: { "target_date": "2026-03-18" }         — compute for specific date
 *   body: { "backfill_from": "2026-03-01" }        — backfill range from date to today
 *   body: {}                                       — defaults to yesterday
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function mustGetEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

// ---------------------------------------------------------------------------
// Revenue parsing  (ported from dashboard/src/lib/leadsQualificationRules.js)
// ---------------------------------------------------------------------------
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    const negativeFromParens = /^\(.*\)$/.test(raw);
    let normalized = raw.replace(/[,\s$]/g, "").replace(/usd/gi, "").trim();
    if (negativeFromParens) {
      normalized = normalized.replace(/[()]/g, "");
      normalized = `-${normalized}`;
    }
    const suffixMatch = normalized.match(/^([-+]?\d*\.?\d+)([kmb])$/i);
    if (suffixMatch) {
      const base = Number(suffixMatch[1]);
      const suffix = String(suffixMatch[2]).toLowerCase();
      const multiplier =
        suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1_000_000_000;
      const parsed = base * multiplier;
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractEffectiveRevenue(row: Record<string, unknown>): number | null {
  // Official fields first (matches OFFICIAL_REVENUE_FIELDS order in leadsQualificationRules.js)
  const official =
    toNumberOrNull(row.annual_revenue_in_usd_official) ??
    toNumberOrNull(row.annual_revenue_in_dollars__official_);
  if (official !== null) return official;
  // Fallback chain (matches NUMERIC_REVENUE_FALLBACK_FIELDS)
  return (
    toNumberOrNull(row.annual_revenue_in_dollars) ??
    toNumberOrNull(row.annual_revenue) ??
    toNumberOrNull(row.revenue)
  );
}

// ---------------------------------------------------------------------------
// Sobriety date parsing (ported from leadsQualificationRules.js)
// ---------------------------------------------------------------------------
function toUtcDayStart(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  );
}

function addUtcYears(date: Date, years: number): Date | null {
  const out = new Date(
    Date.UTC(
      date.getUTCFullYear() + years,
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
  if (out.getUTCMonth() !== date.getUTCMonth()) {
    return new Date(
      Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth() + 1, 0)
    );
  }
  return out;
}

function parseSobrietyDate(row: Record<string, unknown>): Date | null {
  const fields = [
    "sobriety_date",
    "sobriety_date__official_",
    "sober_date",
    "clean_date",
    "sobrietydate",
  ];
  let raw: unknown = null;
  for (const field of fields) {
    const candidate = row[field];
    if (
      candidate !== null &&
      candidate !== undefined &&
      String(candidate).trim() !== ""
    ) {
      raw = candidate;
      break;
    }
  }
  if (raw === null || raw === undefined || raw === "") return null;
  const text = String(raw).trim();
  if (!text || text.toLowerCase() === "not found") return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return toUtcDayStart(`${text}T00:00:00.000Z`);
  }
  const mmddyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const mm = String(mmddyyyy[1]).padStart(2, "0");
    const dd = String(mmddyyyy[2]).padStart(2, "0");
    const yyyy = String(mmddyyyy[3]).padStart(4, "0");
    return toUtcDayStart(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }
  return toUtcDayStart(text);
}

function hasOneYearSobrietyByDate(
  row: Record<string, unknown>,
  referenceDate: Date
): boolean {
  const sobrietyDate = parseSobrietyDate(row);
  const reference = toUtcDayStart(referenceDate);
  if (!sobrietyDate || !reference) return false;
  const anniversary = addUtcYears(sobrietyDate, 1);
  // Strictly greater than 1 year (not inclusive of exact anniversary day)
  return !!anniversary && anniversary.getTime() < reference.getTime();
}

// ---------------------------------------------------------------------------
// Attendance title classification (mirrors trends.ts + DashboardOverview.jsx)
// ---------------------------------------------------------------------------
const TUESDAY_TITLE_SIGNALS = ["tactic tuesday"];
const THURSDAY_TITLE_SIGNALS = [
  "all are welcome",
  "entrepreneur's big book",
  "big book",
];
const GROUP_TITLE_SIGNALS = [
  ...TUESDAY_TITLE_SIGNALS,
  ...THURSDAY_TITLE_SIGNALS,
  "mastermind",
];

const INTRO_MEETING_EXCLUSION_PATTERNS = [
  "intro meeting",
  "meeting with",
  "1:1",
  "one-on-one",
  "discovery call",
  "phone call",
];

function isGroupSession(title: string): boolean {
  const lower = title.toLowerCase();
  if (INTRO_MEETING_EXCLUSION_PATTERNS.some((p) => lower.includes(p)))
    return false;
  return GROUP_TITLE_SIGNALS.some((sig) => lower.includes(sig));
}

function classifyDay(
  title: string,
  timestamp: string
): "tuesday" | "thursday" | null {
  const lower = title.toLowerCase();
  const isTuesday = TUESDAY_TITLE_SIGNALS.some((sig) => lower.includes(sig));
  const isThursday = THURSDAY_TITLE_SIGNALS.some((sig) => lower.includes(sig));
  if (isTuesday) return "tuesday";
  if (isThursday) return "thursday";
  // Fall back to day-of-week from timestamp
  const ts = new Date(timestamp);
  if (Number.isNaN(ts.getTime())) return null;
  const day = ts.getUTCDay();
  if (day === 2) return "tuesday";
  if (day === 4) return "thursday";
  return null;
}

// ---------------------------------------------------------------------------
// Contact funnel attribution (ported from dashboard leadsGroupAnalytics.js)
// ---------------------------------------------------------------------------
function isPaidSocialContact(row: Record<string, unknown>): boolean {
  const sourceBlob = [
    row.hs_analytics_source,
    row.hs_latest_source,
    row.original_traffic_source,
  ]
    .join(" ")
    .toUpperCase();
  return sourceBlob.includes("PAID_SOCIAL");
}

function isPhoenixContact(row: Record<string, unknown>): boolean {
  const blob = [
    row.hs_analytics_source_data_2,
    row.hs_latest_source_data_2,
    row.campaign,
    row.campaign_source,
    row.membership_s,
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes("phoenix");
}

function classifyContactFunnel(
  row: Record<string, unknown>
): "free" | "phoenix" | null {
  if (!isPaidSocialContact(row)) return null;
  return isPhoenixContact(row) ? "phoenix" : "free";
}

// ---------------------------------------------------------------------------
// Metric result type
// ---------------------------------------------------------------------------
interface MetricRow {
  kpi_key: string;
  funnel_key: string;
  value: number;
}

// ---------------------------------------------------------------------------
// Supabase client type shorthand
// ---------------------------------------------------------------------------
type SupabaseClient = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
// Metric computers — each returns an array of MetricRow
// ---------------------------------------------------------------------------

async function computeLeadsMetrics(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  // Fetch all contacts created in window with revenue + sobriety + source fields
  const { data: contacts, error } = await sb
    .from("raw_hubspot_contacts")
    .select(
      "hubspot_contact_id, annual_revenue_in_usd_official, annual_revenue_in_dollars__official_, annual_revenue_in_dollars, annual_revenue, revenue, sobriety_date, sobriety_date__official_, sober_date, clean_date, sobrietydate, membership_s, is_deleted, hubspot_archived, merged_into_hubspot_contact_id, hs_analytics_source, hs_latest_source, original_traffic_source, hs_analytics_source_data_2, hs_latest_source_data_2, campaign, campaign_source"
    )
    .gte("createdate", `${from}T00:00:00.000Z`)
    .lte("createdate", `${to}T23:59:59.999Z`)
    .neq("is_deleted", true)
    .neq("hubspot_archived", true)
    .is("merged_into_hubspot_contact_id", null);

  if (error) throw new Error(`leads query failed: ${error.message}`);

  const rows = contacts || [];
  const referenceDate = new Date(`${to}T23:59:59.999Z`);

  // Counters: all, free funnel, phoenix funnel
  const counts = {
    all: { total: 0, qualified: 0, phoenixQualified: 0, great: 0 },
    free: { total: 0, qualified: 0, phoenixQualified: 0, great: 0 },
    phoenix: { total: 0, qualified: 0, phoenixQualified: 0, great: 0 },
  };

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const revenue = extractEffectiveRevenue(r);
    const sobrietyOk = hasOneYearSobrietyByDate(r, referenceDate);
    const isQual = revenue !== null && revenue >= 250_000 && sobrietyOk;
    const isPQ = revenue !== null && revenue >= 1_000_000 && sobrietyOk;
    const isGreat = revenue !== null && revenue >= 1_000_000;
    const funnel = classifyContactFunnel(r);

    // All
    counts.all.total++;
    if (isQual) counts.all.qualified++;
    if (isPQ) counts.all.phoenixQualified++;
    if (isGreat) counts.all.great++;

    // Funnel-specific
    if (funnel === "free" || funnel === "phoenix") {
      counts[funnel].total++;
      if (isQual) counts[funnel].qualified++;
      if (isPQ) counts[funnel].phoenixQualified++;
      if (isGreat) counts[funnel].great++;
    }
  }

  const results: MetricRow[] = [];
  for (const [funnel, c] of Object.entries(counts)) {
    results.push({ kpi_key: "leads_created", funnel_key: funnel, value: c.total });
    results.push({ kpi_key: "qualified_leads_created", funnel_key: funnel, value: c.qualified });
    results.push({ kpi_key: "phoenix_qualified_leads", funnel_key: funnel, value: c.phoenixQualified });
    results.push({ kpi_key: "great_leads", funnel_key: funnel, value: c.great });
  }
  return results;
}

async function computePhoenixPaidMembers(
  sb: SupabaseClient,
  _from: string,
  _to: string
): Promise<MetricRow[]> {
  // Total active Phoenix Forum members (window-agnostic, like trends.ts)
  const { count, error } = await sb
    .from("raw_hubspot_contacts")
    .select("*", { count: "exact", head: true })
    .neq("is_deleted", true)
    .neq("hubspot_archived", true)
    .is("merged_into_hubspot_contact_id", null)
    .ilike("membership_s", "%Paid Groups%");

  if (error)
    throw new Error(`phoenix_paid_members query failed: ${error.message}`);
  return [
    { kpi_key: "phoenix_paid_members", funnel_key: "phoenix", value: count ?? 0 },
  ];
}

async function computeInterviews(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  // Fetch interview-pattern activities with titles for funnel classification
  const { data, error } = await sb
    .from("raw_hubspot_meeting_activities")
    .select("hubspot_activity_id, title")
    .gte("hs_timestamp", `${from}T00:00:00.000Z`)
    .lte("hs_timestamp", `${to}T23:59:59.999Z`)
    .in("activity_type", ["meeting", "MEETING"])
    .or(
      "title.ilike.%intro meeting%,title.ilike.%discovery call%,title.ilike.%interview%,title.ilike.%phoenix%meeting%"
    );

  if (error)
    throw new Error(`interviews_completed query failed: ${error.message}`);

  const rows = data || [];
  let total = 0;
  let freeCount = 0;
  let phoenixCount = 0;

  for (const row of rows) {
    total++;
    const title = String((row as Record<string, unknown>).title || "").toLowerCase();
    if (
      title.includes("phoenix") ||
      title.includes("learn more") ||
      title.includes("good fit")
    ) {
      phoenixCount++;
    } else {
      freeCount++;
    }
  }

  return [
    { kpi_key: "interviews_completed", funnel_key: "all", value: total },
    { kpi_key: "interviews_completed", funnel_key: "free", value: freeCount },
    { kpi_key: "interviews_completed", funnel_key: "phoenix", value: phoenixCount },
  ];
}

async function computeAdMetrics(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  const { data, error } = await sb
    .from("raw_fb_ads_insights_daily")
    .select("spend,leads,date_start,campaign_name")
    .gte("date_start", from)
    .lte("date_start", to);

  if (error) throw new Error(`ad_metrics query failed: ${error.message}`);

  const rows = data || [];
  let totalSpend = 0;
  let freeSpend = 0;
  let phoenixSpend = 0;
  let totalAdLeads = 0;
  let freeAdLeads = 0;
  let phoenixAdLeads = 0;

  for (const row of rows) {
    const spend = Number(row.spend) || 0;
    const leads = Number(row.leads) || 0;
    const name = String(row.campaign_name || "").toLowerCase();
    const isPhoenix = name.includes("phoenix");

    totalSpend += spend;
    totalAdLeads += leads;

    if (isPhoenix) {
      phoenixSpend += spend;
      phoenixAdLeads += leads;
    } else {
      freeSpend += spend;
      freeAdLeads += leads;
    }
  }

  return [
    { kpi_key: "ad_spend", funnel_key: "all", value: totalSpend },
    { kpi_key: "ad_spend", funnel_key: "free", value: freeSpend },
    { kpi_key: "ad_spend", funnel_key: "phoenix", value: phoenixSpend },
    { kpi_key: "ad_leads", funnel_key: "all", value: totalAdLeads },
    { kpi_key: "ad_leads", funnel_key: "free", value: freeAdLeads },
    { kpi_key: "ad_leads", funnel_key: "phoenix", value: phoenixAdLeads },
  ];
}

async function computeAttendanceMetrics(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  // Stage 1: Get group sessions in window
  const { data: sessions, error: sessErr } = await sb
    .from("raw_hubspot_meeting_activities")
    .select("hubspot_activity_id, hs_timestamp, title")
    .gte("hs_timestamp", `${from}T00:00:00.000Z`)
    .lte("hs_timestamp", `${to}T23:59:59.999Z`)
    .in("activity_type", ["meeting", "MEETING", "call", "CALL"]);

  if (sessErr)
    throw new Error(`attendance sessions query failed: ${sessErr.message}`);

  const groupSessions = (sessions || []).filter((s: Record<string, unknown>) =>
    isGroupSession(String(s.title || ""))
  );

  if (!groupSessions.length) {
    return [
      { kpi_key: "attendance_sessions", funnel_key: "all", value: 0 },
      { kpi_key: "unique_attendees", funnel_key: "all", value: 0 },
      { kpi_key: "new_attendees", funnel_key: "all", value: 0 },
    ];
  }

  const tuesdayIds: string[] = [];
  const thursdayIds: string[] = [];
  const allGroupIds: string[] = [];

  for (const session of groupSessions) {
    const s = session as Record<string, unknown>;
    const id = String(s.hubspot_activity_id);
    allGroupIds.push(id);
    const day = classifyDay(
      String(s.title || ""),
      String(s.hs_timestamp || "")
    );
    if (day === "tuesday") tuesdayIds.push(id);
    else if (day === "thursday") thursdayIds.push(id);
  }

  // Stage 2: Get all associations for these sessions
  const { data: associations, error: assocErr } = await sb
    .from("hubspot_activity_contact_associations")
    .select("hubspot_activity_id, hubspot_contact_id, contact_email")
    .in("hubspot_activity_id", allGroupIds);

  if (assocErr)
    throw new Error(`attendance associations query failed: ${assocErr.message}`);

  const assocRows = (associations || []) as Array<Record<string, unknown>>;
  const totalSessions = assocRows.length;

  // Unique attendees
  const uniqueKeys = new Set<string>();
  for (const row of assocRows) {
    const key = row.hubspot_contact_id
      ? `id:${row.hubspot_contact_id}`
      : `email:${String(row.contact_email || "").toLowerCase()}`;
    if (key !== "email:") uniqueKeys.add(key);
  }

  // Repeat rates per day
  const computeRepeatRate = (sessionIds: string[]): number | null => {
    if (!sessionIds.length) return null;
    const idSet = new Set(sessionIds);
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
      if (count > 1) repeaters++;
    }
    return repeaters / visitCounts.size;
  };

  const tuesdayRepeat = computeRepeatRate(tuesdayIds);
  const thursdayRepeat = computeRepeatRate(thursdayIds);

  // Day-split attendance totals (total, new, repeat per day)
  const dayAttendees = (sessionIds: string[]) => {
    const idSet = new Set(sessionIds);
    const attendeeKeys = new Set<string>();
    let total = 0;
    for (const row of assocRows) {
      if (!idSet.has(String(row.hubspot_activity_id))) continue;
      const key = row.hubspot_contact_id
        ? `id:${row.hubspot_contact_id}`
        : `email:${String(row.contact_email || "").toLowerCase()}`;
      if (key !== "email:") {
        attendeeKeys.add(key);
        total++;
      }
    }
    return { total, uniqueKeys: attendeeKeys };
  };

  const tueDayData = dayAttendees(tuesdayIds);
  const thuDayData = dayAttendees(thursdayIds);

  const results: MetricRow[] = [
    { kpi_key: "attendance_sessions", funnel_key: "all", value: totalSessions },
    {
      kpi_key: "unique_attendees",
      funnel_key: "all",
      value: uniqueKeys.size,
    },
    // Day-split totals
    { kpi_key: "attendance_total", funnel_key: "tuesday", value: tueDayData.total },
    { kpi_key: "attendance_total", funnel_key: "thursday", value: thuDayData.total },
  ];

  if (tuesdayRepeat !== null) {
    results.push({
      kpi_key: "repeat_rate_tuesday",
      funnel_key: "tuesday",
      value: Math.round(tuesdayRepeat * 10000) / 10000,
    });
  }
  if (thursdayRepeat !== null) {
    results.push({
      kpi_key: "repeat_rate_thursday",
      funnel_key: "thursday",
      value: Math.round(thursdayRepeat * 10000) / 10000,
    });
  }

  return results;
}

async function computeNewAttendees(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  // New attendees = people whose first-ever attendance falls within [from, to]
  // Also produces day-split new/repeat counts (tuesday/thursday)

  // Get current-period group sessions with day classification
  const { data: currentSessions } = await sb
    .from("raw_hubspot_meeting_activities")
    .select("hubspot_activity_id, title, hs_timestamp")
    .gte("hs_timestamp", `${from}T00:00:00.000Z`)
    .lte("hs_timestamp", `${to}T23:59:59.999Z`)
    .in("activity_type", ["meeting", "MEETING", "call", "CALL"]);

  const groupSessions = (currentSessions || []).filter(
    (s: Record<string, unknown>) => isGroupSession(String(s.title || ""))
  );

  if (!groupSessions.length) {
    return [
      { kpi_key: "new_attendees", funnel_key: "all", value: 0 },
      { kpi_key: "attendance_new", funnel_key: "tuesday", value: 0 },
      { kpi_key: "attendance_new", funnel_key: "thursday", value: 0 },
      { kpi_key: "attendance_repeat", funnel_key: "tuesday", value: 0 },
      { kpi_key: "attendance_repeat", funnel_key: "thursday", value: 0 },
    ];
  }

  // Map session ID → day
  const sessionDayMap = new Map<string, "tuesday" | "thursday" | null>();
  const allGroupIds: string[] = [];
  for (const s of groupSessions as Array<Record<string, unknown>>) {
    const id = String(s.hubspot_activity_id);
    allGroupIds.push(id);
    sessionDayMap.set(id, classifyDay(String(s.title || ""), String(s.hs_timestamp || "")));
  }

  // Get associations for current-period group sessions
  const { data: currentAssoc, error: curErr } = await sb
    .from("hubspot_activity_contact_associations")
    .select("hubspot_contact_id, contact_email, hubspot_activity_id")
    .in("hubspot_activity_id", allGroupIds);

  if (curErr)
    throw new Error(`new_attendees current query failed: ${curErr.message}`);

  if (!currentAssoc?.length) {
    return [
      { kpi_key: "new_attendees", funnel_key: "all", value: 0 },
      { kpi_key: "attendance_new", funnel_key: "tuesday", value: 0 },
      { kpi_key: "attendance_new", funnel_key: "thursday", value: 0 },
      { kpi_key: "attendance_repeat", funnel_key: "tuesday", value: 0 },
      { kpi_key: "attendance_repeat", funnel_key: "thursday", value: 0 },
    ];
  }

  // Build per-contact, per-day presence map
  const contactDays = new Map<string, Set<string>>(); // contactKey → Set<"tuesday"|"thursday">
  const currentKeys = new Set<string>();
  for (const row of currentAssoc as Array<Record<string, unknown>>) {
    const key = row.hubspot_contact_id
      ? `id:${row.hubspot_contact_id}`
      : `email:${String(row.contact_email || "").toLowerCase()}`;
    if (key === "email:") continue;
    currentKeys.add(key);
    const day = sessionDayMap.get(String(row.hubspot_activity_id));
    if (day) {
      if (!contactDays.has(key)) contactDays.set(key, new Set());
      contactDays.get(key)!.add(day);
    }
  }

  // Check which of these had attendance before `from`
  const priorSessionIds =
    (
      await sb
        .from("raw_hubspot_meeting_activities")
        .select("hubspot_activity_id")
        .lt("hs_timestamp", `${from}T00:00:00.000Z`)
        .in("activity_type", ["meeting", "MEETING", "call", "CALL"])
    ).data?.map((r: Record<string, unknown>) => r.hubspot_activity_id) || [];

  const priorKeys = new Set<string>();
  if (priorSessionIds.length) {
    const { data: priorAssoc } = await sb
      .from("hubspot_activity_contact_associations")
      .select("hubspot_contact_id, contact_email")
      .in("hubspot_activity_id", priorSessionIds);

    for (const row of (priorAssoc || []) as Array<Record<string, unknown>>) {
      const key = row.hubspot_contact_id
        ? `id:${row.hubspot_contact_id}`
        : `email:${String(row.contact_email || "").toLowerCase()}`;
      if (key !== "email:") priorKeys.add(key);
    }
  }

  let newTotal = 0;
  const dayCounts = {
    tuesday: { newCount: 0, repeatCount: 0 },
    thursday: { newCount: 0, repeatCount: 0 },
  };

  for (const key of currentKeys) {
    const isNew = !priorKeys.has(key);
    if (isNew) newTotal++;
    const days = contactDays.get(key);
    if (days) {
      for (const day of days) {
        if (day === "tuesday" || day === "thursday") {
          if (isNew) dayCounts[day].newCount++;
          else dayCounts[day].repeatCount++;
        }
      }
    }
  }

  return [
    { kpi_key: "new_attendees", funnel_key: "all", value: newTotal },
    { kpi_key: "attendance_new", funnel_key: "tuesday", value: dayCounts.tuesday.newCount },
    { kpi_key: "attendance_new", funnel_key: "thursday", value: dayCounts.thursday.newCount },
    { kpi_key: "attendance_repeat", funnel_key: "tuesday", value: dayCounts.tuesday.repeatCount },
    { kpi_key: "attendance_repeat", funnel_key: "thursday", value: dayCounts.thursday.repeatCount },
  ];
}

async function computeDonationMetrics(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  const { data, error } = await sb
    .from("donation_transactions_unified")
    .select("amount, donated_at, is_recurring, donor_email")
    .gte("donated_at", `${from}T00:00:00.000Z`)
    .lte("donated_at", `${to}T23:59:59.999Z`);

  if (error) throw new Error(`donations query failed: ${error.message}`);

  const rows = data || [];
  let total = 0;
  let recurringTotal = 0;
  const donorEmails = new Set<string>();

  for (const row of rows as Array<Record<string, unknown>>) {
    const amount = Number(row.amount);
    if (Number.isFinite(amount)) {
      total += amount;
      if (row.is_recurring) recurringTotal += amount;
    }
    const email = String(row.donor_email || "").toLowerCase().trim();
    if (email) donorEmails.add(email);
  }

  return [
    { kpi_key: "donations_total", funnel_key: "all", value: total },
    { kpi_key: "donations_count", funnel_key: "all", value: rows.length },
    { kpi_key: "active_donors", funnel_key: "all", value: donorEmails.size },
    {
      kpi_key: "recurring_revenue",
      funnel_key: "all",
      value: recurringTotal,
    },
  ];
}

async function computeEmailMetrics(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  const { data, error } = await sb
    .from("mailchimp_campaigns")
    .select("human_open_rate, click_rate, send_time")
    .gte("send_time", `${from}T00:00:00.000Z`)
    .lte("send_time", `${to}T23:59:59.999Z`);

  if (error) throw new Error(`email metrics query failed: ${error.message}`);

  const rows = data || [];
  if (!rows.length) return [];

  const openRates = rows
    .map((r: Record<string, unknown>) => Number(r.human_open_rate))
    .filter(Number.isFinite);
  const clickRates = rows
    .map((r: Record<string, unknown>) => Number(r.click_rate))
    .filter(Number.isFinite);

  const results: MetricRow[] = [];
  if (openRates.length) {
    const avg = openRates.reduce((s, v) => s + v, 0) / openRates.length;
    results.push({
      kpi_key: "email_open_rate",
      funnel_key: "all",
      value: Math.round(avg * 10000) / 10000,
    });
  }
  if (clickRates.length) {
    const avg = clickRates.reduce((s, v) => s + v, 0) / clickRates.length;
    results.push({
      kpi_key: "email_click_rate",
      funnel_key: "all",
      value: Math.round(avg * 10000) / 10000,
    });
  }

  return results;
}

async function computeSeoMetrics(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  const { data, error } = await sb
    .from("vw_seo_channel_daily")
    .select("organic")
    .gte("metric_date", from)
    .lte("metric_date", to);

  if (error) throw new Error(`seo query failed: ${error.message}`);

  const total = (data || []).reduce((sum: number, row: Record<string, unknown>) => {
    const v = Number(row.organic);
    return Number.isFinite(v) ? sum + v : sum;
  }, 0);

  return [
    { kpi_key: "seo_organic_sessions", funnel_key: "all", value: total },
  ];
}

async function computeOperationsMetrics(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  // Sync errors
  const { data: errors, error: errErr } = await sb
    .from("hubspot_sync_errors")
    .select("id")
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lte("created_at", `${to}T23:59:59.999Z`);

  if (errErr) throw new Error(`sync_errors query failed: ${errErr.message}`);

  const results: MetricRow[] = [
    {
      kpi_key: "sync_errors",
      funnel_key: "all",
      value: (errors || []).length,
    },
  ];

  // Sync freshness: minutes since most recent sync
  const { data: latest } = await sb
    .from("raw_hubspot_contacts")
    .select("ingested_at")
    .order("ingested_at", { ascending: false })
    .limit(1);

  if (latest?.length) {
    const lastSync = new Date(
      String((latest[0] as Record<string, unknown>).ingested_at)
    );
    const nowMs = Date.now();
    const freshness = Math.round((nowMs - lastSync.getTime()) / 60_000);
    if (Number.isFinite(freshness) && freshness >= 0) {
      results.push({
        kpi_key: "sync_freshness_minutes",
        funnel_key: "all",
        value: freshness,
      });
    }
  }

  return results;
}

async function computeOutreachMetrics(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  // Outreach emails delivered
  const { count: sentCount, error: sentErr } = await sb
    .from("recovery_events")
    .select("*", { count: "exact", head: true })
    .gte("delivered_at", `${from}T00:00:00.000Z`)
    .lte("delivered_at", `${to}T23:59:59.999Z`);

  if (sentErr)
    throw new Error(`outreach_sent query failed: ${sentErr.message}`);

  const results: MetricRow[] = [
    { kpi_key: "outreach_sent", funnel_key: "all", value: sentCount ?? 0 },
  ];

  // Conversion: people who received outreach AND returned to a session after
  if (sentCount && sentCount > 0) {
    const { data: outreachRecipients } = await sb
      .from("recovery_events")
      .select("attendee_email")
      .gte("delivered_at", `${from}T00:00:00.000Z`)
      .lte("delivered_at", `${to}T23:59:59.999Z`);

    const emails = [
      ...new Set(
        (outreachRecipients || []).map((r: Record<string, unknown>) =>
          String(r.attendee_email || "").toLowerCase()
        )
      ),
    ].filter(Boolean);

    if (emails.length) {
      // Check which emailed people showed up after their outreach
      const { data: returnAssoc } = await sb
        .from("hubspot_activity_contact_associations")
        .select("contact_email")
        .in("contact_email", emails)
        .in(
          "hubspot_activity_id",
          (
            await sb
              .from("raw_hubspot_meeting_activities")
              .select("hubspot_activity_id")
              .gte("hs_timestamp", `${from}T00:00:00.000Z`)
              .lte("hs_timestamp", `${to}T23:59:59.999Z`)
              .in("activity_type", ["meeting", "MEETING", "call", "CALL"])
          ).data?.map(
            (r: Record<string, unknown>) => r.hubspot_activity_id
          ) || []
        );

      const returnedEmails = new Set(
        (returnAssoc || []).map((r: Record<string, unknown>) =>
          String(r.contact_email || "").toLowerCase()
        )
      );

      const conversionRate =
        emails.length > 0 ? returnedEmails.size / emails.length : 0;
      results.push({
        kpi_key: "outreach_conversion_rate",
        funnel_key: "all",
        value: Math.round(conversionRate * 10000) / 10000,
      });
    }
  }

  return results;
}

async function computeCompletedItems(
  sb: SupabaseClient,
  from: string,
  to: string
): Promise<MetricRow[]> {
  // Notion tasks completed in window (matches dashboard operationsCompletedItems)
  const { count, error } = await sb
    .from("notion_todos")
    .select("*", { count: "exact", head: true })
    .in("status", ["Done", "Completed"])
    .gte("updated_at", `${from}T00:00:00.000Z`)
    .lte("updated_at", `${to}T23:59:59.999Z`);

  if (error)
    throw new Error(`completed_items query failed: ${error.message}`);

  return [
    { kpi_key: "completed_items", funnel_key: "all", value: count ?? 0 },
  ];
}

// ---------------------------------------------------------------------------
// Composite metrics (CPL, CPQL, CPGL) — including per-funnel
// ---------------------------------------------------------------------------
function computeComposites(metrics: MetricRow[]): MetricRow[] {
  const lookup = new Map<string, number>();
  for (const m of metrics) {
    lookup.set(`${m.kpi_key}:${m.funnel_key}`, m.value);
  }

  const results: MetricRow[] = [];
  const safeDiv = (num: number, den: number): number | null =>
    den > 0 && num > 0 ? Math.round((num / den) * 100) / 100 : null;

  // All-funnel composites
  const adSpendAll = lookup.get("ad_spend:all") ?? 0;
  const leadsAll = lookup.get("leads_created:all") ?? 0;
  const qualAll = lookup.get("qualified_leads_created:all") ?? 0;
  const pqAll = lookup.get("phoenix_qualified_leads:all") ?? 0;

  const cplAll = safeDiv(adSpendAll, leadsAll);
  if (cplAll !== null) results.push({ kpi_key: "cpl", funnel_key: "all", value: cplAll });
  const cpqlAll = safeDiv(adSpendAll, qualAll);
  if (cpqlAll !== null) results.push({ kpi_key: "cpql", funnel_key: "all", value: cpqlAll });
  const cpglAll = safeDiv(adSpendAll, pqAll);
  if (cpglAll !== null) results.push({ kpi_key: "cpgl", funnel_key: "all", value: cpglAll });

  // Free funnel: CPQL = free ad spend / free qualified, CPGL = free ad spend / free great
  const freeSpend = lookup.get("ad_spend:free") ?? 0;
  const freeQual = lookup.get("qualified_leads_created:free") ?? 0;
  const freeGreat = lookup.get("great_leads:free") ?? 0;

  const freeCpql = safeDiv(freeSpend, freeQual);
  if (freeCpql !== null) results.push({ kpi_key: "cpql", funnel_key: "free", value: freeCpql });
  const freeCpgl = safeDiv(freeSpend, freeGreat);
  if (freeCpgl !== null) results.push({ kpi_key: "cpgl", funnel_key: "free", value: freeCpgl });

  // Phoenix funnel: CPQL = phoenix spend / phoenix_qualified, CPGL = phoenix spend / phoenix great
  const phxSpend = lookup.get("ad_spend:phoenix") ?? 0;
  const phxQual = lookup.get("phoenix_qualified_leads:phoenix") ?? 0;
  const phxGreat = lookup.get("great_leads:phoenix") ?? 0;

  const phxCpql = safeDiv(phxSpend, phxQual);
  if (phxCpql !== null) results.push({ kpi_key: "cpql", funnel_key: "phoenix", value: phxCpql });
  const phxCpgl = safeDiv(phxSpend, phxGreat);
  if (phxCpgl !== null) results.push({ kpi_key: "cpgl", funnel_key: "phoenix", value: phxCpgl });

  return results;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------
async function computeAllMetrics(
  sb: SupabaseClient,
  targetDate: string
): Promise<{ metrics: MetricRow[]; errors: string[] }> {
  const from = targetDate;
  const to = targetDate;
  const allMetrics: MetricRow[] = [];
  const errors: string[] = [];

  const runners: Array<{
    name: string;
    fn: () => Promise<MetricRow[]>;
  }> = [
    { name: "leads", fn: () => computeLeadsMetrics(sb, from, to) },
    {
      name: "phoenix_paid_members",
      fn: () => computePhoenixPaidMembers(sb, from, to),
    },
    { name: "interviews", fn: () => computeInterviews(sb, from, to) },
    { name: "ad_metrics", fn: () => computeAdMetrics(sb, from, to) },
    { name: "attendance", fn: () => computeAttendanceMetrics(sb, from, to) },
    { name: "new_attendees", fn: () => computeNewAttendees(sb, from, to) },
    { name: "donations", fn: () => computeDonationMetrics(sb, from, to) },
    { name: "email", fn: () => computeEmailMetrics(sb, from, to) },
    { name: "seo", fn: () => computeSeoMetrics(sb, from, to) },
    { name: "operations", fn: () => computeOperationsMetrics(sb, from, to) },
    { name: "outreach", fn: () => computeOutreachMetrics(sb, from, to) },
    { name: "completed_items", fn: () => computeCompletedItems(sb, from, to) },
  ];

  // Run all metric computers in parallel
  const results = await Promise.allSettled(runners.map((r) => r.fn()));

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      allMetrics.push(...result.value);
    } else {
      const errMsg = `${runners[i].name}: ${result.reason?.message || result.reason}`;
      console.error(`Metric computation failed: ${errMsg}`);
      errors.push(errMsg);
    }
  }

  // Add composite metrics
  allMetrics.push(...computeComposites(allMetrics));

  return { metrics: allMetrics, errors };
}

async function upsertMetrics(
  sb: SupabaseClient,
  targetDate: string,
  metrics: MetricRow[]
): Promise<number> {
  if (!metrics.length) return 0;

  const payload = metrics.map((m) => ({
    metric_date: targetDate,
    kpi_key: m.kpi_key,
    funnel_key: m.funnel_key,
    value: m.value,
    computed_at: new Date().toISOString(),
  }));

  const { error } = await sb.from("fact_kpi_daily").upsert(payload, {
    onConflict: "metric_date,kpi_key,funnel_key",
  });

  if (error) throw new Error(`fact_kpi_daily upsert failed: ${error.message}`);
  return payload.length;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = mustGetEnv("SUPABASE_URL");
    const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey);

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const url = new URL(req.url);
    const targetDateParam =
      (body.target_date as string) ||
      url.searchParams.get("target_date") ||
      "";
    const backfillFrom =
      (body.backfill_from as string) ||
      url.searchParams.get("backfill_from") ||
      "";

    // Build list of dates to compute
    const dates: string[] = [];
    const yesterday = addDays(isoDate(new Date()), -1);

    if (backfillFrom && /^\d{4}-\d{2}-\d{2}$/.test(backfillFrom)) {
      let cursor = backfillFrom;
      const end = targetDateParam || yesterday;
      while (cursor <= end) {
        dates.push(cursor);
        cursor = addDays(cursor, 1);
      }
    } else if (targetDateParam && /^\d{4}-\d{2}-\d{2}$/.test(targetDateParam)) {
      dates.push(targetDateParam);
    } else {
      dates.push(yesterday);
    }

    console.log(
      `compute-metrics: computing ${dates.length} date(s): ${dates[0]}${dates.length > 1 ? ` to ${dates[dates.length - 1]}` : ""}`
    );

    const summary: Array<{
      date: string;
      metrics_count: number;
      errors: string[];
    }> = [];

    for (const date of dates) {
      const { metrics, errors } = await computeAllMetrics(sb, date);
      const upserted = await upsertMetrics(sb, date, metrics);
      summary.push({ date, metrics_count: upserted, errors });
      console.log(
        `  ${date}: ${upserted} metrics upserted, ${errors.length} errors`
      );
    }

    const totalErrors = summary.reduce((s, d) => s + d.errors.length, 0);
    const totalMetrics = summary.reduce((s, d) => s + d.metrics_count, 0);

    return new Response(
      JSON.stringify({
        ok: totalErrors === 0,
        dates_computed: dates.length,
        total_metrics_upserted: totalMetrics,
        total_errors: totalErrors,
        summary,
      }),
      {
        status: totalErrors > 0 ? 207 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("compute-metrics fatal error:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
