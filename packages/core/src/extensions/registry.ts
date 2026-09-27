// The extension registry (§12.4, §14.2, §14.3). A document names an extension
// with `{% extension use="NAME" %}`; its lock pins NAME to an exact digest; the
// digest resolves to a verified copy in REPO/.explain/extensions/DIGEST or
// ${EXPLAIN_HOME}/extensions/DIGEST; and the copy runs only if the digest is in
// the USER trust store. Nothing here imports or runs a path from Markdown.
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Diagnostic } from '../types.ts';
import type { TargetModel } from '../model/targets.ts';
import { HashError } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';
import { explainHome, isExtensionTrusted } from '../distribution/trust.ts';
import { checkComponentInput, verifyExtensionDir, type VerifiedExtension } from './manifest.ts';
import { componentInputs, DEFAULT_LIMITS, runBuildEntry, type ComponentInput, type ComponentOutput, type RunLimits } from './run.ts';

export type LockedExtension = { name: string; version: string; sha256: string };

export type ExtensionLocation = 'repository' | 'user';

export type Located =
  | { state: 'found'; ext: VerifiedExtension; location: ExtensionLocation; trusted: boolean }
  | { state: 'missing' };

/** A resolved extension, ready to run, or the reason the build uses the text fallback. */
export type ExtensionBinding =
  | { name: string; sha256: string; version: string; ready: true; run: (input: ComponentInput) => ComponentOutput }
  | { name: string; sha256?: string; ready: false; code: string; message: string };

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

export function userExtensionsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(explainHome(env), 'extensions');
}

export function repoExtensionsDir(repoRoot: string): string {
  return join(repoRoot, '.explain', 'extensions');
}

/**
 * Find a verified copy of an exact digest. A corrupt copy is E_INTEGRITY with
 * no fallback to a lower-priority copy (§12.4). Trust is reported, not required.
 */
export function locateExtension(digest: string, repoRoot: string | undefined, env: NodeJS.ProcessEnv = process.env): Located {
  if (!/^[0-9a-f]{64}$/.test(digest)) fail('E_USAGE', `an extension digest is 64 lowercase hex characters, not ${JSON.stringify(digest)}`);
  const candidates: Array<[ExtensionLocation, string]> = [];
  if (repoRoot) candidates.push(['repository', join(repoExtensionsDir(repoRoot), digest)]);
  candidates.push(['user', join(userExtensionsDir(env), digest)]);
  for (const [location, dir] of candidates) {
    let exists = false;
    try {
      lstatSync(dir);
      exists = true;
    } catch {
      exists = false;
    }
    if (!exists) continue;
    const ext = verifyExtensionDir(dir);
    if (ext.sha256 !== digest) fail('E_INTEGRITY', `the extension at ${dir} has digest ${ext.sha256}, not ${digest}`);
    return { state: 'found', ext, location, trusted: isExtensionTrusted(digest, env) };
  }
  return { state: 'missing' };
}

/** The `extensions` entries of a bundle's lock, or [] when there is no lock. */
export function lockedExtensions(bundleRoot: string): LockedExtension[] {
  const path = join(bundleRoot, 'explain.lock.json');
  if (!existsSync(path)) return [];
  let lock: unknown;
  try {
    lock = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('E_SYNTAX', `${path} is not valid JSON`);
  }
  const check = validateAgainst('lock', lock);
  if (!check.ok) fail('E_SYNTAX', `${path} violates explain-lock/1: ${check.errors.join('; ')}`);
  return ((lock as { extensions?: LockedExtension[] }).extensions ?? []);
}

export type BindOptions = {
  bundleRoot: string;
  repoRoot: string | undefined;
  env?: NodeJS.ProcessEnv;
  /** Render the source text of components whose extension cannot run, with a warning. */
  allowFallback?: boolean;
  limits?: RunLimits;
};

/**
 * Resolve every extension a document uses. Problems that `allowFallback`
 * may turn into the text fallback: not pinned, not installed, not trusted.
 * Problems that always stop: a corrupt copy (E_INTEGRITY), a lock entry whose
 * name or version differs from the manifest, and component attributes that
 * violate the extension's own schema (checked statically, before trust).
 */
export function bindExtensions(model: TargetModel, opts: BindOptions): { bindings: Map<string, ExtensionBinding>; diagnostics: Diagnostic[] } {
  const env = opts.env ?? process.env;
  const bindings = new Map<string, ExtensionBinding>();
  const diagnostics: Diagnostic[] = [];
  const components = componentInputs(model);
  if (components.length === 0) return { bindings, diagnostics };
  const locked = lockedExtensions(opts.bundleRoot);
  const names = [...new Set(components.map((c) => c.use))].sort();
  for (const name of names) {
    const first = components.find((c) => c.use === name)!.id;
    const unusable = (code: string, message: string, sha256?: string) => {
      bindings.set(name, { name, ...(sha256 ? { sha256 } : {}), ready: false, code, message });
      diagnostics.push(opts.allowFallback
        ? { code: 'W_EXTENSION_FALLBACK', severity: 'warning', message: `${message}; showing the component's source text only`, path: 'index.md', targetId: first }
        : { code, severity: 'error', message: `${message} (or build with --allow-extension-fallback to show its source text)`, path: 'index.md', targetId: first });
    };
    const entry = locked.find((e) => e.name === name);
    if (!entry) {
      unusable('E_EXTENSION_MISSING', `extension ${name} is not pinned in explain.lock.json; run \`explain extension pin DOC DIGEST\``);
      continue;
    }
    const found = locateExtension(entry.sha256, opts.repoRoot, env);
    if (found.state === 'missing') {
      unusable('E_EXTENSION_MISSING', `extension ${name} ${entry.sha256} is not installed; run \`explain extension install --from-dir DIR --scope user\``, entry.sha256);
      continue;
    }
    const { ext } = found;
    if (ext.manifest.name !== name || ext.manifest.version !== entry.version) {
      fail('E_INTEGRITY', `the lock pins ${name} ${entry.version}, but digest ${entry.sha256} is ${ext.manifest.name} ${ext.manifest.version}`);
    }
    // Static schema inspection is allowed before trust (§14.3).
    for (const c of components.filter((x) => x.use === name)) {
      for (const error of checkComponentInput(ext, c.input)) {
        diagnostics.push({ code: 'E_SEMANTIC', severity: 'error', message: `extension ${c.id} (${name}): ${error}`, path: 'index.md', targetId: c.id });
      }
    }
    if (!found.trusted) {
      unusable('E_EXTENSION_UNTRUSTED', `extension ${name} ${entry.sha256} is not in the user trust store; review it with \`explain extension inspect ${entry.sha256}\`, then run \`explain extension trust ${entry.sha256}\``, entry.sha256);
      continue;
    }
    const limits = opts.limits ?? DEFAULT_LIMITS;
    bindings.set(name, { name, sha256: entry.sha256, version: ext.manifest.version, ready: true, run: (input) => runBuildEntry(ext, input, limits) });
  }
  return { bindings, diagnostics };
}
