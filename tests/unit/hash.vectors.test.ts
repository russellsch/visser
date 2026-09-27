// Cross-language hash vectors (ARCHITECTURE.md §7.4, §11.2). The oracle is the
// independent Python implementation's recorded output (spikes/hash-vectors/actual-py.json);
// scripts/check-contracts.mjs reruns Python and repeats this comparison.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HashError,
  bodySha256,
  buildId,
  buildIdFromInput,
  canonicalJSON,
  compareCodePoints,
  normalizeText,
  parseJsonStrictIntegers,
  sha256Hex,
  sourceRevision,
  validateBundlePath,
} from '../../packages/core/src/model/hash.ts';
import { formatReferenceUri, parseReferenceUri } from '../../packages/core/src/references/uri.ts';

const root = new URL('../../', import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(new URL(rel, root), 'utf8'));

type VectorCase = { id: string; op: string; knownDivergent?: boolean; equalTo?: string; notEqualTo?: string } & Record<
  string,
  any
>;
const vectors: VectorCase[] = readJson('spikes/hash-vectors/vectors.json').cases;
const python: Record<string, Record<string, unknown>> = readJson('spikes/hash-vectors/actual-py.json').results;

const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const SPECIAL: Record<string, unknown> = { nan: NaN, infinity: Infinity, undefined: undefined };

function runCase(c: VectorCase): Record<string, unknown> {
  switch (c.op) {
    case 'text':
      return {
        normalizedB64: Buffer.from(normalizeText(fromB64(c.bytesB64)), 'utf8').toString('base64'),
        bodySha256: bodySha256(fromB64(c.bytesB64)),
      };
    case 'cjson': {
      const value = 'special' in c ? SPECIAL[c.special] : parseJsonStrictIntegers(c.json);
      const canonical = canonicalJSON(value);
      return { canonical, sha256: sha256Hex(Buffer.from(canonical, 'utf8')) };
    }
    case 'srcrev': {
      const files = c.files.map((f: any) => ({ path: f.path, kind: f.kind, content: fromB64(f.contentB64) }));
      const r = sourceRevision(c.docId, files);
      return { canonical: r.canonical, sourceRevision: r.sourceRevision };
    }
    case 'buildid':
      return buildIdFromInput(c.input);
    case 'uri_build':
      return { uri: formatReferenceUri(c.input) };
    case 'uri_parse':
      return { parts: parseReferenceUri(c.uri) };
    default:
      throw new Error(`unknown op ${c.op}`);
  }
}

function result(c: VectorCase): Record<string, unknown> {
  try {
    return { ok: true, ...runCase(c) };
  } catch (e) {
    if (!(e instanceof HashError)) throw e;
    return { ok: false, error: e.reason };
  }
}

const digest = (r: Record<string, unknown>) =>
  (r.sourceRevision ?? r.buildId ?? r.bodySha256 ?? r.sha256) as string | undefined;

describe('cross-language hash vectors @R18 @T14', () => {
  it('covers the recorded vector set', () => {
    expect(vectors.length).toBe(95);
  });

  for (const c of vectors) {
    it(`${c.id} (${c.op}) matches the Python reference`, () => {
      expect(result(c)).toEqual(python[c.id]);
    });
  }

  it('resolves the two former JS/Python divergences as rejections (§7.4 integer grammar)', () => {
    const divergent = vectors.filter((c) => c.knownDivergent).map((c) => c.id);
    expect(divergent.sort()).toEqual(['c_exponent_integral', 'c_float_integral']);
    for (const id of divergent) {
      const c = vectors.find((v) => v.id === id)!;
      expect(result(c)).toEqual({ ok: false, error: 'E_FLOAT' });
    }
  });

  it('holds the equalTo / notEqualTo properties', () => {
    for (const c of vectors) {
      for (const [key, wantEqual] of [['equalTo', true], ['notEqualTo', false]] as const) {
        const other = c[key];
        if (!other) continue;
        const a = result(c);
        const b = result(vectors.find((v) => v.id === other)!);
        expect(a.ok && b.ok && digest(a) === digest(b), `${c.id} ${key} ${other}`).toBe(wantEqual);
      }
    }
  });
});

describe('Appendix A captured excerpt', () => {
  it('reproduces the recorded excerptSha256', () => {
    const text = readFileSync(new URL('examples/bounded-queue/index.md', root), 'utf8');
    const match = /```python\n([\s\S]*?\n)```/.exec(text);
    expect(match).not.toBeNull();
    expect(bodySha256(Buffer.from(match![1]!, 'utf8'))).toBe(
      '46211103f813d56e7736c562cba07868cd8bcd12183327be0da376542fb4f358',
    );
  });
});

