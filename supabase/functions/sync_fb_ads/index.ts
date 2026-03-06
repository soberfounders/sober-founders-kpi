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

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function toFiniteNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractLeadCountFromActions(actions: any[]): number {
  if (!Array.isArray(actions) || actions.length === 0) return 0;
  // Include core Meta lead action types used across forms + website lead objectives.
  const leadActionTypes = new Set([
    "lead",
    "onsite_conversion.lead_grouped",
    "omni_lead",
  ]);
  return actions.reduce((sum, action) => {
    const actionType = String(action?.action_type || "").toLowerCase();
    if (!leadActionTypes.has(actionType)) return sum;
    return sum + toFiniteNumber(action?.value);
  }, 0);
}

function normalizeAdAccountId(value: unknown): string {
  return String(value ?? "").replace(/^act_/i, "");
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
    // Check if rule applies to this ad account (if specified)
    if (
      rule.ad_account_id &&
      normalizeAdAccountId(rule.ad_account_id) !== normalizeAdAccountId(row.ad_account_id)
    ) {
        continue;
    }

    const fieldValue = row[rule.match_field];
    if (!fieldValue) continue;

    const pattern = rule.match_pattern.toLowerCase();
    const value = String(fieldValue).toLowerCase();

    if (pattern === '%' || value.includes(pattern.replace(/%/g, ''))) {
      return rule.funnel_key;
    }
  }
  // Business rule: everything that is not Phoenix maps to free Tue/Thu funnel.
  return 'free';
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
    const resp: Response = await fetch(nextUrl);
    
    if (!resp.ok) {
      const txt = await resp.text();
      // Log error but don't fail entire batch if one account fails? 
      // For now, let's throw to be safe.
      throw new Error(`Meta API failed for ${adAccountId}: ${resp.status} ${txt}`);
    }

    const json: any = await resp.json();
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
  if (rows.length === 0) return 0;
  
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
    // Support multiple comma-separated IDs
    const META_AD_ACCOUNT_IDS_STR = Deno.env.get("META_AD_ACCOUNT_IDS") || Deno.env.get("META_AD_ACCOUNT_ID") || "";
    if (!META_AD_ACCOUNT_IDS_STR) throw new Error("Missing META_AD_ACCOUNT_IDS or META_AD_ACCOUNT_ID");

    const adAccountIds = META_AD_ACCOUNT_IDS_STR.split(',').map(s => s.trim()).filter(Boolean);

    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");

    const url = new URL(req.url);
    const body = req.method === "POST" ? (await req.json().catch(() => ({}))) : {};

    const weekStartRaw = String(url.searchParams.get("week_start") || body?.week_start || "").trim();
    const fromRaw = String(url.searchParams.get("from") || body?.from || "").trim();
    const toRaw = String(url.searchParams.get("to") || body?.to || "").trim();
    const daysRaw = Number(url.searchParams.get("days") || body?.days || 45);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), 730) : 45;

    const today = isoDateOnly(new Date());
    let dateStart = "";
    let dateEnd = "";
    if (isDateKey(fromRaw)) {
      dateStart = fromRaw;
      dateEnd = isDateKey(toRaw) ? toRaw : today;
    } else if (isDateKey(weekStartRaw)) {
      dateStart = weekStartRaw;
      dateEnd = addDays(weekStartRaw, 6);
    } else {
      dateEnd = today;
      dateStart = addDays(today, -(days - 1));
    }

    // Fetch funnel rules
    const funnelRules = await fetchFunnelRules(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let totalAdsFetched = 0;
    let allRows: any[] = [];

    // Iterate over each ad account
    for (const adAccountId of adAccountIds) {
        try {
            // Fetch Meta ads data
            const adsData = await fetchMetaAdsInsights(
              META_ACCESS_TOKEN,
              adAccountId,
              dateStart,
              dateEnd,
            );
            
            totalAdsFetched += adsData.length;

            // Transform and apply funnel rules
            const rows = adsData.map((row: any) => {
              const leads = extractLeadCountFromActions(row.actions);

              const transformedRow = {
                ad_account_id: normalizeAdAccountId(adAccountId),
                date_day: row.date_start,
                campaign_id: row.campaign_id,
                campaign_name: row.campaign_name,
                adset_id: row.adset_id,
                adset_name: row.adset_name,
                ad_id: row.ad_id,
                ad_name: row.ad_name,
                spend: toFiniteNumber(row.spend),
                impressions: Math.round(toFiniteNumber(row.impressions)),
                clicks: Math.round(toFiniteNumber(row.clicks)),
                leads: leads,
              };

              // Apply funnel rules to determine funnel_key
              // HARDCODED RULE: If campaign name contains "phoenix", map to 'phoenix' funnel
              let funnelKey = 'unknown';
              if ((transformedRow.campaign_name || '').toLowerCase().includes('phoenix')) {
                  funnelKey = 'phoenix';
              } else {
                  funnelKey = applyFunnelRules(funnelRules, transformedRow);
              }
              
              return {
                ...transformedRow,
                funnel_key: funnelKey,
              };
            });
            
            allRows.push(...rows);
        } catch (err) {
            console.error(`Error fetching/processing ads for account ${adAccountId}:`, err);
            // Continue to next account
        }
    }

    // Upsert to database (batch per account or all at once? All at once is fine for small scale)
    const upserted = await upsertFbAdsData(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, allRows);

    return new Response(JSON.stringify({
      ok: true,
      date_start: dateStart,
      date_end: dateEnd,
      days,
      ads_fetched: totalAdsFetched,
      rows_upserted: upserted,
      funnel_breakdown: {
        phoenix: allRows.filter(r => r.funnel_key === 'phoenix').length,
        free: allRows.filter(r => r.funnel_key === 'free').length,
        unknown: allRows.filter(r => r.funnel_key === 'unknown').length,
      },
    }), {
      headers: { "content-type": "application/json" },
    });

  } catch (e: any) {
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
