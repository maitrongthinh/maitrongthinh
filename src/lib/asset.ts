/**
 * Prefixes a `public/` path with the deployment base path.
 *
 * `basePath` in `next.config.mjs` only rewrites URLs Next itself emits — page
 * routes, `next/link` hrefs, the `_next` chunk graph. It does *not* touch a string
 * you wrote by hand, and per Next's own basePath docs it does not touch
 * `next/image` `src` either. This site is served from `/maitrongthinh`, so a
 * literal `/video/hero.mp4` resolves against the domain root and 404s: the hero
 * plate would render empty and the sprite-sheet capture would never get a frame.
 *
 * Every reference to a file in `public/` goes through here. The value is inlined
 * at build time (`env.NEXT_PUBLIC_BASE_PATH`), so this is a string concat at
 * runtime, not a lookup.
 *
 * Absolute URLs are returned untouched, so a field may hold either a local path
 * or a remote one without the caller having to care which.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function asset(path: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  if (!BASE) return path;
  return `${BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}
