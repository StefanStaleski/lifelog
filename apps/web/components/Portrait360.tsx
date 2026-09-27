"use client";

import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

/**
 * The owner's portrait. With a turn-around set: drag (or arrow keys) to rotate through the frames;
 * it turns slowly by itself until touched. With one photo: a 3D tilt that follows the pointer.
 */
export function Portrait360({
  frames,
  version,
  className = "",
}: {
  frames: number;
  version: number;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [touched, setTouched] = useState(false);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const url = (i: number) => `/api/portrait/frames/${i}?v=${version}`;

  const step = useCallback(
    (d: number) => setIdx((i) => (((i + d) % frames) + frames) % frames),
    [frames],
  );

  // Preload every frame so dragging is instant.
  useEffect(() => {
    for (let i = 0; i < frames; i++) new Image().src = url(i);
  }, [frames, version]);

  // Slow idle turn, unless the viewer prefers less motion or has taken over.
  useEffect(() => {
    if (frames < 2 || touched || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => step(1), 420);
    return () => clearInterval(t);
  }, [frames, touched, step]);

  const onDown = (e: PointerEvent) => {
    setTouched(true);
    drag.current = { x: e.clientX, start: idx };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (frames > 1 && drag.current && rect) {
      // One full turn across the width of the portrait.
      const perFrame = rect.width / frames;
      const d = Math.round((drag.current.x - e.clientX) / perFrame);
      setIdx((((drag.current.start + d) % frames) + frames) % frames);
    } else if (frames === 1 && rect) {
      setTilt({
        x: ((e.clientY - rect.top) / rect.height - 0.5) * -10,
        y: ((e.clientX - rect.left) / rect.width - 0.5) * 14,
      });
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  if (frames === 0) return null;

  return (
    <div
      ref={box}
      className={`group relative aspect-[3/4] w-full touch-pan-y overflow-hidden rounded-xl bg-stone-950 select-none ${frames > 1 ? "cursor-grab active:cursor-grabbing" : ""} ${className}`}
      style={{ perspective: 900 }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => {
        onUp();
        setTilt({ x: 0, y: 0 });
      }}
      tabIndex={0}
      role="img"
      aria-label={
        frames > 1
          ? `Portrait, 360° view, frame ${idx + 1} of ${frames}. Use the arrow keys to turn.`
          : "Portrait"
      }
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        setTouched(true);
        step(e.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <img
        src={url(idx)}
        alt=""
        draggable={false}
        className="h-full w-full object-cover transition-transform duration-150 ease-out [filter:saturate(0.85)_contrast(1.05)]"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.03)` }}
      />
      {/* HUD overlay: cyan wash, scanning line, corner brackets, labels */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-accent/5" />
      <div className="pointer-events-none absolute inset-x-0 h-16 animate-[portrait-scan_4s_linear_infinite] bg-gradient-to-b from-transparent via-accent/25 to-transparent motion-reduce:hidden" />
      <div className="pointer-events-none absolute inset-3 border border-accent/0">
        <span className="absolute top-0 left-0 size-5 border-t-2 border-l-2 border-accent/70" />
        <span className="absolute top-0 right-0 size-5 border-t-2 border-r-2 border-accent/70" />
        <span className="absolute bottom-0 left-0 size-5 border-b-2 border-l-2 border-accent/70" />
        <span className="absolute right-0 bottom-0 size-5 border-r-2 border-b-2 border-accent/70" />
      </div>
      <div className="pointer-events-none absolute inset-x-6 bottom-5 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-accent/90 uppercase">
        <span>{frames > 1 ? "360° · drag to turn" : "Subject"}</span>
        {frames > 1 && (
          <span>
            {String(idx + 1).padStart(2, "0")}/{String(frames).padStart(2, "0")}
          </span>
        )}
      </div>
      {frames > 1 && (
        <div className="absolute inset-y-0 right-1 left-1 flex items-center justify-between opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <button
            aria-label="Turn left"
            onClick={() => (setTouched(true), step(-1))}
            className="rounded-full bg-stone-950/70 px-2 py-1 font-mono text-accent ring-1 ring-accent/40"
          >
            ◀
          </button>
          <button
            aria-label="Turn right"
            onClick={() => (setTouched(true), step(1))}
            className="rounded-full bg-stone-950/70 px-2 py-1 font-mono text-accent ring-1 ring-accent/40"
          >
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
