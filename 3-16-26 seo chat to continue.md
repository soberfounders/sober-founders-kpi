# SEO Migration — 3/16/26 — Pick Up Here

## What was done this session

### 1. Marketing Skills Installed
- Merged `claude/add-marketing-skills-co02m` branch to main
- 33 AI agent marketing skills now in `.agents/skills/`
- Pushed to remote

### 2. WordPress SEO Audit
- Audited all 33 blog posts and 32 pages via WP REST API
- Found 1 post with AI wrapper text in the meta description (post 3418 — already fixed before we got there)
- Found 1 post with AI trailer text at the bottom (post 3420 — Andrew fixed manually)
- 26/33 posts had no custom meta descriptions (AIOSEO was auto-generating from content)

### 3. AIOSEO → Yoast Migration (COMPLETE)
- Installed Yoast SEO v27.1.1 via REST API
- Imported AIOSEO data into Yoast via `/yoast/v1/import/aioseo/posts` (18 objects)
- Ran full Yoast indexing cycle
- Deactivated AIOSEO and Rank Math
- QA agent verified: all 10 checks passed

### Current state of WordPress SEO plugins:
- **Yoast SEO v27.1.1** — ACTIVE (sole SEO plugin)
- **AIOSEO** — INACTIVE (can be deleted)
- **Rank Math** — INACTIVE (was installed mid-migration, never configured, can be deleted)

### What improved:
- Title tags now include brand name "Sober Founders Inc." on all inner pages
- Full Schema JSON-LD: Article, Organization, WebSite, BreadcrumbList, Person
- Canonical tags on all pages
- Robots meta `index, follow` on all pages
- Yoast-generated XML sitemap

### Known gap:
- **Meta descriptions are missing on ~30 posts/pages** — only homepage, /services/, and /apply/ have them (those were the only custom descriptions in AIOSEO; the rest were auto-generated and not importable)

## What to do next (in priority order)

### Phase 1 — Custom Yoast REST Plugin (REQUIRED for automation)
Yoast stores SEO data in `wp_yoast_indexable` table, NOT in standard post meta. Neither Yoast nor any SEO plugin exposes per-post SEO writes via the WP REST API with application passwords. We need a tiny PHP plugin (~40 lines) that adds:
- `POST /wp-json/sober/v1/seo` endpoint
- Accepts: `post_id`, `title`, `description`, `focus_keyword`
- Writes directly to Yoast's indexable table
- **Andrew must upload the zip via WP Admin → Plugins → Upload (one manual step)**

### Phase 2 — Autonomous Publishing Pipeline
Build a Node.js script that:
1. Takes a topic/keyword
2. Calls Claude API to generate article
3. POSTs to WordPress via REST API with clean content
4. Sets title, meta description, focus keyword via custom plugin endpoint
5. Verifies live page is correct

### Phase 3 — Backfill Existing Posts
Use the pipeline to generate and write meta descriptions for all 30 existing posts that currently have none.

### Phase 4 — LLM Findability (AEO/GEO)
- Add FAQ schema to posts (use `ai-seo` skill)
- Structure articles with Q&A headings for ChatGPT/Perplexity citations
- Build out `/addiction-statistics/` as a cited data resource

## WordPress API credentials
- **User:** andrew
- **App password:** EWqW lnfe Ara0 PGys lcBj 9x01
- **REST base:** https://soberfounders.org/wp-json/

## Minor items
- Sitemap `<loc>` URLs use `http://` not `https://` — low priority, check `siteurl`/`home` options in WP settings
- Can delete AIOSEO and Rank Math plugins from WordPress
- `sample-page` (ID: 2) and `elementor-3440` (ID: 3440) are junk pages — trash them
