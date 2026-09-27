// Mermaid figures in the model (§9.12, §17.5a): rejection rules, name mapping,
// parsed structure, render keys, projection, editing refusals, and limits.
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { buildTargetRecords } from '../../packages/core/src/model/targets.ts';
import { validateDocument } from '../../packages/core/src/model/validate.ts';
import { projectText } from '../../packages/core/src/model/project.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import {
  checkMermaidSource,
  clearMermaidParseCache,
  mapMermaidName,
  resolveMermaidFigures,
  setMermaidParseTimeout,
  setMermaidWorkerPath,
} from '../../packages/core/src/mermaid/index.ts';
import { replaceTarget, showReference } from '../../packages/core/src/references/index.ts';

const ROOT = new URL('../../fixtures/', import.meta.url).pathname;
const WORKER = new URL('../../packages/core/src/mermaid/parse-worker.ts', import.meta.url).pathname;

function analyze(text: string) {
  const parsed = parseSource(new TextEncoder().encode(text), 'index.md');
  const model = buildTargetRecords(parsed);
  const diagnostics = [...parsed.diagnostics, ...model.diagnostics, ...validateDocument(parsed, model)];
  return { parsed, model, diagnostics };
}
const fixture = (name: string) => readFileSync(join(ROOT, 'positive', `${name}.md`), 'utf8');

describe('Mermaid rejected content (§9.12) @R11', () => {
  const codesOf = (src: string) => checkMermaidSource(src).map((i) => i.code);

  it('rejects directives anywhere and in any case, and leading frontmatter', () => {
    expect(codesOf('%%{init: {"theme":"dark"}}%%\nflowchart LR\n a --> b')).toEqual(['E_UNSAFE_CONTENT']);
    expect(codesOf('flowchart LR\n    %%{ initialize: {} }%%\n a --> b')).toEqual(['E_UNSAFE_CONTENT']);
    expect(codesOf('flowchart LR\n a --> b\n%%{INIT: {}}%%')).toEqual(['E_UNSAFE_CONTENT']);
    expect(codesOf('﻿---\r\nconfig:\r\n  theme: forest\r\n---\r\nflowchart LR\r\n a --> b')).toEqual(['E_UNSAFE_CONTENT']);
  });

  it('rejects click, href, call, callback, link, and links statements but not nodes with those names', () => {
    for (const line of ['click a href "https://x"', 'click a call cb()', 'callback Queue "fn"', 'link Queue "https://x"', 'links api: {"a": "https://x"}', 'href a "https://x"', 'CLICK a "https://x"']) {
      expect(codesOf(`flowchart LR\n a --> b\n ${line}`), line).toEqual(['E_UNSAFE_CONTENT']);
    }
    expect(codesOf('flowchart LR\n link --> call\n call --> click')).toEqual([]);
  });

  it('rejects label HTML except <br>, and ignores <<stereotypes>>', () => {
    expect(codesOf('flowchart LR\n a["<a href=x>y</a>"] --> b')).toContain('E_UNSAFE_CONTENT');
    expect(codesOf('flowchart LR\n a["<img src=x>"] --> b')).toEqual(['E_UNSAFE_CONTENT']);
    expect(codesOf('flowchart LR\n a["one<br>two<br/>three<BR />four"] --> b')).toEqual([]);
    expect(codesOf('stateDiagram-v2\n state pick <<choice>>\n [*] --> pick')).toEqual([]);
    expect(codesOf('classDiagram\n class Queue {\n  <<interface>>\n }')).toEqual([]);
    expect(codesOf('flowchart LR\n a["`**md** label`"] --> b')).toEqual([]);
  });

  it('rejects img and icon node shapes', () => {
    expect(codesOf('flowchart TD\n A@{ img: "https://x/i.png", label: "x" }')).toEqual(['E_UNSAFE_CONTENT']);
    expect(codesOf('flowchart TD\n A@{ icon: "fa:user", label: "x" }')).toEqual(['E_UNSAFE_CONTENT']);
    expect(codesOf('flowchart TD\n A@{ shape: rounded, label: "x" }')).toEqual([]);
  });

  it('allows only literal fill, stroke, colour, and font declarations', () => {
    expect(codesOf('flowchart LR\n a --> b\n classDef hot fill:#f96,stroke:#333,stroke-width:2px,font-weight:bold\n style b stroke-dasharray:5 5,color:white\n linkStyle 0 interpolate basis stroke:red')).toEqual([]);
    for (const decl of ['classDef x position:fixed', 'style a transform:scale(2)', 'linkStyle 0 display:none', 'style a fill:url(https://x)', 'classDef y opacity:0', 'style a font-size:2px']) {
      expect([...new Set(codesOf(`flowchart LR\n a --> b\n ${decl}`))], decl).toEqual(['E_UNSAFE_CONTENT']);
    }
  });

  it('allows accTitle and accDescr', () => {
    expect(codesOf('flowchart LR\n accTitle: Orders\n accDescr: Where orders wait\n a --> b')).toEqual([]);
  });

  it('limits source size to 64 KiB', () => {
    expect(codesOf('flowchart LR\n a --> b\n' + '%% x\n'.repeat(14_000))).toEqual(['E_LIMIT']);
  });
});

