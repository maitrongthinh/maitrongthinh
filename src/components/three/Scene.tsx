'use client';

import { memo, Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Glitch,
  Noise,
  Scanline,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, GlitchMode, type GlitchEffect } from 'postprocessing';
import * as THREE from 'three';
import Monolith from './Monolith';
import Dust from './Dust';
import CameraRig from './CameraRig';
import { acquirePointer } from '@/lib/pointer';
import { acquireScroll, scrollState } from '@/lib/scrollState';
import { onTick, PRIORITY } from '@/lib/ticker';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Resolution governor.
 *
 * Pixel count is the one setting that trades quality for frame rate linearly, and
 * the right value cannot be known ahead of time — the same code runs on an
 * integrated laptop GPU and on a discrete card driving 4K. So it is measured.
 *
 * It counts *how many* frames in a one-second window missed the budget rather than
 * averaging frame time, because a mean is not robust: a single 180ms hitch — a
 * shader compile, a GC pause, a tab regaining focus — drags an otherwise perfect
 * 60fps second down to 52, and that used to cost a permanent resolution step for a
 * stall which had nothing to do with fill rate. Counted as a share of frames, the
 * same hitch is 1 in 60 and correctly ignored.
 *
 * Written inline rather than pulling in drei's `PerformanceMonitor`, which would
 * add its whole module graph to this chunk for one 40-line behaviour.
 *
 * Adjustments are rate-limited and hysteretic (drop at a quarter of frames missed,
 * only climb under 3%) so it settles instead of oscillating forever.
 */

/** A frame slower than this counts as missed — 22ms, i.e. a dropped 60Hz frame. */
const FRAME_BUDGET = 1 / 45;
const DROP_SHARE = 0.25;
const CLIMB_SHARE = 0.03;

