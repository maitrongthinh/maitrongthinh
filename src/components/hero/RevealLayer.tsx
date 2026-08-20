'use client';

import { useEffect, useRef, useState } from 'react';
import { acquirePointer, pointer } from '@/lib/pointer';
import { acquireScroll, scrollState } from '@/lib/scrollState';
import { onTick } from '@/lib/ticker';
import { heroLayers } from '@/content/content';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Cursor spotlight that reveals a second layer through a soft circular mask.
 *
 * Fills whatever box it is dropped into — currently the hero's bordered plate.
 *
 * Two modes, chosen automatically:
 *
 * - `image` — both files in `content.heroLayers` loaded. The reveal image is
 *   stacked over the base one and masked, so the spotlight acts as a window
 *   between two versions of the same shot.
 * - `invert` — fallback if either file is missing. Instead of a second image, the
 *   masked layer inverts whatever is behind it (including the live 3D canvas) via
 *   `backdrop-filter`, which gives the same X-ray read with zero assets.
 *
 * Implementation note: the mask is a CSS `radial-gradient` positioned from two
 * custom properties, and the animation frame only writes those two properties.
 * The obvious alternative — redrawing a canvas gradient and calling
 * `toDataURL()` each frame, as this interaction is usually written — spends
 * 5-15ms per frame PNG-encoding the mask and cannot hold 60fps. Same visual
 * result, same gradient stops, a fraction of the cost.
 */

/**
 * Spotlight radius for a given plate box.
 *
 * `heroLayers.radius` is a ceiling now, not the answer. A fixed 260px was wider
 * than the plate is tall on every laptop screen, and a circle larger than its
 * container has no edge inside the frame: the soft rim that makes it read as a
 * spotlight falls outside the box, so what is left looks like a horizontal wipe
 * following the cursor. Tying it to the short side keeps the falloff visible in
 * the frame at any plate size, and the floor keeps it from shrinking to a pinhole
 * on a phone-width plate.
 */
const spotlightRadius = (w: number, h: number) =>
  Math.round(Math.max(96, Math.min(heroLayers.radius, Math.min(w, h) * 0.46)));

/** Gradient stops are kept verbatim from the reference interaction. */
const MASK = (radiusVar: string) =>
  `radial-gradient(circle ${radiusVar} at var(--mx) var(--my),` +
  ' rgba(255,255,255,1) 0%,' +
  ' rgba(255,255,255,1) 40%,' +
  ' rgba(255,255,255,0.75) 60%,' +
  ' rgba(255,255,255,0.4) 75%,' +
  ' rgba(255,255,255,0.12) 88%,' +
  ' rgba(255,255,255,0) 100%)';

/*
 * The reveal used to carry a hairline ring scribed at the mask edge, added back
 * when both layers were near-identical dark rock and the blend read as broken.
 * With the current pair — bare rock against overgrown-and-lit — the two states
 * are obviously different inside the light, so the ring only announced itself as
 * a hard drawn circle: reported, fairly, as tacky. Gone. The spotlight is now the
 * soft radial mask alone, a flashlight over the plate with no edge to catch.
 */

