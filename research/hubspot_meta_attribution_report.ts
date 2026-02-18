type EnvMap = Record<string, string>;

type HubSpotContact = {
  id: string;
  properties: Record<string, string | null | undefined>;
};

type FbRow = {
  date_day: string;
  campaign_name: string | null;
  funnel_key: string | null;
  spend: number | string | null;
  leads: number | string | null;
};

type KpiRow = {
  metric_name: string;
  metric_value: number | string | null;
  metric_date: string;
};

async function loadEnv(path = ".env"): Promise<EnvMap> {
  const out: EnvMap = {};
  try {
    const text = await Deno.readTextFile(path);
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
  } catch {
    // Optional.
  }
  return out;
}

function getArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const found = Deno.args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function classifyLeadGroup(props: Record<string, string | null | undefined>) {
  const blob = [
    props.membership_s_,
    props.membership_s,
    props.hs_analytics_source_data_2,
    props.hs_latest_source_data_2,
    props.recent_conversion_event_name,
    props.first_conversion_event_name,
    props.engagements_last_meeting_booked_campaign,
    props.hs_analytics_first_touch_converting_campaign,
    props.hs_analytics_last_touch_converting_campaign,
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  return blob.includes("phoenix") ? "phoenix" : "free_tue_thu";
}

function isMetaPaidSocial(props: Record<string, string | null | undefined>) {
  return (props.hs_analytics_source || "").toUpperCase() === "PAID_SOCIAL";
}

async function hubspotSearch(
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const resp = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`HubSpot search failed ${resp.status}: ${await resp.text()}`);
  }

  return await resp.json();
}

async function fetchHubspotContacts(token: string, days: number): Promise<HubSpotContact[]> {
  const properties = [
    "createdate",
    "email",
    "membership_s_",
    "membership_s",
    "hs_analytics_source",
    "hs_analytics_source_data_1",
    "hs_analytics_source_data_2",
    "hs_latest_source",
    "hs_latest_source_data_1",
    "hs_latest_source_data_2",
    "recent_conversion_event_name",
    "first_conversion_event_name",
    "engagements_last_meeting_booked_campaign",
    "engagements_last_meeting_booked_source",
    "hs_analytics_first_touch_converting_campaign",
    "hs_analytics_last_touch_converting_campaign",
  ];

  const fromMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const out: HubSpotContact[] = [];
  let after: number | undefined = undefined;

  while (true) {
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [{ propertyName: "createdate", operator: "GTE", value: String(fromMs) }],
      }],
      properties,
      limit: 100,
      sorts: ["-createdate"],
    };
    if (after !== undefined) body.after = after;

    const json = await hubspotSearch(token, body);
    out.push(...(json.results || []));

    if (!json.paging?.next?.after) break;
    after = Number(json.paging.next.after);
  }

  return out;
}

async function supabaseGet<T>(
  supabaseUrl: string,
  key: string,
  pathAndQuery: string,
): Promise<T> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  });

  if (!resp.ok) {
    throw new Error(`Supabase GET failed ${resp.status}: ${await resp.text()}`);
  }

  return await resp.json();
}

