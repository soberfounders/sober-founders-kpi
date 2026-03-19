# Program Structure & Messaging

Sober Founders runs three distinct programs. All agents must use these exact
descriptions when generating content, outreach, or marketing materials.

## Free Group: Tuesday — "All Our Affairs"

- **Schedule:** Every Tuesday
- **Format:** Business mastermind for entrepreneurs and business owners in
  recovery from addiction
- **Requirements:**
  - Revenue ≥ $250k/yr
  - Sobriety strictly > 1 year
  - At least two full-time employees
  - Actively working the 12 steps
- **Cost:** Free

## Free Group: Thursday — "Business Mastermind"

- **Schedule:** Every Thursday
- **Format:** Business mastermind open to all sober entrepreneurs
- **Requirements:** Own a business and be sober (no revenue or employee minimums, open to all entrepreneurs in recovery)
- **Cost:** Free

## Phoenix Forum (Premium Membership)

- **Schedule:** Weekly (details on application)
- **Details page:** https://soberfounders.org/phoenix-forum-2nd-group/
- **Requirements:**
  - Revenue ≥ $1,000,000/yr
  - Sobriety strictly > 1 year
- **Cost:** $499/mo
- **Format:** Curated peer group (max 10 members) with monthly "hot seat" (essentially a 4th and 5th step on businesses and lives)
- **Positioning:** Exclusive peer mastermind group modeled after YPO/EO/Vistage
  but built specifically for founders in recovery. Sobriety is a membership
  prerequisite and competitive advantage, not a personal detail.

## WordPress Site Architecture

| Page | URL | Purpose |
|------|-----|---------|
| Homepage | `/` | Main landing, Elementor-designed |
| Thursday Mastermind | `/thursday/` | Combined free mastermind landing (Thursday meeting details + format + benefits + Luma calendar) |
| Phoenix Forum | `/phoenix-forum-2nd-group/` | Phoenix Forum details (canonical) |
| Phoenix Forum redirect | `/phoenix-forum/` → 301 to above | SEO redirect |
| Weekly Mastermind redirect | `/weekly-mastermind-group/` → meta-refresh to `/thursday/` | Needs server-level 301 via Yoast/Redirection plugin |
| FAQ | `/resources/faq/` | 15-question FAQ with FAQPage schema |
| Apply | `/apply/` | Membership application |
| Donate | `/donate/` | 501(c)(3) donations |

## SEO / Schema Infrastructure (via Code Snippets plugin)

| Snippet | Scope | What it does |
|---------|-------|-------------|
| SF Custom Robots.txt | Global | Allows AI bots (GPTBot, ClaudeBot, etc.), blocks CCBot |
| SF Homepage Schemas | Homepage only | NGO Organization + EventSeries JSON-LD in `<head>` |
| SF Phoenix Forum Schemas | Phoenix Forum page only | Article + FAQPage + BreadcrumbList JSON-LD in `<head>` |
| FAQ page | Inline on page | FAQPage JSON-LD embedded in page content |
