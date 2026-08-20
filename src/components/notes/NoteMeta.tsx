import Link from 'next/link';
import { notes } from '@/content/content';

/**
 * Meta block placed at the top of every note body.
 *
 * Takes a slug and reads the row out of the notes index, so the date, reading time
 * and tags can never drift from what the index page shows.
 */
export default function NoteMeta({ slug }: { slug: string }) {
  const note = notes.find((n) => n.slug === slug);
  if (!note) return null;

  return (
    <header className="border-t border-rule pt-5">
      <Link
        href="/notes/"
        data-cursor="BACK"
        className="label mb-10 inline-block text-ink-dim transition-colors hover:text-ink"
      >
        ← ALL NOTES
      </Link>

      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <span className="label">
          {new Date(note.date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <span className="label text-ink-dim">{note.readingTime} READ</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {note.tags.map((t) => (
          <span key={t} className="label border border-rule px-2 py-1 text-[9px]">
            {t}
          </span>
        ))}
      </div>
    </header>
  );
}
