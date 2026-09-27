// Lock release and temp-file cleanup on failure paths of every guarded write.
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { code, read, tempRepo } from './lib.ts';
import { parsePacket, replaceTarget, retireTarget, showReference } from './tmp/new/packages/core/src/references/index.ts';

function leftovers(repo: string, doc: string) {
  const locks = existsSync(join(repo, '.explain/edit-locks')) ? readdirSync(join(repo, '.explain/edit-locks')) : [];
  const temps = readdirSync(dirname(doc)).filter((n) => n.endsWith('.tmp'));
  return `locks=${locks.length} temps=${temps.length}`;
}
const cases: Array<[string, (repo: string, doc: string) => unknown]> = [
  ['replace: drop nested (E_ID_RETENTION)', (repo, doc) => {
    const p = parsePacket(showReference(doc, 'handoff', { repoRoot: repo }).yaml);
    const span = read(doc).match(/\{% graph id="handoff"[\s\S]*?\{% \/graph %\}\n/)![0].replace(/\{% edge id="dequeue"[\s\S]*?\{% \/edge %\}\n/, '');
    return replaceTarget(p, new TextEncoder().encode(span), p.sourceRevision, { repoRoot: repo, doc });
  }],
  ['replace: external write before rename', (repo, doc) => {
    const p = parsePacket(showReference(doc, 'p_limits', { repoRoot: repo }).yaml);
    return replaceTarget(p, new TextEncoder().encode('<!-- ex:id p_limits -->\nNew text.\n'), p.sourceRevision, { repoRoot: repo, doc, fsContext: { beforeRename: (path) => writeFileSync(path, read(path) + '\n') } });
  }],
  ['retire: referrer (E_REF_BROKEN)', (repo, doc) => {
    const p = parsePacket(showReference(doc, 'enqueue', { repoRoot: repo }).yaml);
    return retireTarget(p, { reason: 'x' }, p.sourceRevision, { repoRoot: repo, doc });
  }],
  ['retire: bad reason (E_USAGE)', (repo, doc) => {
    const p = parsePacket(showReference(doc, 'p_limits', { repoRoot: repo }).yaml);
    return retireTarget(p, { reason: 'a\nb' }, p.sourceRevision, { repoRoot: repo, doc });
  }],
  ['retire: throw inside beforeRename', (repo, doc) => {
    const p = parsePacket(showReference(doc, 'p_limits', { repoRoot: repo }).yaml);
    return retireTarget(p, { reason: 'x' }, p.sourceRevision, { repoRoot: repo, doc, fsContext: { beforeRename: () => { throw new Error('boom'); } } });
  }],
  ['replace --retire: id not nested', (repo, doc) => {
    const p = parsePacket(showReference(doc, 'p_limits', { repoRoot: repo }).yaml);
    return replaceTarget(p, new TextEncoder().encode('<!-- ex:id p_limits -->\nX.\n'), p.sourceRevision, { repoRoot: repo, doc, retire: [{ id: 'p_trace', reason: 'x' }] });
  }],
];
for (const [label, fn] of cases) {
  const { repo, doc } = tempRepo();
  const before = read(doc);
  const r = code(() => fn(repo, doc));
  const unchanged = read(doc) === before || label.includes('external write');
  console.log(label.padEnd(40), r.slice(0, 60).padEnd(62), leftovers(repo, doc), 'docUnchanged=', unchanged);
}
