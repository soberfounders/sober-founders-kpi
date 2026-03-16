# Sober Founders — Comprehensive SEO / GEO / LLM EO Plan

*Generated: 2026-03-15*
*Skills used: ai-seo, seo-audit, schema-markup, site-architecture, content-strategy, programmatic-seo, competitor-alternatives*

---

## Executive Summary

This plan synthesizes 7 marketing skill agents into a unified strategy to grow organic and AI-driven visibility for Sober Founders. The goal is to drive more qualified leads into the Phoenix Forum pipeline, increase donations, and raise attendance — directly serving the organization's three strategic priorities.

**Three optimization layers:**

| Layer | What It Does | Why It Matters |
|-------|-------------|----------------|
| **SEO** (Traditional) | Rank in Google/Bing search results | Foundation — if you don't rank, you can't be cited |
| **GEO** (Generative Engine Optimization) | Get cited in AI Overviews, ChatGPT, Perplexity | 45% of Google searches now show AI Overviews; AI reduces clicks by up to 58% |
| **LLM EO** (LLM Engine Optimization) | Appear in ChatGPT, Claude, Copilot, Gemini answers | AI assistants are becoming the first place people search |

**Priority order:** Google AI Overviews → ChatGPT → Perplexity → Copilot → Claude (per platform-ranking-factors reference, ordered by audience reach).

---

## Phase 1: Technical Foundation (Weeks 1–2)

*Skills: seo-audit, schema-markup*

### 1.1 Crawlability & AI Bot Access

**Action: Update robots.txt to allow all AI crawlers.**

```
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Bingbot
Allow: /

# Block training-only crawlers (not search)
User-agent: CCBot
Disallow: /
```

**Why:** If AI bots can't crawl your content, they can't cite you. Each blocked bot = zero visibility on that platform.

### 1.2 Technical SEO Audit Checklist

| Check | Target | Priority |
|-------|--------|----------|
| HTTPS everywhere | All pages | Critical |
| XML sitemap exists and submitted | Google Search Console + Bing Webmaster Tools | Critical |
| Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1) | All pages | High |
| Page load < 2 seconds | All pages (Copilot threshold) | High |
| Mobile responsive | All pages | High |
| No broken internal links | Crawl audit | Medium |
| Canonical tags on all pages | Self-referencing | Medium |
| 301 redirects for any changed URLs | All legacy URLs | Medium |
| Submit to Bing Webmaster Tools | Enable Copilot visibility | High |
| Enable IndexNow | Faster Bing/Copilot indexing | Medium |

### 1.3 Schema Markup Implementation

Implement JSON-LD structured data on every page type. Schema markup delivers a **30–40% AI visibility boost** (per ai-seo skill).

**Homepage:**
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "name": "Sober Founders",
      "url": "https://soberfounders.com",
      "description": "A community for entrepreneurs in recovery, featuring the Phoenix Forum for founders with $1M+ revenue and 1+ year sobriety.",
      "foundingDate": "[YEAR]",
      "sameAs": [
        "https://www.linkedin.com/company/sober-founders",
        "https://www.instagram.com/soberfounders",
        "https://twitter.com/soberfounders"
      ]
    },
    {
      "@type": "WebSite",
      "name": "Sober Founders",
      "url": "https://soberfounders.com"
    }
  ]
}
```

**Event pages (Luma events):**
```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Sober Founders Tuesday Session",
  "startDate": "2026-03-18T12:00:00-07:00",
  "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
  "organizer": {
    "@type": "Organization",
    "name": "Sober Founders"
  }
}
```

**Blog/content pages:**
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "[Title]",
  "author": { "@type": "Person", "name": "[Author]", "jobTitle": "[Credentials]" },
  "datePublished": "[ISO date]",
  "dateModified": "[ISO date]",
  "publisher": { "@type": "Organization", "name": "Sober Founders" }
}
```