describe('Mermaid name mapping (§9.12)', () => {
  it('lowercases ASCII letters and maps dots to underscores', () => {
    expect(mapMermaidName('Idle')).toBe('idle');
    expect(mapMermaidName('DB')).toBe('db');
    expect(mapMermaidName('n.x')).toBe('n_x');
    expect(mapMermaidName('Y-Z')).toBe('y-z');
    expect(mapMermaidName('1abc')).toBeUndefined();
    expect(mapMermaidName('café')).toBeUndefined();
  });
});

describe('Mermaid negative fixtures (§18.8) @R11', () => {
  const dir = join(ROOT, 'negative');
  const codes = readdirSync(dir).filter((code) => existsSync(join(dir, code, 'mermaid'))).sort();
  it('covers every Mermaid rejection family', () => {
    expect(codes).toEqual(['E_ID_DUPLICATE', 'E_LAYOUT_LIMIT', 'E_LIMIT', 'E_REF_BROKEN', 'E_SEMANTIC', 'E_SYNTAX', 'E_UNSAFE_CONTENT']);
  });
  for (const code of codes) {
    for (const name of readdirSync(join(dir, code, 'mermaid')).filter((f) => f.endsWith('.md')).sort()) {
      it(`${code}/mermaid/${name}`, () => {
        const { diagnostics } = analyze(readFileSync(join(dir, code, 'mermaid', name), 'utf8'));
        const errors = new Set(diagnostics.filter((d) => d.severity === 'error').map((d) => d.code));
        expect([...errors]).toEqual([code]);
      });
    }
  }
});

