import {expect,it} from 'vitest';
import {layoutXYMath,type XYMathLayoutInput,type XYPlacedLabel} from '../../packages/runtime/src/mermaid-xychart-layout.ts';

const base=():XYMathLayoutInput=>({
 ink:{left:20,top:30,right:320,bottom:230},axes:[],points:[],legend:[],gap:12,margin:16,maxDimension:20_000,
});
const box=(label:XYPlacedLabel)=>({left:label.x,right:label.x+label.boxWidth,top:label.y,bottom:label.y+label.boxHeight});
const separate=(a:XYPlacedLabel,b:XYPlacedLabel)=>{
 const aa=box(a),bb=box(b);
 return aa.right<=bb.left||bb.right<=aa.left||aa.bottom<=bb.top||bb.bottom<=aa.top;
};
const outside=(label:XYPlacedLabel,ink:{left:number;top:number;right:number;bottom:number})=>{
 const b=box(label);
 return b.right<=ink.left||b.left>=ink.right||b.bottom<=ink.top||b.top>=ink.bottom;
};
const translatedBounds=(label:XYPlacedLabel,result:ReturnType<typeof layoutXYMath>)=>{
 const b=box(label);
 return {left:b.left+result.translateX,right:b.right+result.translateX,top:b.top+result.translateY,bottom:b.bottom+result.translateY};
};
const rotatedCorners=(label:XYPlacedLabel)=>{
 const radians=(label.rotation??0)*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
 const cx=label.x+label.boxWidth/2,cy=label.y+label.boxHeight/2;
 return [-1,1].flatMap(dx=>[-1,1].map(dy=>[cx+dx*label.width/2*c-dy*label.height/2*s,cy+dx*label.width/2*s+dy*label.height/2*c] as const));
};

it('keeps rotated label AABBs disjoint and outside the native ink',()=>{
 const input:XYMathLayoutInput={...base(),axes:[
  {side:'left',line:20,gap:8,titleGap:10,labels:[{key:'left:a',width:76,height:22,rotation:-38,anchor:55},{key:'left:b',width:76,height:22,rotation:-38,anchor:145}],title:{key:'left:title',width:22,height:130,rotation:-90}},
  {side:'bottom',line:230,gap:8,titleGap:10,labels:[{key:'bottom:a',width:70,height:20,rotation:42,anchor:90},{key:'bottom:b',width:70,height:20,rotation:42,anchor:220}],title:{key:'bottom:title',width:170,height:25}},
 ],points:[{key:'point:a',width:90,height:26,rotation:31,anchorX:80,anchorY:80},{key:'point:b',width:90,height:26,rotation:-31,anchorX:250,anchorY:180}],legend:[{key:'legend:a',width:80,height:18,rotation:25,markerSize:20},{key:'legend:b',width:80,height:18,rotation:-25,markerSize:20}]};
 const result=layoutXYMath(input);
 for(const label of result.labels){
  expect(outside(label,input.ink)).toBe(true);
  for(const other of result.labels)if(label!==other)expect(separate(label,other)).toBe(true);
 }
});

it('uses distinct identities and preserves leader origins for coincident categories and points',()=>{
 const result=layoutXYMath({...base(),axes:[{side:'bottom',line:230,gap:0,titleGap:0,labels:[
  {key:'category:0',width:80,height:24,anchor:140},{key:'category:1',width:80,height:24,anchor:140},
 ]}],points:[
  {key:'point:0',width:90,height:30,anchorX:170,anchorY:100},{key:'point:1',width:90,height:30,anchorX:170,anchorY:100},
 ]});
 expect(result.labels.map(label=>label.key)).toEqual(expect.arrayContaining(['category:0','category:1','point:0','point:1']));
 expect(result.leaders.map(leader=>leader.key)).toEqual(['category:0','category:1','point:0','point:1']);
 for(const key of ['category:0','category:1'] as const)expect(result.leaders.find(leader=>leader.key===key)!.points[0]).toEqual([140,230]);
 for(const key of ['point:0','point:1'] as const)expect(result.leaders.find(leader=>leader.key===key)!.points[0]).toEqual([170,100]);
 expect(separate(result.labels.find(label=>label.key==='category:0')!,result.labels.find(label=>label.key==='category:1')!)).toBe(true);
 expect(separate(result.labels.find(label=>label.key==='point:0')!,result.labels.find(label=>label.key==='point:1')!)).toBe(true);
});

