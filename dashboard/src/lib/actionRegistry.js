const ACTIONS = {
  leads: [
    {
      action_id: 'leads_reallocate_budget',
      title: 'Reallocate budget to top-performing segments',
      description: 'Shift spend toward campaigns and audiences producing lower CPQL and higher qualified-lead rates.',
      expected_impact: 'Improve qualified lead output while reducing wasted spend.',
      risk: 'med',
      function_payload_template: { mode: 'optimize_budget', lookback_days: 30, budget_shift_limit_pct: 20 },
    },
    {
      action_id: 'leads_pause_bad_campaigns',
      title: 'Pause underperforming campaigns',
      description: 'Pause campaigns with weak conversion quality, high CPL, and persistent negative trend signals.',
      expected_impact: 'Reduce wasted paid media budget quickly.',
      risk: 'low',
      function_payload_template: { mode: 'pause_underperformers', min_spend_usd: 250, lookback_days: 14 },
    },
    {
      action_id: 'leads_generate_new_creatives',
      title: 'Generate replacement ad creatives',
      description: 'Draft new creative concepts for fatigued campaigns based on high-performing lead quality signals.',
      expected_impact: 'Recover lead volume and improve engagement quality.',
      risk: 'low',
      function_payload_template: { mode: 'generate_creatives', variants: 3, audience: 'founders_in_recovery' },
    },
  ],
  attendance: [
    {
      action_id: 'attendance_followup_inactive',
      title: 'Follow up inactive attendees',
      description: 'Generate personalized follow-up outreach for attendees who dropped off after recent sessions.',
      expected_impact: 'Lift reactivation and repeat attendance.',
      risk: 'low',
      function_payload_template: { mode: 'followup_inactive', inactivity_days: 14, batch_size: 50 },
    },
    {
      action_id: 'attendance_send_reminders',
      title: 'Send reminder sequence',
      description: 'Prepare and send reminder messaging to upcoming registrants and recently engaged members.',
      expected_impact: 'Increase show-up rate and reduce no-shows.',
      risk: 'low',
      function_payload_template: { mode: 'send_reminders', send_windows: ['24h', '2h'] },
    },
    {
      action_id: 'attendance_invite_high_engagement',
      title: 'Invite high-engagement members',
      description: 'Identify highly engaged attendees and generate targeted invitation copy for next-step programs.',
      expected_impact: 'Increase progression into higher-value offerings.',
      risk: 'med',
      function_payload_template: { mode: 'invite_high_engagement', min_sessions: 3, horizon_days: 30 },
    },
  ],
  email: [
    {
      action_id: 'email_generate_next_newsletter',
      title: 'Generate next newsletter draft',
      description: 'Create a ready-to-edit newsletter draft tailored to top-performing recent topics and CTAs.',
      expected_impact: 'Shorten production time and improve consistency.',
      risk: 'low',
      function_payload_template: { mode: 'draft_newsletter', include_subject_variants: 3 },
    },
    {
      action_id: 'email_launch_nurture_sequence',
      title: 'Launch nurture sequence proposal',
      description: 'Build a nurture sequence structure with suggested segmentation and cadence for recent subscribers.',
      expected_impact: 'Improve onboarding and retention through automated touchpoints.',
      risk: 'med',
      function_payload_template: { mode: 'launch_nurture', sequence_length: 4, segment_strategy: 'engagement_based' },
    },
    {
      action_id: 'email_list_hygiene_prune_inactive',
      title: 'Run list hygiene plan',
      description: 'Prepare an inactive-subscriber pruning and re-engagement plan to protect deliverability.',
      expected_impact: 'Improve inbox placement and campaign efficiency.',
      risk: 'med',
      function_payload_template: { mode: 'list_hygiene', inactivity_days: 90, include_reengagement: true },
    },
  ],
  seo: [
    {
      action_id: 'seo_generate_3_posts',
      title: 'Generate 3 SEO post drafts',
      description: 'Draft three high-intent articles based on current ranking opportunities and content gaps.',
      expected_impact: 'Expand organic footprint for priority query clusters.',
      risk: 'low',
      function_payload_template: { mode: 'generate_posts', count: 3, intent: 'high' },
    },
    {
      action_id: 'seo_optimize_meta_titles',
      title: 'Optimize meta titles/descriptions',
      description: 'Produce improved titles and descriptions for low-CTR pages with high impressions.',
      expected_impact: 'Increase click-through rate from search results.',
      risk: 'low',
      function_payload_template: { mode: 'optimize_meta', max_pages: 10 },
    },
    {
      action_id: 'seo_internal_linking_pass',
      title: 'Run internal linking pass',
      description: 'Recommend internal links from strong pages to strategic conversion and opportunity pages.',
      expected_impact: 'Improve discoverability and topical authority flow.',
      risk: 'low',
      function_payload_template: { mode: 'internal_linking', max_links: 20 },
    },
  ],
  donations: [
    {
      action_id: 'donations_donor_reengagement_campaign',
      title: 'Build donor re-engagement campaign',
      description: 'Generate re-engagement messaging and audience slices for lapsed or at-risk donors.',
      expected_impact: 'Increase returning donor count and revenue stability.',
      risk: 'med',
      function_payload_template: { mode: 'donor_reengagement', lookback_days: 120, segment_count: 3 },
    },
    {
      action_id: 'donations_personalized_outreach_drafts',
      title: 'Draft personalized outreach',
      description: 'Create personalized outreach drafts for top donor cohorts and campaign supporters.',
      expected_impact: 'Improve donor relationship quality and conversion to recurring giving.',
      risk: 'low',
      function_payload_template: { mode: 'personalized_outreach', recipients: 'top_donors' },
    },
    {
      action_id: 'donations_suggest_next_campaign',
      title: 'Suggest next fundraising campaign',
      description: 'Generate campaign theme, target segment, and offer framing based on recent donation behavior.',
      expected_impact: 'Increase campaign planning speed and expected conversion.',
      risk: 'med',
      function_payload_template: { mode: 'suggest_campaign', horizon_days: 30 },
    },
  ],
  operations: [
    {
      action_id: 'ops_find_biggest_bottleneck',
      title: 'Identify biggest bottleneck',
      description: 'Detect the cross-functional bottleneck with highest downstream impact on KPIs.',
      expected_impact: 'Focus leadership attention on highest-leverage constraint.',
      risk: 'low',
      function_payload_template: { mode: 'find_bottleneck', scope: 'cross_functional' },
    },
    {
      action_id: 'ops_generate_improvement_plan',
      title: 'Generate improvement plan',
      description: 'Produce a 2-week structured improvement plan with owners, milestones, and checkpoints.',
      expected_impact: 'Increase execution velocity and accountability.',
      risk: 'med',
      function_payload_template: { mode: 'improvement_plan', horizon_days: 14 },
    },
    {
      action_id: 'ops_weekly_exec_brief',
      title: 'Generate weekly exec brief',
      description: 'Compile a concise executive brief summarizing wins, risks, and required decisions.',
      expected_impact: 'Improve leadership alignment and decision cadence.',
      risk: 'low',
      function_payload_template: { mode: 'weekly_exec_brief', include_cross_manager_rollups: true },
    },
  ],
};

