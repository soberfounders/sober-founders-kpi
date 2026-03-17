/**
 * Demo data for all Supabase tables.
 * All names, emails, companies, and dollar amounts are fictitious.
 * Used when VITE_DEMO_MODE=true so the dashboard can be shown without real data.
 */

/* ── helpers ── */
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoAgo(n) {
  return `${daysAgo(n)}T12:00:00.000Z`;
}
function monthsAgo(n) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

let _id = 90000;
function nextId() { return ++_id; }

const DEMO_NAMES = [
  { first: 'Marcus', last: 'Rivera', company: 'Rivera Capital Group', email: 'marcus@riveracapital.com', revenue: 2500000, city: 'Austin', region: 'TX' },
  { first: 'Sarah', last: 'Chen', company: 'Greenfield Ventures', email: 'sarah@greenfieldvc.com', revenue: 4200000, city: 'San Francisco', region: 'CA' },
  { first: 'James', last: 'O\'Brien', company: 'Summit Digital Agency', email: 'james@summitagency.co', revenue: 890000, city: 'Denver', region: 'CO' },
  { first: 'Priya', last: 'Patel', company: 'Patel Logistics LLC', email: 'priya@patellogistics.com', revenue: 1750000, city: 'Chicago', region: 'IL' },
  { first: 'David', last: 'Kim', company: 'Brightpath Software', email: 'david@brightpath.io', revenue: 3100000, city: 'Seattle', region: 'WA' },
  { first: 'Rachel', last: 'Torres', company: 'Torres Real Estate', email: 'rachel@torresre.com', revenue: 620000, city: 'Miami', region: 'FL' },
  { first: 'Michael', last: 'Anderson', company: 'Anderson Manufacturing', email: 'mike@andersonmfg.com', revenue: 5800000, city: 'Nashville', region: 'TN' },
  { first: 'Emily', last: 'Washington', company: 'WashTech Solutions', email: 'emily@washtech.co', revenue: 420000, city: 'Atlanta', region: 'GA' },
  { first: 'Thomas', last: 'Nakamura', company: 'Pacific Trade Corp', email: 'thomas@pacifictrade.com', revenue: 1200000, city: 'Portland', region: 'OR' },
  { first: 'Alicia', last: 'Brooks', company: 'Brooks Consulting', email: 'alicia@brooksconsulting.com', revenue: 310000, city: 'Boston', region: 'MA' },
  { first: 'Ryan', last: 'Cooper', company: 'Cooper & Sons HVAC', email: 'ryan@cooperhvac.com', revenue: 780000, city: 'Dallas', region: 'TX' },
  { first: 'Jessica', last: 'Liu', company: 'Jade Wellness Brands', email: 'jessica@jadewellness.com', revenue: 1450000, city: 'Los Angeles', region: 'CA' },
  { first: 'Brandon', last: 'Foster', company: 'Foster Media Group', email: 'brandon@fostermedia.co', revenue: 950000, city: 'New York', region: 'NY' },
  { first: 'Lauren', last: 'Hayes', company: 'Hayes Financial', email: 'lauren@hayesfin.com', revenue: 2100000, city: 'Charlotte', region: 'NC' },
  { first: 'Daniel', last: 'Morales', company: 'Morales Construction', email: 'daniel@moralesconstruction.com', revenue: 3400000, city: 'Phoenix', region: 'AZ' },
  { first: 'Megan', last: 'Sullivan', company: 'Sullivan Design Studio', email: 'megan@sullivandesign.co', revenue: 280000, city: 'Minneapolis', region: 'MN' },
  { first: 'Kevin', last: 'Nguyen', company: 'Nguyen Import/Export', email: 'kevin@nguyenimport.com', revenue: 6200000, city: 'Houston', region: 'TX' },
  { first: 'Amanda', last: 'Garcia', company: 'Garcia Law PLLC', email: 'amanda@garcialaw.com', revenue: 540000, city: 'San Antonio', region: 'TX' },
  { first: 'Chris', last: 'Bennett', company: 'Bennett Roofing Inc', email: 'chris@bennettroofing.com', revenue: 1100000, city: 'Tampa', region: 'FL' },
  { first: 'Natalie', last: 'Park', company: 'Park Analytics', email: 'natalie@parkanalytics.com', revenue: 870000, city: 'Raleigh', region: 'NC' },
];

