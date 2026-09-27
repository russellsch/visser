// Source bundle loading (§6.1, §7.4): parse index.md, read the declared content
// files, and compute the source revision. Shared by check, build, and refs.
import { existsSync, readFileSync, readdirSync, statSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { Diagnostic, ParsedSource } from '../types.ts';
import { parseSource } from '../syntax/index.ts';
import { validateAgainst } from './schemas.ts';
import { buildTargetRecords, type MNode, type TargetModel } from './targets.ts';
import { type BundleFile, HashError, sourceRevision, type SourceManifest } from './hash.ts';

export type LoadedBundle = {
  root: string; // absolute bundle directory
  indexPath: string; // absolute path of index.md
  docId: string | undefined;
  parsed: ParsedSource;
  model: TargetModel;
  files: BundleFile[];
  manifest: SourceManifest | undefined;
  sourceRevision: string | undefined;
  diagnostics: Diagnostic[];
};

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

/** Local paths the parsed source declares: source assets and local images (§7.4). */
function declaredPaths(parsed: ParsedSource): string[] {
  const paths = new Set<string>();
  const visit = (n: MNode) => {
    if (n.type === 'tag' && n.tag === 'source' && typeof n.attributes['asset'] === 'string') paths.add(n.attributes['asset']);
    if (n.type === 'image' && typeof n.attributes['src'] === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(n.attributes['src'])) {
      paths.add(n.attributes['src']);
    }
    for (const child of n.children ?? []) visit(child);
  };
  if (parsed.ast) visit(parsed.ast as MNode);
  return [...paths];
}

function listBundleFiles(root: string, dir = root): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'explain.lock.json' && dir === root) continue;
    if (lstatSync(full).isDirectory()) out.push(...listBundleFiles(root, full));
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

export function loadBundle(indexPath: string): LoadedBundle {
  const bytes = new Uint8Array(readFileSync(indexPath));
  const root = dirname(indexPath);
  const parsed = parseSource(bytes, 'index.md');
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];

  if (!parsed.diagnostics.some((d) => d.severity === 'error' && d.code === 'E_SYNTAX' && d.startLine === 1)) {
    const result = validateAgainst('frontmatter', parsed.frontmatter);
    if (!result.ok) {
      for (const error of result.errors) {
        diagnostics.push({ code: 'E_SYNTAX', severity: 'error', message: `frontmatter ${error}`, path: 'index.md', startLine: 1 });
      }
    }
  }
  const model = buildTargetRecords(parsed);
  diagnostics.push(...model.diagnostics);
  const docId = typeof parsed.frontmatter['docId'] === 'string' ? parsed.frontmatter['docId'] : undefined;

  // Declared content files. Every file must be a regular file inside the bundle (§15.4).
  const files: BundleFile[] = [{ path: 'index.md', kind: 'text', content: bytes }];
  const realRoot = realpathSync(root);
  for (const path of declaredPaths(parsed)) {
    const full = join(root, path);
    if (!existsSync(full)) {
      diagnostics.push({ code: 'E_REF_BROKEN', severity: 'error', message: `declared file ${path} does not exist`, path: 'index.md' });
      continue;
    }
    if (lstatSync(full).isSymbolicLink() || !statSync(full).isFile() || !realpathSync(full).startsWith(realRoot + sep)) {
      diagnostics.push({ code: 'E_PATH_ESCAPE', severity: 'error', message: `declared file ${path} is not a regular file inside the bundle`, path: 'index.md' });
      continue;
    }
    files.push({ path, kind: IMAGE_EXTENSIONS.test(path) ? 'binary' : 'text', content: new Uint8Array(readFileSync(full)) });
  }
  const declared = new Set(files.map((f) => f.path));
  for (const extra of listBundleFiles(root)) {
    if (!declared.has(extra)) {
      diagnostics.push({ code: 'W_UNDECLARED_FILE', severity: 'warning', message: `${extra} is in the bundle folder but not declared; it is not read`, path: extra });
    }
  }

  let manifest: SourceManifest | undefined;
  let revision: string | undefined;
  if (docId && !diagnostics.some((d) => d.severity === 'error')) {
    try {
      const result = sourceRevision(docId, files);
      manifest = result.manifest;
      revision = result.sourceRevision;
    } catch (error) {
      if (!(error instanceof HashError)) throw error;
      diagnostics.push({ code: error.code, severity: 'error', message: error.message, path: 'index.md' });
    }
  }
  return { root, indexPath, docId, parsed, model, files, manifest, sourceRevision: revision, diagnostics };
}
