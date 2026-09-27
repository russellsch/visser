import { lstatSync } from 'node:fs';
// `explain capture git|file` (§8.2, §8.4, §17.1). Both are guarded writes to
// the document (§11.9). Exit codes follow §15.6 through exitCodeFor.
import { resolve } from 'node:path';
import { HashError } from '../../../core/src/model/hash.ts';
import { captureFile, captureGit, type CaptureResult } from '../../../core/src/provenance/index.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, stringFlag, printJson } from '../cli-util.ts';

const USAGE = [
  'usage: explain capture git --repo DIR --file PATH --lines START:END --doc DOC --id ID --title TITLE',
  '         [--rev REV | --working-tree] [--repository-label NAME] [--language LANG] [--symbol NAME]',
  '         [--captured-at TIMESTAMP] [--recapture] [--allow-alternates] [--allow-external-gitdir] [--json]',
  '       explain capture file --from PATH --kind file|web|supplied|example --doc DOC --id ID --title TITLE',
  '         [--lines START:END] [--label NAME] [--url URL] [--language LANG] [--captured-at TIMESTAMP] [--recapture] [--json]',
].join('\n');

function flag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value === undefined) return false;
  if (value !== true) throw new CliError('E_USAGE', `--${name} takes no value (put it last or before another flag)`, EXIT.invalid);
  return true;
}

function required(args: ParsedArgs, name: string): string {
  const value = stringFlag(args, name);
  if (value === undefined) throw new CliError('E_USAGE', `--${name} is required\n${USAGE}`, EXIT.invalid);
  return value;
}

function optional(args: ParsedArgs, name: string): Record<string, string> {
  const value = stringFlag(args, name);
  return value === undefined ? {} : { [name]: value };
}

function report(result: CaptureResult, json: boolean): void {
  if (json) {
    printJson('capture', { schema: 'explain-capture/1', ...result });
    return;
  }
  const a = result.attributes;
  const where = a.asset ?? (a.start !== undefined ? `lines ${a.start}-${a.end}` : 'whole file');
  process.stdout.write(`${result.replaced ? 'recaptured' : 'captured'} ${a.id} (${a.kind}, ${where})\n  excerptSha256: ${a.excerptSha256}\n  source revision: ${result.oldRevision} -> ${result.newRevision}\n`);
}

export async function runCapture(args: ParsedArgs): Promise<number> {
  const [mode] = args.positional;
  const json = args.flags.has('json');
  // A missing or non-file document is invalid input, never an internal error (§15.6).
  const docArg = stringFlag(args, 'doc');
  if (docArg !== undefined) {
    let isFile = false;
    try { isFile = lstatSync(resolve(docArg)).isFile() || lstatSync(resolve(docArg)).isSymbolicLink(); } catch { isFile = false; }
    if (!isFile) throw new CliError('E_SOURCE_UNAVAILABLE', `cannot read the document ${docArg}`, EXIT.unavailable);
  }
  try {
    let result: CaptureResult;
    if (mode === 'git') {
      const lr = optional(args, 'repository-label');
      result = captureGit({
        repo: resolve(required(args, 'repo')),
        file: required(args, 'file'),
        lines: required(args, 'lines'),
        doc: resolve(required(args, 'doc')),
        id: required(args, 'id'),
        title: required(args, 'title'),
        ...(stringFlag(args, 'rev') !== undefined ? { rev: stringFlag(args, 'rev')! } : {}),
        ...(flag(args, 'working-tree') ? { workingTree: true } : {}),
        ...(lr['repository-label'] !== undefined ? { repositoryLabel: lr['repository-label'] } : {}),
        ...(stringFlag(args, 'language') !== undefined ? { language: stringFlag(args, 'language')! } : {}),
        ...(stringFlag(args, 'symbol') !== undefined ? { symbol: stringFlag(args, 'symbol')! } : {}),
        ...(stringFlag(args, 'captured-at') !== undefined ? { capturedAt: stringFlag(args, 'captured-at')! } : {}),
        ...(flag(args, 'recapture') ? { recapture: true } : {}),
        ...(flag(args, 'allow-alternates') ? { allowAlternates: true } : {}),
        ...(flag(args, 'allow-external-gitdir') ? { allowExternalGitdir: true } : {}),
      });
    } else if (mode === 'file') {
      const kind = required(args, 'kind');
      if (!['file', 'web', 'supplied', 'example'].includes(kind)) throw new CliError('E_USAGE', `--kind must be file, web, supplied, or example\n${USAGE}`, EXIT.invalid);
      result = captureFile({
        from: resolve(required(args, 'from')),
        kind: kind as 'file' | 'web' | 'supplied' | 'example',
        doc: resolve(required(args, 'doc')),
        id: required(args, 'id'),
        title: required(args, 'title'),
        ...(stringFlag(args, 'lines') !== undefined ? { lines: stringFlag(args, 'lines')! } : {}),
        ...(stringFlag(args, 'label') !== undefined ? { label: stringFlag(args, 'label')! } : {}),
        ...(stringFlag(args, 'url') !== undefined ? { url: stringFlag(args, 'url')! } : {}),
        ...(stringFlag(args, 'language') !== undefined ? { language: stringFlag(args, 'language')! } : {}),
        ...(stringFlag(args, 'captured-at') !== undefined ? { capturedAt: stringFlag(args, 'captured-at')! } : {}),
        ...(flag(args, 'recapture') ? { recapture: true } : {}),
      });
    } else {
      throw new CliError('E_USAGE', USAGE, EXIT.invalid);
    }
    report(result, json);
    return EXIT.ok;
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const diagnostic = { code: error.code, severity: 'error' as const, message: error.message };
    printDiagnostics([diagnostic], json);
    return exitCodeFor([diagnostic]);
  }
}
