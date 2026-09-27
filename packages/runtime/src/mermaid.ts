// Mermaid rendering (§9.12). Loads the toolkit's mermaid.js only on pages that
// carry the Mermaid meta element, with its Subresource Integrity value; renders
// each figure into its viewport; and maps drawn elements to targets through the
// render keys on the static list instances. The static page stays complete
// without this code: source text and lists are already present.
import { DOM } from '../../core/src/compiler/dom-contract.ts';

const A = DOM.attr;

// Every Mermaid diagram type keeps its natural size: with the default
// useMaxWidth, a wide flowchart at 320 px had an effective label size of 2.5 px.
const DIAGRAM_CONFIG_KEYS = [
  'flowchart', 'sequence', 'gantt', 'journey', 'timeline', 'class', 'state', 'er', 'pie', 'quadrantChart',
  'xyChart', 'requirement', 'architecture', 'mindmap', 'kanban', 'gitGraph', 'c4', 'sankey', 'packet', 'block', 'radar',
] as const;

/** The toolkit's fixed Mermaid configuration. Documents cannot change it (§9.12). */
export function mermaidConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
  };
  for (const key of DIAGRAM_CONFIG_KEYS) config[key] = { useMaxWidth: false };
  return config;
}

/** Mermaid's render ID for a figure: distinct from x-, v-, l-, and m-FIG ids. */
export function renderIdFor(figureId: string): string {
  return `${DOM.mermaidRenderId(figureId)}-svg`;
}

function withAttr(root: Element, name: string, value: string, extra?: (e: Element) => boolean): Element[] {
  return Array.from(root.querySelectorAll(`[${name}]`)).filter((e) => e.getAttribute(name) === value && (!extra || extra(e)));
}

function byIdPattern(root: Element, prefix: string): Element[] {
  // Mermaid element IDs have the form PREFIX-N (N = instance counter).
  return Array.from(root.querySelectorAll('[id]')).filter((e) => {
    const id = e.getAttribute('id') ?? '';
    return id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length));
  });
}

/**
 * The drawn elements for a render key (§9.12 mapping, pinned to mermaid 12.0.0;
 * a characterization test fails if the scheme changes).
 */
export function findDrawn(svg: Element, renderId: string, key: string): Element[] {
  const colon = key.indexOf(':');
  const kind = key.slice(0, colon);
  const value = key.slice(colon + 1);
  switch (kind) {
    case 'node': return byIdPattern(svg, `${renderId}-flowchart-${value}-`);
    case 'state': return byIdPattern(svg, `${renderId}-state-${value}-`);
    case 'group': return Array.from(svg.querySelectorAll('[id]')).filter((e) => e.getAttribute('id') === `${renderId}-${value}`);
    case 'edge': return withAttr(svg, 'data-id', value);
    case 'transition': return withAttr(svg, 'data-id', `edge${value}`);
    case 'participant': return withAttr(svg, 'data-id', value, (e) => e.getAttribute('data-et') === 'participant');
    case 'message': return withAttr(svg, 'data-id', `i${value}`, (e) => e.getAttribute('data-et') === 'message');
    default: return [];
  }
}

/**
 * Give drawn elements the target and relationship attributes of their list
 * instances, so inspection and reference mode work on the drawing. Returns the
 * number of instances that found no drawn element.
 */
export function attachTargets(figure: Element, svg: Element, renderId: string): number {
  let missing = 0;
  for (const instance of Array.from(figure.querySelectorAll(`[${A.mermaidKey}]`))) {
    const key = instance.getAttribute(A.mermaidKey) ?? '';
    const target = instance.getAttribute(A.target);
    const rel = instance.getAttribute(A.rel);
    const drawn = findDrawn(svg, renderId, key);
    if (drawn.length === 0) missing++;
    // A derived relationship (no edge ID of its own) points at the figure: its
    // relationship ID differs from its target. It is not interactive (§9.12).
    const derived = rel !== null && rel !== target;
    for (const element of drawn) {
      if (target) element.setAttribute(A.target, target);
      if (rel) element.setAttribute(A.rel, rel);
      if (derived) element.setAttribute('data-ex-mermaid-derived', '');
      else element.setAttribute(A.interactive, '');
      element.setAttribute('data-ex-mermaid-drawn', '');
      // No aria-label here: drawn elements have no role and are not keyboard
      // targets; the lists are the keyboard path (§10.5) and the drawing has
      // its own accessible name.
    }
  }
  return missing;
}

type MermaidApi = {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
};