const SOBRIETY_DATES = [
  '2019-03-15', '2020-06-01', '2021-01-20', '2018-11-10', '2022-04-05',
  '2017-08-22', '2020-12-30', '2023-02-14', '2019-07-04', '2021-09-18',
  '2018-05-01', '2022-08-15', '2020-03-10', '2019-12-25', '2021-06-30',
  '2023-07-01', '2018-01-15', '2022-11-20', '2020-09-05', '2021-03-22',
];

const SOURCES = ['PAID_SOCIAL', 'ORGANIC_SEARCH', 'DIRECT_TRAFFIC', 'REFERRALS', 'EMAIL_MARKETING'];
const CAMPAIGNS = ['Free Group - Meta Leads', 'Phoenix Forum - Meta Leads', 'Free Group - Google', 'Phoenix Forum - LinkedIn', 'Organic Inbound'];

/* ── raw_hubspot_contacts ── */
export const hubspotContacts = DEMO_NAMES.map((person, i) => ({
  hubspot_contact_id: nextId(),
  createdate: isoAgo(Math.floor(Math.random() * 300) + 10),
  email: person.email,
  hs_analytics_source: SOURCES[i % SOURCES.length],
  hs_latest_source: SOURCES[(i + 1) % SOURCES.length],
  hs_analytics_source_data_2: i < 8 ? 'fb-free-group-ad' : 'organic',
  hs_latest_source_data_2: i < 5 ? 'fb-phoenix-ad' : '',
  campaign: CAMPAIGNS[i % CAMPAIGNS.length],
  campaign_source: i < 10 ? 'meta' : 'google',
  membership_s: i < 5 ? 'Phoenix' : i < 15 ? 'Free' : null,
  annual_revenue_in_dollars__official_: person.revenue,
  annual_revenue_in_dollars: person.revenue,
  sobriety_date: SOBRIETY_DATES[i],
  sobriety_date__official_: SOBRIETY_DATES[i],
  is_deleted: false,
  hubspot_archived: false,
  merged_into_hubspot_contact_id: null,
  hs_additional_emails: null,
}));

/* ── raw_fb_ads_insights_daily ── */
export const fbAdsInsights = [];
for (let d = 0; d < 120; d++) {
  const dateKey = daysAgo(d);
  const baseFreeSpend = 25 + Math.random() * 35;
  const basePhoenixSpend = 15 + Math.random() * 25;
  fbAdsInsights.push({
    date_day: dateKey,
    funnel_key: 'free_group',
    campaign_name: 'Free Group - Meta Leads',
    adset_name: 'Entrepreneurs Recovery 25-55',
    ad_name: 'Video – Founder Stories',
    spend: Math.round(baseFreeSpend * 100) / 100,
    leads: Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 1 : 0,
  });
  fbAdsInsights.push({
    date_day: dateKey,
    funnel_key: 'phoenix_forum',
    campaign_name: 'Phoenix Forum - Meta Leads',
    adset_name: '$1M+ Revenue Founders',
    ad_name: 'Carousel – Community Impact',
    spend: Math.round(basePhoenixSpend * 100) / 100,
    leads: Math.random() > 0.7 ? Math.floor(Math.random() * 2) + 1 : 0,
  });
}

/* ── raw_hubspot_meeting_activities ── */
export const hubspotMeetingActivities = [];
const MEETING_TITLES = [
  'Sober Founders Intro Meeting',
  'Sober Founders Intro Meeting',
  'Phoenix Forum Interview',
  'Phoenix Forum Learn More',
  'Sober Founders Tuesday Group Call',
  'Sober Founders Thursday Group Call',
];
for (let d = 0; d < 90; d += 2) {
  const actId = nextId();
  hubspotMeetingActivities.push({
    hubspot_activity_id: actId,
    activity_type: d % 4 === 0 ? 'meeting' : 'call',
    hs_timestamp: isoAgo(d),
    created_at_hubspot: isoAgo(d),
    title: MEETING_TITLES[d % MEETING_TITLES.length],
    body_preview: 'Discussion about community involvement and recovery support.',
    metadata: { duration_ms: 1800000 + Math.floor(Math.random() * 1800000) },
  });
}

