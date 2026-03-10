#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  buildLeadsQualificationSnapshot,
} from "../dashboard/src/lib/kpiSnapshot.js";
import {
  evaluateLeadQualification,
  extractRevenueSignals,
  parseSobrietyDate,
} from "../dashboard/src/lib/leadsQualificationRules.js";
import {
  compareNumberWithTolerance,
  dateDiffDays,
  summarizeAttendanceIntegrity,
  summarizeLeadsIntegrity,
  toDateKeyUtc,
} from "./lib/kpiDataIntegrity.mjs";

const { Client } = pg;

const DEFAULT_WINDOWS = [7, 30, 90];
const DEFAULT_SAMPLE_SIZE = 20;
const DEFAULT_REPORT_PATH = "docs/audits/kpi-data-integrity-latest.md";
const DEFAULT_MAX_MISSING_REVENUE_PCT = 0.6;
const DEFAULT_MAX_MISSING_SOBRIETY_PCT = 0.6;
const DEFAULT_MAX_FALLBACK_SHARE_PCT = 0.5;
const DEFAULT_HUBSPOT_PARITY_MIN_AGE_DAYS = 3;
const DEFAULT_HUBSPOT_SYNC_LAG_GRACE_HOURS = 72;
const DEFAULT_MAX_EXPLAINED_PARITY_MISMATCH_SHARE = 0.2;

function parseArgs(argv = []) {
  const options = {
    windows: [...DEFAULT_WINDOWS],
    sampleSize: DEFAULT_SAMPLE_SIZE,
    reportPath: DEFAULT_REPORT_PATH,
    jsonPath: "",
    strictHubspotParity: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();
    if (!arg) continue;

    if (arg === "--strict-hubspot-parity") {
      options.strictHubspotParity = true;
      continue;
    }

    if (arg.startsWith("--windows=")) {
      const raw = arg.split("=")[1] || "";
      const parsed = raw.split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value));
      if (parsed.length > 0) options.windows = Array.from(new Set(parsed)).sort((a, b) => a - b);
      continue;
    }

    if (arg.startsWith("--sample-size=")) {
      const parsed = Number(arg.split("=")[1]);
      if (Number.isFinite(parsed) && parsed > 0) options.sampleSize = Math.floor(parsed);
      continue;
    }

    if (arg.startsWith("--report=")) {
      options.reportPath = arg.split("=")[1] || DEFAULT_REPORT_PATH;
      continue;
    }

    if (arg.startsWith("--json=")) {
      options.jsonPath = arg.split("=")[1] || "";
    }
  }

  return options;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function mustGetDatabaseUrl() {
  const value = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "").trim();
  if (!value) {
    throw new Error("Missing SUPABASE_DB_URL (or DATABASE_URL).");
  }
  return value;
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, "\"\"")}"`;
}

function selectClause(columns) {
  return columns.map((column) => quoteIdent(column)).join(",");
}

async function listColumns(client, tableName) {
  const query = `
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = $1
  `;
  const result = await client.query(query, [tableName]);
  return new Set((result.rows || []).map((row) => String(row.column_name)));
}

function hasColumn(columns, name) {
  return columns.has(name);
}

function resolveColumns(existingColumns, desiredColumns) {
  return desiredColumns.filter((column) => hasColumn(existingColumns, column));
}

function parseDbTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractHubspotPropertiesPayload(contact = {}) {
  return contact?.properties && typeof contact.properties === "object"
    ? contact.properties
    : {};
}

async function fetchHubspotContact(contactId, token) {
  const properties = [
    "annual_revenue_in_dollars__official_",
    "annual_revenue_in_usd_official",
    "annual_revenue_in_dollars",
    "sobriety_date__official_",
    "sobriety_date",
    "sober_date",
    "clean_date",
    "email",
  ];
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`);
  url.searchParams.set("archived", "true");
  url.searchParams.set("properties", properties.join(","));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HubSpot contact ${contactId} fetch failed (${response.status}): ${text}`);
  }

  return await response.json();
}

