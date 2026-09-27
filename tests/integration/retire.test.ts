// refs retire and refs replace --retire (§11.11, §18.1 T07, T16, T17).
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePacket, replaceTarget, resolveReference, retireTarget, showReference, type ReferencePacket } from '../../packages/core/src/references/index.ts';
import { HashError } from '../../packages/core/src/model/hash.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { runRefs } from '../../packages/cli/src/commands/refs.ts';
import { CliError, parseArgs } from '../../packages/cli/src/cli-util.ts';

const QUEUE = new URL('../../examples/bounded-queue/index.md', import.meta.url).pathname;
const FLOW = new URL('../../examples/mermaid-flowchart/index.md', import.meta.url).pathname;

function tempRepo(example = QUEUE): { repo: string; doc: string } {
  const repo = mkdtempSync(join(tmpdir(), 'explain-retire-'));
  mkdirSync(join(repo, '.git'));
  mkdirSync(join(repo, 'docs/explanations/doc'), { recursive: true });
  const doc = join(repo, 'docs/explanations/doc/index.md');
  copyFileSync(example, doc);
  return { repo, doc };
}

const packetFor = (repo: string, doc: string, id: string): ReferencePacket => parsePacket(showReference(doc, id, { repoRoot: repo }).yaml);
const revision = (doc: string) => loadBundle(doc).sourceRevision!;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof HashError) return error.code;
    throw error;
  }
}

