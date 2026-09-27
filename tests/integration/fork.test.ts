// visser fork (§11.5, §17.1, §18.1 T06).
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forkDocument, parsePacket, resolveReference, retireTarget, showReference } from '../../packages/core/src/references/index.ts';
import { HashError } from '../../packages/core/src/model/hash.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { runFork } from '../../packages/cli/src/commands/fork.ts';
import { CliError, parseArgs } from '../../packages/cli/src/cli-util.ts';

const QUEUE = new URL('../../examples/bounded-queue/', import.meta.url).pathname;
const RETRY = new URL('../../examples/deadline-retry/', import.meta.url).pathname;

function tempRepo(example = QUEUE): { repo: string; dir: string; doc: string } {
  const repo = mkdtempSync(join(tmpdir(), 'visser-fork-'));
  mkdirSync(join(repo, '.git'));
  const dir = join(repo, 'docs/explanations/source');
  mkdirSync(dir, { recursive: true });
  cpSync(example, dir, { recursive: true });
  return { repo, dir, doc: join(dir, 'index.md') };
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof HashError) return error.code;
    throw error;
  }
}

afterEach(() => vi.restoreAllMocks());

describe('fork (§11.5)', () => {
  it('creates a new document identity; original packets do not address the fork @T06 @R02', () => {
    const { repo, doc } = tempRepo();
    const packet = parsePacket(showReference(doc, 'enqueue', { repoRoot: repo }).yaml);
    const dest = join(repo, 'docs/explanations/copy');
    const result = forkDocument(doc, dest, { repoRoot: repo });
    const source = loadBundle(doc);
    const fork = loadBundle(join(dest, 'index.md'));
    expect(fork.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.docId).not.toBe(source.docId);
    expect(fork.docId).toBe(result.docId);
    // Internal target IDs are kept.
    expect([...fork.model.targets.keys()].sort()).toEqual([...source.model.targets.keys()].sort());
    // Only docId changed in the source text.
    expect(readFileSync(join(dest, 'index.md'), 'utf8')).toBe(readFileSync(doc, 'utf8').replace(source.docId!, result.docId));
    // The original packet still resolves to the original, and never to the fork.
    expect(resolveReference(packet, { repoRoot: repo }).result.status).toBe('exact');
    expect(resolveReference(packet, { repoRoot: repo, doc: join(dest, 'index.md') }).result.status).toBe('missing');
  });

  it('copies declared files and the lock only, never an undeclared file', () => {
    const { repo, dir, doc } = tempRepo(RETRY);
    writeFileSync(join(dir, 'notes.txt'), 'private scratch notes\n');
    writeFileSync(join(dir, 'visser.lock.json'), '{"schema":"visser-lock/1"}\n');
    const dest = join(repo, 'docs/explanations/copy');
    const result = forkDocument(doc, dest, { repoRoot: repo });
    expect(result.files.sort()).toEqual(['assets/retry-timeline.png', 'index.md', 'visser.lock.json']);
    expect(existsSync(join(dest, 'notes.txt'))).toBe(false);
    expect(readFileSync(join(dest, 'assets/retry-timeline.png'))).toEqual(readFileSync(join(dir, 'assets/retry-timeline.png')));
  });

  it('refuses when an empty DEST appears before the rename, instead of replacing it', () => {
    const { repo, doc } = tempRepo();
    const dest = join(repo, 'docs/explanations/copy');
    // rename(2) replaces an empty directory, so an existence check alone would overwrite this.
    const code = codeOf(() => forkDocument(doc, dest, { repoRoot: repo, fsContext: { beforeRename: () => mkdirSync(dest) } }));
    expect(code).toBe('E_USAGE');
    expect(readdirSync(dest)).toEqual([]);
  });

  it('keeps retiredTargets', () => {
    const { repo, doc } = tempRepo();
    const packet = parsePacket(showReference(doc, 'p_limits', { repoRoot: repo }).yaml);
    retireTarget(packet, { reason: 'folded in' }, loadBundle(doc).sourceRevision!, { repoRoot: repo });
    const dest = join(repo, 'docs/explanations/copy');
    forkDocument(doc, dest, { repoRoot: repo });
    expect(loadBundle(join(dest, 'index.md')).parsed.frontmatter['retiredTargets']).toEqual({ p_limits: { reason: 'folded in' } });
  });

  it('refuses a symlinked declared asset and a symlinked lock', () => {
    const asset = tempRepo(RETRY);
    const png = join(asset.dir, 'assets/retry-timeline.png');
    const outside = join(asset.repo, 'outside.png');
    copyFileSync(png, outside);
    unlinkSync(png);
    symlinkSync(outside, png);
    expect(codeOf(() => forkDocument(asset.doc, join(asset.repo, 'docs/explanations/copy'), { repoRoot: asset.repo }))).toBe('E_PATH_ESCAPE');

    const lock = tempRepo();
    writeFileSync(join(lock.repo, 'lock.json'), '{}\n');
    symlinkSync(join(lock.repo, 'lock.json'), join(lock.dir, 'visser.lock.json'));
    expect(codeOf(() => forkDocument(lock.doc, join(lock.repo, 'docs/explanations/copy'), { repoRoot: lock.repo }))).toBe('E_PATH_ESCAPE');
    expect(existsSync(join(lock.repo, 'docs/explanations/copy'))).toBe(false);
  });

  it('refuses a destination that exists, is inside the source bundle, or is outside the document roots', () => {
    const { repo, dir, doc } = tempRepo();
    const existing = join(repo, 'docs/explanations/existing');
    mkdirSync(existing);
    expect(codeOf(() => forkDocument(doc, existing, { repoRoot: repo }))).toBe('E_USAGE');
    expect(codeOf(() => forkDocument(doc, join(dir, 'nested'), { repoRoot: repo }))).toBe('E_USAGE');
    expect(codeOf(() => forkDocument(doc, join(repo, 'elsewhere'), { repoRoot: repo }))).toBe('E_PATH_ESCAPE');
    expect(codeOf(() => forkDocument(doc, join(repo, 'docs/explanations'), { repoRoot: repo }))).toBe('E_USAGE');
    // Nothing was left behind.
    expect(readdirSync(join(repo, 'docs/explanations')).sort()).toEqual(['existing', 'source']);
  });

  it('refuses to fork a document with errors', () => {
    const { repo, doc } = tempRepo();
    writeFileSync(doc, readFileSync(doc, 'utf8').replace('<!-- vs:id p_limits -->\n', ''));
    expect(codeOf(() => forkDocument(doc, join(repo, 'docs/explanations/copy'), { repoRoot: repo }))).toBe('E_ID_MISSING');
  });
});

describe('visser fork CLI', () => {
  async function fork(...argv: string[]): Promise<{ code: number; stdout: string }> {
    let stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => ((stdout += String(chunk)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      return { code: await runFork(parseArgs(argv)), stdout };
    } catch (error) {
      if (error instanceof CliError) return { code: error.exitCode, stdout };
      throw error;
    } finally {
      vi.restoreAllMocks();
    }
  }

  it('prints the new identity as JSON and maps refusals to exit codes', async () => {
    const { repo, doc } = tempRepo();
    const ok = await fork(doc, join(repo, 'docs/explanations/copy'), '--root', repo, '--json');
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).schema).toBe('visser-fork/1');
    expect((await fork(doc, join(repo, 'docs/explanations/copy'), '--root', repo)).code).toBe(2);
    expect((await fork(doc, join(repo, 'outside'), '--root', repo)).code).toBe(4);
    expect((await fork(doc, '--root', repo)).code).toBe(2);
  });
});

