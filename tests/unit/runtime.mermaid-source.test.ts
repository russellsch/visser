// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { bindMermaidSource, mermaidSourceSelection } from '../../packages/runtime/src/mermaid-source.ts';

const SVG = 'http://www.w3.org/2000/svg';
type Expression = { tex: string; rawSource: string; start: number; end: number };
type Record = { key: string; expressions: Expression[] };
type DrawnLabel = { key: string; formulas: Array<{ tex: string; glyph: string }> };

function fixture(source: string, labels: DrawnLabel[], doc = new JSDOM('<!doctype html><body></body>').window.document) {
  const figure = doc.createElement('figure');
  figure.setAttribute('data-vs-mermaid-math', '');
  const render = doc.createElement('div');
  render.setAttribute('data-vs-mermaid-render', '');
  const drawn = doc.createElementNS(SVG, 'svg') as SVGElement;
  render.append(drawn);
  figure.append(render);
  const pre = doc.createElement('pre');
  pre.className = 'vs-mermaid-source';
  const code = doc.createElement('code');
  const sourceNode = doc.createTextNode(source);
  code.append(sourceNode);
  pre.append(code);
  figure.append(pre);
  doc.body.append(figure);
  const formulaNodes: Element[][] = [];
  for (const label of labels) {
    const group = doc.createElementNS(SVG, 'g');
    group.setAttribute('data-vs-mermaid-label', label.key);
    drawn.append(group);
    formulaNodes.push(label.formulas.map(({ tex, glyph }) => {
      const formula = doc.createElementNS(SVG, 'foreignObject');
      formula.setAttribute('data-vs-mermaid-formula', tex);
      const content = doc.createElement('span');
      content.textContent = glyph;
      formula.append(content);
      group.append(formula);
      return formula;
    }));
  }
  const setMap = (records: Record[], mappedSource = source) => {
    figure.setAttribute('data-vs-mermaid-source-map', JSON.stringify({ source: mappedSource, labels: records }));
  };
  return { doc, figure, drawn, code, sourceNode, formulaNodes, setMap };
}

function record(source: string, key: string, formulas: Array<{ rawSource: string; tex: string }>): Record {
  let after = 0;
  return { key, expressions: formulas.map(({ rawSource, tex }) => {
    const start = source.indexOf(rawSource, after);
    if (start < 0) throw new Error('Test formula is absent from source');
    after = start + rawSource.length;
    return { tex, rawSource, start, end: after };
  }) };
}

function selectText(doc: Document, start: Text, startOffset: number, end: Text, endOffset: number): Range {
  const range = doc.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  return range;
}

function glyph(formula: Element): Text { return formula.querySelector('span')!.firstChild as Text; }

