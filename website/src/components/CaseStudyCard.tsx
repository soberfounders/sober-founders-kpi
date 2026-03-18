import Link from "next/link";
import type { CaseStudy } from "@/content/caseStudies";

type CaseStudyCardProps = {
  study: CaseStudy;
};

export default function CaseStudyCard({ study }: CaseStudyCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.35)] backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(94,236,192,0.18),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(241,151,44,0.12),transparent_32%)]" />
      <div className="relative">
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="rounded-full border border-[#5eecc0]/20 bg-[#5eecc0]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#5eecc0]">
            {study.heroLabel}
          </span>
          {study.programTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/70"
            >
              {tag}
            </span>
          ))}
        </div>

        <h2
          className="max-w-3xl text-[clamp(1.8rem,3vw,2.8rem)] font-normal leading-[1.08] text-white"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          {study.title}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-8 text-white/72 sm:text-lg">
          {study.summary}
        </p>

        <div className="mt-6 rounded-[22px] border border-[#f1972c]/16 bg-[linear-gradient(135deg,rgba(241,151,44,0.12),rgba(255,255,255,0.02))] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f7bb74]">
            The Core Shift
          </p>
          <p
            className="mt-3 text-[1.25rem] font-normal leading-[1.15] text-white"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            {study.heroAccent}
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {study.metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-3xl border border-white/10 bg-black/25 p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
                {metric.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
              <p className="mt-2 text-sm leading-6 text-white/60">{metric.detail}</p>
            </div>
          ))}
        </div>

        <blockquote className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-6 text-lg leading-8 text-white/84">
          &ldquo;{study.quote}&rdquo;
          <cite className="mt-4 block text-sm font-semibold uppercase tracking-[0.16em] text-[#5eecc0] not-italic">
            {study.quoteAttribution}
          </cite>
        </blockquote>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href={`/case-studies/${study.slug}`}
            className="inline-flex min-h-12 items-center rounded-full bg-[#00b286] px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition group-hover:-translate-y-0.5 hover:-translate-y-0.5 hover:bg-[#00c090] hover:shadow-[0_12px_28px_rgba(0,178,134,0.28)]"
          >
            Read The Full Story
          </Link>
          <a
            href={study.primaryCtaHref}
            className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white/88 transition hover:border-white/40 hover:bg-white/[0.06]"
          >
            {study.primaryCtaLabel}
          </a>
        </div>
      </div>
    </article>
  );
}
