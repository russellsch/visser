// `visser check DOC [--json] [--verify-origins [--repo-map LABEL=PATH]] [--release] [--review]` (§17.1).
// Validates syntax, IDs, frontmatter, spans, semantics, and capture consistency.
// `--verify-origins` (§8.5) also compares each captured source with its local
// origin; it never fetches. Origin states appear only here, never on pages.
// Exit: an origin mismatch (E_ORIGIN_MISMATCH) is invalid content (2); an
// unavailable origin is a warning (W_ORIGIN_UNAVAILABLE) and does not fail.
// `--release` (§12.4) also requires the document's lock to resolve to a
// verified, trusted toolkit that this CLI is, and refuses `--dev-toolkit`
// (E_USAGE, exit 2): a release check never accepts a development toolkit.
// `--review` (§15.6, §16.3) adds editorial review prompts (W_JARGON,
// W_VISUAL_DENSITY, W_EVIDENCE_GAP, and the prose, shape, and term prompts of
// core/src/review/) as warnings, only when there are no errors. They are prompts, not verdicts, and never change the exit code.
import { dirname, resolve } from 'node:path';
import type { Diagnostic } from '../../../core/src/types.ts';
import { loadBundle } from '../../../core/src/model/bundle.ts';
import { mermaidMathTotal } from '../../../core/src/mermaid/index.ts';
import { HashError } from '../../../core/src/model/hash.ts';
import { documentRepository, parseRepoMapEntry, userRepositoryMap, verifyOrigins, type OriginResult } from '../../../core/src/provenance/index.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, printJson, stringFlag } from '../cli-util.ts';
import { reviewDocument } from '../../../core/src/review/index.ts';
import { loadDocument } from './load.ts';
import { resolveForDocument } from '../toolkit.ts';
import { parsedMathRequests, validateMath } from '../../../core/src/math/validate.ts';

function repositoryMap(args: ParsedArgs, bundleRoot: string): Map<string, string> {
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
  // The clone that holds the document verifies its own repository's sources,
  // unless the user config or --repo-map names another clone for it.
  const own = documentRepository(bundleRoot);
  if (own && !map.has(own[0])) map.set(own[0], own[1]);
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
  const review = args.flags.has('review');
  if (review && args.flags.get('review') !== true) {
    throw new CliError('E_USAGE', '--review takes no value (put it last or before another flag)', EXIT.invalid);
  }
  // loadDocument reports an unreadable document (E_SOURCE_UNAVAILABLE); the
  // bundle adds the semantic validation that build applies (§9, validate.ts).
  loadDocument(args.positional[0]);
  const bundle = loadBundle(resolve(args.positional[0]!));
  const targets = bundle.model.targets;
  const diagnostics = bundle.diagnostics;
  if (release) resolveForDocument(dirname(resolve(args.positional[0]!)), stringFlag(args, 'toolkit-dir'), undefined);
  let origins: OriginResult[] | undefined;
  const all: Diagnostic[] = [...diagnostics];
  if (!all.some(d => d.severity === 'error')) {
    all.push(...(await validateMath(parsedMathRequests(bundle.parsed), { initialTotal: mermaidMathTotal(bundle.model.mermaid.values()) })).diagnostics);
  }
  if (verify && !diagnostics.some((d) => d.severity === 'error')) {
    const result = verifyOrigins(bundle, repositoryMap(args, dirname(resolve(args.positional[0]!))));
    origins = result.origins;
    all.push(...result.diagnostics);
  }
  const code = exitCodeFor(all);
  // Review prompts come after the exit code is fixed, so they cannot change it.
  let prompts: number | undefined;
  if (review && code === EXIT.ok) {
    // A prompt that repeats a warning check already gave (same code, same target) adds nothing.
    const seen = new Set(all.map((d) => `${d.code} ${d.targetId ?? ''}`));
    const added = reviewDocument(bundle).filter((d) => !seen.has(`${d.code} ${d.targetId ?? ''}`));
    prompts = added.length;
    all.push(...added);
  }
  if (json) {
    printJson('check', { schema: 'visser-check/1', ok: code === EXIT.ok, targetCount: targets.size, diagnostics: all, ...(origins ? { origins } : {}) });
  } else {
    printDiagnostics(all, false);
    if (origins) {
      for (const o of origins) process.stdout.write(`${o.id}: ${o.state}${o.reason ? ` (${o.reason})` : ''}\n`);
    }
    if (code === EXIT.ok) process.stdout.write(`ok: ${targets.size} targets\n`);
    // Say that the review ran, even when it found nothing.
    if (review) process.stdout.write(prompts === undefined ? 'review: not run, because the document has errors\n' : `review: ${prompts} prompt${prompts === 1 ? '' : 's'}\n`);
  }
  return code;
}
