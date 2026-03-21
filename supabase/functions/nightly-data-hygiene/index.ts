import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseLeadAdSobrietyDate,
  parseLeadAdRevenue,
} from "../_shared/hubspot_sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Env / clients                                                     */
/* ------------------------------------------------------------------ */

function mustGetEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function nowIso() {
  return new Date().toISOString();
}

const HS_BASE = "https://api.hubapi.com";

/* ------------------------------------------------------------------ */
/*  HubSpot helpers                                                   */
/* ------------------------------------------------------------------ */

async function hsGet(token: string, path: string) {
  const res = await fetch(`${HS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HS GET ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function hsPost(token: string, path: string, body: unknown) {
  const res = await fetch(`${HS_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HS POST ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function hsPatch(token: string, path: string, body: unknown) {
  const res = await fetch(`${HS_BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `HS PATCH ${path} -> ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  return res.json();
}

interface HsContact {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  company: string;
  createdate: string;
}

async function fetchRecentContacts(
  token: string,
  daysBack: number,
): Promise<HsContact[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceMs = since.getTime();

  const props = [
    "firstname",
    "lastname",
    "email",
    "company",
    "createdate",
  ];
  const all: HsContact[] = [];
  let offset = 0;
  const limit = 200;

  // Paginate through search results
  while (true) {
    const result = await hsPost(token, "/crm/v3/objects/contacts/search", {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "createdate",
              operator: "GTE",
              value: String(sinceMs),
            },
          ],
        },
      ],
      properties: props,
      limit,
      ...(offset ? { after: String(offset) } : {}),
      sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
    });

    for (const r of result.results || []) {
      all.push({
        id: Number(r.id),
        firstname: (r.properties.firstname || "").trim(),
        lastname: (r.properties.lastname || "").trim(),
        email: (r.properties.email || "").trim(),
        company: (r.properties.company || "").trim(),
        createdate: r.properties.createdate || "",
      });
    }

    if (!result.paging?.next?.after) break;
    offset = Number(result.paging.next.after);
    if (all.length >= 10000) break; // safety cap
  }

  return all;
}

/* ------------------------------------------------------------------ */
/*  Dedup logic                                                       */
/* ------------------------------------------------------------------ */

interface MergePair {
  primaryId: number;
  secondaryId: number;
  primaryName: string;
  secondaryName: string;
  primaryEmail: string;
  secondaryEmail: string;
  reason: string;
}

function normalizeFirst(name: string): string {
  return name.toLowerCase().replace(/^zap\s*name\s*/i, "").trim();
}

function findDuplicates(contacts: HsContact[]): MergePair[] {
  const pairs: MergePair[] = [];
  const mergedIds = new Set<number>();

  // Sort by createdate ascending so the earlier contact is always first
  const sorted = [...contacts].sort(
    (a, b) =>
      new Date(a.createdate).getTime() - new Date(b.createdate).getTime(),
  );

  // Index by normalized first+last (lowercase)
  const nameMap = new Map<string, HsContact[]>();
  for (const c of sorted) {
    const first = normalizeFirst(c.firstname);
    const last = c.lastname.toLowerCase().trim();
    if (!first && !last) continue;
    const key = `${first}|${last}`;
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key)!.push(c);
  }

  // Also index by email
  const emailMap = new Map<string, HsContact[]>();
  for (const c of sorted) {
    if (!c.email) continue;
    const key = c.email.toLowerCase().trim();
    if (!emailMap.has(key)) emailMap.set(key, []);
    emailMap.get(key)!.push(c);
  }

  // 1. Exact name matches (first+last) within 7-day window
  for (const [key, group] of nameMap) {
    if (group.length < 2) continue;
    if (key === "|") continue; // skip empty names

    for (let i = 0; i < group.length; i++) {
      if (mergedIds.has(group[i].id)) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (mergedIds.has(group[j].id)) continue;
        const daysDiff = Math.abs(
          new Date(group[j].createdate).getTime() -
            new Date(group[i].createdate).getTime(),
        ) / 86400000;

        if (daysDiff <= 7) {
          pairs.push({
            primaryId: group[i].id,
            secondaryId: group[j].id,
            primaryName: `${group[i].firstname} ${group[i].lastname}`.trim(),
            secondaryName:
              `${group[j].firstname} ${group[j].lastname}`.trim(),
            primaryEmail: group[i].email,
            secondaryEmail: group[j].email,
            reason: `Same name, created ${daysDiff.toFixed(1)}d apart`,
          });
          mergedIds.add(group[j].id);
        }
      }
    }
  }

  // 2. Same email on different contacts
  for (const [email, group] of emailMap) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      if (mergedIds.has(group[i].id)) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (mergedIds.has(group[j].id)) continue;
        pairs.push({
          primaryId: group[i].id,
          secondaryId: group[j].id,
          primaryName: `${group[i].firstname} ${group[i].lastname}`.trim(),
          secondaryName: `${group[j].firstname} ${group[j].lastname}`.trim(),
          primaryEmail: group[i].email,
          secondaryEmail: group[j].email,
          reason: `Same email: ${email}`,
        });
        mergedIds.add(group[j].id);
      }
    }
  }

  return pairs;
}

