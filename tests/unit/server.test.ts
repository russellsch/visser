import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeRequestPath, serveArtifacts, type Route, type ServerHandle } from '../../packages/cli/src/server.ts';

const routes = new Map<string, Route>([
  ['/', { bytes: new TextEncoder().encode('index'), mediaType: 'text/html; charset=utf-8', cache: 'no-cache' }],
  ['/d/doc/index.html', { bytes: new TextEncoder().encode('<p>doc</p>'), mediaType: 'text/html; charset=utf-8', cache: 'no-store' }],
]);

let handle: ServerHandle;

function get(path: string, options: { method?: string; host?: string } = {}): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: handle.port, path, method: options.method ?? 'GET', headers: { Host: options.host ?? `127.0.0.1:${handle.port}` } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  handle = await serveArtifacts(routes, '127.0.0.1', 0, { publicOrigins: ['https://box.tailnet.ts.net'] });
});
afterAll(async () => {
  await handle.close();
});

describe('manifest-only server (§13.3, §15.4) @R17', () => {
  it('serves manifest paths with the security headers', async () => {
    const res = await get('/d/doc/index.html');
    expect(res.status).toBe(200);
    expect(res.body).toBe('<p>doc</p>');
    expect(String(res.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('allows only GET and HEAD', async () => {
    expect((await get('/', { method: 'POST' })).status).toBe(405);
    expect((await get('/', { method: 'PUT' })).status).toBe(405);
    const head = await get('/', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
  });

  it('rejects unexpected Host values and accepts the configured public origin', async () => {
    expect((await get('/', { host: 'evil.example' })).status).toBe(421);
    expect((await get('/', { host: `evil.example:${handle.port}` })).status).toBe(421);
    expect((await get('/', { host: 'box.tailnet.ts.net' })).status).toBe(200);
    expect((await get('/', { host: 'box.tailnet.ts.net.evil' })).status).toBe(421);
  });

  it('serves no source or guessed paths, and no directory listing', async () => {
    for (const path of ['/.git/config', '/index.md', '/d/', '/d/doc/', '/d/doc/../../.git/config']) {
      expect((await get(path)).status, path).toBe(404);
    }
  });

  it('rejects encoded traversal and separators', () => {
    for (const raw of ['/d/%2e%2e/x', '/d%2fdoc', '/d/%5c..', '/d\\doc', '/a/../b', '/a/./b', '/%00', '/%E0%A4%A']) {
      expect(normalizeRequestPath(raw), raw).toBeUndefined();
    }
    expect(normalizeRequestPath('/d/doc/index.html?x=1#y')).toBe('/d/doc/index.html');
  });

  it('fails on a busy port instead of choosing another', async () => {
    await expect(serveArtifacts(routes, '127.0.0.1', handle.port, { publicOrigins: [] })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
