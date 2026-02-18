
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

// Load env vars
const bytes = await Deno.readFile('.env');
const envText = new TextDecoder().decode(bytes);
const envVars: Record<string, string> = {};
for (const line of envText.split(/\r?\n/)) { 
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[match[1].trim()] = value;
  }
}

const dbUrl = envVars['SUPABASE_DB_URL'];
if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL");
    Deno.exit(1);
}

const sql = postgres(dbUrl, { prepare: false });

try {
    console.log("Applying funnel rules migration...");
    const migrationSql = await Deno.readTextFile('supabase/migrations/20260218_add_funnel_rules.sql');
    await sql.unsafe(migrationSql);
    console.log("Success!");
} catch (e) {
    console.error("Error:", e);
} finally {
    await sql.end();
}
