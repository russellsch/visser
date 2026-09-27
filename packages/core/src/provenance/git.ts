// Hardened, read-only Git access for capture and origin verification (§8.2).
// The repository is untrusted: every command runs with an allowlisted
// environment and flags that disable repository-controlled execution,
// object replacement, grafts, and network fetches.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { HashError } from '../model/hash.ts';

/** Largest blob or file capture reads (§2.3: 10 MiB primary source). */
export const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

/** Git's environment, built from an allowlist and never inherited (§8.2 step 2). */
export function gitEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    LANG: 'C',
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_GRAFT_FILE: '/dev/null',
    GIT_LITERAL_PATHSPECS: '1',
    // Overrides every protocol.<name>.allow in repository config, so a hostile
    // promisor URL (ext::, file://, ssh with core.sshCommand) can neither run
    // a command nor fetch (§8.2 step 1). `protocol.allow=never` alone is only a default.
    GIT_ALLOW_PROTOCOL: 'none',
  };
  if (process.env['PATH'] !== undefined) env['PATH'] = process.env['PATH'];
  if (process.env['HOME'] !== undefined) env['HOME'] = process.env['HOME'];
  return env;
}

/** Flags on every Git command (§8.2 step 1). */
export const HARDENED_FLAGS: readonly string[] = [
  '--no-pager',
  '-c', 'core.fsmonitor=',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'protocol.allow=never',
  '-c', 'advice.graftFileDeprecated=false',
];

type GitResult = { status: number | null; stdout: Buffer; stderr: string };

function runGit(dir: string, args: readonly string[]): GitResult {
  const r = spawnSync('git', ['-C', dir, ...HARDENED_FLAGS, ...args], {
    env: gitEnvironment(),
    shell: false,
    encoding: 'buffer',
    maxBuffer: MAX_CAPTURE_BYTES + 1024 * 1024,
  });
  if (r.error) fail('E_SOURCE_UNAVAILABLE', `cannot run git: ${r.error.message}`);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr.toString('utf8').trim() };
}

function gitError(args: readonly string[], stderr: string): never {
  if (/dubious ownership/i.test(stderr)) fail('E_SOURCE_UNAVAILABLE', `git refused the repository (dubious ownership): ${stderr}`);
  if (/hash mismatch|corrupt|does not match/i.test(stderr)) fail('E_INTEGRITY', `git found an object that does not match its ID: ${stderr}`);
  if (/could not fetch|promisor/i.test(stderr)) fail('E_SOURCE_UNAVAILABLE', `the object is not in the local repository and capture never fetches: ${stderr}`);
  fail('E_SOURCE_UNAVAILABLE', `git ${args[0] ?? ''} failed: ${stderr || 'unknown error'}`);
}

