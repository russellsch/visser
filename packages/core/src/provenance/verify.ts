// `check --verify-origins` (§8.5). Explicit, local only, never fetches. Pages
// never show these states; they appear only in `check` output.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Diagnostic } from '../types.ts';
import type { LoadedBundle } from '../model/bundle.ts';
import type { MNode } from '../model/targets.ts';
import { HashError, sha256Hex } from '../model/hash.ts';
import { configValue, openRepository, readBlobAt, readWorkingTreeFile, resolveCommit } from './git.ts';
import { identityProblem, portableRemote } from './identity.ts';
import { excerptText, extractExcerpt } from './text.ts';
import { visserHome } from '../distribution/trust.ts';

export type OriginState =
  | 'origin-matched' // committed bytes equal the stored excerpt
  | 'origin-mismatch' // the origin exists and differs
  | 'origin-unavailable' // content is captured, but verification could not run
  | 'working-tree-matched' // equal to the working tree at `checkedAt` (never `origin-matched`)
  | 'capture-consistent' // illustrative example: no origin to verify
  | 'link-only';

export type OriginResult = {
  id: string;
  kind: string;
  state: OriginState;
  reason?: string;
  checkedAt?: string;
};

export type RepositoryMap = ReadonlyMap<string, string>;

/** The user-local repository map (§8.2): `${VISSER_HOME:-~/.visser}/config.json` `repositories`. */
export function userRepositoryMap(env: NodeJS.ProcessEnv = process.env): Map<string, string> {
  const home = visserHome(env);
  const path = join(home, 'config.json');
  const map = new Map<string, string>();
  if (!existsSync(path)) return map;
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return map;
  }
  const repositories = (config as { repositories?: unknown }).repositories;
  if (repositories && typeof repositories === 'object') {
    for (const [label, local] of Object.entries(repositories as Record<string, unknown>)) {
      if (typeof local === 'string') map.set(label, local);
    }
  }
  return map;
}

/** Parse one `LABEL=PATH` entry, split at the first `=`. */
export function parseRepoMapEntry(entry: string): [string, string] {
  const at = entry.indexOf('=');
  if (at <= 0 || at === entry.length - 1) throw new HashError('E_USAGE', 'E_USAGE', `--repo-map ${JSON.stringify(entry)} must look like LABEL=PATH`);
  return [entry.slice(0, at), entry.slice(at + 1)];
}

/**
 * The Git repository that holds the document, as a repository-map entry: its
 * portable `remote.origin.url` and its working tree. A source that records
 * the same repository can then be verified without `--repo-map`. The
 * repository is opened with the same checks as `capture git`; any problem
 * means "no entry", never an error.
 */
export function documentRepository(bundleRoot: string): [string, string] | undefined {
  for (let dir = bundleRoot; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) {
      try {
        const repo = openRepository(dir);
        const remote = configValue(repo, 'remote.origin.url');
        const label = remote === undefined ? undefined : portableRemote(remote);
        if (label === undefined || identityProblem(label)) return undefined;
        return [label, repo.toplevel];
      } catch {
        return undefined;
      }
    }
    if (dirname(dir) === dir) return undefined;
  }
}

