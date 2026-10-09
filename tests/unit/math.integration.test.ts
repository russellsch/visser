import Markdoc from '@markdoc/markdoc';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/parse.ts';
import { parseMathTextRuns } from '../../packages/core/src/syntax/math-tokenizer.ts';
import { buildTargetRecords } from '../../packages/core/src/model/targets.ts';
import { validateDocument } from '../../packages/core/src/model/validate.ts';
import { projectText } from '../../packages/core/src/model/project.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { replaceTarget, showReference } from '../../packages/core/src/references/index.ts';

const fm = '---\nformat: visser/1\ntitle: T\n---\n\n';
const validFm = '---\nformat: visser/1\ndocId: 8b28cbf8-c31e-4c67-b1e8-f590c38f2f01\ntitle: Math\nkind: teaching\ncapturedAt: 2026-10-05T00:00:00Z\nvisibility: private\n---\n\n';
const parse = (body: string) => parseSource(new TextEncoder().encode(fm + body), 'index.md');
const checked = (body: string) => {
  const source = parse(body);
  const model = buildTargetRecords(source);
  return { source, model, diagnostics: [...source.diagnostics, ...model.diagnostics, ...validateDocument(source, model)] };
};
const texts = (source: ReturnType<typeof parse>) => source.math?.map(m => m.tex) ?? [];
function nodes(root: any, type: string): any[] {
  const result: any[] = [];
  const visit = (node: any) => {
    if (node.type === type) result.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return result;
}

describe('source-owned math model and projection', () => {
  const temporary: string[] = [];
  afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
  it('numbers forward-referenced equations by source position while IDs remain stable @M05 @M06 @M13', () => {
    const body = '<!-- vs:id p -->\nSee {% eqref ref="late" /%} and $x$.\n\n{% equation id="early" %}\na=b\n{% /equation %}\n\n{% equation id="late" %}\nc=d\n{% /equation %}\n';
    const { source, model, diagnostics } = checked(body);
    expect(diagnostics).toEqual([]);
    expect([...model.equations.values()].map(e => [e.id, e.ordinal])).toEqual([['early', 1], ['late', 2]]);
    expect(model.targets.get('p')?.dependencies).toContain('late');
    expect(model.targets.get('p')?.plainText).toBe('See and $x$.');
    expect(source.math?.map(m => [m.kind, m.targetId, m.enclosingTargetId])).toEqual([
      ['inline', undefined, 'p'], ['equation', 'early', undefined], ['equation', 'late', undefined],
    ]);
    const projection = projectText(source);
    expect(projection).toContain('[Equation (2)](#x-late)');
    expect(projection).toContain('<!-- vs:target early -->\nEquation (1)');
    expect(projection).toContain('<!-- vs:target late -->\nEquation (2)');
    const reordered = checked('{% equation id="late" %}\nc=d\n{% /equation %}\n\n{% equation id="early" %}\na=b\n{% /equation %}\n');
    expect([...reordered.model.equations.values()].map(e => [e.id, e.ordinal])).toEqual([['late', 1], ['early', 2]]);
  });

  it('keeps nested equation ownership and excludes ordinary list/quote nesting', () => {
    const detail = checked('{% detail id="d" label="D" %}\n{% equation id="e" %}\nx\\\\y\n{% /equation%}\n{% /detail %}\n');
    expect(detail.diagnostics).toEqual([]);
    expect(detail.model.targets.get('e')?.parentId).toBe('d');
    expect(detail.source.math?.[0]?.enclosingTargetId).toBe('d');
    expect(projectText(detail.source)).toContain('<!-- vs:target e -->\nEquation (1)');
    for (const body of [
      '<!-- vs:id l -->\n- {% equation id="e" %}\n  x\n  {% /equation %}\n',
      '<!-- vs:id q -->\n> {% equation id="e" %}\n> x\n> {% /equation %}\n',
    ]) expect(checked(body).diagnostics.map(d => d.code)).toContain('E_SYNTAX');
  });

  it('checks eqref kind and rejected TeX commands without evaluating code', () => {
    const wrong = checked('<!-- vs:id p -->\nSee {% eqref ref="d" /%}.\n\n<!-- vs:id d -->\n$$\nx\n$$\n');
    expect(wrong.diagnostics.some(d => d.code === 'E_REF_BROKEN' && d.message.includes('equation'))).toBe(true);
    const missing = checked('<!-- vs:id p -->\nSee {% eqref ref="absent" /%}.\n');
    expect(missing.diagnostics.map(d => d.code)).toContain('E_REF_BROKEN');
    const labels = checked('{% equation id="e" %}\n\\label{hidden}\n{% /equation %}\n');
    expect(labels.diagnostics.map(d => d.code)).toContain('E_SYNTAX');
    const nonself = checked('<!-- vs:id p -->\nSee {% eqref ref="e" %}{% /eqref %}.\n');
    expect(nonself.diagnostics.some(d => d.message.includes('self-closing'))).toBe(true);
    const code = checked('<!-- vs:id c -->\n```latex\n$x$ \\label{code}\n```\n');
    expect(code.diagnostics).toEqual([]);
    expect(texts(code.source)).toEqual([]);
  });

  it('retains decoded attribute math with honest containing spans and lossless runs', () => {
    const body = '{% note id="n" kind="limit" %}\nText.\n{% /note %}\n\n{% definition id="d" term="ratio $\\\\frac{a}{b}$" %}\nA ratio.\n{% /definition %}\n';
    const { source, diagnostics } = checked(body);
    expect(diagnostics).toEqual([]);
    const expression = source.math?.find(m => m.field === 'term');
    expect(expression).toMatchObject({ kind: 'inline', tex: '\\frac{a}{b}', enclosingTargetId: 'd', spanPrecision: 'containing-attribute' });
    const bytes = new TextEncoder().encode(fm + body);
    const raw = new TextDecoder().decode(bytes.subarray(expression!.span.startByte, expression!.span.endByte));
    expect(raw).toContain('term="ratio $\\\\frac{a}{b}$"');
    expect(parseMathTextRuns('before $x$ after \\$literal$')).toEqual([
      { kind: 'text', text: 'before ', startChar: 0, endChar: 7 },
      { kind: 'math', tex: 'x', startChar: 7, endChar: 10 },
      { kind: 'text', text: ' after \\$literal$', startChar: 10, endChar: 27 },
    ]);
  });

  it('records decoded title math in the frontmatter container', () => {
    const source = parseSource(new TextEncoder().encode('---\nformat: visser/1\ntitle: "Energy $E=mc^2$"\n---\n\n<!-- vs:id p -->\nText.\n'), 'index.md');
    expect(source.diagnostics).toEqual([]);
    expect(source.math).toEqual([expect.objectContaining({ kind: 'inline', tex: 'E=mc^2', field: 'frontmatter.title', spanPrecision: 'containing-attribute' })]);
  });

  it('records displayed string arrays, units, owners and extension facts', () => {
    const body = '{% graph id="g" title="Plan" mode="plan" %}\n{% task id="t" label="Task" owner="$o$" /%}\n{% /graph %}\n\n'
      + '{% transform id="tr" title="Transform" %}\n{% stage id="s" label="Stage" representation="raw" shape=["$n$", "fixed"] units="$u$" /%}\n{% /transform %}\n\n'
      + '{% domain id="d" title="Domain" %}\n{% concept id="c" label="Concept" definition="def" attributes=["$a$", "other"] /%}\n{% /domain %}\n\n'
      + '{% trace id="trace" title="Trace" timeUnit="$ms$" /%}\n\n'
      + '{% measure id="measure" title="Measure" unit="$kg$" /%}\n\n'
      + '{% extension id="ext" title="Extension" use="viz" %}\n{% part id="part" label="Part" custom="$z$" fluid="$f$" assetPath="$p$" /%}\n{% /extension %}\n\n'
      + '<!-- vs:id p -->\nSee {% cite ref="src" note="$q$" /%}.\n';
    const source = parse(body);
    expect(source.diagnostics).toEqual([]);
    expect(source.math?.map((m) => [m.field, m.tex, m.enclosingTargetId])).toEqual([
      ['owner', 'o', 't'], ['shape[0]', 'n', 's'], ['units', 'u', 's'],
      ['attributes[0]', 'a', 'c'], ['timeUnit', 'ms', 'trace'], ['unit', 'kg', 'measure'],
      ['custom', 'z', 'part'], ['fluid', 'f', 'part'],
    ]);
    for (const expression of source.math ?? []) {
      expect(expression.spanPrecision).toBe('containing-attribute');
      const raw = new TextDecoder().decode(source.rawBytes.subarray(expression.span.startByte, expression.span.endByte));
      expect(raw).toContain(`${expression.field?.split('[')[0]}=`);
    }
  });

  it('leaves unused detail summary and citation note literal while collecting used text and part facts', () => {
    const body = '{% detail id="d" label="Detail $L$" summary="unused $\\\\bad$" %}\nBody $b$.\n{% /detail %}\n\n'
      + '{% source id="s" title="Source $T$" kind="web" url="https://example.com" availability="link-only" /%}\n\n'
      + '{% extension id="e" title="Extension" use="viz" %}\n{% part id="p" label="Part" note="$n$" summary="$z$" /%}\n{% /extension %}\n\n'
      + '<!-- vs:id prose -->\nSee {% cite ref="s" note="unused $\\\\bad$" /%}.\n';
    const source = parse(body);
    expect(source.diagnostics).toEqual([]);
    expect(source.math?.map(m => [m.field, m.tex])).toEqual([
      ['label', 'L'], [undefined, 'b'], ['title', 'T'], ['note', 'n'], ['summary', 'z'],
    ]);
    const tag = nodes(source.ast, 'tag').find(n => n.tag === 'detail');
    const cite = nodes(source.ast, 'tag').find(n => n.tag === 'cite');
    expect(tag?.attributes.summary).toBe('unused $\\bad$');
    expect(cite?.attributes.note).toBe('unused $\\bad$');
  });

  it('projects table math as literal text recoverable by pinned ordinary Markdown', () => {
    const body = '<!-- vs:id t -->\n| Formula | Value |\n|---|---|\n| $\\left|a & b\\right|$ and $a\\|b$ | yes |\n';
    const { source, diagnostics } = checked(body);
    expect(diagnostics).toEqual([]);
    const projection = projectText(source);
    expect(projection).toContain('&amp;');
    expect(projection).toContain('&#124;');
    const projectedAst = Markdoc.parse(new Markdoc.Tokenizer({ allowComments: true, html: true }).tokenize(projection));
    const row = nodes(projectedAst, 'tr').at(-1)!;
    expect(row.children).toHaveLength(2);
    const recovered = nodes(row, 'text').map(n => n.attributes.content).join('');
    expect(recovered).toContain('$\\left|a & b\\right|$');
    expect(recovered).toContain('$a\\|b$');
  });

  it('guarded replacement retains a nested equation ID @M05 @M09', () => {
    const repo = mkdtempSync(join(tmpdir(), 'visser-math-retain-'));
    temporary.push(repo);
    mkdirSync(join(repo, '.git'));
    const directory = join(repo, 'docs', 'explanations', 'math');
    mkdirSync(directory, { recursive: true });
    const path = join(directory, 'index.md');
    const original = '{% detail id="d" label="D" %}\n{% equation id="e" %}\nx=1\n{% /equation %}\n{% /detail %}\n';
    writeFileSync(path, validFm + original);
    const before = loadBundle(path);
    expect(before.diagnostics).toEqual([]);
    const { packet } = showReference(path, 'd', { repoRoot: repo });
    expect(() => replaceTarget(packet, new TextEncoder().encode('{% detail id="d" label="D" %}\nText.\n{% /detail %}\n'), before.sourceRevision!, { repoRoot: repo }))
      .toThrow(/drops nested target e/);
    const edited = original.replace('x=1', 'x=2');
    replaceTarget(packet, new TextEncoder().encode(edited), before.sourceRevision!, { repoRoot: repo });
    expect(readFileSync(path, 'utf8')).toContain('x=2');
    expect(loadBundle(path).model.equations.get('e')?.ordinal).toBe(1);
  });
});
