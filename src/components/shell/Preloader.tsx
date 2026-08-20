'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { site } from '@/content/content';

/**
 * Boot curtain.
 *
 * A static export has no meaningful load event to wait on — the HTML is already
 * there — so the counter runs on a short fixed timeline, gated only by
 * `document.fonts.ready` behind a hard cap.
 *
 * It deliberately does **not** wait for `window.load`. That event fires only once
 * every subresource has arrived, which here includes a 3.5MB video and a 12MB
 * track: gating on it held the curtain up for the entire download and made a page
 * that was interactive in under a second feel broken.
 */
export default function Preloader() {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Lock scrolling while the curtain is up.
    document.documentElement.style.overflow = 'hidden';

    const counter = { v: 0 };

    // Fonts only, and never longer than this — a cold font cache must not become
    // an unbounded wait.
    const FONT_CAP_MS = 600;
    const fonts = Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((resolve) => setTimeout(resolve, FONT_CAP_MS)),
    ]);

    const tl = gsap.timeline();

    tl.to(counter, {
      v: 100,
      duration: 0.8,
      ease: 'power2.inOut',
      onUpdate: () => {
        const v = Math.round(counter.v);
        if (countRef.current) countRef.current.textContent = String(v).padStart(3, '0');
        if (barRef.current) barRef.current.style.transform = `scaleX(${counter.v / 100})`;
      },
    });

    // Hold only until the display font has swapped, then wipe upward in panels.
    tl.add(() => {
      tl.pause();
      void fonts.then(() => tl.resume());
    });

    tl.to('[data-curtain-panel]', {
      scaleY: 0,
      transformOrigin: 'top',
      duration: 0.62,
      ease: 'power4.inOut',
      stagger: 0.06,
    });

    tl.to(
      root,
      {
        autoAlpha: 0,
        duration: 0.2,
        onComplete: () => {
          document.documentElement.style.overflow = '';
          setDone(true);
        },
      },
      '-=0.2',
    );

    return () => {
      tl.kill();
      document.documentElement.style.overflow = '';
    };
  }, []);

  if (done) return null;

  return (
    <div ref={rootRef} className="fixed inset-0 z-[300] flex items-end justify-between">
      {/* Four panels wipe independently for a shutter feel. */}
      <div className="absolute inset-0 flex">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} data-curtain-panel className="h-full flex-1 bg-ground" />
        ))}
      </div>

      <div className="relative z-10 flex w-full items-end justify-between p-6 sm:p-10">
        <div>
          <p className="label mb-3">Loading</p>
          <p className="font-display text-[13vw] leading-none sm:text-[9vw]">{site.shortName}</p>
        </div>
        <span ref={countRef} className="font-mono text-4xl tabular-nums sm:text-6xl">
          000
        </span>
      </div>

      <div className="absolute bottom-0 left-0 z-10 h-[2px] w-full bg-rule">
        <div ref={barRef} className="h-full w-full origin-left scale-x-0 bg-ink" />
      </div>
    </div>
  );
}