/* ── hubspot_activity_contact_associations ── */
export const hubspotActivityAssociations = [];
hubspotMeetingActivities.forEach((act) => {
  const numAttendees = 2 + Math.floor(Math.random() * 5);
  for (let a = 0; a < numAttendees; a++) {
    const person = DEMO_NAMES[(act.hubspot_activity_id + a) % DEMO_NAMES.length];
    hubspotActivityAssociations.push({
      hubspot_activity_id: act.hubspot_activity_id,
      activity_type: act.activity_type,
      hubspot_contact_id: 90001 + ((act.hubspot_activity_id + a) % DEMO_NAMES.length),
      contact_email: person.email,
      contact_firstname: person.first,
      contact_lastname: person.last,
    });
  }
});

/* ── donation_transactions_unified ── */
export const donationTransactions = [];
const DONATION_CAMPAIGNS = ['Year-End Giving', 'Monthly Sustainer', 'Phoenix Fund', 'General Support', 'Spring Drive'];
for (let d = 0; d < 80; d++) {
  const person = DEMO_NAMES[d % DEMO_NAMES.length];
  const isRecurring = d % 3 === 0;
  const amount = isRecurring
    ? [25, 50, 100, 150, 250][d % 5]
    : [50, 100, 250, 500, 1000, 2500][d % 6];
  donationTransactions.push({
    row_id: `demo-tx-${d}`,
    source_system: d % 4 === 0 ? 'stripe_webhook' : 'zeffy',
    source_event_id: `evt_demo_${d}`,
    donor_name: `${person.first} ${person.last}`,
    donor_first_name: person.first,
    donor_last_name: person.last,
    donor_company_name: person.company,
    donor_email: person.email,
    amount,
    currency: 'USD',
    eligible_amount: amount,
    payment_method: d % 2 === 0 ? 'card' : 'bank_transfer',
    status: 'success',
    is_recurring: isRecurring,
    campaign_name: DONATION_CAMPAIGNS[d % DONATION_CAMPAIGNS.length],
    receipt_url: '#',
    donor_city: person.city,
    donor_region: person.region,
    donor_country: 'US',
    source_file: 'demo',
    donated_at: isoAgo(d * 1.5),
    created_at: isoAgo(d * 1.5),
    payload: {},
  });
}

/* ── raw_zeffy_supporter_profiles ── */
export const zeffySupporterProfiles = DEMO_NAMES.slice(0, 12).map((person, i) => ({
  donor_email: person.email,
  donor_name: `${person.first} ${person.last}`,
  donor_company_name: person.company,
  last_payment_at: isoAgo(i * 10 + 5),
  manual_lists: i < 4 ? 'Phoenix Donors' : 'General',
  donor_city: person.city,
  donor_region: person.region,
  donor_country: 'US',
}));

/* ── vw_donor_health ── */
export const donorHealth = DEMO_NAMES.slice(0, 12).map((person, i) => ({
  donor_email: person.email,
  donor_name: `${person.first} ${person.last}`,
  donor_status: ['active_recurring', 'active_recurring', 'lapsed_recurring', 'one_time_recent', 'at_risk', 'active_recurring'][i % 6],
  is_upgrade_candidate: i % 4 === 0,
  last_gift_at: isoAgo(i * 12),
  total_donated: (i + 1) * 350,
  gift_count: (i % 5) + 1,
}));

