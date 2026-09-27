import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePacket, replaceTarget, resolveReference, showReference, type ReferencePacket } from '../../packages/core/src/references/index.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { runRefs } from '../../packages/cli/src/commands/refs.ts';
import { parseArgs } from '../../packages/cli/src/cli-util.ts';

const EXAMPLE = new URL('../../examples/bounded-queue/index.md', import.meta.url).pathname;

function tempRepo(): { repo: string; doc: string } {
  const repo = mkdtempSync(join(tmpdir(), 'explain-replace-'));
  mkdirSync(join(repo, '.git'));
  mkdirSync(join(repo, 'docs/explanations/queue'), { recursive: true });
  const doc = join(repo, 'docs/explanations/queue/index.md');
  copyFileSync(EXAMPLE, doc);
  return { repo, doc };
}

function readerPacket(repo: string, doc: string, id: string): ReferencePacket {
  return parsePacket(showReference(doc, id, { repoRoot: repo }).yaml.replace('issuedBy: refs-show', 'issuedBy: reader'));
}

/** Run `explain refs ...` in-process and capture stdout, stderr, and the exit code. */
async function refs(...argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => ((stdout += String(chunk)), true));
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => ((stderr += String(chunk)), true));
  try {
    const code = await runRefs(parseArgs(argv));
    return { code, stdout, stderr };
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('guarded replace (§11.9)', () => {
  it('changes only the target and its containing component @T15 @R19', () => {
    const { repo, doc } = tempRepo();
    const before = loadBundle(doc);
    const packet = readerPacket(repo, doc, 'enqueue');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    const replacement = current.current!.sourceText.replace('label="put waits while full"', 'label="put blocks while full"');
    const result = replaceTarget(packet, new TextEncoder().encode(replacement), current.currentRevision!, { repoRoot: repo });
    expect(validateAgainst('edit', result)).toEqual({ ok: true });
    expect(result.changedTargets).toEqual(['enqueue']);
    expect(result.containingTargets).toEqual(['handoff']);
    expect(result.dependentTargets).toEqual([{ target: 'enqueue', dependents: ['p_trace'] }]);
    const after = loadBundle(doc);
    for (const [id, record] of before.model.targets) {
      const now = after.model.targets.get(id)!;
      expect(now, id).toBeDefined();
      if (id !== 'enqueue' && id !== 'handoff') expect(now.bodySha256, id).toBe(record.bodySha256);
    }
    expect(after.model.targets.get('enqueue')!.label).toBe('put blocks while full');
    expect(existsSync(join(repo, '.explain/edit-locks', `${packet.docId}.lock`))).toBe(false);
  });

  it('rejects a replacement that drops a nested ID @T18', () => {
    const { repo, doc } = tempRepo();
    const packet = readerPacket(repo, doc, 'handoff');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    const text = current.current!.sourceText;
    const withoutDequeue = text.slice(0, text.indexOf('{% edge id="dequeue"')) + '{% /graph %}\n';
    const original = readFileSync(doc);
    expect(() => replaceTarget(packet, new TextEncoder().encode(withoutDequeue), current.currentRevision!, { repoRoot: repo }))
      .toThrow(expect.objectContaining({ code: 'E_ID_RETENTION' }));
    expect(readFileSync(doc)).toEqual(original);
    expect(readdirSync(join(repo, 'docs/explanations/queue'))).toEqual(['index.md']);
  });

  it('rejects a replacement that renames the target', () => {
    const { repo, doc } = tempRepo();
    const packet = readerPacket(repo, doc, 'p_limits');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    const renamed = current.current!.sourceText.replace('ex:id p_limits', 'ex:id p_other');
    expect(() => replaceTarget(packet, new TextEncoder().encode(renamed), current.currentRevision!, { repoRoot: repo }))
      .toThrow(expect.objectContaining({ code: 'E_ID_RETENTION' }));
  });

  it('accepts a split into the retained block and a new sibling', () => {
    const { repo, doc } = tempRepo();
    const packet = readerPacket(repo, doc, 'p_limits');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    const split = '<!-- ex:id p_limits_intro -->\nThis is a teaching implementation.\n\n<!-- ex:id p_limits -->\nIt has no timeout or cancellation.\n';
    const result = replaceTarget(packet, new TextEncoder().encode(split), current.currentRevision!, { repoRoot: repo });
    expect(result.addedTargets).toEqual(['p_limits_intro']);
    expect(result.changedTargets).toEqual(['p_limits']);
  });

  it('refuses to replace captured evidence', () => {
    const { repo, doc } = tempRepo();
    const packet = readerPacket(repo, doc, 'src_queue');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    expect(() => replaceTarget(packet, new TextEncoder().encode(current.current!.sourceText), current.currentRevision!, { repoRoot: repo }))
      .toThrow(/captured evidence/);
  });

  it('refuses a stale packet and a wrong expected revision', () => {
    const { repo, doc } = tempRepo();
    const packet = readerPacket(repo, doc, 'enqueue');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    const body = new TextEncoder().encode(current.current!.sourceText);
    expect(() => replaceTarget(packet, body, 'f'.repeat(64), { repoRoot: repo })).toThrow(expect.objectContaining({ code: 'E_REF_STALE' }));
    writeFileSync(doc, readFileSync(doc, 'utf8').replace('# A full queue', '# The full queue'));
    expect(() => replaceTarget(packet, body, current.currentRevision!, { repoRoot: repo })).toThrow(expect.objectContaining({ code: 'E_REF_STALE' }));
  });

  it('aborts when the file changes before rename @T20 @R13', () => {
    const { repo, doc } = tempRepo();
    const packet = readerPacket(repo, doc, 'enqueue');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    const external = readFileSync(doc, 'utf8').replace('# A full queue', '# An external edit');
    const replacement = new TextEncoder().encode(current.current!.sourceText.replace('put waits while full', 'put blocks'));
    expect(() => replaceTarget(packet, replacement, current.currentRevision!, {
      repoRoot: repo,
      fsContext: { beforeRename: (path) => writeFileSync(path, external) },
    })).toThrow(expect.objectContaining({ code: 'E_WRITE_CONFLICT' }));
    expect(readFileSync(doc, 'utf8')).toBe(external);
    expect(readdirSync(join(repo, 'docs/explanations/queue'))).toEqual(['index.md']);
    expect(existsSync(join(repo, '.explain/edit-locks', `${packet.docId}.lock`))).toBe(false);
  });

  it('refuses while another writer holds the lock @R13', () => {
    const { repo, doc } = tempRepo();
    const packet = readerPacket(repo, doc, 'enqueue');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    mkdirSync(join(repo, '.explain/edit-locks'), { recursive: true });
    const lockPath = join(repo, '.explain/edit-locks', `${packet.docId}.lock`);
    writeFileSync(lockPath, JSON.stringify({ pid: 1, startedAt: '2026-09-27T00:00:00Z', token: 'other' }));
    expect(() => replaceTarget(packet, new TextEncoder().encode(current.current!.sourceText), current.currentRevision!, { repoRoot: repo }))
      .toThrow(expect.objectContaining({ code: 'E_WRITE_CONFLICT', message: expect.stringContaining('token') }));
    expect(existsSync(lockPath)).toBe(true); // never break another writer's lock
  });

  it('refuses a symlinked lock directory and a symlinked primary file', () => {
    const { repo, doc } = tempRepo();
    const packet = readerPacket(repo, doc, 'enqueue');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    const body = new TextEncoder().encode(current.current!.sourceText);
    mkdirSync(join(repo, '.explain'));
    symlinkSync(mkdtempSync(join(tmpdir(), 'explain-evil-')), join(repo, '.explain/edit-locks'));
    expect(() => replaceTarget(packet, body, current.currentRevision!, { repoRoot: repo })).toThrow(expect.objectContaining({ code: 'E_PATH_ESCAPE' }));
    rmSync(join(repo, '.explain/edit-locks'));
    const real = join(repo, 'real.md');
    copyFileSync(doc, real);
    rmSync(doc);
    symlinkSync(real, doc);
    expect(() => replaceTarget(packet, body, current.currentRevision!, { repoRoot: repo, doc })).toThrow(expect.objectContaining({ code: 'E_PATH_ESCAPE' }));
  });

  it('keeps CRLF line endings in a CRLF document', () => {
    const { repo, doc } = tempRepo();
    writeFileSync(doc, readFileSync(doc, 'utf8').replace(/\n/g, '\r\n'));
    const packet = readerPacket(repo, doc, 'p_limits');
    const current = resolveReference(packet, { repoRoot: repo }).result;
    replaceTarget(packet, new TextEncoder().encode('<!-- ex:id p_limits -->\nShorter limits paragraph.\n'), current.currentRevision!, { repoRoot: repo });
    const text = readFileSync(doc, 'utf8');
    expect(text).toContain('<!-- ex:id p_limits -->\r\nShorter limits paragraph.\r\n');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('explain refs CLI', () => {
  it('runs the Phase 1 slice: show, move, stale resolve, refresh, replace, exact resolve @T03 @T09 @R12 @R13', async () => {
    const { repo, doc } = tempRepo();
    const dir = mkdtempSync(join(tmpdir(), 'explain-packets-'));
    const shown = await refs('show', doc, 'enqueue', '--root', repo);
    expect(shown.code).toBe(0);
    const packetPath = join(dir, 'packet.yaml');
    writeFileSync(packetPath, shown.stdout.replace('issuedBy: refs-show', 'issuedBy: reader'));

    const exact = await refs('resolve', '--packet', packetPath, '--root', repo, '--json');
    expect(exact.code).toBe(0);
    expect(JSON.parse(exact.stdout).status).toBe('exact');

    // Move the edge to the end of the graph.
    const text = readFileSync(doc, 'utf8');
    const start = text.indexOf('{% edge id="enqueue"');
    const end = text.indexOf('{% edge id="dequeue"');
    writeFileSync(doc, text.slice(0, start) + text.slice(end).replace('{% /graph %}', `${text.slice(start, end)}{% /graph %}`));

    const stale = await refs('resolve', '--packet', packetPath, '--root', repo, '--json');
    expect(stale.code).toBe(5);
    const staleResult = JSON.parse(stale.stdout);
    expect(staleResult).toMatchObject({ status: 'stale', targetBodyUnchanged: true });

    const refused = await refs('refresh', '--packet', packetPath, '--expected-current', staleResult.currentRevision, '--root', repo);
    expect(refused.code).toBe(5);
    const refreshed = await refs('refresh', '--packet', packetPath, '--expected-current', staleResult.currentRevision, '--acknowledge-stale', '--root', repo);
    expect(refreshed.code).toBe(0);
    const freshPath = join(dir, 'fresh.yaml');
    writeFileSync(freshPath, refreshed.stdout);

    const replacementPath = join(dir, 'replacement.md');
    writeFileSync(replacementPath, staleResult.current.sourceText.replace('label="put waits while full"', 'label="put blocks while the queue is full"'));
    const replaced = await refs('replace', '--packet', freshPath, '--replacement', replacementPath, '--expected-revision', staleResult.currentRevision, '--root', repo, '--json');
    expect(replaced.code, replaced.stderr).toBe(0);
    const edit = JSON.parse(replaced.stdout);
    expect(edit).toMatchObject({ schema: 'explain-edit/1', changedTargets: ['enqueue'], containingTargets: ['handoff'] });
    expect(edit.diff).toContain('+{% edge id="enqueue" from="producer" to="queue" kind="blocking-call" label="put blocks while the queue is full" %}');

    // The refreshed packet described the pre-edit text, so it is now stale; a new show is exact.
    expect((await refs('resolve', '--packet', freshPath, '--root', repo)).code).toBe(5);
    const again = await refs('show', doc, 'enqueue', '--root', repo, '--json');
    expect(JSON.parse(again.stdout).packet.label).toBe('put blocks while the queue is full');
  });

  it('maps outcomes to exit codes, including a malformed retire packet', async () => {
    const { repo, doc } = tempRepo();
    const dir = mkdtempSync(join(tmpdir(), 'explain-packets-'));
    const bad = join(dir, 'bad.yaml');
    writeFileSync(bad, 'schema: explain-ref/1\ndocId: nope\n');
    const invalid = await refs('resolve', '--packet', bad, '--root', repo, '--json');
    expect(invalid.code).toBe(2);
    expect(JSON.parse(invalid.stdout).status).toBe('invalid');
    // retire is implemented (Phase 3): a malformed packet is invalid input, not an unsupported command.
    expect((await refs('retire', '--packet', bad, '--reason', 'x', '--expected-revision', 'a'.repeat(64))).code).toBe(2);
    expect((await refs('show', doc, 'no_such_target', '--root', repo)).code).toBe(2);
    expect((await refs('show', join(repo, 'outside.md'), 'x', '--root', repo)).code).toBe(2);
    copyFileSync(EXAMPLE, join(repo, 'outside.md'));
    expect((await refs('show', join(repo, 'outside.md'), 'enqueue', '--root', repo)).code).toBe(4);
    expect((await refs('refresh', '--packet', bad, '--acknowledge-stale', 'oops')).code).toBe(2);
  });
});
