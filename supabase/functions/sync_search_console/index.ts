import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const METRIC_NAMES = [
  "GSC Clicks",
  "GSC Impressions",
  "GSC CTR",
  "GSC Avg Position",
  "GSC Keyword Clicks",
  "GSC Keyword Impressions",
  "GSC Keyword CTR",
  "GSC Keyword Position",
];

function mustGetEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
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

async function listSearchConsoleSites(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    if (txt.toLowerCase().includes("insufficient authentication scopes")) {
      throw new Error(
        "Google token missing Search Console scope. Regenerate refresh token with https://www.googleapis.com/auth/webmasters.readonly",
      );
    }
    throw new Error(`Failed listing Search Console sites: ${res.status} ${txt}`);
  }

  const json = await res.json();
  return json.siteEntry || [];
}

async function querySearchConsoleByDate(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const payload = {
    startDate,
    endDate,
    dimensions: ["date"],
    rowLimit: 25000,
    dataState: "final",
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (txt.toLowerCase().includes("insufficient authentication scopes")) {
      throw new Error(
        "Google token missing Search Console scope. Regenerate refresh token with https://www.googleapis.com/auth/webmasters.readonly",
      );
    }
    throw new Error(`Search Console query failed: ${res.status} ${txt}`);
  }

  const json = await res.json();
  return json.rows || [];
}

async function querySearchConsoleKeywords(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  maxRows: number,
) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const out: any[] = [];
  let startRow = 0;

  while (out.length < maxRows) {
    const rowLimit = Math.min(1000, maxRows - out.length);
    const payload = {
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit,
      startRow,
      dataState: "final",
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (txt.toLowerCase().includes("insufficient authentication scopes")) {
        throw new Error(
          "Google token missing Search Console scope. Regenerate refresh token with https://www.googleapis.com/auth/webmasters.readonly",
        );
      }
      throw new Error(`Search Console keyword query failed: ${res.status} ${txt}`);
    }

    const json = await res.json();
    const rows = json.rows || [];
    if (rows.length === 0) break;

    out.push(...rows.slice(0, maxRows - out.length));
    if (rows.length < rowLimit) break;
    startRow += rows.length;
  }

  return out;
}

async function writeRows(supabase: any, rows: any[]) {
  const { error: deleteError } = await supabase
    .from("kpi_metrics")
    .delete()
    .eq("source_slug", "google_search_console");

  if (deleteError) throw new Error(`Failed clearing existing GSC rows: ${deleteError.message}`);

  if (rows.length === 0) return;

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("kpi_metrics").insert(chunk);
    if (error) throw new Error(`Failed inserting GSC rows: ${error.message}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = mustGetEnv("SUPABASE_URL");
    const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const defaultSiteUrl = Deno.env.get("GSC_SITE_URL") || "";
    const url = new URL(req.url);
    const days = Math.min(120, Math.max(7, Number(url.searchParams.get("days") || "60")));
    const keywordRowsLimit = Math.min(5000, Math.max(200, Number(url.searchParams.get("keyword_rows") || "2000")));
    const explicitSite = url.searchParams.get("site_url") || "";

    const endDate = formatDate(new Date());
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startDate = formatDate(start);

    const accessToken = await getGoogleAccessToken();
    const sites = await listSearchConsoleSites(accessToken);
    if (sites.length === 0) throw new Error("No Search Console sites found for this Google account.");

    const selectedSite =
      explicitSite ||
      defaultSiteUrl ||
      sites.find((s: any) => s.permissionLevel !== "siteUnverifiedUser")?.siteUrl ||
      sites[0].siteUrl;

    const [rowsByDate, keywordRows] = await Promise.all([
      querySearchConsoleByDate(accessToken, selectedSite, startDate, endDate),
      querySearchConsoleKeywords(accessToken, selectedSite, startDate, endDate, keywordRowsLimit),
    ]);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const metricRows: any[] = [];

    for (const row of rowsByDate) {
      const metricDate = String(row.keys?.[0] || "");
      const clicks = Number(row.clicks || 0);
      const impressions = Number(row.impressions || 0);
      const ctr = Number(row.ctr || 0);
      const position = Number(row.position || 0);

      const metadata = {
        site_url: selectedSite,
        source: "google_search_console",
      };

      metricRows.push(
        {
          source_slug: "google_search_console",
          metric_name: "GSC Clicks",
          metric_value: clicks,
          metric_date: metricDate,
          period: "daily",
          metadata,
        },
        {
          source_slug: "google_search_console",
          metric_name: "GSC Impressions",
          metric_value: impressions,
          metric_date: metricDate,
          period: "daily",
          metadata,
        },
        {
          source_slug: "google_search_console",
          metric_name: "GSC CTR",
          metric_value: ctr,
          metric_date: metricDate,
          period: "daily",
          metadata,
        },
        {
          source_slug: "google_search_console",
          metric_name: "GSC Avg Position",
          metric_value: position,
          metric_date: metricDate,
          period: "daily",
          metadata,
        },
      );
    }

    for (const row of keywordRows) {
      const query = String(row.keys?.[0] || "").trim();
      const page = String(row.keys?.[1] || "").trim();
      if (!query) continue;

      const clicks = Number(row.clicks || 0);
      const impressions = Number(row.impressions || 0);
      const ctr = Number(row.ctr || 0);
      const position = Number(row.position || 0);

      const metadata = {
        site_url: selectedSite,
        source: "google_search_console",
        query,
        page,
        start_date: startDate,
        end_date: endDate,
      };

      metricRows.push(
        {
          source_slug: "google_search_console",
          metric_name: "GSC Keyword Clicks",
          metric_value: clicks,
          metric_date: endDate,
          period: "range",
          metadata,
        },
        {
          source_slug: "google_search_console",
          metric_name: "GSC Keyword Impressions",
          metric_value: impressions,
          metric_date: endDate,
          period: "range",
          metadata,
        },
        {
          source_slug: "google_search_console",
          metric_name: "GSC Keyword CTR",
          metric_value: ctr,
          metric_date: endDate,
          period: "range",
          metadata,
        },
        {
          source_slug: "google_search_console",
          metric_name: "GSC Keyword Position",
          metric_value: position,
          metric_date: endDate,
          period: "range",
          metadata,
        },
      );
    }

    await writeRows(supabase, metricRows);

    return new Response(
      JSON.stringify({
        ok: true,
        days,
        keyword_rows_limit: keywordRowsLimit,
        start_date: startDate,
        end_date: endDate,
        site_url: selectedSite,
        rows_from_api: rowsByDate.length,
        keyword_rows_from_api: keywordRows.length,
        metric_rows_written: metricRows.length,
        metric_names: METRIC_NAMES,
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
