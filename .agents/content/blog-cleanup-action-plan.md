# Blog Cleanup Action Plan -- soberfounders.org

*Created: 2026-03-20*
*Execute in WordPress Admin + Yoast Redirects (or Redirection plugin)*

---

## Phase 1: Delete and Redirect (Do First)

These posts should be deleted/trashed in WordPress with 301 redirects configured.

### 1A. Duplicate Posts -- Consolidate Into One Winner

For each cluster: keep the **Winner**, merge any unique content from the losers into the winner, then trash the losers and 301 redirect to the winner.

#### Cluster: "Best Mastermind Group for Recovery"
| Post | Slug | Action |
|------|------|--------|
| **WINNER** | `best-mastermind-group-founders-recovery` | Keep. Merge any unique content from the other. |
| Loser | `best-mastermind-group-for-founders-in-recovery` | Trash + 301 → `/best-mastermind-group-founders-recovery` |

#### Cluster: "Peer Advisory / Peer Group" (4 posts competing!)
| Post | Slug | Action |
|------|------|--------|
| **WINNER** | `peer-advisory-group-comparison` | Keep. This is the comparison angle. Merge best content from all three losers. |
| Loser | `peer-advisory-groups-for-entrepreneurs` | Trash + 301 → `/peer-advisory-group-comparison` |
| Loser | `peer-advisory-sober-entrepreneurs` | Trash + 301 → `/peer-advisory-group-comparison` |
| Loser | `peer-group-sober-entrepreneurs` | Trash + 301 → `/peer-advisory-group-comparison` |

#### Cluster: "Sober CEO"
| Post | Slug | Action |
|------|------|--------|
| **WINNER** | `sober-ceo-running-company-in-recovery` | Keep. Better slug, aligned with keyword strategy. |
| Loser | `sober-ceo-transforming-leadership-without-alcohol` | Trash + 301 → `/sober-ceo-running-company-in-recovery` |

**Note on winner:** The "Sober CEO: Transforming Leadership" post has fabricated-sounding member anecdotes (7 different anonymous members each with suspiciously neat dollar amounts and cities). When merging content, either verify these are real or rewrite with fewer, more genuine stories. Do not carry fabricated testimonials into the winner.

#### Cluster: "Sober Networking Mistakes"
| Post | Slug | Action |
|------|------|--------|
| **WINNER** | `sober-business-networking-mistakes` | Keep. Shorter slug. |
| Loser | `are-you-making-these-common-networking-mistakes-as-a-sober-business-owner` | Trash + 301 → `/sober-business-networking-mistakes` |

#### Cluster: "Overachievers / Sober Entrepreneur Mistakes" (3 posts!)
| Post | Slug | Action |
|------|------|--------|
| **WINNER** | `7-mistakes-youre-making-as-an-overachieving-sober-entrepreneur-and-how-to-fix-them` | Keep (best content, genuine voice, Big Book refs). **Rename slug** to `sober-entrepreneur-mistakes` and 301 the old URL. |
| Loser | `overachievers-anonymous-7-signs-youre-sabotaging-your-sober-business-and-how-to-fix-it` | Trash + 301 → `/sober-entrepreneur-mistakes` |
| Loser | `overachievers-anonymous-5-steps-how-to-scale-your-company-and-stay-grounded-easy-guide-for-sober-founders` | Trash + 301 → `/sober-entrepreneur-mistakes` |

#### Cluster: "Business Triggers"
| Post | Slug | Action |
|------|------|--------|
| **WINNER** | `master-business-triggers-the-sober-founders-guide` | Keep. Better slug. |
| Loser | `7-business-triggers-youre-ignoring-and-how-sober-entrepreneurs-handle-them-without-relapsing` | Trash + 301 → `/master-business-triggers-the-sober-founders-guide` |

#### Cluster: "Why Entrepreneurs Struggle with Addiction"
| Post | Slug | Action |
|------|------|--------|
| **WINNER** | Find the original (without `-2` suffix). If it doesn't exist anymore, rename this one. |
| Loser | `why-entrepreneurs-struggle-with-addiction-2` | If original exists: Trash + 301 → original. If original is gone: rename slug to `why-entrepreneurs-struggle-with-addiction` |

