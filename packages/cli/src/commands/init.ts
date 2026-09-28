// `visser init PATH --kind K --title T [--must-understand TEXT]... [--toolkit-dir DIR] [--no-lock]` (§17.1, §12.3).
// Creates index.md and visser.lock.json; never overwrites existing content.
// `--no-lock` is for a document inside the toolkit's own repository, which is
// built with `--dev-toolkit` and has no lock (dogfood-2 Q11).
// `--must-understand` may repeat; each value becomes one item of
// `reader.mustUnderstand` (IMPROVEMENTS.md §12.3 item 1). Without it, init
// prints a reminder, because `check --review` asks for the list (W_READER).
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
    throw new CliError('E_USAGE', 'usage: visser init PATH --kind KIND --title TITLE [--must-understand TEXT]... [--toolkit-dir DIR] [--no-lock]', EXIT.invalid);
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
  const mustUnderstand = (args.all.get('must-understand') ?? []).map((value) => {
    if (value === true || /[\r\n]/.test(value) || value.trim() === '') {
      throw new CliError('E_USAGE', '--must-understand needs a value: one non-empty line (repeat the flag for each item)', EXIT.invalid);
    }
    return value.trim();
  });
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
    ...(mustUnderstand.length > 0 ? ['reader:', '  mustUnderstand:', ...mustUnderstand.map((item) => `    - ${JSON.stringify(item)}`)] : []),
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

  const reminder = mustUnderstand.length > 0
    ? ''
    : 'reminder: add reader.mustUnderstand to the frontmatter: 2 to 5 things the reader can do after the page (or pass --must-understand TEXT for each)\n';

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.md'), index, { flag: 'wx' });
  if (noLock) {
    process.stdout.write(`created ${target}/index.md (docId ${docId})\nno lock written; run every command with --dev-toolkit DIR\n${reminder}`);
    return EXIT.ok;
  }
  writeFileSync(join(dir, 'visser.lock.json'), JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(`created ${target}/index.md (docId ${docId})\nlocked toolkit ${release.version} ${release.sha256} (local-dir)\n${reminder}`);
  return EXIT.ok;
}
