// `explain build DOC [--out DIR] [--toolkit-dir DIR | --dev-toolkit DIR]
//   [--allow-layout-fallback]` (§13.1, §17.1). No source mutation, no network.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadBundle } from '../../../core/src/model/bundle.ts';
import { CompileError, compileDocument, workerLayout, type CompileResult } from '../../../core/src/compiler/index.ts';
import { createHash } from 'node:crypto';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, stringFlag } from '../cli-util.ts';
import { resolveForDocument, type ToolkitSelection } from '../toolkit.ts';

export type BuildOutcome = {
  outDir: string;
  result: CompileResult;
  toolkit: ToolkitSelection;
  snapshotPath: string; // site-relative path of index.html
  frontmatter: Record<string, unknown>;
};

/** Nearest ancestor with .git or .explain, else the document folder. */
export function repoRootFor(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.explain'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export async function buildDocument(args: ParsedArgs): Promise<BuildOutcome> {
  const doc = args.positional[0];
  if (!doc) throw new CliError('E_USAGE', 'usage: explain build DOC [--out DIR] [--toolkit-dir DIR | --dev-toolkit DIR]', EXIT.invalid);
  const indexPath = resolve(doc);
  if (!existsSync(indexPath)) throw new CliError('E_SOURCE_UNAVAILABLE', `cannot read ${doc}`, EXIT.unavailable);
  const bundle = loadBundle(indexPath);
  const code = exitCodeFor(bundle.diagnostics);
  printDiagnostics(bundle.diagnostics.filter((d) => d.severity === 'warning'), false);
  if (code !== EXIT.ok) {
    printDiagnostics(bundle.diagnostics.filter((d) => d.severity === 'error'), false);
    throw new CliError('E_BUILD', 'build stopped: the source has errors', code);
  }

  const toolkit = resolveForDocument(bundle.root, stringFlag(args, 'toolkit-dir'), stringFlag(args, 'dev-toolkit'));
  for (const warning of toolkit.warnings) process.stderr.write(`warning ${warning}\n`);

  const releaseDir = toolkit.release.dir;
  const assetSha = (name: string) => createHash('sha256').update(readFileSync(join(releaseDir, 'browser', name))).digest('hex');
  const workerPath = join(releaseDir, 'workers', 'layout.cjs');
  let result: CompileResult;
  try {
    result = await compileDocument(
      bundle,
      { version: toolkit.release.version, sha256: toolkit.release.sha256, assets: { 'reader.js': assetSha('reader.js'), 'reader.css': assetSha('reader.css') } },
      {
        audience: 'private',
        includeSource: false,
        layoutFallback: args.flags.has('allow-layout-fallback'),
        ...(existsSync(workerPath) ? { layout: workerLayout(workerPath) } : {}),
        nodeVersion: process.version,
      },
    );
  } catch (error) {
    if (!(error instanceof CompileError)) throw error;
    printDiagnostics(error.diagnostics, false);
    throw new CliError('E_BUILD', 'build stopped: compilation failed', exitCodeFor(error.diagnostics));
  }
  printDiagnostics(result.diagnostics.filter((d) => d.severity === 'warning'), false);

  const outDir = resolve(stringFlag(args, 'out') ?? join(repoRootFor(bundle.root), '.explain', 'output'));
  const snapshotDir = `d/${result.docId}/${result.sourceRevision}/${result.buildId}`;
  const finalDir = join(outDir, snapshotDir);

  // Shared asset pack: copied once per toolkit digest (§13.1).
  const assetDir = join(outDir, '_explain', 'assets', toolkit.release.sha256);
  if (!existsSync(assetDir)) {
    mkdirSync(dirname(assetDir), { recursive: true });
    const tmp = mkdtempSync(join(dirname(assetDir), '.tmp-'));
    for (const name of ['reader.js', 'reader.css']) {
      writeFileSync(join(tmp, name), readFileSync(join(toolkit.release.dir, 'browser', name)));
    }
    renameSync(tmp, assetDir);
  }

  // Immutable snapshot: publish atomically; an existing snapshot is left untouched.
  if (!existsSync(finalDir)) {
    mkdirSync(dirname(finalDir), { recursive: true });
    const tmp = mkdtempSync(join(dirname(finalDir), '.tmp-'));
    try {
      for (const file of result.files) {
        const rel = file.path.slice(snapshotDir.length + 1);
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), file.bytes);
      }
      renameSync(tmp, finalDir);
    } catch (error) {
      rmSync(tmp, { recursive: true, force: true });
      throw error;
    }
  }
  return { outDir, result, toolkit, snapshotPath: `${snapshotDir}/index.html`, frontmatter: bundle.parsed.frontmatter };
}

export async function runBuild(args: ParsedArgs): Promise<number> {
  const outcome = await buildDocument(args);
  const { result } = outcome;
  const dev = outcome.toolkit.development ? ' (development build)' : '';
  process.stdout.write(
    `built ${outcome.snapshotPath}${dev}\n  out: ${outcome.outDir}\n  docId: ${result.docId}\n  source revision: ${result.sourceRevision}\n  build ID: ${result.buildId}\n`,
  );
  return EXIT.ok;
}
