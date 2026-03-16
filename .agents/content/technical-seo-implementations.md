# Technical SEO Implementations — Sober Founders (soberfounders.org)

WordPress + Yoast SEO. Ready-to-deploy code for each section below.

---

## Part 1: Updated robots.txt

### The Updated robots.txt Content

```
# START YOAST BLOCK
# ---------------------------
User-agent: *
Disallow:

Sitemap: https://www.soberfounders.org/sitemap_index.xml
# ---------------------------
# END YOAST BLOCK

# -------------------------------------------------------
# AI Search Bot Access Policy — Sober Founders
# -------------------------------------------------------
# We explicitly ALLOW AI search and answer engines (ChatGPT,
# Perplexity, Claude, Google SGE/AI Overviews, Bing Copilot)
# to crawl and index this site. Appearing in AI-generated
# answers is a primary discovery channel for our audience.
# Blocking these bots would make us invisible to founders
# who search "sober entrepreneur community" in AI tools.
# -------------------------------------------------------

# OpenAI — ChatGPT Browse & search citations
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

# Perplexity AI — answer engine citations
User-agent: PerplexityBot
Allow: /

# Anthropic Claude — web search feature
User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

# Google Extended — Gemini / AI Overviews
User-agent: Google-Extended
Allow: /

# Microsoft Bing — Copilot citations
User-agent: Bingbot
Allow: /

# -------------------------------------------------------
# Training-only crawlers — no search/answer benefit
# We block mass web-scraping crawlers used exclusively
# for LLM pre-training datasets (no search citation value).
# -------------------------------------------------------

User-agent: CCBot
Disallow: /
```

### How to Deploy in WordPress (Three Methods)

#### Method 1 — Physical robots.txt file (recommended, simplest)

WordPress generates a virtual robots.txt dynamically. Creating a physical file in the WordPress root directory overrides Yoast's version entirely.

1. Connect via FTP/SFTP or use your host's File Manager (cPanel, Kinsta MyKinsta, WP Engine User Portal, etc.).
2. Navigate to the WordPress root — the same directory that contains `wp-config.php` and the `wp-content/` folder.
3. Create (or upload) a file named `robots.txt` with the full content above.
4. Verify at `https://www.soberfounders.org/robots.txt`.

Caveat: Yoast will no longer update the sitemap URL automatically. If you ever move the sitemap, update the physical file manually.

#### Method 2 — WP Robots Txt plugin (GUI, no file access needed)

1. In WordPress Admin, go to **Plugins > Add New**.
2. Search for **"WP Robots Txt"** (by Contextual Code) and install/activate it.
3. Go to **Settings > WP Robots Txt**.
4. Paste the full robots.txt content above into the text area.
5. Save. The plugin merges your content with or replaces the dynamic output — check its settings for "replace" vs. "append" mode and select "replace".
6. Verify at `https://www.soberfounders.org/robots.txt`.

#### Method 3 — functions.php code snippet

Add to your child theme's `functions.php` or a site-specific plugin. This approach uses the `do_robotstxt` action hook.

```php
/**
 * Sober Founders — Custom robots.txt
 * Replaces Yoast's dynamic output with our full custom version.
 * Hooks into the native WordPress robots.txt filter.
 */
add_filter( 'robots_txt', 'soberfounders_custom_robots_txt', 99, 2 );
function soberfounders_custom_robots_txt( $output, $public ) {
    $output  = "# START YOAST BLOCK\n";
    $output .= "# ---------------------------\n";
    $output .= "User-agent: *\n";
    $output .= "Disallow:\n\n";
    $output .= "Sitemap: https://www.soberfounders.org/sitemap_index.xml\n";
    $output .= "# ---------------------------\n";
    $output .= "# END YOAST BLOCK\n\n";

    $output .= "# -------------------------------------------------------\n";
    $output .= "# AI Search Bot Access Policy — Sober Founders\n";
    $output .= "# -------------------------------------------------------\n";
    $output .= "# We explicitly ALLOW AI search and answer engines so that\n";
    $output .= "# Sober Founders appears in AI-generated answers when\n";
    $output .= "# founders search for sober entrepreneur communities.\n";
    $output .= "# -------------------------------------------------------\n\n";

    $output .= "User-agent: GPTBot\n";
    $output .= "Allow: /\n\n";

    $output .= "User-agent: ChatGPT-User\n";
    $output .= "Allow: /\n\n";

    $output .= "User-agent: PerplexityBot\n";
    $output .= "Allow: /\n\n";

    $output .= "User-agent: ClaudeBot\n";
    $output .= "Allow: /\n\n";

    $output .= "User-agent: anthropic-ai\n";
    $output .= "Allow: /\n\n";

    $output .= "User-agent: Google-Extended\n";
    $output .= "Allow: /\n\n";

    $output .= "User-agent: Bingbot\n";
    $output .= "Allow: /\n\n";

    $output .= "# Training-only crawlers — block (no search citation value)\n";
    $output .= "User-agent: CCBot\n";
    $output .= "Disallow: /\n";

    return $output;
}
```

