// `explain doctor [--doc PATH] [--json]` (§12.7, §17.1). A read-only report of
// Node, EXPLAIN_HOME, the user shim, installed and repository toolchains, the
// trust store, the document or workspace resolution, skill wrappers, and port
// 4310. Doctor never executes anything from a repository: it reads files and
// hashes them, and it reads repository toolchains only when they are trusted.
// Exit 0 when the report is ok, else 3.
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Diagnostic } from '../../../core/src/types.ts';
import { HashError } from '../../../core/src/model/hash.ts';
import { explainHome, readTrust, verifyReleaseDir, type TrustStore } from '../../../core/src/distribution/index.ts';
import { CliError, EXIT, type ParsedArgs, printJson, stringFlag } from '../cli-util.ts';
import { bundledReleaseDir, defaultPointerPath, findRepositoryRoot, readDefaultPointer, readLock, resolveDigest, workspaceDefault, type Resolved } from '../toolkit.ts';

const DIGEST = /^[0-9a-f]{64}$/;
const WRAPPER_LIMIT = 1024 * 1024;
/** The canonical wrapper text inside a toolkit pack; repository and user wrappers are compared with it by hash. */
export const CANONICAL_WRAPPER = 'skills/explain/wrapper/SKILL.md';

type Resolution = {
  state: 'resolved' | 'none' | 'no-lock' | 'error';
  sha256?: string; version?: string; source?: Resolved['source']; dir?: string; code?: string; message?: string;
};
type Toolchain = { scope: 'user' | 'repository'; path: string; name: string; state: 'verified' | 'corrupt' | 'untrusted'; trusted: boolean; version?: string; code?: string; message?: string };
type Wrapper = { host: 'claude-code' | 'codex'; scope: 'repository' | 'user'; path: string; sha256: string; state: 'matches' | 'differs' | 'no-canonical' };

export type DoctorReport = {
  schema: 'explain-doctor/1';
  ok: boolean;
  node: { version: string; supported: boolean };
  explainHome: string;
  userShim: { path: string; present: boolean; sha256?: string; matchesToolkit?: boolean };
  defaultToolkit: Resolution;
  toolchains: Toolchain[];
  trust: Array<{ sha256: string; source: string; addedAt: string }>;
  document?: { path: string; lockSha256?: string; resolution: Resolution };
  workspace?: { root: string; defaultSha256?: string; resolution: Resolution };
  wrappers: Wrapper[];
  conflicts: string[];
  port: { host: '127.0.0.1'; port: number; available: boolean };
  diagnostics: Diagnostic[];
};

export type DoctorOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** The release that contains the running CLI (default: from argv). */
  ownRelease?: string | undefined;
  port?: number;
};

function failure(error: unknown): { code: string; message: string } {
  if (error instanceof CliError || error instanceof HashError) return { code: error.code, message: error.message };
  throw error;
}

function resolution(fn: () => Resolved): Resolution {
  try {
    const found = fn();
    return { state: 'resolved', sha256: found.release.sha256, version: found.release.version, source: found.source, dir: found.release.dir };
  } catch (error) {
    return { state: 'error', ...failure(error) };
  }
}

function regularFile(path: string): boolean {
  try { return lstatSync(path).isFile(); } catch { return false; }
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listDir(path: string): string[] {
  try {
    if (!lstatSync(path).isDirectory()) return [];
    return readdirSync(path).sort();
  } catch {
    return [];
  }
}

function portAvailable(port: number): Promise<boolean> {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', () => done(false));
    server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
  });
}

