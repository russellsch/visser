// Extension manifests (§14.2). The extension digest is
// sha256(canonicalJSON(extension.json)); it means something only if the tree on
// disk is exactly the tree the manifest lists, so verification is as strict as
// release verification (§12.1). Verification never executes the extension.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { canonicalJSON, HashError, validateBundlePath } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';

export const MANIFEST_NAME = 'extension.json';

export type ExtensionManifest = {
  schema: 'explain-extension/1';
  name: string;
  version: string;
  api: 'explain-component/1';
  buildEntry: string;
  browserEntry: null;
  schemaFile: string;
  guide: string;
  files: Array<{ path: string; sha256: string }>;
};

export type VerifiedExtension = { dir: string; manifest: ExtensionManifest; sha256: string };

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

function listTree(root: string, dir = root): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = lstatSync(full);
    const rel = relative(root, full).split(sep).join('/');
    if (stat.isSymbolicLink()) fail('E_INTEGRITY', `extension entry ${rel} is a symbolic link`);
    if (stat.isDirectory()) out.push(...listTree(root, full));
    else if (stat.isFile()) out.push(rel);
    else fail('E_INTEGRITY', `extension entry ${rel} is not a regular file`);
  }
  return out;
}

/** The digest of a manifest value (§14.2). */
export function extensionDigest(manifest: unknown): string {
  return createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
}

/** Verify an extension directory strictly; returns its manifest and digest. */
export function verifyExtensionDir(dir: string): VerifiedExtension {
  const manifestPath = join(dir, MANIFEST_NAME);
  if (!existsSync(dir) || !existsSync(manifestPath)) fail('E_EXTENSION_MISSING', `no ${MANIFEST_NAME} in ${dir}`);
  if (lstatSync(dir).isSymbolicLink()) fail('E_INTEGRITY', `extension directory ${dir} is a symbolic link`);
  if (!lstatSync(manifestPath).isFile()) fail('E_INTEGRITY', `${MANIFEST_NAME} is not a regular file`);
  let manifest: ExtensionManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest;
  } catch {
    fail('E_INTEGRITY', `${MANIFEST_NAME} is not valid JSON`);
  }
  const schema = validateAgainst('extension', manifest);
  if (!schema.ok) fail('E_INTEGRITY', `${MANIFEST_NAME} violates explain-extension/1: ${schema.errors.join('; ')}`);

  const listed = new Set<string>();
  for (const file of manifest.files) {
    try {
      validateBundlePath(file.path);
    } catch (error) {
      fail('E_INTEGRITY', `${MANIFEST_NAME} lists an invalid path ${JSON.stringify(file.path)}: ${(error as Error).message}`);
    }
    if (file.path === MANIFEST_NAME) fail('E_INTEGRITY', `${MANIFEST_NAME} must not list itself`);
    if (listed.has(file.path)) fail('E_INTEGRITY', `${MANIFEST_NAME} lists ${file.path} twice`);
    listed.add(file.path);
  }
  for (const key of ['buildEntry', 'schemaFile', 'guide'] as const) {
    if (!listed.has(manifest[key])) fail('E_INTEGRITY', `${MANIFEST_NAME}: ${key} ${manifest[key]} is not a listed file`);
  }
  if (!/\.c?js$/.test(manifest.buildEntry)) fail('E_INTEGRITY', `${MANIFEST_NAME}: buildEntry must be a .js or .cjs file`);

  const onDisk = new Set(listTree(dir).filter((p) => p !== MANIFEST_NAME));
  for (const path of onDisk) if (!listed.has(path)) fail('E_INTEGRITY', `extension file ${path} is not listed in ${MANIFEST_NAME}`);
  for (const path of listed) if (!onDisk.has(path)) fail('E_INTEGRITY', `extension file ${path} is missing`);
  for (const file of manifest.files) {
    const actual = createHash('sha256').update(readFileSync(join(dir, ...file.path.split('/')))).digest('hex');
    if (actual !== file.sha256) fail('E_INTEGRITY', `extension file ${file.path} does not match ${MANIFEST_NAME}`);
  }
  return { dir, manifest, sha256: extensionDigest(manifest) };
}

/** The extension's component schema (static inspection, allowed before trust; §14.3). */
export function componentSchema(ext: VerifiedExtension): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(ext.dir, ...ext.manifest.schemaFile.split('/')), 'utf8'));
  } catch {
    fail('E_INTEGRITY', `extension ${ext.manifest.name}: ${ext.manifest.schemaFile} is not valid JSON`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('E_INTEGRITY', `extension ${ext.manifest.name}: ${ext.manifest.schemaFile} is not a JSON Schema object`);
  return value as Record<string, unknown>;
}

// A separate Ajv instance: extension schemas never join the normative registry,
// and Ajv loads no remote $ref (there is no loadSchema).
const extensionAjv = new Ajv2020({ strict: true, allErrors: true });
const compiled = new Map<string, ValidateFunction>();

/** Validate a component input against the extension's schema. Returns error strings. */
export function checkComponentInput(ext: VerifiedExtension, input: unknown): string[] {
  let validate = compiled.get(ext.sha256);
  if (!validate) {
    try {
      const schema = { ...componentSchema(ext) };
      delete schema['$id'];
      validate = extensionAjv.compile(schema);
    } catch (error) {
      if (error instanceof HashError) throw error;
      fail('E_INTEGRITY', `extension ${ext.manifest.name}: its component schema does not compile: ${(error as Error).message}`);
    }
    compiled.set(ext.sha256, validate);
  }
  if (validate(input)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
}
