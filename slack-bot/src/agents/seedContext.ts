/**
 * Seeds initial agent_context entries for all personas.
 * Safe to re-run (uses upsert).
 *
 * Usage: npx tsx src/agents/seedContext.ts
 */

import { upsertContext } from "./proposalStore.js";
import { logger } from "../observability/logger.js";

const SEEDS = [
  {
    persona: "growth_agent",
    type: "initiative",
    key: "google_ad_grants",
    value: { status: "application_in_progress", monthly_value: 10000, currency: "USD" },
    summary: "Google Ad Grants application in progress - $10k/mo free search ads for nonprofits. Major strategic priority for lead generation.",
  },
  {
    persona: "growth_agent",
    type: "initiative",
    key: "grant_writer",
    value: { status: "active", focus: "funding_applications" },
    summary: "Grant writer actively working on funding applications. Coordinate growth proposals around grant timelines.",
  },
  {
    persona: "marketing_manager",
    type: "strategy",
    key: "priority_order",
    value: { priorities: ["phoenix_forum_growth", "donations_grants_revenue", "operational_efficiency"] },
    summary: "Priority order: (1) Phoenix Forum membership growth, (2) donations/grants/revenue, (3) operational efficiency.",
  },
  {
    persona: "marketing_manager",
    type: "initiative",
    key: "phoenix_forum_growth",
    value: { status: "top_priority", membership_type: "paid_groups" },
    summary: "Phoenix Forum membership growth is the #1 priority. Tracked via HubSpot membership_s = 'Paid Groups'.",
  },
  {
    persona: "content_agent",
    type: "strategy",
    key: "content_tone",
    value: { tone: "peer-to-peer", avoid: ["clinical", "preachy", "em_dashes"] },
    summary: "Content tone: peer-to-peer, founder-to-founder. NOT clinical, NOT preachy. Never use em dashes - use regular hyphens.",
  },
  {
    persona: "content_agent",
    type: "strategy",
    key: "seo_keywords",
    value: { primary: ["sober entrepreneur", "sober founder", "recovery entrepreneur", "sober business owner"] },
    summary: "SEO keyword targets: sober entrepreneur, sober founder, recovery entrepreneur, sober business owner. All content should support organic search.",
  },
  {
    persona: "strategy_agent",
    type: "observation",
    key: "email_delivery_path",
    value: { smtp: "mailchimp", not: "hubspot_engagements" },
    summary: "Email delivery goes through Mailchimp, NOT HubSpot engagements. HubSpot engagement emails are read-only and don't actually deliver.",
  },
  {
    persona: "strategy_agent",
    type: "observation",
    key: "luma_welcome_emails",
    value: { provider: "luma", status: "already_handled" },
    summary: "Luma already sends welcome/confirmation emails for events. Don't rebuild this - it's handled.",
  },
  {
    persona: "growth_agent",
    type: "observation",
    key: "registered_not_attended",
    value: { status: "approved_for_action", insight: "qualified leads who register but do not attend are a high-value recovery target" },
    summary: "Qualified leads who registered for events but did not attend represent a high-conversion follow-up opportunity. Build an automated follow-up email sequence for this segment.",
  },
  {
    persona: "growth_agent",
    type: "initiative",
    key: "meta_ads_primary_channel",
    value: { channel: "meta_ads", status: "active", funnel: "meta -> luma -> free_group -> phoenix" },
    summary: "Meta Ads is the primary lead gen channel. Most leads convert in first 1-2 sessions or never. Speed to contact is critical.",
  },
  {
    persona: "growth_agent",
    type: "initiative",
    key: "phoenix_forum_onboarding",
    value: { price: 250, onboarding_fee: 699, funnel: "application -> interview -> payment -> nda -> verification -> meet_greet -> recurring_meetings" },
    summary: "Phoenix Forum: $250/mo membership, $699 onboarding. Full pipeline: application, interview, payment + NDA + revenue verification, meet & greet, then recurring Zoom meetings + WhatsApp group.",
  },
  {
    persona: "content_agent",
    type: "initiative",
    key: "wordpress_drafts_pending",
    value: { status: "action_needed", site: "soberfounders.org" },
    summary: "WordPress has blog drafts that need to be moved to scheduled. WP Mail SMTP is also broken.",
  },
  {
    persona: "strategy_agent",
    type: "observation",
    key: "conversion_funnel_stages",
    value: { stages: ["luma_signup", "first_attendance", "repeat_attendance", "phoenix_interview", "paid_member"] },
    summary: "Key conversion stages to measure: Luma signup -> actual attendance -> repeat attendance -> Phoenix interview -> paid member. Most convert in 1-2 sessions or never.",
  },
];

const seed = async () => {
  let count = 0;
  for (const s of SEEDS) {
    await upsertContext(s.persona, s.type, s.key, s.value, s.summary);
    count++;
    logger.info({ persona: s.persona, key: s.key }, "Seeded context");
  }
  logger.info({ count }, "Context seeding complete");
};

seed().catch((err) => {
  logger.error({ err }, "Context seeding failed");
  process.exit(1);
});
