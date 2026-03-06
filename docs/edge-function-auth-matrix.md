# Edge Function Auth Exposure Matrix

- Reviewed on: 2026-03-07 (Asia/Tokyo)
- Commit reviewed: `0d344ecd8c8bbaec3be7e4d6222a350d33d04b44` (`0d344ec`)

## Scope and Notes

- Scope reviewed: all edge functions under `supabase/functions/*` (excluding `_shared`) and caller/auth references in `supabase/config.toml`, `docs/`, `dashboard/src/`, `scripts/`, and `supabase/migrations/`.
- If a function is not explicitly listed in `supabase/config.toml`, auth mode is marked as `verify_jwt default (needs verification in deployed env)`.

## Full Matrix

| Function | Intended caller model | Current auth mode | Guardrails required |
|---|---|---|---|
| `ai-briefing` | Dashboard AI Briefing UI (`AIBriefingDashboard`) | `verify_jwt=false` in config; no caller assertion in handler | Require authenticated admin JWT/claim check; add request rate limit and payload schema validation |
| `ai-module-analysis` | Dashboard Overview AI module analysis | `verify_jwt=false` in config; POST-only, no caller assertion | Require authenticated admin JWT/claim check; enforce action allowlist and rate limiting |
| `analyze-leads-insights` | Leads UI and cohort panel direct function calls | `verify_jwt=false` in config; no caller assertion | Require authenticated admin JWT/claim check; enforce strict mode allowlist and request size caps |
| `donor-intelligence-agent` | Donations dashboard action | `verify_jwt` default (needs verification); no caller assertion | Add explicit auth check (`auth.getUser` + role allowlist), method allowlist, and rate limits |
| `hubspot_bootstrap_backfill` | Weekly cron + manual runbook invocation | `verify_jwt=false` in config; no caller assertion | Add server-to-server shared secret header check (`X-Edge-Invoke-Secret`) and reject if missing |
| `hubspot_incremental_sync` | 5-minute cron + manual runbook invocation | `verify_jwt=false` in config; no caller assertion | Add server-to-server shared secret header check; keep method allowlist |
| `hubspot_reconcile_sync` | Hourly/daily cron + manual runbook invocation | `verify_jwt=false` in config; no caller assertion | Add server-to-server shared secret header check; separate operational modes by allowlist |
| `hubspot_webhook_ingest` | HubSpot webhook endpoint | `verify_jwt=false` in config; signature validation exists but fails open if secret missing | Make webhook secret mandatory (fail closed at startup); keep timestamp and signature checks |
| `hubspot_webhook_worker` | 1-minute cron queue processor | `verify_jwt=false` in config; no caller assertion | Add server-to-server shared secret header check and explicit deny for unauthenticated calls |
| `ingest_zeffy_donations` | Zeffy/Zapier webhook | `verify_jwt` default (needs verification); optional header secret check | Make `ZEFFY_WEBHOOK_SECRET` mandatory (fail closed); keep header-based verification |
| `manage_attendee_aliases` | Attendance dashboard list/merge alias workflow | `verify_jwt` default (needs verification); no caller assertion | Add authenticated admin check before list/merge operations; method allowlist |
| `master-sync` | Dashboard buttons + scheduled cron | `verify_jwt=false` in config; no caller assertion; fans out to many privileged sync functions | Split into admin-action vs scheduler entrypoints; require admin JWT for UI actions and shared secret for scheduler |
| `no-show-recovery-agent` | No active caller reference found (needs verification) | `verify_jwt` default (needs verification); no caller assertion | Either disable/deploy-block until owner confirmed, or enforce admin/server-only auth and POST-only routing |
| `reconcile_zoom_attendee_hubspot_mappings` | Weekly cron + master-sync + manual ops commands | `verify_jwt` default (needs verification); no caller assertion | Enforce server/admin auth check; add explicit dry-run/prod mode controls |
| `sync-metrics` | Dashboard actions + master-sync | `verify_jwt` default (needs verification); no caller assertion | Add explicit admin/server auth check and operation/path allowlist |
| `sync_attendance_from_hubspot` | Attendance dashboard + multiple cron jobs | `verify_jwt=false` in config; no caller assertion | Require shared secret for cron/internal calls and admin JWT for manual UI invocation |
| `sync_fb_ads` | Dashboard actions + master-sync + dev scripts | `verify_jwt` default (needs verification); no caller assertion | Enforce admin/server auth check; strict query parameter validation |
| `sync_google_analytics` | Dashboard actions + master-sync | `verify_jwt` default (needs verification); no caller assertion | Enforce admin/server auth check; method allowlist and rate limits |
| `sync_hubspot_meeting_activities` | Attendance dashboard + master-sync + weekly cron | `verify_jwt` default (needs verification); no caller assertion | Enforce admin/server auth check; payload/date-range validation |
| `sync_kpis` | Dashboard action and ops calls | `verify_jwt` default (needs verification); no caller assertion | Enforce admin/server auth check and strict required parameter validation |
| `sync_luma_registrations` | master-sync + ops scripts | `verify_jwt` default (needs verification); no caller assertion | Enforce admin/server auth check; rate limit and lookback bounds |
| `sync_mailchimp` | Email dashboard + ops script | `verify_jwt` default (needs verification); no caller assertion | Enforce admin/server auth check; method allowlist |
| `sync_search_console` | Dashboard actions + master-sync | `verify_jwt` default (needs verification); no caller assertion | Enforce admin/server auth check; method allowlist and request bounds |
| `sync_zoom_attendance` | master-sync + ops scripts | `verify_jwt` default (needs verification); no caller assertion | Enforce admin/server auth check; add per-caller throttling and meeting-id allowlist |

