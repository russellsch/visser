import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { canonicalJSON } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/model/hash.ts';
const dir = process.argv[2]!;
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : [f]; });
const files = walk(dir).map((f) => ({ path: relative(dir, f).split(sep).join('/'), sha256: createHash('sha256').update(readFileSync(f)).digest('hex') }))
  .filter((f) => f.path !== 'release.json').sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
const m = { schema: 'explain-release/1', version: '0.0.0', files };
writeFileSync(join(dir, 'release.json'), canonicalJSON(m) + '\n');
console.log(createHash('sha256').update(canonicalJSON(m)).digest('hex'));
