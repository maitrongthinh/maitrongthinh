'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks the `prefers-reduced-motion` media query.
 *
 * Returns `false` during SSR and the first client render so markup matches, then
 * flips on mount if the user opted out of motion.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
