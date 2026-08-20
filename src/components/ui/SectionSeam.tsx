/**
 * The gap between two slabs.
 *
 * Sections on this page are opaque panels stacked directly on each other, which
 * is why the scroll reads as one long panel: there is no moment between them. A
 * seam is that moment — a transparent strip, so the fixed 3D canvas behind the
 * page shows through at full strength for the height of the band, with a hairline
 * that draws itself as the strip arrives and the name of what is coming next.
 *
 * Transparent is the whole point. The panels sit at 88% ground, so the monolith is
 * always faintly there; letting it through cleanly between two sections is the
 * only transition this palette can make without introducing a colour or a shadow.
 *
 * Purely decorative, hence `aria-hidden`: every label here restates a heading
 * that follows it in the reading order.
 */
export default function SectionSeam({
  index,
  title,
  note,
}: {
  /** Number of the section this seam leads into. */
  index: string;
  /** Its display name, set small on purpose — the heading below is the loud one. */
  title: string;
  note?: string;
}) {
  return (
    <div
      aria-hidden
      className="relative z-10 flex items-center gap-4 px-5 py-12 sm:gap-6 sm:px-8 sm:py-16"
    >
      <span className="label shrink-0 text-[9px]">{index}</span>
      <span className="seam-draw h-px flex-1 bg-rule" />
      {note && <span className="label hidden shrink-0 text-[9px] sm:block">{note}</span>}
      <span className="font-display shrink-0 text-sm leading-none sm:text-base">{title}</span>
    </div>
  );
}
