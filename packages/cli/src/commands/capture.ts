import { lstatSync } from 'node:fs';
// `visser capture git|file` (§8.2, §8.4, §17.1). Both are guarded writes to
// the document (§11.9). Exit codes follow §15.6 through exitCodeFor.
import { resolve } from 'node:path';
import { HashError } from '../../../core/src/model/hash.ts';
import { captureFile, captureGit, type CaptureResult } from '../../../core/src/provenance/index.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, stringFlag, printJson } from '../cli-util.ts';

const USAGE = [
  'usage: visser capture git --repo DIR --file PATH --lines START:END --doc DOC --id ID --title TITLE',
  '         [--rev REV | --working-tree] [--repository-label NAME] [--language LANG] [--symbol NAME]',
  '         [--captured-at TIMESTAMP] [--recapture] [--allow-alternates] [--allow-external-gitdir] [--dry-run] [--json]',
  '       visser capture file --from PATH --kind file|web|supplied|example --doc DOC --id ID --title TITLE',
  '         [--lines START:END] [--label NAME] [--url URL] [--language LANG] [--captured-at TIMESTAMP] [--recapture] [--dry-run] [--json]',
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
  // W_DUPLICATE_SOURCE and similar findings are printed regardless of mode:
  // they are not part of the normative --json schema, only a note to the
  // terminal running the command (dogfood-3 F13).
  for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
  const a = result.attributes;
  const where = a.asset ?? (a.start !== undefined ? `lines ${a.start}-${a.end}` : 'whole file');
  if (result.dryRun) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ schema: 'visser-capture-dry-run/1', dryRun: true, id: a.id, title: a.title, kind: a.kind, where, excerptSha256: a.excerptSha256, excerptPreview: result.excerptPreview ?? [] }, null, 2)}\n`);
      return;
    }
    const preview = (result.excerptPreview ?? []).map((line) => `    ${line}`).join('\n');
    process.stdout.write(
      `would capture ${a.id} (${a.kind}, ${where})\n  title: ${a.title}\n${a.file ? `  file: ${a.file}\n` : ''}  sha256: ${a.excerptSha256}\n` +
        (preview ? `  excerpt:\n${preview}\n` : ''),
    );
    return;
  }
  if (json) {
    // The dry-run-only fields never reach the schema-checked payload.
    const { warnings: _warnings, dryRun: _dryRun, excerptPreview: _preview, ...rest } = result;
    printJson('capture', { schema: 'visser-capture/1', ...rest });
    return;
  }
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
        ...(flag(args, 'dry-run') ? { dryRun: true } : {}),
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
        ...(flag(args, 'dry-run') ? { dryRun: true } : {}),
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