function AdaptiveDpr({ min, max }: { min: number; max: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const frameloop = useThree((s) => s.frameloop);
  const current = useRef(max);
  const frames = useRef(0);
  const missed = useRef(0);
  const elapsed = useRef(0);
  const cooldown = useRef(0);

  useFrame((_, delta) => {
    // `RenderGovernor` drops the loop to 18fps once the hero is off screen, which
    // makes every delta look like a missed frame. Measuring through that would walk
    // the resolution straight down to the floor for a scene nobody is looking at,
    // and then charge a render-target reallocation per step on the way back up.
    if (frameloop !== 'always') {
      frames.current = 0;
      missed.current = 0;
      elapsed.current = 0;
      return;
    }

    frames.current += 1;
    if (delta > FRAME_BUDGET) missed.current += 1;
    elapsed.current += delta;
    cooldown.current -= delta;

    if (elapsed.current < 1) return;

    const share = missed.current / Math.max(1, frames.current);
    frames.current = 0;
    missed.current = 0;
    elapsed.current = 0;

    if (cooldown.current > 0) return;

    let next = current.current;
    if (share > DROP_SHARE) next = Math.max(min, current.current - 0.25);
    else if (share < CLIMB_SHARE) next = Math.min(max, current.current + 0.25);

    if (next !== current.current) {
      current.current = next;
      setDpr(next);
      // Changing DPR reallocates every render target; give the new resolution a
      // moment to prove itself before reacting to it.
      cooldown.current = 2.5;
    }
  });

  return null;
}

/**
 * Render governor: full rate over the hero, a trickle past it.
 *
 * The canvas is `position: fixed`, so it keeps rendering at 60fps for the whole
 * length of the page even though every section below the hero covers it with a
 * background at 88–92% opacity. Six fullscreen postprocessing passes are the most
 * expensive thing here, and past the hero they are being spent on roughly a tenth
 * of a pixel's worth of visible contribution.
 *
 * So the frame loop switches to `demand` once the hero is off screen, and gets
 * poked from the shared ticker at 18fps instead. The scene still drifts and still
 * reacts to the music — behind an almost opaque panel, at a rate nobody can resolve
 * — and the GPU gets two thirds of its budget back for the part of the page where
 * the DOM is doing the work.
 */
const IDLE_FPS = 18;

function RenderGovernor() {
  const invalidate = useThree((s) => s.invalidate);
  const setFrameloop = useThree((s) => s.setFrameloop);

  useEffect(() => {
    let onDemand = false;
    let acc = 0;

    const release = onTick((dt) => {
      // One viewport plus a quarter: the switch happens while the hero is already
      // well out of sight, never on the boundary where it could visibly stutter.
      const near = scrollState.y < window.innerHeight * 1.25;

      if (near === onDemand) {
        onDemand = !near;
        setFrameloop(near ? 'always' : 'demand');
        acc = 0;
      }

      if (onDemand) {
        acc += dt;
        if (acc >= 1 / IDLE_FPS) {
          acc = 0;
          invalidate();
        }
      }
    }, PRIORITY.write);

    return () => {
      release();
      setFrameloop('always');
    };
  }, [invalidate, setFrameloop]);

  return null;
}

/*
 * Effect props live up here as module constants, and `Effects` below never
 * re-renders. Both halves are load-bearing.
 *
 * `Glitch` and `ChromaticAberration` memoize their effect instance on the identity
 * of their rest-props object and of every Vector2 handed to them — unlike the
 * `wrapEffect`-based effects (Bloom, Noise, Scanline, Vignette), which memoize on a
 * deep JSON of their props and so tolerate fresh literals. Passing
 * `new THREE.Vector2(...)` inline therefore rebuilt those two effects on every
 * render, which rebuilt the `EffectPass`, which recompiled the merged fullscreen
 * shader: measured at a 183ms frame while scrolling.
 *
 * Hoisting the vectors is not sufficient on its own, because rest destructuring
 * mints a new props object per render no matter what is in it. The instance can
 * only stay alive if the component does not re-render at all — hence no state in
 * `Effects`, and the glitch burst driven imperatively from `Scene`.
 */
const CA_OFFSET = new THREE.Vector2(0.0009, 0.0012);

const CA_EXTRA = {
  // Radial modulation keeps the centre clean and pushes the fringing out to the
  // edges of the frame. These props are real on the underlying effect but the
  // wrapper's published prop type resolves to almost nothing, so they go in as a
  // spread rather than fighting it.
  radialModulation: true,
  modulationOffset: 0.35,
  blendFunction: BlendFunction.NORMAL,
} as object;

const GLITCH_DELAY = new THREE.Vector2(0.4, 1.2);
const GLITCH_DURATION = new THREE.Vector2(0.08, 0.22);
const GLITCH_STRENGTH = new THREE.Vector2(0.12, 0.3);

/**
 * The postprocessing chain, mounted exactly once for the life of the page.
 *
 * `glitchRef` is the only prop and is a stable ref object; `memo` keeps a parent
 * re-render from reaching in. Nothing in here holds state.
 */
const Effects = memo(function Effects({
  glitchRef,
}: {
  glitchRef: React.RefObject<GlitchEffect | null>;
}) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {/* Bloom is what makes the wireframe edges glow against the black ground. */}
      <Bloom intensity={0.85} luminanceThreshold={0.28} luminanceSmoothing={0.35} mipmapBlur radius={0.72} />

      <ChromaticAberration offset={CA_OFFSET} {...CA_EXTRA} />

      {/*
       * `active={false}` parks the effect at `GlitchMode.DISABLED` on mount, and
       * `Scene` flips `mode` on the instance from there. It cannot be written as
       * `mode={GlitchMode.DISABLED}` instead: the wrapper resolves the mode as
       * `mode || SPORADIC`, and DISABLED is 0.
       */}
      <Glitch
        ref={glitchRef}
        active={false}
        delay={GLITCH_DELAY}
        duration={GLITCH_DURATION}
        strength={GLITCH_STRENGTH}
        ratio={0.7}
      />

      <Scanline blendFunction={BlendFunction.OVERLAY} density={1.15} opacity={0.16} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.32} />
      <Vignette eskil={false} offset={0.22} darkness={0.72} />
    </EffectComposer>
  );
});

