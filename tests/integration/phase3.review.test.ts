// Phase 3 code-review fixes for the guarded write, retire, and fork
// (spikes/phase3-code-review/b). Each case is an input that the first Phase 3
// implementation handled wrongly.
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError, parseArgs, stringFlag } from '../../packages/cli/src/cli-util.ts';
import { runRefs } from '../../packages/cli/src/commands/refs.ts';
import { runCapture } from '../../packages/cli/src/commands/capture.ts';
import { HashError } from '../../packages/core/src/model/hash.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { forkDocument, parsePacket, replaceTarget, resolveReference, retireTarget, showReference } from '../../packages/core/src/references/index.ts';

const EXAMPLE = new URL('../../examples/bounded-queue/index.md', import.meta.url).pathname;

function tempRepo(): { repo: string; doc: string } {
  const repo = mkdtempSync(join(tmpdir(), 'explain-p3review-'));
  mkdirSync(join(repo, '.git'));
  mkdirSync(join(repo, 'docs/explanations/queue'), { recursive: true });
  const doc = join(repo, 'docs/explanations/queue/index.md');
  copyFileSync(EXAMPLE, doc);
  return { repo, doc };
}

function failure(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (error) {
    if (error instanceof HashError) return { code: error.code, message: error.message };
    throw error;
  }
  return { code: 'ok', message: '' };
}

function replace(targetId: string, mutate: (span: string) => string) {
  const { repo, doc } = tempRepo();
  const packet = parsePacket(showReference(doc, targetId, { repoRoot: repo }).yaml);
  const current = resolveReference(packet, { repoRoot: repo }).result;
  const replacement = mutate(current.current!.sourceText);
  return failure(() => replaceTarget(packet, new TextEncoder().encode(replacement), current.currentRevision!, { repoRoot: repo }));
}

describe('replace keeps its own ID checks under the guarded write (review B1) @T18', () => {
  it('a replacement that duplicates a nested ID is E_ID_RETENTION', () => {
    const r = replace('handoff', (span) => span.replace('{% node id="queue"', '{% node id="producer" label="Again" role="process" %}\nX\n{% /node %}\n\n{% node id="queue"'));
    expect(r.code).toBe('E_ID_RETENTION');
  });

  it('a replacement that adds a sibling with an existing ID is E_ID_RETENTION', () => {
    const r = replace('p_limits', (span) => span + '\n<!-- ex:id p_trace -->\nDuplicate.\n');
    expect(r.code).toBe('E_ID_RETENTION');
  });

  it('the message for another candidate error names its line', () => {
    const r = replace('p_limits', (span) => span.replace('fairness guarantee.', 'fairness guarantee. {% cite ref="src_missing" /%}'));
    expect(r.code).toBe('E_REF_BROKEN');
    expect(r.message).toMatch(/\(line \d+\)/);
  });
});