describe('Mermaid math source binding @M15', () => {
  it('copies the exact raw source with escaped backslashes from a partial glyph selection', () => {
    const raw = String.raw`$$\\frac{a}{b}$$`;
    const tex = String.raw`\frac{a}{b}`;
    const source = `pie\n "😀 ${raw}": 1`;
    const view = fixture(source, [{ key: 'section:0', formulas: [{ tex, glyph: 'a over b' }] }]);
    view.setMap([record(source, 'section:0', [{ rawSource: raw, tex }])]);
    bindMermaidSource(view.figure, view.drawn);
    const text = glyph(view.formulaNodes[0]![0]!);
    const result = mermaidSourceSelection(selectText(view.doc, text, 2, text, 5));
    expect(result.kind).toBe('source');
    if (result.kind !== 'source') return;
    expect(result.range.toString()).toBe(raw);
    expect(result.range.startContainer).toBe(view.sourceNode);
    expect(result.range.startOffset).toBe(source.indexOf(raw));
    expect(result.range.endOffset).toBe(source.indexOf(raw) + raw.length);
  });

  it('includes source text between two formulas in one label', () => {
    const first = '$$x$$', second = '$$y^2$$';
    const source = `pie\n "${first} plus ${second}": 1`;
    const view = fixture(source, [{ key: 'section:0', formulas: [
      { tex: 'x', glyph: 'x glyph' }, { tex: 'y^2', glyph: 'y squared' },
    ] }]);
    view.setMap([record(source, 'section:0', [
      { tex: 'x', rawSource: first }, { tex: 'y^2', rawSource: second },
    ])]);
    bindMermaidSource(view.figure, view.drawn);
    const result = mermaidSourceSelection(selectText(view.doc,
      glyph(view.formulaNodes[0]![0]!), 1, glyph(view.formulaNodes[0]![1]!), 3));
    expect(result.kind).toBe('source');
    if (result.kind === 'source') expect(result.range.toString()).toBe(`${first} plus ${second}`);
  });

  it('rejects selections mixing ordinary text with math or crossing labels', () => {
    const source = 'pie\n "$$x$$": 1\n "$$y$$": 2';
    const view = fixture(source, [
      { key: 'section:0', formulas: [{ tex: 'x', glyph: 'x glyph' }] },
      { key: 'section:1', formulas: [{ tex: 'y', glyph: 'y glyph' }] },
    ]);
    view.setMap([record(source, 'section:0', [{ rawSource: '$$x$$', tex: 'x' }]),
      record(source, 'section:1', [{ rawSource: '$$y$$', tex: 'y' }])]);
    bindMermaidSource(view.figure, view.drawn);
    const plain = view.doc.createElement('span');
    plain.textContent = 'plain text';
    view.formulaNodes[0]![0]!.parentElement!.prepend(plain);
    const trailing = view.doc.createElement('span');
    trailing.textContent = 'trailing text';
    view.formulaNodes[0]![0]!.parentElement!.append(trailing);
    const plainText = plain.firstChild as Text;
    const trailingText = trailing.firstChild as Text;
    const first = glyph(view.formulaNodes[0]![0]!);
    const second = glyph(view.formulaNodes[1]![0]!);
    expect(mermaidSourceSelection(selectText(view.doc, plainText, 0, first, 2)).kind).toBe('unrepresentable');
    expect(mermaidSourceSelection(selectText(view.doc, first, 1, trailingText, 4)).kind).toBe('unrepresentable');
    expect(mermaidSourceSelection(selectText(view.doc, first, 0, second, 2)).kind).toBe('unrepresentable');
  });

  it('rejects reversed source order for formulas in one drawn label', () => {
    const source = 'pie\n "$$later$$ $$earlier$$": 1';
    const view = fixture(source, [{ key: 'section:0', formulas: [
      { tex: 'earlier', glyph: 'first drawn' }, { tex: 'later', glyph: 'second drawn' },
    ] }]);
    view.setMap([{ key: 'section:0', expressions: [
      { tex: 'earlier', rawSource: '$$earlier$$', start: source.indexOf('$$earlier$$'), end: source.indexOf('$$earlier$$') + 11 },
      { tex: 'later', rawSource: '$$later$$', start: source.indexOf('$$later$$'), end: source.indexOf('$$later$$') + 9 },
    ] }]);
    expect(() => bindMermaidSource(view.figure, view.drawn)).toThrow(/Invalid Mermaid formula source binding/);
  });

  it('fails atomically for duplicate, missing, or stale label metadata', () => {
    const source = 'pie\n "$$x$$": 1\n "$$y$$": 2';
    const view = fixture(source, [
      { key: 'section:0', formulas: [{ tex: 'x', glyph: 'x glyph' }] },
      { key: 'section:1', formulas: [{ tex: 'y', glyph: 'y glyph' }] },
    ]);
    const valid = record(source, 'section:0', [{ rawSource: '$$x$$', tex: 'x' }]);
    const invalid = record(source, 'section:1', [{ rawSource: '$$y$$', tex: 'y' }]);
    invalid.expressions[0]!.end--;
    for (const records of [
      [valid, valid],
      [valid],
      [valid, invalid],
    ]) {
      view.setMap(records);
      expect(() => bindMermaidSource(view.figure, view.drawn)).toThrow();
      const text = glyph(view.formulaNodes[0]![0]!);
      expect(mermaidSourceSelection(selectText(view.doc, text, 0, text, 1)).kind).toBe('unrepresentable');
    }
    view.setMap([valid, record(source, 'section:1', [{ rawSource: '$$y$$', tex: 'y' }])], source + ' changed');
    expect(() => bindMermaidSource(view.figure, view.drawn)).toThrow(/Stale Mermaid source map/);
    view.figure.removeAttribute('data-vs-mermaid-source-map');
    expect(() => bindMermaidSource(view.figure, view.drawn)).toThrow(/Missing Mermaid math source map/);
  });

  it('rejects a drawing supplied from a different figure', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    const source = 'pie\n "$$x$$": 1';
    const first = fixture(source, [{ key: 'section:0', formulas: [{ tex: 'x', glyph: 'first' }] }], doc);
    const second = fixture(source, [{ key: 'section:0', formulas: [{ tex: 'x', glyph: 'second' }] }], doc);
    first.setMap([record(source, 'section:0', [{ rawSource: '$$x$$', tex: 'x' }])]);
    second.setMap([record(source, 'section:0', [{ rawSource: '$$x$$', tex: 'x' }])]);
    expect(() => bindMermaidSource(first.figure, second.drawn)).toThrow();
    const text = glyph(second.formulaNodes[0]![0]!);
    expect(mermaidSourceSelection(selectText(doc, text, 0, text, 1)).kind).toBe('unrepresentable');
  });

  it('rejects a selection that crosses a drawing even when both endpoints are outside it', () => {
    const source = 'pie\n "$$x$$": 1';
    const view = fixture(source, [{ key: 'section:0', formulas: [{ tex: 'x', glyph: 'glyph' }] }]);
    view.setMap([record(source, 'section:0', [{ rawSource: '$$x$$', tex: 'x' }])]);
    bindMermaidSource(view.figure, view.drawn);
    const before = view.doc.createElement('span');
    before.textContent = 'before';
    const after = view.doc.createElement('span');
    after.textContent = 'after';
    view.figure.before(before);
    view.figure.after(after);
    expect(mermaidSourceSelection(selectText(view.doc, before.firstChild as Text, 1, after.firstChild as Text, 2)).kind)
      .toBe('unrepresentable');
    expect(mermaidSourceSelection(selectText(view.doc, view.sourceNode, 0, view.sourceNode, 3)).kind)
      .toBe('unchanged');
  });

  it('invalidates a binding when its source changes or its formula moves', () => {
    const source = 'pie\n "$$x$$": 1';
    const view = fixture(source, [{ key: 'section:0', formulas: [{ tex: 'x', glyph: 'glyph' }] }]);
    view.setMap([record(source, 'section:0', [{ rawSource: '$$x$$', tex: 'x' }])]);
    bindMermaidSource(view.figure, view.drawn);
    const formula = view.formulaNodes[0]![0]!;
    const selected = () => {
      const text = glyph(formula);
      return mermaidSourceSelection(selectText(view.doc, text, 0, text, 2)).kind;
    };
    expect(selected()).toBe('source');
    view.sourceNode.data = source.replace('$$x$$', '$$z$$');
    expect(selected()).toBe('unrepresentable');
    view.sourceNode.data = source;
    const other = fixture(source, [], view.doc);
    other.drawn.append(formula);
    expect(selected()).toBe('unrepresentable');
  });
});

