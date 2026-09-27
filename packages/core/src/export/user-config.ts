// The public-repository allowlist (§13.5): `publicRepositories` in the user
// config `${EXPLAIN_HOME:-~/.explain}/config.json`. Repository config is never
// read for it, so a cloned repository cannot declare its own sources public.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The allowlisted repository identities, exactly as sources record them in
 * `repository`. A missing, unreadable, or malformed config gives an empty
 * list: the export then needs --allow-private-content (fail closed).
 */
export function publicRepositories(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const home = env['EXPLAIN_HOME'] ?? join(env['HOME'] ?? homedir(), '.explain');
  const path = join(home, 'config.json');
  const out = new Set<string>();
  if (!existsSync(path)) return out;
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return out;
  }
  const list = (config as { publicRepositories?: unknown } | null)?.publicRepositories;
  if (!Array.isArray(list)) return out;
  for (const entry of list) if (typeof entry === 'string' && entry !== '') out.add(entry);
  return out;
}