export default function RevealLayer() {
  /*
   * The pointer variables are written to this wrapper, not to the masked layer.
   *
   * Custom properties inherit down, so one write on a shared ancestor positions
   * the mask and the ring together; setting them on the masked layer would leave
   * the ring — its sibling — with no way to see them, and setting them on both
   * would double the per-frame style writes.
   */
  const hostRef = useRef<HTMLDivElement>(null);

  /*
   * The two images are tracked separately, and that is a load-time decision rather
   * than a tidiness one.
   *
   * This was a single `hasImages` flag set from `Promise.all`, so the resting layer
   * — the largest thing on the first screen, and the one already hinted from the
   * page — could not paint until its 134KB pair had also arrived. The spotlight
   * image is only ever seen inside a small circle under the cursor; making the
   * whole plate wait for it spent the entire first impression on a layer nobody
   * has looked at yet.
   *
   * Resolved independently, the plate shows art the moment its own file lands and
   * the spotlight upgrades from invert mode to the second image whenever that
   * finishes. If either never arrives, the corresponding half falls back on its
   * own and the interaction still works.
   */
  const [hasBase, setHasBase] = useState(false);
  const [hasReveal, setHasReveal] = useState(false);

  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();

  // `swap` flips which state is the resting one and which is under the light.
  const baseSrc = heroLayers.swap ? heroLayers.reveal : heroLayers.base;
  const revealSrc = heroLayers.swap ? heroLayers.base : heroLayers.reveal;

  // Probe both images; either half falls back to invert mode on its own.
  useEffect(() => {
    let cancelled = false;

    const load = (src: string, set: (ok: boolean) => void) => {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) set(true);
      };
      img.onerror = () => {
        if (!cancelled) set(false);
      };
      img.src = src;
    };

    load(baseSrc, setHasBase);
    load(revealSrc, setHasReveal);

    return () => {
      cancelled = true;
    };
  }, [baseSrc, revealSrc]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const release = acquirePointer(heroLayers.ease);
    const releaseScroll = acquireScroll();

    /*
     * The pointer store is in viewport space; the mask gradient is positioned
     * inside this element's box, so the offset has to come off the element.
     *
     * That used to be a `getBoundingClientRect()` per frame — a forced layout 60
     * times a second for the entire visit, whether or not the plate was on screen.
     * The box only moves horizontally on resize, and vertically with scroll, both
     * of which are already tracked: cache the left edge and the document-space top,
     * then subtract `scrollState.y`.
     */
    let left = 0;
    let docTop = 0;

    const remeasure = () => {
      const rect = el.getBoundingClientRect();
      left = rect.left;
      docTop = rect.top + scrollState.y;
      el.style.setProperty('--r', `${spotlightRadius(rect.width, rect.height)}px`);
    };

    remeasure();
    const settle = setTimeout(remeasure, 1200);
    window.addEventListener('resize', remeasure);

    // No spotlight to move while the plate is scrolled away.
    let visible = true;
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            visible = entries.some((e) => e.isIntersecting);
          });
    io?.observe(el);

    const releaseTick = onTick(() => {
      if (!visible) return;
      // The spotlight follows the cursor in both motion modes — the visitor drives
      // it, so it is direct manipulation, not autonomous animation. Under reduced
      // motion, drop the eased trail (read the raw pointer) so the mask sits exactly
      // under the cursor with no drift; otherwise ride the shared eased position.
      const cx = reduced ? pointer.rawX : pointer.x;
      const cy = reduced ? pointer.rawY : pointer.y;
      el.style.setProperty('--mx', `${(cx - left).toFixed(1)}px`);
      el.style.setProperty('--my', `${(cy - (docTop - scrollState.y)).toFixed(1)}px`);
    });

    return () => {
      clearTimeout(settle);
      releaseTick();
      io?.disconnect();
      window.removeEventListener('resize', remeasure);
      release();
      releaseScroll();
    };
  }, [reduced]);

  // Touch devices have no hovering cursor to drive a spotlight, so the plate just
  // shows the resting state.
  if (isMobile) {
    return hasBase ? (
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${baseSrc})` }}
      />
    ) : null;
  }

  const radius = 'var(--r)';

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="absolute inset-0"
      style={
        {
          '--mx': '50%',
          '--my': '50%',
          // Declared, not optional: an undefined `--r` makes the gradient invalid at
          // computed-value time, which resolves to `mask-image: none` and flashes
          // the whole reveal layer unmasked for the frame before the effect runs.
          '--r': `${heroLayers.radius}px`,
        } as unknown as React.CSSProperties
      }
    >
      {/* Base layer — only rendered when real art is present. */}
      {hasBase && (
        <div
          className="hero-zoom absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${baseSrc})` }}
        />
      )}

      {/* Masked reveal layer. */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          maskImage: MASK(radius),
          WebkitMaskImage: MASK(radius),
          maskSize: '100% 100%',
          WebkitMaskSize: '100% 100%',
          maskRepeat: 'no-repeat',
          ...(hasReveal
            ? { backgroundImage: `url(${revealSrc})` }
            : {
                // No second image: invert whatever is behind the mask instead —
                // the base plate if it loaded, the live 3D canvas if it did not.
                backdropFilter: 'invert(1) contrast(1.08)',
                WebkitBackdropFilter: 'invert(1) contrast(1.08)',
              }),
        }}
      />
    </div>
  );
}
