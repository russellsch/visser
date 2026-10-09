import { describe, expect, it } from 'vitest';
import { extractFlowchartLabels } from '../../packages/core/src/mermaid/flowchart-labels.ts';

describe('pinned flowchart grammar label collector', () => {
  it('collects quoted and markdown node labels, bare IDs, edge text and subgraph titles in source order', async () => {
    const source = [
      'flowchart LR',
      'A["quoted"] -->|edge| B',
      'M["`markdown $$x$$`"]',
      'subgraph g["Group"]',
      'C',
      'end',
      '',
    ].join('\n');
    const found = await extractFlowchartLabels(source);
    expect(found.records.map(record => [record.role, record.semanticValue, record.ownerId])).toEqual([
      ['node.explicit', 'quoted', 'A'],
      ['edge', 'edge', undefined],
      ['node.bare', 'B', 'B'],
      ['node.explicit', 'markdown $$x$$', 'M'],
      ['subgraph', 'Group', 'g'],
      ['node.bare', 'C', 'C'],
    ]);
    expect(found.records[3]).toMatchObject({ labelType: 'markdown', active: true });
    expect(found.records[4]).toMatchObject({ labelType: 'string', active: true });
    for (const record of found.records) {
      expect(record.provenance.synthetic).toBe(false);
      expect(record.provenance.intervals).toHaveLength(1);
      const interval = record.provenance.intervals[0]!;
      expect(source.slice(interval.start, interval.end)).toContain(record.semanticValue);
    }
  });

  it('keeps overwritten node and accessibility occurrences with final activity', async () => {
    const source = 'flowchart LR\naccTitle: One\naccTitle: Two\naccDescr: old\naccDescr: new\nA["First"]\nA["Second"]\n';
    const records = (await extractFlowchartLabels(source)).records;
    expect(records.map(record => [record.role, record.semanticValue, record.active])).toEqual([
      ['accTitle', 'One', false], ['accTitle', 'Two', true],
      ['accDescr', 'old', false], ['accDescr', 'new', true],
      ['node.explicit', 'First', false], ['node.explicit', 'Second', true],
    ]);
    expect(records[4]!.provenance.intervals[0]!.start).toBeLessThan(records[5]!.provenance.intervals[0]!.start);
  });

  it('attributes a multi-edge label to every DB edge created by its grammar action', async () => {
    const source = 'flowchart LR\nA & B -->|many| C & D\n';
    const found = await extractFlowchartLabels(source);
    const edge = found.records.find(record => record.role === 'edge')!;
    expect(edge.semanticValue).toBe('many');
    expect(edge.edgeIndices).toEqual([0, 1, 2, 3]);
    expect(edge.endpoints).toEqual([
      { start: 'A', end: 'C' }, { start: 'A', end: 'D' },
      { start: 'B', end: 'C' }, { start: 'B', end: 'D' },
    ]);
    expect(new Set(edge.edgeIds).size).toBe(4);
    expect(found.records.filter(record => record.role === 'node.bare').map(record => record.ownerId)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('maps BOM, CRLF, Unicode, whole-line comments and fence dedent to exact original byte spans', async () => {
    const original = '\uFEFF  flowchart LR\r\n  %% hidden same\r\n  A["😀 $$x$$"] -->|same| B\r\n';
    const rendered = 'flowchart LR\n%% hidden same\nA["😀 $$x$$"] -->|same| B\n';
    const found = await extractFlowchartLabels(original, rendered);
    expect(found.parserSource).not.toContain('hidden');
    const node = found.records.find(record => record.role === 'node.explicit')!;
    const edge = found.records.find(record => record.role === 'edge')!;
    expect(node.semanticValue).toBe('😀 $$x$$');
    expect(node.provenance.intervals).toEqual([{
      start: original.indexOf('😀'), end: original.indexOf('😀') + '😀 $$x$$'.length,
      startByte: new TextEncoder().encode(original.slice(0, original.indexOf('😀'))).length,
      endByte: new TextEncoder().encode(original.slice(0, original.indexOf('😀') + '😀 $$x$$'.length)).length,
    }]);
    expect(original.slice(edge.provenance.intervals[0]!.start, edge.provenance.intervals[0]!.end)).toBe('same');
    expect(node.provenance.intervals[0]!.startByte).toBeGreaterThan(node.provenance.intervals[0]!.start);
  });

  it('keeps equal spellings separate by parser reduction provenance', async () => {
    const source = 'flowchart LR\nA["same"] -->|same| B["same"]\n';
    const found = await extractFlowchartLabels(source);
    const matching = found.records.filter(record => record.semanticValue === 'same');
    expect(matching.map(record => record.role)).toEqual(['node.explicit', 'edge', 'node.explicit']);
    expect(matching.map(record => record.provenance.intervals[0]!.start)).toEqual([
      source.indexOf('same'), source.indexOf('same', source.indexOf('same') + 1), source.lastIndexOf('same'),
    ]);
  });

  it('keeps two formulas in each ordinary quoted and markdown label at distinct exact source spans', async () => {
    const source = 'flowchart LR\nA["$$x$$ then $$y$$"]\nM["`$$a$$ and $$b$$`"]\n';
    const records = (await extractFlowchartLabels(source)).records.filter(record => record.role === 'node.explicit');
    expect(records.map(record => record.semanticValue)).toEqual(['$$x$$ then $$y$$', '$$a$$ and $$b$$']);
    for (const record of records) {
      expect(record.mappedValue.text).toBe(record.semanticValue);
      const matches = [...record.semanticValue.matchAll(/\$\$.*?\$\$/g)];
      expect(matches).toHaveLength(2);
      const spans = matches.map(match => record.mappedValue.mapRange(match.index, match.index + match[0].length));
      expect(spans.every(span => !span.synthetic && span.intervals.length === 1)).toBe(true);
      expect(spans.map((span, index) => {
        const interval = span.intervals[0]!;
        return source.slice(interval.start, interval.end) === matches[index]![0];
      })).toEqual([true, true]);
      expect(spans[0]!.intervals[0]!.end).toBeLessThan(spans[1]!.intervals[0]!.start);
    }
  });

  it('retains copied math origin after the DB trims surrounding label whitespace', async () => {
    const source = 'flowchart LR\nA["  $$x$$  "] -->|  $$y$$  | B\n';
    const records = (await extractFlowchartLabels(source)).records;
    for (const [role, value] of [['node.explicit', '$$x$$'], ['edge', '$$y$$']] as const) {
      const record = records.find(candidate => candidate.role === role)!;
      expect(record.semanticValue).toBe(value);
      expect(record.mappedValue.text).toBe(value);
      const intervals = record.mappedValue.mapRange(0, value.length).intervals;
      expect(intervals).toHaveLength(1);
      expect(source.slice(intervals[0]!.start, intervals[0]!.end)).toBe(value);
    }
  });

  it('returns metadata shapeData as opaque mapped source without claiming its label is covered', async () => {
    const source = 'flowchart LR\nA["First"]\nA@{shape: rect, label: "Meta $$x$$"}\n';
    const found = await extractFlowchartLabels(source);
    expect(found.shapeData).toHaveLength(1);
    expect(found.shapeData[0]).toMatchObject({ ownerId: 'A', rawValue: 'shape: rect, label: "Meta $$x$$"' });
    expect(found.shapeData[0]!.mappedRawValue.text).toBe(found.shapeData[0]!.rawValue);
    const interval = found.shapeData[0]!.provenance.intervals[0]!;
    expect(source.slice(interval.start, interval.end)).toContain('Meta $$x$$');
    expect(found.records.find(record => record.role === 'node.explicit')).toMatchObject({ assignsLabel: true, active: true });
    expect(found.shapeData[0]!.effectIndex).toBeGreaterThan(found.records.find(record => record.role === 'node.explicit')!.effectIndex);
    expect(found.records.some(record => record.semanticValue.includes('Meta'))).toBe(false);
  });

  it('maps each formula in folded multiline metadata through the actual lexer token and shapeData reductions', async () => {
    const source = 'flowchart LR\nA@{label: "first $$x$$\n  second $$y$$", shape: rect}\n';
    const metadata = (await extractFlowchartLabels(source)).shapeData[0]!;
    expect(metadata).toMatchObject({ ownerId: 'A', targetKind: 'node' });
    expect(metadata.mappedRawValue.text).toBe('label: "first $$x$$<br/>second $$y$$", shape: rect');
    const matches = [...metadata.rawValue.matchAll(/\$\$.*?\$\$/g)];
    expect(matches).toHaveLength(2);
    const origins = matches.map(match => metadata.mappedRawValue.mapRange(match.index, match.index + match[0].length));
    expect(origins.every(origin => !origin.synthetic && origin.intervals.length === 1)).toBe(true);
    expect(origins.map((origin, index) => {
      const interval = origin.intervals[0]!;
      return source.slice(interval.start, interval.end) === matches[index]![0];
    })).toEqual([true, true]);
    const fold = metadata.mappedRawValue.text.indexOf('<br/>');
    expect(metadata.mappedRawValue.mapRange(fold, fold + 5).intervals).toEqual([{
      start: source.indexOf('\n  second'), end: source.indexOf('second'),
    }]);
  });

  it('keeps distant formula origins distinct across near-limit shapeData token chains', async () => {
    // Each quoted array item causes several SHAPE_DATA reductions. The mapped
    // value must be flattened once, after the DB receives the completed body.
    const values = ['"$$x$$"', ...Array(15_500).fill('"v"'), '"$$y$$"'].join(',');
    const source = `flowchart LR\nA@{ label: "ok", values: [${values}] }\n`;
    expect(new TextEncoder().encode(source).length).toBeLessThan(64 * 1024);
    expect(source.length).toBeGreaterThan(60_000);
    const metadata = (await extractFlowchartLabels(source)).shapeData[0]!;
    const formulas = [...metadata.mappedRawValue.text.matchAll(/\$\$.*?\$\$/g)];
    expect(formulas.map(match => match[0])).toEqual(['$$x$$', '$$y$$']);
    const origins = formulas.map(match => metadata.mappedRawValue.mapRange(match.index, match.index + match[0].length));
    expect(origins.map((origin, index) => {
      expect(origin.synthetic).toBe(false);
      expect(origin.intervals).toHaveLength(1);
      const interval = origin.intervals[0]!;
      return source.slice(interval.start, interval.end) === formulas[index]![0];
    })).toEqual([true, true]);
    expect(origins[1]!.intervals[0]!.start - origins[0]!.intervals[0]!.end).toBeGreaterThan(60_000);
  });

  it('records metadata target kind and DB chronology even when an override repeats the same label', async () => {
    const source = [
      'flowchart LR',
      'A["Same"]',
      'A@{label: "Same"}',
      'A e1@--> B',
      'e1@{animate: true}',
      'subgraph g["Group"]',
      'C',
      'end',
      'g@{view: collapsed}',
      '',
    ].join('\n');
    const found = await extractFlowchartLabels(source);
    expect(found.shapeData.map(record => [record.ownerId, record.targetKind])).toEqual([
      ['A', 'node'], ['e1', 'edge'], ['g', 'subgraph'],
    ]);
    const first = found.records.find(record => record.role === 'node.explicit')!;
    expect(first).toMatchObject({ semanticValue: 'Same', assignsLabel: true, active: true });
    expect(found.shapeData[0]!.effectIndex).toBeGreaterThan(first.effectIndex);
    const subgraph = found.records.find(record => record.role === 'subgraph')!;
    const child = found.records.find(record => record.ownerId === 'C')!;
    expect(subgraph.provenance.intervals[0]!.start).toBeLessThan(child.provenance.intervals[0]!.start);
    expect(subgraph.effectIndex).toBeGreaterThan(child.effectIndex);
    expect(found.shapeData[1]!.effectIndex).toBeGreaterThan(found.shapeData[0]!.effectIndex);
    expect(found.shapeData[2]!.effectIndex).toBeGreaterThan(subgraph.effectIndex);
  });

  it('captures a label created by style on an unknown node, including a math-shaped ID', async () => {
    const source = 'flowchart LR\nstyle $$x$$ fill:#f00\nstyle $$x$$ stroke:#000\n';
    const records = (await extractFlowchartLabels(source)).records;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ role: 'node.style', ownerId: '$$x$$', semanticValue: '$$x$$', assignsLabel: true, active: true });
    const origin = records[0]!.mappedValue.mapRange(0, 5);
    expect(origin.intervals).toEqual([{ start: source.indexOf('$$x$$'), end: source.indexOf('$$x$$') + 5 }]);
  });

  it('rejects unrelated rendered source rather than recovering positions by substring search', async () => {
    await expect(extractFlowchartLabels('flowchart LR\nA["same"]\n', 'flowchart LR\nA["other"]\n')).rejects.toThrow(/fence differs/);
  });
});
