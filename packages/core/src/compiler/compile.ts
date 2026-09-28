// Static compiler (§7.2, §9, §10, §13.1, §13.2). Renders a loaded bundle into
// deterministic HTML/SVG per the DOM contract (dom-contract.ts), plus the
// semantic Markdown projection and public build metadata.
import type { Diagnostic, TargetRecord } from '../types.ts';
import type { LoadedBundle } from '../model/bundle.ts';
import type { MNode } from '../model/targets.ts';
import { firstSentence, noteWord, projectText, READING_ORDER, readingOrderFigure, withUnit } from '../model/project.ts';
import { diffPairs, excerptLines, lineDiff, type DiffRow } from '../model/diff.ts';
import { swatch as cueSwatch } from './encoding.ts';
import { measureSvg } from './measure-svg.ts';
import { PART_EVIDENCE_TAGS, QUANTITY_TAGS } from '../model/validate.ts';
import { inCitationOrder, sourceOrder } from '../model/citations.ts';
import { buildId as computeBuildId, canonicalJSON, HashError, normalizedTextSha256, sha256Hex } from '../model/hash.ts';
import { DOM } from './dom-contract.ts';
import { checkLink, h, hasBidiControls, render, UnsafeMarkupError, visibleBidi, type Child, type HNode } from './html.ts';
import { layoutGraph, type GraphInput, type GraphLayout, type LayoutFunction } from './layout.ts';
import { graphSvg, traceSvg } from './svg.ts';
import { phraseKey, TermMatcher, type LinkableDefinition, type TermSegment } from './autolink.ts';
import { BASIS_CUES, CATEGORY_CUES, DEPENDENCY_KIND_CUES, EDGE_KIND_CUES, EVENT_CUES, filterToken, hueChips, RELATION_KIND_CUES, legend, LOSS_CUE, patternChips, ROLE_CUES, showsHue, STATUS_CUES, styleFor, UNSTATED_BASIS_DASH, type Chip, type PartStyle } from './encoding.ts';
import type { MermaidFigure } from '../mermaid/types.ts';
import { stripMermaidComments } from '../mermaid/rules.ts';
import type { ExtensionBinding } from '../extensions/registry.ts';
import { componentInputs } from '../extensions/run.ts';
import { extensionSvg } from '../extensions/svg.ts';

export type Toolkit = {
  version: string;
  sha256: string;
  // Optional digests of shipped browser assets (path -> hex sha256), used for
  // integrity attributes and the manifest's asset list.
  assets?: Record<string, string>;
  // Subresource Integrity values (e.g. `sha384-…`) for assets the runtime loads
  // lazily, such as `mermaid.js` (§9.12).
  integrity?: Record<string, string>;
};

export type CompileOptions = {
  audience: 'private' | 'public';
  includeSource: boolean;
  layoutFallback: boolean;
  layout?: LayoutFunction;
  nodeVersion?: string; // recorded in build.json when given (§7.5)
  development?: boolean; // --dev-toolkit accepted a toolkit other than the lock's (§12.4)
  // Resolved extensions by name (§14.3). The caller resolves and trust-gates
  // them; a binding that is not ready renders the component's text fallback.
  extensions?: ReadonlyMap<string, ExtensionBinding>;
};

export type OutputFile = { path: string; bytes: Uint8Array; mediaType: string };

