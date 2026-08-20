/**
 * Reads the sample tables out of an MP4 so the hero's scrub strategy can be
 * chosen from the file's real structure instead of a guess.
 *
 * Seeking a video is only smooth when the target lands on or near a sync sample
 * (keyframe). With one keyframe per second the decoder has to replay up to a
 * second of inter frames per seek, and a mouse-driven scrub turns into a
 * slideshow. `stss` is what says which of those two worlds we are in: present
 * means sparse keyframes, absent means every sample is a keyframe.
 *
 * Usage: node scripts/probe-mp4.mjs public/video/hero.mp4
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'public/video/hero.mp4';
const buf = readFileSync(file);

/** Walks the box tree, calling `visit(type, start, end, depth)` per box. */
function walk(start, end, visit, depth = 0, path = '') {
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let head = 8;
    if (size === 1) {
      // 64-bit `largesize` follows the type.
      size = Number(buf.readBigUInt64BE(p + 8));
      head = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < head) break;
    const boxEnd = Math.min(p + size, end);
    visit(type, p + head, boxEnd, depth, path + '/' + type);
    p += size;
  }
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'udta']);

const tracks = [];
let current = null;
let timescaleMovie = 0;

function descend(start, end, depth, path) {
  walk(
    start,
    end,
    (type, s, e, d, pth) => {
      if (type === 'mvhd') {
        const version = buf[s];
        timescaleMovie = version === 1 ? buf.readUInt32BE(s + 20) : buf.readUInt32BE(s + 12);
      }
      if (type === 'trak') {
        current = { handler: '?', timescale: 0, duration: 0, samples: 0, syncSamples: null };
        tracks.push(current);
      }
      if (type === 'hdlr' && current) {
        current.handler = buf.toString('latin1', s + 8, s + 12);
      }
      if (type === 'mdhd' && current) {
        const version = buf[s];
        if (version === 1) {
          current.timescale = buf.readUInt32BE(s + 20);
          current.duration = Number(buf.readBigUInt64BE(s + 24));
        } else {
          current.timescale = buf.readUInt32BE(s + 12);
          current.duration = buf.readUInt32BE(s + 16);
        }
      }
      if (type === 'stts' && current) {
        const count = buf.readUInt32BE(s + 4);
        let total = 0;
        const deltas = new Set();
        for (let i = 0; i < count; i++) {
          const n = buf.readUInt32BE(s + 8 + i * 8);
          const delta = buf.readUInt32BE(s + 12 + i * 8);
          total += n;
          deltas.add(delta);
        }
        current.samples = total;
        current.sampleDeltas = [...deltas];
      }
      if (type === 'stss' && current) {
        current.syncSamples = buf.readUInt32BE(s + 4);
        const first = [];
        for (let i = 0; i < Math.min(8, current.syncSamples); i++) {
          first.push(buf.readUInt32BE(s + 8 + i * 4));
        }
        current.firstSync = first;
      }
      if (CONTAINERS.has(type)) descend(s, e, d + 1, pth);
    },
    depth,
    path,
  );
}

descend(0, buf.length, 0, '');

const out = { file, bytes: buf.length, movieTimescale: timescaleMovie, tracks: [] };
for (const t of tracks) {
  const seconds = t.timescale ? +(t.duration / t.timescale).toFixed(3) : null;
  const fps = seconds && t.samples ? +(t.samples / seconds).toFixed(2) : null;
  out.tracks.push({
    handler: t.handler,
    seconds,
    samples: t.samples,
    fps,
    // null here means the file has no `stss` at all, i.e. every sample is a keyframe.
    syncSamples: t.syncSamples,
    keyframeEverySeconds:
      t.syncSamples && seconds ? +(seconds / t.syncSamples).toFixed(3) : t.syncSamples,
    firstSync: t.firstSync,
    allIntra: t.syncSamples === null || t.syncSamples === t.samples,
  });
}
console.log(JSON.stringify(out, null, 2));
