import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { notes, primaryContact } from '@/content/content';

/**
 * End-of-note footer: the next note in the index, plus a route back to contact.
 */
export default function NoteFooter({ slug }: { slug: string }) {
  const index = notes.findIndex((n) => n.slug === slug);
  const next = index >= 0 ? notes[(index + 1) % notes.length] : undefined;

  return (
    <footer className="mt-20 border-t border-rule pt-8">
      {next && next.slug !== slug && (
        <Link
          href={`/notes/${next.slug}/`}
          data-cursor="READ"
          className="group block border-b border-rule pb-8 transition-opacity hover:opacity-60"
        >
          <span className="label text-ink-dim">NEXT NOTE</span>
          <span className="font-display mt-3 block text-[7vw] leading-[0.95] sm:text-[2.6vw]">
            {next.title}
          </span>
        </Link>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link
          href="/#contact"
          data-cursor="SEND"
          className="label border border-ink px-7 py-4 transition-colors hover:bg-ink hover:text-ground"
        >
          WORK WITH ME
        </Link>
        <a
          href={primaryContact.href}
          target={primaryContact.href.startsWith('mailto:') ? undefined : '_blank'}
          rel="noreferrer"
          data-cursor="SEND"
          className="label flex items-center gap-1 text-ink-dim transition-colors hover:text-ink"
        >
          {primaryContact.note}
          <ArrowUpRight size={13} />
        </a>
      </div>
    </footer>
  );
}
