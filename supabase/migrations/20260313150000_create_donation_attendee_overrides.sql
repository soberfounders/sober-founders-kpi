-- Manual overrides that link a Zeffy donor email to an attendance display name.
-- This handles household/spousal donations and name variants where the donor
-- identity doesn't match the attendee's HubSpot record.
-- Compliance-safe: no Zeffy or HubSpot data is altered.
CREATE TABLE IF NOT EXISTS donation_attendee_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_email text NOT NULL,
  attendee_display_name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (donor_email)
);

CREATE INDEX IF NOT EXISTS idx_donation_attendee_overrides_email
  ON donation_attendee_overrides (lower(donor_email));

ALTER TABLE donation_attendee_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_donation_attendee_overrides"
  ON donation_attendee_overrides FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "service_role_all_donation_attendee_overrides"
  ON donation_attendee_overrides FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed known household/spousal donation links
INSERT INTO donation_attendee_overrides (donor_email, attendee_display_name, note) VALUES
  ('waltermoyer@thebottomlineinc.net', 'Wally Moyer', 'Walter Moyer is Wally Moyer — name variant, different email'),
  ('pullenpainters@gmail.com', 'James Pullen', 'Michelle Djus donated via Pullen Painters email — spouse of James Pullen'),
  ('egoman115@gmail.com', 'Renee Sabina Keisman', 'Diego Keisman donated — spouse of Renee Sabina Keisman')
ON CONFLICT (donor_email) DO NOTHING;
