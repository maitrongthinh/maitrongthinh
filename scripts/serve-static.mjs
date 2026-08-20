/**
 * Static file server for `out/`, matching what GitHub Pages does closely enough
 * to trust the result.
 *
 * Written rather than shelled out to `npx serve` for two reasons: that package
 * ignored the port it was given here and picked a random one each run, and it is
 * an extra install for something Node already does. This binds the port it is
 * told to and speaks HTTP Range, which the mouse-scrubbed video and the audio
 * player both need — a server without Range makes seeking silently fail.
 *
 * Usage: node scripts/serve-static.mjs [port] [dir]
 */
import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const PORT = Number(process.argv[2] ?? 4173);
const ROOT = resolve(process.argv[3] ?? 'out');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml; charset=utf-8',
};

/** Resolve a URL path to a file, following the export's trailing-slash layout. */
async function locate(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);

  // Contain the path inside ROOT — a static server still must not serve `../`.
  const safe = normalize(join(ROOT, clean));
  if (safe !== ROOT && !safe.startsWith(ROOT + sep)) return null;

  const candidates = extname(safe)
    ? [safe]
    : [join(safe, 'index.html'), `${safe}.html`, safe];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return { path: candidate, size: stat.size };
    } catch {
      /* Try the next shape. */
    }
  }

  return null;
}

const server = createServer(async (req, res) => {
  const found = await locate(req.url ?? '/');

  if (!found) {
    const fallback = await locate('/404.html');
    if (!fallback) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
      return;
    }
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    createReadStream(fallback.path).pipe(res);
    return;
  }

  const type = TYPES[extname(found.path).toLowerCase()] ?? 'application/octet-stream';
  // Hashed asset paths are immutable; everything else must revalidate or a stale
  // page survives a rebuild.
  const cache = req.url?.includes('/_next/static/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : found.size - 1;

      if (start >= found.size || end >= found.size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${found.size}` }).end();
        return;
      }

      res.writeHead(206, {
        'content-type': type,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${found.size}`,
        'accept-ranges': 'bytes',
        'cache-control': cache,
      });
      createReadStream(found.path, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'content-type': type,
    'content-length': found.size,
    'accept-ranges': 'bytes',
    'cache-control': cache,
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(found.path).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
});
