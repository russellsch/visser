// Native Mermaid strict-mode HTML normalization with independently attested
// provenance. This helper is Node-only; it never installs browser globals.
import { traceMermaidHtmlPass } from './html-provenance.ts';
import { ProvenanceText } from './source-provenance.ts';

type Purifier = {
  sanitize(value: string, options?: { FORBID_TAGS: string[] }): string;
  addHook(name: string, hook: (node: Element) => void): void;
};
let purifier: Purifier | undefined;
let preparing: Promise<void> | undefined;

/** Prepare only when a field may need HTML parsing; plain text stays cheap. */
export async function prepareSequenceSanitizer(): Promise<void> {
  if (purifier) return;
  if (!preparing) preparing = (async () => {
    const [{ JSDOM }, { default: createPurifier }] = await Promise.all([
      // @ts-expect-error jsdom does not ship declarations.
      import('jsdom'),
      // Use the real pinned UMD entry, not Mermaid's Node-only identity stub.
      // @ts-expect-error this public UMD entry does not ship declarations.
      import('dompurify/purify.js'),
    ]);
    const dom = new JSDOM('', { url: 'about:blank' });
    // No scripts or resources are enabled. These APIs are not needed by the
    // sanitizer and must not become a side channel through future changes.
    dom.window.XMLHttpRequest = class { constructor() { throw new Error('Sanitizer network access is disabled'); } };
    dom.window.WebSocket = class { constructor() { throw new Error('Sanitizer network access is disabled'); } };
    const instance = createPurifier(dom.window) as Purifier;
    // Same two hooks as the pinned Mermaid common sanitizer.
    const temporary = 'data-temp-href-target';
    instance.addHook('beforeSanitizeAttributes', node => {
      if (node.tagName === 'A' && node.hasAttribute('target')) node.setAttribute(temporary, node.getAttribute('target') ?? '');
    });
    instance.addHook('afterSanitizeAttributes', node => {
      if (node.tagName === 'A' && node.hasAttribute(temporary)) {
        node.setAttribute('target', node.getAttribute(temporary) ?? '');
        node.removeAttribute(temporary);
        if (node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener');
      }
    });
    purifier = instance;
  })().catch(error => { preparing = undefined; throw error; });
  await preparing;
}

/** Match pinned sanitizeText under strict, default htmlLabels configuration. */
export function sanitizeSequenceField(input: ProvenanceText): ProvenanceText {
  if (!input.text.includes('<')) return input;
  if (!purifier) throw new Error('Sequence sanitizer was not prepared');
  const first = traceMermaidHtmlPass(input, purifier.sanitize(input.text));
  return traceMermaidHtmlPass(first, purifier.sanitize(first.text, { FORBID_TAGS: ['style'] }));
}

/** Same native result without allocating a provenance trace for DB comparison. */
export function sanitizeSequenceText(text: string): string {
  if (!text.includes('<')) return text;
  if (!purifier) throw new Error('Sequence sanitizer was not prepared');
  return purifier.sanitize(purifier.sanitize(text), { FORBID_TAGS: ['style'] });
}

/** One native DOMPurify pass for synchronous state-DB calls in the worker. */
export function sanitizeMermaidHtmlPass(text: string, options?: { FORBID_TAGS: string[] }): string {
  if (!purifier) throw new Error('Mermaid sanitizer was not prepared');
  return purifier.sanitize(text, options);
}
