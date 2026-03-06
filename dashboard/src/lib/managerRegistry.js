export const MANAGER_REGISTRY = [
  {
    key: 'leads',
    name: 'Leads',
    owner: 'Growth Manager',
    cadence: 'daily',
    description: 'Lead volume, quality, and paid acquisition efficiency.',
    sync: { functionName: 'master-sync', method: 'GET', queryString: { trigger_refresh: 'true' } },
  },
  {
    key: 'attendance',
    name: 'Attendance',
    owner: 'Community Manager',
    cadence: 'daily',
    description: 'Group session participation, repeat behavior, and follow-up health.',
    sync: { functionName: 'sync_attendance_from_hubspot', method: 'POST', body: { include_calls: true, include_meetings: true } },
  },
  {
    key: 'email',
    name: 'Email Marketing',
    owner: 'Lifecycle Manager',
    cadence: 'weekly',
    description: 'Campaign engagement, deliverability, and list health.',
    sync: { functionName: 'sync_mailchimp', method: 'POST' },
  },
  {
    key: 'seo',
    name: 'SEO',
    owner: 'SEO Manager',
    cadence: 'weekly',
    description: 'Organic discovery, search demand capture, and conversion-path readiness.',
    sync: { functionName: 'master-sync', method: 'GET', queryString: { trigger_refresh: 'true' } },
  },
  {
    key: 'donations',
    name: 'Donations',
    owner: 'Fundraising Manager',
    cadence: 'weekly',
    description: 'Donation volume, recurring momentum, donor mix, and campaign performance.',
    sync: { functionName: 'ingest_zeffy_donations', method: 'POST', body: {} },
  },
  {
    key: 'operations',
    name: 'Operations (Big Picture)',
    owner: 'Operations Manager',
    cadence: 'weekly',
    description: 'Cross-functional bottlenecks, execution velocity, and data freshness.',
    sync: null,
  },
];

export const MANAGER_KEYS = MANAGER_REGISTRY.map((manager) => manager.key);

export function getManagerDefinition(managerKey) {
  return MANAGER_REGISTRY.find((manager) => manager.key === managerKey) || null;
}
