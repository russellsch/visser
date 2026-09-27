// Collection input `explain-collection/1` (§13.5). Each document path is
// relative to the collection file and must resolve inside the repository.
import { lstatSync, realpathSync } from 'node:fs';
import { readBoundedJson } from '../model/bounded-read.ts';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { HashError } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';

export type Collection = {
  title: string;
  /** Absolute index.md paths, in the collection's order. */
  documents: string[];
};

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

export function readCollection(file: string, repoRoot: string): Collection {
  // Repository-controlled: no symbolic link, a regular file, bounded, no content in errors.
  const value = readBoundedJson(file, file);
  if (value === undefined) fail('E_SOURCE_UNAVAILABLE', `cannot read the collection ${file}`);
  const check = validateAgainst('collection', value);
  if (!check.ok) fail('E_SYNTAX', `${file} is not a valid explain-collection/1 file: ${check.errors.join('; ')}`);
  const collection = value as { title: string; documents: Array<{ path: string }> };
  const root = realpathSync(repoRoot);
  const base = dirname(resolve(file));
  const seen = new Set<string>();
  const documents: string[] = [];
  for (const entry of collection.documents) {
    if (isAbsolute(entry.path) || entry.path.includes('\\')) fail('E_PATH_ESCAPE', `collection path ${JSON.stringify(entry.path)} must be relative, with / separators`);
    let path = join(base, ...entry.path.split('/'));
    // A collection may name a bundle folder or its index.md.
    try {
      if (lstatSync(path).isDirectory()) path = join(path, 'index.md');
    } catch {
      fail('E_SOURCE_UNAVAILABLE', `collection document ${entry.path} does not exist`);
    }
    let real: string;
    try {
      real = realpathSync(path);
    } catch {
      fail('E_SOURCE_UNAVAILABLE', `collection document ${entry.path} does not exist`);
    }
    if (!isInside(real, root)) fail('E_PATH_ESCAPE', `collection document ${entry.path} is outside the repository ${repoRoot}`);
    if (seen.has(real)) fail('E_DOC_DUPLICATE', `collection names ${entry.path} twice`);
    seen.add(real);
    documents.push(path);
  }
  return { title: collection.title, documents };
}
