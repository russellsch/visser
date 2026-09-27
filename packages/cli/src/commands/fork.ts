// `visser fork DOC DEST [--root DIR] [--json]` (§11.5, §17.1). A new document
// identity; internal IDs, provenance, and retiredTargets are kept.
import { HashError } from '../../../core/src/model/hash.ts';
import { forkDocument } from '../../../core/src/references/fork.ts';
import { findRepoRoot } from '../../../core/src/references/registry.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, stringFlag, printJson } from '../cli-util.ts';

export async function runFork(args: ParsedArgs): Promise<number> {
  const [doc, dest] = args.positional;
  const json = args.flags.get('json') === true;
  if (!doc || !dest) throw new CliError('E_USAGE', 'usage: visser fork DOC DEST [--root DIR] [--json]', EXIT.invalid);
  const root = stringFlag(args, 'root') ?? findRepoRoot(process.cwd());
  if (!root) throw new CliError('E_SOURCE_UNAVAILABLE', 'no repository root (a directory with .git or .visser) found; pass --root DIR', EXIT.unavailable);
  try {
    const result = forkDocument(doc, dest, { repoRoot: root });
    if (json) printJson('fork', result);
    else process.stdout.write(`forked ${result.sourceDocId} -> ${result.docId}\n  ${result.path}\n  copied: ${result.files.join(', ')}\n`);
    return EXIT.ok;
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const diagnostic = { code: error.code, severity: 'error' as const, message: error.message };
    printDiagnostics([diagnostic], json);
    return exitCodeFor([diagnostic]);
  }
}
