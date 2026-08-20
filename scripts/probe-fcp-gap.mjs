/**
 * What sits between the stylesheet landing and the first pixel.
 *
 * The paired A/B run put first paint at a floor of ~830ms even in rounds where the
 * render-blocking CSS finished at 92ms. That ~700ms is not network, so it is worth
 * naming before spending any more effort on transfer size: shaving kilobytes off a
 * payload that has already arrived buys nothing.
 *
 * Reports every render-blocking or text-critical resource against both paint marks
 * on one cold load, in the foreground, so the gap can be attributed rather than
 * guessed at.
 *
 * Usage: node scripts/probe-fcp-gap.mjs [url]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ARG = process.argv[2] ?? 'http://localhost:4181/';
const PORT = 9355;

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
    '--headless=new',
    '--no-sandbox',
    '--hide-scrollbars',
    '--window-size=1440,900',
    '--no-first-run',
    '--user-data-dir=' + resolve('.tmp-verify/gap-profile'),
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
await call('Page.bringToFront');
await call('Emulation.setFocusEmulationEnabled', { enabled: true });
await call('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

await call('Network.clearBrowserCache');
await call('Page.navigate', { url: URL_ARG });
await sleep(4000);

const { result } = await call('Runtime.evaluate', {
  returnByValue: true,
  awaitPromise: true,
  expression: `(async () => {
    const paints = {};
    for (const e of performance.getEntriesByType('paint')) paints[e.name] = Math.round(e.startTime);

    const res = performance.getEntriesByType('resource').map(r => ({
      name: r.name.split('/').pop().slice(0, 42),
      kind: r.initiatorType,
      start: Math.round(r.startTime),
      end: Math.round(r.responseEnd),
      kb: Math.round((r.encodedBodySize || 0) / 1024),
    }));

    const nav = performance.getEntriesByType('navigation')[0] || {};
    return {
      paints,
      html: {
        responseStart: Math.round(nav.responseStart || 0),
        responseEnd: Math.round(nav.responseEnd || 0),
        domInteractive: Math.round(nav.domInteractive || 0),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      },
      // Fonts are the usual suspect for a gap after CSS: with display:swap Chrome
      // still withholds text for a short block period.
      fontsReady: Math.round((await document.fonts.ready, performance.now())),
      fontCount: document.fonts.size,
      css: res.filter(r => r.name.endsWith('.css')),
      fonts: res.filter(r => /\\.woff2?$/.test(r.name)),
      scriptsBeforeFcp: res
        .filter(r => r.kind === 'script' && r.end <= (paints['first-contentful-paint'] ?? 0))
        .map(r => r.name + '@' + r.end),
      longTasks: performance.getEntriesByType('longtask')
        .map(t => Math.round(t.startTime) + '+' + Math.round(t.duration)),
    };
  })()`,
});

const v = result.value;
console.log('paints          ', JSON.stringify(v.paints));
console.log('html            ', JSON.stringify(v.html));
console.log('fonts.ready at  ', v.fontsReady, `(${v.fontCount} faces)`);
console.log('\ncss');
for (const r of v.css) console.log(`  ${r.start}-${r.end}ms  ${r.kb}KB  ${r.name}`);
console.log('\nfonts');
for (const r of v.fonts) console.log(`  ${r.start}-${r.end}ms  ${r.kb}KB  ${r.name}`);
console.log('\nscripts finished before FCP:', v.scriptsBeforeFcp.length || 'none');
for (const s of v.scriptsBeforeFcp) console.log('  ' + s);
console.log('long tasks:', v.longTasks.length ? v.longTasks.join(' ') : 'none');

ws.close();
chrome.kill();
process.exit(0);
