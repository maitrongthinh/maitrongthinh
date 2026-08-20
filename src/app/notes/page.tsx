import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { notes, site } from '@/content/content';

export const metadata: Metadata = {
  title: `Notes — ${site.name}`,
  description: 'Writing on performance, retrieval systems and build infrastructure.',
};

/**
 * Notes index route. Deliberately plain: no 3D canvas, no scroll hijacking — this
 * is where someone reads, and the effects belong on the home page.
 */
export default function NotesIndex() {
  return (
    <main className="min-h-screen px-5 pb-24 pt-32 sm:px-8 sm:pt-40">
      <header className="border-t border-rule pt-5">
        <div className="mb-8 flex items-baseline justify-between gap-6">
          <span className="label">NOTES</span>
          <span className="label">{String(notes.length).padStart(2, '0')} ENTRIES</span>
        </div>
        <h1 className="font-display text-[16vw] leading-[0.86] sm:text-[9vw]">NOTES</h1>
        <p className="mt-6 max-w-[56ch] text-base leading-relaxed text-ink-dim sm:text-lg">
          Working notes on the things that were harder than they looked — frame budgets, retrieval
          quality, and caches that lie.
        </p>
      </header>

      <ul className="mt-16 border-t border-rule">
        {notes.map((note, i) => (
          <li key={note.slug} className="border-b border-rule">
            <Link
              href={`/notes/${note.slug}/`}
              data-cursor="READ"
              className="group grid gap-3 py-8 transition-opacity hover:opacity-60 sm:grid-cols-[40px_130px_1fr_auto] sm:items-baseline sm:gap-8"
            >
              <span className="label text-ink-dim">{String(i + 1).padStart(2, '0')}</span>
              <span className="label text-ink-dim">
                {new Date(note.date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>

              <span>
                <span className="font-display block text-[7vw] leading-[0.95] sm:text-[2.8vw]">
                  {note.title}
                </span>
                <span className="mt-2 block max-w-[62ch] text-sm leading-relaxed text-ink-dim">
                  {note.summary}
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

      <Link
        href="/"
        data-cursor="BACK"
        className="label mt-16 inline-block border border-ink px-7 py-4 transition-colors hover:bg-ink hover:text-ground"
      >
        ← BACK TO INDEX
      </Link>
    </main>
  );
}
