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
 * `hero.mp4` is one continuous pan: the subject looks left at t=0 and right at
 * t=4.042. So cursor X across the viewport maps one-to-one onto a point in the
 * clip, and showing that point is what makes the head track the mouse.
 *
 * Doing that by writing `currentTime` does not work on this file, and the reason
 * is in the container rather than the code: `scripts/probe-mp4.mjs` reports 97
 * samples at 24fps with **one** sync sample — the opening frame — at 3840x2160.
 * Every seek therefore decodes from the start of the file, so a per-frame seek
 * asks for up to four seconds of 4K inter frames sixty times a second. Measured on
 * the built site that held 45fps with 38 frames over 25ms, two long tasks, and a
 * `readyState` that never climbed past 1 because no seek ever finished before the
 * next one arrived. The previous version dodged the problem by modulating
 * `playbackRate` instead, which bought back the frame budget but lost the one
 * thing that mattered: direction. Winding faster is not looking left.
 *
 * This decodes the clip exactly once, in the one access pattern a single-keyframe
 * file is fast at — straight sequential playback — and copies frames into a
 * sprite-sheet canvas as they present. After that pass the video element is paused
 * for good and the band is a canvas blitting one tile per cursor position: random
 * access, both directions, no decoder involved.
 *
 * Cost of the cache is `FRAMES * CAPTURE_WIDTH * height` pixels, which is why the
 * capture is downscaled rather than native — a 3840-wide tile is 33MB on its own,
 * and the band is never wider than the viewport.
 *
 * Nothing is fetched until the band is near the viewport: `preload="auto"` on
 * mount put a 3.7MB download in front of the fonts and the first paint. While the
 * capture pass runs the video element is what you see, so the band is never blank
 * and the switch to the canvas is a crossfade rather than a pop.
 *
 * The whole component removes itself if the file is absent, so a checkout with an
 * empty `public/video/` still builds and renders.
 */

/**
 * Frames kept, spread evenly across the clip.
 *
 * 24 across a 1440px viewport is one distinct frame per 60px of cursor travel.
 * Raising it costs a tile of memory each and buys nothing the eye can resolve at
 * this size; lowering it makes the pan step.
 */
const FRAMES = 24;

/**
 * Tile width. The source is 4K; the band is never wider than the viewport and is
 * grayscale, dark and under a grain overlay, so 720 upscaled reads clean.
 */
const CAPTURE_WIDTH = 720;
/** 6 x 4 tiles at 720 wide stays far inside the 16384px max texture dimension. */
const SHEET_COLS = 6;
/**
 * Passes allowed before giving up and patching whatever is missing.
 *
 * One pass usually fills every bucket. A dropped presentation frame under load can
 * leave a hole, and the file loops in 4s, so a second look is cheap insurance.
 */
const CAPTURE_LOOPS = 3;

/*
 * Framing parallax, kept from the rate-modulated version but pulled back.
 *
 * The subject now answers the cursor by itself, so the old 1.9% translate was
 * competing with the thing it used to stand in for. What is left is camera drift:
 * enough to keep the slab from feeling like a still, not enough to read as the
 * motion. The zoom exists only to keep the translate from exposing an edge.
 */
const PARALLAX = 1.1;
const ZOOM = 1.055;

/**
 * `requestVideoFrameCallback` is the only way to know a frame was *presented*
 * rather than merely requested, which is exactly what the capture pass needs. It
 * is absent from Firefox and from the DOM lib types here, so it is declared as
 * optional and the shared ticker covers the fallback.
 */
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

