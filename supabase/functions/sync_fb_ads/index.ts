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

// Fetch fb_funnel_rules from Supabase
async function fetchFunnelRules(supabaseUrl: string, serviceRoleKey: string) {
  const endpoint = `${supabaseUrl}/rest/v1/fb_funnel_rules?is_active=eq.true&order=priority.asc`;
  
  const resp = await fetch(endpoint, {
    headers: {
      "apikey": serviceRoleKey,
      "authorization": `Bearer ${serviceRoleKey}`,
    },
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Failed to fetch funnel rules: ${resp.status} ${txt}`);
  }

  return await resp.json();
}

// Determine funnel_key for a row based on rules
function applyFunnelRules(rules: any[], row: any): string {
  for (const rule of rules) {
    const fieldValue = row[rule.match_field];
    if (!fieldValue) continue;

    const pattern = rule.match_pattern.toLowerCase();
    const value = String(fieldValue).toLowerCase();

    if (pattern === '%' || value.includes(pattern.replace(/%/g, ''))) {
      return rule.funnel_key;
    }
  }
  return 'unknown'; // fallback
}

// Fetch Meta ads insights
async function fetchMetaAdsInsights(
  accessToken: string,
  adAccountId: string,
  dateStart: string,
  dateEnd: string,
) {
  const fields = [
    'campaign_name',
    'campaign_id',
    'adset_name', 
    'adset_id',
    'ad_name',
    'ad_id',
    'spend',
    'impressions',
    'clicks',
    'actions',
  ].join(',');

  const timeRange = JSON.stringify({ since: dateStart, until: dateEnd });
  
  const url = `https://graph.facebook.com/v18.0/${adAccountId}/insights?` +
    `fields=${fields}&` +
    `time_range=${encodeURIComponent(timeRange)}&` +
    `time_increment=1&` +
    `level=ad&` +
    `access_token=${accessToken}`;

  let allData: any[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const resp = await fetch(nextUrl);
    
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Meta API failed: ${resp.status} ${txt}`);
    }

    const json = await resp.json();
    allData.push(...(json.data ?? []));

    nextUrl = json.paging?.next ?? null;
  }

  return allData;
}

// Upsert FB ads data to Supabase
async function upsertFbAdsData(
  supabaseUrl: string,
  serviceRoleKey: string,
  rows: any[],
) {
  const endpoint = `${supabaseUrl}/rest/v1/raw_fb_ads_insights_daily?on_conflict=ad_account_id,date_day,ad_id`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "authorization": `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      "prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Supabase upsert raw_fb_ads_insights_daily failed: ${resp.status} ${txt}`);
  }

  const inserted = await resp.json();
  return Array.isArray(inserted) ? inserted.length : 0;
}

serve(async (req) => {
  try {
    const META_ACCESS_TOKEN = mustGetEnv("META_ACCESS_TOKEN");
    const META_AD_ACCOUNT_ID = mustGetEnv("META_AD_ACCOUNT_ID");
    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");

    const url = new URL(req.url);
    const weekStart = url.searchParams.get("week_start");
    
    if (!weekStart) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "Missing week_start=YYYY-MM-DD" 
      }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Week is Monday (weekStart) through Sunday (+6 days)
    const weekEnd = addDays(weekStart, 6);

    // Fetch funnel rules
    const funnelRules = await fetchFunnelRules(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch Meta ads data
    const adsData = await fetchMetaAdsInsights(
      META_ACCESS_TOKEN,
      META_AD_ACCOUNT_ID,
      weekStart,
      weekEnd,
    );

    // Transform and apply funnel rules
    const rows = adsData.map((row: any) => {
      const leadAction = row.actions?.find((a: any) => a.action_type === 'lead');
      const leads = leadAction ? parseInt(leadAction.value) : 0;

      const transformedRow = {
        ad_account_id: META_AD_ACCOUNT_ID,
        date_day: row.date_start,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        adset_id: row.adset_id,
        adset_name: row.adset_name,
        ad_id: row.ad_id,
        ad_name: row.ad_name,
        spend: parseFloat(row.spend) || 0,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        leads: leads,
      };

      // Apply funnel rules to determine funnel_key
      const funnelKey = applyFunnelRules(funnelRules, transformedRow);
      
      return {
        ...transformedRow,
        funnel_key: funnelKey,
      };
    });

    // Upsert to database
    const upserted = await upsertFbAdsData(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, rows);

    return new Response(JSON.stringify({
      ok: true,
      week_start: weekStart,
      week_end: weekEnd,
      ads_fetched: adsData.length,
      rows_upserted: upserted,
      funnel_breakdown: {
        phoenix: rows.filter(r => r.funnel_key === 'phoenix').length,
        free: rows.filter(r => r.funnel_key === 'free').length,
      },
    }), {
      headers: { "content-type": "application/json" },
    });

  } catch (e) {
    console.error("sync_fb_ads error:", e);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: String(e?.message ?? e),
      stack: e?.stack 
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
