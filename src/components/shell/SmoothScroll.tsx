'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Height the fixed nav bar occupies, in pixels.
 *
 * An anchor scroll that lands a section's top edge at the top of the viewport
 * parks it *behind* the bar: `#stack` arrived with its own `03 — CAPABILITY` index
 * row hidden under the chrome. The bar is `py-5` around a 40px chip, so 80px plus
 * a little air is what has to be left above the target.
 */
const NAV_CLEARANCE = 88;

/**
 * Wires Lenis inertial scrolling into GSAP's ticker and ScrollTrigger.
 *
 * Both libraries want to own the scroll loop. Letting each run its own RAF
 * causes ScrollTrigger to read stale positions and pin/unpin a frame late, so
 * instead Lenis is stepped manually from GSAP's ticker and ScrollTrigger is
 * told to update on every Lenis scroll event.
 *
 * When the user prefers reduced motion, Lenis is skipped entirely and native
 * scrolling is used — smoothing is the exact kind of motion they opted out of.
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    if (reduced) {
      ScrollTrigger.refresh();
      return;
    }

    const lenis = new Lenis({
      duration: 1.15,
      // Long, slightly overshoot-free easing; matches --ease-brut in CSS.
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 1.6,
    });

    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => {
      // GSAP ticker reports seconds; Lenis expects milliseconds.
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(tick);
    // GSAP's default lag smoothing skips frames on a stall, which desyncs Lenis.
    gsap.ticker.lagSmoothing(0);

    // Anchor links must be handed to Lenis or they jump instantly.
    const onAnchorClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!anchor) return;
      const id = anchor.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -NAV_CLEARANCE, duration: 1.4 });
    };

    document.addEventListener('click', onAnchorClick);

    return () => {
      document.removeEventListener('click', onAnchorClick);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, [reduced]);

  return <>{children}</>;
}
