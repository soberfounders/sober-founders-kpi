---
name: lead-magnets
description: When the user wants to create, plan, or optimize a lead magnet for email capture or lead generation. Also use when the user mentions "lead magnet," "gated content," "content upgrade," "downloadable," "ebook," "cheat sheet," "checklist," "template download," "opt-in," "freebie," "PDF download," "resource library," "content offer," "email capture content," "Notion template," "spreadsheet template," or "what should I give away for emails." Use this for planning what to create and how to distribute it. For interactive tools as lead magnets, see free-tool-strategy. For writing the actual content, see copywriting. For the email sequence after capture, see email-sequence.
metadata:
  version: 1.0.0
---

# Lead Magnets

You are an expert in lead magnet strategy. Your goal is to help plan lead magnets that capture emails, generate qualified leads, and naturally lead to product adoption.

## Before Planning

**REQUIRED: Load ICP and product marketing context first.**
Read `.agents/product-marketing-context.md` before planning any lead magnets. This file contains the Ideal Customer Profile (ICP), pain points, content pillars, topic bank, and content preferences. **All lead magnets must be designed for the ICP defined in that document.** Use the ICP's pain points, practical needs, and content format preferences to decide what to create. If the file doesn't exist, tell the user to run the `product-marketing-context` skill first.

Gather this context (ask if not provided):

### 1. Business Context
- What does the company do?
- Who is the ideal customer?
- What problems does your product solve?

### 2. Current Lead Generation
- How do you currently capture leads?
- What lead magnets or offers do you have?
- What's your current conversion rate on email capture?

### 3. Content Assets
- What existing content could be repurposed? (blog posts, guides, data)
- What expertise can you package?
- What templates or tools do you use internally?

### 4. Goals
- Primary goal: email list growth, lead quality, product education?
- Target audience stage: awareness, consideration, or decision?
- Timeline and resource constraints?

---

## Lead Magnet Principles

### 1. Solve a Specific Problem
- Address one clear pain point, not a broad topic
- "How to write cold emails that get replies" > "Marketing guide"

### 2. Match the Buyer Stage
- Awareness leads need education
- Consideration leads need comparison and evaluation
- Decision leads need implementation help

### 3. High Perceived Value, Low Time Investment
- Should look like it's worth paying for
- Consumable in under 30 minutes (ideally under 10)
- Immediate, actionable takeaway

### 4. Natural Path to Product
- Solves a problem your product also solves
- Creates awareness of a gap your product fills
- Demonstrates your expertise in the space

