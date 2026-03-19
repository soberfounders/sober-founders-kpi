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
