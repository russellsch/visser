// Extension internals (§14): strict manifest verification, the SVG allowlist,
// the build-entry runner's limits, and the command, which never executes an
// extension to inspect it.
import { existsSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from '../../packages/core/src/compiler/html.ts';
import { extensionSvg, runBuildEntry, verifyExtensionDir, type ComponentInput, type SvgNode } from '../../packages/core/src/extensions/index.ts';
import { runExtension } from '../../packages/cli/src/commands/extension.ts';
import { parseArgs } from '../../packages/cli/src/cli-util.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { copyExample, fixedOutputSource, makeExtension, sentinelSource, signExtension } from '../integration/extension.fixtures.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'visser-extu-'));

const INPUT: ComponentInput = {
  schema: 'visser-component-input/1', api: 'visser-component/1',
  component: { id: 'lanes', title: 'T', question: 'Q?', attributes: { unit: 'ms' } },
  parts: [{ id: 'lane_a', label: 'A', text: '', attributes: { start: 0, end: 5 } }],
};

describe('extension manifest verification', () => {
  it('accepts the example and returns the canonical manifest digest', () => {
    const dir = join(tmp(), 'x');
    const digest = copyExample(dir);
    expect(verifyExtensionDir(dir).sha256).toBe(digest);
  });

  it('refuses an unlisted file, a symlink, a missing file, a changed file, and a browser entry', () => {
    const cases: Array<[string, (dir: string) => void, RegExp]> = [
      ['unlisted', (d) => writeFileSync(join(d, 'evil.cjs'), 'x'), /not listed/],
      ['symlink', (d) => { unlinkSync(join(d, 'GUIDE.md')); symlinkSync('/etc/hostname', join(d, 'GUIDE.md')); }, /symbolic link/],
      ['missing', (d) => unlinkSync(join(d, 'schema.json')), /missing/],
      ['changed', (d) => writeFileSync(join(d, 'build.cjs'), 'changed'), /does not match/],
      ['browser entry', (d) => {
        const m = JSON.parse(readFileSync(join(d, 'extension.json'), 'utf8'));
        m.browserEntry = 'browser.js';
        writeFileSync(join(d, 'extension.json'), JSON.stringify(m));
      }, /violates visser-extension\/1/],
    ];
    for (const [label, change, message] of cases) {
      const dir = join(tmp(), 'x');
      copyExample(dir);
      change(dir);
      expect(() => verifyExtensionDir(dir), label).toThrow(message);
    }
  });
});

