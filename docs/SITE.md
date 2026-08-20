# Portfolio

Brutalist black-and-white portfolio. Next.js static export, React Three Fiber scene,
audio-reactive geometry, cursor-driven spotlight reveal. Deploys to GitHub Pages with
no server.

The root [`README.md`](../README.md) is the GitHub **profile** README — this repo is
named after the account, so GitHub renders that file on the profile page. This is the
project documentation; deployment lives in [`DEPLOY.md`](../DEPLOY.md).

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export into out/
npm run serve:out  # serve out/ at http://localhost:4173 — check this before deploying
```

---

## 1. Put your content in

**Edit one file: [`src/content/content.ts`](../src/content/content.ts).** No component needs
touching.

| What | Where |
| --- | --- |
| Name, role, tagline, location, bio, socials | `site` |
| GitHub username for the live stats and the repo import | `site.githubUser` |
| Email / Discord, and which one the CTAs use | `contact`, `primaryContact` |
| Hand-written projects (title, year, role, blurb, stack, links) | `featuredProjects` |
| Which GitHub repos join the work index | `showcaseRepos`, `repoOverrides` |
| Skill groups and levels | `skills` |
| Work + education timeline | `timeline` |
| Playlist track titles and file paths | `playlist` |
| Notes index | `notes` |
| Nav labels | `nav` |

`site.tagline` is an array — one entry per headline line. Two short words per line reads
best at the size it is set.

### The work index is half hand-written, half imported

`featuredProjects` rows are written by hand and always come first. Everything after them is
pulled from `https://api.github.com/users/<githubUser>/repos` **at build time** and mapped
in `importedProjects()` ([`src/lib/github.ts`](../src/lib/github.ts)).

```ts
export const showcaseRepos: string[] = ['ai-minecraft', 'webtrasua'];
```

- Names in `showcaseRepos` are an **allowlist**, matched case-insensitively. Only these
  repos appear — scratch repos and half-finished experiments stay hidden.
- Empty the array and the six most recently pushed repos are used instead.
- Title, year, stack, and star count come from the API, so renaming a repo or pushing to it
  updates the site on the next build. **The description shown is the repo's own GitHub
  description** — write one line there and the row fills itself. Repos with no description
  fall back to `emptyBlurb`.
- To override anything per repo without leaving GitHub as the source of truth:

```ts
export const repoOverrides: Record<string, RepoOverride> = {
  'ai-minecraft': { title: 'MINECRAFT AGENT', blurb: 'Custom sentence for this one.' },
};
```

### Email vs Discord

`contact.email` is the switch. With an address set, every CTA is a `mailto:` and the contact
form composes the message. With it empty, `primaryContact` points at `contact.discordInvite`
instead and the form copies the brief to the clipboard before opening the invite — no dead
`mailto:` links anywhere on the page.

---

## 2. Drop your assets in

### Music — `public/audio/`

Copy your mp3s in and name them to match `playlist` in `content.ts`:

```
public/audio/track-01.mp3
public/audio/track-02.mp3
public/audio/track-03.mp3
```

Any browser-playable format works. Add or remove tracks by editing the `playlist` array.

Until files exist the player shows `DROP MP3 → /public/audio` and the 3D scene falls
back to a synthetic pulse, so nothing looks broken.

The player builds a Web Audio graph on the first click (browsers block audio before a
gesture) and feeds bass / mid / treble levels into the geometry: bass pushes the slabs
apart, overall level scales them, treble brightens the wireframe.

### Hero spotlight images — `public/images/` (in place)

```
public/images/hero-base.webp     always visible
public/images/hero-reveal.webp   only visible inside the cursor spotlight
```

Both files are committed — the same 1280x724 shot in two states (bare rock / overgrown), so
the spotlight reads as an X-ray rather than two unrelated pictures. Replace them with any
pair at matching dimensions.

