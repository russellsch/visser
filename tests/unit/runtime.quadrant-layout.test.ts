import {expect,it} from 'vitest';
import {layoutQuadrantMath,type QuadrantSize} from '../../packages/runtime/src/mermaid-quadrant-layout.ts';
const labels=new Map<string,QuadrantSize>(['title','quadrant1','quadrant2','quadrant3','quadrant4','xLeft','xRight','yBottom','yTop',...Array.from({length:6},(_,i)=>`point:${i}`)].map((key,i)=>[key,{width:80+i*10,height:20+i*3}]));
const points=[{index:0,x:0,y:0,radius:12},{index:1,x:1,y:1,radius:5},{index:2,x:0.5,y:0.5,radius:8},{index:3,x:0.5,y:0.5,radius:8},{index:4,x:0,y:1,radius:10},{index:5,x:1,y:0,radius:20}];
const run=()=>layoutQuadrantMath({labels,points,minWidth:500,minHeight:500,gap:10,margin:10,maxDimension:100000});
it('preserves exact normalized coordinates, native order and coincident identities',()=>{
 const result=run();expect(result.points.map(p=>p.index)).toEqual(points.map(p=>p.index));
 for(const [i,p]of result.points.entries()){
  expect(p.x).toBe(result.plot.x+points[i]!.x*result.plot.width);expect(p.y).toBe(result.plot.y+(1-points[i]!.y)*result.plot.height);
  expect(p.leader[0]).toEqual([p.x,p.y]);
  const label=result.labels.find(l=>l.key===`point:${p.index}`)!;
  expect(p.leader.at(-1)![1]).toBe(label.y+label.height/2);
  expect([label.x,label.x+label.width]).toContain(p.leader.at(-1)![0]);
 }
 expect(result.points[2]!.x).toBe(result.points[3]!.x);expect(result.points[2]!.y).toBe(result.points[3]!.y);
});
it('keeps every measured label disjoint and all ink/markers within bounds',()=>{
 const result=run();
 for(const a of result.labels){
  expect(a.x).toBeGreaterThanOrEqual(0);expect(a.y).toBeGreaterThanOrEqual(0);
  expect(a.x+a.width).toBeLessThanOrEqual(result.width);expect(a.y+a.height).toBeLessThanOrEqual(result.height);
  for(const b of result.labels)if(a!==b)expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);
  for(const p of result.points)expect(a.x+a.width<=p.x-p.radius||a.x>=p.x+p.radius||a.y+a.height<=p.y-p.radius||a.y>=p.y+p.radius).toBe(true);
 }
 for(const p of result.points){expect(p.x-p.radius).toBeGreaterThanOrEqual(0);expect(p.x+p.radius).toBeLessThanOrEqual(result.width);expect(p.y-p.radius).toBeGreaterThanOrEqual(0);expect(p.y+p.radius).toBeLessThanOrEqual(result.height);}
});
it('expands for tall coincident labels and rejects invalid geometry or exhausted limits',()=>{
 const dense=layoutQuadrantMath({labels:new Map(points.map(p=>[`point:${p.index}`,{width:100,height:300}])),points:points.map(p=>({...p,x:0.5,y:0.5})),minWidth:500,minHeight:500,gap:10,margin:10,maxDimension:100000});
 expect(dense.height).toBeGreaterThan(1800);
 expect(()=>layoutQuadrantMath({labels,points,minWidth:500,minHeight:500,gap:10,margin:10,maxDimension:600})).toThrow(/limit/);
 expect(()=>layoutQuadrantMath({labels,points:[{index:0,x:NaN,y:0,radius:1}],minWidth:500,minHeight:500,gap:10,margin:10,maxDimension:100000})).toThrow(/point/);
});
it('retains top X captions without points and supports right Y captions',()=>{
 const result=layoutQuadrantMath({labels,points:[],minWidth:500,minHeight:500,gap:10,margin:10,maxDimension:100000,xAxisPosition:'top',yAxisPosition:'right'});
 expect(result.labels.find(l=>l.key==='xLeft')!.y).toBeLessThan(result.plot.y);
 expect(result.labels.find(l=>l.key==='yTop')!.x).toBeGreaterThan(result.plot.x+result.plot.width);
 const populated=layoutQuadrantMath({labels,points,minWidth:500,minHeight:500,gap:10,margin:10,maxDimension:100000,xAxisPosition:'top',yAxisPosition:'right'});
 expect(populated.labels.find(l=>l.key==='xLeft')!.y).toBeGreaterThan(populated.plot.y+populated.plot.height);
});
