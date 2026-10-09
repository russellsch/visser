import { MATH_LIMITS } from '../../core/src/math/policy.ts';

const SVG = 'http://www.w3.org/2000/svg';
const XHTML = 'http://www.w3.org/1999/xhtml';
const MATHML = 'http://www.w3.org/1998/Math/MathML';

export type MermaidInkBounds = Readonly<{ width: number; height: number; changed: boolean }>;
type Saved = MermaidInkBounds & { text: string; elements: number; originalLabel?: string; tex?: readonly string[] };
// One call per freshly created native label is the intended path. The cache
// assumes its computed font and ancestor transform stay fixed after Mermaid's
// prelayout measurement; reusing a label after a theme/font change requires a
// new foreignObject. Text/element changes are rejected on repeated calls.
const reserved = new WeakMap<SVGForeignObjectElement, Saved>();

function localBox(element: Element, inverse: DOMMatrix, svg: SVGSVGElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return undefined;
  const corners = [[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]];
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [x, y] of corners) {
    const point = svg.createSVGPoint();
    point.x = x!; point.y = y!;
    const local = point.matrixTransform(inverse);
    left = Math.min(left, local.x); top = Math.min(top, local.y);
    right = Math.max(right, local.x); bottom = Math.max(bottom, local.y);
  }
  if (![left, top, right, bottom].every(Number.isFinite)) throw new Error('Mermaid math has invalid transformed bounds');
  return { left, top, right, bottom };
}

/** Reserve the visible ink of an already-rendered native Mermaid HTML label.
 *
 * Must run while the foreignObject is attached and before Mermaid reads its
 * first XHTML div's getBoundingClientRect for graph layout. No author markup is
 * parsed or re-rendered here. On unsupported shapes or excessive geometry it
 * throws, allowing the caller to keep the diagram's readable source fallback.
 */
