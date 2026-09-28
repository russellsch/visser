// W_DUPLICATE_SOURCE and `--dry-run` for `capture git` and `capture file`
// (§8.2, §8.4; dogfood-3 F13): a second capture of the same material under a
// new ID is valid but earns a warning naming the existing source, and
// `--dry-run` reports what would be written without touching the document.
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { captureFile, captureGit } from '../../packages/core/src/provenance/index.ts';
import { makeFixture, type Fixture } from './capture.fixtures.ts';

let fx: Fixture;
beforeEach(() => { fx = makeFixture(); });
afterEach(() => fx.cleanup());

const AT = '2026-09-27T00:00:00Z';

describe('W_DUPLICATE_SOURCE (§8.2) @F13', () => {
  it('captureGit warns when a second capture repeats an existing source\'s file, lines, and content', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    const first = captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    expect(first.warnings).toEqual([]);
    const second = captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_b', title: 'B', repositoryLabel: 'app', capturedAt: AT });
    expect(second.warnings).toHaveLength(1);
    expect(second.warnings[0]).toContain('W_DUPLICATE_SOURCE');
    expect(second.warnings[0]).toContain('src_a');
    // Still written: a duplicate is a warning, not a refusal.
    const bundle = loadBundle(doc);
    expect([...bundle.model.targets.keys()]).toEqual(expect.arrayContaining(['src_a', 'src_b']));
    expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('captureFile warns on a duplicate excerptSha256, and no warning when the content differs', () => {
    const doc = fx.doc('d2');
    const from = fx.root + '/note.txt';
    writeFileSync(from, 'hello world\n');
    const first = captureFile({ from, kind: 'supplied', doc, id: 'src_x', title: 'X', capturedAt: AT });
    expect(first.warnings).toEqual([]);
    const second = captureFile({ from, kind: 'supplied', doc, id: 'src_y', title: 'Y', capturedAt: AT });
    expect(second.warnings[0]).toContain('src_x');

    writeFileSync(from, 'different content\n');
    const third = captureFile({ from, kind: 'supplied', doc, id: 'src_z', title: 'Z', capturedAt: AT });
    expect(third.warnings).toEqual([]);
  });

  it('does not warn about its own recapture (same ID)', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d3');
    captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    const recaptured = captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A again', repositoryLabel: 'app', capturedAt: AT, recapture: true });
    expect(recaptured.warnings).toEqual([]);
  });
});

describe('--dry-run (§8.2, §8.4) @F13', () => {
  it('captureGit --dry-run reports the capture and touches nothing', () => {
    const repo = fx.repo('r', { 'a.txt': 'one\ntwo\nthree\n' });
    const doc = fx.doc('d4');
    const before = readFileSync(doc, 'utf8');
    const result = captureGit({ repo, file: 'a.txt', lines: '1:3', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.attributes.id).toBe('src_a');
    expect(result.attributes.title).toBe('A');
    expect(result.attributes.file).toBe('a.txt');
    expect(result.attributes.start).toBe(1);
    expect(result.attributes.end).toBe(3);
    expect(result.attributes.excerptSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.excerptPreview).toEqual(['one', 'two', 'three']);
    // Nothing was written: the document is byte-identical, and there is no new source.
    expect(readFileSync(doc, 'utf8')).toBe(before);
    expect(loadBundle(doc).model.targets.has('src_a')).toBe(false);
  });

  it('captureGit --dry-run truncates the preview to the first three lines', () => {
    const repo = fx.repo('r', { 'a.txt': 'one\ntwo\nthree\nfour\nfive\n' });
    const doc = fx.doc('d5');
    const result = captureGit({ repo, file: 'a.txt', lines: '1:5', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT, dryRun: true });
    expect(result.excerptPreview).toEqual(['one', 'two', 'three']);
  });

  it('captureFile --dry-run reports an image capture with no text preview and writes no asset', () => {
    const doc = fx.doc('d6');
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    const from = fx.root + '/pic.png';
    writeFileSync(from, png);
    const result = captureFile({ from, kind: 'supplied', doc, id: 'src_p', title: 'Picture', dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.attributes.asset).toBe('assets/src_p.png');
    expect(result.excerptPreview).toEqual([]);
    expect(loadBundle(doc).model.targets.has('src_p')).toBe(false);
  });

  it('captureFile --dry-run still reports a duplicate warning', () => {
    const doc = fx.doc('d7');
    const from = fx.root + '/note.txt';
    writeFileSync(from, 'hello world\n');
    captureFile({ from, kind: 'supplied', doc, id: 'src_x', title: 'X', capturedAt: AT });
    const dry = captureFile({ from, kind: 'supplied', doc, id: 'src_y', title: 'Y', capturedAt: AT, dryRun: true });
    expect(dry.warnings[0]).toContain('src_x');
    expect(loadBundle(doc).model.targets.has('src_y')).toBe(false);
  });
});
