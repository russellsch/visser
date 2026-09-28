// `visser init PATH --kind K --title T [--toolkit-dir DIR] [--no-lock]` (§17.1, §12.3).
// Creates index.md and visser.lock.json; never overwrites existing content.
// `--no-lock` is for a document inside the toolkit's own repository, which is
// built with `--dev-toolkit` and has no lock (dogfood-2 Q11).
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CliError, EXIT, type ParsedArgs, stringFlag } from '../cli-util.ts';
import { resolveToolkitDir } from '../toolkit.ts';

const KINDS = ['architecture', 'plan', 'root-cause', 'teaching', 'decision', 'reference'];

export async function runInit(args: ParsedArgs): Promise<number> {
  const target = args.positional[0];
  const kind = stringFlag(args, 'kind');
  const title = stringFlag(args, 'title');
  if (!target || !kind || !title) {
    throw new CliError('E_USAGE', 'usage: visser init PATH --kind KIND --title TITLE [--toolkit-dir DIR] [--no-lock]', EXIT.invalid);
  }
  const noLockFlag = args.flags.get('no-lock');
  if (noLockFlag !== undefined && noLockFlag !== true) {
    throw new CliError('E_USAGE', '--no-lock takes no value (put it last or before another flag)', EXIT.invalid);
  }
  const noLock = noLockFlag === true;
  if (!KINDS.includes(kind)) {
    throw new CliError('E_USAGE', `--kind must be one of ${KINDS.join(', ')}`, EXIT.invalid);
  }
  if (/[\r\n]/.test(title) || title.trim() === '') {
    throw new CliError('E_USAGE', '--title must be one non-empty line', EXIT.invalid);
  }
  const dir = resolve(target);
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new CliError('E_USAGE', `${target} exists and is not empty; init never overwrites content`, EXIT.invalid);
  }
  const release = resolveToolkitDir(stringFlag(args, 'toolkit-dir'));

  const docId = randomUUID(); // lowercase RFC 9562 version 4
  const capturedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const index = [
    '---',
    'format: visser/1',
    `docId: ${docId}`,
    `title: ${JSON.stringify(title)}`,
    `kind: ${kind}`,
    `capturedAt: ${capturedAt}`,
    'visibility: private',
    '---',
    '',
    '<!-- vs:id overview -->',
    `# ${title}`,
    '',
  ].join('\n');
  const lock = {
    schema: 'visser-lock/1',
    toolkit: { version: release.version, sha256: release.sha256, origin: { kind: 'local-dir' } },
    extensions: [],
    imports: [],
  };

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.md'), index, { flag: 'wx' });
  if (noLock) {
    process.stdout.write(`created ${target}/index.md (docId ${docId})\nno lock written; run every command with --dev-toolkit DIR\n`);
    return EXIT.ok;
  }
  writeFileSync(join(dir, 'visser.lock.json'), JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(`created ${target}/index.md (docId ${docId})\nlocked toolkit ${release.version} ${release.sha256} (local-dir)\n`);
  return EXIT.ok;
}
