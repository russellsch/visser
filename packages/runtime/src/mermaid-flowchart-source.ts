// Bind proven flowchart DB slots to the pinned Mermaid 12 native SVG owners.
// Resolve by renderer identity and structure, never by displayed text: labels
// can repeat, contain decoded entities, or be hidden by collapsed groups.

export type FlowchartMathSlot = Readonly<{
  key: string; kind: 'node' | 'edge' | 'subgraph'; id: string;
}>;

const SVG = 'http://www.w3.org/2000/svg';
const ATTR = 'data-vs-mermaid-label';

function isGroup(element: Element): element is SVGGElement {
  return element.namespaceURI === SVG && element.localName === 'g';
}

function directForeign(label: SVGGElement, className: string): SVGForeignObjectElement {
  const foreign = Array.from(label.children).filter(child =>
    child.namespaceURI === SVG && child.localName === 'foreignObject');
  if (foreign.length !== 1) throw new Error(`Flowchart ${className} foreignObject is missing or ambiguous`);
  return foreign[0] as SVGForeignObjectElement;
}

function directLabel(owner: SVGGElement, className: string): SVGForeignObjectElement {
  const labels = Array.from(owner.children).filter(child =>
    isGroup(child) && child.classList.contains(className));
  if (labels.length !== 1) throw new Error(`Flowchart ${className} label is missing or ambiguous`);
  return directForeign(labels[0] as SVGGElement, className);
}

function swimlaneEdgeLabel(owner: SVGGElement): SVGForeignObjectElement {
  const labels=Array.from(owner.children).filter(child=>
    isGroup(child)&&child.classList.contains('label'));
  if(labels.length!==1)throw new Error('Flowchart swimlane edge label is missing or ambiguous');
  return directForeign(labels[0] as SVGGElement,'edge');
}

/**
 * Stamp exact native label owners after render and before source binding.
 * The pinned renderer gives nodes `${renderId}-flowchart-${id}-N`, clusters
 * `${renderId}-${id}`, and labels (not just paths) the DB edge data-id.
 * Every slot is resolved and checked before one attribute is written.
 */
export function stampFlowchartMathLabels(
  drawn: SVGElement, renderId: string, slots: readonly FlowchartMathSlot[],
): void {
  if (!renderId || !Array.isArray(slots)) throw new Error('Invalid flowchart label binding request');
  const groups = Array.from(drawn.querySelectorAll('g')).filter(isGroup);
  const keys = new Set<string>();
  const claimed = new Set<SVGForeignObjectElement>();
  const pending: Array<{ element: SVGForeignObjectElement; key: string; prior: string | null }> = [];
  for (const slot of slots) {
    if (!slot || typeof slot.key !== 'string' || !slot.key || typeof slot.id !== 'string' || !slot.id ||
        !['node', 'edge', 'subgraph'].includes(slot.kind) || keys.has(slot.key)) {
      throw new Error('Invalid or duplicate flowchart label slot');
    }
    keys.add(slot.key);
    let owners: SVGGElement[];
    if (slot.kind === 'node') {
      const family = drawn.getAttribute('aria-roledescription') === 'agentflow' ? 'agentflow' : 'flowchart';
      const prefix = `${renderId}-${family}-${slot.id}-`;
      owners = groups.filter(group =>
        (group.classList.contains('node') || group.classList.contains('icon-shape')) &&
        group.id.startsWith(prefix) &&
        /^\d+$/.test(group.id.slice(prefix.length)));
    } else if (slot.kind === 'subgraph') {
      const identity = `${renderId}-${slot.id}`;
      // Swimlane's renderer deliberately uses the unprefixed layout ID for
      // lane clusters. Ordinary expanded subgraphs use the render-prefixed
      // ID and collapsed ones are native nodes.
      owners = groups.filter(group => group.id === identity &&
        (group.classList.contains('cluster') || group.classList.contains('node')));
      if (owners.length === 0) owners = groups.filter(group => group.id === slot.id &&
        group.classList.contains('cluster') && group.classList.contains('swimlane'));
    } else {
      owners = groups.filter(group => group.getAttribute('data-id') === slot.id &&
        group.classList.contains('label') && isGroup(group.parentElement!) &&
        group.parentElement.classList.contains('edgeLabel'));
      // Swimlane moves labels under its node layer. The pinned adapter carries
      // the exact native edge ID; suffix matching is ambiguous for IDs such
      // as `foo` and `bar-foo`.
      if (owners.length === 0) owners = groups.filter(group =>
        group.classList.contains('label') && group.classList.contains('edgeLabel') &&
        group.getAttribute('data-vs-native-edge-id') === slot.id);
    }
    if (owners.length !== 1) throw new Error(`Flowchart ${slot.kind} ${slot.id} owner is missing or ambiguous`);
    const owner = owners[0]!;
    const element = slot.kind === 'edge' ? (owner.getAttribute('data-id')===slot.id
      ?directForeign(owner, 'edge'):swimlaneEdgeLabel(owner)) :
      directLabel(owner, slot.kind === 'subgraph' && owner.classList.contains('cluster')
        ? 'cluster-label' : 'label');
    if (claimed.has(element)) throw new Error('Flowchart label is claimed by multiple slots');
    claimed.add(element);
    const prior = element.getAttribute(ATTR);
    if (prior !== null && prior !== slot.key) throw new Error('Flowchart label has stale ownership');
    pending.push({ element, key: slot.key, prior });
  }
  try {
    for (const { element, key } of pending) element.setAttribute(ATTR, key);
  } catch (error) {
    for (const { element, prior } of pending) {
      if (prior === null) element.removeAttribute(ATTR);
      else element.setAttribute(ATTR, prior);
    }
    throw error;
  }
}