export async function doctorReport(args: ParsedArgs, opts: DoctorOptions = {}): Promise<DoctorReport> {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const own = 'ownRelease' in opts ? opts.ownRelease : bundledReleaseDir();
  const home = explainHome(env);
  const diagnostics: Diagnostic[] = [];
  const conflicts: string[] = [];

  let store: TrustStore = { schema: 'explain-trust-store/1', toolkits: {} };
  try {
    store = readTrust(env);
  } catch (error) {
    const { code, message } = failure(error);
    diagnostics.push({ code, severity: 'error', message });
  }
  const trusted = (digest: string) => Object.hasOwn(store.toolkits, digest);

  // User toolchains: installed by the user, so doctor verifies each strictly.
  const toolchains: Toolchain[] = [];
  const userRoot = join(home, 'toolchains');
  for (const name of listDir(userRoot)) {
    const path = join(userRoot, name);
    const entry: Toolchain = { scope: 'user', path, name, state: 'verified', trusted: trusted(name) };
    try {
      if (!lstatSync(path).isDirectory()) throw new HashError('E_INTEGRITY', 'E_INTEGRITY', `${path} is not a directory`);
      const release = verifyReleaseDir(path);
      if (release.sha256 !== name) throw new HashError('E_INTEGRITY', 'E_INTEGRITY', `${path} holds toolkit ${release.sha256}, not ${name}`);
      entry.version = release.version;
    } catch (error) {
      Object.assign(entry, { state: 'corrupt' }, failure(error));
    }
    toolchains.push(entry);
  }

  // The document (--doc or positional) or the workspace around cwd.
  const docArg = stringFlag(args, 'doc') ?? args.positional[0];
  const bundleRoot = docArg ? (regularFile(resolve(cwd, docArg)) ? dirname(resolve(cwd, docArg)) : resolve(cwd, docArg)) : undefined;
  const repoRoot = findRepositoryRoot(bundleRoot ?? cwd);

  // Repository toolchains: repository-controlled code. Only a trusted one is
  // read (verified); an untrusted one is reported by name only.
  if (repoRoot) {
    const repoToolchains = join(repoRoot, '.explain', 'toolchains');
    for (const name of listDir(repoToolchains)) {
      const path = join(repoToolchains, name);
      const isTrusted = DIGEST.test(name) && trusted(name);
      const entry: Toolchain = { scope: 'repository', path, name, state: isTrusted ? 'verified' : 'untrusted', trusted: isTrusted };
      if (isTrusted) {
        try {
          if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new HashError('E_INTEGRITY', 'E_INTEGRITY', `${path} is not a plain directory`);
          const release = verifyReleaseDir(path);
          if (release.sha256 !== name) throw new HashError('E_INTEGRITY', 'E_INTEGRITY', `${path} holds toolkit ${release.sha256}, not ${name}`);
          entry.version = release.version;
        } catch (error) {
          Object.assign(entry, { state: 'corrupt' }, failure(error));
        }
      }
      toolchains.push(entry);
    }
  }

  let defaultToolkit: Resolution;
  try {
    const digest = readDefaultPointer(env);
    defaultToolkit = digest ? resolution(() => resolveDigest({ digest, env })) : { state: 'none', message: `no ${defaultPointerPath(env)}` };
  } catch (error) {
    defaultToolkit = { state: 'error', ...failure(error) };
  }

  let document: DoctorReport['document'];
  if (bundleRoot) {
    try {
      const lock = readLock(bundleRoot);
      document = lock
        ? { path: bundleRoot, lockSha256: lock.sha256, resolution: resolution(() => resolveDigest({ digest: lock.sha256, repoRoot, ownRelease: own, env, origin: lock.origin, version: lock.version })) }
        : { path: bundleRoot, resolution: { state: 'no-lock', code: 'E_TOOLKIT_MISSING', message: `no explain.lock.json in ${bundleRoot}` } };
    } catch (error) {
      document = { path: bundleRoot, resolution: { state: 'error', ...failure(error) } };
    }
  }

  let workspace: DoctorReport['workspace'];
  if (repoRoot) {
    try {
      const digest = workspaceDefault(repoRoot);
      workspace = digest
        ? { root: repoRoot, defaultSha256: digest, resolution: resolution(() => resolveDigest({ digest, repoRoot, ownRelease: own, env })) }
        : { root: repoRoot, resolution: { state: 'none' } };
    } catch (error) {
      workspace = { root: repoRoot, resolution: { state: 'error', ...failure(error) } };
    }
  }

  // The selected toolkit: the document's, else the workspace's, else the user default.
  const selected = [document?.resolution, workspace?.resolution, defaultToolkit].find((r) => r?.state === 'resolved');
  const canonicalPath = selected?.dir ? join(selected.dir, CANONICAL_WRAPPER) : undefined;
  const canonical = canonicalPath && regularFile(canonicalPath) ? sha256File(canonicalPath) : undefined;

  const wrappers: Wrapper[] = [];
  const userHome = env['HOME'] ?? homedir();
  const hosts = [['claude-code', '.claude'], ['codex', '.agents']] as const;
  for (const [host, folder] of hosts) {
    const found: Wrapper[] = [];
    for (const [scope, base] of [['repository', repoRoot], ['user', userHome]] as const) {
      if (!base) continue;
      const path = join(base, folder, 'skills', 'explain', 'SKILL.md');
      let stat;
      try { stat = lstatSync(path); } catch { continue; }
      if (!stat.isFile()) {
        conflicts.push(`${path} is not a regular file`);
        continue;
      }
      if (stat.size > WRAPPER_LIMIT) {
        conflicts.push(`${path} is larger than ${WRAPPER_LIMIT} bytes`);
        continue;
      }
      const sha256 = sha256File(path);
      found.push({ host, scope, path, sha256, state: canonical === undefined ? 'no-canonical' : sha256 === canonical ? 'matches' : 'differs' });
    }
    if (found.length === 2 && found[0]!.sha256 !== found[1]!.sha256) {
      conflicts.push(`${host}: the repository wrapper ${found[0]!.path} and the user wrapper ${found[1]!.path} differ; the host decides which one it loads`);
    }
    wrappers.push(...found);
  }

  const shimPath = join(home, 'bin', 'explain.cjs');
  const userShim: DoctorReport['userShim'] = { path: shimPath, present: regularFile(shimPath) };
  if (userShim.present) {
    userShim.sha256 = sha256File(shimPath);
    const packShim = selected?.dir ? join(selected.dir, 'bin', 'shim.cjs') : undefined;
    if (packShim && regularFile(packShim)) userShim.matchesToolkit = sha256File(packShim) === userShim.sha256;
  }

  const port = opts.port ?? 4310;
  const major = Number(/^v(\d+)/.exec(process.version)?.[1]);
  const ok = !diagnostics.some((d) => d.severity === 'error')
    && !toolchains.some((t) => t.state === 'corrupt')
    && document?.resolution.state !== 'error' && document?.resolution.state !== 'no-lock'
    && workspace?.resolution.state !== 'error'
    && defaultToolkit.state !== 'error';
  return {
    schema: 'explain-doctor/1',
    ok,
    node: { version: process.version, supported: major === 24 },
    explainHome: home,
    userShim,
    defaultToolkit,
    toolchains,
    trust: Object.entries(store.toolkits).map(([sha256, e]) => ({ sha256, source: e.source, addedAt: e.addedAt })),
    ...(document ? { document } : {}),
    ...(workspace ? { workspace } : {}),
    wrappers,
    conflicts,
    port: { host: '127.0.0.1', port, available: await portAvailable(port) },
    diagnostics,
  };
}

