import { describe, expect, it } from 'vitest';
import { registerHooks } from 'node:module';
import { mapFlowchartParserInput, mapMermaidFence } from '../../packages/core/src/mermaid/flowchart-source.ts';

describe('mapped flowchart preprocessing', () => {
  it('accepts an admitted-size fence with many physical lines without spreading call arguments', () => {
    const source = 'flowchart LR\n' + '\n'.repeat(64000);
    const mapped = mapMermaidFence(source, source);
    expect(mapped.text).toBe(source);
    expect(mapped.mapRange(0, mapped.length)).toEqual({ synthetic: false, intervals: [{ start: 0, end: source.length }] });
  });
  it('matches the pinned Mermaid API input and actual flow parser wrapper', async () => {
    const stub = new URL('../../packages/core/src/mermaid/dompurify-stub.ts', import.meta.url).href;
    const hook = registerHooks({ resolve(specifier, context, next) {
      return specifier === 'dompurify' ? { url: stub, shortCircuit: true } : next(specifier, context);
    } });
    try {
      const { default: mermaid } = await import('mermaid');
      // @ts-expect-error pinned compiled Mermaid chunk has no declarations.
      const { diagram } = await import('mermaid/dist/chunks/mermaid.core/flowDiagram-KWPJA3E3.mjs');
      const parser = diagram.parser.parser;
      const originalParse = parser.parse;
      let observed = '';
      parser.parse = function (source: string) { observed = source; return originalParse.call(this, source); };
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', logLevel: 'fatal' });
        for (const source of [
          '  flowchart LR\n%% private\n A["😀 $$x$$"] --> B\n',
          'flowchart LR\n A@{ label: "$$x$$" }   \n\n B\n',
          'flowchart LR\n A\n style A fill:#abc,stroke:blue;\n',
        ]) {
          const result = await mermaid.mermaidAPI.getDiagramFromText(source);
          const mapped = mapFlowchartParserInput(source, source);
          expect(mapped.mermaidInput.text).toBe(result.text);
          expect(mapped.parserInput.text).toBe(observed);
        }
      } finally { parser.parse = originalParse; }
    } finally { hook.deregister(); }
  });
  it('preserves original Unicode coordinates through BOM, dedent, CRLF and comments', () => {
    const original = '\uFEFF  flowchart LR\r\n  %% private\r\n  A["😀 $$x$$"] --> B\r\n';
    const rendered = 'flowchart LR\n%% private\nA["😀 $$x$$"] --> B\n';
    const { parserInput } = mapFlowchartParserInput(original, rendered);
    expect(parserInput.text).toBe('flowchart LR\nA["😀 $$x$$"] --> B\n\n');
    const at = parserInput.text.indexOf('$$x$$');
    expect(parserInput.mapRange(at, at + 5)).toEqual({ synthetic: false,
      intervals: [{ start: original.indexOf('$$x$$'), end: original.indexOf('$$x$$') + 5 }] });
    expect(parserInput.originAt(parserInput.length - 1)?.synthetic).toBe(true);
  });
  it('maps flow wrapper whitespace removal without claiming removed text as retained', () => {
    const source = 'flowchart LR\nA@{ label: "$$x$$" }   \n\n B\n';
    const { mermaidInput, parserInput } = mapFlowchartParserInput(source, source);
    expect(mermaidInput.text).toBe(source + '\n');
    expect(parserInput.text).toBe('flowchart LR\nA@{ label: "$$x$$" }\n B\n\n');
    const at = parserInput.text.indexOf('}\n');
    expect(parserInput.mapRange(at, at + 2)).toEqual({ synthetic: false,
      intervals: [{ start: source.indexOf('}'), end: source.indexOf('}') + 1 },
        { start: source.indexOf('\n\n') + 1, end: source.indexOf('\n\n') + 2 }] });
  });
  it('retains style prefix provenance after Mermaid removes its semicolon', () => {
    const source = 'flowchart LR\nA\nstyle A fill:#abc,stroke:blue;\n';
    const { parserInput } = mapFlowchartParserInput(source, source);
    expect(parserInput.text).toContain('style A fill:#abc,stroke:blue\n');
    const at = parserInput.text.indexOf('#abc');
    expect(parserInput.mapRange(at, at + 4).intervals).toEqual([{ start: source.indexOf('#abc'), end: source.indexOf('#abc') + 4 }]);
  });
  it('retains existing unsafe-source restrictions and rejects stale fence text', () => {
    for (const source of ['---\ntitle: X\n---\nflowchart LR\nA', 'flowchart LR\n%%{init: {}}%%\nA', 'flowchart LR\nA["#35;"]', 'flowchart LR\nA["#a_b;"]', 'flowchart LR\nA["#12abc;"]']) {
      expect(() => mapFlowchartParserInput(source, source)).toThrow(/flowchart source mapping/);
    }
    expect(() => mapMermaidFence('  A\n', 'B\n')).toThrow(/indentation/);
    expect(() => mapMermaidFence('A\r\n', 'A')).toThrow(/line count/);
  });
});
