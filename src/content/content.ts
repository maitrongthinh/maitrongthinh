/**
 * Single source of truth for every piece of copy and data on the site.
 *
 * Anything still marked TODO is a guess or a gap — those are the lines worth
 * changing first. Everything else is real.
 *
 * Local media is wrapped in `asset()` so the sub-path deploy resolves it. Doing it
 * here rather than at each `<img>`/`<video>` keeps the components ignorant of the
 * deployment shape; see `src/lib/asset.ts` for why the prefix is needed at all.
 */
import { asset } from '@/lib/asset';

export const site = {
  name: 'MAI TRỌNG THỊNH',
  /**
   * ASCII form for the display face. Archivo Black ships `latin` and `latin-ext`
   * only, so `Ọ` and `Ị` are simply absent from it — set the diacritic name in a
   * `font-display` element and the browser swaps fonts mid-word. Use this
   * wherever the type is Archivo; use `name` everywhere else.
   */
  displayName: 'MAI TRONG THINH',
  /** Same ASCII name broken for the footer wall, where one line does not fit. */
  displayNameLines: ['MAI TRONG', 'THINH'],
  shortName: 'MTT',
  /**
   * Deliberately generic.
   *
   * This read `Full-Stack Dev · Discord AI Agents`, and between that, a headline
   * about agents and a bio whose first sentence was about one product, the whole
   * first screen described a single project rather than a person. The owner's
   * objection was forward-looking and correct: the repo count only goes up, and a
   * site framed around one thing has to be rewritten every time the work moves.
   * NemoBot is still here — as the first card in the work index, which is where a
   * project belongs.
   */
  role: 'Full-Stack Developer',
  /**
   * The display headline. One word, because the name is set beneath it at a
   * different size rather than fighting it for the same line: `MAI TRONG THINH` is
   * fifteen characters and simply does not fit at `13vw`.
   */
  tagline: ['PORTFOLIO'],
  // TODO: city if you want it shown; this is a guess from your language, not a fact.
  location: 'Vietnam',
  githubUser: 'maitrongthinh',
  available: true,
  bio: [
    'I build software that runs without me watching it — Discord bots and agent platforms, backend services, and the interfaces that sit on top of them.',
    'C++, JavaScript and Python by habit; Node.js and React for anything that ends up in a browser. The work index below reads straight from my GitHub, so it grows every time I push.',
  ],
  socials: [
    { label: 'GITHUB', href: 'https://github.com/maitrongthinh' },
    { label: 'DISCORD', href: 'https://discord.gg/X3TT4k9jnT' },
    { label: 'YOUTUBE', href: 'https://www.youtube.com/@thinhdzs1vn' },
    { label: 'TIKTOK', href: 'https://www.tiktok.com/@em_la_dev' },
    { label: 'FACEBOOK', href: 'https://www.facebook.com/trong.thinh.379410' },
  ],
} as const;

/**
 * Contact routes.
 *
 * `email` is empty on purpose — no address was given. While it stays empty the
 * whole site routes people to Discord instead of a mail client, and the contact
 * form copies the brief to the clipboard before opening the invite. Fill `email`
 * in and every mail route switches back on with no other edits.
 */
export const contact = {
  email: '', // TODO: add an address here to enable mailto links.
  discordId: 'thinh_0107',
  discordInvite: 'https://discord.gg/X3TT4k9jnT',
};

export const hasEmail = contact.email.trim().length > 0;

/**
 * Every place someone can actually find him, with the handle spelled out.
 *
 * `site.socials` is a bare label-and-URL list, which is all a footer row needs but
 * is also why the site had almost no personal presence: five words that could
 * belong to anybody. A handle is the part that identifies a person, and it was
 * only written down for Discord and GitHub, in a facts table, as plain
 * unclickable text.
 *
 * So this is the presence list — label, the handle as it is actually typed, and
 * where it goes. `own: true` marks the platform he runs rather than an account on
 * someone else's, which is worth setting apart wherever this renders.
 *
 * Derived from `site.socials` and `contact` rather than restated, so a URL still
 * only ever changes in one place.
 */
export type Channel = {
  label: string;
  /** As it is actually typed — the part that identifies a person. */
  handle: string;
  href: string;
  /** Optional qualifier, set beside the label. */
  note?: string;
  /** His own platform rather than an account on someone else's. */
  own?: boolean;
};

