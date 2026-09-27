// `explain fork DOC DEST` (§11.5, §17.1): a new, independent document with a
// new docId. Internal target IDs, provenance, and retiredTargets are kept; only
// declared bundle files and the lock are copied; nothing is overwritten.
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadBundle } from '../model/bundle.ts';
import { rewriteDocId } from './frontmatter-edit.ts';
import { type FsContext, lockToken } from './fs-context.ts';
import { fail } from './guarded-write.ts';
import { documentRoots } from './registry.ts';

export type ForkOptions = {
  repoRoot: string;
  fsContext?: FsContext;
  /** Test seam: a fixed new docId. */
  newDocId?: string;
};

export type ForkResult = {
  schema: 'explain-fork/1';
  sourceDocId: string;
  docId: string;
  path: string; // new index.md
  files: string[]; // bundle-relative paths copied
};

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

function regularFile(path: string, label: string): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    fail('E_SOURCE_UNAVAILABLE', `${label} does not exist`);
  }
  if (stat.isSymbolicLink()) fail('E_PATH_ESCAPE', `${label} is a symbolic link; fork copies regular files only`);
  if (!stat.isFile()) fail('E_PATH_ESCAPE', `${label} is not a regular file`);
}

export function forkDocument(doc: string, dest: string, opts: ForkOptions): ForkResult {
  const indexPath = resolve(doc);
  regularFile(indexPath, doc);
  const sourceRoot = dirname(indexPath);
  if (lstatSync(sourceRoot).isSymbolicLink()) fail('E_PATH_ESCAPE', 'the source bundle directory is a symbolic link');

  const bundle = loadBundle(indexPath);
  const errors = bundle.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) fail(errors[0]!.code, `the source document has errors; fix them before forking: ${errors[0]!.message}`);
  if (!bundle.docId) fail('E_SYNTAX', 'the source document has no docId');

  // Destination: new, outside the source bundle, inside a document root.
  const target = resolve(dest);
  if (existsSync(target) || (() => { try { lstatSync(target); return true; } catch { return false; } })()) {
    fail('E_USAGE', `${dest} already exists; fork never overwrites`);
  }
  const parent = dirname(target);
  if (!existsSync(parent)) fail('E_USAGE', `the parent directory of ${dest} does not exist`);
  const realParent = realpathSync(parent);
  const realTarget = join(realParent, basename(target));
  const realSource = realpathSync(sourceRoot);
  if (isInside(realTarget, realSource)) fail('E_USAGE', `${dest} is inside the source bundle`);
  const roots = documentRoots(opts.repoRoot).map((root) => realpathSync(root));
  if (!roots.some((root) => isInside(realTarget, root) && realTarget !== root)) {
    fail('E_PATH_ESCAPE', `${dest} is not inside a configured document root`);
  }

  // Declared files only (§7.4), plus the lock. loadBundle has already refused
  // symlinked declared assets; check again at copy time.
  const files = bundle.files.map((f) => f.path);
  const lockPath = join(sourceRoot, 'explain.lock.json');
  const copies = [...files];
  if (existsSync(lockPath) || (() => { try { lstatSync(lockPath); return true; } catch { return false; } })()) {
    regularFile(lockPath, 'explain.lock.json');
    copies.push('explain.lock.json');
  }

  const docId = opts.newDocId ?? randomUUID();
  const staging = join(realParent, `.${basename(target)}.${lockToken(opts.fsContext)}.fork`);
  mkdirSync(staging, { mode: 0o755 });
  try {
    for (const rel of copies) {
      const from = join(sourceRoot, ...rel.split('/'));
      regularFile(from, rel);
      if (!isInside(realpathSync(from), realSource)) fail('E_PATH_ESCAPE', `${rel} resolves outside the source bundle`);
      const to = join(staging, ...rel.split('/'));
      mkdirSync(dirname(to), { recursive: true });
      let bytes: Uint8Array = new Uint8Array(readFileSync(from));
      if (rel === 'index.md') {
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        bytes = new TextEncoder().encode(rewriteDocId(text, docId));
      }
      writeFileSync(to, bytes, { flag: 'wx' });
    }
    // The fork must be a valid document before it appears.
    const forked = loadBundle(join(staging, 'index.md'));
    const forkErrors = forked.diagnostics.filter((d) => d.severity === 'error');
    if (forkErrors.length > 0) fail(forkErrors[0]!.code, `the fork would not be valid: ${forkErrors[0]!.message}`);
    if (forked.docId !== docId) fail('E_SEMANTIC', 'the fork did not receive the new docId');
    opts.fsContext?.beforeRename?.(realTarget);
    // Claim DEST with an exclusive mkdir: rename(2) silently replaces an
    // EMPTY directory, so an existence check alone would let a directory
    // created by someone else be overwritten. Renaming over our own empty
    // claim is safe; if anything was added to it meanwhile, rename fails.
    try {
      mkdirSync(realTarget);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('E_USAGE', `${dest} appeared during the fork; nothing was written`);
      throw error;
    }
    try {
      renameSync(staging, realTarget);
    } catch (error) {
      try { rmdirSync(realTarget); } catch { /* not empty: someone else wrote into our claim; leave it */ }
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOTEMPTY' || code === 'EEXIST') fail('E_WRITE_CONFLICT', `${dest} changed during the fork; nothing was written`);
      throw error;
    }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return { schema: 'explain-fork/1', sourceDocId: bundle.docId, docId, path: join(realTarget, 'index.md'), files: copies };
}
