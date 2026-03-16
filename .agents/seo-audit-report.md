# SEO Audit Report — Sober Founders (soberfounders.org)

**Audit Date:** 2026-03-15
**Platform:** WordPress + Astra theme + Yoast SEO + Elementor
**Scope:** 65 URLs (31 pages + 34 blog posts)

---

## Executive Summary

Sober Founders has a functional technical foundation — HTTPS is live, Yoast provides Organization and BreadcrumbList schema, and the blog is actively publishing topically relevant content. However, the site is leaving significant AI-citation and organic search opportunity on the table through three core gaps: missing FAQPage and Event structured data, several crawl-quality issues (orphan pages, duplicate content, a sample page), and weak on-page signals (thin meta descriptions, no author bios, no last-updated dates). The highest-leverage fix is adding FAQPage schema to FAQ-style content, which is the single biggest driver of Perplexity and ChatGPT citations. Resolving the duplicate content and orphan page issues will clean up crawl budget and consolidate ranking authority. With targeted remediation across these areas, the site is well-positioned to dominate the niche query space for sober entrepreneurship.

---

## Issues

| # | Issue | Impact | Fix | Priority |
|---|-------|--------|-----|----------|
| 1 | **Sitemap uses HTTP in robots.txt** | Googlebot and AI crawlers may be directed to an insecure sitemap; potential crawl trust issue | Update robots.txt `Sitemap:` directive to `https://www.soberfounders.org/sitemap_index.xml` in Yoast SEO → General → Features | Critical |
| 2 | **No explicit AI bot rules in robots.txt** | Missed opportunity to signal intent to GPTBot, PerplexityBot, ClaudeBot, and similar | Add explicit `User-agent` blocks for AI crawlers with `Allow: /` to signal consent | Critical |
| 3 | **No FAQPage schema** | Zero FAQ rich results; lowest-effort, highest-impact lever for Perplexity and ChatGPT citations | Implement FAQPage structured data on all pages with FAQ-style content using Yoast or a custom plugin | Critical |
| 4 | **No Event schema on event pages** | Event pages (/events, /tuesday, /thursday) are invisible to Google Events and AI agents parsing structured data | Add Event schema to each recurring event page (name, startDate, location/virtual, organizer) | Critical |
| 5 | **WordPress sample page indexed** (`/sample-page/`) | Dilutes crawl budget; signals low editorial quality to crawlers | Delete the page or set to noindex via Yoast; add 301 redirect to homepage if any links exist | High |
| 6 | **Orphan Elementor test page indexed** (`/elementor-3440/`) | Indexed draft/test content harms crawl quality and can confuse ranking signals | Delete the page or set to noindex via Yoast | High |
| 7 | **Duplicate "Ultimate Guide" posts** | Splits link equity and confuses crawlers; both posts compete for the same keywords | Delete the `-2` variant and 301 redirect it to the canonical post | High |
| 8 | **URL cannibalization on "right fit" pages** | Three similar pages (`/are-you-the-right-fit/`, `/are-you-the-right-fit2/`, `/are-you-the-right-fit-250k/`) compete for the same intent signal | Differentiate with distinct targeting and add `rel=canonical` pointing to the primary page; or consolidate into a single page with 301s | High |
| 9 | **Excessively long blog post URLs** | URLs over ~60 characters after the domain reduce click-through rates and are harder to share/link; no SEO benefit to long slugs | For new posts, enforce short slugs. For existing long-slug posts, evaluate traffic before redirecting — avoid unnecessary redirects on posts with backlinks | High |
| 10 | **Weak homepage meta description** | Current description is informal and non-persuasive ("not a side hustle"); reduces CTR from SERPs | Rewrite to lead with the core value proposition, include a CTA, and target 150–160 characters | High |
| 11 | **No Bing Webmaster Tools submission** | Site is invisible to Bing's Copilot index; misses a growing AI-citation surface | Submit sitemap at bing.com/webmasters; verify domain ownership | Medium |
| 12 | **No visible "Last Updated" dates on content** | AI citation tools (ChatGPT, Perplexity) weight content freshness; no date display suppresses citation probability | Enable post last-modified dates in Astra theme settings or via a plugin; add `dateModified` to JSON-LD | Medium |
| 13 | **Missing author bios on blog posts** | E-E-A-T gap: no visible credentials or experience signals for the author; critical for YMYL-adjacent content (health/recovery) | Add author bio blocks to all blog posts with name, recovery/founder credentials, and a headshot | Medium |
| 14 | **Comparison posts use long URL patterns** | Competitor comparison posts (EO, Vistage, Tiger 21, YPO) have descriptive but overly long slugs instead of clean `/vs/` or `/compare/` patterns | Not urgent — do not redirect existing posts with link equity. Use `/vs/` or `/compare/` pattern for all future comparison content | Medium |
| 15 | **Blog posts lack internal links to Phoenix Forum** | Primary conversion action (Phoenix Forum application) is not consistently linked from blog content; leaks conversion potential | Add a contextual CTA linking to the Phoenix Forum application page in every existing and future blog post | Medium |