### 1B. Delete -- Off-Audience or Harmful Content

| Post | Slug | Reason | Action |
|------|------|--------|--------|
| Sober Curious vs Recovery | `sober-curious-vs-recovery-best-for-sober-entrepreneurship` | Targets sober curious, not ICP (founders in recovery) | Trash + 301 → `/entrepreneurs-in-recovery` |

### 1C. Delete -- City Pages (All 10)

Sober Founders is virtual/international. Someone searching "[city] sober meetup" wants in-person, not Zoom. These thin pages (~600 words each, nearly identical content with city name swapped) risk a quality penalty.

| Slug | Action |
|------|--------|
| `sober-founders-new-york` | Trash + 301 → `/events` |
| `sober-founders-los-angeles` | Trash + 301 → `/events` |
| `sober-founders-miami` | Trash + 301 → `/events` |
| `sober-founders-austin` | Trash + 301 → `/events` |
| `sober-founders-nashville` | Trash + 301 → `/events` |
| `sober-founders-denver` | Trash + 301 → `/events` |
| `sober-founders-chicago` | Trash + 301 → `/events` |
| `sober-founders-san-francisco` | Trash + 301 → `/events` |
| `sober-founders-dallas` | Trash + 301 → `/events` |
| `sober-founders-atlanta` | Trash + 301 → `/events` |

**Total posts removed in Phase 1: ~21 posts**

---

## Phase 2: Rename Slugs on Surviving Posts

These posts survive but need shorter slugs. Create 301 redirects from old to new.

| Current Slug | New Slug | Old → New 301 |
|-------------|----------|---------------|
| `7-mistakes-youre-making-as-an-overachieving-sober-entrepreneur-and-how-to-fix-them` | `sober-entrepreneur-mistakes` | Yes |
| `why-joining-a-sober-business-mastermind-will-change-the-way-you-handle-growth-triggers` | `sober-mastermind-growth-triggers` | Yes |
| `is-being-sober-worth-it-7-unexpected-business-advantages-sober-entrepreneurs-dont-want-you-to-know` | `sober-business-advantages` | Yes |
| `the-simple-work-life-balance-trick-every-sober-entrepreneur-needs-to-know-but-most-ignore` | `sober-entrepreneur-work-life-balance` | Yes |
| `why-sober-entrepreneurs-are-crushing-it-in-2026-5-performance-benefits-you-never-knew` | `sober-entrepreneur-performance` | Yes |
| `struggling-with-control-in-your-business-7-ways-sober-entrepreneurs-let-go-without-losing-their-edge` | `sober-entrepreneur-control` | Yes |
| `stop-wasting-time-on-fear-5-quick-hacks-every-entrepreneur-in-recovery-should-know` | `entrepreneur-recovery-fear` | Yes |
| `sober-mastermind-meaning-explained-why-traditional-business-groups-fall-short-for-entrepreneurs-in-recovery` | `sober-mastermind-meaning` | Yes |
| `10-reasons-your-sober-mastermind-isnt-working-and-how-to-fix-it` | `fix-your-sober-mastermind` | Yes |
| `mentorship-model-for-sober-founders-aligning-your-business-strategy-with-your-recovery-journey` | `sober-founder-mentorship` | Yes |
| `the-proven-recovery-mastermind-framework-how-to-build-authentic-business-connections` | `recovery-mastermind-framework` | Yes |
| `crowdfunding-vs-traditional-funding-which-is-better-for-your-sober-startup` | `sober-startup-funding` | Yes |
| `7-mistakes-sober-entrepreneurs-make-with-ai-integration-and-how-to-fix-them` | `sober-entrepreneur-ai-mistakes` | Yes |
| `master-business-triggers-the-sober-founders-guide` | `business-triggers-sober-guide` | Yes |
| `7-sober-entrepreneurship-moves-essential-for-recover` | `sober-entrepreneurship-recovery-moves` | Yes (also fixes truncated "recover" → "recovery") |

---

## Phase 3: Rewrite Titles on Clickbait Posts

After slug changes, also update the H1 and Yoast title to remove clickbait:

