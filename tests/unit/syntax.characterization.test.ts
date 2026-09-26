// Markdoc 0.5.10 characterization (spikes/markdoc-spans/) as assertions.
// "Markdoc:" tests pin current library behavior, so an upgrade that changes it fails loudly.
// "Adapter:" tests pin the Explain rules built on top (ARCHITECTURE.md §6.3–6.5, §2.3).
import Markdoc from '@markdoc/markdoc';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';

const enc = new TextEncoder();
const FM = '---\nformat: explain/1\ntitle: T\n---\n\n';
const parse = (body: string) => parseSource(enc.encode(FM + body), 'index.md');
const codes = (body: string) => parse(body).diagnostics.map((d) => d.code);
const ids = (body: string) => parse(body).targets.map((t) => t.id);

type N = { type: string; tag?: string; inline?: boolean; lines: number[]; attributes: Record<string, unknown>; children: N[] };
const md = (src: string, opts: Record<string, unknown> = {}) => {
  const tokens = new Markdoc.Tokenizer({ allowComments: true, ...opts } as never).tokenize(src);
  return { tokens, ast: Markdoc.parse(tokens) as unknown as N };
};
const walk = (n: N, f: (n: N) => void) => { f(n); for (const c of n.children ?? []) walk(c, f); };
const tags = (n: N) => { const out: N[] = []; walk(n, (x) => { if (x.type === 'tag') out.push(x); }); return out; };

describe('Markdoc 0.5.10 behavior the adapter depends on', () => {
  it('Markdoc: parses tags inside fences by default', () => {
    const { ast } = md('```markdown\n{% graph id="g" %}\n{% /graph %}\n```\n');
    expect(tags(ast).map((t) => t.tag)).toEqual(['graph']);
  });

  it('Markdoc: substitutes a variable inside a fence by default', () => {
    const { ast } = md('```text\nprice {% $x %}\n```\n');
    const html = Markdoc.renderers.html(Markdoc.transform(ast as never, { variables: { x: 'INJECTED' } }));
    expect(html).toContain('INJECTED');
  });

  it('Markdoc: disables setext headings', () => {
    const { ast } = md('Title\n=====\n');
    expect(ast.children[0]!.type).toBe('paragraph');
    const dashes = md('Title\n---\n').ast.children.map((c) => c.type);
    expect(dashes).toEqual(['paragraph', 'hr']);
  });

  it('Markdoc: drops text after --> on a block comment line', () => {
    const { ast } = md('<!-- c --> trailing words\nPara.\n');
    const texts: string[] = [];
    walk(ast, (n) => { if (n.type === 'text') texts.push(String(n.attributes['content'])); });
    expect(texts.join(' ')).not.toContain('trailing');
  });

  it('Markdoc: accepts a multi-line tag opening', () => {
    const { ast } = md('{% graph id="g"\n   title="T" %}\nBody.\n{% /graph %}\n');
    expect(tags(ast)[0]?.tag).toBe('graph');
  });

  it('Markdoc: emits html tokens only with html:true, and none from fences or inline code', () => {
    const src = '<div>b</div>\n\nText <span>i</span>.\n\n```html\n<div>code</div>\n```\n\nInline `<span>c</span>`.\n';
    const flat = (ts: Array<{ type: string; children: unknown[] | null; content: string }>): Array<{ type: string; content: string }> =>
      ts.flatMap((t) => [t, ...flat((t.children ?? []) as never)]);
    expect(flat(md(src).tokens as never).some((t) => t.type.startsWith('html_'))).toBe(false);
    const html = flat(md(src, { html: true }).tokens as never).filter((t) => t.type.startsWith('html_')).map((t) => t.content.trim());
    expect(html).toEqual(['<div>b</div>', '<span>', '</span>']);
  });

  it('Markdoc: keeps markers as comment tokens with html:true', () => {
    const { ast } = md('<!-- ex:id x -->\nPara.\n', { html: true });
    expect(ast.children[0]!.type).toBe('comment');
  });

  it('Markdoc: represents variables and functions as distinct classes', () => {
    const { ast } = md('{% t v=$x fn=upper("a") %}\n{% /t %}\n');
    const a = tags(ast)[0]!.attributes;
    expect(a['v']).toBeInstanceOf(Markdoc.Ast.Variable);
    expect(a['fn']).toBeInstanceOf(Markdoc.Ast.Function);
  });

  it('Markdoc: parses GFM tables and leaves tag syntax in inline code inert', () => {
    expect(md('| a | b |\n|---|---|\n| 1 | 2 |\n').ast.children[0]!.type).toBe('table');
    expect(tags(md('Use `{% graph id="g" %}` inline.\n').ast)).toEqual([]);
  });
});

