// Safe HTML/SVG construction (§13.2, §15.2, §15.3). Every element and attribute
// passes an allowlist; text and attribute values are escaped for their context.
// There is no raw-HTML escape hatch, no inline style, no event handler, and no
// inline script.

export type Child = HNode | string | null | undefined | false | readonly Child[];

export type HNode = {
  readonly kind: 'element';
  readonly tag: string;
  readonly attrs: ReadonlyArray<readonly [string, string]>;
  readonly children: readonly (HNode | string)[];
};

export type Attrs = Record<string, string | number | boolean | null | undefined>;

export class UnsafeMarkupError extends Error {
  readonly code = 'E_UNSAFE_CONTENT';
}

const VOID = new Set(['meta', 'link', 'br', 'hr', 'img']);

const GLOBAL_ATTRS = new Set(['id', 'class', 'lang', 'title', 'hidden', 'role', 'tabindex']);

const ELEMENT_ATTRS: Record<string, readonly string[]> = {
  html: [], head: [], body: [], title: [],
  meta: ['charset', 'name', 'content', 'http-equiv'],
  link: ['rel', 'href', 'integrity'],
  script: ['src', 'defer', 'integrity'],
  nav: [], main: [], header: [], footer: [], section: [], article: [], aside: [], div: [], span: [],
  h1: [], h2: [], h3: [], h4: [], h5: [], h6: [], p: [], blockquote: [], hr: [], br: [],
  ul: [], ol: ['start'], li: ['value'], dl: [], dt: [], dd: [],
  pre: [], code: [], em: [], strong: [], small: [], kbd: [],
  table: [], thead: [], tbody: [], tr: [], th: ['scope', 'colspan', 'rowspan', 'align'], td: ['colspan', 'rowspan', 'align'],
  figure: [], figcaption: [], details: ['open'], summary: [],
  a: ['href', 'rel'], img: ['src', 'alt', 'width', 'height'], button: ['type'],
  // SVG (presentation attributes are allowed; `style` is not).
  svg: ['xmlns', 'viewBox', 'width', 'height', 'focusable', 'preserveAspectRatio'],
  g: ['transform'], defs: [],
  marker: ['viewBox', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient', 'markerUnits'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'marker-start', 'marker-end', 'stroke-linecap', 'stroke-linejoin'],
  polygon: ['points', 'fill', 'stroke'],
  text: ['x', 'y', 'text-anchor', 'dominant-baseline', 'fill', 'font-size'],
  // `fill-opacity` mutes a secondary line in a node box, such as a task's
  // `due` date, in the theme's text colour (docs/IMPROVEMENTS.md §4.4).
  tspan: ['x', 'y', 'dy', 'fill-opacity'],
  desc: [],
};

// Elements whose `href` is an SVG link (same rules as HTML links).
const LINK_ATTRS = new Set(['href', 'src']);

// Presentation attributes whose value must match a pattern, not only whose
// name is allowed: an opacity is a number from 0 to 1, and a line end names
// only a marker that the renderer generates, m-FIGURE.arrow with an optional
// suffix (phase 4 review D14).
const MARKER_URL = /^url\(#m-[a-z][a-z0-9_-]{0,63}\.arrow(-[a-z]+)?\)$/;
const VALUE_PATTERNS: Record<string, RegExp> = {
  'fill-opacity': /^(0|1|0?\.[0-9]+)$/,
  'marker-start': MARKER_URL,
  'marker-end': MARKER_URL,
};

function allowedAttribute(tag: string, name: string): boolean {
  if (/^on/i.test(name) || name === 'style') return false;
  if (GLOBAL_ATTRS.has(name)) return true;
  if (/^aria-[a-z]+$/.test(name)) return true;
  if (/^data-vs-[a-z-]+$/.test(name)) return true;
  return (ELEMENT_ATTRS[tag] ?? []).includes(name);
}

/** Build an element. Throws UnsafeMarkupError for anything outside the allowlist. */
export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HNode {
  if (!(tag in ELEMENT_ATTRS)) throw new UnsafeMarkupError(`element <${tag}> is not allowed`);
  const list: Array<readonly [string, string]> = [];
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (!allowedAttribute(tag, name)) throw new UnsafeMarkupError(`attribute ${name} on <${tag}> is not allowed`);
    const text = value === true ? '' : String(value);
    if (LINK_ATTRS.has(name) && !isSafeRenderedUrl(text)) throw new UnsafeMarkupError(`unsafe ${name} value on <${tag}>`);
    const pattern = VALUE_PATTERNS[name];
    if (pattern && !pattern.test(text)) throw new UnsafeMarkupError(`unsafe ${name} value on <${tag}>`);
    list.push([name, text]);
  }
  return { kind: 'element', tag, attrs: list, children: flatten(children) };
}

function flatten(children: readonly Child[]): (HNode | string)[] {
  const out: (HNode | string)[] = [];
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === '') continue;
    if (Array.isArray(c)) out.push(...flatten(c as readonly Child[]));
    else out.push(c as HNode | string);
  }
  return out;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Serialize with deterministic attribute order (the order given at construction). */
export function render(node: HNode | string): string {
  if (typeof node === 'string') return escapeText(node);
  const attrs = node.attrs.map(([n, v]) => (v === '' && (n === 'hidden' || n === 'defer' || n === 'open') ? ` ${n}` : ` ${n}="${escapeAttr(v)}"`)).join('');
  if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${node.children.map(render).join('')}</${node.tag}>`;
}

// --- URL safety (§15.2) ---------------------------------------------------

const BASE = 'https://visser.invalid/d/doc/rev/build/index.html';

export type LinkCheck = { ok: true; href: string; external: boolean } | { ok: false; reason: string };

/**
 * Validate an authored link: parse with the WHATWG URL parser against a fixed
 * base; allow http(s), relative paths, and in-document anchors. Credentials,
 * other schemes, and backslash tricks are rejected.
 */
export function checkLink(raw: string): LinkCheck {
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return { ok: false, reason: 'control character or backslash in link' };
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return { ok: false, reason: 'unparseable link' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: `scheme ${url.protocol} is not allowed` };
  if (url.username || url.password) return { ok: false, reason: 'credentials in link' };
  const base = new URL(BASE);
  const external = url.origin !== base.origin;
  if (!external) {
    // Relative or fragment link: keep the author's relative form (it resolved inside the base origin).
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return { ok: false, reason: 'absolute link to the placeholder origin' };
    return { ok: true, href: raw, external: false };
  }
  return { ok: true, href: url.href, external: true };
}

/** Values that the renderer itself produced (fragments, relative asset paths, checked links). */
function isSafeRenderedUrl(value: string): boolean {
  if (value.startsWith('#')) return true;
  const check = checkLink(value);
  return check.ok;
}

// --- Bidirectional control characters (Trojan Source) ---------------------

const BIDI = /[\u202a-\u202e\u2066-\u2069]/g;

export function hasBidiControls(s: string): boolean {
  return /[\u202a-\u202e\u2066-\u2069]/.test(s);
}

/** Show bidi controls as visible escape marks such as \u27e8U+202E\u27e9. */
export function visibleBidi(s: string): string {
  return s.replace(BIDI, (c) => `\u27e8U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}\u27e9`);
}
