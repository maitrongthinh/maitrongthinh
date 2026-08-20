'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pointer } from '@/lib/pointer';
import { scrollState } from '@/lib/scrollState';
import { useAudioLevels } from '@/components/audio/AudioProvider';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/** Deterministic PRNG so the structure is identical on every load and on the server. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNT = 44;
/** How many distinct arrangements the structure cycles through as you scroll. */
const STATES = 4;

type Slab = {
  scale: THREE.Vector3;
  /** One target transform per state; index 0 is the hero arrangement. */
  pos: THREE.Vector3[];
  rot: THREE.Euler[];
  /** Unit vector the slab travels along when the bass pushes it outward. */
  push: THREE.Vector3;
  spin: number;
};

/**
 * Builds four arrangements of the same 44 slabs:
 *
 *  0 TOWER    — a stacked, offset concrete shaft. The hero silhouette.
 *  1 SPREAD   — slabs fan out onto a wide plane, like an exploded elevation drawing.
 *  2 RING     — slabs stand in a circle facing inward, a colonnade.
 *  3 COLLAPSE — everything crushes into one dense wall, edge-on to the camera.
 */
function buildSlabs(): Slab[] {
  const rand = mulberry32(0x5eed);
  const slabs: Slab[] = [];

  for (let i = 0; i < COUNT; i++) {
    const t = i / (COUNT - 1);

    const w = 0.7 + rand() * 2.6;
    const h = 0.18 + rand() * 0.7;
    const d = 0.7 + rand() * 2.6;

    // 0 — TOWER: climb the Y axis, jitter in X/Z, occasionally cantilever out.
    const towerY = -5.5 + t * 12;
    const cantilever = rand() > 0.72 ? 1.9 : 0.5;
    const tower = new THREE.Vector3(
      (rand() - 0.5) * 2.2 * cantilever,
      towerY,
      (rand() - 0.5) * 2.2 * cantilever,
    );

    // 1 — SPREAD: 7-column grid drifting on Z.
    const cols = 7;
    const spread = new THREE.Vector3(
      ((i % cols) - (cols - 1) / 2) * 2.5,
      (Math.floor(i / cols) - COUNT / cols / 2) * 1.9,
      (rand() - 0.5) * 5,
    );

    // 2 — RING: even angular spacing, two stacked tiers.
    const a = (i / COUNT) * Math.PI * 2;
    const tier = i % 2 === 0 ? -1.4 : 1.4;
    const ring = new THREE.Vector3(Math.cos(a) * 7.2, tier + (rand() - 0.5) * 1.2, Math.sin(a) * 7.2);

    // 3 — COLLAPSE: a flat slab wall, minimal depth.
    const collapse = new THREE.Vector3(
      (rand() - 0.5) * 9,
      (rand() - 0.5) * 7,
      (rand() - 0.5) * 0.9,
    );

    const push = tower.clone().normalize();
    if (push.lengthSq() === 0) push.set(0, 1, 0);

    slabs.push({
      scale: new THREE.Vector3(w, h, d),
      pos: [tower, spread, ring, collapse],
      rot: [
        new THREE.Euler(0, rand() * Math.PI, 0),
        new THREE.Euler(0, 0, 0),
        new THREE.Euler(0, -a + Math.PI / 2, 0),
        new THREE.Euler(0, 0, (rand() - 0.5) * 0.25),
      ],
      push,
      spin: (rand() - 0.5) * 0.4,
    });
  }

  return slabs;
}

/**
 * The brutalist monolith: instanced concrete slabs plus a wireframe shell.
 *
 * Both instanced meshes share one set of matrices, computed once per frame in
 * `useFrame`. Nothing here touches React state — position, audio reaction and
 * scroll morphing are all written straight into the instance matrices.
 */
