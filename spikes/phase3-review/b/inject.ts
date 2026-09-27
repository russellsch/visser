import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadBundle } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/model/bundle.ts';
import { normalizeText } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/model/hash.ts';

const head = `---\nformat: explain/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n---\n\n<!-- ex:id p1 -->\nIntro.\n`;
function block(text: string, attrs: Record<string, string | number>, fence = '```') {
  const h = createHash('sha256').update(normalizeText(new TextEncoder().encode(text))).digest('hex');
  const a = Object.entries({ id: 'src_x', kind: 'example', title: 'X', language: 'text', ...attrs, excerptSha256: h })
    .map(([k, v]) => typeof v === 'number' ? `${k}=${v}` : `${k}=${JSON.stringify(v)}`).join(' ');
  const body = text.endsWith('\n') ? text : text + '\n';
  return `\n{% source ${a} %}\n${fence}text\n${body}${fence}\n{% /source %}\n`;
}
function run(name: string, doc: string) {
  const dir = mkdtempSync(join('/tmp/claude-1000', 'p3b-'));
  writeFileSync(join(dir, 'index.md'), doc);
  const b = loadBundle(join(dir, 'index.md'));
  const ids = [...b.model.targets.keys()];
  const src = b.model.targets.get('src_x');
  console.log(name.padEnd(28), 'targets=', JSON.stringify(ids), 'diag=', JSON.stringify(b.diagnostics.map((d) => d.code + ':' + d.message.slice(0, 70))), src ? 'srcText=' + JSON.stringify(src.plainText.slice(0, 60)) : '');
}
mkdirSync('/tmp/claude-1000', { recursive: true });
run('plain', head + block('a\nb\n', { start: 1, end: 2 }));
run('backticks in text', head + block('before\n```\n{% /source %}\n\n<!-- ex:id injected -->\nInjected paragraph.\n\n{% source id="src_evil" kind="example" title="E" %}\n```x\n', { start: 1, end: 9 }));
run('backticks 4-fence', head + block('before\n```\n{% /source %}\nafter\n', { start: 1, end: 4 }, '````'));
run('tilde fence in text', head + block('~~~\nx\n', { start: 1, end: 2 }));
run('title with quote/%}', head + block('a\n', { title: 'x" kind="git %} {% /source %}', start: 1, end: 1 }));
run('title with newline', head + block('a\n', { title: 'line1\n%}\nline2', start: 1, end: 1 }));
run('file attr with $var', head + block('a\n', { title: '{% $x %}', start: 1, end: 1 }));
run('lone CR mid-line', head + block('a\rb\nc\n', { start: 1, end: 2 }));
run('no final newline 1 line', head + block('lastline', { start: 7, end: 7 }));
run('BOM at excerpt start', head + block('﻿a\n', { start: 1, end: 1 }));
run('NUL in text', head + block('a\u0000b\n', { start: 1, end: 1 }));
run('fence-info injection', head + block('a\n', { language: 'text %}', start: 1, end: 1 }));
