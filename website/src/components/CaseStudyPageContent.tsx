import Link from "next/link";
import type { CaseStudy } from "@/content/caseStudies";

type CaseStudyPageContentProps = {
  study: CaseStudy;
};

export default function CaseStudyPageContent({
  study,
}: CaseStudyPageContentProps) {
  return (
    <main className="relative overflow-hidden bg-[#050505]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(94,236,192,0.16),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(241,151,44,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_26%)]" />

      <section className="relative mx-auto max-w-7xl px-6 pb-14 pt-20 sm:px-10 lg:px-12">
        <Link
          href="/case-studies"
          className="inline-flex items-center text-sm font-semibold uppercase tracking-[0.14em] text-[#5eecc0] transition hover:text-white"
        >
          Back To Case Studies
        </Link>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-8 shadow-[0_35px_120px_rgba(0,0,0,0.38)] backdrop-blur-sm sm:p-10">
            <div className="flex flex-wrap gap-2">
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

            <h1
              className="mt-6 max-w-4xl text-[clamp(2.5rem,5vw,5rem)] font-normal leading-[0.96] text-white"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              {study.title}
            </h1>

            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/72">
              {study.summary}
            </p>

            <div className="mt-8 rounded-[24px] border border-[#f1972c]/18 bg-[linear-gradient(135deg,rgba(241,151,44,0.12),rgba(255,255,255,0.02))] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f7bb74]">
                The Core Shift
              </p>
              <p
                className="mt-3 text-[1.35rem] font-normal leading-[1.18] text-white"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                {study.heroAccent}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href={study.primaryCtaHref}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#00b286] px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:-translate-y-0.5 hover:bg-[#00c090] hover:shadow-[0_12px_28px_rgba(0,178,134,0.28)]"
              >
                {study.primaryCtaLabel}
              </a>
              <Link
                href={study.secondaryCtaHref}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/18 px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white/88 transition hover:border-white/40 hover:bg-white/[0.06]"
              >
                {study.secondaryCtaLabel}
              </Link>
            </div>
          </div>

          <aside className="grid gap-4">
            <div className="rounded-[32px] border border-white/10 bg-black/30 p-7 shadow-[0_30px_100px_rgba(0,0,0,0.34)] backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
                Featured Quote
              </p>
              <blockquote
                className="mt-5 text-[1.2rem] leading-9 text-white/88"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                &ldquo;{study.quote}&rdquo;
              </blockquote>
              <cite className="mt-6 block text-sm font-semibold uppercase tracking-[0.16em] text-[#5eecc0] not-italic">
                {study.quoteAttribution}
              </cite>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-7 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
                What Actually Changed
              </p>
              <div className="mt-5 grid gap-4">
                {study.shifts.map((shift) => (
                  <div
                    key={shift.title}
                    className="rounded-[20px] border border-white/10 bg-black/25 p-5"
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#5eecc0]">
                      {shift.title}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-white/70">
                      {shift.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {study.metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.2))] p-6 backdrop-blur-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
                {metric.label}
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{metric.value}</p>
              <p className="mt-3 text-sm leading-6 text-white/62">{metric.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 pb-10 sm:px-10 lg:px-12">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm sm:p-10">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
              Timeline
            </p>
            <h2
              className="mt-4 text-[clamp(1.9rem,4vw,3rem)] font-normal leading-[1.02] text-white"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Growth got real when the internal shift matched the external one.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {study.timeline.map((item, index) => (
              <article
                key={`${item.period}-${item.title}`}
                className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/22 p-6"
              >
                <div className="absolute right-4 top-4 text-5xl font-semibold text-white/[0.06]">
                  {index + 1}
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f7bb74]">
                  {item.period}
                </p>
                <h3
                  className="mt-3 text-[1.35rem] font-normal leading-[1.08] text-white"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  {item.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-white/70">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 pb-10 sm:px-10 lg:px-12">
        <div className="grid gap-6 lg:grid-cols-3">
          {study.sections.map((section) => (
            <article
              key={section.title}
              className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.16))] p-7 backdrop-blur-sm"
            >
              <h2
                className="text-[1.55rem] font-normal text-white"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                {section.title}
              </h2>
              <div className="mt-5 space-y-4 text-base leading-8 text-white/72">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 pb-20 sm:px-10 lg:px-12">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[30px] border border-white/10 bg-black/26 p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
              Why This Story Matters
            </p>
            <h2
              className="mt-4 text-[1.8rem] font-normal leading-[1.08] text-white"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              {study.significanceTitle}
            </h2>
            <p className="mt-5 text-base leading-8 text-white/72">
              {study.significanceBody}
            </p>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-7 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
              Lasting Outcomes
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {study.outcomes.map((outcome) => (
                <div
                  key={outcome}
                  className="rounded-[22px] border border-white/10 bg-black/24 p-5"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-2 h-2.5 w-2.5 flex-none rounded-full bg-[#5eecc0]" />
                    <p className="text-sm leading-7 text-white/72">{outcome}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-10 rounded-[34px] border border-[#5eecc0]/18 bg-[linear-gradient(135deg,rgba(94,236,192,0.12),rgba(255,255,255,0.04))] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:p-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5eecc0]">
                Next Step
              </p>
              <h2
                className="mt-3 text-[clamp(1.8rem,3.5vw,2.8rem)] font-normal leading-[1.04] text-white"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Want the same kind of room {study.name.split(" ")[0]} found?
              </h2>
              <p className="mt-4 text-base leading-8 text-white/74">
                Start with the next room that fits. The right environment can change the way you work, the way you relate to pressure, and the kind of life your business makes possible.
              </p>
            </div>
            <a
              href={study.primaryCtaHref}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#00b286] px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:-translate-y-0.5 hover:bg-[#00c090] hover:shadow-[0_12px_28px_rgba(0,178,134,0.28)]"
            >
              {study.primaryCtaLabel}
            </a>
          </div>
        </section>
      </section>
    </main>
  );
}
