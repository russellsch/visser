// Runtime mapping of drawn Mermaid elements to targets (§9.12). The SVGs below
// follow the element scheme that the spike observed for mermaid 12.0.0; the
// browser characterization test covers real renders.
// @ts-expect-error jsdom ships no type declarations, and @types/jsdom is not a dependency.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { attachTargets, findDrawn, isValidIntegrity, mermaidConfig, noticeText, renderIdFor } from '../../packages/runtime/src/mermaid.ts';

function dom(html: string): Document {
  return (new JSDOM(`<!doctype html><body>${html}</body>`) as { window: { document: Document } }).window.document;
}

const FLOW = renderIdFor('flow');
const FLOW_SVG = `<svg id="${FLOW}">
  <g id="${FLOW}-flowchart-Producer-0"></g>
  <g id="${FLOW}-flowchart-Queue-1"></g>
  <g id="${FLOW}-flowchart-Queue-extra-2"></g>
  <g id="${FLOW}-backend" class="cluster"></g>
  <path data-id="L_Producer_Queue_0" data-et="edge"></path>
  <g class="label" data-id="L_Producer_Queue_0"></g>
  <path data-id="e1" data-et="edge"></path>
</svg>`;

describe('Mermaid element mapping (§9.12)', () => {
  it('uses the fixed configuration: strict security and natural size for every diagram type', () => {
    const config = mermaidConfig();
    expect(config).toMatchObject({ startOnLoad: false, securityLevel: 'strict' });
    for (const key of ['flowchart', 'sequence', 'state', 'er', 'class', 'gantt', 'mindmap']) {
      expect(config[key]).toEqual({ useMaxWidth: false });
    }
  });

  it('derives render IDs that cannot clash with m-FIG, x-, v-, or l- ids', () => {
    expect(renderIdFor('flow')).toBe('m-flow-svg');
  });

  it('finds flowchart nodes by exact name, not by prefix', () => {
    const svg = dom(FLOW_SVG).querySelector('svg')!;
    expect(findDrawn(svg, FLOW, 'node:Queue').map((e) => e.id)).toEqual([`${FLOW}-flowchart-Queue-1`]);
    expect(findDrawn(svg, FLOW, 'node:Queue-extra').map((e) => e.id)).toEqual([`${FLOW}-flowchart-Queue-extra-2`]);
    expect(findDrawn(svg, FLOW, 'node:Missing')).toEqual([]);
  });

  it('finds subgraphs by cluster ID and edges by data-id, including their labels', () => {
    const svg = dom(FLOW_SVG).querySelector('svg')!;
    expect(findDrawn(svg, FLOW, 'group:backend')).toHaveLength(1);
    expect(findDrawn(svg, FLOW, 'edge:L_Producer_Queue_0')).toHaveLength(2);
    expect(findDrawn(svg, FLOW, 'edge:e1')).toHaveLength(1);
  });

  it('finds states by name and transitions by edge index', () => {
    const id = renderIdFor('fsm');
    const svg = dom(`<svg><g id="${id}-state-Idle-3"></g><g id="${id}-state-Open-4"></g><path data-id="edge0"></path><path data-id="edge1"></path></svg>`).querySelector('svg')!;
    expect(findDrawn(svg, id, 'state:Idle')).toHaveLength(1);
    expect(findDrawn(svg, id, 'transition:1').map((e) => e.getAttribute('data-id'))).toEqual(['edge1']);
  });

  it('finds participants by name and messages by raw record index', () => {
    const id = renderIdFor('seq');
    const svg = dom(`<svg>
      <g data-et="participant" data-id="api"></g><g data-et="participant" data-id="api"></g>
      <g data-et="life-line" data-id="api"></g>
      <line data-et="message" data-id="i1"></line><line data-et="message" data-id="i4"></line>
      <g data-et="note" data-id="i2"></g>
    </svg>`).querySelector('svg')!;
    expect(findDrawn(svg, id, 'participant:api')).toHaveLength(2);
    expect(findDrawn(svg, id, 'message:4')).toHaveLength(1);
    // A note shares the index space but is not a message.
    expect(findDrawn(svg, id, 'message:2')).toEqual([]);
  });

  it('copies target and relationship attributes from list instances onto the drawing', () => {
    const doc = dom(`<figure id="x-flow">
      ${FLOW_SVG}
      <a data-ex-target="producer" data-ex-mermaid-key="node:Producer">Producer</a>
      <a data-ex-target="flow" data-ex-rel="flow~producer~queue~0" data-ex-mermaid-key="edge:L_Producer_Queue_0">Producer to Queue</a>
      <a data-ex-target="gone" data-ex-mermaid-key="node:Gone">Gone</a>
    </figure>`);
    const figure = doc.querySelector('figure')!;
    const svg = figure.querySelector('svg')!;
    const missing = attachTargets(figure, svg, FLOW);
    expect(missing).toBe(1);
    const node = svg.querySelector(`#${FLOW}-flowchart-Producer-0`)!;
    expect(node.getAttribute('data-ex-target')).toBe('producer');
    expect(node.hasAttribute('data-ex-interactive')).toBe(true);
    // Drawn elements have no role, so an aria-label on them is prohibited (axe aria-prohibited-attr).
    expect(node.hasAttribute('aria-label')).toBe(false);
    for (const edge of Array.from(svg.querySelectorAll('[data-id="L_Producer_Queue_0"]'))) {
      expect(edge.getAttribute('data-ex-target')).toBe('flow');
      expect(edge.getAttribute('data-ex-rel')).toBe('flow~producer~queue~0');
      // A derived relationship has no ID of its own: it is not interactive.
      expect(edge.hasAttribute('data-ex-interactive')).toBe(false);
      expect(edge.hasAttribute('data-ex-mermaid-derived')).toBe(true);
    }
  });

  it('keeps an explicit edge ID interactive', () => {
    const doc = dom(`<figure id="x-flow">${FLOW_SVG}<a data-ex-target="e1" data-ex-rel="e1" data-ex-mermaid-key="edge:e1">e1</a></figure>`);
    const figure = doc.querySelector('figure')!;
    attachTargets(figure, figure.querySelector('svg')!, FLOW);
    const edge = figure.querySelector('[data-id="e1"]')!;
    expect(edge.hasAttribute('data-ex-interactive')).toBe(true);
    expect(edge.hasAttribute('data-ex-mermaid-derived')).toBe(false);
  });
});

describe('Mermaid loading and failure notices (§9.12)', () => {
  it('accepts only a sha384 integrity value (fail closed)', () => {
    expect(isValidIntegrity('sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC')).toBe(true);
    for (const bad of ['', 'sha256-abc', 'sha384-', 'sha384-not base64!', ' sha384-abc']) expect(isValidIntegrity(bad), bad).toBe(false);
  });

  it('describes the fallback that the figure actually has', () => {
    const doc = dom('<figure data-ex-mermaid="flowchart"></figure><figure data-ex-mermaid="other"></figure>');
    const [parsed, figureLevel] = Array.from(doc.querySelectorAll('figure'));
    expect(noticeText(parsed!)).toBe('This diagram could not be drawn. Its source and lists are shown instead.');
    expect(noticeText(figureLevel!)).toBe('This diagram could not be drawn. Its source is shown instead.');
  });
});
