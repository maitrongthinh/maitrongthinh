'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { playlist, type Track } from '@/content/content';
import { onTick, PRIORITY } from '@/lib/ticker';

/**
 * Frequency-band energies, 0..1, refreshed once per animation frame.
 *
 * Held in a mutable ref rather than React state on purpose: the 3D scene reads
 * these 60 times a second, and putting them in state would re-render the entire
 * tree at frame rate.
 */
export type AudioLevels = {
  bass: number;
  mid: number;
  treble: number;
  /** Broadband loudness — the useful single number for scale/intensity. */
  level: number;
};

type AudioApi = {
  levels: React.RefObject<AudioLevels>;
  tracks: Track[];
  index: number;
  track: Track | undefined;
  isPlaying: boolean;
  /** True when the current track's file could not be loaded. */
  missing: boolean;
  progress: number;
  duration: number;
  volume: number;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  /** Jump straight to a playlist position. */
  select: (i: number) => void;
  seek: (fraction: number) => void;
  setVolume: (v: number) => void;
};

const AudioCtx = createContext<AudioApi | null>(null);

/**
 * Levels live in their own context, holding nothing but the mutable ref.
 *
 * The main context value changes ~4 times a second while a track plays, because
 * the progress bar needs it. Everything audio-reactive in the 3D scene only ever
 * reads `levels.current` from inside its own animation frame, so subscribing those
 * components to the main context made them re-render for a value they never read.
 * This context is created once and never changes identity.
 */
const LevelsCtx = createContext<React.RefObject<AudioLevels> | null>(null);

