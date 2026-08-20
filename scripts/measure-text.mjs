/**
 * One-off: measures how wide a string is in the site's display face, so the
 * footer wordmark can be sized from a real number instead of a guess.
 *
 * Usage: node scripts/measure-text.mjs [url] "STRING" [moreStrings...]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const URL_ARG = process.argv[2] ?? 'http://localhost:4173/';
const STRINGS = process.argv.slice(3);
const PORT = 9335;

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
    '--window-size=1440,900',
    '--no-first-run',
    '--user-data-dir=' + resolve('.tmp-verify/profile-text'),
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
await call('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await call('Page.navigate', { url: URL_ARG });
await sleep(5000);

const { result } = await call('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const probe = document.createElement('span');
    // Same cascade the footer uses, at a round size so the ratio is readable.
    probe.className = 'font-display';
    probe.style.cssText = 'position:fixed;left:-9999px;white-space:nowrap;font-size:100px';
    document.body.append(probe);
    const out = {};
    for (const s of ${JSON.stringify(STRINGS)}) {
      probe.textContent = s;
      out[s] = {
        emPerChar: +(probe.getBoundingClientRect().width / 100 / s.length).toFixed(3),
        // Widest font-size, in vw, that still fits inside 100vw minus 4vw of padding.
        fitsAtVw: +((96 * 100) / probe.getBoundingClientRect().width).toFixed(2),
      };
    }
    probe.remove();
    return out;
  })()`,
});

console.log(JSON.stringify(result.value, null, 2));

ws.close();
chrome.kill();
process.exit(0);
