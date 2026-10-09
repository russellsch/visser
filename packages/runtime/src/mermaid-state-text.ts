import { sequenceSanitizedMathText } from '../../core/src/mermaid/sequence-text.ts';

// Scope normalization to the actual SVG selected by the native state renderer.
// Authored IDs/classes/attributes cannot opt another diagram into this behavior.
const activeRoots = new WeakSet<Element>();
export async function withStateMathRoot<T>(root: Element, render: () => Promise<T>): Promise<T> {
  if (root.namespaceURI !== 'http://www.w3.org/2000/svg' || root.localName !== 'svg' || activeRoots.has(root)) {
    throw new Error('Invalid or overlapping state math rendering root');
  }
  activeRoots.add(root);
  try { return await render(); }
  finally { activeRoots.delete(root); }
}

export function stateMathText(element: Element, text: string): string {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (activeRoots.has(current)) return sequenceSanitizedMathText(text);
  }
  return text;
}
