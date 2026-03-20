/* ============================================================
   Unified Metrics Layer - Phase 4 dim_kpi seeds
   ============================================================
   Adds metric definitions for new Phase 4 metrics:
   - ad_leads (Meta form submissions per funnel)
   - great_leads (revenue >= $1M, no sobriety gate)
   - attendance_total / attendance_new / attendance_repeat (day-split)
   - donations_count
   - completed_items (Notion tasks)
   ============================================================ */

INSERT INTO public.dim_kpi (kpi_key, name, definition, unit, domain, granularity, higher_is_better, description, source_tables, computation)
VALUES
  -- Ad leads (Meta lead-form submissions)
  ('ad_leads',               'Ad Leads',                'Meta ad lead-form submissions',                                  'count', 'leads',      'daily', true,  'Meta ad lead-form submissions from raw_fb_ads_insights_daily.leads column',     ARRAY['raw_fb_ads_insights_daily'], 'edge_function'),

  -- Great leads (revenue >= $1M, no sobriety requirement)
  ('great_leads',            'Great Leads ($1M+)',      'Leads with revenue >= $1M (no sobriety gate)',                    'count', 'leads',      'daily', true,  'Leads with revenue >= $1M (no sobriety gate)',                                  ARRAY['raw_hubspot_contacts'], 'edge_function'),

  -- Day-split attendance
  ('attendance_total',       'Attendance Total',        'Total attendee-session records per day type',                     'count', 'attendance', 'daily', true,  'Total attendee-session records per day type (tuesday/thursday funnel_key)',      ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function'),
  ('attendance_new',         'New Attendees (Day)',     'First-time attendees per day type',                               'count', 'attendance', 'daily', true,  'First-time attendees per day type (tuesday/thursday funnel_key)',                ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function'),
  ('attendance_repeat',      'Repeat Attendees (Day)', 'Returning attendees per day type',                                'count', 'attendance', 'daily', true,  'Returning attendees per day type (tuesday/thursday funnel_key)',                 ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function'),

  -- Donations count
  ('donations_count',        'Donations Count',         'Number of donation transactions in window',                      'count', 'donations',  'daily', true,  'Number of donation transactions in window',                                     ARRAY['donation_transactions_unified'], 'edge_function'),

  -- Completed items
  ('completed_items',        'Completed Items',         'Notion tasks marked Done/Completed in window',                   'count', 'operations', 'daily', true,  'Notion tasks marked Done/Completed in window',                                  ARRAY['notion_todos'], 'edge_function'),

  -- Rolling 90-day avg visits per person per day type
  ('avg_visits_per_person',  'Avg Visits/Person',       'Rolling 90-day total visits / unique people per day type',       'decimal', 'attendance', 'daily', true, 'Rolling 90-day average visits per person per day type (tuesday/thursday)',       ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function')

ON CONFLICT (kpi_key) DO UPDATE SET
  name            = EXCLUDED.name,
  definition      = EXCLUDED.definition,
  unit            = EXCLUDED.unit,
  domain          = EXCLUDED.domain,
  granularity     = EXCLUDED.granularity,
  higher_is_better = EXCLUDED.higher_is_better,
  description     = EXCLUDED.description,
  source_tables   = EXCLUDED.source_tables,
  computation     = EXCLUDED.computation,
  updated_at      = now();
