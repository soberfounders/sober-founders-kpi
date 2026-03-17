import type { Metadata } from "next";
import SmoothScroll from "@/components/SmoothScroll";
import HeroScroll from "@/components/HeroScroll";
import HeroOverlay from "@/components/HeroOverlay";
import HomepageContent from "@/components/HomepageContent";

export const metadata: Metadata = {
  title: "Sober Founders — Sobriety Is a Competitive Advantage",
  description:
    "The peer community for entrepreneurs who build thriving businesses and protect their recovery. 500+ entrepreneurs helped across all industries with $500M+ combined revenue.",
  alternates: {
    canonical: "https://soberfounders.org/",
  },
};

export default function TestPage() {
  return (
    <SmoothScroll>
      <main>
        {/* Fixed background: canvas + dynamic overlay (z-0) */}
        <HeroScroll />

        {/* Fixed hero text + tagline (z-10) */}
        <HeroOverlay />

        {/* Scrollable content (z-20) */}
        {/* Spacer: first 100vh is just the video + hero text */}
        <div className="relative" style={{ zIndex: 20 }}>
          <div className="h-screen" />
          <HomepageContent />
        </div>
      </main>
    </SmoothScroll>
  );
}
