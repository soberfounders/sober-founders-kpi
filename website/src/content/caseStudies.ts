export type CaseStudyMetric = {
  label: string;
  value: string;
  detail: string;
};

export type CaseStudySection = {
  title: string;
  paragraphs: string[];
};

export type CaseStudyShift = {
  title: string;
  detail: string;
};

export type CaseStudyTimelineItem = {
  period: string;
  title: string;
  detail: string;
};

export type CaseStudy = {
  slug: string;
  name: string;
  title: string;
  summary: string;
  quote: string;
  quoteAttribution: string;
  heroLabel: string;
  heroAccent: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  programTags: string[];
  metrics: CaseStudyMetric[];
  shifts: CaseStudyShift[];
  timeline: CaseStudyTimelineItem[];
  sections: CaseStudySection[];
  outcomes: string[];
  significanceTitle: string;
  significanceBody: string;
};

export const adamCStudy: CaseStudy = {
  slug: "adam-c",
  name: "Adam C.",
  title:
    "How Adam C. grew from $36k to $120k MRR and reached one year sober for the first time in more than 20 years",
  summary:
    "After 18 months of active participation in Sober Founders, Adam C. used Thursday meetings, WhatsApp support, and peer guidance to grow revenue, build better boundaries, and become more present with his family.",
  quote:
    "Sober Founders and the guidance I've received have been invaluable to my business, but even more importantly, to my family. Growing from $36k to $120k MRR was incredible. But being sober, being present, and spending time with my family has been the real blessing.",
  quoteAttribution: "Adam C., Sober Founders member",
  heroLabel: "Revenue Up. Presence Restored.",
  heroAccent: "Family time stopped being the thing work kept stealing.",
  primaryCtaLabel: "Attend The Meeting That Changed His Life - For Free",
  primaryCtaHref: "/events/",
  secondaryCtaLabel: "View All Case Studies",
  secondaryCtaHref: "/case-studies",
  programTags: ["Thursday Mastermind", "WhatsApp Community", "18 Months Active"],
  metrics: [
    {
      label: "MRR Growth",
      value: "$36k -> $120k",
      detail: "From the start of 2024 to the end of 2025.",
    },
    {
      label: "Sobriety Milestone",
      value: "12 Months Sober",
      detail: "Reached in September 2025 for the first time in his life.",
    },
    {
      label: "Family Impact",
      value: "Fully Present",
      detail: "More time with family, more events attended, more phone-off time.",
    },
  ],
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
  timeline: [
    {
      period: "Early 2024",
      title: "Starts at $36k MRR",
      detail:
        "Adam was working nonstop to support his family, but the work itself was taking him away from them.",
    },
    {
      period: "2024 to 2025",
      title: "Leans on Thursday meetings and WhatsApp",
      detail:
        "He found peers who had felt the same pressure, shared what worked, and gave him a sense of belonging instead of isolation.",
    },
    {
      period: "September 2025",
      title: "Hits 12 months sober",
      detail:
        "It was the first full year sober since he started drinking more than 20 years earlier.",
    },
    {
      period: "End of 2025",
      title: "Reaches $120k MRR",
      detail:
        "The business grew while he became more present with family and more able to fully disconnect.",
    },
  ],
  sections: [
    {
      title: "Before Sober Founders",
      paragraphs: [
        "Adam was working endless hours to support his family, but the paradox was that the work was taking him away from them.",
        "He had no real boundaries in place. The more pressure he felt to provide, the more work swallowed his time, energy, and attention.",
        "That extra stress, plus less time with family, made it easier to lean on substances again.",
      ],
    },
    {
      title: "What He Found In The Community",
      paragraphs: [
        "Adam started showing up consistently to Thursday meetings, stayed close in the WhatsApp group, and leaned on the community instead of trying to carry everything alone.",
        "He found founders who knew exactly how that pressure felt because they had been where he had been and found a way through it.",
        "Nobody told him what to do. Members shared what had worked for them, Adam took what fit, and he ran with it.",
      ],
    },
    {
      title: "What Changed",
      paragraphs: [
        "Over 18 months, Adam grew from $36k MRR at the start of 2024 to $120k MRR by the end of 2025.",
        "In September 2025, he reached 12 months sober for the first time since he started drinking more than 20 years earlier.",
        "Now he spends more time with his family, takes vacations while the business runs without him, and can show up to events without staying chained to his phone.",
      ],
    },
  ],
  outcomes: [
    "He built stronger boundaries instead of using nonstop work as proof that he cared.",
    "He found belonging and guidance from founders in recovery who understood both business pressure and sobriety.",
    "He can now leave his phone alone long enough to be genuinely present with his family.",
    "He is now helping other members apply what worked for him.",
  ],
  significanceTitle: "Nobody handed Adam a script. He found a room full of people who understood the stakes.",
  significanceBody:
    "Sober Founders did not ask Adam to perform or pretend he had it handled. It gave him a place to be honest, take what was useful, and apply it in a way that fit his business, his recovery, and his family.",
};