function describe(r: Resolution): string {
  if (r.state === 'resolved') return `${r.sha256} ${r.version ?? ''} (${r.source}: ${r.dir})`;
  if (r.state === 'error' || r.state === 'no-lock') return `${r.code ?? r.state}: ${r.message ?? ''}`;
  return r.message ?? r.state;
}

export async function runDoctor(args: ParsedArgs, opts: DoctorOptions = {}): Promise<number> {
  const report = await doctorReport(args, opts);
  if (args.flags.has('json')) {
    printJson('doctor', report);
  } else {
    const out: string[] = [
      `node: ${report.node.version}${report.node.supported ? '' : ' (unsupported: Explain needs Node 24)'}`,
      `EXPLAIN_HOME: ${report.explainHome}`,
      `user shim: ${report.userShim.present ? report.userShim.path : 'missing'}${report.userShim.matchesToolkit === false ? ' (differs from the selected toolkit)' : ''}`,
      `default toolkit: ${describe(report.defaultToolkit)}`,
    ];
    for (const t of report.toolchains) out.push(`toolchain ${t.scope} ${t.name}: ${t.state}${t.version ? ` ${t.version}` : ''}${t.code ? ` ${t.code}: ${t.message}` : ''}`);
    for (const t of report.trust) out.push(`trusted ${t.sha256} (${t.source}, ${t.addedAt})`);
    if (report.document) out.push(`document ${report.document.path}: ${describe(report.document.resolution)}`);
    if (report.workspace) out.push(`workspace ${report.workspace.root}: ${describe(report.workspace.resolution)}`);
    for (const w of report.wrappers) out.push(`wrapper ${w.host} ${w.scope} ${w.path}: ${w.state === 'no-canonical' ? `no canonical wrapper in this toolkit (${CANONICAL_WRAPPER})` : w.state}`);
    for (const c of report.conflicts) out.push(`conflict: ${c}`);
    out.push(`port ${report.port.host}:${report.port.port}: ${report.port.available ? 'available' : 'in use'}`);
    for (const d of report.diagnostics) out.push(`${d.severity} ${d.code}: ${d.message}`);
    out.push(report.ok ? 'ok' : 'problems found');
    process.stdout.write(out.join('\n') + '\n');
  }
  return report.ok ? EXIT.ok : EXIT.unavailable;
}
