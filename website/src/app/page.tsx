import VideoScrub from "@/components/VideoScrub";
import HeroOverlay from "@/components/HeroOverlay";
import HomepageContent from "@/components/HomepageContent";

export default function Home() {
  return (
    <main className="bg-[#0a0a0a]">
      {/* Scroll-driven video background */}
      <VideoScrub />

      {/* Fixed hero text + CTA buttons (z-10) */}
      <HeroOverlay />

      {/* Scrollable content after hero */}
      <div className="relative" style={{ zIndex: 20 }}>
        <HomepageContent />
      </div>
    </main>
  );
}