/* ------------------------------------------------------------------ */
/*  Zap Name cleanup                                                  */
/* ------------------------------------------------------------------ */

interface ZapFix {
  id: number;
  oldFirst: string;
  newFirst: string;
  email: string;
}

function findZapNames(contacts: HsContact[]): ZapFix[] {
  const fixes: ZapFix[] = [];
  for (const c of contacts) {
    if (/^zap\s*name\s/i.test(c.firstname)) {
      const newFirst = c.firstname.replace(/^zap\s*name\s*/i, "").trim();
      if (newFirst && newFirst !== c.firstname) {
        fixes.push({
          id: c.id,
          oldFirst: c.firstname,
          newFirst,
          email: c.email,
        });
      }
    }
  }
  return fixes;
}

/* ------------------------------------------------------------------ */
/*  Data quality flags                                                */
/* ------------------------------------------------------------------ */

interface DataQualityIssue {
  id: number;
  name: string;
  email: string;
  issue: string;
}

function findDataQualityIssues(contacts: HsContact[]): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const c of contacts) {
    const name = `${c.firstname} ${c.lastname}`.trim();

    // Last name has social bio / pipe characters
    if (c.lastname && c.lastname.includes("|")) {
      issues.push({ id: c.id, name, email: c.email, issue: "Last name has pipe characters (social bio)" });
    }

    // Last name has " - " with appended text
    if (c.lastname && / - .{10,}/.test(c.lastname)) {
      issues.push({ id: c.id, name, email: c.email, issue: "Last name has appended text after dash" });
    }

    // No email
    if (!c.email) {
      issues.push({ id: c.id, name, email: "", issue: "Missing email" });
    }

    // No last name
    if (!c.lastname.trim()) {
      issues.push({ id: c.id, name, email: c.email, issue: "Missing last name" });
    }

    // First name = last name (e.g. David David)
    if (
      c.firstname &&
      c.lastname &&
      c.firstname.toLowerCase().trim() === c.lastname.toLowerCase().trim()
    ) {
      issues.push({ id: c.id, name, email: c.email, issue: "First and last name identical" });
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/*  Name whitespace trimmer                                           */
/* ------------------------------------------------------------------ */

interface NameTrimFix {
  id: number;
  field: "firstname" | "lastname";
  oldValue: string;
  newValue: string;
  email: string;
}

function findNameTrimFixes(contacts: HsContact[]): NameTrimFix[] {
  const fixes: NameTrimFix[] = [];
  for (const c of contacts) {
    if (c.firstname && c.firstname !== c.firstname.trim()) {
      fixes.push({
        id: c.id,
        field: "firstname",
        oldValue: c.firstname,
        newValue: c.firstname.trim(),
        email: c.email,
      });
    }
    if (c.lastname && c.lastname !== c.lastname.trim()) {
      fixes.push({
        id: c.id,
        field: "lastname",
        oldValue: c.lastname,
        newValue: c.lastname.trim(),
        email: c.email,
      });
    }
  }
  return fixes;
}

/* ------------------------------------------------------------------ */
/*  Lead ad field normalizer                                          */
/*  Finds contacts where official fields are empty but lead ad        */
/*  alternate fields have parseable data, then writes to official.    */
/* ------------------------------------------------------------------ */

// All known alternate field names that Meta Lead Ads might create
const SOBRIETY_ALT_FIELDS = [
  "sobriety_date_mmddyyyy",
  "lead_ad_prop0",
];
const REVENUE_ALT_FIELDS = [
  "annual_revenue_",
  "annual_revenue",
  "annual_revenue_100k_minimum_to_participate",
  "annual_revenue_250k_minimum_to_participate",
  "what_is_your_annual_revenue_250k_minimum_to_participate",
  "lead_ad_prop1",
];

interface FieldNormFix {
  id: number;
  name: string;
  email: string;
  field: string;
  rawValue: string;
  parsedValue: string;
}

async function normalizeLeadAdFields(
  token: string,
  dryRun: boolean,
): Promise<{ fixes: FieldNormFix[]; failures: string[] }> {
  const fixes: FieldNormFix[] = [];
  const failures: string[] = [];

  const allAltFields = [...SOBRIETY_ALT_FIELDS, ...REVENUE_ALT_FIELDS];
  const fetchProps = [
    "firstname", "lastname", "email",
    "sobriety_date", "annual_revenue_in_dollars__official_",
    ...allAltFields,
  ];

  // Search: contacts missing sobriety_date but having each alt field
  for (const altField of SOBRIETY_ALT_FIELDS) {
    let offset = 0;
    while (true) {
      const result = await hsPost(token, "/crm/v3/objects/contacts/search", {
        filterGroups: [{
          filters: [
            { propertyName: "sobriety_date", operator: "NOT_HAS_PROPERTY" },
            { propertyName: altField, operator: "HAS_PROPERTY" },
          ],
        }],
        properties: fetchProps,
        limit: 100,
        ...(offset ? { after: String(offset) } : {}),
      });

      for (const r of result.results || []) {
        const rawVal = r.properties?.[altField];
        if (!rawVal) continue;
        const parsed = parseLeadAdSobrietyDate(rawVal);
        if (!parsed) continue;
        fixes.push({
          id: Number(r.id),
          name: `${r.properties?.firstname || ""} ${r.properties?.lastname || ""}`.trim(),
          email: r.properties?.email || "",
          field: "sobriety_date",
          rawValue: String(rawVal),
          parsedValue: parsed,
        });
      }

      if (!result.paging?.next?.after) break;
      offset = Number(result.paging.next.after);
      if (offset > 2000) break;
    }
  }

  // Search: contacts missing revenue but having each alt field
  for (const altField of REVENUE_ALT_FIELDS) {
    let offset = 0;
    while (true) {
      const result = await hsPost(token, "/crm/v3/objects/contacts/search", {
        filterGroups: [{
          filters: [
            { propertyName: "annual_revenue_in_dollars__official_", operator: "NOT_HAS_PROPERTY" },
            { propertyName: altField, operator: "HAS_PROPERTY" },
          ],
        }],
        properties: fetchProps,
        limit: 100,
        ...(offset ? { after: String(offset) } : {}),
      });

      for (const r of result.results || []) {
        const rawVal = r.properties?.[altField];
        if (!rawVal) continue;
        const parsed = parseLeadAdRevenue(rawVal);
        if (parsed === null || parsed <= 0) continue;
        // Skip if already queued from a previous alt field
        if (fixes.some((f) => f.id === Number(r.id) && f.field === "annual_revenue_in_dollars__official_")) continue;
        fixes.push({
          id: Number(r.id),
          name: `${r.properties?.firstname || ""} ${r.properties?.lastname || ""}`.trim(),
          email: r.properties?.email || "",
          field: "annual_revenue_in_dollars__official_",
          rawValue: String(rawVal),
          parsedValue: String(parsed),
        });
      }

      if (!result.paging?.next?.after) break;
      offset = Number(result.paging.next.after);
      if (offset > 2000) break;
    }
  }

  // Fix contacts with future sobriety dates (after today) — blank them or re-parse
  {
    const today = new Date().toISOString().split("T")[0];
    // Search for dates after today (catches both near-future and far-future)
    const badDateResult = await hsPost(token, "/crm/v3/objects/contacts/search", {
      filterGroups: [{
        filters: [
          { propertyName: "sobriety_date", operator: "HAS_PROPERTY" },
          { propertyName: "sobriety_date", operator: "GT", value: today },
        ],
      }],
      properties: fetchProps,
      limit: 100,
    });

    for (const r of badDateResult.results || []) {
      const name = `${r.properties?.firstname || ""} ${r.properties?.lastname || ""}`.trim();
      const email = r.properties?.email || "";
      const badDate = r.properties?.sobriety_date || "";

      // Try to re-parse from alt fields
      let reparsed: string | null = null;
      for (const altField of SOBRIETY_ALT_FIELDS) {
        const rawVal = r.properties?.[altField];
        if (rawVal) {
          const candidate = parseLeadAdSobrietyDate(rawVal);
          if (candidate && candidate <= today) {
            reparsed = candidate;
            fixes.push({
              id: Number(r.id),
              name, email,
              field: "sobriety_date",
              rawValue: `BAD:${badDate} ALT:${rawVal}`,
              parsedValue: reparsed,
            });
            break;
          }
        }
      }

      // If no valid alt field, blank the bad date
      if (!reparsed) {
        fixes.push({
          id: Number(r.id),
          name, email,
          field: "sobriety_date",
          rawValue: `FUTURE:${badDate}`,
          parsedValue: "",
        });
      }
    }
  }

  // Deduplicate by id+field
  const seen = new Set<string>();
  const dedupedFixes = fixes.filter((f) => {
    const key = `${f.id}:${f.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Write fixes to HubSpot
  if (!dryRun) {
    for (const fix of dedupedFixes) {
      try {
        await hsPatch(token, `/crm/v3/objects/contacts/${fix.id}`, {
          properties: { [fix.field]: fix.parsedValue },
        });
        console.log(`  NORM FIX: ${fix.id} ${fix.name} ${fix.field} = ${fix.parsedValue} (from "${fix.rawValue}")`);
      } catch (e: any) {
        const msg = `${fix.id} ${fix.field}: ${e.message?.slice(0, 100)}`;
        console.error(`  NORM FAIL: ${msg}`);
        failures.push(msg);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return { fixes: dedupedFixes, failures };
}

/* ------------------------------------------------------------------ */
/*  Sync health check (reads Supabase)                                */
/* ------------------------------------------------------------------ */

interface SyncHealthResult {
  allFresh: boolean;
  noDead: boolean;
  allHealthy: boolean;
  details: Array<{
    run_type: string;
    object_type: string;
    is_stale: boolean;
    dead_events: number;
    minutes_since_last_success: number;
    latest_status: string;
  }>;
}

async function checkSyncHealth(
  supabase: ReturnType<typeof createClient>,
): Promise<SyncHealthResult> {
  const { data, error } = await supabase
    .from("vw_hubspot_sync_health_observability")
    .select("*");

  if (error) throw new Error(`Sync health query failed: ${error.message}`);
  const rows = data || [];

  return {
    allFresh: rows.every((r: any) => !r.is_stale),
    noDead: rows.every((r: any) => (r.dead_events || 0) === 0),
    allHealthy: rows.every((r: any) =>
      ["success", "partial"].includes(r.latest_status),
    ),
    details: rows.map((r: any) => ({
      run_type: r.run_type,
      object_type: r.object_type || "all",
      is_stale: r.is_stale,
      dead_events: r.dead_events || 0,
      minutes_since_last_success: r.minutes_since_last_success || 0,
      latest_status: r.latest_status,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Supabase soft-delete for merged contacts                          */
/* ------------------------------------------------------------------ */

async function softDeleteInSupabase(
  supabase: ReturnType<typeof createClient>,
  victimId: number,
  primaryId: number,
): Promise<boolean> {
  const now = nowIso();
  const { error } = await supabase
    .from("raw_hubspot_contacts")
    .upsert(
      {
        hubspot_contact_id: victimId,
        is_deleted: true,
        hubspot_archived: true,
        deleted_at_hubspot: now,
        merged_into_hubspot_contact_id: primaryId,
        hubspot_updated_at: now,
        last_synced_at: now,
        ingested_at: now,
        sync_source: "nightly_data_hygiene",
      },
      { onConflict: "hubspot_contact_id" },
    );

  if (error) {
    console.error(
      `Failed to soft-delete ${victimId} in Supabase: ${error.message}`,
    );
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Slack notification                                                 */
/* ------------------------------------------------------------------ */

async function sendSlackReport(report: {
  merges: MergePair[];
  mergeFails: string[];
  zapFixes: ZapFix[];
  zapFixFails: string[];
  nameTrimFixes: number;
  dataQualityIssues: DataQualityIssue[];
  fieldNormFixes: FieldNormFix[];
  fieldNormFails: string[];
  syncHealth: SyncHealthResult;
  contactsScanned: number;
  dryRun: boolean;
}): Promise<boolean> {
  const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
  const channel = Deno.env.get("MARKETING_MANAGER_CHANNEL_ID");
  if (!slackToken || !channel) {
    console.log("SLACK_BOT_TOKEN or MARKETING_MANAGER_CHANNEL_ID not set -- skipping Slack");
    return false;
  }

  const prefix = report.dryRun ? "[DRY RUN] " : "";
  const syncStatus = report.syncHealth.allFresh && report.syncHealth.noDead && report.syncHealth.allHealthy
    ? "All green"
    : "Issues detected";

  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${prefix}Nightly Data Hygiene Report` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Contacts scanned:* ${report.contactsScanned} (last 7 days)`,
          `*Duplicates merged:* ${report.merges.length}${report.mergeFails.length ? ` (${report.mergeFails.length} failed)` : ""}`,
          `*Zap Name fixes:* ${report.zapFixes.length}${report.zapFixFails.length ? ` (${report.zapFixFails.length} failed)` : ""}`,
          `*Name trims:* ${report.nameTrimFixes}`,
          `*Field normalizations:* ${report.fieldNormFixes.length}${report.fieldNormFails.length ? ` (${report.fieldNormFails.length} failed)` : ""}`,
          `*Data quality flags:* ${report.dataQualityIssues.length}`,
          `*Sync health:* ${syncStatus}`,
        ].join("\n"),
      },
    },
  ];

  // Merge details
  if (report.merges.length > 0) {
    const mergeLines = report.merges
      .slice(0, 15)
      .map(
        (m) =>
          `- ${m.secondaryName} (${m.secondaryEmail || "no email"}) -> ${m.primaryName} (${m.primaryEmail || "no email"}) | ${m.reason}`,
      )
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Merges:*\n${mergeLines}${report.merges.length > 15 ? `\n_...and ${report.merges.length - 15} more_` : ""}`,
      },
    });
  }

  // Field normalization details
  if (report.fieldNormFixes.length > 0) {
    const normLines = report.fieldNormFixes
      .slice(0, 15)
      .map(
        (f) =>
          `- ${f.name || "unnamed"} (${f.email || "no email"}): ${f.field} = ${f.parsedValue} (from "${f.rawValue}")`,
      )
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Field normalizations (lead ad → official):*\n${normLines}${report.fieldNormFixes.length > 15 ? `\n_...and ${report.fieldNormFixes.length - 15} more_` : ""}`,
      },
    });
  }

  // Data quality issues (capped)
  if (report.dataQualityIssues.length > 0) {
    const dqLines = report.dataQualityIssues
      .slice(0, 10)
      .map((d) => `- ${d.name || "unnamed"} (${d.email || "no email"}): ${d.issue}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Data quality flags:*\n${dqLines}${report.dataQualityIssues.length > 10 ? `\n_...and ${report.dataQualityIssues.length - 10} more_` : ""}`,
      },
    });
  }

  // Sync health issues
  if (!report.syncHealth.allFresh || !report.syncHealth.noDead || !report.syncHealth.allHealthy) {
    const staleRows = report.syncHealth.details.filter(
      (d) => d.is_stale || d.dead_events > 0 || !["success", "partial"].includes(d.latest_status),
    );
    const healthLines = staleRows
      .map(
        (d) =>
          `- ${d.run_type}/${d.object_type}: status=${d.latest_status}, stale=${d.is_stale}, dead=${d.dead_events}`,
      )
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Sync health issues:*\n${healthLines}`,
      },
    });
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text: `${prefix}Nightly Data Hygiene: ${report.merges.length} merges, ${report.zapFixes.length} zap fixes, ${report.fieldNormFixes.length} field norms, ${report.dataQualityIssues.length} quality flags`,
        blocks,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Slack send failed:", data.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Slack send error:", e);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                      */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, function: "nightly-data-hygiene" }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  }

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const dryRunRaw = url.searchParams.get("dry_run") ?? body?.dry_run ?? false;
    const dryRun = dryRunRaw === true || dryRunRaw === "true";
    const daysBack = Number(url.searchParams.get("days_back") || body?.days_back || 7);

    console.log(`nightly-data-hygiene: dry_run=${dryRun}, days_back=${daysBack}`);

    const hsToken = mustGetEnv("HUBSPOT_PRIVATE_APP_TOKEN");
    const supabase = createClient(
      mustGetEnv("SUPABASE_URL"),
      mustGetEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    // ── 1. Fetch recent contacts from HubSpot ──
    console.log("Fetching recent contacts from HubSpot...");
    const contacts = await fetchRecentContacts(hsToken, daysBack);
    console.log(`Fetched ${contacts.length} contacts from last ${daysBack} days`);

    // ── 2. Find duplicates ──
    const duplicates = findDuplicates(contacts);
    console.log(`Found ${duplicates.length} duplicate pairs`);

    // ── 3. Find Zap Name issues ──
    const zapFixes = findZapNames(contacts);
    console.log(`Found ${zapFixes.length} Zap Name contacts to fix`);

    // ── 4. Find data quality issues ──
    const dataQualityIssues = findDataQualityIssues(contacts);
    console.log(`Found ${dataQualityIssues.length} data quality issues`);

    // ── 5. Check sync health ──
    const syncHealth = await checkSyncHealth(supabase);
    console.log(
      `Sync health: fresh=${syncHealth.allFresh}, noDead=${syncHealth.noDead}, healthy=${syncHealth.allHealthy}`,
    );

    // ── 6. Execute merges ──
    const mergeResults: MergePair[] = [];
    const mergeFails: string[] = [];

    if (!dryRun) {
      for (const pair of duplicates) {
        try {
          await hsPost(hsToken, "/crm/v3/objects/contacts/merge", {
            primaryObjectId: String(pair.primaryId),
            objectIdToMerge: String(pair.secondaryId),
          });

          // Soft-delete in Supabase immediately
          await softDeleteInSupabase(supabase, pair.secondaryId, pair.primaryId);

          mergeResults.push(pair);
          console.log(
            `  MERGED: ${pair.secondaryId} -> ${pair.primaryId} (${pair.reason})`,
          );
        } catch (e: any) {
          const msg = `${pair.secondaryId} -> ${pair.primaryId}: ${e.message?.slice(0, 100)}`;
          console.error(`  FAIL: ${msg}`);
          mergeFails.push(msg);
        }
        // Rate limiting: 200ms between merges
        await new Promise((r) => setTimeout(r, 200));
      }
    } else {
      mergeResults.push(...duplicates);
    }

    // ── 7. Execute Zap Name fixes ──
    const zapFixResults: ZapFix[] = [];
    const zapFixFails: string[] = [];

    if (!dryRun) {
      for (const fix of zapFixes) {
        try {
          await hsPatch(hsToken, `/crm/v3/objects/contacts/${fix.id}`, {
            properties: { firstname: fix.newFirst },
          });
          zapFixResults.push(fix);
          console.log(`  ZAP FIX: ${fix.id} "${fix.oldFirst}" -> "${fix.newFirst}"`);
        } catch (e: any) {
          const msg = `${fix.id}: ${e.message?.slice(0, 100)}`;
          console.error(`  ZAP FAIL: ${msg}`);
          zapFixFails.push(msg);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    } else {
      zapFixResults.push(...zapFixes);
    }

    // ── 8. Trim whitespace from names ──
    const nameTrimFixes = findNameTrimFixes(contacts);
    console.log(`Found ${nameTrimFixes.length} name whitespace fixes`);
    let nameTrimsDone = 0;
    const nameTrimFails: string[] = [];

    if (!dryRun) {
      // Group by contact ID so we patch once per contact
      const byId = new Map<number, Record<string, string>>();
      for (const fix of nameTrimFixes) {
        if (!byId.has(fix.id)) byId.set(fix.id, {});
        byId.get(fix.id)![fix.field] = fix.newValue;
      }
      for (const [id, props] of byId) {
        try {
          await hsPatch(hsToken, `/crm/v3/objects/contacts/${id}`, { properties: props });
          nameTrimsDone++;
          console.log(`  TRIM: ${id} ${JSON.stringify(props)}`);
        } catch (e: any) {
          const msg = `${id}: ${e.message?.slice(0, 100)}`;
          console.error(`  TRIM FAIL: ${msg}`);
          nameTrimFails.push(msg);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    } else {
      nameTrimsDone = nameTrimFixes.length;
    }

    // ── 9. Normalize lead ad fields → official fields ──
    console.log("Running lead ad field normalizer...");
    const normResult = await normalizeLeadAdFields(hsToken, dryRun);
    console.log(`Field normalizer: ${normResult.fixes.length} fixes, ${normResult.failures.length} failures`);

    // ── 10. Send Slack report ──
    const slackSent = await sendSlackReport({
      merges: mergeResults,
      mergeFails,
      zapFixes: zapFixResults,
      zapFixFails,
      nameTrimFixes: nameTrimsDone,
      dataQualityIssues,
      fieldNormFixes: normResult.fixes,
      fieldNormFails: normResult.failures,
      syncHealth,
      contactsScanned: contacts.length,
      dryRun,
    });

    // ── 11. Log to sync_runs ──
    const allFails = mergeFails.length + zapFixFails.length + nameTrimFails.length + normResult.failures.length;
    const runMetadata = {
      contacts_scanned: contacts.length,
      duplicates_found: duplicates.length,
      merges_executed: dryRun ? 0 : mergeResults.length,
      merge_failures: mergeFails.length,
      zap_fixes: dryRun ? 0 : zapFixResults.length,
      zap_fix_failures: zapFixFails.length,
      name_trims: dryRun ? 0 : nameTrimsDone,
      name_trim_failures: nameTrimFails.length,
      field_norm_fixes: dryRun ? 0 : normResult.fixes.length,
      field_norm_failures: normResult.failures.length,
      data_quality_issues: dataQualityIssues.length,
      sync_health_ok:
        syncHealth.allFresh && syncHealth.noDead && syncHealth.allHealthy,
      slack_sent: slackSent,
      dry_run: dryRun,
    };

    await supabase.from("hubspot_sync_runs").insert({
      run_type: "nightly_data_hygiene",
      object_type: "contacts",
      status: allFails === 0 ? "success" : "partial",
      started_at: nowIso(),
      finished_at: nowIso(),
      items_read: contacts.length,
      items_written: mergeResults.length + zapFixResults.length + nameTrimsDone + normResult.fixes.length,
      items_failed: allFails,
      metadata: runMetadata,
    });

    const result = {
      ok: true,
      dry_run: dryRun,
      contacts_scanned: contacts.length,
      duplicates_found: duplicates.length,
      merges: dryRun ? duplicates.length : mergeResults.length,
      merge_failures: mergeFails.length,
      zap_fixes: dryRun ? zapFixes.length : zapFixResults.length,
      zap_fix_failures: zapFixFails.length,
      name_trims: nameTrimsDone,
      field_norm_fixes: normResult.fixes.length,
      field_norm_failures: normResult.failures.length,
      data_quality_issues: dataQualityIssues.length,
      sync_health: {
        fresh: syncHealth.allFresh,
        no_dead: syncHealth.noDead,
        healthy: syncHealth.allHealthy,
      },
      slack_sent: slackSent,
    };

    console.log("Result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e: any) {
    const errorMessage = String(e?.message || e);
    console.error("Fatal error:", errorMessage);

    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  }
});
