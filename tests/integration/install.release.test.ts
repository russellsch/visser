// `install --from-release` (§12.5) against local HTTPS servers with a test CA
// made by openssl in-test. No test reaches the network. Server A plays the
// GitHub API; server B plays the release-asset host.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFromRelease, packRelease, readTrust } from '../../packages/core/src/distribution/index.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { parseArgs } from '../../packages/cli/src/cli-util.ts';
import { runInstall } from '../../packages/cli/src/commands/install.ts';
import { makeRelease, tempDir } from './install.fixtures.ts';

const TOKEN = 'ghp_TESTSECRETTOKEN0123456789';
const QUERY_SECRET = 'sig=QUERYSECRET987';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
type TestServer = { server: Server; host: string; base: string; seen: Array<{ url: string; headers: IncomingHttpHeaders }>; handle: Handler };

let pki: string;
let caPem: string;

function openssl(...args: string[]): void {
  execFileSync('openssl', args, { cwd: pki, stdio: 'pipe' });
}

/** A test CA, a server certificate it signs (127.0.0.1 and localhost), and a rogue self-signed certificate. */
function makePki(): void {
  pki = tempDir('explain-pki-');
  writeFileSync(join(pki, 'san.cnf'), 'subjectAltName=IP:127.0.0.1,DNS:localhost\n');
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '2', '-subj', '/CN=Explain Test CA');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=127.0.0.1');
  openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.pem', '-days', '2', '-extfile', 'san.cnf');
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'rogue.key', '-out', 'rogue.pem', '-days', '2', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost');
  caPem = readFileSync(join(pki, 'ca.pem'), 'utf8');
}

async function startServer(keyFile = 'server.key', certFile = 'server.pem'): Promise<TestServer> {
  const notFound: Handler = (_req, res) => { res.statusCode = 404; res.end(); };
  const t = { seen: [], handle: notFound } as unknown as TestServer;
  t.server = createServer({ key: readFileSync(join(pki, keyFile)), cert: readFileSync(join(pki, certFile)) }, (req, res) => {
    t.seen.push({ url: req.url ?? '', headers: req.headers });
    t.handle(req, res);
  });
  await new Promise<void>((resolve) => t.server.listen(0, '127.0.0.1', resolve));
  const port = (t.server.address() as AddressInfo).port;
  t.host = `127.0.0.1:${port}`;
  t.base = `https://${t.host}`;
  return t;
}

let api: TestServer;
let assets: TestServer;
let rogue: TestServer;

let box: string;
let home: string;
let env: NodeJS.ProcessEnv;
let archive: Buffer;
let archiveSha256: string;
let toolkitSha256: string;

/** Server A answers the release API and redirects the asset to server B, which serves `body`. */
function standardRoutes(opts: { body?: Buffer; assetName?: string; assetUrl?: string; redirectTo?: string } = {}): void {
  const body = opts.body ?? archive;
  api.handle = (req, res) => {
    if (req.url === '/repos/octo/explain/releases/tags/v0.0.1') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ tag_name: 'v0.0.1', assets: [{ name: opts.assetName ?? 'explain-0.0.1.tar.gz', url: opts.assetUrl ?? `${api.base}/repos/octo/explain/releases/assets/7`, size: body.length }] }));
    } else if (req.url === '/repos/octo/explain/releases/assets/7') {
      res.statusCode = 302;
      res.setHeader('location', opts.redirectTo ?? `${assets.base}/download/explain-0.0.1.tar.gz?${QUERY_SECRET}`);
      res.end();
    } else {
      res.statusCode = 404;
      res.end();
    }
  };
  assets.handle = (req, res) => {
    if (req.url?.startsWith('/download/')) {
      res.setHeader('content-length', String(body.length));
      res.end(body);
    } else {
      res.statusCode = 404;
      res.end();
    }
  };
}

function allowAssetHost(host = assets.host): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify({ distributionHosts: [host] }));
}

const opts = (extra: Record<string, unknown> = {}) => ({
  repository: 'octo/explain', version: 'v0.0.1', archiveSha256, scope: 'user' as const, env, apiBase: api.base, extraCa: [caPem], ...extra,
});

/** Nothing was installed or trusted. */
function nothingInstalled(): void {
  const base = join(home, 'toolchains');
  expect(existsSync(base) ? readdirSync(base) : []).toEqual([]);
  expect(existsSync(join(home, 'trust.json')) ? Object.keys(readTrust(env).toolkits) : []).toEqual([]);
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((rel) => join(dir, rel)).filter((p) => statSync(p).isFile());
}

beforeAll(async () => {
  makePki();
  api = await startServer();
  assets = await startServer();
  rogue = await startServer('rogue.key', 'rogue.pem');
  const release = join(tempDir(), 'release');
  toolkitSha256 = makeRelease(release);
  const packed = packRelease(release);
  archive = Buffer.from(packed.bytes);
  archiveSha256 = packed.archiveSha256;
}, 60_000);

afterAll(async () => {
  for (const s of [api, assets, rogue]) await new Promise((resolve) => s.server.close(resolve));
});

