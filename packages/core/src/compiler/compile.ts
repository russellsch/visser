// Static compiler (§7.2, §9, §10, §13.1, §13.2). Renders a loaded bundle into
// deterministic HTML/SVG per the DOM contract (dom-contract.ts), plus the
// semantic Markdown projection and public build metadata.
import type { Diagnostic, TargetRecord } from '../types.ts';
import type { LoadedBundle } from '../model/bundle.ts';
import type { MNode } from '../model/targets.ts';
import { projectText } from '../model/project.ts';
import { buildId as computeBuildId, canonicalJSON, HashError, normalizedTextSha256, sha256Hex } from '../model/hash.ts';
import { DOM } from './dom-contract.ts';
import { checkLink, h, hasBidiControls, render, UnsafeMarkupError, visibleBidi, type Child, type HNode } from './html.ts';
import { layoutGraph, type GraphInput, type GraphLayout, type LayoutFunction } from './layout.ts';
import { graphSvg } from './svg.ts';

export type Toolkit = {
  version: string;
  sha256: string;
  // Optional digests of shipped browser assets (path -> hex sha256), used for
  // integrity attributes and the manifest's asset list.
  assets?: Record<string, string>;
};

export type CompileOptions = {
  audience: 'private' | 'public';
  includeSource: boolean;
  layoutFallback: boolean;
  layout?: LayoutFunction;
  nodeVersion?: string; // recorded in build.json when given (§7.5)
};

export type OutputFile = { path: string; bytes: Uint8Array; mediaType: string };

export type BuildManifest = {
  schema: 'explain-build/1';
  docId: string;
  sourceRevision: string;
  buildId: string;
  toolkitVersion: string;
  toolkitSha256: string;
  effectiveRenderOptions: { audience: 'private' | 'public'; includeSource: boolean; layoutFallback: boolean };
  nodeVersion?: string;
  sourceFiles: Array<{ path: string; sha256: string }>;
  outputFiles: Array<{ path: string; sha256: string; mediaType: string }>;
  assets: Array<{ packSha256: string; path: string; sha256?: string }>;
};

export type CompileResult = {
  docId: string;
  sourceRevision: string;
  buildId: string;
  directory: string; // d/DOC/REV/BUILD
  files: OutputFile[];
  manifest: BuildManifest;
  diagnostics: Diagnostic[];
};

