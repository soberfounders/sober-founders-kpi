# WordPress Implementation Guide — SEO / GEO / LLM EO

*For soberfounders.org (WordPress + Astra + Yoast SEO + Elementor)*

---

## Quick Wins (Do Today)

### 1. Fix Sitemap HTTPS Issue

**Where:** WordPress Admin → Yoast SEO → Settings → General → Site URL
**What:** Ensure the site URL uses `https://` not `http://`. The sitemap_index.xml currently references HTTP.
**Also:** In WordPress Settings → General, ensure both "WordPress Address" and "Site Address" use `https://`.

### 2. Delete Junk Pages

Delete or noindex these pages immediately:

| Page | Action |
|------|--------|
| `/sample-page/` | Delete (WordPress default, no value) |
| `/elementor-3440/` | Delete (orphan Elementor draft) |
| `/the-ultimate-guide-to-entrepreneurship-in-recovery-everything-you-need-to-succeed-in-2026-2/` | Delete + 301 redirect to the original version |
| `/are-you-the-right-fit2/` | Evaluate — if duplicate, delete + redirect to `/are-you-the-right-fit/` |

**How to 301 redirect in Yoast:**
1. Go to Yoast SEO → Redirects (requires Yoast Premium)
2. Or install the free "Redirection" plugin
3. Add: Old URL → New URL, Type: 301

### 3. Update Homepage Meta Tags

**Where:** Edit the homepage in WordPress → scroll to Yoast SEO meta box

**Current title:** "Sober Founders - A Free Community For Entrepreneurs in Recovery"
**Recommended title:** `Sober Founders | Community for Entrepreneurs in Recovery`

**Current description:** "Free masterminds and discussions regarding sobriety and business. Requires being sober and owning a business (not a side hustle)"
**Recommended description:** `Join a free peer community for sober entrepreneurs. Weekly masterminds, mentorship, and the Phoenix Forum for founders with $1M+ revenue. 501(c)(3) nonprofit.`

### 4. Add "Last Updated" Dates to All Posts

**Option A — Yoast setting:**
Yoast SEO → Search Appearance → Content Types → Posts → Show date in snippet = Yes

**Option B — Theme code (functions.php):**
```php
// Display last modified date on posts
function sf_show_last_updated($content) {
    if (is_single()) {
        $updated = get_the_modified_date('F j, Y');
        $notice = '<p class="last-updated"><em>Last updated: ' . $updated . '</em></p>';
        return $notice . $content;
    }
    return $content;
}
add_filter('the_content', 'sf_show_last_updated');
```

### 5. Add Author Bios

**Where:** WordPress Admin → Users → Edit each author → fill in "Biographical Info"

Include:
- Role at Sober Founders
- Recovery credentials or years of experience
- Business background
- Why they're qualified to write on this topic

**Display on posts:** Most Astra theme configurations show author bios. If not visible:
- Astra → Customize → Blog/Archive → Single Post → Enable Author Info = On

---

## Schema Markup Implementation

### Method 1: Yoast SEO (Recommended)

Yoast already provides Organization, WebSite, WebPage, and BreadcrumbList schemas automatically.

**To enhance Organization schema:**
1. Go to Yoast SEO → Settings → Site Representation
2. Set Organization name: "Sober Founders Inc."
3. Add logo
4. Add social profiles (LinkedIn, Instagram, Twitter/X)

**To add FAQPage schema:**
Yoast Premium includes FAQ blocks. If you have Yoast Premium:
1. Edit the FAQ page
2. Use the "Yoast FAQ" block in the block editor
3. Add each Q&A pair
4. Yoast automatically generates FAQPage JSON-LD

If you don't have Yoast Premium, use Method 2.

### Method 2: Custom HTML Block (Free)

For any schema type Yoast doesn't handle (Event, enhanced FAQ):

