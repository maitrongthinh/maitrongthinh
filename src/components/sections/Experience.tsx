'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { timeline } from '@/content/content';
import SectionHeading from '@/components/ui/SectionHeading';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Path: work and education on one spine.
 *
 * The year column is `sticky` inside each entry, so as you scroll through a long
 * entry the dates stay pinned beside the text they belong to. The vertical rule is
 * a single absolutely-positioned line drawn behind every row, and the progress
 * marker on it is scrubbed by scroll position rather than triggered once.
 */
export default function Experience() {
  const rootRef = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // The spine draws itself as the section passes through the viewport.
      gsap.fromTo(
        '[data-spine-fill]',
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: '[data-spine]',
            start: 'top 78%',
            end: 'bottom 62%',
            scrub: 0.6,
          },
        },
      );

      gsap.utils.toArray<HTMLElement>('[data-entry]').forEach((entry) => {
        gsap.from(entry, {
          opacity: 0,
          y: 30,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: entry, start: 'top 84%', once: true },
        });
      });
    }, root);

    return () => ctx.revert();
  }, [reduced]);

  return (
    // `slab-invert`: paper ground, ink type. Third of the four panels in the
    // second half of the page, so the scroll alternates instead of running one
    // continuous dark field from WORK to the footer. The tokens flip for the whole
    // subtree, so nothing inside this section needed a colour change.
    <section
      ref={rootRef}
      id="path"
      className="slab-invert relative z-10 border-t border-rule"
    >
      <div className="px-5 py-20 sm:px-8 sm:py-28">
        <SectionHeading index="04" label="Trajectory" title="PATH" aside="WORK / EDUCATION" />

        <div data-spine className="relative mt-14 pl-6 sm:pl-10">
          {/* Spine: static rule, plus a fill that grows with scroll. */}
          <div className="absolute left-0 top-0 h-full w-px bg-rule sm:left-[3px]">
            <div data-spine-fill className="h-full w-px origin-top bg-ink" />
          </div>

          <ol className="space-y-16 sm:space-y-24">
            {timeline.map((entry) => (
              <li
                key={`${entry.from}-${entry.title}`}
                data-entry
                className="relative grid gap-4 sm:grid-cols-[110px_1fr] sm:gap-10"
              >
                {/* Node on the spine, aligned to the first text line. */}
                <span
                  aria-hidden
                  className={`absolute -left-6 top-[7px] h-[9px] w-[9px] border border-ink sm:-left-[10px] ${
                    entry.kind === 'work' ? 'bg-ink' : 'bg-ground'
                  }`}
                />

                <div className="sm:sticky sm:top-28 sm:self-start">
                  <p className="label whitespace-nowrap">
                    {entry.from} — {entry.to}
                  </p>
                  <p className="label mt-1 text-[9px] text-ink-dim">
                    {entry.kind === 'work' ? 'ROLE' : 'STUDY'}
                  </p>
                </div>

                <div>
                  <h3 className="font-display text-[7vw] leading-[0.95] sm:text-[3vw]">
                    {entry.title}
                  </h3>
                  <p className="label mt-2 text-ink-dim">{entry.org}</p>

                  <ul className="mt-5 max-w-[64ch] space-y-2">
                    {entry.points.map((point) => (
                      <li
                        key={point}
                        className="flex gap-3 text-sm leading-relaxed text-ink-dim sm:text-base"
                      >
                        <span aria-hidden className="mt-[0.7em] h-px w-4 shrink-0 bg-rule" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
