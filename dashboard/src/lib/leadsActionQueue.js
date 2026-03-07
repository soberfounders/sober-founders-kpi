import { buildLeadsConfidenceSummary } from './leadsConfidenceModel.js';

function sortedTasks(map) {
  return Array.from(map.values()).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return String(a.task_id).localeCompare(String(b.task_id));
  });
}

function addTask(map, task) {
  const existing = map.get(task.task_id);
  if (!existing) {
    map.set(task.task_id, {
      ...task,
      blocker_codes: Array.from(new Set(task.blocker_codes || [])),
    });
    return;
  }

  map.set(task.task_id, {
    ...existing,
    priority: Math.max(existing.priority, task.priority),
    suggested_sla_hours: Math.min(
      Number(existing.suggested_sla_hours || 99999),
      Number(task.suggested_sla_hours || 99999),
    ),
    blocker_codes: Array.from(new Set([...(existing.blocker_codes || []), ...(task.blocker_codes || [])])),
  });
}

function addTasksForBlocker(blockerCode, autonomous, human) {
  switch (blockerCode) {
    case 'low_match_rate':
      addTask(autonomous, {
        task_id: 'run_identity_reconcile',
        title: 'Run identity reconciliation for Zoom/Lu.ma to HubSpot',
        rationale: 'Low match rate indicates the mapping layer needs a fresh reconcile pass.',
        priority: 95,
        suggested_sla_hours: 6,
        blocker_codes: [blockerCode],
      });
      addTask(human, {
        task_id: 'review_top_unmatched_rows',
        title: 'Review top unmatched attendee/registration rows',
        rationale: 'Resolve alias and naming edge-cases that automation cannot safely infer.',
        priority: 90,
        suggested_sla_hours: 24,
        blocker_codes: [blockerCode],
      });
      return;

    case 'low_hubspot_call_coverage':
      addTask(autonomous, {
        task_id: 'run_hubspot_call_backfill',
        title: 'Run HubSpot call/meeting reconcile backfill',
        rationale: 'Coverage gaps usually improve after delayed call/meeting association syncs.',
        priority: 90,
        suggested_sla_hours: 6,
        blocker_codes: [blockerCode],
      });
      addTask(human, {
        task_id: 'confirm_host_attendee_tagging',
        title: 'Confirm hosts are tagging attendees in HubSpot calls',
        rationale: 'Manual attendee tagging is often the root cause of low call coverage.',
        priority: 80,
        suggested_sla_hours: 48,
        blocker_codes: [blockerCode],
      });
      return;

    case 'low_luma_zoom_match_rate':
      addTask(autonomous, {
        task_id: 'refresh_luma_registration_sync',
        title: 'Refresh Lu.ma registration sync and net-new reconciliation',
        rationale: 'Low Lu.ma -> Zoom net-new matches suggest stale registration reconciliation.',
        priority: 82,
        suggested_sla_hours: 12,
        blocker_codes: [blockerCode],
      });
      addTask(human, {
        task_id: 'audit_thursday_followup_sequence',
        title: 'Audit Thursday reminder and follow-up flow',
        rationale: 'Operational follow-up quality can drive registration -> show-up lift.',
        priority: 70,
        suggested_sla_hours: 72,
        blocker_codes: [blockerCode],
      });
      return;

    case 'low_luma_hubspot_match_rate':
      addTask(autonomous, {
        task_id: 'reprocess_luma_hubspot_matching',
        title: 'Reprocess Lu.ma to HubSpot matching with secondary-email checks',
        rationale: 'Cross-email duplicates commonly depress Lu.ma -> HubSpot match quality.',
        priority: 84,
        suggested_sla_hours: 12,
        blocker_codes: [blockerCode],
      });
      addTask(human, {
        task_id: 'audit_hubspot_duplicate_contacts',
        title: 'Audit duplicate HubSpot contacts and merge hygiene',
        rationale: 'Oldest-contact attribution and merge quality require periodic manual validation.',
        priority: 76,
        suggested_sla_hours: 72,
        blocker_codes: [blockerCode],
      });
      return;

    case 'weak_mapping_quality':
      addTask(autonomous, {
        task_id: 'recompute_mapping_confidence_breakdown',
        title: 'Recompute match confidence breakdown after reconciliation',
        rationale: 'Fuzzy/unmatched dominance should be reduced before strategic decisions.',
        priority: 88,
        suggested_sla_hours: 12,
        blocker_codes: [blockerCode],
      });
      addTask(human, {
        task_id: 'resolve_alias_conflicts',
        title: 'Resolve high-impact alias conflicts',
        rationale: 'Alias conflicts are a common source of persistent fuzzy and unmatched rows.',
        priority: 85,
        suggested_sla_hours: 48,
        blocker_codes: [blockerCode],
      });
      return;

    case 'high_unknown_source_share':
      addTask(autonomous, {
        task_id: 'rebuild_source_bucket_labels',
        title: 'Rebuild source bucket classification for unknown/other cohort',
        rationale: 'Unknown/Other source inflation weakens attribution confidence.',
        priority: 78,
        suggested_sla_hours: 24,
        blocker_codes: [blockerCode],
      });
      addTask(human, {
        task_id: 'audit_unknown_good_member_sources',
        title: 'Audit unknown/other good-member source rows',
        rationale: 'Manual attribution review is needed for top-value contacts with missing source labels.',
        priority: 74,
        suggested_sla_hours: 72,
        blocker_codes: [blockerCode],
      });
      return;

    case 'stale_data':
      addTask(autonomous, {
        task_id: 'trigger_full_sync_now',
        title: 'Trigger sync/reconcile pipeline now',
        rationale: 'Stale data should be refreshed before reading confidence-sensitive KPIs.',
        priority: 96,
        suggested_sla_hours: 2,
        blocker_codes: [blockerCode],
      });
      addTask(human, {
        task_id: 'pause_major_budget_changes',
        title: 'Pause major budget changes until refresh completes',
        rationale: 'Stale snapshots can produce false optimization signals.',
        priority: 88,
        suggested_sla_hours: 12,
        blocker_codes: [blockerCode],
      });
      return;

    case 'low_sample_size':
      addTask(human, {
        task_id: 'defer_high_stakes_decisions',
        title: 'Defer high-stakes budget decisions until sample size recovers',
        rationale: 'Low sample windows increase volatility in cost-per-quality metrics.',
        priority: 72,
        suggested_sla_hours: 72,
        blocker_codes: [blockerCode],
      });
      return;

    case 'missing_luma_data':
      addTask(autonomous, {
        task_id: 'verify_luma_ingestion_pipeline',
        title: 'Verify Lu.ma ingestion pipeline health',
        rationale: 'Fallback registration logic is active; direct Lu.ma feed must be restored.',
        priority: 92,
        suggested_sla_hours: 6,
        blocker_codes: [blockerCode],
      });
      addTask(human, {
        task_id: 'confirm_luma_api_credentials_and_zapier',
        title: 'Confirm Lu.ma API key and Zapier runtime health',
        rationale: 'Credential/automation drift is a common root cause for missing Lu.ma data.',
        priority: 84,
        suggested_sla_hours: 24,
        blocker_codes: [blockerCode],
      });
      return;

    case 'missing_hubspot_attribution_columns':
      addTask(human, {
        task_id: 'apply_hubspot_attribution_schema',
        title: 'Apply required HubSpot attribution schema/backfill',
        rationale: 'Attribution columns are required for reliable ad-path quality analysis.',
        priority: 94,
        suggested_sla_hours: 24,
        blocker_codes: [blockerCode],
      });
      return;

    default:
      return;
  }
}

