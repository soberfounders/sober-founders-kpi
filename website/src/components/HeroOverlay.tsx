"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function HeroOverlay() {
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (topRef.current) {
      gsap.to(topRef.current, {
        opacity: 0,
        y: -60,
        ease: "power2.in",
        scrollTrigger: {
          trigger: document.body,
          start: "top top",
          end: "12% top",
          scrub: 0.3,
        },
      });
    }

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <>
      {/* ─── Hero: rule-of-thirds — text left 40%, explosion right 60% ─── */}
      <div
        ref={topRef}
        className="fixed inset-0 flex items-center pointer-events-none"
        style={{ zIndex: 10, height: "100vh" }}
      >
        <div className="w-full max-w-[1200px] mx-auto px-8 md:px-16">
          <div className="max-w-[520px] bg-[rgba(10,10,10,0.45)] backdrop-blur-[20px] border border-white/[0.08] rounded-3xl px-10 py-10">
            <div className="inline-block text-xs font-semibold uppercase tracking-[1.5px] text-[#5eecc0] bg-[rgba(94,236,192,0.1)] backdrop-blur-sm border border-[rgba(94,236,192,0.15)] px-4 py-1.5 rounded-full mb-7">
              501(c)(3) Nonprofit Community
            </div>
            <h1
              className="text-[clamp(2.4rem,5vw,3.6rem)] font-normal text-white leading-[1.1] mb-5 drop-shadow-[0_2px_16px_rgba(0,0,0,0.7)]"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Sobriety Is a{" "}
              <span className="text-[#5eecc0] drop-shadow-[0_0_24px_rgba(94,236,192,0.35)]">
                Competitive Advantage
              </span>
            </h1>
            <p className="text-[1.1rem] text-white/80 max-w-[480px] mb-9 leading-[1.8] drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
              The peer community for entrepreneurs who build thriving businesses
              and protect their recovery&mdash;not one at the expense of the other.
            </p>
            <div className="flex gap-4 flex-wrap pointer-events-auto">
              <a
                href="https://soberfounders.org/events"
                className="inline-block text-[0.95rem] font-semibold px-8 py-3.5 rounded-full uppercase tracking-[0.5px] transition-all bg-[#00b286] text-white hover:bg-[#00c090] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,178,134,0.4)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
              >
                Attend a Free Meeting
              </a>
              <a
                href="/our-story/"
                className="inline-block text-[0.95rem] font-semibold px-8 py-3.5 rounded-full uppercase tracking-[0.5px] transition-all text-white border-[1.5px] border-white/30 hover:border-white/60 hover:bg-white/10 hover:-translate-y-0.5 backdrop-blur-sm"
              >
                Learn Our Story
              </a>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
