// `explain export DOC --format markdown` (§7.6). Phase 0 supports only the
// Markdown projection to stdout or --out FILE.
import { writeFileSync } from 'node:fs';
import { projectText } from '../../../core/src/model/project.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, stringFlag } from '../cli-util.ts';
import { loadDocument } from './load.ts';

export async function runExport(args: ParsedArgs): Promise<number> {
  const format = stringFlag(args, 'format') ?? 'site';
  if (format !== 'markdown') {
    throw new CliError('E_UNSUPPORTED', `export --format ${format} is not implemented yet (planned for Phase 4)`, EXIT.unavailable);
  }
  const { parsed, targets, diagnostics } = loadDocument(args.positional[0]);
  const code = exitCodeFor(diagnostics);
  if (code !== EXIT.ok) {
    printDiagnostics(diagnostics, false);
    return code;
  }
  const text = projectText(parsed, targets);
  const out = stringFlag(args, 'out');
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
  return EXIT.ok;
}
