'use client';

import { ArrowDownRight } from 'lucide-react';
import { contact, primaryContact, site } from '@/content/content';
import { useTypewriter } from '@/hooks/useTypewriter';
import RevealLayer from './RevealLayer';
import RevealText from '@/components/ui/RevealText';
import MagneticButton from '@/components/ui/MagneticButton';

/**
 * Full-viewport opening frame.
 *
 * Sits above the fixed 3D canvas with a transparent background, so the monolith
 * shows through everywhere the copy is not. Height is `100dvh` rather than
 * `100vh` so mobile browser chrome does not crop the bottom row.
 *
 * The height is fixed, not a minimum, and the figure plate flexes to absorb the
 * slack instead of claiming a fixed `vh` slice. With a fixed plate the section
 * measured 1033px against a 900px viewport, which pushed the bio and the call to
 * action below the fold on any laptop screen and slid the figure caption directly
 * under the docked player. Letting the plate shrink keeps the display type at full
 * size — the one thing that cannot be traded away here — and still guarantees the
 * whole frame lands on one screen.
 *
 * The spotlight-reveal pair is framed rather than full-bleed. Both images are
 * near-black with colour in them, and bleeding them behind the type would break
 * the black-on-paper contract the rest of the page keeps — inside a hard-ruled
 * plate, captioned like a figure, the colour reads as the one accent on the site
 * instead of a theme change.
 */
export default function Hero() {
  const { displayed, done } = useTypewriter(`${site.role}\n${site.location}`, 34, 900);

  return (
    <section
      id="hero"
      className="relative flex w-full flex-col justify-between overflow-hidden"
      style={{ height: '100dvh', minHeight: '720px' }}
    >
      {/* Top row — pushed clear of the fixed header. */}
      <div className="relative z-30 flex items-start justify-between px-5 pt-24 sm:px-8 sm:pt-28">
        <p
          style={{ animationDelay: '0.4s' }}
          className="label anim-fade-up max-w-[15ch] whitespace-pre-wrap text-ink sm:max-w-none"
        >
          {displayed}
          {!done && (
            <span className="animate-blink ml-[2px] inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-ink align-middle" />
          )}
        </p>

        <div className="hidden text-right sm:block">
          <p className="label">
            {site.available ? 'OPEN TO WORK' : 'BOOKED'}
            <br />
            {new Date().getFullYear()}
          </p>

          {/*
           * The community, named on the first screen.
           *
           * The hero had no presence at all — the server was four scrolls down in a
           * footer row of five identical words. This is the smallest thing that
           * fixes it: the handle itself, in the corner block that was already
           * there, so nothing moves and nothing new is framed.
           *
           * The blinking square is the site's existing caret keyframe reused as a
           * live indicator. A coloured dot would be the obvious choice and is the
           * one thing this page cannot have.
           */}
          <a
            href={primaryContact.href}
            target="_blank"
            rel="noreferrer"
            data-cursor="link"
            className="label anim-fade-up mt-3 inline-flex items-center gap-2 text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
            style={{ animationDelay: '0.9s' }}
          >
            <span className="animate-blink inline-block h-[6px] w-[6px] bg-ink" aria-hidden />
            @{contact.discordId}
          </a>
        </div>
      </div>

      {/*
       * Headline: one display word, the name beneath it at a different size.
       *
       * This was two lines of `AI AGENTS / ON DUTY`, which framed the whole site
       * around one kind of work. `PORTFOLIO` cannot go stale as the repo list
       * grows, and setting the name under it rather than beside it is what makes
       * the pair fit at all — `MAI TRỌNG THỊNH` is fifteen characters and blows
       * past the viewport at `13vw`.
       *
       * The name is deliberately NOT `font-display`. Archivo Black ships `latin`
       * and `latin-ext` only, so `Ọ` and `Ị` are absent from it and the browser
       * would swap fonts mid-word; in the body face the diacritics render, and the
       * size gap between the two lines does the work the weight would have.
       */}
      <div className="relative z-30 px-5 sm:px-8">
        <h1 className="font-display text-[17vw] leading-[0.82] sm:text-[13vw]">
          {site.tagline.map((line, i) => (
            <RevealText
              key={line}
              text={line}
              as="span"
              onScroll={false}
              delay={0.9 + i * 0.12}
              className="block"
            />
          ))}
        </h1>
        <p
          style={{ animationDelay: '1.2s' }}
          className="anim-fade-up mt-1 text-[6.2vw] leading-none tracking-tight text-ink sm:mt-2 sm:text-[3.1vw]"
        >
          {site.name}
        </p>
      </div>

      {/*
       * Figure plate — the two-state spotlight reveal.
       *
       * `min-h-0` on the plate and `shrink-0` on the caption are load-bearing. The
       * plate used to carry `min-h-[150px]` and `sm:max-h-[38vh]`, which broke the
       * flex contract in both directions at once: the minimum forced the figure
       * taller than the slack the fixed-height section had to give it, so the
       * caption overflowed the figure box and printed straight through the bio
       * paragraph below, while the maximum capped the plate at a 160px letterbox on
       * a 900px screen — too short for a 260px spotlight to read as a spotlight
       * rather than a horizontal wipe. Letting the plate absorb exactly the leftover
       * space fixes the collision and gives the reveal room to be seen.
       */}
      <figure className="relative z-30 mt-6 flex min-h-0 flex-1 flex-col px-5 sm:mt-8 sm:px-8">
        <div
          data-cursor="LOOK"
          data-hero-plate
          className="relative min-h-0 w-full flex-1 overflow-hidden border border-ink bg-ink"
        >
          <RevealLayer />
        </div>
        <figcaption className="label mt-2 flex shrink-0 items-baseline justify-between gap-4 text-ink-dim">
          <span>FIG. 01 — BARE / OVERGROWN</span>
          <span className="hidden sm:block">MOVE CURSOR TO REVEAL</span>
        </figcaption>
      </figure>

      {/* Bottom row — `pb-28` is what clears the docked player, not decoration. */}
      <div className="relative z-30 grid gap-8 px-5 pb-28 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <p
          style={{ animationDelay: '1.5s' }}
          className="anim-fade-up max-w-[46ch] text-sm leading-relaxed text-ink-dim sm:text-base"
        >
          {site.bio[0]}
        </p>

        <div style={{ animationDelay: '1.65s' }} className="anim-fade-up flex items-center gap-4">
          <MagneticButton
            href="#work"
            label="SEE WORK"
            className="label border border-ink px-7 py-4 text-ink transition-colors duration-300 hover:bg-ink hover:text-ground"
          >
            SEE THE WORK
            <ArrowDownRight size={14} />
          </MagneticButton>
        </div>
      </div>

      {/*
        Hairline + scroll cue. Left inset clears the 340px docked player rather
        than running the rule underneath it, which read as a crossed-out panel.
      */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 z-30 hidden items-center gap-3 pl-[380px] pr-8 sm:flex">
        <span className="label">SCROLL</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="label">{site.shortName}&#10033;</span>
      </div>
    </section>
  );
}
