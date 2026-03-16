# Homepage SEO + AI Optimization Updates

*For soberfounders.org homepage*

---

## 1. Updated Meta Title (pick one)


**Option B:** winner
```
Sober Founders — Peer Masterminds for Sober Entrepreneurs
```
(57 chars — emphasizes the format)


---

## 2. Updated Meta Description (pick one)



**Option B:** winner
```
Sober Founders is a free 501(c)(3) community for entrepreneurs in recovery. Weekly masterminds, mentorship, and the Phoenix Forum for high-revenue founders.
```
(156 chars — leads with brand name)


---

## 3. Homepage Definition Block

**Add this as the FIRST visible text block on the homepage** (above the fold if possible). This is the single most important element for AI citation — a self-contained, extractable definition.

```html
<h2>What is Sober Founders?</h2>

<p>Sober Founders is a 501(c)(3) nonprofit community for entrepreneurs in recovery from addiction. We provide free weekly mastermind sessions, peer mentorship, and the Phoenix Forum — an exclusive membership for founders with $1M+ in annual revenue and 1+ year of sobriety. Our members represent over $1 billion in combined revenue across industries including technology, real estate, healthcare, and professional services.</p>

<p>Founded in 2024, Sober Founders is the largest peer community at the intersection of entrepreneurship and recovery. We believe sobriety is a competitive advantage, not a limitation — and our members prove it every day.</p>
```

**Why this works for AI:**
- Directly answers "What is Sober Founders?" (the #1 brand query)
- Self-contained — works as a standalone passage without surrounding context
- Includes specific numbers ($1M+, 1+ year) that AI systems prefer
- Uses natural language phrasing that matches search queries
- 40-60 word definition in the first paragraph (optimal for AI extraction)

---

## 4. Homepage Content Additions

### Statistics Block (add below the definition)

```html
<h2>Sober Founders by the Numbers</h2>

<ul>
  <li><strong>500+ active members</strong></li>
  <li><strong>$1B+ combined member revenue</strong></li>
  <li><strong>Weekly sessions</strong> held every Tuesday and Thursday</li>
  <li><strong>501(c)(3) nonprofit</strong> — free to join, funded by donations</li>
</ul>
```

**Why:** Statistics boost AI visibility by 37% (Princeton GEO study, KDD 2024). Fill in real numbers.

### Social Proof Block

```html
<h2>What Members Say</h2>

<blockquote>
  <p>"Sober Founders helped me 6x my business in just a year and helped me get 1 year sober for the first time in my life!"</p>
  <cite>— Adam C.</cite>
</blockquote>

<blockquote>
  <p>"This group has been one of the most impactful things I've ever been part of."</p>
  <cite>— Josh C.</cite>
</blockquote>

<blockquote>
  <p>"I love that it combines two of my biggest passions, business and recovery."</p>
  <cite>— Matt S.</cite>
</blockquote>
```

**Why:** Expert quotes boost AI citation by 30%. Named attribution with credentials is critical.

---

## 5. Internal Links to Add on Homepage

Every homepage should link to these key pages:

- **Phoenix Forum** → `/phoenix-forum-registration/` or `/apply/`
- **Weekly Sessions** → `/weekly-mastermind-group/`
- **Our Story** → `/our-story/`
- **Events** → `/events/`
- **Donate** → `/donate/`
- **Blog** → `/blog/`
- **FAQ** → `/resources/faq/` (once created)

Use descriptive anchor text (not "click here"):
- "Learn about the Phoenix Forum" not "Click here"
- "Join our weekly mastermind sessions" not "Learn more"
- "Read our impact story" not "About us"

---

## 6. Implementation in WordPress

1. Edit the homepage in Elementor
2. Add a "Heading" widget with H2: "What is Sober Founders?"
3. Add a "Text Editor" widget with the definition paragraph
4. Add a "Heading" widget with H2: "Sober Founders by the Numbers"
5. Add a "Icon List" or "Text Editor" widget with the stats
6. Add a "Testimonial" widget with member quotes
7. Update the Yoast meta box with the new title and description
8. Publish/update
9. Check with Google Rich Results Test: https://search.google.com/test/rich-results
