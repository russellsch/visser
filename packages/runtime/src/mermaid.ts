// Mermaid rendering (§9.12). Loads the toolkit's mermaid.js only on pages that
// carry the Mermaid meta element, with its Subresource Integrity value; renders
// each figure into its viewport; and maps drawn elements to targets through the
// render keys on the static list instances. The static page stays complete
// without this code: source text and lists are already present.
import { DOM } from '../../core/src/compiler/dom-contract.ts';
import { bindMermaidSource } from './mermaid-source.ts';
import { stampStateMathLabels } from './mermaid-state-source.ts';
import { stampFlowchartMathLabels } from './mermaid-flowchart-source.ts';
import { SEQUENCE_RENDER_OPTIONS } from '../../core/src/mermaid/types.ts';

const A = DOM.attr;

// Every Mermaid diagram type keeps its natural size: with the default
// useMaxWidth, a wide flowchart at 320 px had an effective label size of 2.5 px.
const DIAGRAM_CONFIG_KEYS = [
  'flowchart', 'agentflow', 'sequence', 'gantt', 'journey', 'timeline', 'class', 'state', 'er', 'pie', 'quadrantChart',
  'xyChart', 'requirement', 'architecture', 'mindmap', 'kanban', 'gitGraph', 'c4', 'sankey', 'packet', 'block', 'radar',
] as const;

/** The page tokens that theme a Mermaid drawing (docs/IMPROVEMENTS.md §3.5). */
export type PageTokens = { bg: string; panel: string; fg: string; line: string; font: string; dark: boolean };

// The light values of reader.css (a unit test checks that they match). They
// apply when a token is missing or is not a hex colour, because Mermaid
// computes shades and needs a real colour.
export const LIGHT_TOKENS: PageTokens = {
  bg: '#ffffff', panel: '#f5f6f8', fg: '#1d1f23', line: '#5a606b',
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', dark: false,
};

/** Read the page tokens from the stylesheet at render time, so dark mode follows them. */
export function pageTokens(root: Element = document.documentElement): PageTokens {
  const style = getComputedStyle(root);
  const colour = (name: string, fallback: string) => {
    const v = style.getPropertyValue(name).trim();
    return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(v) ? v : fallback;
  };
  const font = style.getPropertyValue('--vs-font').trim();
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    bg: colour('--vs-bg', LIGHT_TOKENS.bg),
    panel: colour('--vs-panel', LIGHT_TOKENS.panel),
    fg: colour('--vs-fg', LIGHT_TOKENS.fg),
    line: colour('--vs-line', LIGHT_TOKENS.line),
    font: font || LIGHT_TOKENS.font,
    dark,
  };
}

/**
 * The toolkit's fixed Mermaid configuration. Documents cannot change it
 * (§9.12). The theme is 'base', with its variables from the page tokens
 * (IMPROVEMENTS §3.5), so a drawing uses the page colours and font.
 */
