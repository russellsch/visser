// R08 (§17.7 4b, §18.8): the toolkit works with no network. The script proves
// isolation first and never passes without that proof.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url).pathname;
const script = join(root, 'scripts/check-offline.mjs');
const hasUnshare = spawnSync('unshare', ['-rn', 'true']).status === 0;


describe('offline check (R08)', () => {
  it('reports "not run" (exit 3) when unshare is not on PATH', () => {
    // A system Node may share /usr/bin with unshare. Use an empty directory
    // instead of assuming the directory containing Node has no other tools.
    const emptyPath = mkdtempSync(join(tmpdir(), 'visser-empty-path-'));
    try {
      const r = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, PATH: emptyPath } });
      expect(r.status).toBe(3);
      expect(r.stderr).toContain('not run: unshare -rn is not available');
    } finally {
      rmSync(emptyPath, { recursive: true, force: true });
    }
  });

  it('reports "not run" (exit 3) when a probe address is reachable', async () => {
    const server: Server = createServer((s) => s.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      // Run the inner checks without a namespace: the local listener accepts the probe.
      const r = spawnSync(process.execPath, [script, '--inside-namespace'], {
        encoding: 'utf8', env: { ...process.env, VISSER_OFFLINE_EXTRA_PROBE: `127.0.0.1:${port}` }, timeout: 60_000,
      });
      expect(r.status).toBe(3);
      expect(r.stderr).toContain('not run: the network is reachable');
      expect(r.stdout).not.toContain('ok   init');
    } finally {
      server.close();
    }
  }, 60_000);

  it.skipIf(!hasUnshare)('@R08 builds, exports, serves, and reads a Mermaid page under unshare -rn', () => {
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 170_000 });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/isolation: tcp 1\.1\.1\.1:443 -> (ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|timeout)/);
    for (const step of ['init', 'check', 'build', 'export markdown', 'read page', 'read reader.js', 'read reader.css', 'read mermaid.js']) {
      expect(r.stdout).toContain(`ok   ${step}`);
    }
    expect(r.stdout).toContain('offline: passed');
  }, 180_000);
});
