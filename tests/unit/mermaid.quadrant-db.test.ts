import { execFileSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect,it } from 'vitest';

it('reconciles actual native snapshots, exact point owners and mutation rejection',()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-quadrant-db-'));
 const url=(p:string)=>pathToFileURL(resolve(p)).href;
 const source='quadrantChart\ntitle old $$old$$\ntitle $$x < y$$\naccTitle: $$a$$\nx-axis low --> high\nx-axis $$left$$ -->\nquadrant-1 "before<br/>&dollar;&dollar;q&dollar;&dollar;"\nclassDef hot color:#ff0000\nclassDef hot color:#00ff00\n"$$same$$":::hot: [0.1, 0.2] radius:7\n"$$same$$":::hot: [0.1, 0.2]\n';
 const script=`
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {quadrantSnapshotLoadHook} from ${JSON.stringify(url('scripts/mermaid-quadrant-snapshot.mjs'))};
registerHooks({load:quadrantSnapshotLoadHook()});
const {default:DP}=await import(${JSON.stringify(url('node_modules/dompurify/dist/purify.es.mjs'))});
const {JSDOM}=await import(${JSON.stringify(url('node_modules/jsdom/lib/api.js'))});
const purifier=DP(new JSDOM('').window);Object.assign(DP,{sanitize:purifier.sanitize,addHook:purifier.addHook});
const {extractQuadrantMath}=await import(${JSON.stringify(url('packages/core/src/mermaid/quadrant-math.ts'))});
const {reconcileQuadrantDb}=await import(${JSON.stringify(url('packages/core/src/mermaid/quadrant-db.ts'))});
const {diagram,getVisserQuadrantSnapshot:snapshot}=await import(${JSON.stringify(url('node_modules/mermaid/dist/chunks/mermaid.core/quadrantDiagram-O4NWA36T.mjs'))});
const db=diagram.db;
const parse=source=>{db.clear();const parser=new diagram.parser.parser.Parser();parser.yy=db;parser.parse(source);};
const source=${JSON.stringify(source)},math=await extractQuadrantMath(source);
parse(source);const native=snapshot(),plan=reconcileQuadrantDb(math,native,db.parseStyles);
assert.deepEqual(plan.candidates.filter(s=>s.role==='point').map(s=>s.recordIndex),math.labels.points.map(p=>p.recordIndex).reverse());
assert.equal(plan.snapshot.data.xAxisRightText,'high');
assert.equal(plan.snapshot.data.xAxisLeftText,'$$left$$ ⟶');
assert.deepEqual(plan.snapshot.classes,[['hot',{color:'#00ff00'}]]);
assert.equal(plan.snapshot.data.points[1].radius,7);
const built=db.getQuadrantData();assert.equal(built.points[1].radius,7);assert.equal(built.points[0].fill,'#00ff00');
for(const mutate of [s=>s.title='changed',s=>s.data.points.reverse(),s=>s.classes[0][1].color='changed',s=>s.data.points.pop(),s=>s.data.xAxisRightText='']) {
 const bad=structuredClone(native);mutate(bad);assert.throws(()=>reconcileQuadrantDb(math,bad,db.parseStyles));
}
const badMath={...math,labels:{...math.labels,points:math.labels.points.map(p=>({...p,recordIndex:math.labels.points[0].recordIndex}))}};
assert.throws(()=>reconcileQuadrantDb(badMath,native,db.parseStyles),/point ownership/);
const detached=structuredClone(plan.snapshot);db.clear();assert.deepEqual(plan.snapshot,detached);
const malformed='quadrantChart\\npoint: [0a2, 0.3]\\n';parse(malformed);
const malformedMath=await extractQuadrantMath(malformed);
assert.throws(()=>reconcileQuadrantDb(malformedMath,snapshot(),db.parseStyles),/finite normalized layout/);
assert.throws(()=>parse('quadrantChart\\npoint: [2, 3]\\n'));
parse('quadrantChart\\nquadrant-1 recovered\\n');
const recovered=reconcileQuadrantDb(await extractQuadrantMath('quadrantChart\\nquadrant-1 recovered\\n'),snapshot(),db.parseStyles);
assert.deepEqual(recovered.snapshot.data.points,[]);
console.log(JSON.stringify({slots:plan.candidates.length,recovered:recovered.snapshot.data.quadrant1Text}));
`;
 try {
  const file=join(dir,'verify.mjs');writeFileSync(file,script);
  const result=JSON.parse(execFileSync(process.execPath,[file],{encoding:'utf8'}));
  expect(result).toEqual({slots:6,recovered:'recovered'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