---

## Positive Findings

- **Organization schema is live** — Yoast has correctly implemented Organization schema for "Sober Founders Inc." (501c3), which establishes entity recognition in Google's Knowledge Graph.
- **BreadcrumbList schema is present** — Yoast automatically generates breadcrumb structured data, supporting clear site hierarchy signals.
- **HTTPS is fully implemented** — No mixed-content issues were flagged; the site is secure.
- **Mobile responsive** — Astra theme provides a responsive layout out of the box.
- **Blog is actively publishing** — Recent posts in March 2026 signal topical freshness to crawlers.
- **Competitor comparison content exists** — Pages comparing Sober Founders to EO, Vistage, Tiger 21, and YPO capture high-intent comparison queries.
- **Phoenix Forum conversion funnel is structured** — Registration → interview → confirmation pages exist, forming a trackable conversion path.
- **GA4 is implemented** — G-1Z6BQ26LRZ provides analytics coverage for traffic and conversion measurement.

---

## Recommended Action Plan

Actions are ordered by priority (do these first) and effort required.

### Phase 1 — Critical Fixes (Do This Week)

1. **Fix the sitemap URL in robots.txt** — Log into Yoast SEO → General → Features and verify the sitemap URL outputs HTTPS. Confirm by visiting `https://www.soberfounders.org/robots.txt` directly.

2. **Add AI bot rules to robots.txt** — Add the following block to robots.txt (or via Yoast's robots.txt editor):
   ```
   User-agent: GPTBot
   Allow: /

   User-agent: PerplexityBot
   Allow: /

   User-agent: ClaudeBot
   Allow: /

   User-agent: anthropic-ai
   Allow: /

   User-agent: Google-Extended
   Allow: /
   ```

3. **Implement FAQPage schema on key pages** — Identify the top 5–10 pages with FAQ-style content and add FAQPage JSON-LD. Prioritize the Phoenix Forum FAQ, the "Are You the Right Fit" page, and high-traffic blog posts. Use Yoast's schema blocks or a plugin like Schema Pro.

4. **Add Event schema to /events, /tuesday, /thursday** — Mark up each event page with Event structured data including `name`, `startDate`, `eventStatus`, `eventAttendanceMode` (online), and `organizer`.

### Phase 2 — High Priority Cleanup (Do This Month)

5. **Delete `/sample-page/`** — Trash the page in WordPress. Add a 301 redirect to the homepage as a precaution.

6. **Delete `/elementor-3440/`** — Trash the orphan Elementor page. No redirect needed unless it has inbound links.

7. **Resolve duplicate "Ultimate Guide" posts** — Delete the `-2` variant and configure a 301 redirect from the deleted URL to the canonical post. Use Yoast Redirects or a plugin like Redirection.

8. **Address right-fit page cannibalization** — Audit the three `/are-you-the-right-fit*` pages. If they serve different audiences (e.g., standard vs. $250K+ founders), differentiate the title tags, meta descriptions, and body copy explicitly. Add `rel=canonical` on any near-duplicate. If one is redundant, consolidate with a 301.

9. **Rewrite the homepage meta description** — Replace the current description with something like: *"Sober Founders is a free community for entrepreneurs in recovery. Join free masterminds, peer discussions, and the exclusive Phoenix Forum — for founders who are sober and serious."* (155 chars)

10. **Enforce short slug policy for new blog posts** — Update editorial guidelines: no new post slug should exceed 60 characters. Prioritize keyword phrase over completeness.

### Phase 3 — Medium Priority Improvements (Do This Quarter)

11. **Submit to Bing Webmaster Tools** — Visit `https://www.bing.com/webmasters`, verify the domain, and submit the sitemap.

12. **Enable last-modified dates on blog posts** — Turn on date display in Astra theme customizer or use a plugin to show the `Last Updated:` date. Add `dateModified` to Yoast's JSON-LD output.

13. **Write and publish author bios** — Create at least one author profile with recovery/founder credentials. Assign it to all existing blog posts. A brief bio (50–100 words) with a headshot is sufficient to satisfy E-E-A-T expectations.

14. **Add Phoenix Forum CTAs to all blog posts** — Insert a contextual sentence + link to the Phoenix Forum application page in every existing blog post. A short plugin or Elementor global block can make this scalable.

15. **Use `/vs/` or `/compare/` slugs for future comparison content** — Do not redirect existing comparison posts. Adopt the cleaner pattern going forward.

---

*Report generated 2026-03-15. Re-audit recommended within 90 days after Phase 1 and Phase 2 fixes are deployed.*
