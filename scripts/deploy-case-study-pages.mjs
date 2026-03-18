#!/usr/bin/env node
/**
 * deploy-case-study-pages.mjs - Create/update the live WordPress case study pages.
 *
 * Pages:
 * - /case-studies/
 * - /case-studies/adam-c/
 * - /case-studies/josh-c/
 *
 * Usage:
 *   node scripts/deploy-case-study-pages.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  let envPath = resolve(ROOT, ".env.local");
  try {
    readFileSync(envPath, "utf8");
  } catch {
    envPath = resolve(ROOT, ".env");
  }
  const lines = readFileSync(envPath, "utf8").replace(/\r/g, "").split("\n");
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString(
  "base64",
);
const DRY_RUN = process.argv.includes("--dry-run");

const headers = {
  "Content-Type": "application/json",
  Authorization: `Basic ${AUTH}`,
};

const caseStudies = [
  {
    slug: "adam-c",
    name: "Adam C.",
    title:
      "How Adam C. grew from $36k to $120k MRR and reached one year sober for the first time in more than 20 years",
    summary:
      "After 18 months of active participation in Sober Founders, Adam used Thursday meetings, WhatsApp support, and peer guidance to grow revenue, build better boundaries, and become more present with his family.",
    label: "Revenue Up. Presence Restored.",
    accent: "Family time stopped being the thing work kept stealing.",
    quote:
      "Sober Founders and the guidance I've received have been invaluable to my business, but even more importantly, to my family. Growing from $36k to $120k MRR was incredible. But being sober, being present, and spending time with my family has been the real blessing.",
    quoteAttribution: "Adam C., Sober Founders member",
    ctaLabel: "Attend The Meeting That Changed His Life - For Free",
    ctaHref: "/events/",
    programTags: ["Thursday Mastermind", "WhatsApp Community", "18 Months Active"],
    shifts: [
      {
        title: "From endless hours to real boundaries",
        detail:
          "He stopped using overwork as proof that he cared and started protecting the time he already said mattered.",
      },
      {
        title: "From isolation to belonging",
        detail:
          "Thursday meetings and WhatsApp replaced carrying everything alone with honest peer support from founders who understood the stakes.",
      },
      {
        title: "From revenue pressure to sustainable growth",
        detail:
          "Instead of working harder at a chaotic pace, he made better decisions with more support and more clarity.",
      },
    ],
    metrics: [
      ["MRR Growth", "$36k -> $120k", "From the start of 2024 to the end of 2025."],
      [
        "Sobriety Milestone",
        "12 Months Sober",
        "Reached in September 2025 for the first time in his life.",
      ],
      [
        "Family Impact",
        "Fully Present",
        "More time with family, more events attended, and more phone-off time.",
      ],
    ],
    timeline: [
      [
        "Early 2024",
        "Starts at $36k MRR",
        "Adam was working nonstop to support his family, but the work itself was taking him away from them.",
      ],
      [
        "2024 to 2025",
        "Leans on Thursday meetings and WhatsApp",
        "He found peers who had felt the same pressure, shared what worked, and gave him a sense of belonging instead of isolation.",
      ],
      [
        "September 2025",
        "Hits 12 months sober",
        "It was the first full year sober since he started drinking more than 20 years earlier.",
      ],
      [
        "End of 2025",
        "Reaches $120k MRR",
        "The business grew while he became more present with family and more able to fully disconnect.",
      ],
    ],
    sections: [
      [
        "Before Sober Founders",
        [
          "Adam was working endless hours to support his family, but the paradox was that the work was taking him away from them.",
          "He had no real boundaries in place. The more pressure he felt to provide, the more work swallowed his time, energy, and attention.",
          "That extra stress, plus less time with family, made it easier to lean on substances again.",
        ],
      ],
      [
        "What He Found In The Community",
        [
          "Adam started showing up consistently to Thursday meetings, stayed close in the WhatsApp group, and leaned on the community instead of trying to carry everything alone.",
          "He found founders who knew exactly how that pressure felt because they had been where he had been and found a way through it.",
          "Nobody told him what to do. Members shared what had worked for them, Adam took what fit, and he ran with it.",
        ],
      ],
      [
        "What Changed",
        [
          "Over 18 months, Adam grew from $36k MRR at the start of 2024 to $120k MRR by the end of 2025.",
          "In September 2025, he reached 12 months sober for the first time since he started drinking more than 20 years earlier.",
          "Now he spends more time with his family, takes vacations while the business runs without him, and can show up to events without staying chained to his phone.",
        ],
      ],
    ],
    significanceTitle:
      "Nobody handed Adam a script. He found a room full of people who understood the stakes.",
    significanceBody:
      "Sober Founders did not ask Adam to perform or pretend he had it handled. It gave him a place to be honest, take what was useful, and apply it in a way that fit his business, his recovery, and his family.",
    outcomes: [
      "He built stronger boundaries instead of using nonstop work as proof that he cared.",
      "He found belonging and guidance from founders in recovery who understood both business pressure and sobriety.",
      "He can now leave his phone alone long enough to be genuinely present with his family.",
      "He is now helping other members apply what worked for him.",
    ],
  },
  {
    slug: "josh-c",
    name: "Josh C.",
    title:
      "How Josh C. broke a business plateau, grew 30% in Phoenix Forum, and stopped thinking about drinking",
    summary:
      "Between 2024 and 2026, Josh used the Tuesday All Our Affairs group and Phoenix Forum to get out of dangerous substance-driven decision making, niche his business, and build a calmer, more intentional life with his wife and daughters.",
    label: "Plateau Broken. Mind Clear.",
    accent:
      "The business started growing again once he stopped glorifying hustle and started being intentional.",
    quote:
      "Every morning I wake up energized and ready to take on the world - substance free. My business is growing, my relationships are better, and Sober Founders played a big role in shifting how I viewed things.",
    quoteAttribution:
      "Josh C., Tuesday All Our Affairs and Phoenix Forum member",
    ctaLabel: "Apply for the Tuesday All Our Affairs Group",
    ctaHref: "/apply/",
    programTags: ["Tuesday All Our Affairs", "Phoenix Forum", "2024 to 2026"],
    shifts: [
      {
        title: "From hustle culture to productive focus",
        detail:
          "He stopped buying into the grind-and-network mentality and started using his time with more intention.",
      },
      {
        title: "From resentment to cleanup",
        detail:
          "He faced the major unresolved issues he had been holding onto so they would stop driving decisions underneath the surface.",
      },
      {
        title: "From taking anything to intentional positioning",
        detail:
          "Niching changed the business from accepting whatever came in to choosing the work that fit.",
      },
    ],
    metrics: [
      ["Business Growth", "+30%", "Growth after his first year in Phoenix Forum."],
      [
        "Recovery Shift",
        "Several Years Sober",
        "He no longer thinks about having a drink.",
      ],
      [
        "Family Stability",
        "Support At Home",
        "He can show up for and support his wife and daughters.",
      ],
    ],
    timeline: [
      [
        "Before 2024",
        "Plateau and dangerous decision making",
        "The business had not grown in several years, and substance use was pushing him toward decisions that put him in danger.",
      ],
      [
        "2024",
        "Starts showing up in Tuesday and Phoenix Forum",
        "He entered rooms where honesty, productivity, and step-driven business thinking mattered more than image or hustle.",
      ],
      [
        "First year in Phoenix Forum",
        "Business grows 30%",
        "Niching, better decisions, and more intentional use of time helped unlock growth after years of stalling.",
      ],
      [
        "2026",
        "Several years sober and steadier at home",
        "He no longer thinks about a drink and can support his wife and daughters with more consistency and clarity.",
      ],
    ],
    sections: [
      [
        "Before Sober Founders",
        [
          "Josh had been making terrible decisions that put himself in danger because of substances.",
          "At the same time, the business was plateaued. It had not grown in several years, which left him stuck in the kind of frustration that can make bad patterns feel normal.",
        ],
      ],
      [
        "What Changed In Tuesday And Phoenix Forum",
        [
          "Josh moved away from the hustle, grind, and constant-networking mentality that gets pushed everywhere in business media.",
          "Instead, he focused on being productive with the time he had. He also realized there were major negative things he had been holding onto that needed to be dealt with so the resentment would stop running the show.",
          "Niching his business changed the way he operated. He stopped taking whatever he could get and started being intentional about the work he pursued.",
        ],
      ],
      [
        "Where He Is Now",
        [
          "After his first year in Phoenix Forum, Josh grew the business by 30 percent.",
          "Now he has several years sober, no longer thinks about having a drink, and can support his daughters and wife from a much more stable place.",
          "His business is growing, his relationships are stronger, and he wakes up with energy instead of chaos.",
        ],
      ],
    ],
    significanceTitle:
      "Josh did not need more pressure. He needed a better frame for how to work, lead, and stay sober.",
    significanceBody:
      "The turning point was not just accountability. It was getting into rooms where recovery and business were treated as connected disciplines, not separate boxes. That changed how he used his time, how he handled resentment, and how he built the business going forward.",
    outcomes: [
      "He replaced media-driven hustle instincts with more productive and intentional use of time.",
      "He addressed the unresolved pain and resentment that were shaping his decisions underneath the surface.",
      "He niched the business instead of taking whatever work appeared, which helped restart growth.",
      "He built a life where sobriety, business momentum, and family support reinforce each other.",
    ],
  },
];

function buildSharedStyles() {
  return `
  <style>
    .sf-case-page { font-family: inherit; color: #e5e7eb; background: #050505; }
    .sf-case-page * { box-sizing: border-box; }
    .sf-case-page a { text-decoration: none !important; }
    .sf-case-wrap { max-width: 1120px; margin: 0 auto; padding: 72px 24px 88px; }
    .sf-case-back { display: inline-block; margin-bottom: 24px; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: #00b286 !important; }
    .sf-case-hero {
      display: grid;
      grid-template-columns: 1.08fr 0.92fr;
      gap: 28px;
      margin-bottom: 28px;
    }
    .sf-case-hero-main,
    .sf-case-hero-side,
    .sf-case-panel,
    .sf-case-card,
    .sf-case-metric,
    .sf-case-timeline-item,
    .sf-case-outcome,
    .sf-case-hub-card {
      border: 1px solid rgba(255,255,255,0.1);
      background: linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
      backdrop-filter: blur(18px);
      box-shadow: 0 24px 100px rgba(0,0,0,0.3);
    }
    .sf-case-hero-main { border-radius: 30px; padding: 34px; }
    .sf-case-hero-side { border-radius: 30px; padding: 28px; }
    .sf-case-kicker,
    .sf-case-label {
      display: inline-block;
      padding: 7px 12px;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.18em;
    }
    .sf-case-kicker {
      color: #00b286;
      background: rgba(0,178,134,0.12);
      border: 1px solid rgba(0,178,134,0.22);
      margin-bottom: 18px;
    }
    .sf-case-tags { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
    .sf-case-label {
      color: rgba(255,255,255,0.75);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .sf-case-hero-main h1,
    .sf-case-panel h2,
    .sf-case-card h2,
    .sf-case-timeline-head h2,
    .sf-case-cta h2,
    .sf-case-hub-hero h1,
    .sf-case-hub-card h3 {
      font-family: "DM Serif Display", serif;
      font-weight: 400;
      color: #ffffff;
    }
    .sf-case-hero-main h1 { font-size: clamp(2.3rem, 5vw, 4.8rem); line-height: 0.96; margin: 0 0 18px; }
    .sf-case-hero-main p,
    .sf-case-card p,
    .sf-case-panel p,
    .sf-case-timeline-item p,
    .sf-case-outcome p,
    .sf-case-hub-card p {
      color: rgba(255,255,255,0.72);
      line-height: 1.8;
      margin: 0;
    }
    .sf-case-accent {
      margin-top: 24px;
      padding: 20px 22px;
      border-radius: 22px;
      border: 1px solid rgba(241,151,44,0.18);
      background: linear-gradient(135deg, rgba(241,151,44,0.12), rgba(255,255,255,0.02));
    }
    .sf-case-accent strong,
    .sf-case-metric strong,
    .sf-case-timeline-item strong,
    .sf-case-outcome strong,
    .sf-case-panel strong,
    .sf-case-hub-card strong {
      display: block;
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      margin-bottom: 10px;
      color: #f7bb74;
    }
    .sf-case-accent p {
      font-family: "DM Serif Display", serif;
      font-size: 1.34rem;
      line-height: 1.18;
      color: #ffffff;
    }
    .sf-case-actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px; }
    .sf-case-btn,
    .sf-case-btn-alt {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 13px 22px;
      border-radius: 999px;
      font-size: 0.88rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .sf-case-btn {
      background: #00b286;
      color: #ffffff !important;
    }
    .sf-case-btn-alt {
      border: 1px solid rgba(255,255,255,0.18);
      color: rgba(255,255,255,0.88) !important;
    }
    .sf-case-quote {
      font-family: "DM Serif Display", serif;
      font-size: 1.2rem;
      line-height: 1.85;
      color: rgba(255,255,255,0.9);
      margin: 14px 0 0;
    }
    .sf-case-cite {
      margin-top: 18px;
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #00b286;
    }
    .sf-case-shifts { display: grid; gap: 12px; margin-top: 18px; }
    .sf-case-shift {
      padding: 18px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(0,0,0,0.24);
    }
    .sf-case-shift strong { color: #00b286; }
    .sf-case-metrics,
    .sf-case-sections,
    .sf-case-outcomes-grid,
    .sf-case-hub-grid {
      display: grid;
      gap: 18px;
    }
    .sf-case-metrics { grid-template-columns: repeat(3, 1fr); margin-bottom: 28px; }
    .sf-case-sections { grid-template-columns: repeat(3, 1fr); margin-bottom: 28px; }
    .sf-case-outcomes-grid { grid-template-columns: repeat(2, 1fr); margin-top: 18px; }
    .sf-case-metric,
    .sf-case-card,
    .sf-case-outcome { padding: 24px; border-radius: 24px; }
    .sf-case-metric-value {
      font-size: 2rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 10px;
    }
    .sf-case-grid-panels {
      display: grid;
      grid-template-columns: 0.92fr 1.08fr;
      gap: 22px;
      margin-bottom: 28px;
    }
    .sf-case-panel {
      border-radius: 28px;
      padding: 26px;
    }
    .sf-case-panel h2,
    .sf-case-card h2 {
      font-size: 1.65rem;
      line-height: 1.08;
      margin: 0 0 16px;
    }
    .sf-case-outcome {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      background: rgba(0,0,0,0.22);
    }
    .sf-case-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #00b286;
      margin-top: 12px;
      flex-shrink: 0;
    }
    .sf-case-timeline {
      border-radius: 30px;
      padding: 30px;
      margin-bottom: 28px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(18px);
    }
    .sf-case-timeline-head h2 {
      font-size: clamp(1.8rem, 4vw, 3rem);
      line-height: 1.02;
      margin: 14px 0 0;
    }
    .sf-case-timeline-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-top: 26px;
    }
    .sf-case-timeline-item {
      position: relative;
      border-radius: 22px;
      padding: 22px;
      overflow: hidden;
      background: rgba(0,0,0,0.2);
    }
    .sf-case-timeline-index {
      position: absolute;
      top: 18px;
      right: 18px;
      font-size: 3rem;
      font-weight: 700;
      color: rgba(255,255,255,0.06);
    }
    .sf-case-cta {
      margin-top: 26px;
      padding: 30px;
      border-radius: 32px;
      border: 1px solid rgba(0,178,134,0.18);
      background: linear-gradient(135deg, rgba(94,236,192,0.12), rgba(255,255,255,0.04));
      box-shadow: 0 24px 80px rgba(0,0,0,0.24);
    }
    .sf-case-cta h2 { font-size: clamp(1.8rem, 3.5vw, 2.8rem); line-height: 1.04; margin: 12px 0; }

    .sf-case-hub-hero { margin-bottom: 28px; display: grid; grid-template-columns: 0.95fr 1.05fr; gap: 24px; align-items: end; }
    .sf-case-hub-hero h1 { font-size: clamp(2.3rem, 5vw, 4.8rem); line-height: 0.96; margin: 18px 0 0; }
    .sf-case-hub-side {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .sf-case-hub-note {
      padding: 18px;
      border-radius: 22px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(0,0,0,0.24);
    }
    .sf-case-hub-note strong { color: #00b286; }
    .sf-case-hub-grid { grid-template-columns: 1fr; }
    .sf-case-hub-card { border-radius: 30px; padding: 28px; }
    .sf-case-hub-card h3 { font-size: clamp(1.75rem, 3vw, 2.7rem); line-height: 1.08; margin: 0 0 14px; }
    .sf-case-hub-accent {
      margin-top: 18px;
      padding: 18px;
      border-radius: 20px;
      border: 1px solid rgba(241,151,44,0.16);
      background: linear-gradient(135deg, rgba(241,151,44,0.12), rgba(255,255,255,0.02));
      font-family: "DM Serif Display", serif;
      font-size: 1.2rem;
      color: #ffffff;
      line-height: 1.18;
    }
    .sf-case-hub-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 20px;
    }
    .sf-case-hub-metric {
      padding: 18px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(0,0,0,0.24);
    }
    .sf-case-hub-metric-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .sf-case-hub-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }

    @media (max-width: 980px) {
      .sf-case-hero,
      .sf-case-grid-panels,
      .sf-case-hub-hero {
        grid-template-columns: 1fr;
      }
      .sf-case-hub-side,
      .sf-case-metrics,
      .sf-case-sections,
      .sf-case-timeline-grid,
      .sf-case-hub-metrics {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 700px) {
      .sf-case-outcomes-grid {
        grid-template-columns: 1fr;
      }
      .sf-case-wrap {
        padding-top: 56px;
        padding-bottom: 72px;
      }
      .sf-case-hero-main,
      .sf-case-hero-side,
      .sf-case-timeline,
      .sf-case-panel,
      .sf-case-card,
      .sf-case-cta,
      .sf-case-hub-card {
        padding: 24px;
      }
    }
  </style>`;
}

function buildCaseStudyPage(study) {
  const tagMarkup = study.programTags
    .map((tag) => `<span class="sf-case-label">${tag}</span>`)
    .join("");

  const metricsMarkup = study.metrics
    .map(
      ([label, value, detail]) => `
        <div class="sf-case-metric">
          <strong>${label}</strong>
          <div class="sf-case-metric-value">${value}</div>
          <p>${detail}</p>
        </div>`,
    )
    .join("");

  const shiftsMarkup = study.shifts
    .map(
      (shift) => `
        <div class="sf-case-shift">
          <strong>${shift.title}</strong>
          <p>${shift.detail}</p>
        </div>`,
    )
    .join("");

  const timelineMarkup = study.timeline
    .map(
      ([period, title, detail], index) => `
        <div class="sf-case-timeline-item">
          <div class="sf-case-timeline-index">${index + 1}</div>
          <strong>${period}</strong>
          <h3 style="font-family:'DM Serif Display',serif;font-weight:400;font-size:1.35rem;line-height:1.08;color:#fff;margin:0 0 12px;">${title}</h3>
          <p>${detail}</p>
        </div>`,
    )
    .join("");

  const sectionMarkup = study.sections
    .map(
      ([title, paragraphs]) => `
        <div class="sf-case-card">
          <h2>${title}</h2>
          ${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;">${paragraph}</p>`).join("")}
        </div>`,
    )
    .join("");

  const outcomesMarkup = study.outcomes
    .map(
      (outcome) => `
        <div class="sf-case-outcome">
          <span class="sf-case-dot"></span>
          <p>${outcome}</p>
        </div>`,
    )
    .join("");

  return `<!-- wp:html -->
${buildSharedStyles()}
<div class="sf-case-page">
  <div class="sf-case-wrap">
    <a class="sf-case-back" href="/case-studies/">&larr; Back to Case Studies</a>

    <div class="sf-case-hero">
      <div class="sf-case-hero-main">
        <span class="sf-case-kicker">${study.label}</span>
        <div class="sf-case-tags">${tagMarkup}</div>
        <h1>${study.title}</h1>
        <p>${study.summary}</p>

        <div class="sf-case-accent">
          <strong>The Core Shift</strong>
          <p>${study.accent}</p>
        </div>

        <div class="sf-case-actions">
          <a class="sf-case-btn" href="${study.ctaHref}">${study.ctaLabel}</a>
          <a class="sf-case-btn-alt" href="/case-studies/">View All Case Studies</a>
        </div>
      </div>

      <div class="sf-case-hero-side">
        <strong>Featured Quote</strong>
        <p class="sf-case-quote">&ldquo;${study.quote}&rdquo;</p>
        <div class="sf-case-cite">${study.quoteAttribution}</div>

        <div class="sf-case-shifts">${shiftsMarkup}</div>
      </div>
    </div>

    <div class="sf-case-metrics">${metricsMarkup}</div>

    <div class="sf-case-timeline">
      <div class="sf-case-timeline-head">
        <strong style="display:block;font-size:0.76rem;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,255,255,0.45);">Timeline</strong>
        <h2>Growth got real when the internal shift matched the external one.</h2>
      </div>
      <div class="sf-case-timeline-grid">${timelineMarkup}</div>
    </div>

    <div class="sf-case-sections">${sectionMarkup}</div>

    <div class="sf-case-grid-panels">
      <div class="sf-case-panel">
        <strong style="display:block;font-size:0.76rem;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,255,255,0.45);">Why This Story Matters</strong>
        <h2>${study.significanceTitle}</h2>
        <p>${study.significanceBody}</p>
      </div>
      <div class="sf-case-panel">
        <strong style="display:block;font-size:0.76rem;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,255,255,0.45);">Lasting Outcomes</strong>
        <div class="sf-case-outcomes-grid">${outcomesMarkup}</div>
      </div>
    </div>

    <div class="sf-case-cta">
      <strong style="display:block;font-size:0.76rem;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:#00b286;">Next Step</strong>
      <h2>Want the same kind of room ${study.name.split(" ")[0]} found?</h2>
      <p style="color:rgba(255,255,255,0.74);line-height:1.8;max-width:700px;">Start with the next room that fits. The right environment can change the way you work, the way you relate to pressure, and the kind of life your business makes possible.</p>
      <div class="sf-case-actions">
        <a class="sf-case-btn" href="${study.ctaHref}">${study.ctaLabel}</a>
      </div>
    </div>
  </div>
</div>
<!-- /wp:html -->`;
}

function buildHubPage(studies) {
  const cardsMarkup = studies
    .map((study) => {
      const tags = study.programTags
        .map((tag) => `<span class="sf-case-label">${tag}</span>`)
        .join("");

      const metrics = study.metrics
        .map(
          ([label, value, detail]) => `
            <div class="sf-case-hub-metric">
              <strong>${label}</strong>
              <div class="sf-case-hub-metric-value">${value}</div>
              <p>${detail}</p>
            </div>`,
        )
        .join("");

      return `
        <div class="sf-case-hub-card">
          <span class="sf-case-kicker">${study.label}</span>
          <div class="sf-case-tags">${tags}</div>
          <h3>${study.title}</h3>
          <p>${study.summary}</p>
          <div class="sf-case-hub-accent">${study.accent}</div>
          <div class="sf-case-hub-metrics">${metrics}</div>
          <div class="sf-case-hub-actions">
            <a class="sf-case-btn" href="/case-studies/${study.slug}/">Read The Full Story</a>
            <a class="sf-case-btn-alt" href="${study.ctaHref}">${study.ctaLabel}</a>
          </div>
        </div>`;
    })
    .join("");

  return `<!-- wp:html -->
${buildSharedStyles()}
<div class="sf-case-page">
  <div class="sf-case-wrap">
    <div class="sf-case-hub-hero">
      <div class="sf-case-hub-main">
        <span class="sf-case-kicker">Case Studies</span>
        <h1>Real founders. Real numbers. Real life getting better.</h1>
        <p style="max-width:680px;color:rgba(255,255,255,0.72);line-height:1.8;margin:18px 0 0;">Revenue matters. Sobriety matters. Family matters. These case studies show what Sober Founders looks like when growth stops coming at the expense of the rest of your life.</p>
      </div>
      <div class="sf-case-hub-side">
        <div class="sf-case-hub-note">
          <strong>Not Just Testimonials</strong>
          <p>These pages show the before, the shift, the actual numbers, and the life impact.</p>
        </div>
        <div class="sf-case-hub-note">
          <strong>Two Currencies</strong>
          <p>Each story tracks business growth and the part that matters just as much outside work.</p>
        </div>
        <div class="sf-case-hub-note">
          <strong>Next Step</strong>
          <p>Every story ends with the room that best matches the case study, so the next action is clear.</p>
        </div>
      </div>
    </div>

    <div class="sf-case-hub-grid">${cardsMarkup}</div>
  </div>
</div>
<!-- /wp:html -->`;
}

async function wpFetch(path, options = {}) {
  const res = await fetch(`${SITE}${path}`, {
    headers,
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP API ${res.status} ${res.statusText}: ${body}`);
  }

  return res.json();
}

async function findPageBySlug(slug) {
  const pages = await wpFetch(
    `/wp-json/wp/v2/pages?slug=${slug}&status=publish,draft,private&per_page=20&context=edit`,
  );
  return Array.isArray(pages) && pages.length ? pages[0] : null;
}

async function upsertPage({ slug, title, content, parent = 0 }) {
  const existing = await findPageBySlug(slug);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] ${existing ? "Update" : "Create"} /${slug}/`);
    return {
      id: existing?.id ?? null,
      link: existing?.link ?? `${SITE}/${slug}/`,
    };
  }

  const body = {
    title,
    slug,
    parent,
    status: "publish",
    content,
  };

  if (existing) {
    const updated = await wpFetch(`/wp-json/wp/v2/pages/${existing.id}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return updated;
  }

  return wpFetch(`/wp-json/wp/v2/pages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function verifyPage(url, expectedText) {
  const res = await fetch(url);
  const html = await res.text();
  return html.includes(expectedText);
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Case Study Pages Deploy");
  console.log(`  Target: ${SITE}/case-studies/`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  const hubPage = await upsertPage({
    slug: "case-studies",
    title: "Case Studies",
    content: buildHubPage(caseStudies),
  });
  console.log(`  ${DRY_RUN ? "-" : "✓"} Hub page ready: ${hubPage.link}`);

  const parentId = hubPage.id ?? (await findPageBySlug("case-studies"))?.id ?? 0;

  for (const study of caseStudies) {
    const page = await upsertPage({
      slug: study.slug,
      title: `${study.name} Case Study`,
      content: buildCaseStudyPage(study),
      parent: parentId,
    });

    console.log(`  ${DRY_RUN ? "-" : "✓"} ${study.name} ready: ${page.link}`);

    if (!DRY_RUN) {
      const expectedText = study.title.split(" ")[0];
      const verified = await verifyPage(page.link, expectedText);
      console.log(`    ${verified ? "✓" : "x"} Live verify: ${verified}`);
    }
  }

  if (!DRY_RUN) {
    const hubVerified = await verifyPage(`${SITE}/case-studies/`, "Real founders. Real numbers.");
    console.log(`  ${hubVerified ? "✓" : "x"} Hub live verify: ${hubVerified}`);
  }

  console.log("");
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
