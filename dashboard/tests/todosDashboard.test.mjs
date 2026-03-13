/**
 * QA Validation Script for TodosDashboard
 *
 * Validates that the TodosDashboard component and master-sync edge function
 * meet all specified requirements for:
 *   - Person filtering (Andrew Lassise, Kandace)
 *   - Default "Active" status filter (excludes Done)
 *   - Status dropdown (not cycling)
 *   - Effort Level column
 *   - Priority display for "High Priority" style values
 *   - Due Date / Deadline import from Notion
 *   - Grid column alignment (header matches rows)
 *
 * Run: node --test dashboard/tests/todosDashboard.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardSrc = readFileSync(resolve(__dirname, '../src/views/TodosDashboard.jsx'), 'utf-8');
const masterSyncSrc = readFileSync(resolve(__dirname, '../../supabase/functions/master-sync/index.ts'), 'utf-8');

// ───────────────────────────────────────────────────────────────────────────
// 1. Person Filter
// ───────────────────────────────────────────────────────────────────────────

test('PERSON_OPTIONS includes All, Andrew Lassise, and Kandace', () => {
  assert.match(dashboardSrc, /PERSON_OPTIONS\s*=\s*\[/);
  assert.match(dashboardSrc, /'All'/);
  assert.match(dashboardSrc, /'Andrew Lassise'/);
  assert.match(dashboardSrc, /'Kandace'/);
});

test('Default person filter is Andrew Lassise', () => {
  assert.match(dashboardSrc, /useState\(\s*'Andrew Lassise'\s*\)/);
});

test('Person filter is applied to displayed tasks', () => {
  // The filteredTodos memo should check assignee against personFilter
  assert.match(dashboardSrc, /personFilter/);
  assert.match(dashboardSrc, /getAssignee/);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Default Status Filter = Active (excludes Done)
// ───────────────────────────────────────────────────────────────────────────

test('Default status filter is Active, not All', () => {
  // The filter state should default to 'Active'
  assert.match(dashboardSrc, /useState\(\s*'Active'\s*\)/);
});

test('Active filter excludes done and completed statuses', () => {
  // filteredTodos should filter out done/completed when filter === 'Active'
  assert.match(dashboardSrc, /filter\s*===\s*'Active'/);
  assert.match(dashboardSrc, /!==\s*'done'/);
  assert.match(dashboardSrc, /!==\s*'completed'/);
});

test('Filter tabs include Active option', () => {
  // The filter tab list should include 'Active'
  assert.match(dashboardSrc, /\[\s*'Active'\s*,\s*'All'/);
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Status Dropdown (not cycling)
// ───────────────────────────────────────────────────────────────────────────

test('StatusDropdown component exists', () => {
  assert.match(dashboardSrc, /const StatusDropdown/);
});

test('StatusDropdown renders all four status options', () => {
  // The dropdown maps over STATUS_ORDER which has 4 items
  assert.match(dashboardSrc, /STATUS_ORDER\.map/);
});

test('Status change passes explicit status value, not cycling', () => {
  // handleUpdateStatus should accept (todo, newStatus) not compute next via modulo
  assert.match(dashboardSrc, /handleUpdateStatus\s*=\s*async\s*\(\s*todo\s*,\s*newStatus\s*\)/);
  // Should NOT have the old cycling logic
  assert.doesNotMatch(dashboardSrc, /\(currentIdx \+ 1\) % STATUS_ORDER\.length/);
});

test('StatusDropdown calls onStatusChange with explicit status', () => {
  assert.match(dashboardSrc, /onStatusChange\(\s*todo\s*,\s*s\s*\)/);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Effort Level Column
// ───────────────────────────────────────────────────────────────────────────

test('EFFORT_COLORS defined for Easy, Medium, Hard effort', () => {
  assert.match(dashboardSrc, /EFFORT_COLORS/);
  assert.match(dashboardSrc, /'easy effort'/);
  assert.match(dashboardSrc, /'medium effort'/);
  assert.match(dashboardSrc, /'hard effort'/);
});

test('Effort column header exists in grid', () => {
  assert.match(dashboardSrc, /<div>Effort<\/div>/);
});

test('getEffortLevel reads from metadata', () => {
  assert.match(dashboardSrc, /metadata\?\.effort_level/);
});

test('Effort level is rendered in task rows', () => {
  assert.match(dashboardSrc, /effortStyle/);
  assert.match(dashboardSrc, /effortLevel/);
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Priority Display (supports "High Priority" values)
// ───────────────────────────────────────────────────────────────────────────

test('PRIORITY_COLORS handles both short and long priority names', () => {
  assert.match(dashboardSrc, /'high priority'/);
  assert.match(dashboardSrc, /'medium priority'/);
  assert.match(dashboardSrc, /'low priority'/);
  // Original short forms should still work
  assert.match(dashboardSrc, /'high':\s*\{/);
  assert.match(dashboardSrc, /'medium':\s*\{/);
  assert.match(dashboardSrc, /'low':\s*\{/);
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Due Date / Deadline Import (master-sync)
// ───────────────────────────────────────────────────────────────────────────

test('master-sync checks Deadline property for due_date', () => {
  assert.match(masterSyncSrc, /props\.Deadline\?\.date\?\.start/);
});

test('master-sync still checks Date, Due Date, Due date properties', () => {
  assert.match(masterSyncSrc, /props\.Date\?\.date\?\.start/);
  assert.match(masterSyncSrc, /props\['Due Date'\]\?\.date\?\.start/);
  assert.match(masterSyncSrc, /props\['Due date'\]\?\.date\?\.start/);
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Grid Column Alignment
// ───────────────────────────────────────────────────────────────────────────

test('Header and row grid templates have matching column count', () => {
  // Extract all gridTemplateColumns values
  const gridMatches = dashboardSrc.match(/gridTemplateColumns:\s*'([^']+)'/g) || [];
  // There should be at least 2 (header + rows)
  assert.ok(gridMatches.length >= 2, `Expected at least 2 gridTemplateColumns, found ${gridMatches.length}`);

  // Extract the column definitions
  const columnDefs = gridMatches.map(m => {
    const match = m.match(/gridTemplateColumns:\s*'([^']+)'/);
    return match ? match[1].trim().split(/\s+/).length : 0;
  });

  // All grid definitions in the task list area should have the same column count
  const taskGridCols = columnDefs.filter(c => c === 8); // 8 columns expected
  assert.ok(taskGridCols.length >= 2, `Expected header and row grids to both have 8 columns, found ${taskGridCols.length} matches`);
});

test('Grid includes columns for all required fields', () => {
  // Header should contain all column labels
  assert.match(dashboardSrc, /<div>Task Name<\/div>/);
  assert.match(dashboardSrc, /<div>Priority<\/div>/);
  assert.match(dashboardSrc, /<div>Effort<\/div>/);
  assert.match(dashboardSrc, /<div>Status<\/div>/);
  assert.match(dashboardSrc, /<div>Due Date<\/div>/);
  assert.match(dashboardSrc, /<div>Person<\/div>/);
});

// ───────────────────────────────────────────────────────────────────────────
// 8. Person Column Display
// ───────────────────────────────────────────────────────────────────────────

test('Person/assignee is displayed in task rows', () => {
  assert.match(dashboardSrc, /assignee\s*\|\|\s*'—'/);
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Scalability Checks
// ───────────────────────────────────────────────────────────────────────────

test('Person options are defined as a constant array (easy to extend)', () => {
  assert.match(dashboardSrc, /const PERSON_OPTIONS\s*=/);
});

test('Status options use STATUS_ORDER constant (easy to extend)', () => {
  assert.match(dashboardSrc, /const STATUS_ORDER\s*=/);
});

test('Effort colors are a constant map (easy to add new levels)', () => {
  assert.match(dashboardSrc, /const EFFORT_COLORS\s*=/);
});

test('filteredTodos is memoized for performance', () => {
  assert.match(dashboardSrc, /useMemo\(\(\)\s*=>\s*\{[\s\S]*?personFilter[\s\S]*?\}\s*,\s*\[todos\s*,\s*filter\s*,\s*personFilter\]/);
});

test('StatusDropdown handles click-outside to close', () => {
  assert.match(dashboardSrc, /handleClickOutside/);
  assert.match(dashboardSrc, /mousedown/);
});

// ───────────────────────────────────────────────────────────────────────────
// 10. Regression: Existing Features Still Work
// ───────────────────────────────────────────────────────────────────────────

test('Sync from Notion still available', () => {
  assert.match(dashboardSrc, /handleSync/);
  assert.match(dashboardSrc, /sync_notion/);
});

test('Create task still works', () => {
  assert.match(dashboardSrc, /handleCreateTask/);
  assert.match(dashboardSrc, /create_task/);
});

test('Inline title editing still works', () => {
  assert.match(dashboardSrc, /handleTitleSave/);
  assert.match(dashboardSrc, /editingId/);
});

test('AI Analysis panel still available', () => {
  assert.match(dashboardSrc, /showAnalysis/);
  assert.match(dashboardSrc, /analyzeTaskList/);
});

test('External Notion link still present in rows', () => {
  assert.match(dashboardSrc, /ExternalLink/);
  assert.match(dashboardSrc, /Open in Notion/);
});

// ───────────────────────────────────────────────────────────────────────────
// 11. Validation Item: "Recreate mailchimps and lumas" test case
// ───────────────────────────────────────────────────────────────────────────

test('master-sync extracts effort_level from Notion properties', () => {
  // The sync function should extract effort_level
  assert.match(masterSyncSrc, /effort_level:\s*effortLevel/);
  assert.match(masterSyncSrc, /Effort level/);
  assert.match(masterSyncSrc, /Effort Level/);
});

test('master-sync extracts priority from Notion properties', () => {
  assert.match(masterSyncSrc, /priority:\s*priority/);
  assert.match(masterSyncSrc, /Priority/);
});

test('master-sync stores due_date in upsert payload', () => {
  assert.match(masterSyncSrc, /due_date:\s*dueDate/);
});
