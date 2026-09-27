// Manifest-only read server (§13.3, §15.3, §15.4). Serves exactly the files in
// `routes`; GET and HEAD only; exact Host allowlist; no directory listing.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { contentSecurityPolicy } from '../../core/src/compiler/compile.ts';

export type Route = {
  bytes: Uint8Array;
  mediaType: string;
  cache: 'immutable' | 'no-cache' | 'no-store';
  // Per-route policy; pages with a Mermaid figure use the Mermaid-page policy (§9.12).
  csp?: string;
};

export type HostPolicy = {
  port: number;
  publicOrigins: string[]; // e.g. https://host.tailnet.ts.net
};

export type ServerHandle = {
  server: Server;
  port: number;
  close: () => Promise<void>;
};

const CSP = contentSecurityPolicy({ mermaid: false, delivery: 'header' });

const CACHE: Record<Route['cache'], string> = {
  immutable: 'public, max-age=31536000, immutable',
  'no-cache': 'no-cache',
  'no-store': 'no-store',
};

function allowedHosts(policy: HostPolicy): Set<string> {
  const hosts = new Set<string>();
  for (const name of ['127.0.0.1', 'localhost', '[::1]']) {
    hosts.add(`${name}:${policy.port}`);
  }
  for (const origin of policy.publicOrigins) {
    const url = new URL(origin);
    hosts.add(url.host); // includes a non-default port when present
  }
  return hosts;
}

// Text routes are sent gzip-encoded when the client accepts it (§2.3 initial
// usable page). Every route is fixed bytes with no request data reflected in
// it, so compression cannot leak a secret (BREACH needs both). Each route is
// compressed once, on its first gzip request.
const gzipCache = new WeakMap<Route, Uint8Array>();

function compressible(mediaType: string): boolean {
  return mediaType.startsWith('text/') || mediaType.startsWith('application/json') || mediaType.startsWith('image/svg+xml');
}

function gzipped(route: Route): Uint8Array {
  let bytes = gzipCache.get(route);
  if (!bytes) {
    bytes = new Uint8Array(gzipSync(route.bytes, { level: 9 }));
    gzipCache.set(route, bytes);
  }
  return bytes;
}

/** True if Accept-Encoding allows gzip: `gzip` with q > 0, or `*` with q > 0 and no explicit `gzip`. */
export function acceptsGzip(header: string | undefined): boolean {
  if (!header) return false;
  let gzip: number | undefined;
  let star: number | undefined;
  for (const part of header.split(',')) {
    const [token, ...params] = part.split(';').map((x) => x.trim().toLowerCase());
    let q = 1;
    for (const param of params) {
      const m = /^q=([0-9.]+)$/.exec(param);
      if (m) q = Number(m[1]);
    }
    if (token === 'gzip') gzip = q;
    else if (token === '*') star = q;
  }
  return (gzip ?? star ?? 0) > 0;
}

/** Decode a request path once and reject traversal and encoded separators. */
export function normalizeRequestPath(rawUrl: string): string | undefined {
  const pathOnly = rawUrl.split('?')[0]!.split('#')[0]!;
  if (!pathOnly.startsWith('/') || pathOnly.includes('\\')) return undefined;
  if (/%(2f|5c|2e|00)/i.test(pathOnly)) return undefined; // encoded separators, dots, or NUL
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0') || decoded.split('/').some((segment) => segment === '..' || segment === '.')) return undefined;
  return decoded;
}

function send(res: ServerResponse, status: number, body: string, headOnly: boolean): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  res.end(headOnly ? undefined : body);
}

export function serveArtifacts(routes: Map<string, Route>, host: string, requestedPort: number, policy: Omit<HostPolicy, 'port'>): Promise<ServerHandle> {
  let hosts = new Set<string>();
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const headOnly = req.method === 'HEAD';
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      send(res, 405, 'method not allowed\n', false);
      return;
    }
    if (!req.headers.host || !hosts.has(req.headers.host)) {
      send(res, 421, 'unexpected Host header\n', headOnly);
      return;
    }
    const path = normalizeRequestPath(req.url ?? '');
    const route = path === undefined ? undefined : routes.get(path);
    if (!route) {
      send(res, 404, 'not found\n', headOnly);
      return;
    }
    const canGzip = compressible(route.mediaType);
    const useGzip = canGzip && acceptsGzip(req.headers['accept-encoding']) && gzipped(route).byteLength < route.bytes.byteLength;
    const body = useGzip ? gzipped(route) : route.bytes;
    res.writeHead(200, {
      'Content-Type': route.mediaType,
      'Content-Length': String(body.byteLength),
      ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
      ...(canGzip ? { Vary: 'Accept-Encoding' } : {}),
      'Content-Security-Policy': route.csp ?? CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': CACHE[route.cache],
    });
    res.end(headOnly ? undefined : body);
  };

  const server = createServer({ maxHeaderSize: 16 * 1024, headersTimeout: 10_000, requestTimeout: 30_000 }, handler);
  server.maxConnections = 64;
  server.keepAliveTimeout = 5_000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      server.off('error', reject);
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : requestedPort;
      hosts = allowedHosts({ port, publicOrigins: policy.publicOrigins });
      resolve({
        server,
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
