import {expect,it} from 'vitest';
import {layoutRadarMath} from '../../packages/runtime/src/mermaid-radar-layout.ts';

const ink={left:-40,top:-20,right:120,bottom:100};
const axes=[
 {key:'axis:left:a',width:60,height:24,side:'left' as const,anchorX:-10,anchorY:25},
 {key:'axis:left:b',width:90,height:46,side:'left' as const,anchorX:-10,anchorY:25},
 {key:'axis:right:a',width:75,height:30,side:'right' as const,anchorX:100,anchorY:30},
 {key:'axis:right:b',width:55,height:30,side:'right' as const,anchorX:100,anchorY:30},
];
const legends=[{key:'legend:0',width:90,height:20},{key:'legend:1',width:45,height:40}];
const input=()=>({ink,axes,legends,title:{key:'title',width:210,height:36},gap:8,margin:12,maxDimension:5_000});
const disjoint=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y;

it('keeps polar ink native except for translation and packs coincident axis anchors into separate outside lanes',()=>{
 const result=layoutRadarMath(input()),translated={left:ink.left+result.translateX,top:ink.top+result.translateY,right:ink.right+result.translateX,bottom:ink.bottom+result.translateY};
 for(const axis of result.axes){
  const native=axes.find(item=>item.key===axis.key)!;
  expect(axis.anchorX-native.anchorX).toBe(result.translateX);expect(axis.anchorY-native.anchorY).toBe(result.translateY);
  expect(axis.side==='left'?axis.x+axis.width<=translated.left:axis.x>=translated.right).toBe(true);
  expect(axis.leader[0]).toEqual([axis.anchorX,axis.anchorY]);
 }
 for(const group of [result.axes.filter(axis=>axis.side==='left'),result.axes.filter(axis=>axis.side==='right')]){
  for(const [index,axis] of group.entries())for(const other of group.slice(index+1))expect(disjoint(axis,other)).toBe(true);
  expect(new Set(group.map(axis=>axis.leader[1]![0])).size).toBe(group.length);
 }
});

it('contains complete ink, ordered legends, and title in the measured canvas',()=>{
 const result=layoutRadarMath(input());
 const boxes=[...result.axes,...result.legends,result.title!];
 for(const box of boxes){expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(result.width);expect(box.y+box.height).toBeLessThanOrEqual(result.height);}
 expect(result.title).toMatchObject({key:'title',x:(result.width-210)/2,y:12});
 expect(result.legends.map(legend=>legend.key)).toEqual(['legend:0','legend:1']);
 expect(result.legends[1]!.y).toBe(result.legends[0]!.y+20+8);
 expect(result.translateX).toBeGreaterThan(0);expect(result.translateY).toBeGreaterThan(36);
});

it('does not mutate inputs and honors the exact layout boundary',()=>{
 const original=structuredClone(input()),result=layoutRadarMath(input());
 expect(input()).toEqual(original);
 const exact=layoutRadarMath({...input(),maxDimension:Math.max(result.width,result.height)});
 expect(exact.width).toBe(result.width);expect(exact.height).toBe(result.height);
 expect(()=>layoutRadarMath({...input(),maxDimension:Math.max(result.width,result.height)-1})).toThrow(/dimension limit/);
});

it('rejects invalid dimensions, duplicate keys, bad measurements, and invalid axis lanes',()=>{
 const invalids:any[]=[
  {...input(),ink:{...ink,right:-41}},{...input(),gap:0},{...input(),margin:-1},{...input(),maxDimension:Infinity},
  {...input(),legends:[legends[0],{...legends[0]}]},{...input(),title:{key:'axis:left:a',width:1,height:1}},
  {...input(),legends:[{key:'',width:1,height:1}]},{...input(),legends:[{key:'legend',width:-1,height:1}]},
  {...input(),axes:[{...axes[0],side:'middle'}]},{...input(),axes:[{...axes[0],anchorY:Infinity}]},
 ];
 for(const value of invalids)expect(()=>layoutRadarMath(value)).toThrow(/Radar|Sankey/);
});
