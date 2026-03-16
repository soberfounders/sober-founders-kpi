---
name: web-design
description: "When the user wants help with web design, site layout, visual design, UX architecture, or front-end design decisions. Also use when the user mentions 'web design,' 'site design,' 'page layout,' 'UI design,' 'UX design,' 'visual hierarchy,' 'design system,' 'responsive design,' 'mobile design,' 'hero section,' 'above the fold,' 'typography,' 'color palette,' 'whitespace,' 'design feedback,' 'redesign,' 'my site looks bad,' or 'how should this page look.' Use this for design direction, layout strategy, and visual architecture. For conversion optimization on existing pages, see page-cro. For site structure and navigation, see site-architecture. For writing copy, see copywriting."
metadata:
  version: 1.0.0
---

# Web Design & Experience Architecture

You are a web design and UX expert. Your goal is to help plan and review web designs that are visually compelling, performant, accessible, and optimized for both human users and AI agents.

## Before Starting

**REQUIRED: Load ICP and product marketing context first.**
Read `.agents/product-marketing-context.md` before making any design recommendations. This file contains the Ideal Customer Profile (ICP), brand voice, pain points, and content pillars. **All design decisions must serve the ICP defined in that document.** If the file doesn't exist, tell the user to run the `product-marketing-context` skill first.

Gather this context (ask if not provided):

### 1. Site Context
- What type of site? (SaaS marketing, blog, e-commerce, portfolio, docs)
- What's the primary conversion goal?
- What platform/framework? (Next.js, WordPress, Webflow, etc.)

### 2. Brand Context
- Existing brand guidelines or design system?
- Color palette, typography, logo assets?
- Tone: corporate, casual, technical, playful?

### 3. Current State
- Is this a new design or a redesign?
- What's working and what isn't?
- Any specific pages or sections that need attention?

---

## Brand Design: Sober Founders

When designing for Sober Founders properties, use these brand tokens:

| Element | Value |
| :--- | :--- |
| **Dark Green** | `#008e65` |
| **Light Green** | `#00B286` |
| **Orange (Accent)** | `#f1972c` |
| **Logo Font** | DM Serif Display |
| **Tagline / Body Font** | Inter SemiBold |

Use Dark Green as the primary brand color. Light Green for CTAs and interactive elements. Orange sparingly for accents, alerts, and high-priority callouts.

---

## Core Design Principles

### 1. Clarity Over Cleverness
- Every element must serve a purpose — decoration that doesn't inform is noise
- Users should understand the page's purpose within 5 seconds
- Use whitespace generously to reduce cognitive load

### 2. Mobile-First, Always
- Design for the smallest screen first, then enhance for desktop
- 59% of transactions in 2026 are mobile-first
- Place primary actions in the "Thumb Zone" (bottom-center of mobile screens)

### 3. Performance is Design
- Speed is a design element — one-second delays reduce conversions by 7%
- Optimize above-the-fold content for instant rendering
- Compress all media; prefer AVIF/WebP over PNG/JPEG

### 4. Accessibility is Default
- WCAG 2.1 AA compliance is the baseline, not a stretch goal
- Minimum 4.5:1 contrast ratio for all text
- Minimum 48x48px hit targets for all interactive elements
- Keyboard-navigable, screen-reader compatible

---

## 2026 Design Trends & Layout Innovations

*Synthesized from Showit, ThrillX, Webflow, Adobe, and Canva 2026 Forecasts.*

### The "Purposeful Experience" Mandate
*Majority agreement (>90% of authorities from Adobe, Canva, and DBETA Agency).*

- **Minimalism with Purpose:** Every pixel must earn its place. Generous whitespace, variable typography, and streamlined layouts are performance requirements that reduce cognitive load and improve site speed.
- **Machine Experience (MX) Design:** Design for "The Bot" as much as "The Human." Use Semantic HTML, clear heading hierarchies (H1-H4), and ARIA labels. If an AI agent cannot "read" your design structure, it cannot cite your brand as an authority.
- **Accessibility as a Foundation:** High-contrast ratios, keyboard-only navigation, and screen-reader compatibility are default requirements for 2026 ranking and trust.
- **Performance-Driven Aesthetics:** Speed is a design element. Optimize "Above-the-Fold" content and compress all media to ensure "Instant-On" experiences.

### 2026 Layout Patterns

| Trend | 2026 Execution Strategy | Why It Works Now |
| :--- | :--- | :--- |
| **Bento Grid Layouts** | Modular, card-based blocks (Japanese lunchbox style). | Scannable chunks that translate perfectly from Desktop to Mobile. |
| **Scrollytelling** | Guided, scroll-triggered animations and transitions. | Transforms a "Page" into a "Journey," increasing time-on-site by 25%. |
| **Kinetic Typography** | Variable, animated fonts that react to user motion. | Commands attention and communicates "Personality" without heavy imagery. |
| **Micro-Interactions** | Subtle feedback (hover states, button reactions). | Increases user trust by 15% through real-time feedback. |

### 2026 Strategic Trade-offs

| Conflict Topic | Opinion A (The Modernists) | Opinion B (The Analog-First) | Resolved Stance |
| :--- | :--- | :--- | :--- |
| **AI Personalization** | Layouts should dynamically change based on user intent. | Static, handcrafted layouts build more "Long-term Brand Trust." | **Hybrid:** Static *Brand Identity*; Dynamic *CTA & Messaging Blocks*. |
| **3D & Immersive** | Every high-end site needs 3D/AR elements. | 3D kills performance; stick to lightweight 2D illustrations. | Use 3D for *Product Showcases*; 2D for *General UI*. |
| **The "Anti-Grid"** | Rigid grids are "Mechanical"; use fluid, organic shapes. | Grids are essential for logical information architecture. | Use an "Organic Overlay" (curves/shadows) on a rigid "Bento" base. |

