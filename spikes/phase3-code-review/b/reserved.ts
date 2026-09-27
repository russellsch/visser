// Target IDs that are YAML core-schema words (true, false, null) are valid under §6.3.
import { code, read, tempRepo } from './lib.ts';
import { parsePacket, replaceTarget, resolveReference, retireTarget, showReference } from './tmp/new/packages/core/src/references/index.ts';
import { loadBundle } from './tmp/new/packages/core/src/model/bundle.ts';

const doc0 = `---
format: explain/1
docId: 11111111-2222-4333-8444-555555555555
title: Reserved words
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id overview -->
# Reserved

<!-- ex:id true -->
First.

<!-- ex:id null -->
Second.

<!-- ex:id keep -->
Third.
`;
for (const id of ['true', 'null']) {
  const { repo, doc } = tempRepo(doc0);
  console.log('check', id, JSON.stringify(loadBundle(doc).diagnostics.map((d) => d.code)));
  const p = parsePacket(showReference(doc, id, { repoRoot: repo }).yaml);
  console.log(`retire ${id}:`.padEnd(22), code(() => retireTarget(p, { reason: 'gone' }, p.sourceRevision, { repoRoot: repo, doc })));
  const p2 = parsePacket(showReference(doc, 'keep', { repoRoot: repo }).yaml);
  console.log(`retire keep -> ${id}:`.padEnd(22), code(() => retireTarget(p2, { reason: 'merged', replacement: id }, p2.sourceRevision, { repoRoot: repo, doc })));
}
// A hand-written retiredTargets entry keyed `true:` (valid ID) with replacement null.
const hand = doc0.replace('visibility: private\n', 'visibility: private\nretiredTargets:\n  false:\n    reason: "gone"\n    replacement: null\n');
const { doc } = tempRepo(hand);
const b = loadBundle(doc);
console.log('hand-written false/null:', JSON.stringify(b.parsed.frontmatter['retiredTargets']), JSON.stringify(b.diagnostics.map((d) => d.code + ' ' + d.message.slice(0, 80))));