export const joshCStudy: CaseStudy = {
  slug: "josh-c",
  name: "Josh C.",
  title:
    "How Josh C. broke a business plateau, grew 30% in Phoenix Forum, and stopped thinking about drinking",
  summary:
    "Between 2024 and 2026, Josh C. used the Tuesday All Our Affairs group and Phoenix Forum to get out of dangerous substance-driven decision making, niche his business, and build a calmer, more intentional life with his wife and daughters.",
  quote:
    "Every morning I wake up energized and ready to take on the world - substance free. My business is growing, my relationships are better, and Sober Founders played a big role in shifting how I viewed things.",
  quoteAttribution: "Josh C., Tuesday All Our Affairs and Phoenix Forum member",
  heroLabel: "Plateau Broken. Mind Clear.",
  heroAccent:
    "The business started growing again once he stopped glorifying hustle and started being intentional.",
  primaryCtaLabel: "Apply for the Tuesday All Our Affairs Group",
  primaryCtaHref: "https://soberfounders.org/apply",
  secondaryCtaLabel: "View All Case Studies",
  secondaryCtaHref: "/case-studies",
  programTags: ["Tuesday All Our Affairs", "Phoenix Forum", "2024 to 2026"],
  metrics: [
    {
      label: "Business Growth",
      value: "+30%",
      detail: "Growth after his first year in Phoenix Forum.",
    },
    {
      label: "Recovery Shift",
      value: "Several Years Sober",
      detail: "He no longer thinks about having a drink.",
    },
    {
      label: "Family Stability",
      value: "Support At Home",
      detail: "He can show up for and support his wife and daughters.",
    },
  ],
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
  timeline: [
    {
      period: "Before 2024",
      title: "Plateau and dangerous decision making",
      detail:
        "The business had not grown in several years, and substance use was pushing him toward decisions that put him in danger.",
    },
    {
      period: "2024",
      title: "Starts showing up in Tuesday and Phoenix Forum",
      detail:
        "He entered rooms where honesty, productivity, and step-driven business thinking mattered more than image or hustle.",
    },
    {
      period: "First year in Phoenix Forum",
      title: "Business grows 30%",
      detail:
        "Niching, better decisions, and more intentional use of time helped unlock growth after years of stalling.",
    },
    {
      period: "2026",
      title: "Several years sober and steadier at home",
      detail:
        "He no longer thinks about a drink and can support his wife and daughters with more consistency and clarity.",
    },
  ],
  sections: [
    {
      title: "Before Sober Founders",
      paragraphs: [
        "Josh had been making terrible decisions that put himself in danger because of substances.",
        "At the same time, the business was plateaued. It had not grown in several years, which left him stuck in the kind of frustration that can make bad patterns feel normal.",
      ],
    },
    {
      title: "What Changed In Tuesday And Phoenix Forum",
      paragraphs: [
        "Josh moved away from the hustle, grind, and constant-networking mentality that gets pushed everywhere in business media.",
        "Instead, he focused on being productive with the time he had. He also realized there were major negative things he had been holding onto that needed to be dealt with so the resentment would stop running the show.",
        "Niching his business changed the way he operated. He stopped taking whatever he could get and started being intentional about the work he pursued.",
      ],
    },
    {
      title: "Where He Is Now",
      paragraphs: [
        "After his first year in Phoenix Forum, Josh grew the business by 30 percent.",
        "Now he has several years sober, no longer thinks about having a drink, and can support his daughters and wife from a much more stable place.",
        "His business is growing, his relationships are stronger, and he wakes up with energy instead of chaos.",
      ],
    },
  ],
  outcomes: [
    "He replaced media-driven hustle instincts with more productive and intentional use of time.",
    "He addressed the unresolved pain and resentment that were shaping his decisions underneath the surface.",
    "He niched the business instead of taking whatever work appeared, which helped restart growth.",
    "He built a life where sobriety, business momentum, and family support reinforce each other.",
  ],
  significanceTitle:
    "Josh did not need more pressure. He needed a better frame for how to work, lead, and stay sober.",
  significanceBody:
    "The turning point was not just accountability. It was getting into rooms where recovery and business were treated as connected disciplines, not separate boxes. That changed how he used his time, how he handled resentment, and how he built the business going forward.",
};

export const caseStudies = [adamCStudy, joshCStudy];

export function getCaseStudyBySlug(slug: string) {
  return caseStudies.find((study) => study.slug === slug) ?? null;
}