/* ── notion_todos ── */
const TODO_TITLES = [
  'Review Q1 marketing budget proposal',
  'Update Phoenix Forum landing page copy',
  'Schedule next board meeting agenda',
  'Finalize partnership agreement with recovery center',
  'Create social media content calendar for April',
  'Review and approve new member applications',
  'Update CRM workflow for lead qualification',
  'Prepare monthly donor impact report',
  'Coordinate with web developer on site updates',
  'Draft email sequence for new member onboarding',
  'Research potential podcast guest speakers',
  'Review Google Ad Grant compliance metrics',
];
export const notionTodos = TODO_TITLES.map((title, i) => ({
  notion_page_id: `demo-todo-${i}`,
  task_title: title,
  status: ['Not started', 'In progress', 'Done', 'Waiting on Others'][i % 4],
  last_updated_at: isoAgo(i * 3),
  created_at: isoAgo(i * 3 + 10),
  metadata: {
    assignee: i % 2 === 0 ? 'Demo User' : 'Team Member',
    effort_level: ['easy effort', 'medium effort', 'hard effort'][i % 3],
    priority: ['High', 'Medium', 'Low'][i % 3],
    due_date: daysAgo(-((i + 1) * 5)),
  },
}));

/* ── mailchimp_campaigns ── */
export const mailchimpCampaigns = [];
for (let w = 0; w < 26; w++) {
  const tuesdayDate = daysAgo(w * 7 + 1);
  const thursdayDate = daysAgo(w * 7 + 3);
  const delivered = 180 + Math.floor(Math.random() * 60);
  mailchimpCampaigns.push({
    id: `mc-tue-${w}`,
    campaign_group: 'Tuesday',
    send_time: `${tuesdayDate}T14:00:00.000Z`,
    emails_delivered: delivered,
    human_open_rate: 0.32 + Math.random() * 0.15,
    unique_opens: Math.floor(delivered * (0.32 + Math.random() * 0.15)),
    mpp_opens: Math.floor(delivered * 0.18),
    unique_clicks: Math.floor(delivered * (0.04 + Math.random() * 0.04)),
    ctr: 0.04 + Math.random() * 0.04,
    ctor: 0.12 + Math.random() * 0.08,
    unsubscribe_rate: 0.001 + Math.random() * 0.003,
    unsubscribes: Math.floor(Math.random() * 3),
    bounce_rate: 0.005 + Math.random() * 0.01,
    bounces: Math.floor(Math.random() * 4),
  });
  const deliveredThu = 200 + Math.floor(Math.random() * 80);
  mailchimpCampaigns.push({
    id: `mc-thu-${w}`,
    campaign_group: 'Thursday',
    send_time: `${thursdayDate}T14:00:00.000Z`,
    emails_delivered: deliveredThu,
    human_open_rate: 0.35 + Math.random() * 0.12,
    unique_opens: Math.floor(deliveredThu * (0.35 + Math.random() * 0.12)),
    mpp_opens: Math.floor(deliveredThu * 0.2),
    unique_clicks: Math.floor(deliveredThu * (0.05 + Math.random() * 0.05)),
    ctr: 0.05 + Math.random() * 0.05,
    ctor: 0.14 + Math.random() * 0.08,
    unsubscribe_rate: 0.001 + Math.random() * 0.002,
    unsubscribes: Math.floor(Math.random() * 2),
    bounce_rate: 0.004 + Math.random() * 0.008,
    bounces: Math.floor(Math.random() * 3),
  });
}

/* ── attendee_aliases ── */
export const attendeeAliases = [
  { id: 1, original_name: 'Mike Anderson', target_name: 'Michael Anderson' },
  { id: 2, original_name: 'Dave Kim', target_name: 'David Kim' },
  { id: 3, original_name: 'Tom Nakamura', target_name: 'Thomas Nakamura' },
  { id: 4, original_name: 'Chris B', target_name: 'Chris Bennett' },
  { id: 5, original_name: 'Nat Park', target_name: 'Natalie Park' },
];

