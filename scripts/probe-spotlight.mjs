/**
 * One-shot probe: park the pointer at a known viewport coordinate inside the hero
 * plate and report what the reveal spotlight thinks the position is.
 *
 * Answers a specific question the screenshots raised — the scribed ring landed
 * 165px left of the dispatched cursor position — by printing the raw pointer
 * store, the eased value the mask reads, and the cached plate offset that turns
 * one into the other.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ARG = process.argv[2] ?? 'http://localhost:4173/';
const PORT = 9341;

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
    '--user-data-dir=' + resolve('.tmp-verify/probe-profile'),
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

// Headless Chrome answers `prefers-reduced-motion: reduce` unless told otherwise,
// which sends every motion path in the app down its reduced branch. Pass `--reduce`
// to see that behaviour deliberately; the default emulates a normal desktop.
const REDUCED = process.argv.includes('--reduce');
await call('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: REDUCED ? 'reduce' : 'no-preference' }],
});

await call('Page.navigate', { url: URL_ARG });
await sleep(6000);

const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { returnByValue: true, expression, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

// Listen for the raw event the store reads, so a dropped or coalesced dispatch is
// distinguishable from an easing that never converges.
await evaluate(`(() => {
  window.__seen = [];
  addEventListener('pointermove', (e) => window.__seen.push([e.clientX, e.clientY]), true);
  addEventListener('mousemove', (e) => window.__seen.push(['m', e.clientX, e.clientY]), true);
})()`);

const TARGET = { x: 900, y: 545 };
for (let i = 0; i < 6; i++) {
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: TARGET.x, y: TARGET.y });
  await sleep(200);
}
await sleep(1200);

const state = await evaluate(`(() => {
  const plate = document.querySelector('[data-hero-plate]');
  const host = plate && plate.firstElementChild;
  const r = plate.getBoundingClientRect();
  const cs = host ? getComputedStyle(host) : null;
  const h1 = document.querySelector('#hero h1');
  const chars = h1 ? [...h1.querySelectorAll('[data-char]')] : [];
  const box = h1 && h1.getBoundingClientRect();
  return {
    dispatched: ${JSON.stringify(TARGET)},
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    eventsSeen: window.__seen.length,
    lastEvent: window.__seen[window.__seen.length - 1] || null,
    plateLeft: Math.round(r.left),
    plateTop: Math.round(r.top),
    mx: cs && cs.getPropertyValue('--mx').trim(),
    my: cs && cs.getPropertyValue('--my').trim(),
    r: cs && cs.getPropertyValue('--r').trim(),
    headline: {
      text: h1 && h1.textContent,
      box: box && { y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
      charCount: chars.length,
      // The per-char spans are clipped by an \`overflow-hidden\` parent, so a
      // transform left at 118% is a character parked outside its own window.
      firstCharTransform: chars[0] ? getComputedStyle(chars[0]).transform : null,
      firstCharInline: chars[0] ? chars[0].getAttribute('style') : null,
      opacity: h1 && getComputedStyle(h1).opacity,
    },
  };
})()`);

console.log(JSON.stringify(state, null, 2));

ws.close();
chrome.kill();
