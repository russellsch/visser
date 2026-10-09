import {expect,it} from 'vitest';
import {layoutSankeyMath,type SankeyLaneLabel} from '../../packages/runtime/src/mermaid-sankey-layout.ts';

const ink={left:-40,top:-20,right:160,bottom:100};
const labels:SankeyLaneLabel[]=[
 {key:'left:one',width:70,height:24,side:'left',anchorX:-20,anchorY:20},
 {key:'left:two',width:70,height:70,side:'left',anchorX:-20,anchorY:20},
 {key:'right:one',width:120,height:30,side:'right',anchorX:140,anchorY:30},
 {key:'right:two',width:80,height:30,side:'right',anchorX:140,anchorY:30},
];
const input=()=>({ink,labels,gap:8,margin:12,maxDimension:10_000});
const disjoint=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y;

it('translates native anchors without changing relative geometry and places lanes outside ink',()=>{
 const result=layoutSankeyMath(input());
 const translatedInk={left:ink.left+result.translateX,right:ink.right+result.translateX,top:ink.top+result.translateY,bottom:ink.bottom+result.translateY};
 for(const label of result.labels){
  const original=labels.find(item=>item.key===label.key)!;
  expect(label.anchorX-original.anchorX).toBe(result.translateX);expect(label.anchorY-original.anchorY).toBe(result.translateY);expect(label.leader[0]).toEqual([label.anchorX,label.anchorY]);
  expect(label.side==='left'?label.x+label.width<=translatedInk.left:label.x>=translatedInk.right).toBe(true);
  expect(label.leader.at(-1)![1]).toBe(label.y+label.height/2);
 }
 expect(result.labels.find(label=>label.key==='left:one')!.anchorY-result.labels.find(label=>label.key==='right:one')!.anchorY).toBe(-10);
});

it('packs coincident anchors stably without overlap and keeps every label in the canvas',()=>{
 const result=layoutSankeyMath(input());
 const left=result.labels.filter(label=>label.side==='left'),right=result.labels.filter(label=>label.side==='right');
 expect(left.map(label=>label.key)).toEqual(['left:one','left:two']);expect(right.map(label=>label.key)).toEqual(['right:one','right:two']);
 for(const group of [left,right])for(const [index,label] of group.entries()){expect(label.x).toBeGreaterThanOrEqual(0);expect(label.y).toBeGreaterThanOrEqual(0);expect(label.x+label.width).toBeLessThanOrEqual(result.width);expect(label.y+label.height).toBeLessThanOrEqual(result.height);for(const other of group.slice(index+1))expect(disjoint(label,other)).toBe(true);}
});

it('handles negative-origin ink, empty labels, immutable inputs, and exact dimension boundaries',()=>{
 const original=structuredClone(input()),result=layoutSankeyMath(input());expect(input()).toEqual(original);expect(result.translateX).toBeGreaterThan(0);expect(result.translateY).toBeGreaterThan(0);
 const empty=layoutSankeyMath({ink:{left:-20,top:-10,right:80,bottom:40},labels:[],gap:1,margin:10,maxDimension:120});expect(empty).toMatchObject({width:120,height:70,labels:[]});
 expect(()=>layoutSankeyMath({ink:{left:-20,top:-10,right:80,bottom:40},labels:[],gap:1,margin:10,maxDimension:119})).toThrow(/dimension limit/);
});

it('rejects invalid configuration, keys, sides, anchors, and measured geometry',()=>{
 const invalids:any[]=[
  {...input(),gap:0},{...input(),margin:-1},{...input(),maxDimension:0},{...input(),ink:{...ink,right:-41}},
  {...input(),labels:[{...labels[0],key:''}]},{...input(),labels:[labels[0],{...labels[0]}]},
  {...input(),labels:[{...labels[0],side:'center'}]},{...input(),labels:[{...labels[0],anchorX:999}]},
  {...input(),labels:[{...labels[0],anchorY:NaN}]},{...input(),labels:[{...labels[0],width:-1}]},
 ];
 for(const value of invalids)expect(()=>layoutSankeyMath(value)).toThrow(/Invalid Sankey/);
});

it('gives crowded leaders separate vertical lanes rather than an overlapping bus',()=>{
 const result=layoutSankeyMath({ink:{left:0,top:0,right:100,bottom:100},gap:5,margin:10,maxDimension:1000,
  labels:[10,11,12].map((anchorY,index)=>({key:`node:${index}`,width:30,height:20,side:'right',anchorX:100,anchorY}))});
 const lanes=result.labels.map(label=>label.leader[1]![0]);
 expect(new Set(lanes).size).toBe(3);
 for(const label of result.labels){
  expect(label.leader[1]![0]).toBeGreaterThan(100+result.translateX);
  expect(label.leader[1]![0]).toBeLessThan(label.x);
  expect(label.leader[2]![0]).toBe(label.leader[1]![0]);
 }
});
