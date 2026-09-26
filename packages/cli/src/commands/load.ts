// Shared document loading for check and export: parse, validate frontmatter,
// and build target records.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Diagnostic, ParsedSource, TargetRecord } from '../../../core/src/types.ts';
import { parseSource } from '../../../core/src/syntax/index.ts';
import { validateAgainst } from '../../../core/src/model/schemas.ts';
import { buildTargetRecords } from '../../../core/src/model/targets.ts';
import { CliError, EXIT } from '../cli-util.ts';

export type LoadedDocument = {
  parsed: ParsedSource;
  targets: Map<string, TargetRecord>;
  diagnostics: Diagnostic[];
};

export function loadDocument(doc: string | undefined): LoadedDocument {
  if (!doc) throw new CliError('E_USAGE', 'a document path is required', EXIT.invalid);
  let bytes: Buffer;
  try {
    bytes = readFileSync(doc);
  } catch {
    throw new CliError('E_SOURCE_UNAVAILABLE', `cannot read ${doc}`, EXIT.unavailable);
  }
  const parsed = parseSource(new Uint8Array(bytes), basename(doc));
  const diagnostics = [...parsed.diagnostics];
  if (!diagnostics.some((d) => d.severity === 'error' && d.code === 'E_SYNTAX' && d.startLine === 1)) {
    const result = validateAgainst('frontmatter', parsed.frontmatter);
    if (!result.ok) {
      for (const error of result.errors) {
        diagnostics.push({ code: 'E_SYNTAX', severity: 'error', message: `frontmatter ${error}`, path: basename(doc), startLine: 1 });
      }
    }
  }
  const built = buildTargetRecords(parsed);
  diagnostics.push(...built.diagnostics);
  return { parsed, targets: built.targets, diagnostics };
}
