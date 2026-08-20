import { Star, GitFork, Users, BookMarked } from 'lucide-react';
import type { GithubData } from '@/lib/github';
import { site } from '@/content/content';
import SectionHeading from '@/components/ui/SectionHeading';

/**
 * Live GitHub panel. Purely presentational — the fetching happens at build time
 * in `lib/github.ts` and the result is passed down, which keeps this a server
 * component with zero client JS.
 *
 * The contribution grid is 53 columns of 7 cells. The API returns a flat list of
 * days oldest-first, so the first column is padded with blanks up to the weekday
 * the year started on; without that the whole grid is rotated and the weekday rows
 * stop meaning anything.
 */
export default function GithubStats({ data }: { data: GithubData }) {
  const { contributions } = data;

  const leadingBlanks = contributions.length ? new Date(contributions[0].date).getDay() : 0;
  const cells: (GithubData['contributions'][number] | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...contributions,
  ];

  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Four steps of ink over the ground, brightest for the busiest days.
  const levelOpacity = [0.08, 0.3, 0.52, 0.76, 1];

  const stats: { icon: React.ReactNode; value: string; label: string }[] = [
    { icon: <BookMarked size={14} />, value: String(data.publicRepos), label: 'PUBLIC REPOS' },
    { icon: <Star size={14} />, value: String(data.totalStars), label: 'STARS EARNED' },
    { icon: <Users size={14} />, value: String(data.followers), label: 'FOLLOWERS' },
    {
      icon: <GitFork size={14} />,
      value: String(data.contributionTotal),
      label: 'CONTRIBUTIONS / YR',
    },
  ];

  return (
    <section id="github" className="relative z-10 border-t border-rule bg-ground/88">
      <div className="px-5 py-20 sm:px-8 sm:py-28">
        <SectionHeading
          index="05"
          label="Activity"
          title="LIVE"
          aside={data.ok ? `@${data.login} · REBUILT DAILY` : 'PLACEHOLDER DATA'}
        />

        {/* Counters */}
        <dl className="mt-14 grid grid-cols-2 border-t border-l border-rule lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="border-b border-r border-rule p-5 sm:p-7">
              <dt className="label flex items-center gap-2 text-ink-dim">
                {s.icon}
                {s.label}
              </dt>
              <dd className="font-display mt-4 text-[12vw] leading-none sm:text-[4.5vw]">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Contribution grid */}
        <div className="mt-14">
          <div className="mb-5 flex items-baseline justify-between gap-6">
            <p className="label">CONTRIBUTION GRID / LAST 365 DAYS</p>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="label text-[9px] text-ink-dim">LESS</span>
              {levelOpacity.map((o, i) => (
                <span
                  key={i}
                  className="h-[10px] w-[10px] bg-ink"
                  style={{ opacity: o }}
                  aria-hidden
                />
              ))}
              <span className="label text-[9px] text-ink-dim">MORE</span>
            </div>
          </div>

          {/* Horizontally scrollable on narrow screens rather than squashed. */}
          <div className="overflow-x-auto border border-rule p-4">
            <div className="flex min-w-[720px] gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {Array.from({ length: 7 }, (_, di) => {
                    const day = week[di];
                    if (!day) return <span key={di} className="h-[11px] w-[11px]" aria-hidden />;
                    return (
                      <span
                        key={di}
                        title={`${day.date} · ${day.count} contribution${day.count === 1 ? '' : 's'}`}
                        className="h-[11px] w-[11px] bg-ink"
                        style={{ opacity: levelOpacity[Math.min(day.level, 4)] }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          {/* Top repositories */}
          <div>
            <p className="label mb-5">TOP REPOSITORIES</p>
            <ul className="border-t border-rule">
              {data.repos.length === 0 && (
                <li className="py-5 text-sm text-ink-dim">
                  No repositories fetched. Set <code>site.githubUser</code> in{' '}
                  <code>src/content/content.ts</code>.
                </li>
              )}
              {data.repos.slice(0, 6).map((r) => (
                <li key={r.name} className="border-b border-rule">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    data-cursor="OPEN"
                    className="group flex items-baseline justify-between gap-6 py-4 transition-colors hover:text-ink-dim"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-base text-ink group-hover:text-ink-dim sm:text-lg">
                        {r.name}
                      </span>
                      {r.description && (
                        <span className="mt-1 block max-w-[52ch] truncate text-xs text-ink-dim">
                          {r.description}
                        </span>
                      )}
                    </span>
                    <span className="label flex shrink-0 items-center gap-3 text-ink-dim">
                      {r.language && <span>{r.language}</span>}
                      <span className="flex items-center gap-1">
                        <Star size={11} />
                        {r.stars}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Language distribution */}
          <div>
            <p className="label mb-5">LANGUAGES BY REPO COUNT</p>
            <ul className="border-t border-rule">
              {data.languages.length === 0 && (
                <li className="py-5 text-sm text-ink-dim">No language data.</li>
              )}
              {data.languages.map((l) => {
                const max = data.languages[0].count || 1;
                return (
                  <li key={l.name} className="border-b border-rule py-4">
                    <div className="mb-2 flex items-baseline justify-between gap-4">
                      <span className="text-sm text-ink">{l.name}</span>
                      <span className="label text-[10px] text-ink-dim">{l.count}</span>
                    </div>
                    <div className="h-[3px] w-full bg-rule">
                      <div className="h-full bg-ink" style={{ width: `${(l.count / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>

            <a
              href={`https://github.com/${site.githubUser}`}
              target="_blank"
              rel="noreferrer"
              data-cursor="OPEN"
              className="label mt-6 inline-block border border-ink px-6 py-3 transition-colors hover:bg-ink hover:text-ground"
            >
              FULL PROFILE
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
