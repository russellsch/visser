// gzip in `serve` (§2.3 initial usable page): compressible routes are sent
// gzip-encoded when the client accepts it; bytes after decoding are unchanged.
import { request } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptsGzip, serveArtifacts, type Route, type ServerHandle } from '../../packages/cli/src/server.ts';

const page = new TextEncoder().encode('<p>' + 'the queue is full; producers wait. '.repeat(400) + '</p>');
const image = new Uint8Array(4096).fill(7);
const routes = new Map<string, Route>([
  ['/p.html', { bytes: page, mediaType: 'text/html; charset=utf-8', cache: 'no-store' }],
  ['/a.png', { bytes: image, mediaType: 'image/png', cache: 'immutable' }],
]);

let handle: ServerHandle;

function get(path: string, headers: Record<string, string>, method = 'GET'): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: handle.port, path, method, headers: { Host: `127.0.0.1:${handle.port}`, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  handle = await serveArtifacts(routes, '127.0.0.1', 0, { publicOrigins: [] });
});
afterAll(async () => {
  await handle.close();
});

describe('serve compresses text routes with gzip @BUDGETS', () => {
  it('sends gzip when accepted, with a matching Content-Length and Vary', async () => {
    const res = await get('/p.html', { 'Accept-Encoding': 'br, gzip;q=0.8' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['vary']).toBe('Accept-Encoding');
    expect(Number(res.headers['content-length'])).toBe(res.body.length);
    expect(res.body.length).toBeLessThan(page.length / 4);
    expect(new Uint8Array(gunzipSync(res.body))).toEqual(page);
  });

  it('sends identity bytes without Accept-Encoding, or when gzip has q=0', async () => {
    const cases: Record<string, string>[] = [{}, { 'Accept-Encoding': 'gzip;q=0' }, { 'Accept-Encoding': 'identity' }];
    for (const headers of cases) {
      const res = await get('/p.html', headers);
      expect(res.headers['content-encoding']).toBeUndefined();
      expect(res.headers['vary']).toBe('Accept-Encoding');
      expect(new Uint8Array(res.body)).toEqual(page);
    }
  });

  it('HEAD reports the same headers as GET and no body', async () => {
    const head = await get('/p.html', { 'Accept-Encoding': 'gzip' }, 'HEAD');
    const full = await get('/p.html', { 'Accept-Encoding': 'gzip' });
    expect(head.headers['content-encoding']).toBe('gzip');
    expect(head.headers['content-length']).toBe(full.headers['content-length']);
    expect(head.body.length).toBe(0);
  });

  it('never compresses images', async () => {
    const res = await get('/a.png', { 'Accept-Encoding': 'gzip' });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['vary']).toBeUndefined();
    expect(res.body.length).toBe(image.length);
  });

  it('parses Accept-Encoding by the q values', () => {
    expect(acceptsGzip(undefined)).toBe(false);
    expect(acceptsGzip('gzip')).toBe(true);
    expect(acceptsGzip('GZIP ; q=1.0')).toBe(true);
    expect(acceptsGzip('gzip;q=0')).toBe(false);
    expect(acceptsGzip('gzip;q=0.000')).toBe(false);
    expect(acceptsGzip('*')).toBe(true);
    expect(acceptsGzip('*;q=0, deflate')).toBe(false);
    expect(acceptsGzip('gzip;q=0, *')).toBe(false);
    expect(acceptsGzip('x-gzip')).toBe(false);
  });
});
