import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {extractRadarMath,LocatedRadarMathError} from '../../packages/core/src/mermaid/radar-math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';
const original=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{const instance=DOMPurify(new JSDOM('').window);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(original[key])Object.defineProperty(DOMPurify,key,original[key]!);else Reflect.deleteProperty(DOMPurify,key);});

it('validates overwritten metadata and hidden legends while preserving converted TeX origins',async()=>{
 const source=String.raw`radar-beta
title $$old$$
title $$title$$
accTitle: $$accessible$$
axis a["$$\\frac{a}{b}$$"],b
curve c["$$legend$$"]{1,2}
showLegend false
`;
 const result=await extractRadarMath(source);expect(result.total.occurrences).toBe(5);
 expect(result.labels.records.filter(r=>r.role==='title').map(r=>r.active)).toEqual([false,true]);
 const part=result.records.find(r=>r.role==='axis.label')!.parts.find(p=>p.kind==='math')!;
 expect(part.tex).toBe(String.raw`\frac{a}{b}`);expect(part.origins.map(o=>o.rawSource).join('')).toBe(String.raw`$$\\frac{a}{b}$$`);
});

it('matches native common sanitation but leaves axis and curve SVG text literal',async()=>{
 const source='radar-beta\ntitle $$a < b$$<br/>\naccTitle: $$z$$\naccDescr: $$d$$\naxis a["$$a < b$$<br/>"],b\ncurve c["&dollar;&dollar;literal&dollar;&dollar;<br/>"]{1,2}\n';
 const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});const diagram=await mermaid.mermaidAPI.getDiagramFromText(source),db=diagram.db as any;
 try{
  const result=await extractRadarMath(source),byRole=(role:string)=>result.records.find(r=>r.role===role)!;
  expect(byRole('title').dbValue).toBe(db.getDiagramTitle());expect(byRole('accTitle').dbValue).toBe(db.getAccTitle());expect(byRole('accDescr').dbValue).toBe(db.getAccDescription());
  expect(byRole('axis.label').dbValue).toBe(db.getAxes()[0].label);expect(byRole('curve.label').dbValue).toBe(db.getCurves()[0].label);
  expect(byRole('title').parts.find(p=>p.kind==='math')?.tex).toBe('a < b');expect(byRole('axis.label').parts.find(p=>p.kind==='math')?.tex).toBe('a < b');expect(byRole('curve.label').parts.every(p=>p.kind==='text')).toBe(true);
 }finally{db.clear();}
});

it('rejects invalid overwritten/hidden formulas and break-joined math with located errors',async()=>{
 for(const source of [String.raw`radar-beta
title $$\unknownRadar$$
title fine
`,String.raw`radar-beta
axis a
curve c["$$\\unknownRadar$$"]{1}
showLegend false
`,'radar-beta\naxis a["$$a<br/>b$$"]\n']){
  try{await extractRadarMath(source);throw new Error('unexpected success');}catch(error){expect(error).toBeInstanceOf(LocatedRadarMathError);const located=error as LocatedRadarMathError;expect(located.startLine).toBeGreaterThan(1);expect(located.startByte).toBeGreaterThan(0);}
 }
});

it('charges all authored formulas against incoming document budgets',async()=>{
 const source='radar-beta\ntitle $$first$$\ntitle $$second$$\n';
 await expect(extractRadarMath(source,{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-1})).rejects.toThrow(/budget/i);
});
