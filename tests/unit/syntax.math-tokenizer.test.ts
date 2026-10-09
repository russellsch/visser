import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Markdoc from '@markdoc/markdoc';
import { describe, expect, it } from 'vitest';
import { tokenizeMath } from '../../packages/core/src/syntax/math-tokenizer.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();
const walk = (node: any, visit: (node: any) => void): void => {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
};
const nodes = (root: any, type: string): any[] => {
  const found: any[] = [];
  walk(root, node => { if (node.type === type) found.push(node); });
  return found;
};
const ast = (source: Uint8Array | string): any => Markdoc.parse(tokenizeMath(source).tokens);
const sourceSlices = (bytes: Uint8Array, result: ReturnType<typeof tokenizeMath>): string[] =>
  result.occurrences.map(span => dec.decode(bytes.subarray(span.startByte, span.endByte)));
function fixturePaths(base: string): string[] {
  return readdirSync(base, { withFileTypes: true }).flatMap(entry => {
    const path = join(base, entry.name);
    return entry.isDirectory() ? fixturePaths(path) : entry.name.endsWith('.md') ? [path] : [];
  }).sort();
}
function shape(node: any): unknown {
  return {
    type: node.type, tag: node.tag, inline: node.inline,
    attributes: node.attributes, lines: node.lines,
    errors: node.errors?.map((e: any) => ({ id: e.id, message: e.message })) ?? [],
    children: node.type === 'fence' ? [] : (node.children ?? []).map(shape),
  };
}

