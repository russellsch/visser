// Portable repository identity (§8.2 "Repository identity"): never a local
// path, never credentials, because pages and exports print it.
import { HashError } from '../model/hash.ts';
import { configValue, type Repository } from './git.ts';

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

/** Why `value` is not a portable repository identity, or undefined when it is. */
export function identityProblem(value: string): string | undefined {
  if (value.length === 0 || value.length > 200) return 'must be 1 to 200 characters';
  if (/[\0-\x1f\x7f]/.test(value)) return 'must not contain control characters';
  if (value.startsWith('/') || value.startsWith('~') || /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\')) return 'must not be a local path';
  if (/^file:/i.test(value)) return 'must not be a file: URL';
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value);
  if (scheme) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return 'is not a valid URL';
    }
    if (url.username || url.password) return 'must not contain credentials';
    if (url.search || url.hash) return 'must not contain a query or fragment';
  }
  return undefined;
}

/**
 * Strip credentials, query, and fragment from a remote URL. Returns undefined
 * for a remote that is a local path (not portable).
 */
export function portableRemote(remote: string): string | undefined {
  const trimmed = remote.trim();
  if (trimmed === '') return undefined;
  if (/^([a-z][a-z0-9+.-]*):\/\//i.test(trimmed)) {
    if (/^file:/i.test(trimmed)) return undefined;
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return undefined;
    }
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  }
  // scp-like `user@host:path`: the user is an account name, not a secret.
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\\]+$/.test(trimmed) || /^[A-Za-z0-9.-]+:[^/\\][^\\]*$/.test(trimmed)) return trimmed;
  return undefined;
}

/** The `repository` value for a capture: the label if given, else the portable origin URL. */
export function repositoryIdentity(repo: Repository, label: string | undefined): string {
  if (label !== undefined) {
    const problem = identityProblem(label);
    if (problem) fail('E_USAGE', `--repository-label ${JSON.stringify(label)} ${problem}`);
    return label;
  }
  const remote = configValue(repo, 'remote.origin.url');
  const portable = remote === undefined ? undefined : portableRemote(remote);
  if (portable === undefined || identityProblem(portable)) {
    fail('E_USAGE', 'the repository has no portable remote.origin.url; pass --repository-label NAME (a local path is never recorded)');
  }
  return portable;
}