## Top Findings (Ordered by Risk)

1. **P0: Multiple privileged edge functions are explicitly public (`verify_jwt=false`)**
   - Evidence:
     - [`../supabase/config.toml#L373`](../supabase/config.toml#L373)
     - [`../supabase/config.toml#L382`](../supabase/config.toml#L382)
     - [`../supabase/config.toml#L385`](../supabase/config.toml#L385)
     - [`../supabase/config.toml#L388`](../supabase/config.toml#L388)
     - [`../supabase/config.toml#L394`](../supabase/config.toml#L394)
     - [`../supabase/config.toml#L400`](../supabase/config.toml#L400)

2. **P0: `hubspot_webhook_ingest` signature validation fails open if secret is unset**
   - Evidence:
     - [`../supabase/functions/hubspot_webhook_ingest/index.ts#L25`](../supabase/functions/hubspot_webhook_ingest/index.ts#L25)
     - [`../supabase/functions/hubspot_webhook_ingest/index.ts#L26`](../supabase/functions/hubspot_webhook_ingest/index.ts#L26)
     - [`../supabase/functions/hubspot_webhook_ingest/index.ts#L68`](../supabase/functions/hubspot_webhook_ingest/index.ts#L68)

3. **P0: HubSpot cron jobs were changed to call unauthenticated endpoints without Authorization**
   - Evidence:
     - [`../supabase/migrations/20260306195000_reschedule_hubspot_sync_jobs_without_service_role_setting.sql#L3`](../supabase/migrations/20260306195000_reschedule_hubspot_sync_jobs_without_service_role_setting.sql#L3)
     - [`../supabase/migrations/20260306195000_reschedule_hubspot_sync_jobs_without_service_role_setting.sql#L33`](../supabase/migrations/20260306195000_reschedule_hubspot_sync_jobs_without_service_role_setting.sql#L33)
     - [`../supabase/migrations/20260306195000_reschedule_hubspot_sync_jobs_without_service_role_setting.sql#L69`](../supabase/migrations/20260306195000_reschedule_hubspot_sync_jobs_without_service_role_setting.sql#L69)

4. **P0: Service-role JWT committed in repository**
   - Evidence:
     - [`../scripts/test_mailchimp_sync.js#L4`](../scripts/test_mailchimp_sync.js#L4)

5. **P1: Browser and scripts use anon-key invocation patterns for operational functions**
   - Evidence:
     - [`../dashboard/src/lib/supabaseClient.js#L2`](../dashboard/src/lib/supabaseClient.js#L2)
     - [`../dashboard/src/components/CohortUnitEconomicsPreviewPanel.jsx#L1053`](../dashboard/src/components/CohortUnitEconomicsPreviewPanel.jsx#L1053)
     - [`../dashboard/src/components/CohortUnitEconomicsPreviewPanel.jsx#L1054`](../dashboard/src/components/CohortUnitEconomicsPreviewPanel.jsx#L1054)
     - [`../scripts/trigger_luma_sync.ts#L24`](../scripts/trigger_luma_sync.ts#L24)
     - [`../scripts/trigger_luma_sync.ts#L38`](../scripts/trigger_luma_sync.ts#L38)
   - Note: Whether every default-verify function accepts anon JWT in production needs verification.

6. **P2: Caller-model drift and auth assumptions differ across docs/migrations/functions**
   - Evidence:
     - [`../docs/attendance-hubspot-identity-rollout-playbook.md#L63`](../docs/attendance-hubspot-identity-rollout-playbook.md#L63)
     - [`../docs/attendance-hubspot-identity-rollout-playbook.md#L83`](../docs/attendance-hubspot-identity-rollout-playbook.md#L83)
     - [`../supabase/functions/master-sync/index.ts#L132`](../supabase/functions/master-sync/index.ts#L132)
     - [`../supabase/functions/master-sync/index.ts#L233`](../supabase/functions/master-sync/index.ts#L233)

## Risk Summary

- **Operational abuse risk:** Publicly reachable sync endpoints can be triggered externally, causing expensive external API calls and unintended data mutation.
- **Integrity risk:** Webhook fail-open behavior can allow spoofed event ingestion if secrets are missing/misconfigured.
- **Credential risk:** A committed service-role key can bypass normal function auth controls if still valid.
- **Control-plane drift risk:** Auth assumptions are inconsistent across docs, runtime config, and cron migration strategy.

## Prioritized Remediation Plan

### P0 (Immediate)

1. Rotate Supabase service-role key and remove hardcoded key from repository history and working tree.
2. Add mandatory server-to-server secret guard (`X-Edge-Invoke-Secret`) to all non-webhook functions currently configured with `verify_jwt=false`.
3. Make webhook secrets mandatory (`HUBSPOT_WEBHOOK_SECRET`, `ZEFFY_WEBHOOK_SECRET`) and fail closed if absent.

### P1 (Short Term)

1. Add explicit authenticated admin checks in UI-triggered privileged functions (`master-sync` write actions, alias management, metrics/sync admin endpoints).
2. Standardize method allowlists and request schema validation across all edge functions.
3. Reconcile caller model docs with deployed auth settings; remove stale `--no-verify-jwt` guidance where not intended.

### P2 (Medium Term)

1. Split orchestration endpoints into separate entrypoints by trust boundary (`cron/internal`, `admin-ui`, `webhook`).
2. Add automated regression tests for unauthorized invocations (401/403 expected).
3. Add periodic audit check to detect new functions missing explicit caller/auth policy metadata.

## Definition of Done (Hardening Rollout)

- [ ] `verify_jwt` intent is explicit for every deployed function and documented in this file.
- [ ] All `cron/internal` functions require a shared secret header and reject missing/invalid secret.
- [ ] All `webhook` functions fail closed when required secret is missing.
- [ ] All privileged UI-triggerable functions validate authenticated user and role/claim.
- [ ] Hardcoded credentials are removed and rotated.
- [ ] Unauthorized invocation tests exist and pass for each function class (webhook, cron/internal, admin-ui).
- [ ] Runbooks and migration notes reflect the final caller model and auth contract.

