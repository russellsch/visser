// `visser export DOC --format markdown [--out FILE]` (§7.6) and
// `visser export DOC|--collection FILE --format site --out DIR
//   [--audience private|public] [--allow-private-content] [--include-source]
//   [--toolkit-dir DIR | --dev-toolkit DIR] [--json]` (§13.1, §13.5).
//
// A site export writes a new site into a new or empty DIR: one asset pack per
// toolkit digest, one immutable snapshot per document, and an index page for
// a collection. It stages everything beside DIR and activates it with one
// rename; it never overwrites a non-empty DIR. A public export refuses
// development builds, records only the Node major version, and stops with
// E_PRIVATE_EXPORT (exit 2) for private material unless
// --allow-private-content is given.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { loadBundle, type LoadedBundle } from '../../../core/src/model/bundle.ts';
import { HashError } from '../../../core/src/model/hash.ts';
import { projectText } from '../../../core/src/model/project.ts';
import type { CompileResult } from '../../../core/src/compiler/index.ts';
import {
  collectionIndexHtml, exportSources, privateOriginWarning, publicByNameWarning, publicExportProblems, publicRepositories, readCollection,
  STATIC_HOST_WARNINGS, type ExportedDocument, type ExportSource, type ExportWarning,
} from '../../../core/src/export/index.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, printJson, stringFlag } from '../cli-util.ts';
import { resolveForDocument, type ToolkitSelection } from '../toolkit.ts';
import { compileWithToolkit, copyAssets, repoRootFor } from './build.ts';
import { loadDocument } from './load.ts';

const USAGE = [
  'usage: visser export DOC --format markdown [--out FILE]',
  '       visser export DOC|--collection FILE --format site --out DIR [--audience private|public]',
  '         [--allow-private-content] [--include-source] [--toolkit-dir DIR | --dev-toolkit DIR] [--json]',
].join('\n');

function booleanFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value === undefined) return false;
  if (value !== true) throw new CliError('E_USAGE', `--${name} takes no value (put it last or before another flag)\n${USAGE}`, EXIT.invalid);
  return true;
}

async function exportMarkdown(args: ParsedArgs): Promise<number> {
  const { parsed, targets, diagnostics } = loadDocument(args.positional[0]);
  const code = exitCodeFor(diagnostics);
  if (code !== EXIT.ok) {
    printDiagnostics(diagnostics, false);
    return code;
  }
  const text = projectText(parsed, targets);
  const out = stringFlag(args, 'out');
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
  return EXIT.ok;
}

/** DIR must be new or an empty real directory; its parent must exist. */
function checkOutDir(out: string): { existed: boolean } {
  let stat;
  try {
    stat = lstatSync(out);
  } catch {
    if (!existsSync(dirname(out))) throw new CliError('E_USAGE', `the parent directory of ${out} does not exist`, EXIT.invalid);
    return { existed: false };
  }
  if (stat.isSymbolicLink()) throw new CliError('E_PATH_ESCAPE', `${out} is a symbolic link; export writes only into a real directory`, EXIT.security);
  if (!stat.isDirectory()) throw new CliError('E_USAGE', `${out} exists and is not a directory`, EXIT.invalid);
  if (readdirSync(out).length > 0) throw new CliError('E_USAGE', `${out} is not empty; export never overwrites. Choose a new or empty directory`, EXIT.invalid);
  return { existed: true };
}

/** --include-source copies declared bundle files only, with fork's rules (§11.5, §13.5). */
function checkSourceBundle(bundle: LoadedBundle): void {
  const index = lstatSync(bundle.indexPath);
  if (index.isSymbolicLink() || !index.isFile()) throw new CliError('E_PATH_ESCAPE', `${bundle.indexPath} is not a regular file; --include-source copies regular files only`, EXIT.security);
  if (lstatSync(bundle.root).isSymbolicLink()) throw new CliError('E_PATH_ESCAPE', `the bundle directory ${bundle.root} is a symbolic link`, EXIT.security);
}

type Planned = { bundle: LoadedBundle; toolkit: ToolkitSelection; doc: ExportedDocument; sources: ExportSource[] };