function dateKeyFromSobrietyInput(input) {
  const parsed = parseSobrietyDate(input);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

function createCheck(key, severity, passed, details) {
  return {
    key,
    severity,
    status: passed ? "PASS" : "FAIL",
    details,
  };
}

function createSkipCheck(key, severity, details) {
  return {
    key,
    severity,
    status: "SKIP",
    details,
  };
}

function checkPassed(check) {
  return check.status === "PASS" || check.status === "SKIP";
}

function summarizeCheckCounts(checks = []) {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  for (const check of checks) {
    if (check.status === "PASS") pass += 1;
    else if (check.status === "FAIL") fail += 1;
    else skip += 1;
  }
  return { pass, fail, skip };
}

function markdownFromResult(result) {
  const lines = [];
  lines.push("# KPI Data Integrity Audit");
  lines.push("");
  lines.push(`- generated_at: ${result.generated_at}`);
  lines.push(`- windows_days: ${result.windows.join(", ")}`);
  lines.push(`- strict_hubspot_parity: ${result.strict_hubspot_parity}`);
  lines.push(`- final_verdict: ${result.final_verdict}`);
  lines.push("");
  lines.push("## Check Results");
  lines.push("");
  for (const check of result.checks) {
    lines.push(`- [${check.status}] ${check.key} (${check.severity})`);
    lines.push(`  - ${check.details}`);
  }
  lines.push("");
  lines.push("## Leads Windows");
  lines.push("");
  for (const row of result.leads_windows) {
    lines.push(
      `- ${row.window_days}d: total=${row.total_count}, qualified=${row.qualified_count}, ` +
      `qualified_pct=${row.qualified_pct === null ? "N/A" : (row.qualified_pct * 100).toFixed(2) + "%"}, ` +
      `official=${row.official_qualified_count}, fallback=${row.fallback_qualified_count}`,
    );
  }
  lines.push("");
  lines.push("## Attendance Windows");
  lines.push("");
  for (const row of result.attendance_windows) {
    lines.push(
      `- ${row.window_days}d: tue_unique=${row.tuesday_unique_contacts}, thu_unique=${row.thursday_unique_contacts}, ` +
      `new_attendees=${row.new_attendees_count}, avg_per_person=${row.avg_attendance_per_person === null ? "N/A" : row.avg_attendance_per_person.toFixed(2)}`,
    );
  }
  lines.push("");
  lines.push("## Duplicates");
  lines.push("");
  lines.push(`- contact_id_duplicates: ${result.duplicates.contact_id_duplicates}`);
  lines.push(`- association_duplicates: ${result.duplicates.association_duplicates}`);
  lines.push("");
  lines.push("## Sync Health");
  lines.push("");
  lines.push(`- stale_rows: ${result.sync_health.stale_rows}`);
  lines.push(`- dead_event_rows: ${result.sync_health.dead_event_rows}`);
  lines.push(`- unhealthy_rows: ${result.sync_health.unhealthy_rows}`);
  lines.push("");
  lines.push("## HubSpot Row Parity");
  lines.push("");
  lines.push(`- enabled: ${result.hubspot_row_parity.enabled}`);
  lines.push(`- min_record_age_days: ${result.hubspot_row_parity.min_record_age_days}`);
  lines.push(`- sync_lag_grace_hours: ${result.hubspot_row_parity.sync_lag_grace_hours}`);
  lines.push(`- sample_size: ${result.hubspot_row_parity.sample_size}`);
  lines.push(`- mismatches_total: ${result.hubspot_row_parity.mismatch_count}`);
  lines.push(`- mismatches_blocking: ${result.hubspot_row_parity.blocking_mismatch_count}`);
  lines.push(`- mismatches_explained: ${result.hubspot_row_parity.explained_mismatch_count}`);
  if (Array.isArray(result.hubspot_row_parity.examples) && result.hubspot_row_parity.examples.length > 0) {
    lines.push("- blocking_mismatch_examples:");
    for (const example of result.hubspot_row_parity.examples.slice(0, 10)) {
      lines.push(`  - contact_id=${example.contact_id}: ${example.reason}`);
    }
  }
  if (Array.isArray(result.hubspot_row_parity.explained_examples) && result.hubspot_row_parity.explained_examples.length > 0) {
    lines.push("- explained_mismatch_examples:");
    for (const example of result.hubspot_row_parity.explained_examples.slice(0, 10)) {
      lines.push(`  - contact_id=${example.contact_id}: ${example.reason}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const dbUrl = mustGetDatabaseUrl();
  const hubspotToken = (process.env.HUBSPOT_PRIVATE_APP_TOKEN || "").trim();
  const referenceDate = new Date();
  const maxWindow = Math.max(...options.windows);
  const maxMissingRevenuePct = envNumber("INTEGRITY_MAX_MISSING_REVENUE_PCT", DEFAULT_MAX_MISSING_REVENUE_PCT);
  const maxMissingSobrietyPct = envNumber("INTEGRITY_MAX_MISSING_SOBRIETY_PCT", DEFAULT_MAX_MISSING_SOBRIETY_PCT);
  const maxFallbackSharePct = envNumber("INTEGRITY_MAX_FALLBACK_SHARE_PCT", DEFAULT_MAX_FALLBACK_SHARE_PCT);
  const minHubspotParityAgeDays = Math.max(0, Math.floor(envNumber(
    "INTEGRITY_HUBSPOT_PARITY_MIN_AGE_DAYS",
    DEFAULT_HUBSPOT_PARITY_MIN_AGE_DAYS,
  )));
  const hubspotSyncLagGraceHours = Math.max(0, envNumber(
    "INTEGRITY_HUBSPOT_SYNC_LAG_GRACE_HOURS",
    DEFAULT_HUBSPOT_SYNC_LAG_GRACE_HOURS,
  ));
  const maxExplainedParityMismatchShare = Math.max(0, Math.min(
    1,
    envNumber("INTEGRITY_MAX_EXPLAINED_PARITY_MISMATCH_SHARE", DEFAULT_MAX_EXPLAINED_PARITY_MISMATCH_SHARE),
  ));

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const contactColumns = await listColumns(client, "raw_hubspot_contacts");
    const activityColumns = await listColumns(client, "raw_hubspot_meeting_activities");
    const associationColumns = await listColumns(client, "hubspot_activity_contact_associations");

    const selectedContactColumns = resolveColumns(contactColumns, [
      "hubspot_contact_id",
      "createdate",
      "annual_revenue_in_dollars__official_",
      "annual_revenue_in_usd_official",
      "annual_revenue_in_dollars",
      "annual_revenue",
      "revenue",
      "sobriety_date",
      "sobriety_date__official_",
      "sober_date",
      "clean_date",
      "email",
      "is_deleted",
      "sync_source",
      "last_synced_at",
    ]);

    const selectedActivityColumns = resolveColumns(activityColumns, [
      "hubspot_activity_id",
      "activity_type",
      "hs_timestamp",
      "created_at_hubspot",
      "created_at",
      "title",
      "is_deleted",
    ]);

    const selectedAssociationColumns = resolveColumns(associationColumns, [
      "hubspot_activity_id",
      "activity_type",
      "hubspot_contact_id",
      "association_type",
    ]);

    if (!selectedContactColumns.includes("hubspot_contact_id") || !selectedContactColumns.includes("createdate")) {
      throw new Error("raw_hubspot_contacts is missing required columns: hubspot_contact_id and/or createdate.");
    }
    if (!selectedActivityColumns.includes("hubspot_activity_id") || !selectedActivityColumns.includes("activity_type")) {
      throw new Error("raw_hubspot_meeting_activities is missing required columns: hubspot_activity_id and/or activity_type.");
    }
    if (!selectedAssociationColumns.includes("hubspot_activity_id") || !selectedAssociationColumns.includes("hubspot_contact_id")) {
      throw new Error("hubspot_activity_contact_associations is missing required columns: hubspot_activity_id and/or hubspot_contact_id.");
    }

    const contactsQuery = `
      select ${selectClause(selectedContactColumns)}
      from public.raw_hubspot_contacts
      where createdate >= now() - interval '${Math.max(maxWindow + 3, 30)} days'
      ${hasColumn(contactColumns, "is_deleted") ? "and coalesce(is_deleted, false) = false" : ""}
      order by createdate desc
    `;
    const contactsRes = await client.query(contactsQuery);
    const contactRows = contactsRes.rows || [];

    const activitiesQuery = `
      select ${selectClause(selectedActivityColumns)}
      from public.raw_hubspot_meeting_activities
      where (
        ${hasColumn(activityColumns, "hs_timestamp") ? `hs_timestamp >= now() - interval '${Math.max(maxWindow + 3, 30)} days'` : "false"}
        or
        ${hasColumn(activityColumns, "created_at_hubspot") ? `created_at_hubspot >= now() - interval '${Math.max(maxWindow + 3, 30)} days'` : "false"}
        or
        ${hasColumn(activityColumns, "created_at") ? `created_at >= now() - interval '${Math.max(maxWindow + 3, 30)} days'` : "false"}
      )
      ${hasColumn(activityColumns, "is_deleted") ? "and coalesce(is_deleted, false) = false" : ""}
      order by ${hasColumn(activityColumns, "hs_timestamp") ? "hs_timestamp" : "created_at_hubspot"} desc
      limit 20000
    `;
    const activitiesRes = await client.query(activitiesQuery);
    const activityRows = activitiesRes.rows || [];

    const activityIds = activityRows
      .map((row) => Number(row.hubspot_activity_id))
      .filter((value) => Number.isFinite(value));
    const activityIdSet = new Set(activityIds);

    let associationRows = [];
    if (activityIds.length > 0) {
      const assocChunks = [];
      for (let i = 0; i < activityIds.length; i += 4000) {
        const chunk = activityIds.slice(i, i + 4000);
        const assocQuery = `
          select ${selectClause(selectedAssociationColumns)}
          from public.hubspot_activity_contact_associations
          where hubspot_activity_id = any($1::bigint[])
        `;
        const assocRes = await client.query(assocQuery, [chunk]);
        assocChunks.push(...(assocRes.rows || []));
      }
      associationRows = assocChunks.filter((row) => activityIdSet.has(Number(row.hubspot_activity_id)));
    }

    const leadsWindows = summarizeLeadsIntegrity(contactRows, {
      windows: options.windows,
      referenceDate,
    });
    const attendanceWindows = summarizeAttendanceIntegrity(activityRows, associationRows, {
      windows: options.windows,
      referenceDate,
    });

    const bucket90 = leadsWindows.find((bucket) => bucket.window_days === Math.max(...options.windows)) || leadsWindows[leadsWindows.length - 1];
    const snapshotInputRows = contactRows.filter((row) => {
      const created = parseDbTimestamp(row.createdate);
      if (!created) return false;
      const diffDays = dateDiffDays(referenceDate, created);
      return diffDays >= 0 && diffDays < bucket90.window_days;
    });
    const snapshot = buildLeadsQualificationSnapshot({
      leadRows: snapshotInputRows,
      spend: null,
      referenceDate,
    });

    const contactDupesRes = await client.query(`
      select count(*)::bigint as duplicate_groups
      from (
        select hubspot_contact_id
        from public.raw_hubspot_contacts
        group by hubspot_contact_id
        having count(*) > 1
      ) t
    `);
    const associationDupesRes = await client.query(`
      select count(*)::bigint as duplicate_groups
      from (
        select hubspot_activity_id, activity_type, hubspot_contact_id, coalesce(association_type, '')
        from public.hubspot_activity_contact_associations
        group by hubspot_activity_id, activity_type, hubspot_contact_id, coalesce(association_type, '')
        having count(*) > 1
      ) t
    `);
    const duplicates = {
      contact_id_duplicates: Number(contactDupesRes.rows?.[0]?.duplicate_groups || 0),
      association_duplicates: Number(associationDupesRes.rows?.[0]?.duplicate_groups || 0),
    };

    let syncHealth = {
      stale_rows: 0,
      dead_event_rows: 0,
      unhealthy_rows: 0,
      available: false,
    };
    const syncViewExistsRes = await client.query(`
      select exists (
        select 1
        from information_schema.views
        where table_schema = 'public'
          and table_name = 'vw_hubspot_sync_health_observability'
      ) as exists
    `);
    if (syncViewExistsRes.rows?.[0]?.exists) {
      const syncHealthRes = await client.query(`
        select
          count(*) filter (where coalesce(is_stale, false))::bigint as stale_rows,
          count(*) filter (where coalesce(dead_events, 0) > 0)::bigint as dead_event_rows,
          count(*) filter (where coalesce(latest_status, 'error') not in ('success', 'partial'))::bigint as unhealthy_rows
        from public.vw_hubspot_sync_health_observability
      `);
      syncHealth = {
        ...syncHealth,
        ...Object.fromEntries(Object.entries(syncHealthRes.rows?.[0] || {}).map(([k, v]) => [k, Number(v || 0)])),
        available: true,
      };
    }

    const strictBoundaryProbe = evaluateLeadQualification({
      revenue: {
        annual_revenue_in_dollars__official_: 250000,
      },
      sobrietyDate: toDateKeyUtc(new Date(Date.UTC(
        referenceDate.getUTCFullYear() - 1,
        referenceDate.getUTCMonth(),
        referenceDate.getUTCDate(),
      ))),
      referenceDate,
    });

    const fallbackViolations = [];
    for (const row of snapshotInputRows) {
      const revenueInput = {
        annual_revenue_in_dollars__official_: row.annual_revenue_in_dollars__official_,
        annual_revenue_in_usd_official: row.annual_revenue_in_usd_official,
        annual_revenue_in_dollars: row.annual_revenue_in_dollars,
        annual_revenue: row.annual_revenue,
        revenue: row.revenue,
      };
      const sobrietyInput = {
        sobriety_date__official_: row.sobriety_date__official_,
        sobriety_date: row.sobriety_date,
        sober_date: row.sober_date,
        clean_date: row.clean_date,
      };
      const qualification = evaluateLeadQualification({
        revenue: revenueInput,
        sobrietyDate: sobrietyInput,
        referenceDate,
      });
      const revenueSignals = extractRevenueSignals(revenueInput);
      if (qualification.qualificationBasis === "fallback") {
        const fallbackValue = revenueSignals.fallbackRevenue;
        if (revenueSignals.officialRevenue !== null || fallbackValue === null || fallbackValue < 250000) {
          fallbackViolations.push({
            hubspot_contact_id: row.hubspot_contact_id,
            officialRevenue: revenueSignals.officialRevenue,
            fallbackRevenue: fallbackValue,
          });
        }
      }
    }

    const hubspotParity = {
      enabled: !!hubspotToken,
      min_record_age_days: minHubspotParityAgeDays,
      sync_lag_grace_hours: hubspotSyncLagGraceHours,
      sample_size: 0,
      mismatch_count: 0,
      blocking_mismatch_count: 0,
      explained_mismatch_count: 0,
      examples: [],
      explained_examples: [],
    };
    if (hubspotToken) {
      const matureCandidates = snapshotInputRows.filter((row) => {
        const created = parseDbTimestamp(row.createdate);
        const ageDays = dateDiffDays(referenceDate, created);
        return Number.isFinite(ageDays) && ageDays >= minHubspotParityAgeDays;
      });
      const sampleCandidates = matureCandidates.length >= options.sampleSize
        ? matureCandidates
        : snapshotInputRows;
      const sample = [...sampleCandidates]
        .sort((left, right) => String(left?.hubspot_contact_id || "").localeCompare(String(right?.hubspot_contact_id || "")))
        .slice(0, options.sampleSize);
      hubspotParity.sample_size = sample.length;

      for (const row of sample) {
        const contactId = row.hubspot_contact_id;
        if (!Number.isFinite(Number(contactId))) continue;
        try {
          const hubspotContact = await fetchHubspotContact(contactId, hubspotToken);
          const hubspotProps = extractHubspotPropertiesPayload(hubspotContact);

          const dbRevenueSignals = extractRevenueSignals(row);
          const hsRevenueSignals = extractRevenueSignals(hubspotProps);
          const dbSobriety = dateKeyFromSobrietyInput(row);
          const hsSobriety = dateKeyFromSobrietyInput(hubspotProps);
          const returnedId = String(hubspotContact?.id || "").trim();
          const requestedId = String(contactId).trim();
          const idRemapped = returnedId && requestedId && returnedId !== requestedId;

          if (idRemapped) {
            hubspotParity.mismatch_count += 1;
            hubspotParity.explained_mismatch_count += 1;
            hubspotParity.explained_examples.push({
              contact_id: contactId,
              reason: `hubspot_id_remapped_to=${returnedId}`,
            });
            continue;
          }

          const officialMatch = (
            (dbRevenueSignals.officialRevenue === null && hsRevenueSignals.officialRevenue === null)
            || compareNumberWithTolerance(dbRevenueSignals.officialRevenue, hsRevenueSignals.officialRevenue, 0.01)
          );
          const fallbackMatchRaw = (
            (dbRevenueSignals.fallbackRevenue === null && hsRevenueSignals.fallbackRevenue === null)
            || compareNumberWithTolerance(dbRevenueSignals.fallbackRevenue, hsRevenueSignals.fallbackRevenue, 0.01)
          );
          const officialMissingForBoth = (
            dbRevenueSignals.officialRevenue === null
            && hsRevenueSignals.officialRevenue === null
          );
          const fallbackMatch = officialMissingForBoth ? fallbackMatchRaw : true;
          const sobrietyMatch = dbSobriety === hsSobriety;
          const dbLastSyncedAt = parseDbTimestamp(row.last_synced_at);
          const hsUpdatedAt = parseDbTimestamp(
            hubspotContact?.updatedAt
            || hubspotProps?.lastmodifieddate
            || hubspotContact?.properties?.lastmodifieddate,
          );
          const isWithinSyncLagGrace = (
            !!dbLastSyncedAt
            && !!hsUpdatedAt
            && hsUpdatedAt.getTime() > dbLastSyncedAt.getTime()
            && ((hsUpdatedAt.getTime() - dbLastSyncedAt.getTime()) / 3600000) <= hubspotSyncLagGraceHours
          );

          if (!officialMatch || !fallbackMatch || !sobrietyMatch) {
            hubspotParity.mismatch_count += 1;
            const mismatchReason = `official_match=${officialMatch}, fallback_match=${fallbackMatch}, fallback_compared=${officialMissingForBoth}, sobriety_match=${sobrietyMatch}, within_sync_lag_grace=${isWithinSyncLagGrace}`;
            if (isWithinSyncLagGrace) {
              hubspotParity.explained_mismatch_count += 1;
              hubspotParity.explained_examples.push({
                contact_id: contactId,
                reason: mismatchReason,
              });
            } else {
              hubspotParity.blocking_mismatch_count += 1;
              hubspotParity.examples.push({
                contact_id: contactId,
                reason: mismatchReason,
              });
            }
          }
        } catch (error) {
          hubspotParity.mismatch_count += 1;
          hubspotParity.blocking_mismatch_count += 1;
          hubspotParity.examples.push({
            contact_id: contactId,
            reason: `HubSpot fetch failed: ${error.message || String(error)}`,
          });
        }
      }
    }

    const checks = [];
    checks.push(createCheck(
      "qualified_rule_strict_boundary",
      "blocking",
      strictBoundaryProbe.qualified === false,
      strictBoundaryProbe.qualified
        ? "Exactly 1 year sobriety incorrectly qualifies."
        : "Exactly 1 year sobriety correctly does not qualify.",
    ));
    checks.push(createCheck(
      "fallback_source_only_rule",
      "blocking",
      fallbackViolations.length === 0,
      fallbackViolations.length === 0
        ? "Fallback basis is only used when official revenue is missing and fallback is >= $250k."
        : `${fallbackViolations.length} fallback qualification violation(s) detected.`,
    ));
    checks.push(createCheck(
      "dashboard_snapshot_parity",
      "blocking",
      bucket90
        && bucket90.qualified_count === snapshot.qualified_count
        && bucket90.official_qualified_count === snapshot.qualification_basis.official_qualified_count
        && bucket90.fallback_qualified_count === snapshot.qualification_basis.fallback_qualified_count,
      bucket90
        ? `window=${bucket90.window_days}d, leads_summary=${bucket90.qualified_count}, snapshot=${snapshot.qualified_count}`
        : "No leads window was available.",
    ));
    checks.push(createCheck(
      "sync_health_not_stale",
      "blocking",
      !syncHealth.available || (
        syncHealth.stale_rows === 0
        && syncHealth.dead_event_rows === 0
        && syncHealth.unhealthy_rows === 0
      ),
      !syncHealth.available
        ? "vw_hubspot_sync_health_observability is not present (check skipped)."
        : `stale_rows=${syncHealth.stale_rows}, dead_event_rows=${syncHealth.dead_event_rows}, unhealthy_rows=${syncHealth.unhealthy_rows}`,
    ));
    checks.push(createCheck(
      "duplicate_detection",
      "blocking",
      duplicates.contact_id_duplicates === 0 && duplicates.association_duplicates === 0,
      `contact_id_duplicates=${duplicates.contact_id_duplicates}, association_duplicates=${duplicates.association_duplicates}`,
    ));

    const coverageTargetBucket = leadsWindows.find((row) => row.window_days === Math.max(...options.windows)) || leadsWindows[leadsWindows.length - 1];
    checks.push(createCheck(
      "missing_revenue_threshold",
      "warning",
      (coverageTargetBucket?.missing_revenue_pct ?? 0) <= maxMissingRevenuePct,
      `missing_revenue_pct=${((coverageTargetBucket?.missing_revenue_pct ?? 0) * 100).toFixed(2)}%, threshold=${(maxMissingRevenuePct * 100).toFixed(2)}%`,
    ));
    checks.push(createCheck(
      "missing_sobriety_threshold",
      "warning",
      (coverageTargetBucket?.missing_sobriety_pct ?? 0) <= maxMissingSobrietyPct,
      `missing_sobriety_pct=${((coverageTargetBucket?.missing_sobriety_pct ?? 0) * 100).toFixed(2)}%, threshold=${(maxMissingSobrietyPct * 100).toFixed(2)}%`,
    ));
    checks.push(createCheck(
      "fallback_share_threshold",
      "warning",
      (coverageTargetBucket?.fallback_share_pct ?? 0) <= maxFallbackSharePct,
      `fallback_share_pct=${((coverageTargetBucket?.fallback_share_pct ?? 0) * 100).toFixed(2)}%, threshold=${(maxFallbackSharePct * 100).toFixed(2)}%`,
    ));

    if (!hubspotToken) {
      checks.push(createSkipCheck(
        "hubspot_row_level_parity",
        options.strictHubspotParity ? "blocking" : "warning",
        "HUBSPOT_PRIVATE_APP_TOKEN not set; row-level HubSpot parity was not executed.",
      ));
      checks.push(createSkipCheck(
        "hubspot_row_level_parity_explained_share",
        "warning",
        "HUBSPOT_PRIVATE_APP_TOKEN not set; explained mismatch share check was not executed.",
      ));
    } else {
      const explainedShare = hubspotParity.sample_size > 0
        ? hubspotParity.explained_mismatch_count / hubspotParity.sample_size
        : 0;
      checks.push(createCheck(
        "hubspot_row_level_parity",
        options.strictHubspotParity ? "blocking" : "warning",
        hubspotParity.blocking_mismatch_count === 0,
        `sample_size=${hubspotParity.sample_size}, total_mismatch_count=${hubspotParity.mismatch_count}, blocking_mismatch_count=${hubspotParity.blocking_mismatch_count}, explained_mismatch_count=${hubspotParity.explained_mismatch_count}`,
      ));
      checks.push(createCheck(
        "hubspot_row_level_parity_explained_share",
        "warning",
        explainedShare <= maxExplainedParityMismatchShare,
        `explained_mismatch_share=${(explainedShare * 100).toFixed(2)}%, threshold=${(maxExplainedParityMismatchShare * 100).toFixed(2)}%`,
      ));
    }

    const hasBlockingFailure = checks.some((check) => check.severity === "blocking" && check.status === "FAIL");
    const checkCounts = summarizeCheckCounts(checks);
    const result = {
      generated_at: new Date().toISOString(),
      windows: options.windows,
      strict_hubspot_parity: options.strictHubspotParity,
      thresholds: {
        max_missing_revenue_pct: maxMissingRevenuePct,
        max_missing_sobriety_pct: maxMissingSobrietyPct,
        max_fallback_share_pct: maxFallbackSharePct,
        min_hubspot_parity_age_days: minHubspotParityAgeDays,
        hubspot_sync_lag_grace_hours: hubspotSyncLagGraceHours,
        max_explained_parity_mismatch_share: maxExplainedParityMismatchShare,
      },
      checks,
      check_counts: checkCounts,
      leads_windows: leadsWindows,
      attendance_windows: attendanceWindows,
      duplicates,
      sync_health: syncHealth,
      hubspot_row_parity: hubspotParity,
      final_verdict: hasBlockingFailure ? "FAIL" : "PASS",
    };

    const reportMarkdown = markdownFromResult(result);
    const reportAbsolutePath = path.resolve(process.cwd(), options.reportPath);
    fs.mkdirSync(path.dirname(reportAbsolutePath), { recursive: true });
    fs.writeFileSync(reportAbsolutePath, reportMarkdown, "utf8");
    if (options.jsonPath) {
      const jsonAbsolutePath = path.resolve(process.cwd(), options.jsonPath);
      fs.mkdirSync(path.dirname(jsonAbsolutePath), { recursive: true });
      fs.writeFileSync(jsonAbsolutePath, JSON.stringify(result, null, 2), "utf8");
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      final_verdict: result.final_verdict,
      check_counts: result.check_counts,
      report_path: options.reportPath,
      json_path: options.jsonPath || null,
    }, null, 2));

    if (hasBlockingFailure) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({
    final_verdict: "FAIL",
    error: error?.message || String(error),
  }, null, 2));
  process.exitCode = 1;
});
