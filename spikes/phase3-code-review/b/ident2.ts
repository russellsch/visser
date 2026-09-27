import * as id from './tmp/new/packages/core/src/provenance/identity.ts';
const fn = Object.entries(id).find(([k, v]) => typeof v === 'function' && /strip|portable|sanit|clean/i.test(k));
console.log('using', fn?.[0]);
for (const u of ['ssh://git@github.com/o/r.git', 'https://user:pw@github.com/o/r.git', 'https://github.com/o/r.git?token=abc', 'git@github.com:o/r.git']) {
  try { console.log(u.padEnd(40), '->', (fn![1] as (s: string) => unknown)(u)); } catch (e) { console.log(u.padEnd(40), 'ERR', (e as Error).message.slice(0, 80)); }
}
