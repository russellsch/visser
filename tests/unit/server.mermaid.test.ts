// Per-route CSP (§9.12, §15.3) and per-file asset copying (§13.1, §17.5a).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveArtifacts, type Route, type ServerHandle } from '../../packages/cli/src/server.ts';
import { copyAssets } from '../../packages/cli/src/commands/build.ts';
import { contentSecurityPolicy } from '../../packages/core/src/compiler/compile.ts';
import { canonicalJSON } from '../../packages/core/src/model/hash.ts';
import type { VerifiedRelease } from '../../packages/core/src/distribution/index.ts';

const MERMAID_CSP = contentSecurityPolicy({ mermaid: true, delivery: 'header' });
const STRICT_CSP = contentSecurityPolicy({ mermaid: false, delivery: 'header' });

let handle: ServerHandle;

function head(path: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: handle.port, path, method: 'HEAD', headers: { Host: `127.0.0.1:${handle.port}` } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.headers));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  const html = (text: string, csp?: string): Route => ({ bytes: new TextEncoder().encode(text), mediaType: 'text/html; charset=utf-8', cache: 'no-store', ...(csp ? { csp } : {}) });
  handle = await serveArtifacts(new Map([
    ['/mermaid.html', html('<p>diagram</p>', MERMAID_CSP)],
    ['/plain.html', html('<p>plain</p>')],
  ]), '127.0.0.1', 0, { publicOrigins: [] });
});
afterAll(async () => {
  await handle.close();
});

describe('per-route Content Security Policy (§9.12)', () => {
  it('relaxes style-src only on a route that carries the Mermaid policy', async () => {
    expect((await head('/mermaid.html'))['content-security-policy']).toBe(MERMAID_CSP);
    expect((await head('/plain.html'))['content-security-policy']).toBe(STRICT_CSP);
    expect(STRICT_CSP).not.toContain('unsafe-inline');
    expect(MERMAID_CSP).toContain("frame-ancestors 'none'");
  });
});

function fakeRelease(files: Record<string, string>): VerifiedRelease {
  const dir = mkdtempSync(join(tmpdir(), 'visser-release-'));
  mkdirSync(join(dir, 'browser'), { recursive: true });
  const entries = Object.entries(files).map(([name, text]) => {
    writeFileSync(join(dir, 'browser', name), text);
    return { path: `browser/${name}`, sha256: createHash('sha256').update(text).digest('hex') };
  });
  const manifest = { schema: 'visser-release/1', version: '0.0.0', files: entries };
  writeFileSync(join(dir, 'release.json'), JSON.stringify(manifest));
  return { dir, version: manifest.version, sha256: createHash('sha256').update(canonicalJSON(manifest)).digest('hex') };
}

describe('per-file asset copying (§13.1)', () => {
  it('adds mermaid.js to an asset directory that already exists', () => {
    const release = fakeRelease({ 'reader.js': 'js', 'reader.css': 'css', 'mermaid.js': 'mermaid' });
    const assets = join(mkdtempSync(join(tmpdir(), 'visser-out-')), 'assets');
    copyAssets(release, assets, ['reader.js', 'reader.css']);
    expect(existsSync(join(assets, 'mermaid.js'))).toBe(false);
    copyAssets(release, assets, ['reader.js', 'reader.css', 'mermaid.js']);
    expect(readFileSync(join(assets, 'mermaid.js'), 'utf8')).toBe('mermaid');
  });

  it('refuses an asset that does not match release.json', () => {
    const release = fakeRelease({ 'reader.js': 'js', 'reader.css': 'css', 'mermaid.js': 'mermaid' });
    writeFileSync(join(release.dir, 'browser', 'mermaid.js'), 'tampered');
    const assets = join(mkdtempSync(join(tmpdir(), 'visser-out-')), 'assets');
    expect(() => copyAssets(release, assets, ['mermaid.js'])).toThrow(/does not match release.json/);
  });

  it('refuses a replacement manifest even when its replacement asset matches', () => {
    const release = fakeRelease({ 'reader.js': 'js', 'reader.css': 'css' });
    const replacement = { schema: 'visser-release/1', version: '0.0.0', files: [{ path: 'browser/reader.js', sha256: createHash('sha256').update('replacement').digest('hex') }] };
    writeFileSync(join(release.dir, 'release.json'), JSON.stringify(replacement));
    writeFileSync(join(release.dir, 'browser', 'reader.js'), 'replacement');
    const assets = join(mkdtempSync(join(tmpdir(), 'visser-out-')), 'assets');
    expect(() => copyAssets(release, assets, ['reader.js'])).toThrow(/no longer describes resolved toolkit/);
  });
});
