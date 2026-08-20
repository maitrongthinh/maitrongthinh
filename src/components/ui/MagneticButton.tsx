'use client';

import { useEffect, useRef } from 'react';
import { acquirePointer, pointer } from '@/lib/pointer';
import { acquireScroll, scrollState } from '@/lib/scrollState';
import { damp, onTick } from '@/lib/ticker';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type Props = {
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  /** Button type when rendering as a `<button>`. Ignored if `href` is set. */
  type?: 'button' | 'submit';
  /** Distance in px at which the pull begins. */
  radius?: number;
  /** Peak displacement in px at the centre. */
  strength?: number;
  label?: string;
};

/**
 * Element that leans toward the cursor when it comes close.
 *
 * The pull falls off linearly from the element centre to `radius`, and the inner
 * content moves at 45% of the outer displacement — that offset between frame and
 * label is what makes the effect read as weight rather than a flat slide.
 *
 * Disabled on coarse pointers, where there is no hover to respond to.
 */
export default function MagneticButton({
  children,
  className = '',
  href,
  onClick,
  type = 'button',
  radius = 130,
  strength = 22,
  label,
}: Props) {
  const outerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const enabled = !isMobile && !reduced;

  useEffect(() => {
    if (!enabled) return;

    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const release = acquirePointer(0.1);
    const releaseScroll = acquireScroll();

    let x = 0;
    let y = 0;

    /*
     * Centre is cached in *document* space, not viewport space.
     *
     * The previous version re-read `getBoundingClientRect()` on every scroll
     * event. Lenis emits one of those per frame, and each button on the page had
     * its own listener, so a single scrolled frame forced one synchronous layout
     * per button — measurable as the frame spikes during wheel scrolling. A
     * document-space centre only changes when layout changes, so scrolling now
     * costs a subtraction instead.
     */
    let centreX = 0;
    let centreDocY = 0;

    const remeasure = () => {
      const rect = outer.getBoundingClientRect();
      centreX = rect.left + rect.width / 2;
      centreDocY = rect.top + scrollState.y + rect.height / 2;
    };

    remeasure();

    // Layout can still move under it: fonts swapping in, images loading, a
    // reveal animation finishing. Re-read on resize and once things settle.
    const settle = setTimeout(remeasure, 1200);
    window.addEventListener('resize', remeasure);

    const releaseTick = onTick((dt) => {
      // Raw pointer, not the shared smoothed one: this loop already damps its own
      // output at 0.16, and stacking that on top of the store's 0.1 gave the button
      // roughly a quarter-second of lag. Weight, not sludge.
      const dx = pointer.rawX - centreX;
      const dy = pointer.rawY - (centreDocY - scrollState.y);
      const dist = Math.hypot(dx, dy);

      let tx = 0;
      let ty = 0;

      if (dist < radius) {
        const pull = (1 - dist / radius) * strength;
        tx = (dx / (dist || 1)) * pull;
        ty = (dy / (dist || 1)) * pull;
      }

      const k = damp(0.16, dt);
      x += (tx - x) * k;
      y += (ty - y) * k;

      // Below a tenth of a pixel the transform is invisible; skipping the write
      // keeps a page full of idle buttons from dirtying a layer every frame.
      if (Math.abs(x) < 0.05 && Math.abs(y) < 0.05 && Math.abs(tx) < 0.05) {
        if (outer.style.transform) {
          outer.style.transform = '';
          inner.style.transform = '';
        }
        return;
      }

      outer.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      inner.style.transform = `translate3d(${(x * 0.45).toFixed(2)}px, ${(y * 0.45).toFixed(2)}px, 0)`;
    });

    return () => {
      clearTimeout(settle);
      releaseTick();
      window.removeEventListener('resize', remeasure);
      release();
      releaseScroll();
      outer.style.transform = '';
      inner.style.transform = '';
    };
  }, [enabled, radius, strength]);

  const shared = {
    ref: outerRef as never,
    className: `relative inline-flex items-center justify-center will-change-transform ${className}`,
    'data-cursor': label ?? 'link',
  };

  const content = (
    <span ref={innerRef} className="inline-flex items-center gap-2 will-change-transform">
      {children}
    </span>
  );

  if (href) {
    return (
      <a {...shared} href={href}>
        {content}
      </a>
    );
  }

  return (
    <button {...shared} type={type} onClick={onClick}>
      {content}
    </button>
  );
}
