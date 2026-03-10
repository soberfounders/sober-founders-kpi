import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export const invokeMasterSync = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const url = `${env.supabaseUrl}/functions/v1/master-sync`;
  const bearer = env.masterSyncEdgeInvokeKey || env.supabaseAnonKey || env.supabaseServiceRoleKey;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      apikey: bearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`master-sync invoke failed (${response.status}): ${text.slice(0, 400)}`);
  }

  return json as T;
};
