'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { skills } from '@/content/content';
import SectionHeading from '@/components/ui/SectionHeading';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Stack, as columns of measured bars.
 *
 * Each bar's width lives in a `--level` custom property set inline from the data,
 * so the animation only has to drive `scaleX` on the fill — the layout is already
 * correct before any JS runs, which matters because reduced-motion users never get
 * the tween.
 */
export default function Skills() {
  const rootRef = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.from('[data-meter-fill]', {
        scaleX: 0,
        duration: 1.15,
        ease: 'expo.out',
        stagger: { each: 0.045, from: 'start' },
        scrollTrigger: { trigger: root, start: 'top 74%', once: true },
      });

      gsap.from('[data-skill-row]', {
        opacity: 0,
        y: 14,
        duration: 0.6,
        ease: 'power2.out',
        stagger: 0.03,
        scrollTrigger: { trigger: root, start: 'top 74%', once: true },
      });
    }, root);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={rootRef}
      id="stack"
      className="relative z-10 border-t border-rule bg-ground/88"
    >
      <div className="px-5 py-20 sm:px-8 sm:py-28">
        <SectionHeading
          index="03"
          label="Capability"
          title="STACK"
          aside={`${skills.reduce((n, g) => n + g.items.length, 0)} TOOLS`}
        />

        <div className="mt-14 grid gap-x-12 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
          {skills.map((group) => (
            <div key={group.label}>
              <h3 className="label mb-6 border-b border-rule pb-3">{group.label}</h3>

              <ul className="space-y-5">
                {group.items.map((item) => (
                  <li key={item.name} data-skill-row>
                    <div className="mb-2 flex items-baseline justify-between gap-4">
                      <span className="text-sm text-ink">{item.name}</span>
                      <span className="label text-[10px] text-ink-dim">{item.level}</span>
                    </div>

                    {/* Track + fill. `origin-left` so scaleX grows from the rule. */}
                    <div className="h-[3px] w-full bg-rule">
                      <div
                        data-meter-fill
                        className="h-full origin-left bg-ink"
                        style={{ width: `${item.level}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
