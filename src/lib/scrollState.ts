'use client';

import { damp, onTick, PRIORITY } from './ticker';

/**
 * Shared scroll state, same pattern as `lib/pointer.ts`.
 *
 * `useFrame` callbacks need scroll progress every frame. Reading
 * `document.documentElement.scrollHeight` inside the render loop would force a
 * layout on each frame, so the expensive measurement is cached and only redone
 * on resize; the per-frame cost is a single `scrollY` read.
 */

export type ScrollState = {
  /** 0 at the top of the document, 1 at the very bottom. */
  progress: number;
  /** Pixels scrolled. */
  y: number;
  /** Progress through the current viewport-height "page", 0..1. */
  local: number;
  /** Which viewport-height band we are in — used to switch the 3D object's state. */
  section: number;
  /** Smoothed scroll speed in px/frame; drives motion blur and slab shear. */
  velocity: number;
};

export const scrollState: ScrollState = {
  progress: 0,
  y: 0,
  local: 0,
  section: 0,
  velocity: 0,
};

let maxScroll = 1;
let refCount = 0;
let lastY = 0;
let releaseTick: (() => void) | null = null;
let observer: ResizeObserver | null = null;
let dirty = false;

/**
 * Marks the cached page height stale instead of re-reading it now.
 *
 * `scrollHeight` is a forced layout, and a ResizeObserver callback is the worst
 * possible place to take one — it runs inside the browser's own layout step, so a
 * synchronous read there can trigger a second pass in the same frame. The read
 * happens on the next tick instead.
 */
function invalidate() {
  dirty = true;
}

function measure() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  dirty = false;
  update();
}

function update() {
  const y = window.scrollY || window.pageYOffset || 0;
  scrollState.y = y;
  scrollState.progress = Math.min(1, Math.max(0, y / maxScroll));

  const vh = window.innerHeight || 1;
  scrollState.section = Math.floor(y / vh);
  scrollState.local = (y % vh) / vh;
}

function tick(dt: number) {
  if (dirty) measure();

  // Exponential decay so the value falls off smoothly when scrolling stops. The
  // unit stays px/frame, which is what the 3D layer's constants are tuned in;
  // only the smoothing is made frame-rate independent.
  const raw = scrollState.y - lastY;
  lastY = scrollState.y;
  scrollState.velocity += (raw - scrollState.velocity) * damp(0.18, dt);
}

/** Starts (or joins) the shared listeners. Returns a release function. */
export function acquireScroll(): () => void {
  if (typeof window === 'undefined') return () => {};

  refCount += 1;
  if (refCount === 1) {
    measure();
    lastY = scrollState.y;
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', invalidate);
    // Sections growing/shrinking (accordions, image loads) change scrollHeight.
    const ro = new ResizeObserver(invalidate);
    ro.observe(document.documentElement);
    observer = ro;
    releaseTick = onTick(tick, PRIORITY.store);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    refCount -= 1;
    if (refCount === 0) {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', invalidate);
      observer?.disconnect();
      observer = null;
      releaseTick?.();
      releaseTick = null;
    }
  };
}
