# Website Agent Reference Guide

> **Read this before working on any website task.** This document covers architecture, animation technology, deployment, group tiers, content rules, and gotchas that every agent must know.

---

## 1. Architecture Overview

The site is a **WordPress + Next.js hybrid**:

| Layer | Technology | Role |
|-------|-----------|------|
| **Primary domain** | WordPress (`soberfounders.org`) | Blog, marketing pages, CMS |
| **Modern pages** | Next.js 16 + React 19 (in `/website`) | Case studies, homepage test, advanced components |
| **Hosting** | Vercel (Next.js), WordPress hosting (WP) | Next.js deploys on push to `main` |

### Key directories

```
website/
├── src/app/              # Next.js app router pages
│   ├── layout.tsx        # Root layout, metadata, JSON-LD schema
│   ├── page.tsx          # Production homepage (VideoScrub only)
│   ├── test/page.tsx     # Full scroll experience (dev/test)
│   ├── test/homepage.css # All homepage component styles
│   └── case-studies/     # Case study routes ([slug] dynamic)
├── src/components/       # React components
│   ├── SmoothScroll.tsx  # Lenis smooth scroll provider
│   ├── HeroScroll.tsx    # Canvas frame-sequence scrubbing (122 JPGs)
│   ├── VideoScrub.tsx    # Canvas video scrubbing (MP4)
│   ├── HeroOverlay.tsx   # Fixed hero text + CTA (fades on scroll)
│   ├── HomepageContent.tsx # Main scrollable content sections
│   ├── SiteFooter.tsx    # Footer with links, case studies, CTAs
│   ├── CaseStudyCard.tsx # Grid card component
│   └── CaseStudyPageContent.tsx # Full case study page
├── src/content/
│   └── caseStudies.ts    # Case study data & TypeScript types
└── public/assets/        # Static images, video, frame sequences
```

---

## 2. Animation & Scrolling — CRITICAL

### DO use: **GSAP + Lenis**

The homepage scroll experience is built on:

| Library | Version | Purpose |
|---------|---------|---------|
| **GSAP** | 3.14.2 | Animation engine, ScrollTrigger for scroll-linked animations |
| **@gsap/react** | 2.1.2 | React integration hooks |
| **Lenis** | 1.3.18 | Smooth scroll (replaces native scroll with buttery-smooth interpolation) |

**Lenis config** (`SmoothScroll.tsx`):
- Duration: **1.4s**
- Easing: `Math.min(1, 1.001 - Math.pow(2, -10 * t))` (exponential ease-out)
- Mobile touch multiplier: **1.5x**
- Synced with GSAP ScrollTrigger via `lenis.on("scroll", ScrollTrigger.update)`

### DO NOT use: CSS `scroll-behavior: smooth`, Framer Motion for scroll, or any other scroll library

- **CSS `scroll-behavior: smooth`** conflicts with Lenis and creates janky double-smoothing
- **Framer Motion** was tested and creates a clunky, laggy feel compared to GSAP+Lenis
- **Do not add** `scroll-snap`, `IntersectionObserver`-based scroll libraries, or any other scroll smoothing — Lenis handles all of it

### How the hero animation works

**Layer stack (z-index order):**

```
z-0:  Canvas background (HeroScroll or VideoScrub)
z-10: HeroOverlay (fixed text + CTA, fades out first 12% of scroll)
z-20: HomepageContent (scrollable content with glassmorphism cards)
```

**Two hero modes:**

1. **HeroScroll** (frame sequence) — 122 preloaded JPGs scrubbed via canvas
   - Accelerated progress: scroll 0–100% maps to video 0–55%
   - Power curve: `Math.pow(progress, 1.3)` — gives bottle-breaking more time
   - Motion blur on scroll velocity (up to 4px)
   - Dynamic overlay darkness ramp (0.15 → 0.5 → 0.35)

2. **VideoScrub** (MP4) — single video scrubbed via canvas
   - Container: 500vh (5 screens of scroll)
   - Power curve: `Math.pow(progress, 2.5)` — stretches early frames
   - Scrub lag: 0.3s

