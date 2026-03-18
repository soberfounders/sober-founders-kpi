import type { Metadata } from "next";
import CaseStudyCard from "@/components/CaseStudyCard";
import { caseStudies } from "@/content/caseStudies";

const SITE_URL = "https://soberfounders.org";

export const metadata: Metadata = {
  title: "Case Studies",
  description:
    "Revenue growth, sobriety milestones, and family wins from founders in recovery inside Sober Founders.",
  alternates: {
    canonical: `${SITE_URL}/case-studies/`,
  },
  openGraph: {
    title: "Sober Founders Case Studies",
    description:
      "Revenue growth, sobriety milestones, and family wins from founders in recovery inside Sober Founders.",
    url: `${SITE_URL}/case-studies/`,
    siteName: "Sober Founders",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sober Founders Case Studies",
    description:
      "Revenue growth, sobriety milestones, and family wins from founders in recovery inside Sober Founders.",
  },
};

export default function CaseStudiesPage() {
  return (
    <main className="relative overflow-hidden bg-[#050505]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(94,236,192,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_24%),radial-gradient(circle_at_80%_55%,rgba(241,151,44,0.1),transparent_22%)]" />
      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-20 sm:px-10 lg:px-12">
        <div className="grid gap-10 xl:grid-cols-[0.95fr_1.05fr] xl:items-end">
          <div className="max-w-3xl">
            <span className="rounded-full border border-[#5eecc0]/20 bg-[#5eecc0]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#5eecc0]">
              Case Studies
            </span>
            <h1
              className="mt-6 text-[clamp(2.4rem,5vw,4.8rem)] font-normal leading-[0.96] text-white"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Real founders. Real numbers. Real life getting better.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72">
              Revenue matters. Sobriety matters. Family matters. These case studies show what Sober Founders looks like when growth stops coming at the expense of the rest of your life.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5eecc0]">
                Not Just Testimonials
              </p>
              <p className="mt-3 text-sm leading-7 text-white/70">
                These pages show the before, the shift, the actual numbers, and the life impact.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f7bb74]">
                Two Currencies
              </p>
              <p className="mt-3 text-sm leading-7 text-white/70">
                Each story tracks business growth and the part that matters just as much outside work.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/54">
                Next Step
              </p>
              <p className="mt-3 text-sm leading-7 text-white/70">
                Every case study ends with the room that best matches the story, so the next action is clear.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-8">
          {caseStudies.map((study) => (
            <CaseStudyCard key={study.slug} study={study} />
          ))}
        </div>
      </section>
    </main>
  );
}
