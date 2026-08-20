'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { onTick } from '@/lib/ticker';
import { useAudio } from './AudioProvider';

/**
 * Docked player, bottom-left.
 *
 * Collapsed it is a single bar with a live 24-band spectrum; clicking the title
 * expands transport controls, a seek rule and volume. The spectrum is drawn on a
 * canvas from the provider's `levels` ref on the shared ticker, so the player
 * re-renders only when the track or play state actually changes.
 */
export default function MusicPlayer() {
  const { levels, track, index, tracks, isPlaying, missing, progress, toggle, next, prev, select, seek, volume, setVolume } =
    useAudio();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BARS = 24;
    // Each bar keeps its own decaying peak so the spectrum falls, never snaps.
    const peaks = new Float32Array(BARS);

    /*
     * CSS size is cached, not measured per frame.
     *
     * The draw needs `width`/`height` in CSS pixels, and it used to get them from
     * `getBoundingClientRect()` — a forced layout 60 times a second for the entire
     * visit, to re-read a box that only changes when the ResizeObserver fires.
     */
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const releaseTick = onTick((dt, now) => {
      if (width === 0 || height === 0) return;

      const { bass, mid, treble } = levels.current;

      ctx.clearRect(0, 0, width, height);

      const gap = 2;
      const barW = (width - gap * (BARS - 1)) / BARS;

      // Decay is per second, not per frame: at 144Hz a per-frame 0.03 emptied the
      // meter more than twice as fast as it did at 60Hz.
      const decay = 1.8 * dt;

      for (let i = 0; i < BARS; i++) {
        const t = i / (BARS - 1);
        // Interpolate the three measured bands across the bar strip, then add a
        // little index-dependent wobble so neighbouring bars are not identical.
        const band = t < 0.5 ? bass + (mid - bass) * (t / 0.5) : mid + (treble - mid) * ((t - 0.5) / 0.5);
        const wobble = 0.75 + 0.25 * Math.sin(i * 1.7 + now / 220);
        const target = Math.min(1, band * wobble * 1.6);

        peaks[i] = Math.max(target, peaks[i] - decay);

        const h = Math.max(1, peaks[i] * height);
        ctx.fillStyle = '#f2f0eb';
        ctx.fillRect(i * (barW + gap), height - h, barW, h);
      }
    });

    return () => {
      releaseTick();
      ro.disconnect();
    };
  }, [levels]);

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      data-player
      // No `backdrop-blur` here for the same reason as the nav bar: a fixed
      // element's backdrop is the entire scrolling document, so the filter costs a
      // full-page rasterisation on every scrolled frame.
      className="fixed bottom-0 left-0 z-[140] w-full border-t border-rule bg-ground/92 sm:bottom-5 sm:left-5 sm:w-[340px] sm:border"
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={toggle}
          data-cursor={isPlaying ? 'pause' : 'play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex h-8 w-8 shrink-0 items-center justify-center border border-rule transition-colors hover:bg-ink hover:text-ground"
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <p className="label truncate text-ink">{track?.title ?? 'NO TRACK'}</p>
          <p className="label truncate text-[9px]">
            {missing ? 'DROP MP3 → /public/audio' : `${String(index + 1).padStart(2, '0')} / ${String(tracks.length).padStart(2, '0')}`}
          </p>
        </button>

        <canvas ref={canvasRef} className="h-7 w-[86px] shrink-0 opacity-80" aria-hidden />
      </div>

      {/* Seek rule — always visible, doubles as the collapsed progress readout. */}
      <button
        type="button"
        aria-label="Seek"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - rect.left) / rect.width);
        }}
        className="block h-[3px] w-full bg-rule"
      >
        <span
          className="block h-full bg-ink transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </button>

      {/* Expanded controls */}
      <div
        className="grid overflow-hidden transition-[grid-template-rows] duration-500"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0">
          <div className="flex items-center gap-2 border-t border-rule px-3 py-2">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous track"
              className="flex h-7 w-7 items-center justify-center border border-rule hover:bg-ink hover:text-ground"
            >
              <SkipBack size={12} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next track"
              className="flex h-7 w-7 items-center justify-center border border-rule hover:bg-ink hover:text-ground"
            >
              <SkipForward size={12} />
            </button>

            <VolumeIcon size={13} className="ml-2 shrink-0 text-ink-dim" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-[3px] flex-1 appearance-none bg-rule accent-ink"
            />
          </div>

          <ul className="max-h-32 overflow-y-auto border-t border-rule">
            {tracks.map((t, i) => (
              <li key={t.src}>
                <button
                  type="button"
                  onClick={() => select(i)}
                  className={`label flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-ground-2 ${
                    i === index ? 'text-ink' : ''
                  }`}
                >
                  <span className="truncate">{t.title}</span>
                  <span className="text-[9px]">{String(i + 1).padStart(2, '0')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
