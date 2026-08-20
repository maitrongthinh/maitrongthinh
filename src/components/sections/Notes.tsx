import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { notes } from '@/content/content';
import SectionHeading from '@/components/ui/SectionHeading';

/**
 * Notes teaser on the home page. Full bodies live at `/notes/<slug>/` as MDX
 * routes; this is only the index row list.
 */
export default function Notes() {
  return (
    // Inverted, like PATH: see `.slab-invert` in `globals.css`. The token swap is
    // what makes a light panel a one-class change instead of a rewrite of every
    // `text-ink-dim` and `border-rule` inside it.
    <section id="notes" className="slab-invert relative z-10 border-t border-rule">
      <div className="px-5 py-20 sm:px-8 sm:py-28">
        <SectionHeading index="06" label="Writing" title="NOTES" aside="LONGER FORM" />

        <ul className="mt-14 border-t border-rule">
          {notes.map((note) => (
            <li key={note.slug} className="border-b border-rule">
              <Link
                href={`/notes/${note.slug}/`}
                data-cursor="READ"
                className="group grid gap-3 py-7 transition-opacity hover:opacity-60 sm:grid-cols-[130px_1fr_auto] sm:items-baseline sm:gap-8"
              >
                <span className="label text-ink-dim">
                  {new Date(note.date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>

                <span>
                  <span className="font-display block text-[6.5vw] leading-[0.95] sm:text-[2.6vw]">
                    {note.title}
                  </span>
                  <span className="mt-2 block max-w-[62ch] text-sm leading-relaxed text-ink-dim">
                    {note.summary}
                  </span>
                  <span className="mt-3 flex flex-wrap gap-2">
                    {note.tags.map((t) => (
                      <span key={t} className="label border border-rule px-2 py-1 text-[9px]">
                        {t}
                      </span>
                    ))}
                  </span>
                </span>

                <span className="label flex items-center gap-2 text-ink-dim">
                  {note.readingTime}
                  <ArrowUpRight
                    size={16}
                    className="text-ink transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
