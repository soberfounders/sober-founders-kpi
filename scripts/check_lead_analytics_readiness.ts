type EnvMap = Record<string, string>;

async function loadEnv(path = '.env'): Promise<EnvMap> {
  const map: EnvMap = {};
  const content = await Deno.readTextFile(path);
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

async function restGet(url: string, key: string, path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { ok: res.ok, status: res.status, body };
}

function printStatus(label: string, ok: boolean, detail = '') {
  const status = ok ? 'PASS' : 'WARN';
  console.log(`${status}\t${label}${detail ? `\t${detail}` : ''}`);
}

async function run() {
  const env = await loadEnv();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || env.SUPABASE_URL;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment/.env');
  }

  console.log('=== Lead Analytics Readiness Check ===');

  const ads = await restGet(
    supabaseUrl,
    supabaseKey,
    'raw_fb_ads_insights_daily?select=date_day,ad_id,spend,impressions,clicks,leads&limit=1',
  );
  printStatus('Meta table: raw_fb_ads_insights_daily', ads.ok, ads.ok ? 'reachable' : JSON.stringify(ads.body));

  const hubspotBase = await restGet(
    supabaseUrl,
    supabaseKey,
    'raw_hubspot_contacts?select=createdate,email,firstname,lastname,annual_revenue_in_dollars,membership_s,hs_analytics_source,hs_analytics_source_data_2,campaign&limit=1',
  );
  printStatus('HubSpot base columns', hubspotBase.ok, hubspotBase.ok ? 'reachable' : JSON.stringify(hubspotBase.body));

  const hubspotAdvanced = await restGet(
    supabaseUrl,
    supabaseKey,
    'raw_hubspot_contacts?select=hs_latest_source,first_conversion_event_name,recent_conversion_event_name&limit=1',
  );
  printStatus(
    'HubSpot advanced attribution columns',
    hubspotAdvanced.ok,
    hubspotAdvanced.ok ? 'available' : 'missing (fallback attribution mode)',
  );

  const zoom = await restGet(
    supabaseUrl,
    supabaseKey,
    'kpi_metrics?select=metric_name,metric_date,metadata&metric_name=eq.Zoom%20Meeting%20Attendees&limit=1',
  );
  printStatus('Zoom KPI metric (Zoom Meeting Attendees)', zoom.ok, zoom.ok ? 'reachable' : JSON.stringify(zoom.body));

  const luma = await restGet(
    supabaseUrl,
    supabaseKey,
    'raw_luma_registrations?select=event_date,event_api_id,guest_email,matched_zoom,matched_hubspot&limit=1',
  );
  printStatus('Luma table: raw_luma_registrations', luma.ok, luma.ok ? 'available' : 'missing (HubSpot registration proxy in use)');
}

run().catch((err) => {
  console.error('Readiness check failed:', err.message || err);
  Deno.exit(1);
});
