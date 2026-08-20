/**
 * Screenshots every section of the exported site and reports whether the fixed
 * overlays (player, cursor cue) cover any real content.
 *
 * `verify-render.mjs` answers "did it render, and how fast"; this answers "does it
 * look right". Rects are read in viewport coordinates after each scroll, because
 * the player is fixed to the viewport while the hero's own bottom row is not — the
 * two only collide once the section grows past `100dvh`, which no static read of
 * the markup will tell you.
 *
 * Usage: node scripts/probe-layout.mjs [url] [outDir]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const URL_ARG = process.argv[2] ?? 'http://localhost:4173/';
const OUT_DIR = resolve(process.argv[3] ?? '.tmp-verify/sections');
const PORT = 9334;

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
    '--user-data-dir=' + resolve('.tmp-verify/profile-layout'),
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
  if (!msg.id || !pending.has(msg.id)) return;
  const { resolve: done, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  if (msg.error) reject(new Error(msg.error.message));
  else done(msg.result);
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
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text ?? 'evaluate failed');
  return result.value;
};

await call('Page.navigate', { url: URL_ARG });
// Long enough for the preloader curtain, the deferred WebGL mount, and the
// entry animations to all be finished — anything shorter photographs a
// half-built page and reads as a layout bug.
await sleep(6000);

// --- overlap report -------------------------------------------------------
const overlap = await evaluate(`(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom),
             left: Math.round(r.left), right: Math.round(r.right) };
  };
  const hits = (a, b) => !!a && !!b
    && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  const player = rect('[data-player]') || rect('.fixed.bottom-0.left-0');
  const targets = {
    heroBio: '#hero p.anim-fade-up.max-w-\\\\[46ch\\\\]',
    figcaption: '#hero figcaption',
    seeWork: '#hero a[href="#work"]',
    scrollCue: '#hero .absolute.bottom-14',
  };
  const out = { viewport: { w: innerWidth, h: innerHeight }, player, collisions: {} };
  for (const [name, sel] of Object.entries(targets)) {
    const r = rect(sel);
    out.collisions[name] = r ? { rect: r, overlaps: hits(player, r) } : 'not found';
  }
  out.heroHeight = Math.round(document.querySelector('#hero').getBoundingClientRect().height);
  return out;
})()`);

console.log('--- fixed-overlay collisions (hero, top of page) ---');
console.log(JSON.stringify(overlap, null, 2));

// --- per-section screenshots ---------------------------------------------
const sections = await evaluate(
  `[...document.querySelectorAll('section[id]')].map((s) => s.id)`,
);

mkdirSync(OUT_DIR, { recursive: true });
console.log('\n--- sections ---');

for (const [i, id] of sections.entries()) {
  const info = await evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    el.scrollIntoView({ block: 'start', behavior: 'instant' });
    return { y: Math.round(scrollY), h: Math.round(el.getBoundingClientRect().height) };
  })()`);

  // Lenis smooths programmatic scrolls and ScrollTrigger reveals fire on entry.
  await sleep(1400);

  const text = await evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    return (el.innerText || '').replace(/\\s+/g, ' ').trim();
  })()`);

  const shot = await call('Page.captureScreenshot', { format: 'png' });
  const file = resolve(OUT_DIR, `${String(i).padStart(2, '0')}-${id}.png`);
  await writeFile(file, Buffer.from(shot.data, 'base64'));

  console.log(
    `${id.padEnd(8)} h=${String(info.h).padStart(5)}px  chars=${String(text.length).padStart(5)}  ${
      text.slice(0, 80) || '(EMPTY)'
    }`,
  );
}

// The footer is not a `section[id]`, and it carries the largest type on the page —
// worth its own frame.
await evaluate(`scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
await sleep(1600);
const footerShot = await call('Page.captureScreenshot', { format: 'png' });
await writeFile(resolve(OUT_DIR, '08-footer.png'), Buffer.from(footerShot.data, 'base64'));
console.log('footer   captured');

console.log(`\nscreenshots: ${OUT_DIR}`);

ws.close();
chrome.kill();
process.exit(0);