describe('code-point order', () => {
  it('differs from the JavaScript default sort for astral vs BMP private-range characters', () => {
    const items = ['\uff61', '\u{1F600}'];
    expect([...items].sort()).toEqual(['\u{1F600}', '\uff61']);
    expect([...items].sort(compareCodePoints)).toEqual(['\uff61', '\u{1F600}']);
  });
});

describe('source manifest paths', () => {
  const docId = '4f8ac70c-7e14-4f06-9865-e194f57c7239';
  const text = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
  const codeOf = (fn: () => unknown) => {
    try {
      fn();
      return 'ok';
    } catch (e) {
      return (e as HashError).code + '/' + (e as HashError).reason;
    }
  };

  it('rejects case-folded collisions with E_PATH_INVALID', () => {
    const files = [
      { path: 'index.md', kind: 'text' as const, content: text('x') },
      { path: 'evidence/A.txt', kind: 'text' as const, content: text('a') },
      { path: 'evidence/a.txt', kind: 'text' as const, content: text('b') },
    ];
    expect(codeOf(() => sourceRevision(docId, files))).toBe('E_PATH_INVALID/E_PATH_CASE_COLLISION');
  });

  it('maps duplicate and missing-index cases to E_PATH_INVALID', () => {
    const idx = { path: 'index.md', kind: 'text' as const, content: text('x') };
    expect(codeOf(() => sourceRevision(docId, [idx, idx]))).toBe('E_PATH_INVALID/E_PATH_DUPLICATE');
    expect(codeOf(() => sourceRevision(docId, [{ ...idx, path: 'other.md' }]))).toBe('E_PATH_INVALID/E_MANIFEST');
  });

  it('maps traversal and absolute paths to E_PATH_ESCAPE', () => {
    expect(codeOf(() => validateBundlePath('../x'))).toBe('E_PATH_ESCAPE/E_PATH_ESCAPE');
    expect(codeOf(() => validateBundlePath('/x'))).toBe('E_PATH_ESCAPE/E_PATH_ESCAPE');
    expect(codeOf(() => validateBundlePath('cafe\u0301.md'))).toBe('E_PATH_INVALID/E_PATH_INVALID');
  });
});

describe('strict integer JSON @R18', () => {
  it('accepts integer literals and -0, rejects fractions and exponents', () => {
    expect(canonicalJSON(parseJsonStrictIntegers('{"b":[1,-0,20],"a":"1.5e3"}'))).toBe('{"a":"1.5e3","b":[1,0,20]}');
    for (const bad of ['1.0', '1e3', '[2E1]', '{"x":-0.0}']) {
      expect(() => parseJsonStrictIntegers(bad)).toThrow(HashError);
    }
  });
});

describe('buildId @T14', () => {
  const base = {
    sourceRevision: 'a'.repeat(64),
    toolkitSha256: 'b'.repeat(64),
    extensionDigests: [] as string[],
    effectiveRenderOptions: { audience: 'private' as const, includeSource: false, layoutFallback: false },
  };

  it('changes with the toolkit while the source revision stays the same', () => {
    const a = buildId(base).buildId;
    const b = buildId({ ...base, toolkitSha256: 'c'.repeat(64) }).buildId;
    expect(a).not.toBe(b);
  });

  it('requires exactly {audience, includeSource, layoutFallback}', () => {
    const missing = { audience: 'private', includeSource: false } as any;
    const extra = { ...base.effectiveRenderOptions, basePath: '/' } as any;
    expect(() => buildId({ ...base, effectiveRenderOptions: missing })).toThrow(/exactly/);
    expect(() => buildId({ ...base, effectiveRenderOptions: extra })).toThrow(/exactly/);
  });

  it('a development build has a different ID; a normal build ID is unchanged by the rule', () => {
    const normal = buildId(base).buildId;
    const dev = buildId({ ...base, effectiveRenderOptions: { ...base.effectiveRenderOptions, development: true } }).buildId;
    expect(dev).not.toBe(normal);
    // Only `development: true` is accepted; `false` would give normal builds two IDs.
    expect(() => buildId({ ...base, effectiveRenderOptions: { ...base.effectiveRenderOptions, development: false } as any })).toThrow(/exactly/);
  });
});