1. Edit the page in WordPress
2. Add a "Custom HTML" block at the bottom
3. Paste the JSON-LD `<script>` tag
4. Example:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is Sober Founders?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Your answer here..."
      }
    }
  ]
}
</script>
```

5. Update/publish the page
6. Validate at https://search.google.com/test/rich-results

### Method 3: Site-Wide Schema via Plugin

For schema that applies across the site (Organization, Event):

**Recommended plugin:** "Schema & Structured Data for WP & AMP" (free)
- Install → Activate
- Settings → Add schema types for each page type
- Handles Organization, Event, Article, FAQ automatically

---

## robots.txt Update

### Option A: Physical File (Simplest)

1. Connect to your server via FTP/SFTP or File Manager in hosting panel
2. Navigate to the WordPress root directory (where wp-config.php lives)
3. Create or edit `robots.txt` file
4. Paste the updated content from `technical-seo-implementations.md`
5. Save

**Note:** A physical robots.txt overrides Yoast's virtual one.

### Option B: Yoast Filter (Code)

Add to your theme's `functions.php` or a code snippets plugin:

```php
add_filter('robots_txt', function($output, $public) {
    $custom = "# AI Search Engine Bots - Explicitly Allowed\n";
    $custom .= "User-agent: GPTBot\nAllow: /\n\n";
    $custom .= "User-agent: ChatGPT-User\nAllow: /\n\n";
    $custom .= "User-agent: PerplexityBot\nAllow: /\n\n";
    $custom .= "User-agent: ClaudeBot\nAllow: /\n\n";
    $custom .= "User-agent: anthropic-ai\nAllow: /\n\n";
    $custom .= "User-agent: Google-Extended\nAllow: /\n\n";
    $custom .= "# Block training-only crawlers\n";
    $custom .= "User-agent: CCBot\nDisallow: /\n\n";
    return $output . "\n" . $custom;
}, 10, 2);
```

### Option C: Plugin

Install "WP Robots Txt" plugin → Settings → add custom rules.

---

## Bing Webmaster Tools Setup

1. Go to https://www.bing.com/webmasters
2. Sign in with Microsoft account
3. Click "Add your site"
4. Enter: `https://www.soberfounders.org`
5. Verify ownership via:
   - **Option A:** Add meta tag to `<head>` (Yoast → Settings → Webmaster Tools → Bing verification code)
   - **Option B:** Upload XML verification file
   - **Option C:** Add CNAME DNS record
6. Once verified, submit sitemap: `https://www.soberfounders.org/sitemap_index.xml`
7. Enable IndexNow for automatic indexing of new content

---

## Blog Post SEO Checklist

For every new blog post, before publishing:

- [ ] Primary keyword in title (near beginning)
- [ ] Title under 60 characters
- [ ] Meta description under 160 characters with CTA
- [ ] H1 = post title (automatic in WordPress)
- [ ] H2/H3 headings match search query patterns
- [ ] Definition block in first paragraph (40-60 words, self-contained)
- [ ] At least 1 statistic with named source
- [ ] At least 1 internal link to Phoenix Forum (/phoenix-forum-registration/ or /apply/)
- [ ] At least 1 internal link to a related blog post
- [ ] At least 1 internal link to /donate/
- [ ] Author bio is filled in with credentials
- [ ] "Last updated" date visible
- [ ] Images have descriptive alt text
- [ ] URL slug is short and keyword-focused (under 4-5 words)
- [ ] Yoast green light on readability + SEO

---

## Content Publishing Calendar (Phase 3)

### Month 1 (Weeks 1-4)
| Week | Content | Type | Target Keyword |
|------|---------|------|---------------|
| 1 | FAQ Page (from faq-page.md) | Page | "sober founders FAQ" |
| 1 | Phoenix Forum Pillar Page (from phoenix-forum-pillar-page.md) | Page | "phoenix forum sober founders" |
| 2 | Homepage meta tag + definition block update | Page edit | "sober founders" |
| 2 | Update all existing blog posts with internal links to Phoenix Forum | Bulk edit | — |
| 3 | "What is Sober Founders?" blog post (awareness) | Post | "what is sober founders" |
| 4 | Annual Impact Report (shareable data-driven) | Post/PDF | "sober founders impact" |

### Month 2 (Weeks 5-8)
| Week | Content | Type | Target Keyword |
|------|---------|------|---------------|
| 5 | "Sober CEO: Running a Company in Recovery" | Post | "sober CEO" |
| 6 | Update YPO comparison post (refresh + comparison table) | Post edit | "YPO alternative sober" |
| 7 | Update EO comparison post (refresh + comparison table) | Post edit | "EO alternative sober" |
| 8 | "How Addiction Affects Business Performance" (data-driven) | Post | "addiction and business" |

### Month 3+ (Ongoing)
- 1-2 member stories per month
- Refresh comparison posts quarterly
- Monitor AI visibility monthly (20 target queries)
- Update FAQ page with new questions from inbound

---

## Monitoring Setup

### Google Search Console
- Verify site ownership (if not already done)
- Submit sitemap
- Monitor: Coverage, Performance, Core Web Vitals

### Bing Webmaster Tools
- Set up per instructions above
- Submit sitemap
- Enable IndexNow

### Monthly AI Visibility Check
See the monitoring section in `seo-geo-llmeo-plan.md` — run 20 queries across Google, ChatGPT, and Perplexity monthly.

### Google Analytics (GA4)
- Already installed (G-1Z6BQ26LRZ)
- Set up conversion events for:
  - Phoenix Forum application page view
  - Donate page view
  - Contact form submission
