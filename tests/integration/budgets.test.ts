// @BUDGETS (§2.3, §17.8): the size, count, and limit gates of
// scripts/check-budgets.mjs pass on dist/release, and a lowered limit makes the
// script fail, so the gates cannot pass on nothing. Timing is not run here.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url).pathname;
const script = join(root, 'scripts', 'check-budgets.mjs');
const reportPath = join(mkdtempSync(join(tmpdir(), 'visser-budgets-')), 'budgets.json');
const report = () => JSON.parse(readFileSync(reportPath, 'utf8')) as { ok: boolean; gates: { name: string; ok: boolean }[]; timing: string };
const run = (env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: { ...process.env, VISSER_BUDGET_TIMING: '', VISSER_BUDGET_REPORT: reportPath, ...env } });

describe('@BUDGETS performance budgets', () => {
  it('@BUDGETS every size, count, and limit gate passes on the reference fixture', () => {
    const r = run();
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    const result = report();
    expect(result.ok).toBe(true);
    expect(result.gates.length).toBeGreaterThanOrEqual(15);
    expect(result.gates.filter((g) => !g.ok)).toEqual([]);
    expect(result.timing).toMatch(/^not run/);
  }, 180_000);

  it('@BUDGETS a lowered limit fails the gate and the script exits 1', () => {
    const r = run({ VISSER_BUDGET_LIMITS: JSON.stringify({ readerJsGzip: 1000, skillWords: 10 }) });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(1);
    const failed = report().gates.filter((g) => !g.ok).map((g) => g.name);
    expect(failed).toContain('shared browser JS (reader.js, gzip -9)');
    expect(failed).toContain('core skill words (release SKILL.md)');
  }, 180_000);
});
