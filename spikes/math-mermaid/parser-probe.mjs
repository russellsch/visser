// W0 probe: public Mermaid API DBs versus @mermaid-js/parser AST locations.
// Run: node spikes/math-mermaid/parser-probe.mjs
import { registerHooks } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
registerHooks({resolve(specifier,context,next) {
  if (specifier === 'dompurify') return {url:new URL('../../packages/core/src/mermaid/dompurify-stub.ts',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
const {default:mermaid} = await import('mermaid');
const {parse:parseAst} = await import('@mermaid-js/parser');
mermaid.initialize({startOnLoad:false,securityLevel:'strict'});
const samples = {
  flowchart: 'flowchart LR\n A["$$x^2$$"] -->|"$$y^2$$"| B',
  state: 'stateDiagram-v2\n A: $$x^2$$\n A --> B: $$y^2$$',
  sequence: 'sequenceDiagram\n participant A as $$x^2$$\n Note over A: $$y^2$$\n A->>B: $$z^2$$',
  er: 'erDiagram\n A ||--o{ B : "$$x^2$$"',
  class: 'classDiagram\n class A {\n +$$x^2$$\n }',
  pie: 'pie\n "$$x^2$$" : 1\n "Other" : 2',
  mindmap: 'mindmap\n root((Root))\n   Child["$$x^2$$"]',
};
const out = {};
for (const [name,source] of Object.entries(samples)) {
  const item = {source};
  try {
    const d = await mermaid.mermaidAPI.getDiagramFromText(source);
    item.diagramType = d.type;
    item.dbKeys = Object.keys(d.db).filter(k=>typeof d.db[k]==='function').slice(0,60);
    item.title=d.db.getDiagramTitle?.();
    item.accTitle=d.db.getAccTitle?.();
    if (d.db.getActors) item.actors=[...d.db.getActors().values()].map(a=>({name:a.name,description:a.description}));
    if (d.db.getMessages) item.messages=d.db.getMessages().map(m=>({message:m.message,type:m.type}));
    if (d.db.getSections) item.sections=Object.entries(d.db.getSections()).slice(0,20);
    if (d.db.getData) {
      const data=d.db.getData();
      item.dataTopKeys = data && typeof data==='object' ? Object.keys(data).slice(0,40):[];
      item.dataJson=JSON.stringify(data, (_k,v)=>_k.startsWith('$')?undefined:v)?.slice(0,1500);
    }
    if (d.db.getVertices) item.vertices=[...d.db.getVertices().values()].map(v=>({id:v.id,text:v.text,keys:Object.keys(v)}));
    if (d.db.getEdges) item.edges=d.db.getEdges().map(e=>({text:e.text,keys:Object.keys(e)}));
  } catch(e) {item.mermaidError=String(e).slice(0,250);}
  if (name==='pie') {
    try {
      const ast=await parseAst('pie',source);
      item.astKeys=Object.keys(ast);
      item.astRange=ast.$cstNode?.range;
      item.astJson=JSON.stringify(ast,(_k,v)=>_k.startsWith('$')?undefined:v).slice(0,1700);
      item.astChildren=Object.entries(ast).filter(([k,v])=>Array.isArray(v)).map(([k,v])=>[k,v.map(x=>({type:x?.$type,keys:Object.keys(x??{}).filter(k=>!k.startsWith('$')),range:x?.$cstNode?.range,text:x?.$cstNode?.text?.slice(0,100)}))]);
      item.firstSectionCstKeys=Object.keys(ast.sections[0]?.$cstNode??{});
      item.firstSectionCstChildren=(ast.sections[0]?.$cstNode?.content??[]).map(x=>({text:x.text,range:x.range,offset:x.offset,end:x.end,grammar:x.grammarSource?.name}));
    } catch(e) {item.astError=String(e).slice(0,250);}
  }
  out[name]=item;
}
mkdirSync(join(here,'results'),{recursive:true});
writeFileSync(join(here,'results/parser.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k,v])=>[k,{type:v.diagramType,dbKeys:v.dbKeys?.length,dataKeys:v.dataTopKeys,astRange:v.astRange,astError:v.astError,mermaidError:v.mermaidError}])),null,2));