/* ── raw_luma_registrations ── */
export const lumaRegistrations = DEMO_NAMES.slice(0, 10).map((person, i) => ({
  email: person.email,
  name: `${person.first} ${person.last}`,
  event_name: i % 2 === 0 ? 'Sober Founders Thursday Open Call' : 'Sober Founders Tuesday Call',
  event_date: daysAgo(i * 7),
  registered_at: isoAgo(i * 7 + 1),
  status: 'registered',
}));

/* ── vw_outreach_conversions ── */
export const outreachConversions = DEMO_NAMES.slice(0, 8).map((person, i) => ({
  contact_email: person.email,
  contact_name: `${person.first} ${person.last}`,
  outreach_type: ['email_sequence', 'direct_message', 'referral'][i % 3],
  delivered_at: isoAgo(i * 10 + 5),
  converted: i < 5,
  conversion_date: i < 5 ? isoAgo(i * 10) : null,
  days_to_convert: i < 5 ? 5 : null,
}));

/* ── vw_baseline_retention ── */
export const baselineRetention = [];
for (let m = 0; m < 6; m++) {
  baselineRetention.push({
    cohort_month: monthsAgo(m),
    cohort_size: 8 + Math.floor(Math.random() * 6),
    retained_week_4: 5 + Math.floor(Math.random() * 4),
    retained_week_8: 3 + Math.floor(Math.random() * 4),
    retention_rate_4w: 0.55 + Math.random() * 0.2,
    retention_rate_8w: 0.35 + Math.random() * 0.2,
  });
}

/* ── vw_experiment_results ── */
export const experimentResults = [];
for (let w = 0; w < 8; w++) {
  experimentResults.push({
    week_cohort: daysAgo(w * 7),
    experiment_name: 'Lead Qualification Threshold Test',
    variant: w % 2 === 0 ? 'control' : 'treatment',
    sample_size: 15 + Math.floor(Math.random() * 10),
    conversion_rate: 0.18 + Math.random() * 0.12,
    significance: w > 4 ? 0.04 : 0.08 + Math.random() * 0.1,
  });
}

/* ── vw_seo_opportunity_pages ── */
export const seoOpportunityPages = [
  { page: '/recovery-resources', current_position: 12.3, impressions: 4500, clicks: 180, ctr: 0.04, opportunity_score: 88 },
  { page: '/entrepreneur-recovery-guide', current_position: 8.7, impressions: 3200, clicks: 290, ctr: 0.09, opportunity_score: 82 },
  { page: '/sober-founders-community', current_position: 15.1, impressions: 2800, clicks: 95, ctr: 0.034, opportunity_score: 76 },
  { page: '/phoenix-forum', current_position: 6.2, impressions: 1900, clicks: 210, ctr: 0.11, opportunity_score: 71 },
  { page: '/business-after-addiction', current_position: 18.5, impressions: 5100, clicks: 120, ctr: 0.024, opportunity_score: 68 },
];

/* ── vw_seo_ranking_drops ── */
export const seoRankingDrops = [
  { page: '/blog/recovery-statistics', previous_position: 5.2, current_position: 11.8, delta: -6.6, impressions: 1200 },
  { page: '/about-us', previous_position: 8.1, current_position: 12.3, delta: -4.2, impressions: 800 },
];

/* ── vw_seo_organic_zoom_attendees ── */
export const seoOrganicZoomAttendees = DEMO_NAMES.slice(0, 6).map((person, i) => ({
  attendee_email: person.email,
  attendee_name: `${person.first} ${person.last}`,
  landing_page: ['/recovery-resources', '/entrepreneur-recovery-guide', '/phoenix-forum'][i % 3],
  first_organic_visit: isoAgo(60 + i * 10),
  first_attendance: isoAgo(45 + i * 10),
  days_to_attend: 15 + i * 2,
}));

