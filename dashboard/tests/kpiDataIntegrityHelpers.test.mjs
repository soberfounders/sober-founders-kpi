import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeAttendanceIntegrity,
  summarizeLeadsIntegrity,
} from "../../scripts/lib/kpiDataIntegrity.mjs";

const REFERENCE_DATE = new Date("2026-03-09T00:00:00.000Z");

test("summarizeLeadsIntegrity enforces strict qualified rule and fallback-source-only behavior", () => {
  const rows = [
    {
      hubspot_contact_id: 1,
      createdate: "2026-03-01T00:00:00.000Z",
      annual_revenue_in_dollars__official_: 300000,
      sobriety_date: "2020-01-01",
    },
    {
      hubspot_contact_id: 2,
      createdate: "2026-03-01T00:00:00.000Z",
      annual_revenue_in_dollars__official_: null,
      annual_revenue_in_dollars: 350000,
      sobriety_date: "2020-01-01",
    },
    {
      hubspot_contact_id: 3,
      createdate: "2026-03-01T00:00:00.000Z",
      annual_revenue_in_dollars__official_: 200000,
      annual_revenue_in_dollars: 450000,
      sobriety_date: "2020-01-01",
    },
    {
      hubspot_contact_id: 4,
      createdate: "2026-03-01T00:00:00.000Z",
      annual_revenue_in_dollars__official_: 300000,
      sobriety_date: "2025-03-09",
    },
  ];

  const summary = summarizeLeadsIntegrity(rows, {
    windows: [30],
    referenceDate: REFERENCE_DATE,
  });
  const row30 = summary[0];

  assert.equal(row30.window_days, 30);
  assert.equal(row30.total_count, 4);
  assert.equal(row30.qualified_count, 2);
  assert.equal(row30.official_qualified_count, 1);
  assert.equal(row30.fallback_qualified_count, 1);
  assert.equal(row30.fallback_share_pct, 0.5);
});

test("summarizeAttendanceIntegrity counts Tue/Thu attendance and new attendees", () => {
  const activities = [
    {
      hubspot_activity_id: 100,
      activity_type: "call",
      hs_timestamp: "2026-03-03T17:00:00.000Z", // Tuesday 12:00 ET
      title: "Tactic Tuesday",
    },
    {
      hubspot_activity_id: 200,
      activity_type: "call",
      hs_timestamp: "2026-03-05T16:00:00.000Z", // Thursday 11:00 ET
      title: "Sober Founders Mastermind on Zoom",
    },
  ];
  const associations = [
    { hubspot_activity_id: 100, activity_type: "call", hubspot_contact_id: 1 },
    { hubspot_activity_id: 100, activity_type: "call", hubspot_contact_id: 2 },
    { hubspot_activity_id: 200, activity_type: "call", hubspot_contact_id: 2 },
    { hubspot_activity_id: 200, activity_type: "call", hubspot_contact_id: 3 },
  ];

  const summary = summarizeAttendanceIntegrity(activities, associations, {
    windows: [30],
    referenceDate: REFERENCE_DATE,
  });
  const row30 = summary[0];

  assert.equal(row30.window_days, 30);
  assert.equal(row30.tuesday_session_count, 1);
  assert.equal(row30.thursday_session_count, 1);
  assert.equal(row30.tuesday_unique_contacts, 2);
  assert.equal(row30.thursday_unique_contacts, 2);
  assert.equal(row30.new_attendees_count, 3);
  assert.equal(row30.total_attendance_events, 4);
  assert.equal(row30.distinct_contacts, 3);
  assert.equal(row30.avg_attendance_per_person, 4 / 3);
});
