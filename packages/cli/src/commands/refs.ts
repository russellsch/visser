// `explain refs resolve|show|refresh|replace` (§11.6, §11.9, §11.10, §11.12, §17.1).
// Exit codes (§15.6): 0 exact/success, 2 invalid, missing, deleted, ambiguous, or
// ID retention, 3 unsupported or no repository, 4 path escape, 5 stale or write conflict.
import { readFileSync, statSync } from 'node:fs';
import type { Diagnostic } from '../../../core/src/types.ts';
import { HashError } from '../../../core/src/model/hash.ts';
import { validateAgainst } from '../../../core/src/model/schemas.ts';
import { PACKET_MAX_BYTES, parsePacket, type ReferencePacket } from '../../../core/src/references/packet.ts';
import { findRepoRoot } from '../../../core/src/references/registry.ts';
import { resolveReference, type ResolveResult } from '../../../core/src/references/resolve.ts';
import { showReference } from '../../../core/src/references/show.ts';
import { refreshReference, RefreshRefused } from '../../../core/src/references/refresh.ts';
import { replaceTarget } from '../../../core/src/references/replace.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, stringFlag } from '../cli-util.ts';

const USAGE = [
  'usage: explain refs resolve --packet FILE [--doc PATH] [--root DIR] [--json]',
  '       explain refs show DOC TARGET_ID [--quote TEXT] [--root DIR] [--json]',
  '       explain refs refresh --packet FILE --expected-current REV --acknowledge-stale [--acknowledge-body-change] [--doc PATH] [--root DIR] [--json]',
  '       explain refs replace --packet FILE --replacement FILE --expected-revision REV [--doc PATH] [--root DIR] [--json]',
].join('\n');

function booleanFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value === undefined) return false;
  if (value !== true) throw new CliError('E_USAGE', `--${name} takes no value`, EXIT.invalid);
  return true;
}

function required(args: ParsedArgs, name: string): string {
  const value = stringFlag(args, name);
  if (value === undefined) throw new CliError('E_USAGE', `--${name} is required\n${USAGE}`, EXIT.invalid);
  return value;
}

function repoRoot(args: ParsedArgs): string {
  const explicit = stringFlag(args, 'root');
  const root = explicit ?? findRepoRoot(process.cwd());
  if (!root) {
    throw new CliError('E_SOURCE_UNAVAILABLE', 'no repository root (a directory with .git or .explain) found; pass --root DIR', EXIT.unavailable);
  }
  return root;
}

function readPacket(path: string): ReferencePacket {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    throw new CliError('E_SOURCE_UNAVAILABLE', `cannot read packet ${path}`, EXIT.unavailable);
  }
  if (size > PACKET_MAX_BYTES) throw new CliError('E_REF_INVALID', `packet file is larger than ${PACKET_MAX_BYTES} bytes`, EXIT.invalid);
  return parsePacket(readFileSync(path, 'utf8'));
}

function fromHashError(error: unknown): Diagnostic {
  if (error instanceof HashError) return { code: error.code, severity: 'error', message: error.message };
  throw error;
}

function exitForStatus(result: ResolveResult): number {
  if (result.status === 'exact') return EXIT.ok;
  return exitCodeFor(result.diagnostics.length > 0 ? result.diagnostics : [{ code: 'E_REF_INVALID', severity: 'error', message: result.status }]);
}

