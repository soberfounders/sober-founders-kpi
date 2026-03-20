import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type HubspotObjectType = "contacts" | "deals" | "calls" | "meetings";
export type SyncRunType =
  | "webhook_worker"
  | "incremental"
  | "reconcile_hourly"
  | "reconcile_daily"
  | "backfill";

export const HUBSPOT_OBJECT_TYPES: HubspotObjectType[] = ["contacts", "deals", "calls", "meetings"];

const CONTACT_PROPERTIES = [
  "createdate",
  "email",
  "firstname",
  "lastname",
  "annual_revenue_in_dollars__official_",
  "annual_revenue_in_dollars",
  "annual_revenue",
  "annual_revenue_",
  "annual_revenue_100k_minimum_to_participate",
  "annual_revenue_250k_minimum_to_participate",
  "what_is_your_annual_revenue_250k_minimum_to_participate",
  "lead_ad_prop1",
  "sobriety_date",
  "sobriety_date__official_",
  "sobriety_date_mmddyyyy",
  "lead_ad_prop0",
  "sober_date",
  "clean_date",
  "membership_s_",
  "membership_s",
  "hs_additional_emails",
  "hs_analytics_source",
  "hs_analytics_source_data_1",
  "hs_analytics_source_data_2",
  "hs_latest_source",
  "hs_latest_source_data_1",
  "hs_latest_source_data_2",
  "first_conversion_event_name",
  "recent_conversion_event_name",
  "engagements_last_meeting_booked_campaign",
  "engagements_last_meeting_booked_medium",
  "engagements_last_meeting_booked_source",
  "num_conversion_events",
  "num_unique_conversion_events",
  "hs_latest_form_submission_name",
  "hs_latest_form_submitted_at",
  "campaign_source",
  "hs_analytics_first_touch_converting_campaign",
  "hs_analytics_last_touch_converting_campaign",
  "hs_analytics_first_url",
  "hs_analytics_last_url",
  "hs_analytics_first_referrer",
  "hs_analytics_last_referrer",
  "hs_analytics_first_visit_timestamp",
  "hs_analytics_num_page_views",
  "hs_lastmodifieddate",
  "hs_merged_object_ids",
];

const DEAL_PROPERTIES = [
  "createdate",
  "closedate",
  "dealname",
  "amount",
  "pipeline",
  "dealstage",
  "hubspot_owner_id",
  "hs_lastmodifieddate",
];

const ACTIVITY_PROPERTIES = [
  "hs_timestamp",
  "hs_meeting_title",
  "hs_call_title",
  "hs_body_preview",
  "hubspot_owner_id",
  "createdate",
  "hs_lastmodifieddate",
];

const ASSOCIATION_CONTACT_PROPERTIES = [
  "email",
  "firstname",
  "lastname",
  "createdate",
  "annual_revenue_in_dollars__official_",
  "annual_revenue_in_dollars",
  "annual_revenue",
  "annual_revenue_",
  "annual_revenue_100k_minimum_to_participate",
  "annual_revenue_250k_minimum_to_participate",
  "what_is_your_annual_revenue_250k_minimum_to_participate",
  "lead_ad_prop1",
  "sobriety_date",
  "sobriety_date__official_",
  "sobriety_date_mmddyyyy",
  "lead_ad_prop0",
  "sober_date",
  "clean_date",
  "membership_s",
  "membership_s_",
  "hs_additional_emails",
  "hs_analytics_source",
  "hs_analytics_source_data_1",
  "hs_analytics_source_data_2",
  "hs_latest_source",
  "hs_latest_source_data_1",
  "hs_latest_source_data_2",
  "first_conversion_event_name",
  "recent_conversion_event_name",
  "engagements_last_meeting_booked_campaign",
  "engagements_last_meeting_booked_medium",
  "engagements_last_meeting_booked_source",
  "num_conversion_events",
  "num_unique_conversion_events",
  "hs_analytics_first_url",
  "hs_analytics_last_url",
  "hs_analytics_first_referrer",
  "hs_analytics_last_referrer",
  "hs_analytics_first_visit_timestamp",
  "hs_analytics_num_page_views",
  "hs_lastmodifieddate",
  "hs_merged_object_ids",
];