it('places vertical bottom and left labels outside ink, while left and top horizontal labels use their requested sides',()=>{
 const vertical=layoutXYMath({...base(),axes:[
  {side:'left',line:20,gap:6,titleGap:0,labels:[{key:'left',width:18,height:100,rotation:90,anchor:130}]},
  {side:'bottom',line:230,gap:6,titleGap:0,labels:[{key:'bottom',width:18,height:100,rotation:-90,anchor:170}]},
 ]});
 expect(box(vertical.labels.find(label=>label.key==='left')!).right).toBeLessThanOrEqual(20);
 expect(box(vertical.labels.find(label=>label.key==='bottom')!).top).toBeGreaterThanOrEqual(230);
 const horizontal=layoutXYMath({...base(),axes:[
  {side:'left',line:20,gap:6,titleGap:0,labels:[{key:'left',width:100,height:18,anchor:130}]},
  {side:'top',line:30,gap:6,titleGap:0,labels:[{key:'top',width:100,height:18,anchor:170}]},
 ]});
 expect(box(horizontal.labels.find(label=>label.key==='left')!).right).toBeLessThanOrEqual(20);
 expect(box(horizontal.labels.find(label=>label.key==='top')!).bottom).toBeLessThanOrEqual(30);
});

it('contains actual corners of positive and negative rotated labels after translation',()=>{
 const result=layoutXYMath({...base(),axes:[{side:'bottom',line:230,gap:5,titleGap:5,labels:[
  {key:'positive',width:160,height:28,rotation:47,anchor:100},{key:'negative',width:160,height:28,rotation:-53,anchor:250},
 ]}],title:{key:'title',width:430,height:32,rotation:-17}});
 for(const label of result.labels)for(const [x,y] of rotatedCorners(label)){
  expect(x+result.translateX).toBeGreaterThanOrEqual(-1e-9);
  expect(x+result.translateX).toBeLessThanOrEqual(result.width+1e-9);
  expect(y+result.translateY).toBeGreaterThanOrEqual(-1e-9);
  expect(y+result.translateY).toBeLessThanOrEqual(result.height+1e-9);
 }
});

it('contains tall legend markers and long titles, including outlying finite ink',()=>{
 const input:XYMathLayoutInput={...base(),ink:{left:-8_000,top:4_000,right:-7_700,bottom:4_120},title:{key:'chart:title',width:1_100,height:40,rotation:13},legend:[
  {key:'legend:tall',width:240,height:170,rotation:19,markerSize:220},{key:'legend:wide',width:400,height:26,rotation:-16,markerSize:18},
 ]};
 const result=layoutXYMath(input);
 expect(Number.isFinite(result.width)&&Number.isFinite(result.height)&&Number.isFinite(result.translateX)&&Number.isFinite(result.translateY)).toBe(true);
 for(const label of result.labels){
  const b=translatedBounds(label,result);
  expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(result.width);
  expect(b.top).toBeGreaterThanOrEqual(0);expect(b.bottom).toBeLessThanOrEqual(result.height);
 }
 for(const row of result.legend){
  expect(row.markerX+result.translateX).toBeGreaterThanOrEqual(0);
  expect(row.markerX+row.markerSize+result.translateX).toBeLessThanOrEqual(result.width);
  expect(row.markerY+result.translateY).toBeGreaterThanOrEqual(0);
  expect(row.markerY+row.markerSize+result.translateY).toBeLessThanOrEqual(result.height);
 }
});

it('is deterministic and rejects invalid, duplicate, and over-limit geometry',()=>{
 const input={...base(),axes:[{side:'bottom' as const,line:230,gap:0,titleGap:0,labels:[{key:'category',width:40,height:20,anchor:80}]}],points:[{key:'point',width:50,height:20,anchorX:100,anchorY:100}]};
 expect(layoutXYMath(input)).toEqual(layoutXYMath(input));
 expect(()=>layoutXYMath({...base(),points:[{key:'bad',width:NaN,height:1,anchorX:1,anchorY:1}]})).toThrow(/finite/);
 expect(()=>layoutXYMath({...base(),points:[{key:'bad',width:-1,height:1,anchorX:1,anchorY:1}]})).toThrow(/nonnegative/);
 expect(()=>layoutXYMath({...base(),axes:[{side:'bottom',line:230,gap:0,titleGap:0,labels:[{key:'same',width:1,height:1,anchor:1}]}],points:[{key:'same',width:1,height:1,anchorX:1,anchorY:1}]})).toThrow(/Duplicate XY label identity/);
 expect(()=>layoutXYMath({...base(),maxDimension:20,title:{key:'large',width:100,height:100}})).toThrow(/dimension limit/);
});