**FAQ pages:**
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is Sober Founders?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sober Founders is a community and peer support network for entrepreneurs in recovery from addiction. It provides weekly sessions, mentorship, and the Phoenix Forum — an exclusive membership for founders with $1M+ revenue and 1+ year of sobriety."
      }
    }
  ]
}
```

**BreadcrumbList** on all interior pages for free internal linking + AI context.

---

## Phase 2: Site Architecture & URL Structure (Weeks 2–3)

*Skills: site-architecture, content-strategy*

### 2.1 Recommended Site Hierarchy

```
Homepage (/)
├── About (/about)
│   ├── Our Story (/about/our-story)
│   ├── Team (/about/team)
│   └── Press (/about/press)
├── Phoenix Forum (/phoenix-forum)
│   ├── What Is Phoenix Forum (/phoenix-forum/what-is-phoenix-forum)
│   ├── Apply (/phoenix-forum/apply)
│   └── Member Stories (/phoenix-forum/stories)
├── Programs (/programs)
│   ├── Weekly Sessions (/programs/weekly-sessions)
│   ├── Mentorship (/programs/mentorship)
│   └── Events (/programs/events)
├── Blog (/blog)
│   ├── [Category: Recovery + Business] (/blog/category/recovery-business)
│   ├── [Category: Founder Stories] (/blog/category/founder-stories)
│   ├── [Category: Community Impact] (/blog/category/community-impact)
│   └── [Posts] (/blog/post-slug)
├── Resources (/resources)
│   ├── Guides (/resources/guides)
│   ├── Research (/resources/research)
│   └── FAQ (/resources/faq)
├── Donate (/donate)
├── Contact (/contact)
├── Privacy (/privacy)
└── Terms (/terms)
```

### 2.2 Navigation Spec

**Header (5 items + CTA):** About | Phoenix Forum | Programs | Blog | Resources | **[Donate]** (CTA button)

**Footer columns:**
- **Community:** Phoenix Forum, Weekly Sessions, Events, Member Stories
- **Resources:** Blog, Guides, FAQ, Research
- **Organization:** About, Team, Press, Contact
- **Legal:** Privacy, Terms

**Breadcrumbs** on all pages below L0, mirroring URL hierarchy.

### 2.3 Internal Linking Strategy

**Hub-and-spoke model:**

```
Hub: /phoenix-forum (comprehensive overview)
├── Spoke: /blog/what-makes-phoenix-forum-different
├── Spoke: /phoenix-forum/stories (member success stories)
├── Spoke: /blog/category/founder-stories
└── Spoke: /resources/guides/preparing-for-phoenix-forum
```

```
Hub: /blog/category/recovery-business (pillar page)
├── Spoke: /blog/sobriety-and-scaling-a-business
├── Spoke: /blog/managing-stress-without-substances
├── Spoke: /blog/building-a-team-in-recovery
└── Spoke: /blog/investor-conversations-as-sober-founder
```

**Cross-section links:**
- Blog posts → Phoenix Forum application page
- Event pages → Related blog posts
- Member stories → Donate page
- FAQ → Relevant program pages

---

## Phase 3: Content Strategy for SEO + AI Citation (Weeks 3–8)

*Skills: content-strategy, ai-seo, competitor-alternatives*

### 3.1 Content Pillars (4 Pillars)

| Pillar | Why | Target Queries |
|--------|-----|---------------|
| **Recovery + Entrepreneurship** | Core identity — own this topic | "sober entrepreneur," "running a business in recovery," "addiction and entrepreneurship" |
| **Phoenix Forum / High-Performance Founders** | Primary revenue driver | "entrepreneur mastermind group," "founder peer group," "high-revenue founder community" |
| **Community Impact & Stories** | Social proof + donations | "sober success stories," "recovery community for founders" |
| **Sobriety Resources for Business Leaders** | Top-of-funnel awareness | "CEO sobriety," "executive recovery," "how addiction affects business" |

### 3.2 Priority Content — Searchable (SEO)

These target specific queries people are actively searching for.

| # | Title | Target Keyword | Buyer Stage | Content Type | pSEO Playbook |
|---|-------|---------------|-------------|--------------|---------------|
| 1 | What Is Sober Founders? | "sober founders" | Awareness | Definition + About | — |
| 2 | The Entrepreneur's Guide to Recovery | "entrepreneur recovery" | Awareness | Hub/Pillar | — |
| 3 | Sober CEO: Running a Company in Recovery | "sober CEO" | Awareness | Long-form guide | — |
| 4 | Best Mastermind Groups for Founders | "founder mastermind group" | Consideration | Listicle/Curation | Curation |
| 5 | Phoenix Forum vs YPO vs EO: Which Is Right for You? | "YPO alternatives," "EO alternatives" | Consideration | Comparison | Comparisons |
| 6 | How Addiction Affects Business Performance | "addiction and business" | Awareness | Data-driven | — |
| 7 | Recovery Resources for Executives | "executive recovery programs" | Awareness | Curation | Curation |
| 8 | Sober Founders FAQ | "sober founders community" | Decision | FAQ | — |
| 9 | How to Join the Phoenix Forum | "apply Phoenix Forum" | Decision | How-to | — |
| 10 | Supporting Sober Entrepreneurs: Donate | "donate recovery nonprofit" | Decision | Landing page | — |

### 3.3 Priority Content — Shareable (Thought Leadership)

| # | Title | Why Shareable | Format |
|---|-------|---------------|--------|
| 1 | "X Founders, $Y Billion in Combined Revenue, All Sober" | Surprising data point | Data-driven |
| 2 | "I Lost My Company to Addiction. Here's How I Built a Better One." | Vulnerable founder story | Personal essay |
| 3 | The Recovery Advantage: Why Sober Founders Outperform | Counterintuitive take | Research-backed opinion |
| 4 | What Happens at a Sober Founders Session | Behind-the-scenes transparency | Meta content |
| 5 | Annual Impact Report: By the Numbers | Original data | Annual research |

### 3.4 Programmatic SEO Opportunities

*Skill: programmatic-seo*

| Playbook | Pattern | Pages | URL Structure |
|----------|---------|-------|---------------|
| **Personas** | "Sober founders in [industry]" | 10–15 | `/community/[industry]` |
| **Locations** | "Sober entrepreneur community in [city]" | 10–20 top metro areas | `/community/[city]` |
| **Glossary** | "What is [recovery/business term]" | 20–30 | `/resources/glossary/[term]` |
| **Profiles** | Member spotlight pages | Ongoing | `/phoenix-forum/stories/[name]` |

**Quality gates per programmatic-seo skill:**
- Each page must have unique, valuable content (not just city/industry name swaps)
- Location pages: include local recovery stats, local events, local member quotes
- Persona pages: industry-specific challenges, relevant member stories, tailored CTA
- Glossary: definition + context + how Sober Founders addresses it

### 3.5 Competitor/Alternative Pages

*Skill: competitor-alternatives*

| Page | URL | Target Keywords |
|------|-----|----------------|
| Phoenix Forum vs YPO | `/compare/phoenix-forum-vs-ypo` | "YPO alternative," "Phoenix Forum vs YPO" |
| Phoenix Forum vs EO | `/compare/phoenix-forum-vs-eo` | "EO alternative," "entrepreneur organization alternative" |
| Phoenix Forum vs Vistage | `/compare/phoenix-forum-vs-vistage` | "Vistage alternative" |
| Best Mastermind Groups for Founders in Recovery | `/resources/guides/best-recovery-mastermind-groups` | "recovery mastermind group" |

**Tone:** Honest and balanced per competitor-alternatives skill — acknowledge what YPO/EO/Vistage do well, be clear about who Phoenix Forum is best for (founders in recovery with $1M+ revenue).

---

## Phase 4: AI / Generative Engine Optimization (Ongoing)

*Skills: ai-seo, schema-markup*

### 4.1 The Three Pillars of AI Visibility

#### Pillar 1: Structure — Make Content Extractable

Every page should use these AEO/GEO content patterns (from content-patterns reference):

| Pattern | Use For | Example |
|---------|---------|---------|
| **Definition Block** | "What is X?" queries | "What is Sober Founders?" → 1-sentence definition in first paragraph |
| **Step-by-Step Block** | "How to X" queries | "How to Join the Phoenix Forum" → numbered steps |
| **Comparison Table** | "X vs Y" queries | Phoenix Forum vs YPO feature table |
| **FAQ Block** | Common questions | Sober Founders FAQ with FAQPage schema |
| **Statistic Citation Block** | Data claims | "According to SAMHSA, 10.2% of business owners report substance use disorders..." |
| **Expert Quote Block** | Authority | Founder quotes with name, company, credentials |

**Structural rules:**
- Lead every section with a direct answer (40–60 words optimal for snippet extraction)
- Use H2/H3 headings that match query phrasing
- Tables beat prose for comparisons
- Numbered lists beat paragraphs for processes
- Every paragraph should convey one clear, self-contained idea
- "Last updated: [date]" prominently displayed on every content page

#### Pillar 2: Authority — Make Content Citable

Per the Princeton GEO study (KDD 2024):

| Method | Visibility Boost | Action for Sober Founders |
|--------|:---------------:|--------------------------|
| Cite sources | +40% | Reference SAMHSA, NIDA, peer-reviewed addiction research |
| Add statistics | +37% | Include specific member counts, revenue aggregates, attendance data |
| Add quotations | +30% | Quote named Phoenix Forum members (with permission) |
| Authoritative tone | +25% | Write with demonstrated expertise in recovery + business |
| Improve clarity | +20% | Plain language, no jargon unless defined |
| Technical terms | +18% | Use domain-specific terms: "sobriety date," "qualified lead," "peer accountability" |

**Best combination:** Fluency + Statistics = maximum AI citation boost. Low-authority sites benefit even more — up to **115% visibility increase** with citations.

**E-E-A-T signals to build:**
- Author bios with credentials (recovery experience, business background)
- Named member testimonials with real companies
- Original data (aggregated, anonymized member statistics)
- Regular content updates (quarterly minimum)
- Transparent "About" page with team, mission, founding story

#### Pillar 3: Presence — Be Where AI Looks

AI doesn't just cite your website — it cites where you appear elsewhere.

| Platform | Action | Impact |
|----------|--------|--------|
| **Wikipedia** | Create/improve Sober Founders Wikipedia article | 7.8% of all ChatGPT citations come from Wikipedia |
| **Reddit** | Participate authentically in r/stopdrinking, r/entrepreneur, r/smallbusiness | 1.8% of ChatGPT citations; authentic presence |
| **YouTube** | Create video content: founder stories, "What is Sober Founders?" | Frequently cited by Google AI Overviews |
| **LinkedIn** | Publish articles, maintain company page | Boosts Copilot citations |
| **Podcast appearances** | Guest on entrepreneurship + recovery podcasts | Third-party authority signals |
| **Industry publications** | Guest posts in Forbes, Inc, Entrepreneur, recovery publications | Third-party citations carry 6.5x more weight |

### 4.2 Platform-Specific Optimization

**Google AI Overviews (highest priority):**
- Schema markup (FAQPage, Article, Organization, Event) — done in Phase 1
- Content clusters with strong internal linking — done in Phase 2–3
- Named, sourced citations in all content
- Author bios with credentials
- Target "how to" and "what is" queries

**ChatGPT (second priority):**
- Invest in backlinks and domain authority
- Update competitive content monthly (freshness = 3.2x more citations)
- Match content structure to how ChatGPT formats answers (conversational, direct, organized)
- Verifiable statistics with named sources
- Clean heading hierarchy (H1 > H2 > H3)

**Perplexity (third priority):**
- FAQ schema on all Q&A content
- Host PDF resources publicly (annual impact report, research briefs)
- Article schema with publication and modification timestamps
- Self-contained paragraphs (atomic, semantically complete)
- Publish frequently

**Copilot:**
- Submit to Bing Webmaster Tools
- IndexNow for fast indexing
- Page speed < 2 seconds
- LinkedIn content strategy
- Clear entity definitions

**Claude:**
- Verify presence in Brave Search (search.brave.com)
- Allow ClaudeBot in robots.txt
- Maximize factual density (specific numbers, named sources, dated stats)
- Be the most accurate source on recovery + entrepreneurship

### 4.3 AI Visibility Monitoring

**Monthly manual check (DIY, no tools required):**
1. Pick top 20 queries from Section 3.2
2. Run each through ChatGPT, Perplexity, and Google
3. Record: Are you cited? Who is? What page?
4. Log in spreadsheet, track month-over-month

**Key queries to monitor:**

| Query | Platform to Check |
|-------|------------------|
| "What is Sober Founders?" | Google AI, ChatGPT, Perplexity |
| "sober entrepreneur community" | All |
| "founder mastermind group for recovery" | All |
| "Phoenix Forum" | All |
| "addiction and entrepreneurship" | Google AI, ChatGPT |
| "YPO alternative for sober founders" | Google AI, ChatGPT |
| "how to run a business in recovery" | All |
| "executive recovery programs" | All |
| "sober CEO" | All |
| "entrepreneur peer group sobriety" | All |

**Paid tools (if budget allows):**

| Tool | Coverage | Best For |
|------|----------|----------|
| Otterly AI | ChatGPT, Perplexity, Google AI Overviews | Share of AI voice |
| Peec AI | ChatGPT, Gemini, Perplexity, Claude, Copilot | Multi-platform at scale |
| ZipTie | Google AI Overviews, ChatGPT, Perplexity | Brand mention + sentiment |

---

## Phase 5: Ongoing Optimization & Measurement

### 5.1 Content Refresh Cadence

| Content Type | Refresh Frequency | Why |
|-------------|-------------------|-----|
| Phoenix Forum page | Monthly | High-intent; freshness = ChatGPT 3.2x citation boost |
| Comparison pages (vs YPO/EO/Vistage) | Quarterly | Competitors change pricing/features |
| Blog pillar pages | Quarterly | Maintain authority |
| FAQ page | Monthly | Add new questions from inbound |
| Member stories | Ongoing (1–2/month) | Fresh social proof |
| Impact report | Annually | Original data = highest citation value |

### 5.2 KPIs to Track

| Metric | Source | Target |
|--------|--------|--------|
| Organic traffic | Google Analytics / Search Console | +30% in 6 months |
| AI Overview presence (% of target queries) | Manual audit | Appear in 50%+ |
| AI citation rate (brand mentions in AI answers) | Manual audit or Otterly/Peec | Cited in 30%+ of target queries |
| Phoenix Forum applications from organic | HubSpot | +25% in 6 months |
| Donation page visits from organic | Google Analytics | +20% in 6 months |
| Domain authority | Ahrefs/Moz | Track quarterly |
| Schema validation (0 errors) | Google Search Console | Ongoing |

### 5.3 Quick Wins (Do This Week)

1. **Update robots.txt** to allow all AI bots (Section 1.1)
2. **Add Organization schema** to homepage (Section 1.3)
3. **Add FAQPage schema** to any existing FAQ content
4. **Add "Last updated" dates** to all existing content pages
5. **Submit site to Bing Webmaster Tools** (enables Copilot)
6. **Write a clear "What is Sober Founders?" definition** in the first paragraph of the homepage (40–60 words, self-contained)
7. **Check Brave Search** (search.brave.com) for "Sober Founders" — verify indexing
8. **Add author bios** with credentials to all blog posts

---

## Implementation Priority Matrix

| Priority | Action | Impact | Effort | Phase |
|----------|--------|--------|--------|-------|
| 1 | robots.txt + AI bot access | High | Low | 1 |
| 2 | Schema markup (Org, FAQ, Article, Event) | High | Medium | 1 |
| 3 | Bing Webmaster Tools + IndexNow | Medium | Low | 1 |
| 4 | Site architecture restructure | High | High | 2 |
| 5 | Homepage "What is" definition block | High | Low | 3 |
| 6 | Phoenix Forum pillar page | High | Medium | 3 |
| 7 | Comparison pages (vs YPO/EO/Vistage) | High | Medium | 3 |
| 8 | FAQ page with schema | Medium | Low | 3 |
| 9 | Content pillar: Recovery + Entrepreneurship | High | High | 3 |
| 10 | Programmatic SEO (locations + personas) | Medium | High | 3 |
| 11 | Wikipedia article | High | Medium | 4 |
| 12 | YouTube content | Medium | High | 4 |
| 13 | Third-party guest posts | High | Medium | 4 |
| 14 | Monthly AI visibility monitoring | Medium | Low | 5 |
| 15 | Content refresh cadence | Medium | Low | 5 |

---

## Appendix: Content Templates

### Definition Block (for "What is X?" queries)

```markdown
## What is Sober Founders?

