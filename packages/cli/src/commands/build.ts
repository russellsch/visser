// `visser build DOC [--out DIR] [--toolkit-dir DIR | --dev-toolkit DIR]
//   [--allow-layout-fallback]` (§13.1, §17.1). No source mutation, no network.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadBundle, type LoadedBundle } from '../../../core/src/model/bundle.ts';
import { CompileError, compileDocument, workerLayout, type CompileResult } from '../../../core/src/compiler/index.ts';
import { createHash } from 'node:crypto';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, stringFlag } from '../cli-util.ts';
import { resolveForDocument, type ToolkitSelection } from '../toolkit.ts';
import { bindExtensions } from '../../../core/src/extensions/registry.ts';
import { canonicalJSON, HashError } from '../../../core/src/model/hash.ts';
import { findRepoRoot } from '../../../core/src/references/registry.ts';
import { validateAgainst } from '../../../core/src/model/schemas.ts';
import type { VerifiedRelease } from '../../../core/src/distribution/index.ts';
import { browserMathFingerprint, mathPolicyFingerprint } from '../../../core/src/math/fingerprint.ts';

export type BuildOutcome = {
  outDir: string;
  result: CompileResult;
  toolkit: ToolkitSelection;
  snapshotPath: string; // site-relative path of index.html
  frontmatter: Record<string, unknown>;
  /** The repository that holds the document, or undefined (output next to the document). */
  repository: string | undefined;
};

/** Read one browser asset from the exact release identity that was resolved. */
export function readBrowserAsset(release: VerifiedRelease, name: string): Buffer {
  const manifest = JSON.parse(readFileSync(join(release.dir, 'release.json'), 'utf8')) as { files: Array<{ path: string; sha256: string }> };
  const check = validateAgainst('release', manifest);
  if (!check.ok) throw new CliError('E_INTEGRITY', `release.json violates visser-release/1: ${check.errors.join('; ')}`, EXIT.security);
  const manifestSha = createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
  if (manifestSha !== release.sha256) {
    throw new CliError('E_INTEGRITY', `release.json no longer describes resolved toolkit ${release.sha256}`, EXIT.security);
  }
  const expected = manifest.files.find((f) => f.path === `browser/${name}`)?.sha256;
  const bytes = readFileSync(join(release.dir, 'browser', name));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (!expected || actual !== expected) {
    throw new CliError('E_INTEGRITY', `browser/${name} does not match release.json`, EXIT.security);
  }
  return bytes;
}

/**
 * Copy each named browser asset from the release into the output asset
 * directory unless an identical copy is already there. Each copy is checked
 * against the release manifest's digest and written through a temporary file.
 */