it.each(['flowchart', 'sequence', 'state', 'journey', 'quadrant', 'xychart', 'sankey', 'radar'])('copies encoded %s source only with an explicit supported map', format => {
  const raw = String.raw`\u0024\u0024x\u0024\u0024`;
  const source = `flowchart LR\nA@{label: "${raw}"}`;
  const view = fixture(source, [{ key: 'node:A', formulas: [{ tex: 'x', glyph: 'x' }] }]);
  const expressions = [{ tex: 'x', rawSource: raw, start: source.indexOf(raw), end: source.indexOf(raw) + raw.length, encoded: true }];
  view.figure.setAttribute('data-vs-mermaid-source-map', JSON.stringify({ source, labels: [{ key: 'node:A', expressions }] }));
  expect(() => bindMermaidSource(view.figure, view.drawn)).toThrow(/source binding/);
  view.figure.setAttribute('data-vs-mermaid-source-map', JSON.stringify({ format, source, labels: [{ key: 'node:A', expressions }] }));
  bindMermaidSource(view.figure, view.drawn);
  const text = glyph(view.formulaNodes[0]![0]!);
  const result = mermaidSourceSelection(selectText(view.doc, text, 0, text, 1));
  expect(result.kind).toBe('source');
  if (result.kind === 'source') expect(result.range.toString()).toBe(raw);
});

