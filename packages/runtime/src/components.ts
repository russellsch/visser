// Authored steps remain in document flow. Preserve native tree defaults.
import { DOM } from '../../core/src/compiler/dom-contract.ts';

function initTreeDefaults(): void {
  const expand = document.getElementById(DOM.buttons.expand);
  if (!expand) return;
  expand.addEventListener('click', () => {
    if (expand.getAttribute('aria-pressed') === 'true') return;
    for (const d of Array.from(document.querySelectorAll<HTMLDetailsElement>('details.vs-tree-open'))) d.open = true;
  });
}

export function initComponents(): void {
  // Authored steps remain a readable list; no generated tour controls.
  initTreeDefaults();
}