**Mobile fallback** (<768px): Static image (`/assets/phoenix-static.jpg`) with dark overlay. No canvas on mobile.

### Animation rules for new work

- All scroll-linked animations must use **GSAP ScrollTrigger** with `scrub`
- Always clean up ScrollTrigger instances on unmount (`ScrollTrigger.kill()`)
- Use `requestAnimationFrame` for render loops, never `setInterval`
- Content sections use **CSS transitions only** (hover effects, transforms) — no GSAP for content cards
- Keep canvas rendering independent of scroll event frequency

---

## 3. Group Tiers (Three Membership Levels)

### Thursday Open Mastermind
- **Eligibility:** Any sober entrepreneur — no revenue minimum, no sobriety length
- **When:** Every Thursday, 12 PM ET
- **Cost:** Free forever
- **Signup:** Direct at https://soberfounders.org/events/ (no interview)
- **Website label:** "Free · Open to All"
- **This is the primary gateway** — `/events` is the main entry point for all marketing

### Tuesday "All Our Affairs" Mastermind
- **Eligibility:** $250K+ annual revenue, 2+ full-time employees, **>1 year sober** (NOT ≥1 year), actively working the 12 steps
- **When:** Every Tuesday, 12 PM ET
- **Cost:** Free
- **Signup:** Verification interview required — https://soberfounders.org/apply/
- **Website label:** "Free · Verified Members"
- **Note:** People who qualify for Tuesday are still welcome to also join Thursday

### Phoenix Forum
- **Eligibility:** $1M+ annual revenue, 1+ year sober, curated selection
- **When:** Monthly "hot seat" sessions
- **Cost:** $499/month per member
- **Group size:** Max 10 per group
- **Signup:** Interview required — https://soberfounders.org/phoenix-forum-2nd-group/
- **Website label:** "Curated · Application Only"
- **Positioning:** Like YPO/Vistage/EO but for founders in recovery

### WhatsApp Community (Tertiary)
- 24/7 private WhatsApp group, free for all members across tiers

### Funnel rules
- **Thursday** → `/events` (direct signup, primary CTA)
- **Tuesday/Phoenix** → their respective apply pages (never send to `/events`)
- Never mix up the funnels

---

## 4. Content & Language Rules

### Target audience
**Entrepreneurs in recovery from addiction.** Not "sober curious," not general mental health, not rehab seekers. The audience is the intersection of:
1. Entrepreneurs / business owners
2. People in active recovery from addiction

### Language
- Use: "in recovery," "sober entrepreneur," "founder in recovery"
- **NEVER** use "addict" as an identity label
- Normalize ambivalence and struggle, not just success
- Lead with lived experience and confidentiality

### CTAs — always frame ROI in two currencies
1. **Money:** revenue, pricing, cash flow
2. **Life:** sleep, family time, reduced anxiety, stronger recovery

### Content pillars
1. Business Performance in Recovery
2. Recovery-Safe Entrepreneurship
3. Emotional Honesty & Inner Life
4. Service & Impact
5. Community & Peer Support

---

## 5. Styling & Design System

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Primary green | `#00b286` | Buttons, CTAs |
| Accent teal | `#5eecc0` | Highlights, stats |
| Accent orange | `#f1972c` | Phoenix branding |
| Dark background | `#0a0a0a` | Page background |
| Card background | `#101828` | Content cards |

### Fonts
- **Headings:** DM Serif Display (weight 400)
- **Body:** Outfit / Inter (fallback: system sans-serif)
- Loaded from Google Fonts

### CSS patterns
- **Glassmorphism:** `backdrop-filter: blur(20px)` + semi-transparent background (`.sf-glass`)
- **Responsive breakpoints:** 768px (tablet), 480px (mobile)
- **Card hover:** `translateY(-4px)` + enhanced box-shadow
- **Transitions:** `transform 0.25s, box-shadow 0.25s` on cards

