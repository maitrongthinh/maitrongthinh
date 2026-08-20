'use client';

import { useEffect, useState } from 'react';

/**
 * True when the viewport is narrow *or* the pointer is coarse.
 *
 * Used to strip the expensive layer of the site — heavy postprocessing, the
 * custom cursor, mouse scrubbing — on devices that either cannot afford the GPU
 * cost or have no hover pointer to drive those effects.
 */
export function useIsMobile(breakpoint = 1024): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = `(max-width: ${breakpoint - 1}px), (pointer: coarse)`;
    const mq = window.matchMedia(query);
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);

  return isMobile;
}
