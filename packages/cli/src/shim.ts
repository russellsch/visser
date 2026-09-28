// The user shim (§12.2, §12.7): `${VISSER_HOME:-~/.visser}/bin/visser.cjs`.
// Skill wrappers call only this file. It resolves the toolkit that the
// document's lock pins by the §12.4 order (a repository toolchain only when
// its digest is in the user trust store), verifies the release (§12.1), and
// then runs that toolkit's own bin/visser.cjs with the same arguments. It
// never reads or runs REPO/.visser/bin, and it never picks the newest
// installed toolkit on its own.
//
// Which toolkit:
// - a command with a document (DOC positional or --doc): the document's lock;
// - `init PATH`: the workspace default of the repository that will hold PATH,
//   else the user default;
// - `install`, `trust`, `doctor`: the user default (`${VISSER_HOME}/default`),
//   never a document's lock (so `doctor --doc` can report a lock that does not
//   resolve). If the default toolchain is gone, `install --from-dir DIR` runs
//   the verified release it installs, and the other two print a command that
//   recovers;
// - any other command without a document: the workspace default, else the
//   user default.
// `--toolkit-dir DIR` and `--dev-toolkit DIR` are explicit user choices.
// The shim forwards SIGINT, SIGTERM, and SIGHUP to the toolkit process, so
// stopping the shim by its PID also stops `serve`.
import { spawn } from 'node:child_process';
import { lstatSync, readdirSync } from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { HashError } from '../../core/src/model/hash.ts';
import { readCollection } from '../../core/src/export/collection.ts';
import { CliError, EXIT, exitCodeFor, ignoreClosedPipes, parseArgs, type ParsedArgs, printDiagnostics, stringFlag } from './cli-util.ts';
import { findRepositoryRoot, readDefaultPointer, readLock, resolveDigest, verifyRelease, workspaceDefault, type VerifiedRelease } from './toolkit.ts';
import { visserHome } from '../../core/src/distribution/trust.ts';

// Commands whose first positional argument is the document.
const DOC_POSITIONAL = new Set(['check', 'build', 'serve', 'export', 'fork', 'upgrade']);
// User-level commands: they never use a repository's workspace default.
const USER_COMMANDS = new Set(['install', 'trust', 'doctor']);

function bundleRootOf(doc: string): string {
  const path = resolve(doc);
  try {
    if (lstatSync(path).isDirectory()) return path;
  } catch {
    // A missing document: the toolkit's CLI reports it with the right code.
  }
  return dirname(path);
}

/**
 * The bundle root of the document that `argv` names, if any. A command with a
 * positional document uses that document; the CLI does too. A `--doc` that
 * names a different bundle is refused, so the shim can never pick one
 * document's toolkit to act on another document.
 */
export function documentOf(command: string | undefined, args: ParsedArgs): string | undefined {
  const flagDoc = args.flags.get('doc');
  const byFlag = typeof flagDoc === 'string' ? bundleRootOf(flagDoc) : undefined;
  let positional: string | undefined;
  if (command && DOC_POSITIONAL.has(command)) positional = args.positional[0];
  if (command === 'ids' && args.positional[0] === 'assign') positional = args.positional[1];
  if (command === 'refs' && args.positional[0] === 'show') positional = args.positional[1];
  const byPosition = positional !== undefined ? bundleRootOf(positional) : undefined;
  if (byPosition !== undefined && byFlag !== undefined && byPosition !== byFlag) {
    throw new CliError('E_USAGE', `the document ${positional} and --doc ${String(flagDoc)} are different documents; name one document`, EXIT.invalid);
  }
  return byPosition ?? byFlag;
}

/**
 * `export --collection FILE`: every document's lock must pin one toolkit,
 * which then runs the whole export. Different toolkits cannot share one run.
 */
function collectionDigest(file: string): { digest: string; repoRoot: string | undefined; bundleRoot: string } {
  const path = resolve(file);
  const repoRoot = findRepositoryRoot(dirname(path));
  let documents: string[];
  try {
    documents = readCollection(path, repoRoot ?? dirname(path)).documents;
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    throw new CliError(error.code, error.message, exitCodeFor([{ code: error.code, severity: 'error', message: error.message }]));
  }
  const digests = new Map<string, string[]>();
  for (const index of documents) {
    const bundleRoot = dirname(index);
    const lock = readLock(bundleRoot);
    if (!lock) throw new CliError('E_TOOLKIT_MISSING', `no visser.lock.json in ${bundleRoot}; restore visser.lock.json from version control, or pass --dev-toolkit DIR (\`visser init\` is only for a new document)`, EXIT.unavailable);
    digests.set(lock.sha256, [...(digests.get(lock.sha256) ?? []), bundleRoot]);
  }
  if (digests.size === 0) throw new CliError('E_USAGE', `the collection ${file} names no documents`, EXIT.invalid);
  if (digests.size > 1) {
    const list = [...digests].map(([digest, roots]) => `${digest} (${roots.join(', ')})`).join('; ');
    throw new CliError('E_USAGE', `the collection's documents pin different toolkits: ${list}. Upgrade them to one toolkit (visser upgrade DOC --to DIGEST), or export them separately`, EXIT.invalid);
  }
  const [digest, roots] = [...digests][0]!;
  return { digest, repoRoot, bundleRoot: roots[0]! };
}

/** Verified user toolchains, for a recovery command (at most 3, sorted by name). */
function installedToolchains(env: NodeJS.ProcessEnv): string[] {
  let names: string[] = [];
  const base = join(visserHome(env), 'toolchains');
  try { names = readdirSync(base).filter((n) => /^[0-9a-f]{64}$/.test(n)).sort(); } catch { return []; }
  const out: string[] = [];
  for (const name of names) {
    try {
      if (verifyRelease(join(base, name)).sha256 === name) out.push(join(base, name));
    } catch { /* not usable: skip */ }
    if (out.length === 3) break;
  }
  return out;
}

