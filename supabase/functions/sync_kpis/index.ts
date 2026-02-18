import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function mustGetEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateOnly(d);
}

// HubSpot CRM v3 search uses ms since epoch
function toMs(dateStr: string) {
  return new Date(dateStr).getTime();
}

async function hubspotSearchContactsCreatedBetween(
  token: string,
  createdFromIso: string,
  createdToIso: string,
) {
  const url = "https://api.hubapi.com/crm/v3/objects/contacts/search";

  // IMPORTANT: these are the properties we will store into raw_hubspot_contacts
  const properties = [
    "createdate",
    "email",
    "firstname",
    "lastname",

    // Revenue + membership (your custom fields)
    "annual_revenue_in_dollars__official_",
    "annual_revenue_in_dollars",
    "membership_s_",
    "membership_s",
    "hs_latest_meeting_activity",
    "first_conversion_event_name",
    "recent_conversion_event_name",

    // Traffic source + drilldowns
    "hs_analytics_source",
    "hs_analytics_source_data_1",
    "hs_analytics_source_data_2",
    "hs_latest_source",
    "hs_latest_source_data_1",
    "hs_latest_source_data_2",

    // "campaign" equivalents we can use later to infer lead form / campaign
    "hs_analytics_first_touch_converting_campaign",
    "hs_analytics_last_touch_converting_campaign",
    "engagements_last_meeting_booked_campaign",
    "engagements_last_meeting_booked_medium",
    "engagements_last_meeting_booked_source",
    "num_conversion_events",
    "num_unique_conversion_events",

    // Optional if you use it elsewhere
    "campaign_source",
  ];

  const filterGroups = [{
    filters: [
      { propertyName: "createdate", operator: "GTE", value: String(toMs(createdFromIso)) },
      { propertyName: "createdate", operator: "LTE", value: String(toMs(createdToIso)) },
    ],
  }];

  let after: number | undefined = undefined;
  const out: any[] = [];

  while (true) {
    const body: any = {
      limit: 100,
      filterGroups,
      properties,
      sorts: ["createdate"],
    };
    if (after !== undefined) body.after = after;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HubSpot contacts search failed: ${resp.status} ${txt}`);
    }

    const json = await resp.json();
    out.push(...(json.results ?? []));

    const paging = json.paging?.next?.after;
    if (!paging) break;
    after = Number(paging);
  }

  return out;
}

async function pgRpcUpsertHubspotContacts(
  supabaseUrl: string,
  serviceRoleKey: string,
  rows: any[],
) {
  // We use PostgREST to insert into raw table via /rest/v1
  const endpoint = `${supabaseUrl}/rest/v1/raw_hubspot_contacts`;

  const payload = rows.map((r: any) => {
    const p = r.properties ?? {};

    const annualRevenueRaw =
      p.annual_revenue_in_dollars__official_ ??
      p.annual_revenue_in_dollars ??
      null;

    const annualRevenueNum =
      annualRevenueRaw === null || annualRevenueRaw === undefined || annualRevenueRaw === ""
        ? null
        : Number(annualRevenueRaw);

    const membership =
      p.membership_s_ ?? p.membership_s ?? null;

    const hsSource = p.hs_analytics_source ?? null;

    return {
      hubspot_contact_id: Number(r.id),
      ingested_at: new Date().toISOString(),
      createdate: p.createdate ? new Date(p.createdate).toISOString() : null,
      email: p.email ?? null,
      firstname: p.firstname ?? null,
      lastname: p.lastname ?? null,

      annual_revenue_in_dollars: Number.isFinite(annualRevenueNum) ? annualRevenueNum : null,
      membership_s: membership,

      // keep this for backward-compat with your SQL that references original_traffic_source
      original_traffic_source: hsSource,

      // keep campaign/campaign_source fields, but fill campaign with "first touch converting campaign"
      campaign: p.hs_analytics_first_touch_converting_campaign ?? p.hs_analytics_last_touch_converting_campaign ?? null,
      campaign_source: p.campaign_source ?? null,

      // new columns you just added
      hs_analytics_source: hsSource,
      hs_analytics_source_data_1: p.hs_analytics_source_data_1 ?? null,
      hs_analytics_source_data_2: p.hs_analytics_source_data_2 ?? null,
      hs_latest_source: p.hs_latest_source ?? null,
      hs_latest_source_data_1: p.hs_latest_source_data_1 ?? null,
      hs_latest_source_data_2: p.hs_latest_source_data_2 ?? null,
      first_conversion_event_name: p.first_conversion_event_name ?? null,
      recent_conversion_event_name: p.recent_conversion_event_name ?? null,
      engagements_last_meeting_booked_campaign: p.engagements_last_meeting_booked_campaign ?? null,
      engagements_last_meeting_booked_medium: p.engagements_last_meeting_booked_medium ?? null,
      engagements_last_meeting_booked_source: p.engagements_last_meeting_booked_source ?? null,
      num_conversion_events:
        p.num_conversion_events === null || p.num_conversion_events === undefined || p.num_conversion_events === ""
          ? null
          : Number(p.num_conversion_events),
      num_unique_conversion_events:
        p.num_unique_conversion_events === null ||
          p.num_unique_conversion_events === undefined ||
          p.num_unique_conversion_events === ""
          ? null
          : Number(p.num_unique_conversion_events),

      // NOTE: we are not writing hs_latest_form_submission_name because we have not confirmed the exact property name
      // We can add it once we confirm it exists in your portal.
      hs_latest_form_submission_name: null,
      hs_latest_form_submitted_at: null,
    };
  });

  // upsert on hubspot_contact_id (assumes you created a UNIQUE constraint or PK on hubspot_contact_id)
  // If your table uses a different constraint, tell me and I’ll adjust.
  const resp = await fetch(`${endpoint}?on_conflict=hubspot_contact_id`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "authorization": `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      "prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Supabase upsert raw_hubspot_contacts failed: ${resp.status} ${txt}`);
  }

  const inserted = await resp.json();
  return Array.isArray(inserted) ? inserted.length : 0;
}

serve(async (req) => {
  try {
    const HUBSPOT_TOKEN = mustGetEnv("HUBSPOT_PRIVATE_APP_TOKEN");
    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");

    const url = new URL(req.url);

    // week_start should be Monday date like 2026-02-09
    const weekStart = url.searchParams.get("week_start");
    if (!weekStart) {
      return new Response(JSON.stringify({ ok: false, error: "Missing week_start=YYYY-MM-DD" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Pull a slightly padded UTC range to avoid timezone edge misses
    // (we’ll do the real Monday-Sunday logic in SQL using America/New_York)
    const from = `${addDays(weekStart, -1)}T00:00:00.000Z`;
    const to = `${addDays(weekStart, 7)}T23:59:59.999Z`;

    const contacts = await hubspotSearchContactsCreatedBetween(HUBSPOT_TOKEN, from, to);
    const upserted = await pgRpcUpsertHubspotContacts(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, contacts);

    return new Response(JSON.stringify({
      ok: true,
      week_start: weekStart,
      pulled_contacts: contacts.length,
      hubspot_contacts_upserted: upserted,
      note: "Contacts ingested with traffic drilldowns + converting campaign fields (for lead form inference).",
    }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
