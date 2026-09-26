// `explain check DOC [--json]` (§17.1). Phase 0: syntax, IDs, frontmatter, spans,
// and target records. Evidence and relationship checks arrive in later phases.
import { EXIT, exitCodeFor, type ParsedArgs, printDiagnostics } from '../cli-util.ts';
import { loadDocument } from './load.ts';

export async function runCheck(args: ParsedArgs): Promise<number> {
  const json = args.flags.has('json');
  const { targets, diagnostics } = loadDocument(args.positional[0]);
  const code = exitCodeFor(diagnostics);
  if (json) {
    process.stdout.write(JSON.stringify({ schema: 'explain-check/1', ok: code === EXIT.ok, targetCount: targets.size, diagnostics }, null, 2) + '\n');
  } else {
    printDiagnostics(diagnostics, false);
    if (code === EXIT.ok) process.stdout.write(`ok: ${targets.size} targets\n`);
  }
  return code;
}
