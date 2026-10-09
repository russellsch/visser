// Copy compiler-authored rich content into transient chrome. This is a DOM
// projection, never a parse of flattened text: code keeps its literal dollars,
// and math comes only from explicit compiler placeholders.
import { DOM } from '../../core/src/compiler/dom-contract.ts';
import { initializeMath, type MathExpressionRecord } from './math.ts';

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const inlineTags: ReadonlyMap<string, string> = new Map([
  ['EM', 'em'], ['STRONG', 'strong'], ['B', 'b'], ['I', 'i'],
  ['CODE', 'code'], ['SUB', 'sub'], ['SUP', 'sup'], ['S', 's'],
  ['SMALL', 'small'], ['MARK', 'mark'],
]);
const skippedTags = new Set(['BUTTON', 'SCRIPT', 'STYLE', 'TEMPLATE', 'INPUT', 'TEXTAREA',
  'SELECT', 'OPTION', 'IMG', 'IFRAME', 'OBJECT', 'EMBED', 'CANVAS', 'AUDIO', 'VIDEO']);

function expressionRecords(doc: Document, keys: ReadonlySet<string>): MathExpressionRecord[] {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="vs-math-expressions"]');
  if (!meta) return [];
  try {
    const raw: unknown = JSON.parse(meta.content);
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is MathExpressionRecord =>
      item !== null && typeof item === 'object' &&
      typeof item.key === 'string' && keys.has(item.key) &&
      typeof item.tex === 'string' && typeof item.display === 'boolean' &&
      item.key === JSON.stringify([item.display, item.tex]));
  } catch { return []; }
}

/** Copy text and safe inline semantics, then render copied math under the normal document budget. */
export async function copyRichContent(source: Element, dest: Element, options: { textLimit?: number } = {}): Promise<void> {
  const doc = dest.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const keys = new Set<string>();
  // The limit counts source-projection UTF-16 units. Math is indivisible: a
  // limit inside an expression retains its complete authored source.
  let remaining = options.textLimit === undefined ? Infinity
    : Number.isFinite(options.textLimit) ? Math.max(0, Math.floor(options.textLimit)) : 0;
  const copyChildren = (from: Node, into: Node): void => {
    for (const child of Array.from(from.childNodes)) {
      if (remaining <= 0) break;
      copyNode(child, into);
    }
  };
  const copyNode = (node: Node, into: Node): void => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').slice(0, remaining);
      into.appendChild(doc.createTextNode(text));
      remaining -= text.length;
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.namespaceURI !== HTML_NS || element.hasAttribute(DOM.attr.generated) ||
        element.hasAttribute('data-vs-math-native') || skippedTags.has(element.tagName)) return;
    const key = element.getAttribute('data-vs-math-key');
    const mathSource = key && element.classList.contains('vs-math')
      ? element.querySelector<HTMLElement>(':scope > .vs-math-source') : null;
    if (key && mathSource) {
      const wrapper = doc.createElement('span');
      wrapper.className = 'vs-math';
      wrapper.setAttribute('data-vs-math-key', key);
      const sourceSpan = doc.createElement('span');
      sourceSpan.className = 'vs-math-source';
      sourceSpan.textContent = mathSource.textContent;
      wrapper.append(sourceSpan);
      into.appendChild(wrapper);
      keys.add(key);
      remaining -= sourceSpan.textContent?.length ?? 0;
      return;
    }
    if (element.tagName === 'BR') { into.appendChild(doc.createElement('br')); return; }
    const tag = inlineTags.get(element.tagName);
    if (tag) {
      const wrapper = doc.createElement(tag);
      copyChildren(node, wrapper);
      into.appendChild(wrapper);
      return;
    }
    if (element.tagName === 'SPAN' && element.classList.contains('vs-strike')) {
      const wrapper = doc.createElement('span');
      wrapper.className = 'vs-strike';
      copyChildren(node, wrapper);
      into.appendChild(wrapper);
      return;
    }
    // Links, targets, buttons, unknown wrappers, and block structure do not
    // enter transient chrome. Keep their authored children in source order.
    copyChildren(node, into);
  };
  // The source itself may be a generated qualifications wrapper. Its authored
  // children are still eligible; generated descendants are excluded above.
  copyChildren(source, fragment);
  dest.replaceChildren(fragment);
  if (!keys.size) return;
  const workerSource = (globalThis as typeof globalThis & { __visserMathWorkerSource?: string }).__visserMathWorkerSource;
  const records = expressionRecords(doc, keys);
  if (typeof workerSource !== 'string' || !workerSource || !records.length) return;
  try {
    await initializeMath(dest, workerSource, records);
  } catch { /* The copied source remains readable. */ }
}
