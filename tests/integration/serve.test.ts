// `visser serve` through the built CLI (§13.3, §13.4; dogfood-3 F12): the
// build's own `.visser/` output never earns a W_UNDECLARED_FILE warning, a
// favicon is served so the browser's automatic request does not 404, and
// `--watch` rebuilds on an edit and keeps the latest snapshot reachable at a
// stable `<base-path>latest/` URL.
import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url).pathname;
const cli = join(root, 'dist/release/bin/visser.cjs');

type Ctx = { env: NodeJS.ProcessEnv; repo: string; run: (...args: string[]) => ReturnType<typeof spawnSync> & { stdout: string; stderr: string } };

function context(): Ctx {
  const base = mkdtempSync(join(tmpdir(), 'visser-serve-'));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true });
  const env = { ...process.env, VISSER_HOME: join(base, 'home') };
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env, cwd: repo }) as ReturnType<Ctx['run']>;
  return { env, repo, run };
}

function initDoc(ctx: Ctx, name: string): string {
  const dir = join(ctx.repo, 'docs', name);
  const result = ctx.run('init', dir, '--kind', 'teaching', '--title', `Notes ${name}`);
  expect(result.status, result.stderr).toBe(0);
  return join(dir, 'index.md');
}

let procs: ChildProcessWithoutNullStreams[] = [];
afterEach(async () => {
  for (const p of procs) p.kill('SIGTERM');
  procs = [];
});

/** Start `visser serve` with `--port 0`, resolving once it prints the serving URL. */
function startServe(ctx: Ctx, args: string[]): Promise<{ proc: ChildProcessWithoutNullStreams; base: string; stdout: () => string; stderr: () => string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(process.execPath, [cli, 'serve', ...args, '--port', '0'], { env: ctx.env, cwd: ctx.repo });
    procs.push(proc);
    let out = '';
    let err = '';
    let settled = false;
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString();
      // The authority (host:port), not the full snapshot URL: "serving
      // http://host:port/d/doc/rev/build/index.html" would otherwise leave
      // the last path segment stripped off the base by a naive regex.
      const m = /serving http:\/\/([^/\s]+)\//.exec(out);
      if (m && !settled) {
        settled = true;
        resolvePromise({ proc, base: `http://${m[1]}/`, stdout: () => out, stderr: () => err });
      }
    });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (!settled) reject(new Error(`serve exited ${code} before printing a URL\nstdout: ${out}\nstderr: ${err}`));
    });
  });
}

async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('visser serve (§13.3, §13.4) @F12', () => {
  it('@F12a never warns about its own .visser/ output on a second serve', async () => {
    const ctx = context();
    const index = initDoc(ctx, 'one');
    const built = ctx.run('build', index);
    expect(built.status, built.stderr).toBe(0);
    const { proc, stderr } = await startServe(ctx, [index]);
    // Give the process a moment to finish printing any startup warnings.
    await new Promise((r) => setTimeout(r, 200));
    expect(stderr()).not.toContain('W_UNDECLARED_FILE');
    proc.kill('SIGTERM');
  });

  it('@F12c serves a favicon so the page does not 404 on every load', async () => {
    const ctx = context();
    const index = initDoc(ctx, 'two');
    const { base, proc } = await startServe(ctx, [index]);
    const res = await fetch(new URL('favicon.ico', base));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    const body = await res.text();
    expect(body).toContain('<svg');
    proc.kill('SIGTERM');
  });

  it('@F12b --watch rebuilds on an edit and keeps latest/ current', async () => {
    const ctx = context();
    const index = initDoc(ctx, 'three');
    writeFileSync(index, readFileSync(index, 'utf8') + '\n<!-- vs:id p1 -->\nFirst revision.\n');
    const { base, proc, stdout } = await startServe(ctx, [index, '--watch']);
    const firstBuildMatch = /build ID: (\S+)/.exec(stdout());
    expect(firstBuildMatch, stdout()).not.toBeNull();
    const firstBuildId = firstBuildMatch![1]!;

    const latestBefore = await (await fetch(new URL('latest/', base))).text();
    expect(latestBefore).toContain(firstBuildId);

    writeFileSync(index, readFileSync(index, 'utf8').replace('First revision.', 'Second revision.'));

    await waitFor(() => stdout().includes('rebuilt '), 8000);
    const rebuiltMatch = /rebuilt (\S+)/.exec(stdout());
    const secondBuildId = rebuiltMatch![1]!;
    expect(secondBuildId).not.toBe(firstBuildId);

    await waitFor(async () => (await (await fetch(new URL('latest/', base))).text()).includes(secondBuildId));
    const latestAfter = await (await fetch(new URL('latest/', base))).text();
    expect(latestAfter).toContain(secondBuildId);
    expect(latestAfter).not.toContain(firstBuildId);

    proc.kill('SIGTERM');
  }, 15_000);

  it('@F12b keeps serving the old snapshot and prints the error when a rebuild fails', async () => {
    const ctx = context();
    const index = initDoc(ctx, 'four');
    const { base, proc, stdout, stderr } = await startServe(ctx, [index, '--watch']);
    const firstBuildMatch = /build ID: (\S+)/.exec(stdout());
    const firstBuildId = firstBuildMatch![1]!;
    // A round trip to the server, so the watcher (set up right after the
    // "serving" line is printed) is certainly registered before the edit.
    await fetch(new URL('latest/', base));

    // Break the document: an unterminated tag is a syntax error, so the rebuild fails.
    const original = readFileSync(index, 'utf8');
    writeFileSync(index, `${original}\n{% definition id="d1" term="X"\nbroken\n`);

    await waitFor(() => stderr().includes('error: rebuild failed'), 8000);
    const latest = await (await fetch(new URL('latest/', base))).text();
    expect(latest).toContain(firstBuildId);

    proc.kill('SIGTERM');
  }, 15_000);
});
