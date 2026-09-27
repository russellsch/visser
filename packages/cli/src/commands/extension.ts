// `visser extension install|inspect|trust|pin` (§14.2, §14.3, §17.1).
// - install copies a verified extension into user or repository storage and
//   never trusts it;
// - inspect shows the manifest, the component schema, and the guide, and never
//   runs anything;
// - trust writes only the user trust store;
// - pin writes the document lock's `extensions` entry with a guarded write.
// An extension is executable code: once trusted, its build entry runs with the
// same OS privileges as the CLI. The worker process limits time and memory; it
// is not a sandbox.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HashError } from '../../../core/src/model/hash.ts';
import { loadBundle } from '../../../core/src/model/bundle.ts';
import { addTrust, isExtensionTrusted, readTrust, revokeTrust } from '../../../core/src/distribution/trust.ts';
import { findRepoRoot } from '../../../core/src/references/registry.ts';
import { componentSchema, installExtension, locateExtension, pinExtension, verifyExtensionDir, type VerifiedExtension } from '../../../core/src/extensions/index.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, printJson, stringFlag } from '../cli-util.ts';

const USAGE = [
  'usage: visser extension install --from-dir DIR --scope user|repo [--root DIR] [--json]',
  '       visser extension inspect DIR|DIGEST [--json]',
  '       visser extension trust DIGEST [--revoke] [--json]',
  '       visser extension pin DOC DIGEST [--dry-run] [--json]',
].join('\n');

const DIGEST = /^[0-9a-f]{64}$/;
const GUIDE_LIMIT = 65_536;

function booleanFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value === undefined) return false;
  if (value !== true) throw new CliError('E_USAGE', `--${name} takes no value\n${USAGE}`, EXIT.invalid);
  return true;
}

function inspect(args: ParsedArgs, json: boolean): number {
  const [, target, ...extra] = args.positional;
  if (!target || extra.length > 0) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  let ext: VerifiedExtension;
  let location: 'repository' | 'user' | 'directory';
  if (DIGEST.test(target)) {
    const found = locateExtension(target, findRepoRoot(process.cwd()));
    if (found.state === 'missing') throw new CliError('E_EXTENSION_MISSING', `extension ${target} is not installed`, EXIT.unavailable);
    ext = found.ext;
    location = found.location;
  } else {
    ext = verifyExtensionDir(resolve(target));
    location = 'directory';
  }
  const guideText = readFileSync(join(ext.dir, ...ext.manifest.guide.split('/')), 'utf8');
  const guide = guideText.length > GUIDE_LIMIT ? `${guideText.slice(0, GUIDE_LIMIT - 20)}\n[guide truncated]\n` : guideText;
  const result = {
    schema: 'visser-extension-inspect/1' as const,
    name: ext.manifest.name, version: ext.manifest.version, sha256: ext.sha256, path: ext.dir, location,
    trusted: isExtensionTrusted(ext.sha256), executable: true as const, buildEntry: ext.manifest.buildEntry,
    files: ext.manifest.files, componentSchema: componentSchema(ext), guide,
  };
  if (json) {
    printJson('extensionInspect', result);
  } else {
    // Every printed field comes from an untrusted extension: show control
    // characters as escapes, so a guide cannot move the cursor, clear the
    // screen, or print a fake "trusted: yes".
    const v = visibleText;
    process.stdout.write([
      `extension ${v(result.name)} ${v(result.version)}`,
      `  digest: ${result.sha256}`,
      `  path: ${v(result.path)} (${location})`,
      `  trusted: ${result.trusted ? 'yes' : 'no'}`,
      `  build entry: ${v(result.buildEntry)} (executable code; inspect did not run it)`,
      `  files: ${result.files.map((f) => v(f.path)).join(', ')}`,
      '',
      v(guide),
    ].join('\n') + '\n');
  }
  return EXIT.ok;
}

/** Replace C0 and C1 control characters (except newline and tab) and DEL with visible \\xNN escapes. */
export function visibleText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

