// unifiedDiff splits distant changes into separate hunks with 3 lines of
// context (dogfood-2 Q9: a one-paragraph retire printed 225 lines, because the
// frontmatter change and the removed span were one hunk).
import { describe, expect, it } from 'vitest';
import { unifiedDiff } from '../../packages/core/src/references/guarded-write.ts';

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);

describe('unifiedDiff hunks', () => {
  it('two distant changes give two small hunks, not one hunk over the whole file', () => {
    const a = lines(200);
    const b = [...a];
    b[1] = 'line 2 changed';
    b.splice(149, 2); // remove lines 150 and 151
    const diff = unifiedDiff(a.join('\n'), b.join('\n'), 'index.md');
    const hunks = diff.split('\n').filter((l) => l.startsWith('@@'));
    expect(hunks).toEqual(['@@ -1,5 +1,5 @@', '@@ -147,8 +147,6 @@']);
    expect(diff.split('\n').length).toBeLessThan(30);
  });

  it('changes closer than twice the context share one hunk', () => {
    const a = lines(40);
    const b = [...a];
    b[9] = 'x';
    b[14] = 'y';
    const hunks = unifiedDiff(a.join('\n'), b.join('\n'), 'f').split('\n').filter((l) => l.startsWith('@@'));
    expect(hunks).toEqual(['@@ -7,12 +7,12 @@']);
  });

  it('applies: the hunks rebuild the new text from the old text', () => {
    const a = lines(120);
    const b = [...a];
    b.splice(4, 1, 'new A', 'new B');
    b.splice(90, 3);
    b.push('tail');
    const diff = unifiedDiff(a.join('\n'), b.join('\n'), 'f');
    // Apply the diff.
    const out: string[] = [];
    let cursor = 0;
    const body = diff.split('\n').slice(2);
    for (let k = 0; k < body.length; k++) {
      const m = /^@@ -(\d+),(\d+) \+\d+,\d+ @@$/.exec(body[k]!);
      if (!m) continue;
      const start = Number(m[1]) - 1;
      while (cursor < start) out.push(a[cursor++]!);
      for (k++; k < body.length && !body[k]!.startsWith('@@'); k++) {
        const line = body[k]!;
        if (line === '' && k === body.length - 1) break;
        if (line[0] === ' ') { out.push(line.slice(1)); cursor++; }
        else if (line[0] === '-') cursor++;
        else if (line[0] === '+') out.push(line.slice(1));
      }
      k--;
    }
    while (cursor < a.length) out.push(a[cursor++]!);
    expect(out).toEqual(b);
  });
});
