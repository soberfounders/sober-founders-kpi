import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const TUESDAY_ID = "87199667045";
const THURSDAY_ID = "84242212480";

function mustGetEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function dateDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function normName(v: any) {
  return String(v || "")
    .toLowerCase()
    .replace(/['’]s\s*(iphone|ipad|android|galaxy|phone|pc|macbook|desktop|laptop)$/gi, "")
    .replace(/\((iphone|ipad|android|galaxy|phone)\)$/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normEmail(v: any) {
  return String(v || "").trim().toLowerCase();
}

function parseDateKey(v: any) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function readBoolFlag(url: URL, body: any, key: string, defaultValue: boolean) {
  const qs = url.searchParams.get(key);
  if (qs !== null) return String(qs).toLowerCase() !== "false";
  if (body && Object.prototype.hasOwnProperty.call(body, key)) {
    const raw = body[key];
    return typeof raw === "boolean" ? raw : String(raw).toLowerCase() !== "false";
  }
  return defaultValue;
}

function fullAssocName(a: any) {
  return `${String(a?.contact_firstname || "").trim()} ${String(a?.contact_lastname || "").trim()}`.trim();
}

function initialKey(nameKey: string) {
  const t = String(nameKey || "").split(" ").filter(Boolean);
  if (t.length < 2) return "";
  return `${t[0]}|${t[t.length - 1][0] || ""}`;
}

function nameTokens(nameKey: string) {
  return String(nameKey || "").split(" ").map((t) => t.trim()).filter(Boolean);
}

function initialsKey(nameKey: string) {
  const t = nameTokens(nameKey);
  if (t.length < 2) return "";
  return t.map((x) => x[0] || "").join("");
}

function isPrefixNameMatch(a: string, b: string) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (!aa || !bb || aa === bb) return false;
  return aa.startsWith(`${bb} `) || bb.startsWith(`${aa} `);
}

function tokenSubsetMatch(a: string, b: string) {
  const at = nameTokens(a);
  const bt = nameTokens(b);
  if (at.length < 2 || bt.length < 2) return false;
  const as = new Set(at);
  const bs = new Set(bt);
  const aInB = at.every((t) => bs.has(t));
  const bInA = bt.every((t) => as.has(t));
  return aInB || bInA;
}

function aliasMap(rows: any[]) {
  const m = new Map<string, string>();
  for (const r of rows || []) {
    const o = normName(r?.original_name);
    const t = String(r?.target_name || "").trim();
    if (o && t) m.set(o, t);
  }
  return m;
}

function canonical(raw: string, aliases: Map<string, string>) {
  let cur = String(raw || "").trim();
  const seen = new Set<string>();
  for (let i = 0; i < 8; i += 1) {
    const k = normName(cur);
    if (!k || seen.has(k)) break;
    seen.add(k);
    const next = aliases.get(k);
    if (!next) break;
    cur = next;
  }
  return cur || raw;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const body = req.method === "POST" ? (await req.json().catch(() => ({}))) : {};
    const days = Number(url.searchParams.get("days") || body?.days || 30);
    const startDate = String(url.searchParams.get("from") || body?.from || dateDaysAgo(days));
    const dryRun = readBoolFlag(url, body, "dry_run", true);

    const [zoomRes, aliasRes, actRes, assocRes, sessionMatchRes, attendeeMapRes] = await Promise.all([
      supabase.from("kpi_metrics")
        .select("id,metric_date,metric_name,metadata")
        .eq("metric_name", "Zoom Meeting Attendees")
        .gte("metric_date", startDate)
        .order("metric_date", { ascending: true })
        .limit(5000),
      supabase.from("attendee_aliases").select("original_name,target_name").limit(5000),
      supabase.from("raw_hubspot_meeting_activities")
        .select("hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title")
        .or(`hs_timestamp.gte.${startDate}T00:00:00.000Z,created_at_hubspot.gte.${startDate}T00:00:00.000Z`)
        .order("hs_timestamp", { ascending: true })
        .limit(10000),
      supabase.from("hubspot_activity_contact_associations")
        .select("hubspot_activity_id,activity_type,hubspot_contact_id,contact_email,contact_firstname,contact_lastname")
        .limit(100000),
      supabase.from("zoom_session_hubspot_activity_matches")
        .select("zoom_session_key,match_source")
        .gte("session_date", startDate)
        .limit(10000),
      supabase.from("zoom_attendee_hubspot_mappings")
        .select("zoom_session_key,zoom_attendee_canonical_name,mapping_source,mapping_priority_rank,mapping_confidence")
        .gte("session_date", startDate)
        .limit(50000),
    ]);

    if (zoomRes.error) throw new Error(`Failed loading Zoom rows: ${zoomRes.error.message}`);
    if (actRes.error) throw new Error(`Failed loading HubSpot activities: ${actRes.error.message}`);
    if (assocRes.error) throw new Error(`Failed loading HubSpot activity associations: ${assocRes.error.message}`);
    if (sessionMatchRes.error) throw new Error(`Failed loading existing session matches: ${sessionMatchRes.error.message}`);
    if (attendeeMapRes.error) throw new Error(`Failed loading existing attendee mappings: ${attendeeMapRes.error.message}`);

    const aliases = aliasMap(aliasRes.error ? [] : (aliasRes.data || []));
    const existingManualSessions = new Set<string>(
      (sessionMatchRes.data || [])
        .filter((r: any) => String(r?.match_source || "").toLowerCase().includes("manual"))
        .map((r: any) => String(r?.zoom_session_key || ""))
    );
    const existingAttendeeMap = new Map<string, any>();
    for (const r of attendeeMapRes.data || []) {
      existingAttendeeMap.set(`${String(r?.zoom_session_key || "")}|${normName(r?.zoom_attendee_canonical_name)}`, r);
    }

    const activitiesByDate = new Map<string, any[]>();
    const contactsByActivity = new Map<string, any[]>();
    for (const a of actRes.data || []) {
      const t = String(a?.activity_type || "").toLowerCase();
      if (t !== "call" && t !== "meeting") continue;
      const id = Number(a?.hubspot_activity_id);
      if (!Number.isFinite(id)) continue;
      const key = `${t}|${id}`;
      const tsIso = a?.hs_timestamp || a?.created_at_hubspot;
      const ts = tsIso ? new Date(tsIso).getTime() : NaN;
      const dateKey = parseDateKey(tsIso);
      const row = { ...a, _k: key, _t: t, _ts: Number.isFinite(ts) ? ts : null, _date: dateKey };
      if (dateKey) {
        if (!activitiesByDate.has(dateKey)) activitiesByDate.set(dateKey, []);
        activitiesByDate.get(dateKey)!.push(row);
      }
      contactsByActivity.set(key, []);
    }
    for (const a of assocRes.data || []) {
      const t = String(a?.activity_type || "").toLowerCase();
      const id = Number(a?.hubspot_activity_id);
      if (!Number.isFinite(id)) continue;
      const k = `${t}|${id}`;
      if (!contactsByActivity.has(k)) continue;
      const n = fullAssocName(a);
      const nk = normName(n);
      contactsByActivity.get(k)!.push({
        ...a,
        _name: n,
        _nk: nk,
        _ik: initialKey(nk),
        _ix: initialsKey(nk),
        _tokens: nameTokens(nk),
        _email: normEmail(a?.contact_email),
      });
    }

    const zoomRows = (zoomRes.data || []).filter((r: any) => {
      const g = String(r?.metadata?.group_name || "").toLowerCase();
      const mid = String(r?.metadata?.meeting_id || "");
      return g === "tuesday" || g === "thursday" || mid === TUESDAY_ID || mid === THURSDAY_ID;
    });

    const sessions: any[] = [];
    for (const r of zoomRows) {
      const metricDate = String(r?.metric_date || "");
      const mid = String(r?.metadata?.meeting_id || "");
      const startTime = r?.metadata?.start_time ? String(r.metadata.start_time) : "";
      const group = String(r?.metadata?.group_name || "").toLowerCase() === "thursday" || mid === THURSDAY_ID ? "Thursday" : "Tuesday";
      const rawAttendees = Array.isArray(r?.metadata?.attendees) ? r.metadata.attendees : [];
      const newDetails = Array.isArray(r?.metadata?.new_attendee_details) ? r.metadata.new_attendee_details : [];
      const emailByKey = new Map<string, string>();
      for (const d of newDetails) {
        const raw = String(d?.name || "").trim();
        if (!raw) continue;
        const can = canonical(raw, aliases);
        const k = normName(can || raw);
        const e = normEmail(d?.email);
        if (k && e) emailByKey.set(k, e);
      }
      const dedup = new Map<string, any>();
      for (const raw of rawAttendees) {
        const rawName = String(raw || "").trim();
        if (!rawName) continue;
        const can = canonical(rawName, aliases) || rawName;
        const nk = normName(can);
        if (!nk || dedup.has(nk)) continue;
        dedup.set(nk, { rawName, canonicalName: can, nk, email: emailByKey.get(nk) || "" });
      }
      sessions.push({
        metricDate,
        meetingId: mid,
        groupName: group,
        startTime: startTime || null,
        zoomSessionKey: `${metricDate}|${mid}|${startTime || ""}`,
        attendees: Array.from(dedup.values()),
      });
    }

    const sessionRows: any[] = [];
    const attendeeRows: any[] = [];
    const sampleSessionMatches: any[] = [];
    const sampleAttendeeMatches: any[] = [];
    let skippedManualSessions = 0;
    let skippedManualAttendees = 0;

    for (const s of sessions) {
      if (existingManualSessions.has(s.zoomSessionKey)) {
        skippedManualSessions += 1;
        continue;
      }
      const candidateDates = [s.metricDate, addDays(s.metricDate, -1), addDays(s.metricDate, 1)];
      const candidates = new Map<string, any>();
      for (const dk of candidateDates) for (const a of activitiesByDate.get(dk) || []) candidates.set(a._k, a);

      let best: any = null;
      let bestScore = -Infinity;
      let secondScore = -Infinity;
      for (const a of candidates.values()) {
        const contacts = contactsByActivity.get(a._k) || [];
        if (contacts.length < 3) continue;
        const exactMap = new Map<string, any[]>();
        const initMap = new Map<string, any[]>();
        const emailMap = new Map<string, any[]>();
        for (const c of contacts) {
          if (!exactMap.has(c._nk)) exactMap.set(c._nk, []);
          exactMap.get(c._nk)!.push(c);
          if (!initMap.has(c._ik)) initMap.set(c._ik, []);
          initMap.get(c._ik)!.push(c);
          if (c._email) {
            if (!emailMap.has(c._email)) emailMap.set(c._email, []);
            emailMap.get(c._email)!.push(c);
          }
        }
        let exact = 0, fuzzy = 0, email = 0, prefix = 0, subset = 0, initials = 0;
        for (const z of s.attendees) {
          if (z.email) {
            const hits = emailMap.get(z.email) || [];
            if (hits.length === 1) { email += 1; continue; }
          }
          const ex = exactMap.get(z.nk) || [];
          if (ex.length === 1) { exact += 1; continue; }
          const ik = initialKey(z.nk);
          const ih = ik ? (initMap.get(ik) || []) : [];
          if (ih.length === 1) { fuzzy += 1; continue; }
          const prefixHits = contacts.filter((c: any) => isPrefixNameMatch(z.nk, c._nk));
          if (prefixHits.length === 1) { prefix += 1; continue; }
          const subsetHits = contacts.filter((c: any) => tokenSubsetMatch(z.nk, c._nk));
          if (subsetHits.length === 1) { subset += 1; continue; }
          const zx = String(z.nk || "").replace(/\s+/g, "");
          if (zx && zx.length >= 2 && zx.length <= 4) {
            const ixHits = contacts.filter((c: any) => String(c._ix || "") === zx);
            if (ixHits.length === 1) initials += 1;
          }
        }
        const zoomTs = s.startTime ? new Date(s.startTime).getTime() : NaN;
        const dtHrs = Number.isFinite(zoomTs) && Number.isFinite(a._ts) ? Math.abs(zoomTs - a._ts) / 36e5 : 999;
        const score = (email * 5) + (exact * 4) + (fuzzy * 1.25) + (prefix * 1.15) + (subset * 1.0) + (initials * 0.9)
          - (Math.min(dtHrs, 18) * 0.15) - (Math.abs(s.attendees.length - contacts.length) * 0.2);
        if (score > bestScore) { secondScore = bestScore; bestScore = score; best = { a, contacts, exact, fuzzy, prefix, subset, initials, email, dtHrs, score }; }
        else if (score > secondScore) { secondScore = score; }
      }

      const accepted = !!best
        && best.dtHrs <= 18
        && (best.exact >= 2 || (best.email >= 1 && best.exact + best.fuzzy >= 1) || best.score >= 5)
        && (bestScore - secondScore >= (best.exact >= 2 ? 1 : 2));
      if (!accepted) continue;

      const conf = Math.max(0.5, Math.min(0.995, 0.55 + (best.email * 0.08) + (best.exact * 0.05) + (best.fuzzy * 0.015) - (Math.min(best.dtHrs, 18) * 0.005)));
      const src = best.email > 0 ? "overlap_heuristic_email+name" : best.exact >= 2 ? "overlap_heuristic_exact_names" : "overlap_heuristic";
      const note = `Exact=${best.exact}, Email=${best.email}, Fuzzy=${best.fuzzy}, Prefix=${best.prefix || 0}, Subset=${best.subset || 0}, Initials=${best.initials || 0}, TimeDiffHrs=${Number(best.dtHrs || 0).toFixed(2)}, ZoomAttendees=${s.attendees.length}, HubSpotContacts=${best.contacts.length}`;

      sessionRows.push({
        session_date: s.metricDate,
        meeting_id: s.meetingId || null,
        group_name: s.groupName || null,
        zoom_start_time_utc: s.startTime || null,
        zoom_session_key: s.zoomSessionKey,
        hubspot_activity_id: Number(best.a?.hubspot_activity_id),
        activity_type: String(best.a?._t || "call"),
        match_source: src,
        match_confidence: Number(conf.toFixed(4)),
        match_note: note,
        metadata: { overlap: { exact: best.exact, email: best.email, fuzzy: best.fuzzy, prefix: best.prefix || 0, subset: best.subset || 0, initials: best.initials || 0, score: Number(best.score.toFixed(3)) } },
      });
      if (sampleSessionMatches.length < 10) sampleSessionMatches.push({ zoom_session_key: s.zoomSessionKey, hubspot_activity_id: best.a?.hubspot_activity_id, activity_type: best.a?._t, match_source: src, match_confidence: Number(conf.toFixed(4)), note });

      const exactMap = new Map<string, any[]>(); const initMap = new Map<string, any[]>(); const emailMap = new Map<string, any[]>();
      for (const c of best.contacts) {
        if (!exactMap.has(c._nk)) exactMap.set(c._nk, []); exactMap.get(c._nk)!.push(c);
        if (!initMap.has(c._ik)) initMap.set(c._ik, []); initMap.get(c._ik)!.push(c);
        if (c._email) { if (!emailMap.has(c._email)) emailMap.set(c._email, []); emailMap.get(c._email)!.push(c); }
      }
      for (const z of s.attendees) {
        const exKey = `${s.zoomSessionKey}|${normName(z.canonicalName)}`;
        const existing = existingAttendeeMap.get(exKey);
        if (existing && String(existing?.mapping_source || "").toLowerCase().includes("manual")) { skippedManualAttendees += 1; continue; }

        let c: any = null, ms = "", mr = "", pr = 999, mc = 0, hints = "";
        if (z.email) {
          const hits = emailMap.get(z.email) || [];
          if (hits.length === 1) { c = hits[0]; ms = "hubspot_meeting_activity_email"; mr = "Matched by email within HubSpot activity-associated contacts"; pr = 10; mc = 0.995; }
          else if (hits.length > 1) hints = hits.slice(0, 5).map((x: any) => fullAssocName(x) || x._email).join(", ");
        }
        if (!c) {
          const hits = exactMap.get(z.nk) || [];
          if (hits.length === 1) { c = hits[0]; ms = "hubspot_meeting_activity_exact_name"; mr = "Matched by exact normalized name within HubSpot activity-associated contacts"; pr = 20; mc = 0.99; }
          else if (hits.length > 1) hints = hints || hits.slice(0, 5).map((x: any) => fullAssocName(x) || x._email).join(", ");
        }
        if (!c) {
          const ik = initialKey(z.nk);
          const hits = ik ? (initMap.get(ik) || []) : [];
          if (hits.length === 1) { c = hits[0]; ms = "hubspot_meeting_activity_fuzzy_name"; mr = "Matched by first name + last initial within HubSpot activity-associated contacts"; pr = 30; mc = 0.78; }
          else if (hits.length > 1) hints = hints || hits.slice(0, 5).map((x: any) => fullAssocName(x) || x._email).join(", ");
        }
        if (!c) {
          const hits = best.contacts.filter((x: any) => isPrefixNameMatch(z.nk, x._nk));
          if (hits.length === 1) { c = hits[0]; ms = "hubspot_meeting_activity_name_prefix"; mr = "Matched by name-prefix/token extension within HubSpot activity-associated contacts"; pr = 35; mc = 0.84; }
          else if (hits.length > 1) hints = hints || hits.slice(0, 5).map((x: any) => fullAssocName(x) || x._email).join(", ");
        }
        if (!c) {
          const hits = best.contacts.filter((x: any) => tokenSubsetMatch(z.nk, x._nk));
          if (hits.length === 1) { c = hits[0]; ms = "hubspot_meeting_activity_token_subset"; mr = "Matched by token-subset fuzzy name within HubSpot activity-associated contacts"; pr = 40; mc = 0.74; }
          else if (hits.length > 1) hints = hints || hits.slice(0, 5).map((x: any) => fullAssocName(x) || x._email).join(", ");
        }
        if (!c) {
          const zx = String(z.nk || "").replace(/\s+/g, "");
          const hits = zx && zx.length >= 2 && zx.length <= 4
            ? best.contacts.filter((x: any) => String(x._ix || "") === zx)
            : [];
          if (hits.length === 1) { c = hits[0]; ms = "hubspot_meeting_activity_initials"; mr = "Matched by initials within HubSpot activity-associated contacts"; pr = 45; mc = 0.72; }
          else if (hits.length > 1) hints = hints || hits.slice(0, 5).map((x: any) => fullAssocName(x) || x._email).join(", ");
        }
        if (!c) continue; // conservative

        const existingPr = Number(existing?.mapping_priority_rank);
        const existingCf = Number(existing?.mapping_confidence);
        if (existing && Number.isFinite(existingPr) && existingPr < pr) continue;
        if (existing && Number.isFinite(existingPr) && existingPr === pr && Number.isFinite(existingCf) && existingCf >= mc) continue;

        attendeeRows.push({
          session_date: s.metricDate,
          meeting_id: s.meetingId || null,
          group_name: s.groupName || null,
          zoom_session_key: s.zoomSessionKey,
          zoom_attendee_raw_name: z.rawName,
          zoom_attendee_canonical_name: z.canonicalName,
          hubspot_contact_id: Number(c?.hubspot_contact_id) || null,
          hubspot_name: fullAssocName(c) || null,
          hubspot_email: normEmail(c?._email) || null,
          hubspot_activity_id: Number(best.a?.hubspot_activity_id),
          activity_type: String(best.a?._t || "call"),
          mapping_source: ms,
          mapping_priority_rank: pr,
          mapping_confidence: Number(mc.toFixed(4)),
          mapping_reason: mr,
          match_note: `session_match_source=${src}; ${note}`,
          candidate_hints: hints || null,
          resolver_version: "2026-02-23-v1",
          metadata: { attendee_email_from_zoom: z.email || null, session_match_confidence: Number(conf.toFixed(4)) },
        });
        if (sampleAttendeeMatches.length < 20) sampleAttendeeMatches.push({ zoom_session_key: s.zoomSessionKey, attendee: z.canonicalName, hubspot_contact_id: Number(c?.hubspot_contact_id) || null, hubspot_name: fullAssocName(c), mapping_source: ms, mapping_confidence: Number(mc.toFixed(4)) });
      }
    }

    let writtenSessionMatches = 0;
    let writtenAttendeeMappings = 0;
    if (!dryRun) {
      if (sessionRows.length > 0) {
        const w = await supabase.from("zoom_session_hubspot_activity_matches")
          .upsert(sessionRows, { onConflict: "zoom_session_key,hubspot_activity_id,activity_type" })
          .select("id");
        if (w.error) throw new Error(`Failed upserting zoom_session_hubspot_activity_matches: ${w.error.message}`);
        writtenSessionMatches = (w.data || []).length;
      }
      if (attendeeRows.length > 0) {
        const w = await supabase.from("zoom_attendee_hubspot_mappings")
          .upsert(attendeeRows, { onConflict: "zoom_session_key,zoom_attendee_canonical_name" })
          .select("id");
        if (w.error) throw new Error(`Failed upserting zoom_attendee_hubspot_mappings: ${w.error.message}`);
        writtenAttendeeMappings = (w.data || []).length;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      mode: dryRun ? "dry_run" : "write",
      start_date: startDate,
      zoom_sessions_seen: sessions.length,
      sessions_with_hubspot_activity_match: sessionRows.length,
      session_match_table_available: true,
      activity_association_table_available: true,
      hubspot_activity_contact_associations_rows: (assocRes.data || []).length,
      attendee_mappings_proposed: attendeeRows.length,
      sessions_written: writtenSessionMatches,
      attendee_mappings_written: writtenAttendeeMappings,
      skipped_manual_sessions: skippedManualSessions,
      skipped_manual_attendees: skippedManualAttendees,
      note: dryRun
        ? "Dry-run only. Conservative materializer (email/exact/initial only). Manual mappings preserved."
        : "Materialized conservative session/activity matches and attendee mappings. Manual mappings preserved.",
      sample_session_matches: sampleSessionMatches,
      sample_attendee_matches: sampleAttendeeMatches,
    }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