it.each(['flowchart', 'sequence', 'state', 'journey', 'quadrant', 'xychart', 'sankey', 'radar'])('keeps disjoint %s formulas rendered while rejecting selections through them', format => {
  const source = 'flowchart LR\nA["$$x$$ then folded formula then $$z$$"]';
  const view = fixture(source, [{ key: 'node:A', formulas: ['x', 'y', 'z'].map(tex => ({ tex, glyph: tex })) }]);
  const ends = record(source, 'node:A', [{ tex: 'x', rawSource: '$$x$$' }, { tex: 'z', rawSource: '$$z$$' }]).expressions;
  const map = { format, source, labels: [{ key: 'node:A', expressions: [ends[0], { tex: 'y', unrepresentable: true }, ends[1]] }] };
  view.figure.setAttribute('data-vs-mermaid-source-map', JSON.stringify(map));
  bindMermaidSource(view.figure, view.drawn);
  const [x, y, z] = view.formulaNodes[0]!.map(glyph) as [Text, Text, Text];
  expect(mermaidSourceSelection(selectText(view.doc, x, 0, x, 1)).kind).toBe('source');
  expect(mermaidSourceSelection(selectText(view.doc, y, 0, y, 1)).kind).toBe('unrepresentable');
  expect(mermaidSourceSelection(selectText(view.doc, x, 0, z, 1)).kind).toBe('unrepresentable');
  map.labels[0]!.expressions[1] = { tex: 'wrong', unrepresentable: true };
  view.figure.setAttribute('data-vs-mermaid-source-map', JSON.stringify(map));
  expect(() => bindMermaidSource(view.figure, view.drawn)).toThrow(/identity/);
  expect(mermaidSourceSelection(selectText(view.doc, x, 0, x, 1)).kind).toBe('unrepresentable');
});

it.each(['xychart','radar'])('rejects %s visibility drift in both directions, including an expected empty map',format=>{
 const source='xychart\ntitle "$$x$$"',start=source.indexOf('$$'),expression={tex:'x',rawSource:'$$x$$',start,end:start+5};
 const unexpected=fixture(source,[{key:'title',formulas:[{tex:'x',glyph:'x'}]}]);
 unexpected.figure.setAttribute('data-vs-mermaid-source-map',JSON.stringify({format,source,labels:[]}));
 expect(()=>bindMermaidSource(unexpected.figure,unexpected.drawn)).toThrow(/Unmapped Mermaid formula/);
 const missing=fixture(source,[]);
 missing.figure.setAttribute('data-vs-mermaid-source-map',JSON.stringify({format,source,labels:[{key:'title',expressions:[expression]}]}));
 expect(()=>bindMermaidSource(missing.figure,missing.drawn)).toThrow(/Missing Mermaid label/);
 missing.figure.setAttribute('data-vs-mermaid-source-map',JSON.stringify({format,source,labels:[]}));
 expect(()=>bindMermaidSource(missing.figure,missing.drawn)).not.toThrow();
});