export default function Monolith() {
  const solidRef = useRef<THREE.InstancedMesh>(null);
  const wireRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const levels = useAudioLevels();
  const reduced = usePrefersReducedMotion();

  const slabs = useMemo(buildSlabs, []);

  // Scratch objects, allocated once — allocating inside useFrame would churn GC.
  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      euler: new THREE.Euler(),
      scale: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      current: slabs.map((s) => s.pos[0].clone()),
      currentRot: slabs.map((s) => s.rot[0].clone()),
    }),
    [slabs],
  );

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    // Instanced meshes default to frustum culling against a unit bounding sphere,
    // which pops the whole structure out of view during the SPREAD state.
    if (solidRef.current) solidRef.current.frustumCulled = false;
    if (wireRef.current) wireRef.current.frustumCulled = false;
  }, []);

  useFrame((_, delta) => {
    const solid = solidRef.current;
    const wire = wireRef.current;
    const group = groupRef.current;
    if (!solid || !wire || !group) return;

    const { bass, level } = levels.current;

    // Which arrangement, and how far between it and the next one.
    const raw = Math.min(STATES - 1, Math.max(0, scrollState.section));
    const nextState = Math.min(STATES - 1, raw + 1);
    const blend = scrollState.section >= STATES - 1 ? 0 : scrollState.local;

    // Frame-rate-independent easing.
    const k = 1 - Math.pow(0.001, delta);

    for (let i = 0; i < slabs.length; i++) {
      const slab = slabs[i];

      scratch.from.copy(slab.pos[raw]);
      scratch.to.copy(slab.pos[nextState]);
      scratch.pos.lerpVectors(scratch.from, scratch.to, blend);

      // Bass shoves slabs outward along their own axis; treble is left to the
      // wireframe opacity so the two bands are visually distinguishable.
      scratch.pos.addScaledVector(slab.push, bass * 2.6);

      const cur = scratch.current[i];
      cur.lerp(scratch.pos, k);

      const rotA = slab.rot[raw];
      const rotB = slab.rot[nextState];
      const curRot = scratch.currentRot[i];
      curRot.x += (THREE.MathUtils.lerp(rotA.x, rotB.x, blend) - curRot.x) * k;
      curRot.y += (THREE.MathUtils.lerp(rotA.y, rotB.y, blend) - curRot.y) * k;
      curRot.z += (THREE.MathUtils.lerp(rotA.z, rotB.z, blend) - curRot.z) * k;

      // Scroll velocity shears the stack — fast scrolling visibly stresses it.
      const shear = THREE.MathUtils.clamp(scrollState.velocity * 0.006, -0.35, 0.35);

      scratch.euler.set(curRot.x + shear * slab.spin, curRot.y, curRot.z + shear);
      scratch.quat.setFromEuler(scratch.euler);
      scratch.scale.copy(slab.scale).multiplyScalar(1 + level * 0.14);

      scratch.matrix.compose(cur, scratch.quat, scratch.scale);
      solid.setMatrixAt(i, scratch.matrix);
      wire.setMatrixAt(i, scratch.matrix);
    }

    solid.instanceMatrix.needsUpdate = true;
    wire.instanceMatrix.needsUpdate = true;

    // Mouse-wind: horizontal cursor travel turns the whole structure around Y.
    // Vertical cursor position tilts it. Both are damped, never snapped.
    //
    // `scrubTotal`, not `scrub`: the wrapped value jumps from 1 back to 0 roughly
    // every 1.25 viewport-widths of cursor travel, and easing towards a target
    // that jumped by 2π sends the monolith whipping backwards through a full turn.
    // That whip was the reported roughness, not the frame rate — the hero holds a
    // flat 60fps either side of this change.
    //
    // Under reduced motion the cursor-driven wind and tilt drop out: the structure
    // then only turns with scroll, so it holds still while the mouse moves instead
    // of spinning left/right under it. Scroll morphing and audio reaction stay.
    const targetY =
      (reduced ? 0 : pointer.scrubTotal * Math.PI * 2) + scrollState.progress * Math.PI * 1.2;
    const targetX = reduced ? 0 : pointer.ny * 0.16;

    group.rotation.y += (targetY - group.rotation.y) * Math.min(1, k * 0.9);
    group.rotation.x += (targetX - group.rotation.x) * Math.min(1, k * 0.9);

    const wireMat = wire.material as THREE.MeshBasicMaterial;
    wireMat.opacity = 0.1 + levels.current.treble * 0.5;
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={solidRef} args={[geometry, undefined, COUNT]} castShadow receiveShadow>
        <meshStandardMaterial color="#17171b" roughness={0.94} metalness={0.04} />
      </instancedMesh>

      {/* Wireframe shell, slightly larger so its lines read as hard edges. */}
      <instancedMesh ref={wireRef} args={[geometry, undefined, COUNT]} scale={1.004}>
        <meshBasicMaterial color="#f2f0eb" wireframe transparent opacity={0.16} />
      </instancedMesh>
    </group>
  );
}