export class CompileError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`).join('\n'));
    this.diagnostics = diagnostics;
  }
}

export const GRAPH_WARN_NODES = 25;
export const GRAPH_MAX_NODES = 200;
export const GRAPH_MAX_EDGES = 400;

const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "font-src 'none'",
  "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'",
].join('; ');

const ENTITY_KINDS = new Set(['definition', 'source', 'detail']);
const COMPONENTS = new Set(['graph', 'trace', 'annotated']);
const TEXT_MEDIA: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

const encoder = new TextEncoder();

function attrString(node: MNode, name: string): string | undefined {
  const v = node.attributes[name];
  return typeof v === 'string' ? v : undefined;
}

function integrity(hex: string): string {
  return `sha256-${Buffer.from(hex, 'hex').toString('base64')}`;
}

class Renderer {
  readonly diagnostics: Diagnostic[] = [];
  readonly bundle: LoadedBundle;
  readonly targets: Map<string, TargetRecord>;
  readonly nodes: Map<string, MNode>;
  readonly targetOfNode = new Map<MNode, string>();
  readonly citationNumber = new Map<string, number>();
  readonly images = new Map<string, OutputFile>(); // bundle path -> output asset
  readonly layout: LayoutFunction;
  readonly options: CompileOptions;

  constructor(bundle: LoadedBundle, options: CompileOptions) {
    this.bundle = bundle;
    this.targets = bundle.model.targets;
    this.nodes = bundle.model.nodes;
    this.options = options;
    this.layout = options.layout ?? layoutGraph;
    for (const [id, node] of this.nodes) this.targetOfNode.set(node, id);
    let n = 0;
    for (const record of this.targets.values()) if (record.kind === 'source') this.citationNumber.set(record.id, ++n);
  }

  error(code: string, message: string, targetId?: string) {
    this.diagnostics.push({ code, severity: 'error', message, path: 'index.md', ...(targetId ? { targetId } : {}) });
  }

  warn(code: string, message: string, targetId?: string) {
    this.diagnostics.push({ code, severity: 'warning', message, path: 'index.md', ...(targetId ? { targetId } : {}) });
  }

  /** Label or prose text with bidi controls made visible (§15.2). */
  safeText(s: string, targetId?: string): string {
    if (hasBidiControls(s)) {
      this.warn('W_UNSAFE_TEXT', 'bidirectional control characters rendered as visible escapes', targetId);
      return visibleBidi(s);
    }
    return s;
  }

  canonical(id: string): Record<string, string> {
    const r = this.targets.get(id)!;
    return {
      id: DOM.canonicalId(id),
      [DOM.attr.target]: id,
      [DOM.attr.body]: r.bodySha256,
      [DOM.attr.kind]: r.kind,
      [DOM.attr.label]: this.safeText(r.label, id),
    };
  }

  label(id: string): string {
    return this.safeText(this.targets.get(id)?.label ?? id, id);
  }

  isTargetNode(node: MNode): boolean {
    return this.targetOfNode.has(node);
  }

  // --- Inline content ------------------------------------------------------

  inlines(node: MNode): Child[] {
    return node.children.map((c) => this.inline(c));
  }

  inline(node: MNode): Child {
    switch (node.type) {
      case 'text': return this.safeText(String(node.attributes['content'] ?? ''));
      case 'code': return h('code', {}, this.safeText(String(node.attributes['content'] ?? '')));
      case 'softbreak': return '\n';
      case 'hardbreak': return h('br');
      case 'em': return h('em', {}, this.inlines(node));
      case 'strong': return h('strong', {}, this.inlines(node));
      case 's': return h('span', { class: 'ex-strike' }, this.inlines(node));
      case 'inline': return this.inlines(node);
      case 'link': return this.link(node);
      case 'image': return this.image(node);
      case 'tag': return this.inlineTag(node);
      default: return this.inlines(node);
    }
  }

  link(node: MNode): Child {
    const href = attrString(node, 'href') ?? '';
    const check = checkLink(href);
    if (!check.ok) {
      this.error('E_UNSAFE_CONTENT', `link rejected (${check.reason})`);
      return this.inlines(node);
    }
    return h('a', { href: check.href, rel: check.external ? 'noopener noreferrer' : undefined }, this.inlines(node));
  }

  image(node: MNode): Child {
    const src = attrString(node, 'src') ?? '';
    const file = this.bundle.files.find((f) => f.path === src && f.kind === 'binary');
    if (!file) {
      this.error('E_REF_BROKEN', `image ${src} is not a declared bundle image`);
      return null;
    }
    const ext = (src.split('.').pop() ?? '').toLowerCase();
    const media = TEXT_MEDIA[ext];
    if (!media || !magicMatches(file.content, ext)) {
      this.error('E_UNSAFE_CONTENT', `image ${src} is not a PNG, JPEG, or WebP file`);
      return null;
    }
    const name = `assets/${sha256Hex(file.content)}.${ext === 'jpeg' ? 'jpg' : ext}`;
    this.images.set(src, { path: name, bytes: file.content, mediaType: media });
    return h('img', { src: name, alt: attrString(node, 'alt') ?? '' });
  }

  inlineTag(node: MNode): Child {
    const children = this.inlines(node);
    switch (node.tag) {
      case 'term': {
        const ref = attrString(node, 'ref')!;
        const text = children.length > 0 ? children : this.label(ref);
        return h('a', { class: 'ex-term', href: `#${DOM.canonicalId(ref)}`, [DOM.attr.term]: ref }, text);
      }
      case 'cite': {
        const ref = attrString(node, 'ref')!;
        const n = this.citationNumber.get(ref);
        return h('a', { class: 'ex-cite', href: `#${DOM.canonicalId(ref)}`, title: this.label(ref), [DOM.attr.generated]: true }, `[${n ?? ref}]`);
      }
      case 'focus': {
        const ids = Array.isArray(node.attributes['targets']) ? (node.attributes['targets'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
        return h('a', { class: 'ex-focus', href: `#${DOM.canonicalId(ids[0] ?? '')}`, [DOM.attr.focus]: ids.join(' ') }, children);
      }
      case 'detail-link': {
        const ref = attrString(node, 'ref')!;
        return h('a', { class: 'ex-detail-link', href: `#${DOM.canonicalId(ref)}` }, children.length > 0 ? children : this.label(ref));
      }
      default:
        return children;
    }
  }

  // --- Ordinary blocks -----------------------------------------------------

  block(node: MNode): Child {
    switch (node.type) {
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(node.attributes['level'] ?? 1)));
        return h(`h${level}`, {}, this.inlines(node));
      }
      case 'paragraph': return h('p', {}, this.inlines(node));
      case 'inline': return h('p', {}, this.inlines(node));
      case 'fence': return this.fence(node);
      case 'hr': return h('hr');
      case 'blockquote': return h('blockquote', {}, this.blocks(node));
      case 'list': {
        const ordered = node.attributes['ordered'] === true;
        const start = node.attributes['start'];
        return h(ordered ? 'ol' : 'ul', { start: ordered && typeof start === 'number' && start !== 1 ? start : undefined }, node.children.map((item) => h('li', {}, this.blocks(item))));
      }
      case 'item': return h('li', {}, this.blocks(node));
      case 'table': return h('table', {}, this.blocks(node));
      case 'thead': return h('thead', {}, this.blocks(node));
      case 'tbody': return h('tbody', {}, this.blocks(node));
      case 'tr': return h('tr', {}, this.blocks(node));
      case 'th': return h('th', { scope: 'col', align: tableAlign(node) }, this.inlines(node));
      case 'td': return h('td', { align: tableAlign(node) }, this.inlines(node));
      case 'comment': return null;
      case 'tag': return null; // entity tags render in their own places
      default: return this.blocks(node);
    }
  }

  blocks(node: MNode): Child[] {
    return node.children.filter((c) => !this.isTargetNode(c)).map((c) => (c.type === 'inline' ? this.inlines(c) : this.block(c)));
  }

  fence(node: MNode): HNode {
    const language = attrString(node, 'language');
    const content = String(node.attributes['content'] ?? '');
    return h('pre', { class: 'ex-fence' }, h('code', { class: language ? `language-${language.replace(/[^a-z0-9_+-]/gi, '')}` : undefined }, this.safeText(content)));
  }

  // --- Components ----------------------------------------------------------

  figureShell(id: string, node: MNode, kindClass: string, content: Child[]): HNode {
    const question = attrString(node, 'question') ?? '';
    const title = attrString(node, 'title') ?? this.label(id);
    return h('figure', { class: `ex-figure ${kindClass}`, ...this.canonical(id), [DOM.attr.question]: question, 'aria-describedby': `ex-q-${id}` },
      h('figcaption', {}, this.safeText(title, id)),
      h('p', { id: `ex-q-${id}`, class: 'ex-sr' }, this.safeText(question, id)),
      this.blocks(node),
      content,
    );
  }

  childTargets(id: string): TargetRecord[] {
    return [...this.targets.values()].filter((t) => t.parentId === id);
  }

  relationship(id: string) {
    return this.bundle.model.relationships.find((r) => r.id === id);
  }

  async graph(id: string, node: MNode): Promise<HNode> {
    const children = this.childTargets(id);
    const edges = children.filter((c) => this.relationship(c.id) !== undefined);
    const groups = children.filter((c) => c.kind === 'group');
    const nodes = children.filter((c) => !edges.includes(c) && c.kind !== 'group');
    if (nodes.length > GRAPH_MAX_NODES || edges.length > GRAPH_MAX_EDGES) {
      this.error('E_LAYOUT_LIMIT', `graph ${id} has ${nodes.length} nodes and ${edges.length} edges; the cap is ${GRAPH_MAX_NODES}/${GRAPH_MAX_EDGES}`, id);
    } else if (nodes.length > GRAPH_WARN_NODES) {
      this.warn('W_VISUAL_DENSITY', `graph ${id} has ${nodes.length} visible nodes`, id);
    }
    const input: GraphInput = {
      id,
      groups: groups.map((g) => {
        const parent = attrString(this.nodes.get(g.id)!, 'parent');
        return { id: g.id, label: this.label(g.id), ...(parent ? { parent } : {}) };
      }),
      nodes: nodes.map((n) => {
        const group = attrString(this.nodes.get(n.id)!, 'group');
        return { id: n.id, label: this.label(n.id), ...(group ? { group } : {}) };
      }),
      edges: edges.map((e) => {
        const r = this.relationship(e.id)!;
        return { id: e.id, from: r.from, to: r.to, label: this.label(e.id) };
      }),
    };

    let layout: GraphLayout | undefined;
    if (!this.diagnostics.some((d) => d.code === 'E_LAYOUT_LIMIT' && d.targetId === id)) {
      try {
        layout = await this.layout(input);
      } catch (error) {
        const code = (error as { code?: string }).code === 'E_LAYOUT_TIMEOUT' ? 'E_LAYOUT_TIMEOUT' : 'E_LAYOUT_LIMIT';
        if (this.options.layoutFallback) this.warn('W_LAYOUT_FALLBACK', `layout of ${id} failed; showing the relationship list only (${(error as Error).message})`, id);
        else this.error(code, `layout of ${id} failed: ${(error as Error).message}`, id);
      }
    }

    const roles = new Map(nodes.map((n) => [n.id, attrString(this.nodes.get(n.id)!, 'role')]));
    const kinds = new Map(edges.map((e) => [e.id, this.relationship(e.id)!.kind]));
    const svg = layout ? graphSvg({ figureId: id, title: attrString(node, 'title') ?? this.label(id), layout, labelOf: (x) => this.label(x), roleOf: (x) => roles.get(x), kindOf: (x) => kinds.get(x), relationship: (x) => this.relationship(x) }) : null;

    const relList = h('ol', { class: 'ex-rel-list', 'aria-label': 'Relationships' },
      edges.map((e) => {
        const r = this.relationship(e.id)!;
        return h('li', {},
          h('a', { href: `#${DOM.canonicalId(e.id)}`, id: DOM.listInstanceId(id, e.id), [DOM.attr.target]: e.id, [DOM.attr.rel]: e.id, [DOM.attr.interactive]: true },
            this.label(r.from), h('span', { [DOM.attr.generated]: true }, ' \u2192 '), this.label(e.id), h('span', { [DOM.attr.generated]: true }, ' \u2192 '), this.label(r.to)),
          h('span', { class: 'ex-rel-kind', [DOM.attr.generated]: true }, ` (${r.kind}${r.basis ? `; ${r.basis}` : ''})`));
      }));
    const nodeList = h('ul', { class: 'ex-node-list', 'aria-label': 'Elements' },
      [...groups, ...nodes].map((n) => h('li', {},
        h('a', { href: `#${DOM.canonicalId(n.id)}`, id: DOM.listInstanceId(id, n.id), [DOM.attr.target]: n.id, [DOM.attr.interactive]: true }, this.label(n.id)),
        roles.get(n.id) ? h('span', { class: 'ex-role', [DOM.attr.generated]: true }, ` (${roles.get(n.id)})`) : null)));

    return this.figureShell(id, node, 'ex-graph', [
      svg ? h('div', { class: 'ex-viewport', [DOM.attr.viewport]: true }, svg) : null,
      nodeList,
      relList,
    ]);
  }

  trace(id: string, node: MNode): HNode {
    const children = this.childTargets(id);
    const actors = children.filter((c) => c.kind === 'actor');
    const events = children.filter((c) => c.kind === 'event');
    const branches = children.filter((c) => c.kind === 'branch');
    const scale = attrString(node, 'scale') ?? 'ordinal';
    const timeUnit = attrString(node, 'timeUnit');
    const scaleNote = scale === 'ordinal'
      ? h('p', { class: 'ex-trace-scale', [DOM.attr.generated]: true }, 'Ordering, not duration.')
      : h('p', { class: 'ex-trace-scale', [DOM.attr.generated]: true }, `Time scale${timeUnit ? ` in ${timeUnit}` : ''}.`);
    const actorList = h('ul', { class: 'ex-actor-list', 'aria-label': 'Actors' },
      actors.map((a) => {
        const entity = attrString(this.nodes.get(a.id)!, 'entity');
        return h('li', {},
          h('a', { href: `#${DOM.canonicalId(a.id)}`, id: DOM.listInstanceId(id, a.id), [DOM.attr.target]: a.id, [DOM.attr.interactive]: true }, this.label(a.id)),
          entity ? h('span', { class: 'ex-entity', [DOM.attr.generated]: true }, ' (', h('a', { href: `#${DOM.canonicalId(entity)}` }, this.label(entity)), ')') : null);
      }));
    const eventList = h('ol', { class: 'ex-trace-events', 'aria-label': 'Events in authored order' },
      events.map((e) => {
        const en = this.nodes.get(e.id)!;
        const actor = attrString(en, 'actor');
        const kind = attrString(en, 'kind') ?? 'event';
        const branch = attrString(en, 'branch');
        const time = en.attributes['time'];
        const orders = this.bundle.model.relationships.filter((r) => r.kind === 'order' && r.to === e.id);
        return h('li', { class: `ex-event ex-kind-${kind}` },
          h('a', { href: `#${DOM.canonicalId(e.id)}`, id: DOM.listInstanceId(id, e.id), [DOM.attr.target]: e.id, [DOM.attr.interactive]: true },
            actor ? h('span', { class: 'ex-actor', [DOM.attr.generated]: true }, `${this.label(actor)}: `) : null,
            this.label(e.id)),
          h('span', { class: 'ex-event-kind', [DOM.attr.generated]: true }, ` [${kind}]`),
          scale === 'time' && time !== undefined ? h('span', { class: 'ex-event-time', [DOM.attr.generated]: true }, ` at ${String(time)}${timeUnit ? ` ${timeUnit}` : ''}`) : null,
          branch ? h('span', { class: 'ex-event-branch', [DOM.attr.generated]: true }, ` branch: ${this.label(branch)}`) : null,
          orders.length > 0
            ? h('span', { class: 'ex-after', [DOM.attr.generated]: true }, ' after: ',
                orders.map((r, i) => [i > 0 ? ', ' : '', h('a', { href: `#${DOM.canonicalId(r.from)}`, id: DOM.listInstanceId(id, r.id), [DOM.attr.target]: e.id, [DOM.attr.rel]: r.id }, this.label(r.from))]))
            : null);
      }));
    const branchList = branches.length > 0
      ? h('ul', { class: 'ex-branch-list', 'aria-label': 'Branches' }, branches.map((b) => h('li', {},
          h('a', { href: `#${DOM.canonicalId(b.id)}`, id: DOM.listInstanceId(id, b.id), [DOM.attr.target]: b.id, [DOM.attr.interactive]: true }, this.label(b.id)))))
      : null;
    return this.figureShell(id, node, 'ex-trace', [scaleNote, actorList, branchList, eventList]);
  }

  /** Captured text of a source target: its fenced body, or a declared text asset. */
  sourceText(sourceId: string): { text: string; language?: string } | undefined {
    const node = this.nodes.get(sourceId);
    if (!node) return undefined;
    const fence = node.children.find((c) => c.type === 'fence');
    if (fence) {
      const language = attrString(fence, 'language') ?? attrString(node, 'language');
      return { text: String(fence.attributes['content'] ?? ''), ...(language ? { language } : {}) };
    }
    const asset = attrString(node, 'asset');
    const file = asset ? this.bundle.files.find((f) => f.path === asset && f.kind === 'text') : undefined;
    if (file) {
      const language = attrString(node, 'language');
      return { text: new TextDecoder().decode(file.content), ...(language ? { language } : {}) };
    }
    return undefined;
  }

  codeLines(sourceId: string, text: string, marks: Map<number, string[]>, figureId?: string): HNode {
    const start = Number(this.nodes.get(sourceId)?.attributes['start'] ?? 1);
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    return h('pre', { class: 'ex-code' }, h('code', {}, lines.map((line, i) => {
      const number = start + i;
      const annotations = marks.get(number) ?? [];
      return h('span', { class: annotations.length > 0 ? 'ex-line ex-annotated' : 'ex-line' },
        h('span', { class: 'ex-ln', [DOM.attr.generated]: true }, String(number)),
        figureId ? annotations.map((a) => h('a', { class: 'ex-annotation-marker', href: `#${DOM.canonicalId(a)}`, id: DOM.svgInstanceId(figureId, `${a}.${number}`), [DOM.attr.target]: a, [DOM.attr.interactive]: true, [DOM.attr.generated]: true, 'aria-label': this.label(a) }, '\u25cf')) : null,
        this.safeText(line, sourceId),
        '\n');
    })));
  }

  annotated(id: string, node: MNode): HNode {
    const sourceId = attrString(node, 'source') ?? '';
    const captured = this.sourceText(sourceId);
    const annotations = this.childTargets(id).filter((c) => c.kind === 'annotation');
    const start = Number(this.nodes.get(sourceId)?.attributes['start'] ?? 1);
    const marks = new Map<number, string[]>();
    for (const a of annotations) {
      const range = this.nodes.get(a.id)!.attributes['lines'];
      if (!Array.isArray(range) || range.length !== 2) continue;
      const [from, to] = range as number[];
      const count = captured ? captured.text.replace(/\n$/, '').split('\n').length : 0;
      if (from === undefined || to === undefined || from < start || to < from || to > start + count - 1) {
        this.error('E_REF_BROKEN', `annotation ${a.id} lines ${from}-${to} are outside source ${sourceId}`, a.id);
        continue;
      }
      for (let n = from; n <= to; n++) marks.set(n, [...(marks.get(n) ?? []), ...(n === from ? [a.id] : [])]);
    }
    if (!captured) this.error('E_REF_BROKEN', `annotated ${id} needs a captured text source; ${sourceId} has none`, id);
    const list = h('ol', { class: 'ex-annotation-list', 'aria-label': 'Annotations' }, annotations.map((a) => {
      const range = this.nodes.get(a.id)!.attributes['lines'];
      const where = Array.isArray(range) ? `Lines ${range.join('\u2013')}: ` : '';
      return h('li', {},
        h('a', { href: `#${DOM.canonicalId(a.id)}`, id: DOM.listInstanceId(id, a.id), [DOM.attr.target]: a.id, [DOM.attr.interactive]: true },
          h('span', { [DOM.attr.generated]: true }, where), this.label(a.id)));
    }));
    return this.figureShell(id, node, 'ex-annotated', [
      h('p', { class: 'ex-annotated-source', [DOM.attr.generated]: true }, 'Source: ', h('a', { href: `#${DOM.canonicalId(sourceId)}` }, this.label(sourceId))),
      captured ? h('div', { class: 'ex-viewport', [DOM.attr.viewport]: true }, this.codeLines(sourceId, captured.text, marks, id)) : null,
      list,
    ]);
  }

  // --- Appendix -------------------------------------------------------------

  evidence(id: string): Child {
    const ids = this.relationship(id)?.evidenceIds ?? [];
    if (ids.length === 0) return null;
    return h('p', { class: 'ex-evidence' }, h('span', { [DOM.attr.generated]: true }, 'Evidence: '),
      ids.map((s, i) => [i > 0 ? ', ' : '', h('a', { href: `#${DOM.canonicalId(s)}` }, this.label(s))]));
  }

  sourceDetail(id: string, node: MNode): Child[] {
    const availability = attrString(node, 'availability') ?? 'captured';
    const captured = this.sourceText(id);
    let verification = 'link-only';
    if (availability !== 'link-only') {
      const expected = attrString(node, 'excerptSha256');
      if (!captured) {
        this.error('E_EVIDENCE_HASH', `source ${id} has no captured excerpt`, id);
        verification = 'missing';
      } else if (!expected) {
        this.error('E_EVIDENCE_HASH', `source ${id} has no excerptSha256`, id);
        verification = 'missing';
      } else if (normalizedTextSha256(encoder.encode(captured.text)) !== expected) {
        this.error('E_EVIDENCE_HASH', `captured excerpt of ${id} does not match its excerptSha256`, id);
        verification = 'mismatch';
      } else {
        verification = 'capture-consistent';
      }
    }
    const meta: Array<[string, Child]> = [];
    for (const key of ['kind', 'repository', 'commit', 'baseCommit', 'file', 'symbol', 'capturedAt', 'excerptSha256']) {
      const v = node.attributes[key];
      if (v !== undefined) meta.push([key, this.safeText(String(v), id)]);
    }
    const start = node.attributes['start'], end = node.attributes['end'];
    if (start !== undefined && end !== undefined) meta.push(['lines', `${String(start)}\u2013${String(end)}`]);
    meta.push(['availability', availability]);
    meta.push(['verification', verification]);
    const url = attrString(node, 'url');
    if (url) {
      const check = checkLink(url);
      if (check.ok) meta.push(['origin', h('a', { href: check.href, rel: check.external ? 'noopener noreferrer' : undefined }, url)]);
      else this.error('E_UNSAFE_CONTENT', `source ${id} url rejected (${check.reason})`, id);
    }
    return [
      h('dl', { class: 'ex-source-meta', [DOM.attr.generated]: true }, meta.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      captured ? this.codeLines(id, captured.text, new Map()) : h('p', { class: 'ex-link-only', [DOM.attr.generated]: true }, 'No captured excerpt; this origin link is not self-contained evidence.'),
    ];
  }

  detail(record: TargetRecord): HNode {
    const node = this.nodes.get(record.id)!;
    const specifics: Child[] = [];
    const r = this.relationship(record.id);
    if (r && r.kind !== 'message') {
      specifics.push(h('p', { class: 'ex-rel-statement' },
        h('a', { href: `#${DOM.canonicalId(r.from)}` }, this.label(r.from)),
        h('span', { [DOM.attr.generated]: true }, ` \u2192 ${r.kind}: `), this.label(record.id), h('span', { [DOM.attr.generated]: true }, ' \u2192 '),
        h('a', { href: `#${DOM.canonicalId(r.to)}` }, this.label(r.to))));
    }
    switch (record.kind) {
      case 'node': case 'state': case 'factor': case 'task': case 'stage': {
        const role = attrString(node, 'role') ?? attrString(node, 'basis') ?? attrString(node, 'status');
        if (role) specifics.push(h('p', { class: 'ex-role', [DOM.attr.generated]: true }, role));
        break;
      }
      case 'actor': {
        const entity = attrString(node, 'entity');
        if (entity) specifics.push(h('p', { class: 'ex-entity' }, h('span', { [DOM.attr.generated]: true }, 'Represents '), h('a', { href: `#${DOM.canonicalId(entity)}` }, this.label(entity))));
        break;
      }
      case 'event': {
        const actor = attrString(node, 'actor');
        const orders = this.bundle.model.relationships.filter((x) => x.kind === 'order' && x.to === record.id);
        specifics.push(h('p', { class: 'ex-event-meta', [DOM.attr.generated]: true },
          `${attrString(node, 'kind') ?? 'event'}`, actor ? [' by ', h('a', { href: `#${DOM.canonicalId(actor)}` }, this.label(actor))] : null,
          orders.length > 0 ? [' after ', orders.map((o, i) => [i > 0 ? ', ' : '', h('a', { href: `#${DOM.canonicalId(o.from)}` }, this.label(o.from))])] : null));
        break;
      }
      case 'annotation': {
        const range = node.attributes['lines'];
        const owner = record.parentId ? attrString(this.nodes.get(record.parentId)!, 'source') : undefined;
        if (Array.isArray(range)) specifics.push(h('p', { class: 'ex-annotation-lines', [DOM.attr.generated]: true }, `Lines ${range.join('\u2013')}`, owner ? [' of ', h('a', { href: `#${DOM.canonicalId(owner)}` }, this.label(owner))] : null));
        break;
      }
    }
    const body = record.kind === 'source' ? this.sourceDetail(record.id, node) : this.blocks(node);
    return h('details', { class: `ex-detail ex-kind-${record.kind}`, ...this.canonical(record.id) },
      h('summary', {}, this.label(record.id), h('span', { class: 'ex-kind', [DOM.attr.generated]: true }, ` ${record.kind}`)),
      h('div', { class: 'ex-detail-body' }, specifics, body, this.evidence(record.id)));
  }

  // --- Page -----------------------------------------------------------------

  async main(): Promise<Child[]> {
    const ast = this.bundle.parsed.ast as MNode;
    const out: Child[] = [];
    for (const child of ast.children) {
      const id = this.targetOfNode.get(child);
      if (child.type === 'comment') continue;
      if (!id) {
        if (child.type === 'hr') out.push(h('hr'));
        continue;
      }
      const record = this.targets.get(id)!;
      if (ENTITY_KINDS.has(record.kind)) continue; // canonical form lives in the appendix
      if (record.kind === 'graph') out.push(await this.graph(id, child));
      else if (record.kind === 'trace') out.push(this.trace(id, child));
      else if (record.kind === 'annotated') out.push(this.annotated(id, child));
      else if (COMPONENTS.has(record.kind) || child.type === 'tag') {
        this.warn('W_UNSUPPORTED_COMPONENT', `${record.kind} rendering arrives in Phase 2; showing its text only`, id);
        out.push(h('div', { class: 'ex-block', ...this.canonical(id) }, this.blocks(child)));
      } else {
        out.push(h('div', { class: 'ex-block', ...this.canonical(id) }, this.block(child)));
      }
    }
    return out;
  }

  appendix(): HNode {
    const details = [...this.targets.values()].filter((r) => r.inspectable).map((r) => this.detail(r));
    return h('section', { id: DOM.appendix, 'aria-label': 'Details and evidence' },
      h('h2', { [DOM.attr.generated]: true }, 'Details and evidence'), details);
  }
}