beforeEach(() => {
  box = tempDir();
  home = join(box, 'home');
  env = { ...process.env, EXPLAIN_HOME: home, GITHUB_TOKEN: TOKEN };
  delete env['EXPLAIN_GITHUB_TOKEN'];
  api.seen.length = 0;
  assets.seen.length = 0;
  rogue.seen.length = 0;
  standardRoutes();
  allowAssetHost();
});

describe('install --from-release (§12.5) @R10', () => {
  it('@R10 a matching digest installs, trusts, and reports a github-release origin', async () => {
    const result = await installFromRelease(opts());
    expect(validateAgainst('install', result)).toEqual({ ok: true });
    expect(result.toolkitSha256).toBe(toolkitSha256);
    expect(result.origin).toEqual({ kind: 'github-release', repository: 'octo/explain', version: 'v0.0.1', archiveSha256 });
    expect(existsSync(join(home, 'toolchains', toolkitSha256, 'release.json'))).toBe(true);
    expect(readTrust(env).toolkits[toolkitSha256]?.source).toBe('install --from-release octo/explain@v0.0.1 --scope user');
    // The API received the documented headers and the token; the asset host received neither the token nor more than one request.
    expect(api.seen[0]?.headers['accept']).toBe('application/vnd.github+json');
    expect(api.seen[0]?.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(api.seen[1]?.headers['accept']).toBe('application/octet-stream');
    expect(assets.seen).toHaveLength(1);
    expect(assets.seen[0]?.headers['authorization']).toBeUndefined();
  });

  it('@R10 a digest mismatch is refused before extraction, and nothing is installed', async () => {
    await expect(installFromRelease(opts({ archiveSha256: 'f'.repeat(64) }))).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/nothing was extracted/) });
    nothingInstalled();
  });

  it('@R10 a redirect to a host that is not allowed is refused, and that host gets no request', async () => {
    standardRoutes({ redirectTo: `https://localhost:${assets.host.split(':')[1]}/download/x.tar.gz` });
    await expect(installFromRelease(opts())).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/not an allowed distribution host/) });
    expect(assets.seen).toHaveLength(0);
    nothingInstalled();
  });

  it('@R10 the asset host is allowed only through the user config, never by default', async () => {
    writeFileSync(join(home, 'config.json'), JSON.stringify({ distributionHosts: [] }));
    await expect(installFromRelease(opts())).rejects.toMatchObject({ code: 'E_INTEGRITY' });
    expect(assets.seen).toHaveLength(0);
  });

  it('@R10 more than three redirects are refused; exactly three are followed', async () => {
    const chain = (hops: number) => {
      api.handle = (req, res) => {
        if (req.url === '/repos/octo/explain/releases/tags/v0.0.1') {
          res.end(JSON.stringify({ assets: [{ name: 'explain-0.0.1.tar.gz', url: `${api.base}/hop/0` }] }));
          return;
        }
        const n = Number(req.url?.split('/')[2]);
        res.statusCode = 302;
        res.setHeader('location', n + 1 < hops ? `${api.base}/hop/${n + 1}` : `${assets.base}/download/x.tar.gz`);
        res.end();
      };
    };
    chain(4);
    await expect(installFromRelease(opts())).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/more than 3 redirects/) });
    expect(assets.seen).toHaveLength(0);
    chain(3);
    await expect(installFromRelease(opts())).resolves.toMatchObject({ toolkitSha256 });
  });

  it('@R10 the size cap applies to Content-Length and to the streamed body', async () => {
    const cap = archive.length - 1;
    // Declared: Content-Length over the cap (the API size is left out so the download itself decides).
    api.handle = (req, res) => {
      if (req.url?.endsWith('/tags/v0.0.1')) res.end(JSON.stringify({ assets: [{ name: 'explain-0.0.1.tar.gz', url: `${assets.base}/download/a` }] }));
      else { res.statusCode = 404; res.end(); }
    };
    await expect(installFromRelease(opts({ maxDownloadBytes: cap }))).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/Content-Length is larger/) });
    // Streamed: no Content-Length (chunked), the body passes the cap.
    assets.handle = (_req, res) => { res.write(archive.subarray(0, 100)); res.end(archive.subarray(100)); };
    await expect(installFromRelease(opts({ maxDownloadBytes: cap }))).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/body is larger/) });
    // The API's declared asset size also counts.
    standardRoutes();
    await expect(installFromRelease(opts({ maxDownloadBytes: cap }))).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/larger than/) });
    nothingInstalled();
  });

  it('@R10 an http: URL is refused, as an asset URL, as a redirect, and as the API base', async () => {
    standardRoutes({ assetUrl: `http://${api.host}/repos/octo/explain/releases/assets/7` });
    await expect(installFromRelease(opts())).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/https: only/) });
    standardRoutes({ redirectTo: `http://${assets.host}/download/x.tar.gz` });
    await expect(installFromRelease(opts())).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/https: only/) });
    await expect(installFromRelease(opts({ apiBase: `http://${api.host}` }))).rejects.toMatchObject({ code: 'E_INTEGRITY' });
    expect(assets.seen).toHaveLength(0);
  });

  it('@R10 certificate verification stays on: a certificate outside the test CA, or no extra CA, is refused', async () => {
    await expect(installFromRelease(opts({ apiBase: rogue.base }))).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/does not verify/) });
    await expect(installFromRelease(opts({ extraCa: undefined }))).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/does not verify/) });
    expect(rogue.seen).toHaveLength(0);
    nothingInstalled();
  });

  it('a missing release or asset is E_TOOLKIT_MISSING', async () => {
    standardRoutes({ assetName: 'explain-9.9.9.tar.gz' });
    await expect(installFromRelease(opts())).rejects.toMatchObject({ code: 'E_TOOLKIT_MISSING', message: expect.stringMatching(/no asset explain-0.0.1.tar.gz/) });
    await expect(installFromRelease(opts({ version: 'v0.0.2' }))).rejects.toMatchObject({ code: 'E_TOOLKIT_MISSING', message: expect.stringMatching(/was not found/) });
  });

  it('a release whose toolkit version differs from --version is refused', async () => {
    api.handle = (req, res) => {
      if (req.url === '/repos/octo/explain/releases/tags/v0.0.2') res.end(JSON.stringify({ assets: [{ name: 'explain-0.0.2.tar.gz', url: `${assets.base}/download/b` }] }));
      else { res.statusCode = 404; res.end(); }
    };
    await expect(installFromRelease(opts({ version: 'v0.0.2' }))).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/contains toolkit version 0.0.1/) });
    nothingInstalled();
  });

  it('a bad OWNER/REPO or version is E_USAGE, and no request is sent', async () => {
    for (const repository of ['octo', 'octo/explain/x', '../x', 'octo/ex plain', `${'a'.repeat(40)}/x`]) {
      await expect(installFromRelease(opts({ repository }))).rejects.toMatchObject({ code: 'E_USAGE' });
    }
    for (const version of ['latest', '1.2', '1.2.3/../x', 'v1.2.3?x=1', '']) {
      await expect(installFromRelease(opts({ version }))).rejects.toMatchObject({ code: 'E_USAGE' });
    }
    expect(api.seen).toHaveLength(0);
  });
});

