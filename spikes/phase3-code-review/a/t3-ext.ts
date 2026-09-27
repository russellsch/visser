// A promisor remote with an ext:: URL and protocol.ext.allow=always in repo config.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { git, repo, TMP } from './lib.ts';
import { openRepository, readBlobAt, resolveCommit } from '../../../packages/core/src/provenance/git.ts';
const origin = repo('ext-origin', { 'a.txt': 'lazy\n' });
git(origin, 'config', 'uploadpack.allowFilter', 'true');
const clone = join(TMP, 'ext-' + Math.random().toString(36).slice(2));
execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', 'file://' + origin, clone], { env: { PATH: process.env.PATH!, HOME: TMP } });
const sentinel = join(TMP, 'EXT_SENTINEL_' + Math.random().toString(36).slice(2));
git(clone, 'config', 'remote.origin.url', `ext::sh -c touch% ${sentinel}`);
git(clone, 'config', 'protocol.ext.allow', 'always');
try {
  const r = openRepository(clone);
  readBlobAt(r, resolveCommit(r, 'HEAD'), 'a.txt');
  console.log('read succeeded');
} catch (e) { console.log('refused', (e as { code?: string }).code); }
console.log('command executed by capture:', existsSync(sentinel));
