
/* ============================================================
   1. donor_events — logs automated outreach triggers
   ============================================================ */
CREATE TABLE IF NOT EXISTS public.donor_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_email  TEXT        NOT NULL,
  event_type   TEXT        NOT NULL, -- 'lapse_alert' | 'upgrade_opportunity' | 'reactivation'
  donor_status TEXT,
  metadata     JSONB       DEFAULT '{}'::jsonb,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.donor_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "donor_events_select" ON public.donor_events FOR SELECT USING (true);
CREATE POLICY "donor_events_insert" ON public.donor_events FOR INSERT WITH CHECK (true);

/* ============================================================
   2. vw_donor_health — intelligence on donation health vs leads
   ============================================================ */
CREATE OR REPLACE VIEW public.vw_donor_health AS
WITH aggregated_donations AS (
  SELECT
    donor_email,
    donor_name,
    MAX(donated_at)       AS last_donation_at,
    SUM(amount)          AS total_lifetime_value,
    COUNT(*)             AS donation_count,
    BOOL_OR(is_recurring) AS has_recurring_flag,
    MAX(CASE WHEN is_recurring THEN amount END) AS current_recurring_amount
  FROM public.raw_zeffy_donations
  GROUP BY 1, 2
)
SELECT
  d.donor_email,
  d.donor_name,
  h.firstname,
  h.lastname,
  h.annual_revenue_in_dollars AS hs_revenue,
  h.membership_s,
  d.last_donation_at,
  EXTRACT(DAY FROM (now() - d.last_donation_at))::INT AS days_since_last,
  d.total_lifetime_value,
  d.donation_count,
  d.has_recurring_flag,
  d.current_recurring_amount,
  CASE
    WHEN d.has_recurring_flag AND d.last_donation_at > now() - INTERVAL '35 days' THEN 'active_recurring'
    WHEN d.has_recurring_flag AND d.last_donation_at <= now() - INTERVAL '35 days' THEN 'lapsed_recurring'
    WHEN d.last_donation_at > now() - INTERVAL '90 days' THEN 'one_time_recent'
    ELSE 'at_risk'
  END AS donor_status,
  CASE
    -- High HS revenue (>$500k) but low/no donations/recurring
    WHEN h.annual_revenue_in_dollars >= 500000 
         AND (d.current_recurring_amount IS NULL OR d.current_recurring_amount < 250)
         THEN true
    ELSE false
  END AS is_upgrade_candidate
FROM aggregated_donations d
LEFT JOIN public.raw_hubspot_contacts h ON LOWER(h.email) = LOWER(d.donor_email);
;