---

## Part 2: Event Schema — Tuesday / Thursday Sessions

Place this JSON-LD in the `<head>` of the page that describes the sessions (homepage or a dedicated "Sessions" page). In WordPress, use **Yoast > Schema** tab or a plugin like **"Schema & Structured Data for WP & AMP"** to inject it, or paste it into a Custom HTML block / the theme's `<head>` via `wp_head` hook.

### EventSeries + Individual Event instances

```html
<script type="application/ld+json">
[
  {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    "@id": "https://www.soberfounders.org/#event-series-weekly-sessions",
    "name": "Sober Founders Weekly Mastermind Sessions",
    "description": "Free recurring online mastermind and discussion sessions for entrepreneurs in recovery. Held every Tuesday and Thursday. Members share wins, challenges, and accountability across business and sobriety.",
    "url": "https://www.soberfounders.org/",
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "isAccessibleForFree": true,
    "organizer": {
      "@type": "Organization",
      "@id": "https://www.soberfounders.org/#organization",
      "name": "Sober Founders Inc.",
      "url": "https://www.soberfounders.org/"
    },
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "validFrom": "2020-01-01",
      "url": "https://www.soberfounders.org/"
    },
    "location": {
      "@type": "VirtualLocation",
      "url": "https://www.soberfounders.org/"
    },
    "audience": {
      "@type": "Audience",
      "audienceType": "Entrepreneurs and founders in sobriety and addiction recovery"
    },
    "keywords": "sober entrepreneurs, founders in recovery, addiction recovery business, sobriety mastermind, entrepreneurship sobriety"
  },
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": "https://www.soberfounders.org/#tuesday-session",
    "name": "Sober Founders Tuesday Mastermind",
    "description": "Weekly Tuesday mastermind session for sober entrepreneurs. Free, community-led discussions on business and sobriety.",
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "isAccessibleForFree": true,
    "startDate": "2026-03-17T12:00:00-05:00",
    "endDate": "2026-03-17T13:00:00-05:00",
    "eventSchedule": {
      "@type": "Schedule",
      "byDay": "https://schema.org/Tuesday",
      "repeatFrequency": "P1W",
      "scheduleTimezone": "America/New_York",
      "startTime": "12:00:00",
      "endTime": "13:00:00"
    },
    "superEvent": {
      "@id": "https://www.soberfounders.org/#event-series-weekly-sessions"
    },
    "organizer": {
      "@type": "Organization",
      "@id": "https://www.soberfounders.org/#organization",
      "name": "Sober Founders Inc.",
      "url": "https://www.soberfounders.org/"
    },
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "url": "https://www.soberfounders.org/"
    },
    "location": {
      "@type": "VirtualLocation",
      "url": "https://www.soberfounders.org/"
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": "https://www.soberfounders.org/#thursday-session",
    "name": "Sober Founders Thursday Mastermind",
    "description": "Weekly Thursday mastermind session for sober entrepreneurs. Free, community-led discussions on business and sobriety.",
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "isAccessibleForFree": true,
    "startDate": "2026-03-19T12:00:00-05:00",
    "endDate": "2026-03-19T13:00:00-05:00",
    "eventSchedule": {
      "@type": "Schedule",
      "byDay": "https://schema.org/Thursday",
      "repeatFrequency": "P1W",
      "scheduleTimezone": "America/New_York",
      "startTime": "12:00:00",
      "endTime": "13:00:00"
    },
    "superEvent": {
      "@id": "https://www.soberfounders.org/#event-series-weekly-sessions"
    },
    "organizer": {
      "@type": "Organization",
      "@id": "https://www.soberfounders.org/#organization",
      "name": "Sober Founders Inc.",
      "url": "https://www.soberfounders.org/"
    },
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "url": "https://www.soberfounders.org/"
    },
    "location": {
      "@type": "VirtualLocation",
      "url": "https://www.soberfounders.org/"
    }
  }
]
</script>
```

### Deployment Notes

