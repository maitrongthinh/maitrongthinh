'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Project } from '@/content/content';
import { acquirePointer, pointer } from '@/lib/pointer';
import { onTick } from '@/lib/ticker';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Work index as a hard-ruled table, inverted to white-on-black's opposite.
 *
 * Inverting this one section is deliberate: it is the part of the page people
 * actually came to read, and flipping the ground makes it the loudest thing in
 * the scroll. The `mix-blend-difference` cursor stays legible across the flip
 * with no extra handling.
 *
 * Hovering a row floats a preview card that tracks the pointer. Only the hovered
 * index lives in React state — the card's position is written straight to the DOM
 * from the shared pointer loop.
 *
 * The rows arrive as a prop because half of them are fetched from GitHub at build
 * time; see `lib/github.ts`.
 */
export default function Projects({ projects }: { projects: Project[] }) {
  const [active, setActive] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const previewEnabled = !isMobile && !reduced;

  useEffect(() => {
    // Nothing to position while no row is hovered, and the card is hidden then —
    // subscribing anyway meant a transform write every frame for the whole visit.
    if (!previewEnabled || active === null) return;
    const card = cardRef.current;
    if (!card) return;

    const release = acquirePointer(0.1);
    const releaseTick = onTick(() => {
      // Offset up-left of the cursor so the card never sits under the pointer.
      card.style.transform = `translate3d(${pointer.x + 28}px, ${pointer.y - 120}px, 0)`;
    });

    return () => {
      releaseTick();
      release();
    };
  }, [previewEnabled, active]);

  const activeProject = active === null ? null : projects[active];

  return (
    <section id="work" className="relative z-10 bg-ink text-ground">
      <div className="px-5 py-20 sm:px-8 sm:py-28">
        <header className="border-t border-ground/25 pt-5">
          <div className="mb-6 flex items-baseline justify-between gap-6">
            <span className="label text-[9px] text-ground/55">02 — Selected work</span>
            <span className="label hidden text-[9px] text-ground/55 sm:block">
              {String(projects.length).padStart(2, '0')} PROJECTS
            </span>
          </div>
          {/* Hand-rolled rather than `<SectionHeading>` because this slab is
              `bg-ink text-ground`, so every label needs a ground-tinted override.
              Sizes are kept in lockstep with that component by hand. */}
          <h2 className="font-display text-[15vw] leading-[0.82] sm:text-[9.5vw]">WORK</h2>
        </header>

        <ul className="mt-12 border-t border-ground/25">
          {projects.map((p, i) => (
            <li key={p.id}>
              <a
                href={p.href ?? p.repo ?? '#'}
                target={p.href || p.repo ? '_blank' : undefined}
                rel="noreferrer"
                data-cursor="VIEW"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-ground/25 py-6 transition-colors duration-300 hover:bg-ground hover:text-ink sm:gap-8 sm:py-8"
              >
                <span className="label w-8 text-ground/55 transition-colors group-hover:text-ink/55">
                  {String(i + 1).padStart(2, '0')}
                </span>

                <span className="min-w-0">
                  <span className="font-display block text-[8vw] leading-[0.9] sm:text-[4.2vw]">
                    {p.title}
                  </span>

                  {/* Detail strip — collapsed until hover, so the index stays scannable. */}
                  <span className="grid grid-rows-[0fr] overflow-hidden transition-[grid-template-rows] duration-500 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
                    <span className="min-h-0">
                      <span className="block max-w-[62ch] pt-3 text-sm leading-relaxed opacity-70">
                        {p.blurb}
                      </span>
                      <span className="mt-3 flex flex-wrap gap-2">
                        {p.stack.map((s) => (
                          <span key={s} className="label border border-current px-2 py-1 text-[9px]">
                            {s}
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                </span>

                <span className="flex shrink-0 flex-col items-end gap-2">
                  <span className="label text-ground/55 transition-colors group-hover:text-ink/55">
                    {p.year}
                  </span>
                  <ArrowUpRight
                    size={18}
                    className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1"
                  />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Cursor-tracking preview card */}
      {previewEnabled && (
        <div
          ref={cardRef}
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-[145] w-[300px] will-change-transform"
          style={{
            opacity: activeProject ? 1 : 0,
            transition: 'opacity 260ms var(--ease-brut)',
          }}
        >
          <div className="border border-ink bg-ground text-ink">
            {/* Screenshot if provided; otherwise a generated stripe field. */}
            <div
              className="h-[150px] w-full border-b border-rule bg-cover bg-center"
              style={
                activeProject?.image
                  ? { backgroundImage: `url(${activeProject.image})` }
                  : {
                      backgroundImage:
                        'repeating-linear-gradient(135deg, #f2f0eb 0 2px, transparent 2px 9px)',
                      opacity: 0.22,
                    }
              }
            />
            <div className="p-3">
              <p className="label mb-1">{activeProject?.role}</p>
              <p className="font-display text-2xl leading-none">{activeProject?.title}</p>
              {activeProject?.metrics && (
                <p className="label mt-2 text-[9px]">{activeProject.metrics}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
