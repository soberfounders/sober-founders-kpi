---
name: email-sequence
description: When the user wants to create or optimize an email sequence, drip campaign, automated email flow, or lifecycle email program. Also use when the user mentions "email sequence," "drip campaign," "nurture sequence," "onboarding emails," "welcome sequence," "re-engagement emails," "email automation," "lifecycle emails," "trigger-based emails," "email funnel," "email workflow," "what emails should I send," "welcome series," or "email cadence." Use this for any multi-email automated flow. For cold outreach emails, see cold-email. For in-app onboarding, see onboarding-cro.
metadata:
  version: 1.1.0
---

# Email Sequence Design

You are an expert in email marketing and automation. Your goal is to create email sequences that nurture relationships, drive action, and move people toward conversion.

## Initial Assessment

**REQUIRED: Load ICP and product marketing context first.**
Read `.agents/product-marketing-context.md` before creating any email sequence. This file contains the Ideal Customer Profile (ICP), brand voice, pain points, objections, customer language, CTA patterns, and content pillars. **All email copy must be written for the ICP defined in that document.** Use the ICP's pain points, tone preferences, and language rules to shape every subject line, body, and CTA. If the file doesn't exist, tell the user to run the `product-marketing-context` skill first.

Before creating a sequence, understand:

1. **Sequence Type**
   - Welcome/onboarding sequence
   - Lead nurture sequence
   - Re-engagement sequence
   - Post-purchase sequence
   - Event-based sequence
   - Educational sequence
   - Sales sequence

2. **Audience Context**
   - Who are they?
   - What triggered them into this sequence?
   - What do they already know/believe?
   - What's their current relationship with you?

3. **Goals**
   - Primary conversion goal
   - Relationship-building goals
   - Segmentation goals
   - What defines success?

---

## Core Principles

### 1. One Email, One Job
- Each email has one primary purpose
- One main CTA per email
- Don't try to do everything

### 2. Value Before Ask
- Lead with usefulness
- Build trust through content
- Earn the right to sell

### 3. Relevance Over Volume
- Fewer, better emails win
- Segment for relevance
- Quality > frequency

### 4. Clear Path Forward
- Every email moves them somewhere
- Links should do something useful
- Make next steps obvious

---

## 2026 Orchestrated Sequence Strategy

### The "High-Placement" Mandate
*Majority agreement (>90% of authorities including Allegrow, Litmus, and Snov.io).*

- **The "Value Drop" Rule:** Kill the "Just bumping this" follow-up. Every touchpoint must provide a "Value Drop" - a new insight, a loom video, or a proprietary code snippet. Low-value "pings" now trigger aggressive AI spam filters.
- **Reply Rate as the North Star:** Open rates are now "vanity metrics" due to Apple/Google privacy pre-loading. Optimize for **Reply Rate** and **Sentiment Analysis** to gauge sequence health.
- **Syntax Variation (Spintax):** Do not send the same 100-word block to 1,000 people. Use AI to rotate phrases (e.g., "I noticed you're hiring" vs. "I saw your team is growing"). This prevents "fingerprinting" by mailbox providers.
- **The 30/30/50 Rule:** Allocate 30% of effort to audience research, 30% to content crafting, and 50% to persistent, value-added follow-ups (typically 4–7 touches).

### 2026 Sequence Framework
*Synthesized from Outreach.io and Mailshake's 2026 SaaS Benchmarks.*

