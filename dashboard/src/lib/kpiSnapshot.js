import { evaluateLeadQualification } from './leadsQualificationRules.js';

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateKey(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toUtcDay(dateLike) {
  const parsed = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function dayDiff(laterDateLike, earlierDateLike) {
  const later = toUtcDay(laterDateLike);
  const earlier = toUtcDay(earlierDateLike);
  if (!later || !earlier) return null;
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

function sourceFreshnessStatus(staleDays) {
  if (!Number.isFinite(staleDays)) return 'no_data';
  if (staleDays <= 3) return 'fresh';
  if (staleDays <= 14) return 'watch';
  return 'stale';
}

export function buildSourceLineage(sources = [], referenceDate = new Date()) {
  const referenceDateKey = toDateKey(referenceDate);
  return (Array.isArray(sources) ? sources : [])
    .map((source) => {
      const latestDate = toDateKey(
        source?.latest_date
        ?? source?.latestDate
        ?? source?.dateKey
        ?? source?.latest,
      );
      const staleDays = latestDate && referenceDateKey ? dayDiff(referenceDateKey, latestDate) : null;
      return {
        key: String(source?.key || source?.source || source?.label || '').trim() || 'unknown',
        label: String(source?.label || source?.source || source?.key || 'Unknown Source'),
        row_count: Math.max(
          0,
          Number(
            source?.row_count
            ?? source?.rowCount
            ?? source?.count
            ?? 0,
          ) || 0,
        ),
        latest_date: latestDate,
        stale_days: staleDays,
        freshness_status: sourceFreshnessStatus(staleDays),
      };
    });
}

export function buildLeadsQualificationSnapshot({
  leadRows = [],
  spend = null,
  referenceDate = new Date(),
}) {
  const rows = Array.isArray(leadRows) ? leadRows : [];
  let qualifiedCount = 0;
  let officialQualified = 0;
  let fallbackQualified = 0;

  for (const row of rows) {
    const qualification = evaluateLeadQualification({
      revenue: {
        annual_revenue_in_dollars__official_: row?.annual_revenue_in_dollars__official_ ?? row?.revenueOfficial,
        annual_revenue_in_usd_official: row?.annual_revenue_in_usd_official,
        annual_revenue_in_dollars: row?.annual_revenue_in_dollars ?? row?.revenue,
        annual_revenue: row?.annual_revenue,
        revenue: row?.revenue,
      },
      sobrietyDate: row?.sobrietyDate ?? row,
      referenceDate,
    });

    if (!qualification.qualified) continue;
    qualifiedCount += 1;
    if (qualification.qualificationBasis === 'official') officialQualified += 1;
    if (qualification.qualificationBasis === 'fallback') fallbackQualified += 1;
  }

  const totalCount = rows.length;
  const qualifiedPct = totalCount > 0 ? qualifiedCount / totalCount : null;
  const fallbackSharePct = qualifiedCount > 0 ? fallbackQualified / qualifiedCount : null;
  const spendValue = toNumberOrNull(spend);

  return {
    total_count: totalCount,
    qualified_count: qualifiedCount,
    qualified_pct: qualifiedPct,
    non_qualified_count: Math.max(totalCount - qualifiedCount, 0),
    cpql_estimate: (spendValue !== null && qualifiedCount > 0) ? spendValue / qualifiedCount : null,
    qualification_basis: {
      official_qualified_count: officialQualified,
      fallback_qualified_count: fallbackQualified,
      fallback_share_pct: fallbackSharePct,
    },
  };
}

export function buildAttendanceNorthStarSnapshot({ analytics = null }) {
  const sessions = Array.isArray(analytics?.sessions) ? analytics.sessions : [];
  const people = Array.isArray(analytics?.people) ? analytics.people : [];
  const stats = analytics?.stats || {};
  const totalVisits = people.reduce((sum, person) => sum + (Number(person?.visits) || 0), 0);
  const newAttendeesCount = sessions.reduce((sum, session) => sum + (Number(session?.newCount) || 0), 0);

  return {
    tuesday_count: Number(stats?.uniqueTue || 0),
    thursday_count: Number(stats?.uniqueThu || 0),
    new_attendees_count: newAttendeesCount,
    avg_attendance_per_person: people.length > 0 ? totalVisits / people.length : null,
  };
}

function aggregateFreshnessStatus(sourceRows = []) {
  const statuses = sourceRows.map((row) => row?.freshness_status).filter(Boolean);
  if (statuses.length === 0) return 'unknown';
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('watch')) return 'watch';
  if (statuses.includes('fresh')) return 'fresh';
  return 'unknown';
}

export function buildUnifiedKpiSnapshot({
  generatedAt = new Date().toISOString(),
  lookbackDays = null,
  sourceLineage = [],
  dashboard = {},
  leads = {},
  attendance = {},
} = {}) {
  const sources = buildSourceLineage(sourceLineage, generatedAt);

  return {
    meta: {
      generated_at: String(generatedAt),
      lookback_days: Number.isFinite(Number(lookbackDays)) ? Number(lookbackDays) : null,
      freshness_status: aggregateFreshnessStatus(sources),
      sources,
    },
    dashboard: dashboard || {},
    leads: {
      ...(leads || {}),
      qualified_count: toNumberOrNull(leads?.qualified_count),
      qualified_pct: toNumberOrNull(leads?.qualified_pct),
      qualification_basis: {
        official_qualified_count: toNumberOrNull(leads?.qualification_basis?.official_qualified_count),
        fallback_qualified_count: toNumberOrNull(leads?.qualification_basis?.fallback_qualified_count),
        fallback_share_pct: toNumberOrNull(leads?.qualification_basis?.fallback_share_pct),
      },
    },
    attendance: {
      ...(attendance || {}),
      tuesday_count: toNumberOrNull(attendance?.tuesday_count),
      thursday_count: toNumberOrNull(attendance?.thursday_count),
      new_attendees_count: toNumberOrNull(attendance?.new_attendees_count),
      avg_attendance_per_person: toNumberOrNull(attendance?.avg_attendance_per_person),
    },
  };
}
