# Blog Content Rules -- soberfounders.org

*Created: 2026-03-20*
*Enforced on all new and revised blog posts*

---

## URL / Slug Rules

1. **Max 60 characters** after the domain for any new post slug.
2. **No clickbait patterns** in titles or slugs. No "you won't believe," "don't want you to know," "simple trick," "quick hacks," "crushing it." Write like a founder, not a content mill.
3. **No keyword-stuffing** in slugs. One primary keyword phrase per slug, max.
4. **Fix truncated slugs immediately.** If WordPress cut off a word, fix it before publishing.

## Meta Description Rules

1. **Every post must have a hand-written Yoast meta description.** Never publish with the auto-generated excerpt.
2. **150-160 characters.** Lead with the value prop, end with a reason to click.
3. **Must signal both recovery AND entrepreneurship.** This filters out non-target visitors.
4. **No em dashes.** Use commas, periods, or "and" instead.

## Content Quality Rules

1. **No AI slop.** No "furthermore," "moreover," "in today's fast-paced world," "it's important to note," "in conclusion." Write like a real founder in recovery talks.
2. **No em dashes.** Use commas, periods, or restructure the sentence.
3. **No fabricated member stories.** If quoting a member, use a real person (with permission) or clearly mark as composite/anonymous. Do not generate fake dollar amounts, cities, and industries to manufacture credibility.
4. **Statistics must be real.** Try to find and link the actual source. If no source exists, rephrase as general knowledge or remove. Do not invent citations.
5. **Use actual recovery program language.** When connecting business topics to recovery, use insider language members recognize: "Half measures availed us nothing," "selfishness and self-centeredness," "fear of economic insecurity," "the promises," Big Book references. Not watered-down "recovery teaches us" filler.
6. **ICP is founders in recovery.** Not sober curious, not general wellness, not pre-revenue dreamers. Every line of copy must speak to people who are sober AND running a business.

## Internal Linking Rules

1. **Every post must have 3-5 contextual internal links** within the body (not just the bottom CTA).
2. **Comparison posts (Vistage, YPO, Tiger 21, EO)** must link to the **Phoenix Forum application page**, not the free Thursday events. These are Phoenix Forum audience.
3. **Every post** must end with the standard CTA block linking to `/events` for the free Thursday mastermind.
4. **Link to related blog posts** when topically relevant. Build the hub-and-spoke model.

## Structural Rules (GEO)

1. **BLUF (Bottom Line Up Front):** First paragraph must directly answer the primary query in 40-60 words.
2. **Question-based H2s** where possible. Match how people prompt AI assistants.
3. **FAQPage schema** on every post that includes a FAQ section.
4. **Visible author bio** on every post (see author bio template below).
5. **"Last updated" date** visible on every post.
6. **Comparison tables** beat prose for vs-style content.

## Duplicate Content Rules

1. **One post per primary keyword.** If two posts target the same query, consolidate into one strong post and 301 redirect the other.
2. **Never publish a post with a `-2` or `-3` suffix.** This means a duplicate slug exists. Resolve before publishing.
3. **Check existing content before writing new posts.** Search the blog for the target keyword first.

## UTM Tracking Rules

All outbound links from blog posts to Luma/events, Phoenix Forum application, or any conversion page **must** include UTM parameters. This is how we track blog-to-attendee attribution.

### UTM Parameter Standard

```
utm_source=blog
utm_medium=cta
utm_campaign={post-slug}
```

### CTA Templates

**Bottom-of-post CTA (free Thursday mastermind):**
```html
<div class="blog-cta">
  <h3>You Don't Have to Build Alone</h3>
  <p>Join sober entrepreneurs every Thursday for a free mastermind. Real challenges, real support, no pitches.</p>
  <a href="https://soberfounders.org/events?utm_source=blog&utm_medium=cta&utm_campaign={POST-SLUG}">Attend a Free Meeting</a>
</div>
```

**In-body CTA (Phoenix Forum -- for comparison posts and high-revenue audience content):**
```html
<a href="https://soberfounders.org/apply?utm_source=blog&utm_medium=cta&utm_campaign={POST-SLUG}">Apply to Phoenix Forum</a>
```

**In-body contextual link (to another blog post):**
```html
<a href="https://soberfounders.org/{OTHER-POST-SLUG}?utm_source=blog&utm_medium=internal&utm_campaign={THIS-POST-SLUG}">anchor text</a>
```

### Tracking Flow

1. Visitor clicks blog CTA with UTM params
2. HubSpot tracking code captures UTMs into `campaign`, `campaign_source` fields
3. HubSpot also records `hs_analytics_first_url` (first page seen on site)
4. When visitor registers on Luma, sync matches them to HubSpot contact
5. `vw_seo_organic_zoom_attendees` view shows the full chain: blog post -> registration -> attendance

### UTM Inventory (apply to all surviving posts after cleanup)

| Post Slug | CTA Target | UTM |
|-----------|-----------|-----|
| `vistage-for-sober-entrepreneurs` | `/apply` | `?utm_source=blog&utm_medium=cta&utm_campaign=vistage-for-sober-entrepreneurs` |
| `ypo-for-sober-entrepreneurs` | `/apply` | `?utm_source=blog&utm_medium=cta&utm_campaign=ypo-for-sober-entrepreneurs` |
| `tiger-21-for-sober-entrepreneurs` | `/apply` | `?utm_source=blog&utm_medium=cta&utm_campaign=tiger-21-for-sober-entrepreneurs` |
| `eo-for-sober-business-owners` | `/apply` | `?utm_source=blog&utm_medium=cta&utm_campaign=eo-for-sober-business-owners` |
| All other posts | `/events` | `?utm_source=blog&utm_medium=cta&utm_campaign={post-slug}` |

## Programmatic/City Page Rules

1. **Do not publish thin city pages.** Sober Founders is virtual/Zoom-based and international. Someone searching for a local meetup in [city] is looking for in-person, not Zoom.
2. If city pages are published, they must contain genuinely unique local content: local recovery statistics, named local members, local events. Swapping the city name is not enough.

---

## Author Bio Template (for all posts)

```html
<div class="author-bio">
  <img src="[andrew-headshot-url]" alt="Andrew Lassise, Founder of Sober Founders" />
  <p><strong>Andrew Lassise</strong> is a serial entrepreneur who started at 16 selling Nokia phone cases and air guitars on eBay, then built his first five-figure company at 17 duplicating CDs for local bands. He founded Rush Tech Support (dba Tech 4 Accountants) in 2014, became a thought leader in the WISP space, and the IRS eventually adopted his compliance template. After a punishing DUI in early 2013, Andrew got sober through the 12 steps on March 23, 2013. He founded Sober Founders to build the resource he wished existed during his own recovery: a high-stakes business mastermind where sobriety is a competitive advantage, not a footnote.</p>
</div>
```

**Yoast/Schema version (for Person schema):**
- Name: Andrew Lassise
- Job Title: Founder, Sober Founders Inc.
- Description: Serial entrepreneur, sober since 2013, built and exited multiple seven and eight-figure companies in cybersecurity and financial services.
- sameAs: [LinkedIn URL], [personal site if applicable]