describe('Adapter rules on top of Markdoc @R11', () => {
  it('Adapter: treats fences as raw leaves', () => {
    const body = '<!-- ex:id ex -->\n```markdown\n<!-- ex:id inside -->\n{% graph id="g" %}\n{% /graph %}\n```\n';
    const p = parse(body);
    expect(p.diagnostics).toEqual([]);
    expect(p.targets.map((t) => t.id)).toEqual(['ex']);
  });

  it('Adapter: accepts an unclosed tag inside a fence', () => {
    expect(codes('<!-- ex:id ex -->\n```markdown\n{% graph id="g" %}\nno close\n```\n')).toEqual([]);
  });

  it('Adapter: keeps a fenced variable literal and does not reject it', () => {
    const p = parse('<!-- ex:id ex -->\n```text\nprice {% $x %}\n```\n');
    expect(p.diagnostics).toEqual([]);
    const fence = (p.ast as N).children.find((c) => c.type === 'fence')!;
    expect(fence.attributes['content']).toBe('price {% $x %}\n');
  });

  it('Adapter: rejects setext underlines', () => {
    expect(codes('<!-- ex:id h -->\nTitle\n=====\n')).toContain('E_SYNTAX');
    expect(codes('<!-- ex:id h -->\nTitle\n---\n')).toContain('E_SYNTAX');
  });

  it('Adapter: rejects trailing text after a marker and multi-line markers', () => {
    expect(codes('<!-- ex:id p --> trailing\nPara.\n')).toContain('E_SYNTAX');
    expect(codes('<!--\nex:id p\n-->\nPara.\n')).toContain('E_SYNTAX');
    expect(codes('<!-- ex:id p\nPara.\n')).toContain('E_SYNTAX');
  });

  it('Adapter: rejects a multi-line tag opening', () => {
    expect(codes('{% detail id="d"\n   label="L" %}\nBody.\n{% /detail %}\n')).toContain('E_SYNTAX');
  });

  it('Adapter: rejects prose HTML and accepts it in fences and inline code', () => {
    expect(codes('<div>b</div>\n')).toEqual(['E_UNSAFE_CONTENT']);
    expect(codes('<!-- ex:id p -->\nText <img src=x onerror=alert(1)> here.\n')).toEqual(['E_UNSAFE_CONTENT']);
    expect(codes('<!-- ex:id p -->\nInline `<span>x</span>` code.\n')).toEqual([]);
    expect(codes('<!-- ex:id c -->\n```html\n<div>x</div>\n```\n')).toEqual([]);
  });

  it('Adapter: allows an inline ordinary comment and rejects an inline marker', () => {
    expect(codes('<!-- ex:id p -->\nSome <!-- note --> text.\n')).toEqual([]);
    expect(codes('<!-- ex:id p -->\nSome <!-- ex:id q --> text.\n')).toContain('E_SYNTAX');
  });

  it('Adapter: rejects variables, functions, if, and partial', () => {
    expect(codes('<!-- ex:id p -->\nPrice {% $x %}.\n')).toContain('E_UNSAFE_CONTENT');
    expect(codes('{% detail id="d" label=upper("a") %}\nB.\n{% /detail %}\n')).toContain('E_UNSAFE_CONTENT');
    expect(codes('{% if $x %}\nA\n{% /if %}\n')).toContain('E_UNSAFE_CONTENT');
    expect(codes('{% partial file="x.md" /%}\n')).toContain('E_UNSAFE_CONTENT');
  });

  it('Adapter: enforces literal limits with E_LIMIT', () => {
    const deep = `${'['.repeat(9)}1${']'.repeat(9)}`;
    expect(codes(`{% detail id="d" label="L" x=${deep} %}\nB.\n{% /detail %}\n`)).toContain('E_LIMIT');
    const eight = `${'['.repeat(8)}1${']'.repeat(8)}`;
    expect(codes(`{% detail id="d" label="L" x=${eight} %}\nB.\n{% /detail %}\n`)).toEqual([]);
    const long = `[${Array.from({ length: 1025 }, (_, i) => i).join(',')}]`;
    expect(codes(`{% detail id="d" label="L" x=${long} %}\nB.\n{% /detail %}\n`)).toContain('E_LIMIT');
    expect(codes(`{% detail id="d" label="${'a'.repeat(16 * 1024 + 1)}" %}\nB.\n{% /detail %}\n`)).toContain('E_LIMIT');
  });

  it('Adapter: enforces source-size and line-length limits', () => {
    const huge = new Uint8Array(10 * 1024 * 1024 + 1).fill(0x61);
    expect(parseSource(huge, 'index.md').diagnostics.map((d) => d.code)).toEqual(['E_LIMIT']);
    expect(codes(`<!-- ex:id p -->\n${'a'.repeat(64 * 1024 + 1)}\n`)).toEqual(['E_LIMIT']);
  });

  it('Adapter: rejects invalid UTF-8', () => {
    const bad = new Uint8Array([...enc.encode(FM), 0xff, 0x0a]);
    expect(parseSource(bad, 'index.md').diagnostics.map((d) => d.code)).toEqual(['E_SYNTAX']);
  });

  it('Adapter: binds a marker across a blank line and to each addressable block kind', () => {
    expect(ids('<!-- ex:id gap -->\n\nPara.\n')).toEqual(['gap']);
    const kinds = parse('<!-- ex:id l -->\n- a\n\n<!-- ex:id t -->\n| a |\n|---|\n| 1 |\n\n<!-- ex:id q -->\n> x\n\n<!-- ex:id h -->\n# H\n\n<!-- ex:id c -->\n```\nx\n```\n\n<!-- ex:id f -->\n![a](a.png)\n').targets.map((t) => t.kind);
    expect(kinds).toEqual(['list', 'table', 'blockquote', 'heading', 'code', 'figure']);
  });

  it('Adapter: treats hr as not addressable', () => {
    expect(codes('<!-- ex:id p -->\nPara.\n\n---\n')).toEqual([]);
    expect(codes('<!-- ex:id r -->\n---\n')).toContain('E_SYNTAX');
  });

  it('Adapter: gives two identical paragraphs independent IDs @T04', () => {
    const p = parse('<!-- ex:id a -->\nSame text.\n\n<!-- ex:id b -->\nSame text.\n');
    expect(p.diagnostics).toEqual([]);
    expect(p.targets.map((t) => t.id)).toEqual(['a', 'b']);
    expect(p.targets[0]!.startByte).not.toBe(p.targets[1]!.startByte);
  });

  it('Adapter: rejects duplicate IDs without renaming @T05', () => {
    const p = parse('<!-- ex:id same -->\nOne.\n\n<!-- ex:id same -->\nTwo.\n');
    expect(p.diagnostics.map((d) => d.code)).toEqual(['E_ID_DUPLICATE']);
    expect(p.targets.filter((t) => t.id === 'same')).toHaveLength(2);
  });

  it('Adapter: rejects an invalid tag ID', () => {
    expect(codes('{% detail id="Bad" label="L" %}\nB.\n{% /detail %}\n')).toContain('E_SYNTAX');
  });

  it('Adapter: rejects inline tags used as blocks', () => {
    expect(codes('{% cite ref="s" /%}\n')).toContain('E_SYNTAX');
  });
});
