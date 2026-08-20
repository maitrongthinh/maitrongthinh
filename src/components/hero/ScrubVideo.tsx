'use client';

import { useEffect, useRef, useState } from 'react';
import { acquirePointer, pointer } from '@/lib/pointer';
import { damp, onTick } from '@/lib/ticker';
import { heroVideo } from '@/content/content';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * The head turns to face the cursor.
 *
 * `hero.mp4` is one continuous pan: the subject looks left at t=0 and right at the
 * end. So cursor X across the viewport maps onto a point in the clip, and showing
 * that point is what makes the head track the mouse.
 *
 * The clip itself cannot be scrubbed in real time. `scripts/probe-mp4.mjs` reports
 * 97 samples at 24fps with a SINGLE sync sample at 3840x2160, so every `currentTime`
 * write decodes from the start of the file — a per-frame seek asks for seconds of 4K
 * inter frames sixty times a second, and the band becomes a slideshow. An earlier
 * version dodged that by capturing the frames into a sprite sheet live in the
 * visitor's browser: correct, but it meant seconds of on-screen playback before the
 * head moved at all, a hard dependency on autoplay, and a 3.7MB download below the
 * fold.
 *
 * That capture now happens once, offline: `scripts/bake-sprites.mjs` writes
 * `public/images/hero-sprites.webp`, a `frames`-tile grid of the pan. This component
 * loads that one image (~190KB) and blits a tile per cursor position — random
 * access, both directions, no decoder, and the head tracks from the first frame.
 */

/** Framing parallax: camera drift under the tracked head, not a stand-in for it. */
const PARALLAX = 1.1;
const ZOOM = 1.055;

export default function ScrubVideo({
  src = heroVideo.sprites,
  className = 'absolute inset-0 h-full w-full object-cover',
}: {
  src?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [armed, setArmed] = useState(false);
  /** True once the sheet has loaded and the first tile is painted. */
  const [ready, setReady] = useState(false);
  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();

  // The band starts below the fold; hold the (small) fetch until it is approached so
  // it never competes with the hero and fonts for the first paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || armed) return;

    if (typeof IntersectionObserver === 'undefined') {
      setArmed(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(canvas);
    return () => io.disconnect();
  }, [armed]);
  // CHUNK_MARKER

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || failed || !armed) return;

    const view = canvas.getContext('2d');
    if (!view) return;

    const { frames, cols } = heroVideo;
    const rows = Math.ceil(frames / cols);

    const img = new Image();
    let disposed = false;
    let releaseTick: (() => void) | null = null;
    let release: (() => void) | null = null;
    let onScreen = true;

    const tileFor = (i: number, tileW: number, tileH: number) => ({
      sx: (i % cols) * tileW,
      sy: Math.floor(i / cols) * tileH,
    });

    img.onload = () => {
      if (disposed) return;

      const tileW = img.width / cols;
      const tileH = img.height / rows;
      canvas.width = tileW;
      canvas.height = tileH;

      const paint = (i: number) => {
        const { sx, sy } = tileFor(i, tileW, tileH);
        view.drawImage(img, sx, sy, tileW, tileH, 0, 0, tileW, tileH);
      };

      // Reduced motion: hold the mid-pan frame, facing forward. No tracking.
      if (reduced) {
        paint(Math.floor(frames / 2));
        setReady(true);
        return;
      }

      // Touch devices have no hovering cursor to aim with, so the head ping-pongs
      // slowly across the pan on its own — alive, but nobody has to chase it.
      if (isMobile) {
        paint(Math.floor(frames / 2));
        setReady(true);
        let last = -1;
        releaseTick = onTick((_dt, now) => {
          if (!onScreen) return;
          const phase = (Math.sin(now / 2600) + 1) / 2; // 0..1, ~16s round trip
          const i = Math.round(phase * (frames - 1));
          if (i === last) return;
          last = i;
          paint(i);
        });
        return;
      }

      // Desktop: cursor X across the viewport is the pan position. Selecting off the
      // damped value rather than the raw pointer gives the turn weight — the head
      // arrives a beat behind the cursor and settles.
      paint(Math.floor(frames / 2));
      setReady(true);
      release = acquirePointer(0.1);

      let cur = -1;
      let px = 0;
      let py = 0;
      releaseTick = onTick((dt) => {
        if (!onScreen) return;

        const k = damp(0.06, dt);
        px += (pointer.nx - px) * k;
        py += (pointer.ny - py) * k;
        canvas.style.transform = `scale(${ZOOM}) translate3d(${(px * -PARALLAX).toFixed(3)}%, ${(
          py *
          -PARALLAX *
          0.55
        ).toFixed(3)}%, 0)`;

        const i = Math.max(0, Math.min(frames - 1, Math.round(((px + 1) / 2) * (frames - 1))));
        if (i === cur) return;
        cur = i;
        paint(i);
      });
    };

    img.onerror = () => {
      if (!disposed) setFailed(true);
    };
    img.src = src;

    // Blitting off-screen is wasted work; gate the tick on visibility.
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              onScreen = entries.some((e) => e.isIntersecting);
            },
            { rootMargin: '120px 0px' },
          );
    io?.observe(canvas);

    return () => {
      disposed = true;
      releaseTick?.();
      release?.();
      io?.disconnect();
      canvas.style.transform = '';
    };
  }, [isMobile, reduced, failed, armed, src]);

  if (failed) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        transition: 'opacity 400ms linear',
        willChange: 'transform',
        opacity: ready ? 1 : 0,
      }}
      className={className}
    />
  );
}
