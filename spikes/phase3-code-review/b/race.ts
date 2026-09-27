// A real concurrent writer: a child loops creating DEST and writing a foreign file into it.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo } from './lib.ts';
import { forkDocument } from './tmp/new/packages/core/src/references/index.ts';

const child = `
const fs = require('fs'); const dest = process.argv[1]; const end = Date.now() + 4000;
while (Date.now() < end) {
  try { fs.mkdirSync(dest); } catch {}
  try { fs.writeFileSync(dest + '/foreign.txt', 'x', { flag: 'wx' }); } catch {}
}`;
const tally: Record<string, number> = {};
let corrupt = 0;
for (let i = 0; i < 40; i++) {
  const { repo, doc } = tempRepo();
  const dest = join(repo, 'docs/explanations/copy');
  const proc = spawn(process.execPath, ['-e', child, dest], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 5 + (i % 7)));
  let outcome = 'OK';
  try {
    forkDocument(doc, dest, { repoRoot: repo });
  } catch (e) {
    outcome = (e as { code?: string }).code ?? 'THROW';
  }
  proc.kill();
  // Corruption: the fork reported success but DEST also holds the foreign file, or DEST lacks index.md.
  if (outcome === 'OK' && (existsSync(join(dest, 'foreign.txt')) || !existsSync(join(dest, 'index.md')))) corrupt++;
  tally[outcome] = (tally[outcome] ?? 0) + 1;
}
console.log('outcomes', JSON.stringify(tally), 'corrupt successes', corrupt);
