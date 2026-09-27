// Manifest-only read server (§13.3, §15.3, §15.4). Serves exactly the files in
// `routes`; GET and HEAD only; exact Host allowlist; no directory listing.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export type Route = {
  bytes: Uint8Array;
  mediaType: string;
  cache: 'immutable' | 'no-cache' | 'no-store';
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

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

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
    res.writeHead(200, {
      'Content-Type': route.mediaType,
      'Content-Length': String(route.bytes.byteLength),
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': CACHE[route.cache],
    });
    res.end(headOnly ? undefined : route.bytes);
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
