/**
 * Bakes `assets/hero.mp4` into a sprite sheet, offline.
 *
 * The head-track band shows one frame of a left-to-right head pan per cursor
 * position. `scripts/probe-mp4.mjs` reports why that can't be done by seeking the
 * file directly: 3840x2160, 97 frames, a SINGLE keyframe, so every `currentTime`
 * write decodes from frame 0 and a mouse scrub becomes a slideshow.
 *
 * The site used to work around that by playing the clip once in the visitor's
 * browser and copying presented frames into a sprite sheet. Correct, but it cost
 * up to 12s of on-screen autoplay before the head tracked anything, hard-depended
 * on autoplay being allowed, and pulled 3.7MB of video onto a section that starts
 * below the fold. This runs that exact capture ONCE, here, and commits the result:
 * the client then loads a few hundred KB of webp and tracks from the first frame.
 *
 * Re-run whenever the source video changes:
 *   node scripts/bake-sprites.mjs
 *
 * Author-time only — needs a local Chrome/Edge and is never part of `next build`.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';

/** Frames kept across the pan. 30 over a 1440px viewport is one per ~48px of travel. */
const FRAMES = 30;
/** Sprite-sheet columns. 6 x 5 tiles at 640 wide stays well inside texture limits. */
const COLS = 6;
/** Tile width. Source is 4K; the band is grayscale, dark, under grain — 640 reads clean. */
const CAPTURE_WIDTH = 640;

const VIDEO = 'assets/hero.mp4';
const OUT = 'public/images/hero-sprites.webp';
const HTTP_PORT = 9355;
const DBG_PORT = 9356;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = Math.ceil(FRAMES / COLS);

/*
 * The capture page. Same-origin http (not file://) so `drawImage(video)` does not
 * taint the canvas and `toDataURL` is allowed. It plays the clip on loop and, via
 * `requestVideoFrameCallback`, files each *presented* frame into its time bucket —
 * the one access pattern a single-keyframe file is fast at, straight sequential
 * playback. Three loops cover any presentation frame the compositor drops.
 */
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}</style></head><body>
<video id="v" muted playsinline crossorigin="anonymous" src="/hero.mp4"></video>
<script>
const FRAMES=${FRAMES}, COLS=${COLS}, ROWS=${rows}, CW=${CAPTURE_WIDTH};
const v=document.getElementById('v');
const sheet=document.createElement('canvas');
const ctx=sheet.getContext('2d');
const filled=new Array(FRAMES).fill(false);
let tileH=Math.round(CW*9/16), count=0, loops=0, lastT=-1, done=false;
const tile=i=>({x:(i%COLS)*CW,y:Math.floor(i/COLS)*tileH});
const bucket=t=>{const d=v.duration||1;return Math.max(0,Math.min(FRAMES-1,Math.floor(t/d*FRAMES)));};
function patch(){for(let i=0;i<FRAMES;i++){if(filled[i])continue;let n=-1;
  for(let d=1;d<FRAMES&&n<0;d++){if(filled[i-d])n=i-d;else if(filled[i+d])n=i+d;}
  if(n<0)continue;const a=tile(n),b=tile(i);ctx.drawImage(sheet,a.x,a.y,CW,tileH,b.x,b.y,CW,tileH);}}
function finish(){if(done)return;done=true;v.pause();patch();
  window.__META={w:sheet.width,h:sheet.height,frames:FRAMES,cols:COLS,count:count};
  window.__SHEET=sheet.toDataURL('image/webp',0.82);window.__DONE=1;}
v.addEventListener('loadedmetadata',()=>{
  tileH=Math.round(CW*(v.videoHeight/v.videoWidth||9/16));
  sheet.width=CW*COLS;sheet.height=tileH*ROWS;
  v.loop=true;v.play();
  const pump=(now,meta)=>{if(done)return;const t=meta.mediaTime;
    if(lastT>=0&&t+0.001<lastT){loops++;if(loops>=3){finish();return;}}
    lastT=t;const i=bucket(t);
    if(!filled[i]){ctx.drawImage(v,tile(i).x,tile(i).y,CW,tileH);filled[i]=true;count++;
      if(count===FRAMES){finish();return;}}
    v.requestVideoFrameCallback(pump);};
  v.requestVideoFrameCallback(pump);});
</script></body></html>`;

// PLACEHOLDER_DRIVER

if (!existsSync(VIDEO)) {
  console.error(`No source video at ${VIDEO} — nothing to bake.`);
  process.exit(1);
}

const chromePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

if (!chromePath) {
  console.error('No local Chrome/Edge found; this tool needs one to decode the clip.');
  process.exit(1);
}

/*
 * Serve the clip and the capture page from one origin. The video element issues a
 * Range request the moment it is given a src, so a bare 200 with the whole body is
 * refused — honour the range and Chrome will buffer and decode.
 */
const mp4 = readFileSync(VIDEO);
const server = createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }
  if (req.url === '/hero.mp4') {
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : mp4.length - 1;
      res.writeHead(206, {
        'content-type': 'video/mp4',
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${mp4.length}`,
        'content-length': end - start + 1,
      });
      res.end(mp4.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': mp4.length });
    res.end(mp4);
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));

const chrome = spawn(
  chromePath,
  [
    `--remote-debugging-port=${DBG_PORT}`,
    '--headless=new',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    // Headless has no audio device and the capture pass needs `play()` to resolve.
    '--autoplay-policy=no-user-gesture-required',
    '--user-data-dir=' + resolve('.tmp-verify/bake-profile'),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function debuggerUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const json = await (await fetch(`http://127.0.0.1:${DBG_PORT}/json/version`)).json();
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome debugger never came up');
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
await call('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/` });

const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { returnByValue: true, expression, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

// The clip is 4s and captured over up to three loops; poll to ~30s then give up.
let meta = null;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  if (await evaluate('!!window.__DONE')) {
    meta = await evaluate('window.__META');
    break;
  }
}

if (!meta) {
  console.error('Capture never completed — the decoder or autoplay may have stalled.');
  ws.close();
  chrome.kill();
  server.close();
  process.exit(1);
}

const dataUrl = await evaluate('window.__SHEET');
const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
const buf = Buffer.from(b64, 'base64');
writeFileSync(resolve(OUT), buf);

console.log(`Baked ${meta.frames} frames (${meta.count} captured, rest patched)`);
console.log(`Sheet ${meta.w}x${meta.h}, ${meta.cols} cols  ->  ${OUT}  (${(buf.length / 1024).toFixed(0)}KB)`);

ws.close();
chrome.kill();
server.close();