export default function ScrubVideo({
  src = heroVideo.src,
  className = 'absolute inset-0 h-full w-full object-cover',
}: {
  src?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [armed, setArmed] = useState(false);
  /** True once the sprite sheet is usable and the canvas takes over the band. */
  const [scrubbing, setScrubbing] = useState(false);
  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();

  // Arm on approach, then never disarm — re-fetching on every scroll past would
  // be worse than holding the buffer.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || armed) return;

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
      { rootMargin: '300px 0px' },
    );

    io.observe(video);
    return () => io.disconnect();
  }, [armed]);

  useEffect(() => {
    const video = videoRef.current as FrameCallbackVideo | null;
    const canvas = canvasRef.current;
    if (!video || !canvas || failed || !armed) return;

    // Only now is the file worth fetching.
    video.preload = 'auto';
    if (!video.src) video.src = src;

    const play = () =>
      video.play().catch(() => {
        /* Autoplay refused; leave the poster frame showing. */
      });

    // Touch devices have no hovering cursor to aim with, so the clip just plays.
    if (isMobile) {
      video.loop = true;
      play();
      return;
    }

    // Reduced motion: hold the opening frame. Not even a seek — `t=0` is the one
    // frame this file can present for free.
    if (reduced) return;

    const view = canvas.getContext('2d');
    const sheet = document.createElement('canvas');
    const sheetCtx = sheet.getContext('2d');
    if (!view || !sheetCtx) return;

    const release = acquirePointer(0.1);

    const rows = Math.ceil(FRAMES / SHEET_COLS);
    const tileW = CAPTURE_WIDTH;
    let tileH = Math.round((CAPTURE_WIDTH * 9) / 16);

    const filled = new Array<boolean>(FRAMES).fill(false);
    let count = 0;
    let capturing = true;
    let disposed = false;
    let onScreen = true;
    let releaseCapture: (() => void) | null = null;
    let releaseScrub: (() => void) | null = null;

    const tile = (i: number) => ({
      x: (i % SHEET_COLS) * tileW,
      y: Math.floor(i / SHEET_COLS) * tileH,
    });

    /** Which of the `FRAMES` buckets a media time falls in. */
    const bucket = (t: number) => {
      const d = video.duration || 1;
      return Math.max(0, Math.min(FRAMES - 1, Math.floor((t / d) * FRAMES)));
    };

    const paint = (i: number) => {
      const s = tile(i);
      view.drawImage(sheet, s.x, s.y, tileW, tileH, 0, 0, tileW, tileH);
    };

    /*
     * A bucket the capture pass never saw gets the nearest one that it did.
     *
     * Without this a dropped presentation frame leaves a transparent tile, and a
     * transparent tile is a black hole punched in the middle of a pan — far more
     * visible than the same frame showing for two cursor positions instead of one.
     */
    const patchHoles = () => {
      for (let i = 0; i < FRAMES; i++) {
        if (filled[i]) continue;
        let near = -1;
        for (let d = 1; d < FRAMES && near < 0; d++) {
          if (filled[i - d]) near = i - d;
          else if (filled[i + d]) near = i + d;
        }
        if (near < 0) continue;
        const a = tile(near);
        const b = tile(i);
        sheetCtx.drawImage(sheet, a.x, a.y, tileW, tileH, b.x, b.y, tileW, tileH);
      }
    };

    const startScrub = () => {
      let cur = -1;
      let px = 0;
      let py = 0;

      releaseScrub = onTick((dt) => {
        if (!onScreen) return;

        const k = damp(0.06, dt);
        px += (pointer.nx - px) * k;
        py += (pointer.ny - py) * k;
        canvas.style.transform = `scale(${ZOOM}) translate3d(${(px * -PARALLAX).toFixed(3)}%, ${(
          py *
          -PARALLAX *
          0.55
        ).toFixed(3)}%, 0)`;

        /*
         * Cursor X across the viewport *is* the pan position: -1 is the frame where
         * the subject looks left, +1 the frame where it looks right.
         *
         * Selecting off the damped `px` rather than raw `pointer.nx` is what gives
         * the turn weight — the head arrives a beat after the cursor and settles,
         * instead of snapping frame to frame with every twitch of the mouse.
         */
        const i = Math.max(0, Math.min(FRAMES - 1, Math.round(((px + 1) / 2) * (FRAMES - 1))));
        if (i === cur) return;
        cur = i;
        paint(i);
      });
    };

    const finish = () => {
      if (!capturing) return;
      capturing = false;
      releaseCapture?.();
      releaseCapture = null;

      // The decoder's work is over for the rest of the visit.
      video.loop = false;
      video.pause();

      // Nothing captured at all (autoplay refused, decode failure): leave the
      // video element visible rather than crossfading to an empty canvas.
      if (count === 0) return;

      patchHoles();
      paint(Math.floor(FRAMES / 2));
      if (!disposed) setScrubbing(true);
      startScrub();
    };

    let lastT = -1;
    let loops = 0;

    /** One presented frame: file it in its bucket if that bucket is still empty. */
    const step = (t: number) => {
      if (disposed || !capturing) return;

      // Time going backwards means the clip wrapped, so this is another pass.
      if (lastT >= 0 && t + 0.001 < lastT) {
        loops += 1;
        if (loops >= CAPTURE_LOOPS) {
          finish();
          return;
        }
      }
      lastT = t;

      const i = bucket(t);
      if (filled[i]) return;

      const s = tile(i);
      sheetCtx.drawImage(video, s.x, s.y, tileW, tileH);
      filled[i] = true;
      count += 1;
      if (count === FRAMES) finish();
    };

    const begin = () => {
      if (disposed) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      tileH = Math.max(1, Math.round(CAPTURE_WIDTH * (vw && vh ? vh / vw : 9 / 16)));
      sheet.width = tileW * SHEET_COLS;
      sheet.height = tileH * rows;
      canvas.width = tileW;
      canvas.height = tileH;

      video.loop = true;
      video.playbackRate = 1;
      play();

      if (typeof video.requestVideoFrameCallback === 'function') {
        let stopped = false;
        const pump = (_now: number, meta: { mediaTime: number }) => {
          if (stopped) return;
          step(meta.mediaTime);
          if (capturing && !disposed) video.requestVideoFrameCallback?.(pump);
        };
        video.requestVideoFrameCallback(pump);
        releaseCapture = () => {
          stopped = true;
        };
      } else {
        // Firefox has no presentation callback, so sample the media clock from the
        // shared ticker instead — one extra reader on a loop already running.
        releaseCapture = onTick(() => step(video.currentTime));
      }
    };

    if (video.readyState >= 1) begin();
    else video.addEventListener('loadedmetadata', begin, { once: true });

    /*
     * Off-screen only matters while the capture pass is running, and there it has to
     * be handled the other way round from the old version: the pass needs playback
     * to make progress, so pausing it out of view and resuming it back in view is
     * what keeps a scroll-past from leaving the sheet half filled. Once the sheet is
     * complete the video is paused for good and this only gates the blitting.
     */
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              onScreen = entries.some((e) => e.isIntersecting);
              if (!capturing) return;
              if (!onScreen && !video.paused) video.pause();
              if (onScreen && video.paused) play();
            },
            { rootMargin: '120px 0px' },
          );
    io?.observe(video);

    return () => {
      disposed = true;
      releaseCapture?.();
      releaseScrub?.();
      io?.disconnect();
      video.removeEventListener('loadedmetadata', begin);
      release();
      video.pause();
      canvas.style.transform = '';
      // Drop the cache. 24 tiles at 720 wide is tens of megabytes of texture, and
      // resizing a canvas to zero is the only way to make the browser release it.
      sheet.width = 0;
      sheet.height = 0;
    };
  }, [isMobile, reduced, failed, armed, src]);

  if (failed) return null;

  const fade = { transition: 'opacity 400ms linear' } as const;

  return (
    <>
      {/* Visible during the capture pass, so the band is never blank. */}
      <video
        ref={videoRef}
        muted
        playsInline
        preload="none"
        onError={() => setFailed(true)}
        aria-hidden
        style={{ ...fade, willChange: 'transform', opacity: scrubbing ? 0 : 1 }}
        className={className}
      />

      {/* Takes over once the sheet is filled; sized from the source in the effect. */}
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{ ...fade, willChange: 'transform', opacity: scrubbing ? 1 : 0 }}
        className={className}
      />
    </>
  );
}