- **startDate / endDate**: Update `startDate` to the next upcoming Tuesday or Thursday instance each time you redeploy, or set it to a date in the recent past — Google will use the `eventSchedule` block to understand recurrence regardless.
- **startTime / endTime**: Replace `12:00:00` with the actual session time. If you don't publish session times publicly, omit `startTime`/`endTime` from `eventSchedule` and drop the `startDate`/`endDate` fields, keeping only the `Schedule` block.
- **Validation**: Test at [https://search.google.com/test/rich-results](https://search.google.com/test/rich-results) after deployment.

---

## Part 3: Enhanced Organization Schema

Yoast generates a basic Organization schema via its Knowledge Graph. The enhanced version below adds nonprofit status, social links, contact info, founding date, and keyword-rich description.

### JSON-LD

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "NGO",
  "@id": "https://www.soberfounders.org/#organization",
  "name": "Sober Founders",
  "legalName": "Sober Founders Inc.",
  "alternateName": ["Sober Founders Community", "SoberFounders"],
  "url": "https://www.soberfounders.org/",
  "logo": {
    "@type": "ImageObject",
    "url": "https://www.soberfounders.org/wp-content/uploads/sober-founders-logo.png",
    "width": 512,
    "height": 512
  },
  "description": "Sober Founders is a free 501(c)(3) nonprofit community for entrepreneurs in sobriety and addiction recovery. We run free weekly online mastermind sessions every Tuesday and Thursday where founders share wins, challenges, and accountability across business and sobriety. Open to any business owner who is sober — not just side hustlers.",
  "foundingDate": "2020",
  "nonprofitStatus": "Nonprofit501c3",
  "taxID": "",
  "mission": "To support entrepreneurs navigating sobriety by providing free community, peer accountability, and resources that help them build thriving businesses and maintain lasting recovery.",
  "keywords": "sober entrepreneurs, founders in recovery, sobriety community, addiction recovery business owners, sober mastermind, entrepreneurship sobriety, free recovery community",
  "contactPoint": [
    {
      "@type": "ContactPoint",
      "contactType": "community support",
      "url": "https://www.soberfounders.org/",
      "availableLanguage": "English"
    }
  ],
  "sameAs": [
    "https://www.linkedin.com/company/sober-founders",
    "https://www.instagram.com/soberfounders",
    "https://twitter.com/soberfounders"
  ],
  "memberOf": {
    "@type": "Organization",
    "name": "IRS 501(c)(3) Nonprofit Organizations"
  },
  "offers": {
    "@type": "Offer",
    "name": "Free Weekly Mastermind Sessions",
    "description": "Free Tuesday and Thursday online mastermind sessions for sober entrepreneurs",
    "price": "0",
    "priceCurrency": "USD"
  }
}
</script>
```

### Deployment Options

#### Option A — Yoast SEO Knowledge Graph (partial, easiest)

Yoast lets you configure the Organization name, logo, social profiles, and description under **SEO > Search Appearance > General > Knowledge Graph & Schema.org**. This covers: name, URL, logo, and sameAs social links.

What Yoast cannot add natively: `nonprofitStatus`, `foundingDate`, `mission`, `taxID`, `memberOf`, or custom `offers`. Use Option B for the full schema.

#### Option B — Custom PHP in functions.php or a site plugin

```php
/**
 * Sober Founders — Enhanced Organization / NGO Schema
 * Injected into <head> on every page via wp_head.
 * The @id matches Yoast's generated @id so they merge correctly
 * in Google's Knowledge Graph.
 */
