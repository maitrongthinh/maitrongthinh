'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type Props = {
  text: string;
  /** Element to render. Defaults to a span. */
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  className?: string;
  /** Seconds before the first character moves. */
  delay?: number;
  /** Animate when scrolled into view instead of immediately on mount. */
  onScroll?: boolean;
};

/**
 * Splits `text` into per-character spans and rises them into place with a stagger.
 *
 * Characters are wrapped in a clipping span so each one slides up from behind its
 * own baseline rather than fading in place. Words are kept intact with
 * `inline-block` + `whitespace-nowrap` wrappers so the line still breaks at word
 * boundaries — splitting into bare characters is the usual bug here and produces
 * text that wraps mid-word.
 *
 * The original string stays in an `aria-label`, and the split spans are hidden
 * from assistive tech, so screen readers read a sentence rather than letters.
 */
export default function RevealText({
  text,
  as: Tag = 'span',
  className = '',
  delay = 0,
  onScroll = true,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    gsap.registerPlugin(ScrollTrigger);

    const chars = el.querySelectorAll<HTMLElement>('[data-char]');
    if (!chars.length) return;

    /*
     * Hand the transform over to GSAP before tweening it.
     *
     * The spans are rendered with an inline `translateY(118%)` so the split text is
     * already hidden on the first paint, before this effect can run. The trap is
     * that `getComputedStyle` reports that percentage as a resolved pixel matrix,
     * and GSAP records whatever it finds as the element's *base* transform, then
     * composes `yPercent` on top of it. So the tween ran from 118%+181px to
     * 0%+181px: it played, it completed, and every character finished exactly where
     * it started — clipped out of sight by its own `overflow-hidden` wrapper. Every
     * split heading on the site was invisible to anyone who had not asked for
     * reduced motion, which is the one audience that never saw the bug.
     *
     * Clearing it here makes the base identity. `fromTo` re-applies the from-state
     * in this same task, so no frame is ever painted with the text at rest.
     */
    gsap.set(chars, { clearProps: 'transform' });

    const tween = gsap.fromTo(
      chars,
      { yPercent: 118, rotate: 4 },
      {
        yPercent: 0,
        rotate: 0,
        duration: 1.05,
        ease: 'power4.out',
        stagger: 0.018,
        delay,
        scrollTrigger: onScroll
          ? { trigger: el, start: 'top 88%', once: true }
          : undefined,
      },
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [delay, onScroll, reduced, text]);

  const words = text.split(' ');

  return (
    <Tag ref={ref as never} className={className} aria-label={text}>
      {words.map((word, wi) => (
        <span key={`${word}-${wi}`} aria-hidden className="inline-block whitespace-nowrap">
          {Array.from(word).map((char, ci) => (
            <span
              key={`${char}-${ci}`}
              className="inline-block overflow-hidden align-bottom"
              style={{ verticalAlign: 'bottom' }}
            >
              <span
                data-char
                className="inline-block"
                style={reduced ? undefined : { transform: 'translateY(118%)' }}
              >
                {char}
              </span>
            </span>
          ))}
          {/* Real space between words so line breaking still works. */}
          {wi < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </Tag>
  );
}
