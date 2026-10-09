import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { MATH_LIMITS } from '../../packages/core/src/math/policy.ts';
import { buildMermaidFigure } from '../../packages/core/src/mermaid/figure.ts';
import { mermaidMathTotal } from '../../packages/core/src/mermaid/index.ts';
import { clearMermaidParseCache, parseMermaid } from '../../packages/core/src/mermaid/parse.ts';
import { normalizeMermaidSource } from '../../packages/core/src/mermaid/rules.ts';

function parseSequence(original: string) {
  clearMermaidParseCache();
  const source = normalizeMermaidSource(original);
  const outcome = parseMermaid([{ figureId: 'figure', source, originalSource: original, type: 'sequence' }]).get('figure')!;
  return { source, outcome };
}
function documentOf(diagram: string) {
  return `---
format: visser/1
docId: 2b6d1c0e-6f2a-4c3e-9b1d-5a7e8f9c0d1e
title: Sequence math integration
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id overview -->
# Sequence math integration

{% mermaid id="figure" title="Sequence" question="What is shown?" %}
The diagram is described here.

\`\`\`mermaid
${diagram}
\`\`\`
{% /mermaid %}
`;
}
async function withBundle<T>(diagram: string, use: (bundle: ReturnType<typeof loadBundle>) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'visser-sequence-math-integration-'));
  try {
    const path = join(dir, 'index.md');
    writeFileSync(path, documentOf(diagram));
    return await use(loadBundle(path));
  } finally { rmSync(dir, {recursive:true,force:true}); }
}

describe('sequence math through the isolated worker and figure model', () => {
  it('retains Unicode/CRLF source ownership and reserves mirrored actor copies', () => {
    const original='sequenceDiagram\r\n%% ignored $$\\bad$$\r\nparticipant A as Café $$x$$\r\nA->>A: message $$y$$\r\n';
    const {source,outcome}=parseSequence(original);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const math=outcome.sequenceMath!;
    expect(math.records.filter(record=>record.parts.some(part=>part.kind==='math')).map(record=>record.role)).toEqual(['actor','message']);
    expect(math.copies.filter(copy=>copy.slotKey==='actor:A').map(copy=>copy.key)).toEqual(['actor:A:header','actor:A:footer']);
    const bytes=new TextEncoder().encode(original);
    for(const record of math.records) for(const part of record.parts) if(part.kind==='math') {
      expect(part.origins).toHaveLength(1);
      const origin=part.origins[0]!;
      expect(new TextDecoder().decode(bytes.subarray(origin.startByte,origin.endByte))).toBe(origin.rawSource);
    }
    const figure=buildMermaidFigure('figure',source,'sequenceDiagram','sequence',outcome).figure;
    expect(figure.sequenceMath?.copies).toHaveLength(math.copies.length);
    expect(mermaidMathTotal([figure]).occurrences).toBe(3);
    expect(() => mermaidMathTotal([figure],{
      occurrences:MATH_LIMITS.documentOccurrences-2,svgBytes:0,elementCount:0,
    })).toThrow(/document budget/);
  });

  it('uses the worker-only box parser and counts repeated box-title runs', () => {
    const {source,outcome}=parseSequence('sequenceDiagram\nparticipant A\nparticipant B\nbox teal Group $$g$$\nparticipant A\nparticipant C\nend\nA->>B: plain\n');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const box=outcome.sequenceMath!.copies.filter(copy=>copy.slotKey==='box:0');
    expect(box.map(copy=>copy.key)).toEqual(['box:0:run:0','box:0:run:1']);
    const figure=buildMermaidFigure('figure',source,'sequenceDiagram','sequence',outcome).figure;
    expect(mermaidMathTotal([figure]).occurrences).toBe(2);
  });

  it('locates malformed math even when a later title overwrites it', () => {
    const original=String.raw`sequenceDiagram
title $$\notacommand{x}$$
title shown
participant A
`;
    const {outcome}=parseSequence(original);
    expect(outcome).toMatchObject({ok:false,code:'E_MATH',line:2});
    if (outcome.ok || !('startByte' in outcome)) return;
    expect(outcome.startByte).toBeGreaterThanOrEqual(0);
    expect(outcome.endByte).toBeGreaterThan(outcome.startByte!);
  });

  it('transports a selected typed YAML alias failure with its field line', () => {
    const {outcome}=parseSequence('sequenceDiagram\nparticipant A@{alias: ["$$x$$"]}\n');
    expect(outcome).toMatchObject({ok:false,code:'E_MATH',line:2});
    if (outcome.ok || !('startByte' in outcome)) return;
    expect(outcome.startByte).toBeGreaterThanOrEqual(0);
    expect(outcome.endByte).toBeGreaterThan(outcome.startByte!);
  });

  it('normalizes box breaks before math validation and keeps original source ownership', () => {
    const {outcome}=parseSequence('sequenceDiagram\nbox teal One<br/>$$x$$\nparticipant A\nend\n');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const box=outcome.sequenceMath!.records.find(record=>record.role==='box')!;
    expect(box.semanticValue).toBe('One<br>$$x$$');
    expect(box.renderedValue).toBe('One\n$$x$$');
    const formula=box.parts.find(part=>part.kind==='math')!;
    expect(formula.kind==='math' && formula.origins[0]?.rawSource).toBe('$$x$$');
    // Semicolon-bearing box entities fail the pinned grammar before its DB.
    const encoded=parseSequence('sequenceDiagram\nbox teal One<br> &dollar;&dollar;x&dollar;&dollar;\nparticipant A\nend\n').outcome;
    expect(encoded).toMatchObject({ok:false});
    if (!encoded.ok) expect(encoded.error).toContain('Parse error');
  });

  it('validates sanitizer-decoded title/accessibility math, including overwritten assignments', () => {
    for (const role of ['title ', 'accTitle: ', 'accDescr: ']) {
      const delimiters = role === 'title ' ? ['$$', '$$'] : ['&dollar;&dollar;', '&dollar;&dollar;'];
      const bad=`sequenceDiagram\n${role}One<br> ${delimiters[0]}\\notacommand{x}${delimiters[1]}\n${role}Replaced\nparticipant A\n`;
      const {outcome}=parseSequence(bad);
      expect(outcome).toMatchObject({ok:false,code:'E_MATH',line:2});
      if (!outcome.ok) {
        expect(outcome.error).toContain('notacommand');
        expect('startByte' in outcome && outcome.startByte).toBeGreaterThanOrEqual(0);
      }
      const valid=parseSequence(`sequenceDiagram\n${role}One<br> ${delimiters[0]}x${delimiters[1]}\nparticipant A\n`).outcome;
      expect(valid.ok).toBe(true);
      if (valid.ok) {
        const record=valid.sequenceMath!.records.find(record=>record.parts.some(part=>part.kind==='math'))!;
        const part=record.parts.find(part=>part.kind==='math')!;
        expect(part.kind==='math' && part.origins[0]?.rawSource).toBe(`${delimiters[0]}x${delimiters[1]}`);
      }
    }
  });

  it('keeps authored error locations when complex HTML has no exact glyph mapping', () => {
    const {outcome}=parseSequence('sequenceDiagram\ntitle <<interface>> $$\\notacommand{x}$$\nparticipant A\n');
    expect(outcome).toMatchObject({ok:false,code:'E_MATH',line:2});
    if (!outcome.ok) expect('startByte' in outcome && outcome.startByte).toBeGreaterThanOrEqual(0);
    const valid=parseSequence('sequenceDiagram\ntitle <<interface>> $$x$$\nparticipant A\n').outcome;
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      const part=valid.sequenceMath!.records.find(record=>record.role==='title')!.parts.find(part=>part.kind==='math')!;
      expect(part).toMatchObject({synthetic:true,origins:[]});
    }
  });

  it('compiles encoded delimiters through the public bundle', async () => {
    const diagram=String.raw`sequenceDiagram
participant A@{alias: "\u0024\u0024x\u0024\u0024"}
A->>A: plain
`;
    expect(diagram.includes('$$')).toBe(false);
    await withBundle(diagram,async bundle=>{
      expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
      const figure=bundle.model.mermaid.get('figure')!;
      expect(figure.sequenceMath?.records.some(record=>record.parts.some(part=>part.kind==='math'))).toBe(true);
      expect(figure.mathBodyStartByte).toBeTypeOf('number');
      expect(mermaidMathTotal(bundle.model.mermaid.values()).occurrences).toBe(2);
      const output=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),
        integrity:{'mermaid.js':'sha384-TESTDIGEST'}},{audience:'private',includeSource:false,layoutFallback:false});
      const html=new TextDecoder().decode(output.files.find(file=>file.path.endsWith('index.html'))!.bytes);
      expect(html).toContain('data-vs-mermaid-source-map=');
      expect(html).toContain('data-vs-mermaid-math');
      expect(html).toContain('sequence');
      expect(html).toContain('encoded&quot;:true');
    });
  });
});

