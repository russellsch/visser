// `explain check DOC [--json] [--verify-origins [--repo-map LABEL=PATH]]` (§17.1).
// Validates syntax, IDs, frontmatter, spans, semantics, and capture consistency.
// `--verify-origins` (§8.5) also compares each captured source with its local
// origin; it never fetches. Origin states appear only here, never on pages.
// Exit: an origin mismatch (E_ORIGIN_MISMATCH) is invalid content (2); an
// unavailable origin is a warning (W_ORIGIN_UNAVAILABLE) and does not fail.
// `--release` (§12.4) also requires the document's lock to resolve to a
// verified, trusted toolkit that this CLI is, and refuses `--dev-toolkit`
// (E_USAGE, exit 2): a release check never accepts a development toolkit.
import { dirname, resolve } from 'node:path';
import type { Diagnostic } from '../../../core/src/types.ts';
import { loadBundle } from '../../../core/src/model/bundle.ts';
import { HashError } from '../../../core/src/model/hash.ts';
import { parseRepoMapEntry, userRepositoryMap, verifyOrigins, type OriginResult } from '../../../core/src/provenance/index.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, printJson, stringFlag } from '../cli-util.ts';
import { loadDocument } from './load.ts';
import { resolveForDocument } from '../toolkit.ts';

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
  const release = args.flags.has('release');
  if (release && args.flags.get('release') !== true) {
    throw new CliError('E_USAGE', '--release takes no value (put it last or before another flag)', EXIT.invalid);
  }
  if (release && args.flags.has('dev-toolkit')) {
    throw new CliError('E_USAGE', 'check --release refuses --dev-toolkit: a release check needs the toolkit the lock pins', EXIT.invalid);
  }
  const { targets, diagnostics } = loadDocument(args.positional[0]);
  if (release) resolveForDocument(dirname(resolve(args.positional[0]!)), stringFlag(args, 'toolkit-dir'), undefined);
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
    printJson('check', { schema: 'explain-check/1', ok: code === EXIT.ok, targetCount: targets.size, diagnostics: all, ...(origins ? { origins } : {}) });
  } else {
    printDiagnostics(all, false);
    if (origins) {
      for (const o of origins) process.stdout.write(`${o.id}: ${o.state}${o.reason ? ` (${o.reason})` : ''}\n`);
    }
    if (code === EXIT.ok) process.stdout.write(`ok: ${targets.size} targets\n`);
  }
  return code;
}
