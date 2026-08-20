/**
 * Screenshots every section of the exported site, one PNG each, plus the hero
 * with the cursor parked inside the figure plate.
 *
 * Why not just scroll: Lenis owns the scroll position and writes it every frame
 * from its own animated value, so a `window.scrollTo` is snapped back on the
 * next tick. `SmoothScroll` does intercept clicks on `a[href^="#"]` and hands
 * them to `lenis.scrollTo`, so the only reliable way to move this page from the
 * outside is to click an anchor — injected on the fly for the sections that have
 * no nav entry.
 *
 * Scrolling for real also matters for correctness: the entry animations are
 * `gsap.from(..., { once: true })`, so a section captured with
 * `captureBeyondViewport` instead would be photographed at opacity 0.
 *
 * Usage: node scripts/shoot-sections.mjs [url] [outDir]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const URL_ARG = process.argv[2] ?? 'http://localhost:4173/';
const OUT_DIR = resolve(process.argv[3] ?? '.tmp-verify/sections');
const PORT = 9337;

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
    '--user-data-dir=' + resolve('.tmp-verify/shoot-profile'),
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
      /* not up yet */
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
    if (msg.error) reject(new Error(msg.error.message));
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

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (method, params) => send(method, params, sessionId);

await call('Page.enable');
await call('Runtime.enable');
await call('Log.enable');
await call('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
// A created tab is a background tab, and Chrome throttles frame production in
// one. Without both of these the scroll animation runs at a crawl and sections
// are photographed mid-flight.
await call('Page.bringToFront');
await call('Emulation.setFocusEmulationEnabled', { enabled: true });

/*
 * Headless Chrome answers `prefers-reduced-motion: reduce`, and this app honours
 * it everywhere: the spotlight parks at plate centre, ScrubVideo stops mapping
 * the cursor into the clip, and the GSAP entry tweens are skipped. Shots taken
 * without this line are of the accessibility fallback, not of the site — which is
 * how a reveal that works read as "parked in the middle" for a whole session.
 *
 * Pass `--reduce` to photograph the fallback on purpose.
 */
await call('Emulation.setEmulatedMedia', {
  features: [
    {
      name: 'prefers-reduced-motion',
      value: process.argv.includes('--reduce') ? 'reduce' : 'no-preference',
    },
  ],
});

mkdirSync(OUT_DIR, { recursive: true });

const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { returnByValue: true, expression, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

const shoot = async (name) => {
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(OUT_DIR, `${name}.png`), Buffer.from(shot.data, 'base64'));
  console.log('  shot', `${name}.png`);
};

await call('Page.navigate', { url: URL_ARG });
await sleep(6000);

/* --- hero, with the pointer parked inside the figure plate --------------- */
const plate = await evaluate(`(() => {
  const el = document.querySelector('[data-hero-plate]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width * 0.62), y: Math.round(r.y + r.height / 2),
           w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.y) };
})()`);
console.log('hero plate:', JSON.stringify(plate));

if (plate) {
  // Two moves: the pointer store eases toward the target, and a single event
  // leaves the spotlight halfway there.
  for (const i of [0, 1, 2]) {
    await call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: plate.x - (2 - i) * 4,
      y: plate.y,
    });
    await sleep(260);
  }
  await sleep(900);
}
await shoot('00-hero');

/* --- geometry checks the eye can miss in a screenshot -------------------- */
const geometry = await evaluate(`(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             bottom: Math.round(r.bottom), right: Math.round(r.right) };
  };
  const plate = box('[data-hero-plate]');
  const cta = [...document.querySelectorAll('a')]
    .find((a) => /see the work/i.test(a.textContent || ''));
  const ctaBox = cta ? (() => { const r = cta.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             bottom: Math.round(r.bottom), right: Math.round(r.right) }; })() : null;
  const overlap = plate && ctaBox
    ? !(ctaBox.right < plate.x || ctaBox.x > plate.x + plate.w ||
        ctaBox.bottom < plate.y || ctaBox.y > plate.y + plate.h)
    : null;
  const host = document.querySelector('[data-hero-plate] > div');
  const masked = [...document.querySelectorAll('[data-hero-plate] div')]
    .find((el) => {
      const cs = getComputedStyle(el);
      return (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none';
    });
  const ring = [...document.querySelectorAll('[data-hero-plate] div')]
    .find((el) => getComputedStyle(el).mixBlendMode === 'difference');
  return {
    plate, cta: ctaBox, ctaOverlapsPlate: overlap,
    revealRadius: host ? getComputedStyle(host).getPropertyValue('--r').trim() : null,
    maskPresent: !!masked,
    ringBox: ring ? (() => { const r = ring.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; })() : null,
    heroCaptionBottom: box('figcaption') ? box('figcaption').bottom : null,
    viewportH: window.innerHeight,
  };
})()`);
console.log('geometry:', JSON.stringify(geometry, null, 2));

/* --- every section, in order -------------------------------------------- */
const ids = await evaluate(
  `[...document.querySelectorAll('section[id]')].map((s) => s.id)`,
);
console.log('sections:', ids.join(', '));

let n = 1;
for (const id of ids) {
  await evaluate(`(() => {
    const a = document.createElement('a');
    a.href = '#${id}';
    a.setAttribute('data-shoot-anchor', '');
    document.body.appendChild(a);
    a.click();
    a.remove();
  })()`);
  await sleep(2200);
  await shoot(`${String(n).padStart(2, '0')}-${id}`);
  n += 1;
}

/* --- contrast proof for the inverted slabs ------------------------------ */
const contrast = await evaluate(`(() => {
  const read = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const label = el.querySelector('.label');
    const dim = el.querySelector('.text-ink-dim') || label;
    return {
      background: cs.backgroundColor,
      color: cs.color,
      label: label ? getComputedStyle(label).color : null,
      dim: dim ? getComputedStyle(dim).color : null,
      rule: getComputedStyle(el).getPropertyValue('--color-rule').trim(),
    };
  };
  return { path: read('#path'), notes: read('#notes'), about: read('#about'), work: read('#work') };
})()`);
console.log('\ncontrast:', JSON.stringify(contrast, null, 2));

const logs = events
  .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  .map((e) => e.params.entry.text);
const consoleErrors = events
  .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  .map((e) => e.params.args.map((a) => a.value ?? a.description).join(' '));
const all = [...new Set([...logs, ...consoleErrors])];
console.log('\nerrors:', all.length ? all.join('\n') : 'none');
console.log('out:', OUT_DIR);

ws.close();
chrome.kill();