it('exports raw equations in every sequence label role through the public compiler', async () => {
  const diagram=`sequenceDiagram
 title $$x < y$$
 accTitle: $$a$$
 accDescr: $$d$$
 box teal $$b$$
 participant A as $$a$$
 participant B as $$c$$
 end
 A->>B: $$m$$
 Note over A,B: $$n$$
 loop $$l$$
 A->>B: plain
 end
 opt $$o$$
 A->>B: plain
 end
 alt $$u$$
 A->>B: plain
 else $$v$$
 B->>A: plain
 end
 par $$p$$
 A->>B: plain
 and $$q$$
 B->>A: plain
 end
 critical $$r$$
 A->>B: plain
 option $$s$$
 B->>A: plain
 end
 break $$t$$
 A->>B: plain
 end
 `;
  await withBundle(diagram, async bundle=>{
    expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
    const figure=bundle.model.mermaid.get('figure')!;
    expect(new Set(figure.sequenceMath!.records.filter(r=>r.parts.some(p=>p.kind==='math')).map(r=>r.role)))
      .toEqual(new Set(['title','accTitle','accDescr','box','actor','message','note','loop','opt','alt','else','par','and','critical','option','break']));
    const output=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),integrity:{'mermaid.js':'sha384-TESTDIGEST'}},
      {audience:'private',includeSource:false,layoutFallback:false});
    const html=new TextDecoder().decode(output.files.find(file=>file.path.endsWith('index.html'))!.bytes);
    expect(html).toContain('data-vs-mermaid-source-map=');
    expect(html).toContain('data-vs-mermaid-math');
  });
});
