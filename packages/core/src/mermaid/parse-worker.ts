// Mermaid parse worker (§9.12). Runs in its own Node process, started with
// spawnSync by parse.ts: reads {figures:[{figureId, source, type}]} as JSON on
// stdin and writes {results:[…]} as JSON on stdout. It extracts structure only.
//
// DOMPurify needs a DOM, which the build does not have. In source mode a resolve
// hook maps `dompurify` to a stub; the release bundle aliases it at build time.
import { registerHooks } from 'node:module';
import type { MermaidDiagramType } from './types.ts';

export type RawFlowchart = {
  vertices: Array<{ id: string; text: unknown; labelType?: string }>;
  edges: Array<{ id: string; start: string; end: string; text: unknown; userDefinedId: boolean }>;
  subgraphs: Array<{ id: string; title: unknown; nodes: string[] }>;
};
export type RawState = {
  states: Array<{ id: string; type: string; description: string | undefined; composite: boolean }>;
  relations: Array<{ from: string; to: string; title: unknown }>;
};
export type RawSequence = {
  actors: Array<{ name: string; description: unknown; type: string }>;
  messages: Array<{ index: number; type: number; from: string | undefined; to: string | undefined; message: unknown }>;
};
export type RawResult =
  | { figureId: string; ok: true; type: MermaidDiagramType; flowchart?: RawFlowchart; state?: RawState; sequence?: RawSequence }
  | { figureId: string; ok: false; error: string };

type Input = { figures: Array<{ figureId: string; source: string; type: MermaidDiagramType }> };

function installStub(): void {
  let here: string | undefined;
  try {
    here = import.meta.url;
  } catch {
    here = undefined;
  }
  if (!here) return; // bundled: `dompurify` is aliased at build time
  const stub = new URL('./dompurify-stub.ts', here).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'dompurify') return { url: stub, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

type Db = Record<string, (...args: unknown[]) => unknown>;

function extract(type: MermaidDiagramType, db: Db): Omit<Extract<RawResult, { ok: true }>, 'figureId' | 'ok' | 'type'> {
  if (type === 'flowchart') {
    const vertices = [...(db['getVertices']!() as Map<string, Record<string, unknown>>).values()];
    const edges = db['getEdges']!() as Array<Record<string, unknown>>;
    const subgraphs = (db['getSubGraphs']?.() ?? []) as Array<Record<string, unknown>>;
    return {
      flowchart: {
        vertices: vertices.map((v) => ({ id: String(v['id']), text: v['text'], labelType: typeof v['labelType'] === 'string' ? v['labelType'] : undefined })),
        edges: edges.map((e) => ({ id: String(e['id']), start: String(e['start']), end: String(e['end']), text: e['text'], userDefinedId: e['isUserDefinedId'] === true })),
        subgraphs: subgraphs.map((s) => ({ id: String(s['id']), title: s['title'], nodes: (s['nodes'] as unknown[] ?? []).map(String) })),
      },
    };
  }
  if (type === 'state') {
    const states = [...(db['getStates']!() as Map<string, Record<string, unknown>>).values()];
    const relations = db['getRelations']!() as Array<Record<string, unknown>>;
    return {
      state: {
        states: states.map((s) => ({
          id: String(s['id']),
          type: String(s['type'] ?? 'default'),
          description: Array.isArray(s['descriptions']) && typeof s['descriptions'][0] === 'string' ? s['descriptions'][0] : undefined,
          composite: s['doc'] !== undefined && s['doc'] !== null,
        })),
        relations: relations.map((r) => ({ from: String(r['id1']), to: String(r['id2']), title: r['relationTitle'] })),
      },
    };
  }
  const actors = [...(db['getActors']!() as Map<string, Record<string, unknown>>).values()];
  const messages = db['getMessages']!() as Array<Record<string, unknown>>;
  return {
    sequence: {
      actors: actors.map((a) => ({ name: String(a['name']), description: a['description'], type: String(a['type'] ?? 'participant') })),
      messages: messages.map((m, index) => ({
        index,
        type: Number(m['type']),
        from: typeof m['from'] === 'string' ? m['from'] : undefined,
        to: typeof m['to'] === 'string' ? m['to'] : undefined,
        message: m['message'],
      })),
    },
  };
}

async function main(): Promise<void> {
  // Mermaid may log; keep stdout for the JSON result only.
  console.log = (...args: unknown[]) => console.error(...args);
  installStub();
  const input = JSON.parse(await readStdin()) as Input;
  const { default: mermaid } = (await import('mermaid')) as unknown as {
    default: { initialize(c: object): void; parse(t: string): Promise<unknown>; mermaidAPI: { getDiagramFromText(t: string): Promise<{ db: Db }> } };
  };
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', logLevel: 'fatal' });
  const results: RawResult[] = [];
  for (const figure of input.figures) {
    try {
      await mermaid.parse(figure.source); // also registers the diagram type
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(figure.source);
      results.push({ figureId: figure.figureId, ok: true, type: figure.type, ...extract(figure.type, diagram.db) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ figureId: figure.figureId, ok: false, error: message.split('\n').slice(0, 4).join(' ') });
    }
  }
  process.stdout.write(JSON.stringify({ results }));
}

main().catch((error: unknown) => {
  process.stderr.write(`mermaid parse worker failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
