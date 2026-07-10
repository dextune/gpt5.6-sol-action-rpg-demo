import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
const port = Number(process.env.PORT) || 8777;
/** Bind address: 0.0.0.0 = all interfaces (LAN / hostname access). Override with HOST=127.0.0.1 for local-only. */
const host = process.env.HOST || '0.0.0.0';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};

function safePath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(root, normalize(relative));
  // Use platform path separator so Windows (\\) and POSIX (/) both work.
  return candidate === root || candidate.startsWith(rootPrefix) ? candidate : null;
}

const server = createServer(async (request, response) => {
  try {
    let path = safePath(request.url ?? '/');
    if (!path) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(path).catch(() => null);
    if (info?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    response.writeHead(200, {
      'Content-Type': mime[extname(path).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch (error) {
    response.writeHead(error?.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error?.code === 'ENOENT' ? 'Not Found' : 'Server Error');
  }
});

server.listen(port, host, () => {
  const local = `http://127.0.0.1:${port}`;
  const lan = host === '0.0.0.0' || host === '::'
    ? `http://<this-host>:${port}  (all interfaces)`
    : `http://${host}:${port}`;
  console.log(`\nGPT-5.6: Sol / Action RPG DEMO`);
  console.log(`  local:  ${local}`);
  console.log(`  bind:   ${host}:${port}`);
  if (host === '0.0.0.0' || host === '::') {
    console.log(`  lan:    use this machine hostname, e.g. http://<hostname>:${port}`);
  } else {
    console.log(`  url:    ${lan}`);
  }
  console.log('Quit: Ctrl+C\n');
});
