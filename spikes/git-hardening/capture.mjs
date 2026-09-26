// Spike: §8.2 Git capture, implemented literally, with hardening.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class CaptureError extends Error {
  constructor(code, msg) { super(`${code}: ${msg}`); this.code = code; }
}

// Minimal, explicit environment. Nothing inherited that can redirect Git.
export function gitEnv(extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    ...extra,
  };
}

export const HARDEN = ['-c', 'core.fsmonitor=', '-c', 'core.hooksPath=/dev/null'];

export function git(repo, args, { env = gitEnv(), harden = HARDEN, pre = [] } = {}) {
  const r = spawnSync('git', [...pre, '--no-pager', '-C', repo, ...harden, ...args], {
    env, shell: false, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr.toString('utf8') };
}

function mustGit(repo, args, opts) {
  const r = git(repo, args, opts);
  if (r.status !== 0) throw new CaptureError('E_SOURCE', `git ${args[0]} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

export function normalizeText(bytes) {
  let t = utf8.decode(bytes); // throws on invalid UTF-8
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n?/g, '\n');
}

function sliceLines(bytes, start, end) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start)
    throw new CaptureError('E_RANGE', `invalid line range ${start}:${end}`);
  if (bytes.includes(0)) throw new CaptureError('E_BINARY', 'NUL byte in content');
  try { utf8.decode(bytes); } catch { throw new CaptureError('E_BINARY', 'invalid UTF-8'); }
  // Split raw bytes on LF, keep line terminators (CRLF preserved raw).
  const lines = [];
  let s = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0x0a) { lines.push(bytes.subarray(s, i + 1)); s = i + 1; }
  if (s < bytes.length) lines.push(bytes.subarray(s));
  if (end > lines.length) throw new CaptureError('E_RANGE', `line ${end} beyond EOF (${lines.length} lines)`);
  const raw = Buffer.concat(lines.slice(start - 1, end));
  if (raw.length === 0) throw new CaptureError('E_RANGE', 'empty excerpt');
  return raw;
}

export function captureGit({ repo, rev, file, start, end, env }) {
  if (typeof rev !== 'string' || rev === '' || rev.startsWith('-'))
    throw new CaptureError('E_ARG', `rejected rev ${JSON.stringify(rev)}`);
  if (typeof file !== 'string' || file === '' || file.startsWith('/') || file.split('/').some(s => s === '' || s === '.' || s === '..') || file.includes('\0'))
    throw new CaptureError('E_PATH', `rejected path ${JSON.stringify(file)}`);
  const o = env ? { env } : {};
  const commit = mustGit(repo, ['rev-parse', '--verify', '--end-of-options', `${rev}^{commit}`], o).toString().trim();
  const blob = mustGit(repo, ['rev-parse', '--verify', '--end-of-options', `${commit}:${file}`], o).toString().trim();
  const type = mustGit(repo, ['cat-file', '-t', '--end-of-options', blob], o).toString().trim();
  if (type !== 'blob') throw new CaptureError('E_SOURCE', `${file} is a ${type}`);
  const bytes = mustGit(repo, ['cat-file', 'blob', '--end-of-options', blob], o);
  const excerpt = sliceLines(bytes, start, end);
  return {
    kind: 'git', commit, blob, file, start, end,
    excerptRaw: excerpt,
    excerptSha256: createHash('sha256').update(normalizeText(excerpt), 'utf8').digest('hex'),
    originFileSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

// Working-tree capture: read the file directly under §15.4 rules; no git command runs.
export function captureWorkingTree({ repo, file, start, end }) {
  const root = fs.realpathSync(repo);
  if (file.startsWith('/') || file.split('/').some(s => s === '' || s === '.' || s === '..'))
    throw new CaptureError('E_PATH_ESCAPE', file);
  let cur = root;
  for (const seg of file.split('/')) {
    cur = path.join(cur, seg);
    const st = fs.lstatSync(cur);
    if (st.isSymbolicLink()) throw new CaptureError('E_PATH_ESCAPE', `symlink at ${path.relative(root, cur)}`);
  }
  if (!fs.lstatSync(cur).isFile()) throw new CaptureError('E_PATH_ESCAPE', 'not a regular file');
  const bytes = fs.readFileSync(cur);
  const excerpt = sliceLines(bytes, start, end);
  return { kind: 'working-tree', file, start, end, excerptRaw: excerpt,
    excerptSha256: createHash('sha256').update(normalizeText(excerpt), 'utf8').digest('hex') };
}
