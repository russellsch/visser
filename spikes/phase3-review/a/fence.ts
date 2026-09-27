import { loadBundle } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/model/bundle.ts';
import { sha256Hex, normalizeText } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/model/hash.ts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const body = 'Example:\n```js\nx()\n```\n';
const hash = sha256Hex(new TextEncoder().encode(body));
for (const fence of ['````', '~~~']) {
  const d = mkdtempSync(join(tmpdir(), 'f-'));
  const doc = `---\nformat: explain/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-26T00:00:00Z\nvisibility: private\n---\n\n{% source id="src_md" kind="example" title="Nested fence" language="markdown" excerptSha256="${hash}" %}\n${fence}markdown\n${body}${fence}\n{% /source %}\n`;
  writeFileSync(join(d, 'index.md'), doc);
  const b = loadBundle(join(d, 'index.md'));
  console.log(fence, JSON.stringify(b.diagnostics.map((x) => x.code + ':' + x.message.slice(0, 80))));
}
