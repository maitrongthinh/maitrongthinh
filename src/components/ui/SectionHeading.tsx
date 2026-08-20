import RevealText from './RevealText';

/**
 * Shared section header: an index number, a mono label, and an oversized title.
 *
 * Keeping this in one place is what makes the sections read as one system —
 * every heading has the same rule above it and the same character reveal.
 *
 * The two sizes are deliberately far apart. A 13vw title over an 11px label is
 * a difference; a 9.5vw title (bigger than it looks — `vw` at desktop widths
 * outruns the mobile step) over a 9px one is a hierarchy, and hierarchy is what
 * the page was missing when every section read at the same volume.
 */
export default function SectionHeading({
  index,
  label,
  title,
  aside,
}: {
  index: string;
  label: string;
  title: string;
  aside?: string;
}) {
  return (
    <header className="border-t border-rule pt-5">
      <div className="mb-6 flex items-baseline justify-between gap-6">
        <span className="label text-[9px]">
          {index} — {label}
        </span>
        {aside && <span className="label hidden text-right text-[9px] sm:block">{aside}</span>}
      </div>

      <RevealText
        text={title}
        as="h2"
        className="font-display block text-[15vw] leading-[0.82] sm:text-[9.5vw]"
      />
    </header>
  );
}
