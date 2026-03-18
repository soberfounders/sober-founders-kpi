import Link from "next/link";
import { caseStudies } from "@/content/caseStudies";

const primaryLinks = [
  { label: "Home", href: "/", internal: true },
  { label: "Events", href: "/events/" },
  { label: "Tuesday Mastermind", href: "/tuesday/" },
  { label: "Phoenix Forum", href: "/phoenix-forum-registration/" },
  { label: "Donate", href: "/donate/" },
];

const socialLinks = [
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/sober-founders",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/soberfounders",
  },
];

function FooterAnchor({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const isExternal = href.startsWith("http");
  return (
    <a
      href={href}
      className="text-sm leading-7 text-white/68 transition hover:text-white"
      {...(isExternal && { target: "_blank", rel: "noopener noreferrer" })}
    >
      {label}
    </a>
  );
}

export default function SiteFooter() {
  return (
    <footer className="relative border-t border-white/10 bg-[#070707]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(94,236,192,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-14 sm:px-10 lg:px-12">
        <div className="mb-12 flex flex-col gap-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#5eecc0]">
              Growth In Two Currencies
            </p>
            <h2
              className="mt-3 text-[clamp(1.6rem,3vw,2.5rem)] font-normal leading-[1.08] text-white"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Build a stronger business without sacrificing your recovery or your family.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/68 sm:text-base">
              The best Sober Founders stories do not stop at revenue. They also look like more presence, better boundaries, and a life worth protecting.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/case-studies"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#00b286] px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:-translate-y-0.5 hover:bg-[#00c090] hover:shadow-[0_12px_28px_rgba(0,178,134,0.28)]"
            >
              Read Case Studies
            </Link>
            <a
              href="/events/"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/18 px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white/88 transition hover:border-white/40 hover:bg-white/[0.06]"
            >
              Attend A Free Meeting
            </a>
          </div>
        </div>

        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
              Sober Founders
            </p>
            <p className="mt-4 max-w-sm text-sm leading-7 text-white/68">
              A peer community for entrepreneurs in recovery who want growth that protects what matters most.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
              Explore
            </p>
            <div className="mt-4 grid gap-1">
              {primaryLinks.map((link) =>
                link.internal ? (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-sm leading-7 text-white/68 transition hover:text-white"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <FooterAnchor key={link.label} href={link.href} label={link.label} />
                ),
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
              Case Studies
            </p>
            <div className="mt-4 grid gap-1">
              <Link
                href="/case-studies"
                className="text-sm leading-7 text-white/68 transition hover:text-white"
              >
                All Case Studies
              </Link>
              {caseStudies.map((study) => (
                <Link
                  key={study.slug}
                  href={`/case-studies/${study.slug}`}
                  className="text-sm leading-7 text-white/68 transition hover:text-white"
                >
                  {study.name}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-white/46 md:flex-row md:items-center md:justify-between">
          <p>Sober Founders Inc. is a 501(c)(3) nonprofit. EIN: 33-4098435.</p>
          <div className="flex flex-wrap gap-4">
            {socialLinks.map((link) => (
              <FooterAnchor key={link.label} href={link.href} label={link.label} />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
