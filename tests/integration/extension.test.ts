// Extensions end to end (§14, R11, R15): install never trusts; only a pinned,
// verified, user-trusted digest runs; untrusted or missing extensions never
// execute; the text form never depends on the extension. Build and export run
// through the built CLI; install, trust, and pin call the core directly.
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { addTrust, readTrust } from '../../packages/core/src/distribution/trust.ts';
import { installExtension, pinExtension } from '../../packages/core/src/extensions/index.ts';
import { cli, COMPONENT, context, copyExample, docWithComponent, fixedOutputSource, makeExtension, root, sentinelSource, signExtension, type Ctx } from './extension.fixtures.ts';


const now = () => new Date('2026-09-27T00:00:00Z');

function install(ctx: Ctx, dir: string, scope: 'user' | 'repo' = 'user') {
  return installExtension({ fromDir: dir, scope, repoRoot: ctx.repo, env: ctx.env });
}

function pin(ctx: Ctx, index: string, digest: string) {
  const bundle = loadBundle(index);
  return pinExtension({ bundleRoot: dirname(index), repoRoot: ctx.repo, docId: bundle.docId!, digest, env: ctx.env });
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function builtPage(out: string): { html: string; md: string; build: Record<string, unknown> } {
  const index = walk(out).find((p) => p.endsWith('/index.html') && p.includes('/d/'))!;
  const dir = dirname(index);
  return { html: readFileSync(index, 'utf8'), md: readFileSync(join(dir, 'document.md'), 'utf8'), build: JSON.parse(readFileSync(join(dir, 'build.json'), 'utf8')) };
}

describe('extensions (§14)', () => {
  it('@R15 the example extension builds and exports once pinned and trusted; the text form comes from the source', () => {
    const ctx = context();
    const ext = join(ctx.base, 'timeline-lanes');
    const digest = copyExample(ext);
    const installed = install(ctx, ext);
    expect(validateAgainst('extensionInstall', installed)).toEqual({ ok: true });
    expect(installed.trusted).toBe(false);
    const index = docWithComponent(ctx);
    const pinned = pin(ctx, index, digest);
    expect(pinned.changed).toBe(true);
    const lock = JSON.parse(readFileSync(join(dirname(index), 'visser.lock.json'), 'utf8'));
    expect(lock.extensions).toEqual([{ name: 'timeline-lanes', version: '0.1.0', sha256: digest }]);
    addTrust(digest, 'test', ctx.env, now, 'extensions');

    expect(ctx.run('check', index).status).toBe(0);
    const out = join(ctx.base, 'out');
    const built = ctx.run('build', index, '--out', out);
    expect(built.status, built.stderr).toBe(0);
    const page = builtPage(out);
    expect(page.html).toContain('<svg');
    expect(page.html.match(/class="vs-ext-part"/g)).toHaveLength(2);
    expect(page.html).toContain('Load config: from 0 to 40 ms');
    expect(page.html).not.toContain('vs-extension-note');
    expect(page.build['extensions']).toEqual([{ name: 'timeline-lanes', version: '0.1.0', sha256: digest }]);
    expect(validateAgainst('build', page.build)).toEqual({ ok: true });
    // The text projection is derived from the source only.
    expect(page.md).toContain('Extension: timeline-lanes');
    expect(page.md).toContain('Part Load config');
    expect(page.md).toContain('start: 20');

    const site = join(ctx.base, 'site');
    const exported = ctx.run('export', index, '--format', 'site', '--out', site);
    expect(exported.status, exported.stderr).toBe(0);
    expect(builtPage(site).html).toContain('class="vs-ext-part"');
  });

  it('@R11 an untrusted extension never runs: build and export stop, check and fallback builds do not execute it', () => {
    const ctx = context();
    const sentinel = join(ctx.base, 'SENTINEL');
    const ext = join(ctx.base, 'evil');
    const digest = makeExtension(ext, sentinelSource(sentinel));
    install(ctx, ext, 'repo');
    const index = docWithComponent(ctx);
    pin(ctx, index, digest);
    // A repository copy is not trusted by its presence (§14.2).
    const built = ctx.run('build', index, '--out', join(ctx.base, 'out'));
    expect(built.status).toBe(4);
    expect(built.stderr).toContain('E_EXTENSION_UNTRUSTED');
    const exported = ctx.run('export', index, '--format', 'site', '--out', join(ctx.base, 'site'));
    expect(exported.status).toBe(4);
    expect(ctx.run('check', index).status).toBe(0);
    expect(existsSync(sentinel)).toBe(false);

    const fallback = ctx.run('build', index, '--out', join(ctx.base, 'fb'), '--allow-extension-fallback');
    expect(fallback.status, fallback.stderr).toBe(0);
    expect(fallback.stderr).toContain('W_EXTENSION_FALLBACK');
    const page = builtPage(join(ctx.base, 'fb'));
    expect(page.html).toContain('vs-extension-note');
    expect(page.html).not.toContain('class="vs-ext-part"');
    // Every part stays addressable and listed without the extension.
    expect(page.html).toContain('data-vs-target="lane_config"');
    expect(page.html).toContain('data-vs-target="lane_pool"');
    expect(page.build['extensions']).toBeUndefined();
    expect(existsSync(sentinel)).toBe(false);

    // Trust is what allows execution.
    addTrust(digest, 'test', ctx.env, now, 'extensions');
    const trusted = ctx.run('build', index, '--out', join(ctx.base, 'out2'));
    expect(trusted.status, trusted.stderr).toBe(0);
    expect(existsSync(sentinel)).toBe(true);
    expect(builtPage(join(ctx.base, 'out2')).build['buildId']).not.toBe(page.build['buildId']);
  });

  it('a pinned digest that is not installed, or an unpinned name, is E_EXTENSION_MISSING (exit 3)', () => {
    const ctx = context();
    const index = docWithComponent(ctx);
    const unpinned = ctx.run('build', index, '--out', join(ctx.base, 'a'));
    expect(unpinned.status).toBe(3);
    expect(unpinned.stderr).toContain('E_EXTENSION_MISSING');
    const lockPath = join(dirname(index), 'visser.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.extensions = [{ name: 'timeline-lanes', version: '0.1.0', sha256: 'e'.repeat(64) }];
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    const missing = ctx.run('build', index, '--out', join(ctx.base, 'b'));
    expect(missing.status).toBe(3);
    expect(missing.stderr).toContain('not installed');
  });

  it('a tampered installed copy is E_INTEGRITY and does not run, even when trusted', () => {
    const ctx = context();
    const sentinel = join(ctx.base, 'SENTINEL');
    const ext = join(ctx.base, 'x');
    const digest = makeExtension(ext, sentinelSource(sentinel));
    const installed = install(ctx, ext);
    const index = docWithComponent(ctx);
    pin(ctx, index, digest);
    addTrust(digest, 'test', ctx.env, now, 'extensions');
    appendFileSync(join(installed.path, 'build.cjs'), '\n// changed\n');
    const built = ctx.run('build', index, '--out', join(ctx.base, 'out'));
    expect(built.status).toBe(4);
    expect(built.stderr).toContain('E_INTEGRITY');
    expect(existsSync(sentinel)).toBe(false);
  });

  it('component attributes are checked against the extension schema before trust (E_SEMANTIC, nothing runs)', () => {
    const ctx = context();
    const sentinel = join(ctx.base, 'SENTINEL');
    const ext = join(ctx.base, 'x');
    const digest = makeExtension(ext, sentinelSource(sentinel), { schema: readFileSync(join(root, 'examples/extensions/timeline-lanes/schema.json'), 'utf8') });
    install(ctx, ext);
    const index = docWithComponent(ctx, 'doc', '\n{% extension id="lanes" use="timeline-lanes" title="T" question="Q?" %}\n{% part id="lane_a" label="A" start=0 %}\nText.\n{% /part %}\n{% /extension %}\n');
    pin(ctx, index, digest);
    const untrusted = ctx.run('build', index, '--out', join(ctx.base, 'out'));
    expect(untrusted.stderr).toContain('E_SEMANTIC');
    // Even a trusted extension does not run on input its schema rejects.
    addTrust(digest, 'test', ctx.env, now, 'extensions');
    const built = ctx.run('build', index, '--out', join(ctx.base, 'out'));
    expect(built.status).toBe(2);
    expect(built.stderr).toContain('E_SEMANTIC');
    expect(existsSync(sentinel)).toBe(false);
  });

  it('@R11 unsafe extension output refuses the build; nothing unsafe reaches the page', () => {
    const cases: Array<[string, unknown, number, string]> = [
      ['event handler', { tag: 'g', target: 'lane_config', attrs: { onload: 'alert(1)' } }, 4, 'E_UNSAFE_CONTENT'],
      ['javascript URL in a paint', { tag: 'g', target: 'lane_config', children: [{ tag: 'rect', attrs: { fill: 'url(javascript:alert(1))' } }] }, 4, 'E_UNSAFE_CONTENT'],
      ['script element', { tag: 'script', children: ['alert(1)'] }, 2, 'E_EXTENSION_FAILED'],
      ['link element', { tag: 'a', attrs: { href: 'javascript:alert(1)' } }, 2, 'E_EXTENSION_FAILED'],
    ];
    for (const [label, bad, status, code] of cases) {
      const ctx = context();
      const ext = join(ctx.base, 'x');
      const output = {
        schema: 'visser-component-output/1',
        svg: { tag: 'svg', attrs: { viewBox: '0 0 10 10' }, children: [bad, { tag: 'g', target: 'lane_pool' }] },
        parts: { lane_config: { text: 'a' }, lane_pool: { text: 'b' } },
      };
      const digest = makeExtension(ext, fixedOutputSource(output));
      install(ctx, ext);
      const index = docWithComponent(ctx);
      pin(ctx, index, digest);
      addTrust(digest, 'test', ctx.env, now, 'extensions');
      const out = join(ctx.base, 'out');
      const built = ctx.run('build', index, '--out', out);
      expect(built.status, label).toBe(status);
      expect(built.stderr, label).toContain(code);
      expect(existsSync(join(out, 'd')), label).toBe(false);
    }
  });

  it('@R15 an extension that gives no text fallback for a part fails the build', () => {
    const ctx = context();
    const ext = join(ctx.base, 'x');
    const output = {
      schema: 'visser-component-output/1',
      svg: { tag: 'svg', children: [{ tag: 'g', target: 'lane_config' }, { tag: 'g', target: 'lane_pool' }] },
      parts: { lane_config: { text: 'a' } },
    };
    const digest = makeExtension(ext, fixedOutputSource(output));
    install(ctx, ext);
    const index = docWithComponent(ctx);
    pin(ctx, index, digest);
    addTrust(digest, 'test', ctx.env, now, 'extensions');
    const built = ctx.run('build', index, '--out', join(ctx.base, 'out'));
    expect(built.status).toBe(2);
    expect(built.stderr).toContain('no text fallback for part lane_pool');
  });

  it('install never trusts, is idempotent, and refuses a changed existing copy; pin is idempotent', () => {
    const ctx = context();
    const ext = join(ctx.base, 'timeline-lanes');
    const digest = copyExample(ext);
    const first = install(ctx, ext);
    expect(first.alreadyInstalled).toBe(false);
    expect(readTrust(ctx.env).extensions?.[digest]).toBeUndefined();
    expect(install(ctx, ext).alreadyInstalled).toBe(true);
    const index = docWithComponent(ctx);
    expect(pin(ctx, index, digest).changed).toBe(true);
    expect(pin(ctx, index, digest).changed).toBe(false);
    writeFileSync(join(first.path, 'extra.txt'), 'x');
    expect(() => install(ctx, ext)).toThrow(/does not verify/);
  });

  it('the trust store stays compatible: a toolkit-only store reads, and the two maps never mix', () => {
    const ctx = context();
    const home = ctx.env['VISSER_HOME']!;
    const D = 'd'.repeat(64);
    addTrust('a'.repeat(64), 'install', ctx.env, now);
    const legacy = JSON.parse(readFileSync(join(home, 'trust.json'), 'utf8'));
    expect(legacy.extensions).toBeUndefined();
    addTrust(D, 'extension trust', ctx.env, now, 'extensions');
    const store = readTrust(ctx.env);
    expect(Object.keys(store.toolkits)).toEqual(['a'.repeat(64)]);
    expect(Object.keys(store.extensions ?? {})).toEqual([D]);
    expect(validateAgainst('trustStore', store)).toEqual({ ok: true });
  });

  it('pin refuses an extension that is not installed', () => {
    const ctx = context();
    const index = docWithComponent(ctx);
    expect(() => pin(ctx, index, 'f'.repeat(64))).toThrow(/not installed/);
    expect(mkdtempSync(join(tmpdir(), 'x-'))).toBeTruthy();
  });
});

describe('extensions: review fixes (§14.3)', () => {
  const REDOS_SCHEMA = JSON.stringify({ type: 'object', properties: { component: { type: 'object', properties: { attributes: { type: 'object', properties: { unit: { type: 'string', pattern: '^(a|a)*$' } } } } } } });
  const REDOS_COMPONENT = COMPONENT.replace('unit="ms"', `unit="${'a'.repeat(30)}!"`);

  it('@R11 install refuses a component schema with `pattern` (ReDoS before trust)', () => {
    const ctx = context();
    makeExtension(join(ctx.base, 'evil'), sentinelSource(join(ctx.base, 'SENTINEL')), { schema: REDOS_SCHEMA });
    expect(() => install(ctx, join(ctx.base, 'evil'), 'repo')).toThrow(expect.objectContaining({ code: 'E_UNSAFE_CONTENT', message: expect.stringMatching(/uses `pattern`/) }));
  });

  it('@R11 a ReDoS schema placed in the repository without install fails fast at build, before trust, and never runs', () => {
    const ctx = context();
    const sentinel = join(ctx.base, 'SENTINEL');
    const source = join(ctx.base, 'evil');
    const digest = makeExtension(source, sentinelSource(sentinel), { schema: REDOS_SCHEMA });
    cpSync(source, join(ctx.repo, '.visser', 'extensions', digest), { recursive: true });
    const index = docWithComponent(ctx, 'doc', REDOS_COMPONENT);
    const lockPath = join(dirname(index), 'visser.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    writeFileSync(lockPath, JSON.stringify({ ...lock, extensions: [{ name: 'timeline-lanes', version: '0.1.0', sha256: digest }] }, null, 2) + '\n');
    for (const args of [['build', index], ['build', index, '--allow-extension-fallback']]) {
      const started = Date.now();
      const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: ctx.env, cwd: ctx.repo, timeout: 20_000 });
      expect(r.signal, args.join(' ')).toBeNull();
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('E_UNSAFE_CONTENT');
    }
    expect(existsSync(sentinel)).toBe(false);
  }, 60_000);

  it('the schema shape check refuses non-local $ref, format, deep nesting, and oversize schemas; allows the example', () => {
    const ctx = context();
    const cases: Array<[string, RegExp]> = [
      [JSON.stringify({ type: 'object', properties: { a: { $ref: 'https://example.com/s.json' } } }), /\$ref that is not local/],
      [JSON.stringify({ type: 'object', properties: { a: { type: 'string', format: 'email' } } }), /uses `format`/],
      [JSON.stringify({ type: 'object', patternProperties: { '^x': {} } }), /uses `patternProperties`/],
      [JSON.stringify(Array.from({ length: 20 }).reduce<Record<string, unknown>>((inner) => ({ type: 'object', properties: { x: inner } }), { type: 'string' })), /nests deeper than 16/],
      [JSON.stringify({ type: 'object', description: 'x'.repeat(70_000) }), /larger than 65536 bytes/],
    ];
    cases.forEach(([schema, message], i) => {
      makeExtension(join(ctx.base, `case${i}`), fixedOutputSource({}), { schema });
      expect(() => install(ctx, join(ctx.base, `case${i}`)), `case ${i}`).toThrow(expect.objectContaining({ code: 'E_UNSAFE_CONTENT', message: expect.stringMatching(message) }));
    });
    // A property that is merely named `pattern` is data, not the keyword.
    makeExtension(join(ctx.base, 'named'), fixedOutputSource({}), { schema: JSON.stringify({ type: 'object', properties: { pattern: { type: 'string' } } }) });
    expect(() => install(ctx, join(ctx.base, 'named'))).not.toThrow();
    copyExample(join(ctx.base, 'example'));
    expect(() => install(ctx, join(ctx.base, 'example'))).not.toThrow();
  });

  it('extension inspect shows control characters in an untrusted guide as escapes, never raw', () => {
    const ctx = context();
    const dir = join(ctx.base, 'ansi');
    mkdirSync(dir, { recursive: true });
    makeExtension(dir, fixedOutputSource({}));
    writeFileSync(join(dir, 'GUIDE.md'), '# Guide\n\u001b]0;PWNED\u0007\u001b[2J\u001b[1;31mtrusted: yes\u001b[0m\r\u009b31m\ttab ok\n');
    signExtension(dir, { name: 'timeline-lanes', version: '0.1.0' });
    const r = ctx.run('extension', 'inspect', dir);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
    expect(r.stdout).toContain('\\x1b[2J');
    expect(r.stdout).toContain('\\x9b31m');
    expect(r.stdout).toContain('\ttab ok\n');
  });
});
