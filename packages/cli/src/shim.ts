// The user shim (§12.2, §12.7): `${EXPLAIN_HOME:-~/.explain}/bin/explain.cjs`.
// Skill wrappers call only this file. It resolves the toolkit that the
// document's lock pins by the §12.4 order (a repository toolchain only when
// its digest is in the user trust store), verifies the release (§12.1), and
// then runs that toolkit's own bin/explain.cjs with the same arguments. It
// never reads or runs REPO/.explain/bin, and it never picks the newest
// installed toolkit on its own.
//
// Which toolkit:
// - a command with a document (DOC positional or --doc): the document's lock;
// - `init PATH`: the workspace default of the repository that will hold PATH,
//   else the user default;
// - `install`, `trust`, `doctor`: the user default (`${EXPLAIN_HOME}/default`);
// - any other command without a document: the workspace default, else the
//   user default.
// `--toolkit-dir DIR` and `--dev-toolkit DIR` are explicit user choices.
import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { CliError, EXIT, parseArgs, type ParsedArgs, printDiagnostics, stringFlag } from './cli-util.ts';
import { findRepositoryRoot, readDefaultPointer, readLock, resolveDigest, verifyRelease, workspaceDefault, type VerifiedRelease } from './toolkit.ts';

// Commands whose first positional argument is the document.
const DOC_POSITIONAL = new Set(['check', 'build', 'serve', 'export', 'fork', 'upgrade']);
// User-level commands: they never use a repository's workspace default.
const USER_COMMANDS = new Set(['install', 'trust', 'doctor']);

/** The bundle root of the document that `argv` names, if any. */
export function documentOf(command: string | undefined, args: ParsedArgs): string | undefined {
  const flagDoc = args.flags.get('doc');
  let doc: string | undefined = typeof flagDoc === 'string' ? flagDoc : undefined;
  if (!doc && command && DOC_POSITIONAL.has(command)) doc = args.positional[0];
  if (!doc && command === 'ids' && args.positional[0] === 'assign') doc = args.positional[1];
  if (!doc && command === 'refs' && args.positional[0] === 'show') doc = args.positional[1];
  if (!doc) return undefined;
  const path = resolve(doc);
  try {
    if (lstatSync(path).isDirectory()) return path;
  } catch {
    // A missing document: the toolkit's CLI reports it with the right code.
  }
  return dirname(path);
}

function noDefault(): never {
  throw new CliError('E_TOOLKIT_MISSING', 'no toolkit selected: this command names no document, and there is no workspace or user default toolkit. Pass --toolkit-dir PATH, or install a toolkit as the user default (explain install ... --scope user --default)', EXIT.unavailable);
}

/** Select and verify the toolkit whose CLI runs this command. */
export function selectToolkit(argv: string[], env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): VerifiedRelease {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  const devToolkit = stringFlag(args, 'dev-toolkit');
  const toolkitDir = stringFlag(args, 'toolkit-dir');
  if (devToolkit) return verifyRelease(resolve(devToolkit));

  const bundleRoot = command === 'init' ? undefined : documentOf(command, args);
  // `upgrade DOC --to DIGEST` runs the TARGET toolkit's CLI, through the same
  // trust gate: an older pinned toolkit may not have `upgrade` at all.
  const to = command === 'upgrade' ? stringFlag(args, 'to') : undefined;
  if (bundleRoot && to && /^[0-9a-f]{64}$/.test(to)) {
    return resolveDigest({ digest: to, repoRoot: findRepositoryRoot(bundleRoot), toolkitDir, env }).release;
  }
  if (bundleRoot) {
    const lock = readLock(bundleRoot);
    if (!lock) {
      throw new CliError('E_TOOLKIT_MISSING', `no explain.lock.json in ${bundleRoot}; run \`explain init\` or pass --dev-toolkit`, EXIT.unavailable);
    }
    return resolveDigest({ digest: lock.sha256, repoRoot: findRepositoryRoot(bundleRoot), toolkitDir, env, origin: lock.origin, version: lock.version }).release;
  }

  // No document lock applies: an explicit --toolkit-dir wins over any default.
  if (toolkitDir) return verifyRelease(resolve(toolkitDir));
  let repoRoot: string | undefined;
  if (command === 'init') {
    const target = args.positional[0];
    repoRoot = findRepositoryRoot(target ? dirname(resolve(cwd, target)) : cwd);
  } else if (!command || !USER_COMMANDS.has(command)) {
    repoRoot = findRepositoryRoot(cwd);
  }
  const digest = workspaceDefault(repoRoot) ?? readDefaultPointer(env);
  if (!digest) noDefault();
  return resolveDigest({ digest, repoRoot, env }).release;
}

/** Run the command through the selected toolkit's own CLI; returns its exit code. */
export function shimMain(argv: string[], env: NodeJS.ProcessEnv = process.env): number {
  let release: VerifiedRelease;
  try {
    release = selectToolkit(argv, env);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    printDiagnostics([{ code: error.code, severity: 'error', message: error.message }], argv.includes('--json'));
    return error.exitCode;
  }
  const result = spawnSync(process.execPath, [join(release.dir, 'bin', 'explain.cjs'), ...argv], { stdio: 'inherit', env });
  if (result.error) {
    process.stderr.write(`error E_TOOLKIT_MISSING: cannot run ${release.dir}/bin/explain.cjs: ${result.error.message}\n`);
    return EXIT.unavailable;
  }
  if (result.signal) return 128 + (constants.signals[result.signal] ?? 0);
  return result.status ?? EXIT.internal;
}

// Run only as the bundled entry (bin/explain.cjs in EXPLAIN_HOME), not on import.
if (typeof module !== 'undefined' && typeof require !== 'undefined' && require.main === module) {
  process.exitCode = shimMain(process.argv.slice(2));
}
