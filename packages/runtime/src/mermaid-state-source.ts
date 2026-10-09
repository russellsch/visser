// Pinned native state DOM ownership. Equal visible equations never identify a
// source field: native DOM IDs, edge IDs and title/body child order do.
export type StateMathDomSlot = Readonly<{
  key:string; ownerKind:'node'|'edge'; ownerId:string; domId?:string;
  shape:string; role:'label'|'title'|'body'; inputPath:string; formulas:readonly string[];
}>;
const SVG='http://www.w3.org/2000/svg';
const LABEL='data-vs-mermaid-label';
const FORMULA='data-vs-mermaid-formula';
const group=(element:Element):boolean=>element.namespaceURI===SVG && element.localName==='g';
const foreign=(element:Element):boolean=>element.namespaceURI===SVG && element.localName==='foreignObject';
const invalid=(message:string):never=>{throw new Error(`State math source: ${message}`);};

export function stampStateMathLabels(drawn:SVGElement,renderId:string,slots:readonly StateMathDomSlot[]):void {
  if(!renderId || !Array.isArray(slots)) invalid('invalid binding request');
  const groups=[...drawn.querySelectorAll('g')].filter(group);
  const keys=new Set<string>(), claimed=new Set<Element>();
  const pending:Array<{element:Element;key:string;prior:string|null}>=[];
  let total=0;
  for(const slot of slots) {
    if(!slot || typeof slot.ownerId!=='string' || !slot.ownerId || slot.key!==JSON.stringify([slot.ownerKind,slot.ownerId,slot.role]) ||
        keys.has(slot.key) || !Array.isArray(slot.formulas) || !slot.formulas.length || !slot.formulas.every(tex=>typeof tex==='string')) invalid('invalid or duplicate slot');
    keys.add(slot.key);
    let labels:Element[];
    let index=0, count=1;
    if(slot.ownerKind==='node') {
      if(typeof slot.domId!=='string' || !slot.domId) invalid('missing native DOM identity');
      if(slot.shape==='rectWithTitle') {
        if(!['title','body'].includes(slot.role) || slot.inputPath!=='createLabel') invalid('invalid title/body slot');
        index=slot.role==='body'?1:0;count=2;
      } else if(!['rect','note'].includes(slot.shape) || slot.role!=='label' || slot.inputPath!=='labelHelper') invalid('invalid node slot');
      const owners=groups.filter(g=>g.id===`${renderId}-${slot.domId}`);
      if(owners.length!==1) invalid('missing or ambiguous native node');
      labels=[...owners[0]!.children].filter(child=>group(child)&&child.classList.contains('label'));
    } else if(slot.ownerKind==='edge') {
      if(slot.shape!=='edge' || slot.role!=='label' || slot.inputPath!=='edge' || slot.domId!==undefined) invalid('invalid edge slot');
      labels=groups.filter(g=>g.getAttribute('data-id')===slot.ownerId && g.classList.contains('label') &&
        g.parentElement && group(g.parentElement) && g.parentElement.classList.contains('edgeLabel'));
    } else return invalid('unknown owner kind');
    if(labels.length!==1) invalid('missing or ambiguous label group');
    const children=[...labels[0]!.children].filter(foreign);
    if(children.length!==count) invalid('native label structure differs');
    const element=children[index]!;
    if(claimed.has(element)) invalid('label has multiple owners');
    claimed.add(element);
    const formulas=[...element.querySelectorAll(`[${FORMULA}]`)];
    if(formulas.length!==slot.formulas.length || formulas.some((formula,i)=>formula.namespaceURI!=='http://www.w3.org/1998/Math/MathML' ||
      formula.localName!=='math' || formula.getAttribute(FORMULA)!==slot.formulas[i] || formula.closest('foreignObject')!==element)) invalid('formula attestations differ');
    total+=formulas.length;
    const prior=element.getAttribute(LABEL);
    if(prior!==null && prior!==slot.key) invalid('stale ownership');
    pending.push({element,key:slot.key,prior});
  }
  if(drawn.querySelectorAll(`[${FORMULA}]`).length!==total) invalid('unclaimed equation');
  try {for(const {element,key} of pending) element.setAttribute(LABEL,key);}
  catch(error) {
    for(const {element,prior} of pending) if(prior===null) element.removeAttribute(LABEL);else element.setAttribute(LABEL,prior);
    throw error;
  }
}