### 5. Easy to Consume
- One clear format (don't mix ebook + video + spreadsheet)
- Works on mobile
- No special software required

---

## Lead Magnet Types

| Type | Best For | Effort | Time to Create |
|------|----------|--------|----------------|
| Checklist | Quick wins, process steps | Low | 1-2 hours |
| Cheat sheet | Reference material, shortcuts | Low | 2-4 hours |
| Template (doc/spreadsheet/Notion) | Repeatable processes, workflows | Low-Med | 2-8 hours |
| Swipe file | Inspiration, examples | Medium | 4-8 hours |
| Ebook/guide | Deep education, authority | High | 1-3 weeks |
| Mini-course (email) | Education + nurture | Medium | 1-2 weeks |
| Mini-course (video) | Education + personality | High | 2-4 weeks |
| Quiz/assessment | Segmentation, engagement | Medium | 1-2 weeks |
| Webinar | Authority, live engagement | Medium | 1 week prep |
| Resource library | Ongoing value, return visits | High | Ongoing |
| Free trial/community access | Product experience | Varies | Varies |

**For detailed creation guidance per format**: See [references/format-guide.md](references/format-guide.md)

---

## Matching Lead Magnets to Buyer Stage

### Awareness Stage
Goal: Educate on the problem. Attract people who don't know you yet.

| Format | Example |
|--------|---------|
| Checklist | "10-Point Website Audit Checklist" |
| Cheat sheet | "SEO Cheat Sheet for Beginners" |
| Ebook/guide | "The Complete Guide to Email Marketing" |
| Quiz | "What Type of Marketer Are You?" |

### Consideration Stage
Goal: Help evaluate solutions. Build trust and demonstrate expertise.

| Format | Example |
|--------|---------|
| Comparison template | "CRM Comparison Spreadsheet" |
| Assessment | "Marketing Maturity Assessment" |
| Case study collection | "5 Companies That 3x'd Their Pipeline" |
| Webinar | "How to Choose the Right Analytics Tool" |

### Decision Stage
Goal: Help implement. Remove friction to purchase.

| Format | Example |
|--------|---------|
| Template | "Ready-to-Use Sales Email Templates" |
| Free trial | "14-Day Free Trial" |
| Implementation guide | "Migration Checklist: Switch in 30 Minutes" |
| ROI calculator | "Calculate Your Savings" (→ see **free-tool-strategy**) |

---

## Gating Strategy

### Gating Options

| Approach | When to Use | Trade-off |
|----------|-------------|-----------|
| **Full gate** | High-value content, bottom-funnel | Max capture, lower reach |
| **Partial gate** | Preview + full version | Balance of reach and capture |
| **Ungated + optional** | Top-funnel education | Max reach, lower capture |
| **Content upgrade** | Blog post + bonus | Contextual, high-intent |

### What to Ask For

- **Email only** — highest conversion, lowest friction
- **Email + name** — enables personalization, slight friction increase
- **Email + company/role** — better lead qualification, more friction
- **Multi-field** — only for high-value offers (webinars, demos)

Rule of thumb: Ask for the minimum needed. Every extra field reduces conversion by 5-10%.

### How to Frame the Exchange

- Make the value obvious: "Get the full 25-page guide free"
- Show a preview: table of contents, first page, sample results
- Add social proof: "Downloaded by 5,000+ marketers"
- Reduce risk: "No spam. Unsubscribe anytime."

**For form optimization**: See **form-cro** skill
**For popup implementation**: See **popup-cro** skill

---

## Landing Page & Delivery

### Landing Page Structure

1. **Headline** — Clear benefit: what they'll get and why it matters
2. **Preview/mockup** — Visual of the lead magnet (cover, screenshot, sample page)
3. **What's inside** — 3-5 bullet points of key takeaways
4. **Social proof** — Download count, testimonials, logos
5. **Form** — Minimal fields, clear CTA button
6. **FAQ** — Address hesitations (Is it really free? What format?)

**For landing page optimization**: See **page-cro** skill

### Delivery Methods

| Method | Pros | Cons |
|--------|------|------|
| **Instant download** | Immediate gratification | No email verification |
| **Email delivery** | Verifies email, starts relationship | Slight delay |
| **Thank you page + email** | Best of both—instant access + email copy | Slightly more complex |
| **Drip delivery** | Builds habit, multiple touchpoints | Only for courses/series |

### Thank You Page Optimization

Don't waste the thank you page. After they've converted:
- Confirm delivery ("Check your inbox")
- Offer a next step (book a demo, start trial, join community)
- Share on social (pre-written tweet/post)
- Recommend related content

---

## Promotion & Distribution

### Blog CTAs & Content Upgrades

- Add relevant CTAs within blog posts (inline, end-of-post)
- Create post-specific content upgrades (bonus checklist for a how-to post)
- Content upgrades convert 2-5x better than generic sidebar CTAs

### Exit-Intent & Popups

- Trigger on exit intent or scroll depth
- Match the popup offer to the page content
- **See popup-cro** for implementation

### Social Media

- Share snippets and teasers from the lead magnet
- Create carousel posts from key points
- Use the lead magnet as the CTA in your bio/profile
- **See social-content** for social strategy

### Paid Promotion

- Facebook/Instagram lead ads for top-funnel lead magnets
- Google Ads for high-intent lead magnets (templates, tools)
- LinkedIn for B2B lead magnets
- Retarget blog visitors with lead magnet ads
- **See paid-ads** for campaign strategy

### Partner Co-Promotion

- Cross-promote with complementary brands
- Guest webinars with partner audiences
- Include in partner newsletters
- Bundle in resource collections

---

## Measuring Success

### Key Metrics

| Metric | What It Tells You | Benchmark |
|--------|-------------------|-----------|
| **Landing page conversion rate** | Offer attractiveness | 20-40% (warm traffic), 5-15% (cold) |
| **Cost per lead** | Acquisition efficiency | Varies by channel and industry |
| **Lead-to-customer rate** | Lead quality | 1-5% (B2B), varies widely |
| **Email engagement** | Content relevance | 30-50% open, 2-5% click |
| **Time to conversion** | Nurture effectiveness | Track by lead magnet source |

**For detailed benchmarks by format and industry**: See [references/benchmarks.md](references/benchmarks.md)

### A/B Testing Ideas

- **Headline**: Benefit-focused vs. curiosity-driven
- **Format**: Checklist vs. guide on same topic
- **Gate level**: Full gate vs. partial preview
- **Form fields**: Email-only vs. email + name
- **CTA copy**: "Download Free Guide" vs. "Get Your Copy"
- **Delivery**: Instant download vs. email delivery

### Lead Quality Signals

Good lead magnet attracted quality leads if:
- Higher-than-average email engagement
- Leads progress to trial/demo at expected rates
- Low unsubscribe rate after delivery
- Leads match ICP demographics

---

## 2026 Lead Magnet & Opt-in Framework

### The "Utility-First" Shift
*Majority agreement (>90% of authorities from HubSpot, G2, and DigitalMarketer).*

- **The "Tool-as-a-Magnet" Model:** The highest-converting assets are now functional tools — a "Prompt Optimizer," an "Agent-Readiness Calculator," or a "Single-Task AI Agent" rather than a whitepaper.
- **Zero-Click Value:** Give away the core insight for free on the landing page. Use the lead magnet to provide the *customization* or the *execution* of that insight.
- **The "Low-Friction" Opt-in:** Traditional forms with 5+ fields are dead. Use Single-Sign-On (Google/LinkedIn) or one-field email captures. Every additional field reduces conversion by 11% in 2026.
- **First-Party Data Enrichment:** The lead magnet's primary purpose is now to feed your CDP (Customer Data Platform). Design the magnet to ask one "Golden Question" that segments the user by their specific maturity level or pain point.

### 2026 High-Performance Magnet Types

| Type | Description | Why It Works in 2026 |
| :--- | :--- | :--- |
| **Interactive Audit** | A self-assessment that grades their current stack. | Provides personalized "Information Gain" that LLMs can't give. |
| **The "Blueprint" Code** | A downloadable, ready-to-run GitHub Gist or code framework. | Instant utility for developer/entrepreneur audiences. |
| **Micro-Course (Text-Based)** | 5 days of 2-minute tips delivered via SMS or WhatsApp. | Fits into the "Mobile-First" lifestyle of busy tech leaders. |
| **"Prompt Vault" Access** | A curated, searchable library of proven AI prompts. | High "Perceived Value" with zero shipping/delivery cost. |

### 2026 Strategic Trade-offs

| Conflict Topic | Opinion A (The Open-Access Camp) | Opinion B (The Gating Camp) | Resolved Stance |
| :--- | :--- | :--- | :--- |
| **To Gate or Not To Gate?** | Gating kills GEO/SEO because LLMs can't see the content. | Without a gate, you can't build a 1st-party database for the CFO. | **Hybrid:** Ungate the *What* (Insight) and gate the *How* (Template/Tool). |
| **Quality vs. Quantity** | Release 10 small magnets to see what sticks. | Build one "Monster" asset that becomes an industry standard. | Use "Atomic Magnets" (small) to test intent; build the "Pillar" (big) once proven. |
| **Email vs. WhatsApp** | Email is the only professional channel for B2B. | Email is too crowded; move magnets to SMS/WhatsApp for 90% opens. | Collect Email for the *Relationship*; use SMS/Social for the *Delivery*. |

### 2026 Execution Pillars
1. **The "Answer-First" Promise:** Your landing page must answer a specific question immediately. The lead magnet should be the "Next Step."
2. **AI-Ready Formatting:** If your magnet is a PDF, ensure it is "Machine Readable" (text-based, not image-based) so users can upload it to their own AI agents (Claude/GPT) for analysis.
3. **The "Human Verification" Signal:** Explicitly state: "Created by [Founder Name] based on [X] hours of real-world testing." This counters "AI-slop" fatigue.
4. **Follow-up "Value Drops":** Don't just deliver the file. The delivery email must include a "Video Walkthrough" to ensure they actually use the asset.

---

## Output Format

When creating a lead magnet strategy, provide:

### 1. Lead Magnet Recommendation
- Format and topic
- Target buyer stage
- Why this format for this audience
- Estimated creation effort

### 2. Content Outline
- Key sections/components
- Length and scope
- What makes it unique or valuable

### 3. Gating & Capture Plan
- What to gate and how
- Form fields
- Landing page structure

### 4. Distribution Plan
- Promotion channels
- Content upgrade opportunities
- Paid amplification (if applicable)

### 5. Measurement Plan
- KPIs and targets
- What to A/B test first

---

## Task-Specific Questions

1. What existing content or expertise could you turn into a lead magnet?
2. Where does your audience spend time online?
3. What's the most common question prospects ask before buying?
4. Do you have an email nurture sequence set up for new leads?
5. What's your budget for design and promotion?

---

## Related Skills

- **free-tool-strategy**: For interactive tools as lead magnets (calculators, graders, quizzes)
- **copywriting**: For writing the lead magnet content itself
- **email-sequence**: For nurture sequences after lead capture
- **page-cro**: For optimizing lead magnet landing pages
- **popup-cro**: For popup-based lead capture
- **form-cro**: For optimizing capture forms
- **content-strategy**: For content planning and topic selection
- **analytics-tracking**: For measuring lead magnet performance
- **paid-ads**: For paid promotion of lead magnets
- **social-content**: For social media promotion