function tableAlign(node: MNode): string | undefined {
  const a = node.attributes['align'];
  return a === 'left' || a === 'right' || a === 'center' ? a : undefined;
}

function magicMatches(bytes: Uint8Array, ext: string): boolean {
  const b = (i: number) => bytes[i];
  if (ext === 'png') return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  if (ext === 'jpg' || ext === 'jpeg') return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
  if (ext === 'webp') return b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50;
  return false;
}

function abbreviate(hex: string): string {
  return hex.slice(0, 12);
}

/** Compile one loaded bundle (§17.9 compileDocument). Throws CompileError on any error diagnostic. */
export async function compileDocument(bundle: LoadedBundle, toolkit: Toolkit, options: CompileOptions): Promise<CompileResult> {
  const upstream = bundle.diagnostics.filter((d) => d.severity === 'error');
  if (upstream.length > 0 || !bundle.docId || !bundle.sourceRevision || !bundle.manifest) {
    throw new CompileError(upstream.length > 0 ? bundle.diagnostics : [{ code: 'E_SYNTAX', severity: 'error', message: 'bundle has no docId or source revision', path: 'index.md' }]);
  }
  const effectiveRenderOptions = { audience: options.audience, includeSource: options.includeSource, layoutFallback: options.layoutFallback };
  let buildId: string;
  try {
    buildId = computeBuildId({ sourceRevision: bundle.sourceRevision, toolkitSha256: toolkit.sha256, extensionDigests: [], effectiveRenderOptions }).buildId;
  } catch (error) {
    if (error instanceof HashError) throw new CompileError([{ code: error.code, severity: 'error', message: error.message }]);
    throw error;
  }
  const docId = bundle.docId;
  const sourceRevision = bundle.sourceRevision;
  const directory = `d/${docId}/${sourceRevision}/${buildId}`;
  const r = new Renderer(bundle, options);

  let page: string;
  try {
    const mainContent = await r.main();
    const appendix = r.appendix();
    const fm = bundle.parsed.frontmatter;
    const title = typeof fm['title'] === 'string' ? fm['title'] : 'Explanation';
    const topLevel = [...r.targets.values()].filter((t) => t.parentId === undefined);
    const firstIsH1 = topLevel[0]?.kind === 'heading' && r.nodes.get(topLevel[0].id)?.attributes['level'] === 1;
    const assetBase = `../../../../_explain/assets/${toolkit.sha256}`;
    const jsSha = toolkit.assets?.['reader.js'];
    const cssSha = toolkit.assets?.['reader.css'];
    const meta: Array<[string, Child]> = [
      ['Document', h('code', {}, docId)],
      ['Source revision', h('code', { title: sourceRevision }, abbreviate(sourceRevision))],
      ['Build', h('code', { title: buildId }, abbreviate(buildId))],
      ['Captured', typeof fm['capturedAt'] === 'string' ? fm['capturedAt'] : 'unknown'],
      ['Visibility', typeof fm['visibility'] === 'string' ? fm['visibility'] : 'private'],
    ];
    const doc = h('html', { lang: 'en' },
      h('head', {},
        h('meta', { charset: 'utf-8' }),
        h('meta', { 'http-equiv': 'Content-Security-Policy', content: CSP }),
        h('meta', { name: 'referrer', content: 'no-referrer' }),
        h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
        fm['visibility'] !== 'public' ? h('meta', { name: 'robots', content: 'noindex, nofollow' }) : null,
        h('title', {}, r.safeText(title)),
        h('link', { rel: 'stylesheet', href: `${assetBase}/reader.css`, integrity: cssSha ? integrity(cssSha) : undefined }),
        h('script', { src: `${assetBase}/reader.js`, defer: true, integrity: jsSha ? integrity(jsSha) : undefined })),
      h('body', {},
        h('nav', { class: DOM.toolbar, 'aria-label': 'Document tools', hidden: true },
          h('button', { type: 'button', id: DOM.buttons.contents }, 'Contents'),
          h('button', { type: 'button', id: DOM.buttons.refmode, 'aria-pressed': 'false' }, 'Reference mode'),
          h('button', { type: 'button', id: DOM.buttons.expand }, 'Expand details'),
          h('button', { type: 'button', id: DOM.buttons.about }, 'About this snapshot')),
        h('main', { id: DOM.root, [DOM.attr.doc]: docId, [DOM.attr.rev]: sourceRevision, [DOM.attr.build]: buildId },
          h('header', { class: 'ex-snapshot' },
            firstIsH1 ? null : h('h1', {}, r.safeText(title)),
            h('dl', { class: 'ex-meta', [DOM.attr.generated]: true }, meta.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
          mainContent,
          appendix)));
    page = '<!doctype html>\n' + render(doc) + '\n';
  } catch (error) {
    if (error instanceof UnsafeMarkupError) r.error('E_UNSAFE_CONTENT', error.message);
    else throw error;
    page = '';
  }

  if (r.diagnostics.some((d) => d.severity === 'error')) throw new CompileError([...bundle.diagnostics, ...r.diagnostics]);

  const files: OutputFile[] = [];
  const add = (name: string, bytes: Uint8Array, mediaType: string) => files.push({ path: `${directory}/${name}`, bytes, mediaType });
  add('index.html', encoder.encode(page), 'text/html; charset=utf-8');
  add('document.md', encoder.encode(projectText(bundle.parsed, bundle.model.targets)), 'text/markdown; charset=utf-8');
  for (const image of [...r.images.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!files.some((f) => f.path === `${directory}/${image.path}`)) add(image.path, image.bytes, image.mediaType);
  }
  if (options.includeSource) {
    for (const f of bundle.files) add(`source/${f.path}`, f.content, f.kind === 'text' ? 'text/markdown; charset=utf-8' : (TEXT_MEDIA[(f.path.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream'));
  }

  const manifest: BuildManifest = {
    schema: 'explain-build/1',
    docId,
    sourceRevision,
    buildId,
    toolkitVersion: toolkit.version,
    toolkitSha256: toolkit.sha256,
    effectiveRenderOptions,
    ...(options.nodeVersion ? { nodeVersion: options.nodeVersion } : {}),
    sourceFiles: bundle.manifest.files.map((f) => ({ path: f.path, sha256: f.sha256 })),
    outputFiles: files.map((f) => ({ path: f.path.slice(directory.length + 1), sha256: sha256Hex(f.bytes), mediaType: f.mediaType })),
    assets: ['reader.css', 'reader.js'].map((path) => ({ packSha256: toolkit.sha256, path, ...(toolkit.assets?.[path] ? { sha256: toolkit.assets[path] } : {}) })),
  };
  add('build.json', encoder.encode(canonicalJSON(manifest) + '\n'), 'application/json');
  return { docId, sourceRevision, buildId, directory, files, manifest, diagnostics: r.diagnostics };
}
