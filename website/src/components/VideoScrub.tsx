"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function VideoScrub() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    // Draw current video frame to canvas using "cover" logic
    function drawFrame() {
      if (!video || !canvas || !ctx) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      const cw = canvas.width;
      const ch = canvas.height;

      // "object-fit: cover" — scale to fill, center, crop overflow
      const videoRatio = vw / vh;
      const canvasRatio = cw / ch;

      let sx: number, sy: number, sw: number, sh: number;

      if (canvasRatio > videoRatio) {
        // Canvas is wider than video — crop top/bottom
        sw = vw;
        sh = vw / canvasRatio;
        sx = 0;
        sy = (vh - sh) / 2;
      } else {
        // Canvas is taller than video — crop left/right
        sh = vh;
        sw = vh * canvasRatio;
        sx = (vw - sw) / 2;
        sy = 0;
      }

      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
    }

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawFrame();
    }

    function renderLoop() {
      drawFrame();
      animationId = requestAnimationFrame(renderLoop);
    }

    const onReady = () => {
      const duration = video.duration;
      if (!duration || !isFinite(duration)) return;

      resize();
      window.addEventListener("resize", resize);

      video.currentTime = 0;
      video.addEventListener("seeked", drawFrame, { once: true });

      renderLoop();

      ScrollTrigger.create({
        trigger: containerRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.3,
        onUpdate(self) {
          // Power curve: stretches early video (bottle breaking)
          const eased = Math.pow(self.progress, 2.5);
          video.currentTime = eased * duration;
        },
      });
    };

    if (video.readyState >= 1) {
      onReady();
    } else {
      video.addEventListener("loadedmetadata", onReady, { once: true });
    }

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <div ref={containerRef} className="relative" style={{ height: "500vh" }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#0a0a0a]">
        <video
          ref={videoRef}
          src="/assets/hero-video-scrub.mp4"
          muted
          playsInline
          preload="auto"
          className="hidden"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}