| Touchpoint | Type | Goal | The "Secret Sauce" |
| :--- | :--- | :--- | :--- |
| **Email 1** | Problem-Aware | Establish Authority | Lead with a "Trigger Event" (e.g., recent funding or tech stack change). |
| **Email 2** | Value Addition | Education | A link to a "Zero-Click" resource (content they don't have to leave the inbox to read). |
| **Email 3** | Social Proof | Trust Building | A "3-Bullet Case Study": The Problem, The Fix, The Result. |
| **Email 4** | Pattern Interrupt | Human Connection | A personal "Founder POV" note or a short video clip. |
| **Email 5** | Soft Breakup | Closure | A "low-friction" question: "Are you still the right person for this, or should I pause?" |

### 2026 Strategic Trade-offs

| Conflict Topic | Opinion A (The Minimalists) | Opinion B (The Storytellers) | Resolved Stance |
| :--- | :--- | :--- | :--- |
| **Visuals vs. Text** | Plain text only for deliverability (Allegrow). | Micro-animations and images boost engagement (Dotdigital). | **Strategy:** Plain text for *Cold Outbound*; Rich Media for *Inbound Nurture*. |
| **Sequence Length** | Short (3-5 emails) to protect domain reputation. | Long (8-12 emails) because most sales happen after touch 7. | **Resolution:** Use "Continuous Verification." Only extend the sequence if the data remains valid. |
| **AI Personalization** | Fully automate personalization via LLMs. | Users are developing "AI fatigue"; keep it manual and raw. | **Stance:** Use AI for *researching* the prospect, but write the *hook* with a human voice. |

### 2026 Execution Pillars
1. **Continuous Verification:** Most lists decay by 2-3% monthly. Validate the email address *before every single step* of the sequence, not just the first one.
2. **Mobile-First Layout:** 70% of 2026 emails are read on mobile. Use 22pt headlines, 14pt body text, and single-column layouts.
3. **The "Wiki-Voice" Signature:** Keep your signature professional and link-light. Excessive links in the signature are a top reason for 2026 spam filtering.

---

## Email Sequence Strategy

### Sequence Length
- Welcome: 3-7 emails
- Lead nurture: 5-10 emails
- Onboarding: 5-10 emails
- Re-engagement: 3-5 emails

Depends on:
- Sales cycle length
- Product complexity
- Relationship stage

### Timing/Delays
- Welcome email: Immediately
- Early sequence: 1-2 days apart
- Nurture: 2-4 days apart
- Long-term: Weekly or bi-weekly

Consider:
- B2B: Avoid weekends
- B2C: Test weekends
- Time zones: Send at local time

### Subject Line Strategy
- Clear > Clever
- Specific > Vague
- Benefit or curiosity-driven
- 40-60 characters ideal
- Test emoji (they're polarizing)

**Patterns that work:**
- Question: "Still struggling with X?"
- How-to: "How to [achieve outcome] in [timeframe]"
- Number: "3 ways to [benefit]"
- Direct: "[First name], your [thing] is ready"
- Story tease: "The mistake I made with [topic]"

### Preview Text
- Extends the subject line
- ~90-140 characters
- Don't repeat subject line
- Complete the thought or add intrigue

---

## Sequence Types Overview

### Welcome Sequence (Post-Signup)
**Length**: 5-7 emails over 12-14 days
**Goal**: Activate, build trust, convert

Key emails:
1. Welcome + deliver promised value (immediate)
2. Quick win (day 1-2)
3. Story/Why (day 3-4)
4. Social proof (day 5-6)
5. Overcome objection (day 7-8)
6. Core feature highlight (day 9-11)
7. Conversion (day 12-14)

### Lead Nurture Sequence (Pre-Sale)
**Length**: 6-8 emails over 2-3 weeks
**Goal**: Build trust, demonstrate expertise, convert

Key emails:
1. Deliver lead magnet + intro (immediate)
2. Expand on topic (day 2-3)
3. Problem deep-dive (day 4-5)
4. Solution framework (day 6-8)
5. Case study (day 9-11)
6. Differentiation (day 12-14)
7. Objection handler (day 15-18)
8. Direct offer (day 19-21)

### Re-Engagement Sequence
**Length**: 3-4 emails over 2 weeks
**Trigger**: 30-60 days of inactivity
**Goal**: Win back or clean list

Key emails:
1. Check-in (genuine concern)
2. Value reminder (what's new)
3. Incentive (special offer)
4. Last chance (stay or unsubscribe)

### Onboarding Sequence (Product Users)
**Length**: 5-7 emails over 14 days
**Goal**: Activate, drive to aha moment, upgrade
**Note**: Coordinate with in-app onboarding - email supports, doesn't duplicate

Key emails:
1. Welcome + first step (immediate)
2. Getting started help (day 1)
3. Feature highlight (day 2-3)
4. Success story (day 4-5)
5. Check-in (day 7)
6. Advanced tip (day 10-12)
7. Upgrade/expand (day 14+)

**For detailed templates**: See [references/sequence-templates.md](references/sequence-templates.md)

---

## Email Types by Category

### Onboarding Emails
- New users series
- New customers series
- Key onboarding step reminders
- New user invites

### Retention Emails
- Upgrade to paid
- Upgrade to higher plan
- Ask for review
- Proactive support offers
- Product usage reports
- NPS survey
- Referral program

### Billing Emails
- Switch to annual
- Failed payment recovery
- Cancellation survey
- Upcoming renewal reminders

### Usage Emails
- Daily/weekly/monthly summaries
- Key event notifications
- Milestone celebrations

### Win-Back Emails
- Expired trials
- Cancelled customers

### Campaign Emails
- Monthly roundup / newsletter
- Seasonal promotions
- Product updates
- Industry news roundup
- Pricing updates

**For detailed email type reference**: See [references/email-types.md](references/email-types.md)

---

## Email Copy Guidelines

### Structure
1. **Hook**: First line grabs attention
2. **Context**: Why this matters to them
3. **Value**: The useful content
4. **CTA**: What to do next
5. **Sign-off**: Human, warm close

### Formatting
- Short paragraphs (1-3 sentences)
- White space between sections
- Bullet points for scanability
- Bold for emphasis (sparingly)
- Mobile-first (most read on phone)

### Tone
- Conversational, not formal
- First-person (I/we) and second-person (you)
- Active voice
- Read it out loud - does it sound human?

### Length
- 50-125 words for transactional
- 150-300 words for educational
- 300-500 words for story-driven

### CTA Guidelines
- Buttons for primary actions
- Links for secondary actions
- One clear primary CTA per email
- Button text: Action + outcome

**For detailed copy, personalization, and testing guidelines**: See [references/copy-guidelines.md](references/copy-guidelines.md)

---

## Output Format

### Sequence Overview
```
Sequence Name: [Name]
Trigger: [What starts the sequence]
Goal: [Primary conversion goal]
Length: [Number of emails]
Timing: [Delay between emails]
Exit Conditions: [When they leave the sequence]
```

### For Each Email
```
Email [#]: [Name/Purpose]
Send: [Timing]
Subject: [Subject line]
Preview: [Preview text]
Body: [Full copy]
CTA: [Button text] → [Link destination]
Segment/Conditions: [If applicable]
```

### Metrics Plan
What to measure and benchmarks

---

## Task-Specific Questions

1. What triggers entry to this sequence?
2. What's the primary goal/conversion action?
3. What do they already know about you?
4. What other emails are they receiving?
5. What's your current email performance?

---

## Tool Integrations

For implementation, see the [tools registry](../../tools/REGISTRY.md). Key email tools:

| Tool | Best For | MCP | Guide |
|------|----------|:---:|-------|
| **Customer.io** | Behavior-based automation | - | [customer-io.md](../../tools/integrations/customer-io.md) |
| **Mailchimp** | SMB email marketing | ✓ | [mailchimp.md](../../tools/integrations/mailchimp.md) |
| **Resend** | Developer-friendly transactional | ✓ | [resend.md](../../tools/integrations/resend.md) |
| **SendGrid** | Transactional email at scale | - | [sendgrid.md](../../tools/integrations/sendgrid.md) |
| **Kit** | Creator/newsletter focused | - | [kit.md](../../tools/integrations/kit.md) |

---

## Related Skills

- **lead-magnets**: For planning lead magnets that feed into nurture sequences
- **churn-prevention**: For cancel flows, save offers, and dunning strategy (email supports this)
- **onboarding-cro**: For in-app onboarding (email supports this)
- **copywriting**: For landing pages emails link to
- **ab-test-setup**: For testing email elements
- **popup-cro**: For email capture popups
- **revops**: For lifecycle stages that trigger email sequences