| Current Title | Revised Title |
|--------------|---------------|
| "Is Being Sober Worth It? 7 Unexpected Business Advantages Sober Entrepreneurs Don't Want You to Know" | "7 Business Advantages of Being a Sober Entrepreneur" |
| "The Simple Work-Life Balance Trick Every Sober Entrepreneur Needs to Know But Most Ignore" | "Work-Life Balance for Sober Entrepreneurs" |
| "Why Sober Entrepreneurs Are Crushing It in 2026: 5 Performance Benefits You Never Knew" | "5 Performance Benefits of Sober Entrepreneurship" |
| "Stop Wasting Time on Fear: 5 Quick Hacks Every Entrepreneur in Recovery Should Know" | "Overcoming Fear as an Entrepreneur in Recovery" |
| "Overachievers Anonymous: 5 Steps How to Scale Your Company and Stay Grounded" | (deleted -- consolidated into sober-entrepreneur-mistakes) |

---

## Phase 4: Write Meta Descriptions

Every post needs a custom 150-160 char Yoast meta description. Priority list for posts currently using auto-truncated excerpts:

| Slug | Current (truncated) | Recommended Meta Description |
|------|---------------------|------------------------------|
| `sober-mastermind-growth-triggers` | "Growth is the goal for every entrepreneur. We work long hours to see those revenue numbers climb. We hire more..." | "Growth triggers can threaten your recovery. Learn how a sober business mastermind helps founders scale without relapsing. Free weekly sessions available." (155 chars) |
| `sober-entrepreneur-mistakes` | "You built a business while staying sober. That is a massive achievement. Most people cannot fathom the grit it takes..." | "7 mistakes sober entrepreneurs make, from trading addictions to isolating from peers. Practical fixes grounded in the 12 steps and business strategy." (152 chars) |
| `10-reasons-your-business-growth-isnt-working-and-how-a-sober-mentor-fixes-it` | "Hitting a plateau in your business feels a lot like a dry drunk. You are doing the work, but nothing..." | "Business growth stalled? A sober mentor sees the blind spots you can't. 10 reasons growth stalls for entrepreneurs in recovery and how to fix each one." (153 chars) |
| `sober-entrepreneurship-proven-ways-to-handle-stress` | (has one, but generic) | "Practical stress management tools built for sober entrepreneurs. Protect your recovery and run your business with calm, clear-headed decision-making." (150 chars) |
| `sober-entrepreneur-2026-meaning` | "Explore the challenges and triumphs of being a sober entrepreneur in 2026..." | "What it means to be a sober entrepreneur in 2026. How founders in recovery build businesses with clarity, peer accountability, and purpose-driven growth." (155 chars) |
| `life-after-quitting-alcohol-entrepreneur` | "Explore how sobriety boosts business success for entrepreneurs..." | "Real stories of entrepreneurs whose businesses grew after getting sober. See what changes in the first 90 days, what gets harder, and what gets better." (152 chars) |
| `why-entrepreneurs-struggle-with-addiction` | "Explore why entrepreneurs face higher addiction risks..." | "Entrepreneurs face 2x the addiction risk of the general population. How stress, isolation, and hustle culture fuel substance abuse in business founders." (153 chars) |
| `high-functioning-alcoholic-entrepreneur` | "Explore how successful entrepreneurs manage thriving businesses..." | "You built a company while hiding a drinking problem. You are not alone. How high-functioning alcoholism shows up in entrepreneurs and what comes next." (150 chars) |

---

## Phase 5: Fix Internal Linking

### Comparison Posts (Vistage, YPO, Tiger 21, EO)

These posts currently link to free events. They should link to the **Phoenix Forum application page** since the comparison audience is Phoenix Forum-level ($1M+ revenue).

**Posts to update:**
- `vistage-for-sober-entrepreneurs` -- primary CTA → Phoenix Forum application
- `ypo-for-sober-entrepreneurs` -- primary CTA → Phoenix Forum application
- `tiger-21-for-sober-entrepreneurs` -- primary CTA → Phoenix Forum application
- `eo-for-sober-business-owners` -- primary CTA → Phoenix Forum application
- `peer-advisory-group-comparison` (winner) -- primary CTA → Phoenix Forum application