function trust(args: ParsedArgs, json: boolean): number {
  const [, digest, ...extra] = args.positional;
  if (!digest || extra.length > 0) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  if (!DIGEST.test(digest)) throw new CliError('E_USAGE', `an extension digest is 64 lowercase hex characters, not ${JSON.stringify(digest)}`, EXIT.invalid);
  const revoke = booleanFlag(args, 'revoke');
  const before = isExtensionTrusted(digest);
  let result: { schema: 'visser-extension-trust/1'; digest: string; trusted: boolean; changed: boolean; source?: string; addedAt?: string };
  if (revoke) {
    if (before) revokeTrust(digest, process.env, 'extensions');
    result = { schema: 'visser-extension-trust/1', digest, trusted: false, changed: before };
  } else {
    const store = before ? readTrust() : addTrust(digest, 'extension trust', process.env, undefined, 'extensions');
    const entry = store.extensions![digest]!;
    result = { schema: 'visser-extension-trust/1', digest, trusted: true, changed: !before, source: entry.source, addedAt: entry.addedAt };
  }
  if (json) printJson('extensionTrust', result);
  else if (result.trusted) {
    process.stdout.write(`${result.changed ? 'trusted' : 'already trusted'} extension ${digest}\nIts build entry can now run with your user's privileges when a document pins this digest.\n`);
  } else {
    process.stdout.write(`${result.changed ? 'revoked trust in' : 'was not trusted:'} extension ${digest}\n`);
  }
  return EXIT.ok;
}

function install(args: ParsedArgs, json: boolean): number {
  if (args.positional.length > 1) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  const fromDir = stringFlag(args, 'from-dir');
  const scope = stringFlag(args, 'scope');
  if (!fromDir) throw new CliError('E_USAGE', `--from-dir is required\n${USAGE}`, EXIT.invalid);
  if (scope !== 'user' && scope !== 'repo') throw new CliError('E_USAGE', `--scope must be user or repo\n${USAGE}`, EXIT.invalid);
  const root = scope === 'repo' ? (stringFlag(args, 'root') ?? findRepoRoot(process.cwd())) : undefined;
  const result = installExtension({ fromDir, scope, ...(root ? { repoRoot: root } : {}) });
  if (json) printJson('extensionInstall', result);
  else {
    process.stdout.write([
      `${result.alreadyInstalled ? 'already installed' : 'installed'} extension ${result.name} ${result.version} (${scope} scope)`,
      `  digest: ${result.sha256}`,
      `  path: ${result.path}`,
      result.trusted ? '  trusted: yes' : `  trusted: no (installing never trusts; review with \`visser extension inspect ${result.sha256}\`, then \`visser extension trust ${result.sha256}\`)`,
    ].join('\n') + '\n');
  }
  return EXIT.ok;
}

function pin(args: ParsedArgs, json: boolean): number {
  const [, doc, digest, ...extra] = args.positional;
  if (!doc || !digest || extra.length > 0) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  if (!DIGEST.test(digest)) throw new CliError('E_USAGE', `an extension digest is 64 lowercase hex characters, not ${JSON.stringify(digest)}`, EXIT.invalid);
  const dryRun = booleanFlag(args, 'dry-run');
  const bundle = loadBundle(resolve(doc));
  if (!bundle.docId) throw new CliError('E_SYNTAX', `${doc} has no docId`, EXIT.invalid);
  const repoRoot = findRepoRoot(bundle.root) ?? bundle.root;
  const result = pinExtension({ bundleRoot: bundle.root, repoRoot, docId: bundle.docId, digest, dryRun });
  if (json) printJson('extensionPin', result);
  else {
    process.stdout.write(`${result.changed ? (dryRun ? 'would pin' : 'pinned') : 'already pinned'} extension ${result.name} ${result.version} (${digest}) in ${result.doc}\n`);
    if (result.diff) process.stdout.write(result.diff.endsWith('\n') ? result.diff : `${result.diff}\n`);
  }
  return EXIT.ok;
}

export async function runExtension(args: ParsedArgs): Promise<number> {
  const json = args.flags.get('json') === true;
  const [sub] = args.positional;
  try {
    switch (sub) {
      case 'inspect': return inspect(args, json);
      case 'trust': return trust(args, json);
      case 'install': return install(args, json);
      case 'pin': return pin(args, json);
      default: throw new CliError('E_USAGE', USAGE, EXIT.invalid);
    }
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const diagnostic = { code: error.code, severity: 'error' as const, message: error.message };
    printDiagnostics([diagnostic], json);
    return exitCodeFor([diagnostic]);
  }
}
