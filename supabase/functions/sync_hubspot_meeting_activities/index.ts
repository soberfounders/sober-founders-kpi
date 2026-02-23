import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dateDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return isoDateOnly(d);
}

function toMs(value: string) {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) throw new Error(`Invalid date: ${value}`);
  return ts;
}

type HubSpotObjectType = "meetings" | "calls";

type HubSpotSearchResult = {
  id: string;
  properties?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
};

function inRangeIso(isoLike: any, fromIso: string, toIso: string): boolean {
  if (!isoLike) return false;
  const ts = new Date(String(isoLike)).getTime();
  if (!Number.isFinite(ts)) return false;
  const fromTs = new Date(fromIso).getTime();
  const toTs = new Date(toIso).getTime();
  return ts >= fromTs && ts <= toTs;
}

async function hubspotListObjectsByTimestamp(
  token: string,
  objectType: HubSpotObjectType,
  fromIso: string,
  toIso: string,
): Promise<HubSpotSearchResult[]> {
  const properties = [
    "hs_timestamp",
    "hs_meeting_title",
    "hs_call_title",
    "hs_body_preview",
    "hubspot_owner_id",
    "createdate",
    "hs_lastmodifieddate",
  ];
  const baseUrl = `https://api.hubapi.com/crm/v3/objects/${objectType}`;
  const out: HubSpotSearchResult[] = [];
  let after: string | undefined = undefined;

  for (let page = 0; page < 500; page += 1) {
    const u = new URL(baseUrl);
    u.searchParams.set("limit", "100");
    u.searchParams.set("archived", "false");
    u.searchParams.set("properties", properties.join(","));
    if (after) u.searchParams.set("after", after);

    const resp = await fetch(u.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HubSpot ${objectType} list failed: ${resp.status} ${txt}`);
    }

    const json = await resp.json();
    const pageResults = Array.isArray(json?.results) ? json.results : [];
    for (const row of pageResults) {
      const props = row?.properties || {};
      const keep =
        inRangeIso(props?.hs_timestamp, fromIso, toIso) ||
        inRangeIso(props?.createdate || row?.createdAt, fromIso, toIso);
      if (keep) out.push(row);
    }

    const nextAfter = json?.paging?.next?.after;
    if (!nextAfter) break;
    after = String(nextAfter);
  }

  return out;
}

async function hubspotSearchObjectsByTimestamp(
  token: string,
  objectType: HubSpotObjectType,
  fromIso: string,
  toIso: string,
): Promise<HubSpotSearchResult[]> {
  const url = `https://api.hubapi.com/crm/v3/objects/${objectType}/search`;
  const properties = [
    "hs_timestamp",
    "hs_meeting_title",
    "hs_call_title",
    "hs_body_preview",
    "hubspot_owner_id",
    "createdate",
    "hs_lastmodifieddate",
  ];

  const filterGroups = [
    {
      filters: [
        { propertyName: "hs_timestamp", operator: "GTE", value: String(toMs(fromIso)) },
        { propertyName: "hs_timestamp", operator: "LTE", value: String(toMs(toIso)) },
      ],
    },
    // Fallback group in case hs_timestamp is missing for some rows.
    {
      filters: [
        { propertyName: "createdate", operator: "GTE", value: String(toMs(fromIso)) },
        { propertyName: "createdate", operator: "LTE", value: String(toMs(toIso)) },
      ],
    },
  ];

  const out: HubSpotSearchResult[] = [];
  let after: string | undefined = undefined;

  for (let page = 0; page < 200; page += 1) {
    const body: any = {
      limit: 100,
      filterGroups,
      properties,
      sorts: ["hs_timestamp"],
    };
    if (after) body.after = after;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      // Some portals/object types return 400 for CRM search on meetings/calls.
      // Fallback to paginated list endpoint and filter by timestamp client-side.
      if (resp.status === 400) {
        return await hubspotListObjectsByTimestamp(token, objectType, fromIso, toIso);
      }
      throw new Error(`HubSpot ${objectType} search failed: ${resp.status} ${txt}`);
    }

    const json = await resp.json();
    out.push(...(json.results || []));

    const nextAfter = json?.paging?.next?.after;
    if (!nextAfter) break;
    after = String(nextAfter);
  }

  return out;
}

async function hubspotBatchReadAssociations(
  token: string,
  objectType: HubSpotObjectType,
  objectIds: string[],
): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  if (!objectIds.length) return out;

  // Batch in chunks to stay safe with API payload sizes.
  for (let i = 0; i < objectIds.length; i += 100) {
    const chunk = objectIds.slice(i, i + 100);
    const resp = await fetch(`https://api.hubapi.com/crm/v3/associations/${objectType}/contacts/batch/read`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        inputs: chunk.map((id) => ({ id: String(id) })),
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HubSpot associations batch read failed for ${objectType}: ${resp.status} ${txt}`);
    }

    const json = await resp.json();
    for (const row of json?.results || []) {
      const fromId = String(row?.from?.id || "");
      if (!fromId) continue;
      const toRows = Array.isArray(row?.to) ? row.to : [];
      const existing = out.get(fromId) || [];
      out.set(fromId, existing.concat(toRows));
    }
  }

  return out;
}

async function hubspotBatchReadContacts(
  token: string,
  contactIds: string[],
): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  if (!contactIds.length) return out;

  const properties = [
    "email",
    "firstname",
    "lastname",
    "createdate",
    "annual_revenue_in_usd_official",
    "annual_revenue_in_dollars__official_",
    "annual_revenue_in_dollars",
    "sobriety_date",
    "sobriety_date__official_",
    "sober_date",
    "clean_date",
    "membership_s",
    "membership_s_",
    "hs_additional_emails",
    "hs_analytics_source",
    "hs_analytics_source_data_1",
    "hs_analytics_source_data_2",
  ];

  for (let i = 0; i < contactIds.length; i += 100) {
    const chunk = contactIds.slice(i, i + 100);
    const resp = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/batch/read`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        properties,
        inputs: chunk.map((id) => ({ id: String(id) })),
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HubSpot contacts batch read failed: ${resp.status} ${txt}`);
    }

    const json = await resp.json();
    for (const row of json?.results || []) {
      out.set(String(row?.id || ""), row);
    }
  }

  return out;
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

function toIsoMaybe(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function mapHubspotContactToRawContactRow(contact: any) {
  const contactId = Number(contact?.id);
  if (!Number.isFinite(contactId)) return null;
  const props = contact?.properties || {};

  const officialRevenueRaw = firstPresent(props, [
    "annual_revenue_in_usd_official",
    "annual_revenue_in_dollars__official_",
  ]);
  const fallbackRevenueRaw = firstPresent(props, ["annual_revenue_in_dollars"]);
  const officialRevenue = toNumberOrNull(officialRevenueRaw);
  const fallbackRevenue = toNumberOrNull(fallbackRevenueRaw);
  const annualRevenue = officialRevenue ?? fallbackRevenue;
  const sobrietyDate = firstPresent(props, [
    "sobriety_date",
    "sobriety_date__official_",
    "sober_date",
    "clean_date",
  ]);
  const membership = firstPresent(props, ["membership_s_", "membership_s"]);
  const hsSource = firstPresent(props, ["hs_analytics_source"]);

  return {
    hubspot_contact_id: contactId,
    ingested_at: new Date().toISOString(),
    createdate: toIsoMaybe(props?.createdate),
    email: typeof props?.email === "string" ? props.email : null,
    firstname: typeof props?.firstname === "string" ? props.firstname : null,
    lastname: typeof props?.lastname === "string" ? props.lastname : null,
    annual_revenue_in_dollars: annualRevenue,
    annual_revenue_in_dollars__official_: officialRevenue,
    sobriety_date: typeof sobrietyDate === "string" ? sobrietyDate : null,
    membership_s: typeof membership === "string" ? membership : null,
    hs_additional_emails: typeof props?.hs_additional_emails === "string" ? props.hs_additional_emails : null,
    original_traffic_source: typeof hsSource === "string" ? hsSource : null,
    hs_analytics_source: typeof hsSource === "string" ? hsSource : null,
    hs_analytics_source_data_1: typeof props?.hs_analytics_source_data_1 === "string" ? props.hs_analytics_source_data_1 : null,
    hs_analytics_source_data_2: typeof props?.hs_analytics_source_data_2 === "string" ? props.hs_analytics_source_data_2 : null,
  };
}

async function upsertRows(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  onConflict: string,
  rows: any[],
) {
  if (!rows.length) return 0;

  const endpoint = `${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Supabase upsert ${table} failed: ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  return Array.isArray(data) ? data.length : 0;
}

function objectTitle(objectType: HubSpotObjectType, props: Record<string, any>) {
  return objectType === "meetings"
    ? String(props?.hs_meeting_title || "").trim()
    : String(props?.hs_call_title || "").trim();
}

function objectBodyPreview(props: Record<string, any>) {
  return String(props?.hs_body_preview || "").trim();
}

function parseIsoMaybe(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function readBoolFlag(url: URL, body: any, key: string, defaultValue: boolean) {
  const qs = url.searchParams.get(key);
  if (qs !== null) return String(qs).toLowerCase() !== "false";
  if (body && Object.prototype.hasOwnProperty.call(body, key)) {
    const raw = body[key];
    if (typeof raw === "boolean") return raw;
    return String(raw).toLowerCase() !== "false";
  }
  return defaultValue;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const HUBSPOT_TOKEN = mustGetEnv("HUBSPOT_PRIVATE_APP_TOKEN");
    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");

    const url = new URL(req.url);
    const reqBody = req.method === "POST" ? (await req.json().catch(() => ({}))) : {};

    const days = Number(url.searchParams.get("days") || reqBody?.days || 30);
    const fromDate = String(url.searchParams.get("from") || reqBody?.from || dateDaysAgo(days));
    const toDate = String(url.searchParams.get("to") || reqBody?.to || isoDateOnly(new Date()));
    const includeMeetings = readBoolFlag(url, reqBody, "include_meetings", true);
    const includeCalls = readBoolFlag(url, reqBody, "include_calls", true);
    const portalId = Number(Deno.env.get("HUBSPOT_PORTAL_ID") || reqBody?.portal_id || 0) || null;

    const fromIso = `${fromDate}T00:00:00.000Z`;
    const toIso = `${toDate}T23:59:59.999Z`;

    const objectTypes: HubSpotObjectType[] = [
      ...(includeMeetings ? ["meetings" as const] : []),
      ...(includeCalls ? ["calls" as const] : []),
    ];
    if (objectTypes.length === 0) {
      throw new Error("Nothing to sync. Enable include_meetings and/or include_calls.");
    }

    const rawActivityRows: any[] = [];
    const assocRows: any[] = [];
    const rawContactsById = new Map<number, any>();

    let searchedObjects = 0;
    let associatedContacts = 0;
    const notes: string[] = [];

    for (const objectType of objectTypes) {
      const objects = await hubspotSearchObjectsByTimestamp(HUBSPOT_TOKEN, objectType, fromIso, toIso);
      searchedObjects += objects.length;

      const objectIds = objects.map((o) => String(o.id)).filter(Boolean);
      const associationsByObject = await hubspotBatchReadAssociations(HUBSPOT_TOKEN, objectType, objectIds);

      const allContactIds = new Set<string>();
      associationsByObject.forEach((toRows) => {
        (toRows || []).forEach((assoc: any) => {
          const contactId = String(assoc?.id || assoc?.toObjectId || "");
          if (contactId) allContactIds.add(contactId);
        });
      });
      const contactsById = await hubspotBatchReadContacts(HUBSPOT_TOKEN, [...allContactIds]);
      contactsById.forEach((contact) => {
        const mapped = mapHubspotContactToRawContactRow(contact);
        if (!mapped) return;
        rawContactsById.set(Number(mapped.hubspot_contact_id), mapped);
      });

      for (const obj of objects) {
        const props = obj?.properties || {};
        rawActivityRows.push({
          hubspot_activity_id: Number(obj.id),
          activity_type: objectType === "meetings" ? "meeting" : "call",
          portal_id: portalId,
          hs_timestamp: parseIsoMaybe(props?.hs_timestamp),
          created_at_hubspot: parseIsoMaybe(props?.createdate || obj?.createdAt),
          updated_at_hubspot: parseIsoMaybe(props?.hs_lastmodifieddate || obj?.updatedAt),
          title: objectTitle(objectType, props) || null,
          body_preview: objectBodyPreview(props) || null,
          owner_id: String(props?.hubspot_owner_id || "").trim() || null,
          metadata: {
            object_type: objectType,
            archived: !!obj?.archived,
          },
          raw_payload: obj,
          ingested_at: new Date().toISOString(),
        });

        const toRows = associationsByObject.get(String(obj.id)) || [];
        for (const assoc of toRows) {
          const contactId = Number(assoc?.id || assoc?.toObjectId);
          if (!Number.isFinite(contactId)) continue;
          const contact = contactsById.get(String(contactId));
          const cProps = contact?.properties || {};
          assocRows.push({
            hubspot_activity_id: Number(obj.id),
            activity_type: objectType === "meetings" ? "meeting" : "call",
            hubspot_contact_id: contactId,
            association_type: "contact",
            contact_email: String(cProps?.email || "").trim() || null,
            contact_firstname: String(cProps?.firstname || "").trim() || null,
            contact_lastname: String(cProps?.lastname || "").trim() || null,
            metadata: {
              association: assoc,
              contact_createdate: cProps?.createdate || null,
              hs_analytics_source: cProps?.hs_analytics_source || null,
              hs_analytics_source_data_1: cProps?.hs_analytics_source_data_1 || null,
              hs_analytics_source_data_2: cProps?.hs_analytics_source_data_2 || null,
            },
            ingested_at: new Date().toISOString(),
          });
          associatedContacts += 1;
        }
      }

      notes.push(`${objectType}: ${objects.length} activities, ${[...allContactIds].length} associated contacts`);
    }

    const upsertedActivities = await upsertRows(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      "raw_hubspot_meeting_activities",
      "hubspot_activity_id,activity_type",
      rawActivityRows,
    );

    const upsertedAssociations = await upsertRows(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      "hubspot_activity_contact_associations",
      "hubspot_activity_id,activity_type,hubspot_contact_id,association_type",
      assocRows,
    );

    const upsertedContacts = await upsertRows(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      "raw_hubspot_contacts",
      "hubspot_contact_id",
      [...rawContactsById.values()],
    );

    return new Response(JSON.stringify({
      ok: true,
      from: fromDate,
      to: toDate,
      object_types: objectTypes,
      activities_found: searchedObjects,
      associations_found: associatedContacts,
      raw_hubspot_meeting_activities_upserted: upsertedActivities,
      hubspot_activity_contact_associations_upserted: upsertedAssociations,
      raw_hubspot_contacts_upserted: upsertedContacts,
      notes,
      note: "Additive sync only. Call sync now also refreshes associated contact enrichment in raw_hubspot_contacts.",
    }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
