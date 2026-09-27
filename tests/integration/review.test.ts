// `explain check DOC --review` through the built CLI (§15.6, §17.1): review
// prompts are warnings, never change the exit code, and appear only when the
// document has no errors. `check` also reports the semantic errors that build
// reports (validate.ts), with or without --review.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';

const root = new URL('../..', import.meta.url).pathname;
const cli = join(root, 'dist/release/bin/explain.cjs');
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const fixture = (name: string, variant: 'good' | 'bad') => join(root, 'tests/fixtures/editorial', name, variant, 'index.md');
const REVIEW = /^W_(JARGON|VISUAL_DENSITY|EVIDENCE_GAP)$/;


describe('@R16 check --review', () => {
  it('@R16 adds prompts as warnings on a bad draft and keeps exit 0', () => {
    const result = run('check', fixture('vague-wording', 'bad'), '--json', '--review');
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(validateAgainst('check', report)).toEqual({ ok: true });
    expect(report.ok).toBe(true);
    const prompts = report.diagnostics.filter((d: { code: string }) => REVIEW.test(d.code));
    expect(prompts.map((d: { code: string; targetId: string }) => `${d.code}:${d.targetId}`)).toEqual(['W_JARGON:p_summary']);
    expect(prompts[0].severity).toBe('warning');
    expect(prompts[0].message).toMatch(/^review: /);
  });

  it('@R16 without --review, check prints no review prompts', () => {
    const result = run('check', fixture('vague-wording', 'bad'), '--json');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).diagnostics.filter((d: { code: string }) => REVIEW.test(d.code))).toEqual([]);
  });

  it('@R16 text mode prints each prompt and still reports ok', () => {
    const result = run('check', fixture('hidden-caveat', 'bad'), '--review');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout + result.stderr).toContain('W_EVIDENCE_GAP');
    expect(result.stdout).toContain('ok:');
  });

  it('a document with an error gets no review prompts, and the exit code is the error\'s', () => {
    const dir = mkdtempSync(join(tmpdir(), 'explain-review-'));
    cpSync(join(root, 'tests/fixtures/editorial/architecture-as-order/bad'), join(dir, 'doc'), { recursive: true });
    const doc = join(dir, 'doc', 'index.md');
    writeFileSync(doc, readFileSync(doc, 'utf8').replace('id="e_api_store" from="api" to="store" kind="data"', 'id="e_api_store" from="api" to="store" kind="bogus"'));
    const result = run('check', doc, '--json', '--review');
    expect(result.status).toBe(2);
    const diagnostics = JSON.parse(result.stdout).diagnostics as Array<{ code: string; severity: string }>;
    expect(diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(diagnostics.filter((d) => REVIEW.test(d.code))).toEqual([]);
  });

  it('check reports a semantic error that build reports (an invalid edge kind), with no --review', () => {
    const dir = mkdtempSync(join(tmpdir(), 'explain-review-'));
    cpSync(join(root, 'examples/bounded-queue'), join(dir, 'doc'), { recursive: true });
    const doc = join(dir, 'doc', 'index.md');
    writeFileSync(doc, readFileSync(doc, 'utf8').replace('kind="blocking-call" label="put waits while full"', 'kind="bogus" label="put waits while full"'));
    const result = run('check', doc, '--json');
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('`kind` must be one of');
  });

  it('a review prompt that repeats a check warning on the same target is not printed twice', () => {
    const result = run('check', fixture('dense-figure', 'bad'), '--review', '--json');
    expect(result.status, result.stderr).toBe(0);
    const density = JSON.parse(result.stdout).diagnostics.filter((d: { code: string; targetId?: string }) => d.code === 'W_VISUAL_DENSITY' && d.targetId === 'all_services');
    expect(density).toHaveLength(1);
  });

  it('--review is a boolean flag: it may come before the document', () => {
    const before = run('check', '--review', fixture('vague-wording', 'bad'));
    const after = run('check', fixture('vague-wording', 'bad'), '--review');
    expect(before.status, before.stderr).toBe(0);
    expect(before.stdout + before.stderr).toContain('W_JARGON');
    expect(before.stdout + before.stderr).toBe(after.stdout + after.stderr);
  });
});
