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
 *
 * The clip is a HALF turn: frame 0 is a hard left profile and the pan ends
 * frontal, so the back third of the sheet barely moves. A straight left-to-right
 * map wasted the whole right half of the screen on a frozen frontal face — which
 * is exactly the "it doesn't follow the cursor" report. Instead the centre of the
 * viewport is frontal and both edges are the profile, with the right half drawn
 * mirrored: cursor left, the head looks left; cursor right, it looks right.
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

      const paint = (i: number, flip = false) => {
        const { sx, sy } = tileFor(i, tileW, tileH);
        if (!flip) {
          view.drawImage(img, sx, sy, tileW, tileH, 0, 0, tileW, tileH);
          return;
        }
        // Right half of the pan is faked by mirroring the left profile, so the
        // head can look right off a clip that only ever turns left.
        view.save();
        view.translate(tileW, 0);
        view.scale(-1, 1);
        view.drawImage(img, sx, sy, tileW, tileH, 0, 0, tileW, tileH);
        view.restore();
      };

      // Centre of the pan is the frontal, resting frame; frame 0 is the profile.
      const FRONTAL = frames - 1;

      // Cursor position (u, 0..1 across the viewport) to tile + mirror.
      const select = (u: number) => {
        const half = Math.abs(u - 0.5) * 2; // 0 dead-centre .. 1 at either edge
        return { i: Math.round((1 - half) * FRONTAL), flip: u > 0.5 };
      };

      // Motion is suppressed only when it is autonomous. A head that turns to face
      // the cursor is direct manipulation — the visitor drives every frame — so it
      // survives prefers-reduced-motion. What gets cut there is the motion nobody
      // asked for: the mobile auto-look loop below, and the desktop drift/zoom.

      // Touch/coarse pointer with reduced motion: nothing drives it, hold frontal.
      if (isMobile && reduced) {
        paint(FRONTAL);
        setReady(true);
        return;
      }

      // Touch devices have no hovering cursor to aim with, so the head looks
      // around on its own — left, front, right, front — alive without anyone
      // having to chase it.
      if (isMobile) {
        paint(FRONTAL);
        setReady(true);
        let last = -1;
        releaseTick = onTick((_dt, now) => {
          if (!onScreen) return;
          const u = (Math.sin(now / 2600) + 1) / 2; // 0..1, ~16s round trip
          const { i, flip } = select(u);
          const key = i * 2 + (flip ? 1 : 0);
          if (key === last) return;
          last = key;
          paint(i, flip);
        });
        return;
      }

      paint(FRONTAL);
      setReady(true);
      release = acquirePointer(0.1);
      let curKey = -1;

      // Reduced motion, desktop: map the cursor straight onto the frame — no eased
      // trail, no parallax drift. The head still faces the cursor, it just snaps
      // there rather than animating, so no motion happens that the visitor did not
      // cause with the mouse itself.
      if (reduced) {
        releaseTick = onTick(() => {
          if (!onScreen) return;
          const w = window.innerWidth || 1;
          const u = pointer.active ? Math.max(0, Math.min(1, pointer.rawX / w)) : 0.5;
          const { i, flip } = select(u);
          const key = i * 2 + (flip ? 1 : 0);
          if (key === curKey) return;
          curKey = key;
          paint(i, flip);
        });
        return;
      }

      // Desktop: cursor X across the viewport is where the head looks. Selecting
      // off the damped value rather than the raw pointer gives the turn weight —
      // the head arrives a beat behind the cursor and settles.
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

        const u = (Math.max(-1, Math.min(1, px)) + 1) / 2;
        const { i, flip } = select(u);
        const key = i * 2 + (flip ? 1 : 0);
        if (key === curKey) return;
        curKey = key;
        paint(i, flip);
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