function assetBase(): string | undefined {
  const reader = document.querySelector<HTMLScriptElement>('script[src$="/reader.js"]');
  if (!reader) return undefined;
  return reader.src.slice(0, reader.src.length - 'reader.js'.length);
}

/** A Subresource Integrity value for the pinned asset: sha384 only, fail closed (§9.12). */
export function isValidIntegrity(value: string): boolean {
  return /^sha384-[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/** The failure notice for one figure: only parsed types have lists (§9.12). */
export function noticeText(figure: Element): string {
  const parsed = ['flowchart', 'state', 'sequence'].includes(figure.getAttribute(A.mermaid) ?? '');
  return `This diagram could not be drawn. Its source${parsed ? ' and lists are' : ' is'} shown instead.`;
}

function loadScript(src: string, integrity: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.integrity = integrity;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('mermaid.js failed to load'));
    document.head.append(script);
  });
}

function showNotice(figure: Element, text: string): void {
  const notice = figure.querySelector<HTMLElement>('.ex-mermaid-notice');
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = false;
}

/** Remove anything Mermaid inserted outside the figure for a render ID (its error graphic). */
function removeStray(renderId: string, viewport: Element): void {
  for (const id of [`d${renderId}`, renderId, `i${renderId}`]) {
    const stray = document.getElementById(id);
    if (stray && !viewport.contains(stray)) stray.remove();
  }
}

async function renderFigure(api: MermaidApi, figure: HTMLElement): Promise<void> {
  const figureId = figure.getAttribute(A.target) ?? '';
  const viewport = figure.querySelector<HTMLElement>(`[${A.mermaidRender}]`);
  const source = figure.querySelector('.ex-mermaid-source code')?.textContent ?? '';
  if (!viewport || !figureId) return;
  const renderId = renderIdFor(figureId);
  try {
    const { svg } = await api.render(renderId, source);
    viewport.innerHTML = svg;
    removeStray(renderId, viewport);
    const drawn = viewport.querySelector('svg');
    if (!drawn) throw new Error('no SVG');
    drawn.setAttribute('focusable', 'false');
    // Accessible name from the figure unless the author wrote accTitle.
    if (!drawn.querySelector(':scope > title')) {
      drawn.setAttribute('aria-labelledby', `ex-t-${figureId}`);
      drawn.setAttribute('aria-describedby', `ex-q-${figureId}`);
    }
    attachTargets(figure, drawn, renderId);
    // A wide drawing scrolls inside its viewport; drawn elements are not
    // focusable, so the viewport itself must take focus for keyboard scrolling.
    viewport.setAttribute('tabindex', '0');
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-labelledby', `ex-t-${figureId}`);
    figure.classList.add('ex-mermaid-rendered');
    addSourceToggle(figure);
  } catch {
    viewport.replaceChildren();
    removeStray(renderId, viewport);
    showNotice(figure, noticeText(figure));
  }
}

function addSourceToggle(figure: HTMLElement): void {
  if (figure.querySelector('.ex-source-toggle')) return;
  const source = figure.querySelector('.ex-mermaid-source');
  if (!source) return;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ex-btn ex-source-toggle';
  toggle.textContent = 'Show source';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.setAttribute(A.generated, '');
  toggle.addEventListener('click', () => {
    const shown = figure.classList.toggle('ex-mermaid-show-source');
    toggle.setAttribute('aria-pressed', String(shown));
    toggle.textContent = shown ? 'Hide source' : 'Show source';
  });
  source.before(toggle);
}

/** Load mermaid.js and render every Mermaid figure on the page, if the page has any. */
export async function renderMermaidFigures(): Promise<void> {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${DOM.mermaidMeta}"]`);
  const figures = Array.from(document.querySelectorAll<HTMLElement>(`figure[${A.mermaid}]`));
  if (!meta || figures.length === 0) return;
  const base = assetBase();
  try {
    if (!base) throw new Error('no asset base');
    // Never load the asset without a valid digest (fail closed).
    if (!isValidIntegrity(meta.content)) throw new Error('missing or invalid integrity value');
    await loadScript(`${base}mermaid.js`, meta.content);
    const api = (window as unknown as { mermaid?: MermaidApi }).mermaid;
    if (!api) throw new Error('mermaid.js did not define mermaid');
    api.initialize(mermaidConfig());
    // Render one figure at a time: Mermaid keeps global state while it draws.
    for (const figure of figures) await renderFigure(api, figure);
  } catch {
    for (const figure of figures) showNotice(figure, noticeText(figure));
  }
}