/* ── ai_briefings ── */
export const aiBriefings = [
  {
    id: 'demo-briefing-1',
    created_at: isoAgo(1),
    module: 'leads',
    summary: 'Lead volume is trending up 12% week-over-week. Phoenix qualified leads are at their highest in 90 days. CPQL decreased to $127, well below the $180 target. Three new $1M+ revenue leads entered the funnel this week.',
    recommendations: ['Increase Phoenix Forum ad spend by 15%', 'Follow up with 3 warm leads from Tuesday call', 'Review lead scoring threshold for Q2'],
  },
  {
    id: 'demo-briefing-2',
    created_at: isoAgo(1),
    module: 'attendance',
    summary: 'Thursday attendance averaged 14 attendees per session, up from 11 last month. Tuesday retention rate improved to 68%. Two new regular attendees joined from organic search.',
    recommendations: ['Consider splitting Thursday group if attendance exceeds 18', 'Send personal check-in to 4 lapsed Tuesday attendees'],
  },
  {
    id: 'demo-briefing-3',
    created_at: isoAgo(1),
    module: 'donations',
    summary: 'Monthly recurring revenue reached $2,450, a new high. 3 one-time donors converted to recurring. Year-end campaign generated $4,200 in December.',
    recommendations: ['Launch upgrade campaign for $25/mo donors', 'Send impact report to top 10 donors'],
  },
];

/* ── kpi_metrics (cached snapshots) ── */
export const kpiMetrics = [
  { metric_key: 'free_qualified_leads', value: 8, period: 'week', recorded_at: isoAgo(0) },
  { metric_key: 'phoenix_qualified_leads', value: 3, period: 'week', recorded_at: isoAgo(0) },
  { metric_key: 'cpql', value: 127, period: 'week', recorded_at: isoAgo(0) },
  { metric_key: 'total_attendance_tue', value: 42, period: 'week', recorded_at: isoAgo(0) },
  { metric_key: 'total_attendance_thu', value: 56, period: 'week', recorded_at: isoAgo(0) },
  { metric_key: 'donations_amount', value: 3250, period: 'month', recorded_at: isoAgo(0) },
];

/* ── recovery_events ── */
export const recoveryEvents = [];
for (let w = 0; w < 26; w++) {
  const tuDate = daysAgo(w * 7 + 1);
  const thDate = daysAgo(w * 7 + 3);
  recoveryEvents.push({
    event_id: `evt-tue-${w}`,
    event_date: tuDate,
    event_day: 'Tuesday',
    event_type: 'group_call',
    title: 'Sober Founders Tuesday Call',
    attendee_count: 8 + Math.floor(Math.random() * 8),
  });
  recoveryEvents.push({
    event_id: `evt-thu-${w}`,
    event_date: thDate,
    event_day: 'Thursday',
    event_type: 'group_call',
    title: 'Sober Founders Thursday Open Call',
    attendee_count: 10 + Math.floor(Math.random() * 10),
  });
}

/* ── Table name → data lookup ── */
const TABLE_DATA = {
  raw_hubspot_contacts: hubspotContacts,
  raw_fb_ads_insights_daily: fbAdsInsights,
  raw_hubspot_meeting_activities: hubspotMeetingActivities,
  hubspot_activity_contact_associations: hubspotActivityAssociations,
  donation_transactions_unified: donationTransactions,
  raw_zeffy_supporter_profiles: zeffySupporterProfiles,
  vw_donor_health: donorHealth,
  notion_todos: notionTodos,
  mailchimp_campaigns: mailchimpCampaigns,
  attendee_aliases: attendeeAliases,
  raw_luma_registrations: lumaRegistrations,
  vw_outreach_conversions: outreachConversions,
  vw_baseline_retention: baselineRetention,
  vw_experiment_results: experimentResults,
  vw_seo_opportunity_pages: seoOpportunityPages,
  vw_seo_ranking_drops: seoRankingDrops,
  vw_seo_organic_zoom_attendees: seoOrganicZoomAttendees,
  ai_briefings: aiBriefings,
  kpi_metrics: kpiMetrics,
  recovery_events: recoveryEvents,
  // Tables that exist but return empty in demo (write-only / admin)
  zoom_identities: [],
  zoom_attendance: [],
  zoom_pending_review: [],
  zoom_merge_log: [],
  zoom_notetaker_blocklist: [],
  donation_attendee_overrides: [],
};

export default TABLE_DATA;