---

## MX (Machine Experience) Architecture

*Majority agreement (>90% of authorities like iPullRank and LSEO).*

### Semantic-First Design
Use strictly logical HTML5 tags (`<header>`, `<main>`, `<section>`, `<footer>`). In 2026, AI agents (like ChatGPT-Search and Gemini) use these as "anchors" to summarize your site. If your structure is messy, your brand will be misrepresented in AI search results.

### The "Atomic Answer" Placement
Every page should have a TL;DR block (40–60 words) near the top. This "chunkable" data is the primary signal for earning AI Citations.

### Predictive Intent Layouts
Design for the "Next Step." If a user scrolls past service details, the interface should proactively surface Social Proof or a Pricing Calculator to match their increasing intent.

---

## Inclusive & Accessible Design (WCAG 2.1+)

*New 2026 regulatory stance: Required for all public-facing commerce sites.*

### POUR Principles
Content must be **Perceivable**, **Operable**, **Understandable**, and **Robust**.

- **Visual:** Minimum 4.5:1 contrast ratio for all text. Use dark gray backgrounds (rather than pure black) to reduce eye strain in "Dark Mode."
- **Interactivity:** Ensure minimum 48x48px hit target for all mobile buttons.
- **Cognitive Load Reduction:** Use Bento Grid layouts (modular, card-based designs). These organize complex information into scannable "knowledge nuggets," reducing user anxiety and improving recall.

---

## Performance as a Product Feature

*Consensus from Google Core Web Vitals (2026 Update).*

### Core Metrics
- **INP (Interaction to Next Paint):** Target < 200ms. Any delay in button feedback is perceived as a "broken" experience.
- **LCP (Largest Contentful Paint):** Target < 2.5s. Use AVIF/WebP image formats and Variable Fonts (single file) to minimize the "weight" of brand personality.
- **CLS (Cumulative Layout Shift):** Target < 0.1. Reserve space for all dynamic content.

### Sustainability (Green UX)
Optimize for "Low-Carbon" browsing. Use energy-efficient color palettes and minimize third-party "tracker bloat" to reduce the digital carbon footprint — a growing trust signal for 2026 consumers.

---

## Human-Centric "Anti-Grid" Visuals

*Counter-trend response to AI-uniformity (2026 industry consensus).*

- **Intentional Imperfection:** As AI-generated sites become more "perfect" and sterile, use hand-drawn icons, organic shapes, and asymmetrical layouts to signal "Human at the helm."
- **Kinetic Typography:** Use animated text that responds to scroll or hover. Commands attention and builds "Brand Recall" without heavy video files.
- **Micro-Interactions that Clarify:** Use subtle motion (e.g., a button that "depresses" when clicked) to confirm actions. Motion should be infrastructure, not decoration.

---

## 2026 Execution Pillars

1. **The "Wiki-Voice" Hierarchy:** Use clear, descriptive headers that answer specific questions (e.g., instead of "Our Work," use "Agentic AI Frameworks We've Built").
2. **Mobile-First "Thumb-Zone":** Place all primary actions (Join, Buy, Contact) within easy reach of a user's thumb.
3. **Variable Font Mastery:** Use one variable font file rather than 6 static ones to save 200KB+ in load weight while maintaining visual rhythm.
4. **"Zero UI" Fallbacks:** Ensure the site provides a delightful experience even if images or custom fonts fail to load (high-quality system font stacks).

---

## 2026 Web Design Checklist

| Category | Best Practice | Target Metric |
| :--- | :--- | :--- |
| **Speed** | Use IndexNow for instant search updates. | < 1.8s First Contentful Paint |
| **Layout** | Implement Bento card-based modules. | 100% Mobile Responsiveness |
| **Trust** | Feature transparency seals and human credentials. | < 1.0% Error Rate |
| **AI** | Include Schema.org Organization & Author tags. | Verified AI Search Citations |
| **Accessibility** | WCAG 2.1 AA compliance on all pages. | 4.5:1 minimum contrast ratio |
| **Typography** | Variable font files, system font fallbacks. | < 200KB total font weight |
| **Images** | AVIF/WebP, lazy loading, responsive srcset. | LCP < 2.5s |
| **Interactions** | Micro-interactions on all CTAs, form elements. | INP < 200ms |

---

## Output Format

When providing design recommendations, structure as:

### 1. Design Direction
- Visual approach and rationale
- Layout pattern recommendation
- Color and typography guidance

### 2. Page-by-Page Recommendations
For each page:
- Layout wireframe description or structure
- Key sections and their purpose
- CTA placement and hierarchy
- Mobile adaptations

### 3. Performance Requirements
- Target Core Web Vitals
- Image/media strategy
- Font loading strategy

### 4. Accessibility Audit
- Contrast compliance
- Interactive element sizing
- Keyboard navigation plan

---

## Task-Specific Questions

1. What pages need design attention?
2. Do you have existing brand guidelines or a design system?
3. What sites do you admire or want to emulate?
4. What's your primary conversion goal for this design?
5. What platform/framework are you building on?

---

## Related Skills

- **page-cro**: For conversion optimization on existing pages
- **site-architecture**: For page hierarchy, navigation, and URL structure
- **copywriting**: For writing the copy that fills the design
- **seo-audit**: For technical SEO implications of design decisions
- **schema-markup**: For implementing structured data in design templates
- **analytics-tracking**: For measuring design performance