describe('the install --from-release command', () => {
  let out: string[];
  let err: string[];
  const saved = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, { EXPLAIN_HOME: home, GITHUB_TOKEN: TOKEN, EXPLAIN_TEST_API_BASE: api.base, EXPLAIN_TEST_CA_FILE: join(pki, 'ca.pem') });
    out = [];
    err = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { out.push(String(chunk)); return true; });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { err.push(String(chunk)); return true; });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ['EXPLAIN_HOME', 'GITHUB_TOKEN', 'EXPLAIN_TEST_API_BASE', 'EXPLAIN_TEST_CA_FILE']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  const args = (...extra: string[]) => parseArgs(['--from-release', 'octo/explain', '--version', 'v0.0.1', '--sha256', archiveSha256, '--scope', 'user', ...extra]);

  it('@R10 the token and the signed query never appear in output, diagnostics, or any file under EXPLAIN_HOME', async () => {
    expect(await runInstall(args('--json'))).toBe(0);
    const result = JSON.parse(out.join(''));
    expect(validateAgainst('install', result)).toEqual({ ok: true });
    expect(err.join('')).toMatch(/EXPLAIN_TEST_API_BASE is set/);
    // A failing run: its diagnostics name the host, never the token or the query.
    standardRoutes({ body: Buffer.from('not the archive') });
    expect(await runInstall(parseArgs(['--from-release', 'octo/explain', '--version', 'v0.0.1', '--sha256', 'e'.repeat(64), '--scope', 'user', '--json']))).toBe(4);
    standardRoutes({ redirectTo: `https://localhost:1/download/x?${QUERY_SECRET}` });
    expect(await runInstall(args())).toBe(4);
    const everything = [out.join(''), err.join(''), ...filesUnder(home).map((p) => readFileSync(p, 'latin1'))].join('\n');
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain('QUERYSECRET');
  });

  it('exit codes: usage 2 (missing --sha256 or --version), missing asset 3, policy 4', async () => {
    await expect(runInstall(parseArgs(['--from-release', 'octo/explain', '--version', 'v0.0.1', '--scope', 'user']))).rejects.toMatchObject({ code: 'E_USAGE', exitCode: 2 });
    await expect(runInstall(parseArgs(['--from-release', 'octo/explain', '--sha256', archiveSha256, '--scope', 'user']))).rejects.toMatchObject({ code: 'E_USAGE', exitCode: 2 });
    expect(await runInstall(parseArgs(['--from-release', 'octo', '--version', 'v0.0.1', '--sha256', archiveSha256, '--scope', 'user']))).toBe(2);
    standardRoutes({ assetName: 'other.tar.gz' });
    expect(await runInstall(args())).toBe(3);
    standardRoutes({ assetUrl: `http://${api.host}/x` });
    expect(await runInstall(args())).toBe(4);
  });
});
