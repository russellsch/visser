import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { MATH_PROCESS_LIMITS, mathKey, validateMath } from '../../packages/core/src/math/validate.ts';
import { convertMath } from '../../packages/core/src/math/engine.ts';
import { validateMathConversionShape } from '../../packages/core/src/math/svg-validate.ts';

const temp = mkdtempSync(join(tmpdir(), 'visser-math-worker-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
const request = { tex: 'x^2', display: false, path: 'index.md', startLine: 8, targetId: 'p_math' };
function worker(name: string, source: string): string {
  const path = join(temp, name + '.cjs'); writeFileSync(path, source); return path;
}

describe('bounded math validation @M07 @M11', () => {
  it('preserves UTF-8 source and keys split between pipe chunks', () => {
    const tex = 'x%π';
    const key = mathKey(tex, false);
    const payload = Buffer.from(JSON.stringify({ expressions: [{ key, tex, display: false }] }));
    const split = payload.indexOf(Buffer.from('π')) + 1;
    const path = worker('split-utf8', `
      const {Readable}=require('node:stream');
      const bytes=Buffer.from(${JSON.stringify(payload.toString('base64'))},'base64');
      Object.defineProperty(process,'stdin',{value:Readable.from((async function*(){
        yield bytes.subarray(0,${split});
        await new Promise(resolve=>setImmediate(resolve));
        yield bytes.subarray(${split});
      })())});
      import(${JSON.stringify(new URL('../../packages/core/src/math/validate-worker.ts', import.meta.url).href)});
    `);
    const reply = JSON.parse(execFileSync(process.execPath, [path], { encoding: 'utf8', timeout: 5000 }));
    expect(reply.results[0].key).toBe(key);
    expect(reply.results[0].conversion.source).toBe(tex);
  });

  it('converts a valid batch, caches duplicate conversion, and preserves error locations', async () => {
    const result = await validateMath([request, request]);
    expect(result.diagnostics).toEqual([]);
    expect(result.conversions.size).toBe(1);
    expect(result.conversions.get(mathKey('x^2', false))?.metrics.widthEm).toBeGreaterThan(0);
    const invalid = await validateMath([{ ...request, tex: '\\unknownVisserCommand{x}' }]);
    expect(invalid.diagnostics).toEqual([expect.objectContaining({ severity: 'error', path: 'index.md', startLine: 8, targetId: 'p_math' })]);
  });
  it('kills synchronous runaway work and returns source-located diagnostics', async () => {
    const path = worker('loop', 'while (true) {}');
    const before = performance.now();
    const result = await validateMath([request], { workerPath: path, timeoutMs: 100 });
    expect(performance.now() - before).toBeLessThan(3000);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'E_LIMIT', startLine: 8, targetId: 'p_math' })]);
  });
  it('rejects malformed and incomplete IPC results', async () => {
    for (const [name, reply] of [['invalid', '{}'], ['missing', '{"results":[]}']]) {
      const path = worker(name!, `process.stdout.write(${JSON.stringify(reply)});`);
      const result = await validateMath([request], { workerPath: path });
      expect(result.conversions.size).toBe(0);
      expect(result.diagnostics[0]?.code).toBe('E_MATH');
    }
  });
  it('bounds requests before starting any worker', async () => {
    const missing = join(temp, 'does-not-exist');
    const many = await validateMath(Array.from({ length: 1001 }, () => request), { workerPath: missing });
    expect(many.diagnostics[0]?.code).toBe('E_LIMIT');
    const large = await validateMath([{ ...request, tex: 'π'.repeat(1025) }], { workerPath: missing });
    expect(large.diagnostics[0]?.code).toBe('E_LIMIT');
    expect((await validateMath([], { workerPath: missing })).diagnostics).toEqual([]);
  });
  it('counts repeated output against the aggregate budget', async () => {
    // One unique conversion still expands into 1,000 occurrences.
    const result = await validateMath(Array.from({ length: 1000 }, () => ({ ...request, tex: 'x+'.repeat(50) + 'x' })));
    expect(result.diagnostics[0]?.code).toBe('E_LIMIT');
    expect(result.diagnostics[0]?.message).toContain('document output');
  });
  it('accepts a large distinct-source batch that fits the shared IPC budget', async () => {
    const requests = Array.from({ length: 1000 }, (_, index) => ({
      ...request,
      tex: `x%${'\\'.repeat(2030)}${String(index).padStart(4, '0')}`,
      startLine: index + 1,
    }));
    const serialized = JSON.stringify({ expressions: requests.map(item => ({
      key: mathKey(item.tex, item.display), tex: item.tex, display: item.display,
    })) });
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(MATH_PROCESS_LIMITS.ipcBytes);
    const result = await validateMath(requests);
    expect(result.diagnostics).toEqual([]);
    expect(result.conversions.size).toBe(1000);
  });
  it('rejects an oversized serialized request before starting its worker', async () => {
    const missing = join(temp, 'oversized-request-worker-does-not-exist');
    const requests = Array.from({ length: 1000 }, (_, index) => ({
      ...request,
      tex: `${'\u0001'.repeat(2000)}${String(index).padStart(4, '0')}`,
      startLine: index + 1,
    }));
    const result = await validateMath(requests, { workerPath: missing });
    expect(result.conversions.size).toBe(0);
    expect(result.diagnostics).toEqual([expect.objectContaining({
      code: 'E_LIMIT', message: expect.stringContaining('IPC limit'), path: request.path,
      startLine: 1000, targetId: request.targetId,
    })]);
  });
  it('combines prose with the previously validated Mermaid resource total', async () => {
    const missing = join(temp, 'does-not-exist');
    const full = await validateMath([request], { workerPath: missing,
      initialTotal: { occurrences: 1000, svgBytes: 0, elementCount: 0 } });
    expect(full.diagnostics[0]?.code).toBe('E_LIMIT');
    const bytes = await validateMath([request], {
      initialTotal: { occurrences: 1, svgBytes: 8 * 1024 * 1024, elementCount: 1 } });
    expect(bytes.diagnostics[0]?.code).toBe('E_LIMIT');
    const invalid = await validateMath([], { initialTotal: { occurrences: -1, svgBytes: 0, elementCount: 0 } });
    expect(invalid.diagnostics[0]?.code).toBe('E_LIMIT');
  });
  it('rejects malformed successful-looking conversion output', async () => {
    const path = worker('bad-tree', `let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{
      const x=JSON.parse(s).expressions[0];process.stdout.write(JSON.stringify({results:[{key:x.key,conversion:{source:x.tex,display:x.display,
        svg:{},metrics:{widthEm:1,heightEm:1,depthEm:0,ascentEm:1},svgBytes:0,elementCount:1,fingerprintInputs:{}}}]}));
    });`);
    const result = await validateMath([request], { workerPath: path });
    expect(result.diagnostics[0]?.code).toBe('E_MATH');
    expect(result.conversions.size).toBe(0);
  });

  it('rejects a worker reply that claims both success and failure', async () => {
    const reply = JSON.stringify({ results: [{ key: mathKey(request.tex, request.display),
      conversion: convertMath(request.tex, request.display), error: 'failed', code: 'E_MATH' }] });
    const path = worker('ambiguous-success', `process.stdout.write(${JSON.stringify(reply)});`);
    const result = await validateMath([request], { workerPath: path });
    expect(result.conversions.size).toBe(0);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'E_MATH',
      message: 'math validation worker returned invalid output', path: request.path,
      startLine: request.startLine, targetId: request.targetId })]);
  });

  it('rejects finite but extreme shared SVG dimensions', () => {
    const conversion = convertMath(request.tex, request.display);
    const extreme = structuredClone(conversion);
    extreme.metrics.widthEm = 1e300;
    extreme.svg.attrs.width = '2e300ex';
    expect(() => validateMathConversionShape(extreme, request)).toThrowError(/invalid geometry/);
  });
});