const TODOS = {
  leads: [
    {
      todo_id: 'leads_review_targeting',
      title: 'Review targeting and audience exclusions',
      description: 'Validate audience quality assumptions and exclusion logic against recent lead quality outcomes.',
      priority: 'P1',
      due_in_days: 2,
    },
    {
      todo_id: 'leads_check_lp_conversion',
      title: 'Check landing page conversion friction',
      description: 'Audit top paid landing pages for message match, load speed, and form completion drop-off.',
      priority: 'P1',
      due_in_days: 3,
    },
    {
      todo_id: 'leads_validate_lead_quality',
      title: 'Validate lead quality sample',
      description: 'Review the latest qualified/great lead sample with sales feedback for targeting accuracy.',
      priority: 'P0',
      due_in_days: 2,
    },
  ],
  attendance: [
    {
      todo_id: 'attendance_review_agenda',
      title: 'Review session agenda quality',
      description: 'Refine upcoming session structure to increase participation and repeat attendance.',
      priority: 'P1',
      due_in_days: 4,
    },
    {
      todo_id: 'attendance_assign_hosts',
      title: 'Assign hosts for upcoming sessions',
      description: 'Confirm hosts/facilitators and handoff notes for the next attendance cycle.',
      priority: 'P1',
      due_in_days: 3,
    },
    {
      todo_id: 'attendance_outreach_top_absentees',
      title: 'Outreach top recent absentees',
      description: 'Personally reach out to engaged members who recently stopped attending.',
      priority: 'P0',
      due_in_days: 2,
    },
  ],
  email: [
    {
      todo_id: 'email_confirm_content_calendar',
      title: 'Confirm content calendar',
      description: 'Finalize upcoming send topics, hooks, and CTA sequencing for the next cycle.',
      priority: 'P1',
      due_in_days: 3,
    },
    {
      todo_id: 'email_review_deliverability',
      title: 'Review deliverability baseline',
      description: 'Check unsubscribe/bounce trends and sender reputation signals before next send.',
      priority: 'P0',
      due_in_days: 2,
    },
    {
      todo_id: 'email_segment_strategy_review',
      title: 'Review segmentation strategy',
      description: 'Update segmentation logic using engagement tiers and recency behavior.',
      priority: 'P1',
      due_in_days: 5,
    },
  ],
  seo: [
    {
      todo_id: 'seo_pick_priority_pages',
      title: 'Pick priority pages for SEO sprint',
      description: 'Select the highest-impact pages for title/meta and on-page optimization this week.',
      priority: 'P0',
      due_in_days: 2,
    },
    {
      todo_id: 'seo_review_brand_voice',
      title: 'Review brand voice alignment',
      description: 'Ensure SEO content updates maintain brand voice and trust signals.',
      priority: 'P1',
      due_in_days: 4,
    },
    {
      todo_id: 'seo_check_technical_issues',
      title: 'Check technical SEO issues',
      description: 'Review crawl/indexation, broken links, and page performance regressions.',
      priority: 'P1',
      due_in_days: 3,
    },
  ],
  donations: [
    {
      todo_id: 'donations_call_top_donors',
      title: 'Call top donor cohort',
      description: 'Do high-touch follow-up with top donors and recurring prospects.',
      priority: 'P0',
      due_in_days: 2,
    },
    {
      todo_id: 'donations_review_giving_page',
      title: 'Review giving page conversion path',
      description: 'Audit giving page flow and trust signals for conversion friction.',
      priority: 'P1',
      due_in_days: 3,
    },
    {
      todo_id: 'donations_confirm_campaign_calendar',
      title: 'Confirm fundraising campaign calendar',
      description: 'Lock campaign dates, owners, and messaging milestones for the next period.',
      priority: 'P1',
      due_in_days: 5,
    },
  ],
  operations: [
    {
      todo_id: 'ops_assign_owner_to_bottleneck',
      title: 'Assign owner to top bottleneck',
      description: 'Name an accountable owner and KPI for the highest-impact bottleneck.',
      priority: 'P0',
      due_in_days: 1,
    },
    {
      todo_id: 'ops_schedule_ops_review_meeting',
      title: 'Schedule cross-functional ops review',
      description: 'Run a focused review meeting to align owners on bottleneck resolution steps.',
      priority: 'P1',
      due_in_days: 2,
    },
    {
      todo_id: 'ops_update_sops_or_documentation',
      title: 'Update SOPs and documentation',
      description: 'Document decisions and process updates from the latest operational changes.',
      priority: 'P1',
      due_in_days: 7,
    },
  ],
};

export const AUTONOMOUS_ACTION_REGISTRY = ACTIONS;
export const HUMAN_TODO_REGISTRY = TODOS;

export function getAutonomousActionsForManager(managerKey) {
  return [...(ACTIONS[managerKey] || [])];
}

export function getHumanTodosForManager(managerKey) {
  return [...(TODOS[managerKey] || [])];
}
