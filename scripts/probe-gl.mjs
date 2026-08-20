/**
 * WebGL call-counter probe.
 *
 * The frame-time probe found a 200ms hitch during wheel scroll that the CPU
 * profiler could not account for — main-thread JS was idle 93% of the window. That
 * shape means the cost is on the driver side of a WebGL call, and the usual
 * suspects are program linking (shader compile) and render-target reallocation.
 *
 * So count them. Hooks are installed before any page script runs, tallying
 * `linkProgram`, `compileShader`, `texImage2D`, `renderbufferStorage` and canvas
 * resizes, then the tally is read per interaction phase.
 *
 * Usage: node scripts/probe-gl.mjs [url] [--keep]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ARG = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4173/';
const PORT = 9338;

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
    '--window-position=-32000,-32000',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=CalculateNativeWinOcclusion',
    '--autoplay-policy=no-user-gesture-required',
    '--user-data-dir=' + resolve('.tmp-verify/profile-gl'),
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

const HOOK = `(() => {
  const counts = {};
  const slow = [];
  window.__gl = { counts, slow, canvas: [] };

  const bump = (k, ms) => {
    const c = counts[k] || (counts[k] = { n: 0, ms: 0 });
    c.n++;
    c.ms += ms;
  };

  // linkProgram is where the driver actually compiles; the rest are the calls that
  // reallocate GPU memory when a render target changes size.
  const watched = ['linkProgram', 'compileShader', 'texImage2D', 'renderbufferStorage', 'texStorage2D'];

  for (const proto of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!proto) continue;
    for (const name of watched) {
      const orig = proto.prototype[name];
      if (!orig) continue;
      proto.prototype[name] = function (...args) {
        const t0 = performance.now();
        const r = orig.apply(this, args);
        const dt = performance.now() - t0;
        bump(name, dt);
        if (dt > 8) slow.push({ call: name, ms: +dt.toFixed(1) });
        return r;
      };
    }
  }

  // Canvas backing-store changes: every one of these reallocates the drawing buffer
  // and, in a postprocessing chain, every intermediate target with it.
  const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  for (const dim of ['width', 'height']) {
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, dim);
    Object.defineProperty(HTMLCanvasElement.prototype, dim, {
      configurable: true,
      get: d.get,
      set(v) {
        if (this.getContext && v !== d.get.call(this)) {
          window.__gl.canvas.push({ dim, from: d.get.call(this), to: v, t: Math.round(performance.now()) });
        }
        return d.set.call(this, v);
      },
    });
  }
  void desc;

  window.__gl.reset = () => {
    for (const k of Object.keys(counts)) delete counts[k];
    slow.length = 0;
    window.__gl.canvas.length = 0;
  };
  window.__gl.read = () => JSON.parse(JSON.stringify({ counts, slow, canvas: window.__gl.canvas }));
})()`;

await call('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

await call('Page.navigate', { url: URL_ARG });
await sleep(7000);

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

async function sweep(ms) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    const phase = (i % 90) / 90;
    await call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(120 + Math.sin(phase * Math.PI * 2) * 560 + 560),
      y: Math.round(380 + Math.cos(phase * Math.PI * 2) * 180),
      button: 'none',
      buttons: 0,
    });
    i++;
    await sleep(16);
  }
}

async function phase(name, ms, during) {
  await evaluate('window.__gl.reset()');
  if (during) await during(ms);
  else await sleep(ms);
  const r = await evaluate('window.__gl.read()');
  const calls = Object.entries(r.counts)
    .map(([k, v]) => `${k} x${v.n} (${v.ms.toFixed(1)}ms)`)
    .join('  ');
  console.log(`\n${name}`);
  console.log(`  calls:  ${calls || 'none'}`);
  console.log(`  >8ms:   ${r.slow.length ? JSON.stringify(r.slow) : 'none'}`);
  console.log(`  canvas: ${r.canvas.length ? JSON.stringify(r.canvas) : 'no resize'}`);
}

console.log(`\n--- WebGL calls per interaction phase (${URL_ARG}) ---`);

// Sanity check: startup must show program links, or the hook never attached and
// every "none" below would be a false negative.
const boot = await evaluate('window.__gl ? window.__gl.read() : null');
console.log(
  `\nsince load: ${
    boot
      ? Object.entries(boot.counts)
          .map(([k, v]) => `${k} x${v.n} (${v.ms.toFixed(1)}ms)`)
          .join('  ') || 'none — hook attached but nothing counted'
      : 'HOOK NOT ATTACHED'
  }`,
);
if (boot?.slow?.length) console.log(`  >8ms at load: ${JSON.stringify(boot.slow)}`);

await phase('idle @ hero', 3000);
await phase('wheel scroll', 4000, wheelScroll);
await phase('cursor sweep', 3500, sweep);

ws.close();
if (!process.argv.includes('--keep')) chrome.kill();
process.exit(0);
