import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildComparison, type Comparison } from '../core/comparison.js';
import { sha256 } from '../core/source-pdf.js';

type Assets = Map<string, Buffer>;
type RequestContext = {
  server: Server;
  token: string;
  assets: Assets;
  currentComparison: () => Promise<Comparison>;
};

function setSecurityHeaders(response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  );
}

// Only GET requests addressed to this loopback host, from this origin or no origin.
function isAllowed(request: IncomingMessage, host: string) {
  return (
    request.method === 'GET' &&
    request.headers.host === host &&
    !(request.headers.origin && request.headers.origin !== `http://${host}`)
  );
}

function contentType(asset: string) {
  if (asset.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (asset.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'text/html; charset=utf-8';
}

// The file a route asks for (file/<paper number>/<pdf|analysis>/<sha256>), the hash the request
// names, and the path and hash that the current comparison records for it.
function requestedFile(route: string, data: Comparison) {
  const match = /^file\/(\d+)\/(pdf|analysis)\/([a-f0-9]{64})$/.exec(route);
  const paper = match
    ? data.papers.find((candidate) => candidate.number === Number(match[1]))
    : undefined;
  const pdf = match?.[2] === 'pdf';
  const path = pdf ? paper?.registered_pdf?.path : paper?.document;
  const expected = pdf ? paper?.registered_pdf?.sha256 : paper?.document_sha256;
  return { pdf, path, expected, requested: match?.[3] };
}

// Serves a paper's PDF or analysis document only while it matches the hash in the request
// and the hash in the current comparison.
async function sendEvidenceFile(response: ServerResponse, route: string, data: Comparison) {
  const { pdf, path, expected, requested } = requestedFile(route, data);
  if (!path || !expected) {
    response.writeHead(404);
    response.end('No currently verified edition or analysis document is available.');
    return;
  }
  if (requested !== expected) {
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
}

function sendAsset(response: ServerResponse, assets: Assets, asset: string) {
  if (!assets.has(asset)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader('Content-Type', contentType(asset));
  response.end(assets.get(asset));
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  { server, token, assets, currentComparison }: RequestContext,
) {
  const host = `127.0.0.1:${(server.address() as { port: number }).port}`;
  setSecurityHeaders(response);
  if (!isAllowed(request, host)) {
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
      await sendEvidenceFile(response, route, data);
      return;
    }
    sendAsset(response, assets, route || 'comparison.html');
  } catch (error) {
    response.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Unable to read current evidence. ${(error as Error).message}`);
  }
}

/** Read-only loopback server. Resource URLs select freshly validated files, never arbitrary paths. */
export async function serveComparison(root: string, port = 0) {
  await buildComparison(root); // Fail before announcing a usable view.
  const token = randomBytes(24).toString('hex');
  const assets: Assets = new Map(
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
  const server: Server = createServer((request, response) =>
    handleRequest(request, response, { server, token, assets, currentComparison }),
  );
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