export function mermaidConfig(tokens: PageTokens = LIGHT_TOKENS): Record<string, unknown> {
  const config: Record<string, unknown> = {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      darkMode: tokens.dark,
      background: tokens.bg,
      primaryColor: tokens.panel,
      primaryTextColor: tokens.fg,
      primaryBorderColor: tokens.line,
      secondaryColor: tokens.panel,
      secondaryTextColor: tokens.fg,
      secondaryBorderColor: tokens.line,
      tertiaryColor: tokens.bg,
      tertiaryTextColor: tokens.fg,
      tertiaryBorderColor: tokens.line,
      lineColor: tokens.line,
      textColor: tokens.fg,
      // ER and class tables: alternate the panel and the page colour, and draw
      // no shadow, because the page draws none (a light shadow glows on dark).
      attributeBackgroundColorOdd: tokens.panel,
      attributeBackgroundColorEven: tokens.bg,
      rowOdd: tokens.panel,
      rowEven: tokens.bg,
      dropShadow: 'none',
      fontFamily: tokens.font,
      fontSize: '14px',
    },
  };
  for (const key of DIAGRAM_CONFIG_KEYS) config[key] = { useMaxWidth: false };
  config.sequence = { useMaxWidth: false, ...SEQUENCE_RENDER_OPTIONS };
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
    case 'node': return byIdPattern(svg, `${renderId}-${svg.getAttribute('aria-roledescription') === 'agentflow' ? 'agentflow' : 'flowchart'}-${value}-`);
    case 'state': return byIdPattern(svg, `${renderId}-state-${value}-`);
    case 'group': {
      if (svg.getAttribute('aria-roledescription') === 'swimlane') {
        const lanes = Array.from(svg.querySelectorAll('g.cluster.swimlane')).filter(e => e.id === value);
        return lanes.length === 1 ? lanes : [];
      }
      return Array.from(svg.querySelectorAll('[id]')).filter(e => e.id === `${renderId}-${value}`);
    }
    case 'edge': return [...withAttr(svg, 'data-id', value), ...(svg.getAttribute('aria-roledescription') === 'swimlane'
      ? withAttr(svg, 'data-vs-native-edge-id', value) : [])];
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
export function attachTargets(figure: Element, svg: Element, renderId: string, hiddenKeys: ReadonlySet<string> = new Set()): number {
  let missing = 0;
  for (const instance of Array.from(figure.querySelectorAll(`[${A.mermaidKey}]`))) {
    const key = instance.getAttribute(A.mermaidKey) ?? '';
    const target = instance.getAttribute(A.target);
    const rel = instance.getAttribute(A.rel);
    const depth = instance.getAttribute(A.depth);
    const drawn = findDrawn(svg, renderId, key);
    if (drawn.length === 0 && !hiddenKeys.has(key)) missing++;
    // A derived relationship (no edge ID of its own) points at the figure: its
    // relationship ID differs from its target. It is not interactive (§9.12).
    const derived = rel !== null && rel !== target;
    for (const element of drawn) {
      if (target) element.setAttribute(A.target, target);
      if (rel) element.setAttribute(A.rel, rel);
      if (depth) element.setAttribute(A.depth, depth);
      if (derived) element.setAttribute('data-vs-mermaid-derived', '');
      else if (instance.hasAttribute(A.interactive)) element.setAttribute(A.interactive, '');
      else element.removeAttribute(A.interactive);
      element.setAttribute('data-vs-mermaid-drawn', '');
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

function loadScript(src: string, integrity?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    if (integrity) script.integrity = integrity;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('mermaid.js failed to load'));
    document.head.append(script);
  });
}

