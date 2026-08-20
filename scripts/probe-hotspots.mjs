/**
 * CPU-profile probe.
 *
 * `probe-perf.mjs` says *when* a frame was slow. This says *what* was running.
 *
 * It drives the same synthetic wheel scroll, but with `Profiler` sampling at 100µs
 * and `Page.startScreencast` off, then aggregates self-time per call frame. Output
 * is the hottest twenty functions with `file:line`, which is enough to name the
 * cause instead of guessing at it. `--phase=cursor` profiles the cursor sweep over
 * the video band instead.
 *
 * Usage: node scripts/probe-hotspots.mjs [url] [--phase=wheel|cursor|idle] [--keep]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ARG = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4173/';
const PHASE = (process.argv.find((a) => a.startsWith('--phase=')) ?? '--phase=wheel').slice(8);
const PORT = 9337;

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
    '--user-data-dir=' + resolve('.tmp-verify/profile-hotspots'),
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
await call('Profiler.enable');

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
    const x = 120 + Math.sin(phase * Math.PI * 2) * 560 + 560;
    const y = 380 + Math.cos(phase * Math.PI * 2) * 180;
    await call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(x),
      y: Math.round(y),
      button: 'none',
      buttons: 0,
    });
    i++;
    await sleep(16);
  }
}

if (PHASE === 'cursor') {
  await evaluate(`(() => {
    const el = document.querySelector('section[aria-label="Motion study"]');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    return true;
  })()`);
  await sleep(2500);
}

await call('Profiler.setSamplingInterval', { interval: 100 });
await call('Profiler.start');

if (PHASE === 'wheel') await wheelScroll(4000);
else if (PHASE === 'cursor') await sweep(4000);
else await sleep(4000);

const { profile } = await call('Profiler.stop');

/*
 * Self time per call frame.
 *
 * `profile.samples` is a flat list of node ids, `timeDeltas` the microseconds each
 * one covers. Attributing every delta to the node it landed in gives self time
 * directly — no tree walking, and no double counting parents.
 */
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i];
  const dt = profile.timeDeltas[i] ?? 0;
  if (dt > 0) self.set(id, (self.get(id) ?? 0) + dt);
}

const total = [...self.values()].reduce((a, b) => a + b, 0) / 1000;

const rows = [...self.entries()]
  .map(([id, us]) => {
    const n = byId.get(id);
    const f = n?.callFrame ?? {};
    const file = (f.url ?? '').replace(/^https?:\/\/[^/]+\//, '');
    return {
      ms: +(us / 1000).toFixed(1),
      name: f.functionName || '(anonymous)',
      at: file ? `${file}:${(f.lineNumber ?? 0) + 1}` : '(native)',
    };
  })
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 22);

console.log(`\nphase=${PHASE}  sampled main-thread JS: ${total.toFixed(0)}ms over 4000ms\n`);
for (const r of rows) {
  console.log(`${String(r.ms).padStart(7)}ms  ${r.name.slice(0, 38).padEnd(38)}  ${r.at}`);
}

ws.close();
if (!process.argv.includes('--keep')) chrome.kill();
process.exit(0);
