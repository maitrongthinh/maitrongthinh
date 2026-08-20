Author-time source: hero.mp4

This is the master clip for the head-track band. It is NOT served — visitors never
download it. `scripts/bake-sprites.mjs` decodes it once, offline, into
`public/images/hero-sprites.webp` (a grid of frames across the pan), and the site
ships only that ~190KB image. The client blits one tile per cursor position, so the
head tracks the mouse from the first frame with no video decode.

Why baked and not scrubbed live: hero.mp4 is a single-keyframe 4K clip (see
`scripts/probe-mp4.mjs`), so seeking it frame-to-frame in the browser decodes from
the start every time and turns into a slideshow.

Re-bake whenever this file changes:
  node scripts/bake-sprites.mjs