---

## 6. SEO & Structured Data

### Metadata
- **Domain:** https://soberfounders.org
- **OG title:** "Sober Founders — Sobriety Is a Competitive Advantage"
- **OG image:** `/assets/phoenix-static.jpg` (1920×1280)

### JSON-LD schema (in `layout.tsx`)
- **WebSite** — site metadata
- **NonprofitOrganization** — EIN: 33-4098435, founded 2024, three makesOffer entries
- **WebPage** — homepage metadata
- **Article** — auto-generated for case study pages

### Key SEO details
- EIN 33-4098435 displayed on homepage stats section and footer
- 501(c)(3) status prominently mentioned
- Candid Silver Transparency Seal 2025 on homepage
- Robots: index, follow, max-image-preview: large

---

## 7. Deployment

### Next.js (Vercel)
```bash
npm --prefix website install
npm --prefix website run build    # Must pass before pushing
npm --prefix website run lint     # Must pass before pushing
git push origin master:main       # Triggers Vercel deploy
```

**Critical:** Local branch is `master`, deploy branch is `main`. Always push `master:main`.

### WordPress direct deployments
Three deploy scripts push HTML directly to WordPress via REST API:

| Script | Target | Method |
|--------|--------|--------|
| `scripts/deploy-homepage.mjs` | WP Page ID 1989 | REST API PUT |
| `scripts/deploy-footer.mjs` | Custom endpoint `/sober/v1/footer` | Base64-encoded HTML |
| `scripts/deploy-website-test.mjs` | `/website-test/` page | Elementor Canvas template |

**Environment variables required:**
- `WP_SITE_URL` (default: `https://soberfounders.org`)
- `WP_USERNAME`
- `WP_APP_PASSWORD` (WordPress application password, not user password)

All deploy scripts support `--dry-run` for preview.

---

## 8. Homepage Section Order

1. **Hero** — Video/frame scrub with phoenix animation
2. **Definition** — "What is Sober Founders?"
3. **Stats grid** — 500+ entrepreneurs, $500M+ revenue, 98% say we helped, 2x weekly, EIN
4. **Divider**
5. **"How We Support Founders"** — 4 service cards (Thursday, Tuesday, WhatsApp, Phoenix)
6. **Testimonials** — 4 member quotes with case study links
7. **"Why Founders Choose Us"** — 3 benefit cards
8. **Trust/Transparency** — Candid seal + EIN
9. **Final CTA** — "Attend a Free Meeting" + "Apply to Phoenix Forum"
10. **Closing tagline** — "It's not the stopping of using, it's the starting of living"

---

## 9. Case Studies

**Data source:** `website/src/content/caseStudies.ts`

**Current studies:** Adam C., Josh C.

Each case study has: slug, name, title, summary, quote, heroLabel, metrics (label/value/detail), shifts, timeline (4 items), deep-dive sections, outcomes, significance.

**Routes:**
- `/case-studies` — grid listing
- `/case-studies/[slug]` — full page

Case studies are linked from the homepage testimonials section and the site footer.

---

## 10. Quick Reference: Do's and Don'ts

| DO | DON'T |
|----|-------|
| Use GSAP + Lenis for scroll animations | Use Framer Motion, CSS scroll-behavior, or scroll-snap |
| Use canvas for hero frame rendering | Use `<video>` autoplay for scroll-linked playback |
| Push `master:main` for Vercel deploy | Push to `master` remote (it won't deploy) |
| Run `lint` + `build` before pushing | Skip QA and push broken builds |
| Use "in recovery" / "sober entrepreneur" | Use "addict" as identity label |
| Send Thursday traffic to `/events` | Send Tuesday/Phoenix to `/events` |
| Frame value in money AND life quality | Focus only on business metrics |
| Clean up ScrollTrigger on unmount | Leave orphaned scroll listeners |
| Use CSS transitions for content cards | Use heavy JS animation for simple hover effects |
| Test mobile fallback (static image) | Assume canvas works on all devices |