function mustGit(dir: string, args: readonly string[]): Buffer {
  const r = runGit(dir, args);
  if (r.status !== 0) gitError(args, r.stderr);
  return r.stdout;
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

export type Repository = {
  toplevel: string; // realpath of the working tree root
  gitDir: string; // absolute git dir
  objectFormat: 'sha1' | 'sha256';
};

export type OpenOptions = {
  allowAlternates?: boolean;
  allowExternalGitdir?: boolean;
};

/** Open `--repo` with the containment checks of §8.2 steps 3–4. */
export function openRepository(repoPath: string, opts: OpenOptions = {}): Repository {
  if (!existsSync(repoPath)) fail('E_SOURCE_UNAVAILABLE', `repository ${repoPath} does not exist`);
  const requested = realpathSync(repoPath);
  const out = mustGit(requested, ['rev-parse', '--absolute-git-dir', '--show-toplevel']).toString('utf8').split('\n');
  const gitDir = out[0]?.trim() ?? '';
  const toplevelRaw = out[1]?.trim() ?? '';
  if (!gitDir || !toplevelRaw) fail('E_SOURCE_UNAVAILABLE', `${repoPath} is not a Git working tree`);
  const toplevel = realpathSync(toplevelRaw);
  if (toplevel !== requested) {
    fail('E_PATH_ESCAPE', `--repo must be the working tree root: ${repoPath} resolves to ${toplevel}`);
  }
  const realGitDir = realpathSync(gitDir);
  if (!isInside(realGitDir, toplevel) && !opts.allowExternalGitdir) {
    fail('E_PATH_ESCAPE', `the git dir ${realGitDir} is outside ${toplevel} (a .git file can redirect reads); pass --allow-external-gitdir for a linked worktree or submodule`);
  }
  // Where the objects really are: a `commondir` file or a symlinked objects
  // directory can redirect reads to another repository (§8.2 steps 3-4).
  if (existsSync(join(realGitDir, 'commondir')) && !opts.allowExternalGitdir) {
    fail('E_PATH_ESCAPE', 'the git dir has a commondir file that redirects object reads; pass --allow-external-gitdir for a linked worktree');
  }
  const paths = mustGit(requested, ['rev-parse', '--path-format=absolute', '--git-common-dir', '--git-path', 'objects']).toString('utf8').split('\n');
  const commonDir = realpathSync(paths[0]?.trim() || realGitDir);
  const objectsDir = realpathSync(paths[1]?.trim() || join(realGitDir, 'objects'));
  for (const [what, dir] of [['common git dir', commonDir], ['object directory', objectsDir]] as const) {
    if (!isInside(dir, toplevel) && !opts.allowExternalGitdir) {
      fail('E_PATH_ESCAPE', `the ${what} ${dir} is outside ${toplevel}; pass --allow-external-gitdir for a linked worktree or submodule`);
    }
  }
  for (const name of ['alternates', 'http-alternates']) {
    if (existsSync(join(objectsDir, 'info', name)) && !opts.allowAlternates) {
      fail('E_PATH_ESCAPE', `objects/info/${name} lets this repository read another repository's objects; pass --allow-alternates to accept it`);
    }
  }
  const format = mustGit(toplevel, ['rev-parse', '--show-object-format']).toString('utf8').trim();
  if (format !== 'sha1' && format !== 'sha256') fail('E_SOURCE_UNAVAILABLE', `unsupported object format ${format}`);
  return { toplevel, gitDir: realGitDir, objectFormat: format };
}

// ---------------------------------------------------------------------------
// Argument grammars (§8.2 step 5)

/** A bundle-style relative path: NFC, no empty/`.`/`..` segments, no leading `/`, `:`, or `-`, no backslash. */
export function checkRepoPath(file: string): void {
  const bad = (why: string): never => fail('E_USAGE', `--file ${JSON.stringify(file)} ${why}`);
  if (file === '') bad('is empty');
  if (file.normalize('NFC') !== file) bad('is not NFC');
  if (/[\0\\]/.test(file)) bad('contains NUL or a backslash');
  if (/^[/:-]/.test(file)) bad('must not start with /, :, or -');
  if (file.split('/').some((s) => s === '' || s === '.' || s === '..')) bad('must not contain empty, ".", or ".." segments');
}

/** `--lines START:END`, strictly decimal, 1-based (§8.2 step 5). The line-count check happens after the read. */
export function parseLineRange(text: string): { start: number; end: number } {
  const m = /^([1-9][0-9]{0,8}):([1-9][0-9]{0,8})$/.exec(text);
  if (!m) fail('E_USAGE', `--lines ${JSON.stringify(text)} must look like START:END with decimal numbers from 1`);
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start > end) fail('E_USAGE', `--lines ${text}: start is after end`);
  return { start, end };
}

/** Reject a `--rev` that could be read as an option (§8.2 step 5). */
export function checkRev(rev: string): void {
  if (rev === '' || rev.startsWith('-') || /[\0\n]/.test(rev)) fail('E_USAGE', `--rev ${JSON.stringify(rev)} is not allowed`);
}

// ---------------------------------------------------------------------------
// Reads

export function resolveCommit(repo: Repository, rev: string): string {
  checkRev(rev);
  return mustGit(repo.toplevel, ['rev-parse', '--verify', '--end-of-options', `${rev}^{commit}`]).toString('utf8').trim();
}

/** Git's object hash of `bytes` as an object of `type`, in the repository's object format. */
export function objectId(type: 'blob' | 'tree' | 'commit', bytes: Uint8Array, format: 'sha1' | 'sha256'): string {
  const hash = createHash(format === 'sha1' ? 'sha1' : 'sha256');
  hash.update(`${type} ${bytes.length}\0`);
  hash.update(bytes);
  return hash.digest('hex');
}

/** Git's object hash of `bytes` as a blob, in the repository's object format. */
export function blobObjectId(bytes: Uint8Array, format: 'sha1' | 'sha256'): string {
  return objectId('blob', bytes, format);
}

/** Read an object of `type` and require that its bytes hash to `oid` (§8.2 step 8, for every object on the path). */
function readVerified(repo: Repository, type: 'tree' | 'commit', oid: string): Uint8Array {
  const bytes = new Uint8Array(mustGit(repo.toplevel, ['cat-file', type, '--end-of-options', oid]));
  if (objectId(type, bytes, repo.objectFormat) !== oid) fail('E_INTEGRITY', `the ${type} git returned does not hash to object ${oid}`);
  return bytes;
}

type TreeEntry = { mode: string; name: string; oid: string };

function parseTree(bytes: Uint8Array, format: 'sha1' | 'sha256'): TreeEntry[] {
  const idLength = format === 'sha1' ? 20 : 32;
  const entries: TreeEntry[] = [];
  let i = 0;
  while (i < bytes.length) {
    const space = bytes.indexOf(0x20, i);
    const nul = bytes.indexOf(0x00, space + 1);
    if (space < 0 || nul < 0 || nul + 1 + idLength > bytes.length) fail('E_INTEGRITY', 'a tree object is malformed');
    const mode = new TextDecoder().decode(bytes.subarray(i, space));
    const name = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(space + 1, nul));
    const oid = Buffer.from(bytes.subarray(nul + 1, nul + 1 + idLength)).toString('hex');
    entries.push({ mode, name, oid });
    i = nul + 1 + idLength;
  }
  return entries;
}