describe('retire quotes YAML-reserved IDs in retiredTargets (review B3)', () => {
  it('retires true and null with replacement false; each resolves deleted with its advisory replacement', () => {
    const { repo, doc } = tempRepo();
    writeFileSync(doc, `---\nformat: explain/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: Reserved IDs\nkind: teaching\ncapturedAt: 2026-09-26T00:00:00Z\nvisibility: private\n---\n\n<!-- ex:id false -->\nKeep.\n\n<!-- ex:id true -->\nFirst.\n\n<!-- ex:id null -->\nSecond.\n`);
    expect(loadBundle(doc).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    for (const [id, replacement] of [['true', 'false'], ['null', 'false']] as const) {
      const packet = parsePacket(showReference(doc, id, { repoRoot: repo }).yaml);
      expect(failure(() => retireTarget(packet, { reason: 'gone', replacement }, loadBundle(doc).sourceRevision!, { repoRoot: repo })).code, id).toBe('ok');
      const resolved = resolveReference(packet, { repoRoot: repo }).result;
      expect(resolved.status, id).toBe('deleted');
      expect(resolved.diagnostics[0]!.message, id).toContain(`Advisory replacement: ${replacement}`);
    }
    const after = loadBundle(doc);
    expect(after.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(after.parsed.frontmatter['retiredTargets']).toEqual({ true: { reason: 'gone', replacement: 'false' }, null: { reason: 'gone', replacement: 'false' } });
  });
});

function forkRepo(): { repo: string; dir: string; doc: string } {
  const repo = mkdtempSync(join(tmpdir(), 'explain-p3fork-'));
  mkdirSync(join(repo, '.git'));
  const dir = join(repo, 'docs/explanations/source');
  mkdirSync(dir, { recursive: true });
  cpSync(new URL('../../examples/bounded-queue/', import.meta.url).pathname, dir, { recursive: true });
  return { repo, dir, doc: join(dir, 'index.md') };
}

describe('fork (review B4, B5, B6a)', () => {
  it('B4: the docId rewrite keeps the quote style and a trailing comment; only the UUID differs', () => {
    const { repo, doc } = forkRepo();
    const source = readFileSync(doc, 'utf8');
    const docId = /docId: (\S+)/.exec(source)![1]!;
    writeFileSync(doc, source.replace(`docId: ${docId}`, `docId: '${docId}'   # stable identity`));
    const dest = join(repo, 'docs/explanations/copy');
    const result = forkDocument(doc, dest, { repoRoot: repo });
    expect(readFileSync(join(dest, 'index.md'), 'utf8')).toBe(readFileSync(doc, 'utf8').replace(docId, result.docId));
  });

  it('B5: refuses a DEST inside another bundle (an ancestor holds index.md)', () => {
    const { repo, doc } = forkRepo();
    const other = join(repo, 'docs/explanations/other');
    mkdirSync(join(other, 'deeper'), { recursive: true });
    writeFileSync(join(other, 'index.md'), 'x');
    for (const dest of [join(other, 'copy'), join(other, 'deeper', 'copy')]) {
      expect(failure(() => forkDocument(doc, dest, { repoRoot: repo })).code, dest).toBe('E_USAGE');
      expect(existsSync(dest), dest).toBe(false);
    }
  });

  it('B6a: DEST is claimed with an exclusive mkdir before the rename', () => {
    const { repo, doc } = forkRepo();
    const dest = join(repo, 'docs/explanations/copy');
    let racer: string | undefined;
    const result = forkDocument(doc, dest, {
      repoRoot: repo,
      fsContext: {
        afterClaim: (claimed) => {
          try {
            mkdirSync(claimed);
            racer = 'created';
          } catch (error) {
            racer = (error as NodeJS.ErrnoException).code;
          }
        },
      },
    });
    expect(racer).toBe('EEXIST');
    expect(loadBundle(result.path).docId).toBe(result.docId);
  });
});

describe('repeated single-valued guard flags are refused (review B7)', () => {
  const GUARDS = ['expected-revision', 'expected-current', 'packet', 'doc', 'id', 'repo', 'rev', 'file', 'lines'];

  it('stringFlag refuses a repeated flag in both spellings', () => {
    for (const name of GUARDS) {
      for (const argv of [[`--${name}`, 'a', `--${name}`, 'b'], [`--${name}=a`, `--${name}=a`]]) {
        let error: unknown;
        try { stringFlag(parseArgs(argv), name); } catch (e) { error = e; }
        expect(error, argv.join(' ')).toBeInstanceOf(CliError);
        expect((error as CliError).code, argv.join(' ')).toBe('E_USAGE');
      }
    }
  });

  it('refs replace and capture git refuse a second --expected-revision or --rev before any write', async () => {
    const { repo, doc } = tempRepo();
    const before = readFileSync(doc);
    const packetFile = join(repo, 'p.yaml');
    writeFileSync(packetFile, showReference(doc, 'p_limits', { repoRoot: repo }).yaml);
    const replacement = join(repo, 'r.md');
    writeFileSync(replacement, '<!-- ex:id p_limits -->\nChanged.\n');
    const rev = loadBundle(doc).sourceRevision!;
    const codeOf = async (run: () => Promise<number>) => {
      try { return `exit ${await run()}`; } catch (e) { if (e instanceof CliError) return e.code; throw e; }
    };
    expect(await codeOf(() => runRefs(parseArgs(['replace', '--packet', packetFile, '--replacement', replacement, '--expected-revision', 'f'.repeat(64), '--expected-revision', rev, '--doc', doc, '--root', repo])))).toBe('E_USAGE');
    expect(await codeOf(() => runCapture(parseArgs(['git', '--repo', repo, '--rev', 'HEAD', '--rev', 'HEAD~1', '--file', 'a', '--lines', '1:1', '--doc', doc, '--id', 'src_x', '--title', 'X', '--repository-label', 'x'])))).toBe('E_USAGE');
    expect(readFileSync(doc).equals(before)).toBe(true);
  });
});
