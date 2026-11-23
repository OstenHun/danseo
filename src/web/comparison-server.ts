import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildComparison } from '../core/comparison.js';
import { sha256 } from '../core/source-pdf.js';

/** Read-only loopback server. Resource URLs select freshly validated files, never arbitrary paths. */
export async function serveComparison(root: string, port = 0) {
  await buildComparison(root); // Fail before announcing a usable view.
  const token = randomBytes(24).toString('hex');
  const assets = new Map(
    await Promise.all(
      [
        'comparison.html',
        'comparison.js',
        'comparison.css',
        'reader-base.css',
        'research-map.js',
        'cytoscape.min.js',
      ].map(async (name) => [name, await readFile(new URL(name, import.meta.url))] as const),
    ),
  );
  // Topic metadata uses the existing writer lock even for a short read. Queue our own readers;
  // leave that lock intact for external writers and recover the queue after a failed read.
  let reading: Promise<unknown> = Promise.resolve();
  function currentComparison() {
    const result = reading.then(() => buildComparison(root));
    reading = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  const server = createServer(async (request, response) => {
    const host = `127.0.0.1:${(server.address() as { port: number }).port}`;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    if (
      request.method !== 'GET' ||
      request.headers.host !== host ||
      (request.headers.origin && request.headers.origin !== `http://${host}`)
    ) {
      response.writeHead(403);
      response.end('Request not allowed.');
      return;
    }
    const prefix = `/${token}/`;
    // Only origin-form request targets under this run's entry path are accepted.
    // In particular, //malformed-authority must not escape the async handler as a rejection.
    if (!request.url?.startsWith(prefix)) {
      response.writeHead(404);
      response.end();
      return;
    }
    try {
      const url = new URL(request.url, `http://${host}`);
      if (!url.pathname.startsWith(prefix)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const route = url.pathname.slice(prefix.length);
      if (route === 'data' || route.startsWith('file/')) {
        const data = await currentComparison();
        if (route === 'data') {
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(data));
          return;
        }
        const match = /^file\/(\d+)\/(pdf|analysis)\/([a-f0-9]{64})$/.exec(route);
        const paper = match
          ? data.papers.find((candidate) => candidate.number === Number(match[1]))
          : undefined;
        const pdf = match?.[2] === 'pdf';
        const path = pdf ? paper?.source?.path : paper?.document;
        const expected = pdf ? paper?.source?.sha256 : paper?.document_sha256;
        if (!path || !expected) {
          response.writeHead(404);
          response.end('No currently verified edition or analysis document is available.');
          return;
        }
        if (match?.[3] !== expected) {
          response.writeHead(409);
          response.end('The selected edition or analysis document changed. Reopen the comparison.');
          return;
        }
        const bytes = await readFile(path);
        if (sha256(bytes) !== expected) {
          response.writeHead(409);
          response.end('The evidence changed. Reopen the comparison.');
          return;
        }
        response.setHeader('Content-Type', pdf ? 'application/pdf' : 'text/plain; charset=utf-8');
        response.end(bytes);
        return;
      }
      const asset = route || 'comparison.html';
      if (!assets.has(asset)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.setHeader(
        'Content-Type',
        asset.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : asset.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'text/html; charset=utf-8',
      );
      response.end(assets.get(asset));
    } catch (error) {
      response.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`Unable to read current evidence. ${(error as Error).message}`);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}/${token}/`;
  console.log(
    JSON.stringify({
      url: address,
      mode: 'read-only',
      stop: 'Ctrl+C',
      scope: 'local-topic-comparison',
    }),
  );
  return server;
}
