/**
 * Group Meeting Classification — Single Source of Truth
 *
 * Defines which HubSpot meeting/call activity titles are group sessions
 * (Tuesday Tactic Tuesday, Thursday Mastermind) vs 1:1s (intro meetings,
 * booking-link meetings with Andrew, Phoenix Forum interviews, etc.).
 *
 * Used by:
 *   - AttendanceDashboard.jsx  (client-side session classification)
 *   - OutreachReviewQueue.jsx  (outreach queue)
 *
 * IMPORTANT: The SQL view `vw_group_meeting_attendance` in
 *   supabase/migrations/20260319130000_fix_group_attendance_1on1_leak.sql
 *   mirrors these exact patterns in PostgreSQL LIKE syntax. If you add or
 *   change a pattern here, update the SQL view to match (and vice-versa).
 */

// ── Positive signals: title substrings that confirm a group meeting ──
// Each entry: { pattern, group }
// `pattern` is matched case-insensitively as a substring of the title.
export const GROUP_TITLE_SIGNALS = [
  { pattern: 'tactic tuesday', group: 'Tuesday' },
  { pattern: 'mastermind on zoom', group: 'Thursday' },
  { pattern: 'all are welcome', group: 'Thursday' },
  { pattern: "entrepreneur's big book", group: 'Thursday' },
  { pattern: 'big book', group: 'Thursday' },
  { pattern: 'business mastermind', group: 'Thursday' },
];

// ── Negative signals: title substrings that indicate a 1:1, not a group ──
// If any of these match (case-insensitive), the activity should NOT be
// classified as a group meeting via the day/time fallback. A positive
// signal above always wins over a negative signal.
export const ONE_ON_ONE_TITLE_SIGNALS = [
  'intro meeting',
  'meeting with',           // HubSpot booking-link format: "Meeting With X - Andrew Lassise"
  'andrew lassise -',       // reverse booking format
  'not canceled: meeting',  // HubSpot canceled-then-restored meetings
  'phoenix forum',
  'sober founder interview',
  'canceled:',
  '1 hr online meeting',
  'lunch',
];

/**
 * Classify a HubSpot activity title as a group meeting type or null.
 *
 * @param {string} titleRaw   - The activity title from HubSpot
 * @param {string|null} scheduledDayType - 'Tuesday'|'Thursday' if the timestamp
 *                                          falls on the expected day/time window
 * @returns {{ type: string|null, strongSignal: boolean, likelyOneToOne: boolean }}
 */
export function classifyMeetingTitle(titleRaw = '', scheduledDayType = null) {
  const title = String(titleRaw || '').toLowerCase();

  // Check positive signals first (always wins)
  for (const { pattern, group } of GROUP_TITLE_SIGNALS) {
    if (title.includes(pattern)) {
      // Special case: "mastermind" without "intro" is a strong Thursday signal,
      // but fall back to scheduledDayType if available (could be Tuesday mastermind)
      if (pattern === 'business mastermind') {
        return { type: scheduledDayType || group, strongSignal: true, likelyOneToOne: false };
      }
      return { type: group, strongSignal: true, likelyOneToOne: false };
    }
  }

  // Check negative signals
  const likelyOneToOne = ONE_ON_ONE_TITLE_SIGNALS.some(p => title.includes(p));

  return { type: null, strongSignal: false, likelyOneToOne };
}