/**
 * The 3D layer.
 *
 * Fixed behind all content and pointer-transparent: every interaction still goes
 * to the HTML above it, while the camera reacts to the same pointer and scroll
 * stores the DOM effects read from.
 *
 * On coarse-pointer or narrow viewports the postprocessing chain is dropped
 * entirely — the fullscreen passes are the single most expensive thing on the
 * page, and a phone GPU cannot hold 60fps through it. The geometry, camera
 * flight and audio reaction all still run.
 *
 * Starting DPR is deliberately below the device's own: 1.3 with a bloom pass over
 * it is indistinguishable from 1.75 at arm's length, and costs ~45% fewer pixels.
 * `AdaptiveDpr` then moves it wherever the hardware can actually hold frame rate.
 */
export default function Scene() {
  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();

  const maxDpr = isMobile ? 1.25 : 1.3;
  const postprocessing = !isMobile && !reduced;

  const glitchRef = useRef<GlitchEffect | null>(null);

  // Both stores are refcounted, so acquiring here is safe alongside CustomCursor.
  useEffect(() => {
    const releasePointer = acquirePointer(0.1);
    const releaseScroll = acquireScroll();
    return () => {
      releasePointer();
      releaseScroll();
    };
  }, []);

  /*
   * Short glitch burst each time the page crosses into a new viewport-height band —
   * the same moment the monolith starts morphing into its next arrangement, so the
   * two read as one event.
   *
   * This was React state feeding `<Glitch active={…}>`. Section index only changes a
   * handful of times per page, so the state itself was cheap; what was not cheap was
   * what it re-rendered. Each crossing re-rendered `Effects` twice, and each of those
   * recompiled the merged postprocessing shader (see the note above `CA_OFFSET`).
   * Writing `mode` onto the live effect is the same picture at no cost, and keeps the
   * burst out of React entirely.
   */
  useEffect(() => {
    if (!postprocessing) return;

    let last = scrollState.section;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const id = setInterval(() => {
      if (scrollState.section === last) return;
      last = scrollState.section;

      const effect = glitchRef.current;
      if (!effect) return;

      effect.mode = GlitchMode.SPORADIC;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (glitchRef.current) glitchRef.current.mode = GlitchMode.DISABLED;
      }, 280);
    }, 100);

    return () => {
      clearInterval(id);
      clearTimeout(timer);
      if (glitchRef.current) glitchRef.current.mode = GlitchMode.DISABLED;
    };
  }, [postprocessing]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <Canvas
        dpr={maxDpr}
        // Lets R3F drop resolution during bursts of interaction on its own, on top
        // of the measured floor `AdaptiveDpr` settles at.
        performance={{ min: 0.6 }}
        gl={{
          // Postprocessing resolves aliasing; MSAA on top of it is wasted fill rate.
          antialias: isMobile,
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          depth: true,
        }}
        camera={{ fov: 42, near: 0.1, far: 140, position: [0, 0.4, 15] }}
        onCreated={({ gl }) => {
          gl.setClearColor('#060607', 1);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}
      >
        <fogExp2 attach="fog" args={['#060607', 0.019]} />

        {/* Single hard key light plus a dim rim — concrete wants raking light, not fill. */}
        <ambientLight intensity={0.22} />
        <directionalLight position={[9, 15, 7]} intensity={2.6} color="#ffffff" />
        <directionalLight position={[-11, -5, -9]} intensity={0.55} color="#9aa0b0" />
        <spotLight position={[0, 18, 4]} angle={0.6} penumbra={0.9} intensity={1.4} distance={48} />

        <Suspense fallback={null}>
          <Monolith />
          <Dust />
        </Suspense>

        <CameraRig />
        <AdaptiveDpr min={0.75} max={maxDpr} />
        <RenderGovernor />

        {postprocessing && <Effects glitchRef={glitchRef} />}
      </Canvas>
    </div>
  );
}
