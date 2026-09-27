// Parity of replace error codes before (31b41a6) and after (8151fd2) the guarded-write refactor.
import { code, read, tempRepo } from './lib.ts';

const which = process.argv[2] === 'old' ? './tmp/old/packages/core/src/references/index.ts' : './tmp/new/packages/core/src/references/index.ts';
const m = await import(which);

function run(label: string, targetId: string, mutate: (span: string, doc: string) => string) {
  const { repo, doc } = tempRepo();
  const shown = m.showReference(doc, targetId, { repoRoot: repo });
  const packet = m.parsePacket(shown.yaml);
  const text = read(doc);
  const view = m.resolveReference(packet, { repoRoot: repo, doc }).result.current.sourceText as string;
  const replacement = mutate(view, text);
  console.log(label.padEnd(44), code(() => m.replaceTarget(packet, new TextEncoder().encode(replacement), packet.sourceRevision, { repoRoot: repo, doc })));
}

// 1. Replacement reuses an ID that exists elsewhere in the document (a root sibling).
run('reuse existing ID p_trace as new sibling', 'p_limits', (span) => span + '\n<!-- ex:id p_trace -->\nDuplicate.\n');
// 2. Replacement duplicates a nested ID inside a component.
run('duplicate nested node producer', 'handoff', (span) => span.replace('{% node id="queue"', '{% node id="producer" label="Again" role="process" %}\nX\n{% /node %}\n\n{% node id="queue"'));
// 3. Replacement drops a nested ID.
run('drop nested edge dequeue', 'handoff', (span) => span.replace(/\{% edge id="dequeue"[\s\S]*?\{% \/edge %\}\n/, ''));
// 4. Replacement changes the retained root ID.
run('rename retained ID', 'p_limits', (span) => span.replace('ex:id p_limits', 'ex:id p_limits2'));
// 5. Replacement introduces a broken reference.
run('broken cite ref', 'p_limits', (span) => span.replace('fairness guarantee.', 'fairness guarantee. {% cite ref="src_missing" /%}'));