export function buildLeadsActionQueue(input = {}) {
  const summary = input?.confidence_summary && typeof input.confidence_summary === 'object'
    ? input.confidence_summary
    : buildLeadsConfidenceSummary(input);

  const blockers = Array.isArray(summary?.blockers) ? summary.blockers : [];
  const autonomous = new Map();
  const human = new Map();

  blockers.forEach((blocker) => addTasksForBlocker(String(blocker?.code || ''), autonomous, human));

  if (blockers.length === 0) {
    if (summary?.confidence_level === 'high') {
      addTask(autonomous, {
        task_id: 'daily_confidence_monitor',
        title: 'Run daily confidence monitor snapshot',
        rationale: 'No blockers detected; keep a lightweight automated watch on regressions.',
        priority: 40,
        suggested_sla_hours: 24,
        blocker_codes: [],
      });
    } else {
      addTask(autonomous, {
        task_id: 'weekly_reconcile_guardrail',
        title: 'Run weekly reconcile and confidence recalc',
        rationale: 'Medium confidence without blockers still benefits from routine stabilization.',
        priority: 55,
        suggested_sla_hours: 24,
        blocker_codes: [],
      });
      addTask(human, {
        task_id: 'weekly_quality_review',
        title: 'Review top attribution and match-confidence drifts',
        rationale: 'Human review catches narrative-level quality drift before it becomes a blocker.',
        priority: 50,
        suggested_sla_hours: 72,
        blocker_codes: [],
      });
    }
  }

  return {
    autonomous_tasks: sortedTasks(autonomous),
    human_tasks: sortedTasks(human),
  };
}
