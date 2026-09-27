// `explain check DOC [--json] [--verify-origins [--repo-map LABEL=PATH]]` (§17.1).
// Validates syntax, IDs, frontmatter, spans, semantics, and capture consistency.
// `--verify-origins` (§8.5) also compares each captured source with its local
// origin; it never fetches. Origin states appear only here, never on pages.
// Exit: an origin mismatch (E_ORIGIN_MISMATCH) is invalid content (2); an
// unavailable origin is a warning (W_ORIGIN_UNAVAILABLE) and does not fail.
import { resolve } from 'node:path';
import type { Diagnostic } from '../../../core/src/types.ts';
import { loadBundle } from '../../../core/src/model/bundle.ts';
import { HashError } from '../../../core/src/model/hash.ts';
import { parseRepoMapEntry, userRepositoryMap, verifyOrigins, type OriginResult } from '../../../core/src/provenance/index.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics } from '../cli-util.ts';
import { loadDocument } from './load.ts';

function repositoryMap(args: ParsedArgs): Map<string, string> {
  const map = userRepositoryMap();
  // --repo-map may repeat: one LABEL=PATH per repository.
  for (const entry of args.all.get('repo-map') ?? []) {
    if (entry === true) throw new CliError('E_USAGE', '--repo-map needs LABEL=PATH', EXIT.invalid);
    try {
      const [label, local] = parseRepoMapEntry(entry);
      map.set(label, resolve(local));
    } catch (error) {
      if (error instanceof HashError) throw new CliError(error.code, error.message, EXIT.invalid);
      throw error;
    }
  }
  return map;
}

export async function runCheck(args: ParsedArgs): Promise<number> {
  const json = args.flags.has('json');
  const verify = args.flags.has('verify-origins');
  if (verify && args.flags.get('verify-origins') !== true) {
    throw new CliError('E_USAGE', '--verify-origins takes no value (put it last or before another flag)', EXIT.invalid);
  }
  const { targets, diagnostics } = loadDocument(args.positional[0]);
  let origins: OriginResult[] | undefined;
  const all: Diagnostic[] = [...diagnostics];
  if (verify && !diagnostics.some((d) => d.severity === 'error')) {
    const bundle = loadBundle(resolve(args.positional[0]!));
    const result = verifyOrigins(bundle, repositoryMap(args));
    origins = result.origins;
    all.push(...result.diagnostics);
  }
  const code = exitCodeFor(all);
  if (json) {
    process.stdout.write(JSON.stringify({ schema: 'explain-check/1', ok: code === EXIT.ok, targetCount: targets.size, diagnostics: all, ...(origins ? { origins } : {}) }, null, 2) + '\n');
  } else {
    printDiagnostics(all, false);
    if (origins) {
      for (const o of origins) process.stdout.write(`${o.id}: ${o.state}${o.reason ? ` (${o.reason})` : ''}\n`);
    }
    if (code === EXIT.ok) process.stdout.write(`ok: ${targets.size} targets\n`);
  }
  return code;
}
