type EnvMap = Record<string, string>;

async function loadEnv(path = '.env'): Promise<EnvMap> {
  const map: EnvMap = {};
  const text = await Deno.readTextFile(path);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
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

async function run() {
  const env = await loadEnv();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || env.SUPABASE_URL;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  const lookbackDays = Number(Deno.args.find((arg) => arg.startsWith('--lookback_days='))?.split('=')[1] || '120');
  const endpoint = `${supabaseUrl}/functions/v1/sync_luma_registrations?lookback_days=${lookbackDays}`;

  console.log(`Triggering Lu.ma sync: ${endpoint}`);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
      'content-type': 'application/json',
    },
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`sync_luma_registrations failed (${res.status}): ${body}`);
  }

  console.log('Lu.ma sync response:');
  console.log(body);
}

run().catch((err) => {
  console.error('Lu.ma sync trigger failed:', err.message || err);
  Deno.exit(1);
});
