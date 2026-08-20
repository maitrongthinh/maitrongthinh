import createMDX from '@next/mdx';

/**
 * Static export config for GitHub Pages.
 *
 * Deploy target is `maitrongthinh/maitrongthinh`. A repo whose name equals the
 * username is GitHub's *profile* repo, not the user site — the user site would
 * have to be named `maitrongthinh.github.io` — so Pages serves this one as a
 * project page under `/maitrongthinh`. `BASE_PATH` is set in the deploy workflow
 * and both values below pick it up; local dev leaves it empty and serves at root.
 *
 * Anything that builds a URL by hand must prefix it with `NEXT_PUBLIC_BASE_PATH`
 * (see `src/lib/asset.ts`): `basePath` only rewrites what Next itself emits, so a
 * literal `/hero.mp4` in a `fetch` or a `<video src>` 404s under a sub-path.
 */
const basePath = process.env.BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  // Notes are authored as `page.mdx` route files, so MDX has to be a page extension.
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  // GitHub Pages has no image optimization server.
  images: { unoptimized: true },
  // Emit `about/index.html` instead of `about.html` so static hosts resolve
  // clean URLs without a rewrite layer.
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

// No remark/rehype plugins: they would force the MDX loader out of its fast path
// and nothing here needs them yet.
const withMDX = createMDX({});

export default withMDX(nextConfig);
