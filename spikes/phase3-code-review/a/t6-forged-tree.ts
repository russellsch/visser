// Replace the commit's loose TREE object with forged content under the same ID.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { git, repo } from './lib.ts';
import { openRepository, readBlobAt, resolveCommit } from '../../../packages/core/src/provenance/git.ts';
import { verifyOrigins } from '../../../packages/core/src/provenance/verify.ts';
const r = repo('forge', { 'a.txt': 'REAL\n', 'b.txt': 'FORGED\n' });
const commit = git(r, 'rev-parse', 'HEAD');
const tree = git(r, 'rev-parse', 'HEAD^{tree}');
const blobB = git(r, 'rev-parse', 'HEAD:b.txt');
const hex2bin = (h: string) => Buffer.from(h, 'hex');
// Forged tree: a.txt -> blob of b.txt (valid blob, so the blob recheck passes).
const entries = Buffer.concat([
  Buffer.from('100644 a.txt\0'), hex2bin(blobB),
  Buffer.from('100644 b.txt\0'), hex2bin(blobB),
]);
const raw = Buffer.concat([Buffer.from(`tree ${entries.length}\0`), entries]);
const realHash = createHash('sha1').update(raw).digest('hex');
const path = join(r, '.git/objects', tree.slice(0, 2), tree.slice(2));
chmodSync(path, 0o644);
writeFileSync(path, deflateSync(raw));
console.log('forged tree stored under real id', tree, '(its content hashes to', realHash + ')');
const repoObj = openRepository(r);
try {
  const read = readBlobAt(repoObj, resolveCommit(repoObj, commit), 'a.txt');
  console.log('capture of a.txt at', commit.slice(0, 12), '->', JSON.stringify(Buffer.from(read.bytes).toString()), '(real content is "REAL\\n")');
} catch (e) { console.log('capture refused', (e as { code?: string }).code, (e as Error).message); }
void verifyOrigins; void mkdirSync;