export function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(dateIso: string, minutes: number): string {
  const date = new Date(dateIso);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

export function addDays(dateIso: string, days: number): string {
  const date = new Date(dateIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function subtractMinutes(dateIso: string, minutes: number): string {
  return addMinutes(dateIso, -Math.abs(minutes));
}

function isNumericString(value: string): boolean {
  return /^\d+$/.test(value);
}

export function parseHubspotTime(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return new Date(value).toISOString();
    if (value > 1_000_000_000) return new Date(value * 1000).toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  if (isNumericString(text)) {
    const n = Number(text);
    if (!Number.isFinite(n)) return null;
    if (n > 1_000_000_000_000) return new Date(n).toISOString();
    if (n > 1_000_000_000) return new Date(n * 1000).toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function toMs(isoLike: string): number {
  const n = new Date(isoLike).getTime();
  if (!Number.isFinite(n)) throw new Error(`Invalid date: ${isoLike}`);
  return n;
}

function toNumberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstPresent(props: Record<string, any>, keys: string[]): any {
  for (const key of keys) {
    const value = props?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function stringOrNull(value: any): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * Parse messy sobriety date strings from lead ad fields.
 * Handles: "01/01/2026", "12/04/2008", "02/24/2017", "11/11/25",
 * "01052009" (MMDDYYYY), "043013" (MMDDYY), "3/7723" (junk), "0102" (junk),
 * "12-25-2002", "12/2/2011", "08/07/17"
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
function parseLeadAdSobrietyDate(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === "invalid date") return null;

  // Try MM/DD/YYYY or MM-DD-YYYY (most common)
  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1950 && d.getFullYear() <= 2030) {
      return d.toISOString().split("T")[0];
    }
  }

  // Try MM/DD/YY or MM-DD-YY (e.g., "08/07/17", "11/11/25")
  const shortYearMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (shortYearMatch) {
    const [, mm, dd, yy] = shortYearMatch;
    // 2-digit year: 00-30 = 2000s, 31-99 = 1900s
    const century = Number(yy) <= 30 ? 2000 : 1900;
    const yyyy = century + Number(yy);
    const d = new Date(yyyy, Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1950 && d.getFullYear() <= 2030) {
      return d.toISOString().split("T")[0];
    }
  }

  // Try MMDDYYYY (8 digits, e.g., "01052009")
  const eightDigit = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (eightDigit) {
    const [, mm, dd, yyyy] = eightDigit;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1950 && d.getFullYear() <= 2030) {
      return d.toISOString().split("T")[0];
    }
  }

  // Try MMDDYY (6 digits, e.g., "043013")
  const sixDigit = raw.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (sixDigit) {
    const [, mm, dd, yy] = sixDigit;
    const century = Number(yy) <= 30 ? 2000 : 1900;
    const yyyy = century + Number(yy);
    const d = new Date(yyyy, Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1950 && d.getFullYear() <= 2030) {
      return d.toISOString().split("T")[0];
    }
  }

  return null;
}

/**
 * Parse revenue range strings from lead ad fields.
 * Handles: "$1m_-_$5m", "$5m_-_$25m", "<_$1m", "$250k_-_$1m",
 * "10000000" (raw number), "250k", "25,000,000"
 * Returns the lower bound as a number, or null.
 */
function parseLeadAdRevenue(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;

  // Direct number (possibly with commas)
  const cleaned = raw.replace(/[,$]/g, "");
  const direct = Number(cleaned);
  if (Number.isFinite(direct) && direct > 0) return direct;

  // "250k" style
  const kMatch = raw.match(/^[\$]?(\d+(?:\.\d+)?)k$/);
  if (kMatch) return Number(kMatch[1]) * 1000;

  // Range format: "$1m_-_$5m" or "$250k_-_$1m"
  const rangeMatch = raw.match(/[\$]?([\d.]+)(k|m)?[_\s]*-[_\s]*[\$]?([\d.]+)(k|m)?/);
  if (rangeMatch) {
    const lowVal = Number(rangeMatch[1]);
    const lowMult = rangeMatch[2] === "m" ? 1_000_000 : rangeMatch[2] === "k" ? 1_000 : 1;
    return lowVal * lowMult;
  }

  // "<_$1m" or "<_$250k" — use the value as an upper bound, return null (below threshold)
  if (raw.startsWith("<")) return null;

  return null;
}

function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(value).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${parts.join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256PayloadHash(payload: any): Promise<string> {
  return await sha256Hex(stableStringify(payload ?? {}));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function hmacSha256Base64(secret: string, source: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(source));
  return bytesToBase64(new Uint8Array(signature));
}

export function buildSupabaseAdminClient() {
  return createClient(
    mustGetEnv("SUPABASE_URL"),
    mustGetEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function fetchWithHubspotRetry(
  token: string,
  url: string,
  options: RequestInit = {},
  retries = 4,
): Promise<Response> {
  let attempt = 0;
  let lastError: any = null;
  while (attempt <= retries) {
    attempt += 1;
    try {
      const resp = await fetch(url, {
        ...options,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...(options.headers || {}),
        },
      });

      if (resp.status === 429 || resp.status >= 500) {
        if (attempt <= retries) {
          const retryAfterHeader = resp.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
          const backoffMs = Math.max(retryAfterMs, attempt * 750);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
      }

      return resp;
    } catch (e: any) {
      lastError = e;
      if (attempt > retries) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }

  throw new Error(`HubSpot request failed after retries: ${String(lastError?.message || lastError || "unknown")}`);
}

export function updatedAtFromObject(obj: any): string | null {
  const props = obj?.properties || {};
  return (
    parseHubspotTime(props?.hs_lastmodifieddate) ||
    parseHubspotTime(obj?.updatedAt) ||
    parseHubspotTime(props?.lastmodifieddate) ||
    parseHubspotTime(props?.createdate) ||
    parseHubspotTime(obj?.createdAt)
  );
}

export function createdAtFromObject(obj: any): string | null {
  const props = obj?.properties || {};
  return parseHubspotTime(props?.createdate) || parseHubspotTime(obj?.createdAt);
}

function isUpdatedBetween(obj: any, fromIso: string, toIso: string): boolean {
  const updated = updatedAtFromObject(obj);
  if (!updated) return false;
  const ts = toMs(updated);
  return ts >= toMs(fromIso) && ts <= toMs(toIso);
}

function objectApiName(objectType: HubspotObjectType): string {
  if (objectType === "calls") return "calls";
  if (objectType === "meetings") return "meetings";
  if (objectType === "deals") return "deals";
  return "contacts";
}

function objectProperties(objectType: HubspotObjectType): string[] {
  if (objectType === "contacts") return CONTACT_PROPERTIES;
  if (objectType === "deals") return DEAL_PROPERTIES;
  return ACTIVITY_PROPERTIES;
}

export async function hubspotGetObjectById(
  token: string,
  objectType: HubspotObjectType,
  objectId: string | number,
): Promise<any | null> {
  const api = objectApiName(objectType);
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/${api}/${objectId}`);
  url.searchParams.set("archived", "true");
  url.searchParams.set("properties", objectProperties(objectType).join(","));

  const resp = await fetchWithHubspotRetry(token, url.toString(), { method: "GET" });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HubSpot get ${objectType}/${objectId} failed: ${resp.status} ${text}`);
  }

  return await resp.json();
}

async function hubspotSearchUpdated(
  token: string,
  objectType: HubspotObjectType,
  fromIso: string,
  toIso: string,
): Promise<any[]> {
  const api = objectApiName(objectType);
  const url = `https://api.hubapi.com/crm/v3/objects/${api}/search`;
  const properties = objectProperties(objectType);
  const filterGroups = [{
    filters: [
      { propertyName: "hs_lastmodifieddate", operator: "GTE", value: String(toMs(fromIso)) },
      { propertyName: "hs_lastmodifieddate", operator: "LTE", value: String(toMs(toIso)) },
    ],
  }];

  const out: any[] = [];
  let after: string | undefined = undefined;
  for (let page = 0; page < 1200; page += 1) {
    const body: any = {
      limit: 100,
      properties,
      filterGroups,
      sorts: ["hs_lastmodifieddate"],
    };
    if (after) body.after = after;

    const resp = await fetchWithHubspotRetry(token, url, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HubSpot search ${objectType} failed: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    out.push(...(json?.results || []));
    const nextAfter = json?.paging?.next?.after;
    if (!nextAfter) break;
    after = String(nextAfter);
  }
  return out;
}

async function hubspotListAndFilterUpdated(
  token: string,
  objectType: HubspotObjectType,
  fromIso: string,
  toIso: string,
  archived = false,
): Promise<any[]> {
  const api = objectApiName(objectType);
  const properties = objectProperties(objectType);
  const out: any[] = [];
  let after: string | undefined = undefined;

  for (let page = 0; page < 3000; page += 1) {
    const url = new URL(`https://api.hubapi.com/crm/v3/objects/${api}`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("archived", archived ? "true" : "false");
    url.searchParams.set("properties", properties.join(","));
    if (after) url.searchParams.set("after", after);

    const resp = await fetchWithHubspotRetry(token, url.toString(), { method: "GET" });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HubSpot list ${objectType} failed: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    const rows = Array.isArray(json?.results) ? json.results : [];
    for (const row of rows) {
      if (isUpdatedBetween(row, fromIso, toIso)) out.push(row);
    }
    const nextAfter = json?.paging?.next?.after;
    if (!nextAfter) break;
    after = String(nextAfter);
  }

  return out;
}

export async function hubspotPullObjectsByUpdatedRange(
  token: string,
  objectType: HubspotObjectType,
  fromIso: string,
  toIso: string,
): Promise<any[]> {
  const rangeMs = Math.max(0, toMs(toIso) - toMs(fromIso));
  const shouldUseContactListFallback =
    objectType === "contacts" && rangeMs >= (24 * 60 * 60 * 1000);
  try {
    const searched = await hubspotSearchUpdated(token, objectType, fromIso, toIso);
    if (shouldUseContactListFallback && searched.length === 0) {
      return await hubspotListAndFilterUpdated(token, objectType, fromIso, toIso, false);
    }
    return searched;
  } catch (e: any) {
    const shouldFallback =
      objectType === "calls" ||
      objectType === "meetings" ||
      shouldUseContactListFallback;
    if (!shouldFallback) throw e;
    return await hubspotListAndFilterUpdated(token, objectType, fromIso, toIso, false);
  }
}

export async function hubspotListAllActiveIds(
  token: string,
  objectType: HubspotObjectType,
): Promise<Set<string>> {
  const api = objectApiName(objectType);
  const ids = new Set<string>();
  let after: string | undefined = undefined;
  for (let page = 0; page < 6000; page += 1) {
    const url = new URL(`https://api.hubapi.com/crm/v3/objects/${api}`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("archived", "false");
    if (after) url.searchParams.set("after", after);

    const resp = await fetchWithHubspotRetry(token, url.toString(), { method: "GET" });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HubSpot list active ids ${objectType} failed: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    const rows = Array.isArray(json?.results) ? json.results : [];
    for (const row of rows) {
      if (row?.id !== null && row?.id !== undefined) ids.add(String(row.id));
    }
    const nextAfter = json?.paging?.next?.after;
    if (!nextAfter) break;
    after = String(nextAfter);
  }
  return ids;
}

export async function hubspotFetchActivityAssociations(
  token: string,
  objectType: "calls" | "meetings",
  objectIds: Array<string | number>,
): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  const api = objectApiName(objectType);
  const cleanIds = objectIds.map((id) => String(id)).filter(Boolean);
  if (!cleanIds.length) return out;

  for (let i = 0; i < cleanIds.length; i += 100) {
    const chunk = cleanIds.slice(i, i + 100);
    const resp = await fetchWithHubspotRetry(
      token,
      `https://api.hubapi.com/crm/v3/associations/${api}/contacts/batch/read`,
      {
        method: "POST",
        body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HubSpot activity associations failed for ${objectType}: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    for (const row of json?.results || []) {
      const fromId = String(row?.from?.id || "");
      if (!fromId) continue;
      const toRows = Array.isArray(row?.to) ? row.to : [];
      const prev = out.get(fromId) || [];
      out.set(fromId, prev.concat(toRows));
    }
  }
  return out;
}

export async function hubspotBatchReadContacts(
  token: string,
  contactIds: Array<string | number>,
): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const cleanIds = contactIds.map((id) => String(id)).filter(Boolean);
  if (!cleanIds.length) return out;

  for (let i = 0; i < cleanIds.length; i += 100) {
    const chunk = cleanIds.slice(i, i + 100);
    const resp = await fetchWithHubspotRetry(
      token,
      "https://api.hubapi.com/crm/v3/objects/contacts/batch/read",
      {
        method: "POST",
        body: JSON.stringify({
          properties: ASSOCIATION_CONTACT_PROPERTIES,
          inputs: chunk.map((id) => ({ id })),
        }),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HubSpot batch read contacts failed: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    for (const row of json?.results || []) {
      out.set(String(row?.id || ""), row);
    }
  }
  return out;
}

function parseMergedIds(raw: any): bigint[] {
  if (raw === null || raw === undefined) return [];
  const text = String(raw);
  if (!text.trim()) return [];
  return Array.from(new Set(
    text.split(/[;,]/g)
      .map((v) => v.trim())
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => BigInt(Math.trunc(n))),
  ));
}

export async function mapContactRow(
  obj: any,
  syncSource: string,
): Promise<any | null> {
  const id = Number(obj?.id);
  if (!Number.isFinite(id)) return null;
  const props = obj?.properties || {};
  const createdAt = parseHubspotTime(props?.createdate || obj?.createdAt);
  const updatedAt = updatedAtFromObject(obj);
  const officialRevenueRaw = firstPresent(props, [
    "annual_revenue_in_dollars__official_",
    "annual_revenue_in_usd_official",
  ]);
  const fallbackRevenueRaw = firstPresent(props, ["annual_revenue_in_dollars"]);
  const officialRevenue = toNumberOrNull(officialRevenueRaw);
  const fallbackRevenue = toNumberOrNull(fallbackRevenueRaw);
  // Lead ad revenue fields: try parsing range strings and raw values
  const leadAdRevenue = officialRevenue ?? fallbackRevenue ?? (() => {
    const leadAdFields = [
      "lead_ad_prop1",
      "annual_revenue_100k_minimum_to_participate",
      "annual_revenue_250k_minimum_to_participate",
      "what_is_your_annual_revenue_250k_minimum_to_participate",
      "annual_revenue_",
      "annual_revenue",
    ];
    for (const field of leadAdFields) {
      const parsed = parseLeadAdRevenue(props?.[field]);
      if (parsed !== null) return parsed;
    }
    return null;
  })();
  const annualRevenue = officialRevenue ?? fallbackRevenue ?? leadAdRevenue;
  const hsSource = firstPresent(props, ["hs_analytics_source"]);
  const campaign = firstPresent(props, [
    "hs_analytics_first_touch_converting_campaign",
    "hs_analytics_last_touch_converting_campaign",
  ]);
  const membership = firstPresent(props, ["membership_s_", "membership_s"]);
  // Official sobriety date fields first (already ISO format)
  const officialSobrietyDate = firstPresent(props, [
    "sobriety_date",
    "sobriety_date__official_",
    "sober_date",
    "clean_date",
  ]);
  // Lead ad sobriety date fields (messy MM/DD/YYYY strings)
  const leadAdSobrietyDate = !officialSobrietyDate
    ? (parseLeadAdSobrietyDate(props?.sobriety_date_mmddyyyy)
      ?? parseLeadAdSobrietyDate(props?.lead_ad_prop0))
    : null;
  const sobrietyDate = officialSobrietyDate ?? leadAdSobrietyDate;
  const mergedIdsRaw = firstPresent(props, ["hs_merged_object_ids"]);
  const payloadHash = await sha256PayloadHash(obj);
  const archived = !!obj?.archived;
  const deletedAt = archived
    ? (parseHubspotTime(obj?.archivedAt) || updatedAt || nowIso())
    : null;

  return {
    hubspot_contact_id: id,
    ingested_at: nowIso(),
    createdate: createdAt,
    email: stringOrNull(props?.email),
    firstname: stringOrNull(props?.firstname),
    lastname: stringOrNull(props?.lastname),
    annual_revenue_in_dollars: annualRevenue,
    annual_revenue_in_dollars__official_: officialRevenue,
    sobriety_date: stringOrNull(sobrietyDate),
    membership_s: stringOrNull(membership),
    hs_additional_emails: stringOrNull(props?.hs_additional_emails),
    original_traffic_source: stringOrNull(hsSource),
    campaign: stringOrNull(campaign),
    campaign_source: stringOrNull(props?.campaign_source),
    hs_analytics_source: stringOrNull(hsSource),
    hs_analytics_source_data_1: stringOrNull(props?.hs_analytics_source_data_1),
    hs_analytics_source_data_2: stringOrNull(props?.hs_analytics_source_data_2),
    hs_latest_form_submission_name: stringOrNull(props?.hs_latest_form_submission_name),
    hs_latest_form_submitted_at: parseHubspotTime(props?.hs_latest_form_submitted_at),
    hs_latest_source: stringOrNull(props?.hs_latest_source),
    hs_latest_source_data_1: stringOrNull(props?.hs_latest_source_data_1),
    hs_latest_source_data_2: stringOrNull(props?.hs_latest_source_data_2),
    first_conversion_event_name: stringOrNull(props?.first_conversion_event_name),
    recent_conversion_event_name: stringOrNull(props?.recent_conversion_event_name),
    engagements_last_meeting_booked_campaign: stringOrNull(props?.engagements_last_meeting_booked_campaign),
    engagements_last_meeting_booked_medium: stringOrNull(props?.engagements_last_meeting_booked_medium),
    engagements_last_meeting_booked_source: stringOrNull(props?.engagements_last_meeting_booked_source),
    num_conversion_events: toNumberOrNull(props?.num_conversion_events),
    num_unique_conversion_events: toNumberOrNull(props?.num_unique_conversion_events),
    hs_analytics_first_url: stringOrNull(props?.hs_analytics_first_url),
    hs_analytics_last_url: stringOrNull(props?.hs_analytics_last_url),
    hs_analytics_first_referrer: stringOrNull(props?.hs_analytics_first_referrer),
    hs_analytics_last_referrer: stringOrNull(props?.hs_analytics_last_referrer),
    hs_analytics_first_visit_timestamp: parseHubspotTime(props?.hs_analytics_first_visit_timestamp),
    hs_analytics_num_page_views: toNumberOrNull(props?.hs_analytics_num_page_views),
    hubspot_updated_at: updatedAt,
    hubspot_archived: archived,
    is_deleted: archived,
    deleted_at_hubspot: deletedAt,
    merged_into_hubspot_contact_id: null,
    hs_merged_object_ids: stringOrNull(mergedIdsRaw),
    raw_payload: obj,
    payload_hash: payloadHash,
    sync_source: syncSource,
    last_synced_at: nowIso(),
  };
}

export async function mapDealRow(
  obj: any,
  syncSource: string,
): Promise<any | null> {
  const id = Number(obj?.id);
  if (!Number.isFinite(id)) return null;
  const props = obj?.properties || {};
  const payloadHash = await sha256PayloadHash(obj);
  const updatedAt = updatedAtFromObject(obj);
  const archived = !!obj?.archived;
  const deletedAt = archived
    ? (parseHubspotTime(obj?.archivedAt) || updatedAt || nowIso())
    : null;

  return {
    hubspot_deal_id: id,
    ingested_at: nowIso(),
    createdate: parseHubspotTime(props?.createdate || obj?.createdAt),
    closedate: parseHubspotTime(props?.closedate),
    dealname: stringOrNull(props?.dealname),
    amount: toNumberOrNull(props?.amount),
    pipeline: stringOrNull(props?.pipeline),
    dealstage: stringOrNull(props?.dealstage),
    hubspot_owner_id: stringOrNull(props?.hubspot_owner_id),
    hubspot_updated_at: updatedAt,
    hubspot_archived: archived,
    is_deleted: archived,
    deleted_at_hubspot: deletedAt,
    raw_payload: obj,
    payload_hash: payloadHash,
    sync_source: syncSource,
    last_synced_at: nowIso(),
  };
}

export async function mapActivityRow(
  obj: any,
  objectType: "calls" | "meetings",
  syncSource: string,
): Promise<any | null> {
  const id = Number(obj?.id);
  if (!Number.isFinite(id)) return null;
  const props = obj?.properties || {};
  const payloadHash = await sha256PayloadHash(obj);
  const createdAt = parseHubspotTime(props?.createdate || obj?.createdAt);
  const updatedAt = updatedAtFromObject(obj);
  const hsTimestamp = parseHubspotTime(props?.hs_timestamp) || createdAt;
  const archived = !!obj?.archived;
  const deletedAt = archived
    ? (parseHubspotTime(obj?.archivedAt) || updatedAt || nowIso())
    : null;

  return {
    hubspot_activity_id: id,
    activity_type: objectType === "meetings" ? "meeting" : "call",
    hs_timestamp: hsTimestamp,
    created_at_hubspot: createdAt,
    updated_at_hubspot: updatedAt,
    title: stringOrNull(objectType === "meetings" ? props?.hs_meeting_title : props?.hs_call_title),
    body_preview: stringOrNull(props?.hs_body_preview),
    owner_id: stringOrNull(props?.hubspot_owner_id),
    metadata: {
      object_type: objectType,
      archived: archived,
    },
    raw_payload: obj,
    ingested_at: nowIso(),
    hubspot_updated_at: updatedAt,
    hubspot_archived: archived,
    is_deleted: archived,
    deleted_at_hubspot: deletedAt,
    payload_hash: payloadHash,
    sync_source: syncSource,
    last_synced_at: nowIso(),
  };
}

export function mapAssociationRows(
  objectType: "calls" | "meetings",
  activityId: number,
  associations: any[],
  contactsById: Map<string, any>,
): any[] {
  const rows: any[] = [];
  const activityType = objectType === "meetings" ? "meeting" : "call";
  for (const assoc of associations || []) {
    const contactId = Number(assoc?.id || assoc?.toObjectId);
    if (!Number.isFinite(contactId)) continue;
    const contact = contactsById.get(String(contactId));
    const cProps = contact?.properties || {};
    rows.push({
      hubspot_activity_id: activityId,
      activity_type: activityType,
      hubspot_contact_id: contactId,
      association_type: "contact",
      contact_email: stringOrNull(cProps?.email),
      contact_firstname: stringOrNull(cProps?.firstname),
      contact_lastname: stringOrNull(cProps?.lastname),
      metadata: {
        source_association: assoc,
        contact_createdate: parseHubspotTime(cProps?.createdate),
      },
      ingested_at: nowIso(),
    });
  }
  return rows;
}

export async function upsertContacts(supabase: any, rows: any[]): Promise<number> {
  if (!rows.length) return 0;
  const { data, error } = await supabase
    .from("raw_hubspot_contacts")
    .upsert(rows, { onConflict: "hubspot_contact_id" })
    .select("hubspot_contact_id");
  if (error) throw new Error(`Upsert raw_hubspot_contacts failed: ${error.message}`);
  return (data || []).length;
}

export async function upsertDeals(supabase: any, rows: any[]): Promise<number> {
  if (!rows.length) return 0;
  const { data, error } = await supabase
    .from("raw_hubspot_deals")
    .upsert(rows, { onConflict: "hubspot_deal_id" })
    .select("hubspot_deal_id");
  if (error) throw new Error(`Upsert raw_hubspot_deals failed: ${error.message}`);
  return (data || []).length;
}

export async function upsertActivities(supabase: any, rows: any[]): Promise<number> {
  if (!rows.length) return 0;
  const { data, error } = await supabase
    .from("raw_hubspot_meeting_activities")
    .upsert(rows, { onConflict: "hubspot_activity_id,activity_type" })
    .select("id");
  if (error) throw new Error(`Upsert raw_hubspot_meeting_activities failed: ${error.message}`);
  return (data || []).length;
}

export async function upsertActivityAssociations(supabase: any, rows: any[]): Promise<number> {
  if (!rows.length) return 0;
  const { data, error } = await supabase
    .from("hubspot_activity_contact_associations")
    .upsert(rows, { onConflict: "hubspot_activity_id,activity_type,hubspot_contact_id,association_type" })
    .select("id");
  if (error) throw new Error(`Upsert hubspot_activity_contact_associations failed: ${error.message}`);
  return (data || []).length;
}

export async function applyContactMergeSoftDeletes(
  supabase: any,
  contactRows: any[],
  syncSource: string,
): Promise<number> {
  let updates = 0;
  for (const row of contactRows || []) {
    const canonicalId = Number(row?.hubspot_contact_id);
    if (!Number.isFinite(canonicalId)) continue;
    const mergedIds = parseMergedIds(row?.hs_merged_object_ids).map((v) => Number(v));
    const victimIds = mergedIds.filter((id) => Number.isFinite(id) && id > 0 && id !== canonicalId);
    if (!victimIds.length) continue;
    const { error } = await supabase
      .from("raw_hubspot_contacts")
      .update({
        is_deleted: true,
        hubspot_archived: true,
        deleted_at_hubspot: nowIso(),
        merged_into_hubspot_contact_id: canonicalId,
        sync_source: syncSource,
        last_synced_at: nowIso(),
      })
      .in("hubspot_contact_id", victimIds);
    if (error) throw new Error(`Merge soft-delete update failed: ${error.message}`);
    updates += victimIds.length;
  }
  return updates;
}

export async function startSyncRun(
  supabase: any,
  args: { runType: SyncRunType; objectType?: string | null; cursorFrom?: string | null; cursorTo?: string | null; metadata?: any },
): Promise<string> {
  const { data, error } = await supabase
    .from("hubspot_sync_runs")
    .insert({
      run_type: args.runType,
      object_type: args.objectType || null,
      status: "running",
      cursor_from: args.cursorFrom || null,
      cursor_to: args.cursorTo || null,
      metadata: args.metadata || {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to start sync run: ${error.message}`);
  return String(data.id);
}

export async function finishSyncRun(
  supabase: any,
  runId: string,
  args: {
    status: "success" | "error" | "partial";
    itemsRead?: number;
    itemsWritten?: number;
    itemsFailed?: number;
    metadata?: any;
  },
) {
  const { error } = await supabase
    .from("hubspot_sync_runs")
    .update({
      status: args.status,
      finished_at: nowIso(),
      items_read: args.itemsRead ?? 0,
      items_written: args.itemsWritten ?? 0,
      items_failed: args.itemsFailed ?? 0,
      metadata: args.metadata || {},
    })
    .eq("id", runId);
  if (error) throw new Error(`Failed to finish sync run ${runId}: ${error.message}`);
}

export async function logSyncError(
  supabase: any,
  args: { runId?: string | null; objectType?: string | null; objectId?: string | null; stage?: string | null; errorMessage: string; payload?: any },
) {
  const { error } = await supabase
    .from("hubspot_sync_errors")
    .insert({
      run_id: args.runId || null,
      object_type: args.objectType || null,
      object_id: args.objectId || null,
      stage: args.stage || null,
      error_message: args.errorMessage,
      payload: args.payload || {},
    });
  if (error) throw new Error(`Failed to write hubspot_sync_errors: ${error.message}`);
}

export async function readSyncState(supabase: any, objectType: HubspotObjectType): Promise<any | null> {
  const { data, error } = await supabase
    .from("hubspot_sync_state")
    .select("*")
    .eq("object_type", objectType)
    .maybeSingle();
  if (error) throw new Error(`Failed to read hubspot_sync_state(${objectType}): ${error.message}`);
  return data || null;
}

export async function updateSyncState(
  supabase: any,
  objectType: HubspotObjectType,
  patch: any,
) {
  const payload = {
    object_type: objectType,
    ...patch,
    updated_at: nowIso(),
  };
  const { error } = await supabase
    .from("hubspot_sync_state")
    .upsert(payload, { onConflict: "object_type" });
  if (error) throw new Error(`Failed to upsert hubspot_sync_state(${objectType}): ${error.message}`);
}

export function detectWebhookObjectType(event: any): HubspotObjectType | null {
  const objectTypeId = String(event?.objectTypeId || "").trim();
  if (objectTypeId === "0-1") return "contacts";
  if (objectTypeId === "0-3") return "deals";
  if (objectTypeId === "0-48") return "calls";
  if (objectTypeId === "0-47") return "meetings";

  const subscription = String(event?.subscriptionType || "").toLowerCase();
  if (subscription.includes("contact")) return "contacts";
  if (subscription.includes("deal")) return "deals";
  if (subscription.includes("call")) return "calls";
  if (subscription.includes("meeting")) return "meetings";
  return null;
}

export function detectWebhookDeleteEvent(event: any): boolean {
  const s = String(event?.subscriptionType || "").toLowerCase();
  return s.includes("deletion") || s.includes("delete");
}

export function detectWebhookRestoreEvent(event: any): boolean {
  const s = String(event?.subscriptionType || "").toLowerCase();
  return s.includes("restore");
}

export function webhookObjectId(event: any): string | null {
  const id = event?.objectId ?? event?.object_id ?? event?.objectID;
  if (id === null || id === undefined) return null;
  const text = String(id).trim();
  return text ? text : null;
}

export function webhookOccurredAtIso(event: any): string {
  const ms = Number(event?.occurredAt ?? event?.eventTimestamp ?? Date.now());
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  return nowIso();
}

export async function webhookDedupeKey(event: any): Promise<string> {
  const portalId = String(event?.portalId ?? "");
  const subscription = String(event?.subscriptionType ?? "");
  const objectId = String(webhookObjectId(event) ?? "");
  const occurredAt = String(event?.occurredAt ?? "");
  const propertyName = String(event?.propertyName ?? "");
  const raw = `${portalId}|${subscription}|${objectId}|${occurredAt}|${propertyName}`;
  return await sha256Hex(raw);
}

async function chunkedSelectIds(
  supabase: any,
  table: string,
  idColumn: string,
  extraFilters: Array<(query: any) => any> = [],
  batchSize = 1000,
): Promise<string[]> {
  const out: string[] = [];
  let from = 0;
  while (true) {
    let query = supabase.from(table).select(idColumn).range(from, from + batchSize - 1);
    for (const applyFilter of extraFilters) query = applyFilter(query);
    const { data, error } = await query;
    if (error) throw new Error(`Failed loading ${table} ids: ${error.message}`);
    const rows = data || [];
    out.push(...rows.map((r: any) => String(r?.[idColumn])).filter(Boolean));
    if (rows.length < batchSize) break;
    from += batchSize;
  }
  return out;
}

async function chunkedUpdateByIds(
  supabase: any,
  table: string,
  idColumn: string,
  ids: string[],
  patch: any,
  activityType?: "call" | "meeting",
): Promise<number> {
  if (!ids.length) return 0;
  let changed = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    let query = supabase.from(table).update(patch).in(idColumn, chunk);
    if (activityType) query = query.eq("activity_type", activityType);
    const { data, error } = await query.select(idColumn);
    if (error) throw new Error(`Failed updating ${table} lifecycle state: ${error.message}`);
    changed += (data || []).length;
  }
  return changed;
}

export async function softDeleteObject(
  supabase: any,
  objectType: HubspotObjectType,
  objectId: string,
  occurredAtIso: string,
  syncSource: string,
): Promise<number> {
  if (objectType === "contacts") {
    const { data, error } = await supabase
      .from("raw_hubspot_contacts")
      .upsert({
        hubspot_contact_id: Number(objectId),
        ingested_at: nowIso(),
        hubspot_archived: true,
        is_deleted: true,
        deleted_at_hubspot: occurredAtIso,
        sync_source: syncSource,
        last_synced_at: nowIso(),
        hubspot_updated_at: occurredAtIso,
      }, { onConflict: "hubspot_contact_id" })
      .select("hubspot_contact_id");
    if (error) throw new Error(`Soft-delete contact ${objectId} failed: ${error.message}`);
    return (data || []).length;
  }

  if (objectType === "deals") {
    const { data, error } = await supabase
      .from("raw_hubspot_deals")
      .upsert({
        hubspot_deal_id: Number(objectId),
        ingested_at: nowIso(),
        hubspot_archived: true,
        is_deleted: true,
        deleted_at_hubspot: occurredAtIso,
        sync_source: syncSource,
        last_synced_at: nowIso(),
        hubspot_updated_at: occurredAtIso,
      }, { onConflict: "hubspot_deal_id" })
      .select("hubspot_deal_id");
    if (error) throw new Error(`Soft-delete deal ${objectId} failed: ${error.message}`);
    return (data || []).length;
  }

  const activityType = objectType === "meetings" ? "meeting" : "call";
  const { data, error } = await supabase
    .from("raw_hubspot_meeting_activities")
    .upsert({
      hubspot_activity_id: Number(objectId),
      activity_type: activityType,
      ingested_at: nowIso(),
      hubspot_archived: true,
      is_deleted: true,
      deleted_at_hubspot: occurredAtIso,
      sync_source: syncSource,
      last_synced_at: nowIso(),
      hubspot_updated_at: occurredAtIso,
    }, { onConflict: "hubspot_activity_id,activity_type" })
    .select("id");
  if (error) throw new Error(`Soft-delete activity ${objectType}/${objectId} failed: ${error.message}`);
  return (data || []).length;
}

export async function reconcileLifecycleForObjectType(
  supabase: any,
  token: string,
  objectType: HubspotObjectType,
  syncSource: string,
): Promise<{ localActive: number; remoteActive: number; softDeleted: number; restored: number }> {
  const remoteActive = await hubspotListAllActiveIds(token, objectType);
  const deletedPatch = {
    hubspot_archived: true,
    is_deleted: true,
    deleted_at_hubspot: nowIso(),
    sync_source: syncSource,
    last_synced_at: nowIso(),
  };
  const restorePatch = {
    hubspot_archived: false,
    is_deleted: false,
    deleted_at_hubspot: null,
    sync_source: syncSource,
    last_synced_at: nowIso(),
  };

  if (objectType === "contacts") {
    const localActive = await chunkedSelectIds(
      supabase,
      "raw_hubspot_contacts",
      "hubspot_contact_id",
      [(q) => q.eq("is_deleted", false)],
    );
    const localDeleted = await chunkedSelectIds(
      supabase,
      "raw_hubspot_contacts",
      "hubspot_contact_id",
      [(q) => q.eq("is_deleted", true)],
    );
    const toDelete = localActive.filter((id) => !remoteActive.has(String(id)));
    const toRestore = localDeleted.filter((id) => remoteActive.has(String(id)));
    const softDeleted = await chunkedUpdateByIds(supabase, "raw_hubspot_contacts", "hubspot_contact_id", toDelete, deletedPatch);
    const restored = await chunkedUpdateByIds(supabase, "raw_hubspot_contacts", "hubspot_contact_id", toRestore, restorePatch);
    return { localActive: localActive.length, remoteActive: remoteActive.size, softDeleted, restored };
  }

  if (objectType === "deals") {
    const localActive = await chunkedSelectIds(
      supabase,
      "raw_hubspot_deals",
      "hubspot_deal_id",
      [(q) => q.eq("is_deleted", false)],
    );
    const localDeleted = await chunkedSelectIds(
      supabase,
      "raw_hubspot_deals",
      "hubspot_deal_id",
      [(q) => q.eq("is_deleted", true)],
    );
    const toDelete = localActive.filter((id) => !remoteActive.has(String(id)));
    const toRestore = localDeleted.filter((id) => remoteActive.has(String(id)));
    const softDeleted = await chunkedUpdateByIds(supabase, "raw_hubspot_deals", "hubspot_deal_id", toDelete, deletedPatch);
    const restored = await chunkedUpdateByIds(supabase, "raw_hubspot_deals", "hubspot_deal_id", toRestore, restorePatch);
    return { localActive: localActive.length, remoteActive: remoteActive.size, softDeleted, restored };
  }

  const activityType = objectType === "meetings" ? "meeting" : "call";
  const localActive = await chunkedSelectIds(
    supabase,
    "raw_hubspot_meeting_activities",
    "hubspot_activity_id",
    [(q) => q.eq("activity_type", activityType).eq("is_deleted", false)],
  );
  const localDeleted = await chunkedSelectIds(
    supabase,
    "raw_hubspot_meeting_activities",
    "hubspot_activity_id",
    [(q) => q.eq("activity_type", activityType).eq("is_deleted", true)],
  );
  const toDelete = localActive.filter((id) => !remoteActive.has(String(id)));
  const toRestore = localDeleted.filter((id) => remoteActive.has(String(id)));
  const softDeleted = await chunkedUpdateByIds(
    supabase,
    "raw_hubspot_meeting_activities",
    "hubspot_activity_id",
    toDelete,
    deletedPatch,
    activityType,
  );
  const restored = await chunkedUpdateByIds(
    supabase,
    "raw_hubspot_meeting_activities",
    "hubspot_activity_id",
    toRestore,
    restorePatch,
    activityType,
  );
  return { localActive: localActive.length, remoteActive: remoteActive.size, softDeleted, restored };
}

export async function syncObjectRange(
  supabase: any,
  token: string,
  objectType: HubspotObjectType,
  fromIso: string,
  toIso: string,
  syncSource: string,
): Promise<{ itemsRead: number; itemsWritten: number; maxUpdatedAt: string | null; details: any }> {
  const objects = await hubspotPullObjectsByUpdatedRange(token, objectType, fromIso, toIso);
  const dedup = new Map<string, any>();
  for (const obj of objects) dedup.set(String(obj?.id || ""), obj);
  const rows = Array.from(dedup.values());

  let itemsWritten = 0;
  let mergedUpdates = 0;
  const maxUpdatedAt = rows
    .map((obj) => updatedAtFromObject(obj))
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  if (objectType === "contacts") {
    const contactRows: any[] = [];
    for (const obj of rows) {
      const mapped = await mapContactRow(obj, syncSource);
      if (mapped) contactRows.push(mapped);
    }
    itemsWritten += await upsertContacts(supabase, contactRows);
    mergedUpdates += await applyContactMergeSoftDeletes(supabase, contactRows, syncSource);
    return {
      itemsRead: rows.length,
      itemsWritten: itemsWritten + mergedUpdates,
      maxUpdatedAt,
      details: { contact_rows: contactRows.length, merge_updates: mergedUpdates },
    };
  }

  if (objectType === "deals") {
    const dealRows: any[] = [];
    for (const obj of rows) {
      const mapped = await mapDealRow(obj, syncSource);
      if (mapped) dealRows.push(mapped);
    }
    itemsWritten += await upsertDeals(supabase, dealRows);
    return {
      itemsRead: rows.length,
      itemsWritten,
      maxUpdatedAt,
      details: { deal_rows: dealRows.length },
    };
  }

  const activityRows: any[] = [];
  for (const obj of rows) {
    const mapped = await mapActivityRow(obj, objectType, syncSource);
    if (mapped) activityRows.push(mapped);
  }
  itemsWritten += await upsertActivities(supabase, activityRows);

  const ids = activityRows.map((row) => Number(row?.hubspot_activity_id)).filter((id) => Number.isFinite(id));
  const assocByActivity = await hubspotFetchActivityAssociations(token, objectType, ids);
  const contactIdSet = new Set<string>();
  assocByActivity.forEach((toRows) => {
    for (const assoc of toRows || []) {
      const cid = String(assoc?.id || assoc?.toObjectId || "");
      if (cid) contactIdSet.add(cid);
    }
  });

  const contactsById = await hubspotBatchReadContacts(token, [...contactIdSet]);
  const contactRows: any[] = [];
  for (const contact of contactsById.values()) {
    const mapped = await mapContactRow(contact, syncSource);
    if (mapped) contactRows.push(mapped);
  }
  const assocRows: any[] = [];
  for (const activityRow of activityRows) {
    const key = String(activityRow?.hubspot_activity_id);
    const associations = assocByActivity.get(key) || [];
    assocRows.push(...mapAssociationRows(objectType, Number(activityRow?.hubspot_activity_id), associations, contactsById));
  }

  itemsWritten += await upsertContacts(supabase, contactRows);
  mergedUpdates += await applyContactMergeSoftDeletes(supabase, contactRows, syncSource);
  itemsWritten += await upsertActivityAssociations(supabase, assocRows);

  return {
    itemsRead: rows.length,
    itemsWritten: itemsWritten + mergedUpdates,
    maxUpdatedAt,
    details: {
      activity_rows: activityRows.length,
      association_rows: assocRows.length,
      linked_contact_rows: contactRows.length,
      merge_updates: mergedUpdates,
    },
  };
}

export async function sendSyncAlertIfNeeded(
  title: string,
  body: Record<string, any>,
): Promise<void> {
  const webhook = Deno.env.get("HUBSPOT_SYNC_ALERT_WEBHOOK_URL");
  if (!webhook) return;
  await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `HubSpot Sync Alert: ${title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*HubSpot Sync Alert:* ${title}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "```" + JSON.stringify(body, null, 2) + "```",
          },
        },
      ],
    }),
  }).catch(() => {
    // best-effort only
  });
}
