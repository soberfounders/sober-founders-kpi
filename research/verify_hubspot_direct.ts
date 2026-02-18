type EnvMap = Record<string, string>;

async function loadEnv(path = ".env"): Promise<EnvMap> {
  const out: EnvMap = {};
  try {
    const text = await Deno.readTextFile(path);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
  } catch {
    // .env is optional if env vars are set in shell.
  }
  return out;
}

function toMs(daysBack: number) {
  return Date.now() - daysBack * 24 * 60 * 60 * 1000;
}

function classifyGroup(props: Record<string, string | null | undefined>) {
  const blob = [
    props.membership_s_,
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

async function hubspotSearch(token: string, body: Record<string, unknown>) {
  const url = "https://api.hubapi.com/crm/v3/objects/contacts/search";
  const resp = await fetch(url, {
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

async function searchHubSpot() {
  const env = await loadEnv();
  const tokenArg = Deno.args.find((a) => a.startsWith("--token="))?.slice("--token=".length);
  const token = tokenArg || Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN") || env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    throw new Error("Missing HUBSPOT_PRIVATE_APP_TOKEN");
  }

  console.log("Searching HubSpot API directly...");

  const properties = [
    "email",
    "firstname",
    "lastname",
    "membership_s_",
    "hs_analytics_source",
    "hs_analytics_source_data_1",
    "hs_analytics_source_data_2",
    "hs_latest_source_data_2",
    "recent_conversion_event_name",
    "first_conversion_event_name",
    "engagements_last_meeting_booked_campaign",
    "hs_analytics_first_touch_converting_campaign",
    "hs_analytics_last_touch_converting_campaign",
  ];

  const paidGroups = await hubspotSearch(token, {
    filterGroups: [
      {
        filters: [
          { propertyName: "membership_s_", operator: "CONTAINS_TOKEN", value: "Paid Groups" },
        ],
      },
    ],
    properties,
    limit: 10,
  });

  console.log(`Paid Groups contacts found: ${paidGroups.total}`);
  for (const row of paidGroups.results ?? []) {
    const p = row.properties ?? {};
    console.log(
      `  ${p.email ?? "<no-email>"} | membership=${p.membership_s_ ?? ""} | recent=${p.recent_conversion_event_name ?? ""}`,
    );
  }

  // Pull recent PAID_SOCIAL contacts to validate Phoenix vs free attribution signals.
  const recentPaidSocial = await hubspotSearch(token, {
    filterGroups: [
      {
        filters: [
          { propertyName: "createdate", operator: "GTE", value: String(toMs(120)) },
          { propertyName: "hs_analytics_source", operator: "EQ", value: "PAID_SOCIAL" },
        ],
      },
    ],
    properties,
    limit: 200,
    sorts: ["-createdate"],
  });

  const counts = { phoenix: 0, free_tue_thu: 0 };
  for (const row of recentPaidSocial.results ?? []) {
    const group = classifyGroup(row.properties ?? {});
    counts[group as keyof typeof counts] += 1;
  }

  console.log(`Recent PAID_SOCIAL sample size: ${(recentPaidSocial.results ?? []).length}`);
  console.log(`Classified phoenix: ${counts.phoenix}`);
  console.log(`Classified free_tue_thu: ${counts.free_tue_thu}`);

  const phoenixSamples = (recentPaidSocial.results ?? []).filter((r: any) =>
    classifyGroup(r.properties ?? {}) === "phoenix"
  ).slice(0, 5);

  if (phoenixSamples.length > 0) {
    console.log("Phoenix sample rows:");
    for (const row of phoenixSamples) {
      const p = row.properties ?? {};
      console.log(
        `  ${p.email ?? "<no-email>"} | src2=${p.hs_analytics_source_data_2 ?? ""} | recent=${p.recent_conversion_event_name ?? ""}`,
      );
    }
  }
}

searchHubSpot().catch((err) => {
  console.error("verify_hubspot_direct failed:", err.message || err);
  Deno.exit(1);
});
