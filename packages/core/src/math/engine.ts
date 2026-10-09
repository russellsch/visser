import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { LiteElement } from '@mathjax/src/js/adaptors/lite/Element.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import { MATH_FINGERPRINT_INPUTS, MATH_LIMITS, MATH_SVG_GEOMETRY, MathPolicyError } from './policy.ts';
import { mathSvgResourceCost, validateMathSvgInk, validateSvgGeometry } from './svg-validate.ts';
import { mathSvgInkBounds } from './svg-ink.ts';
export { MATH_FINGERPRINT_INPUTS } from './policy.ts';

export interface MathSvgElement {
  tag: 'svg' | 'g' | 'path' | 'rect';
  attrs: Record<string, string>;
  children: MathSvgElement[];
}

export interface MathMetrics {
  widthEm: number;
  heightEm: number;
  depthEm: number;
  ascentEm: number;
}

export interface MathConversion {
  source: string;
  display: boolean;
  svg: MathSvgElement;
  metrics: MathMetrics;
  svgBytes: number;
  elementCount: number;
  fingerprintInputs: typeof MATH_FINGERPRINT_INPUTS;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const encoder = new TextEncoder();
const elements = new Set(['svg', 'g', 'path', 'rect']);
const attributeNames: Record<MathSvgElement['tag'], ReadonlySet<string>> = {
  svg: new Set(['xmlns', 'width', 'height', 'role', 'focusable', 'viewBox']),
  g: new Set(['stroke', 'fill', 'stroke-width', 'transform', 'data-mml-node', 'data-mjx-texclass']),
  path: new Set(['data-c', 'd', 'transform', 'fill', 'stroke', 'stroke-width']),
  rect: new Set(['width', 'height', 'x', 'y', 'transform', 'fill', 'stroke', 'stroke-width']),
};
const numberPattern = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const numberRe = new RegExp(`^${numberPattern}$`);
const exRe = new RegExp(`^(${numberPattern})ex$`);
const transformRe = /^(?:(?:translate|scale|rotate|matrix)\([0-9eE.,+\-\s]+\)\s*)+$/;
const pathRe = /^[MmLlHhVvCcSsQqTtAaZz0-9.eE,+\-\s]+$/;
const forbiddenCommandRe = /\\(?:def|gdef|edef|xdef|let|newcommand|renewcommand|providecommand|DeclareMathOperator|label|ref|eqref|tag|notag|nonumber|href|url|html|class|style|cssId|require|includegraphics|input|usepackage|unicode|color|textcolor|bbox)(?![A-Za-z])/;
// These top-level TeX environments own tags or line numbering. Visser's
// equation registry alone owns identity and ordinal labels.
const numberedEnvironmentRe = /\\begin\s*\{\s*(?:equation|eqnarray|align|gather|multline|flalign|alignat|xalignat|xxalignat)\*?\s*\}/;

function invalid(reason: string): never {
  throw new MathPolicyError('E_MATH_INVALID', reason);
}

function finiteNumber(value: string, name: string): number {
  if (!numberRe.test(value)) invalid(`Invalid SVG ${name}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) invalid(`Non-finite SVG ${name}`);
  return parsed;
}

function exNumber(value: string, name: string): number {
  const match = exRe.exec(value);
  if (!match?.[1]) invalid(`Invalid SVG ${name}`);
  return finiteNumber(match[1], name);
}

function validateAttribute(tag: string, name: string, value: string): void {
  if (!attributeNames[tag as MathSvgElement['tag']]?.has(name)) invalid(`Unsupported SVG attribute ${name} on ${tag}`);
  if (name === 'xmlns' && (tag !== 'svg' || value !== 'http://www.w3.org/2000/svg')) invalid('Invalid SVG namespace');
  if (name === 'role' && (tag !== 'svg' || value !== 'img')) invalid('Invalid SVG role');
  if (name === 'focusable' && (tag !== 'svg' || value !== 'false')) invalid('Invalid SVG focusability');
  if ((name === 'width' || name === 'height') && tag === 'svg') exNumber(value, name);
  else if (['width', 'height', 'x', 'y', 'stroke-width'].includes(name)) finiteNumber(value, name);
  if (name === 'viewBox') {
    const parts = value.trim().split(/[\s,]+/);
    if (tag !== 'svg' || parts.length !== 4) invalid('Invalid SVG viewBox');
    const values = parts.map((part, index) => finiteNumber(part, `viewBox[${index}]`));
    if (values[2]! <= 0 || values[3]! <= 0) invalid('Invalid SVG viewBox extent');
  }
  if ((name === 'stroke' || name === 'fill') && value !== 'currentColor' && value !== 'none') invalid('Unsupported SVG color');
  if (name === 'transform' && !transformRe.test(value)) invalid('Unsupported SVG transform');
  // The pinned font emits d="" for a no-ink space glyph in \text{...}.
  if (name === 'd' && (tag !== 'path' || (value !== '' && !pathRe.test(value)))) invalid('Unsupported SVG path');
  if (name === 'data-c' && !/^[0-9A-F]+$/.test(value)) invalid('Invalid glyph identifier');
  if (name === 'data-mml-node' && !/^[A-Za-z][A-Za-z0-9]*$/.test(value)) invalid('Invalid MathML node marker');
  if (name === 'data-mjx-texclass' && !/^[A-Z]+$/.test(value)) invalid('Invalid TeX class');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeSvg(node: LiteElement, budget: { bytes: number; elements: number }, depth = 0): MathSvgElement {
  if (depth > MATH_LIMITS.svgDepth) throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Math SVG nesting exceeds its depth budget');
  const tag = node.kind;
  if (!elements.has(tag)) invalid(`Unsupported SVG element ${tag}`);
  budget.elements++;
  if (budget.elements > MATH_LIMITS.expressionElements) throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Math SVG has too many elements');
  const attrs: Record<string, string> = {};
  let opening = `<${tag}`;
  for (const { name, value } of adaptor.allAttributes(node)) {
    if (name === 'data-latex' || (tag === 'svg' && name === 'style')) continue;
    validateAttribute(tag, name, value);
    attrs[name] = value;
    opening += ` ${name}="${escapeXml(value)}"`;
  }
  if (attrs['data-mml-node'] === 'merror') invalid('Renderer produced a math error node');
  budget.bytes += encoder.encode(opening + '>').length + encoder.encode(`</${tag}>`).length;
  if (budget.bytes > MATH_LIMITS.expressionSvgBytes) throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Math SVG exceeds byte budget');
  const children: MathSvgElement[] = [];
  for (const child of adaptor.childNodes(node)) {
    if (!(child instanceof LiteElement)) {
      if (adaptor.value(child).trim()) invalid('Text glyph or non-element SVG content is unsupported');
      continue;
    }
    children.push(sanitizeSvg(child, budget, depth + 1));
  }
  return { tag: tag as MathSvgElement['tag'], attrs, children };
}

export function convertMath(tex: string, display: boolean): MathConversion {
  if (typeof tex !== 'string' || typeof display !== 'boolean') invalid('Math source and display mode are required');
  if (!tex.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(tex)) invalid('Empty or control-character math source');
  if (encoder.encode(tex).length > MATH_LIMITS.expressionSourceBytes) {
    throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Math source exceeds byte budget');
  }
  // Comparison chains such as x<y>z are valid math. Reject executable or
  // resource-bearing HTML spellings here; the SVG tree is independently
  // allowlisted regardless of source spelling.
  if (/<\s*\/?\s*(?:script|style|iframe|object|embed|img|svg|foreignobject|link|meta|form|input|button|video|audio|source|math)\b[^<>]*>/i.test(tex)) {
    invalid('HTML markup is not math source');
  }
  if (forbiddenCommandRe.test(tex) || numberedEnvironmentRe.test(tex)) invalid('Unsupported TeX command or environment; use Visser equation IDs and references');
  const input = new TeX({ packages: ['base', 'ams'], maxBuffer: 16384,
    formatError(_jax: unknown, error: unknown) { throw error; } });
  const output = new SVG({ fontData: MathJaxTexFont, fontCache: 'none', linebreaks: { inline: false } });
  const doc = mathjax.document('', { InputJax: input, OutputJax: output });
  let wrapper: LiteElement;
  try { wrapper = doc.convert(tex, { display, em: 16, ex: 8, containerWidth: 1280 }) as LiteElement; }
  catch (error) {
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message : String(error);
    invalid(`Invalid or unsupported TeX: ${message}`);
  }
  const roots = adaptor.childNodes(wrapper);
  if (roots.length !== 1 || !(roots[0] instanceof LiteElement) || roots[0].kind !== 'svg') invalid('Expected one SVG equation');
  const root = roots[0];
  const heightEm = exNumber(adaptor.getAttribute(root, 'height'), 'height') / 2;
  const widthEm = exNumber(adaptor.getAttribute(root, 'width'), 'width') / 2;
  const align = adaptor.getAttribute(root, 'style');
  const depthMatch = /^vertical-align:\s*(-?[^;]+)ex;?$/.exec(align ?? '');
  if (!depthMatch?.[1]) invalid('Missing SVG baseline metric');
  const depthEm = -finiteNumber(depthMatch[1], 'baseline') / 2;
  const ascentEm = heightEm - depthEm;
  if (widthEm <= 0 || heightEm <= 0 || depthEm < 0 || ascentEm <= 0 ||
      [widthEm, heightEm, depthEm, ascentEm].some(value => !Number.isFinite(value) || value > MATH_LIMITS.maxDimensionEm)) {
    throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Math SVG dimension exceeds its em budget');
  }
  const budget = { bytes: 0, elements: 0 };
  const svg = sanitizeSvg(root, budget);
  validateSvgGeometry({ widthEm, heightEm, depthEm, ascentEm }, svg.attrs);
  const [x, y, width, height] = svg.attrs.viewBox!.trim().split(/[\s,]+/).map(Number);
  const ink = mathSvgInkBounds(svg);
  // TeX may deliberately suppress logical dimensions. Preserve its internal
  // arrangement, but reserve the full formula's painted footprint externally.
  const left = Math.floor(Math.min(x!, ink?.left ?? x!) * 1000) / 1000;
  const top = Math.floor(Math.min(y!, ink?.top ?? y!) * 1000) / 1000;
  const right = Math.ceil(Math.max(x! + width!, ink?.right ?? x! + width!) * 1000) / 1000;
  const bottom = Math.ceil(Math.max(y! + height!, ink?.bottom ?? y! + height!, 0) * 1000) / 1000;
  if (left !== 0) svg.children = [{ tag: 'g', attrs: { transform: `translate(${-left},0)` }, children: svg.children }];
  const unitsPerEm = 2 * MATH_SVG_GEOMETRY.unitsPerEx;
  const metrics = { widthEm: (right - left) / unitsPerEm, heightEm: (bottom - top) / unitsPerEm,
    depthEm: bottom / unitsPerEm, ascentEm: -top / unitsPerEm };
  if (Object.values(metrics).some(value => !Number.isFinite(value) || value > MATH_LIMITS.maxDimensionEm)) {
    throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Math ink dimension exceeds its em budget');
  }
  svg.attrs.viewBox = `0 ${top} ${right - left} ${bottom - top}`;
  svg.attrs.width = `${metrics.widthEm * 2}ex`;
  svg.attrs.height = `${metrics.heightEm * 2}ex`;
  validateSvgGeometry(metrics, svg.attrs);
  validateMathSvgInk(svg);
  const finalCost = mathSvgResourceCost(svg);
  return { source: tex, display, svg, metrics,
    svgBytes: finalCost.bytes, elementCount: finalCost.elements, fingerprintInputs: MATH_FINGERPRINT_INPUTS };
}