async function refs(...argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => ((stdout += String(chunk)), true));
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => ((stderr += String(chunk)), true));
  try {
    return { code: await runRefs(parseArgs(argv)), stdout, stderr };
  } catch (error) {
    // The CLI entry maps a CliError to its exit code; do the same here.
    if (error instanceof CliError) return { code: error.exitCode, stdout, stderr: stderr + `${error.code}: ${error.message}` };
    throw error;
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('refs retire (§11.11)', () => {
  it('removes the span and one blank line, records retiredTargets, and resolves deleted @T07 @R19 @R02', () => {
    const { repo, doc } = tempRepo();
    const before = loadBundle(doc);
    const packet = packetFor(repo, doc, 'p_limits');
    const result = retireTarget(packet, { reason: 'folded into the takeaway' }, before.sourceRevision!, { repoRoot: repo });
    expect(validateAgainst('edit', result)).toEqual({ ok: true });
    expect(result.retiredTargets).toEqual(['p_limits']);
    const after = loadBundle(doc);
    expect(after.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(after.model.targets.has('p_limits')).toBe(false);
    expect(after.parsed.frontmatter['retiredTargets']).toEqual({ p_limits: { reason: 'folded into the takeaway' } });
    // No new double blank line: the count of triple newlines (one is inside the captured code) is unchanged.
    const count = (t: string) => t.split('\n\n\n').length - 1;
    expect(count(readFileSync(doc, 'utf8'))).toBe(count(readFileSync(QUEUE, 'utf8')));
    // Every other target keeps its body hash.
    for (const [id, record] of before.model.targets) {
      if (id === 'p_limits') continue;
      expect(after.model.targets.get(id)?.bodySha256, id).toBe(record.bodySha256);
    }
    const resolved = resolveReference(packet, { repoRoot: repo }).result;
    expect(resolved.status).toBe('deleted');
  });

  it('records an advisory replacement that must be live and outside the span', () => {
    const { repo, doc } = tempRepo();
    expect(codeOf(() => retireTarget(packetFor(repo, doc, 'p_limits'), { reason: 'x', replacement: 'no_such' }, revision(doc), { repoRoot: repo }))).toBe('E_REF_BROKEN');
    expect(codeOf(() => retireTarget(packetFor(repo, doc, 'handoff'), { reason: 'x', replacement: 'enqueue' }, revision(doc), { repoRoot: repo }))).toBe('E_SEMANTIC');
    const packet = packetFor(repo, doc, 'p_limits');
    retireTarget(packet, { reason: 'merged', replacement: 'p_takeaway' }, revision(doc), { repoRoot: repo });
    const resolved = resolveReference(packet, { repoRoot: repo }).result;
    expect(resolved.status).toBe('deleted');
    expect(resolved.diagnostics[0]!.message).toContain('Advisory replacement: p_takeaway');
  });

  it('refuses while a live target still refers to a retired ID, and lists the referrers @T17', () => {
    const { repo, doc } = tempRepo();
    const original = readFileSync(doc);
    let message = '';
    try {
      retireTarget(packetFor(repo, doc, 'enqueue'), { reason: 'x' }, revision(doc), { repoRoot: repo });
    } catch (error) {
      expect((error as HashError).code).toBe('E_REF_BROKEN');
      message = (error as HashError).message;
    }
    expect(message).toContain('p_trace -> enqueue');
    expect(readFileSync(doc)).toEqual(original);
  });

  it('retires a nested edge: the edge resolves deleted and its figure goes stale @T16', () => {
    const { repo, doc } = tempRepo();
    const edge = packetFor(repo, doc, 'dequeue');
    const figure = packetFor(repo, doc, 'handoff');
    retireTarget(edge, { reason: 'the consumer side is out of scope' }, revision(doc), { repoRoot: repo });
    expect(resolveReference(edge, { repoRoot: repo }).result.status).toBe('deleted');
    const stale = resolveReference(figure, { repoRoot: repo }).result;
    expect(stale.status).toBe('stale');
    expect(stale.targetBodyUnchanged).toBe(false);
  });

  it('retiring a container retires every nested target', () => {
    const { repo, doc } = tempRepo();
    const annotation = packetFor(repo, doc, 'capacity_loop');
    const result = retireTarget(packetFor(repo, doc, 'wait_code'), { reason: 'the code walk-through moved to its own document' }, revision(doc), { repoRoot: repo });
    expect(result.retiredTargets).toEqual(['wait_code', 'capacity_loop']);
    const after = loadBundle(doc);
    expect(after.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(Object.keys(after.parsed.frontmatter['retiredTargets'] as object).sort()).toEqual(['capacity_loop', 'wait_code']);
    expect(resolveReference(annotation, { repoRoot: repo }).result.status).toBe('deleted');
  });

  it('refuses to retire a container whose nested targets are still referenced', () => {
    const { repo, doc } = tempRepo();
    // p_trace focuses on event_wait and event_remove inside the trace.
    expect(codeOf(() => retireTarget(packetFor(repo, doc, 'full_queue_trace'), { reason: 'x' }, revision(doc), { repoRoot: repo }))).toBe('E_REF_BROKEN');
  });

  it('refuses a replacement chain', () => {
    const { repo, doc } = tempRepo();
    retireTarget(packetFor(repo, doc, 'p_limits'), { reason: 'merged', replacement: 'p_takeaway' }, revision(doc), { repoRoot: repo });
    // p_takeaway is now the advisory replacement of a retired ID; retiring it would form a chain.
    // p_takeaway has no live referrers, so only the chain rule stops it.
    expect(codeOf(() => retireTarget(packetFor(repo, doc, 'p_takeaway'), { reason: 'x' }, revision(doc), { repoRoot: repo }))).toBe('E_SEMANTIC');
  });

  it('refuses a stale packet and a wrong expected revision', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'p_limits');
    const rev = revision(doc);
    expect(codeOf(() => retireTarget(packet, { reason: 'x' }, 'f'.repeat(64), { repoRoot: repo }))).toBe('E_REF_STALE');
    writeFileSync(doc, readFileSync(doc, 'utf8').replace('Why this is a loop', 'Why this loops'));
    expect(codeOf(() => retireTarget(packet, { reason: 'x' }, rev, { repoRoot: repo }))).toBe('E_REF_STALE');
  });

  it('refuses a symlinked primary file (guarded write)', () => {
    const { repo, doc } = tempRepo();
    const packet = packetFor(repo, doc, 'p_limits');
    const rev = revision(doc);
    const real = join(repo, 'real.md');
    copyFileSync(doc, real);
    rmSync(doc);
    symlinkSync(real, doc);
    expect(codeOf(() => retireTarget(packet, { reason: 'x' }, rev, { repoRoot: repo, doc }))).toBe('E_PATH_ESCAPE');
  });

  it('merge flow: replace the retained paragraph, then retire the other with it as replacement @T07', () => {
    const { repo, doc } = tempRepo();
    const keep = packetFor(repo, doc, 'p_takeaway');
    const view = resolveReference(keep, { repoRoot: repo }).result;
    const merged = view.current!.sourceText.replace(/\n$/, '') + ' It has no timeout or shutdown protocol.\n';
    replaceTarget(keep, new TextEncoder().encode(merged), view.currentRevision!, { repoRoot: repo });
    // Each write changes the revision, so take a current packet for the next step (§11.12).
    const other = packetFor(repo, doc, 'p_limits');
    const result = retireTarget(other, { reason: 'merged into p_takeaway', replacement: 'p_takeaway' }, revision(doc), { repoRoot: repo });
    expect(result.retiredTargets).toEqual(['p_limits']);
    expect(loadBundle(doc).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('refs replace --retire for nested IDs (§11.11)', () => {
  it('removes a Mermaid node that retire alone cannot delete', () => {
    const { repo, doc } = tempRepo(FLOW);
    const nodePacket = packetFor(repo, doc, 'articledb');
    // The node lies inside the fence: retire refuses it, and replace refuses it too.
    expect(codeOf(() => retireTarget(nodePacket, { reason: 'x' }, revision(doc), { repoRoot: repo }))).toBe('E_REF_INVALID');
    const figure = packetFor(repo, doc, 'cdn_path');
    const view = resolveReference(figure, { repoRoot: repo }).result;
    const without = view.current!.sourceText.replace('    OriginApi[Origin API] -->|render query| ArticleDb[(Article database)]\n', '    OriginApi[Origin API]\n');
    expect(without).not.toBe(view.current!.sourceText);
    // Dropping the node without --retire fails with E_ID_RETENTION.
    expect(codeOf(() => replaceTarget(figure, new TextEncoder().encode(without), view.currentRevision!, { repoRoot: repo }))).toBe('E_ID_RETENTION');
    const result = replaceTarget(figure, new TextEncoder().encode(without), view.currentRevision!, { repoRoot: repo, retire: [{ id: 'articledb', reason: 'the database is out of scope' }] });
    expect(result.retiredTargets).toEqual(['articledb']);
    expect(validateAgainst('edit', result)).toEqual({ ok: true });
    const after = loadBundle(doc);
    expect(after.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(after.model.targets.has('articledb')).toBe(false);
    expect(resolveReference(nodePacket, { repoRoot: repo }).result.status).toBe('deleted');
  });

  it('refuses --retire for an ID that is not nested in the target, or that the replacement keeps', () => {
    const { repo, doc } = tempRepo();
    const figure = packetFor(repo, doc, 'handoff');
    const view = resolveReference(figure, { repoRoot: repo }).result;
    const same = new TextEncoder().encode(view.current!.sourceText);
    expect(codeOf(() => replaceTarget(figure, same, view.currentRevision!, { repoRoot: repo, retire: [{ id: 'p_limits', reason: 'x' }] }))).toBe('E_SEMANTIC');
    expect(codeOf(() => replaceTarget(figure, same, view.currentRevision!, { repoRoot: repo, retire: [{ id: 'dequeue', reason: 'x' }] }))).toBe('E_SEMANTIC');
  });
});

describe('explain refs retire CLI', () => {
  it('retires with --json output and maps refusals to exit codes', async () => {
    const { repo, doc } = tempRepo();
    const dir = mkdtempSync(join(tmpdir(), 'explain-packets-'));
    const packetPath = join(dir, 'p.yaml');
    writeFileSync(packetPath, showReference(doc, 'p_limits', { repoRoot: repo }).yaml);
    const rev = revision(doc);
    const noReason = await refs('retire', '--packet', packetPath, '--expected-revision', rev, '--root', repo);
    expect(noReason.code).toBe(2);
    const badReason = await refs('retire', '--packet', packetPath, '--reason', 'two\nlines', '--expected-revision', rev, '--root', repo);
    expect(badReason.code).toBe(2);
    const ok = await refs('retire', '--packet', packetPath, '--reason', 'folded in', '--expected-revision', rev, '--root', repo, '--json');
    expect(ok.code, ok.stderr).toBe(0);
    expect(JSON.parse(ok.stdout).retiredTargets).toEqual(['p_limits']);
    const edgePath = join(dir, 'e.yaml');
    writeFileSync(edgePath, showReference(doc, 'enqueue', { repoRoot: repo }).yaml);
    const referred = await refs('retire', '--packet', edgePath, '--reason', 'x', '--expected-revision', revision(doc), '--root', repo);
    expect(referred.code).toBe(2);
    expect(referred.stderr).toContain('E_REF_BROKEN');
  });

  it('pairs repeated --retire and --reason flags for refs replace', async () => {
    const { repo, doc } = tempRepo(FLOW);
    const dir = mkdtempSync(join(tmpdir(), 'explain-packets-'));
    const packetPath = join(dir, 'p.yaml');
    writeFileSync(packetPath, showReference(doc, 'cdn_path', { repoRoot: repo }).yaml);
    const view = resolveReference(parsePacket(readFileSync(packetPath, 'utf8')), { repoRoot: repo }).result;
    const replacementPath = join(dir, 'r.md');
    writeFileSync(replacementPath, view.current!.sourceText.replace('    OriginApi[Origin API] -->|render query| ArticleDb[(Article database)]\n', '    OriginApi[Origin API]\n'));
    const mismatched = await refs('replace', '--packet', packetPath, '--replacement', replacementPath, '--expected-revision', view.currentRevision!, '--retire', 'articledb', '--root', repo);
    expect(mismatched.code).toBe(2);
    const ok = await refs('replace', '--packet', packetPath, '--replacement', replacementPath, '--expected-revision', view.currentRevision!, '--retire', 'articledb', '--reason', 'out of scope', '--root', repo, '--json');
    expect(ok.code, ok.stderr).toBe(0);
    expect(JSON.parse(ok.stdout).retiredTargets).toEqual(['articledb']);
  });
});
