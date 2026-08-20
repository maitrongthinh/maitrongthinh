'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { nav, primaryContact, site } from '@/content/content';

/**
 * Fixed top bar plus a fullscreen mobile overlay.
 *
 * Three behaviours worth noting:
 * - The bar's own background stays transparent until the page has scrolled past
 *   the hero, at which point a hard bottom rule and a blur pad appear. No
 *   colour change is needed because the mix-blend cursor and grain sit above it.
 * - The hamburger morphs into an X by rotating the outer bars and hiding the
 *   middle one, all with plain transforms so it stays smooth on low-end phones.
 * - Section links are bare hashes on the home page but get rooted (`/#work`) on
 *   any other route, otherwise they would try to scroll to sections that only
 *   exist on the home page.
 */
export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const onHome = pathname === '/' || pathname === '';

  const resolve = (href: string) => (href.startsWith('#') && !onHome ? `/${href}` : href);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The overlay covers the page, so scrolling behind it must be blocked.
  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <header
        className={[
          'fixed inset-x-0 top-0 z-[120] flex items-center justify-between px-5 py-4 transition-all duration-500 sm:px-8 sm:py-5',
          // Near-opaque rather than frosted, and deliberately no `backdrop-blur`.
          // A fixed element with a backdrop filter has to re-read its backdrop
          // whenever the backdrop changes, and the backdrop of a fixed bar is the
          // whole scrolling document — so every scrolled frame rasterised the page
          // behind it. Measured on the wheel-scroll probe: p99 83ms with the blur,
          // 50ms without, and eighteen frames over 50ms down to two.
          scrolled ? 'border-b border-rule bg-ground/92' : 'border-b border-transparent',
        ].join(' ')}
      >
        {/* Wordmark */}
        <Link href={onHome ? '#hero' : '/'} data-cursor="link" className="group flex items-baseline gap-2 select-none">
          <span className="font-display text-xl leading-none sm:text-2xl">{site.shortName}</span>
          <span className="text-xl leading-none text-ink-dim transition-transform duration-500 group-hover:rotate-180 sm:text-2xl">
            &#10033;
          </span>
        </Link>

        {/* Desktop links */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0 md:flex">
          {nav.map((item, i) => (
            <span key={item.href} className="flex items-center">
              <Link
                href={resolve(item.href)}
                data-cursor="link"
                className="label px-3 py-1 text-ink transition-opacity hover:opacity-50"
              >
                {item.label}
              </Link>
              {i < nav.length - 1 && <span className="h-3 w-px bg-rule" />}
            </span>
          ))}
        </nav>

        {/*
         * Desktop CTA — mail when an address is set, Discord otherwise.
         *
         * A solid chip rather than the underlined label this was. Two problems with
         * the label: against a `text-2xl` wordmark on the opposite end of the same
         * row it sat on a different optical line and read as misaligned, and as the
         * only route into the server on the first screen it was the weakest thing in
         * the bar. Inverting it — ink fill, paper text — makes it the one filled
         * element on the page, which is as much emphasis as this palette has to
         * give. The blinking square is the hero's live indicator, reused.
         */}
        <a
          href={primaryContact.href}
          target={primaryContact.href.startsWith('mailto:') ? undefined : '_blank'}
          rel="noreferrer"
          data-cursor="link"
          className="label hidden items-center gap-2 border border-ink bg-ink px-4 py-2.5 text-ground transition-colors duration-300 hover:bg-ground hover:text-ink md:inline-flex"
        >
          <span className="animate-blink inline-block h-[6px] w-[6px] bg-current" aria-hidden />
          {primaryContact.label}
        </a>

        {/* Burger */}
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="relative z-[130] flex h-6 w-6 flex-col items-end justify-center gap-[5px] md:hidden"
        >
          <span
            className={`h-[2px] w-6 bg-ink transition-all duration-300 ${
              open ? 'translate-y-[7px] rotate-45' : ''
            }`}
          />
          <span
            className={`h-[2px] w-6 bg-ink transition-all duration-300 ${open ? 'opacity-0' : ''}`}
          />
          <span
            className={`h-[2px] w-6 bg-ink transition-all duration-300 ${
              open ? '-translate-y-[7px] -rotate-45' : ''
            }`}
          />
        </button>
      </header>

      {/* Mobile overlay */}
      <div
        className={[
          'fixed inset-0 z-[125] flex flex-col justify-center gap-1 bg-ground px-6 transition-opacity duration-400 md:hidden',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      >
        {nav.map((item, i) => (
          <Link
            key={item.href}
            href={resolve(item.href)}
            onClick={() => setOpen(false)}
            className="group flex items-baseline justify-between border-b border-rule py-3"
            style={{
              transform: open ? 'translateY(0)' : 'translateY(24px)',
              opacity: open ? 1 : 0,
              transition: `transform 600ms var(--ease-brut) ${i * 45}ms, opacity 400ms ${i * 45}ms`,
            }}
          >
            <span className="font-display text-[13vw] leading-none">{item.label}</span>
            <span className="label">0{i + 1}</span>
          </Link>
        ))}

        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
          {site.socials.map((s) => (
            <a key={s.label} href={s.href} className="label underline underline-offset-4">
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