function showNotice(figure: Element, text: string): void {
  const notice = figure.querySelector<HTMLElement>('.vs-mermaid-notice');
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
  const source = figure.querySelector('.vs-mermaid-source code')?.textContent ?? '';
  if (!viewport || !figureId) return;
  const renderId = renderIdFor(figureId);
  try {
    if ((figure.hasAttribute('data-vs-mermaid-math') || source.includes('$$')) && typeof (window as unknown as { MathMLElement?: unknown }).MathMLElement === 'undefined') {
      throw new Error('This browser cannot render Mermaid MathML');
    }
    const { svg } = await api.render(renderId, source);
    viewport.innerHTML = svg;
    removeStray(renderId, viewport);
    const drawn = viewport.querySelector('svg');
    if (!drawn) throw new Error('no SVG');
    if (figure.hasAttribute('data-vs-mermaid-source-map')) {
      if (figure.getAttribute(A.mermaid) === 'flowchart') {
        stampFlowchartMathLabels(drawn, renderId, JSON.parse(figure.getAttribute('data-vs-mermaid-flowchart-slots') ?? 'null'));
      }
      if (figure.getAttribute(A.mermaid) === 'state') {
        stampStateMathLabels(drawn, renderId, JSON.parse(figure.getAttribute('data-vs-mermaid-state-slots') ?? 'null'));
      }
      bindMermaidSource(figure, drawn);
      viewport.setAttribute(A.generated, '');
    }
    drawn.setAttribute('focusable', 'false');
    // Accessible name from the figure unless the author wrote accTitle.
    if (!drawn.querySelector(':scope > title')) {
      drawn.setAttribute('aria-labelledby', `vs-t-${figureId}`);
      drawn.setAttribute('aria-describedby', `vs-q-${figureId}`);
    }
    let hiddenKeys = new Set<string>();
    if (figure.hasAttribute('data-vs-mermaid-flowchart-slots')) {
      const hidden: unknown = JSON.parse(figure.getAttribute('data-vs-mermaid-hidden-keys') ?? '[]');
      if (!Array.isArray(hidden) || !hidden.every(key => typeof key === 'string' && /^(node|group|edge):.+/.test(key))) {
        throw new Error('Invalid hidden flowchart targets');
      }
      hiddenKeys = new Set(hidden);
    }
    const missing = attachTargets(figure, drawn, renderId, hiddenKeys);
    if (missing === 0 && figure.querySelector(`.vs-lists [${A.mermaidKey}]`) && ['flowchart', 'state', 'sequence'].includes(figure.getAttribute(A.mermaid) ?? '')) figure.setAttribute('data-vs-viewer-ready', 'true');
    // A wide drawing scrolls inside its viewport; drawn elements are not
    // focusable, so the viewport itself must take focus for keyboard scrolling.
    viewport.setAttribute('tabindex', '0');
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-labelledby', `vs-t-${figureId}`);
    figure.classList.add('vs-mermaid-rendered');
    addSourceToggle(figure);
  } catch {
    viewport.replaceChildren();
    removeStray(renderId, viewport);
    showNotice(figure, noticeText(figure));
  }
}

function addSourceToggle(figure: HTMLElement): void {
  if (figure.querySelector('.vs-source-toggle')) return;
  const source = figure.querySelector('.vs-mermaid-source');
  if (!source) return;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'vs-btn vs-source-toggle';
  toggle.textContent = 'Show source';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.setAttribute(A.generated, '');
  toggle.addEventListener('click', () => {
    const shown = figure.classList.toggle('vs-mermaid-show-source');
    toggle.setAttribute('aria-pressed', String(shown));
    toggle.textContent = shown ? 'Hide source' : 'Show source';
  });
  source.before(toggle);
}

/** Load mermaid.js and render every Mermaid figure on the page, if the page has any. */
export async function renderMermaidFigures(): Promise<void> {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${DOM.mermaidMeta}"]`);
  const standalone = document.querySelector<HTMLMetaElement>(`meta[name="${DOM.mermaidSourceMeta}"]`);
  const figures = Array.from(document.querySelectorAll<HTMLElement>(`figure[${A.mermaid}]`));
  if (!meta || figures.length === 0) return;
  const base = assetBase();
  try {
    if (standalone) {
      // A standalone page contains the verified toolkit bytes in its own file.
      // Accept only the data URL form emitted by the exporter; never turn this
      // metadata into a general script URL escape hatch.
      if (!/^data:text\/javascript;charset=utf-8;base64,[A-Za-z0-9+/]+={0,2}$/.test(standalone.content)) throw new Error('invalid standalone Mermaid source');
      await loadScript(standalone.content);
    } else {
      if (!base) throw new Error('no asset base');
      // Never load a separate asset without a valid digest (fail closed).
      if (!isValidIntegrity(meta.content)) throw new Error('missing or invalid integrity value');
      await loadScript(`${base}mermaid.js`, meta.content);
    }
    const api = (window as unknown as { mermaid?: MermaidApi }).mermaid;
    if (!api) throw new Error('mermaid.js did not define mermaid');
    api.initialize(mermaidConfig(pageTokens()));
    // Render one figure at a time: Mermaid keeps global state while it draws.
    for (const figure of figures) await renderFigure(api, figure);
  } catch {
    for (const figure of figures) showNotice(figure, noticeText(figure));
  }
}