export function reserveMermaidMathInk(foreign: SVGForeignObjectElement, originalLabel?: string): MermaidInkBounds {
  if (foreign.namespaceURI !== SVG || foreign.localName !== 'foreignObject' || !foreign.isConnected) {
    throw new Error('Mermaid math ink requires an attached SVG foreignObject');
  }
  const div = foreign.firstElementChild;
  if (!div || div.namespaceURI !== XHTML || div.localName !== 'div' || foreign.childElementCount !== 1) {
    throw new Error('Unsupported Mermaid math label structure');
  }
  const svg = foreign.ownerSVGElement;
  const win = foreign.ownerDocument.defaultView;
  if (!svg || !win) throw new Error('Mermaid math ink requires an attached SVG document');
  // Pinned addHtmlSpan receives createText's already slash-normalized
  // node.label, then applies lineBreakRegex before its exact KaTeX regex.
  // Do not infer formulas from the rendered DOM: sanitizer/KaTeX failures
  // could otherwise make a missing or extra formula appear authoritative.
  const expectedTex = originalLabel === undefined ? undefined :
    [...originalLabel.replace(/<\/?br\s*\/?>/gi, '\n').matchAll(/\$\$(.*?)\$\$/g)].map(match => match[1]!);
  const math = Array.from(div.querySelectorAll('math')).filter(element => element.namespaceURI === MATHML);
  if (expectedTex && expectedTex.length !== math.length) {
    throw new Error('Mermaid native MathML count differs from original label');
  }
  if (expectedTex) math.forEach((expression, index) => {
    const annotation = expression.querySelector('annotation[encoding="application/x-tex"]');
    // Pinned Mermaid strips KaTeX annotations before sanitizing. If a future
    // build retains one, treat its TeX as an independent consistency check.
    if (annotation && annotation.textContent !== expectedTex[index]) {
      throw new Error('Mermaid native MathML TeX differs from original label');
    }
  });
  const current = reserved.get(foreign);
  if (current) {
    if (current.text !== div.textContent || current.elements !== div.querySelectorAll('*').length) {
      throw new Error('Mermaid math label changed after geometry reservation');
    }
    if (originalLabel !== undefined && current.originalLabel !== originalLabel) {
      throw new Error('Mermaid math label source changed after geometry reservation');
    }
    if (current.tex && (math.length !== current.tex.length || math.some((expression, index) =>
      expression.getAttribute('data-vs-mermaid-formula') !== current.tex![index]))) {
      throw new Error('Mermaid math formula binding changed after geometry reservation');
    }
    return { width: current.width, height: current.height, changed: current.changed };
  }
  if (!math.length) {
    // Empty plain labels are valid in Mermaid. The build hook calls this for
    // every native HTML label, so only math may impose nonzero geometry.
    const rect = div.getBoundingClientRect();
    let width = rect.width, height = rect.height;
    try {
      const transform = foreign.getScreenCTM();
      const ordinaryBox = transform && localBox(div, transform.inverse(), svg);
      if (ordinaryBox) {
        width = ordinaryBox.right - ordinaryBox.left;
        height = ordinaryBox.bottom - ordinaryBox.top;
      }
    } catch { /* no-math geometry is never mutated or used by the hook */ }
    return { width, height, changed: false };
  }
  const matrix = foreign.getScreenCTM();
  if (!matrix) throw new Error('Mermaid math ink has no SVG transform');
  let inverse: DOMMatrix;
  try { inverse = matrix.inverse(); }
  catch { throw new Error('Mermaid math ink transform cannot be inverted'); }
  const divBox = localBox(div, inverse, svg);
  if (!divBox) throw new Error('Mermaid math label has no layout box');
  if (typeof (win as unknown as { MathMLElement?: unknown }).MathMLElement === 'undefined') {
    throw new Error('This browser cannot render Mermaid MathML');
  }
  const content = div.firstElementChild;
  if (!content || content.namespaceURI !== XHTML || content.localName !== 'span' || div.childElementCount !== 1) {
    throw new Error('Unsupported Mermaid math label content');
  }
  const descendants = Array.from(div.querySelectorAll('*'));
  if (descendants.length > MATH_LIMITS.documentElements ||
      math.some(expression => expression.querySelectorAll('*').length > MATH_LIMITS.expressionElements)) {
    throw new Error('Mermaid math label exceeds element limit');
  }
  const position = win.getComputedStyle(content).position;
  if (position !== 'static') throw new Error('Unsupported positioned Mermaid math label');
  // \smash may intentionally give the containing span zero declared height
  // while its MathML descendants still have real ink. Anchor that span at
  // the div origin when it exposes no own rectangle.
  const contentBox = localBox(content, inverse, svg) ?? divBox;
  let left = divBox.left, top = divBox.top, right = divBox.right, bottom = divBox.bottom;
  for (const child of descendants) {
    const box = localBox(child, inverse, svg);
    if (!box) continue;
    left = Math.min(left, box.left); top = Math.min(top, box.top);
    right = Math.max(right, box.right); bottom = Math.max(bottom, box.bottom);
  }
  const shiftX = Math.max(0, divBox.left - left);
  const shiftY = Math.max(0, divBox.top - top);
  const width = Math.ceil(right - left);
  const height = Math.ceil(bottom - top);
  const fontSize = Number.parseFloat(win.getComputedStyle(div).fontSize) || 16;
  const max = MATH_LIMITS.maxDimensionEm * fontSize;
  if (![width, height, shiftX, shiftY].every(Number.isFinite) || width <= 0 || height <= 0 ||
      Math.max(width, height) > max) throw new Error('Mermaid math ink bounds are invalid or excessive');
  const previous = { div: (div as HTMLElement).style.cssText, content: (content as HTMLElement).style.cssText,
    width: foreign.getAttribute('width'), height: foreign.getAttribute('height'),
    tags: math.map(expression => expression.getAttribute('data-vs-mermaid-formula')) };
  try {
    const divStyle = (div as HTMLElement).style;
    const contentStyle = (content as HTMLElement).style;
    // Mermaid's KaTeX wrapper centers its child with flexbox. Merely widening
    // the parent would recenter the math *after* measurement and send rlap ink
    // outside the reserved box. Pin the existing span at its measured size;
    // this moves the same DOM without re-rendering or duplicating it.
    divStyle.display = 'block';
    divStyle.position = 'relative';
    contentStyle.display = 'inline-block';
    contentStyle.position = 'absolute';
    contentStyle.width = `${Math.max(1, contentBox.right - contentBox.left)}px`;
    contentStyle.height = `${Math.max(1, contentBox.bottom - contentBox.top)}px`;
    contentStyle.left = `${shiftX + contentBox.left - divBox.left}px`;
    contentStyle.top = `${shiftY + contentBox.top - divBox.top}px`;
    divStyle.boxSizing = 'border-box';
    divStyle.maxWidth = 'none';
    divStyle.width = `${width}px`;
    divStyle.height = `${height}px`;
    foreign.setAttribute('width', String(width));
    foreign.setAttribute('height', String(height));
    // The first div is precisely what native labelHelper/insertEdgeLabel reads.
    // Reject a browser/stylesheet that refuses to expose the reserved box.
    const actual = localBox(div, inverse, svg);
    if (!actual || actual.right - actual.left + 1 < width || actual.bottom - actual.top + 1 < height) {
      throw new Error('Mermaid math ink reservation did not affect the layout box');
    }
    for (const child of descendants) {
      const box = localBox(child, inverse, svg);
      if (box && (box.left < actual.left - 1 || box.right > actual.right + 1 ||
                  box.top < actual.top - 1 || box.bottom > actual.bottom + 1)) {
        throw new Error('Mermaid math ink escaped the reserved layout box');
      }
    }
    if (expectedTex) math.forEach((expression, index) =>
      expression.setAttribute('data-vs-mermaid-formula', expectedTex[index]!));
    const result: Saved = { width, height, changed: true, text: div.textContent ?? '', elements: descendants.length,
      originalLabel, tex: expectedTex };
    reserved.set(foreign, result);
    return { width, height, changed: true };
  } catch (error) {
    (div as HTMLElement).style.cssText = previous.div;
    (content as HTMLElement).style.cssText = previous.content;
    if (previous.width === null) foreign.removeAttribute('width'); else foreign.setAttribute('width', previous.width);
    if (previous.height === null) foreign.removeAttribute('height'); else foreign.setAttribute('height', previous.height);
    math.forEach((expression, index) => {
      const prior = previous.tags[index];
      if (prior === null || prior === undefined) expression.removeAttribute('data-vs-mermaid-formula');
      else expression.setAttribute('data-vs-mermaid-formula', prior);
    });
    throw error;
  }
}
