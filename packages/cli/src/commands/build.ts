// `explain build DOC [--out DIR] [--toolkit-dir DIR | --dev-toolkit DIR]
//   [--allow-layout-fallback]` (§13.1, §17.1). No source mutation, no network.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadBundle, type LoadedBundle } from '../../../core/src/model/bundle.ts';
import { CompileError, compileDocument, workerLayout, type CompileResult } from '../../../core/src/compiler/index.ts';
import { createHash } from 'node:crypto';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, stringFlag } from '../cli-util.ts';
import { resolveForDocument, type ToolkitSelection } from '../toolkit.ts';
import { bindExtensions } from '../../../core/src/extensions/registry.ts';
import { HashError } from '../../../core/src/model/hash.ts';

export type BuildOutcome = {
  outDir: string;
  result: CompileResult;
  toolkit: ToolkitSelection;
  snapshotPath: string; // site-relative path of index.html
  frontmatter: Record<string, unknown>;
};

/**
 * Copy each named browser asset from the release into the output asset
 * directory unless an identical copy is already there. Each copy is checked
 * against the release manifest's digest and written through a temporary file.
 */
export function copyAssets(releaseDir: string, assetDir: string, names: string[]): void {
  const manifest = JSON.parse(readFileSync(join(releaseDir, 'release.json'), 'utf8')) as { files: Array<{ path: string; sha256: string }> };
  mkdirSync(assetDir, { recursive: true });
  for (const name of names) {
    const expected = manifest.files.find((f) => f.path === `browser/${name}`)?.sha256;
    const bytes = readFileSync(join(releaseDir, 'browser', name));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (!expected || actual !== expected) {
      throw new CliError('E_INTEGRITY', `browser/${name} does not match release.json`, EXIT.security);
    }
    const dest = join(assetDir, name);
    if (existsSync(dest) && createHash('sha256').update(readFileSync(dest)).digest('hex') === expected) continue;
    const tmp = join(assetDir, `.${name}.${process.pid}.tmp`);
    writeFileSync(tmp, bytes);
    renameSync(tmp, dest);
  }
}

export type CompileRequest = {
  audience: 'private' | 'public';
  includeSource: boolean;
  layoutFallback: boolean;
  nodeVersion: string;
  /** Show the source text of extension components whose extension cannot run (§14). */
  extensionFallback?: boolean;
};

/**
 * Compile a loaded bundle with a resolved toolkit: asset digests and the
 * Mermaid SRI value come from the toolkit's verified release, and workers
 * come only from the running CLI's own release (§12.4). Shared by `build`
 * and `export`.
 */
export async function compileWithToolkit(bundle: LoadedBundle, toolkit: ToolkitSelection, request: CompileRequest): Promise<CompileResult> {
  const releaseDir = toolkit.release.dir;
  const assetSha = (name: string) => createHash('sha256').update(readFileSync(join(releaseDir, 'browser', name))).digest('hex');
  const mermaidPath = join(releaseDir, 'browser', 'mermaid.js');
  // SRI value for the lazily loaded Mermaid asset (§9.12).
  const integrity = existsSync(mermaidPath)
    ? { 'mermaid.js': `sha384-${createHash('sha384').update(readFileSync(mermaidPath)).digest('base64')}` }
    : undefined;
  // Workers come only from the running CLI's own release (§12.4 "Whose code
  // runs"); in source mode there is none, and layout runs in process.
  const workerPath = toolkit.workerRelease ? join(toolkit.workerRelease, 'workers', 'layout.cjs') : undefined;
  // Extensions (§14.3): pinned by the lock, verified, and run only if the user
  // trusts their exact digest. Resolution never executes anything.
  let extensions;
  try {
    const bound = bindExtensions(bundle.model, { bundleRoot: bundle.root, repoRoot: repoRootFor(bundle.root), allowFallback: request.extensionFallback === true });
    printDiagnostics(bound.diagnostics.filter((d) => d.severity === 'warning'), false);
    const errors = bound.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      printDiagnostics(errors, false);
      throw new CliError('E_BUILD', 'build stopped: an extension cannot run', exitCodeFor(errors));
    }
    extensions = bound.bindings;
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const d = { code: error.code, severity: 'error' as const, message: error.message };
    printDiagnostics([d], false);
    throw new CliError('E_BUILD', 'build stopped: an extension cannot run', exitCodeFor([d]));
  }
  try {
    return await compileDocument(
      bundle,
      {
        version: toolkit.release.version,
        sha256: toolkit.release.sha256,
        assets: {
          'reader.js': assetSha('reader.js'),
          'reader.css': assetSha('reader.css'),
          ...(existsSync(mermaidPath) ? { 'mermaid.js': assetSha('mermaid.js') } : {}),
        },
        ...(integrity ? { integrity } : {}),
      },
      {
        audience: request.audience,
        includeSource: request.includeSource,
        layoutFallback: request.layoutFallback,
        ...(workerPath && existsSync(workerPath) ? { layout: workerLayout(workerPath) } : {}),
        nodeVersion: request.nodeVersion,
        ...(toolkit.development ? { development: true } : {}),
        extensions,
      },
    );
  } catch (error) {
    if (!(error instanceof CompileError)) throw error;
    printDiagnostics(error.diagnostics, false);
    throw new CliError('E_BUILD', 'build stopped: compilation failed', exitCodeFor(error.diagnostics));
  }
}

