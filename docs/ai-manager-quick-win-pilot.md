# AI Manager Quick-Win Pilot (Daily Safe Loop)

## Why this exists

This pilot defines a **small, low-risk autonomous workflow** that helps both:

- stakeholders/managers: get plain-English KPI status and risks
- AI managers: interpret trends and produce concrete execution actions

It is intentionally additive and does not change production logic.

## Operating profile (agreed)

- Cadence: **Daily** (workdays)
- Single KPI owner / final approver: **President**
- Human decision SLA: **24 hours on workdays**
- Output channels: **Slack + KPI Dashboard reference block** (Notion automation deferred until secrets are available)

## Pilot scope (safe by design)

- No schema changes
- No Edge Function behavior changes
- No dashboard runtime behavior changes
- Output-only process: generate recommendations and action queues

## Inputs

Use currently available KPI snapshots and lead/attendance summaries from the existing dashboard and data sync outputs.

## Outputs (every run)

1. **Manager Brief** (human-readable)
2. **AI Action Queue** (autonomous tasks AI can execute)
3. **Human Action Queue** (tracked in-doc for now; Notion push resumes once secrets are configured)

---

## 10-minute execution loop

### Step 1 — KPI Snapshot (2 min)

Collect:
- Top 5 KPIs with current value and 7/30-day trend direction
- 1 anomaly (if any)
- 1 upside opportunity (if any)

### Step 2 — AI Interpretation (3 min)

For each KPI, classify:
- Improving / Flat / Degrading
- Confidence: High / Medium / Low
- Likely cause (1 sentence)

Then produce up to 3 insights ranked by expected impact.

### Step 3 — Build Action Queues (3 min)

#### A) AI-autonomous actions

These should be tasks the AI manager can execute without waiting for humans.

Examples:
- Run a parity/data-consistency check and post a diff report
- Generate daily lead attribution drift report
- Propose copy/creative test hypotheses based on CPGL/CPL movement
- Draft weekly summary memo from KPI deltas

#### B) Human-required actions (Notion push)

These should be tasks needing human approval/context.

Examples:
- Approve budget reallocation recommendation
- Review and approve top 2 creative experiments
- Confirm CRM field mapping change requests
- Resolve flagged data ambiguity in source tracking

### Step 4 — Definition of Done check (2 min)

A pilot run is complete only if:

1. Manager Brief exists and is understandable in under 2 minutes.
2. AI Action Queue has at least 2 executable tasks.
3. Human Action Queue has at least 2 owner-ready tasks with assignee + priority + deadline.
4. At least one action references measurable KPI impact.
5. Slack summary message was posted and includes dashboard/evidence links.

If any condition fails, rerun only the failed step.

---

## Notion task mapping (deferred until secrets are available)

Prepare each human-required action using this mapping so Notion ingestion can be turned on without rework:

- `Task` → concise action title
- `Priority` → `High Priority` / `Medium Priority` / `Low Priority`
- `Effort level` → `Easy Effort` / `Medium Effort` / `Hard Effort`
- `Status` → default `Not Started` (or `Waiting on Others` if blocked)
- `Person` → default `Andrew Lassise` (alternate: `Kandace`)
- `Task Type` → choose the best available type (emoji variants allowed)
- `Deadline` → required date
- `Description` → include KPI context, expected impact, and evidence links

### Priority policy (business order)

When assigning priority, apply this order:

1. **Highest priority**: raise recurring Phoenix Forum revenue (more members and/or higher monthly value)
2. **Second priority**: increase donations / grants / other revenue
3. **Third priority**: operational efficiency via AI and automations

If two items conflict, prioritize the one with faster measurable revenue impact.

---

## Output channel format

### Slack (daily post)

Post one short message per run:
- 3-bullet KPI health summary
- top risk + top opportunity
- links: dashboard view + supporting doc/query + handoff record reference

### Notion

Deferred for now; maintain Notion-ready task payloads in the run artifact until secrets are configured.

### KPI Dashboard

Add a reference note/link in your run record pointing to the exact dashboard slice used for analysis.

---

## Deliverable templates

### Template A — Manager Brief

- Date:
- KPI health summary (3 bullets max):
- Biggest risk:
- Biggest opportunity:
- Recommended focus for next 24h:
- Owner/approver: President

### Template B — AI Action Queue

- Action:
- System/Area:
- Expected output:
- Success signal:
- ETA:

### Template C — Human Action Queue (Notion-ready)

- Task:
- Person:
- Priority:
- Effort level:
- Task Type:
- Deadline:
- Description:
- Evidence:

---

## Suggested first quick win (today)

Run one pilot focused on **Leads Funnel Efficiency**:

- KPIs: CPL, CPQL, CPGL, cost per show-up
- AI actions:
  - produce top 3 efficiency drifts and probable causes
  - draft 2 experiment ideas ranked by expected CPGL impact
- Human actions:
  - approve one experiment for launch
  - assign owner for follow-up measurement in 7 days

This gives immediate value while minimizing operational risk.
