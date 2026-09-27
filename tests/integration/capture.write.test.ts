// Writing captured sources into documents: placement, recapture, guarded
// write, `capture file` kinds, and images (§8.2 "Writing the source block").
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HashError } from '../../packages/core/src/model/hash.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { captureFile, captureGit } from '../../packages/core/src/provenance/index.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { DOC_ID, makeFixture, type Fixture } from './capture.fixtures.ts';

let fx: Fixture;
beforeEach(() => { fx = makeFixture(); });
afterEach(() => fx.cleanup());

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof HashError) return error.code;
    throw error;
  }
  return 'ok';
}

const AT = '2026-09-27T00:00:00Z';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

function errorsOf(doc: string) {
  return loadBundle(doc).diagnostics.filter((d) => d.severity === 'error');
}

describe('writing a captured source @R07 @R19', () => {
  it('places a new source after the last existing source, so the file keeps capture order, and keeps every other byte', async () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d', '<!-- vs:id intro -->\nIntro.\n\n<!-- vs:id outro -->\nOutro.\n');
    captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_first', title: 'First', repositoryLabel: 'app', capturedAt: AT });
    captureGit({ repo, file: 'a.txt', lines: '2:3', doc, id: 'src_second', title: 'Second', repositoryLabel: 'app', capturedAt: AT });
    const before = readFileSync(doc, 'utf8');
    captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_third', title: 'Third', repositoryLabel: 'app', capturedAt: AT });
    const after = readFileSync(doc, 'utf8');
    const at = (id: string) => after.indexOf(`id="${id}"`);
    expect(at('src_first')).toBeLessThan(at('src_second'));
    expect(at('src_second')).toBeLessThan(at('src_third'));
    // Everything up to the end of the last old source is unchanged, and so is everything after it.
    const endOfSecond = before.indexOf('{% /source %}', before.indexOf('id="src_second"')) + '{% /source %}\n'.length;
    expect(after.slice(0, endOfSecond)).toBe(before.slice(0, endOfSecond));
    expect(after.endsWith(before.slice(endOfSecond))).toBe(true);
    expect(errorsOf(doc)).toEqual([]);
    // Recapture keeps the position.
    captureGit({ repo, file: 'a.txt', lines: '1:3', doc, id: 'src_second', title: 'Second again', repositoryLabel: 'app', capturedAt: AT, recapture: true });
    const again = readFileSync(doc, 'utf8');
    expect(again.indexOf('id="src_first"')).toBeLessThan(again.indexOf('id="src_second"'));
    expect(again.indexOf('id="src_second"')).toBeLessThan(again.indexOf('id="src_third"'));
    // Citations in reading order are numbered 1, 2, 3 on the page.
    writeFileSync(doc, again.replace('Intro.', 'Intro {% cite ref="src_first" /%} {% cite ref="src_second" /%} {% cite ref="src_third" /%}.'));
    const page = await compileDocument(loadBundle(doc), { version: '0.0.0', sha256: 'a'.repeat(64) }, { audience: 'private', includeSource: false, layoutFallback: false, nodeVersion: 'v24.21.0' });
    const html = new TextDecoder().decode(page.files.find((f) => f.path.endsWith('/index.html'))!.bytes);
    expect([...html.matchAll(/class="vs-cite"[^>]*>\[(\d+)\]/g)].map((m) => m[1])).toEqual(['1', '2', '3']);
  });

  it('accepts a capture that resolves an existing citation', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d', '<!-- vs:id intro -->\nIntro {% cite ref="src_a" /%}\n');
    expect(errorsOf(doc).map((d) => d.code)).toContain('E_REF_BROKEN');
    captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    expect(errorsOf(doc)).toEqual([]);
  });

  it('refuses an existing ID without --recapture, and refuses to replace a non-source target', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    const snapshot = readFileSync(doc);
    expect(codeOf(() => captureGit({ repo, file: 'a.txt', lines: '2:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT }))).toBe('E_ID_DUPLICATE');
    expect(codeOf(() => captureGit({ repo, file: 'a.txt', lines: '2:2', doc, id: 'intro', title: 'A', repositoryLabel: 'app', capturedAt: AT, recapture: true }))).toBe('E_ID_DUPLICATE');
    expect(readFileSync(doc)).toEqual(snapshot);
  });

  it('recaptures in place and keeps the ID', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    const r = captureGit({ repo, file: 'a.txt', lines: '2:3', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT, recapture: true });
    expect(r.replaced).toBe(true);
    const text = readFileSync(doc, 'utf8');
    expect(text.match(/id="src_a"/g)).toHaveLength(1);
    expect(text).toContain('start=2 end=3');
    expect(errorsOf(doc)).toEqual([]);
  });

  it('refuses a recapture that breaks an annotated line range, and writes nothing', () => {
    const repo = fx.repo('r', { 'a.txt': 'l1\nl2\nl3\nl4\n' });
    const doc = fx.doc('d');
    captureGit({ repo, file: 'a.txt', lines: '1:4', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    const text = readFileSync(doc, 'utf8');
    writeFileSync(doc, text.replace('{% source', '{% annotated id="ann_fig" title="T" question="Q?" source="src_a" %}\nLook.\n\n{% annotation id="ann_one" label="L" lines=[3, 4] %}\nNote.\n{% /annotation %}\n{% /annotated %}\n\n{% source'));
    expect(errorsOf(doc)).toEqual([]);
    const snapshot = readFileSync(doc);
    expect(codeOf(() => captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT, recapture: true }))).toBe('E_SEMANTIC');
    expect(readFileSync(doc)).toEqual(snapshot);
  });

  it('keeps CRLF line endings in a CRLF document', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    writeFileSync(doc, readFileSync(doc, 'utf8').replace(/\n/g, '\r\n'));
    captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    const text = readFileSync(doc, 'utf8');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(errorsOf(doc)).toEqual([]);
  });
});

