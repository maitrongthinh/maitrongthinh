'use client';

/**
 * Seamless horizontal ticker.
 *
 * The item list is rendered twice and the track is translated by exactly -50%,
 * so the second copy lands where the first started and the loop has no visible
 * seam. Reversing simply negates the animation direction.
 */
export default function Marquee({
  items,
  duration = 28,
  reverse = false,
  className = '',
}: {
  items: string[];
  duration?: number;
  reverse?: boolean;
  className?: string;
}) {
  const doubled = [...items, ...items];

  return (
    <div className={`relative flex w-full overflow-hidden ${className}`} aria-hidden>
      <div
        className="animate-marquee flex shrink-0 items-center gap-8 pr-8"
        style={{
          ['--marquee-duration' as string]: `${duration}s`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {doubled.map((item, i) => (
          <span key={`${item}-${i}`} className="flex shrink-0 items-center gap-8">
            <span className="font-display text-[7vw] leading-none text-ink/12 sm:text-[5vw]">
              {item}
            </span>
            <span className="text-ink/20">&#10033;</span>
          </span>
        ))}
      </div>
    </div>
  );
}
