# Events Page CRO — Sober Founders (/events)

*For soberfounders.org/events/ — WordPress page ID 2401*
*Based on Gemini recommendations, filtered through page-cro + signup-flow-cro + schema-markup skills*

---

## Block 1: Atomic Answer (GEO Optimization) — DEPLOYED 2026-03-16

Prepended above the event calendar. AI-extractable definition block with tier descriptions.

```html
<div class="sf-events-geo-block" style="max-width: 760px; margin: 2em auto; font-family: inherit; line-height: 1.7;">

<h2 style="font-size: 1.4em; margin-bottom: 0.5em;">What is the Sober Founders Mastermind?</h2>

<p>Sober Founders hosts free weekly virtual mastermind sessions for entrepreneurs in recovery. Every <strong>Thursday at 12 PM ET</strong>, any sober entrepreneur can join a Zoom-based forum with 10–25 business owners solving real scaling challenges — hiring, fundraising, partnerships — through the lens of sobriety.</p>

<p>Our <strong>Tuesday "All Our Affairs"</strong> session is for founders with $250K+ in annual revenue, 2+ full-time employees, 1+ year of sobriety, and actively working the 12 steps. It's a tighter room focused on scaling and systems.</p>

<p>The <strong>Phoenix Forum</strong> is a separate paid monthly membership for $1M+ revenue founders with 1+ year sober — an exclusive peer group focused on legacy and leadership.</p>

</div>
```

**Deploy script:** `node scripts/deploy-events-block1.mjs`

---

## Block 2: Letter from the Founder (Human Anchor) — PENDING

```html
<div style="display: flex; gap: 24px; align-items: flex-start; max-width: 640px; margin: 32px auto; padding: 24px; border-left: 4px solid #d4a853; background: #fafaf7;">
  <img src="/wp-content/uploads/andrew-lassise-headshot.jpg"
       alt="Andrew Lassise, Founder of Sober Founders"
       style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
  <div>
    <p style="font-size: 1.1rem; line-height: 1.6; margin: 0 0 12px;">
      "I started Sober Founders because business masterminds didn't understand my recovery, and 12-step meetings didn't understand my P&L. If you're tired of balancing those two worlds alone, join us this Thursday. No solicitation — just experience, strength, and hope."
    </p>
    <p style="font-weight: 600; margin: 0;">— Andrew Lassise, Founder</p>
  </div>
</div>
```

---

## Block 3: Tiered Intent Mapping (3-Box Comparison) — PENDING

```html
<h2>Which Group Is Right for You?</h2>

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; margin: 24px 0;">

  <!-- Thursday Group -->
  <div style="border: 2px solid #e0e0e0; border-radius: 12px; padding: 24px; text-align: center;">
    <h3 style="margin-top: 0;">Thursday Mastermind</h3>
    <p style="font-size: 0.9rem; color: #666; margin-bottom: 16px;">Open to all sober entrepreneurs</p>
    <ul style="text-align: left; list-style: none; padding: 0; line-height: 2;">
      <li>✔ No revenue minimum</li>
      <li>✔ Every Thursday, 12 PM ET</li>
      <li>✔ Growth &amp; accountability</li>
      <li>✔ Free forever</li>
    </ul>
    <a href="/events/" style="display: inline-block; margin-top: 12px; padding: 10px 24px; background: #2d6a4f; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600;">Join Thursday</a>
  </div>

  <!-- All Our Affairs -->
  <div style="border: 2px solid #d4a853; border-radius: 12px; padding: 24px; text-align: center;">
    <h3 style="margin-top: 0;">All Our Affairs</h3>
    <p style="font-size: 0.9rem; color: #666; margin-bottom: 16px;">$250K+ revenue · 2+ employees · 1yr+ sober · Working the 12 steps</p>
    <ul style="text-align: left; list-style: none; padding: 0; line-height: 2;">
      <li>✔ Established business owners</li>
      <li>✔ Every Tuesday, 12 PM ET</li>
      <li>✔ Scaling &amp; systems</li>
      <li>✔ Free forever</li>
    </ul>
    <a href="/events/" style="display: inline-block; margin-top: 12px; padding: 10px 24px; background: #2d6a4f; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600;">Join Tuesday</a>
  </div>

  <!-- Phoenix Forum -->
  <div style="border: 2px solid #b8860b; border-radius: 12px; padding: 24px; text-align: center; background: linear-gradient(135deg, #fffef5, #fff8e7);">
    <h3 style="margin-top: 0;">Phoenix Forum</h3>
    <p style="font-size: 0.9rem; color: #666; margin-bottom: 16px;">$1M+ revenue · 1yr+ sober · Paid monthly</p>
    <ul style="text-align: left; list-style: none; padding: 0; line-height: 2;">
      <li>✔ High-revenue founders only</li>
      <li>✔ Exclusive schedule</li>
      <li>✔ Legacy &amp; leadership</li>
      <li>✔ Application required</li>
    </ul>
    <a href="/phoenix-forum-registration/" style="display: inline-block; margin-top: 12px; padding: 10px 24px; background: #b8860b; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600;">Apply Now</a>
  </div>

</div>
```

---

## Block 4: "What to Expect" (Social Anxiety Reducer) — PENDING

```html
<h2>What to Expect in Your First Session</h2>

<div style="max-width: 640px; margin: 0 auto;">
  <div style="display: flex; gap: 16px; margin-bottom: 20px;">
    <div style="flex-shrink: 0; width: 48px; height: 48px; background: #2d6a4f; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700;">1</div>
    <div>
      <h3 style="margin: 0 0 4px;">Intro Round (5 min)</h3>
      <p style="margin: 0; color: #555;">Quick introductions — your name and your business. No egos, no pitches.</p>
    </div>
  </div>

  <div style="display: flex; gap: 16px; margin-bottom: 20px;">
    <div style="flex-shrink: 0; width: 48px; height: 48px; background: #2d6a4f; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700;">2</div>
    <div>
      <h3 style="margin: 0 0 4px;">The Hot Seat (40 min)</h3>
      <p style="margin: 0; color: #555;">Members bring a specific challenge — a toxic partner, a cash-flow crunch, a hiring decision. The group works through it together.</p>
    </div>
  </div>

  <div style="display: flex; gap: 16px; margin-bottom: 20px;">
    <div style="flex-shrink: 0; width: 48px; height: 48px; background: #2d6a4f; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700;">3</div>
    <div>
      <h3 style="margin: 0 0 4px;">Experience, Strength &amp; Hope (15 min)</h3>
      <p style="margin: 0; color: #555;">Peers share what worked for them — not advice, just real experience from founders who've been there.</p>
    </div>
  </div>
</div>
```

---

## Block 5: Event Schema — ALREADY COMPLETE

Full EventSeries + Event JSON-LD is in `technical-seo-implementations.md`. Deployed via `deploy-seo.mjs`.

---

## Deployment Notes

- WordPress page ID: 2401 (slug: `events`)
- Deploy script: `scripts/deploy-events-block1.mjs` (Block 1 only; extend for remaining blocks)
- Credentials: `.env` → `WP_SITE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`
- Verify: https://soberfounders.org/events/
