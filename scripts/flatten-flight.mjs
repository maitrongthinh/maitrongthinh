/**
 * Mirrors the exported RSC payload files under the flat filenames the client
 * router actually requests.
 *
 * `next build` with `output: 'export'` writes a page's prefetch payload to a
 * nested path — `out/notes/__next.notes/__PAGE__.txt` — while the router asks for
 * the segments joined by dots: `/notes/__next.notes.__PAGE__.txt`. On a real
 * server the two shapes are the same route; on a plain static host they are not,
 * so every `next/link` prefetch 404s, the console fills up on each visit, and
 * client-side navigation loses its prefetch.
 *
 * This copies rather than moves, so whichever shape Next settles on keeps working.
 *
 * Usage: node scripts/flatten-flight.mjs [dir]
 */
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'out');

/** Every file below `dir`, as absolute paths. */
async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else found.push(full);
  }
  return found;
}

try {
  await stat(ROOT);
} catch {
  console.error(`No export at ${ROOT} — run \`next build\` first.`);
  process.exit(1);
}

const files = await walk(ROOT);
let copied = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  const parts = rel.split(sep);

  // Find the `__next.*` directory that starts the payload subtree. Only nested
  // payloads need flattening; ones already written flat have no such directory.
  const start = parts.findIndex((p) => p.startsWith('__next.'));
  if (start === -1 || start === parts.length - 1) continue;

  const flat = [...parts.slice(0, start), parts.slice(start).join('.')].join(sep);
  const target = join(ROOT, flat);
  if (target === file) continue;

  await mkdir(dirname(target), { recursive: true });
  await copyFile(file, target);
  copied += 1;
  console.log(`  ${rel} -> ${flat}`);
}

console.log(`flatten-flight: ${copied} payload file(s) mirrored`);