export const channels: Channel[] = [
  {
    label: 'DISCORD',
    handle: `@${contact.discordId}`,
    href: contact.discordInvite,
    note: 'SERVER',
  },
  { label: 'GITHUB', handle: `@${site.githubUser}`, href: site.socials[0].href },
  { label: 'YOUTUBE', handle: '@thinhdzs1vn', href: site.socials[2].href },
  { label: 'TIKTOK', handle: '@em_la_dev', href: site.socials[3].href },
  { label: 'FACEBOOK', handle: 'trong.thinh', href: site.socials[4].href },
  {
    label: 'PLATFORM',
    handle: 'nemobot.bond',
    href: 'http://nemobot.bond/',
    note: 'MINE',
    own: true,
  },
];

/** Whatever the site should push visitors towards for a first message. */
export const primaryContact = hasEmail
  ? { label: 'GET IN TOUCH', href: `mailto:${contact.email}`, note: contact.email }
  : {
      label: 'JOIN DISCORD',
      href: contact.discordInvite,
      note: `DISCORD — @${contact.discordId}`,
    };

/**
 * Hero spotlight-reveal layers. `base` renders normally; `reveal` is only visible
 * inside the soft circular mask that trails the cursor. Both files are the same
 * shot in two states — bare rock and overgrown — which is what makes the
 * spotlight read as an X-ray rather than a crossfade.
 *
 * Both images are committed under `public/images/`, not hotlinked, so the hero
 * cannot break when someone else's CDN expires a URL.
 *
 * Set `swap: true` to start overgrown and reveal the bare rock instead.
 */
export const heroLayers = {
  base: asset('/images/hero-base.webp'),
  reveal: asset('/images/hero-reveal.webp'),
  swap: false,
  /** Spotlight radius in CSS pixels. */
  radius: 260,
  /** Cursor easing per frame, 0-1. Lower = longer trail. */
  ease: 0.1,
};

/** Mouse-scrubbed video band. Same source footage as the hero plate. */
export const heroVideo = {
  src: asset('/video/hero.mp4'),
};

export type Project = {
  id: string;
  title: string;
  year: string;
  role: string;
  blurb: string;
  stack: string[];
  metrics?: string;
  href?: string;
  repo?: string;
  /** Optional screenshot in public/images/. Falls back to a generated pattern. */
  image?: string;
};

/**
 * Hand-written projects, shown above the imported ones. These are for work that
 * does not live in a public repo, or that deserves more than a repo row.
 */
export const featuredProjects: Project[] = [
  {
    id: 'nemobot',
    title: 'NEMOBOT',
    year: '2026',
    role: 'Solo — platform owner',
    blurb:
      'Discord agent platform. AI agents run server administration from plain instructions — moderation, roles, setup, routine ops — instead of an admin drilling through slash commands.',
    stack: ['Node.js', 'Discord API', 'AI Agents'],
    metrics: 'nemobot.bond',
    href: 'http://nemobot.bond/',
  },
];

/**
 * Repositories to import into the work index, by exact name.
 *
 * An allowlist rather than "import everything": the account has 33 public repos
 * and most are scratch work, so dumping all of them would bury the real projects
 * and put throwaway names and joke descriptions on the front page.
 *
 * Everything shown for these — language, stars, last push, description — is
 * fetched live at build time. The fastest way to improve these rows is to write a
 * one-line description on the repo itself in GitHub; it appears here on the next
 * deploy. Leave the array empty to fall back to the six most-starred repos.
 */
export const showcaseRepos: string[] = [
  'ai-minecraft',
  'craftVN-',
  'lunaproxy-remake',
  'mindscraft-ver-remake',
  'bot-afk-aternos',
  'webtrasua',
];

/**
 * Per-repo overrides for imported rows. Only what you set is overridden; the rest
 * still comes from the API. Useful when a repo name is not a title.
 */
export type RepoOverride = { title?: string; blurb?: string; role?: string; href?: string };

export const repoOverrides: Record<string, RepoOverride> = {
  // TODO: your call — either write these, or add descriptions on GitHub instead.
  // 'ai-minecraft': { title: 'AI MINECRAFT', blurb: 'What it does, in one line.' },
};

/** Shown when a repo has no description anywhere. */
export const emptyBlurb = 'No write-up yet — the code is the description.';

export type SkillGroup = { label: string; items: { name: string; level: number }[] };