Knobs live in `heroLayers` in `content.ts`: `radius` and `ease` for the spotlight size and
trail, and `swap: true` to flip which of the two is the base and which is revealed.

With no images present the spotlight inverts the live 3D scene inside the mask instead. That
is a real fallback, not a placeholder; it looks intentional.

The pair renders inside a framed figure under the headline, not full-bleed behind it. Both
images are dark and coloured, and bleeding them behind the type would break the
black-on-paper contract the rest of the site keeps.

### Hero video — `public/video/hero.mp4` (in place)

Committed, 3.5 MB. It fills the motion-study band under the hero
([`ScrubBand.tsx`](../src/components/hero/ScrubBand.tsx)) — grayscaled on an ink slab, with
horizontal mouse movement scrubbing the timeline on desktop and a plain loop on mobile. If
the file is absent the component removes itself on the first load error and the band
collapses to black.

`ScrubVideo` takes its own `className`, so the same scrubbing logic can be dropped anywhere
else with different framing.

### Project screenshots (optional)

Put images anywhere in `public/images/` and set `image: '/images/whatever.webp'` on a
project. Without one, the hover preview draws a generated stripe field.

---

## 3. Write notes

Each note is an MDX route plus one row in the index.

1. Create `src/app/notes/<slug>/page.mdx`
2. Start it with the meta block and end it with the footer:

```mdx
import NoteMeta from '@/components/notes/NoteMeta';
import NoteFooter from '@/components/notes/NoteFooter';

export const metadata = { title: 'Your title', description: 'One line.' };

<NoteMeta slug="your-slug" />

# Your title

Plain Markdown from here. Styling comes from `src/mdx-components.tsx` —
you never write a className.

<NoteFooter slug="your-slug" />
```

3. Add the row to `notes` in `content.ts` (slug, title, date, readingTime, summary, tags).

The list is manual because a static export cannot read the filesystem at request time,
and one array is less machinery than a frontmatter crawler for a handful of posts.

---

## 4. Deploy

Full walkthrough, including the Windows/Git Bash gotchas: [`DEPLOY.md`](../DEPLOY.md).
Short version:

### As shipped — `maitrongthinh/maitrongthinh`

The repo name equals the account name, which makes it the **profile** repo, not a user
site. Pages therefore serves it as a project page at
`maitrongthinh.github.io/maitrongthinh/`, and the workflow sets
`BASE_PATH: '/maitrongthinh'` to match.

1. Push to `main`.
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) builds and deploys on
every push to `main`, plus once a day so the GitHub stats and the imported repo rows stay
fresh. The build uses the workflow's own `GITHUB_TOKEN` for the API calls, which raises the
rate limit from 60 requests an hour to 5,000 — no secret to add.

### User site — `<username>.github.io`

Name the repository exactly `maitrongthinh.github.io` and set `BASE_PATH: ''`. The site
then serves from the domain root and no path prefix is needed anywhere.

### Any other project site — `<username>.github.io/<repo>`

Set `BASE_PATH` to `/<repo>` in the workflow's build step:

```yaml
env:
  BASE_PATH: '/portfolio'
```

`next.config.mjs` picks it up for `basePath` and `assetPrefix`. Locally:

```bash
BASE_PATH=/portfolio npm run build
```

Anything under `public/` referenced by hand must go through `asset()`
([`src/lib/asset.ts`](../src/lib/asset.ts)) — `basePath` only rewrites URLs Next itself
emits, so a literal `/video/hero.mp4` 404s under a prefix.

### Custom domain

Put a `CNAME` file containing your domain in `public/`, and set the domain under
Settings → Pages.

---

## 5. How it works