describe('the guarded write for capture (§11.9)', () => {
  it('refuses a symlinked document', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    const link = join(fx.root, 'd', 'link.md');
    symlinkSync(doc, link);
    expect(codeOf(() => captureGit({ repo, file: 'a.txt', lines: '1:1', doc: link, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT }))).toBe('E_PATH_ESCAPE');
  });

  it('refuses while another writer holds the lock, and writes nothing', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    const locks = join(fx.root, 'd', '.visser', 'edit-locks');
    mkdirSync(locks, { recursive: true });
    writeFileSync(join(locks, `${DOC_ID}.lock`), JSON.stringify({ pid: 1, token: 'other' }));
    const snapshot = readFileSync(doc);
    expect(codeOf(() => captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT }))).toBe('E_WRITE_CONFLICT');
    expect(readFileSync(doc)).toEqual(snapshot);
  });

  it('detects an external write before rename and keeps the external version', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    const external = readFileSync(doc, 'utf8') + '\n<!-- vs:id late -->\nAdded by someone else.\n';
    expect(codeOf(() => captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT, fsContext: { beforeRename: (p) => writeFileSync(p, external) } }))).toBe('E_WRITE_CONFLICT');
    expect(readFileSync(doc, 'utf8')).toBe(external);
  });
});

describe('capture file kinds @R07', () => {
  it('captures file, web, supplied, and example text with their §8.1 metadata', () => {
    const doc = fx.doc('d');
    const from = join(fx.root, 'notes.txt');
    writeFileSync(from, 'alpha\nbeta\ngamma\n');
    captureFile({ from, kind: 'file', doc, id: 'src_file', title: 'Notes', lines: '2:3', capturedAt: AT });
    captureFile({ from, kind: 'web', doc, id: 'src_web', title: 'Page', url: 'https://example.com/page', capturedAt: AT });
    captureFile({ from, kind: 'supplied', doc, id: 'src_supplied', title: 'Supplied notes', capturedAt: AT });
    captureFile({ from, kind: 'example', doc, id: 'src_example', title: 'Illustrative' });
    expect(errorsOf(doc)).toEqual([]);
    const text = readFileSync(doc, 'utf8');
    expect(text).toContain('file="notes.txt"');
    expect(text).not.toContain(fx.root);
    expect(codeOf(() => captureFile({ from, kind: 'web', doc, id: 'src_w2', title: 'P', capturedAt: AT }))).toBe('E_USAGE');
    expect(codeOf(() => captureFile({ from, kind: 'file', doc, id: 'src_f2', title: 'P', label: '/etc/x', capturedAt: AT }))).toBe('E_USAGE');
    expect(codeOf(() => captureFile({ from, kind: 'web', doc, id: 'src_w3', title: 'P', url: 'javascript:alert(1)', capturedAt: AT }))).toBe('E_USAGE');
  });

  it('captures a PNG as a declared asset with its raw-bytes hash, and refuses a symlinked input', () => {
    const doc = fx.doc('d');
    const from = join(fx.root, 'figure.png');
    writeFileSync(from, PNG);
    const r = captureFile({ from, kind: 'file', doc, id: 'src_img', title: 'Figure', capturedAt: AT });
    expect(r.asset).toBe('assets/src_img.png');
    expect(existsSync(join(fx.root, 'd', 'assets', 'src_img.png'))).toBe(true);
    expect(errorsOf(doc)).toEqual([]);
    const link = join(fx.root, 'link.png');
    symlinkSync(from, link);
    expect(codeOf(() => captureFile({ from: link, kind: 'file', doc, id: 'src_img2', title: 'F', capturedAt: AT }))).toBe('E_PATH_ESCAPE');
  });

  it('refuses a symlinked assets directory in the bundle', () => {
    const doc = fx.doc('d');
    const from = join(fx.root, 'figure.png');
    writeFileSync(from, PNG);
    mkdirSync(join(fx.root, 'elsewhere'));
    symlinkSync(join(fx.root, 'elsewhere'), join(fx.root, 'd', 'assets'));
    expect(codeOf(() => captureFile({ from, kind: 'file', doc, id: 'src_img', title: 'F', capturedAt: AT }))).toBe('E_PATH_ESCAPE');
    expect(existsSync(join(fx.root, 'elsewhere', 'src_img.png'))).toBe(false);
  });
});

describe('capture from the built release CLI @R07', () => {
  it('captures and verifies with dist/release/bin/visser.cjs', () => {
    const cli = join(process.cwd(), 'dist', 'release', 'bin', 'visser.cjs');
    expect(existsSync(cli), 'run `npm run build` first').toBe(true);
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, VISSER_HOME: join(fx.root, 'visser-home') } });
    const cap = run('capture', 'git', '--repo', repo, '--file', 'a.txt', '--lines', '1:2', '--doc', doc, '--id', 'src_a', '--title', 'A', '--repository-label', 'app', '--captured-at', AT, '--json');
    expect(cap.status, cap.stderr + cap.stdout).toBe(0);
    expect(JSON.parse(cap.stdout)).toMatchObject({ schema: 'visser-capture/1', id: 'src_a' });
    const check = run('check', doc, '--json', '--repo-map', `app=${repo}`, '--verify-origins');
    expect(check.status, check.stderr + check.stdout).toBe(0);
    expect(JSON.parse(check.stdout).origins).toEqual([{ id: 'src_a', kind: 'git', state: 'origin-matched' }]);
  });
});