/**
 * Only the things actually claimed. The numbers are a rough self-rating, not a
 * measurement — move them to whatever feels honest.
 */
export const skills: SkillGroup[] = [
  {
    label: 'LANGUAGES',
    items: [
      { name: 'JavaScript', level: 92 },
      { name: 'Python', level: 86 },
      { name: 'C++', level: 84 },
    ],
  },
  {
    label: 'WEB',
    items: [
      { name: 'HTML', level: 94 },
      { name: 'CSS', level: 90 },
      { name: 'React.js', level: 85 },
    ],
  },
  {
    label: 'RUNTIME / TOOLS',
    items: [
      { name: 'Node.js', level: 90 },
      { name: 'Git', level: 86 },
    ],
  },
];

export type TimelineEntry = {
  from: string;
  to: string;
  title: string;
  org: string;
  kind: 'work' | 'edu';
  points: string[];
};

/**
 * Only entries that can be backed up: the GitHub account's first year, and the
 * platform that is live right now.
 *
 * TODO: school and any job/collaboration years — nothing is invented here, so
 * this section stays short until you send those.
 */
export const timeline: TimelineEntry[] = [
  {
    from: '2026',
    to: 'NOW',
    title: 'Building NemoBot',
    org: 'nemobot.bond',
    kind: 'work',
    points: [
      'Discord agent platform: AI agents handle server administration end to end.',
      'Node.js backend, Discord API, agent tooling — designed and shipped solo.',
    ],
  },
  {
    from: '2024',
    to: 'NOW',
    title: 'Shipping in public',
    org: 'github.com/maitrongthinh',
    kind: 'edu',
    points: [
      'First public repository pushed August 2024; 33 of them since.',
      'Self-taught across C++, JavaScript, Python, Node.js and React.',
    ],
  },
];

/**
 * Playlist. Drop the audio files into `public/audio/` and match the `src`
 * paths. Any format the browser supports works; `.mp3` is safest.
 */
export type Track = { title: string; artist: string; src: string };

export const playlist: Track[] = [
  { title: 'THE OTHER SIDE OF PARADISE', artist: 'Glass Animals', src: asset('/audio/track-01.mp3') },
];

export const nav = [
  { label: 'INDEX', href: '#hero' },
  { label: 'ABOUT', href: '#about' },
  { label: 'WORK', href: '#work' },
  { label: 'STACK', href: '#stack' },
  { label: 'PATH', href: '#path' },
  { label: 'NOTES', href: '/notes/' },
  { label: 'CONTACT', href: '#contact' },
] as const;

/**
 * Notes index.
 *
 * Each entry needs a matching MDX route at `src/app/notes/<slug>/page.mdx`. The
 * list is manual on purpose: a static export cannot read the filesystem at
 * request time, and one hand-kept array is less machinery than a build-time
 * frontmatter crawler for a handful of posts.
 *
 * To add a note: create the folder + `page.mdx`, then add a row here.
 *
 * TODO: these three are sample posts, written before your details arrived. The
 * first one describes this site's own code and is true of it; the other two claim
 * project experience that was never stated. Replace or delete them before
 * deploying — deleting a row here plus its folder is all it takes.
 */
export type Note = {
  slug: string;
  title: string;
  date: string;
  readingTime: string;
  summary: string;
  tags: string[];
};

export const notes: Note[] = [
  {
    slug: 'sixty-frames',
    title: 'Sixty frames is a budget, not a goal',
    date: '2026-06-14',
    readingTime: '6 min',
    summary:
      'Why every cursor effect on this page reads from one requestAnimationFrame loop instead of React state, and what it cost to get there.',
    tags: ['WEBGL', 'PERFORMANCE'],
  },
  {
    slug: 'retrieval-is-the-product',
    title: 'Retrieval is the product',
    date: '2026-04-02',
    readingTime: '8 min',
    summary:
      'Most RAG systems fail at the retrieval step and blame the model. Notes from rebuilding one that did not.',
    tags: ['AI', 'BACKEND'],
  },
  {
    slug: 'ci-cache-90-seconds',
    title: 'Twenty-two minutes to ninety seconds',
    date: '2026-01-27',
    readingTime: '5 min',
    summary:
      'A content-addressed build cache, the three bugs that made it lie to us, and how to tell when a cache hit is wrong.',
    tags: ['INFRA', 'CI'],
  },
];
