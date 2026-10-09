// Validate math in a Mermaid *label value*. The caller must obtain that value
// and its source span from a grammar-aware diagram adapter. This module never
// searches an arbitrary fenced Mermaid document for labels.
//
// Pinned Mermaid 12.0.0 (dist/mermaid.js) uses /\$\$(.*?)\$\$/g and calls
// KaTeX 0.16.47 with the three options below. In particular, its delimiter
// regex matches inside backticks and after a backslash, but not across a line
// break. We reject unmatched delimiters instead of silently losing authored
// math; that deliberate strictness is separate from KaTeX command support.
import katex from 'katex';
import { EMPTY_MATH_RESOURCE_TOTAL, MATH_LIMITS, MathPolicyError,
  reserveMathOccurrences, type MathResourceTotal } from '../math/policy.ts';
import { MERMAID_SOURCE_LIMIT } from './rules.ts';

export type MermaidMathText = Readonly<{
  kind: 'text';
  source: string;
  start: number; // UTF-16 offset in the supplied label, inclusive
  end: number; // UTF-16 offset in the supplied label, exclusive
}>;

export type MermaidMathExpression = Readonly<{
  kind: 'math';
  source: string; // the literal $$...$$, including delimiters
  tex: string;
  start: number;
  end: number;
  mathmlBytes: number;
  elementCount: number;
}>;

export type MermaidMathLabel = Readonly<{
  source: string; // unchanged label value; source adapters map offsets to the fence
  parts: readonly (MermaidMathText | MermaidMathExpression)[];
  total: MathResourceTotal; // carry into next label; svgBytes counts KaTeX MathML bytes here
}>;

const encoder = new TextEncoder();
const delimiter = /\$\$(.*?)\$\$/g;
const forbiddenCommands = new Set([
  'def', 'gdef', 'edef', 'xdef', 'let', 'futurelet', 'global',
  'newcommand', 'renewcommand', 'providecommand', 'newenvironment', 'renewenvironment',
  'DeclareMathOperator', 'label', 'ref', 'eqref', 'tag', 'notag', 'nonumber',
  'href', 'url', 'html', 'htmlClass', 'htmlId', 'htmlStyle', 'htmlData', 'class',
  'style', 'cssId', 'require', 'includegraphics', 'input', 'usepackage',
  'unicode', 'color', 'textcolor', 'bbox',
]);
const numberedEnvironment = /\\begin\s*\{\s*(?:equation|eqnarray|align|gather|multline|flalign|alignat|xalignat|xxalignat)\*?\s*\}/;
const htmlTag = /<\s*\/?\s*(?:script|style|iframe|object|embed|img|svg|foreignobject|link|meta|form|input|button|video|audio|source|math)\b[^<>]*>/i;

function invalid(offset: number, reason: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `Mermaid label math at UTF-16 offset ${offset}: ${reason}`);
}

/** TeX control words only; `\\\\href` is a line break followed by ordinary letters. */
function forbiddenCommand(tex: string): string | undefined {
  for (let i = 0; i < tex.length; i++) {
    if (tex[i] !== '\\' || i + 1 >= tex.length) continue;
    if (!/[A-Za-z]/.test(tex[i + 1]!)) { i++; continue; }
    let end = i + 2;
    while (end < tex.length && /[A-Za-z]/.test(tex[end]!)) end++;
    const name = tex.slice(i + 1, end);
    if (forbiddenCommands.has(name)) return name;
    i = end - 1;
  }
  return undefined;
}

/**
 * Validate one parsed Mermaid label without rewriting it. Offsets are UTF-16
 * offsets relative to `label`; the family adapter owns the map back to source
 * lines/bytes. KaTeX output is counted but never returned as trusted markup.
 * Passing `total` from the previous label enforces the shared document limits.
 */
export function validateMermaidMathLabel(
  label: string,
  total: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
): MermaidMathLabel {
  if (typeof label !== 'string') invalid(0, 'label must be text');
  if (encoder.encode(label).length > MERMAID_SOURCE_LIMIT) {
    throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Mermaid label exceeds the figure source byte limit');
  }
  const parts: Array<MermaidMathText | MermaidMathExpression> = [];
  let cursor = 0;
  let nextTotal = total;
  for (const match of label.matchAll(delimiter)) {
    const start = match.index;
    const stray = label.indexOf('$$', cursor);
    if (stray !== -1 && stray < start) invalid(stray, 'unmatched $$ delimiter');
    if (start > cursor) parts.push({ kind: 'text', source: label.slice(cursor, start), start: cursor, end: start });
    const source = match[0];
    const tex = match[1]!;
    if (!tex.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(tex)) invalid(start, 'empty or control-character math source');
    if (encoder.encode(tex).length > MATH_LIMITS.expressionSourceBytes) {
      throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', `Mermaid label math at UTF-16 offset ${start} exceeds the source byte limit`);
    }
    if (htmlTag.test(tex)) invalid(start, 'HTML markup is not math source');
    const command = forbiddenCommand(tex);
    if (command || numberedEnvironment.test(tex)) invalid(start, `unsupported TeX command or numbered environment${command ? ` \\${command}` : ''}`);
    let mathml: string;
    try {
      mathml = katex.renderToString(tex, { throwOnError: true, displayMode: true, output: 'mathml' });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      invalid(start, `KaTeX rejected the expression: ${reason.slice(0, 240)}`);
    }
    const mathmlBytes = encoder.encode(mathml).length;
    if (mathmlBytes > MATH_LIMITS.expressionSvgBytes) {
      throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', `Mermaid label math at UTF-16 offset ${start} exceeds the output byte limit`);
    }
    // KaTeX returns its own deterministic markup. Inspect opening tags only;
    // annotation text remains inert and is never interpreted as HTML here.
    let elementCount = 0;
    for (const tag of mathml.matchAll(/<[A-Za-z][^>]*>/g)) {
      if (++elementCount > MATH_LIMITS.expressionElements) {
        throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', `Mermaid label math at UTF-16 offset ${start} has too many MathML elements`);
      }
      // KaTeX normalizes TeX lengths to em in its MathML geometry attributes.
      // A compact output with a 5000em mspace is still an excessive layout.
      for (const dimension of tag[0].matchAll(/\b(?:width|height|depth|voffset|lspace|rspace)="([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)em"/g)) {
        if (Math.abs(Number(dimension[1])) > MATH_LIMITS.maxDimensionEm) {
          throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', `Mermaid label math at UTF-16 offset ${start} exceeds the dimension limit`);
        }
      }
    }
    nextTotal = reserveMathOccurrences(nextTotal, { svgBytes: mathmlBytes, elementCount }, 1);
    parts.push({ kind: 'math', source, tex, start, end: start + source.length, mathmlBytes, elementCount });
    cursor = start + source.length;
  }
  const stray = label.indexOf('$$', cursor);
  if (stray !== -1) invalid(stray, 'unmatched $$ delimiter');
  if (cursor < label.length) parts.push({ kind: 'text', source: label.slice(cursor), start: cursor, end: label.length });
  return { source: label, parts, total: nextTotal };
}
