// Retire semantics on the bounded-queue and Mermaid examples.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { code, read, tempRepo } from './lib.ts';
import { parsePacket, resolveReference, retireTarget, showReference } from './tmp/new/packages/core/src/references/index.ts';
import { loadBundle } from './tmp/new/packages/core/src/model/bundle.ts';

const NEW = join(import.meta.dirname, 'tmp/new');
function retire(repo: string, doc: string, id: string, extra: Record<string, string> = {}) {
  const p = parsePacket(showReference(doc, id, { repoRoot: repo }).yaml);
  let res: { retiredTargets?: string[] } | undefined;
  const r = code(() => { res = retireTarget(p, { reason: 'test', ...extra }, p.sourceRevision, { repoRoot: repo, doc }) as never; });
  return { r, res, p };
}
const diag = (doc: string) => loadBundle(doc).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code + ' ' + d.message.slice(0, 70));

for (const id of ['overview', 'enqueue', 'src_condition_docs', 'def_backpressure', 'wait_code', 'handoff', 'actor_producer']) {
  const { repo, doc } = tempRepo();
  const { r, res } = retire(repo, doc, id);
  console.log(`retire ${id}`.padEnd(28), r.slice(0, 110), res ? JSON.stringify(res.retiredTargets) : '', r === 'OK' ? JSON.stringify(diag(doc)) : '');
}
// CRLF document: retire a paragraph; line endings preserved, still valid.
{
  const { repo, doc } = tempRepo(read(join(NEW, 'examples/bounded-queue/index.md')).replace(/\n/g, '\r\n'));
  const { r } = retire(repo, doc, 'p_limits');
  const t = read(doc);
  console.log('CRLF retire p_limits'.padEnd(28), r, 'bareLF=', /[^\r]\n/.test(t), 'tripleBlank=', /\r\n\r\n\r\n/.test(t), JSON.stringify(diag(doc)));
}
// Reuse a retired ID by hand: check must refuse.
{
  const { repo, doc } = tempRepo();
  retire(repo, doc, 'p_limits');
  writeFileSync(doc, read(doc).replace('<!-- ex:id p_vocabulary -->', '<!-- ex:id p_limits -->\nReused.\n\n<!-- ex:id p_vocabulary -->'));
  console.log('reuse retired id'.padEnd(28), JSON.stringify(diag(doc)));
}
// With --replacement, the old packet resolves deleted with an advisory replacement.
{
  const { repo, doc } = tempRepo();
  const { r, p } = retire(repo, doc, 'p_limits', { replacement: 'p_takeaway' });
  const res = resolveReference(p, { repoRoot: repo, doc }).result;
  console.log('replacement then resolve'.padEnd(28), r, res.status, JSON.stringify(res.diagnostics.map((d: { message: string }) => d.message.slice(0, 80))));
}
// Mermaid figure: all mapped element IDs retired.
{
  const { repo, doc } = tempRepo(undefined, join(NEW, 'examples/mermaid-flowchart/index.md'));
  const b = loadBundle(doc);
  const fig = [...b.model.targets.values()].find((t) => t.kind === 'mermaid')!;
  const kids = [...b.model.targets.values()].filter((t) => t.parentId === fig.id).map((t) => t.id);
  const { r, res } = retire(repo, doc, fig.id);
  console.log('retire mermaid figure'.padEnd(28), r.slice(0, 100), 'children=', JSON.stringify(kids), 'retired=', JSON.stringify(res?.retiredTargets));
}
