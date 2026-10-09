import { describe, expect, it } from 'vitest';
import { extractSequenceMath, LocatedSequenceMathError } from '../../packages/core/src/mermaid/sequence-math.ts';
import { EMPTY_MATH_RESOURCE_TOTAL, MATH_LIMITS } from '../../packages/core/src/math/policy.ts';

describe('sequence authored math validation', () => {
  it('maps repeated expressions to distinct original bytes after BOM/CRLF/dedent', async () => {
    const original = '\uFEFF  sequenceDiagram\r\n  participant A as 😀 $$x$$\r\n  A->>A: $$x$$\r\n';
    const rendered = 'sequenceDiagram\nparticipant A as 😀 $$x$$\nA->>A: $$x$$\n';
    const found = await extractSequenceMath(original, undefined, rendered);
    const formulas = found.records.flatMap(r => r.parts.filter(p => p.kind === 'math'));
    expect(formulas).toHaveLength(2);
    expect(found.total.occurrences).toBe(2);
    for (const formula of formulas) {
      expect(formula.synthetic).toBe(false);
      expect(formula.origins).toHaveLength(1);
      const origin = formula.origins[0]!;
      expect(origin.rawSource).toBe('$$x$$');
      expect(new TextDecoder().decode(new TextEncoder().encode(original).slice(origin.startByte, origin.endByte))).toBe('$$x$$');
    }
    expect(formulas[0]!.origins[0]!.startByte).toBeLessThan(formulas[1]!.origins[0]!.startByte);
  });
  it('keeps sequence TeX row separators without flowchart slash collapsing', async () => {
    const tex = String.raw`\begin{matrix}a&b\\c&d\end{matrix}`;
    const result = await extractSequenceMath(`sequenceDiagram\nA->>A: $$${tex}$$\n`);
    const message = result.records.find(r=>r.role==='message')!;
    expect(message.parts).toMatchObject([{kind:'math',tex}]);
  });
  it('validates and counts overwritten and accessibility labels', async () => {
    const result = await extractSequenceMath('sequenceDiagram\ntitle $$a$$\ntitle $$b$$\naccTitle: $$c$$\nparticipant A as $$d$$\nparticipant A as $$e$$\n');
    expect(result.total.occurrences).toBe(5);
    expect(result.records.filter(r=>!r.active).map(r=>r.semanticValue)).toEqual(['$$a$$','$$d$$']);
  });
  it('locates invalid overwritten formulas to the authored field', async () => {
    const source = String.raw`sequenceDiagram
participant A as $$\unsupportedVisserCommand$$
participant A as valid
`;
    await expect(extractSequenceMath(source)).rejects.toMatchObject({name:'LocatedSequenceMathError',code:'E_MATH_INVALID',startLine:2});
    try {await extractSequenceMath(source);} catch(error) {
      expect(error).toBeInstanceOf(LocatedSequenceMathError);
      expect((error as LocatedSequenceMathError).intervals[0]!.rawSource).toBe(String.raw`$$\unsupportedVisserCommand$$`);
    }
  });
  it('retains math on either side of native line breaks and rejects split expressions', async () => {
    const result = await extractSequenceMath('sequenceDiagram\nA->>A: $$x$$<br/>$$y$$\n');
    expect(result.records.find(r=>r.role==='message')!.renderedValue).toBe('$$x$$\n$$y$$');
    expect(result.total.occurrences).toBe(2);
    await expect(extractSequenceMath('sequenceDiagram\nA->>A: $$x<br/>y$$\n')).rejects.toMatchObject({code:'E_MATH_INVALID'});
  });
  it('validates suppressed and overwritten YAML alias formulas', async () => {
    const invalid = String.raw`sequenceDiagram
participant A@{alias: "$$\\unsupportedVisserCommand$$"} as Explicit
A->>A: plain
`;
    await expect(extractSequenceMath(invalid)).rejects.toMatchObject({name:'LocatedSequenceMathError',code:'E_MATH_INVALID',startLine:2});
    const valid = String.raw`sequenceDiagram
participant A@{alias: "\u0024\u0024x\u0024\u0024"} as Explicit
participant A as $$y$$
`;
    const result = await extractSequenceMath(valid);
    expect(result.total.occurrences).toBe(2);
    const alias=result.records.find(r=>r.role==='actor.metadata')!;
    expect(alias.active).toBe(false);
    const formula=alias.parts.find(p=>p.kind==='math')!;
    expect(formula.origins[0]!.rawSource).toBe(String.raw`\u0024\u0024x\u0024\u0024`);
  });
  it('locates a final typed YAML alias rejection to its authored metadata field', async () => {
    await expect(extractSequenceMath('sequenceDiagram\nparticipant A@{alias: ["$$x$$"]}\n')).rejects.toMatchObject({
      code:'E_MATH_INVALID',startLine:2,startByte:expect.any(Number),endByte:expect.any(Number),
      intervals:expect.arrayContaining([expect.objectContaining({rawSource:'["$$x$$"]'} )]),
    });
  });
  it('shares the incoming document occurrence budget', async () => {
    await expect(extractSequenceMath('sequenceDiagram\nA->>A: $$x$$\n', {
      ...EMPTY_MATH_RESOURCE_TOTAL, occurrences:MATH_LIMITS.documentOccurrences,
    })).rejects.toBeInstanceOf(LocatedSequenceMathError);
  });
});

it('restores serialized LaTeX only in sanitizer-owned equations with exact authored spans', async () => {
  for (const role of ['title ', 'box teal ', 'accTitle: ', 'accDescr: ']) {
    const tail = role.startsWith('box') ? '\nparticipant A\nend' : '\nparticipant A';
    const tex = String.raw`x < y > z \& q`;
    const source = `sequenceDiagram\n${role}$$${tex}$$${tail}\n`;
    const result = await extractSequenceMath(source);
    const record = result.records.find(r=>r.parts.some(p=>p.kind==='math'))!;
    expect(record.semanticValue).toBe('$$x &lt; y &gt; z \\&amp; q$$');
    const formula = record.parts.find(p=>p.kind==='math')!;
    expect(formula).toMatchObject({tex, synthetic:false, origins:[{rawSource:`$$${tex}$$`}]});
  }
});