/** Bin ranges for a 2048-point FFT at ~44.1kHz (≈21.5Hz per bin). */
const BANDS = {
  bass: [1, 8],
  mid: [8, 93],
  treble: [93, 372],
} as const;

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const levels = useRef<AudioLevels>({ bass: 0, mid: 0, treble: 0, level: 0 });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [missing, setMissing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7);

  const track = playlist[index];

  /**
   * Builds the Web Audio graph on the first user gesture.
   *
   * Browsers refuse to start an AudioContext before one, and a
   * MediaElementSource can only be created once per element — hence the guards.
   */
  const ensureGraph = useCallback(() => {
    const el = audioRef.current;
    if (!el || ctxRef.current) return;

    type WithLegacy = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WithLegacy).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const source = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    // Heavier smoothing than the default 0.8: the monolith should breathe, not jitter.
    analyser.smoothingTimeConstant = 0.86;

    source.connect(analyser);
    analyser.connect(ctx.destination);

    ctxRef.current = ctx;
    analyserRef.current = analyser;
    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  }, []);

  /**
   * Fills `levels` once per frame, on the shared ticker.
   *
   * Registered at `PRIORITY.store` so every band value is already current by the
   * time the 3D scene and the player's waveform read it in the same frame, rather
   * than one frame stale.
   *
   * When no audio is loaded — the common case before you drop your own mp3s in —
   * it falls back to a slow synthetic pulse so every audio-reactive visual still
   * has something to move to instead of sitting frozen.
   */
  useEffect(() => {
    let t = 0;

    return onTick((dt) => {
      const analyser = analyserRef.current;
      const data = dataRef.current;
      const el = audioRef.current;

      if (analyser && data && el && !el.paused) {
        analyser.getByteFrequencyData(data);

        const avg = (from: number, to: number) => {
          let sum = 0;
          for (let i = from; i < to; i++) sum += data[i];
          return sum / (to - from) / 255;
        };

        const bass = avg(...BANDS.bass);
        const mid = avg(...BANDS.mid);
        const treble = avg(...BANDS.treble);

        levels.current.bass = bass;
        levels.current.mid = mid;
        levels.current.treble = treble;
        levels.current.level = bass * 0.6 + mid * 0.3 + treble * 0.1;
      } else {
        // Real elapsed time rather than an assumed 16ms step, so the fallback
        // pulse breathes at the same rate on a 144Hz display as on a 60Hz one.
        t += dt;
        const pulse = (Math.sin(t * 1.1) * 0.5 + 0.5) ** 2;
        levels.current.bass = pulse * 0.42;
        levels.current.mid = (Math.sin(t * 1.9 + 1) * 0.5 + 0.5) * 0.22;
        levels.current.treble = (Math.sin(t * 3.3 + 2) * 0.5 + 0.5) * 0.12;
        levels.current.level = pulse * 0.3;
      }
    }, PRIORITY.store);
  }, []);

  /**
   * Hold the track off the wire until there is a reason to want it.
   *
   * `preload="metadata"` looks cheap and is not: against a server that speaks
   * Range, Chrome pulled the entire 12.8MB file on first paint, which is more
   * bytes than the rest of the page put together and wasted on every visitor who
   * never presses play. Starting at `none` and promoting to `metadata` on the
   * first real interaction gets the duration into the progress bar well before
   * anyone reaches the player, without spending anything on a bounce.
   */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const promote = () => {
      if (el.preload !== 'metadata') el.preload = 'metadata';
    };

    const opts = { once: true, passive: true } as const;
    window.addEventListener('pointerdown', promote, opts);
    window.addEventListener('keydown', promote, opts);
    window.addEventListener('scroll', promote, opts);

    return () => {
      window.removeEventListener('pointerdown', promote);
      window.removeEventListener('keydown', promote);
      window.removeEventListener('scroll', promote);
    };
  }, []);

  const play = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    ensureGraph();
    void ctxRef.current?.resume();
    el.play().then(
      () => {
        setIsPlaying(true);
        setMissing(false);
      },
      () => {
        // Either the file is absent or the gesture was not trusted.
        setIsPlaying(false);
        setMissing(true);
      },
    );
  }, [ensureGraph]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (audioRef.current?.paused ?? true) play();
    else pause();
  }, [play, pause]);

  const step = useCallback((delta: number) => {
    setIndex((i) => (i + delta + playlist.length) % playlist.length);
    setProgress(0);
  }, []);

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  const select = useCallback((i: number) => {
    if (i < 0 || i >= playlist.length) return;
    setIndex(i);
    setProgress(0);
  }, []);

  const seek = useCallback((fraction: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.max(0, Math.min(1, fraction)) * el.duration;
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  // Keep playing across track changes, but only if we were already playing.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = volume;
    if (isPlaying) {
      el.play().catch(() => setMissing(true));
    }
    // `isPlaying` is intentionally excluded: reacting to it here would restart
    // the track every time the user pressed pause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const value = useMemo<AudioApi>(
    () => ({
      levels,
      tracks: playlist,
      index,
      track,
      isPlaying,
      missing,
      progress,
      duration,
      volume,
      toggle,
      play,
      pause,
      next,
      prev,
      select,
      seek,
      setVolume,
    }),
    [
      index,
      track,
      isPlaying,
      missing,
      progress,
      duration,
      volume,
      toggle,
      play,
      pause,
      next,
      prev,
      select,
      seek,
      setVolume,
    ],
  );

  return (
    <LevelsCtx.Provider value={levels}>
      <AudioCtx.Provider value={value}>
        <audio
          ref={audioRef}
          src={track?.src}
          preload="none"
          crossOrigin="anonymous"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration) setProgress(el.currentTime / el.duration);
          }}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0);
            setMissing(false);
          }}
          onEnded={next}
          onError={() => setMissing(true)}
          className="hidden"
        />
        {children}
      </AudioCtx.Provider>
    </LevelsCtx.Provider>
  );
}

export function useAudio(): AudioApi {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error('useAudio must be used inside <AudioProvider>');
  return ctx;
}

/**
 * Frequency levels only. Use this in anything that reads them per frame — it
 * never re-renders, where `useAudio()` re-renders on every progress tick.
 */
export function useAudioLevels(): React.RefObject<AudioLevels> {
  const ctx = useContext(LevelsCtx);
  if (!ctx) throw new Error('useAudioLevels must be used inside <AudioProvider>');
  return ctx;
}
