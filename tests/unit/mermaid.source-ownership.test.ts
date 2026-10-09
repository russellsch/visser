import {expect,it} from 'vitest';
import {clearMermaidParseCache,parseMermaid,type MermaidMathSourceFamily,type ParseRequest} from '../../packages/core/src/mermaid/parse.ts';
import {flowchartMathSourceMap} from '../../packages/core/src/mermaid/flowchart-source-map.ts';
import {sequenceMathSourceMap} from '../../packages/core/src/mermaid/sequence-source-map.ts';
import {stateMathSourceMap} from '../../packages/core/src/mermaid/state-source-map.ts';
import {journeyMathSourceMap} from '../../packages/core/src/mermaid/journey-source-map.ts';
import {quadrantMathSourceMap} from '../../packages/core/src/mermaid/quadrant-source-map.ts';
import {xyMathSourceMap} from '../../packages/core/src/mermaid/xychart-source-map.ts';
import {sankeyMathSourceMap} from '../../packages/core/src/mermaid/sankey-source-map.ts';
import {radarMathSourceMap} from '../../packages/core/src/mermaid/radar-source-map.ts';
import {requirementMathSourceMap} from '../../packages/core/src/mermaid/requirement-source-map.ts';
import {pieMathSourceMap,timelineMathSourceMap} from '../../packages/core/src/mermaid/math-source-map.ts';
import type {MermaidFigure} from '../../packages/core/src/mermaid/types.ts';

type Case={family:MermaidMathSourceFamily;source:string;request:Omit<ParseRequest,'figureId'|'source'|'originalSource'>;payload:(result:any)=>any;map:(source:string,payload:any,bytes:Uint8Array)=>unknown};
const encoder=new TextEncoder(), figure=(source:string,property:string,payload:any):MermaidFigure=>({figureId:'ownership',diagramType:'other',declaredType:'other',parsed:false,source,elements:[],relationships:[],mathBodyStartByte:0,[property]:payload} as MermaidFigure);
const cases:Case[]=[
 {family:'flowchart',source:'flowchart LR\nA["$$x$$"]\nB["$$x$$"]\n',request:{type:'flowchart'},payload:r=>r.flowchartMath,map:(s,p,b)=>flowchartMathSourceMap({source:s,mathBodyStartByte:0,flowchartMath:p},b)},
 {family:'sequence',source:'sequenceDiagram\nA->>B: $$x$$\nB->>A: $$x$$\n',request:{type:'sequence'},payload:r=>r.sequenceMath,map:(s,p,b)=>sequenceMathSourceMap({source:s,mathBodyStartByte:0,sequenceMath:p},b)},
 {family:'state',source:'stateDiagram-v2\nA: $$x$$\nB: $$x$$\n',request:{type:'state'},payload:r=>r.stateMath,map:(s,p,b)=>stateMathSourceMap({source:s,mathBodyStartByte:0,stateMath:p},b)},
 {family:'journey',source:'journey\nsection A\n$$x$$: 1\nsection B\n$$x$$: 2\n',request:{type:'other',journey:true},payload:r=>r.journeyMath,map:(s,p,b)=>journeyMathSourceMap({source:s,mathBodyStartByte:0,journeyMath:p},b)},
 {family:'quadrant',source:'quadrantChart\ntitle $$x$$\nx-axis $$x$$ --> Right\ny-axis Bottom --> Top\nquadrant-1 A\nquadrant-2 B\nquadrant-3 C\nquadrant-4 D\n',request:{type:'other',quadrant:true},payload:r=>r.quadrantMath,map:(s,p,b)=>quadrantMathSourceMap({source:s,mathBodyStartByte:0,quadrantMath:p},b)},
 {family:'xy',source:'xychart\ntitle "$$x$$"\nx-axis "$$x$$" [1]\ny-axis "Y" 0 --> 1\nline [1]\n',request:{type:'other',xy:true},payload:r=>r.xyMath,map:(s,p,b)=>xyMathSourceMap({source:s,mathBodyStartByte:0,xyMath:p},b)},
 {family:'sankey',source:'sankey\n"$$x$$","$$x$$",1\n',request:{type:'other',sankey:true},payload:r=>r.sankeyMath,map:(s,p,b)=>sankeyMathSourceMap({source:s,mathBodyStartByte:0,sankeyMath:p},b)},
 {family:'radar',source:'radar-beta\ntitle $$x$$\naxis dup["$$x$$"],plain\ncurve same{dup: 1, plain: 2}\n',request:{type:'other',radar:true},payload:r=>r.radarMath,map:(s,p,b)=>radarMathSourceMap({source:s,mathBodyStartByte:0,radarMath:p},b)},
 {family:'requirement',source:'requirementDiagram\nrequirement r {\n id: "$$x$$"\n text: "$$x$$"\n risk: high\n verifyMethod: inspection\n}\n',request:{type:'other',requirement:true},payload:r=>r.requirementMath,map:(s,p,b)=>requirementMathSourceMap({source:s,mathBodyStartByte:0,requirementMath:p},b)},
 {family:'pie',source:'pie\ntitle $$x$$\n"$$x$$": 1\n',request:{type:'other',pie:true},payload:r=>r.pieMath.records,map:(s,p,b)=>pieMathSourceMap(figure(s,'mathLabels',p),b)},
 {family:'timeline',source:'timeline\ntitle $$x$$\nsection A\nTask $$x$$\n',request:{type:'other',timeline:true},payload:r=>r.timelineMath.records,map:(s,p,b)=>timelineMathSourceMap(figure(s,'timelineMathLabels',p),b)},
];

