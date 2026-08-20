'use client';

import { damp, onTick, PRIORITY } from './ticker';

/**
 * One shared pointer state for the whole page.
 *
 * Every cursor-driven effect on this site (spotlight reveal, custom cursor,
 * 3D parallax, mouse scrubbing) needs the same smoothed pointer position. If
 * each ran its own `mousemove` + `requestAnimationFrame` + `setState`, we would
 * pay N listeners and N React re-renders per frame at 60Hz.
 *
 * Instead this module keeps a single mutable record, updated from the shared
 * ticker at `PRIORITY.store` so it is always fresh before anything reads it.
 * Consumers read `pointer.*` from inside their own tick and write straight to the
 * DOM or to a Three.js object — React never re-renders for pointer movement.
 */

export type PointerState = {
  /** Raw viewport coordinates from the last `pointermove`, in CSS pixels. */
  rawX: number;
  rawY: number;
  /** Eased coordinates. This is what visuals should follow. */
  x: number;
  y: number;
  /** Eased position normalised to -1..1 across the viewport, for 3D parallax. */
  nx: number;
  ny: number;
  /** Signed horizontal movement over the last frame, in CSS pixels. */
  dx: number;
  /**
   * Scrub head wrapped to 0..1, advanced by horizontal mouse travel.
   *
   * For anything cyclic where a jump from 1 back to 0 is invisible — a phase, a
   * pattern offset. Anything that *eases towards* a value must use `scrubTotal`
   * instead: easing towards a wrapped value chases the wrap the long way round.
   */
  scrub: number;
  /**
   * Same accumulator, never wrapped: total signed sweeps of the viewport, so it
   * grows past 1 and goes negative. Continuous by construction, which is what
   * rotation and any damped follow needs.
   *
   * Moving the cursor right winds forward, left rewinds. `SCRUB_SWEEP` sets how
   * much one full sweep of the viewport is worth.
   */
  scrubTotal: number;
  /** Smoothed horizontal cursor speed in viewport-widths per second, signed. */
  velX: number;
  /** Smoothed cursor speed in viewport-widths per second, unsigned. */
  speed: number;
  /** False until the pointer has moved at least once. */
  active: boolean;
};

const SCRUB_SWEEP = 0.8;

export const pointer: PointerState = {
  rawX: -9999,
  rawY: -9999,
  x: -9999,
  y: -9999,
  nx: 0,
  ny: 0,
  dx: 0,
  scrub: 0,
  scrubTotal: 0,
  velX: 0,
  speed: 0,
  active: false,
};

/**
 * Requested easing factors, one entry per live consumer.
 *
 * There is a single smoothed position, so there is a single ease — and it used to
 * be whatever the last caller of `acquirePointer` happened to pass, which made the
 * feel of the cursor depend on component mount order. The tightest request wins
 * instead: a consumer can never be given a laggier pointer than it asked for, and
 * releasing one restores whatever the rest asked for. Anything that genuinely
 * wants its own lag eases locally off `pointer.x/y` (see `CustomCursor`'s ring).
 */
const requested: number[] = [];
let ease = 0.1;

const resolveEase = () => {
  ease = requested.length ? Math.max(...requested) : 0.1;
};

let releaseTick: (() => void) | null = null;
let refCount = 0;
let lastRawX = -9999;

function onPointerMove(e: PointerEvent) {
  if (!pointer.active) {
    // Snap on the first sample so the spotlight does not fly in from -9999.
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    lastRawX = e.clientX;
    pointer.active = true;
  }
  pointer.rawX = e.clientX;
  pointer.rawY = e.clientY;
}

function tick(dt: number) {
  const k = damp(ease, dt);

  pointer.x += (pointer.rawX - pointer.x) * k;
  pointer.y += (pointer.rawY - pointer.y) * k;

  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;

  pointer.nx = (pointer.x / w) * 2 - 1;
  pointer.ny = (pointer.y / h) * 2 - 1;

  pointer.dx = pointer.rawX - lastRawX;
  lastRawX = pointer.rawX;

  if (pointer.active && pointer.dx !== 0) {
    const sweeps = (pointer.dx / w) * SCRUB_SWEEP;
    pointer.scrubTotal += sweeps;
    pointer.scrub = ((pointer.scrubTotal % 1) + 1) % 1;
  }

  // Instantaneous speed is far too noisy to drive anything visible — a single
  // 40px jump between two frames reads as 2.4 widths/second. Smoothed hard.
  const instant = pointer.active ? pointer.dx / w / Math.max(dt, 1 / 240) : 0;
  const kv = damp(0.14, dt);
  pointer.velX += (instant - pointer.velX) * kv;
  pointer.speed = Math.abs(pointer.velX);
}

/**
 * Starts the shared loop, or joins the running one. Returns a stop function;
 * the loop only tears down once every consumer has released it.
 */
export function acquirePointer(easing = 0.1): () => void {
  if (typeof window === 'undefined') return () => {};

  requested.push(easing);
  resolveEase();

  refCount += 1;
  if (refCount === 1) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    releaseTick = onTick(tick, PRIORITY.store);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const i = requested.indexOf(easing);
    if (i >= 0) requested.splice(i, 1);
    resolveEase();

    refCount -= 1;
    if (refCount === 0) {
      window.removeEventListener('pointermove', onPointerMove);
      releaseTick?.();
      releaseTick = null;
    }
  };
}
