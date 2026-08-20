/**
 * Paired A/B first-paint sampler.
 *
 * `verify-render.mjs` launches a browser per run, so a single number from it
 * carries process startup, a cold profile and a cold HTTP connection pool inside
 * the measurement. Sampling it four times per variant produced a 1.8x spread —
 * wide enough that the two variants' ranges overlapped and nothing could be
 * concluded. This exists to remove that noise.
 *
 * Two builds are served on two ports and visited alternately inside ONE browser,
 * one round at a time: A, B, A, B. Everything except the HTML is therefore shared
 * between the two series — same process, same profile, same warm sockets, same
 * machine load at roughly the same instant. Pairing also means a slow patch of
 * machine time lands on both variants rather than whichever one happened to run
 * during it.
 *
 * The cache is cleared before every navigation: this measures a first visit,
 * which is the only visit where a resource hint can change anything.
 *
 * Usage: node scripts/ab-fcp.mjs <rounds> <labelA=url> <labelB=url> ...
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUNDS = Number(process.argv[2] ?? 6);
const VARIANTS = process.argv.slice(3).map((a) => {
  const i = a.indexOf('=');
  return { label: a.slice(0, i), url: a.slice(i + 1) };
});

if (VARIANTS.length < 2) {
  console.error('Need at least two variants: node scripts/ab-fcp.mjs 6 a=url b=url');
  process.exit(1);
}

const PORT = 9344;
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error('No Chrome or Edge found.');
  process.exit(1);
}

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
    '--user-data-dir=' + resolve('.tmp-verify/ab-profile'),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function debuggerUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const json = await res.json();
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
  if (msg.id && pending.has(msg.id)) {
    const { resolve: done, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else done(msg.result);
  }
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((res, rej) => {
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (method, params) => send(method, params, sessionId);

await call('Page.enable');
await call('Network.enable');

/*
 * A tab opened with `Target.createTarget` is not the foreground tab, and Chrome
 * throttles frame production for pages it believes are hidden. That does not stop
 * the page loading, so the network timeline stays honest while first paint drifts
 * by whole seconds — which is exactly the shape of the numbers this script was
 * written to explain. Both calls are needed: `bringToFront` makes the tab visible,
 * and focus emulation stops it being backgrounded again while the driver is not
 * interacting with it.
 */
await call('Page.bringToFront');
await call('Emulation.setFocusEmulationEnabled', { enabled: true });

await call('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

const samples = Object.fromEntries(VARIANTS.map((v) => [v.label, []]));

/** One cold navigation. Returns the paint and load marks the page reported. */
async function visit(url) {
  await call('Network.clearBrowserCache');
  // Park on a blank page first so the previous document's work cannot overlap
  // the next navigation's timeline.
  await call('Page.navigate', { url: 'about:blank' });
  await sleep(250);
  await call('Page.navigate', { url });
  await sleep(3500);

  const { result } = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const p = performance.getEntriesByType('paint');
      const fcp = p.find(e => e.name === 'first-contentful-paint');
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const img = performance.getEntriesByType('resource')
        .find(r => r.name.includes('hero-base'));
      const css = performance.getEntriesByType('resource')
        .find(r => r.name.endsWith('.css'));
      return {
        fcp: fcp ? Math.round(fcp.startTime) : null,
        dcl: Math.round(nav.domContentLoadedEventEnd || 0),
        // When each of the two racing resources actually finished, which is the
        // mechanism under test: does hinting the image delay the stylesheet?
        cssEnd: css ? Math.round(css.responseEnd) : null,
        imgEnd: img ? Math.round(img.responseEnd) : null,
      };
    })()`,
  });
  return result.value;
}

// Warm-up round, discarded: the first navigation in a fresh browser pays for DNS,
// socket setup and code caches that no later sample repeats.
for (const v of VARIANTS) await visit(v.url);

for (let r = 0; r < ROUNDS; r++) {
  for (const v of VARIANTS) {
    const s = await visit(v.url);
    samples[v.label].push(s);
    console.log(
      `round ${r + 1} ${v.label.padEnd(10)} fcp ${String(s.fcp).padStart(5)}  dcl ${String(s.dcl).padStart(5)}  css@${String(s.cssEnd).padStart(5)}  img@${String(s.imgEnd).padStart(5)}`,
    );
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

console.log('\n--- summary (ms) ---');
for (const v of VARIANTS) {
  const rows = samples[v.label];
  const fcps = rows.map((r) => r.fcp).filter((n) => n != null);
  const csss = rows.map((r) => r.cssEnd).filter((n) => n != null);
  console.log(
    `${v.label.padEnd(10)} fcp median ${median(fcps)}  min ${Math.min(...fcps)}  max ${Math.max(...fcps)}  | css median ${median(csss)}`,
  );
}

ws.close();
chrome.kill();
process.exit(0);