type Origin={rawSource:string;startByte:number;endByte:number;sourceStart?:number;sourceEnd?:number};
function walk(value:any,visit:(value:any)=>void,seen=new Set<any>()):void {if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);visit(value);for(const child of Array.isArray(value)?value:Object.values(value))walk(child,visit,seen);}
function mathOrigins(payload:any):Origin[]{const all:Origin[]=[];walk(payload,value=>{if(value.rawSource==='$$x$$'&&Number.isSafeInteger(value.startByte)&&Number.isSafeInteger(value.endByte))all.push(value);});return all;}
function swapCoordinates(payload:any,original:string):void {const before=JSON.stringify(payload),matches=mathOrigins(payload),unique=[...new Map(matches.map(origin=>[`${origin.startByte}:${origin.endByte}`,origin])).values()];expect(unique.length).toBeGreaterThanOrEqual(2);const [first,second]=unique;for(const origin of unique){const start=origin.sourceStart??origin.startByte,end=origin.sourceEnd??origin.endByte;expect(original.slice(start,end)).toBe('$$x$$');}
 const left={startByte:first!.startByte,endByte:first!.endByte,sourceStart:first!.sourceStart,sourceEnd:first!.sourceEnd},right={startByte:second!.startByte,endByte:second!.endByte,sourceStart:second!.sourceStart,sourceEnd:second!.sourceEnd};
 for(const origin of matches){const key=`${origin.startByte}:${origin.endByte}`,replacement=key===`${left.startByte}:${left.endByte}`?right:key===`${right.startByte}:${right.endByte}`?left:undefined;if(!replacement)continue;origin.startByte=replacement.startByte;origin.endByte=replacement.endByte;if('sourceStart'in origin)origin.sourceStart=replacement.sourceStart;if('sourceEnd'in origin)origin.sourceEnd=replacement.sourceEnd;}expect(JSON.stringify(payload)).not.toBe(before);for(const origin of matches){const start=origin.sourceStart??origin.startByte,end=origin.sourceEnd??origin.endByte;expect(original.slice(start,end)).toBe('$$x$$');}
}

for(const spec of cases)it(`${spec.family} rejects equal-byte source-coordinate exchanges while accepting detached worker output`,()=>{
 clearMermaidParseCache();const request:ParseRequest={figureId:`${spec.family}-ownership`,source:spec.source,originalSource:spec.source,...spec.request};const result:any=parseMermaid([request]).get(request.figureId);expect(result).toMatchObject({ok:true});const trusted=spec.payload(result);expect(trusted).toBeDefined();const bytes=encoder.encode(spec.source),clone=structuredClone(trusted);
 expect(()=>spec.map(spec.source,clone,bytes)).not.toThrow();const exchanged=structuredClone(clone);swapCoordinates(exchanged,spec.source);expect(()=>spec.map(spec.source,exchanged,bytes)).toThrow(/authenticated source ownership|transport differs/i);
 const cached:any=parseMermaid([request]).get(request.figureId),cachedPayload=spec.payload(cached);expect(cachedPayload).not.toBe(trusted);expect(cachedPayload).toEqual(trusted);swapCoordinates(cachedPayload,spec.source);expect(()=>spec.map(spec.source,cachedPayload,bytes)).toThrow(/authenticated source ownership|transport differs/i);const pristine:any=spec.payload(parseMermaid([request]).get(request.figureId));expect(pristine).not.toBe(cachedPayload);expect(pristine).toEqual(clone);
 clearMermaidParseCache();expect(()=>spec.map(spec.source,clone,bytes)).not.toThrow();const changed=spec.source.replace('$$x$$','$$y$$');expect(()=>spec.map(changed,clone,encoder.encode(changed))).toThrow(/authenticated|source|transport/i);
});

for(const spec of cases)it(`${spec.family} restores source transport after callers delete fresh and cached result fields`,()=>{
 clearMermaidParseCache();const request:ParseRequest={figureId:`${spec.family}-deletion`,source:spec.source,originalSource:spec.source,...spec.request},key=spec.family==='pie'?'pieMath':spec.family==='timeline'?'timelineMath':`${spec.family}Math`,bytes=encoder.encode(spec.source);const fresh:any=parseMermaid([request]).get(request.figureId),expected=structuredClone(spec.payload(fresh));expect(expected).toBeDefined();delete fresh[key];const restoredFromFresh:any=parseMermaid([request]).get(request.figureId);expect(spec.payload(restoredFromFresh)).toEqual(expected);expect(()=>spec.map(spec.source,spec.payload(restoredFromFresh),bytes)).not.toThrow();delete restoredFromFresh[key];const restoredFromCache:any=parseMermaid([request]).get(request.figureId);expect(spec.payload(restoredFromCache)).toEqual(expected);expect(()=>spec.map(spec.source,spec.payload(restoredFromCache),bytes)).not.toThrow();
});

for (const spec of cases.filter(spec => spec.family === 'pie' || spec.family === 'timeline')) {
 it(`${spec.family} rejects explicit empty records stripped from an authenticated payload`, () => {
  const request: ParseRequest = {figureId: `${spec.family}-stripped`, source: spec.source, originalSource: spec.source, ...spec.request};
  const result: any = parseMermaid([request]).get(request.figureId);
  expect(result).toMatchObject({ok: true});
  expect(spec.payload(result).length).toBeGreaterThan(0);
  expect(() => spec.map(spec.source, [], encoder.encode(spec.source))).toThrow(/authenticated source ownership/);
 });
}