/**
 * Walk commit -> tree -> ... -> entry for `file`, rechecking every object's
 * hash, so neither `ls-tree` nor a packed object is the source of trust.
 */
function treeEntryAt(repo: Repository, commit: string, file: string): TreeEntry {
  const commitBytes = readVerified(repo, 'commit', commit);
  const header = new TextDecoder().decode(commitBytes.subarray(0, Math.min(commitBytes.length, 200)));
  const m = /^tree ([0-9a-f]+)\n/.exec(header);
  if (!m) fail('E_INTEGRITY', `commit ${commit} has no tree`);
  let tree = m[1]!;
  const segments = file.split('/');
  for (let k = 0; k < segments.length; k++) {
    const entry = parseTree(readVerified(repo, 'tree', tree), repo.objectFormat).find((e) => e.name === segments[k]);
    if (!entry) fail('E_SOURCE_UNAVAILABLE', `${file} does not exist at commit ${commit}`);
    if (k === segments.length - 1) return entry;
    if (entry.mode !== '40000') fail('E_SOURCE_UNAVAILABLE', `${segments.slice(0, k + 1).join('/')} is not a directory at commit ${commit}`);
    tree = entry.oid;
  }
  fail('E_SOURCE_UNAVAILABLE', `${file} does not exist at commit ${commit}`);
}

export type BlobRead = { commit: string; blob: string; bytes: Uint8Array };

/** Read `<commit>:<file>` as a regular blob (§8.2 steps 5–8). */
export function readBlobAt(repo: Repository, commit: string, file: string): BlobRead {
  checkRepoPath(file);
  // Mode from the verified tree entry: a submodule is 160000, a directory 40000, a symlink 120000.
  const { mode, oid } = treeEntryAt(repo, commit, file);
  if (mode === '40000') fail('E_SOURCE_UNAVAILABLE', `${file} is a tree at commit ${commit}, not a file`);
  if (mode === '160000') fail('E_SOURCE_UNAVAILABLE', `${file} is a commit (submodule) at commit ${commit}, not a file`);
  if (mode === '120000') fail('E_SOURCE_UNAVAILABLE', `${file} is a committed symbolic link; capture its target file instead`);
  if (mode !== '100644' && mode !== '100755') fail('E_SOURCE_UNAVAILABLE', `${file} has unsupported mode ${mode}`);
  const size = Number(mustGit(repo.toplevel, ['cat-file', '-s', '--end-of-options', oid]).toString('utf8').trim());
  if (!Number.isSafeInteger(size) || size > MAX_CAPTURE_BYTES) fail('E_LIMIT', `${file} is ${size} bytes; the capture limit is ${MAX_CAPTURE_BYTES}`);
  const bytes = new Uint8Array(mustGit(repo.toplevel, ['cat-file', 'blob', '--end-of-options', oid]));
  // Second defence against object substitution (§8.2 step 8).
  if (blobObjectId(bytes, repo.objectFormat) !== oid) {
    fail('E_INTEGRITY', `the bytes git returned for ${file} do not hash to object ${oid}`);
  }
  return { commit, blob: oid, bytes };
}

/** The commit HEAD points to, or undefined in a repository with no commits. */
export function headCommit(repo: Repository): string | undefined {
  const r = runGit(repo.toplevel, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}']);
  return r.status === 0 ? r.stdout.toString('utf8').trim() : undefined;
}

/** A Git config value from the repository, read with the hardened procedure. */
export function configValue(repo: Repository, key: string): string | undefined {
  const r = runGit(repo.toplevel, ['config', '--get', '--end-of-options', key]);
  return r.status === 0 ? r.stdout.toString('utf8').trim() : undefined;
}

/** Read a working-tree file directly under §15.4 path rules (no Git command reads it). */
export function readWorkingTreeFile(repo: Repository, file: string): Uint8Array {
  checkRepoPath(file);
  let current = repo.toplevel;
  for (const segment of file.split('/')) {
    current = join(current, segment);
    let st;
    try {
      st = lstatSync(current);
    } catch {
      fail('E_SOURCE_UNAVAILABLE', `${file} does not exist in the working tree`);
    }
    if (st.isSymbolicLink()) fail('E_PATH_ESCAPE', `${relative(repo.toplevel, current)} is a symbolic link`);
  }
  const st = lstatSync(current);
  if (!st.isFile()) fail('E_SOURCE_UNAVAILABLE', `${file} is not a regular file`);
  if (st.size > MAX_CAPTURE_BYTES) fail('E_LIMIT', `${file} is ${st.size} bytes; the capture limit is ${MAX_CAPTURE_BYTES}`);
  if (!isInside(realpathSync(current), repo.toplevel)) fail('E_PATH_ESCAPE', `${file} resolves outside the repository`);
  return new Uint8Array(readFileSync(current));
}
