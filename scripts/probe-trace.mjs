/**
 * Timeline-trace probe.
 *
 * The CPU profiler said the main thread was idle 93% of a wheel-scroll window that
 * still contained a 200ms frame, and the WebGL counter cleared shader compiles and
 * render-target churn. Neither of those tools can see Blink's own work — style
 * recalculation, layout, paint, raster — which is where the remaining cost has to
 * be.
 *
 * So take a `devtools.timeline` trace and print the longest events by name and
 * duration, plus a total per category. That names the phase instead of guessing.
 *
 * Usage: node scripts/probe-trace.mjs [url] [--phase=wheel|cursor] [--keep]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ARG = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4173/';
const PHASE = (process.argv.find((a) => a.startsWith('--phase=')) ?? '--phase=wheel').slice(8);
const PORT = 9339;

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
    '--user-data-dir=' + resolve('.tmp-verify/profile-trace'),
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
const events = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);

  // Tracing streams its payload as unsolicited events, so this listener has to
  // handle both replies and notifications rather than only matching ids.
  if (msg.method === 'Tracing.dataCollected') {
    for (const e of msg.params.value) events.push(e);
    return;
  }
  if (msg.method === 'Tracing.tracingComplete') {
    tracingDone?.();
    return;
  }
  if (!msg.id || !pending.has(msg.id)) return;
  const { resolve: done, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  if (msg.error) reject(new Error(msg.error.message));
  else done(msg.result);
});

let tracingDone;

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

/*
 * Scoped to the page session, not the browser.
 *
 * A browser-wide `Tracing.start` also records the browser process's own message
 * loop, whose `RunTask` entries run for seconds at a time and swamp every real
 * renderer event in the sort. Session-scoped tracing keeps the renderer only.
 *
 * `disabled-by-default-devtools.timeline.frame` is what carries the per-frame
 * boundaries; without it the trace has events but nothing to group them under.
 */
await call('Tracing.start', {
  transferMode: 'ReportEvents',
  traceConfig: {
    includedCategories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'blink.user_timing',
      'latencyInfo',
    ],
  },
});


if (PHASE === 'wheel') await wheelScroll(4000);
else if (PHASE === 'cursor') await sweep(4000);
else await sleep(4000);

const complete = new Promise((r) => {
  tracingDone = r;
});
await call('Tracing.end');
await complete;

/*
 * Complete events (`ph: 'X'`) already carry their own duration in `dur`
 * microseconds, which is every Blink phase worth naming here. Begin/end pairs
 * would need matching up; nothing in this category set that matters is split that
 * way, so they are skipped rather than half-counted.
 *
 * Restricted to `CrRendererMain`. A trace carries every thread in the process, and
 * the compositor and raster threads emit their own `RunTask` entries — nesting
 * those inside a main-thread task by timestamp alone produces a breakdown where a
 * task appears to contain itself. The thread name arrives as metadata (`ph: 'M'`),
 * so the tid has to be resolved from that before filtering.
 */
const mainTid = events.find(
  (e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain',
)?.tid;

const done = events.filter(
  (e) => e.ph === 'X' && typeof e.dur === 'number' && (mainTid === undefined || e.tid === mainTid),
);


// Relative to the first event, so a long entry can be told apart from a load-time
// leftover by *when* it happened, not just how long it took.
const t0 = Math.min(...done.map((e) => e.ts));

const byName = new Map();
for (const e of done) {
  const r = byName.get(e.name) ?? { n: 0, ms: 0, max: 0 };
  r.n++;
  r.ms += e.dur / 1000;
  r.max = Math.max(r.max, e.dur / 1000);
  byName.set(e.name, r);
}

console.log(`\n--- devtools.timeline, phase=${PHASE}, ${done.length} complete events on CrRendererMain ---`);

console.log('\ntotal time per event name (top 22):');
const totals = [...byName.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 22);
for (const [name, r] of totals) {
  console.log(
    `${r.ms.toFixed(1).padStart(9)}ms  x${String(r.n).padEnd(6)} max ${r.max.toFixed(1).padStart(7)}ms  ${name}`,
  );
}

console.log('\nsingle longest events (top 20):');
const longest = [...done].sort((a, b) => b.dur - a.dur).slice(0, 20);
for (const e of longest) {
  const at = ((e.ts - t0) / 1000).toFixed(0);
  console.log(`${(e.dur / 1000).toFixed(1).padStart(9)}ms  t=${at.padStart(5)}ms  ${e.name}`);
}

/*
 * `RunTask` is only the wrapper the scheduler puts around a unit of work, so a
 * 118ms one names nothing by itself. Everything inside it does. Printing the
 * children of the worst few tasks is the difference between "a long task happened"
 * and knowing which phase spent the time.
 */
const worst = longest.filter((e) => e.name === 'RunTask').slice(0, 3);
for (const task of worst) {
  const from = task.ts;
  const to = task.ts + task.dur;
  const inside = done
    .filter((e) => e !== task && e.ts >= from && e.ts < to && e.dur > 200)
    .sort((a, b) => a.ts - b.ts);

  console.log(
    `\ninside the ${(task.dur / 1000).toFixed(1)}ms task at t=${((from - t0) / 1000).toFixed(0)}ms  (${inside.length} children over 0.2ms):`,
  );
  for (const e of inside.slice(0, 26)) {
    const off = ((e.ts - from) / 1000).toFixed(1);
    const detail = e.args?.data?.functionName ?? e.args?.data?.type ?? e.args?.data?.url ?? '';
    console.log(
      `  +${off.padStart(6)}ms  ${(e.dur / 1000).toFixed(1).padStart(7)}ms  ${e.name.padEnd(30)} ${String(detail).slice(0, 46)}`,
    );
  }
}



/*
 * Paint carries the clip rectangle it covered. A twenty-millisecond paint is either
 * a huge area or an expensive one, and the rectangle is what tells the two apart —
 * a full-viewport clip points at a fixed overlay, a small one at a single element
 * doing something costly.
 */
const paints = done
  .filter((e) => e.name === 'Paint')
  .sort((a, b) => b.dur - a.dur)
  .slice(0, 8);
if (paints.length) {
  console.log('\nlongest Paint events, with clip:');
  for (const e of paints) {
    const c = e.args?.data?.clip;
    const box = Array.isArray(c) ? `${Math.round(c[2] - c[0])}x${Math.round(c[5] - c[1])} at ${Math.round(c[0])},${Math.round(c[1])}` : 'no clip';
    console.log(
      `${(e.dur / 1000).toFixed(1).padStart(8)}ms  t=${((e.ts - t0) / 1000).toFixed(0).padStart(5)}ms  ${box}  layer=${e.args?.data?.layerId ?? '?'}`,
    );
  }
}

ws.close();

if (!process.argv.includes('--keep')) chrome.kill();
process.exit(0);