function fenceText(bundle: LoadedBundle, id: string): string | undefined {
  const node = bundle.model.nodes.get(id) as MNode | undefined;
  const fence = node?.children.find((c) => c.type === 'fence');
  return fence ? String(fence.attributes['content'] ?? '') : undefined;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type VerifyOutput = { origins: OriginResult[]; diagnostics: Diagnostic[] };

export function verifyOrigins(bundle: LoadedBundle, repoMap: RepositoryMap, now: () => Date = () => new Date()): VerifyOutput {
  const origins: OriginResult[] = [];
  const diagnostics: Diagnostic[] = [];
  const path = 'index.md';
  // One warning for each unmapped repository, not one for each of its sources.
  const unmapped = new Map<string, { ids: string[]; startLine: number }>();
  for (const target of bundle.parsed.targets) {
    if (target.tagName !== 'source') continue;
    const a = target.attributes;
    const kind = String(a['kind']);
    const id = target.id;
    const push = (state: OriginState, reason?: string, checkedAt?: string) => {
      origins.push({ id, kind, state, ...(reason ? { reason } : {}), ...(checkedAt ? { checkedAt } : {}) });
      if (state === 'origin-mismatch') {
        diagnostics.push({ code: 'E_ORIGIN_MISMATCH', severity: 'error', message: `source ${id}: ${reason ?? 'the origin differs from the captured excerpt'}`, path, startLine: target.startLine, targetId: id, suggestedAction: 'recapture with `visser capture … --recapture`, or correct the recorded origin' });
      } else if (state === 'origin-unavailable') {
        diagnostics.push({ code: 'W_ORIGIN_UNAVAILABLE', severity: 'warning', message: `source ${id}: origin verification could not run: ${reason ?? ''}`, path, startLine: target.startLine, targetId: id });
      }
    };

    if ((a['availability'] ?? 'captured') === 'link-only') { push('link-only'); continue; }
    if (kind === 'example') { push('capture-consistent', 'illustrative example; there is no origin to verify'); continue; }
    if (kind !== 'git' && kind !== 'working-tree') { push('origin-unavailable', `a ${kind} source has no local origin that Visser can read`); continue; }

    const stored = fenceText(bundle, id);
    if (stored === undefined) { push('origin-unavailable', 'the source has no captured text to compare'); continue; }
    const repository = typeof a['repository'] === 'string' ? a['repository'] : undefined;
    const file = typeof a['file'] === 'string' ? a['file'] : undefined;
    const start = typeof a['start'] === 'number' ? a['start'] : undefined;
    const end = typeof a['end'] === 'number' ? a['end'] : undefined;
    if (!repository) { push('origin-unavailable', 'no repository is recorded'); continue; }
    if (!file || start === undefined || end === undefined) { push('origin-unavailable', 'file, start, and end are needed'); continue; }
    const local = repoMap.get(repository);
    if (!local) {
      origins.push({ id, kind, state: 'origin-unavailable', reason: `no local clone is mapped for ${repository}; pass --repo-map ${repository}=PATH` });
      const group = unmapped.get(repository) ?? { ids: [], startLine: target.startLine };
      group.ids.push(id);
      unmapped.set(repository, group);
      continue;
    }

    try {
      const repo = openRepository(local);
      const expected = excerptText(new TextEncoder().encode(stored));
      if (kind === 'git') {
        const commit = typeof a['commit'] === 'string' ? a['commit'] : undefined;
        if (!commit) { push('origin-unavailable', 'no commit is recorded'); continue; }
        // §8.1: only a full commit ID pins the evidence; a ref such as HEAD or a
        // branch would make "origin-matched" mean "matches whatever it points to today".
        if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) { push('origin-unavailable', `commit ${JSON.stringify(commit)} is not a full commit ID`); continue; }
        let read;
        try {
          const resolved = resolveCommit(repo, commit);
          if (resolved !== commit) { push('origin-unavailable', `commit ${commit} does not resolve to itself (it resolves to ${resolved})`); continue; }
          read = readBlobAt(repo, resolved, file);
        } catch (error) {
          if (error instanceof HashError && error.code === 'E_INTEGRITY') throw error;
          push('origin-unavailable', reasonOf(error));
          continue;
        }
        let actual: string;
        try {
          actual = extractExcerpt(read.bytes, start, end).text;
        } catch (error) {
          push('origin-mismatch', `lines ${start}-${end} cannot be read at ${commit}: ${reasonOf(error)}`);
          continue;
        }
        const originHash = a['originFileSha256'];
        if (actual !== expected) push('origin-mismatch', `lines ${start}-${end} of ${file} at ${commit} differ from the captured excerpt`);
        else if (typeof originHash === 'string' && sha256Hex(read.bytes) !== originHash) push('origin-mismatch', `${file} at ${commit} does not match originFileSha256`);
        else push('origin-matched');
      } else {
        let bytes: Uint8Array;
        try {
          bytes = readWorkingTreeFile(repo, file);
        } catch (error) {
          push('origin-unavailable', reasonOf(error));
          continue;
        }
        let actual: string;
        try {
          actual = extractExcerpt(bytes, start, end).text;
        } catch (error) {
          push('origin-mismatch', `lines ${start}-${end} cannot be read in the working tree: ${reasonOf(error)}`);
          continue;
        }
        const checkedAt = now().toISOString().replace(/\.\d{3}Z$/, 'Z');
        if (actual !== expected) push('origin-mismatch', `lines ${start}-${end} of ${file} in the working tree differ from the captured excerpt`);
        else push('working-tree-matched', `matched the working tree at ${checkedAt}`, checkedAt);
      }
    } catch (error) {
      if (error instanceof HashError && error.code === 'E_INTEGRITY') {
        diagnostics.push({ code: 'E_INTEGRITY', severity: 'error', message: `source ${id}: ${error.message}`, path, targetId: id });
        origins.push({ id, kind, state: 'origin-unavailable', reason: error.message });
        continue;
      }
      push('origin-unavailable', reasonOf(error));
    }
  }
  for (const [repository, group] of unmapped) {
    diagnostics.push({
      code: 'W_ORIGIN_UNAVAILABLE', severity: 'warning', path,
      message: `no local clone is mapped for ${repository}, so ${group.ids.length} source(s) could not be verified: ${group.ids.join(', ')}; pass --repo-map ${repository}=PATH`,
      startLine: group.startLine,
      targetId: group.ids[0]!,
    });
  }
  return { origins, diagnostics };
}