function printResolve(result: ResolveResult, json: boolean): void {
  if (json) {
    const check = validateAgainst('resolve', result);
    if (!check.ok) throw new Error(`resolver output violates explain-resolve/1: ${check.errors.join('; ')}`);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  const flags = [
    result.targetBodyUnchanged !== undefined ? `targetBodyUnchanged=${result.targetBodyUnchanged}` : '',
    result.quoteFound !== undefined ? `quoteFound=${result.quoteFound}` : '',
    result.labelMatches !== undefined ? `labelMatches=${result.labelMatches}` : '',
  ].filter(Boolean).join(' ');
  process.stdout.write(`${result.status} ${result.docId ?? ''}/${result.targetId ?? ''}${flags ? ` (${flags})` : ''}\n`);
  if (result.currentRevision) process.stdout.write(`current revision ${result.currentRevision}\n`);
  if (result.current) {
    process.stdout.write(`\n--- current source (${result.current.target.span.path}:${result.current.target.span.startLine}) ---\n${result.current.sourceText}`);
    if (result.current.parentContext) process.stdout.write(`--- parent context ---\n${result.current.parentContext}`);
  }
  printDiagnostics(result.diagnostics, false);
}

async function resolve(args: ParsedArgs): Promise<number> {
  const json = booleanFlag(args, 'json');
  let packet: ReferencePacket;
  try {
    packet = readPacket(required(args, 'packet'));
  } catch (error) {
    if (error instanceof CliError) throw error;
    const result: ResolveResult = { schema: 'explain-resolve/1', status: 'invalid', diagnostics: [fromHashError(error)] };
    printResolve(result, json);
    return EXIT.invalid;
  }
  const doc = stringFlag(args, 'doc');
  const { result } = resolveReference(packet, { repoRoot: repoRoot(args), ...(doc !== undefined ? { doc } : {}) });
  printResolve(result, json);
  return exitForStatus(result);
}

async function show(args: ParsedArgs): Promise<number> {
  const [, doc, targetId] = args.positional;
  if (!doc || !targetId) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  const json = booleanFlag(args, 'json');
  const quote = stringFlag(args, 'quote');
  const result = showReference(doc, targetId, { repoRoot: repoRoot(args), ...(quote !== undefined ? { quote } : {}) });
  if (json) process.stdout.write(JSON.stringify({ packet: result.packet, yaml: result.yaml, ...(result.quoteFound !== undefined ? { quoteFound: result.quoteFound } : {}) }, null, 2) + '\n');
  else process.stdout.write(result.yaml);
  if (result.quoteFound === false) printDiagnostics([{ code: 'W_QUOTE_NOT_FOUND', severity: 'warning', message: 'the quote is not in the target text' }], false);
  return EXIT.ok;
}

async function refresh(args: ParsedArgs): Promise<number> {
  const json = booleanFlag(args, 'json');
  const packet = readPacket(required(args, 'packet'));
  const expected = required(args, 'expected-current');
  const acknowledgements = { stale: booleanFlag(args, 'acknowledge-stale'), bodyChange: booleanFlag(args, 'acknowledge-body-change') };
  const doc = stringFlag(args, 'doc');
  try {
    const result = refreshReference(packet, expected, acknowledgements, { repoRoot: repoRoot(args), ...(doc !== undefined ? { doc } : {}) });
    if (json) process.stdout.write(JSON.stringify({ packet: result.packet, yaml: result.yaml, targetBodyUnchanged: result.targetBodyUnchanged }, null, 2) + '\n');
    else process.stdout.write(result.yaml);
    return EXIT.ok;
  } catch (error) {
    if (!(error instanceof RefreshRefused)) throw error;
    const diagnostics: Diagnostic[] = [{ code: 'E_REF_STALE', severity: 'error', message: error.message, targetId: packet.targetId }];
    if (json) {
      process.stdout.write(JSON.stringify({ refused: true, targetBodyUnchanged: error.resolution.targetBodyUnchanged, currentRevision: error.resolution.currentRevision, currentText: error.currentText, diagnostics }, null, 2) + '\n');
    } else {
      if (error.currentText !== undefined) process.stdout.write(`--- current target text ---\n${error.currentText}`);
      printDiagnostics(diagnostics, false);
    }
    return EXIT.conflict;
  }
}

async function replace(args: ParsedArgs): Promise<number> {
  const json = booleanFlag(args, 'json');
  const packet = readPacket(required(args, 'packet'));
  const replacementPath = required(args, 'replacement');
  const expected = required(args, 'expected-revision');
  let replacement: Uint8Array;
  try {
    replacement = new Uint8Array(readFileSync(replacementPath));
  } catch {
    throw new CliError('E_SOURCE_UNAVAILABLE', `cannot read replacement ${replacementPath}`, EXIT.unavailable);
  }
  const doc = stringFlag(args, 'doc');
  const result = replaceTarget(packet, replacement, expected, { repoRoot: repoRoot(args), ...(doc !== undefined ? { doc } : {}) });
  if (json) {
    const check = validateAgainst('edit', result);
    if (!check.ok) throw new Error(`edit output violates explain-edit/1: ${check.errors.join('; ')}`);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write([
      `replaced ${result.targetId}: ${result.oldRevision} -> ${result.newRevision}`,
      `changed: ${result.changedTargets.join(', ') || '(none)'}`,
      `containing: ${result.containingTargets.join(', ') || '(none)'}`,
      `added: ${result.addedTargets.join(', ') || '(none)'}`,
      ...result.dependentTargets.filter((d) => d.dependents.length > 0).map((d) => `dependents of ${d.target}: ${d.dependents.join(', ')}`),
      '',
      result.diff,
    ].join('\n'));
  }
  return EXIT.ok;
}

export async function runRefs(args: ParsedArgs): Promise<number> {
  const sub = args.positional[0];
  try {
    switch (sub) {
      case 'resolve': return await resolve(args);
      case 'show': return await show(args);
      case 'refresh': return await refresh(args);
      case 'replace': return await replace(args);
      case 'retire': {
        printDiagnostics([{ code: 'E_UNSUPPORTED', severity: 'error', message: '`refs retire` is not implemented yet (planned for Phase 3)' }], args.flags.has('json'));
        return EXIT.unavailable;
      }
      default:
        throw new CliError('E_USAGE', USAGE, EXIT.invalid);
    }
  } catch (error) {
    if (error instanceof HashError) {
      const diagnostic = fromHashError(error);
      printDiagnostics([diagnostic], args.flags.get('json') === true);
      return exitCodeFor([diagnostic]);
    }
    throw error;
  }
}