function loadForExport(indexPath: string, args: ParsedArgs, allowlist: ReadonlySet<string>): Planned {
  if (!existsSync(indexPath)) throw new CliError('E_SOURCE_UNAVAILABLE', `cannot read ${indexPath}`, EXIT.unavailable);
  const bundle = loadBundle(indexPath);
  printDiagnostics(bundle.diagnostics.filter((d) => d.severity === 'warning'), false);
  const code = exitCodeFor(bundle.diagnostics);
  if (code !== EXIT.ok) {
    printDiagnostics(bundle.diagnostics.filter((d) => d.severity === 'error'), false);
    throw new CliError('E_BUILD', `export stopped: ${indexPath} has errors`, code);
  }
  const toolkit = resolveForDocument(bundle.root, stringFlag(args, 'toolkit-dir'), stringFlag(args, 'dev-toolkit'));
  for (const warning of toolkit.warnings) process.stderr.write(`warning ${warning}\n`);
  const fm = bundle.parsed.frontmatter;
  const doc: ExportedDocument = {
    docId: bundle.docId!,
    title: typeof fm['title'] === 'string' ? fm['title'] : bundle.docId!,
    visibility: fm['visibility'] === 'public' ? 'public' : 'private',
    path: '',
  };
  return { bundle, toolkit, doc, sources: exportSources(bundle, allowlist) };
}

