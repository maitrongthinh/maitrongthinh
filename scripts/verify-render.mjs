/**
 * Drives a real Chrome over the DevTools protocol against the exported site and
 * reports what actually happens on a cold visit: paint timings, every request the
 * page made, console errors, and a screenshot once the curtain has lifted.
 *
 * No dependencies — Chrome ships with the machine and Node 22 has a global
 * WebSocket, so the whole driver is this file. `--virtual-time-budget` was tried
 * first and is useless here: it stalls partway through the GSAP preloader
 * timeline, so timings are taken in real time against a real clock instead.
 *
 * Usage: node scripts/verify-render.mjs [url] [waitMs] [outPng]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const URL_ARG = process.argv[2] ?? 'http://localhost:4173/';
const WAIT_MS = Number(process.argv[3] ?? 5000);
const OUT_PNG = resolve(process.argv[4] ?? '.tmp-verify/render.png');
const PORT = 9333;

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
    '--user-data-dir=' + resolve('.tmp-verify/profile'),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

/** Poll the debugging endpoint until Chrome is actually listening. */
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
const events = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve: done, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.method ?? 'cdp'}: ${msg.error.message}`));
    else done(msg.result);
    return;
  }
  if (msg.method) events.push(msg);
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((res, rej) => {
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

// Attach to a fresh tab so the session is not sharing state with about:blank.
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (method, params) => send(method, params, sessionId);

await call('Page.enable');
await call('Network.enable');
await call('Runtime.enable');
await call('Log.enable');
await call('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

const started = Date.now();
await call('Page.navigate', { url: URL_ARG });
await sleep(WAIT_MS);

const metrics = await call('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const paints = {};
    for (const e of performance.getEntriesByType('paint')) paints[e.name] = Math.round(e.startTime);
    const nav = performance.getEntriesByType('navigation')[0] || {};
    return {
      paints,
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      load: Math.round(nav.loadEventEnd || 0),
      // Proof the deferred layers really did arrive rather than silently failing.
      canvas: !!document.querySelector('canvas'),
      curtainGone: !document.querySelector('[data-curtain-panel]')
        || [...document.querySelectorAll('[data-curtain-panel]')]
             .every(el => el.getBoundingClientRect().height < 2),
      video: (() => {
        const v = document.querySelector('video');
        return v ? { src: !!v.currentSrc, preload: v.preload, readyState: v.readyState } : null;
      })(),
      audio: (() => {
        const a = document.querySelector('audio');
        return a ? { src: (a.currentSrc || '').split('/').pop(), readyState: a.readyState } : null;
      })(),
      sections: [...document.querySelectorAll('section[id]')].map(s => s.id),
      projectRows: document.querySelectorAll('#work a[href*="github.com"]').length,
      textVisible: (document.body.innerText || '').replace(/\\s+/g, ' ').trim().length,
    };
  })()`,
});

console.log('--- timings (ms from navigation start) ---');
console.log(JSON.stringify(metrics.result.value, null, 2));
console.log(`wall clock waited: ${Date.now() - started}ms`);

const requests = events
  .filter((e) => e.method === 'Network.requestWillBeSent')
  .map((e) => e.params.request.url);

const heavy = requests.filter((u) => /\.(mp4|mp3|webm)$/.test(u));
const webglChunk = requests.filter((u) => u.includes('3uega') || /chunks\/.*\.js$/.test(u)).length;

console.log('\n--- network ---');
console.log('requests:', requests.length, '| js chunks:', webglChunk);
console.log('media fetched:', heavy.length ? heavy.map((u) => u.split('/').pop()).join(', ') : 'none');

// Names the URL behind every non-2xx, which the bare error text does not.
const bad = events
  .filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
  .map((e) => `${e.params.response.status} ${e.params.response.url}`);
if (bad.length) console.log('non-2xx:\n  ' + [...new Set(bad)].join('\n  '));

/*
 * `Network.loadingFailed` carries a requestId and an errorText, and nothing else.
 * On its own it produces a bare `net::ERR_ABORTED` with no way to tell a real
 * broken asset from a media element that was deliberately never armed, so the
 * request URLs are indexed on the way past and joined back on here.
 */
const urlById = new Map(
  events
    .filter((e) => e.method === 'Network.requestWillBeSent')
    .map((e) => [e.params.requestId, e.params.request.url]),
);

const failures = events
  .filter((e) => e.method === 'Network.loadingFailed')
  .map((e) => {
    const url = urlById.get(e.params.requestId);
    return `${e.params.errorText} ${url ? url.replace(/^https?:\/\/[^/]+/, '') : '(unknown url)'}`;
  });
const logs = events
  .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  .map((e) => e.params.entry.text);
const consoleErrors = events
  .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  .map((e) => e.params.args.map((a) => a.value ?? a.description).join(' '));

console.log('\n--- errors ---');
const allErrors = [...new Set([...failures, ...logs, ...consoleErrors])];
console.log(allErrors.length ? allErrors.join('\n') : 'none');

const shot = await call('Page.captureScreenshot', { format: 'png' });
mkdirSync(dirname(OUT_PNG), { recursive: true });
await writeFile(OUT_PNG, Buffer.from(shot.data, 'base64'));
console.log(`\nscreenshot: ${OUT_PNG}`);

ws.close();
chrome.kill();
process.exit(0);