describe('standalone math tokenizer', () => {
  it('keeps image alt math literal without corrupting surrounding and linked formula spans @M02 @M08', () => {
    const bytes = enc.encode('Before $b$ ![Image $a$](image.png) [link $c$](https://example.invalid) after $d$.');
    const result = tokenizeMath(bytes);
    expect(result.diagnostics).toEqual([]);
    expect(sourceSlices(bytes, result)).toEqual(['$b$', '$c$', '$d$']);
    const images = nodes(Markdoc.parse(result.tokens), 'image');
    expect(images).toHaveLength(1);
    expect(images[0].attributes.alt).toBe('Image $a$');
  });

  it('preserves the existing Markdoc AST across positive and negative fixture corpora', () => {
    const paths = [...fixturePaths('fixtures/positive'), ...fixturePaths('fixtures/negative')];
    expect(paths.length).toBe(158);
    for (const path of paths) {
      const source = readFileSync(path, 'utf8');
      const baseline = new Markdoc.Tokenizer({ allowComments: true, html: true }).tokenize(source);
      // The existing Visser adapter ignores Markdoc's parsed fence children.
      for (const token of baseline) if (token.type === 'fence') token.children = null;
      const actual = tokenizeMath(source);
      expect(actual.diagnostics, path).toEqual([]);
      expect(shape(Markdoc.parse(actual.tokens)), path).toEqual(shape(Markdoc.parse(baseline)));
    }
  });

  it('returns exact original-byte spans through BOM, Unicode and CRLF @M09', () => {
    const body = '😀 $α+β$ and $α+β$\r\n> $x^2$\r\n';
    const bytes = enc.encode(`\ufeff${body}`);
    const result = tokenizeMath(bytes);
    expect(result.diagnostics).toEqual([]);
    expect(result.source?.bomLength).toBe(3);
    expect(result.occurrences.map(o => o.kind)).toEqual(['inline', 'inline', 'inline']);
    expect(sourceSlices(bytes, result)).toEqual(['$α+β$', '$α+β$', '$x^2$']);
    expect(result.occurrences[0]?.startByte).toBe(enc.encode('\ufeff😀 ').length);
  });

  it('maps nested lists, quotes and math-aware table cells without guessing repeated positions', () => {
    const source = [
      '> first $x$ and $x$',
      '> second $y$',
      '',
      '- first $x$',
      '  continued $y$',
      '',
      '| A | B |',
      '|---|---|',
      '| $a\\|b$ then $a\\|b$ | right |',
      '| $\\left|a & b\\right|$ | right |',
      '',
    ].join('\r\n');
    const bytes = enc.encode(source);
    const result = tokenizeMath(bytes);
    expect(result.diagnostics).toEqual([]);
    expect(sourceSlices(bytes, result)).toEqual([
      '$x$', '$x$', '$y$', '$x$', '$y$', '$a\\|b$', '$a\\|b$', '$\\left|a & b\\right|$',
    ]);
    const tree = Markdoc.parse(result.tokens);
    expect(nodes(tree, 'td')).toHaveLength(4);
    expect(nodes(tree, 'math_inline')).toHaveLength(8);
  });

  it('maps quoted tables and bare-CR lines to exact bytes', () => {
    const source = '> | A | B |\r> |---|---|\r> | `$hidden$` $x$ | right |\r';
    const bytes = enc.encode(source);
    const result = tokenizeMath(bytes);
    expect(result.diagnostics).toEqual([]);
    expect(sourceSlices(bytes, result)).toEqual(['$x$']);
    expect(nodes(Markdoc.parse(result.tokens), 'td')).toHaveLength(2);
  });

  it('accepts standalone Markdoc equation whitespace and strips quote/list container prefixes from raw TeX', () => {
    const variants = [
      '{%equation id="e"%}\nx\\\\y\n{% /equation%}\n',
      '{%  equation id="e"  %}\nx\\\\y\n{% /equation   %}\n',
      '{% equation\tid="e" %}\nx\\\\y\n{% /equation %}\n',
    ];
    for (const source of variants) {
      const result = tokenizeMath(source);
      expect(result.diagnostics, source).toEqual([]);
      expect(result.occurrences.map(o => [o.kind, o.tex]), source).toEqual([['equation', 'x\\\\y\n']]);
    }
    const quoted = tokenizeMath('> $$\n> x\n> $$\n');
    expect(quoted.diagnostics).toEqual([]);
    expect(quoted.occurrences.map(o => o.tex)).toEqual(['x\n']);
    const listed = tokenizeMath('- $$\n  x\n  $$\n');
    expect(listed.diagnostics).toEqual([]);
    expect(listed.occurrences.map(o => o.tex)).toEqual(['x\n']);
  });

  it('leaves code, fences and raw equation/display bodies intact @M08', () => {
    const source = [
      'Inline `$code$` and $live$.',
      '',
      '```text',
      '$fenced$ {% $variable %}',
      '```',
      '',
      '{% equation id="e" %}',
      '\\begin{matrix}a & b \\\\ c & d\\end{matrix}',
      '$not_inline$ {% $variable %}',
      '{% /equation %}',
      '',
      '$$',
      '\\frac{a}{b} = c',
      '$$',
      '',
    ].join('\n');
    const bytes = enc.encode(source);
    const result = tokenizeMath(bytes);
    expect(result.diagnostics).toEqual([]);
    expect(result.occurrences.map(o => o.kind)).toEqual(['inline', 'equation', 'display']);
    expect(sourceSlices(bytes, result)).toEqual([
      '$live$',
      '{% equation id="e" %}\n\\begin{matrix}a & b \\\\ c & d\\end{matrix}\n$not_inline$ {% $variable %}\n{% /equation %}',
      '$$\n\\frac{a}{b} = c\n$$',
    ]);
    const tree = Markdoc.parse(result.tokens);
    expect(nodes(tree, 'math_inline')).toHaveLength(1);
    expect(nodes(tree, 'fence')).toHaveLength(1);
    expect(nodes(tree, 'math_display')).toHaveLength(1);
    const equation = nodes(tree, 'tag').find(node => node.tag === 'equation');
    expect(equation?.children[0]?.attributes.content).toContain('$not_inline$');
  });

  it('preserves quoted Markdoc attributes and reports malformed source instead of inventing spans', () => {
    const quoted = '{% node id="ratio" role="service" label="$\\\\frac{a}{b}$" /%}\n';
    const tag = nodes(ast(quoted), 'tag')[0];
    expect(tag?.attributes.label).toBe('$\\frac{a}{b}$');
    const invalid = tokenizeMath(Uint8Array.of(0xff, 0x24, 0x78, 0x24));
    expect(invalid.occurrences).toEqual([]);
    expect(invalid.diagnostics.map(d => d.code)).toEqual(['E_SYNTAX']);
    const open = tokenizeMath('$$\nx\n');
    expect(open.occurrences).toEqual([]);
    expect(open.diagnostics.map(d => d.code)).toContain('E_SYNTAX');
  });
});
