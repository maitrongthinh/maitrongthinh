'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowUpRight } from 'lucide-react';
import { channels, site, skills } from '@/content/content';
import SectionHeading from '@/components/ui/SectionHeading';
import Marquee from '@/components/ui/Marquee';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * About: statement copy on the left, a fact table and the channel list on the right.
 *
 * The paragraphs de-blur and rise as they enter the viewport. Blur is animated
 * rather than opacity alone because on a near-black ground a pure fade is almost
 * invisible until it is nearly finished.
 */
export default function About() {
  const rootRef = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.from('[data-about-line]', {
        y: 34,
        opacity: 0,
        filter: 'blur(10px)',
        duration: 1.1,
        ease: 'power3.out',
        stagger: 0.12,
        scrollTrigger: { trigger: root, start: 'top 72%', once: true },
      });

      gsap.from('[data-fact]', {
        opacity: 0,
        x: 24,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.07,
        scrollTrigger: { trigger: '[data-facts]', start: 'top 82%', once: true },
      });
    }, root);

    return () => ctx.revert();
  }, [reduced]);

  // Identity only. The two handles that used to sit here moved into the channel
  // list below, where they are links rather than text.
  const facts: [string, string][] = [
    ['NAME', site.name],
    ['ROLE', site.role],
    ['BASED', site.location],
    ['STATUS', site.available ? 'Available for work' : 'Currently booked'],
    ['STACK', skills.map((g) => g.label).join(' / ')],
  ];

  return (
    <section
      ref={rootRef}
      id="about"
      className="relative z-10 border-t border-rule bg-ground/88"
    >
      <div className="px-5 py-20 sm:px-8 sm:py-28">
        <SectionHeading index="01" label="About" title="WHO" aside={site.location} />

        <div className="mt-14 grid gap-14 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          <div className="space-y-7">
            {/*
             * Three sizes, not one.
             *
             * Both paragraphs used to render at `text-xl`, which is why this
             * column read as a wall: nothing in it claimed to be the point. The
             * first line is now a statement set near heading scale, the second is
             * supporting copy, and the note below it is a footnote — so the eye
             * lands somewhere before it starts reading.
             *
             * Not `font-display`: Archivo Black is a display face at heading
             * sizes and a shout at four lines of prose. This is the body face
             * pushed up, with the tracking pulled in to compensate.
             */}
            {site.bio.map((para, i) => (
              <p
                key={para}
                data-about-line
                className={
                  i === 0
                    ? 'max-w-[34ch] text-[5.8vw] leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.15vw]'
                    : 'max-w-[54ch] text-base leading-relaxed text-ink-dim sm:text-lg'
                }
              >
                {para}
              </p>
            ))}

            <p data-about-line className="max-w-[54ch] text-sm leading-relaxed text-ink-dim">
              Everything on this page is built from primitives — the structure behind you is
              instanced geometry generated from a seed, not a downloaded model, and it reacts to
              whatever is playing in the player bottom-left.
            </p>
          </div>

          {/* Fact table, then the channels */}
          <div>
            <dl data-facts className="border-t border-rule">
              {facts.map(([k, v]) => (
                <div
                  key={k}
                  data-fact
                  className="flex items-baseline justify-between gap-6 border-b border-rule py-4"
                >
                  <dt className="label shrink-0">{k}</dt>
                  <dd className="text-right text-sm text-ink sm:text-base">{v}</dd>
                </div>
              ))}
            </dl>

            {/*
             * Channels, in the same ruled-row language as the facts above.
             *
             * Two of these used to be rows in that table — plain text, unclickable,
             * indistinguishable from the city name. Handles are the part that says
             * who someone is, so they are set in the display face here rather than
             * as another small label, and the row is a link end to end.
             *
             * The rest is deliberately restrained: no icons, no counts, no buttons.
             * The only accent is the inverted `PLATFORM` row, and it earns it by
             * being the one thing on the list he owns rather than an account on
             * somebody else's site.
             */}
            <p className="label mt-10 mb-0 flex items-baseline justify-between gap-4">
              <span>FIND ME</span>
              <span className="text-[9px]">{channels.length} CHANNELS</span>
            </p>

            <ul data-facts className="mt-4 border-t border-rule">
              {channels.map((c) => (
                <li key={c.label} data-fact>
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noreferrer"
                    data-cursor="OPEN"
                    className={`group flex items-baseline justify-between gap-4 border-b border-rule px-3 py-3 transition-colors duration-200 ${
                      c.own
                        ? 'bg-ink text-ground hover:bg-ground hover:text-ink'
                        : 'hover:bg-ground-2'
                    }`}
                  >
                    <span className="flex min-w-0 items-baseline gap-3">
                      <span
                        className={`label shrink-0 ${c.own ? 'text-ground' : 'group-hover:text-ink'}`}
                      >
                        {c.label}
                      </span>
                      {c.note && (
                        <span className={`label text-[9px] ${c.own ? 'text-ground' : ''}`}>
                          {c.note}
                        </span>
                      )}
                    </span>

                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="font-mono text-sm tracking-tight sm:text-base">
                        {c.handle}
                      </span>
                      <ArrowUpRight
                        size={13}
                        className="shrink-0 translate-y-[1px] transition-transform duration-200 group-hover:-translate-y-0 group-hover:translate-x-[2px]"
                      />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Ticker of disciplines, running the full bleed. */}
      <div className="border-t border-rule py-6">
        <Marquee
          items={['DISCORD BOTS', 'AI AGENTS', 'WEB', 'NODE.JS', 'PYTHON', 'C++']}
          duration={30}
        />
      </div>
    </section>
  );
}
