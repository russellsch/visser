// `explain ids assign DOC [--check]` (§6.3, §17.1). Inserts missing markers;
// `--check` reports what would change without writing.
import { randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { assignIds } from '../../../core/src/syntax/index.ts';
import { CliError, EXIT, type ParsedArgs } from '../cli-util.ts';

export async function runIdsAssign(args: ParsedArgs): Promise<number> {
  const doc = args.positional[0];
  if (!doc) throw new CliError('E_USAGE', 'usage: explain ids assign DOC [--check]', EXIT.invalid);
  const original = readFileSync(doc);
  const result = assignIds(new Uint8Array(original), (n) => new Uint8Array(randomBytes(n)));
  if (result.added.length === 0) {
    process.stdout.write('no missing IDs\n');
    return EXIT.ok;
  }
  if (args.flags.has('check')) {
    process.stdout.write(`${result.added.length} block(s) need IDs; run \`explain ids assign ${doc}\`\n`);
    return EXIT.invalid;
  }
  // Write through a temporary file in the same directory, then rename.
  const tmp = join(dirname(doc), `.${basename(doc)}.${process.pid}.tmp`);
  writeFileSync(tmp, result.bytes, { flag: 'wx' });
  renameSync(tmp, doc);
  process.stdout.write(`added ${result.added.length} ID(s): ${result.added.join(', ')}\n`);
  return EXIT.ok;
}
