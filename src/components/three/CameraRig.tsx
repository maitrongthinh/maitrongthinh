'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { pointer } from '@/lib/pointer';
import { scrollState } from '@/lib/scrollState';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Flies the camera along a fixed spline as the page scrolls.
 *
 * The path is authored once as a Catmull-Rom curve; scroll progress is the
 * parameter along it. A separate, shorter curve supplies the look-at target, so
 * the camera can swing past the monolith while still keeping it framed instead
 * of staring rigidly ahead.
 *
 * Pointer position adds a small orbital offset on top. It is applied *after* the
 * curve sample so it never accumulates — letting go of the mouse settles the
 * camera back onto the path.
 */
export default function CameraRig() {
  const { camera } = useThree();
  const reduced = usePrefersReducedMotion();

  const { path, look } = useMemo(() => {
    const path = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0.4, 15), // hero — head on, wide
        new THREE.Vector3(-8.5, 2.4, 9), // about — swing left and up
        new THREE.Vector3(-2, 7.5, -6), // work — rise over the top
        new THREE.Vector3(9, 1.2, -8.5), // stack — drop behind, right side
        new THREE.Vector3(6.5, -3.4, 7), // path — sweep low across the front
        new THREE.Vector3(0, 0.2, 13), // contact — settle back to the opening shot
      ],
      false,
      'catmullrom',
      0.35,
    );

    const look = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0, 1.5, 0),
        new THREE.Vector3(0, 2.5, 0),
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0.4, 0),
      ],
      false,
      'catmullrom',
      0.4,
    );

    return { path, look };
  }, []);

  const scratch = useMemo(
    () => ({
      target: new THREE.Vector3(),
      lookAt: new THREE.Vector3(),
      smoothed: new THREE.Vector3(0, 0.4, 15),
      smoothedLook: new THREE.Vector3(0, 0.5, 0),
    }),
    [],
  );

  const progressRef = useRef(0);

  useFrame((_, delta) => {
    const k = 1 - Math.pow(0.0015, delta);

    // Ease the scroll parameter itself as well as the resulting position. Two
    // stages of damping is what removes the last of the scroll-wheel steppiness.
    progressRef.current += (scrollState.progress - progressRef.current) * k;
    const t = THREE.MathUtils.clamp(progressRef.current, 0, 1);

    path.getPointAt(t, scratch.target);
    look.getPointAt(t, scratch.lookAt);

    // Pointer parallax — orbit slightly, and never more than a couple of units.
    // This is cursor-driven camera drift, so it is suppressed under reduced motion:
    // the scene then holds to the scroll path instead of wandering left/right under
    // the cursor. Scroll flight stays — that is motion the visitor asks for.
    if (!reduced) {
      scratch.target.x += pointer.nx * 1.6;
      scratch.target.y += -pointer.ny * 1.1;
    }

    scratch.smoothed.lerp(scratch.target, k);
    scratch.smoothedLook.lerp(scratch.lookAt, k);

    camera.position.copy(scratch.smoothed);
    camera.lookAt(scratch.smoothedLook);

    // Slight dutch roll driven by scroll velocity, for a handheld feel.
    camera.rotation.z = THREE.MathUtils.clamp(scrollState.velocity * -0.0008, -0.05, 0.05);
  });

  return null;
}
