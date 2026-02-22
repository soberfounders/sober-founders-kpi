function normalizeNameKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]s\s*(iphone|ipad|android|galaxy|phone|pc|macbook|desktop|laptop)$/gi, '')
    .replace(/\((iphone|ipad|android|galaxy|phone)\)$/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RAW_OVERRIDES = [
  {
    attendeeName: 'Ryan Rittendale',
    hubspotContactId: 97164486995,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/record/0-1/97164486995',
    sourceBucket: 'Referral',
    originalTrafficSource: 'REFERRALS',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'HubSpot contact found by name in UI; raw_hubspot_contacts missing/incomplete for this attendee.',
  },
  {
    attendeeName: 'Josh Cougler',
    hubspotContactId: 160260603777,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/record/0-1/160260603777',
    sourceBucket: 'Referral',
    originalTrafficSource: 'REFERRALS',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'HubSpot contact found by name in UI; raw_hubspot_contacts missing/incomplete for this attendee.',
  },
  {
    attendeeName: 'Emily Torraca',
    hubspotContactId: 118501475900,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/record/0-1/118501475900',
    sourceBucket: 'Referral',
    originalTrafficSource: 'REFERRALS',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'HubSpot contact found by name in UI; raw_hubspot_contacts missing/incomplete for this attendee.',
  },
  {
    attendeeName: 'Adam Costilo',
    hubspotContactId: 160436657408,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/contact/160436657408',
    sourceBucket: 'Referral',
    originalTrafficSource: 'REFERRALS',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'HubSpot contact found by name in UI; raw_hubspot_contacts missing/incomplete for this attendee.',
  },
  {
    attendeeName: 'Allen Goddard',
    canonicalHubspotName: 'Allen Godard',
    sourceBucket: 'Paid Social (Meta)',
    originalTrafficSource: 'PAID_SOCIAL',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'Spelling mismatch in Zoom vs HubSpot name (Goddard vs Godard).',
  },
  {
    attendeeName: 'Matthew S',
    canonicalHubspotName: 'Matthew Shiebler',
    hubspotContactId: 97523886942,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/contact/97523886942',
    sourceBucket: 'Social (Organic)',
    originalTrafficSource: 'SOCIAL_MEDIA',
    originalTrafficSourceDetail1: 'LINKEDIN',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'Zoom display name abbreviated; HubSpot source is organic social (LinkedIn).',
  },
  {
    attendeeName: 'Kandace Arena',
    sourceBucket: 'Referral',
    originalTrafficSource: 'REFERRALS',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'User confirmed referral source in HubSpot.',
  },
  {
    attendeeName: 'Andrew Lassise',
    sourceBucket: 'Referral',
    originalTrafficSource: 'REFERRALS',
    sourceAttributionMethod: 'Manual Business Override (user provided)',
    note: 'Treat as referral for member-analysis interpretation.',
  },
  {
    attendeeName: 'Tim Stivers',
    sourceBucket: 'Referral',
    originalTrafficSource: 'REFERRALS',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'HubSpot OFFLINE in raw table is a Lu.ma/Zap create artifact; user confirms referral.',
  },
  {
    attendeeName: 'Mark Howley',
    canonicalHubspotName: 'Mark V Howley',
    hubspotContactId: 185151246153,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/record/0-1/185151246153',
    sourceBucket: 'Paid Social (Meta)',
    originalTrafficSource: 'PAID_SOCIAL',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'Zoom display name omits middle initial; HubSpot display name is Mark V Howley.',
  },
  {
    attendeeName: 'Robert D',
    canonicalHubspotName: 'Robert Davidman',
    hubspotContactId: 167406672929,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/record/0-1/167406672929',
    sourceBucket: 'Paid Social (Meta)',
    originalTrafficSource: 'PAID_SOCIAL',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'Zoom display name abbreviated; HubSpot contact is Robert Davidman.',
  },
  {
    attendeeName: 'SML',
    canonicalHubspotName: 'Samantha Lander',
    hubspotContactId: 97523885102,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/record/0-1/97523885102',
    sourceBucket: 'Paid Social (Meta)',
    originalTrafficSource: 'PAID_SOCIAL',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'Zoom display name initials (SML); HubSpot contact is Samantha Lander.',
  },
  {
    attendeeName: 'Bert W',
    hubspotContactId: 204396027740,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/record/0-1/204396027740',
    sourceBucket: 'Unknown',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'No confirmed acquisition attribution in HubSpot; only use Lu.ma if clear signal exists.',
  },
  {
    attendeeName: 'Laney Silverman',
    hubspotContactId: 182003544728,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/record/0-1/182003544728',
    sourceBucket: 'Referral',
    originalTrafficSource: 'REFERRALS',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'User confirmed referral source; raw OFFLINE is Zap/Lu.ma create artifact.',
  },
  {
    attendeeName: 'Micheal Grow',
    canonicalHubspotName: 'Michael Grow',
    hubspotContactId: 189296604252,
    hubspotUrl: 'https://app.hubspot.com/contacts/45070276/record/0-1/189296604252',
    sourceBucket: 'Unknown',
    sourceAttributionMethod: 'Manual HubSpot UI Override (user provided)',
    note: 'No confirmed attribution in HubSpot unless Lu.ma contains a clear source answer.',
  },
];

const ZOOM_ATTRIBUTION_OVERRIDES_BY_KEY = new Map(
  RAW_OVERRIDES.map((row) => [normalizeNameKey(row.attendeeName), { ...row, attendeeKey: normalizeNameKey(row.attendeeName) }]),
);

export function getZoomAttributionOverride(attendeeNameOrKey) {
  const key = normalizeNameKey(attendeeNameOrKey);
  return key ? (ZOOM_ATTRIBUTION_OVERRIDES_BY_KEY.get(key) || null) : null;
}

export function applyZoomAttributionOverride(baseRow, override) {
  if (!override) return baseRow;

  const sourceBucket = override.sourceBucket || baseRow.sourceBucket;
  const sourceAttributionMethod = override.sourceAttributionMethod || baseRow.sourceAttributionMethod;
  const hubspotName = override.canonicalHubspotName || baseRow.hubspotName;
  const originalTrafficSource = override.originalTrafficSource || baseRow.originalTrafficSource;
  const originalTrafficSourceDetail1 = override.originalTrafficSourceDetail1 || baseRow.originalTrafficSourceDetail1;
  const originalTrafficSourceDetail2 = override.originalTrafficSourceDetail2 || baseRow.originalTrafficSourceDetail2;

  const mergedMissingReason = [
    baseRow.missingAttributionReason || baseRow.missingReason || '',
    override.note || '',
  ].filter(Boolean).join(' | ');

  return {
    ...baseRow,
    hubspotName,
    sourceBucket,
    sourceAttributionMethod,
    originalTrafficSource,
    originalTrafficSourceDetail1,
    originalTrafficSourceDetail2,
    sourceFamily: String(sourceBucket || '').startsWith('Paid Social') ? 'Paid' : 'Non-Paid',
    isMetaPaid: sourceBucket === 'Paid Social (Meta)',
    manualAttributionOverride: 'Yes',
    manualAttributionNote: override.note || 'Manual override',
    manualHubspotContactId: override.hubspotContactId || null,
    manualHubspotUrl: override.hubspotUrl || '',
    missingAttributionReason: mergedMissingReason || (baseRow.missingAttributionReason || baseRow.missingReason || ''),
  };
}

export function listZoomAttributionOverrides() {
  return RAW_OVERRIDES.slice();
}
