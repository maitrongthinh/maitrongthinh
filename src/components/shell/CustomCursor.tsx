'use client';

import { useEffect, useRef } from 'react';
import { acquirePointer, pointer } from '@/lib/pointer';
import { damp, onTick } from '@/lib/ticker';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Two-part cursor: a small solid dot that tracks the pointer exactly, and a
 * larger ring that lags behind it.
 *
 * The ring inverts against whatever is under it via `mix-blend-mode: difference`,
 * which is what keeps a white cursor legible on both the black ground and the
 * white inverted sections without any per-section logic.
 *
 * Hover state is read from `data-cursor` attributes on the element under the
 * pointer, so any component can grow or label the cursor by adding
 * `data-cursor="view"` — no imports, no context.
 */
export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const enabled = !isMobile && !reduced;

  useEffect(() => {
    if (!enabled) {
      document.body.removeAttribute('data-custom-cursor');
      return;
    }

    document.body.setAttribute('data-custom-cursor', 'on');
    const release = acquirePointer(0.1);

    const dot = dotRef.current!;
    const ring = ringRef.current!;
    const label = labelRef.current!;

    /*
     * The dot follows the *raw* pointer, the ring eases off it.
     *
     * `pointer.x/y` is the shared smoothed position, which is right for a spotlight
     * and wrong here: at ease 0.1 it needs about ten frames to close the distance,
     * so the dot trailed the real hardware cursor by roughly 160ms. With the native
     * cursor hidden there is nothing else on screen to compare against, and the
     * whole page reads as laggy — the one thing a custom cursor must never do.
     * Raw for the dot, damped for the ring, and the gap between the two is the
     * effect.
     */
    let ringX = pointer.rawX;
    let ringY = pointer.rawY;
    let scale = 1;
    let targetScale = 1;
    let currentLabel = '';

    const readHover = () => {
      const el = document.elementFromPoint(pointer.rawX, pointer.rawY) as HTMLElement | null;
      const target = el?.closest<HTMLElement>('[data-cursor]');
      const next = target?.dataset.cursor ?? '';
      if (next !== currentLabel) {
        currentLabel = next;
        label.textContent = next && next !== 'link' ? next : '';
        targetScale = next ? (next === 'link' ? 2.2 : 3.4) : 1;
      }
    };

    let hoverAge = 0;

    const releaseTick = onTick((dt) => {
      const kRing = damp(0.16, dt);
      ringX += (pointer.rawX - ringX) * kRing;
      ringY += (pointer.rawY - ringY) * kRing;
      scale += (targetScale - scale) * damp(0.14, dt);

      dot.style.transform = `translate3d(${pointer.rawX}px, ${pointer.rawY}px, 0) translate(-50%, -50%)`;
      ring.style.transform = `translate3d(${ringX.toFixed(1)}px, ${ringY.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;

      // elementFromPoint is a layout read; 10Hz is plenty for hover state, and a
      // time budget keeps that rate the same on a 144Hz display as on a 60Hz one.
      hoverAge += dt;
      if (hoverAge >= 0.1) {
        hoverAge = 0;
        readHover();
      }
    });

    return () => {
      releaseTick();
      release();
      document.body.removeAttribute('data-custom-cursor');
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[200] hidden lg:block">
      <div
        ref={ringRef}
        className="absolute left-0 top-0 h-8 w-8 border border-ink mix-blend-difference will-change-transform"
      />
      <div
        ref={dotRef}
        className="absolute left-0 top-0 flex h-1.5 w-1.5 items-center justify-center bg-ink mix-blend-difference will-change-transform"
      >
        <span
          ref={labelRef}
          className="label absolute whitespace-nowrap text-[9px] text-ink"
          style={{ transform: 'translateY(-22px)' }}
        />
      </div>
    </div>
  );
}
