'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Full-page film grain, scanlines and a vignette.
 *
 * This sits above every section — including the HTML ones — rather than living
 * in the postprocessing chain, because the 3D canvas only covers the hero. A
 * single fixed overlay is also cheaper than a fullscreen shader pass.
 *
 * Grain is an inline `feTurbulence` SVG rather than a bitmap so it costs zero
 * network requests and stays sharp at any DPR.
 */
const NOISE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">
     <filter id="n">
       <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch"/>
       <feColorMatrix type="saturate" values="0"/>
     </filter>
     <rect width="220" height="220" filter="url(#n)" opacity="0.55"/>
   </svg>`,
)}`;

export default function GrainOverlay() {
  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const animate = !reduced && !isMobile;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[150]"
      // Composition, not pixels, is the cost of a fullscreen blend layer.
      // `isolation` closes the blending group here so the overlay samples its own
      // stacking context instead of the whole document; `contain` promises nothing
      // inside can affect layout outside it. Together they stop a continuously
      // scrolling page from re-blending the entire viewport every frame.
      style={{ isolation: 'isolate', contain: 'strict' }}
    >
      {/* Grain. Oversized and offset so the shift animation never exposes an edge. */}
      <div
        className="absolute -inset-[12%] opacity-[0.16] mix-blend-overlay"
        style={{
          backgroundImage: `url("${NOISE}")`,
          backgroundRepeat: 'repeat',
          animation: animate ? 'grainShift 0.9s steps(5) infinite' : 'none',
          // Transform-only animation on its own GPU layer: the shift composites,
          // it never repaints the noise bitmap.
          willChange: animate ? 'transform' : undefined,
        }}
      />

      {/*
       * Scanlines. 3px period keeps them visible without moiré on most DPRs.
       *
       * Weak on purpose, and weaker than it looks like it should be: `isolation`
       * on the parent closes the blending group, so `mix-blend-soft-light` here
       * blends against a transparent group rather than the page, and the layer
       * ends up composited normally — i.e. as flat black lines. That is
       * invisible over the near-black ground it was tuned on, and a visible
       * stripe pattern over the paper-white slabs (`.slab-invert`, `#work`).
       * Since half the page is now light, the alpha has to be low enough to read
       * as a tint on paper. Blending against the page instead would make the
       * lines sign-correct, but that means re-blending the viewport every
       * scrolled frame, which is the cost `isolation` is here to avoid.
       */}
      <div
        className="absolute inset-0 opacity-[0.14] mix-blend-soft-light"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(0,0,0,0.55) 0px, rgba(0,0,0,0.55) 1px, transparent 1px, transparent 3px)',
        }}
      />

      {/* Vignette — pulls focus to the centre and hides canvas edge seams. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 45%, transparent 45%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </div>
  );
}