Sober Founders is a peer support community for entrepreneurs in recovery from addiction. Founded in [year], it provides weekly virtual sessions, mentorship, and the Phoenix Forum — an exclusive membership for founders with $1M+ in annual revenue and 1+ year of sobriety. With [X] active members and $[Y] billion in combined member revenue, Sober Founders is the largest community at the intersection of entrepreneurship and recovery.
```

### Statistic Citation Block

```markdown
The intersection of addiction and entrepreneurship is well-documented. According to a 2015 study published in the Journal of Clinical Psychology, entrepreneurs are 30% more likely to experience addiction than the general population. SAMHSA's 2024 National Survey on Drug Use and Health reports that 10.2% of business owners report substance use disorders. Sober Founders exists to serve this underserved population.
```

### Expert Quote Block

```markdown
"Recovery gave me the clarity to see what my business actually needed — not what my ego wanted," says [Member Name], founder of [Company] ($[X]M revenue). This perspective is common among Phoenix Forum members, where sobriety is treated as a competitive advantage rather than a limitation.
```

### Comparison Table Block

```markdown
## Phoenix Forum vs YPO vs EO: Key Differences

| Feature | Phoenix Forum | YPO | EO |
|---------|--------------|-----|-----|
| Focus | Founders in recovery | Young presidents | Entrepreneurs |
| Revenue requirement | $1M+ | $13M+ | $1M+ |
| Sobriety requirement | 1+ year | None | None |
| Recovery support | Core feature | Not offered | Not offered |
| Meeting frequency | Weekly | Monthly | Monthly |
| Annual cost | [Price] | ~$10,000+ | ~$3,000+ |
| Best for | Sober founders needing peer accountability | High-revenue executives seeking prestige network | Growth-stage entrepreneurs seeking community |
```

---

*This plan was generated by synthesizing 7 marketing skill agents: ai-seo, seo-audit, schema-markup, site-architecture, content-strategy, programmatic-seo, and competitor-alternatives. All recommendations are grounded in the Princeton GEO study (KDD 2024), SE Ranking domain authority analysis, ZipTie content-answer fit research, and Google's E-E-A-T framework.*