export function copyAssets(release: VerifiedRelease, assetDir: string, names: string[]): void {
  mkdirSync(assetDir, { recursive: true });
  for (const name of names) {
    const bytes = readBrowserAsset(release, name);
    const expected = createHash('sha256').update(bytes).digest('hex');
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
  const mermaidPath = join(releaseDir, 'browser', 'mermaid.js');
  const mermaidBytes = existsSync(mermaidPath) ? readBrowserAsset(toolkit.release, 'mermaid.js') : undefined;
  const mathBytes = (bundle.parsed.math?.length ?? 0) > 0 ? readBrowserAsset(toolkit.release, 'math.js') : undefined;
  if (mathBytes && browserMathFingerprint(mathBytes.toString('utf8')) !== mathPolicyFingerprint()) {
    throw new CliError('E_INTEGRITY', 'math engine policy differs from the selected browser pack; rebuild/select the matching toolkit', EXIT.security);
  }
  const browserAssets: Record<string, Buffer> = {
    'reader.js': readBrowserAsset(toolkit.release, 'reader.js'),
    'reader.css': readBrowserAsset(toolkit.release, 'reader.css'),
    ...(mermaidBytes ? { 'mermaid.js': mermaidBytes } : {}),
    ...(mathBytes ? { 'math.js': mathBytes } : {}),
  };
  const assetSha = (name: string) => createHash('sha256').update(browserAssets[name]!).digest('hex');
  // SRI value for the lazily loaded Mermaid asset (§9.12).
  const integrity = mermaidBytes
    ? { 'mermaid.js': `sha384-${createHash('sha384').update(mermaidBytes).digest('base64')}` }
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
          ...('mermaid.js' in browserAssets ? { 'mermaid.js': assetSha('mermaid.js') } : {}),
          ...('math.js' in browserAssets ? { 'math.js': assetSha('math.js') } : {}),
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

/**
 * The repository that holds `start`, else the document folder: a document
 * outside any repository keeps its build output next to itself
 * (DOC/.visser/output), never in an ancestor such as HOME or /tmp.
 */
export function repoRootFor(start: string): string {
  return findRepoRoot(start) ?? resolve(start);
}

export async function buildDocument(args: ParsedArgs): Promise<BuildOutcome> {
  const doc = args.positional[0];
  if (!doc) throw new CliError('E_USAGE', 'usage: visser build DOC [--out DIR] [--toolkit-dir DIR | --dev-toolkit DIR]', EXIT.invalid);
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

  // Find the repository before anything is written: the first build outside a
  // repository creates DOC/.visser, which would then look like a repository.
  const repository = findRepoRoot(bundle.root);
  const outDir = resolve(stringFlag(args, 'out') ?? join(repository ?? bundle.root, '.visser', 'output'));
  const snapshotDir = `d/${result.docId}/${result.sourceRevision}/${result.buildId}`;
  const finalDir = join(outDir, snapshotDir);

  // Shared asset pack (§13.1): each needed file is copied on its own, so a later
  // Mermaid build adds mermaid.js to an asset directory that already exists.
  const assetDir = join(outDir, '_visser', 'assets', toolkit.release.sha256);
  const needed = ['reader.js', 'reader.css', ...(result.needsMermaid ? ['mermaid.js'] : []), ...(result.needsMath ? ['math.js'] : [])];
  if (result.needsMermaid && !existsSync(mermaidPath)) {
    throw new CliError('E_TOOLKIT_MISSING', `the toolkit at ${releaseDir} has no browser/mermaid.js; this document needs a toolkit with Mermaid support`, EXIT.unavailable);
  }
  copyAssets(toolkit.release, assetDir, needed);

  // Immutable snapshot: publish atomically; an existing snapshot is never
  // replaced. The development mark is part of the build ID (§7.4), so a
  // development build and a normal build never share a folder.
  if (!existsSync(finalDir)) {
    mkdirSync(dirname(finalDir), { recursive: true });
    const tmp = mkdtempSync(join(dirname(finalDir), '.tmp-'));
    try {
      for (const file of result.files) {
        const rel = file.path.slice(snapshotDir.length + 1);
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), file.bytes);
      }
      try {
        renameSync(tmp, finalDir);
      } catch (error) {
        // A concurrent build of the same ID published first; its bytes are the same build.
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error;
        rmSync(tmp, { recursive: true, force: true });
      }
    } catch (error) {
      rmSync(tmp, { recursive: true, force: true });
      throw error;
    }
  }
  return { outDir, result, toolkit, snapshotPath: `${snapshotDir}/index.html`, frontmatter: bundle.parsed.frontmatter, repository };
}

export async function runBuild(args: ParsedArgs): Promise<number> {
  const outcome = await buildDocument(args);
  const { result } = outcome;
  const dev = outcome.toolkit.development ? ' (development build)' : '';
  process.stdout.write(
    `built ${outcome.snapshotPath}${dev}\n  out: ${outcome.outDir}\n  ${outcome.repository ? `repository: ${outcome.repository}` : 'no repository holds this document: the output is next to it'}\n  docId: ${result.docId}\n  source revision: ${result.sourceRevision}\n  build ID: ${result.buildId}\n`,
  );
  return EXIT.ok;
}
