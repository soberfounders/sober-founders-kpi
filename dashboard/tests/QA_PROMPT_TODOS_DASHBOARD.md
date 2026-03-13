# QA Prompt: To-Do Dashboard Feature Validation

Use this prompt to instruct another agent to perform a full QA pass on the To-Do dashboard changes.

---

## Agent Instructions

You are a QA engineer. Your job is to validate that the To-Do dashboard in this project meets every requirement listed below. For each check, read the relevant source files, confirm the behavior, and report PASS or FAIL with a one-line explanation. At the end, provide a summary with a count of passes and failures and any remediation notes.

**Files to inspect:**
- `dashboard/src/views/TodosDashboard.jsx` (frontend component)
- `supabase/functions/master-sync/index.ts` (Notion sync edge function, specifically the `syncNotion` function around line 360)
- `dashboard/tests/todosDashboard.test.mjs` (automated test suite)

**Run the automated test suite first:**
```bash
cd dashboard && node --test tests/todosDashboard.test.mjs
```
All 33 tests must pass. If any fail, investigate and report the failure before continuing manual checks.

---

## Requirement Checklist

### R1: Person Filter
- [ ] A `PERSON_OPTIONS` constant exists with exactly `['All', 'Andrew Lassise', 'Kandace']`.
- [ ] The `personFilter` state defaults to `'Andrew Lassise'` (not `'All'`).
- [ ] Person filter buttons render in the UI between the header and the task list.
- [ ] When a person is selected, `filteredTodos` only includes tasks whose `metadata.assignee` matches (case-insensitive).
- [ ] When `'All'` is selected, no person filtering is applied.
- [ ] Adding a new person in the future requires only appending to `PERSON_OPTIONS` (no logic changes).

### R2: Default Status Filter = Active (excludes Done)
- [ ] The `filter` state defaults to `'Active'` (not `'All'`).
- [ ] The filter tab bar includes `'Active'` as the first option: `['Active', 'All', 'Not started', 'In progress', 'Waiting', 'Done']`.
- [ ] When `filter === 'Active'`, `filteredTodos` excludes items where `status` is `'done'` or `'completed'` (case-insensitive).
- [ ] The `'Active'` tab shows a count of non-done items (scoped to the current person filter).

### R3: Status Dropdown (replaces click-to-cycle)
- [ ] A `StatusDropdown` component exists and is used in each task row instead of a simple click handler.
- [ ] Clicking the status badge opens a dropdown with all four options: `Not started`, `In progress`, `Waiting on Others`, `Done`.
- [ ] The old cycling logic (`(currentIdx + 1) % STATUS_ORDER.length`) is completely removed.
- [ ] `handleUpdateStatus` accepts `(todo, newStatus)` — the new status is passed explicitly, not computed.
- [ ] Clicking outside the dropdown closes it (via `mousedown` listener).
- [ ] Selecting `'Done'` updates Notion and the local DB, and the item disappears from the default `'Active'` view.
- [ ] Selecting the currently active status does nothing (no redundant API call).

### R4: Effort Level Column
- [ ] An `EFFORT_COLORS` constant maps `'easy effort'`, `'medium effort'`, `'hard effort'` to color objects.
- [ ] A `getEffortLevel` helper reads `todo.metadata?.effort_level`.
- [ ] The grid header includes an `Effort` column.
- [ ] Each task row renders the effort level with a colored badge, or `'—'` if null.
- [ ] Adding a new effort level in the future requires only adding to `EFFORT_COLORS`.

### R5: Priority Display (supports "High Priority" values)
- [ ] `PRIORITY_COLORS` includes entries for both short (`'high'`, `'medium'`, `'low'`) and long (`'high priority'`, `'medium priority'`, `'low priority'`) forms.
- [ ] `getPriorityStyle` uses `.toLowerCase()` so matching is case-insensitive.
- [ ] A task with `priority = "High Priority"` renders a red badge with the fire-red icon.

### R6: Due Date / Deadline Import
- [ ] In `master-sync/index.ts`, the `dueDate` extraction checks `props.Deadline?.date?.start` FIRST, before `Date`, `Due Date`, `Due date`.
- [ ] The extracted `dueDate` is stored in the upsert payload as `due_date: dueDate`.
- [ ] The dashboard renders `todo.due_date` in the Due Date column, with overdue styling (red + bold) for past dates on non-done items.

### R7: Grid Column Alignment
- [ ] The header `gridTemplateColumns` is `'40px 1fr 110px 100px 130px 110px 100px 40px'` (8 columns).
- [ ] Each task row uses the identical `gridTemplateColumns` value.
- [ ] Columns map to: (icon) | Task Name | Priority | Effort | Status | Due Date | Person | (link).

### R8: Person Column in Grid
- [ ] A `Person` header exists in the grid.
- [ ] Each row displays `metadata.assignee` or `'—'` if null.

### R9: Regression — Existing Features Intact
- [ ] Sync Now button still calls `master-sync` with `action: 'sync_notion'`.
- [ ] Add to Notion form still calls `master-sync` with `action: 'create_task'`.
- [ ] New tasks created while a person filter is active pass `_person_name` to assign them.
- [ ] Inline title editing (`handleTitleSave`) still works — updates Notion and local DB.
- [ ] AI Analysis panel (toggle button + 4-quadrant analysis) still renders.
- [ ] External Notion link (arrow icon) still present in last column of each row.
- [ ] Stats bar (Total / Open / Overdue / Completed) still renders above the task list.

### R10: Specific Test Case Validation
After a Notion sync, locate the task **"Recreate mailchimps and lumas for invitations recurring monthly"** and confirm:
- [ ] Priority = `"High Priority"` (rendered with red badge)
- [ ] Effort Level = `"Easy Effort"` (rendered with green badge)
- [ ] Status = `"Not started"` (rendered with gray badge)
- [ ] Deadline = `03/31/2026` (rendered in Due Date column)
- [ ] It appears in the default view (Person = Andrew Lassise, Status filter = Active)

*If this item is not in the database yet (sync hasn't run against live Notion), note this as SKIPPED — not FAIL. The structural code to display it is validated by R1–R8.*

### R11: Scalability
- [ ] `PERSON_OPTIONS`, `STATUS_ORDER`, `EFFORT_COLORS`, `PRIORITY_COLORS` are all top-level constants — adding new values requires no logic changes.
- [ ] `filteredTodos` is wrapped in `useMemo` with dependencies `[todos, filter, personFilter]`.
- [ ] `StatusDropdown` cleans up its event listener on unmount (returns cleanup in `useEffect`).
- [ ] The build (`npx vite build`) succeeds with no errors.

---

## Reporting Format

```
## QA Results — To-Do Dashboard
Date: YYYY-MM-DD
Agent: <your name/id>

### Automated Tests
- Result: PASS / FAIL (33/33 or N/33)
- Failures: <list any>

### Manual Checks
| ID   | Requirement                        | Result | Notes |
|------|------------------------------------|--------|-------|
| R1.1 | PERSON_OPTIONS constant             | PASS   |       |
| R1.2 | Default person = Andrew Lassise     | PASS   |       |
| ...  | ...                                 | ...    | ...   |

### Summary
- Total checks: NN
- Pass: NN
- Fail: NN
- Skipped: NN
- Blockers: <any>
- Recommendations: <any>
```