**Keep the secondary CTA** to free Thursday mastermind for readers not yet at $1M revenue.

### All Surviving Posts

Add 3-5 contextual internal links within the body of each post. Link to:
- Related blog posts in the same topic cluster
- The Phoenix Forum page (for high-revenue audience content)
- The events page (for general audience content)
- The FAQ page
- Comparison posts when mentioning competitor organizations

---

## Phase 6: Add FAQPage Schema

These posts have FAQ sections in the HTML but no corresponding FAQPage JSON-LD structured data. Add schema via Yoast FAQ blocks or custom JSON-LD:

- `sober-ceo-running-company-in-recovery` (winner)
- `peer-advisory-group-comparison` (winner)
- `sober-entrepreneur-2026-meaning` (if it has FAQ section)
- `entrepreneurs-in-recovery`
- `do-mastermind-groups-help-sober-entrepreneurs`

The comparison posts (Vistage, YPO, Tiger 21, EO) already have FAQPage schema. Good.

---

## Phase 7: Add Author Bio Block to All Posts

Use the author bio template from `blog-content-rules.md`. Add as a reusable Elementor widget or WordPress custom block placed above the CTA on every post.

**Author bio text:**
"Andrew Lassise is a serial entrepreneur who started at 16 selling Nokia phone cases and air guitars on eBay, then built his first five-figure company at 17 duplicating CDs for local bands. He founded Rush Tech Support (dba Tech 4 Accountants) in 2014, became a thought leader in the WISP space, and the IRS eventually adopted his compliance template. After a punishing DUI in early 2013, Andrew got sober through the 12 steps on March 23, 2013. He founded Sober Founders to build the resource he wished existed during his own recovery: a high-stakes business mastermind where sobriety is a competitive advantage, not a footnote."

Also update Yoast Person schema for Andrew with:
- jobTitle: "Founder, Sober Founders Inc."
- description: "Serial entrepreneur, sober since 2013, built and exited multiple seven and eight-figure companies in cybersecurity and financial services."
- sameAs: [LinkedIn URL]

---

## Phase 8: Content Revisions

### AI Integration Post (`sober-entrepreneur-ai-mistakes`)

Replace generic "Recovery Connection" language with real program language. Examples:

- **Mistake #1 (no data foundation):** Replace "In early recovery, we learn that shortcuts don't work" with: "Half measures availed us nothing. You can't build lasting sobriety on a shaky foundation, and you can't build reliable AI on bad data either."
- **Mistake #3 (rushing implementation):** Replace "Just like you can't force someone else's recovery" with: "You can't transmit something you haven't got. If your team hasn't bought in, the tool is dead on arrival."
- **Mistake #4 (technology over methodology):** Replace "external fixes don't work without internal change" with: "We tried to find an easier, softer way. But we could not. Same applies to slapping AI on a broken process."
- **Mistake #7 (expecting immediate ROI):** Replace "real change takes time" with: "The promises are being fulfilled, sometimes quickly, sometimes slowly. AI ROI works the same way. If you're looking for instant gratification, you haven't changed the thinking that got you here."

### Surviving Clickbait Posts

Rewrite the opening paragraphs to remove AI-slop patterns. Lead with BLUF (direct answer in 40-60 words), use recovery-native voice.

---

## Summary

| Phase | Action | Posts Affected |
|-------|--------|----------------|
| 1 | Delete + 301 redirect (duplicates, city pages, off-audience) | ~22 posts removed |
| 2 | Rename slugs (<60 chars) with 301 from old | ~15 posts |
| 3 | Rewrite clickbait titles | ~5 posts |
| 4 | Write custom meta descriptions | ~8 posts |
| 5 | Fix internal links (Phoenix Forum CTAs on comparison posts) | ~5+ posts |
| 6 | Add FAQPage schema | ~5 posts |
| 7 | Add author bio block | All surviving posts (~34) |
| 8 | Content revisions (AI post, clickbait intros) | ~6 posts |

**Post count after cleanup:** ~35 posts (down from 56)
**Net effect:** Stronger authority concentration, no cannibalization, cleaner crawl, better GEO signals.