/**
 * The user default is unusable and the command is a user-level one. The
 * recovery must be a command that works: running an installed release's own
 * CLI to make it the default again (install of an installed release only
 * rewrites the default pointer and the shim).
 */
function recovery(reason: string, env: NodeJS.ProcessEnv): CliError {
  const found = installedToolchains(env);
  const commands = found.length > 0
    ? found.map((dir) => `  node ${join(dir, 'bin', 'visser.cjs')} install --from-dir ${dir} --scope user --default`)
    : ['  node RELEASE/bin/visser.cjs install --from-dir RELEASE --scope user --default', '  (RELEASE is a Visser release folder, for example dist/release in a clone of Visser)'];
  return new CliError('E_TOOLKIT_MISSING', `${reason}. Make an installed toolkit the default with one of:\n${commands.join('\n')}\nor run: visser install --from-dir RELEASE --scope user --default`, EXIT.unavailable);
}

function noDefault(): never {
  throw new CliError('E_TOOLKIT_MISSING', 'no toolkit selected: this command names no document, and there is no workspace or user default toolkit. Pass --toolkit-dir PATH, or install a toolkit as the user default (visser install ... --scope user --default)', EXIT.unavailable);
}

/** Select and verify the toolkit whose CLI runs this command. */
export function selectToolkit(argv: string[], env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): VerifiedRelease {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  const devToolkit = stringFlag(args, 'dev-toolkit');
  const toolkitDir = stringFlag(args, 'toolkit-dir');
  if (devToolkit) return verifyRelease(resolve(devToolkit));

  const collection = command === 'export' ? stringFlag(args, 'collection') : undefined;
  if (collection !== undefined) {
    const { digest, bundleRoot: first } = collectionDigest(collection);
    return resolveDigest({ digest, repoRoot: findRepositoryRoot(first), toolkitDir, env }).release;
  }
  // User-level commands never resolve by a document: `doctor --doc DOC`
  // reports that document's lock, including a lock that does not resolve.
  const userCommand = command !== undefined && USER_COMMANDS.has(command);
  const bundleRoot = command === 'init' || userCommand ? undefined : documentOf(command, args);
  // `upgrade DOC --to DIGEST` runs the TARGET toolkit's CLI, through the same
  // trust gate: an older pinned toolkit may not have `upgrade` at all.
  const to = command === 'upgrade' ? stringFlag(args, 'to') : undefined;
  if (bundleRoot && to && /^[0-9a-f]{64}$/.test(to)) {
    return resolveDigest({ digest: to, repoRoot: findRepositoryRoot(bundleRoot), toolkitDir, env }).release;
  }
  if (bundleRoot) {
    const lock = readLock(bundleRoot);
    if (!lock) {
      throw new CliError('E_TOOLKIT_MISSING', `no visser.lock.json in ${bundleRoot}; restore visser.lock.json from version control, or pass --dev-toolkit DIR (\`visser init\` is only for a new document)`, EXIT.unavailable);
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
  if (!userCommand) {
    const digest = workspaceDefault(repoRoot) ?? readDefaultPointer(env);
    if (!digest) noDefault();
    return resolveDigest({ digest, repoRoot, env }).release;
  }
  // A user-level command. `install --from-dir DIR` needs no default at all:
  // the user named the release, so its own verified CLI installs it.
  const fromDir = command === 'install' ? stringFlag(args, 'from-dir') : undefined;
  let reason: string;
  try {
    const digest = readDefaultPointer(env);
    if (digest) return resolveDigest({ digest, env }).release;
    reason = `there is no default toolkit (${join(visserHome(env), 'default')})`;
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    reason = `the default toolkit is not usable: ${error.message.replace(/; (only a copy|install it with).*$/s, '')}`;
  }
  if (fromDir !== undefined) return verifyRelease(resolve(cwd, fromDir));
  throw recovery(reason, env);
}

const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

/** Run the command through the selected toolkit's own CLI; resolves to its exit code. */
export function shimMain(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let release: VerifiedRelease;
  try {
    release = selectToolkit(argv, env);
  } catch (error) {
    let code: string;
    let message: string;
    let exit: number;
    if (error instanceof CliError) ({ code, message, exitCode: exit } = error);
    else if (error instanceof HashError) {
      ({ code, message } = error);
      exit = exitCodeFor([{ code, severity: 'error', message }]);
    } else throw error;
    printDiagnostics([{ code, severity: 'error', message }], argv.includes('--json'));
    return Promise.resolve(exit);
  }
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(release.dir, 'bin', 'visser.cjs'), ...argv], { stdio: 'inherit', env });
    // A signal to the shim goes to the toolkit process too. A terminal Ctrl-C
    // reaches both already; the second delivery is harmless for a process
    // that is stopping.
    const forward = (signal: NodeJS.Signals) => { child.kill(signal); };
    for (const signal of FORWARDED) process.on(signal, forward);
    const finish = (code: number) => {
      for (const signal of FORWARDED) process.off(signal, forward);
      done(code);
    };
    child.once('error', (error) => {
      process.stderr.write(`error E_TOOLKIT_MISSING: cannot run ${release.dir}/bin/visser.cjs: ${error.message}\n`);
      finish(EXIT.unavailable);
    });
    child.once('exit', (status, signal) => {
      finish(signal ? 128 + (constants.signals[signal] ?? 0) : status ?? EXIT.internal);
    });
  });
}

// Run only as the bundled entry (bin/visser.cjs in VISSER_HOME), not on import.
if (typeof module !== 'undefined' && typeof require !== 'undefined' && require.main === module) {
  ignoreClosedPipes();
  void shimMain(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
