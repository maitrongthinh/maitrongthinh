/**
 * Reports what a cold visit to the exported page actually downloads before it can
 * paint and hydrate: the HTML plus every `/_next/` asset the HTML itself
 * references. Chunks pulled in later by `next/dynamic` (the whole WebGL stack)
 * are deliberately not counted — that is the point of splitting them out.
 *
 * Both sizes are reported, because only one of them is a real number. GitHub Pages
 * negotiates gzip, so the wire column is what a visitor waits for; the on-disk
 * column only says how much text the parser then has to chew through. Optimising
 * against on-disk bytes alone rewards the wrong work: minifier noise compresses
 * away to nothing, while a whole extra font file — already compressed — does not.
 *
 * woff2 carries its own Brotli-class compression internally, so gzipping it again
 * saves ~1%. Fonts are therefore the one group where the two columns agree, and
 * the only way to make them smaller is to ship fewer of them.
 *
 * Usage: node scripts/measure-initial.mjs [htmlFile]
 */
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const FILE = resolve(process.argv[2] ?? 'out/index.html');
const ROOT = resolve('out');

const html = readFileSync(FILE, 'utf8');

// Asset URLs appear both as plain attributes and inside JSON-escaped script
// payloads, so trailing escape characters have to come off before deduping.
const refs = [
  ...new Set(
    [...html.matchAll(/\/_next\/[^"'\\ )]+/g)].map((m) => m[0].replace(/\\+$/, '')),
  ),
];

const groups = { js: [], css: [], font: [], other: [] };

// Level 9 rather than the default 6: GitHub Pages compresses static assets once and
// serves the result from cache, so the slow setting costs nothing a visitor sees.
const wire = (buf) => gzipSync(buf, { level: 9 }).length;

for (const ref of refs) {
  let size = 0;
  let gz = 0;
  try {
    const path = join(ROOT, ref);
    size = statSync(path).size;
    gz = wire(readFileSync(path));
  } catch {
    groups.other.push([-1, 0, `${ref} (MISSING)`]);
    continue;
  }

  if (ref.endsWith('.js')) groups.js.push([size, gz, ref]);
  else if (ref.endsWith('.css')) groups.css.push([size, gz, ref]);
  else if (/\.woff2?$/.test(ref)) groups.font.push([size, gz, ref]);
  else groups.other.push([size, gz, ref]);
}

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
const sum = (list, i) => list.reduce((a, row) => a + row[i], 0);

for (const [name, list] of Object.entries(groups)) {
  if (!list.length) continue;
  list.sort((a, b) => b[1] - a[1]);
  console.log(
    `\n${name.toUpperCase()} — ${list.length} file(s), ${kb(sum(list, 1))} wire / ${kb(sum(list, 0))} on disk`,
  );
  for (const [size, gz, ref] of list) {
    console.log(`  ${kb(gz).padStart(9)}  ${kb(size).padStart(9)}  ${ref}`);
  }
}

const htmlRaw = Buffer.byteLength(html);
const htmlGz = wire(Buffer.from(html));

const totalRaw = htmlRaw + Object.values(groups).reduce((a, l) => a + sum(l, 0), 0);
const totalGz = htmlGz + Object.values(groups).reduce((a, l) => a + sum(l, 1), 0);

console.log(`\nhtml            ${kb(htmlGz)} wire / ${kb(htmlRaw)} on disk`);
console.log(`INITIAL PAYLOAD ${kb(totalGz)} wire / ${kb(totalRaw)} on disk`);
console.log(`                ${totalGz} bytes over the network`);