function topNCount<T>(items: T[], keyFn: (item: T) => string, n = 8) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = (keyFn(item) || "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

async function run() {
  const env = await loadEnv();
  const hubspotToken = Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN") || env.HUBSPOT_PRIVATE_APP_TOKEN;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || env.SUPABASE_URL;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || env.SUPABASE_ANON_KEY;

  if (!hubspotToken) throw new Error("Missing HUBSPOT_PRIVATE_APP_TOKEN");
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
  if (!supabaseKey) throw new Error("Missing SUPABASE_ANON_KEY");

  const days = Number(getArg("days", "120"));
  const adsDays = Number(getArg("ads-days", "30"));

  const contacts = await fetchHubspotContacts(hubspotToken, days);
  const paidSocial = contacts.filter((c) => isMetaPaidSocial(c.properties || {}));
  const phoenixLeads = paidSocial.filter((c) => classifyLeadGroup(c.properties || {}) === "phoenix");
  const freeLeads = paidSocial.filter((c) => classifyLeadGroup(c.properties || {}) === "free_tue_thu");

  const adsSince = new Date(Date.now() - adsDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fbRows = await supabaseGet<FbRow[]>(
    supabaseUrl,
    supabaseKey,
    `raw_fb_ads_insights_daily?select=date_day,campaign_name,funnel_key,spend,leads&date_day=gte.${adsSince}&order=date_day.asc&limit=5000`,
  );

  const kpiRows = await supabaseGet<KpiRow[]>(
    supabaseUrl,
    supabaseKey,
    `kpi_metrics?select=metric_name,metric_value,metric_date&metric_date=gte.${adsSince}&metric_name=in.(Zoom%20New%20Attendees,Zoom%20New%20Attendees%20-%20Tuesday,Zoom%20New%20Attendees%20-%20Thursday)&order=metric_date.asc&limit=5000`,
  );

  let spendFree = 0;
  let spendPhoenix = 0;
  let leadsFree = 0;
  let leadsPhoenix = 0;
  for (const row of fbRows || []) {
    const isPhoenix = (row.campaign_name || "").toLowerCase().includes("phoenix")
      || (row.funnel_key || "") === "phoenix";
    if (isPhoenix) {
      spendPhoenix += toNum(row.spend);
      leadsPhoenix += toNum(row.leads);
    } else {
      spendFree += toNum(row.spend);
      leadsFree += toNum(row.leads);
    }
  }

  let newTotal = 0;
  let newTue = 0;
  let newThu = 0;
  for (const row of kpiRows || []) {
    const value = toNum(row.metric_value);
    if (row.metric_name === "Zoom New Attendees") newTotal += value;
    else if (row.metric_name === "Zoom New Attendees - Tuesday") newTue += value;
    else if (row.metric_name === "Zoom New Attendees - Thursday") newThu += value;
  }

  const freeNewPeople = newTue + newThu;
  const costPerNewFree = freeNewPeople > 0 ? spendFree / freeNewPeople : 0;

  console.log("=== HubSpot + Meta Attribution Report ===");
  console.log(`HubSpot window: last ${days} days`);
  console.log(`Meta/Zoom window: last ${adsDays} days (since ${adsSince})`);
  console.log("");

  console.log("HubSpot paid-social lead attribution:");
  console.log(`  PAID_SOCIAL leads: ${paidSocial.length}`);
  console.log(`  Phoenix leads (rule-based): ${phoenixLeads.length}`);
  console.log(`  Free Tue/Thu leads (fallback): ${freeLeads.length}`);
  console.log("");

  const topRecentPhoenix = topNCount(
    phoenixLeads,
    (c) => c.properties.recent_conversion_event_name || "",
  );
  const topRecentFree = topNCount(
    freeLeads,
    (c) => c.properties.recent_conversion_event_name || "",
  );

  console.log("Top Phoenix conversion events:");
  for (const [name, count] of topRecentPhoenix) {
    console.log(`  ${count} | ${name}`);
  }
  console.log("");

  console.log("Top Free conversion events:");
  for (const [name, count] of topRecentFree) {
    console.log(`  ${count} | ${name}`);
  }
  console.log("");

  console.log("Top source drill-downs (hs_analytics_source_data_2):");
  for (const [name, count] of topNCount(paidSocial, (c) => c.properties.hs_analytics_source_data_2 || "")) {
    console.log(`  ${count} | ${name}`);
  }
  console.log("");

  console.log("Meta + attendance cost metrics:");
  console.log(`  Free spend: $${spendFree.toFixed(2)}`);
  console.log(`  Phoenix spend: $${spendPhoenix.toFixed(2)}`);
  console.log(`  Free leads (Meta rows): ${leadsFree}`);
  console.log(`  Phoenix leads (Meta rows): ${leadsPhoenix}`);
  console.log(`  New Tue attendees: ${newTue}`);
  console.log(`  New Thu attendees: ${newThu}`);
  console.log(`  New Tue+Thu attendees: ${freeNewPeople}`);
  console.log(`  Cost per new person (free spend / (new Tue + new Thu)): $${costPerNewFree.toFixed(2)}`);
}

run().catch((err) => {
  console.error("hubspot_meta_attribution_report failed:", err.message || err);
  Deno.exit(1);
});