async function exportSite(args: ParsedArgs): Promise<number> {
  const json = booleanFlag(args, 'json');
  const audience = stringFlag(args, 'audience') ?? 'private';
  if (audience !== 'private' && audience !== 'public') throw new CliError('E_USAGE', `--audience must be private or public\n${USAGE}`, EXIT.invalid);
  const allowPrivate = booleanFlag(args, 'allow-private-content');
  const includeSource = booleanFlag(args, 'include-source');
  const outArg = stringFlag(args, 'out');
  if (!outArg) throw new CliError('E_USAGE', `--out DIR is required for --format site\n${USAGE}`, EXIT.invalid);
  const collectionArg = stringFlag(args, 'collection');
  if ((collectionArg === undefined) === (args.positional[0] === undefined) || args.positional.length > 1) {
    throw new CliError('E_USAGE', `pass exactly one DOC or --collection FILE\n${USAGE}`, EXIT.invalid);
  }
  const out = resolve(outArg);
  const { existed } = checkOutDir(out);

  // 1. Load every document and decide the policy before anything is compiled.
  let collection: { title: string } | undefined;
  let indexPaths: string[];
  if (collectionArg !== undefined) {
    const file = resolve(collectionArg);
    const read = readCollection(file, repoRootFor(dirname(file)));
    collection = { title: read.title };
    indexPaths = read.documents;
  } else {
    indexPaths = [resolve(args.positional[0]!)];
  }
  const allowlist = publicRepositories();
  const planned = indexPaths.map((p) => loadForExport(p, args, allowlist));
  const docIds = new Set<string>();
  for (const p of planned) {
    if (docIds.has(p.doc.docId)) throw new CliError('E_DOC_DUPLICATE', `two exported documents share docId ${p.doc.docId}`, EXIT.invalid);
    docIds.add(p.doc.docId);
  }
  if (audience === 'public') {
    const dev = planned.find((p) => p.toolkit.development);
    if (dev) {
      throw new CliError('E_USAGE', `a public export refuses development builds: ${dev.bundle.indexPath} uses --dev-toolkit with a toolkit that differs from its lock. Export with the locked toolkit, or run \`visser upgrade\``, EXIT.invalid);
    }
  }
  const sources = planned.flatMap((p) => p.sources);
  if (audience === 'public' && !allowPrivate) {
    const problems = publicExportProblems(planned.map((p) => p.doc), sources);
    if (problems.length > 0) {
      printDiagnostics(problems, json);
      return exitCodeFor(problems);
    }
  }
  if (includeSource) for (const p of planned) checkSourceBundle(p.bundle);

  // 2. Compile. A public build.json records only the Node major version.
  const nodeVersion = audience === 'public' ? process.version.split('.')[0]! : process.version;
  const results: Array<{ plan: Planned; result: CompileResult }> = [];
  for (const plan of planned) {
    const result = await compileWithToolkit(plan.bundle, plan.toolkit, { audience, includeSource, layoutFallback: false, nodeVersion });
    printDiagnostics(result.diagnostics.filter((d) => d.severity === 'warning'), false);
    plan.doc.path = `${result.directory}/index.html`;
    results.push({ plan, result });
  }

  // 3. Stage the whole site beside DIR, then activate it with one rename.
  const staging = mkdtempSync(join(dirname(out), `.${basename(out)}.export-`));
  const packs = new Map<string, { release: string; files: Set<string> }>();
  try {
    for (const { plan, result } of results) {
      for (const file of result.files) {
        const to = join(staging, ...file.path.split('/'));
        mkdirSync(dirname(to), { recursive: true });
        writeFileSync(to, file.bytes, { flag: 'wx' });
      }
      const digest = plan.toolkit.release.sha256;
      const pack = packs.get(digest) ?? { release: plan.toolkit.release.dir, files: new Set<string>(['reader.css', 'reader.js']) };
      if (result.needsMermaid) {
        if (!existsSync(join(pack.release, 'browser', 'mermaid.js'))) {
          throw new CliError('E_TOOLKIT_MISSING', `the toolkit at ${pack.release} has no browser/mermaid.js; ${plan.bundle.indexPath} needs a toolkit with Mermaid support`, EXIT.unavailable);
        }
        pack.files.add('mermaid.js');
      }
      packs.set(digest, pack);
    }
    for (const [digest, pack] of packs) copyAssets(pack.release, join(staging, '_visser', 'assets', digest), [...pack.files].sort());
    if (collection) {
      const first = results[0]!.plan.toolkit.release;
      const css = readFileSync(join(staging, '_visser', 'assets', first.sha256, 'reader.css'));
      const html = collectionIndexHtml(collection.title, results.map(({ plan }) => ({ title: plan.doc.title, path: plan.doc.path })), {
        audience,
        stylesheet: `_visser/assets/${first.sha256}/reader.css`,
        stylesheetSha256: createHash('sha256').update(css).digest('hex'),
      });
      writeFileSync(join(staging, 'index.html'), html, { flag: 'wx' });
    }
    activate(staging, out, existed);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  // 4. Report.
  const warnings: ExportWarning[] = [];
  const unlisted = sources.filter((s) => !s.publicRepository).length;
  if (unlisted > 0) warnings.push(privateOriginWarning(unlisted));
  const byName = sources.filter((s) => s.publicRepository);
  if (audience === 'public' && byName.length > 0) warnings.push(publicByNameWarning(byName));
  warnings.push(...STATIC_HOST_WARNINGS);
  const report = {
    schema: 'visser-export/1' as const,
    format: 'site' as const,
    audience,
    out,
    includeSource,
    ...(allowPrivate ? { allowPrivateContent: true as const } : {}),
    ...(collection ? { collection: { title: collection.title, path: 'index.html' } } : {}),
    documents: results.map(({ plan, result }) => ({
      ...plan.doc,
      sourceRevision: result.sourceRevision,
      buildId: result.buildId,
      toolkitSha256: plan.toolkit.release.sha256,
      mermaid: result.needsMermaid,
    })),
    sources,
    mermaidPages: results.filter(({ result }) => result.needsMermaid).map(({ plan }) => plan.doc.path),
    assetPacks: [...packs].map(([digest, pack]) => ({ toolkitSha256: digest, path: `_visser/assets/${digest}`, files: [...pack.files].sort() })),
    warnings,
  };
  if (json) {
    printJson('export', report);
  } else {
    const lines = [
      `exported ${report.documents.length} document${report.documents.length === 1 ? '' : 's'} (${audience} audience) to ${out}`,
      ...(collection ? ['  index.html'] : []),
      ...report.documents.map((d) => `  ${d.path} (${d.visibility})`),
      ...(sources.length > 0 ? ['sources:', ...sources.map((s) => `  ${s.docId} ${s.id}: ${s.kind} ${s.repository ?? s.url ?? s.label ?? '(no repository)'}${s.publicRepository ? ' [public repository]' : ''}`)] : []),
      ...warnings.map((w) => `warning ${w.code}: ${w.message}`),
      'Nothing was published. Review the folder before you upload or deploy it.',
    ];
    process.stdout.write(lines.join('\n') + '\n');
  }
  return EXIT.ok;
}

/**
 * Move the staged site to DIR. rename(2) replaces an EMPTY directory, so a
 * new DIR is claimed first with an exclusive mkdir; if anything is written
 * into DIR meanwhile, the rename fails and nothing is replaced.
 */
function activate(staging: string, out: string, existed: boolean): void {
  if (!existed) {
    try {
      mkdirSync(out);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new CliError('E_WRITE_CONFLICT', `${out} appeared during the export; nothing was written`, EXIT.conflict);
      throw error;
    }
  }
  try {
    renameSync(staging, out);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!existed) {
      try { rmdirSync(out); } catch { /* not empty: someone else wrote into the claim; leave it */ }
    }
    if (code === 'ENOTEMPTY' || code === 'EEXIST') throw new CliError('E_WRITE_CONFLICT', `${out} changed during the export; nothing was written`, EXIT.conflict);
    throw error;
  }
}

export async function runExport(args: ParsedArgs): Promise<number> {
  const format = stringFlag(args, 'format') ?? 'site';
  if (format === 'markdown') return exportMarkdown(args);
  if (format !== 'site') throw new CliError('E_USAGE', `--format must be site or markdown\n${USAGE}`, EXIT.invalid);
  try {
    return await exportSite(args);
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const diagnostic = { code: error.code, severity: 'error' as const, message: error.message };
    printDiagnostics([diagnostic], args.flags.get('json') === true);
    return exitCodeFor([diagnostic]);
  }
}