export type BuildManifest = {
  schema: 'visser-build/1';
  docId: string;
  sourceRevision: string;
  buildId: string;
  toolkitVersion: string;
  toolkitSha256: string;
  effectiveRenderOptions: { audience: 'private' | 'public'; includeSource: boolean; layoutFallback: boolean };
  nodeVersion?: string;
  development?: true;
  extensions?: Array<{ name: string; version: string; sha256: string }>;
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
  // True when index.html contains a Mermaid figure: the page needs mermaid.js
  // and the Mermaid-page Content Security Policy (§9.12).
  needsMermaid: boolean;
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

/**
 * Content Security Policy for a page (§15.3, §9.12). Pages with a Mermaid figure,
 * and only those, add 'unsafe-inline' to style-src: Mermaid measures text with
 * inline styles while it draws. Every other directive is unchanged. The meta
 * element cannot carry frame-ancestors, so only the header form includes it.
 */
export function contentSecurityPolicy(options: { mermaid: boolean; delivery: 'header' | 'meta' }): string {
  return [
    "default-src 'none'", "script-src 'self'", options.mermaid ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
    "img-src 'self'", "font-src 'none'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'",
    "form-action 'none'", "frame-src 'none'", ...(options.delivery === 'header' ? ["frame-ancestors 'none'"] : []),
  ].join('; ');
}

const MERMAID_KIND_TEXT: Record<string, string> = {
  'mermaid-node': 'node', 'mermaid-group': 'group', 'mermaid-state': 'state', 'mermaid-participant': 'participant',
  'mermaid-edge': 'edge', 'mermaid-transition': 'transition', 'mermaid-message': 'message',
};

const ENTITY_KINDS = new Set(['definition', 'source', 'detail']);

/**
 * The notice for a source with no captured excerpt (ARCHITECTURE §8.1). The
 * appendix row and the inspector Evidence section use the same words
 * (docs/IMPROVEMENTS.md §4.4).
 */
const LINK_ONLY_TEXT = 'No captured excerpt; this origin link is not self-contained evidence.';
const linkOnlyNotice = (): HNode => h('p', { class: 'vs-link-only', [DOM.attr.generated]: true }, LINK_ONLY_TEXT);

const COMPONENTS = new Set(['graph', 'trace', 'annotated', 'transform', 'compare']);
// Figure/component root kinds (matches COMPONENT_ROOTS in model/targets.ts): a
// figure's owned parts group under "Figure: <title>" in the appendix (F3).
const FIGURE_KINDS = new Set(['graph', 'trace', 'transform', 'compare', 'annotated', 'domain', 'measure', 'tree', 'mermaid', 'extension']);

// Graph-like families share one kernel (§9.1): graph modes plus transform
// and domain (docs/IMPROVEMENTS.md §5.4).
type GraphFamily = 'architecture' | 'state' | 'cause' | 'plan' | 'transform' | 'domain';
const GRAPH_MODES = new Set<GraphFamily>(['architecture', 'state', 'cause', 'plan']);

// Causal basis is shown as text and as a line pattern, never by color alone
// (§9.7). The patterns and hues are in encoding.ts (docs/IMPROVEMENTS.md §3.2).

const NODE_LIST_LABEL: Record<GraphFamily, string> = {
  architecture: 'Elements', state: 'States', cause: 'Factors', plan: 'Tasks', transform: 'Stages', domain: 'Concepts',
};
const REL_LIST_LABEL: Record<GraphFamily, string> = {
  architecture: 'Relationships', state: 'Transitions', cause: 'Causal links', plan: 'Dependencies', transform: 'Conversions', domain: 'Relations',
};
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
  readonly sourceOrder: string[];
  readonly images = new Map<string, OutputFile>(); // bundle path -> output asset
  readonly layout: LayoutFunction;
  readonly options: CompileOptions;
  usesMermaid = false;
  // The line diff of each annotated figure with a `before` source. The page
  // and the text projection share it, so a build computes it once (phase 6a
  // review C1).
  readonly diffs = new Map<string, DiffRow[]>();
  // Term auto-link (docs/IMPROVEMENTS.md §13.3, §13.5).
  readonly terms: TermMatcher;
  linkOff = 0; // above 0: do not link terms (headings, links, and inline tags)
  ownDefinition: string | undefined; // the definition whose body is being rendered
  termScope: Set<string> | undefined; // the terms already underlined in the current paragraph

  constructor(bundle: LoadedBundle, options: CompileOptions) {
    this.bundle = bundle;
    this.targets = bundle.model.targets;
    this.nodes = bundle.model.nodes;
    this.options = options;
    this.layout = options.layout ?? layoutGraph;
    for (const [id, node] of this.nodes) this.targetOfNode.set(node, id);
    // Citation numbers follow the first citation in reading order (revision 1.24).
    this.sourceOrder = sourceOrder(bundle.parsed.ast as MNode, this.targets);
    this.sourceOrder.forEach((id, i) => this.citationNumber.set(id, i + 1));
    this.terms = new TermMatcher(linkableDefinitions(bundle));
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

  /**
   * The inline children of a node. A run of text and soft line breaks is
   * joined before the term auto-link, so a term that wraps to the next source
   * line is still found (docs/IMPROVEMENTS.md §13.3).
   */
  inlines(node: MNode): Child[] {
    const out: Child[] = [];
    let run: string[] = [];
    const flush = () => {
      if (run.length === 0) return;
      out.push(this.linkText(run.join('')));
      run = [];
    };
    for (const c of node.children) {
      if (c.type === 'text') run.push(String(c.attributes['content'] ?? ''));
      else if (c.type === 'softbreak') run.push('\n');
      else {
        flush();
        out.push(this.inline(c));
      }
    }
    flush();
    return out;
  }

  /** Run `fn` with the term auto-link off (headings, links, and inline tags). */
  withoutLinks<T>(fn: () => T): T {
    this.linkOff++;
    try {
      return fn();
    } finally {
      this.linkOff--;
    }
  }

  /** Run `fn` in a new paragraph scope: the first use of each term in it is underlined (§13.5). */
  withTermScope<T>(fn: () => T): T {
    const previous = this.termScope;
    this.termScope = new Set();
    try {
      return fn();
    } finally {
      this.termScope = previous;
    }
  }

  /** Prose text with each use of a defined term linked to its definition (§13.3). */
  linkText(raw: string, targetId?: string): Child {
    const text = this.safeText(raw, targetId);
    if (this.linkOff > 0 || this.terms.empty) return text;
    return this.terms.split(text, this.ownDefinition).map((seg) => (typeof seg === 'string' ? seg : this.termLink(seg.defId, seg.text)));
  }

  /**
   * One use of a term. The first use of a term in a paragraph is a link with
   * a dotted underline. A later use in the same paragraph is a plain span
   * that still shows the definition on hover, but has no underline and no
   * tab stop (docs/IMPROVEMENTS.md §13.5).
   */
  termLink(defId: string, text: Child, authored = false): HNode {
    const first = !this.termScope?.has(defId);
    this.termScope?.add(defId);
    if (first || authored) return h('a', { class: 'vs-term', href: `#${DOM.canonicalId(defId)}`, [DOM.attr.term]: defId }, text);
    return h('span', { class: 'vs-term vs-term-quiet', [DOM.attr.term]: defId }, text);
  }

  /** Segments of an SVG label: plain text and uses of defined terms (§13.4). */
  labelTerms(text: string): TermSegment[] {
    return this.terms.empty ? [text] : this.terms.split(text);
  }

  inline(node: MNode): Child {
    switch (node.type) {
      case 'text': return this.safeText(String(node.attributes['content'] ?? ''));
      case 'code': return h('code', {}, this.safeText(String(node.attributes['content'] ?? '')));
      case 'softbreak': return '\n';
      case 'hardbreak': return h('br');
      case 'em': return h('em', {}, this.inlines(node));
      case 'strong': return h('strong', {}, this.inlines(node));
      case 's': return h('span', { class: 'vs-strike' }, this.inlines(node));
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
    return h('a', { href: check.href, rel: check.external ? 'noopener noreferrer' : undefined }, this.withoutLinks(() => this.inlines(node)));
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
    // The text inside a term, a citation, a focus link, or a detail link is
    // already a link, so the term auto-link does not look inside it.
    const known = node.tag === 'term' || node.tag === 'cite' || node.tag === 'focus' || node.tag === 'detail-link';
    const children = known ? this.withoutLinks(() => this.inlines(node)) : this.inlines(node);
    switch (node.tag) {
      case 'term': {
        const ref = attrString(node, 'ref')!;
        const text = children.length > 0 ? children : this.label(ref);
        return this.termLink(ref, text, true);
      }
      case 'cite': {
        const ref = attrString(node, 'ref')!;
        const n = this.citationNumber.get(ref);
        // The excerpt title lives in a data attribute, not `title`: a run of
        // adjacent citations shows one merged tooltip built by the runtime, so a
        // native per-anchor tooltip would double up (F10).
        return h('a', { class: 'vs-cite', href: `#${DOM.canonicalId(ref)}`, 'data-vs-cite-title': this.label(ref), [DOM.attr.generated]: true }, `[${n ?? ref}]`);
      }
      case 'focus': {
        const ids = Array.isArray(node.attributes['targets']) ? (node.attributes['targets'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
        return h('a', { class: 'vs-focus', href: `#${DOM.canonicalId(ids[0] ?? '')}`, [DOM.attr.focus]: ids.join(' ') }, children);
      }
      case 'detail-link': {
        const ref = attrString(node, 'ref')!;
        return h('a', { class: 'vs-detail-link', href: `#${DOM.canonicalId(ref)}` }, children.length > 0 ? children : this.label(ref));
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
        return h(`h${level}`, {}, this.withoutLinks(() => this.inlines(node)));
      }
      case 'paragraph': return h('p', {}, this.withTermScope(() => this.inlines(node)));
      case 'inline': return h('p', {}, this.withTermScope(() => this.inlines(node)));
      case 'fence': return this.fence(node);
      case 'hr': return h('hr');
      case 'blockquote': return h('blockquote', {}, this.blocks(node));
      case 'list': {
        const ordered = node.attributes['ordered'] === true;
        const start = node.attributes['start'];
        return h(ordered ? 'ol' : 'ul', { start: ordered && typeof start === 'number' && start !== 1 ? start : undefined }, node.children.map((item) => h('li', {}, this.withTermScope(() => this.blocks(item)))));
      }
      case 'item': return h('li', {}, this.withTermScope(() => this.blocks(node)));
      case 'table': return h('table', {}, this.blocks(node));
      case 'thead': return h('thead', {}, this.blocks(node));
      case 'tbody': return h('tbody', {}, this.blocks(node));
      case 'tr': return h('tr', {}, this.blocks(node));
      case 'th': return h('th', { scope: 'col', align: tableAlign(node), class: hasInlineCode(node) ? 'vs-cell-code' : undefined }, this.withTermScope(() => this.inlines(node)));
      case 'td': return h('td', { align: tableAlign(node), class: hasInlineCode(node) ? 'vs-cell-code' : undefined }, this.withTermScope(() => this.inlines(node)));
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
    return h('pre', { class: 'vs-fence' }, h('code', { class: language ? `language-${language.replace(/[^a-z0-9_+-]/gi, '')}` : undefined }, this.safeText(content)));
  }

  // --- Components ----------------------------------------------------------

  figureShell(id: string, node: MNode, kindClass: string, content: Child[], hasMap = false, legendNode: HNode | null = null): HNode {
    const question = attrString(node, 'question') ?? '';
    const title = this.safeText(attrString(node, 'title') ?? this.label(id), id);
    // The title is the visible heading. The word "Figure" is not shown; it
    // stays in the accessible name (docs/IMPROVEMENTS.md §3.6).
    return h('figure', { class: `vs-figure ${kindClass}`, ...this.canonical(id), [DOM.attr.question]: question, 'aria-label': `Figure: ${title}`, 'aria-describedby': `vs-q-${id}`, [DOM.attr.views]: hasMap ? 'map list' : undefined },
      h('figcaption', {}, title),
      // The authored question, visible under the caption (F7); the empty case
      // collapses via CSS (:empty), and this element stays the aria-describedby target.
      // The question is prose, so the term auto-link applies (docs/IMPROVEMENTS.md §13.3).
      h('p', { id: `vs-q-${id}`, class: 'vs-figure-question' }, this.withTermScope(() => this.linkText(question, id))),
      // The legend comes after the interpretation paragraph (§3.3). The two
      // share a wrapping row, so a short paragraph and a short legend sit
      // side by side, and a long one pushes the legend to the next line (§3.6).
      legendNode ? h('div', { class: 'vs-figure-lead' }, h('div', { class: 'vs-figure-text' }, this.blocks(node)), legendNode) : this.blocks(node),
      content,
      // A walkthrough goes under the figure (docs/IMPROVEMENTS.md §14.1).
      this.stepsSection(id),
    );
  }

  // --- Components of docs/IMPROVEMENTS.md §14 -----------------------------------

  /**
   * A `steps` walkthrough (§14.1): a numbered list under the figure. Each
   * step has its label, its body, and a link to each part that it names.
   * The list is the canonical element of the walkthrough and of each step,
   * so it works with no JavaScript, in print, and on a narrow screen. With
   * JavaScript on a wide screen, the runtime adds the step bar and marks the
   * parts of the active step. In a graph of any mode and in a domain the list
   * says that the order is a reading order, because only a trace claims an
   * execution order (phase 6a review S1).
   */
  stepsSection(figureId: string): Child {
    const walk = this.childTargets(figureId).find((c) => c.kind === 'steps');
    if (!walk) return null;
    const steps = this.childTargets(walk.id).filter((c) => c.kind === 'step');
    const readingOrder = readingOrderFigure(this.targets.get(figureId)?.kind);
    return h('section', { class: 'vs-steps', ...this.canonical(walk.id), 'aria-label': `Steps: ${this.figureTitle(figureId)}` },
      h('p', { class: 'vs-steps-heading', [DOM.attr.generated]: true }, `Walkthrough in ${steps.length} step${steps.length === 1 ? '' : 's'}`),
      readingOrder ? h('p', { class: 'vs-steps-note', [DOM.attr.generated]: true }, READING_ORDER) : null,
      h('ol', { class: 'vs-step-list' }, steps.map((s) => {
        const n = this.nodes.get(s.id)!;
        const targets = (Array.isArray(n.attributes['targets']) ? n.attributes['targets'] : []).filter((x): x is string => typeof x === 'string' && this.targets.has(x));
        return h('li', { class: 'vs-step', ...this.canonical(s.id), [DOM.attr.stepTargets]: targets.join(' ') },
          h('p', { class: 'vs-step-label' }, this.label(s.id)),
          h('div', { class: 'vs-step-body' }, this.blocks(n)),
          targets.length > 0
            ? h('p', { class: 'vs-step-targets', [DOM.attr.generated]: true }, 'Parts: ',
                targets.map((t, i) => [i > 0 ? ', ' : '', h('a', { href: `#${DOM.canonicalId(t)}`, id: DOM.listInstanceId(figureId, `${s.id}.${t}`), [DOM.attr.target]: t, [DOM.attr.interactive]: true }, this.label(t))]))
            : null);
      })));
  }

  /**
   * A note (§14.2): a limit, an assumption, or a warning, as a block with a
   * 4 px left rule in its category hue and the kind word as an eyebrow. The
   * word is the paired cue, so the hue never carries the kind alone.
   */
  note(id: string, node: MNode): HNode {
    const kind = attrString(node, 'kind') ?? 'limit';
    const word = noteWord(kind);
    return h('div', { class: `vs-block vs-note vs-note-${kind.replace(/[^a-z]/g, '')}`, role: 'note', 'aria-label': word, ...this.canonical(id) },
      h('p', { class: 'vs-note-kind', [DOM.attr.generated]: true }, word),
      this.blocks(node));
  }

  /**
   * A self-check (§14.3): the question, then the answer in a native
   * `details` with the summary "Show answer". Without JavaScript the
   * reader opens it; in print it is open.
   */
  selfCheck(id: string, node: MNode): HNode {
    const question = attrString(node, 'question') ?? this.label(id);
    return h('div', { class: 'vs-block vs-self-check', ...this.canonical(id) },
      h('p', { class: 'vs-self-check-question' },
        h('span', { class: 'vs-self-check-kind', [DOM.attr.generated]: true }, 'Check yourself'),
        ' ', this.withTermScope(() => this.linkText(question, id))),
      h('details', { class: 'vs-self-check-answer' },
        h('summary', { [DOM.attr.generated]: true }, 'Show answer'),
        h('div', { class: 'vs-self-check-body' }, this.blocks(node))));
  }

  /**
   * A measure (§14.4): one horizontal bar for each reading, in authored
   * order, with its number and unit. A bar is ink. A reading that is not
   * measured is hatched and says so in its value text. The axis shows zero
   * and the maximum only. The table under it is the list view, the narrow
   * view, and the text form.
   */
  measure(id: string, node: MNode): HNode {
    const unit = attrString(node, 'unit');
    const readings = this.childTargets(id).filter((c) => c.kind === 'reading');
    const rows = readings.map((r) => {
      const n = this.nodes.get(r.id)!;
      const value = typeof n.attributes['value'] === 'number' ? (n.attributes['value'] as number) : 0;
      const status = attrString(n, 'valueStatus') ?? 'measured';
      return { id: r.id, label: this.label(r.id), value, status, text: this.safeText(`${withUnit(value, unit, attrString(n, 'display'))}${status === 'measured' ? '' : ` (${status})`}`, r.id) };
    });
    // The axis maximum prints as the largest reading prints, with its `display` text (phase 6a review S4).
    const top = rows.reduce<(typeof rows)[number] | undefined>((best, r) => (best === undefined || r.value > best.value ? r : best), undefined);
    const topDisplay = top ? attrString(this.nodes.get(top.id)!, 'display') : undefined;
    const svg = top ? measureSvg({ figureId: id, title: attrString(node, 'title') ?? this.label(id), rows, maxText: this.safeText(withUnit(top.value, unit, topDisplay), id) }) : null;
    const table = h('table', { class: 'vs-measure-table' },
      h('thead', { [DOM.attr.generated]: true }, h('tr', {},
        h('th', { scope: 'col' }, 'Reading'), h('th', { scope: 'col' }, 'Value'), h('th', { scope: 'col' }, 'Status'), h('th', { scope: 'col' }, 'Evidence'))),
      h('tbody', {}, rows.map((r) => {
        const n = this.nodes.get(r.id)!;
        const evidence = this.ownEvidenceIds(r.id);
        return h('tr', { class: r.status === 'measured' ? undefined : 'vs-reading-unmeasured' },
          h('th', { scope: 'row' }, h('a', { href: `#${DOM.canonicalId(r.id)}`, id: DOM.listInstanceId(id, r.id), [DOM.attr.target]: r.id, [DOM.attr.interactive]: true }, r.label)),
          h('td', { class: 'vs-reading-value' }, this.safeText(withUnit(n.attributes['value'], unit, attrString(n, 'display')), r.id)),
          h('td', { [DOM.attr.generated]: true }, r.status),
          h('td', {}, evidence.length > 0
            ? evidence.map((s, i) => [i > 0 ? ', ' : '', h('a', { class: 'vs-inspect-link', href: `#${DOM.canonicalId(s)}` }, this.label(s))])
            : h('span', { class: 'vs-not-provided', [DOM.attr.generated]: true }, 'none')));
      })));
    return this.figureShell(id, node, 'vs-measure', [
      svg ? h('div', { class: 'vs-viewport', [DOM.attr.viewport]: true }, svg) : null,
      h('div', { class: 'vs-lists' }, table),
    ], svg !== null);
  }

  /**
   * A tree (§14.5): an indented list of entries, each with its path in mono,
   * its label, and its role cue (the architecture role swatch and word). The
   * children of an entry are in a native `details` under its line; the top
   * two levels are open. The entry link is outside the `summary`, so no
   * link is inside another control (phase 6a review C4, WCAG 4.1.2). A click
   * on an entry opens it in the inspector, with its evidence first.
   */
  tree(id: string, node: MNode): HNode {
    const all = [...this.targets.values()].filter((t) => t.kind === 'entry' && t.ownerComponentId === id);
    const roles = all.map((e) => attrString(this.nodes.get(e.id)!, 'role')).filter((r): r is string => r !== undefined);
    const hue = showsHue(roles);
    const item = (entry: TargetRecord, depth: number): HNode => {
      const n = this.nodes.get(entry.id)!;
      const role = attrString(n, 'role');
      const cue = role ? ROLE_CUES[role] : undefined;
      const kids = this.childTargets(entry.id).filter((c) => c.kind === 'entry');
      const evidence = this.ownEvidenceIds(entry.id).length > 0;
      const line: Child[] = [
        h('a', { class: 'vs-tree-entry', href: `#${DOM.canonicalId(entry.id)}`, id: DOM.listInstanceId(id, entry.id), [DOM.attr.target]: entry.id, [DOM.attr.interactive]: true },
          h('code', { class: 'vs-tree-path' }, this.safeText(attrString(n, 'path') ?? '', entry.id)),
          h('span', { class: 'vs-tree-label' }, this.label(entry.id))),
        cue ? h('span', { class: 'vs-tree-role', [DOM.attr.generated]: true }, cueSwatch(cue, hue), cue.word) : null,
        evidence ? h('span', { class: 'vs-tree-evidence', [DOM.attr.generated]: true }, 'evidence') : null,
      ];
      if (kids.length === 0) return h('li', { class: 'vs-tree-item' }, h('div', { class: 'vs-tree-line' }, line));
      const path = this.safeText(attrString(n, 'path') ?? '', entry.id);
      return h('li', { class: 'vs-tree-item' },
        h('div', { class: 'vs-tree-line' }, line),
        h('details', { class: `vs-tree-node${depth < 2 ? ' vs-tree-open' : ''}`, open: depth < 2 },
          h('summary', { class: 'vs-tree-toggle', [DOM.attr.generated]: true },
            `${kids.length} ${kids.length === 1 ? 'entry' : 'entries'}`, h('span', { class: 'vs-sr' }, ` in ${path}`)),
          h('ul', { class: 'vs-tree-children' }, kids.map((k) => item(k, depth + 1)))));
    };
    const top = this.childTargets(id).filter((c) => c.kind === 'entry');
    return this.figureShell(id, node, 'vs-tree', [
      h('ul', { class: 'vs-tree-list', 'aria-label': 'Entries' }, top.map((e) => item(e, 0))),
    ]);
  }

  childTargets(id: string): TargetRecord[] {
    return [...this.targets.values()].filter((t) => t.parentId === id);
  }

  relationship(id: string) {
    return this.bundle.model.relationships.find((r) => r.id === id);
  }

  familyOf(id: string, node: MNode): GraphFamily {
    if (this.targets.get(id)?.kind === 'transform') return 'transform';
    if (this.targets.get(id)?.kind === 'domain') return 'domain';
    const mode = attrString(node, 'mode') ?? 'architecture';
    return GRAPH_MODES.has(mode as GraphFamily) ? (mode as GraphFamily) : 'architecture';
  }

  /** Secondary lines shown inside a node box and after it in the list. */
  nodeNotes(family: GraphFamily, nodeId: string): string[] {
    const n = this.nodes.get(nodeId)!;
    const a = (k: string) => attrString(n, k);
    switch (family) {
      case 'state': {
        const notes: string[] = [];
        if (n.attributes['initial'] === true) notes.push('initial');
        if (n.attributes['terminal'] === true) notes.push('terminal');
        return notes;
      }
      case 'cause': return a('basis') ? [a('basis')!] : [];
      case 'plan': return [`status: ${a('status') ?? 'proposed'}`, ...(a('owner') ? [`owner: ${a('owner')}`] : []), ...(a('due') ? [`due: ${a('due')}`] : [])];
      case 'transform': {
        const shape = n.attributes['shape'];
        const shapeText = Array.isArray(shape) ? shape.map(String).join(' × ') : typeof shape === 'string' ? shape : undefined;
        return [a('representation'), shapeText ? `shape: ${shapeText}` : undefined, a('units') ? `units: ${a('units')}` : undefined, a('location') ? `location: ${a('location')}` : undefined]
          .filter((x): x is string => x !== undefined);
      }
      case 'domain': return a('category') ? [a('category')!] : [];
      default: return a('role') ? [a('role')!] : [];
    }
  }

  /** Text on a relationship arrow. Material facts (guard, basis, loss) stay in the main visual. */
  edgeLabel(family: GraphFamily, edgeId: string): string {
    const n = this.nodes.get(edgeId)!;
    const a = (k: string) => attrString(n, k);
    // A `quantity` follows the label in parentheses; the drawing mutes it
    // (docs/IMPROVEMENTS.md §14.9).
    const quantity = this.quantity(edgeId);
    const label = quantity ? `${this.label(edgeId)} (${quantity})` : this.label(edgeId);
    switch (family) {
      case 'state': {
        // The arrow shows the author's label, as the list does; the event is in the list notes (dogfood-2 Q4).
        // A basis other than observed is a line pattern, so the word goes on
        // the arrow too, as in cause (review F-08).
        const guard = a('guard');
        const basis = this.relationship(edgeId)?.basis;
        return `${guard ? `${label} [${guard}]` : label}${basis && basis !== 'observed' ? ` (${basis})` : ''}`;
      }
      case 'cause': return `${label} (${a('basis') ?? 'unstated basis'})`;
      case 'plan': {
        const kind = a('kind');
        return kind && kind !== 'finish-start' ? `${label} (${kind})` : label;
      }
      case 'transform': return a('loss') ? `${label}; loss: ${a('loss')}` : label;
      // The cardinality is part of the relation label, "contains · 1..*". Text
      // at the line end had no space in the layout and could touch the end of
      // another relation (phase 4 review D7).
      case 'domain': return a('cardinality') ? `${label} · ${a('cardinality')}` : label;
      default: return label;
    }
  }

  /** The `quantity` of an edge, a conversion, or a dependency (docs/IMPROVEMENTS.md §14.9). */
  quantity(edgeId: string): string | undefined {
    const n = this.nodes.get(edgeId);
    return n && QUANTITY_TAGS.has(n.tag ?? '') ? attrString(n, 'quantity') : undefined;
  }

  /**
   * The word that names an edge's line cue, for its aria-label (review F-07):
   * the edge kind, the basis, the dependency kind, or the loss. The drawing
   * shows it as a pattern or a hue, so a screen reader gets the same fact.
   */
  edgeCueWord(family: GraphFamily, edgeId: string): string | undefined {
    const n = this.nodes.get(edgeId)!;
    const a = (k: string) => attrString(n, k);
    const r = this.relationship(edgeId);
    switch (family) {
      case 'architecture': return r?.kind;
      case 'cause': return r?.basis ?? 'unstated basis';
      case 'state': return r?.basis;
      case 'plan': return a('kind') ?? 'finish-start';
      case 'transform': return a('loss') ? `loss: ${a('loss')}` : undefined;
      // The relation kind is the line pattern and the line end; the cardinality is the small end label.
      case 'domain': return `${r?.kind ?? 'relation'}${a('cardinality') ? `, cardinality ${a('cardinality')}` : ''}`;
      default: return undefined;
    }
  }

  /** Extra relationship facts for the list view (generated text). */
  edgeNotes(family: GraphFamily, edgeId: string): string[] {
    const n = this.nodes.get(edgeId)!;
    const a = (k: string) => attrString(n, k);
    const r = this.relationship(edgeId);
    const notes: string[] = [r?.kind ?? 'relationship'];
    if (r?.basis) notes.push(`basis: ${r.basis}`);
    if (family === 'state') {
      if (a('event')) notes.push(`event: ${a('event')}`);
      if (a('guard')) notes.push(`guard: ${a('guard')}`);
      if (a('action')) notes.push(`action: ${a('action')}`);
    }
    if (family === 'transform') {
      if (a('loss')) notes.push(`loss: ${a('loss')}`);
      if (a('condition')) notes.push(`condition: ${a('condition')}`);
    }
    if (family === 'domain' && a('cardinality')) notes.push(`cardinality: ${a('cardinality')}`);
    return notes;
  }

  async graph(id: string, node: MNode): Promise<HNode> {
    const family = this.familyOf(id, node);
    const children = this.childTargets(id);
    const edges = children.filter((c) => this.relationship(c.id) !== undefined);
    const groups = children.filter((c) => c.kind === 'group');
    // A `steps` walkthrough is not a node; it renders under the figure (§14.1).
    // A `detail` in a figure is not a node either: it stays a detail in the
    // appendix. A domain map draws only its concepts (phase 4 review D10).
    const nodes = children.filter((c) => !edges.includes(c) && c.kind !== 'group' && c.kind !== 'steps' && c.kind !== 'detail' && (family !== 'domain' || c.kind === 'concept'));
    if (nodes.length > GRAPH_MAX_NODES || edges.length > GRAPH_MAX_EDGES) {
      this.error('E_LAYOUT_LIMIT', `graph ${id} has ${nodes.length} nodes and ${edges.length} edges; the cap is ${GRAPH_MAX_NODES}/${GRAPH_MAX_EDGES}`, id);
    }
    // The validator reports W_VISUAL_DENSITY above GRAPH_WARN_NODES; do not repeat it here.
    const notes = new Map(nodes.map((n) => [n.id, this.nodeNotes(family, n.id)]));
    const encoding = this.encoding(family, nodes.map((n) => n.id), edges.map((e) => e.id));
    const input: GraphInput = {
      id,
      // A domain map shares its row with the glossary, so the layout rule
      // counts the glossary height (docs/IMPROVEMENTS.md §5.4).
      ...(family === 'domain' ? { glossaryRows: nodes.length } : {}),
      groups: groups.map((g) => {
        const parent = attrString(this.nodes.get(g.id)!, 'parent');
        return { id: g.id, label: this.label(g.id), ...(parent ? { parent } : {}) };
      }),
      nodes: nodes.map((n) => {
        const group = attrString(this.nodes.get(n.id)!, 'group');
        // A box shows its label only (docs/IMPROVEMENTS.md §3.4). Role, status,
        // basis, and the state marks move to the paired cue, the legend, the
        // list, and the inspector. A transform stage keeps its representation,
        // and a task keeps its `due` date.
        const extra = this.boxLines(family, n.id).map((x) => this.safeText(x, n.id));
        const style = encoding.nodes.get(n.id);
        const marked = (style?.marks ?? []).some((m) => m === 'check' || m === 'question' || m === 'initial');
        const drum = style?.shape === 'drum';
        return { id: n.id, label: this.label(n.id), ...(group ? { group } : {}), ...(extra.length > 0 ? { extra } : {}), ...(marked ? { marked } : {}), ...(drum ? { drum } : {}) };
      }),
      edges: edges.map((e) => {
        const r = this.relationship(e.id)!;
        return { id: e.id, from: r.from, to: r.to, label: this.safeText(this.edgeLabel(family, e.id), e.id) };
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

    const roles = new Map(nodes.map((n) => [n.id, family === 'architecture' ? attrString(this.nodes.get(n.id)!, 'role') : undefined]));
    const collapsed = groups.filter((g) => this.nodes.get(g.id)!.attributes['collapsed'] === true).map((g) => g.id);
    const kinds = new Map(edges.map((e) => [e.id, this.relationship(e.id)!.kind]));
    const svg = layout
      ? graphSvg({
          figureId: id, title: attrString(node, 'title') ?? this.label(id), layout,
          labelOf: (x) => this.label(x), roleOf: (x) => roles.get(x), noteOf: (x) => notes.get(x)?.join(', ') || undefined,
          kindOf: (x) => kinds.get(x), relationship: (x) => this.relationship(x),
          nodeStyleOf: (x) => encoding.nodes.get(x), edgeStyleOf: (x) => encoding.edges.get(x),
          edgeNoteOf: (x) => this.edgeCueWord(family, x),
          termsOf: (x) => this.labelTerms(x),
          // A task's `due` line is muted (docs/IMPROVEMENTS.md §3.4, §4.4), and
          // so is a concept's `attributes` line (§5.3).
          ...(family === 'plan' || family === 'domain' ? { mutedLinesOf: (x: string) => this.boxLines(family, x).length } : {}),
          // Figure interactions (docs/IMPROVEMENTS.md §14.9): the filter token
          // of each part, the muted quantity in an edge label, and the groups
          // that start folded.
          filterOf: (x) => encoding.filters.get(x),
          edgeQuantityOf: (x) => { const q = this.quantity(x); return q === undefined ? undefined : this.safeText(q, x); },
          ...(collapsed.length > 0 ? {
            collapsed,
            parentOf: (x: string) => attrString(this.nodes.get(x)!, this.targets.get(x)?.kind === 'group' ? 'parent' : 'group'),
          } : {}),
        })
      : null;

    const relList = h('ol', { class: 'vs-rel-list', 'aria-label': REL_LIST_LABEL[family] },
      edges.map((e) => {
        const r = this.relationship(e.id)!;
        // Only the relationship label is the link; endpoints render in body
        // colour as plain text, and the kind is a muted badge after it (F9).
        const [kind, ...extra] = this.edgeNotes(family, e.id);
        return h('li', {},
          h('span', { class: 'vs-rel-endpoint' }, this.label(r.from)),
          h('span', { [DOM.attr.generated]: true }, ' → '),
          h('a', { class: 'vs-rel-label', href: `#${DOM.canonicalId(e.id)}`, id: DOM.listInstanceId(id, e.id), [DOM.attr.target]: e.id, [DOM.attr.rel]: e.id, [DOM.attr.interactive]: true }, this.label(e.id)),
          ((q) => (q === undefined ? null : h('span', { class: 'vs-rel-quantity', [DOM.attr.generated]: true }, ` (${this.safeText(q, e.id)})`)))(this.quantity(e.id)),
          h('span', { [DOM.attr.generated]: true }, ' → '),
          h('span', { class: 'vs-rel-endpoint' }, this.label(r.to)),
          kind ? h('span', { class: 'vs-rel-kind', [DOM.attr.generated]: true }, this.safeText(kind, e.id)) : null,
          extra.length > 0 ? h('span', { class: 'vs-rel-notes', [DOM.attr.generated]: true }, ` (${extra.map((x) => this.safeText(x, e.id)).join('; ')})`) : null);
      }));
    const nodeList = h('ul', { class: 'vs-node-list', 'aria-label': NODE_LIST_LABEL[family] },
      [...groups, ...nodes].map((n) => {
        const note = family === 'architecture' ? (roles.get(n.id) ? [roles.get(n.id)!] : []) : (notes.get(n.id) ?? []);
        return h('li', {},
          h('a', { href: `#${DOM.canonicalId(n.id)}`, id: DOM.listInstanceId(id, n.id), [DOM.attr.target]: n.id, [DOM.attr.interactive]: true }, this.label(n.id)),
          note.length > 0 ? h('span', { class: 'vs-role', [DOM.attr.generated]: true }, ` (${note.map((x) => this.safeText(x, n.id)).join('; ')})`) : null);
      }));

    if (family === 'domain') return this.domainShell(id, node, svg, nodes, relList, svg ? encoding.legend : null);
    return this.figureShell(id, node, `vs-graph vs-family-${family}`, [
      svg ? h('div', { class: 'vs-viewport', [DOM.attr.viewport]: true }, svg) : null,
      // The runtime unhides this when the viewport actually overflows (F5c);
      // it is not the only signal (the scrollbar itself remains), but a
      // scrollbar alone is easy to miss on a trackpad or a narrow window.
      svg ? h('p', { class: 'vs-overflow-hint', hidden: true }, 'Scroll sideways to see the whole figure.') : null,
      h('div', { class: 'vs-lists' }, nodeList, relList),
    ], svg !== null, svg ? encoding.legend : null);
  }

  /**
   * Secondary lines inside a node box (docs/IMPROVEMENTS.md §3.4): a
   * transform stage keeps its representation and location, and a task keeps
   * its `due` date (§4.4) as muted text. The date is text, never a bar
   * length, so the plan stays a dependency graph.
   */
  boxLines(family: GraphFamily, nodeId: string): string[] {
    const n = this.nodes.get(nodeId)!;
    if (family === 'plan') {
      const due = attrString(n, 'due');
      return due ? [`due ${due}`] : [];
    }
    if (family === 'domain') {
      // A concept's attributes, as one muted line under its label (§5.3).
      const list = n.attributes['attributes'];
      return Array.isArray(list) && list.length > 0 ? [list.map(String).join(', ')] : [];
    }
    if (family !== 'transform') return [];
    const representation = attrString(n, 'representation');
    const location = attrString(n, 'location');
    return [representation, location ? `location: ${location}` : undefined].filter((x): x is string => x !== undefined);
  }

  /**
   * The visual encoding of a graph-like figure (docs/IMPROVEMENTS.md §3.2):
   * one variable in hue per family, each hue with a paired cue. The hue shows
   * only when the figure uses 2 or more values of the variable (§2.1). Shape
   * and line-pattern cues show in every case.
   */
  encoding(family: GraphFamily, nodeIds: string[], edgeIds: string[]): { nodes: Map<string, PartStyle>; edges: Map<string, PartStyle>; legend: HNode | null; filters: Map<string, string> } {
    const attr = (id: string, k: string) => attrString(this.nodes.get(id)!, k);
    const nodes = new Map<string, PartStyle>();
    const edges = new Map<string, PartStyle>();
    // The filter token of each node and edge: the value of the variable that
    // a legend chip names (docs/IMPROVEMENTS.md §14.9).
    const filters = new Map<string, string>();
    const tokens = (ids: string[], variable: string, values: string[]) => ids.forEach((x, i) => filters.set(x, filterToken(variable, values[i]!)));
    // The legend: the chips of the hue variable, then a pattern chip for each
    // edge kind, transition basis, or dependency kind that the figure uses
    // (§3.2, review F-08).
    let chips: Chip[] = [];
    switch (family) {
      case 'architecture': {
        const values = nodeIds.map((x) => attr(x, 'role') ?? '');
        const hue = showsHue(values);
        for (const x of nodeIds) nodes.set(x, styleFor(ROLE_CUES[attr(x, 'role') ?? ''], hue));
        const kinds = edgeIds.map((x) => this.relationship(x)?.kind ?? '');
        edgeIds.forEach((x, i) => edges.set(x, styleFor(EDGE_KIND_CUES[kinds[i]!], false)));
        chips = [...hueChips(values, ROLE_CUES, 'role'), ...patternChips(kinds, EDGE_KIND_CUES, 'kind')];
        tokens(nodeIds, 'role', values);
        tokens(edgeIds, 'kind', kinds);
        break;
      }
      case 'cause': {
        const basisOf = (x: string, rel: boolean) => (rel ? this.relationship(x)?.basis : attr(x, 'basis')) ?? 'unstated';
        const values = [...nodeIds.map((x) => basisOf(x, false)), ...edgeIds.map((x) => basisOf(x, true))];
        const hue = showsHue(values);
        const style = (basis: string): PartStyle => (BASIS_CUES[basis] ? styleFor(BASIS_CUES[basis], hue) : { dash: UNSTATED_BASIS_DASH });
        for (const x of nodeIds) nodes.set(x, style(basisOf(x, false)));
        for (const x of edgeIds) edges.set(x, style(basisOf(x, true)));
        chips = hueChips(values, BASIS_CUES, 'basis');
        tokens([...nodeIds, ...edgeIds], 'basis', values);
        break;
      }
      case 'plan': {
        const values = nodeIds.map((x) => attr(x, 'status') ?? 'proposed');
        const hue = showsHue(values);
        for (const x of nodeIds) nodes.set(x, styleFor(STATUS_CUES[attr(x, 'status') ?? 'proposed'], hue));
        const kinds = edgeIds.map((x) => attr(x, 'kind') ?? 'finish-start');
        edgeIds.forEach((x, i) => edges.set(x, styleFor(DEPENDENCY_KIND_CUES[kinds[i]!], false)));
        chips = [...hueChips(values, STATUS_CUES, 'status'), ...patternChips(kinds, DEPENDENCY_KIND_CUES, 'kind')];
        tokens(nodeIds, 'status', values);
        tokens(edgeIds, 'kind', kinds);
        break;
      }
      case 'transform': {
        const values = edgeIds.map((x) => (attr(x, 'loss') ? 'loss' : 'none'));
        const hue = showsHue(values);
        for (const x of nodeIds) nodes.set(x, {});
        for (const x of edgeIds) edges.set(x, attr(x, 'loss') ? { ...styleFor(LOSS_CUE, hue), labelHue: hue } : {});
        chips = hueChips(values, { loss: LOSS_CUE }, 'loss');
        tokens(edgeIds, 'loss', values);
        break;
      }
      case 'state': {
        // No hue: the initial and terminal marks are shapes, and a transition
        // basis other than observed is a line pattern, as in cause.
        for (const x of nodeIds) {
          const n = this.nodes.get(x)!;
          const initial = n.attributes['initial'] === true;
          const terminal = n.attributes['terminal'] === true;
          const marks = [...(initial ? ['initial' as const] : []), ...(terminal ? ['terminal' as const] : [])];
          const className = [initial ? 'vs-initial' : '', terminal ? 'vs-terminal' : ''].filter(Boolean).join(' ');
          nodes.set(x, { ...(marks.length > 0 ? { marks } : {}), ...(className ? { className } : {}) });
        }
        const bases = edgeIds.map((x) => this.relationship(x)?.basis ?? '');
        edgeIds.forEach((x, i) => {
          const dash = BASIS_CUES[bases[i]!]?.dash;
          edges.set(x, dash ? { dash } : {});
        });
        chips = patternChips(bases, BASIS_CUES, 'basis');
        tokens(edgeIds, 'basis', bases);
        break;
      }
      case 'domain': {
        // Concept `category` in hue with a shape cue; relation `kind` as a
        // line pattern and a line end (docs/IMPROVEMENTS.md §3.2, §5.3).
        const values = nodeIds.map((x) => attr(x, 'category') ?? 'none');
        const hue = showsHue(values);
        for (const x of nodeIds) nodes.set(x, styleFor(CATEGORY_CUES[attr(x, 'category') ?? ''], hue));
        const kinds = edgeIds.map((x) => this.relationship(x)?.kind ?? '');
        edgeIds.forEach((x, i) => edges.set(x, styleFor(RELATION_KIND_CUES[kinds[i]!], false)));
        chips = [...hueChips(values, CATEGORY_CUES, 'category'), ...patternChips(kinds, RELATION_KIND_CUES, 'kind')];
        tokens(nodeIds, 'category', values);
        tokens(edgeIds, 'kind', kinds);
        break;
      }
    }
    return { nodes, edges, legend: legend(chips, DOM.attr.generated, DOM.attr.filter), filters };
  }

  // --- Domain (docs/IMPROVEMENTS.md §5) ----------------------------------------

  /**
   * A domain figure (§5.4): the map and a glossary table in one row. On a
   * window of 1200 px or more the row is centred on the text column, and the
   * glossary sits beside the map when both fit, else under it (reader.css).
   * The runtime puts the view bar before the row. On a narrow screen the glossary comes
   * first and the map is behind "Show map". The glossary rows are the list
   * instances of the concepts; the relation list is behind the view toggle,
   * as in the other graph families.
   */
  domainShell(id: string, node: MNode, svg: HNode | null, concepts: TargetRecord[], relList: HNode, legendNode: HNode | null): HNode {
    return this.figureShell(id, node, 'vs-graph vs-family-domain', [
      h('div', { class: 'vs-domain-body' },
        svg ? h('div', { class: 'vs-viewport', [DOM.attr.viewport]: true }, svg) : null,
        svg ? h('p', { class: 'vs-overflow-hint', hidden: true }, 'Scroll sideways to see the whole figure.') : null,
        this.glossary(id, concepts)),
      h('div', { class: 'vs-lists' }, relList),
    ], svg !== null, legendNode);
  }

  /** Run `fn` as if it renders the body of `defId`: the term of that definition is not linked (§13.3). */
  withOwnDefinition<T>(defId: string | undefined, fn: () => T): T {
    const previous = this.ownDefinition;
    this.ownDefinition = defId;
    try {
      return fn();
    } finally {
      this.ownDefinition = previous;
    }
  }

  /**
   * The glossary of a domain figure (§5.4): one row per concept with the
   * term and its category word, the first sentence of its definition, and a
   * "Read more" link that opens the concept in the inspector.
   */
  glossary(figureId: string, concepts: TargetRecord[]): HNode {
    return h('div', { class: 'vs-glossary-wrap' },
      h('table', { class: 'vs-glossary', 'aria-label': 'Glossary' },
        h('thead', { [DOM.attr.generated]: true }, h('tr', {},
          h('th', { scope: 'col' }, 'Term'),
          h('th', { scope: 'col' }, 'Meaning'),
          h('th', { scope: 'col' }, h('span', { class: 'vs-sr' }, 'Details')))),
        h('tbody', {}, concepts.map((c) => {
          const defId = attrString(this.nodes.get(c.id)!, 'definition');
          const category = attrString(this.nodes.get(c.id)!, 'category');
          const label = this.label(c.id);
          return h('tr', {},
            h('th', { scope: 'row' },
              h('a', { class: 'vs-glossary-term', href: `#${DOM.canonicalId(c.id)}`, id: DOM.listInstanceId(figureId, c.id), [DOM.attr.target]: c.id, [DOM.attr.interactive]: true }, label),
              // The category word, as in the node list: the list view has no
              // map and no legend (docs/IMPROVEMENTS.md §3.3, phase 4 review D5).
              category ? h('span', { class: 'vs-role', [DOM.attr.generated]: true }, ` (${this.safeText(category, c.id)})`) : null),
            h('td', {}, this.withTermScope(() => this.withOwnDefinition(defId, () => this.linkText(defId ? this.definitionSentence(defId) : '', defId)))),
            h('td', { class: 'vs-glossary-more' },
              h('a', { class: 'vs-inspect-link', href: `#${DOM.canonicalId(c.id)}`, 'aria-label': `Read more: ${label}`, [DOM.attr.generated]: true }, 'Read more')));
        }))));
  }

  /** A concept's inspector body (§5.4): its definition, then its own body. */
  conceptBody(node: MNode): Child[] {
    const defId = attrString(node, 'definition');
    const def = defId ? this.nodes.get(defId) : undefined;
    return this.withOwnDefinition(defId, () => [def ? this.blocks(def) : null, this.blocks(node)]);
  }

  /** The concept that owns a definition, if any (§5.3: one definition, one owner). */
  conceptOf(defId: string): string | undefined {
    return this.bundle.parsed.targets.find((t) => t.tagName === 'concept' && t.attributes['definition'] === defId)?.id;
  }

  /**
   * An extension component (§14). The part list is always rendered from the
   * source, so the figure is never the only form. The SVG comes from a trusted
   * build entry and is rebuilt through the allowlist; without a runnable
   * extension, the list alone is shown with a generated note.
   */
  extension(id: string, node: MNode): HNode {
    const use = attrString(node, 'use') ?? '';
    const parts = this.childTargets(id).filter((c) => c.kind === 'part');
    const binding = this.options.extensions?.get(use);
    let svg: HNode | null = null;
    const texts = new Map<string, string>();
    let note: string | undefined;
    if (!binding) {
      this.error('E_EXTENSION_MISSING', `extension ${use} was not resolved for this build`, id);
    } else if (!binding.ready) {
      note = `The ${use} extension did not run for this build (${binding.code}). The parts below are the complete text form.`;
    } else {
      const input = componentInputs(this.bundle.model).find((c) => c.id === id)!.input;
      try {
        const output = binding.run(input);
        for (const [partId, value] of Object.entries(output.parts)) texts.set(partId, value.text);
        svg = extensionSvg(output.svg, {
          extension: use, figureId: id, title: attrString(node, 'title') ?? this.label(id),
          parts: new Map(parts.map((p) => [p.id, this.label(p.id)])), text: (x) => this.safeText(x, id),
        });
      } catch (error) {
        const e = error as { code?: string; message: string };
        if (error instanceof HashError || error instanceof UnsafeMarkupError) this.error(e.code ?? 'E_EXTENSION_FAILED', e.message, id);
        else throw error;
      }
    }
    const list = h('ul', { class: 'vs-node-list vs-ext-parts', 'aria-label': 'Parts' },
      parts.map((p) => h('li', {},
        h('a', { href: `#${DOM.canonicalId(p.id)}`, id: DOM.listInstanceId(id, p.id), [DOM.attr.target]: p.id, [DOM.attr.interactive]: true }, this.label(p.id)),
        texts.has(p.id) ? h('span', { class: 'vs-role', [DOM.attr.generated]: true }, ` (${this.safeText(texts.get(p.id)!, p.id)})`) : null)));
    return this.figureShell(id, node, `vs-extension vs-ext-${use}`, [
      svg ? h('div', { class: 'vs-viewport', [DOM.attr.viewport]: true }, svg) : null,
      note ? h('p', { class: 'vs-extension-note', role: 'note', [DOM.attr.generated]: true }, note) : null,
      h('div', { class: 'vs-lists' }, list),
    ], svg !== null);
  }

  compare(id: string, node: MNode): HNode {
    const children = this.childTargets(id);
    const options = children.filter((c) => c.kind === 'option');
    const criteria = children.filter((c) => c.kind === 'criterion');
    const cells = children.filter((c) => c.kind === 'cell');
    const cellFor = (o: string, c: string) => cells.find((x) => {
      const n = this.nodes.get(x.id)!;
      return attrString(n, 'option') === o && attrString(n, 'criterion') === c;
    });
    const link = (target: string, instanceId: string, content: Child) =>
      h('a', { href: `#${DOM.canonicalId(target)}`, id: instanceId, [DOM.attr.target]: target, [DOM.attr.interactive]: true }, content);
    const criterionLabel = (c: TargetRecord, instanceId: string): Child => {
      const units = attrString(this.nodes.get(c.id)!, 'units');
      return [link(c.id, instanceId, this.label(c.id)), units ? h('span', { class: 'vs-units', [DOM.attr.generated]: true }, ` (${this.safeText(units, c.id)})`) : null];
    };
    const cellContent = (cell: TargetRecord | undefined, instanceId: string, o: TargetRecord, c: TargetRecord): Child => {
      if (!cell) return h('span', { class: 'vs-not-provided', [DOM.attr.generated]: true }, 'Not provided');
      const n = this.nodes.get(cell.id)!;
      const value = n.attributes['value'];
      const status = attrString(n, 'valueStatus');
      if (value === undefined) {
        // No value: the first paragraph of the cell is its value (docs/
        // IMPROVEMENTS.md §4.6). A small "›" link opens the cell's detail only
        // when the inspector holds more than the cell shows: a second block,
        // evidence, a `cite`, or a nested `detail`. The link is then the
        // cell's one table instance (§10.3); it sits inline after the text,
        // and the full word "details" is in its aria-label. With no link, the
        // cell body carries the table instance.
        const body = [...this.blocks(n)];
        if (!compareCellHasDetails(n, (x) => this.isTargetNode(x), this.ownEvidenceIds(cell.id).length > 0)) {
          return h('div', { class: 'vs-cell-body', id: instanceId, [DOM.attr.target]: cell.id }, body);
        }
        const cellLink = h('a', { class: 'vs-cell-link', href: `#${DOM.canonicalId(cell.id)}`, id: instanceId, 'aria-label': `${this.label(o.id)}: ${this.label(c.id)}, details`, [DOM.attr.target]: cell.id, [DOM.attr.interactive]: true },
          h('span', { [DOM.attr.generated]: true, 'aria-hidden': 'true' }, '›'));
        let last = body.length - 1;
        while (last >= 0 && !body[last]) last--;
        const end = body[last];
        if (end && typeof end === 'object' && !Array.isArray(end) && (end as HNode).tag === 'p') {
          const p = end as HNode;
          body[last] = { ...p, children: [...p.children, ' ', cellLink] };
        } else {
          body.push(cellLink);
        }
        return h('div', { class: 'vs-cell-body' }, body);
      }
      return [
        link(cell.id, instanceId, this.safeText(String(value), cell.id)),
        status ? h('span', { class: 'vs-value-status', [DOM.attr.generated]: true }, ` (${status})`) : null,
        h('div', { class: 'vs-cell-body' }, this.blocks(n)),
      ];
    };
    const table = h('table', { class: 'vs-compare-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, h('span', { [DOM.attr.generated]: true }, 'Criterion')),
        options.map((o) => h('th', { scope: 'col' }, link(o.id, DOM.svgInstanceId(id, o.id), this.label(o.id)))))),
      h('tbody', {}, criteria.map((c) => h('tr', {},
        h('th', { scope: 'row' }, criterionLabel(c, DOM.svgInstanceId(id, c.id))),
        options.map((o) => {
          const cell = cellFor(o.id, c.id);
          return h('td', {}, cellContent(cell, cell ? DOM.svgInstanceId(id, cell.id) : '', o, c));
        })))));
    // Narrow screens: criteria as rows, every option stacked inside each criterion (§9.8).
    // One link per option row: the option label opens that cell's detail, and the
    // value is plain text, so a card does not repeat a "Details" link per cell. A
    // single options line keeps one narrow-screen instance of each option target.
    const optionLine = h('p', { class: 'vs-compare-options' },
      h('span', { [DOM.attr.generated]: true }, 'Options: '),
      options.map((o, i) => [i > 0 ? h('span', { [DOM.attr.generated]: true }, ', ') : null, link(o.id, DOM.listInstanceId(id, o.id), this.label(o.id))]));
    const cardValue = (cell: TargetRecord | undefined): Child => {
      if (!cell) return h('span', { class: 'vs-not-provided', [DOM.attr.generated]: true }, 'Not provided');
      const n = this.nodes.get(cell.id)!;
      const value = n.attributes['value'];
      const status = attrString(n, 'valueStatus');
      return [
        value !== undefined ? h('span', { class: 'vs-cell-value' }, this.safeText(String(value), cell.id)) : null,
        status ? h('span', { class: 'vs-value-status', [DOM.attr.generated]: true }, `${value !== undefined ? ' ' : ''}(${status})`) : null,
        h('div', { class: 'vs-cell-body' }, this.blocks(n)),
      ];
    };
    const cards = h('div', { class: 'vs-compare-cards' }, optionLine, criteria.map((c) => h('section', { class: 'vs-compare-card', 'aria-label': this.label(c.id) },
      h('p', { class: 'vs-compare-criterion' }, criterionLabel(c, DOM.listInstanceId(id, c.id))),
      h('dl', {}, options.map((o) => {
        const cell = cellFor(o.id, c.id);
        return [
          h('dt', {}, cell
            ? h('a', { href: `#${DOM.canonicalId(cell.id)}`, id: DOM.listInstanceId(id, cell.id), [DOM.attr.target]: cell.id, [DOM.attr.interactive]: true, 'aria-label': `${this.label(o.id)}: ${this.label(c.id)}` }, this.label(o.id))
            : h('span', {}, this.label(o.id))),
          h('dd', {}, cardValue(cell)),
        ];
      })))));
    return this.figureShell(id, node, 'vs-compare', [table, cards]);
  }

  trace(id: string, node: MNode): HNode {
    const children = this.childTargets(id);
    const actors = children.filter((c) => c.kind === 'actor');
    const events = children.filter((c) => c.kind === 'event');
    const branches = children.filter((c) => c.kind === 'branch');
    const scale = attrString(node, 'scale') ?? 'ordinal';
    const timeUnit = attrString(node, 'timeUnit');
    const scaleNote = scale === 'ordinal'
      ? h('p', { class: 'vs-trace-scale', [DOM.attr.generated]: true }, 'Ordering, not duration.')
      : h('p', { class: 'vs-trace-scale', [DOM.attr.generated]: true }, `Event times${timeUnit ? ` in ${timeUnit}` : ''}; vertical position shows order layer.`);
    const actorList = h('ul', { class: 'vs-actor-list', 'aria-label': 'Actors' },
      actors.map((a) => {
        const entity = attrString(this.nodes.get(a.id)!, 'entity');
        return h('li', {},
          h('a', { href: `#${DOM.canonicalId(a.id)}`, id: DOM.listInstanceId(id, a.id), [DOM.attr.target]: a.id, [DOM.attr.interactive]: true }, this.label(a.id)),
          entity && this.label(entity) !== this.label(a.id) ? h('span', { class: 'vs-entity', [DOM.attr.generated]: true }, ' (', h('a', { href: `#${DOM.canonicalId(entity)}` }, this.label(entity)), ')') : null);
      }));
    // Order layer: the longest `after` chain before an event. Events in one layer
    // have no ordering constraint between them; the number is not a timestamp.
    const layer = new Map<string, number>();
    const layerOf = (eventId: string, seen: Set<string>): number => {
      if (layer.has(eventId)) return layer.get(eventId)!;
      if (seen.has(eventId)) return 1;
      seen.add(eventId);
      const prereqs = this.bundle.model.relationships.filter((r) => r.kind === 'order' && r.to === eventId).map((r) => r.from);
      const value = prereqs.length === 0 ? 1 : 1 + Math.max(...prereqs.map((p) => layerOf(p, seen)));
      layer.set(eventId, value);
      return value;
    };
    // One event's content; `suffix` keeps instance IDs unique across the flat
    // list and the narrow-screen actor groups.
    const eventContent = (e: TargetRecord, suffix: string, showActor: boolean): Child[] => {
      const en = this.nodes.get(e.id)!;
      const actor = attrString(en, 'actor');
      const kind = attrString(en, 'kind') ?? 'event';
      const branch = attrString(en, 'branch');
      const time = en.attributes['time'];
      const orders = this.bundle.model.relationships.filter((r) => r.kind === 'order' && r.to === e.id);
      // An event with `to` is also a message relationship whose ID is the event ID (§9.2).
      const message = this.bundle.model.relationships.find((r) => r.kind === 'message' && r.id === e.id);
      return [
        h('span', { class: 'vs-event-layer', [DOM.attr.generated]: true }, `Order layer ${layerOf(e.id, new Set())} `),
        h('a', { href: `#${DOM.canonicalId(e.id)}`, id: DOM.listInstanceId(id, e.id) + suffix, [DOM.attr.target]: e.id, [DOM.attr.rel]: message ? e.id : undefined, [DOM.attr.interactive]: true },
          showActor && actor ? h('span', { class: 'vs-actor', [DOM.attr.generated]: true }, `${this.label(actor)}: `) : null,
          this.label(e.id),
          message ? h('span', { class: 'vs-message-to', [DOM.attr.generated]: true }, ` \u2192 ${this.label(message.to)}`) : null),
        h('span', { class: 'vs-event-kind', [DOM.attr.generated]: true }, ` [${kind}]`),
        scale === 'time' && time !== undefined ? h('span', { class: 'vs-event-time', [DOM.attr.generated]: true }, ` at ${String(time)}${timeUnit ? ` ${timeUnit}` : ''}`) : null,
        branch ? h('span', { class: 'vs-event-branch', [DOM.attr.generated]: true }, ` branch: ${this.label(branch)}`) : null,
        // An observation names what shows it (docs/IMPROVEMENTS.md §14.6).
        kind === 'observation' && this.ownEvidenceIds(e.id).length > 0
          ? h('span', { class: 'vs-event-evidence', [DOM.attr.generated]: true }, '; seen in: ',
              this.ownEvidenceIds(e.id).map((s, i) => [i > 0 ? ', ' : '', h('a', { class: 'vs-inspect-link', href: `#${DOM.canonicalId(s)}` }, this.label(s))]))
          : null,
        orders.length > 0
          ? h('span', { class: 'vs-after', [DOM.attr.generated]: true }, ' after: ',
              orders.map((r, i) => [i > 0 ? ', ' : '', h('a', { href: `#${DOM.canonicalId(r.from)}`, id: DOM.listInstanceId(id, r.id) + suffix, [DOM.attr.target]: e.id, [DOM.attr.rel]: r.id }, this.label(r.from))]))
          : null,
      ];
    };
    const kindOf = (e: TargetRecord) => attrString(this.nodes.get(e.id)!, 'kind') ?? 'event';
    const eventList = h('ol', { class: 'vs-trace-events', 'aria-label': 'Events in authored order' },
      events.map((e) => h('li', { class: `vs-event vs-kind-${kindOf(e)}` }, eventContent(e, '', true))));
    // Narrow screens: event cards grouped by actor, in authored order within each
    // actor (§9.4). Order layer, `after`, branch, and message target stay visible.
    const byActor = h('div', { class: 'vs-trace-by-actor' }, actors.map((a) => {
      const entity = attrString(this.nodes.get(a.id)!, 'entity');
      const own = events.filter((e) => attrString(this.nodes.get(e.id)!, 'actor') === a.id);
      return h('section', { class: 'vs-actor-group', 'aria-label': this.label(a.id) },
        h('p', { class: 'vs-actor-heading' },
          h('a', { href: `#${DOM.canonicalId(a.id)}`, id: `${DOM.listInstanceId(id, a.id)}.card`, [DOM.attr.target]: a.id, [DOM.attr.interactive]: true }, this.label(a.id)),
          entity && this.label(entity) !== this.label(a.id) ? h('span', { class: 'vs-entity', [DOM.attr.generated]: true }, ' (', h('a', { href: `#${DOM.canonicalId(entity)}` }, this.label(entity)), ')') : null),
        own.length > 0
          ? h('ol', { class: 'vs-trace-cards', 'aria-label': `Events of ${this.label(a.id)}` },
              own.map((e) => h('li', { class: `vs-event vs-kind-${kindOf(e)}` }, eventContent(e, '.card', false))))
          : h('p', { class: 'vs-no-events', [DOM.attr.generated]: true }, 'No events.'));
    }), (() => {
      // The events of the one implicit lane of a time-scaled trace with no actors (§14.6).
      const loose = events.filter((e) => attrString(this.nodes.get(e.id)!, 'actor') === undefined);
      if (loose.length === 0) return null;
      return h('section', { class: 'vs-actor-group', 'aria-label': 'Events' },
        h('p', { class: 'vs-actor-heading', [DOM.attr.generated]: true }, 'Events'),
        h('ol', { class: 'vs-trace-cards', 'aria-label': 'Events' },
          loose.map((e) => h('li', { class: `vs-event vs-kind-${kindOf(e)}` }, eventContent(e, '.card', false)))));
    })());
    const branchList = branches.length > 0
      ? h('ul', { class: 'vs-branch-list', 'aria-label': 'Branches' }, branches.map((b) => h('li', {},
          h('a', { href: `#${DOM.canonicalId(b.id)}`, id: DOM.listInstanceId(id, b.id), [DOM.attr.target]: b.id, [DOM.attr.interactive]: true }, this.label(b.id)))))
      : null;
    // Wide screens: lifelines and event rows (§9.4). The lists stay the complete
    // form and the narrow-screen and no-map view, as for graphs. Above the graph
    // caps the figure is left out; the lists are always present.
    const orders = this.bundle.model.relationships.filter((r) => r.kind === 'order' && events.some((e) => e.id === r.to));
    const drawable = events.length > 0 && events.length <= GRAPH_MAX_NODES && orders.length <= GRAPH_MAX_EDGES;
    // Hue encodes the event kind, failure and wait only (docs/IMPROVEMENTS.md §3.2).
    const kindValues = events.map((e) => kindOf(e));
    const svg = drawable
      ? traceSvg({
          figureId: id,
          title: attrString(node, 'title') ?? this.label(id),
          // A time-scaled trace with no actors has one implicit lane (§14.6).
          actors: actors.length === 0 && events.some((e) => attrString(this.nodes.get(e.id)!, 'actor') === undefined)
            ? [{ id: '', label: '', implicit: true }]
            : actors.map((a) => ({ id: a.id, label: this.label(a.id) })),
          events: events.map((e) => {
            const en = this.nodes.get(e.id)!;
            const branch = attrString(en, 'branch');
            const time = en.attributes['time'];
            const message = this.bundle.model.relationships.find((r) => r.kind === 'message' && r.id === e.id);
            return {
              id: e.id,
              actor: attrString(en, 'actor') ?? '',
              label: this.label(e.id),
              kind: kindOf(e),
              layer: layerOf(e.id, new Set()),
              // A box shows its label, the receiver of a message, and a time on
              // a time scale (§3.4). The kind and the branch move to the cue,
              // the branch heading, the list, and the aria-label. The time line
              // has its own class, so the reader mutes it and not the receiver.
              meta: message ? [`\u2192 ${this.label(message.to)}`] : [],
              ...(scale === 'time' && time !== undefined ? { time: `at ${String(time)}${timeUnit ? ` ${timeUnit}` : ''}` } : {}),
              ...(scale === 'time' && typeof time === 'number' ? { timeValue: time } : {}),
              notes: [
                `[${kindOf(e)}]${message ? ` \u2192 ${this.label(message.to)}` : ''}`,
                ...(branch ? [`branch: ${this.label(branch)}`] : []),
                ...(scale === 'time' && time !== undefined ? [`at ${String(time)}${timeUnit ? ` ${timeUnit}` : ''}`] : []),
              ],
              ...(branch ? { branch } : {}),
            };
          }),
          orders: orders.map((r) => ({ id: r.id, from: r.from, to: r.to })),
          messages: this.bundle.model.relationships.filter((r) => r.kind === 'message' && events.some((e) => e.id === r.id)).map((r) => ({ event: r.id, to: r.to })),
          branches: branches.map((b) => {
            const excl = this.nodes.get(b.id)!.attributes['exclusiveWith'];
            return { id: b.id, label: this.label(b.id), exclusiveWith: Array.isArray(excl) ? excl.map(String) : [] };
          }),
          labelOf: (x) => this.label(x),
          hue: showsHue(kindValues),
          termsOf: (x) => this.labelTerms(x),
        })
      : null;
    return this.figureShell(id, node, 'vs-trace', [
      scaleNote,
      svg ? h('div', { class: 'vs-viewport', [DOM.attr.viewport]: true }, svg) : null,
      svg ? h('p', { class: 'vs-overflow-hint', hidden: true }, 'Scroll sideways to see the whole figure.') : null,
      h('div', { class: 'vs-lists' }, actorList, branchList, eventList, byActor),
    ], svg !== null, svg ? legend(hueChips(kindValues, EVENT_CUES, 'kind'), DOM.attr.generated, DOM.attr.filter) : null);
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

  codeLines(sourceId: string, text: string, marks: Map<number, string[]>, figureId?: string, cover?: Map<number, string[]>): HNode {
    const start = Number(this.nodes.get(sourceId)?.attributes['start'] ?? 1);
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    return h('pre', { class: 'vs-code' }, h('code', {}, lines.map((line, i) => {
      const number = start + i;
      const annotations = marks.get(number) ?? [];
      // The annotations that cover the line, for a `steps` walkthrough (§14.1).
      const covered = cover?.get(number) ?? [];
      return h('span', { class: annotations.length > 0 ? 'vs-line vs-annotated' : 'vs-line', [DOM.attr.ann]: covered.length > 0 ? covered.join(' ') : undefined },
        h('span', { class: 'vs-ln', [DOM.attr.generated]: true }, String(number)),
        figureId ? this.markerColumn(figureId, annotations, number) : null,
        this.safeText(line, sourceId),
        '\n');
    })));
  }

  /**
   * The marker column of an annotated code line: a fixed-width cell before
   * the code, on every line, that holds the marker of each annotation that
   * starts on the line. The code then starts in the same column on each
   * line, with or without a marker (phase 6a review S3).
   */
  markerColumn(figureId: string, annotations: string[], number: number): HNode {
    return h('span', { class: 'vs-ann-col', [DOM.attr.generated]: true },
      annotations.map((a) => h('a', { class: 'vs-annotation-marker', href: `#${DOM.canonicalId(a)}`, id: DOM.svgInstanceId(figureId, `${a}.${number}`), [DOM.attr.target]: a, [DOM.attr.interactive]: true, [DOM.attr.generated]: true, 'aria-label': this.label(a) }, '\u25cf')));
  }

  /**
   * The annotation marks of one source: each annotation's ID at its first
   * line (`marks`), and every annotation that covers each line (`cover`),
   * which a `steps` walkthrough uses to mark the lines of a step (\u00a714.1).
   */
  annotationMarks(sourceId: string, text: string | undefined, annotations: TargetRecord[]): { marks: Map<number, string[]>; cover: Map<number, string[]> } {
    const start = Number(this.nodes.get(sourceId)?.attributes['start'] ?? 1);
    const marks = new Map<number, string[]>();
    const cover = new Map<number, string[]>();
    for (const a of annotations) {
      const range = this.nodes.get(a.id)!.attributes['lines'];
      if (!Array.isArray(range) || range.length !== 2) continue;
      const [from, to] = range as number[];
      const count = text !== undefined ? text.replace(/\n$/, '').split('\n').length : 0;
      if (from === undefined || to === undefined || from < start || to < from || to > start + count - 1) {
        this.error('E_REF_BROKEN', `annotation ${a.id} lines ${from}-${to} are outside source ${sourceId}`, a.id);
        continue;
      }
      for (let n = from; n <= to; n++) {
        marks.set(n, [...(marks.get(n) ?? []), ...(n === from ? [a.id] : [])]);
        cover.set(n, [...(cover.get(n) ?? []), a.id]);
      }
    }
    return { marks, cover };
  }

  annotated(id: string, node: MNode): HNode {
    const sourceId = attrString(node, 'source') ?? '';
    const beforeId = attrString(node, 'before');
    const captured = this.sourceText(sourceId);
    const annotations = this.childTargets(id).filter((c) => c.kind === 'annotation');
    const sideOf = (a: TargetRecord) => (beforeId && attrString(this.nodes.get(a.id)!, 'side') === 'before' ? 'before' : 'after');
    if (!captured) this.error('E_REF_BROKEN', `annotated ${id} needs a captured text source; ${sourceId} has none`, id);
    const list = h('ol', { class: 'vs-annotation-list', 'aria-label': 'Annotations' }, annotations.map((a) => {
      const range = this.nodes.get(a.id)!.attributes['lines'];
      const lines = Array.isArray(range) ? `lines ${range.join('\u2013')}` : '';
      // With a `before` source, each item names its side (\u00a714.7).
      const where = beforeId
        ? `${sideOf(a) === 'before' ? 'Before' : 'After'}${lines ? `, ${lines}` : ''}: `
        : lines ? `L${lines.slice(1)}: ` : '';
      return h('li', {},
        h('a', { href: `#${DOM.canonicalId(a.id)}`, id: DOM.listInstanceId(id, a.id), [DOM.attr.target]: a.id, [DOM.attr.interactive]: true },
          h('span', { [DOM.attr.generated]: true }, where), this.label(a.id)));
    }));
    if (beforeId) {
      const before = this.sourceText(beforeId);
      if (!before) this.error('E_REF_BROKEN', `annotated ${id} needs a captured text source for \`before\`; ${beforeId} has none`, id);
      return this.figureShell(id, node, 'vs-annotated vs-annotated-diff', [
        captured && before ? this.diffView(id, beforeId, before.text, sourceId, captured.text, annotations.filter((a) => sideOf(a) === 'before'), annotations.filter((a) => sideOf(a) === 'after')) : null,
        list,
      ]);
    }
    const { marks, cover } = this.annotationMarks(sourceId, captured?.text, annotations);
    return this.figureShell(id, node, 'vs-annotated', [
      h('p', { class: 'vs-annotated-source', [DOM.attr.generated]: true }, 'Source: ', h('a', { href: `#${DOM.canonicalId(sourceId)}` }, this.label(sourceId))),
      captured ? h('div', { class: 'vs-viewport', [DOM.attr.viewport]: true }, this.codeLines(sourceId, captured.text, marks, id, cover)) : null,
      list,
    ]);
  }

  /**
   * The before-and-after view of an annotated figure (\u00a714.7). The build
   * computes a line diff. Each side keeps the line numbers of its own
   * source. A removed line has a "\u2212" sign, and an added line a "+" sign, so
   * the mark does not depend on colour. On a wide screen the two sides sit
   * side by side, with a gap row where the other side has a line; on a
   * narrow screen they stack, and the gap rows hide.
   */
  diffView(figureId: string, beforeId: string, beforeText: string, afterId: string, afterText: string, beforeAnnotations: TargetRecord[], afterAnnotations: TargetRecord[]): HNode {
    const a = excerptLines(beforeText);
    const b = excerptLines(afterText);
    const rows = lineDiff(a, b);
    this.diffs.set(figureId, rows);
    const pairs = diffPairs(rows);
    const side = (which: 'before' | 'after', sourceId: string, lines: string[], annotations: TargetRecord[]) => {
      const start = Number(this.nodes.get(sourceId)?.attributes['start'] ?? 1);
      const { marks, cover } = this.annotationMarks(sourceId, lines.join('\n'), annotations);
      const sign = which === 'before' ? '\u2212' : '+';
      const changedClass = which === 'before' ? 'vs-line-removed' : 'vs-line-added';
      const rows = pairs.map((p) => {
        const index = which === 'before' ? p.before : p.after;
        if (index === undefined) return h('span', { class: 'vs-line vs-line-gap', 'aria-hidden': 'true' }, '\n');
        const number = start + index;
        const annotations = marks.get(number) ?? [];
        const covered = cover.get(number) ?? [];
        return h('span', { class: `vs-line${p.changed ? ` ${changedClass}` : ''}${annotations.length > 0 ? ' vs-annotated' : ''}`, [DOM.attr.ann]: covered.length > 0 ? covered.join(' ') : undefined },
          h('span', { class: 'vs-ln', [DOM.attr.generated]: true }, String(number)),
          // The sign is for the eye; assistive technology reads the word
          // (phase 6a review S2). A span with no role ignores an aria-label.
          h('span', { class: 'vs-diff-sign', [DOM.attr.generated]: true, 'aria-hidden': 'true' }, p.changed ? sign : ' '),
          p.changed ? h('span', { class: 'vs-sr vs-diff-sr', [DOM.attr.generated]: true }, which === 'before' ? 'removed: ' : 'added: ') : null,
          this.markerColumn(figureId, annotations, number),
          this.safeText(lines[index]!, sourceId),
          '\n');
      });
      return h('div', { class: `vs-diff-side vs-diff-${which}` },
        h('p', { class: 'vs-diff-heading', [DOM.attr.generated]: true }, which === 'before' ? 'Before: ' : 'After: ', h('a', { href: `#${DOM.canonicalId(sourceId)}` }, this.label(sourceId))),
        h('pre', { class: 'vs-code' }, h('code', {}, rows)));
    };
    const removed = pairs.filter((p) => p.changed && p.before !== undefined).length;
    const added = pairs.filter((p) => p.changed && p.after !== undefined).length;
    return h('div', { class: 'vs-diff' },
      h('p', { class: 'vs-diff-summary', [DOM.attr.generated]: true }, `${removed} line${removed === 1 ? '' : 's'} removed (\u2212), ${added} line${added === 1 ? '' : 's'} added (+).`),
      h('div', { class: 'vs-viewport vs-diff-sides', [DOM.attr.viewport]: true },
        side('before', beforeId, a, beforeAnnotations),
        side('after', afterId, b, afterAnnotations)));
  }

  // --- Appendix -------------------------------------------------------------

  // --- Mermaid (§9.12) --------------------------------------------------------

  mermaidFigures(): Map<string, MermaidFigure> {
    return (this.bundle.model as { mermaid?: Map<string, MermaidFigure> }).mermaid ?? new Map();
  }

  /** The Mermaid figure that owns a target, for element and relationship targets. */
  mermaidOwner(id: string): MermaidFigure | undefined {
    for (const figure of this.mermaidFigures().values()) {
      if (figure.elements.some((e) => e.id === id) || figure.relationships.some((r) => r.id === id)) return figure;
    }
    return undefined;
  }

  mermaid(id: string, node: MNode): HNode {
    this.usesMermaid = true;
    const fence = node.children.find((c) => c.type === 'fence');
    const figure: MermaidFigure = this.mermaidFigures().get(id) ?? {
      figureId: id,
      diagramType: 'other',
      declaredType: '',
      source: String(fence?.attributes['content'] ?? ''),
      parsed: false,
      elements: [],
      relationships: [],
    };
    const question = attrString(node, 'question') ?? '';
    const title = attrString(node, 'title') ?? this.label(id);
    const interpretation = this.blocks({ ...node, children: node.children.filter((c) => c.type !== 'fence') });
    // Whole-line `%%` comments never reach the page; the runtime renders from this text (§13.5).
    const source = h('pre', { class: 'vs-mermaid-source' }, h('code', { class: 'language-mermaid' }, this.safeText(stripMermaidComments(figure.source), id)));
    const arrow = (text: string) => h('span', { [DOM.attr.generated]: true }, text);
    let lists: Child = null;
    if (figure.parsed) {
      const nodeList = h('ul', { class: 'vs-node-list', 'aria-label': 'Elements' },
        figure.elements.map((e) => h('li', {},
          h('a', {
            href: `#${DOM.canonicalId(e.id)}`, id: DOM.listInstanceId(id, e.id), [DOM.attr.target]: e.id,
            [DOM.attr.interactive]: true, [DOM.attr.mermaidKey]: e.renderKey,
          }, this.label(e.id)),
          h('span', { class: 'vs-note', [DOM.attr.generated]: true }, ` (${MERMAID_KIND_TEXT[e.kind] ?? e.kind}${e.initial ? ', initial' : ''}${e.terminal ? ', terminal' : ''})`))));
      const relList = h('ol', { class: 'vs-rel-list', 'aria-label': 'Relationships' },
        figure.relationships.map((r) => h('li', {},
          h('a', {
            href: `#${DOM.canonicalId(r.referenceable ? r.id : r.from)}`, id: DOM.listInstanceId(id, r.id),
            // A derived relationship is not referenceable; a reference resolves to its figure (§9.12).
            [DOM.attr.target]: r.referenceable ? r.id : id, [DOM.attr.rel]: r.id,
            [DOM.attr.interactive]: true, [DOM.attr.mermaidKey]: r.renderKey,
          }, this.label(r.from), arrow(' \u2192 '), this.safeText(r.label || MERMAID_KIND_TEXT[r.kind] || r.kind, id), arrow(' \u2192 '), this.label(r.to)))));
      lists = h('div', { class: 'vs-lists' }, nodeList, relList);
    }
    return h('figure', {
      class: 'vs-figure vs-mermaid', ...this.canonical(id), [DOM.attr.mermaid]: figure.diagramType,
      [DOM.attr.question]: question, 'aria-describedby': `vs-q-${id}`, [DOM.attr.views]: figure.parsed ? 'map list' : undefined,
    },
      h('figcaption', { id: `vs-t-${id}` }, this.safeText(title, id)),
      h('p', { id: `vs-q-${id}`, class: 'vs-sr' }, this.safeText(question, id)),
      interpretation,
      h('div', { class: 'vs-viewport', id: DOM.mermaidRenderId(id), [DOM.attr.viewport]: true, [DOM.attr.mermaidRender]: true }),
      source,
      figure.parsed ? null : h('p', { class: 'vs-mermaid-note', [DOM.attr.generated]: true },
        'The parts of this diagram are not individually inspectable; its source above holds the full content.'),
      lists,
      h('p', { class: 'vs-mermaid-notice', role: 'status', hidden: true, [DOM.attr.generated]: true }));
  }

  /** Canonical detail for a target inside a Mermaid figure (§9.12). */
  mermaidDetail(record: TargetRecord): HNode {
    const figure = this.mermaidOwner(record.id);
    const specifics: Child[] = [];
    const figureId = figure?.figureId ?? record.parentId;
    if (figureId) {
      specifics.push(h('p', { class: 'vs-entity', [DOM.attr.generated]: true }, 'In diagram ',
        h('a', { href: `#${DOM.canonicalId(figureId)}` }, this.label(figureId))));
    }
    const rels = figure?.relationships.filter((r) => r.from === record.id || r.to === record.id || r.id === record.id) ?? [];
    if (rels.length > 0) {
      specifics.push(h('ul', { class: 'vs-mermaid-rels' }, rels.map((r) => h('li', {},
        h('a', { href: `#${DOM.canonicalId(r.from)}` }, this.label(r.from)),
        h('span', { [DOM.attr.generated]: true }, ' \u2192 '), this.safeText(r.label || MERMAID_KIND_TEXT[r.kind] || r.kind, record.id),
        h('span', { [DOM.attr.generated]: true }, ' \u2192 '),
        h('a', { href: `#${DOM.canonicalId(r.to)}` }, this.label(r.to))))));
    }
    const element = figure?.elements.find((e) => e.id === record.id);
    if (element?.initial) specifics.push(h('p', { class: 'vs-mermaid-marker', [DOM.attr.generated]: true }, 'Initial state'));
    if (element?.terminal) specifics.push(h('p', { class: 'vs-mermaid-marker', [DOM.attr.generated]: true }, 'Terminal state'));
    if (element?.members && element.members.length > 0) {
      specifics.push(h('p', { class: 'vs-mermaid-members' }, h('span', { [DOM.attr.generated]: true }, 'Contains '),
        element.members.map((m, i) => [i > 0 ? ', ' : '', h('a', { href: `#${DOM.canonicalId(m)}` }, this.label(m))])));
    }
    // A Mermaid part has no authored body, so it gets no visible appendix row
    // (docs/IMPROVEMENTS.md §4.5); the inspector still shows this detail.
    const cue = this.cueWord(record);
    return h('details', { class: `vs-detail vs-kind-${record.kind} vs-detail-bare`, ...this.canonical(record.id), [DOM.attr.cue]: cue },
      h('summary', {}, this.label(record.id), h('span', { class: 'vs-kind', [DOM.attr.generated]: true }, ` \u00b7 ${cue}`)),
      h('div', { class: 'vs-detail-body' }, specifics));
  }

  evidence(id: string): Child {
    const ids = this.relationship(id)?.evidenceIds ?? [];
    if (ids.length === 0) return null;
    return h('p', { class: 'vs-evidence' }, h('span', { [DOM.attr.generated]: true }, 'Evidence: '),
      ids.map((s, i) => [i > 0 ? ', ' : '', h('a', { href: `#${DOM.canonicalId(s)}` }, this.label(s))]));
  }

  /** Muted mono origin shown on the appendix row's summary, after the title (F3b). */
  sourceOriginSummary(node: MNode, id: string): string | undefined {
    const kind = attrString(node, 'kind') ?? 'supplied';
    if (kind === 'git' || kind === 'working-tree' || kind === 'file') {
      const file = attrString(node, 'file');
      if (!file) return undefined;
      const start = node.attributes['start'], end = node.attributes['end'];
      const range = start !== undefined && end !== undefined ? `:${String(start)}\u2013${String(end)}` : '';
      return this.safeText(`${file}${range}`, id);
    }
    if (kind === 'web') {
      const url = attrString(node, 'url');
      try {
        return url ? this.safeText(new URL(url).host, id) : undefined;
      } catch {
        return undefined;
      }
    }
    if (kind === 'example') return 'example';
    return undefined;
  }

  /** The one-line origin shown first in a source detail, after the excerpt (F4a). */
  sourceOriginLine(node: MNode, id: string): Child {
    const kind = attrString(node, 'kind') ?? 'supplied';
    const file = attrString(node, 'file');
    const start = node.attributes['start'], end = node.attributes['end'];
    const range = start !== undefined && end !== undefined ? ` ${String(start)}\u2013${String(end)}` : '';
    if (kind === 'git') {
      const commit = attrString(node, 'commit');
      if (!file || !commit) return null;
      const short = shortCommit(commit);
      const repository = attrString(node, 'repository');
      const href = repository ? sourcePermalink(repository, commit, file, typeof start === 'number' ? start : undefined, typeof end === 'number' ? end : undefined) : undefined;
      const check = href ? checkLink(href) : undefined;
      const commitChild: Child = check?.ok ? h('a', { href: check.href, rel: check.external ? 'noopener noreferrer' : undefined }, short) : short;
      return h('p', { class: 'vs-source-origin', [DOM.attr.generated]: true }, this.safeText(`${file}${range} @ `, id), commitChild);
    }
    if (kind === 'working-tree') {
      if (!file) return null;
      return h('p', { class: 'vs-source-origin', [DOM.attr.generated]: true }, this.safeText(`${file}${range} (uncommitted)`, id));
    }
    if (kind === 'file') {
      if (!file) return null;
      return h('p', { class: 'vs-source-origin', [DOM.attr.generated]: true }, this.safeText(`${file}${range}`, id));
    }
    if (kind === 'web') {
      const url = attrString(node, 'url');
      if (!url) return null;
      let host: string | undefined;
      try {
        host = new URL(url).host;
      } catch {
        host = undefined;
      }
      return h('p', { class: 'vs-source-origin', [DOM.attr.generated]: true }, this.safeText(host ?? url, id));
    }
    if (kind === 'example') return h('p', { class: 'vs-source-origin', [DOM.attr.generated]: true }, 'example');
    return null;
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
    // F4a: the excerpt comes first, then a one-line origin, then the full
    // key/value list collapsed behind "Provenance" \u2014 a reader sees the
    // evidence before the metadata dump, in the appendix and in the inspector
    // (the same element moves between the two).
    return [
      captured ? this.codeLines(id, captured.text, new Map()) : linkOnlyNotice(),
      this.sourceOriginLine(node, id),
      h('details', { class: 'vs-provenance' },
        h('summary', {}, 'Provenance'),
        h('dl', { class: 'vs-source-meta', [DOM.attr.generated]: true }, meta.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
    ];
  }

  /** True for a figure part: a target owned by a figure, not a source, definition, or detail. */
  isPart(record: TargetRecord): boolean {
    return record.ownerComponentId !== undefined && record.ownerComponentId !== record.id && !ENTITY_KINDS.has(record.kind);
  }

  /**
   * The paired-cue word of a target (docs/IMPROVEMENTS.md §4.2, §4.5): the
   * value of the variable that the figure encodes for it, such as the role of
   * a node or the status of a task, else the kind of the part.
   */
  cueWord(record: TargetRecord): string {
    const node = this.nodes.get(record.id);
    const a = (k: string) => (node ? attrString(node, k) : undefined);
    switch (record.kind) {
      case 'node': return a('role') ?? 'node';
      case 'state': return node?.attributes['initial'] === true ? 'initial state' : node?.attributes['terminal'] === true ? 'terminal state' : 'state';
      case 'factor': return a('basis') ?? 'factor';
      case 'causal-link': return a('basis') ?? 'causal link';
      case 'transition': return 'transition';
      case 'task': return a('status') ?? 'proposed';
      case 'dependency': return a('kind') ?? 'finish-start';
      case 'edge': return a('kind') ?? 'edge';
      case 'conversion': return a('loss') ? 'loss' : 'conversion';
      case 'event': return a('kind') ?? 'event';
      case 'group': return 'boundary';
      case 'concept': return a('category') ?? 'concept';
      case 'relation': return a('kind') ?? 'relation';
      // A tree entry's cue is its role; a reading's is its value status (§14.4, §14.5).
      case 'entry': return a('role') ?? 'entry';
      case 'reading': return a('valueStatus') ?? 'reading';
      default: return MERMAID_KIND_TEXT[record.kind] ?? record.kind;
    }
  }

  /** The sources in a target's own `evidence` attribute, in authored order (docs/IMPROVEMENTS.md §4.4). */
  ownEvidenceIds(id: string): string[] {
    const attr = this.nodes.get(id)?.attributes['evidence'];
    const out: string[] = [];
    for (const x of Array.isArray(attr) ? attr : [attr]) {
      if (typeof x === 'string' && this.targets.get(x)?.kind === 'source' && !out.includes(x)) out.push(x);
    }
    return out;
  }

  /**
   * The source IDs that support a target, in inspector order: its `evidence`
   * attribute first, then its citations (docs/IMPROVEMENTS.md §4.4). The
   * set is the §9.2 `evidenceIds`; only the order differs.
   */
  evidenceIds(id: string): string[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    const out: string[] = [...this.ownEvidenceIds(id)];
    const add = (x: unknown) => {
      if (typeof x === 'string' && this.targets.get(x)?.kind === 'source' && !out.includes(x)) out.push(x);
    };
    const visit = (n: MNode) => {
      if (n !== node && this.isTargetNode(n)) return;
      if (n.type === 'tag' && n.tag === 'cite') add(n.attributes['ref']);
      for (const child of n.children) visit(child);
    };
    visit(node);
    for (const x of this.relationship(id)?.evidenceIds ?? []) add(x);
    // The sources of an observation that a causal link names (§14.6).
    for (const o of this.observationIds(id)) for (const x of this.ownEvidenceIds(o)) add(x);
    return out;
  }

  /** The trace observations that a target names in its `evidence` (docs/IMPROVEMENTS.md §14.6). */
  observationIds(id: string): string[] {
    const attr = this.nodes.get(id)?.attributes['evidence'];
    const out: string[] = [];
    for (const x of Array.isArray(attr) ? attr : [attr]) {
      if (typeof x !== 'string' || out.includes(x) || this.targets.get(x)?.kind !== 'event') continue;
      if (attrString(this.nodes.get(x)!, 'kind') === 'observation') out.push(x);
    }
    return out;
  }

  /**
   * The Terms section of a part (docs/IMPROVEMENTS.md §13.4): each term in
   * the part's label, with the first sentence of its definition under it. A
   * term in an SVG label has no tab stop, and no tap target of its own on a
   * narrow screen, so the inspector shows the definition under the part. The
   * term links to its full definition. Without JavaScript this section is
   * the route from a drawn label to the meaning of its terms.
   */
  labelTermsLine(id: string): Child {
    const found = new Map<string, string>();
    for (const seg of this.labelTerms(this.label(id))) if (typeof seg !== 'string' && !found.has(seg.defId)) found.set(seg.defId, seg.text);
    if (found.size === 0) return null;
    return h('section', { class: 'vs-detail-section vs-detail-terms', [DOM.attr.generated]: true },
      h('h3', {}, 'Terms'),
      h('dl', {}, [...found].map(([defId, text]) => [
        h('dt', {}, this.inspectLink(defId, text)),
        h('dd', {}, this.definitionSentence(defId)),
      ])));
  }

  /**
   * The first sentence of a definition, as plain text: the same text that
   * the term bubble shows (docs/IMPROVEMENTS.md §13.4).
   */
  definitionSentence(defId: string): string {
    const node = this.nodes.get(defId);
    if (!node) return '';
    const parts: string[] = [];
    // Inline nodes join their text with no space; a block ends with one.
    const inline = new Set(['inline', 'em', 'strong', 's', 'link', 'tag']);
    const visit = (n: MNode) => {
      if (n !== node && this.isTargetNode(n)) return;
      if (n.type === 'text' || n.type === 'code') {
        parts.push(String(n.attributes['content'] ?? ''));
        return;
      }
      if (n.type === 'softbreak' || n.type === 'hardbreak') {
        parts.push(' ');
        return;
      }
      if (n.type === 'fence' || (n.type === 'tag' && n.tag === 'cite')) return;
      for (const child of n.children) visit(child);
      if (!inline.has(n.type)) parts.push(' ');
    };
    visit(node);
    return this.safeText(firstSentence(parts.join('')), defId);
  }

  /** A link that opens a target in the inspector, or plain text when the target has no detail. */
  inspectLink(id: string, text: Child): Child {
    return this.targets.get(id)?.inspectable ? h('a', { class: 'vs-inspect-link', href: `#${DOM.canonicalId(id)}` }, text) : text;
  }

  /**
   * The Relationships section of a part (docs/IMPROVEMENTS.md §4.2): each
   * relationship that starts or ends at the part, as "→ label → Other part".
   * Each item carries the relationship ID and the other part's ID, so the
   * reader runtime finds the neighbourhood of a part in the static HTML
   * (§4.3) and does not compute it from the drawing.
   */
  relationshipSection(id: string): Child {
    const rels = this.bundle.model.relationships;
    const own = rels.find((r) => r.id === id && r.kind !== 'order');
    const items: HNode[] = [];
    const arrow = (text: string) => h('span', { class: 'vs-rel-arrow' }, text);
    const labelOf = (r: (typeof rels)[number]) => this.inspectLink(r.id, r.kind === 'order' ? r.label : this.label(r.id));
    if (own) {
      items.push(h('li', { class: 'vs-rel-own' },
        this.inspectLink(own.from, this.label(own.from)), arrow(' \u2192 '), this.label(id), arrow(' \u2192 '), this.inspectLink(own.to, this.label(own.to))));
    }
    for (const r of rels) {
      if (r.id === id) continue;
      if (r.from === id) items.push(h('li', { [DOM.attr.edge]: r.id, [DOM.attr.other]: r.to }, arrow('\u2192 '), labelOf(r), arrow(' \u2192 '), this.inspectLink(r.to, this.label(r.to))));
    }
    for (const r of rels) {
      if (r.id === id) continue;
      if (r.to === id) items.push(h('li', { [DOM.attr.edge]: r.id, [DOM.attr.other]: r.from }, arrow('\u2190 '), labelOf(r), arrow(' \u2190 '), this.inspectLink(r.from, this.label(r.from))));
    }
    if (items.length === 0) return null;
    return h('section', { class: 'vs-detail-section vs-detail-rels', [DOM.attr.generated]: true },
      h('h3', {}, 'Relationships'), h('ul', {}, items));
  }

  /**
   * The Appears-in section (docs/IMPROVEMENTS.md §4.2): the parts in other
   * figures that stand for the same thing, through `entity`.
   */
  appearsInSection(id: string): Child {
    const entityOf = (x: string) => {
      const n = this.nodes.get(x);
      return n ? attrString(n, 'entity') : undefined;
    };
    const key = entityOf(id) ?? id;
    const others = [...this.targets.values()].filter((t) => t.id !== id && this.isPart(t) && (t.id === key || entityOf(t.id) === key));
    if (others.length === 0) return null;
    return h('section', { class: 'vs-detail-section vs-detail-appears', [DOM.attr.generated]: true },
      h('h3', {}, 'Appears in'),
      // Each item names the other part, so the reader runtime marks it on
      // hover of this part (docs/IMPROVEMENTS.md §14.9).
      h('ul', {}, others.map((t) => h('li', { [DOM.attr.entity]: t.id },
        this.inspectLink(t.id, this.label(t.id)),
        t.ownerComponentId ? [' in ', h('a', { href: `#${DOM.canonicalId(t.ownerComponentId)}` }, this.figureTitle(t.ownerComponentId))] : null))));
  }

  /**
   * The Evidence section (docs/IMPROVEMENTS.md §4.2): each source, excerpt
   * first, then its origin line. A link-only source gets the appendix notice
   * in place of the excerpt (§4.4, ARCHITECTURE §8.1).
   */
  evidenceSection(ids: string[], observations: string[] = []): Child {
    if (ids.length === 0 && observations.length === 0) return null;
    const EXCERPT_LINES = 6;
    return h('section', { class: 'vs-detail-section vs-detail-evidence', [DOM.attr.generated]: true },
      h('h3', {}, 'Evidence'),
      // A causal link can name an observation of a trace (docs/IMPROVEMENTS.md
      // §14.6): the event comes first, and its sources follow as excerpts.
      observations.length > 0
        ? h('ul', { class: 'vs-evidence-observations' }, observations.map((o) => {
            const time = this.nodes.get(o)?.attributes['time'];
            const trace = this.targets.get(o)?.parentId;
            const unit = trace ? attrString(this.nodes.get(trace)!, 'timeUnit') : undefined;
            return h('li', {}, 'Observed: ', this.inspectLink(o, this.label(o)), time !== undefined ? ` (at ${String(time)}${unit ? ` ${unit}` : ''})` : null);
          }))
        : null,
      ids.map((sourceId) => {
        const node = this.nodes.get(sourceId)!;
        const captured = this.sourceText(sourceId);
        const lines = captured ? captured.text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : [];
        const more = lines.length - EXCERPT_LINES;
        return h('div', { class: 'vs-evidence-item' },
          captured ? this.codeLines(sourceId, lines.slice(0, EXCERPT_LINES).join('\n'), new Map()) : linkOnlyNotice(),
          more > 0 ? h('p', { class: 'vs-evidence-more' }, `${more} more line${more === 1 ? '' : 's'} in the source.`) : null,
          this.sourceOriginLine(node, sourceId),
          h('p', { class: 'vs-evidence-open' }, this.inspectLink(sourceId, this.label(sourceId))));
      }));
  }

  detail(record: TargetRecord): HNode {
    if (record.kind.startsWith('mermaid-') || !this.nodes.has(record.id)) return this.mermaidDetail(record);
    const node = this.nodes.get(record.id)!;
    const part = this.isPart(record);
    const specifics: Child[] = [];
    const r = this.relationship(record.id);
    if (r && r.kind !== 'message' && !part) {
      specifics.push(h('p', { class: 'vs-rel-statement' },
        h('a', { href: `#${DOM.canonicalId(r.from)}` }, this.label(r.from)),
        h('span', { [DOM.attr.generated]: true }, ` \u2192 ${r.kind}: `), this.label(record.id), h('span', { [DOM.attr.generated]: true }, ' \u2192 '),
        h('a', { href: `#${DOM.canonicalId(r.to)}` }, this.label(r.to))));
    }
    switch (record.kind) {
      case 'node': case 'state': case 'factor': case 'task': case 'stage':
      case 'transition': case 'causal-link': case 'conversion': case 'dependency': case 'edge':
      case 'option': case 'criterion': case 'cell': case 'part':
      case 'concept': case 'relation': case 'entry': case 'reading': {
        // A part shows its extension-specific attributes (§14).
        const keys = record.kind === 'part' ? Object.keys(node.attributes).filter((k) => k !== 'id' && k !== 'label').sort() : (DETAIL_FACTS[record.kind] ?? []);
        const facts: Array<[string, string]> = [];
        for (const key of keys) {
          const v = node.attributes[key];
          if (v === undefined || v === false) continue;
          // A reading's value carries the unit of its measure (\u00a714.4).
          const unit = record.kind === 'reading' && key === 'value' && record.parentId ? attrString(this.nodes.get(record.parentId)!, 'unit') : undefined;
          const text = Array.isArray(v) ? v.map(String).join(key === 'shape' ? ' \u00d7 ' : ', ') : v === true ? 'yes' : unit ? withUnit(v, unit, attrString(node, 'display')) : String(v);
          facts.push([key, this.safeText(text, record.id)]);
        }
        if (record.kind === 'task' && node.attributes['status'] === undefined) facts.push(['status', 'proposed']);
        // The inspector title and the appendix row already show the cue word,
        // such as "Order store · storage", so a fact with that value is not
        // repeated in the list (phase-2 review S1).
        const cueWord = part ? this.cueWord(record) : undefined;
        const shownFacts = facts.filter(([, v]) => v !== cueWord);
        if (shownFacts.length > 0) specifics.push(h('dl', { class: 'vs-facts', [DOM.attr.generated]: true }, shownFacts.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
        break;
      }
      case 'actor': {
        const entity = attrString(node, 'entity');
        if (entity) specifics.push(h('p', { class: 'vs-entity' }, h('span', { [DOM.attr.generated]: true }, 'Represents '), h('a', { href: `#${DOM.canonicalId(entity)}` }, this.label(entity))));
        break;
      }
      case 'event': {
        const actor = attrString(node, 'actor');
        specifics.push(h('p', { class: 'vs-event-meta', [DOM.attr.generated]: true },
          `${attrString(node, 'kind') ?? 'event'}`, actor ? [' by ', h('a', { href: `#${DOM.canonicalId(actor)}` }, this.label(actor))] : null));
        break;
      }
      case 'annotation': {
        const range = node.attributes['lines'];
        // An annotation on the before side counts lines of the `before` source (§14.7).
        const figure = record.parentId ? this.nodes.get(record.parentId) : undefined;
        const owner = figure ? (attrString(node, 'side') === 'before' && attrString(figure, 'before') ? attrString(figure, 'before') : attrString(figure, 'source')) : undefined;
        if (Array.isArray(range)) specifics.push(h('p', { class: 'vs-annotation-lines', [DOM.attr.generated]: true }, `Lines ${range.join('\u2013')}`, owner ? [' of ', h('a', { href: `#${DOM.canonicalId(owner)}` }, this.label(owner))] : null));
        break;
      }
    }
    // The term in its own definition is not linked (§13.3).
    const previous = this.ownDefinition;
    if (record.kind === 'definition') this.ownDefinition = record.id;
    // A concept shows the body of the definition that it owns (docs/IMPROVEMENTS.md §5.4).
    const body = record.kind === 'source' ? this.sourceDetail(record.id, node) : record.kind === 'concept' ? this.conceptBody(node) : this.blocks(node);
    this.ownDefinition = previous;
    // F3b: a source row's summary shows its origin, in muted mono, after the title.
    const origin = record.kind === 'source' ? this.sourceOriginSummary(node, record.id) : undefined;
    const cue = this.cueWord(record);
    // A part row names its label and its cue word, such as "Charge queue ·
    // storage" (docs/IMPROVEMENTS.md §4.5). A source, definition, or detail
    // row is in a group of its kind, so the row repeats no kind word.
    const summary = h('summary', {},
      this.label(record.id),
      part ? h('span', { class: 'vs-kind', [DOM.attr.generated]: true }, ` \u00b7 ${cue}`) : null,
      origin ? h('span', { class: 'vs-source-origin-summary vs-mono', [DOM.attr.generated]: true }, ` ${origin}`) : null);
    if (!part) {
      // A definition that a domain concept owns names the concept, so a term
      // link opens the concept in the inspector (docs/IMPROVEMENTS.md §5.4).
      const concept = record.kind === 'definition' ? this.conceptOf(record.id) : undefined;
      // The first sentence, computed once: the term bubble shows the same
      // text as the glossary and the Terms section (phase 4 review D6).
      const summaryText = record.kind === 'definition' ? this.definitionSentence(record.id) : undefined;
      return h('details', { class: `vs-detail vs-kind-${record.kind}`, ...this.canonical(record.id), [DOM.attr.cue]: cue, [DOM.attr.concept]: concept, [DOM.attr.summary]: summaryText || undefined },
        summary,
        h('div', { class: 'vs-detail-body' }, specifics, body, this.evidence(record.id)));
    }
    // A figure part (docs/IMPROVEMENTS.md §4.2): the body, the facts, then
    // the Relationships, Appears-in, and Evidence sections. A part with an
    // `evidence` attribute names the source that shows the part (§4.4), so
    // its Evidence section comes first: a click on the part shows the
    // excerpt with no scroll. Only the 5 part tags do this; a `causal-link`
    // is a relationship, and its Evidence section stays last. A part with no
    // body and no evidence gets no visible appendix row (§4.5); its detail
    // stays in the DOM, so the inspector and a link still reach it.
    const evidence = this.evidenceIds(record.id);
    const evidenceFirst = node.type === 'tag' && PART_EVIDENCE_TAGS.has(node.tag ?? '') && this.ownEvidenceIds(record.id).length > 0;
    const bare = !hasBody(node, (x) => this.isTargetNode(x)) && evidence.length === 0;
    return h('details', { class: `vs-detail vs-kind-${record.kind}${bare ? ' vs-detail-bare' : ''}`, ...this.canonical(record.id), [DOM.attr.cue]: cue },
      summary,
      h('div', { class: 'vs-detail-body' },
        evidenceFirst ? this.evidenceSection(evidence) : null,
        h('div', { class: 'vs-detail-text' }, body),
        // A concept's label is the term of its own definition, shown above.
        record.kind === 'concept' ? null : this.labelTermsLine(record.id),
        specifics,
        this.relationshipSection(record.id),
        this.appearsInSection(record.id),
        evidenceFirst ? null : this.evidenceSection(evidence, this.observationIds(record.id))));
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
      if (record.kind === 'graph' || record.kind === 'transform') out.push(await this.graph(id, child));
      else if (record.kind === 'trace') out.push(this.trace(id, child));
      else if (record.kind === 'annotated') out.push(this.annotated(id, child));
      else if (record.kind === 'compare') out.push(this.compare(id, child));
      else if (record.kind === 'domain') out.push(await this.graph(id, child));
      else if (record.kind === 'mermaid') out.push(this.mermaid(id, child));
      else if (record.kind === 'extension') out.push(this.extension(id, child));
      else if (record.kind === 'note') out.push(this.note(id, child));
      else if (record.kind === 'self-check') out.push(this.selfCheck(id, child));
      else if (record.kind === 'measure') out.push(this.measure(id, child));
      else if (record.kind === 'tree') out.push(this.tree(id, child));
      else if (COMPONENTS.has(record.kind) || child.type === 'tag') {
        this.warn('W_UNSUPPORTED_COMPONENT', `${record.kind} has no renderer; showing its text only`, id);
        out.push(h('div', { class: 'vs-block', ...this.canonical(id) }, this.blocks(child)));
      } else {
        out.push(h('div', { class: 'vs-block', ...this.canonical(id) }, this.block(child)));
      }
    }
    return out;
  }

  /** Figure (component-root) target IDs in document order (F3a). */
  figureIds(): string[] {
    return [...this.targets.values()]
      .filter((r) => FIGURE_KINDS.has(r.kind))
      .sort((a, b) => a.span.startByte - b.span.startByte)
      .map((r) => r.id);
  }

  figureTitle(id: string): string {
    const node = this.nodes.get(id);
    const title = node ? attrString(node, 'title') : undefined;
    return this.safeText(title ?? this.label(id), id);
  }

  /**
   * One group of the appendix, or null when it would be empty (F3a). A group
   * is a `details` element with an h3 in its summary. Sources, Definitions,
   * and Details are open by default (docs/IMPROVEMENTS.md §4.5).
   */
  appendixGroup(label: string, records: TargetRecord[]): HNode | null {
    if (records.length === 0) return null;
    return h('details', { class: `${DOM.appendixGroup} vs-appendix-open`, open: true },
      h('summary', {}, h('h3', {}, label)), records.map((r) => this.detail(r)));
  }

  /**
   * The parts of one figure, in one collapsed group titled "Parts of 'TITLE'
   * (N)" (docs/IMPROVEMENTS.md §4.5). In the static HTML, N counts every
   * row, because without JavaScript and in print every row shows (§13.2).
   * The runtime hides the rows of parts with no body and no evidence, and
   * changes N to the number of rows that show.
   */
  figureGroup(figureId: string, records: TargetRecord[]): HNode | null {
    if (records.length === 0) return null;
    const rows = records.map((r) => this.detail(r));
    const shown = rows.filter((row) => !(row.attrs.find(([k]) => k === 'class')?.[1] ?? '').split(' ').includes('vs-detail-bare')).length;
    return h('details', { class: `${DOM.appendixGroup} vs-appendix-parts${shown === 0 ? ' vs-appendix-group-bare' : ''}`, [DOM.attr.figure]: figureId },
      h('summary', {}, h('h3', {}, `Parts of '${this.figureTitle(figureId)}' `, h('span', { class: 'vs-appendix-count', [DOM.attr.generated]: true }, `(${rows.length})`))),
      rows);
  }

  appendix(): HNode {
    const inspectable = inCitationOrder([...this.targets.values()].filter((r) => r.inspectable), this.sourceOrder);
    const sources = inspectable.filter((r) => r.kind === 'source');
    const definitions = inspectable.filter((r) => r.kind === 'definition');
    const authoredDetails = inspectable.filter((r) => r.kind === 'detail');
    const grouped = new Set([...sources, ...definitions, ...authoredDetails].map((r) => r.id));
    // Every other inspectable record belongs to a figure (§10.3: only source,
    // definition, and detail are entities without an owning component).
    const byFigure = new Map<string, TargetRecord[]>();
    for (const r of inspectable) {
      if (grouped.has(r.id)) continue;
      const fig = r.ownerComponentId;
      if (fig === undefined) continue;
      const list = byFigure.get(fig);
      if (list) list.push(r);
      else byFigure.set(fig, [r]);
    }
    const groups = [
      this.appendixGroup('Sources', sources),
      this.appendixGroup('Definitions', definitions),
      this.appendixGroup('Details', authoredDetails),
      ...this.figureIds().map((id) => this.figureGroup(id, byFigure.get(id) ?? [])),
    ].filter((g): g is HNode => g !== null);
    return h('section', { id: DOM.appendix, 'aria-label': 'Details and evidence' },
      h('h2', { [DOM.attr.generated]: true }, 'Details and evidence'), groups);
  }
}

// Authored facts shown in each family's inspector detail (§9.3–9.10).
const DETAIL_FACTS: Record<string, readonly string[]> = {
  node: ['role', 'entity'],
  state: ['initial', 'terminal'],
  transition: ['event', 'guard', 'action', 'basis'],
  factor: ['basis'],
  'causal-link': ['basis'],
  task: ['status', 'due', 'owner', 'output', 'acceptance', 'risk'],
  dependency: ['kind', 'quantity'],
  // An edge shows its `quantity` (docs/IMPROVEMENTS.md §14.9); the kind is its cue word.
  edge: ['quantity'],
  stage: ['representation', 'shape', 'units', 'location', 'ownership'],
  conversion: ['loss', 'condition', 'quantity'],
  option: [],
  criterion: ['units'],
  cell: ['value', 'valueStatus'],
  // A concept's `entity` shows in its Appears-in section, by label.
  concept: ['category', 'attributes'],
  relation: ['kind', 'cardinality'],
  entry: ['path', 'role'],
  reading: ['value', 'valueStatus'],
};

/** The definitions of a document, in document order, for the term auto-link (§13.3). */
function linkableDefinitions(bundle: LoadedBundle): LinkableDefinition[] {
  // The label of a domain concept is an alias of the definition that the
  // concept owns, when it differs from the term (docs/IMPROVEMENTS.md §5.4).
  const conceptLabels = new Map<string, string[]>();
  for (const t of bundle.parsed.targets) {
    const def = t.attributes['definition'];
    const label = t.attributes['label'];
    if (t.tagName !== 'concept' || typeof def !== 'string' || typeof label !== 'string') continue;
    conceptLabels.set(def, [...(conceptLabels.get(def) ?? []), label]);
  }
  return bundle.parsed.targets
    .filter((t) => t.tagName === 'definition' && typeof t.attributes['term'] === 'string')
    .map((t) => {
      const aliases = t.attributes['aliases'];
      const term = t.attributes['term'] as string;
      const authored = Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === 'string') : [];
      const fromConcepts = (conceptLabels.get(t.id) ?? []).filter((l) => phraseKey(l) !== phraseKey(term) && !authored.some((a) => phraseKey(a) === phraseKey(l)));
      return {
        id: t.id,
        term,
        aliases: [...authored, ...fromConcepts],
        auto: t.attributes['auto'] !== false,
      };
    });
}

/**
 * True when the inspector holds more than a compare cell shows in the table
 * (docs/IMPROVEMENTS.md §4.6). The first block of a cell with no value is its
 * value, so the cell has details when it has evidence, a second block, a
 * `cite`, or a nested `detail`.
 */
export function compareCellHasDetails(cell: MNode, isTarget: (n: MNode) => boolean, hasEvidence = false): boolean {
  if (hasEvidence) return true;
  let more = false;
  const visit = (n: MNode) => {
    if (more) return;
    if (n.type === 'tag' && (n.tag === 'detail' || n.tag === 'cite')) {
      more = true;
      return;
    }
    if (n !== cell && isTarget(n)) return;
    for (const child of n.children) visit(child);
  };
  visit(cell);
  if (more) return true;
  const blocks = cell.children.filter((c) => !isTarget(c) && c.type !== 'comment' && hasBody({ children: [c] } as unknown as MNode, isTarget));
  return blocks.length > 1;
}

/** True when a target node has authored body content: a block with text, not only nested targets or comments. */
function hasBody(node: MNode, isTarget: (n: MNode) => boolean): boolean {
  const text = (n: MNode): boolean => {
    if (n.type === 'text' || n.type === 'code') return String(n.attributes['content'] ?? '').trim() !== '';
    if (n.type === 'fence' || n.type === 'image' || n.type === 'hr' || n.type === 'table') return true;
    if (n.type === 'tag' && n.tag === 'cite') return true;
    return n.children.some(text);
  };
  return node.children.some((c) => !isTarget(c) && c.type !== 'comment' && text(c));
}

function tableAlign(node: MNode): string | undefined {
  const a = node.attributes['align'];
  return a === 'left' || a === 'right' || a === 'center' ? a : undefined;
}

/** True if a table cell (or any descendant) holds inline `code` (F8: wider column, no wrap squeeze). */
function hasInlineCode(node: MNode): boolean {
  return node.children.some((c) => c.type === 'code' || hasInlineCode(c));
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

/** Conventional short commit form for the F4 one-line origin. */
function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/**
 * A GitHub/GitLab https permalink for a captured line range (§8.3), or
 * `undefined` when `repository` is not one of those hosts over https. The
 * caller still runs the result through `checkLink` before using it as an href.
 */
function sourcePermalink(repository: string, commit: string, file: string, start: number | undefined, end: number | undefined): string | undefined {
  let url: URL;
  try {
    url = new URL(repository);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
  if (url.hostname === 'github.com') {
    const anchor = start !== undefined && end !== undefined ? `#L${start}-L${end}` : '';
    return `https://github.com${path}/blob/${commit}/${file}${anchor}`;
  }
  if (url.hostname === 'gitlab.com' || url.hostname.endsWith('.gitlab.com')) {
    const anchor = start !== undefined && end !== undefined ? `#L${start}-${end}` : '';
    return `https://${url.hostname}${path}/-/blob/${commit}/${file}${anchor}`;
  }
  return undefined;
}

/** Compile one loaded bundle (§17.9 compileDocument). Throws CompileError on any error diagnostic. */
export async function compileDocument(bundle: LoadedBundle, toolkit: Toolkit, options: CompileOptions): Promise<CompileResult> {
  const upstream = bundle.diagnostics.filter((d) => d.severity === 'error');
  if (upstream.length > 0 || !bundle.docId || !bundle.sourceRevision || !bundle.manifest) {
    throw new CompileError(upstream.length > 0 ? bundle.diagnostics : [{ code: 'E_SYNTAX', severity: 'error', message: 'bundle has no docId or source revision', path: 'index.md' }]);
  }
  const effectiveRenderOptions = { audience: options.audience, includeSource: options.includeSource, layoutFallback: options.layoutFallback };
  // Extensions that run for this build are part of its identity (§4.4, §7.4).
  const used = new Set(componentInputs(bundle.model).map((c) => c.use));
  const executed = [...(options.extensions?.values() ?? [])]
    .filter((b): b is Extract<ExtensionBinding, { ready: true }> => b.ready && used.has(b.name))
    .map((b) => ({ name: b.name, version: b.version, sha256: b.sha256 }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  let buildId: string;
  try {
    // The development mark is part of the build identity, so a development
    // build never shares a snapshot folder with a normal build (§7.4, §12.4).
    const idOptions = options.development ? { ...effectiveRenderOptions, development: true as const } : effectiveRenderOptions;
    buildId = computeBuildId({ sourceRevision: bundle.sourceRevision, toolkitSha256: toolkit.sha256, extensionDigests: executed.map((e) => e.sha256), effectiveRenderOptions: idOptions }).buildId;
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
    const assetBase = `../../../../_visser/assets/${toolkit.sha256}`;
    const jsSha = toolkit.assets?.['reader.js'];
    const cssSha = toolkit.assets?.['reader.css'];
    const capturedAt = typeof fm['capturedAt'] === 'string' ? fm['capturedAt'] : 'unknown';
    const visibility = typeof fm['visibility'] === 'string' ? fm['visibility'] : 'private';
    // One compact line after the title (§10.1); full identifiers are in
    // "About this snapshot" and in the root data attributes.
    const snapshotLine = h('p', { class: 'vs-meta', [DOM.attr.generated]: true },
      `Snapshot captured ${capturedAt} \u00b7 revision `, h('code', { title: sourceRevision }, abbreviate(sourceRevision)),
      ' \u00b7 build ', h('code', { title: buildId }, abbreviate(buildId)), ` \u00b7 ${visibility}`);
    // A permanent one-line summary under the h1; the full line above moves into
    // the "About this snapshot" panel once the runtime is present (F11).
    const snapshotBrief = h('p', { class: 'vs-snapshot-brief', [DOM.attr.generated]: true }, `Snapshot \u00b7 ${visibility}`);
    const [firstBlock, ...restBlocks] = mainContent;
    const titleBlocks: Child[] = firstIsH1 ? [firstBlock] : [];
    const bodyBlocks: Child[] = firstIsH1 ? restBlocks : mainContent;
    // Fail closed: a Mermaid page never loads mermaid.js without an SRI digest (§9.12).
    const mermaidIntegrity = toolkit.integrity?.['mermaid.js'];
    if (r.usesMermaid && !(mermaidIntegrity && /^sha384-[A-Za-z0-9+/]+={0,2}$/.test(mermaidIntegrity))) {
      throw new CompileError([{ code: 'E_INTEGRITY', severity: 'error', message: 'this page has a Mermaid figure, but the toolkit gives no sha384 integrity digest for mermaid.js', path: 'index.md' }]);
    }
    const doc = h('html', { lang: 'en' },
      h('head', {},
        h('meta', { charset: 'utf-8' }),
        h('meta', { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy({ mermaid: r.usesMermaid, delivery: 'meta' }) }),
        h('meta', { name: 'referrer', content: 'no-referrer' }),
        h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
        fm['visibility'] !== 'public' ? h('meta', { name: 'robots', content: 'noindex, nofollow' }) : null,
        h('title', {}, r.safeText(title)),
        h('link', { rel: 'stylesheet', href: `${assetBase}/reader.css`, integrity: cssSha ? integrity(cssSha) : undefined }),
        h('script', { src: `${assetBase}/reader.js`, defer: true, integrity: jsSha ? integrity(jsSha) : undefined }),
        // The runtime loads mermaid.js with this integrity value only on pages that need it (§9.12).
        r.usesMermaid ? h('meta', { name: DOM.mermaidMeta, content: mermaidIntegrity }) : null),
      h('body', {},
        h('nav', { class: DOM.toolbar, 'aria-label': 'Document tools', hidden: true },
          // "Contents" is the one primary-styled action; the rest are plain-text
          // buttons that keep their IDs and aria-pressed handling (F11).
          h('button', { type: 'button', id: DOM.buttons.contents, class: 'vs-btn--primary' }, 'Contents'),
          h('button', { type: 'button', id: DOM.buttons.refmode, 'aria-pressed': 'false', class: 'vs-btn--plain' }, 'Reference mode'),
          h('button', { type: 'button', id: DOM.buttons.expand, class: 'vs-btn--plain' }, 'Expand details'),
          h('button', { type: 'button', id: DOM.buttons.about, class: 'vs-btn--plain' }, 'About this snapshot')),
        h('main', { id: DOM.root, [DOM.attr.doc]: docId, [DOM.attr.rev]: sourceRevision, [DOM.attr.build]: buildId },
          titleBlocks,
          h('header', { class: 'vs-snapshot' },
            firstIsH1 ? null : h('h1', {}, r.safeText(title)),
            snapshotBrief,
            snapshotLine),
          bodyBlocks,
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
  add('document.md', encoder.encode(projectText(bundle.parsed, bundle.model.targets, r.diffs)), 'text/markdown; charset=utf-8');
  for (const image of [...r.images.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!files.some((f) => f.path === `${directory}/${image.path}`)) add(image.path, image.bytes, image.mediaType);
  }
  if (options.includeSource) {
    for (const f of bundle.files) add(`source/${f.path}`, f.content, f.kind === 'text' ? 'text/markdown; charset=utf-8' : (TEXT_MEDIA[(f.path.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream'));
  }

  const manifest: BuildManifest = {
    schema: 'visser-build/1',
    docId,
    sourceRevision,
    buildId,
    toolkitVersion: toolkit.version,
    toolkitSha256: toolkit.sha256,
    effectiveRenderOptions,
    ...(options.nodeVersion ? { nodeVersion: options.nodeVersion } : {}),
    ...(options.development ? { development: true as const } : {}),
    ...(executed.length > 0 ? { extensions: executed } : {}),
    sourceFiles: bundle.manifest.files.map((f) => ({ path: f.path, sha256: f.sha256 })),
    outputFiles: files.map((f) => ({ path: f.path.slice(directory.length + 1), sha256: sha256Hex(f.bytes), mediaType: f.mediaType })),
    assets: ['reader.css', 'reader.js', ...(r.usesMermaid ? ['mermaid.js'] : [])].map((path) => ({ packSha256: toolkit.sha256, path, ...(toolkit.assets?.[path] ? { sha256: toolkit.assets[path] } : {}) })),
  };
  add('build.json', encoder.encode(canonicalJSON(manifest) + '\n'), 'application/json');
  return { docId, sourceRevision, buildId, directory, files, manifest, diagnostics: r.diagnostics, needsMermaid: r.usesMermaid };
}