```
src/
  app/
    layout.tsx           font loading, provider stack, nav, footer
    page.tsx             server component — fetches GitHub data, composes sections
    globals.css          Tailwind v4 theme tokens, keyframes, reduced-motion rules
    notes/               MDX routes
  components/
    three/               Scene, Monolith, CameraRig, Dust, postprocessing
    hero/                Hero, RevealLayer (spotlight), ScrubBand, ScrubVideo
    sections/            About, Projects, Skills, Experience, GithubStats, Notes, Contact
    audio/               AudioProvider (Web Audio analyser), MusicPlayer
    shell/               Preloader, Nav, Footer, CustomCursor, GrainOverlay, SmoothScroll
    ui/                  RevealText, MagneticButton, Marquee, SectionHeading
    notes/               NoteMeta, NoteFooter
  lib/
    pointer.ts           shared cursor state + single RAF loop
    scrollState.ts       shared scroll state + single RAF loop
    github.ts            build-time GitHub REST fetch, repo mapper, offline fallbacks
  content/content.ts     all copy and data
  hooks/                 useTypewriter, usePrefersReducedMotion, useIsMobile
```

**Cursor and scroll state live outside React.** Four separate effects read the pointer at
60Hz; putting that in `useState` would mean four renders a frame for a value that only
ends up in a transform. `lib/pointer.ts` and `lib/scrollState.ts` are refcounted module
stores with one animation frame loop each — consumers read them from their own frame and
write straight to the DOM or to Three.js objects.

**The 3D structure is generated, not downloaded.** 44 instanced slabs from a seeded PRNG,
arranged into four configurations (tower, exploded elevation, ring, wall) that cross-fade
as you scroll. No GLB to download, so the page weighs a fraction of what a model-based
scene would. To swap it for a real model, replace `components/three/Monolith.tsx` — the
camera path and audio wiring do not care what they are pointed at.

**The camera is on rails.** A `CatmullRomCurve3` through six points, sampled by scroll
progress, with pointer parallax added after the sample so it never accumulates. Section
order in `page.tsx` is also the camera's route — reorder sections and you change what is
behind them.

**Accessibility and mobile budget.** `prefers-reduced-motion` disables every animation,
parks the spotlight, and skips the smooth-scroll layer entirely. Coarse pointers drop the
postprocessing chain, custom cursor, magnetic buttons, and mouse scrubbing. Split text
carries an `aria-label` with the per-character spans hidden from screen readers.

---

## 6. Contact form

There is no backend, and what submitting does depends on `contact.email` in `content.ts`:

- **address set** — composes a `mailto:` with the selected services and the message
  pre-filled and hands off to the visitor's mail client;
- **address empty** (current state) — copies the same brief to the clipboard and opens
  `contact.discordInvite` in a new tab, so the visitor only has to paste it in the server.

Either way nothing is hosted and nothing is stored. The clipboard write needs a secure
context; if it is refused the invite still opens.

To use a hosted endpoint instead (Formspree, Basin, your own function), open
[`src/components/sections/Contact.tsx`](../src/components/sections/Contact.tsx), point the
form's `action` at it and delete the `onSubmit` handler.

---

## 7. Tuning

| Want | File | Knob |
| --- | --- | --- |
| Spotlight bigger / longer trail | `content.ts` | `heroLayers.radius`, `heroLayers.ease` |
| Swap which hero image is revealed | `content.ts` | `heroLayers.swap` |
| Which repos show up as work | `content.ts` | `showcaseRepos`, `repoOverrides` |
| More or fewer slabs | `three/Monolith.tsx` | `COUNT` |
| Different structure, same code | `three/Monolith.tsx` | the seed in `mulberry32(0x5eed)` |
| Camera route | `three/CameraRig.tsx` | the `points` arrays |
| Less grain / scanline | `shell/GrainOverlay.tsx` | opacity values |
| Weaker glow | `three/Scene.tsx` | `Bloom intensity` |
| Slower scroll | `shell/SmoothScroll.tsx` | Lenis `duration` |
| Colours | `app/globals.css` | `@theme` block |

Everything is square by design: `globals.css` forces `border-radius: 0` globally. Remove
that rule if you ever want a rounded corner.
