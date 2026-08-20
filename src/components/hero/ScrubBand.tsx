'use client';

import ScrubVideo from './ScrubVideo';

/**
 * Full-bleed band holding the mouse-scrubbed video.
 *
 * The footage is dark and has colour in it, which is why it gets its own slab
 * between two sections instead of sitting behind type: as an ink-coloured band it
 * reads as part of the black-and-white system, and there is nothing over it that
 * has to stay readable.
 *
 * Desaturated on purpose — the hero plate is the only place colour is allowed, so
 * this stays a texture. Drop the `grayscale` class to let the lava through.
 */
export default function ScrubBand() {
  return (
    <section
      aria-label="Motion study"
      className="relative z-10 border-y border-rule bg-ink"
      data-cursor="SCRUB"
    >
      <div className="relative h-[48vh] min-h-[260px] overflow-hidden">
        <ScrubVideo className="absolute inset-0 h-full w-full object-cover grayscale contrast-[1.15]" />

        <div className="pointer-events-none absolute inset-0 flex items-end justify-between p-5 sm:p-8">
          <p className="label text-ground/70">MOVE CURSOR — THE HEAD FOLLOWS</p>
          <p className="label hidden text-ground/70 sm:block">MOTION STUDY / 01</p>
        </div>
      </div>
    </section>
  );
}
