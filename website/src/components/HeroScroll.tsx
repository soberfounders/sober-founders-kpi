"use client";

import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const FRAME_COUNT = 122;
const FRAME_PATH = "/assets/explosion/frame_";

function getFrameSrc(index: number): string {
  const padded = String(index).padStart(3, "0");
  return `${FRAME_PATH}${padded}.jpg`;
}

export default function HeroScroll() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mobile = window.innerWidth < 768;
    setIsMobile(mobile);
    if (mobile) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const images: HTMLImageElement[] = [];
    let loadedCount = 0;

    const onAllLoaded = () => {
      drawFrame(0);

      const frameObj = { current: 0 };

      // The canvas is fixed and covers the full page height for scrubbing
      ScrollTrigger.create({
        trigger: document.documentElement,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.5,
        onUpdate(self) {
          // Accelerated mapping: video completes in the first 40% of scroll.
          // This ensures the full bottle→phoenix animation plays through
          // by the time the user reaches the content sections.
          // Mild power curve (1.3) still gives bottle a bit more time.
          const accelerated = Math.min(1, self.progress / 0.55);
          const eased = Math.pow(accelerated, 1.3);
          const frameIndex = Math.min(
            FRAME_COUNT - 1,
            Math.floor(eased * (FRAME_COUNT - 1))
          );

          if (frameIndex !== frameObj.current) {
            frameObj.current = frameIndex;
            drawFrame(frameIndex);
          }

          // Motion blur based on scroll velocity
          const velocity = Math.abs(self.getVelocity());
          const blur = Math.min(velocity / 2000, 4);
          if (canvas) {
            canvas.style.filter = blur > 0.2 ? `blur(${blur}px)` : "none";
          }

          // Scroll-sync dimming tuned to the accelerated video timeline:
          // 0-5%: light (0.15) — hero text visible over bottle
          // 5-25%: ramps to 0.5 — explosion is messy, dim for readability
          // 25-40%: eases to 0.35 — phoenix formed, let it show
          // 40%+: holds at 0.35 — glass cards handle the rest
          if (overlayRef.current) {
            const p = self.progress;
            let darkness: number;
            if (p < 0.05) {
              darkness = 0.15;
            } else if (p < 0.25) {
              darkness = 0.15 + ((p - 0.05) / 0.2) * 0.35; // 0.15 → 0.5
            } else if (p < 0.4) {
              darkness = 0.5 - ((p - 0.25) / 0.15) * 0.15; // 0.5 → 0.35
            } else {
              darkness = 0.35;
            }
            overlayRef.current.style.backgroundColor = `rgba(10,10,10,${darkness})`;
          }
        },
      });
    };

    function drawFrame(index: number) {
      if (!canvas || !ctx) return;
      const img = images[index];
      if (!img) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;

      const canvasRatio = cw / ch;
      const imgRatio = iw / ih;

      let sx: number, sy: number, sw: number, sh: number;

      if (canvasRatio > imgRatio) {
        sw = iw;
        sh = iw / canvasRatio;
        sx = 0;
        sy = (ih - sh) / 2;
      } else {
        sh = ih;
        sw = ih * canvasRatio;
        sx = (iw - sw) / 2;
        sy = 0;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    }

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = getFrameSrc(i + 1);
      img.onload = () => {
        loadedCount++;
        if (loadedCount === FRAME_COUNT) {
          onAllLoaded();
        }
      };
      images.push(img);
    }

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  if (isMobile) {
    return (
      <div className="fixed inset-0" style={{ zIndex: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/phoenix-static.jpg"
          alt="Phoenix rising"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[#0a0a0a]/60" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 0 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ willChange: "filter" }}
      />
      {/* Dynamic overlay — gets darker as user scrolls for content legibility */}
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(10,10,10,0.15)" }}
      />
    </div>
  );
}
