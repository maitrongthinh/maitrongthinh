/**
 * Proof that the head tracks the cursor.
 *
 * ScrubVideo captures `hero.mp4` into a sprite sheet and then blits one tile per
 * cursor position, so the check that matters is: does moving the pointer across the
 * viewport change which tile is on screen, and does it change *monotonically*
 * (left edge of the clip at the left edge of the screen)?
 *
 * Pixels are the only honest answer here — a frame index in a closure is not
 * observable, and a screenshot of a grayscale rock pan is not something to eyeball.
 * So this samples the live canvas at each cursor stop and prints a signature.
 *
 * Usage: node scripts/probe-head.mjs [url]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ARG = process.argv[2] ?? 'http://localhost:4173/';
const PORT = 9342;

const chromePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  chromePath,
  [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--no-sandbox',
    '--hide-scrollbars',
    '--window-size=1440,900',
    '--no-first-run',
    // Headless has no audio device and the capture pass needs `play()` to resolve.
    '--autoplay-policy=no-user-gesture-required',
    '--user-data-dir=' + resolve('.tmp-verify/head-profile'),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function debuggerUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const json = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch {
      /* not up */
    }
    await sleep(250);
  }
  throw new Error('no debugger');
}

const ws = new WebSocket(await debuggerUrl());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve: done, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else done(msg.result);
  }
});
const send = (method, params = {}, sessionId) => {
  const id = nextId++;
  return new Promise((res, rej) => {
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);

await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await call('Page.bringToFront');
await call('Emulation.setFocusEmulationEnabled', { enabled: true });
await call('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
});
await call('Page.navigate', { url: URL_ARG });

const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { returnByValue: true, expression, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

/** Coarse fingerprint of the visible canvas: mean luma over a 16x9 sample grid. */
const BAND = 'section[aria-label="Motion study"]';
const SIGNATURE = `(() => {
  const band = document.querySelector('${BAND}');
  const c = band && band.querySelector('canvas');
  if (!c) return { error: 'no canvas' };
  const cs = getComputedStyle(c);
  const v = band.querySelector('video');
  let cells = null;
  try {
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const w = c.width, h = c.height;
    cells = [];
    for (let gy = 0; gy < 9; gy++) {
      for (let gx = 0; gx < 16; gx++) {
        const d = ctx.getImageData(Math.floor((gx + 0.5) * w / 16),
                                   Math.floor((gy + 0.5) * h / 9), 1, 1).data;
        cells.push(Math.round(0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]));
      }
    }
  } catch (e) { return { error: String(e.message || e) }; }
  const sum = cells.reduce((a, b) => a + b, 0);
  return {
    bandTop: Math.round(band.getBoundingClientRect().top),
    canvasOpacity: cs.opacity,
    canvasSize: c.width + 'x' + c.height,
    videoPaused: v ? v.paused : null,
    videoTime: v ? Number(v.currentTime.toFixed(2)) : null,
    luma: Math.round(sum / cells.length),
    hash: cells.reduce((a, b, i) => (a + b * (i + 7)) % 100000, 0),
  };
})()`;

/*
 * The band lives below the hero and arms itself on approach, so it has to be on
 * screen before any of this means anything. Lenis owns the scroll position, and it
 * listens for `wheel` — so wheel events are the way in from outside, the same as
 * anchor clicks are for the section shots.
 */
await sleep(5000);
for (let i = 0; i < 12; i++) {
  await call('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: 720,
    y: 450,
    deltaX: 0,
    deltaY: 120,
  });
  await sleep(120);
}
await sleep(1500);
console.log('band top after scroll:', await evaluate(`Math.round(document.querySelector('${BAND}').getBoundingClientRect().top)`));

/* Wait for the capture pass: the canvas only becomes the visible layer once the
   sprite sheet is usable, so its opacity is the readiness signal. */
let ready = null;
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  ready = await evaluate(SIGNATURE);
  if (ready && ready.canvasOpacity === '1') break;
}
console.log('after capture:', JSON.stringify(ready));

const STOPS = [80, 420, 720, 1020, 1360];
const rows = [];
for (const x of STOPS) {
  // The frame index is selected off a damped value, so the head arrives a beat
  // behind the cursor by design. Hold the position long enough for it to settle.
  for (let i = 0; i < 10; i++) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 545 });
    await sleep(90);
  }
  await sleep(1600);
  const s = await evaluate(SIGNATURE);
  rows.push({ x, ...s });
  console.log(`x=${String(x).padStart(4)}  luma=${s.luma}  hash=${s.hash}`);
}

const hashes = rows.map((r) => r.hash);
const distinct = new Set(hashes).size;
console.log('\ndistinct frames across 5 cursor stops:', distinct, 'of', rows.length);
console.log('leftmost vs rightmost differ:', hashes[0] !== hashes[hashes.length - 1]);

ws.close();
chrome.kill();
