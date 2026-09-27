// Document registry and lookup (§11.5). The resolver searches only configured
// document roots under the repository; a packet's sourceHint never chooses a file.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { readBoundedJson } from '../model/bounded-read.ts';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { HashError } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';

export const DEFAULT_DOCUMENT_ROOTS = ['docs/explanations'];

export type LocateResult =
  | { status: 'found'; path: string }
  | { status: 'missing'; message: string }
  | { status: 'ambiguous'; paths: string[] };

export type LocateOptions = {
  repoRoot: string;
  /** Explicit `--doc PATH`: limits resolution to that primary file. */
  doc?: string;
};

function escape(message: string): never {
  throw new HashError('E_PATH_ESCAPE', 'E_PATH_ESCAPE', message);
}

/** Nearest ancestor of `start` (inclusive) that contains `.git` or `.explain`. */
export function findRepoRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.explain'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

function assertRelativeRoot(root: string): void {
  if (isAbsolute(root) || root.includes('\\') || root.split('/').includes('..')) {
    escape(`document root ${JSON.stringify(root)} must be relative and inside the repository`);
  }
  if (root.normalize('NFC') !== root) escape(`document root ${JSON.stringify(root)} is not NFC`);
}

/** Configured document roots, validated and confined to the repository (§11.5). */
export function documentRoots(repoRoot: string): string[] {
  const configPath = join(repoRoot, '.explain', 'config.json');
  let roots = DEFAULT_DOCUMENT_ROOTS;
  // Repository-controlled: no symbolic link, a regular file, bounded, no content in errors.
  const config = readBoundedJson(configPath, '.explain/config.json');
  if (config !== undefined) {
    // An escaping root is a confinement failure (E_PATH_ESCAPE), not only a schema error.
    const configured = (config as { documentRoots?: unknown }).documentRoots;
    if (Array.isArray(configured)) {
      for (const root of configured) if (typeof root === 'string') assertRelativeRoot(root);
    }
    const result = validateAgainst('workspace', config);
    if (!result.ok) throw new HashError('E_SYNTAX', 'E_SCHEMA', `.explain/config.json: ${result.errors.join('; ')}`);
    if (configured) roots = configured as string[];
  }
  const realRepo = realpathSync(repoRoot);
  const out: string[] = [];
  for (const root of roots) {
    assertRelativeRoot(root);
    const full = join(repoRoot, root);
    if (!existsSync(full)) continue;
    if (!isInside(realpathSync(full), realRepo)) escape(`document root ${JSON.stringify(root)} resolves outside the repository`);
    out.push(full);
  }
  return out;
}

/** The docId in a primary file's frontmatter, read without a full parse. */
export function frontmatterDocId(path: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
  const lines = text.replace(/^﻿/, '').split(/\r\n?|\n/);
  if (lines[0] !== '---') return undefined;
  for (let i = 1; i < lines.length && lines[i] !== '---'; i++) {
    const m = /^docId:\s*["']?([0-9a-f-]+)["']?\s*$/.exec(lines[i] ?? '');
    if (m) return m[1];
  }
  return undefined;
}

/** Every primary `index.md` under a root. Symlinks and dot-directories are skipped. */
function primaryFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = join(dir, name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) primaryFiles(full, out);
    else if (stat.isFile() && name === 'index.md') out.push(full);
  }
  return out;
}

/** Locate exactly one current primary file for a docId (§11.5, §11.6 step 2). */
export function locateDocument(docId: string, opts: LocateOptions): LocateResult {
  if (opts.doc !== undefined) {
    const path = resolve(opts.doc);
    if (!existsSync(path)) return { status: 'missing', message: `${opts.doc} does not exist` };
    if (lstatSync(path).isSymbolicLink()) escape(`${opts.doc} is a symbolic link`);
    if (!lstatSync(path).isFile()) return { status: 'missing', message: `${opts.doc} is not a file` };
    const found = frontmatterDocId(path);
    if (found !== docId) return { status: 'missing', message: `${opts.doc} has docId ${found ?? '(none)'}, not ${docId}` };
    return { status: 'found', path };
  }
  const matches: string[] = [];
  for (const root of documentRoots(opts.repoRoot)) {
    for (const file of primaryFiles(root)) {
      if (frontmatterDocId(file) === docId) matches.push(file);
    }
  }
  if (matches.length === 0) return { status: 'missing', message: `no document with docId ${docId} in the configured roots` };
  if (matches.length > 1) return { status: 'ambiguous', paths: matches.sort() };
  return { status: 'found', path: matches[0]! };
}

/** Confine an explicit document path (for `refs show`) to the configured roots. */
export function assertInsideRoots(path: string, repoRoot: string): string {
  const full = resolve(path);
  if (!existsSync(full)) return full;
  if (lstatSync(full).isSymbolicLink()) escape(`${path} is a symbolic link`);
  const real = realpathSync(full);
  const roots = documentRoots(repoRoot).map((r) => realpathSync(r));
  if (!roots.some((root) => isInside(real, root))) {
    escape(`${path} is outside the configured document roots`);
  }
  return full;
}
