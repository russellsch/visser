import { parseSource } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/syntax/index.ts';
const fm = (extra: string) => `---\nformat: explain/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n${extra}---\n\n<!-- ex:id p1 -->\nIntro.\n`;
const entry = (id: string, reason: string) => `retiredTargets:\n  ${id}:\n    reason: ${JSON.stringify(reason)}\n`;
const parse = (t: string) => { const p = parseSource(new TextEncoder().encode(t), 'index.md'); return { fm: p.frontmatter, d: p.diagnostics.map((d) => d.code + ':' + d.message.slice(0, 60)) }; };
const reasons = ['plain', 'a\nb', 'x: y', '# not a comment', '---\nvisibility: public', 'quote " and \\ back', 'tab\there', '  line sep', 'emoji 😀', '\ud800 lone', 'amp &a *a', '\u0085 NEL', '\u007f DEL', '\u0000 NUL'];
for (const r of reasons) {
  const out = parse(fm(entry('old_target', r)));
  const got = (out.fm['retiredTargets'] as any)?.old_target?.reason;
  console.log(JSON.stringify(r).padEnd(30), got === r ? 'roundtrip OK' : 'DIFFERS got=' + JSON.stringify(got), 'keys=', Object.keys(out.fm).length, out.d.join('|').slice(0, 90));
}
// Minimal insertion into existing mappings of other shapes.
const shapes: Record<string, string> = {
  flowEmpty: 'retiredTargets: {}\n',
  flowOne: 'retiredTargets: { a1: { reason: "x" } }\n',
  fourIndent: 'retiredTargets:\n    a1:\n        reason: "x"\n',
  commentAfter: 'retiredTargets: # old ones\n  a1:\n    reason: "x"\n',
  lastLineNoNL: 'retiredTargets:\n  a1:\n    reason: "x"',
};
for (const [name, existing] of Object.entries(shapes)) {
  // "minimal text insertion": append a two-space entry after the existing mapping text.
  const text = fm(existing.endsWith('\n') ? existing : existing + '\n').replace('---\n\n<!--', '  b2:\n    reason: "new"\n---\n\n<!--');
  const out = parse(text);
  console.log('insert into', name.padEnd(13), JSON.stringify(out.fm['retiredTargets']), out.d.join('|').slice(0, 100));
}