describe('Mermaid positive fixtures @R03 @R06 @R14', () => {
  for (const name of ['mermaid-flowchart', 'mermaid-state', 'mermaid-sequence', 'mermaid-er']) {
    const { parsed, model, diagnostics } = analyze(fixture(name));
    it(`${name} validates without diagnostics`, () => {
      expect(diagnostics).toEqual([]);
    });
    it(`${name} projects every target once, the source, and every relationship`, () => {
      const text = projectText(parsed);
      const ids = [...text.matchAll(/<!-- ex:target ([a-z][a-z0-9_-]*) -->/g)].map((m) => m[1]);
      expect(ids.sort()).toEqual([...model.targets.keys()].sort());
      expect(text).toContain('```mermaid\n');
      for (const r of model.relationships) {
        expect(text).toContain(`${model.targets.get(r.from)!.label} --[${r.kind}; ${r.label}]--> ${model.targets.get(r.to)!.label}`);
      }
    });
  }

  it('flowchart: nodes, a subgraph with members, explicit and derived edge IDs', () => {
    const { model } = analyze(fixture('mermaid-flowchart'));
    const figure = model.mermaid.get('fig')!;
    expect(figure.parsed).toBe(true);
    expect(figure.elements.map((e) => [e.id, e.kind, e.label, e.renderKey])).toEqual([
      ['orders_api', 'mermaid-node', 'Orders API v2', 'node:orders_api'],
      ['charge_queue', 'mermaid-node', 'Charge queue', 'node:charge_queue'],
      ['client', 'mermaid-node', '**Client** app', 'node:client'],
      ['backend', 'mermaid-group', 'Backend', 'group:backend'],
    ]);
    expect(figure.elements.find((e) => e.id === 'backend')!.members!.sort()).toEqual(['charge_queue', 'orders_api']);
    expect(figure.relationships.map((r) => [r.id, r.referenceable, r.renderKey])).toEqual([
      ['fig~orders_api~charge_queue~0', false, 'edge:L_orders_api_charge_queue_0'],
      ['e_submit', true, 'edge:e_submit'],
      ['fig~client~backend~0', false, 'edge:L_client_backend_0'],
    ]);
    // Elements share the figure's span and digest; the explicit edge is a target.
    const fig = model.targets.get('fig')!;
    for (const id of ['orders_api', 'backend', 'e_submit']) {
      const t = model.targets.get(id)!;
      expect(t.parentId).toBe('fig');
      expect(t.span).toEqual(fig.span);
      expect(t.bodySha256).toBe(fig.bodySha256);
      expect(t.inspectable).toBe(true);
    }
    expect(model.targets.has('fig~client~backend~0')).toBe(false);
  });

  it('state: pseudo-states are not targets; transitions keep the renderer index', () => {
    const { model } = analyze(fixture('mermaid-state'));
    const figure = model.mermaid.get('fig')!;
    expect(figure.elements.map((e) => [e.id, e.label])).toEqual([
      ['waiting', 'Waiting for capacity'],
      ['idle', 'Idle'],
      ['decide', 'decide'],
    ]);
    expect(figure.relationships.map((r) => [r.from, r.to, r.renderKey])).toEqual([
      ['idle', 'waiting', 'transition:1'],
      ['waiting', 'idle', 'transition:2'],
      ['idle', 'decide', 'transition:3'],
      ['decide', 'idle', 'transition:5'],
    ]);
  });

  it('sequence: messages map by raw record index; notes and blocks are not relationships', () => {
    const { model } = analyze(fixture('mermaid-sequence'));
    const figure = model.mermaid.get('fig')!;
    expect(figure.elements.map((e) => [e.id, e.label, e.renderKey])).toEqual([
      ['u', 'User', 'participant:U'],
      ['orders_api', 'Orders API', 'participant:orders_api'],
    ]);
    // Records: 0 autonumber, 1 POST, 2 note, 3 loop, 4 503, 5 end, 6 alt, 7 202, 8 else, 9 400, 10 end.
    expect(figure.relationships.map((r) => [r.label, r.renderKey])).toEqual([
      ['POST /orders', 'message:1'],
      ['503', 'message:4'],
      ['202 Accepted', 'message:7'],
      ['400', 'message:9'],
    ]);
  });

  it('other types are one figure-level target', () => {
    const { model } = analyze(fixture('mermaid-er'));
    const figure = model.mermaid.get('fig')!;
    expect(figure).toMatchObject({ diagramType: 'other', declaredType: 'erDiagram', parsed: false, elements: [], relationships: [] });
    expect([...model.targets.keys()]).toEqual(['overview', 'fig']);
    expect(projectText(analyze(fixture('mermaid-er')).parsed)).toContain('Figure-level Mermaid diagram');
  });
});

describe('no regression for documents without Mermaid', () => {
  const examples = new URL('../../examples/', import.meta.url).pathname;
  for (const name of readdirSync(examples).filter((n) => existsSync(join(examples, n, 'index.md')))) {
    const source = readFileSync(join(examples, name, 'index.md'), 'utf8');
    if (source.includes('{% mermaid')) continue;
    it(`${name}: target set equals the parsed targets, with no Mermaid figures`, () => {
      const { parsed, model } = analyze(source);
      expect(model.mermaid.size).toBe(0);
      expect([...model.targets.keys()]).toEqual(parsed.targets.map((t) => t.id));
    });
  }
});

