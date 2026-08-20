'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioLevels } from '@/components/audio/AudioProvider';

const COUNT = 1400;

/**
 * Slow-drifting dust motes filling the volume around the monolith.
 *
 * Purely atmospheric: they give the camera flight a sense of depth and speed
 * that a bare object against black cannot. Positions are set once and animated
 * entirely in the vertex shader, so the CPU cost per frame is two uniform writes.
 */
export default function Dust() {
  const ref = useRef<THREE.Points>(null);
  const levels = useAudioLevels();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 34;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 34;
      seed[i] = Math.random();
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return geo;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uLevel: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          uniform float uLevel;
          varying float vFade;

          void main() {
            vec3 p = position;

            // Each mote drifts on its own slow lissajous, offset by its seed.
            float s = aSeed * 6.2831;
            p.x += sin(uTime * 0.11 + s) * 1.4;
            p.y += cos(uTime * 0.09 + s * 1.7) * 1.1;
            p.z += sin(uTime * 0.13 + s * 2.3) * 1.4;

            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;

            // Perspective-correct size, plus a kick from the music.
            float size = mix(1.1, 3.4, aSeed) * (1.0 + uLevel * 1.8);
            gl_PointSize = size * (26.0 / -mv.z);

            // Fade the far field out so the volume has no visible boundary.
            vFade = smoothstep(46.0, 6.0, -mv.z) * mix(0.18, 0.7, aSeed);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vFade;
          void main() {
            // Square motes, not discs — softer shapes read as bokeh and fight
            // the hard-edged brutalist language.
            vec2 uv = gl_PointCoord - 0.5;
            float m = step(max(abs(uv.x), abs(uv.y)), 0.42);
            if (m < 0.5) discard;
            gl_FragColor = vec4(0.949, 0.941, 0.921, vFade);
          }
        `,
      }),
    [],
  );

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    const target = levels.current.level;
    material.uniforms.uLevel.value += (target - material.uniforms.uLevel.value) * 0.1;
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.008;
  });

  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />;
}
