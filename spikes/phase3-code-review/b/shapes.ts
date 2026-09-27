// Frontmatter shapes beyond the tested five, through the real insert and the adapter's parse.
import { code } from './lib.ts';
import { insertRetiredTargets, rewriteDocId } from './tmp/new/packages/core/src/references/index.ts';
import { parseSource } from './tmp/new/packages/core/src/syntax/index.ts';

const head = 'format: explain/1\ndocId: 11111111-2222-4333-8444-555555555555\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n';
const body = '\n<!-- ex:id overview -->\n# T\n';
const doc = (fm: string, nl = '\n', bom = '') => bom + ('---\n' + fm + '---\n' + body).replace(/\n/g, nl);
const cases: Array<[string, string]> = [
  ['comments between entries', head + 'retiredTargets:\n  a1:\n    reason: "x"\n  # note\n  a2:\n    reason: "y"\n'],
  ['trailing top-level comment', head + 'retiredTargets:\n  a1:\n    reason: "x"\n# end\n'],
  ['keys after block', 'format: explain/1\nretiredTargets:\n  a1:\n    reason: "x"\ndocId: 11111111-2222-4333-8444-555555555555\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n'],
  ['entry with extra key', head + 'retiredTargets:\n  a1:\n    reason: "x"\n    note: "n"\n'],
  ['quoted key', head + '"retiredTargets":\n  a1:\n    reason: "x"\n'],
  ['document end marker', head + '...\n'],
  ['key with inline comment', head + 'retiredTargets: # old\n  a1:\n    reason: "x"\n'],
  ['empty mapping then block', head + 'retiredTargets:\n'],
];
for (const [label, fm] of cases) {
  for (const [nl, bom, tag] of [['\n', '', 'LF'], ['\r\n', '', 'CRLF'], ['\n', '﻿', 'BOM']] as const) {
    const input = doc(fm, nl, bom);
    let out = '';
    const r = code(() => { out = insertRetiredTargets(input, [{ id: 'zz_new', reason: 'r' }]); });
    let parsed = '';
    if (r === 'OK') {
      const p = parseSource(new TextEncoder().encode(out), 'index.md');
      parsed = JSON.stringify(p.frontmatter['retiredTargets']) + ' diag=' + p.diagnostics.map((d) => d.code).join(',');
    }
    console.log(`${label} [${tag}]`.padEnd(40), r.slice(0, 70), parsed.slice(0, 110));
  }
}
// docId rewrite: trailing comment and quoted value.
for (const fm of [head.replace(/docId: (\S+)/, 'docId: $1 # stable id'), head.replace(/docId: (\S+)/, "docId: '$1'")]) {
  let out = '';
  const r = code(() => { out = rewriteDocId(doc(fm), '99999999-2222-4333-8444-555555555555'); });
  console.log('rewriteDocId', r.slice(0, 40), JSON.stringify(out.split('\n')[2]));
}
