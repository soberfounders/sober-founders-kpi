-- ============================================================
-- HubSpot Meeting/Call Activity Mapping (Additive / Non-Breaking)
-- ============================================================

-- Raw HubSpot meeting/call activities used to map Zoom sessions -> HubSpot activities.
CREATE TABLE IF NOT EXISTS public.raw_hubspot_meeting_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_activity_id BIGINT NOT NULL,
  activity_type TEXT NOT NULL, -- 'meeting' | 'call'
  portal_id BIGINT,
  hs_timestamp TIMESTAMPTZ,
  created_at_hubspot TIMESTAMPTZ,
  updated_at_hubspot TIMESTAMPTZ,
  title TEXT,
  body_preview TEXT,
  owner_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hubspot_activity_id, activity_type)
);

CREATE INDEX IF NOT EXISTS idx_raw_hubspot_meeting_activities_hs_timestamp
  ON public.raw_hubspot_meeting_activities (hs_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_raw_hubspot_meeting_activities_type
  ON public.raw_hubspot_meeting_activities (activity_type);

-- Contact associations attached to HubSpot meeting/call activities.
CREATE TABLE IF NOT EXISTS public.hubspot_activity_contact_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_activity_id BIGINT NOT NULL,
  activity_type TEXT NOT NULL, -- 'meeting' | 'call'
  hubspot_contact_id BIGINT NOT NULL,
  association_type TEXT DEFAULT 'contact',
  contact_email TEXT,
  contact_firstname TEXT,
  contact_lastname TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hubspot_activity_id, activity_type, hubspot_contact_id, association_type)
);

CREATE INDEX IF NOT EXISTS idx_hubspot_activity_contact_associations_activity
  ON public.hubspot_activity_contact_associations (hubspot_activity_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_hubspot_activity_contact_associations_contact
  ON public.hubspot_activity_contact_associations (hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_hubspot_activity_contact_associations_email
  ON public.hubspot_activity_contact_associations (lower(contact_email));

-- Session-level match between a Zoom session and a HubSpot meeting/call activity.
CREATE TABLE IF NOT EXISTS public.zoom_session_hubspot_activity_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date DATE NOT NULL,
  meeting_id TEXT NOT NULL,
  group_name TEXT,
  zoom_start_time_utc TIMESTAMPTZ,
  zoom_session_key TEXT NOT NULL,
  hubspot_activity_id BIGINT NOT NULL,
  activity_type TEXT NOT NULL,
  match_source TEXT NOT NULL, -- exact_start_time | time_window | manual | overlap_heuristic
  match_confidence NUMERIC(5,4),
  match_note TEXT,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (zoom_session_key, hubspot_activity_id, activity_type)
);

CREATE INDEX IF NOT EXISTS idx_zoom_session_hubspot_activity_matches_session
  ON public.zoom_session_hubspot_activity_matches (session_date DESC, meeting_id);
CREATE INDEX IF NOT EXISTS idx_zoom_session_hubspot_activity_matches_activity
  ON public.zoom_session_hubspot_activity_matches (hubspot_activity_id, activity_type);

-- Per-attendee resolved mapping (materialized for debugging + reproducibility).
CREATE TABLE IF NOT EXISTS public.zoom_attendee_hubspot_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date DATE NOT NULL,
  meeting_id TEXT NOT NULL,
  group_name TEXT,
  zoom_session_key TEXT NOT NULL,
  zoom_attendee_raw_name TEXT,
  zoom_attendee_canonical_name TEXT NOT NULL,
  hubspot_contact_id BIGINT,
  hubspot_name TEXT,
  hubspot_email TEXT,
  hubspot_activity_id BIGINT,
  activity_type TEXT,
  mapping_source TEXT NOT NULL, -- manual_override | hubspot_meeting_activity | hubspot_exact_name | luma_email_bridge | ...
  mapping_priority_rank INTEGER,
  mapping_confidence NUMERIC(5,4),
  mapping_reason TEXT,
  match_note TEXT,
  candidate_hints TEXT,
  resolver_version TEXT,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (zoom_session_key, zoom_attendee_canonical_name)
);

CREATE INDEX IF NOT EXISTS idx_zoom_attendee_hubspot_mappings_session
  ON public.zoom_attendee_hubspot_mappings (session_date DESC, meeting_id);
CREATE INDEX IF NOT EXISTS idx_zoom_attendee_hubspot_mappings_contact
  ON public.zoom_attendee_hubspot_mappings (hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_zoom_attendee_hubspot_mappings_name
  ON public.zoom_attendee_hubspot_mappings (lower(zoom_attendee_canonical_name));

-- ============================================================
-- Row-Level Security (readable by dashboard, service role writes)
-- ============================================================

ALTER TABLE public.raw_hubspot_meeting_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubspot_activity_contact_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoom_session_hubspot_activity_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoom_attendee_hubspot_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read raw_hubspot_meeting_activities"
  ON public.raw_hubspot_meeting_activities
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Public read hubspot_activity_contact_associations"
  ON public.hubspot_activity_contact_associations
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Public read zoom_session_hubspot_activity_matches"
  ON public.zoom_session_hubspot_activity_matches
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Public read zoom_attendee_hubspot_mappings"
  ON public.zoom_attendee_hubspot_mappings
  FOR SELECT TO anon, authenticated
  USING (true);
