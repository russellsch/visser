import { describe, expect, it } from 'vitest';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';
import { decodeFlowchartMetadata } from '../../packages/core/src/mermaid/flowchart-metadata.ts';
import { extractFlowchartLabels } from '../../packages/core/src/mermaid/flowchart-labels.ts';

const decode = (source: string) => decodeFlowchartMetadata({ rawValue: source, mappedRawValue: ProvenanceText.identity(source) });

describe('flowchart metadata scalar selection', () => {
  it.each([String.raw`"\u0069con": "fa:user"`, String.raw`"\u0069mg": "https://example.invalid/image.png"`, 'key: &k icon, *k : "fa:user"'])('rejects decoded prohibited property %s', source => {
    expect(() => decode(source)).toThrow(/decoded (?:icon|img) property is not allowed/);
  });
  it('decodes nonliteral delimiters to their complete authored escape spans', () => {
    const source = String.raw`label: "\u0024\u0024x\u0024\u0024"`;
    const label = decode(source).label!;
    expect(label.mappedValue!.text).toBe('$$x$$');
    expect(label.mappedValue!.mapRange(0, 2)).toEqual({ synthetic: false, intervals: [{ start: 8, end: 20 }] });
  });
  it('uses alias definition provenance while retaining alias use identity', () => {
    const source = 'base: &name "$$x$$", label: *name';
    const label = decode(source).label!;
    expect(label.trace.kind).toBe('alias');
    expect(label.mappedValue!.text).toBe('$$x$$');
    expect(label.mappedValue!.mapRange(0, 5).intervals).toEqual([{ start: 13, end: 18 }]);
    expect(label.trace.raw.intervals.map(span => source.slice(span.start, span.end)).join('')).toBe('*name');
  });
  it('selects only the first native array label while preserving its typed assignment', () => {
    const label = decode('label: ["$$x$$", "$$y$$"]').label!;
    expect(label.value).toEqual(['$$x$$', '$$y$$']);
    expect(label.mappedValue!.text).toBe('$$x$$');
  });
  it('matches Mermaid truthy assignment without coercing unsupported typed labels', () => {
    for (const value of ['false', '0', 'null', '""']) expect(decode(`label: ${value}`).label).toBeUndefined();
    for (const value of ['true', '12', '[]']) {
      const label = decode(`label: ${value}`).label!;
      expect(label).toBeDefined();
      expect(label.mappedValue).toBeUndefined();
    }
  });
  it('composes actual grammar token origins through the synthetic metadata wrapper', async () => {
    const source = 'flowchart LR\nA@{ label: "$$x$$ and $$y$$" }\n';
    const records = await extractFlowchartLabels(source);
    const mapped = decodeFlowchartMetadata(records.shapeData[0]!).label!.mappedValue!;
    for (const match of mapped.text.matchAll(/\$\$.*?\$\$/g)) {
      const range = mapped.mapRange(match.index, match.index + match[0].length);
      expect(range.synthetic).toBe(false);
      expect(range.intervals).toHaveLength(1);
      const interval = range.intervals[0]!;
      expect(source.slice(interval.start, interval.end)).toBe(match[0]);
    }
  });
  it('keeps folded metadata line breaks associated with original physical source', () => {
    const source = 'label: >-\n  $$x\n  + y$$\n';
    const mapped = decode(source).label!.mappedValue!;
    expect(mapped.text).toBe('$$x + y$$');
    expect(mapped.mapRange(3, 4).intervals.map(span => source.slice(span.start, span.end))).toEqual(['\n']);
  });
});