function developmentMark(snapshotDir: string): boolean {
  try {
    return (JSON.parse(readFileSync(join(snapshotDir, 'build.json'), 'utf8')) as { development?: boolean }).development === true;
  } catch {
    return false;
  }
}

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
  const mermaidPath = join(releaseDir, 'browser', 'mermaid.js');
  const result = await compileWithToolkit(bundle, toolkit, {
    audience: 'private',
    includeSource: false,
    layoutFallback: args.flags.has('allow-layout-fallback'),
    nodeVersion: process.version,
    extensionFallback: args.flags.has('allow-extension-fallback'),
  });
  printDiagnostics(result.diagnostics.filter((d) => d.severity === 'warning'), false);

  const outDir = resolve(stringFlag(args, 'out') ?? join(repoRootFor(bundle.root), '.explain', 'output'));
  const snapshotDir = `d/${result.docId}/${result.sourceRevision}/${result.buildId}`;
  const finalDir = join(outDir, snapshotDir);

  // Shared asset pack (§13.1): each needed file is copied on its own, so a later
  // Mermaid build adds mermaid.js to an asset directory that already exists.
  const assetDir = join(outDir, '_explain', 'assets', toolkit.release.sha256);
  const needed = ['reader.js', 'reader.css', ...(result.needsMermaid ? ['mermaid.js'] : [])];
  if (result.needsMermaid && !existsSync(mermaidPath)) {
    throw new CliError('E_TOOLKIT_MISSING', `the toolkit at ${releaseDir} has no browser/mermaid.js; this document needs a toolkit with Mermaid support`, EXIT.unavailable);
  }
  copyAssets(releaseDir, assetDir, needed);

  // Immutable snapshot: publish atomically; an existing snapshot is left
  // untouched. Exception: the lock is not part of the source revision, so a
  // development build and a release build can share a build ID; the snapshot
  // is replaced when its development mark differs from this build (§12.4).
  const stale = existsSync(finalDir) && developmentMark(finalDir) !== (result.manifest.development === true);
  if (!existsSync(finalDir) || stale) {
    mkdirSync(dirname(finalDir), { recursive: true });
    const tmp = mkdtempSync(join(dirname(finalDir), '.tmp-'));
    try {
      for (const file of result.files) {
        const rel = file.path.slice(snapshotDir.length + 1);
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), file.bytes);
      }
      if (stale) {
        const old = mkdtempSync(join(dirname(finalDir), '.old-'));
        renameSync(finalDir, join(old, 'snapshot'));
        renameSync(tmp, finalDir);
        rmSync(old, { recursive: true, force: true });
      } else {
        renameSync(tmp, finalDir);
      }
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
