import katex from 'katex';
import { validateMermaidMathLabel } from '../../core/src/mermaid/math.ts';
import { MATH_LIMITS } from '../../core/src/math/policy.ts';

const SVG = 'http://www.w3.org/2000/svg';
const XHTML = 'http://www.w3.org/1999/xhtml';

export type MeasuredMermaidLabel = Readonly<{
  width: number;
  height: number;
  place(parent: SVGElement, x: number, y: number): SVGElement;
}>;
export type MermaidLabelMeasureOptions = Readonly<{
  maxWidth?: number;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  letterSpacing?: string;
  color?: string;
  /** Native filtered label CSS, applied before measurement and placement. */
  labelStyle?: string;
  /** Keep native row ancestry during measurement. */
  measurementParent?: SVGElement;
  /** False keeps literal break-tag spelling in SVG text-based families. */
  interpretBreakTags?: boolean;
}>;

/** Measure the exact DOM that will be placed, before the family lays out shapes.
 * Only grammar-extracted label values may enter this API. No HTML from the
 * author is interpreted; the sole markup producer is the pinned KaTeX engine.
 */
export async function measureMermaidLabel(
  svg: SVGSVGElement, text: string, className: string,
  options?: MermaidLabelMeasureOptions,
): Promise<MeasuredMermaidLabel> {
  if (options?.maxWidth !== undefined && (!Number.isFinite(options.maxWidth) || options.maxWidth <= 0)) {
    throw new Error('Mermaid label maxWidth must be positive and finite');
  }
  const label = validateMermaidMathLabel(text);
  const parent = options?.measurementParent ?? svg;
  if (parent !== svg && parent.ownerSVGElement !== svg) throw new Error('Mermaid label measurement parent differs from its SVG');
  const doc = svg.ownerDocument;
  const win = doc.defaultView;
  if (!win || !svg.isConnected) throw new Error('Mermaid label measurement requires an attached SVG');
  if (label.parts.some((part) => part.kind === 'math') && typeof (win as unknown as { MathMLElement?: unknown }).MathMLElement === 'undefined') {
    throw new Error('This browser cannot render Mermaid MathML');
  }
  // Resolve the same diagram/theme class used by the upstream SVG text. SVG
  // fill does not inherit as HTML color, so explicitly transfer it as well.
  const probe = doc.createElementNS(SVG, 'text');
  probe.setAttribute('class', className);
  probe.textContent = 'M';
  if (options?.fontFamily) probe.style.fontFamily = options.fontFamily;
  if (options?.fontSize) probe.style.fontSize = options.fontSize;
  if (options?.fontWeight) probe.style.fontWeight = options.fontWeight;
  probe.style.visibility = 'hidden';
  parent.append(probe);
  const style = win.getComputedStyle(probe);
  const typography = {
    fontFamily: style.fontFamily, fontSize: style.fontSize || '16px',
    fontWeight: style.fontWeight, fontStyle: options?.fontStyle ?? style.fontStyle,
    letterSpacing: options?.letterSpacing ?? style.letterSpacing, color: options?.color ?? (style.fill || style.color),
  };
  probe.remove();
  const foreign = doc.createElementNS(SVG, 'foreignObject');
  foreign.setAttribute('class', className);
  foreign.setAttribute('width', '1');
  foreign.setAttribute('height', '1');
  foreign.style.overflow = 'visible';
  foreign.style.visibility = 'hidden';
  const inheritRowTypography = (element: HTMLElement | MathMLElement) => {
    if (options?.labelStyle === undefined) return;
    for (const property of ['color', 'font-size', 'font-weight', 'font-style']) {
      element.style.setProperty(property, 'inherit', 'important');
    }
  };
  const content = doc.createElementNS(XHTML, 'div');
  Object.assign(content.style, typography, {
    display: 'inline-block', width: 'max-content', whiteSpace: 'pre',
    lineHeight: '1.5', padding: '0', margin: '0', border: '0',
  });
  if (options?.labelStyle) content.style.cssText += ';' + options.labelStyle;
  if (options?.maxWidth !== undefined) {
    // CSS pixels in a foreignObject are local SVG units. Keep the measured
    // width cap on the cloned DOM so placement cannot reflow the label.
    content.style.maxWidth = `${options.maxWidth}px`;
    content.style.whiteSpace = 'pre-wrap';
    content.style.overflowWrap = 'normal';
    content.style.wordBreak = 'normal';
  }
  for (const part of label.parts) {
    if (part.kind === 'text') {
      const lines = options?.interpretBreakTags === false ? [part.source] : part.source.split(/<br\s*\/?>/i);
      lines.forEach((line, index) => {
        if (index) content.append(doc.createElementNS(XHTML, 'br'));
        content.append(doc.createTextNode(line));
      });
    } else {
      const math = doc.createElementNS(XHTML, 'span');
      math.setAttribute('data-vs-mermaid-formula', part.tex);
      if (options?.maxWidth !== undefined) {
        math.style.display = 'inline-block';
        math.style.whiteSpace = 'nowrap';
      }
      katex.render(part.tex, math, { throwOnError: true, displayMode: true, output: 'mathml' });
      // A display-style expression remains inline in a mixed diagram label.
      for (const element of math.querySelectorAll('math')) element.setAttribute('display', 'inline');
      if (options?.labelStyle !== undefined) {
        // Native generic span rules and KaTeX wrapper fonts must not replace
        // the explicit row typography after moving the measured clone.
        for (const element of [math, ...math.querySelectorAll<HTMLElement>('span, math')]) {
          inheritRowTypography(element);
        }
      }
      content.append(math);
    }
  }
  if (!text) content.append(doc.createTextNode('\u200b'));
  foreign.append(content);
  parent.append(foreign);
  try {
    await doc.fonts?.ready;
    // TeX can deliberately suppress layout dimensions (rlap, smash, phantom).
    // Reserve the union of descendant boxes as well as the outer flow box.
    // Convert screen rectangles back to local SVG units, including ancestor
    // scaling, so measured overhang cannot escape the family's reserved box.
    const matrix = foreign.getScreenCTM();
    if (!matrix) throw new Error('Mermaid label has no measurement transform');
    const inverse = matrix.inverse();
    const localBounds = (element: Element, includeZero = false): { left: number; top: number; right: number; bottom: number } | undefined => {
      const rect = element.getBoundingClientRect();
      if (!includeZero && rect.width === 0 && rect.height === 0) return undefined; // hidden MathML annotations
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const [x, y] of [[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]]) {
        const point = svg.createSVGPoint();
        point.x = x!; point.y = y!;
        const local = point.matrixTransform(inverse);
        left = Math.min(left, local.x); top = Math.min(top, local.y);
        right = Math.max(right, local.x); bottom = Math.max(bottom, local.y);
      }
      return { left, top, right, bottom };
    };
    // rlap/smash and similar TeX commands leave an outer span with little or
    // no logical width/height while their descendants still paint ink. Give
    // such a formula its actual footprint in the inline flow *before* prose
    // wraps; growing only the final foreignObject would preserve the overlap.
    for (const formula of content.querySelectorAll('[data-vs-mermaid-formula]')) {
      const logical = localBounds(formula, true);
      if (!logical) continue;
      let ink = { ...logical };
      for (const descendant of formula.querySelectorAll('*')) {
        const box = localBounds(descendant);
        if (!box) continue;
        ink = { left: Math.min(ink.left, box.left), top: Math.min(ink.top, box.top),
          right: Math.max(ink.right, box.right), bottom: Math.max(ink.bottom, box.bottom) };
      }
      if (ink.left >= logical.left - 0.1 && ink.top >= logical.top - 0.1 &&
          ink.right <= logical.right + 0.1 && ink.bottom <= logical.bottom + 0.1) continue;
      const wrapper = doc.createElementNS(XHTML, 'span');
      inheritRowTypography(wrapper);
      Object.assign(wrapper.style, { display: 'inline-block', position: 'relative', verticalAlign: 'middle',
        width: `${Math.ceil(ink.right - ink.left)}px`, height: `${Math.ceil(ink.bottom - ink.top)}px` });
      formula.before(wrapper);
      wrapper.append(formula);
      Object.assign((formula as HTMLElement).style, { position: 'absolute', display: 'inline-block', whiteSpace: 'nowrap',
        left: `${logical.left - ink.left}px`, top: `${logical.top - ink.top}px` });
    }
    let left = 0, top = 0, right = 0, bottom = 0;
    for (const element of [content, ...content.querySelectorAll('*')]) {
      const box = localBounds(element);
      if (!box) continue;
      left = Math.min(left, box.left); top = Math.min(top, box.top);
      right = Math.max(right, box.right); bottom = Math.max(bottom, box.bottom);
    }
    const width = Math.ceil(right - left);
    const height = Math.ceil(bottom - top);
    const em = parseFloat(typography.fontSize) || 16;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height <= 0 ||
        Math.max(width, height) > MATH_LIMITS.maxDimensionEm * em) {
      throw new Error('Mermaid label has invalid or excessive measured bounds');
    }
    foreign.setAttribute('width', String(Math.max(1, width)));
    foreign.setAttribute('height', String(height));
    content.style.transform = `translate(${-left}px, ${-top}px)`;
    foreign.style.removeProperty('visibility');
    return {
      width, height,
      place(parent, x, y) {
        if (![x, y].every(Number.isFinite)) throw new Error('Invalid Mermaid label position');
        const placed = foreign.cloneNode(true) as SVGForeignObjectElement;
        placed.setAttribute('x', String(x));
        placed.setAttribute('y', String(y));
        parent.append(placed);
        return placed;
      },
    };
  } finally {
    foreign.remove();
  }
}
