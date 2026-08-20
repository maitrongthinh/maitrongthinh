'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

/**
 * Deferred mount for the 3D layer.
 *
 * three, fiber, drei and postprocessing are the largest thing this site ships by
 * a wide margin. Importing `Scene` straight into the page put all of it in the
 * first client chunk, so the browser had to download and parse the whole WebGL
 * stack before it could hydrate a single button.
 *
 * Two things happen here instead:
 *
 * - `dynamic(..., { ssr: false })` moves it into its own chunk, fetched after the
 *   page is already interactive;
 * - the chunk is not even requested until the main thread goes idle, so the hero
 *   type, the fonts and the first paint win the race for bandwidth.
 *
 * The canvas is decorative and `aria-hidden`, sitting at z-0 behind everything —
 * arriving a beat late costs nothing, and on a slow device it is the difference
 * between a page that reads instantly and one that hangs on a black screen.
 */
const Scene = dynamic(() => import('./Scene'), { ssr: false });

type IdleWindow = typeof window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export default function SceneMount() {
  const [mount, setMount] = useState(false);

  useEffect(() => {
    const w = window as IdleWindow;

    if (w.requestIdleCallback) {
      // The timeout is the guarantee: a permanently busy main thread must not
      // mean a permanently empty background.
      const handle = w.requestIdleCallback(() => setMount(true), { timeout: 1200 });
      return () => w.cancelIdleCallback?.(handle);
    }

    const timer = setTimeout(() => setMount(true), 400);
    return () => clearTimeout(timer);
  }, []);

  if (!mount) return null;

  return <Scene />;
}