describe('extension SVG allowlist (§15.2)', () => {
  const ctx = { extension: 'x', figureId: 'lanes', title: 'T', parts: new Map([['lane_a', 'A']]), text: (s: string) => s };
  const svg = (children: SvgNode[]): SvgNode => ({ tag: 'svg', attrs: { viewBox: '0 0 10 10' }, children });
  const good: SvgNode = { tag: 'g', target: 'lane_a', children: [{ tag: 'text', attrs: { x: 1, y: 2 }, children: ['<script>alert(1)</script>'] }] };

  it('wraps each target group in the core link and escapes text', () => {
    const html = render(extensionSvg(svg([good]), ctx));
    expect(html).toContain('<a class="vs-ext-part" href="#x-lane_a"');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('refuses unsafe or unknown markup instead of dropping it', () => {
    const bad: Array<[string, SvgNode[], RegExp]> = [
      ['event handler', [{ ...good, attrs: { onclick: 'x' } }], /not allowed/],
      ['style', [{ tag: 'rect', attrs: { style: 'fill:red' } }, good], /not allowed/],
      ['url paint', [{ tag: 'rect', attrs: { fill: 'url(#x)' } }, good], /not allowed/],
      ['foreign element', [{ tag: 'foreignObject' }, good], /not allowed/],
      ['nested svg', [{ tag: 'svg' }, good], /nested/],
      ['text in g', [{ tag: 'g', children: ['x'] }, good], /text is allowed only/],
      ['target on rect', [{ tag: 'rect', target: 'lane_a' }], /only a <g>/],
      ['unknown part', [good, { tag: 'g', target: 'lane_z' }], /not a part/],
      ['part twice', [good, good], /twice/],
      ['part missing', [], /no target group/],
    ];
    for (const [label, children, message] of bad) expect(() => extensionSvg(svg(children), ctx), label).toThrow(message);
  });

  it('the core allowlist is still the second check', () => {
    expect(() => h('foreignObject')).toThrow();
  });
});

describe('build entry runner (§14.3)', () => {
  it('stops an entry that does not finish, crashes, prints too much, or gives no text fallback', () => {
    const cases: Array<[string, string, RegExp, object?]> = [
      ['timeout', 'setInterval(() => {}, 1000);', /did not finish/, { timeoutMs: 500, heapMb: 64, outputBytes: 1 << 20 }],
      ['crash', 'process.stderr.write("\\u001b[31mboom\\n"); process.exit(3);', /exited with 3: \?\[31mboom/],
      ['too much', 'process.stdout.write("x".repeat(3000));', /more than/, { timeoutMs: 5000, heapMb: 64, outputBytes: 1000 }],
      ['not JSON', 'process.stdout.write("hello");', /one JSON value/],
      ['no fallback', fixedOutputSource({ schema: 'visser-component-output/1', svg: { tag: 'svg' }, parts: {} }), /no text fallback for part lane_a/],
    ];
    for (const [label, source, message, limits] of cases) {
      const dir = join(tmp(), 'x');
      makeExtension(dir, source);
      const ext = verifyExtensionDir(dir);
      expect(() => runBuildEntry(ext, INPUT, limits as never), label).toThrow(message);
    }
  });

  it('runs with a minimal environment: no caller secrets', () => {
    const dir = join(tmp(), 'x');
    makeExtension(dir, "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(JSON.stringify({ schema: 'visser-component-output/1', svg: { tag: 'svg' }, parts: { lane_a: { text: Object.keys(process.env).sort().join(',') || 'none' } } })));\n");
    process.env['VISSER_TEST_SECRET'] = 'x';
    try {
      const out = runBuildEntry(verifyExtensionDir(dir), INPUT);
      expect(out.parts['lane_a']!.text).not.toContain('VISSER_TEST_SECRET');
    } finally {
      delete process.env['VISSER_TEST_SECRET'];
    }
  });
});

describe('visser extension (command)', () => {
  let home: string;
  let stdout: string;
  beforeEach(() => {
    home = tmp();
    process.env['VISSER_HOME'] = home;
    stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { stdout += String(chunk); return true; });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['VISSER_HOME'];
  });

  it('@R11 inspect shows the manifest, schema, and guide without running the build entry', async () => {
    const dir = join(tmp(), 'x');
    const sentinel = join(tmp(), 'SENTINEL');
    const digest = makeExtension(dir, sentinelSource(sentinel));
    expect(await runExtension(parseArgs(['inspect', dir, '--json']))).toBe(0);
    const result = JSON.parse(stdout);
    expect(validateAgainst('extensionInspect', result)).toEqual({ ok: true });
    expect(result.sha256).toBe(digest);
    expect(result.trusted).toBe(false);
    expect(existsSync(sentinel)).toBe(false);
  });

  it('trust and --revoke write only the extensions map', async () => {
    const D = 'c'.repeat(64);
    expect(await runExtension(parseArgs(['trust', D, '--json']))).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ schema: 'visser-extension-trust/1', trusted: true, changed: true });
    stdout = '';
    expect(await runExtension(parseArgs(['trust', D, '--revoke', '--json']))).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ trusted: false, changed: true });
    await expect(runExtension(parseArgs(['trust', 'nope']))).rejects.toMatchObject({ code: 'E_USAGE', exitCode: 2 });
  });

  it('inspect of an uninstalled digest is E_EXTENSION_MISSING (exit 3)', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await expect(runExtension(parseArgs(['inspect', 'b'.repeat(64)]))).rejects.toMatchObject({ code: 'E_EXTENSION_MISSING', exitCode: 3 });
  });

  it('signExtension keeps the example digest stable', () => {
    const dir = join(tmp(), 'x');
    expect(copyExample(dir)).toBe(signExtension(dir, { name: 'timeline-lanes', version: '0.1.0' }));
  });
});
