import type { Metadata, Viewport } from 'next';
import { Archivo_Black, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { site } from '@/content/content';
import SmoothScroll from '@/components/shell/SmoothScroll';
import CustomCursor from '@/components/shell/CustomCursor';
import GrainOverlay from '@/components/shell/GrainOverlay';
import Preloader from '@/components/shell/Preloader';
import Nav from '@/components/shell/Nav';
import Footer from '@/components/shell/Footer';
import { AudioProvider } from '@/components/audio/AudioProvider';
import MusicPlayer from '@/components/audio/MusicPlayer';

/**
 * Three faces, and every axis of each one is paid for on the critical path — the
 * five `<link rel="preload">` tags in the built HTML are all font files. So each
 * declaration below asks for the least that still renders the site correctly.
 *
 * `weight` is pinned rather than left open. Omitting it fetches the variable font,
 * whose whole weight axis ships in one file; the site uses exactly two weights —
 * 400 everywhere, and 600 for `<strong>` inside MDX notes. Naming them fetches
 * static instances instead, which is smaller than the axis for so few stops.
 * Nothing here animates `font-weight`, so there is no interpolation to lose.
 *
 * Only Inter carries `vietnamese`. The owner's name is the sole string with
 * diacritics — `MAI TRỌNG THỊNH` needs U+1ECC and U+1ECA, outside both `latin` and
 * `latin-ext` — and it renders once, in the About facts table, in the body face.
 * JetBrains Mono is `.label` only: uppercase ASCII keys, so its Vietnamese subset
 * was a preloaded file that could never draw a glyph.
 *
 * Archivo Black is published with `latin` and `latin-ext` only, so it cannot render
 * those two glyphs at all — the display face would fall back mid-word. That is why
 * `site.displayName` exists as an ASCII form and why the huge footer wordmark uses
 * it instead of `site.name`.
 */
const archivo = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-mono-jb',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${site.name} — ${site.role}`,
  description: site.bio[0],
  openGraph: {
    title: `${site.name} — ${site.role}`,
    description: site.bio[0],
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#060607',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable} ${mono.variable}`}>
      <body className="bg-ground text-ink font-sans antialiased overflow-x-hidden">
        <AudioProvider>
          <Preloader />
          <CustomCursor />
          <GrainOverlay />
          <Nav />
          <SmoothScroll>
            {children}
            <Footer />
          </SmoothScroll>
          <MusicPlayer />
        </AudioProvider>
      </body>
    </html>
  );
}
