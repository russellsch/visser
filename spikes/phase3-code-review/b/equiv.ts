// With the retire chain check and the replace --retire nesting check removed, do later layers still refuse?
import { code, read, tempRepo } from './lib.ts';
import { parsePacket, replaceTarget, retireTarget, showReference } from './tmp/mut/packages/core/src/references/index.ts';
{
  const { repo, doc } = tempRepo();
  const a = parsePacket(showReference(doc, 'p_limits', { repoRoot: repo }).yaml);
  retireTarget(a, { reason: 'x', replacement: 'p_takeaway' }, a.sourceRevision, { repoRoot: repo, doc });
  const b = parsePacket(showReference(doc, 'p_takeaway', { repoRoot: repo }).yaml);
  console.log('chain (check removed):', code(() => retireTarget(b, { reason: 'y' }, b.sourceRevision, { repoRoot: repo, doc })));
}
{
  const { repo, doc } = tempRepo();
  const p = parsePacket(showReference(doc, 'p_limits', { repoRoot: repo }).yaml);
  console.log('non-nested --retire (check removed):', code(() => replaceTarget(p, new TextEncoder().encode('<!-- ex:id p_limits -->\nX.\n'), p.sourceRevision, { repoRoot: repo, doc, retire: [{ id: 'p_trace', reason: 'x' }] })));
}
