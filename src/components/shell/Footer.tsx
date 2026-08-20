import Marquee from '@/components/ui/Marquee';
import { primaryContact, site } from '@/content/content';

/**
 * Footer. The oversized name is set in `vw` so it scales without a media query.
 *
 * It used to be one `19vw` line clipped by `overflow-hidden` for a full-bleed slab,
 * which cropped it to "MAI TRON" on a 1440px screen. A marquee can bleed; a name
 * reads as a broken page. Measured in the real display face, the full string only
 * fits on one line at 9.98vw — too small for a footer wall — while "MAI TRONG" fits
 * at 16.06vw, so it is set as two ragged lines at 16vw. `overflow-hidden` stays as
 * the safety net for narrow viewports.
 */
export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-rule bg-ground">
      <div className="border-b border-rule py-6">
        <Marquee
          items={[
            site.available ? 'OPEN TO WORK' : 'CURRENTLY BOOKED',
            primaryContact.note,
            site.location,
            'BUILD SOMETHING',
          ]}
          duration={26}
          reverse
        />
      </div>

      <div className="overflow-hidden px-5 pt-10 sm:px-8">
        {site.displayNameLines.map((line) => (
          <p
            key={line}
            className="font-display whitespace-nowrap text-[16vw] leading-[0.84] text-ink"
          >
            {line}
          </p>
        ))}
      </div>

      {/* Bottom padding clears the docked music player, which is fixed over this
          row at the end of the page — full width on mobile, a 340px card at
          `bottom-5 left-5` from `sm` up. */}
      <div className="flex flex-wrap items-end justify-between gap-6 px-5 pb-28 pt-6 sm:px-8 sm:pb-24">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {site.socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target={s.href.startsWith('mailto:') ? undefined : '_blank'}
              rel="noreferrer"
              data-cursor="OPEN"
              className="label text-ink-dim underline decoration-rule underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
            >
              {s.label}
            </a>
          ))}
        </div>

        <div className="text-right">
          <p className="label text-ink-dim">
            &copy; {new Date().getFullYear()} {site.shortName} — ALL RIGHTS RESERVED
          </p>
          <p className="label mt-1 text-[9px] text-ink-dim">
            NEXT.JS · R3F · GSAP · STATIC EXPORT ON GITHUB PAGES
          </p>
        </div>
      </div>
    </footer>
  );
}
