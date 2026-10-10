import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url).pathname;
const node = '/opt/codex-desktop/resources/cua_node/bin/node';
const release = join(root, 'dist/release');
const cli = join(release, 'bin/visser.cjs');
const source = `---
format: visser/1
docId: 7d2b9c1e-3f4a-4b5c-8d6e-9f0a1b2c3d50
title: Flow identity
kind: reference
capturedAt: 2026-10-10T00:00:00Z
visibility: private
---

{% flowchart id="process" title="Review order" question="Can it proceed?" direction="down" %}
{% group id="review" label="Review" color="teal" /%}
{% start id="received" label="Received" /%}
{% action id="check" label="Check order" group="review" /%}
{% decision id="valid" label="Valid?" group="review" /%}
{% action id="repair" label="Repair" group="review" /%}
{% end id="ready" label="Ready" /%}
{% flow id="receive" from="received" to="check" /%}
{% flow id="decide" from="check" to="valid" /%}
{% flow id="yes" from="valid" to="ready" label="Yes" /%}
{% flow id="retry" from="valid" to="repair" label="No" /%}
{% flow id="again" from="repair" to="check" label="Corrected" %}
Retry explanation is source-owned.
{% /flow %}
{% /flowchart %}`;

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'visser-flow-identity-'));
  mkdirSync(join(repo, '.git'));
  const doc = join(repo, 'docs/explanations/flow/index.md');
  mkdirSync(join(repo, 'docs/explanations/flow'), { recursive: true });
  writeFileSync(doc, source);
  const run = (...args: string[]) => spawnSync(node, [cli, ...args], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  return { repo, doc, run, close: () => rmSync(repo, { recursive: true, force: true }) };
}

describe('native flowchart identity through the built CLI', () => {
  it('checks and exports canonical flow labels without rewriting authored conditions', () => {
    const fx = fixture();
    try {
      const check = fx.run('check', fx.doc, '--toolkit-dir', release, '--json');
      expect(check.status, check.stderr).toBe(0);
      const markdown = join(fx.repo, 'document.md');
      const exported = fx.run('export', fx.doc, '--format', 'markdown', '--out', markdown, '--dev-toolkit', release);
      expect(exported.status, exported.stderr).toBe(0);
      const text = readFileSync(markdown, 'utf8');
      expect(text).toContain('Received — continues to → Check order');
      expect(text).toContain('Repair — Corrected → Check order');
      expect(text).toContain('Retry explanation is source-owned.');
    } finally { fx.close(); }
  });

  it('shows and resolves an explicit flow as its own source target with original endpoints', () => {
    const fx = fixture();
    try {
      const shown = fx.run('refs', 'show', fx.doc, 'again', '--root', fx.repo, '--json');
      expect(shown.status, `${shown.stdout}\n${shown.stderr}`).toBe(0);
      const show = JSON.parse(shown.stdout);
      expect(show.packet).toMatchObject({ targetId: 'again', kind: 'flow', label: 'Repair — Corrected → Check order' });
      const packet = join(fx.repo, 'again.yaml');
      writeFileSync(packet, show.yaml);
      const resolved = fx.run('refs', 'resolve', '--packet', packet, '--root', fx.repo, '--json');
      expect(resolved.status, resolved.stderr).toBe(0);
      const result = JSON.parse(resolved.stdout);
      expect(result).toMatchObject({ status: 'exact', targetId: 'again', current: { target: { id: 'again', kind: 'flow' } } });
      expect(result.current.sourceText).toContain('from="repair" to="check" label="Corrected"');
      expect(result.current.sourceText).toContain('Retry explanation is source-owned.');
    } finally { fx.close(); }
  });

  it('uses guarded replace for a flow body and keeps IDs stable through label, color, and direction edits', () => {
    const fx = fixture();
    try {
      const shown = JSON.parse(fx.run('refs', 'show', fx.doc, 'again', '--root', fx.repo, '--json').stdout);
      const packet = join(fx.repo, 'again.yaml'); writeFileSync(packet, shown.yaml);
      const view = JSON.parse(fx.run('refs', 'resolve', '--packet', packet, '--root', fx.repo, '--json').stdout);
      const replacement = join(fx.repo, 'replacement.md');
      writeFileSync(replacement, view.current.sourceText.replace('Retry explanation is source-owned.', 'Retry explanation changed.'));
      const replaced = fx.run('refs', 'replace', '--packet', packet, '--replacement', replacement, '--expected-revision', view.currentRevision, '--root', fx.repo, '--json');
      expect(replaced.status, replaced.stderr).toBe(0);
      writeFileSync(fx.doc, readFileSync(fx.doc, 'utf8').replace('direction="down"', 'direction="right"').replace('color="teal"', 'color="amber"').replace('label="Corrected"', 'label="Fixed"'));
      const markdown = join(fx.repo, 'after.md');
      expect(fx.run('export', fx.doc, '--format', 'markdown', '--out', markdown, '--dev-toolkit', release).status).toBe(0);
      const text = readFileSync(markdown, 'utf8');
      for (const id of ['process', 'review', 'received', 'check', 'valid', 'repair', 'ready', 'receive', 'decide', 'yes', 'retry', 'again']) expect(text).toContain(`<!-- vs:target ${id} -->`);
      expect(text).toContain('Repair — Fixed → Check order');
      expect(text).toContain('Retry explanation changed.');
    } finally { fx.close(); }
  });
});
