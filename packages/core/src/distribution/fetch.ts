// GitHub release acquisition (§12.5). The client resolves a release asset
// through GitHub's release API and downloads it over HTTPS with these rules:
// https: only; redirects followed by hand, at most MAX_HOPS; every hop must go
// to an allowed host; the body streams to a private file with a byte cap; the
// archive digest is checked before anything is extracted. A token goes only to
// the API host, and never into a message, a log, --json output, or a file.
//
// It uses node:https, not fetch: a test CA must be added to the trusted roots
// (verification stays on), and fetch has no public option for that.
//
// Codes: a policy refusal (http: URL, a disallowed host, too many redirects, a
// size over the cap, a certificate that does not verify, a digest mismatch) is
// E_INTEGRITY, exit 4. A network error or an HTTP error status is
// E_SOURCE_UNAVAILABLE, exit 3. A missing release or asset is
// E_TOOLKIT_MISSING, exit 3.
import { createHash } from 'node:crypto';
import { closeSync, constants, openSync, rmSync, writeSync } from 'node:fs';
import { request, type RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { rootCertificates } from 'node:tls';
import { HashError } from '../model/hash.ts';

/** GitHub's REST API host. */
export const GITHUB_API_BASE = 'https://api.github.com';
/**
 * The release-asset hosts. The asset API URL (on api.github.com) answers
 * `Accept: application/octet-stream` with a redirect to one of these download
 * hosts. github.com is not listed: the installer never uses the
 * browser_download_url, so it never needs that host.
 */
export const GITHUB_ASSET_HOSTS = ['objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
export const MAX_HOPS = 3;
export const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const MAX_API_BYTES = 1024 * 1024;

export const REPOSITORY_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
/** OWNER/REPO that matches REPOSITORY_PATTERN and has no `.` or `..` part (URL normalization would change the API path). */
export function validRepository(repository: string): boolean {
  if (!REPOSITORY_PATTERN.test(repository)) return false;
  return repository.split('/').every((part) => part !== '.' && part !== '..');
}
/** Total time allowed for the release API request and for the asset download (§12.5). */
export const API_DEADLINE_MS = 60_000;
export const DOWNLOAD_DEADLINE_MS = 10 * 60_000;
export const VERSION_PATTERN = /^v?[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;

export type FetchPolicy = {
  /** Hosts (URL `host`, with a port when not 443) that any hop may reach. */
  allowedHosts: ReadonlySet<string>;
  /** The one host that may receive the token. */
  tokenHost: string;
  token?: string | undefined;
  /** Extra CA certificates (PEM), added to Node's roots; verification stays on. */
  extraCa?: string[] | undefined;
  maxBytes: number;
  /** Socket idle timeout for each request. */
  timeoutMs?: number;
  /** Total time for the API request (all hops and the body); default API_DEADLINE_MS. */
  apiDeadlineMs?: number;
  /** Total time for the asset download (all hops and the body); default DOWNLOAD_DEADLINE_MS. */
  downloadDeadlineMs?: number;
};

/** The request or response in flight, so a deadline can stop it. */
type Operation = { expired: boolean; active?: { destroy(error?: Error): unknown } };

/**
 * Run a whole request (every hop and the body) under a total deadline. An idle
 * timeout alone does not stop a server that sends one byte just before each
 * timeout, so the byte cap would be the only limit on time.
 */
async function withDeadline<T>(ms: number, what: string, run: (op: Operation) => Promise<T>): Promise<T> {
  const op: Operation = { expired: false };
  const timer = setTimeout(() => {
    op.expired = true;
    op.active?.destroy(new Error('deadline'));
  }, ms);
  try {
    return await run(op);
  } catch (error) {
    if (op.expired) fail('E_SOURCE_UNAVAILABLE', `${what} took longer than ${ms} ms; stopped`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

/** A URL for a message: scheme, host, and path only; never a query or credentials. */
export function displayUrl(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

function checkHop(url: URL, policy: FetchPolicy): void {
  if (url.protocol !== 'https:') fail('E_INTEGRITY', `refused ${url.protocol}// URL: downloads use https: only`);
  if (url.username !== '' || url.password !== '') fail('E_INTEGRITY', `refused a URL with credentials on ${url.host}`);
  if (!policy.allowedHosts.has(url.host)) fail('E_INTEGRITY', `refused a request to ${url.host}: the host is not an allowed distribution host`);
}

function send(url: URL, headers: Record<string, string>, policy: FetchPolicy, op: Operation): Promise<IncomingMessage> {
  const sendHeaders: Record<string, string> = { 'User-Agent': 'visser-installer', ...headers };
  // The token goes only to the API host, never to a redirect target elsewhere.
  if (policy.token !== undefined && url.host === policy.tokenHost) sendHeaders['Authorization'] = `Bearer ${policy.token}`;
  const options: RequestOptions = { method: 'GET', headers: sendHeaders, timeout: policy.timeoutMs ?? 30_000 };
  if (policy.extraCa && policy.extraCa.length > 0) options.ca = [...rootCertificates, ...policy.extraCa];
  return new Promise((resolvePromise, reject) => {
    if (op.expired) {
      reject(new Error('deadline'));
      return;
    }
    const req = request(url, options, (res) => {
      op.active = res;
      resolvePromise(res);
    });
    op.active = req;
    req.on('timeout', () => req.destroy(new Error('the request timed out')));
    req.on('error', (error: NodeJS.ErrnoException) => {
      const code = error.code ?? '';
      // A certificate that does not verify is a security failure, not an outage.
      if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/.test(code)) {
        reject(new HashError('E_INTEGRITY', 'E_INTEGRITY', `the TLS certificate of ${url.host} does not verify (${code})`));
      } else {
        reject(new HashError('E_SOURCE_UNAVAILABLE', 'E_SOURCE_UNAVAILABLE', `cannot reach ${url.host} (${code || error.message})`));
      }
    });
    req.end();
  });
}

/** GET with manual redirects under the policy. Returns the final 2xx response. */
async function getFollowing(start: string, headers: Record<string, string>, policy: FetchPolicy, op: Operation): Promise<{ res: IncomingMessage; url: URL }> {
  let url: URL;
  try {
    url = new URL(start);
  } catch {
    fail('E_INTEGRITY', 'refused a malformed download URL');
  }
  for (let redirects = 0; ; redirects++) {
    checkHop(url, policy);
    const res = await send(url, headers, policy, op);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && status !== 304) {
      res.resume();
      const location = res.headers.location;
      if (!location) fail('E_SOURCE_UNAVAILABLE', `${displayUrl(url)} answered ${status} without a Location header`);
      if (redirects + 1 > MAX_HOPS) fail('E_INTEGRITY', `refused: more than ${MAX_HOPS} redirects`);
      try {
        url = new URL(location, url);
      } catch {
        fail('E_INTEGRITY', 'refused a malformed redirect location');
      }
      continue;
    }
    if (status === 404) {
      res.resume();
      fail('E_TOOLKIT_MISSING', `${displayUrl(url)} was not found (404)`);
    }
    if (status < 200 || status >= 300) {
      res.resume();
      fail('E_SOURCE_UNAVAILABLE', `${displayUrl(url)} answered HTTP ${status}`);
    }
    return { res, url };
  }
}

function declaredTooLarge(res: IncomingMessage, cap: number): boolean {
  const header = res.headers['content-length'];
  if (header === undefined) return false;
  const size = Number(header);
  return Number.isFinite(size) && size > cap;
}

/** Stream the body through `onChunk`, stopping above `cap` bytes. */
async function readCapped(res: IncomingMessage, url: URL, cap: number, onChunk: (chunk: Buffer) => void): Promise<number> {
  if (declaredTooLarge(res, cap)) {
    res.destroy();
    fail('E_INTEGRITY', `refused ${displayUrl(url)}: Content-Length is larger than ${cap} bytes`);
  }
  let total = 0;
  try {
    for await (const chunk of res as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > cap) {
        res.destroy();
        fail('E_INTEGRITY', `refused ${displayUrl(url)}: the body is larger than ${cap} bytes`);
      }
      onChunk(chunk);
    }
  } catch (error) {
    if (error instanceof HashError) throw error;
    fail('E_SOURCE_UNAVAILABLE', `the download from ${url.host} failed (${(error as Error).message})`);
  }
  return total;
}

export type ReleaseAsset = { name: string; url: string; size?: number };

/** The release asset for `visser-VERSION.tar.gz` (the name `release:pack` writes). */
export function assetName(version: string): string {
  return `visser-${version.replace(/^v/, '')}.tar.gz`;
}

export async function resolveReleaseAsset(apiBase: string, repository: string, version: string, policy: FetchPolicy): Promise<ReleaseAsset> {
  if (!validRepository(repository)) fail('E_USAGE', '--from-release must be OWNER/REPO (letters, digits, and - . _; not . or ..)');
  const [owner, repo] = repository.split('/') as [string, string];
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(version)}`;
  const chunks: Buffer[] = [];
  await withDeadline(policy.apiDeadlineMs ?? API_DEADLINE_MS, `the release API request for ${repository}@${version}`, async (op) => {
    const { res, url } = await getFollowing(new URL(path, apiBase).href, { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, policy, op)
      .catch((error: unknown) => {
        if (error instanceof HashError && error.code === 'E_TOOLKIT_MISSING') fail('E_TOOLKIT_MISSING', `the release ${repository}@${version} was not found`);
        throw error;
      });
    await readCapped(res, url, MAX_API_BYTES, (chunk) => chunks.push(chunk));
  });
  let release: unknown;
  try {
    release = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail('E_SOURCE_UNAVAILABLE', `the release API answer for ${repository}@${version} is not JSON`);
  }
  const assets = (release as { assets?: unknown } | null)?.assets;
  const name = assetName(version);
  const found = Array.isArray(assets)
    ? (assets as Array<Record<string, unknown>>).find((a) => a !== null && typeof a === 'object' && a['name'] === name)
    : undefined;
  if (!found || typeof found['url'] !== 'string') fail('E_TOOLKIT_MISSING', `the release ${repository}@${version} has no asset ${name}`);
  const size = typeof found['size'] === 'number' ? found['size'] : undefined;
  return { name, url: found['url'], ...(size !== undefined ? { size } : {}) };
}

/**
 * Download `assetUrl` into a new private file at `dest` (it must not exist)
 * and return the sha256 of the bytes written.
 */
export async function downloadAsset(assetUrl: string, dest: string, policy: FetchPolicy): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  const fd = openSync(dest, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  let bytes: number;
  try {
    bytes = await withDeadline(policy.downloadDeadlineMs ?? DOWNLOAD_DEADLINE_MS, 'the asset download', async (op) => {
      const { res, url } = await getFollowing(assetUrl, { Accept: 'application/octet-stream' }, policy, op);
      return readCapped(res, url, policy.maxBytes, (chunk) => {
        hash.update(chunk);
        writeSync(fd, chunk);
      });
    });
  } catch (error) {
    closeSync(fd);
    rmSync(dest, { force: true });
    throw error;
  }
  closeSync(fd);
  return { sha256: hash.digest('hex'), bytes };
}

/** The token for GitHub requests, from the environment. Never logged. */
export function githubToken(env: NodeJS.ProcessEnv): string | undefined {
  const token = env['VISSER_GITHUB_TOKEN'] || env['GITHUB_TOKEN'] || undefined;
  if (token !== undefined && /[\r\n\0]/.test(token)) fail('E_USAGE', 'the GitHub token in the environment contains a control character');
  return token;
}
