import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const CORE_METRICS = [
  "GA Sessions",
  "GA Users",
  "GA Pageviews",
  "GA Engaged Sessions",
  "GA Engagement Rate",
];

const CHANNEL_BUCKETS = ["Organic", "Paid", "Direct", "Referral", "Email", "Social", "Other"];

function mustGetEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizePropertyId(raw: string) {
  return String(raw || "").replace(/^properties\//i, "").trim();
}

function gaDateToIso(gaDate: string) {
  const normalized = String(gaDate || "").trim();
  if (!/^\d{8}$/.test(normalized)) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
}

function toNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapChannelBucket(groupRaw: string) {
  const group = String(groupRaw || "").toLowerCase().trim();
  if (!group) return "Other";
  if (
    group.includes("paid") ||
    group.includes("display") ||
    group.includes("cross-network") ||
    group.includes("cross network")
  ) {
    return "Paid";
  }
  if (group === "direct") return "Direct";
  if (group.includes("referral") || group.includes("affiliate")) return "Referral";
  if (group.includes("email")) return "Email";
  if (group.includes("social")) return "Social";
  if (group.includes("organic")) return "Organic";
  if (group.includes("search")) return "Organic";
  return "Other";
}

async function getGoogleAccessToken() {
  const clientId = mustGetEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = mustGetEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = mustGetEnv("GOOGLE_OAUTH_REFRESH_TOKEN");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed refreshing Google token: ${res.status} ${txt}`);
  }

  const json = await res.json();
  if (!json.access_token) throw new Error("Google token response missing access_token");
  return json.access_token as string;
}

async function runGaReport(accessToken: string, propertyId: string, body: Record<string, unknown>) {
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (txt.toLowerCase().includes("insufficient authentication scopes")) {
      throw new Error(
        "Google token missing Analytics scope. Regenerate refresh token with https://www.googleapis.com/auth/analytics.readonly",
      );
    }
    throw new Error(`Google Analytics report failed: ${res.status} ${txt}`);
  }

  const json = await res.json();
  return json.rows || [];
}

async function queryDailyCore(accessToken: string, propertyId: string, startDate: string, endDate: string) {
  return await runGaReport(accessToken, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
      { name: "engagedSessions" },
      { name: "engagementRate" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    keepEmptyRows: true,
    limit: 10000,
  });
}

async function queryDailyChannels(accessToken: string, propertyId: string, startDate: string, endDate: string) {
  return await runGaReport(accessToken, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    keepEmptyRows: false,
    limit: 100000,
  });
}

async function queryDailyOrganicSources(accessToken: string, propertyId: string, startDate: string, endDate: string) {
  return await runGaReport(accessToken, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }, { name: "sessionSource" }, { name: "sessionMedium" }],
    metrics: [{ name: "sessions" }],
    dimensionFilter: {
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: {
          matchType: "EXACT",
          value: "Organic Search",
          caseSensitive: false,
        },
      },
    },
    orderBys: [{ dimension: { dimensionName: "date" } }],
    keepEmptyRows: false,
    limit: 100000,
  });
}

async function writeRows(supabase: any, rows: any[]) {
  const { error: deleteError } = await supabase
    .from("kpi_metrics")
    .delete()
    .eq("source_slug", "google_analytics");

  if (deleteError) throw new Error(`Failed clearing existing GA rows: ${deleteError.message}`);

  const chunkSize = 300;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("kpi_metrics").insert(chunk);
    if (error) throw new Error(`Failed inserting GA rows: ${error.message}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = mustGetEnv("SUPABASE_URL");
    const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const propertyId = normalizePropertyId(
      Deno.env.get("GOOGLE_ANALYTICS_PROPERTY_ID") ||
      Deno.env.get("GA4_PROPERTY_ID") ||
      Deno.env.get("GA_PROPERTY_ID") ||
      "",
    );
    if (!propertyId) {
      throw new Error("Missing required env var: GOOGLE_ANALYTICS_PROPERTY_ID");
    }

    const url = new URL(req.url);
    const days = Math.min(120, Math.max(7, Number(url.searchParams.get("days") || "60")));
    const endDate = formatDate(new Date());
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startDate = formatDate(start);

    const accessToken = await getGoogleAccessToken();

    const [coreRows, channelRows, organicSourceRows] = await Promise.all([
      queryDailyCore(accessToken, propertyId, startDate, endDate),
      queryDailyChannels(accessToken, propertyId, startDate, endDate),
      queryDailyOrganicSources(accessToken, propertyId, startDate, endDate),
    ]);

    const metricRows: any[] = [];

    for (const row of coreRows) {
      const metricDate = gaDateToIso(String(row.dimensionValues?.[0]?.value || ""));
      if (!metricDate) continue;

      const sessions = toNumber(row.metricValues?.[0]?.value);
      const users = toNumber(row.metricValues?.[1]?.value);
      const pageviews = toNumber(row.metricValues?.[2]?.value);
      const engagedSessions = toNumber(row.metricValues?.[3]?.value);
      const engagementRate = toNumber(row.metricValues?.[4]?.value);

      const metadata = { source: "google_analytics", property_id: propertyId };
      metricRows.push(
        {
          source_slug: "google_analytics",
          metric_name: "GA Sessions",
          metric_value: sessions,
          metric_date: metricDate,
          period: "daily",
          metadata,
        },
        {
          source_slug: "google_analytics",
          metric_name: "GA Users",
          metric_value: users,
          metric_date: metricDate,
          period: "daily",
          metadata,
        },
        {
          source_slug: "google_analytics",
          metric_name: "GA Pageviews",
          metric_value: pageviews,
          metric_date: metricDate,
          period: "daily",
          metadata,
        },
        {
          source_slug: "google_analytics",
          metric_name: "GA Engaged Sessions",
          metric_value: engagedSessions,
          metric_date: metricDate,
          period: "daily",
          metadata,
        },
        {
          source_slug: "google_analytics",
          metric_name: "GA Engagement Rate",
          metric_value: engagementRate,
          metric_date: metricDate,
          period: "daily",
          metadata,
        },
      );
    }

    const bucketMap = new Map<string, Map<string, number>>();
    for (const row of channelRows) {
      const metricDate = gaDateToIso(String(row.dimensionValues?.[0]?.value || ""));
      const channelGroup = String(row.dimensionValues?.[1]?.value || "");
      const sessions = toNumber(row.metricValues?.[0]?.value);
      if (!metricDate) continue;

      const bucket = mapChannelBucket(channelGroup);
      if (!bucketMap.has(metricDate)) bucketMap.set(metricDate, new Map<string, number>());
      const dateBuckets = bucketMap.get(metricDate)!;
      dateBuckets.set(bucket, (dateBuckets.get(bucket) || 0) + sessions);
    }

    for (const [metricDate, buckets] of bucketMap.entries()) {
      for (const bucket of CHANNEL_BUCKETS) {
        const metricValue = buckets.get(bucket) || 0;
        metricRows.push({
          source_slug: "google_analytics",
          metric_name: `GA Sessions - ${bucket}`,
          metric_value: metricValue,
          metric_date: metricDate,
          period: "daily",
          metadata: {
            source: "google_analytics",
            property_id: propertyId,
            channel_bucket: bucket,
          },
        });
      }
    }

    const organicSourceMap = new Map<string, { sessions: number; mediums: Set<string>; sourceName: string }>();
    for (const row of organicSourceRows) {
      const metricDate = gaDateToIso(String(row.dimensionValues?.[0]?.value || ""));
      const sourceName = String(row.dimensionValues?.[1]?.value || "(unknown)").trim() || "(unknown)";
      const medium = String(row.dimensionValues?.[2]?.value || "").trim();
      const sessions = toNumber(row.metricValues?.[0]?.value);
      if (!metricDate) continue;

      const key = `${metricDate}::${sourceName.toLowerCase()}`;
      if (!organicSourceMap.has(key)) {
        organicSourceMap.set(key, { sessions: 0, mediums: new Set<string>(), sourceName });
      }
      const acc = organicSourceMap.get(key)!;
      acc.sessions += sessions;
      if (medium) acc.mediums.add(medium);
    }

    for (const [key, value] of organicSourceMap.entries()) {
      const [metricDate] = key.split("::");
      metricRows.push({
        source_slug: "google_analytics",
        metric_name: "GA Organic Sessions by Source",
        metric_value: value.sessions,
        metric_date: metricDate,
        period: "daily",
        metadata: {
          source: "google_analytics",
          property_id: propertyId,
          source_name: value.sourceName,
          source_mediums: Array.from(value.mediums.values()),
          channel_group: "Organic Search",
        },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await writeRows(supabase, metricRows);

    return new Response(
      JSON.stringify({
        ok: true,
        property_id: propertyId,
        start_date: startDate,
        end_date: endDate,
        days,
        core_rows: coreRows.length,
        channel_rows: channelRows.length,
        organic_source_rows: organicSourceRows.length,
        metric_rows_written: metricRows.length,
        metric_names: [
          ...CORE_METRICS,
          ...CHANNEL_BUCKETS.map((bucket) => `GA Sessions - ${bucket}`),
          "GA Organic Sessions by Source",
        ],
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
