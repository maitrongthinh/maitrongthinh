/**
 * Frame-time probe.
 *
 * `verify-render.mjs` answers "how fast does it load". This answers the other
 * complaint: "how smooth is it while you use it". Load metrics cannot see a
 * dropped frame, so the numbers that matter here are per-frame deltas sampled
 * inside the page while synthetic input drives the exact interactions the site
 * reacts to — cursor travel, cursor travel over the scrubbed video, wheel scroll.
 *
 * Runs headful but parked off-screen: `--headless=new` renders WebGL through
 * SwiftShader on most machines, and software-rasterised frame times say nothing
 * about the GPU path a visitor gets. The WebGL renderer string is printed so a
 * software fallback is never mistaken for a real measurement.
 *
 * Usage: node scripts/probe-perf.mjs [url] [--keep]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ARG = process.argv[2] ?? 'http://localhost:4173/';
const PORT = 9336;

const chromePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!chromePath) {
  console.error('No Chrome or Edge found.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  chromePath,
  [
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,900',
    // Off-screen instead of headless: real GPU, no window in the way.
    '--window-position=-32000,-32000',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=CalculateNativeWinOcclusion',
    '--autoplay-policy=no-user-gesture-required',
    '--user-data-dir=' + resolve('.tmp-verify/profile-perf'),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function debuggerUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const json = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch {
      /* Not up yet. */
    }
    await sleep(250);
  }
  throw new Error('Chrome debugging endpoint never came up');
}

const ws = new WebSocket(await debuggerUrl());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (!msg.id || !pending.has(msg.id)) return;
  const { resolve: done, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  if (msg.error) reject(new Error(msg.error.message));
  else done(msg.result);
});
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);

await call('Page.enable');
await call('Runtime.enable');

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text ?? String(exceptionDetails.exception?.description));
  return result.value;
};

await call('Page.navigate', { url: URL_ARG });
// Curtain, deferred WebGL mount and entry animations all have to be done, or the
// first phase measures the intro instead of the steady state.
await sleep(7000);

const gpu = await evaluate(`(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'no webgl';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'renderer hidden';
})()`);
console.log(`renderer: ${gpu}`);
console.log(`canvas mounted: ${await evaluate(`!!document.querySelector('canvas')`)}`);

// --- in-page sampler -------------------------------------------------------
await evaluate(`(() => {
  const s = { frames: [], long: [], running: false };
  window.__perf = s;
  s.start = () => {
    s.frames = [];
    s.long = [];
    s.running = true;
    let last = performance.now();
    const tick = (t) => {
      if (!s.running) return;
      s.frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  s.stop = () => { s.running = false; };
  s.report = () => {
    const f = s.frames.slice(1).sort((a, b) => a - b);
    const at = (q) => (f.length ? +f[Math.min(f.length - 1, Math.floor(q * f.length))].toFixed(2) : null);
    const total = f.reduce((a, b) => a + b, 0);
    return {
      samples: f.length,
      fps: total ? +((f.length / total) * 1000).toFixed(1) : null,
      p50: at(0.5), p90: at(0.9), p99: at(0.99),
      worst: f.length ? +f[f.length - 1].toFixed(2) : null,
      // A frame is "dropped" against a 60Hz budget once it takes over ~25ms.
      over25ms: f.filter((x) => x > 25).length,
      over50ms: f.filter((x) => x > 50).length,
      longTasks: s.long.length,
      longTaskMs: +s.long.reduce((a, b) => a + b, 0).toFixed(1),
    };
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (s.running) s.long.push(e.duration);
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* Not supported; longTasks stays 0. */ }
  return true;
})()`);

const mouse = (x, y) =>
  call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });

/** Sweeps the cursor across the viewport for `ms`, roughly one move per frame. */
async function sweep(ms) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    // Full-width travel: this is what winds the scrub accumulator, so it is also
    // what exposes any discontinuity in it.
    const phase = (i % 90) / 90;
    const x = 120 + Math.sin(phase * Math.PI * 2) * 560 + 560;
    const y = 380 + Math.cos(phase * Math.PI * 2) * 180;
    await mouse(Math.round(x), Math.round(y));
    i++;
    await sleep(16);
  }
}

async function wheelScroll(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await call('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 720,
      y: 450,
      deltaX: 0,
      deltaY: 120,
      button: 'none',
      buttons: 0,
    });
    await sleep(50);
  }
}

async function phase(name, ms, during) {
  await evaluate('window.__perf.start()');
  if (during) await during(ms);
  else await sleep(ms);
  await evaluate('window.__perf.stop()');
  const r = await evaluate('window.__perf.report()');
  console.log(
    `${name.padEnd(22)} fps=${String(r.fps).padStart(5)}  p50=${String(r.p50).padStart(6)}  ` +
      `p90=${String(r.p90).padStart(6)}  p99=${String(r.p99).padStart(7)}  worst=${String(r.worst).padStart(7)}  ` +
      `>25ms=${String(r.over25ms).padStart(3)}  >50ms=${String(r.over50ms).padStart(3)}  ` +
      `longTasks=${r.longTasks}/${r.longTaskMs}ms`,
  );
  return r;
}

console.log('\n--- frame times (ms per frame; lower and flatter is better) ---');
const out = {};
out.idleHero = await phase('idle @ hero', 3000);
out.cursorHero = await phase('cursor sweep @ hero', 3500, sweep);
out.wheel = await phase('wheel scroll', 3500, wheelScroll);

// Park on the scrubbed video band, where cursor travel drives video seeks.
const band = await evaluate(`(() => {
  const el = document.querySelector('section[aria-label="Motion study"]');
  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  return Math.round(scrollY);
})()`);
await sleep(2500);
console.log(`\nscrub band at scrollY=${band}`);
out.cursorBand = await phase('cursor sweep @ video', 3500, sweep);

const video = await evaluate(`(() => {
  const v = document.querySelector('video');
  if (!v) return 'no video element';
  return {
    src: !!v.src, readyState: v.readyState, paused: v.paused,
    currentTime: +v.currentTime.toFixed(3), duration: +(v.duration || 0).toFixed(3),
    playbackRate: v.playbackRate,
    buffered: v.buffered.length ? +v.buffered.end(v.buffered.length - 1).toFixed(2) : 0,
  };
})()`);
console.log(`video: ${JSON.stringify(video)}`);

const raf = await evaluate(`(() => {
  // How many independent RAF loops are running: each one is a separate callback
  // the compositor has to wait on before it can commit a frame.
  let n = 0;
  const orig = window.requestAnimationFrame;
  return new Promise((res) => {
    window.requestAnimationFrame = function (cb) { n++; return orig.call(window, cb); };
    orig.call(window, () => orig.call(window, () => {
      window.requestAnimationFrame = orig;
      res(n);
    }));
  });
})()`);
console.log(`independent rAF callbacks per frame: ~${raf}`);

console.log('\n' + JSON.stringify(out, null, 2));

ws.close();
if (!process.argv.includes('--keep')) chrome.kill();
process.exit(0);