describe('editing targets inside a Mermaid figure (§9.12, §11.9)', () => {
  function repoWith(name: string) {
    const repo = mkdtempSync(join(tmpdir(), 'explain-mermaid-'));
    mkdirSync(join(repo, '.git'));
    const docDir = join(repo, 'docs/explanations/fig');
    mkdirSync(docDir, { recursive: true });
    const doc = join(docDir, 'index.md');
    copyFileSync(join(ROOT, 'positive', `${name}.md`), doc);
    return { repo, doc };
  }

  it('refs replace refuses a packet for a node inside the fence', () => {
    const { repo, doc } = repoWith('mermaid-flowchart');
    const { packet } = showReference(doc, 'orders_api', { repoRoot: repo });
    const revision = loadBundle(doc).sourceRevision!;
    expect(() => replaceTarget(packet, new TextEncoder().encode('x\n'), revision, { repoRoot: repo })).toThrow(/edit the figure/);
    try {
      replaceTarget(packet, new TextEncoder().encode('x\n'), revision, { repoRoot: repo });
    } catch (error) {
      expect((error as { code: string }).code).toBe('E_REF_INVALID');
    }
  });

  it('replacing the figure keeps nested Mermaid IDs, or fails with E_ID_RETENTION', () => {
    const { repo, doc } = repoWith('mermaid-flowchart');
    const { packet } = showReference(doc, 'fig', { repoRoot: repo });
    const bundle = loadBundle(doc);
    const span = bundle.model.targets.get('fig')!.span;
    const original = readFileSync(doc, 'utf8').slice(span.startByte, span.endByte);
    const dropped = original.replace(/ {2}client --> backend\n/, '').replace(/client\["`\*\*Client\*\* app`"\] e_submit@-->\|POST \/orders\| orders_api\n/, '');
    expect(() => replaceTarget(packet, new TextEncoder().encode(dropped), bundle.sourceRevision!, { repoRoot: repo })).toThrow(/drops nested target (client|e_submit)/);
    const relabelled = original.replace('|enqueue|', '|enqueue a charge|');
    const edit = replaceTarget(packet, new TextEncoder().encode(relabelled), bundle.sourceRevision!, { repoRoot: repo });
    expect(edit.changedTargets).toContain('fig');
    expect(readFileSync(doc, 'utf8')).toContain('|enqueue a charge|');
  });
});

describe('parse limits (§9.12)', () => {
  afterEach(() => {
    setMermaidWorkerPath(WORKER);
    setMermaidParseTimeout(30_000);
    clearMermaidParseCache();
  });

  it('a worker that exceeds the wall clock gives E_LIMIT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'explain-sleep-'));
    const sleeper = join(dir, 'sleep.mjs');
    writeFileSync(sleeper, 'setTimeout(() => {}, 60_000);\n');
    chmodSync(sleeper, 0o644);
    setMermaidWorkerPath(sleeper);
    setMermaidParseTimeout(500);
    const out = resolveMermaidFigures([{ figureId: 'f', source: 'flowchart LR\n a --> b' }]);
    expect(out.get('f')!.issues.map((i) => i.code)).toEqual(['E_LIMIT']);
  });

  it('a crashing worker gives E_SEMANTIC, not a pass', () => {
    const dir = mkdtempSync(join(tmpdir(), 'explain-crash-'));
    const crasher = join(dir, 'crash.mjs');
    writeFileSync(crasher, 'process.exit(7);\n');
    setMermaidWorkerPath(crasher);
    const out = resolveMermaidFigures([{ figureId: 'f', source: 'flowchart LR\n a --> b' }]);
    expect(out.get('f')!.issues.map((i) => i.code)).toEqual(['E_SEMANTIC']);
    expect(out.get('f')!.figure.elements).toEqual([]);
  });

  it('rejected content is never parsed', () => {
    setMermaidWorkerPath('/nonexistent/worker.mjs');
    const out = resolveMermaidFigures([{ figureId: 'f', source: 'flowchart LR\n click a href "https://x"\n a --> b' }]);
    expect(out.get('f')!.issues.map((i) => i.code)).toEqual(['E_UNSAFE_CONTENT']);
  });
});