add_action( 'wp_head', 'soberfounders_organization_schema' );
function soberfounders_organization_schema() {
    // Only output on the homepage to avoid duplicate @id issues.
    if ( ! is_front_page() ) {
        return;
    }
    $schema = [
        '@context'        => 'https://schema.org',
        '@type'           => 'NGO',
        '@id'             => 'https://www.soberfounders.org/#organization',
        'name'            => 'Sober Founders',
        'legalName'       => 'Sober Founders Inc.',
        'alternateName'   => [ 'Sober Founders Community', 'SoberFounders' ],
        'url'             => 'https://www.soberfounders.org/',
        'description'     => 'Sober Founders is a free 501(c)(3) nonprofit community for entrepreneurs in sobriety and addiction recovery. Free weekly online mastermind sessions every Tuesday and Thursday.',
        'foundingDate'    => '2020',
        'nonprofitStatus' => 'Nonprofit501c3',
        'mission'         => 'To support entrepreneurs navigating sobriety with free community, peer accountability, and resources.',
        'keywords'        => 'sober entrepreneurs, founders in recovery, sobriety community, addiction recovery business owners',
        'contactPoint'    => [
            [
                '@type'             => 'ContactPoint',
                'contactType'       => 'community support',
                'url'               => 'https://www.soberfounders.org/',
                'availableLanguage' => 'English',
            ],
        ],
        'sameAs' => [
            'https://www.linkedin.com/company/sober-founders',
            'https://www.instagram.com/soberfounders',
            'https://twitter.com/soberfounders',
        ],
    ];
    echo '<script type="application/ld+json">' . wp_json_encode( $schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . '</script>' . PHP_EOL;
}
```

**Important:** Update the `sameAs` URLs to match actual social profile URLs before deploying. If the LinkedIn/Instagram/Twitter handles differ from `soberfounders`, correct them first.

#### Option C — Schema & Structured Data for WP & AMP plugin

1. Install **"Schema & Structured Data for WP & AMP"** from the WordPress plugin directory.
2. Go to **Schema Markup > Add New**.
3. Select schema type **Organization**.
4. Paste the JSON-LD fields into the GUI fields.
5. Set it to output on all pages (or homepage only).

---

## Part 4: Homepage Meta Tags

### Current (baseline)

- **Title:** "Sober Founders - A Free Community For Entrepreneurs in Recovery" (66 characters — too long)
- **Description:** "Free masterminds and discussions regarding sobriety and business. Requires being sober and owning a business (not a side hustle)" (130 characters — slightly short, weak CTA)

### Title Tag Options (target: 50–60 characters)

| # | Title | Characters | Notes |
|---|-------|-----------|-------|
| 1 | `Sober Founders: Free Community for Entrepreneurs in Recovery` | 60 | Primary keyword first, hits the ceiling — verify no truncation in your SERP preview tool |
| 2 | `Sober Founders — Free Mastermind for Sober Entrepreneurs` | 57 | "Mastermind" signals the specific offering; em dash is SERP-safe |
| 3 | `Sober Founders: Free Weekly Sessions for Recovering Founders` | 60 | "Weekly sessions" is more concrete; appeals to action-oriented searchers |

Recommendation: Option 2. "Free Mastermind for Sober Entrepreneurs" front-loads the value prop and the primary keyword pair in 57 characters.

### Meta Description Options (target: 150–160 characters)

| # | Description | Characters | Notes |
|---|-------------|-----------|-------|
| 1 | `Free online mastermind sessions every Tuesday & Thursday for entrepreneurs in sobriety. Join 500+ sober founders building real businesses. Apply free.` | 151 | Social proof placeholder (update member count); strong CTA |
| 2 | `A free nonprofit community for sober entrepreneurs — weekly online masterminds, peer accountability, and real business support. No cost, ever. Join us.` | 153 | Signals nonprofit trust; "No cost, ever" removes hesitation |
| 3 | `Sober and running a business? Join free Tuesday & Thursday masterminds with entrepreneurs in recovery. Real founders, real accountability. 100% free.` | 151 | Conversational opener mirrors how a founder would search; "real" repeated for emphasis |

Recommendation: Option 1 if you have a member count to cite (social proof is a strong click driver). Option 3 if you prefer a voice-first, question-led approach that also reads well as an AI-extracted snippet.

### How to Update Meta Tags in Yoast

1. Go to the **Homepage** in WordPress (or **Pages** if your homepage is a static page).
2. In the Yoast SEO meta box below the editor, click the **Google Preview** tab.
3. Click **Edit snippet**.
4. Update the **SEO Title** and **Meta Description** fields with your chosen option.
5. Save / Update the page.

If the homepage is controlled by Yoast's **Search Appearance** settings rather than a page:
- Go to **SEO > Search Appearance > General**.
- Edit the **Site Title** and **Meta Description** fields there.

---

## Validation Checklist

After deploying any of the above:

- [ ] robots.txt accessible at `https://www.soberfounders.org/robots.txt` — verify HTTPS URL
- [ ] robots.txt test in Google Search Console: **Settings > robots.txt Tester**
- [ ] Event schema: [https://search.google.com/test/rich-results](https://search.google.com/test/rich-results)
- [ ] Organization schema: [https://validator.schema.org/](https://validator.schema.org/)
- [ ] Meta tags: [https://metatags.io/](https://metatags.io/) or Yoast's own snippet preview
- [ ] After 1–2 weeks: check Google Search Console **Enhancements** tab for Event rich result eligibility
