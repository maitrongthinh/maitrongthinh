'use client';

/**
 * One `requestAnimationFrame` loop for everything that is not React and not R3F.
 *
 * Before this existed, each cursor-driven module ran its own RAF: the pointer
 * store, the scroll store, the custom cursor, the spotlight mask, the video band,
 * the project rows and every magnetic button. Measured on the built site that was
 * ~14 independent callbacks per frame, each free to interleave a layout read
 * (`getBoundingClientRect`, `elementFromPoint`) between another one's style write.
 * That is the classic layout-thrash shape, and it is invisible in load metrics.
 *
 * One loop also fixes ordering, which matters more than the saved calls: stores
 * must be updated before anything reads them, or half the page renders this
 * frame's pointer and half renders the last one. `priority` is that contract —
 * lower runs first. Use `PRIORITY.store` for anything that writes shared state
 * and `PRIORITY.write` for anything that touches the DOM or a Three object.
 *
 * `dt` is seconds since the previous tick, clamped: a tab that was backgrounded
 * for a minute must not be handed a 60-second delta, or every eased value in the
 * page snaps to its target at once and the page visibly jolts on return.
 */

export const PRIORITY = {
  /** Shared state (pointer, scroll). Runs first. */
  store: 0,
  /** Anything reading that state to drive the DOM or a Three.js object. */
  write: 10,
} as const;

type Entry = { fn: (dt: number, now: number) => void; priority: number };

const entries: Entry[] = [];
let rafId = 0;
let last = 0;

/** Longest delta any subscriber can see, in seconds — three frames at 20fps. */
const MAX_DT = 0.15;

function loop(now: number) {
  const dt = last ? Math.min(MAX_DT, (now - last) / 1000) : 1 / 60;
  last = now;

  // Snapshot: a subscriber is allowed to unsubscribe from inside its own tick.
  for (const entry of entries.slice()) entry.fn(dt, now);

  rafId = requestAnimationFrame(loop);
}

/**
 * Registers a per-frame callback. Returns an unsubscribe function; the loop
 * starts on the first subscriber and stops when the last one leaves.
 */
export function onTick(
  fn: (dt: number, now: number) => void,
  priority: number = PRIORITY.write,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const entry: Entry = { fn, priority };
  entries.push(entry);
  entries.sort((a, b) => a.priority - b.priority);

  if (entries.length === 1) {
    last = 0;
    rafId = requestAnimationFrame(loop);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = entries.indexOf(entry);
    if (i >= 0) entries.splice(i, 1);
    if (entries.length === 0) cancelAnimationFrame(rafId);
  };
}

/**
 * Frame-rate independent easing factor.
 *
 * `value += (target - value) * ease` is the standard one-liner, and it is wrong
 * on any display that is not 60Hz: at 144Hz it runs 2.4x faster, so the same
 * code feels snappy on one machine and sluggish on another. This converts an
 * ease authored per 60Hz frame into the equivalent for the frame actually being
 * drawn.
 */
export function damp(ease: number, dt: number): number {
  if (ease >= 1) return 1;
  if (ease <= 0) return 0;
  return 1 - Math.pow(1 - ease, dt * 60);
}
