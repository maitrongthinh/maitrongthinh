/**
 * Allocation probe.
 *
 * The timeline trace named the wheel-scroll hitch: `MajorGC` 164.7ms,
 * `V8.GC_MARK_COMPACTOR` 164.6ms, twice inside a four-second window. A
 * mark-compact pause that long means something in the frame loop allocates hard
 * enough to fill a generation during a scroll — and a pause is not fixable, only
 * the garbage that causes it is.
 *
 * `HeapProfiler.startSampling` records a call frame for a sampled fraction of
 * allocations, so aggregating `selfSize` per frame names the allocating line
 * directly.
 *
 * Usage: node scripts/probe-alloc.mjs [url] [--phase=wheel|cursor|idle] [--keep]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ARG = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4173/';
const PHASE = (process.argv.find((a) => a.startsWith('--phase=')) ?? '--phase=wheel').slice(8);
const PORT = 9340;

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
    '--user-data-dir=' + resolve('.tmp-verify/profile-alloc'),
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
await call('HeapProfiler.enable');

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

if (PHASE === 'cursor') {
  await evaluate(`(() => {
    const el = document.querySelector('section[aria-label="Motion study"]');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    return true;
  })()`);
  await sleep(2500);
}

// 4096 bytes between samples: fine enough that a per-frame allocation of a few
// hundred bytes still lands in the profile over four seconds, coarse enough not to
// distort the timings being measured.
await call('HeapProfiler.startSampling', { samplingInterval: 4096 });

if (PHASE === 'wheel') await wheelScroll(4000);
else if (PHASE === 'cursor') await sweep(4000);
else await sleep(4000);

const { profile } = await call('HeapProfiler.stopSampling');

/*
 * The sampling profile is a tree of call frames with `selfSize` on each node.
 * Flattening it and summing per frame gives allocation attributed to the line that
 * actually allocated, rather than to whichever ancestor happens to be on top.
 */
const bySite = new Map();
let total = 0;

const walk = (node) => {
  if (node.selfSize > 0) {
    const f = node.callFrame ?? {};
    const file = (f.url ?? '').replace(/^https?:\/\/[^/]+\//, '');
    const key = `${f.functionName || '(anonymous)'}|${file ? `${file}:${(f.lineNumber ?? 0) + 1}` : '(native)'}`;
    bySite.set(key, (bySite.get(key) ?? 0) + node.selfSize);
    total += node.selfSize;
  }
  for (const child of node.children ?? []) walk(child);
};
walk(profile.head);

const rows = [...bySite.entries()]
  .map(([key, bytes]) => {
    const [name, at] = key.split('|');
    return { kb: +(bytes / 1024).toFixed(1), name, at };
  })
  .sort((a, b) => b.kb - a.kb)
  .slice(0, 24);

console.log(`\nphase=${PHASE}  sampled allocation over 4000ms: ${(total / 1024 / 1024).toFixed(2)}MB\n`);
for (const r of rows) {
  console.log(`${String(r.kb).padStart(9)}KB  ${r.name.slice(0, 34).padEnd(34)}  ${r.at}`);
}

ws.close();
if (!process.argv.includes('--keep')) chrome.kill();
process.exit(0);

