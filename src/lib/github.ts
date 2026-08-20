import {
  emptyBlurb,
  repoOverrides,
  showcaseRepos,
  site,
  type Project,
} from '@/content/content';

/**
 * Build-time GitHub data.
 *
 * The site is a static export, so these calls run once during `next build` and
 * the results are baked into the HTML. That means the numbers are as fresh as the
 * last deploy — the GitHub Actions workflow rebuilds on a daily schedule so they
 * do not go stale.
 *
 * Every request is individually guarded: an offline build, a rate-limited
 * unauthenticated call, or a renamed account all degrade to placeholder data
 * rather than failing the build.
 */

export type Repo = {
  name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  url: string;
  /** Repo homepage field, when the project is deployed somewhere. */
  homepage: string | null;
  topics: string[];
  pushedAt: string;
};

export type ContributionDay = { date: string; count: number; level: number };

export type GithubData = {
  ok: boolean;
  login: string;
  followers: number;
  publicRepos: number;
  totalStars: number;
  /** Year the account was created, for the timeline. */
  joinedYear: string;
  repos: Repo[];
  /** Flat list of days, oldest first. */
  contributions: ContributionDay[];
  contributionTotal: number;
  languages: { name: string; count: number }[];
};

const HEADERS: HeadersInit = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'portfolio-build',
  // Actions provides GITHUB_TOKEN, which lifts the 60/hour anonymous limit.
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function safeJson<T>(url: string, headers?: HeadersInit): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, next: { revalidate: false } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Deterministic stand-in so the grid still renders when the API is unreachable. */
function placeholderContributions(): ContributionDay[] {
  const days: ContributionDay[] = [];
  const end = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    // Reproducible pseudo-random pattern, quieter on weekends.
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const n = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const count = weekend ? Math.floor(n * 4) : Math.floor(n * 13);
    days.push({
      date: d.toISOString().slice(0, 10),
      count,
      level: count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4,
    });
  }
  return days;
}

export async function getGithubData(): Promise<GithubData> {
  const user = site.githubUser;

  type ApiUser = {
    login: string;
    followers: number;
    public_repos: number;
    created_at: string;
  };
  type ApiRepo = {
    name: string;
    description: string | null;
    stargazers_count: number;
    forks_count: number;
    language: string | null;
    html_url: string;
    homepage: string | null;
    topics?: string[];
    pushed_at: string;
    fork: boolean;
  };
  type ApiContrib = {
    total: Record<string, number>;
    contributions: { date: string; count: number; level: number }[];
  };

  const [apiUser, apiRepos, apiContrib] = await Promise.all([
    safeJson<ApiUser>(`https://api.github.com/users/${user}`, HEADERS),
    safeJson<ApiRepo[]>(
      `https://api.github.com/users/${user}/repos?per_page=100&sort=pushed`,
      HEADERS,
    ),
    // Public, tokenless service — the REST API does not expose contribution counts.
    safeJson<ApiContrib>(`https://github-contributions-api.jogruber.de/v4/${user}?y=last`),
  ]);

  const ownRepos = (apiRepos ?? []).filter((r) => !r.fork);

  const repos: Repo[] = ownRepos
    .map((r) => ({
      name: r.name,
      description: r.description,
      stars: r.stargazers_count,
      forks: r.forks_count,
      language: r.language,
      url: r.html_url,
      homepage: r.homepage,
      topics: r.topics ?? [],
      pushedAt: r.pushed_at,
    }))
    .sort((a, b) => b.stars - a.stars || b.pushedAt.localeCompare(a.pushedAt));

  const languageCounts = new Map<string, number>();
  for (const r of ownRepos) {
    if (!r.language) continue;
    languageCounts.set(r.language, (languageCounts.get(r.language) ?? 0) + 1);
  }

  const contributions = apiContrib?.contributions?.length
    ? apiContrib.contributions.slice(-365)
    : placeholderContributions();

  return {
    ok: Boolean(apiUser && apiRepos),
    login: apiUser?.login ?? user,
    followers: apiUser?.followers ?? 0,
    publicRepos: apiUser?.public_repos ?? ownRepos.length,
    totalStars: repos.reduce((sum, r) => sum + r.stars, 0),
    joinedYear: (apiUser?.created_at ?? '').slice(0, 4),
    // The full list is kept so the work index can look up allowlisted names;
    // the stats panel slices what it needs.
    repos,
    contributions,
    contributionTotal: contributions.reduce((sum, d) => sum + d.count, 0),
    languages: [...languageCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  };
}

/** `craftVN-` becomes `CRAFTVN`, `bot-afk-aternos` becomes `BOT AFK ATERNOS`. */
function repoTitle(name: string): string {
  return name
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Turns repositories into work-index rows.
 *
 * Picks the names listed in `showcaseRepos`, in that order, and falls back to the
 * six most-starred repos when the allowlist is empty. Every field comes from the
 * API unless `repoOverrides` says otherwise, so the index cannot drift from the
 * account: rename a repo or write a description on GitHub and the next build
 * shows it.
 */
export function importedProjects(data: GithubData): Project[] {
  const byName = new Map(data.repos.map((r) => [r.name.toLowerCase(), r]));

  const picked = showcaseRepos.length
    ? showcaseRepos
        .map((name) => byName.get(name.toLowerCase()))
        .filter((r): r is Repo => Boolean(r))
    : data.repos.slice(0, 6);

  return picked.map((r) => {
    const override = repoOverrides[r.name] ?? {};
    const pushedMonth = r.pushedAt.slice(0, 7);

    return {
      id: `repo-${r.name}`,
      title: override.title ?? repoTitle(r.name),
      year: r.pushedAt.slice(0, 4),
      role: override.role ?? 'Personal repo',
      blurb: override.blurb ?? r.description ?? emptyBlurb,
      stack: [r.language, ...r.topics].filter((s): s is string => Boolean(s)).slice(0, 5),
      metrics: r.stars > 0 ? `${r.stars} STARS · ${pushedMonth}` : `LAST PUSH ${pushedMonth}`,
      href: override.href ?? r.homepage ?? r.url,
      repo: r.url,
    };
  });
}
