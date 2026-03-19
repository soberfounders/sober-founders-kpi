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
    value: {
      top_of_funnel: [
        { keyword: "high functioning alcoholic", volume: "30-50K/mo", competition: "Medium" },
        { keyword: "functioning alcoholic signs", volume: "5-10K/mo", competition: "Medium" },
        { keyword: "successful alcoholics", volume: "1-3K/mo", competition: "Low" },
        { keyword: "life after quitting alcohol", volume: "3-6K/mo", competition: "Low" },
        { keyword: "sobriety success stories", volume: "2-4K/mo", competition: "Low" },
        { keyword: "workaholism and addiction", volume: "500-1K/mo", competition: "Low" },
      ],
      mid_funnel: [
        { keyword: "addiction and entrepreneurship", volume: "200-500/mo", competition: "None" },
        { keyword: "CEOs and addiction", volume: "500-1.5K/mo", competition: "None" },
        { keyword: "entrepreneurs and addiction", volume: "500-1K/mo", competition: "None" },
        { keyword: "networking without alcohol", volume: "500-1.5K/mo", competition: "Low" },
        { keyword: "sober networking", volume: "200-500/mo", competition: "None" },
        { keyword: "drinking culture at work", volume: "500-1.5K/mo", competition: "Low" },
      ],
      bottom_funnel: [
        { keyword: "sober entrepreneur", volume: "50-200/mo", competition: "None" },
        { keyword: "entrepreneurs in recovery", volume: "100-300/mo", competition: "None" },
        { keyword: "sober business networking", volume: "50-200/mo", competition: "None" },
        { keyword: "peer group for founders in recovery", volume: "50-200/mo", competition: "None" },
        { keyword: "sober CEO", volume: "30-100/mo", competition: "None" },
        { keyword: "sobriety and leadership", volume: "50-200/mo", competition: "None" },
      ],
      brand: ["sober founders", "sober founders mastermind", "phoenix forum sober founders"],
    },
    summary: "Full keyword strategy across 3 funnel stages. Top-of-funnel gateway keywords (30-50K/mo) drive volume, mid-funnel (500-5K/mo) own the recovery+business category, bottom-funnel (50-500/mo) convert to signups. The recovery+business niche is completely uncontested.",
  },
  {
    persona: "content_agent",
    type: "strategy",
    key: "content_priority_queue",
    value: {
      tier1_gateway: [
        "High-Functioning Alcoholic: The Entrepreneur's Hidden Struggle",
        "Life After Quitting Alcohol: How Sobriety Changed These Entrepreneurs' Businesses",
        "Why Entrepreneurs Struggle with Addiction",
      ],
      tier2_category: [
        "Rewrite: Entrepreneurs in Recovery (post 3147)",
        "Sober CEO: Running a Company in Recovery",
        "Best Mastermind Group for Founders in Recovery",
        "How to Network Without Alcohol as a Business Owner",
      ],
      tier3_comparison_seo_only: [
        "Refresh YPO/EO/Tiger 21 comparison posts",
        "Phoenix Forum vs YPO vs EO vs Vistage comparison",
        "Entrepreneur mastermind group comparison (new)",
        "Free entrepreneur mastermind group (new)",
      ],
      seasonal: ["Dry January (plan by mid-Dec)", "Alcohol Awareness Month - April", "Sober October (plan by mid-Sep)"],
    },
    summary: "Content priority queue: Tier 1 gateway articles targeting 30-50K/mo keywords, Tier 2 category ownership, Tier 3 competitor comparison (SEO only, not Ad Grant). Seasonal content for Dry January, April awareness, Sober October.",
  },
  {
    persona: "growth_agent",
    type: "strategy",
    key: "google_ad_grant_keywords",
    value: {
      approved_keywords: [
        "entrepreneurs in recovery",
        "sober entrepreneur community",
        "addiction and entrepreneurship",
        "business owner recovery support",
        "peer group for sober professionals",
        "sober business networking",
        "accountability group recovery",
        "sobriety and leadership",
        "building a business in recovery",
        "sober founder network",
        "entrepreneur alcohol problem",
        "sober business owner support",
      ],
      prohibited: ["competitor brand names (Vistage, YPO, EO, Tiger 21)", "generic terms without recovery angle", "treatment keywords (rehab, detox)", "sober curious"],
    },
    summary: "Google Ad Grant approved keyword list (12 keywords). All mission-aligned and policy-compliant. Competitor brand names, treatment keywords, and generic terms are prohibited.",
  },
  {
    persona: "strategy_agent",
    type: "strategy",
    key: "keyword_performance_tracking",
    value: {
      gateway_cluster: ["high functioning alcoholic", "functioning alcoholic signs", "life after quitting alcohol"],
      category_cluster: ["CEOs and addiction", "entrepreneurs and addiction", "networking without alcohol"],
      conversion_cluster: ["sober entrepreneur", "entrepreneurs in recovery", "peer group for founders in recovery"],
      seasonal_spikes: ["Dry January (5-10x traffic)", "Sober October (5-10x traffic)"],
      key_insight: "No competitor addresses recovery. Every recovery+business keyword is uncontested.",
    },
    summary: "Keyword clusters for strategy tracking: gateway (30-50K/mo volume), category (500-5K/mo), conversion (50-500/mo highest intent). Seasonal spikes in Jan and Oct. Recovery+business niche is completely uncontested.",
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
