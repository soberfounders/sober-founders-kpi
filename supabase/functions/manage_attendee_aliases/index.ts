import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function mustGetEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeName(value = "") {
  return String(value).toLowerCase().trim().replace(/\s+/g, " ");
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function listAliases(supabase: any) {
  const { data, error } = await supabase
    .from("attendee_aliases")
    .select("id, original_name, target_name")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function mergeAlias(supabase: any, sourceName: string, targetName: string) {
  const source = String(sourceName || "").trim();
  const target = String(targetName || "").trim();
  const sourceNorm = normalizeName(source);
  const targetNorm = normalizeName(target);

  if (!source || !target) {
    throw new Error("source_name and target_name are required.");
  }
  if (!sourceNorm || !targetNorm || sourceNorm === targetNorm) {
    throw new Error("source_name and target_name must be different normalized names.");
  }

  const aliases = await listAliases(supabase);

  const rowsToDelete = aliases.filter((row: any) => {
    const originalNorm = normalizeName(row?.original_name || "");
    return originalNorm === sourceNorm || originalNorm === targetNorm;
  });

  if (rowsToDelete.length > 0) {
    const ids = rowsToDelete.map((row: any) => row.id).filter(Boolean);
    if (ids.length > 0) {
      const { error: deleteErr } = await supabase.from("attendee_aliases").delete().in("id", ids);
      if (deleteErr) throw deleteErr;
    }
  }

  const rowsToRetarget = aliases.filter((row: any) => {
    const originalNorm = normalizeName(row?.original_name || "");
    const rowTargetNorm = normalizeName(row?.target_name || "");
    if (originalNorm === sourceNorm || originalNorm === targetNorm) return false;
    return rowTargetNorm === sourceNorm;
  });

  for (const row of rowsToRetarget) {
    const { error: updateErr } = await supabase
      .from("attendee_aliases")
      .update({ target_name: target })
      .eq("id", row.id);
    if (updateErr) throw updateErr;
  }

  const { error: insertErr } = await supabase
    .from("attendee_aliases")
    .insert({ original_name: source, target_name: target });
  if (insertErr) throw insertErr;

  return await listAliases(supabase);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = mustGetEnv("SUPABASE_URL");
    const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "list").toLowerCase();

    if (action === "list") {
      const aliases = await listAliases(supabase);
      return json(200, { ok: true, aliases });
    }

    if (action === "merge") {
      const aliases = await mergeAlias(
        supabase,
        String(body?.source_name || ""),
        String(body?.target_name || ""),
      );
      return json(200, { ok: true, aliases });
    }

    return json(400, { ok: false, error: `Unsupported action: ${action}` });
  } catch (error: any) {
    return json(500, {
      ok: false,
      error: error?.message || String(error),
    });
  }
});

